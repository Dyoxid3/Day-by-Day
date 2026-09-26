import { EventBus, GameEvents, type StreakChangedPayload } from '../EventBus';

// How many days in a row the player has kept up with their goals.
// Nothing advances it yet: that needs progress saved between sessions and a rule for what keeps a streak going.
class DailyStreak
{
    private streakDays = 0;

    GetStreakDays (): number
    {
        return this.streakDays;
    }

    SetStreakDays (streakDays: number)
    {
        this.streakDays = Math.max(0, Math.floor(streakDays));

        const payload: StreakChangedPayload = { streakDays: this.streakDays };

        EventBus.emit(GameEvents.StreakChanged, payload);
    }
}

export const playerStreak = new DailyStreak();
