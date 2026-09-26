import {
    EventBus,
    GameEvents,
    type AccountChangedPayload,
    type IslandLayoutChangedPayload,
    type NotificationReceivedPayload,
    type ToastRequestedPayload,
    type ToastTone,
    type TravelRequestedPayload,
    type VisitStateChangedPayload
} from '../game/EventBus';
import { GetCompletionPercent } from '../game/data/TaskTypes';
import { playerCoinBoost } from '../game/state/CoinBoost';
import { playerStreak } from '../game/state/DailyStreak';
import { playerIslandLayout } from '../game/state/IslandLayout';
import { playerTaskList } from '../game/state/TaskList';
import { GetStoredToken, onlineApi, OnlineApiError, StoreToken, type DemoFriendAction } from './OnlineApi';
import type { BoostGrantResponse, FriendSummary, OnlineNotification, OnlineSnapshot, PlayerStatus, PollResponse } from './OnlineTypes';

const onlineSettings = {
    // How often the game checks the server for notifications, friends and visitors
    pollIntervalMs: 2000,
    // How often a game on a friend's island tells the server it's still there
    visitHeartbeatMs: 4000,
    // Waits for quick changes to settle before saving the streak and progress friends see
    statusSaveDelayMs: 800,
    // After a reload, how long to wait before retrying if the server can't be reached
    resumeRetryMs: 4000
};

// The player's online side: account, friends, notifications and visits. While logged in it checks the server
// every couple of seconds and shares changes over the EventBus (OnlineStateChanged, NotificationReceived).
class OnlineSession
{
    private username: string | null = null;
    private friends: FriendSummary[] = [];
    private notifications: OnlineNotification[] = [];
    private visitors: string[] = [];
    private isServerReachable = true;
    private knownNotificationIds = new Set<number>();
    // Changes made here that a poll already in flight might not include yet
    private locallyReadIds = new Set<number>();
    private locallyRepliedIds = new Set<number>();
    private hasReceivedFirstPoll = false;
    private lastSnapshotSignature = '';
    private serverClockOffsetMs = 0;
    private pollTimerId?: number;
    private visitHeartbeatTimerId?: number;
    private statusSaveTimerId?: number;
    private visitingUsername: string | null = null;
    // True from setting sail until arriving at the next island
    private isTraveling = false;
    // Goes up whenever the player logs in or out, so replies to older requests get ignored
    private sessionNumber = 0;

    // Listens from the moment this module loads, before any UI, so the UI always reads up-to-date travel state
    constructor ()
    {
        EventBus.on(GameEvents.IslandLayoutChanged, this.HandleIslandLayoutChanged, this);
        EventBus.on(GameEvents.TasksChanged, this.ScheduleStatusSave, this);
        EventBus.on(GameEvents.StreakChanged, this.ScheduleStatusSave, this);
        EventBus.on(GameEvents.VisitStateChanged, this.HandleVisitStateChanged, this);
        EventBus.on(GameEvents.TravelStarted, this.HandleTravelStarted, this);
        EventBus.on(GameEvents.TravelFinished, () => {
            this.isTraveling = false;
        });
    }

    // Picks up a login from before a page reload
    Start ()
    {
        window.addEventListener('pagehide', () => {
            if (this.visitingUsername)
            {
                onlineApi.SendLeaveVisitBeacon();
            }
        });

        if (GetStoredToken())
        {
            this.ResumeSession();
        }
    }

    GetSnapshot (): OnlineSnapshot
    {
        return {
            username: this.username,
            friends: this.friends,
            notifications: this.notifications,
            visitors: this.visitors,
            isServerReachable: this.isServerReachable
        };
    }

    GetUsername (): string | null
    {
        return this.username;
    }

    GetFriend (username: string): FriendSummary | undefined
    {
        return this.friends.find(friend => friend.username.toLowerCase() === username.toLowerCase());
    }

    GetUnreadCount (): number
    {
        return this.notifications.filter(notification => !notification.isRead).length;
    }

    GetVisitingUsername (): string | null
    {
        return this.visitingUsername;
    }

    IsTraveling (): boolean
    {
        return this.isTraveling;
    }

    // The server's clock, for "5 min ago" labels on notifications
    GetServerNow (): number
    {
        return Date.now() + this.serverClockOffsetMs;
    }

    async SignUp (username: string, password: string)
    {
        const auth = await onlineApi.SignUp(username.trim(), password);

        await this.BeginSession(auth.token, auth.username, true);
    }

    async LogIn (username: string, password: string)
    {
        const auth = await onlineApi.LogIn(username.trim(), password);

        await this.BeginSession(auth.token, auth.username, false);
    }

    async LogOut ()
    {
        const wasVisiting = this.visitingUsername !== null;

        try
        {
            await onlineApi.LogOut();
        }
        catch
        {
            // Signing out on this side is what matters
        }

        this.EndSession();

        if (wasVisiting)
        {
            this.ReturnHome();
        }
    }

    async AddFriend (username: string): Promise<FriendSummary>
    {
        const { friend } = await onlineApi.AddFriend(username.trim());

        this.friends = [ ...this.friends.filter(existing => existing.username !== friend.username), friend ];
        this.EmitSnapshotIfChanged();

        return friend;
    }

    EncourageFriend (username: string, message: string): Promise<BoostGrantResponse>
    {
        return onlineApi.Encourage(username, message);
    }

    async ReplyToNotification (notificationId: number, message: string): Promise<BoostGrantResponse>
    {
        const result = await onlineApi.Reply(notificationId, message);

        this.locallyRepliedIds.add(notificationId);
        this.locallyReadIds.add(notificationId);
        this.notifications = this.notifications.map(notification => notification.id === notificationId
            ? { ...notification, hasReplied: true, isRead: true }
            : notification);
        this.EmitSnapshotIfChanged();

        return result;
    }

    MarkNotificationsRead ()
    {
        if (!this.notifications.some(notification => !notification.isRead))
        {
            return;
        }

        for (const notification of this.notifications)
        {
            this.locallyReadIds.add(notification.id);
        }

        this.notifications = this.notifications.map(notification => ({ ...notification, isRead: true }));
        this.EmitSnapshotIfChanged();
        onlineApi.MarkNotificationsRead().catch(() => undefined);
    }

    // Loads the friend's island, then asks the island scene to sail there
    async VisitFriend (username: string)
    {
        if (!this.username)
        {
            throw new OnlineApiError(401, 'Log in to visit friends');
        }

        const island = await onlineApi.GetIsland(username);
        const payload: TravelRequestedPayload = {
            destination: {
                ownerUsername: island.username,
                placedItems: island.placedItems,
                visitorUsername: this.username
            }
        };

        EventBus.emit(GameEvents.TravelRequested, payload);
    }

    ReturnHome ()
    {
        const payload: TravelRequestedPayload = { destination: null };

        EventBus.emit(GameEvents.TravelRequested, payload);
    }

    // For demos on one screen: asks a demo friend to encourage the player or sail over to their island
    async RunDemoFriendAction (action: DemoFriendAction)
    {
        if (!this.username)
        {
            RequestToast('🔒', 'Log in first', 'Demo friends need an account with Mochi or Pixel added as a friend.', 'error');
            return;
        }

        try
        {
            await onlineApi.RunDemoFriendAction(action);
            // Checks straight away so it shows up without waiting for the next poll
            await this.PollNow();
        }
        catch (error)
        {
            RequestToast('⚠️', "The demo friend couldn't do that", error instanceof Error ? error.message : undefined, 'error');
        }
    }

    // --- Session lifecycle ---

    private async BeginSession (token: string, username: string, isNewAccount: boolean)
    {
        StoreToken(token);
        this.ResetSessionState();
        this.sessionNumber++;
        this.username = username;

        if (isNewAccount)
        {
            // A new account keeps everything the player built as a guest
            await Promise.allSettled([
                onlineApi.SaveIsland(playerIslandLayout.GetPlacedItems()),
                onlineApi.SaveStatus(GetCurrentStatus())
            ]);
        }
        else
        {
            await this.LoadOwnIsland();
            onlineApi.SaveStatus(GetCurrentStatus()).catch(() => undefined);
        }

        this.EmitAccountChanged();
        await this.PollNow();
        this.SchedulePoll();
    }

    // After a page reload, picks the login back up from the stored token
    private async ResumeSession ()
    {
        const sessionNumber = ++this.sessionNumber;

        try
        {
            const poll = await onlineApi.Poll();

            if (sessionNumber !== this.sessionNumber)
            {
                return;
            }

            this.username = poll.username;
            await this.LoadOwnIsland();
            this.ApplyPoll(poll);
            this.EmitAccountChanged();
            this.SchedulePoll();
        }
        catch (error)
        {
            if (sessionNumber !== this.sessionNumber)
            {
                return;
            }

            if (error instanceof OnlineApiError && error.status === 401)
            {
                StoreToken(null);
                return;
            }

            // The server isn't reachable yet; keep the login and try again shortly
            window.setTimeout(() => {
                if (sessionNumber === this.sessionNumber && GetStoredToken())
                {
                    this.ResumeSession();
                }
            }, onlineSettings.resumeRetryMs);
        }
    }

    private EndSession ()
    {
        StoreToken(null);
        this.sessionNumber++;
        window.clearTimeout(this.pollTimerId);
        this.StopVisitHeartbeat();
        this.visitingUsername = null;
        this.ResetSessionState();
        playerCoinBoost.Clear();
        this.EmitAccountChanged();
        this.EmitSnapshotIfChanged();
    }

    private ResetSessionState ()
    {
        this.username = null;
        this.friends = [];
        this.notifications = [];
        this.visitors = [];
        this.isServerReachable = true;
        this.knownNotificationIds.clear();
        this.locallyReadIds.clear();
        this.locallyRepliedIds.clear();
        this.hasReceivedFirstPoll = false;
    }

    private async LoadOwnIsland ()
    {
        if (!this.username)
        {
            return;
        }

        try
        {
            const island = await onlineApi.GetIsland(this.username);

            playerIslandLayout.ReplacePlacedItems(island.placedItems);
        }
        catch
        {
            // Keeps whatever is on the island right now
        }
    }

    // --- Polling ---

    private async PollNow ()
    {
        const sessionNumber = this.sessionNumber;

        try
        {
            const poll = await onlineApi.Poll();

            if (sessionNumber !== this.sessionNumber || !this.username)
            {
                return;
            }

            this.isServerReachable = true;
            this.ApplyPoll(poll);
        }
        catch (error)
        {
            if (sessionNumber !== this.sessionNumber)
            {
                return;
            }

            if (error instanceof OnlineApiError && error.status === 401)
            {
                this.EndSession();
                RequestToast('🔒', 'You were signed out', 'Please log in again.', 'error');
                return;
            }

            this.isServerReachable = false;
            this.EmitSnapshotIfChanged();
        }
    }

    private SchedulePoll ()
    {
        const sessionNumber = this.sessionNumber;

        window.clearTimeout(this.pollTimerId);
        this.pollTimerId = window.setTimeout(async () => {
            await this.PollNow();

            if (sessionNumber === this.sessionNumber && this.username)
            {
                this.SchedulePoll();
            }
        }, onlineSettings.pollIntervalMs);
    }

    private ApplyPoll (poll: PollResponse)
    {
        const now = Date.now();

        this.serverClockOffsetMs = poll.serverTime - now;
        this.username = poll.username;
        this.friends = poll.friends;
        this.visitors = poll.visitors;
        this.notifications = poll.notifications.map(notification => ({
            ...notification,
            isRead: notification.isRead || this.locallyReadIds.has(notification.id),
            hasReplied: notification.hasReplied || this.locallyRepliedIds.has(notification.id)
        }));

        const newNotifications = this.notifications.filter(notification => !this.knownNotificationIds.has(notification.id));

        for (const notification of this.notifications)
        {
            this.knownNotificationIds.add(notification.id);
        }

        playerCoinBoost.SetBoosts(
            poll.boosts.map(boost => ({
                percent: boost.percent,
                endsAt: now + boost.endsInMs,
                fromUsername: boost.fromUsername,
                kind: boost.kind
            })),
            poll.boostPercent
        );

        if (this.hasReceivedFirstPoll)
        {
            // Oldest first, so toasts appear in the order things happened
            for (const notification of [ ...newNotifications ].reverse())
            {
                if (!notification.isRead)
                {
                    const payload: NotificationReceivedPayload = { notification };

                    EventBus.emit(GameEvents.NotificationReceived, payload);
                }
            }
        }
        else
        {
            const unreadCount = this.GetUnreadCount();

            if (unreadCount > 0)
            {
                RequestToast('🔔', `${unreadCount} new notification${unreadCount === 1 ? '' : 's'}`, 'Click to see them.', 'info', true);
            }
        }

        this.hasReceivedFirstPoll = true;
        this.EmitSnapshotIfChanged();
    }

    // Only tells the UI when something actually changed, so lists don't redraw every poll
    private EmitSnapshotIfChanged (isForced = false)
    {
        const snapshot = this.GetSnapshot();
        const signature = JSON.stringify(snapshot);

        if (!isForced && signature === this.lastSnapshotSignature)
        {
            return;
        }

        this.lastSnapshotSignature = signature;
        EventBus.emit(GameEvents.OnlineStateChanged, snapshot);
    }

    private EmitAccountChanged ()
    {
        const payload: AccountChangedPayload = { username: this.username };

        EventBus.emit(GameEvents.AccountChanged, payload);
    }

    // --- Syncing the player's own island and status ---

    private HandleIslandLayoutChanged (payload: IslandLayoutChangedPayload)
    {
        if (payload.reason !== 'added' || !this.username)
        {
            return;
        }

        onlineApi.SaveIsland(playerIslandLayout.GetPlacedItems()).catch(() => {
            RequestToast('⚠️', "Couldn't save your island", 'It will try again next time you place something.', 'error');
        });
    }

    private ScheduleStatusSave ()
    {
        if (!this.username)
        {
            return;
        }

        window.clearTimeout(this.statusSaveTimerId);
        this.statusSaveTimerId = window.setTimeout(() => {
            if (this.username)
            {
                onlineApi.SaveStatus(GetCurrentStatus()).catch(() => undefined);
            }
        }, onlineSettings.statusSaveDelayMs);
    }

    // --- Visits ---

    private HandleVisitStateChanged (payload: VisitStateChangedPayload)
    {
        this.StopVisitHeartbeat();
        this.visitingUsername = payload.hostUsername;

        if (payload.hostUsername && this.username)
        {
            const hostUsername = payload.hostUsername;
            const SendHeartbeat = () => onlineApi.SendVisitHeartbeat(hostUsername).catch(() => undefined);

            SendHeartbeat();
            this.visitHeartbeatTimerId = window.setInterval(SendHeartbeat, onlineSettings.visitHeartbeatMs);
        }

        // The island scene just started, so hand it the current visitors
        this.EmitSnapshotIfChanged(true);
    }

    // Leaving a friend's island ends the visit straight away, so their game sees the boat leave
    private HandleTravelStarted ()
    {
        this.isTraveling = true;

        if (!this.visitingUsername)
        {
            return;
        }

        this.StopVisitHeartbeat();
        this.visitingUsername = null;
        onlineApi.LeaveVisit().catch(() => undefined);
    }

    private StopVisitHeartbeat ()
    {
        window.clearInterval(this.visitHeartbeatTimerId);
        this.visitHeartbeatTimerId = undefined;
    }
}

function GetCurrentStatus (): PlayerStatus
{
    return {
        streakDays: playerStreak.GetStreakDays(),
        progressPercent: GetCompletionPercent(playerTaskList.GetProgress())
    };
}

export function RequestToast (icon: string, title: string, message?: string, tone: ToastTone = 'info', opensNotifications = false)
{
    const payload: ToastRequestedPayload = { icon, title, message, tone, opensNotifications };

    EventBus.emit(GameEvents.ToastRequested, payload);
}

export const onlineSession = new OnlineSession();
