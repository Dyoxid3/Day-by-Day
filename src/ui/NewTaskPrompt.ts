import {
    defaultTaskDifficulty,
    defaultTaskImportance,
    defaultTaskTypeId,
    smallerStepDifficulty,
    taskDifficultyLevels,
    taskImportanceLevels,
    taskTypeIds,
    taskTypes,
    type NewTaskDetails,
    type TaskTypeId
} from '../game/data/TaskTypes';
import { bigTaskSuggestion, kinderNameSuggestion } from '../game/data/GentleMessages';
import { gameClock } from '../game/state/GameClock';
import { gentleHelpers } from '../game/state/GentleHelpers';
import { CheckNewTask, CreateStepChooser } from './GentleHelpers';
import { ShakeElement } from './UiAnimations';
import { GetPixelTint } from './PixelTints';
import './NewTaskPrompt.css';

interface SuggestionButton
{
    label: string;
    isPrimary?: boolean;
    onClick: () => void;
}

const taskNameMaxLength = 60;
// Switching the time on suggests the next half hour
const suggestedTimeStepMinutes = 30;
const minutesPerDay = 24 * 60;

// The menu for making a new task: its name, type, an optional set time, how important it is, and how hard it is for the
// player. With the gentle helpers on, adding it first asks Google Gemini whether it's big for the player today (on a
// hard day, every task is); if so, smaller steps that finish it are suggested right here in the menu, and the player
// keeps the ones they want. A harshly worded task gets a kinder name suggested instead.
export class NewTaskPrompt
{
    private overlayElement: HTMLDivElement;
    private formElement: HTMLFormElement;
    private nameInput: HTMLInputElement;
    private typeInputs = new Map<TaskTypeId, HTMLInputElement>();
    private hasTimeInput: HTMLInputElement;
    private timeInput: HTMLInputElement;
    private importanceInputs = new Map<number, HTMLInputElement>();
    private difficultyInputs = new Map<number, HTMLInputElement>();
    private addButton: HTMLButtonElement;
    // The helper's suggestion, shown in place of the fields
    private suggestionElement: HTMLDivElement;
    private onSubmit?: (details: NewTaskDetails) => void;
    private focusBeforeOpening: HTMLElement | null = null;
    // Goes up whenever the menu closes or checks again, so a late answer from the helper gets ignored
    private checkNumber = 0;

    constructor (container: HTMLElement)
    {
        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'task-prompt-overlay';
        this.overlayElement.addEventListener('click', event => {
            if (event.target === this.overlayElement)
            {
                this.Close();
            }
        });
        this.overlayElement.addEventListener('keydown', event => this.HandleKeyDown(event));

        this.formElement = document.createElement('form');
        this.formElement.className = 'task-prompt';
        // Missing fields are handled in Submit instead of with the browser's own popups
        this.formElement.noValidate = true;
        // Clicking empty space in the menu keeps focus, and so key presses, inside it
        this.formElement.tabIndex = -1;
        this.formElement.setAttribute('role', 'dialog');
        this.formElement.setAttribute('aria-modal', 'true');
        this.formElement.setAttribute('aria-label', 'New task');
        this.formElement.addEventListener('submit', event => {
            event.preventDefault();
            this.Submit();
        });

        const titleElement = document.createElement('h3');
        titleElement.className = 'task-prompt-title';
        titleElement.textContent = 'New task';

        this.nameInput = document.createElement('input');
        this.nameInput.type = 'text';
        this.nameInput.className = 'task-prompt-input';
        this.nameInput.maxLength = taskNameMaxLength;
        this.nameInput.placeholder = 'e.g. Go for a walk';
        this.nameInput.autocomplete = 'off';

        const nameLabel = document.createElement('span');
        nameLabel.className = 'task-prompt-label';
        nameLabel.textContent = 'Name';

        const nameField = document.createElement('label');
        nameField.className = 'task-prompt-field';
        nameField.append(nameLabel, this.nameInput);

        const typeOptions = document.createElement('div');
        typeOptions.className = 'task-prompt-options';

        for (const typeId of taskTypeIds)
        {
            const choice = CreateChoice('new-task-type', typeId, taskTypes[typeId].label, typeId === defaultTaskTypeId);

            choice.label.classList.add('is-type');
            choice.label.style.setProperty('--task-color', taskTypes[typeId].color);
            // The same color for the pixel-art pill and dot
            choice.label.style.setProperty('--task-tint', GetPixelTint(taskTypes[typeId].color));
            this.typeInputs.set(typeId, choice.input);
            typeOptions.append(choice.label);
        }

        this.hasTimeInput = document.createElement('input');
        this.hasTimeInput.type = 'checkbox';
        this.hasTimeInput.addEventListener('change', () => this.HandleHasTimeChanged(true));

        const switchTrack = document.createElement('span');
        switchTrack.className = 'task-prompt-switch-track pixel-pill';

        const timeSwitch = document.createElement('label');
        timeSwitch.className = 'task-prompt-switch';
        timeSwitch.append(this.hasTimeInput, switchTrack, 'Set a time');

        this.timeInput = document.createElement('input');
        this.timeInput.type = 'time';
        this.timeInput.className = 'task-prompt-input task-prompt-time';
        this.timeInput.setAttribute('aria-label', 'Time');

        const timeRow = document.createElement('div');
        timeRow.className = 'task-prompt-time-row';
        timeRow.append(timeSwitch, this.timeInput);

        const importanceOptions = document.createElement('div');
        importanceOptions.className = 'task-prompt-options is-even';

        for (const importanceLevel of taskImportanceLevels)
        {
            const choice = CreateChoice(
                'new-task-importance',
                String(importanceLevel.level),
                importanceLevel.label,
                importanceLevel.level === defaultTaskImportance
            );

            this.importanceInputs.set(importanceLevel.level, choice.input);
            importanceOptions.append(choice.label);
        }

        // How hard it is for the player (the gentle helper suggests smaller steps more readily for harder ones)
        const difficultyOptions = document.createElement('div');
        difficultyOptions.className = 'task-prompt-options is-even';

        for (const difficultyLevel of taskDifficultyLevels)
        {
            const choice = CreateChoice(
                'new-task-difficulty',
                String(difficultyLevel.level),
                difficultyLevel.label,
                difficultyLevel.level === defaultTaskDifficulty
            );

            this.difficultyInputs.set(difficultyLevel.level, choice.input);
            difficultyOptions.append(choice.label);
        }

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'task-prompt-button is-subtle';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => this.Close());

        this.addButton = document.createElement('button');
        this.addButton.type = 'submit';
        this.addButton.className = 'task-prompt-button is-primary';
        this.addButton.textContent = 'Add task';

        const buttonRow = document.createElement('div');
        buttonRow.className = 'task-prompt-buttons';
        buttonRow.append(cancelButton, this.addButton);

        this.suggestionElement = document.createElement('div');
        this.suggestionElement.className = 'task-prompt-suggestion';

        this.formElement.append(
            titleElement,
            nameField,
            CreateFieldset('Type', typeOptions),
            CreateFieldset('Time', timeRow),
            CreateFieldset('Importance', importanceOptions),
            CreateFieldset('How hard is this for you?', difficultyOptions),
            buttonRow,
            this.suggestionElement
        );
        this.overlayElement.append(this.formElement);
        container.append(this.overlayElement);
    }

    IsOpen (): boolean
    {
        return this.overlayElement.classList.contains('is-open');
    }

    Open (onSubmit: (details: NewTaskDetails) => void)
    {
        this.onSubmit = onSubmit;
        this.focusBeforeOpening = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        // Back to the defaults: no name, no set time, default type, importance and difficulty
        this.formElement.reset();
        this.HandleHasTimeChanged(false);
        this.ShowFields();

        this.overlayElement.classList.add('is-open');
        this.nameInput.focus();
    }

    Close ()
    {
        if (!this.IsOpen())
        {
            return;
        }

        this.checkNumber++;
        this.onSubmit = undefined;
        this.overlayElement.classList.remove('is-open');
        // Without preventScroll, focusing a button in a closed panel would scroll the whole game container
        this.focusBeforeOpening?.focus({ preventScroll: true });
        this.focusBeforeOpening = null;
    }

    private HandleKeyDown (event: KeyboardEvent)
    {
        // Typing a task name shouldn't trigger the game's keyboard shortcuts
        event.stopPropagation();

        if (event.key === 'Escape')
        {
            this.Close();
        }
        else if (event.key === 'Tab')
        {
            this.KeepFocusInside(event);
        }
    }

    private HandleHasTimeChanged (shouldFocusTime: boolean)
    {
        const hasTime = this.hasTimeInput.checked;

        this.timeInput.disabled = !hasTime;

        if (!hasTime)
        {
            return;
        }

        if (this.timeInput.value === '')
        {
            this.timeInput.value = FormatTimeInputValue(GetSuggestedMinutes());
        }

        if (shouldFocusTime)
        {
            this.timeInput.focus();
        }
    }

    private Submit ()
    {
        const name = this.nameInput.value.trim();

        if (name === '')
        {
            RejectField(this.nameInput);
            return;
        }

        let scheduledMinutes: number | null = null;

        if (this.hasTimeInput.checked)
        {
            scheduledMinutes = ParseTimeInputValue(this.timeInput.value);

            if (scheduledMinutes === null)
            {
                RejectField(this.timeInput);
                return;
            }
        }

        const details: NewTaskDetails = {
            name,
            typeId: FindCheckedKey(this.typeInputs) ?? defaultTaskTypeId,
            importance: FindCheckedKey(this.importanceInputs) ?? defaultTaskImportance,
            difficulty: FindCheckedKey(this.difficultyInputs) ?? defaultTaskDifficulty,
            scheduledMinutes
        };

        // Checked even while the helper seems unavailable, in case the server has come up since (see CheckNewTask)
        if (gentleHelpers.IsEnabled())
        {
            this.CheckWithHelper(details);
        }
        else
        {
            this.AddAndClose([ details ]);
        }
    }

    // Asks the helper about the task before adding it: a big task gets smaller steps suggested, a harshly worded one a
    // kinder name. Anything else (or no answer in time) is added as it is.
    private async CheckWithHelper (details: NewTaskDetails)
    {
        const checkNumber = ++this.checkNumber;

        this.addButton.disabled = true;
        this.addButton.textContent = 'Checking...';

        const result = await CheckNewTask(details.name, details.difficulty);

        // Closed (or checked again) while waiting
        if (checkNumber !== this.checkNumber)
        {
            return;
        }

        this.addButton.disabled = false;
        this.addButton.textContent = 'Add task';

        if (result?.isBig)
        {
            const message = bigTaskSuggestion;
            const stepChooser = CreateStepChooser(result.steps);

            this.ShowSuggestion(message.title, message.text, stepChooser.element, [
                { label: 'Keep it as one task', onClick: () => this.AddAndClose([ details ]) },
                {
                    label: 'Add chosen steps',
                    isPrimary: true,
                    onClick: () => {
                        const chosenSteps = stepChooser.GetChosenSteps();

                        if (chosenSteps.length === 0)
                        {
                            stepChooser.Reject();
                            return;
                        }

                        this.AddAndClose(chosenSteps.map((step, stepIndex): NewTaskDetails => ({
                            ...details,
                            name: step,
                            difficulty: smallerStepDifficulty,
                            // Only the first step keeps the set time
                            scheduledMinutes: stepIndex === 0 ? details.scheduledMinutes : null
                        })));
                    }
                }
            ]);
        }
        else if (result?.gentlerName)
        {
            const gentlerName = result.gentlerName;

            this.ShowSuggestion(kinderNameSuggestion.title, kinderNameSuggestion.text, CreateRenameBody(details.name, gentlerName), [
                { label: 'Keep mine', onClick: () => this.AddAndClose([ details ]) },
                { label: 'Use the kinder one', isPrimary: true, onClick: () => this.AddAndClose([ { ...details, name: gentlerName } ]) }
            ]);
        }
        else
        {
            this.AddAndClose([ details ]);
        }
    }

    // Shows the helper's suggestion in place of the fields
    private ShowSuggestion (title: string, text: string, body: HTMLElement, buttons: SuggestionButton[])
    {
        const titleElement = document.createElement('p');
        titleElement.className = 'task-prompt-suggestion-title';
        titleElement.textContent = title;

        const textElement = document.createElement('p');
        textElement.className = 'task-prompt-suggestion-text';
        textElement.textContent = text;

        const buttonRow = document.createElement('div');
        buttonRow.className = 'task-prompt-buttons';
        buttonRow.append(...buttons.map(buttonDetails => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `task-prompt-button ${buttonDetails.isPrimary ? 'is-primary' : 'is-subtle'}`;
            button.textContent = buttonDetails.label;
            button.addEventListener('click', buttonDetails.onClick);

            return button;
        }));

        this.suggestionElement.replaceChildren(titleElement, textElement, body, buttonRow);
        this.formElement.classList.add('is-suggesting');
        buttonRow.querySelector<HTMLButtonElement>('.is-primary')?.focus({ preventScroll: true });
    }

    private ShowFields ()
    {
        this.checkNumber++;
        this.formElement.classList.remove('is-suggesting');
        this.suggestionElement.replaceChildren();
        this.addButton.disabled = false;
        this.addButton.textContent = 'Add task';
    }

    // Adds the task (or its smaller steps) and closes the menu
    private AddAndClose (tasks: NewTaskDetails[])
    {
        const onSubmit = this.onSubmit;

        this.Close();

        for (const task of tasks)
        {
            onSubmit?.(task);
        }
    }

    // Tab and Shift+Tab loop around the menu's controls instead of leaving it
    private KeepFocusInside (event: KeyboardEvent)
    {
        // Only what's showing: the fields, or the helper's suggestion in their place
        const tabStops = Array.from(this.formElement.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button'))
            .filter(control => !control.disabled && !IsUnselectedRadio(control) && control.getClientRects().length > 0);
        const firstStop = tabStops[0];
        const lastStop = tabStops[tabStops.length - 1];
        const focusedElement = document.activeElement;

        if (event.shiftKey && (focusedElement === firstStop || focusedElement === this.formElement))
        {
            event.preventDefault();
            lastStop?.focus();
        }
        else if (!event.shiftKey && focusedElement === lastStop)
        {
            event.preventDefault();
            firstStop?.focus();
        }
    }
}

// A radio button drawn as a pixel-art pill
function CreateChoice (groupName: string, value: string, text: string, isDefault: boolean)
{
    const label = document.createElement('label');
    label.className = 'task-prompt-choice';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = groupName;
    input.value = value;
    input.defaultChecked = isDefault;

    const textElement = document.createElement('span');
    textElement.className = 'pixel-pill';
    textElement.textContent = text;

    label.append(input, textElement);

    return { label, input };
}

function CreateFieldset (legendText: string, content: HTMLElement): HTMLFieldSetElement
{
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'task-prompt-field';

    const legend = document.createElement('legend');
    legend.className = 'task-prompt-label';
    legend.textContent = legendText;

    fieldset.append(legend, content);

    return fieldset;
}

// The name as typed, and the kinder way to say it
function CreateRenameBody (originalName: string, gentlerName: string): HTMLElement
{
    const body = document.createElement('div');
    body.className = 'gentle-rename';

    const fromElement = document.createElement('p');
    fromElement.className = 'gentle-rename-from';
    fromElement.textContent = `"${originalName}"`;

    const joinElement = document.createElement('p');
    joinElement.className = 'gentle-rename-join';
    joinElement.textContent = 'could be';

    const toElement = document.createElement('p');
    toElement.className = 'gentle-rename-to';
    toElement.textContent = `"${gentlerName}"`;

    body.append(fromElement, joinElement, toElement);

    return body;
}

function RejectField (input: HTMLInputElement)
{
    ShakeElement(input);
    input.focus();
}

function FindCheckedKey<Key> (inputs: Map<Key, HTMLInputElement>): Key | undefined
{
    for (const [ key, input ] of inputs)
    {
        if (input.checked)
        {
            return key;
        }
    }

    return undefined;
}

// Only the picked radio button in a group is a Tab stop
function IsUnselectedRadio (control: HTMLInputElement | HTMLButtonElement): boolean
{
    return control instanceof HTMLInputElement && control.type === 'radio' && !control.checked;
}

// "HH:MM" from a time input, as minutes after midnight
function ParseTimeInputValue (value: string): number | null
{
    const [ hours, minutes ] = value.split(':').map(Number);

    if (!Number.isInteger(hours) || !Number.isInteger(minutes))
    {
        return null;
    }

    return hours * 60 + minutes;
}

function FormatTimeInputValue (minutesAfterMidnight: number): string
{
    const hours = Math.floor(minutesAfterMidnight / 60);
    const minutes = minutesAfterMidnight % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function GetSuggestedMinutes (): number
{
    const minutesNow = gameClock.GetMinutesIntoDay();

    return (Math.ceil(minutesNow / suggestedTimeStepMinutes) * suggestedTimeStepMinutes) % minutesPerDay;
}
