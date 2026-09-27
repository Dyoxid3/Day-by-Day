import { EventBus, GameEvents, type DayStarEarnedPayload, type DayStarReason, type DayStartedPayload, type TasksChangedPayload } from '../EventBus';
import { comebackSettings, starSettings } from '../data/DaySettings';
import { playerStars } from './Stars';
import { HasReachedPercent } from './TaskList';

// After missing a few days, the stars from those days can be earned back by finishing today
export interface ComebackOffer
{
    missedDays: number;
    starsOnOffer: number;
    isEarned: boolean;
    // Whether the player has been told about it yet
    isAnnounced: boolean;
}

export interface DailyStarsSaveData
{
    hasFirstStar: boolean;
    hasSecondStar: boolean;
    comeback: ComebackOffer | null;
}

// Hands out today's stars as the day's tasks get done. A star, once earned, stays earned: adding more tasks
// afterwards never takes it back.
class DailyStars
{
    private hasFirstStar = false;
    private hasSecondStar = false;
    private comeback: ComebackOffer | null = null;

    constructor ()
    {
        EventBus.on(GameEvents.DayStarted, this.HandleDayStarted, this);
        EventBus.on(GameEvents.TasksChanged, this.HandleTasksChanged, this);
    }

    GetStarsEarnedToday (): number
    {
        return Number(this.hasFirstStar) + Number(this.hasSecondStar);
    }

    // The welcome-back offer, while there's one that hasn't been earned yet
    GetComebackOffer (): ComebackOffer | null
    {
        return this.comeback && !this.comeback.isEarned ? this.comeback : null;
    }

    MarkComebackAnnounced ()
    {
        if (this.comeback)
        {
            this.comeback.isAnnounced = true;
        }
    }

    ToSaveData (): DailyStarsSaveData
    {
        return { hasFirstStar: this.hasFirstStar, hasSecondStar: this.hasSecondStar, comeback: this.comeback };
    }

    LoadSaveData (data: Partial<DailyStarsSaveData> | undefined)
    {
        this.hasFirstStar = data?.hasFirstStar === true;
        this.hasSecondStar = data?.hasSecondStar === true;
        this.comeback = data?.comeback ?? null;
    }

    private HandleDayStarted (payload: DayStartedPayload)
    {
        const settings = comebackSettings;

        this.hasFirstStar = false;
        this.hasSecondStar = false;
        this.comeback = null;

        if (payload.missedDays >= settings.minMissedDays)
        {
            this.comeback = {
                missedDays: payload.missedDays,
                starsOnOffer: Math.min(payload.missedDays, settings.maxDaysOffered) * settings.starsPerMissedDay,
                isEarned: false,
                isAnnounced: false
            };
        }
    }

    private HandleTasksChanged (payload: TasksChangedPayload)
    {
        const progress = payload.progress;

        if (!this.hasFirstStar && HasReachedPercent(progress, starSettings.firstStarPercent))
        {
            this.hasFirstStar = true;
            this.Award(1, 'first');
        }

        if (!this.hasSecondStar && HasReachedPercent(progress, starSettings.secondStarPercent))
        {
            this.hasSecondStar = true;
            this.Award(1, 'second');
        }

        const comeback = this.GetComebackOffer();

        if (comeback && HasReachedPercent(progress, comebackSettings.requiredPercent))
        {
            comeback.isEarned = true;
            this.Award(comeback.starsOnOffer, 'comeback');
        }
    }

    private Award (amount: number, reason: DayStarReason)
    {
        playerStars.AddStars(amount);

        const payload: DayStarEarnedPayload = { amount, reason };

        EventBus.emit(GameEvents.DayStarEarned, payload);
    }
}

export const dailyStars = new DailyStars();
