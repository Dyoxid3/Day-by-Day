import { EventBus, GameEvents, type DayStartedPayload } from '../EventBus';
import { onTrackSettings } from '../data/DaySettings';
import { GetCompletionPercent } from '../data/TaskTypes';
import { gameClock, GetDaysBetween } from './GameClock';
import { playerTaskList } from './TaskList';

export interface DayCycleSaveData
{
    // The day the saved progress belongs to
    dayKey: string | null;
    hasPlannedToday: boolean;
}

const tickMs = 1000;

// Keeps track of which day it is. When a new day begins (the clock passes midnight, or the player comes back on a
// later day) it clears the to-do list and announces DayStarted, then CheckInNeeded so the player is asked how they
// feel and gets to plan the day.
class DayCycle
{
    private dayKey: string | null = null;
    private hasPlannedToday = false;
    private lastMinute = -1;
    private isStarted = false;

    constructor ()
    {
        EventBus.on(GameEvents.ClockChanged, () => {
            if (this.isStarted)
            {
                this.Tick();
            }
        });
    }

    // Called once the player's saved progress has loaded, and again whenever another account's progress loads
    Start ()
    {
        if (!this.isStarted)
        {
            this.isStarted = true;
            window.setInterval(() => this.Tick(), tickMs);
        }

        this.lastMinute = -1;

        // A new day asks for the check-in itself
        const hasStartedNewDay = this.Tick();

        if (!hasStartedNewDay && !this.hasPlannedToday)
        {
            EventBus.emit(GameEvents.CheckInNeeded);
        }
    }

    GetDayKey (): string
    {
        return this.dayKey ?? gameClock.GetDayKey();
    }

    HasPlannedToday (): boolean
    {
        return this.hasPlannedToday;
    }

    // The player finished planning today (even if they chose a rest day with no tasks)
    MarkPlanned ()
    {
        this.hasPlannedToday = true;
        EventBus.emit(GameEvents.DayPlanned);
    }

    // False when the player has tasks but is well behind where they'd need to be to finish them all today.
    // A day with no tasks is a rest day, which is always fine.
    IsOnTrack (): boolean
    {
        const settings = onTrackSettings;
        const progress = playerTaskList.GetProgress();
        const hour = gameClock.GetHourOfDay();

        if (progress.totalCount === 0 || hour < settings.earliestHour)
        {
            return true;
        }

        const dayFraction = (hour - settings.dayStartHour) / (settings.dayEndHour - settings.dayStartHour);
        const expectedPercent = Math.min(1, Math.max(0, dayFraction)) * 100;

        return GetCompletionPercent(progress) >= expectedPercent - settings.allowedLagPercent;
    }

    ToSaveData (): DayCycleSaveData
    {
        return { dayKey: this.dayKey, hasPlannedToday: this.hasPlannedToday };
    }

    LoadSaveData (data: Partial<DayCycleSaveData> | undefined)
    {
        this.dayKey = data?.dayKey ?? null;
        this.hasPlannedToday = data?.hasPlannedToday === true;
    }

    // Returns true when a new day started
    private Tick (): boolean
    {
        const today = gameClock.GetDayKey();
        const isNewDay = today !== this.dayKey;

        if (isNewDay)
        {
            this.StartNewDay(today);
        }

        const minute = gameClock.GetMinutesIntoDay();

        if (minute !== this.lastMinute)
        {
            this.lastMinute = minute;
            EventBus.emit(GameEvents.MinutePassed);
        }

        return isNewDay;
    }

    private StartNewDay (today: string)
    {
        // Going back in time (resetting the debug clock) just starts that day fresh
        const daysSinceLastPlayed = this.dayKey ? GetDaysBetween(this.dayKey, today) : 1;
        const payload: DayStartedPayload = { dayKey: today, missedDays: Math.max(0, daysSinceLastPlayed - 1) };

        this.dayKey = today;
        this.hasPlannedToday = false;
        playerTaskList.ClearForNewDay();

        EventBus.emit(GameEvents.DayStarted, payload);
        EventBus.emit(GameEvents.CheckInNeeded);
    }
}

export const dayCycle = new DayCycle();
