import {
    EventBus,
    GameEvents,
    type LanternOpenedPayload,
    type LanternsReceivedPayload,
    type OnlineStateChangedPayload
} from '../EventBus';
import { lanternSettings } from '../data/DaySettings';
import type { EncouragementGift } from '../../online/OnlineTypes';

// A lantern left on the player's island by a friend's encouragement
export interface LanternInfo
{
    // The encouragement's notification id, so each lantern keeps its spot on the island
    id: number;
    fromUsername: string;
    message: string;
    gift: EncouragementGift | null;
    boostPercent: number;
    hasReplied: boolean;
}

export interface LanternsSaveData
{
    openedIds: number[];
}

const openedIdsKept = 200;
const msPerDay = 24 * 60 * 60 * 1000;

// Every encouragement from a friend leaves a lantern glowing on the player's island until they tap it to read it,
// so coming back after time away greets them with the people who thought of them. The island scene draws them
// (see LanternLayer); the notifications they come from arrive with the online session's updates.
class Lanterns
{
    private lanterns: LanternInfo[] = [];
    private openedIds = new Set<number>();
    // Lanterns already announced as received (since the page loaded)
    private receivedIds = new Set<number>();
    private lastSnapshot: OnlineStateChangedPayload | null = null;

    constructor ()
    {
        EventBus.on(GameEvents.OnlineStateChanged, (snapshot: OnlineStateChangedPayload) => {
            this.lastSnapshot = snapshot;
            this.Refresh();
        });
        // Another account's progress has its own opened lanterns
        EventBus.on(GameEvents.PlayerDataLoaded, this.Refresh, this);
    }

    GetLanterns (): readonly LanternInfo[]
    {
        return this.lanterns;
    }

    // The player tapped a lantern: its message shows and the lantern floats away
    OpenLantern (lanternId: number)
    {
        const lantern = this.lanterns.find(shownLantern => shownLantern.id === lanternId);

        if (!lantern)
        {
            return;
        }

        this.openedIds.add(lanternId);

        const payload: LanternOpenedPayload = { lantern };

        EventBus.emit(GameEvents.LanternOpened, payload);
        this.Refresh();
    }

    ToSaveData (): LanternsSaveData
    {
        return { openedIds: [ ...this.openedIds ].slice(-openedIdsKept) };
    }

    LoadSaveData (data: Partial<LanternsSaveData> | undefined)
    {
        this.openedIds = new Set(data?.openedIds ?? []);
    }

    // Unopened encouragements from the last few days, newest first
    private Refresh ()
    {
        const oldestTime = Date.now() - lanternSettings.maxAgeDays * msPerDay;
        const lanterns = (this.lastSnapshot?.notifications ?? [])
            .filter(notification => notification.kind === 'encouragement'
                && notification.leavesLantern !== false
                && !this.openedIds.has(notification.id)
                && notification.createdAt >= oldestTime)
            .slice(0, lanternSettings.maxShown)
            .map(notification => ({
                id: notification.id,
                fromUsername: notification.fromUsername,
                message: notification.message,
                gift: notification.gift,
                boostPercent: notification.boostPercent,
                hasReplied: notification.hasReplied
            }));
        const hasChanged = lanterns.map(lantern => lantern.id).join() !== this.lanterns.map(lantern => lantern.id).join();

        const newLanterns = lanterns.filter(lantern => !this.receivedIds.has(lantern.id));

        this.lanterns = lanterns;

        if (hasChanged)
        {
            EventBus.emit(GameEvents.LanternsChanged);
        }

        if (newLanterns.length > 0)
        {
            const payload: LanternsReceivedPayload = { count: newLanterns.length };

            newLanterns.forEach(lantern => this.receivedIds.add(lantern.id));
            EventBus.emit(GameEvents.LanternsReceived, payload);
        }
    }
}

export const lanterns = new Lanterns();
