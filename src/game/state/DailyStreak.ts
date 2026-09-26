import { EventBus, GameEvents, type StreakChangedPayload, type TasksChangedPayload } from '../EventBus';

const streakSettings = {
    // Days already in the streak before today
    daysBeforeToday: 27,
    // Today joins the streak once more than this percent of today's tasks are done
    todayThresholdPercent: 33
};

// How many days in a row the player has kept up with their goals. Today counts once enough of today's
// tasks are done, and stops counting again if adding tasks pushes the progress back under the line.
class DailyStreak
{
    private isTodayCounted = false;

    constructor ()
    {
        EventBus.on(GameEvents.TasksChanged, this.HandleTasksChanged, this);
    }

    GetStreakDays (): number
    {
        return streakSettings.daysBeforeToday + (this.isTodayCounted ? 1 : 0);
    }

    IsTodayCounted (): boolean
    {
        return this.isTodayCounted;
    }

    GetThresholdPercent (): number
    {
        return streakSettings.todayThresholdPercent;
    }

    private HandleTasksChanged (payload: TasksChangedPayload)
    {
        const { completedCount, totalCount } = payload.progress;
        // Compared without rounding, so 1 of 3 tasks (33.3%) is over 33%
        const isTodayCounted = totalCount > 0 && completedCount * 100 > streakSettings.todayThresholdPercent * totalCount;

        if (isTodayCounted === this.isTodayCounted)
        {
            return;
        }

        this.isTodayCounted = isTodayCounted;

        const payloadOut: StreakChangedPayload = {
            streakDays: this.GetStreakDays(),
            change: isTodayCounted ? 1 : -1,
            isTodayCounted
        };

        EventBus.emit(GameEvents.StreakChanged, payloadOut);
    }
}

export const playerStreak = new DailyStreak();
