import {
    defaultTaskImportance,
    defaultTaskTypeId,
    taskImportanceLevels,
    taskTypeIds,
    taskTypes,
    type NewTaskDetails,
    type TaskTypeId
} from '../game/data/TaskTypes';
import { ShakeElement } from './UiAnimations';
import './NewTaskPrompt.css';

const taskNameMaxLength = 60;
// Switching the time on suggests the next half hour
const suggestedTimeStepMinutes = 30;
const minutesPerDay = 24 * 60;

// The menu for making a new task: its name, type, an optional set time, and how important it is
export class NewTaskPrompt
{
    private overlayElement: HTMLDivElement;
    private formElement: HTMLFormElement;
    private nameInput: HTMLInputElement;
    private typeInputs = new Map<TaskTypeId, HTMLInputElement>();
    private hasTimeInput: HTMLInputElement;
    private timeInput: HTMLInputElement;
    private importanceInputs = new Map<number, HTMLInputElement>();
    private onSubmit?: (details: NewTaskDetails) => void;
    private focusBeforeOpening: HTMLElement | null = null;

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
            this.typeInputs.set(typeId, choice.input);
            typeOptions.append(choice.label);
        }

        this.hasTimeInput = document.createElement('input');
        this.hasTimeInput.type = 'checkbox';
        this.hasTimeInput.addEventListener('change', () => this.HandleHasTimeChanged(true));

        const switchTrack = document.createElement('span');
        switchTrack.className = 'task-prompt-switch-track';

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

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'task-prompt-button is-subtle';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => this.Close());

        const addButton = document.createElement('button');
        addButton.type = 'submit';
        addButton.className = 'task-prompt-button is-primary';
        addButton.textContent = 'Add task';

        const buttonRow = document.createElement('div');
        buttonRow.className = 'task-prompt-buttons';
        buttonRow.append(cancelButton, addButton);

        this.formElement.append(
            titleElement,
            nameField,
            CreateFieldset('Type', typeOptions),
            CreateFieldset('Time', timeRow),
            CreateFieldset('Importance', importanceOptions),
            buttonRow
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

        // Back to the defaults: no name, no set time, default type and importance
        this.formElement.reset();
        this.HandleHasTimeChanged(false);

        this.overlayElement.classList.add('is-open');
        this.nameInput.focus();
    }

    Close ()
    {
        if (!this.IsOpen())
        {
            return;
        }

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
            scheduledMinutes
        };
        const onSubmit = this.onSubmit;

        this.Close();
        onSubmit?.(details);
    }

    // Tab and Shift+Tab loop around the menu's controls instead of leaving it
    private KeepFocusInside (event: KeyboardEvent)
    {
        const tabStops = Array.from(this.formElement.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button'))
            .filter(control => !control.disabled && !IsUnselectedRadio(control));
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

// A radio button drawn as a pill
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
    const now = new Date();
    const minutesNow = now.getHours() * 60 + now.getMinutes();

    return (Math.ceil(minutesNow / suggestedTimeStepMinutes) * suggestedTimeStepMinutes) % minutesPerDay;
}
