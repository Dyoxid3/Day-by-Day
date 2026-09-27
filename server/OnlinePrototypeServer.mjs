// A tiny online backend for the island prototype. It runs inside the Vite dev server (see vite/config.dev.mjs),
// so `npm run dev` starts it too, and the game talks to it at /api.
// Accounts, friends, islands and notifications are saved in server/data/online-db.json; delete that file to start fresh.
// It's deliberately simple rather than secure or scalable: it's for playtesting and demos.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const serverSettings = {
    dataFilePath: join(process.cwd(), 'server', 'data', 'online-db.json'),
    // A player shows as online if their game checked in this recently
    onlineWindowMs: 8000,
    // A visit ends when the visitor's game stops checking in for this long (e.g. they closed the tab)
    visitTimeoutMs: 12000,
    // Once someone reaches the goal of an encouragement they received, their coins are boosted for the rest of their
    // day. Replying to an encouragement boosts whoever sent it, for replyBoostMinutes.
    encouragementBoostPercent: 10,
    replyBoostPercent: 10,
    replyBoostMinutes: 30,
    // Boosts stack up to this much
    maxBoostPercent: 50,
    maxMessageLength: 120,
    // Gifts sent with an encouragement: at most this much, received when the friend finishes goalPercent of their day.
    // A gift still waiting after giftExpiryHours goes back to whoever sent it.
    maxGiftCoins: 10000,
    maxGiftStars: 1000,
    defaultGoalPercent: 33,
    giftExpiryHours: 36,
    notificationsPerPoll: 40,
    maxStoredNotifications: 2000,
    maxRequestCharacters: 64 * 1024,

    // Signing up with one of these usernames always makes a brand new account, wiping any old one with that name, so
    // a demo can start from scratch every time
    alwaysFreshUsernames: [ 'daniel' ],

    // The seeded demo player (Sam, see demoFriendSeeds) acts on their own while nobody is logged in as them, so every
    // online feature can be shown on a single screen: they reply to encouragement, reach the goals of encouragement
    // you send them, cheer on new friends, and can be sent to leave a lantern, encourage you, visit or have a tough
    // day (see the debug menu and src/online/DemoControls.ts for the keys). Set isEnabled to false to turn this off.
    demoFriends: {
        isEnabled: true,
        replyDelayMs: 4000,
        // How long after you encourage them they reach its goal
        goalDelayMs: 9000,
        welcomeDelayMs: 5000,
        visitDurationMs: 45000,
        // What a demo friend sends along when asked to encourage you
        gift: { coins: 5, stars: 1 },
        encouragements: [
            "I'm proud of you for showing up today.",
            'One small step at a time. You are doing better than you think.',
            'Thinking of you today. One small thing is enough to count.',
            'Your island is looking lovely.'
        ],
        replies: [ 'Thank you, that means a lot.', 'You made my day.', 'Thank you. Rooting for you too.', 'That was so kind of you.' ]
    }
};

const usernamePattern = /^[A-Za-z0-9_]{3,16}$/;
const dayKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const defaultReply = 'Thank you';

// Vite plugin that serves the API from the dev server (and from `vite preview`)
export function OnlinePrototypeServer ()
{
    let onlineApi;

    const MountApi = server => {
        onlineApi ??= new OnlineApi();
        server.middlewares.use('/api', (request, response) => onlineApi.HandleRequest(request, response));
        server.config.logger.info('  [online] Prototype server is on. Data is saved in server/data/online-db.json');
    };

    return {
        name: 'online-prototype-server',
        configureServer: MountApi,
        configurePreviewServer: MountApi
    };
}

export class ApiError extends Error
{
    constructor (status, message)
    {
        super(message);
        this.status = status;
    }
}

class OnlineApi
{
    constructor ()
    {
        this.database = LoadDatabase();
        // Kept in memory only: when each player last checked in, and who is visiting whose island
        this.lastSeenAt = new Map();
        this.visits = new Map();
        this.routes = [
            [ 'POST', /^\/signup$/, this.SignUp ],
            [ 'POST', /^\/login$/, this.LogIn ],
            [ 'POST', /^\/logout$/, this.LogOut ],
            [ 'GET', /^\/poll$/, this.Poll ],
            [ 'POST', /^\/friends$/, this.AddFriend ],
            [ 'PUT', /^\/island$/, this.SaveIsland ],
            [ 'PUT', /^\/status$/, this.SaveStatus ],
            [ 'GET', /^\/islands\/(?<username>[^/]+)$/, this.GetIsland ],
            [ 'POST', /^\/encourage$/, this.Encourage ],
            [ 'POST', /^\/feeling-low$/, this.AskFriendsForEncouragement ],
            [ 'POST', /^\/rewards\/claim$/, this.ClaimRewards ],
            [ 'POST', /^\/notifications\/read$/, this.MarkNotificationsRead ],
            [ 'POST', /^\/notifications\/(?<id>\d+)\/reply$/, this.Reply ],
            [ 'POST', /^\/visit$/, this.ContinueVisit ],
            [ 'POST', /^\/visit\/leave$/, this.LeaveVisit ],
            [ 'POST', /^\/demo\/friend-action$/, this.RunDemoFriendAction ],
            [ 'POST', /^\/demo\/reset$/, this.ResetDemoFriends ]
        ];
    }

    async HandleRequest (request, response)
    {
        try
        {
            const url = new URL(request.url ?? '/', 'http://localhost');
            const route = this.routes.find(([ method, pattern ]) => method === request.method && pattern.test(url.pathname));

            if (!route)
            {
                throw new ApiError(404, 'Unknown request');
            }

            const [ , pattern, handler ] = route;
            const params = url.pathname.match(pattern).groups ?? {};
            const body = request.method === 'GET' ? {} : await ReadJsonBody(request);
            const result = handler.call(this, { request, body, params });

            SendJson(response, 200, result ?? { ok: true });
        }
        catch (error)
        {
            if (error instanceof ApiError)
            {
                SendJson(response, error.status, { error: error.message });
                return;
            }

            console.error('[online]', error);
            SendJson(response, 500, { error: 'Something went wrong on the server' });
        }
    }

    // --- Accounts ---

    SignUp ({ body })
    {
        const username = String(body.username ?? '').trim();
        const password = String(body.password ?? '');

        if (!usernamePattern.test(username))
        {
            throw new ApiError(400, 'Usernames are 3 to 16 letters, numbers or underscores');
        }

        if (password.length < 3)
        {
            throw new ApiError(400, 'Passwords need at least 3 characters');
        }

        const key = username.toLowerCase();

        // A demo name: whatever was there before is wiped
        if (this.database.users[key] && serverSettings.alwaysFreshUsernames.includes(key))
        {
            this.DeleteUser(key);
        }

        if (this.database.users[key])
        {
            throw new ApiError(409, 'That username is already taken');
        }

        return this.StartSession(CreateUser(this.database, username, password));
    }

    LogIn ({ body })
    {
        const user = this.FindUser(body.username);

        if (!user || !IsCorrectPassword(user, String(body.password ?? '')))
        {
            throw new ApiError(401, 'Wrong username or password');
        }

        return this.StartSession(user);
    }

    LogOut ({ request, body })
    {
        const token = GetToken(request, body);
        const userKey = this.database.sessions[token];

        if (userKey)
        {
            this.visits.delete(userKey);
            delete this.database.sessions[token];
            this.Save();
        }
    }

    // --- Everything a game needs to stay up to date, fetched every couple of seconds ---

    Poll ({ request })
    {
        const user = this.RequireUser(request);
        const now = Date.now();

        this.lastSeenAt.set(user.key, now);
        this.ReturnExpiredGiftsFrom(user, now);

        const boosts = this.GetActiveBoosts(user, now);

        return {
            serverTime: now,
            username: user.username,
            friends: user.friends
                .map(friendKey => this.database.users[friendKey])
                .filter(Boolean)
                .map(friend => this.DescribeFriend(friend, user, now)),
            notifications: this.database.notifications
                .filter(notification => notification.to === user.key)
                .slice(-serverSettings.notificationsPerPoll)
                .reverse()
                .map(notification => this.DescribeNotification(notification)),
            boosts,
            boostPercent: Math.min(boosts.reduce((total, boost) => total + boost.percent, 0), serverSettings.maxBoostPercent),
            visitors: this.GetVisitorsOf(user, now),
            rewards: (user.pendingRewards ?? []).map(reward => ({
                id: reward.id,
                coins: reward.coins,
                stars: reward.stars,
                fromUsername: this.database.users[reward.from]?.username ?? reward.from,
                kind: reward.kind
            }))
        };
    }

    // --- Friends and islands ---

    AddFriend ({ request, body })
    {
        const user = this.RequireUser(request);
        const typedName = String(body.username ?? '').trim();
        const friend = this.FindUser(typedName);

        if (!friend)
        {
            throw new ApiError(404, `There's no player called "${typedName}"`);
        }

        if (friend.key === user.key)
        {
            throw new ApiError(400, "You can't add yourself as a friend");
        }

        if (user.friends.includes(friend.key))
        {
            throw new ApiError(409, `${friend.username} is already your friend`);
        }

        MakeFriends(user, friend);
        this.AddNotification(friend.key, user.key, 'friend-added', '');
        this.Save();

        // A demo friend nobody is playing as cheers on their new friend
        this.ScheduleDemoFriendAction(friend, serverSettings.demoFriends.welcomeDelayMs, () => {
            this.SendEncouragement(friend, user, PickRandom(serverSettings.demoFriends.encouragements), { coins: 0, stars: 0 });
        });

        return { friend: this.DescribeFriend(friend, user, Date.now()) };
    }

    SaveIsland ({ request, body })
    {
        const user = this.RequireUser(request);
        const placedItems = Array.isArray(body.placedItems) ? body.placedItems : [];

        user.island.placedItems = placedItems
            .slice(0, 300)
            .filter(IsValidPlacedItem)
            .map(item => ({ itemId: item.itemId, islandX: item.islandX, islandY: item.islandY }));
        this.Save();
    }

    SaveStatus ({ request, body })
    {
        const user = this.RequireUser(request);

        user.status = {
            stars: ClampInteger(body.stars, 0, 1000000),
            comebacks: ClampInteger(body.comebacks, 0, 1000000),
            progressPercent: ClampInteger(body.progressPercent, 0, 100),
            dayKey: IsDayKey(body.dayKey) ? body.dayKey : user.status.dayKey ?? null,
            isOnTrack: body.isOnTrack !== false
        };

        this.SettleGiftsFor(user);
        this.NotifyFriendsIfOffTrack(user);
        this.Save();
    }

    GetIsland ({ request, params })
    {
        const user = this.RequireUser(request);
        const owner = this.FindUser(decodeURIComponent(params.username));

        if (!owner)
        {
            throw new ApiError(404, "That island doesn't exist");
        }

        if (owner.key !== user.key && !user.friends.includes(owner.key))
        {
            throw new ApiError(403, 'You can only visit your friends');
        }

        return { username: owner.username, placedItems: owner.island.placedItems, status: owner.status };
    }

    // --- Encouragement ---

    // A message, with optional coins and stars the friend receives once they finish goalPercent of their day.
    // The sender's game has already taken the gift out of their wallet.
    Encourage ({ request, body })
    {
        const user = this.RequireUser(request);
        const friend = this.RequireFriend(user, body.to);
        const message = CleanMessage(body.message);

        if (!message)
        {
            throw new ApiError(400, 'Write a message first');
        }

        const encouragement = this.SendEncouragement(user, friend, message, {
            coins: ClampInteger(body.coins, 0, serverSettings.maxGiftCoins),
            stars: ClampInteger(body.stars, 0, serverSettings.maxGiftStars),
            goalPercent: ClampInteger(body.goalPercent ?? serverSettings.defaultGoalPercent, 1, 100),
            senderDayKey: IsDayKey(body.dayKey) ? body.dayKey : null
        });
        const gift = encouragement.gift;

        this.Save();

        // A demo friend nobody is playing as replies by themselves, then gets on with their day
        this.ScheduleDemoFriendAction(friend, serverSettings.demoFriends.replyDelayMs, () => {
            if (!encouragement.repliedAt)
            {
                encouragement.repliedAt = Date.now();
                encouragement.isRead = true;
                this.AddNotification(user.key, friend.key, 'reply', PickRandom(serverSettings.demoFriends.replies));
            }
        });
        this.ScheduleDemoFriendAction(friend, serverSettings.demoFriends.goalDelayMs, () => {
            if (gift.state === 'pending')
            {
                friend.status.progressPercent = Math.max(friend.status.progressPercent ?? 0, gift.goalPercent);
                friend.status.dayKey = gift.dayKey ?? friend.status.dayKey ?? null;
                this.SettleGiftsFor(friend);
            }
        });

        return { goalPercent: gift.goalPercent, boostPercent: serverSettings.encouragementBoostPercent };
    }

    // Lets the player's friends know they could use some encouragement today (once a day). The player's game only
    // asks for this on a hard day, and never says how they felt.
    AskFriendsForEncouragement ({ request, body })
    {
        const user = this.RequireUser(request);
        const dayKey = IsDayKey(body.dayKey) ? body.dayKey : null;

        if (!dayKey || user.lastFeelingLowNoticeDay === dayKey)
        {
            return;
        }

        user.lastFeelingLowNoticeDay = dayKey;

        for (const friendKey of user.friends)
        {
            this.AddNotification(friendKey, user.key, 'friend-struggling', '', { reason: 'feeling-low' });
        }

        this.Save();
    }

    // The player's game has added these gifts to its wallet
    ClaimRewards ({ request, body })
    {
        const user = this.RequireUser(request);
        const claimedIds = new Set(Array.isArray(body.ids) ? body.ids.map(Number) : []);

        user.pendingRewards = (user.pendingRewards ?? []).filter(reward => !claimedIds.has(reward.id));
        this.Save();
    }

    MarkNotificationsRead ({ request })
    {
        const user = this.RequireUser(request);
        let hasChanged = false;

        for (const notification of this.database.notifications)
        {
            if (notification.to === user.key && !notification.isRead)
            {
                notification.isRead = true;
                hasChanged = true;
            }
        }

        if (hasChanged)
        {
            this.Save();
        }
    }

    Reply ({ request, params, body })
    {
        const user = this.RequireUser(request);
        const notificationId = Number(params.id);
        const encouragement = this.database.notifications.find(notification =>
            notification.id === notificationId && notification.to === user.key && notification.kind === 'encouragement');

        if (!encouragement)
        {
            throw new ApiError(404, "That message isn't here anymore");
        }

        if (encouragement.repliedAt)
        {
            throw new ApiError(409, 'You already replied to this');
        }

        encouragement.repliedAt = Date.now();
        encouragement.isRead = true;
        this.AddNotification(encouragement.from, user.key, 'reply', CleanMessage(body.message) || defaultReply);
        this.Save();

        return { boostPercent: serverSettings.replyBoostPercent, boostMinutes: serverSettings.replyBoostMinutes };
    }

    // --- Visits: the visitor's game checks in every few seconds while it's on the host's island ---

    ContinueVisit ({ request, body })
    {
        const user = this.RequireUser(request);
        const host = this.RequireFriend(user, body.host);

        this.lastSeenAt.set(user.key, Date.now());
        this.StartOrExtendVisit(user, host, serverSettings.visitTimeoutMs);
    }

    LeaveVisit ({ request, body })
    {
        const user = this.RequireUser(request, body);

        this.visits.delete(user.key);
    }

    // --- Demo friends, for showing things off on one screen ---

    // Makes one of the player's demo friends encourage them or sail over to their island right now
    RunDemoFriendAction ({ request, body })
    {
        const user = this.RequireUser(request);
        const demoSettings = serverSettings.demoFriends;

        if (!demoSettings.isEnabled)
        {
            throw new ApiError(403, 'Demo friends are turned off on the server');
        }

        const now = Date.now();
        let demoFriend = this.FindIdleDemoFriend(user);

        // For a smooth demo, another demo friend befriends the player on the spot when they aren't friends with one
        // yet, or (for a visit) when every demo friend they have is already visiting
        if (!demoFriend || (body.action === 'visit' && this.IsVisiting(demoFriend, now)))
        {
            const newDemoFriend = Object.values(this.database.users).find(candidate => IsDemoFriend(candidate)
                && candidate.key !== user.key
                && !user.friends.includes(candidate.key)
                && !this.IsOnline(candidate, now));

            if (newDemoFriend)
            {
                MakeFriends(user, newDemoFriend);
                this.Save();
                demoFriend = newDemoFriend;
            }
        }

        if (!demoFriend)
        {
            throw new ApiError(404, 'The demo friend is busy (someone is logged in as them)');
        }

        if (body.action === 'visit')
        {
            this.StartOrExtendVisit(demoFriend, user, demoSettings.visitDurationMs);
        }
        else if (body.action === 'struggle')
        {
            this.AddNotification(user.key, demoFriend.key, 'friend-struggling', '', { reason: 'feeling-low' });
            this.Save();
        }
        else if (body.action === 'lantern')
        {
            // A kind message that glows as a lantern on the player's island
            this.SendEncouragement(demoFriend, user, PickRandom(demoSettings.encouragements), { coins: 0, stars: 0 });
            this.Save();
        }
        else
        {
            // Encouragement with a gift for reaching the goal, in the notifications rather than as a lantern
            this.SendEncouragement(demoFriend, user, PickRandom(demoSettings.encouragements), { ...demoSettings.gift, leavesLantern: false });
            this.Save();
        }

        return { friendUsername: demoFriend.username };
    }

    // Clears the demo friends' memory: every message, gift, visit and note to or from them, and their day goes back to
    // how it started. They stay friends with whoever added them, so the demo keys keep working. Gifts players sent them
    // that were still waiting go back to the players first.
    ResetDemoFriends ()
    {
        const demoFriends = Object.values(this.database.users).filter(IsDemoFriend);
        const demoKeys = new Set(demoFriends.map(friend => friend.key));

        for (const notification of this.database.notifications)
        {
            const gift = notification.gift;
            const sender = this.database.users[notification.from];

            if (demoKeys.has(notification.to) && sender && !demoKeys.has(sender.key) && gift?.state === 'pending')
            {
                this.AddReward(sender, notification.to, gift, 'returned');
            }
        }

        this.database.notifications = this.database.notifications
            .filter(notification => !demoKeys.has(notification.to) && !demoKeys.has(notification.from));

        for (const friend of demoFriends)
        {
            const seed = demoFriendSeeds.find(candidate => candidate.username.toLowerCase() === friend.key);

            friend.status = { ...(seed?.status ?? { stars: 0, comebacks: 0, progressPercent: 0 }) };
            friend.island.placedItems = [ ...(seed?.placedItems ?? []) ];
            friend.pendingRewards = [];
            delete friend.lastOffTrackNoticeDay;
            delete friend.lastFeelingLowNoticeDay;
        }

        for (const [ visitorKey, visit ] of this.visits)
        {
            if (demoKeys.has(visitorKey) || demoKeys.has(visit.hostKey))
            {
                this.visits.delete(visitorKey);
            }
        }

        this.Save();

        return { friendNames: demoFriends.map(friend => friend.username) };
    }

    FindIdleDemoFriend (user)
    {
        const now = Date.now();
        const idleDemoFriends = user.friends
            .filter(friendKey => IsDemoFriend(this.database.users[friendKey]))
            .map(friendKey => this.database.users[friendKey])
            .filter(friend => friend && !this.IsOnline(friend, now));

        // Prefers one that isn't already visiting someone
        return idleDemoFriends.find(friend => !this.IsVisiting(friend, now)) ?? idleDemoFriends[0];
    }

    // Runs an action for a demo friend after a delay, if nobody is logged in and playing as them by then
    ScheduleDemoFriendAction (friend, delayMs, Action)
    {
        const demoSettings = serverSettings.demoFriends;

        if (!demoSettings.isEnabled || !IsDemoFriend(friend) || this.IsOnline(friend, Date.now()))
        {
            return;
        }

        setTimeout(() => {
            if (!this.IsOnline(friend, Date.now()))
            {
                Action();
                this.Save();
            }
        }, delayMs);
    }

    // --- Gifts sent with encouragement ---

    // Stores the encouragement with its gift, and settles the gift straight away if the friend is already past its goal
    // leavesLantern: false keeps it in the notifications only, with no lantern on the island
    SendEncouragement (sender, recipient, message, { coins = 0, stars = 0, goalPercent = serverSettings.defaultGoalPercent, senderDayKey = null, leavesLantern = true })
    {
        // For the friend's current day, or the sender's if the friend hasn't played today yet
        const recipientDayKey = recipient.status.dayKey ?? null;
        const dayKey = [ recipientDayKey, senderDayKey, sender.status.dayKey ?? null ]
            .filter(Boolean)
            .sort()
            .pop() ?? null;
        const encouragement = this.AddNotification(recipient.key, sender.key, 'encouragement', message, {
            gift: { coins, stars, goalPercent, dayKey, state: 'pending' },
            ...(leavesLantern ? {} : { leavesLantern: false })
        });

        this.SettleGiftsFor(recipient);

        return encouragement;
    }

    // Looks at the gifts waiting for this player: ones whose goal they've reached are given to them, and ones from a
    // day that's over go back to whoever sent them
    SettleGiftsFor (recipient)
    {
        const status = recipient.status;

        for (const notification of this.database.notifications)
        {
            const gift = notification.gift;

            if (notification.to !== recipient.key || notification.kind !== 'encouragement' || gift?.state !== 'pending')
            {
                continue;
            }

            if (status.dayKey && gift.dayKey && status.dayKey > gift.dayKey)
            {
                this.ReturnGift(notification);
            }
            else if ((!status.dayKey || !gift.dayKey || status.dayKey === gift.dayKey) && (status.progressPercent ?? 0) >= gift.goalPercent)
            {
                this.GrantGift(notification, recipient);
            }
        }
    }

    GrantGift (notification, recipient)
    {
        const gift = notification.gift;

        gift.state = 'earned';
        this.AddReward(recipient, notification.from, gift, 'gift');
        this.AddNotification(notification.from, recipient.key, 'goal-reached', '', { gift: { ...gift } });
    }

    ReturnGift (notification)
    {
        const gift = notification.gift;
        const sender = this.database.users[notification.from];

        gift.state = 'returned';

        if (sender && (gift.coins > 0 || gift.stars > 0))
        {
            this.AddReward(sender, notification.to, gift, 'returned');
            this.AddNotification(sender.key, notification.to, 'gift-returned', '', { gift: { ...gift } });
        }
    }

    // Gifts that have waited too long (the friend hasn't played since) go back to whoever sent them
    ReturnExpiredGiftsFrom (sender, now)
    {
        const expiryMs = serverSettings.giftExpiryHours * 60 * 60 * 1000;
        let hasReturnedAny = false;

        for (const notification of this.database.notifications)
        {
            if (notification.from === sender.key && notification.gift?.state === 'pending' && now - notification.createdAt > expiryMs)
            {
                this.ReturnGift(notification);
                hasReturnedAny = true;
            }
        }

        if (hasReturnedAny)
        {
            this.Save();
        }
    }

    // Coins and stars waiting for the player's game to add them to its wallet
    AddReward (user, fromKey, gift, kind)
    {
        if (gift.coins <= 0 && gift.stars <= 0)
        {
            return;
        }

        this.database.nextRewardId ??= 1;
        user.pendingRewards ??= [];
        user.pendingRewards.push({ id: this.database.nextRewardId++, from: fromKey, coins: gift.coins, stars: gift.stars, kind });
    }

    // Friends get a note (once a day) when the player has tasks but has fallen well behind for the time of day
    NotifyFriendsIfOffTrack (user)
    {
        const status = user.status;

        if (status.isOnTrack || !status.dayKey || user.lastOffTrackNoticeDay === status.dayKey)
        {
            return;
        }

        user.lastOffTrackNoticeDay = status.dayKey;

        for (const friendKey of user.friends)
        {
            this.AddNotification(friendKey, user.key, 'friend-struggling', '', { reason: 'off-track' });
        }
    }

    // --- Helpers ---

    StartOrExtendVisit (visitor, host, durationMs)
    {
        const now = Date.now();
        const previousVisit = this.visits.get(visitor.key);
        const isNewVisit = !previousVisit || previousVisit.hostKey !== host.key || now >= previousVisit.endsAt;

        this.visits.set(visitor.key, { hostKey: host.key, endsAt: now + durationMs });

        if (isNewVisit)
        {
            this.AddNotification(host.key, visitor.key, 'visit', '');
            this.Save();
        }
    }

    IsOnline (user, now)
    {
        return now - (this.lastSeenAt.get(user.key) ?? 0) < serverSettings.onlineWindowMs;
    }

    IsVisiting (user, now)
    {
        const visit = this.visits.get(user.key);

        return Boolean(visit && now < visit.endsAt);
    }

    StartSession (user)
    {
        const token = randomBytes(24).toString('hex');

        this.database.sessions[token] = user.key;
        this.Save();

        return { token, username: user.username };
    }

    // The token comes in a header, or in the body for requests sent as the page closes
    RequireUser (request, body = {})
    {
        const userKey = this.database.sessions[GetToken(request, body)];
        const user = userKey ? this.database.users[userKey] : undefined;

        if (!user)
        {
            throw new ApiError(401, 'Please log in again');
        }

        return user;
    }

    RequireFriend (user, username)
    {
        const friend = this.FindUser(username);

        if (!friend)
        {
            throw new ApiError(404, "That player doesn't exist");
        }

        if (!user.friends.includes(friend.key))
        {
            throw new ApiError(403, `${friend.username} isn't your friend yet`);
        }

        return friend;
    }

    FindUser (username)
    {
        return this.database.users[String(username ?? '').trim().toLowerCase()];
    }

    DescribeFriend (friend, user, now)
    {
        const visit = this.visits.get(friend.key);

        return {
            username: friend.username,
            stars: friend.status.stars ?? 0,
            comebacks: friend.status.comebacks ?? 0,
            progressPercent: friend.status.progressPercent ?? 0,
            // Visiting counts as online, including demo friends sent over with the demo keys
            isOnline: this.IsOnline(friend, now) || this.IsVisiting(friend, now),
            isVisitingYou: Boolean(visit && visit.hostKey === user.key && now < visit.endsAt)
        };
    }

    DescribeNotification (notification)
    {
        return {
            id: notification.id,
            kind: notification.kind,
            fromUsername: this.database.users[notification.from]?.username ?? notification.from,
            message: notification.message,
            createdAt: notification.createdAt,
            isRead: notification.isRead,
            hasReplied: Boolean(notification.repliedAt),
            boostPercent: GetBoostPercent(notification.kind),
            gift: notification.gift
                ? { coins: notification.gift.coins, stars: notification.gift.stars, goalPercent: notification.gift.goalPercent, state: notification.gift.state }
                : null,
            reason: notification.reason ?? null,
            leavesLantern: notification.kind === 'encouragement' && notification.leavesLantern !== false
        };
    }

    // Removes an account completely: from friends lists, messages, gifts, visits and logins
    DeleteUser (userKey)
    {
        const database = this.database;

        delete database.users[userKey];

        for (const user of Object.values(database.users))
        {
            user.friends = user.friends.filter(friendKey => friendKey !== userKey);
            user.pendingRewards = (user.pendingRewards ?? []).filter(reward => reward.from !== userKey);
        }

        database.notifications = database.notifications.filter(notification => notification.to !== userKey && notification.from !== userKey);

        for (const [ token, sessionUserKey ] of Object.entries(database.sessions))
        {
            if (sessionUserKey === userKey)
            {
                delete database.sessions[token];
            }
        }

        for (const [ visitorKey, visit ] of this.visits)
        {
            if (visitorKey === userKey || visit.hostKey === userKey)
            {
                this.visits.delete(visitorKey);
            }
        }

        this.Save();
    }

    // Encouragements whose goal was reached boost coins for the rest of that day; replies boost them for a while
    GetActiveBoosts (user, now)
    {
        const replyDurationMs = serverSettings.replyBoostMinutes * 60 * 1000;
        const today = user.status.dayKey ?? null;
        const boosts = [];

        for (const notification of this.database.notifications)
        {
            if (notification.to !== user.key)
            {
                continue;
            }

            const fromUsername = this.database.users[notification.from]?.username ?? notification.from;
            const gift = notification.gift;

            if (notification.kind === 'encouragement' && gift?.state === 'earned' && (!gift.dayKey || gift.dayKey === today))
            {
                boosts.push({ percent: serverSettings.encouragementBoostPercent, endsInMs: null, fromUsername, kind: 'encouragement' });
            }
            else if (notification.kind === 'reply' && now - notification.createdAt < replyDurationMs)
            {
                boosts.push({
                    percent: serverSettings.replyBoostPercent,
                    endsInMs: notification.createdAt + replyDurationMs - now,
                    fromUsername,
                    kind: 'reply'
                });
            }
        }

        return boosts;
    }

    GetVisitorsOf (user, now)
    {
        const visitors = [];

        for (const [ visitorKey, visit ] of this.visits)
        {
            const visitor = this.database.users[visitorKey];

            if (visitor && visit.hostKey === user.key && now < visit.endsAt)
            {
                visitors.push(visitor.username);
            }
        }

        return visitors;
    }

    // extraFields: a gift for encouragements (and notes about them), or a reason for friend-struggling
    AddNotification (toKey, fromKey, kind, message, extraFields = {})
    {
        const notifications = this.database.notifications;
        const notification = {
            id: this.database.nextNotificationId++,
            to: toKey,
            from: fromKey,
            kind,
            message,
            createdAt: Date.now(),
            isRead: false,
            repliedAt: null,
            ...extraFields
        };

        notifications.push(notification);

        if (notifications.length > serverSettings.maxStoredNotifications)
        {
            notifications.splice(0, notifications.length - serverSettings.maxStoredNotifications);
        }

        return notification;
    }

    Save ()
    {
        SaveDatabase(this.database);
    }
}

// --- Database file ---

function LoadDatabase ()
{
    const filePath = serverSettings.dataFilePath;

    if (existsSync(filePath))
    {
        const fileText = readFileSync(filePath, 'utf8');

        try
        {
            const database = JSON.parse(fileText);
            const hasRenamedDemoFriends = RenameOldDemoFriends(database);
            const hasRemovedDemoFriends = RemoveOldDemoFriends(database);

            if (UpdateForIslandArt(database) || hasRenamedDemoFriends || hasRemovedDemoFriends)
            {
                SaveDatabase(database);
            }

            return database;
        }
        catch (error)
        {
            // Keeps the unreadable file around instead of silently losing it
            writeFileSync(`${filePath}.broken`, fileText);
            console.warn('[online] The database file was unreadable, so it was saved as online-db.json.broken and a fresh one was made.', error);
        }
    }

    const database = CreateSeedDatabase();

    SaveDatabase(database);

    return database;
}

function SaveDatabase (database)
{
    mkdirSync(dirname(serverSettings.dataFilePath), { recursive: true });
    writeFileSync(serverSettings.dataFilePath, JSON.stringify(database, null, 2));
}

// Bump when the island art or the shop's props change, so the demo friends' furniture gets updated to match
const islandArtVersion = 3;

// The ready-made demo friend: how their day starts, and where their furniture sits (as fractions of the island image,
// on the grass). Clearing their memory from the debug menu puts them back to this.
const demoFriendSeeds = [
    {
        username: 'Sam',
        status: { stars: 5, comebacks: 2, progressPercent: 25 },
        placedItems: [ { itemId: 'tree', islandX: 0.5, islandY: 0.36 }, { itemId: 'fence', islandX: 0.42, islandY: 0.45 } ]
    }
];

// The demo friend used to be called Pixel
const renamedDemoFriends = [ [ 'pixel', 'Sam' ] ];

// Demo friends there used to be (Mochi was renamed Daniel), removed from older save files
const removedDemoFriendKeys = [ 'mochi', 'daniel' ];

// Save files from an older island art get the demo friends' furniture moved to where it fits now
function UpdateForIslandArt (database)
{
    if (database.islandArtVersion === islandArtVersion)
    {
        return false;
    }

    for (const seed of demoFriendSeeds)
    {
        const demoFriend = database.users[seed.username.toLowerCase()];

        if (demoFriend)
        {
            demoFriend.island.placedItems = seed.placedItems;
        }
    }

    database.islandArtVersion = islandArtVersion;

    return true;
}

// Older save files have the demo friend as Pixel: it's renamed to Sam, keeping its friends and messages. If someone
// already took the new name, the old demo friend keeps its name (and still acts as one).
function RenameOldDemoFriends (database)
{
    let hasChanged = false;

    for (const [ oldKey, newUsername ] of renamedDemoFriends)
    {
        const demoFriend = database.users[oldKey];
        const newKey = newUsername.toLowerCase();

        if (!demoFriend)
        {
            continue;
        }

        hasChanged = true;
        demoFriend.isDemoFriend = true;

        if (database.users[newKey])
        {
            continue;
        }

        delete database.users[oldKey];
        demoFriend.key = newKey;
        demoFriend.username = newUsername;
        database.users[newKey] = demoFriend;

        for (const user of Object.values(database.users))
        {
            user.friends = user.friends.map(friendKey => friendKey === oldKey ? newKey : friendKey);

            for (const reward of user.pendingRewards ?? [])
            {
                reward.from = reward.from === oldKey ? newKey : reward.from;
            }
        }

        for (const notification of database.notifications)
        {
            notification.to = notification.to === oldKey ? newKey : notification.to;
            notification.from = notification.from === oldKey ? newKey : notification.from;
        }

        for (const [ token, userKey ] of Object.entries(database.sessions))
        {
            if (userKey === oldKey)
            {
                database.sessions[token] = newKey;
            }
        }
    }

    return hasChanged;
}

// Old demo friends (only ones that were demo friends, never a real account) go, along with their messages and
// friendships. Anyone logged in as one is logged out.
function RemoveOldDemoFriends (database)
{
    let hasChanged = false;

    for (const userKey of removedDemoFriendKeys)
    {
        const user = database.users[userKey];

        // Mochi comes from before demo friends were marked, so it only ever was one
        if (!user || (!IsDemoFriend(user) && userKey !== 'mochi'))
        {
            continue;
        }

        hasChanged = true;
        delete database.users[userKey];

        for (const user of Object.values(database.users))
        {
            user.friends = user.friends.filter(friendKey => friendKey !== userKey);
            user.pendingRewards = (user.pendingRewards ?? []).filter(reward => reward.from !== userKey);
        }

        database.notifications = database.notifications.filter(notification => notification.to !== userKey && notification.from !== userKey);

        for (const [ token, sessionUserKey ] of Object.entries(database.sessions))
        {
            if (sessionUserKey === userKey)
            {
                delete database.sessions[token];
            }
        }
    }

    return hasChanged;
}

// A ready-made friend for demos and playtesting. Add them by username, or log in as them in another tab (password: demo).
function CreateSeedDatabase ()
{
    const database = { users: {}, sessions: {}, notifications: [], nextNotificationId: 1 };

    for (const seed of demoFriendSeeds)
    {
        CreateUser(database, seed.username, 'demo', {
            status: { ...seed.status },
            placedItems: [ ...seed.placedItems ],
            isDemoFriend: true
        });
    }

    database.islandArtVersion = islandArtVersion;

    return database;
}

// Demo friends act on their own while nobody is logged in as them (see demoFriends in serverSettings)
function IsDemoFriend (user)
{
    return user?.isDemoFriend === true;
}

function CreateUser (database, username, password, { status, placedItems, isDemoFriend = false } = {})
{
    const passwordSalt = randomBytes(16).toString('hex');
    const user = {
        key: username.toLowerCase(),
        username,
        passwordSalt,
        passwordHash: HashPassword(password, passwordSalt),
        createdAt: Date.now(),
        friends: [],
        island: { placedItems: placedItems ?? [] },
        status: status ?? { stars: 0, comebacks: 0, progressPercent: 0 }
    };

    if (isDemoFriend)
    {
        user.isDemoFriend = true;
    }

    database.users[user.key] = user;

    return user;
}

function MakeFriends (firstUser, secondUser)
{
    if (!firstUser.friends.includes(secondUser.key))
    {
        firstUser.friends.push(secondUser.key);
    }

    if (!secondUser.friends.includes(firstUser.key))
    {
        secondUser.friends.push(firstUser.key);
    }
}

function HashPassword (password, salt)
{
    return scryptSync(password, salt, 32).toString('hex');
}

function IsCorrectPassword (user, password)
{
    const actualHash = Buffer.from(HashPassword(password, user.passwordSalt), 'hex');
    const expectedHash = Buffer.from(user.passwordHash, 'hex');

    return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
}

function GetBoostPercent (notificationKind)
{
    if (notificationKind === 'encouragement')
    {
        return serverSettings.encouragementBoostPercent;
    }

    if (notificationKind === 'reply')
    {
        return serverSettings.replyBoostPercent;
    }

    return 0;
}

// --- Request helpers ---

function GetToken (request, body)
{
    const header = request.headers.authorization ?? '';

    if (header.startsWith('Bearer '))
    {
        return header.slice('Bearer '.length);
    }

    return typeof body.token === 'string' ? body.token : '';
}

export function ReadJsonBody (request)
{
    return new Promise((resolve, reject) => {
        let text = '';

        request.setEncoding('utf8');
        request.on('data', chunk => {
            text += chunk;

            if (text.length > serverSettings.maxRequestCharacters)
            {
                reject(new ApiError(413, 'That request is too large'));
                request.destroy();
            }
        });
        request.on('end', () => {
            if (text.trim() === '')
            {
                resolve({});
                return;
            }

            try
            {
                const parsed = JSON.parse(text);

                resolve(parsed && typeof parsed === 'object' ? parsed : {});
            }
            catch
            {
                reject(new ApiError(400, 'That request was not valid JSON'));
            }
        });
        request.on('error', reject);
    });
}

export function SendJson (response, status, data)
{
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify(data));
}

function PickRandom (items)
{
    return items[Math.floor(Math.random() * items.length)];
}

function CleanMessage (value)
{
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, serverSettings.maxMessageLength);
}

function ClampInteger (value, min, max)
{
    const number = Math.round(Number(value));

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

function IsValidPlacedItem (item)
{
    return item !== null
        && typeof item === 'object'
        && typeof item.itemId === 'string'
        && item.itemId.length <= 40
        && Number.isFinite(item.islandX)
        && Number.isFinite(item.islandY);
}

// A day as the player's game names it: "YYYY-MM-DD"
function IsDayKey (value)
{
    return typeof value === 'string' && dayKeyPattern.test(value);
}
