import { EventBus, GameEvents, type ComebackCountedPayload, type DayStartedPayload } from '../EventBus';
import { comebackSettings } from '../data/DaySettings';

export interface ComebacksSaveData
{
    count: number;
}

// Counts the times the player came back after some time away, instead of a streak. It celebrates returning, so
// nothing ever makes it go down.
class Comebacks
{
    private count = 0;

    constructor ()
    {
        EventBus.on(GameEvents.DayStarted, (payload: DayStartedPayload) => {
            if (payload.missedDays >= comebackSettings.countAfterMissedDays)
            {
                this.count++;

                const countedPayload: ComebackCountedPayload = { count: this.count, missedDays: payload.missedDays };

                EventBus.emit(GameEvents.ComebackCounted, countedPayload);
            }
        });
    }

    GetCount (): number
    {
        return this.count;
    }

    ToSaveData (): ComebacksSaveData
    {
        return { count: this.count };
    }

    LoadSaveData (data: Partial<ComebacksSaveData> | undefined)
    {
        this.count = Math.max(0, Math.floor(data?.count ?? 0));
    }
}

export const comebacks = new Comebacks();
