import { EventBus, GameEvents, type FeelingSharedPayload } from '../EventBus';
import type { Feeling } from '../data/DaySettings';
import { dayCycle } from './DayCycle';

export interface MoodCheckInSaveData
{
    feeling: Feeling | null;
}

// How the player said they're feeling today. It shapes the evening (see EveningFocus), and a bad or terrible day
// lets their friends know they could use some encouragement (without saying which).
class MoodCheckIn
{
    private feeling: Feeling | null = null;

    constructor ()
    {
        EventBus.on(GameEvents.DayStarted, () => {
            this.feeling = null;
        });
    }

    GetFeeling (): Feeling | null
    {
        return this.feeling;
    }

    HasAnsweredToday (): boolean
    {
        return this.feeling !== null;
    }

    ShareFeeling (feeling: Feeling)
    {
        this.feeling = feeling;

        const payload: FeelingSharedPayload = { feeling, dayKey: dayCycle.GetDayKey() };

        EventBus.emit(GameEvents.FeelingShared, payload);
    }

    ToSaveData (): MoodCheckInSaveData
    {
        return { feeling: this.feeling };
    }

    LoadSaveData (data: Partial<MoodCheckInSaveData> | undefined)
    {
        this.feeling = data?.feeling ?? null;
    }
}

export const moodCheckIn = new MoodCheckIn();
