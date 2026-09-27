import { EventBus, GameEvents, type SmallerStepsRequestedPayload } from '../game/EventBus';
import { taskSplitSettings } from '../game/data/DaySettings';
import { GetDifficultyLevel } from '../game/data/TaskTypes';
import { gentleHelpers } from '../game/state/GentleHelpers';
import { moodCheckIn } from '../game/state/MoodCheckIn';
import { playerTaskList } from '../game/state/TaskList';
import { gentleHelperApi, type TaskCheckResult, type TaskHelperRequest, type TaskSplitRule } from '../online/GentleHelperApi';
import { GentleCard } from './GentleCard';
import { ShakeElement } from './UiAnimations';
import './GentleHelpers.css';

// Shortest task name worth asking the helper about
const minNameLengthToCheck = 3;

// The suggested steps as a checklist, so the player keeps only the ones they want
export interface StepChooser
{
    element: HTMLElement;
    // The ticked steps, in order
    GetChosenSteps: () => string[];
    // Shakes the list (when the player tries to go on with nothing ticked)
    Reject: () => void;
}

// The gentle helpers' parts of the UI (Google Gemini, only while they're turned on):
// - Checking each new task as it's added (see CheckNewTask, used by the new task menu): whether it's big for the
//   player, with smaller steps if so, and a kinder name if it's worded harshly. Only tasks rated hard, or that sound
//   hard, get steps (see taskSplitSettings).
// - "Make it smaller": the button on each task, which breaks it into smaller steps
// Either way the steps together finish the whole task, and the player picks which ones to keep.
export class GentleHelperCards
{
    private card: GentleCard;

    constructor (card: GentleCard)
    {
        this.card = card;

        RefreshHelperAvailability();

        EventBus.on(GameEvents.SmallerStepsRequested, (payload: SmallerStepsRequestedPayload) => this.OfferSmallerSteps(payload.taskId));
    }

    private OfferSmallerSteps (taskId: string)
    {
        const task = playerTaskList.GetTask(taskId);

        if (!task || !gentleHelpers.IsActive())
        {
            return;
        }

        this.card.Enqueue((shownCard, finish) => {
            let isCancelled = false;

            shownCard.Show({
                title: 'Making it smaller',
                text: `Finding a few smaller steps for "${task.name}"...`,
                buttons: [ {
                    label: 'Cancel',
                    onClick: () => {
                        isCancelled = true;
                        finish();
                    }
                } ]
            });

            gentleHelperApi.SuggestSmallerSteps(BuildTaskHelperRequest(task.name, task.difficulty))
                .then(result => {
                    if (isCancelled)
                    {
                        return;
                    }

                    const stepChooser = CreateStepChooser(result.steps);

                    shownCard.Show({
                        title: 'A few smaller steps',
                        text: `Together these finish "${task.name}". Keep the ones you'd like.`,
                        body: stepChooser.element,
                        buttons: [
                            { label: 'Keep it as is', onClick: finish },
                            {
                                label: 'Use chosen steps',
                                isPrimary: true,
                                onClick: () => {
                                    const chosenSteps = stepChooser.GetChosenSteps();

                                    if (chosenSteps.length === 0)
                                    {
                                        stepChooser.Reject();
                                        return;
                                    }

                                    playerTaskList.ReplaceWithSteps(task.id, chosenSteps);
                                    finish();
                                }
                            }
                        ]
                    });
                })
                .catch((error: unknown) => {
                    if (!isCancelled)
                    {
                        shownCard.Show({
                            title: "The helper couldn't answer",
                            text: error instanceof Error ? error.message : 'Try again in a little while.',
                            buttons: [ { label: 'Okay', isPrimary: true, onClick: finish } ]
                        });
                    }
                });
        });
    }
}

// Asks the game server whether it has a Gemini key
export async function RefreshHelperAvailability ()
{
    try
    {
        const status = await gentleHelperApi.GetStatus();

        gentleHelpers.SetAvailable(status.isAvailable);
    }
    catch
    {
        gentleHelpers.SetAvailable(false);
    }
}

// Asks the helper about a task that's about to be added. Resolves to null when the helpers are off, the name is too
// short to judge, or the helper doesn't answer in time, so the task can simply be added as it is.
export async function CheckNewTask (name: string, difficulty: number): Promise<TaskCheckResult | null>
{
    if (!gentleHelpers.IsEnabled() || name.trim().length < minNameLengthToCheck)
    {
        return null;
    }

    const timeout = new Promise<null>(resolve => window.setTimeout(() => resolve(null), taskSplitSettings.maxWaitMs));

    // The server may not have been ready when the game first asked (e.g. it was restarted with a new key)
    if (!gentleHelpers.IsAvailable())
    {
        await Promise.race([ RefreshHelperAvailability(), timeout ]);

        if (!gentleHelpers.IsActive())
        {
            return null;
        }
    }

    try
    {
        return await Promise.race([ gentleHelperApi.CheckTask(BuildTaskHelperRequest(name, difficulty)), timeout ]);
    }
    catch
    {
        return null;
    }
}

// Tasks rated hard (unless they're short), and otherwise only tasks that sound hard (see taskSplitSettings).
// The worse the player feels, the smaller the steps.
function BuildTaskHelperRequest (taskName: string, difficulty: number): TaskHelperRequest
{
    const settings = taskSplitSettings;
    const feeling = moodCheckIn.GetFeeling();
    const splitRule: TaskSplitRule = difficulty >= settings.splitFromDifficulty ? 'rated-hard' : 'sounds-hard';

    return {
        taskName,
        difficulty: GetDifficultyLevel(difficulty).helperWord,
        feeling,
        splitRule,
        bigTaskMinutes: settings.soundsHardAfterMinutes,
        stepMinutes: feeling ? settings.stepMinutesByFeeling[feeling] : settings.stepMinutesWithoutCheckIn,
        maxSteps: settings.maxSteps
    };
}

// The suggested steps, numbered, each with a tick box (all ticked to start with)
export function CreateStepChooser (steps: string[]): StepChooser
{
    const stepList = document.createElement('ol');
    stepList.className = 'gentle-steps';
    stepList.setAttribute('aria-label', 'Steps to keep');

    const checkboxes = steps.map(step => {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'gentle-step-checkbox';
        checkbox.checked = true;

        const textElement = document.createElement('span');
        textElement.className = 'gentle-step-text';
        textElement.textContent = step;

        const label = document.createElement('label');
        label.className = 'gentle-step-label';
        label.append(checkbox, textElement);

        const item = document.createElement('li');
        item.className = 'gentle-step';
        item.append(label);
        checkbox.addEventListener('change', () => item.classList.toggle('is-left-out', !checkbox.checked));
        stepList.append(item);

        return checkbox;
    });

    return {
        element: stepList,
        GetChosenSteps: () => steps.filter((_step, stepIndex) => checkboxes[stepIndex].checked),
        Reject: () => ShakeElement(stepList)
    };
}
