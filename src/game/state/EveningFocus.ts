import { EventBus, GameEvents, type FeelingSharedPayload, type FocusAppliedPayload, type NightNudgePayload } from '../EventBus';
import { feelingsThatRest, focusSettings, type Feeling } from '../data/DaySettings';
import { dayCycle } from './DayCycle';
import { gameClock } from './GameClock';
import { moodCheckIn } from './MoodCheckIn';
import { HasReachedPercent, playerTaskList } from './TaskList';

export interface EveningFocusSaveData
{
    // When today's evening offer appears (an hour of the day), or null for no offer today
    offerAtHour: number | null;
    hasOffered: boolean;
    // Nothing shows before this hour of the day (a little while after the day was planned)
    quietUntilHour: number;
    isFocusApplied: boolean;
    // Tonight's prompt (the list shrinking, or a nudge to do just one thing) has shown
    hasHadNightPrompt: boolean;
}

// Late in the day, when hardly anything is done, the player is gently pointed toward doing at least something:
// - In the evening they may be offered to shrink a long list to its most important tasks, more likely the worse they
//   said they felt (a chance at redemption)
// - At night a long list shrinks by itself; a short one gets a nudge to do just its most important task
// None of this happens on a day the player chose to rest.
class EveningFocus
{
    private offerAtHour: number | null = null;
    private hasOffered = false;
    private isFocusApplied = false;
    private quietUntilHour = 0;
    private hasHadNightPrompt = false;

    constructor ()
    {
        EventBus.on(GameEvents.DayStarted, () => {
            this.hasOffered = false;
            this.isFocusApplied = false;
            this.hasHadNightPrompt = false;
            this.quietUntilHour = 0;
            this.offerAtHour = RollOfferTime(null);
        });
        EventBus.on(GameEvents.FeelingShared, (payload: FeelingSharedPayload) => {
            if (!this.hasOffered)
            {
                this.offerAtHour = RollOfferTime(payload.feeling);
            }
        });
        EventBus.on(GameEvents.DayPlanned, () => {
            this.quietUntilHour = gameClock.GetHourOfDay() + focusSettings.quietHoursAfterPlanning;
        });
        EventBus.on(GameEvents.MinutePassed, this.Check, this);
    }

    // The player said yes to the evening offer
    AcceptOffer ()
    {
        this.ApplyFocus('offer');
    }

    ToSaveData (): EveningFocusSaveData
    {
        return {
            offerAtHour: this.offerAtHour,
            hasOffered: this.hasOffered,
            quietUntilHour: this.quietUntilHour,
            isFocusApplied: this.isFocusApplied,
            hasHadNightPrompt: this.hasHadNightPrompt
        };
    }

    LoadSaveData (data: Partial<EveningFocusSaveData> | undefined)
    {
        this.offerAtHour = data?.offerAtHour ?? null;
        this.hasOffered = data?.hasOffered === true;
        this.isFocusApplied = data?.isFocusApplied === true;
        this.quietUntilHour = data?.quietUntilHour ?? 0;
        this.hasHadNightPrompt = data?.hasHadNightPrompt === true;
    }

    private Check ()
    {
        const settings = focusSettings;
        const hour = gameClock.GetHourOfDay();
        const feeling = moodCheckIn.GetFeeling();
        const isRestDay = feeling !== null && feelingsThatRest.includes(feeling);
        const openTask = playerTaskList.GetMostImportantOpenTask();

        // Nothing while the day is still being planned or was planned just now, on a rest day, or with nothing left to do
        if (!dayCycle.HasPlannedToday() || hour < this.quietUntilHour || isRestDay || !openTask)
        {
            return;
        }

        const progress = playerTaskList.GetProgress();
        const canShrink = !this.isFocusApplied && playerTaskList.CountTasksBeyond(settings.tasksKept) > 0;

        if (hour >= settings.nightStartsAtHour)
        {
            if (this.hasHadNightPrompt || HasReachedPercent(progress, settings.lowProgressPercent))
            {
                return;
            }

            this.hasHadNightPrompt = true;

            if (canShrink)
            {
                this.ApplyFocus('night');
            }
            else
            {
                const payload: NightNudgePayload = { taskName: openTask.name };

                EventBus.emit(GameEvents.NightNudge, payload);
            }

            return;
        }

        if (canShrink && !this.hasOffered && this.offerAtHour !== null && hour >= this.offerAtHour && !HasReachedPercent(progress, 100))
        {
            this.hasOffered = true;
            EventBus.emit(GameEvents.FocusOffered);
        }
    }

    private ApplyFocus (reason: FocusAppliedPayload['reason'])
    {
        this.isFocusApplied = true;

        const payload: FocusAppliedPayload = { reason, exemptCount: playerTaskList.FocusOnMostImportant(focusSettings.tasksKept) };

        EventBus.emit(GameEvents.FocusApplied, payload);
    }
}

// A random time in the evening window, or null when the dice say there's no offer today
function RollOfferTime (feeling: Feeling | null): number | null
{
    const settings = focusSettings;
    const chance = feeling ? settings.offerChanceByFeeling[feeling] : settings.offerChanceWithoutCheckIn;

    if (Math.random() >= chance)
    {
        return null;
    }

    return settings.offerWindowStartHour + Math.random() * (settings.offerWindowEndHour - settings.offerWindowStartHour);
}

export const eveningFocus = new EveningFocus();
