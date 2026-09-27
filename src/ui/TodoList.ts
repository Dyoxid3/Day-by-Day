import { EventBus, GameEvents, type SmallerStepsRequestedPayload, type TasksChangedPayload } from '../game/EventBus';
import { gentleHelpers } from '../game/state/GentleHelpers';
import { moodCheckIn } from '../game/state/MoodCheckIn';
import { feelingsThatRest } from '../game/data/DaySettings';
import { GetUiZoom } from './UiScale';
import { playerTaskList } from '../game/state/TaskList';
import { GetImportanceLevel, taskTypes, type Task } from '../game/data/TaskTypes';
import { coinRewardSettings } from '../game/data/CoinRewardSettings';
import { RequestCoinRewardAtScreenPoint } from '../game/systems/CoinRewards';
import { NewTaskPrompt } from './NewTaskPrompt';
import { uiAssets } from './UiAssets';
import './TodoList.css';

const todoAnimationSettings = {
    // How long a just-checked task stays in place before leaving the list
    completedHoldMs: 750,
    checkboxPopDurationMs: 380,
    collapseDurationMs: 260,
    // Checked-off tasks slide right as they leave; deleted ones slide left
    collapseSlidePx: 24,
    newTaskEnterDurationMs: 260,
    burstParticleCount: 8,
    burstDistancePx: 24,
    burstDurationMs: 500
};

// Fixed markup (no player text in it). CSS draws the tick in when the task is checked.
const checkmarkMarkup = '<svg class="todo-task-checkmark" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.4 3.4L15 6.8"/></svg>';

// Today's tasks, in the bottom panel. Unfinished tasks are listed by time and importance;
// "Show all tasks" adds the finished ones underneath.
export class TodoList
{
    private rootElement: HTMLElement;
    private listElement: HTMLDivElement;
    private showAllButton: HTMLButtonElement;
    private newTaskPrompt: NewTaskPrompt;
    private rowElements = new Map<string, HTMLDivElement>();
    private isShowingAllTasks = false;
    // Redrawing waits for running row animations so they aren't cut off; the last one to finish redraws
    private runningRowAnimations = 0;
    private taskIdToHighlight?: string;

    constructor (parent: HTMLElement, modalContainer: HTMLElement)
    {
        this.rootElement = document.createElement('section');
        this.rootElement.className = 'todo-list';

        const headingElement = CreateTextElement('h3', 'bottom-panel-heading', 'To-do list');

        this.listElement = document.createElement('div');
        this.listElement.className = 'todo-list-items';
        this.listElement.addEventListener('scroll', () => this.UpdateScrollFades());

        this.showAllButton = CreateButton('Show all tasks', 'todo-list-button pixel-pill', () => this.ToggleShowAllTasks());
        this.showAllButton.setAttribute('aria-pressed', 'false');

        const addTaskButton = CreateButton('+ Add task', 'todo-list-button pixel-pill is-primary', () => this.OpenNewTaskPrompt());

        const actionsElement = document.createElement('div');
        actionsElement.className = 'todo-list-actions';
        actionsElement.append(this.showAllButton, addTaskButton);

        this.rootElement.append(headingElement, this.listElement, actionsElement);
        parent.append(this.rootElement);

        this.newTaskPrompt = new NewTaskPrompt(modalContainer);

        this.Render();

        EventBus.on(GameEvents.TasksChanged, this.HandleTasksChanged, this);
        EventBus.on(GameEvents.PlayerDataLoaded, this.RequestRender, this);
        // The empty list's note depends on how the player said they feel
        EventBus.on(GameEvents.FeelingShared, this.RequestRender, this);
        EventBus.on(GameEvents.GentleHelpersChanged, this.RequestRender, this);
        // Planning the day (see DayStartFlow) adds tasks with the same menu
        EventBus.on(GameEvents.NewTaskPromptRequested, this.OpenNewTaskPrompt, this);
        // Whether the list can scroll also changes when the window is resized
        new ResizeObserver(() => this.UpdateScrollFades()).observe(this.listElement);
    }

    private HandleTasksChanged (payload: TasksChangedPayload)
    {
        switch (payload.reason)
        {
            case 'completed':
                this.AnimateRowThenRender(payload.taskId, row => this.PlayCompletionAnimation(row, payload.isFirstCompletion));
                break;

            case 'deleted':
                this.AnimateRowThenRender(payload.taskId, row => CollapseRow(row, -todoAnimationSettings.collapseSlidePx));
                break;

            case 'added':
                this.taskIdToHighlight = payload.taskId;
                this.RequestRender();
                break;

            default:
                this.RequestRender();
        }
    }

    private HandleCheckboxPressed (taskId: string)
    {
        if (playerTaskList.GetTask(taskId)?.isCompleted)
        {
            playerTaskList.ReopenTask(taskId);
        }
        else
        {
            playerTaskList.CompleteTask(taskId);
        }
    }

    private ToggleShowAllTasks ()
    {
        this.isShowingAllTasks = !this.isShowingAllTasks;
        this.showAllButton.setAttribute('aria-pressed', String(this.isShowingAllTasks));
        this.RequestRender();
    }

    private OpenNewTaskPrompt ()
    {
        this.newTaskPrompt.Open(details => playerTaskList.AddTask(details));
    }

    private RequestRender ()
    {
        if (this.runningRowAnimations === 0)
        {
            this.Render();
        }
    }

    private Render ()
    {
        const tasks = playerTaskList.GetSortedTasks();
        const openTasks = tasks.filter(task => !task.isCompleted && !task.isExempt);
        // Set aside late in the day (see EveningFocus); they no longer count, but can still be done
        const waitingTasks = tasks.filter(task => !task.isCompleted && task.isExempt);
        const finishedTasks = tasks.filter(task => task.isCompleted);
        const listContent: HTMLElement[] = [];

        this.rowElements.clear();

        if (openTasks.length === 0)
        {
            let message = 'All done for today. Well done.';

            if (tasks.length === 0)
            {
                // Resting is only suggested on a day the player said was terrible
                const feeling = moodCheckIn.GetFeeling();

                message = feeling !== null && feelingsThatRest.includes(feeling)
                    ? 'Nothing planned today, and that is okay. Rest, and add something small only if you want to.'
                    : 'Nothing planned yet. Add something small below.';
            }
            else if (waitingTasks.length > 0)
            {
                message = 'Everything that mattered today is done.';
            }

            listContent.push(CreateTextElement('p', 'todo-list-message', message));
        }

        for (const task of openTasks)
        {
            listContent.push(this.CreateTaskRow(task));
        }

        if (waitingTasks.length > 0)
        {
            listContent.push(CreateTextElement('div', 'todo-list-divider', `Can wait for another day (${waitingTasks.length})`));

            for (const task of waitingTasks)
            {
                listContent.push(this.CreateTaskRow(task));
            }
        }

        if (this.isShowingAllTasks && finishedTasks.length > 0)
        {
            listContent.push(CreateTextElement('div', 'todo-list-divider', `Completed (${finishedTasks.length})`));

            for (const task of finishedTasks)
            {
                listContent.push(this.CreateTaskRow(task));
            }
        }

        this.listElement.replaceChildren(...listContent);
        this.HighlightNewTask();
        this.UpdateScrollFades();
    }

    private CreateTaskRow (task: Task): HTMLDivElement
    {
        const row = document.createElement('div');
        row.className = 'todo-task';
        row.classList.toggle('is-completed', task.isCompleted);
        row.classList.toggle('is-exempt', task.isExempt);
        row.style.setProperty('--task-color', taskTypes[task.typeId].color);

        const checkbox = document.createElement('button');
        checkbox.type = 'button';
        checkbox.className = 'todo-task-checkbox';
        checkbox.setAttribute('role', 'checkbox');
        checkbox.setAttribute('aria-checked', String(task.isCompleted));
        checkbox.setAttribute('aria-label', task.name);
        checkbox.innerHTML = checkmarkMarkup;
        checkbox.addEventListener('click', () => this.HandleCheckboxPressed(task.id));

        const nameElement = CreateTextElement('span', 'todo-task-name', task.name);
        // Shows the full name on hover when it's cut off
        nameElement.title = task.name;

        const textElement = document.createElement('div');
        textElement.className = 'todo-task-text';
        textElement.append(nameElement, CreateTextElement('span', 'todo-task-details', DescribeTask(task)));

        const importanceLevel = GetImportanceLevel(task.importance);
        const importanceElement = CreateTextElement('span', 'todo-task-importance', importanceLevel.marker);
        importanceElement.style.color = importanceLevel.markerColor;
        importanceElement.title = `${importanceLevel.label} importance`;

        // The trash button only shows while the pointer is over this strip at the row's right end
        const deleteZone = document.createElement('div');
        deleteZone.className = 'todo-task-delete-zone';

        // With the gentle helpers on, an unfinished task can be broken into smaller steps
        if (gentleHelpers.IsActive() && !task.isCompleted && !task.isExempt)
        {
            deleteZone.append(CreateSmallerButton(task));
        }

        deleteZone.append(CreateDeleteButton(task));

        row.append(checkbox, textElement, importanceElement, deleteZone);
        this.rowElements.set(task.id, row);

        return row;
    }

    private async AnimateRowThenRender (taskId: string, animateRow: (row: HTMLDivElement) => Promise<void>)
    {
        const row = this.rowElements.get(taskId);

        if (!row)
        {
            this.RequestRender();
            return;
        }

        // Ignores clicks on the row while it animates
        row.classList.add('is-animating');
        this.runningRowAnimations++;

        await animateRow(row);

        this.runningRowAnimations--;
        this.RequestRender();
    }

    private async PlayCompletionAnimation (row: HTMLDivElement, isFirstCompletion: boolean)
    {
        const settings = todoAnimationSettings;
        const checkbox = row.querySelector<HTMLElement>('.todo-task-checkbox');

        // CSS fills the checkbox, draws the tick, strikes through the name and flashes the row
        row.classList.add('is-completed', 'is-flashing');

        if (checkbox)
        {
            checkbox.setAttribute('aria-checked', 'true');
            this.SpawnCompletionBurst(checkbox, row.style.getPropertyValue('--task-color'));

            // Coins stream from the checkbox up to the coin counter (only the first time a task is checked)
            if (isFirstCompletion)
            {
                const checkboxBounds = checkbox.getBoundingClientRect();

                RequestCoinRewardAtScreenPoint(
                    coinRewardSettings.taskCompletionCoins,
                    checkboxBounds.left + checkboxBounds.width / 2,
                    checkboxBounds.top + checkboxBounds.height / 2
                );
            }
            checkbox.animate(
                [ { transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(0.92)' }, { transform: 'scale(1)' } ],
                { duration: settings.checkboxPopDurationMs, easing: 'ease-out' }
            );
        }

        await Wait(settings.completedHoldMs);

        // With finished tasks hidden, the task leaves the list
        if (!this.isShowingAllTasks)
        {
            await CollapseRow(row, settings.collapseSlidePx);
        }
    }

    // Dots in the task's color bursting out of its checkbox. They're added outside the list so its edges don't clip them.
    private SpawnCompletionBurst (checkbox: HTMLElement, color: string)
    {
        const settings = todoAnimationSettings;
        const rootBounds = this.rootElement.getBoundingClientRect();
        const checkboxBounds = checkbox.getBoundingClientRect();
        // Page positions are zoomed, left/top inside the UI are not
        const uiZoom = GetUiZoom();
        const centerX = (checkboxBounds.left + checkboxBounds.width / 2 - rootBounds.left) / uiZoom;
        const centerY = (checkboxBounds.top + checkboxBounds.height / 2 - rootBounds.top) / uiZoom;

        for (let index = 0; index < settings.burstParticleCount; index++)
        {
            const angle = (index / settings.burstParticleCount) * Math.PI * 2 + Math.random() * 0.5;
            const distance = settings.burstDistancePx * (0.7 + Math.random() * 0.6);
            const particle = document.createElement('span');

            particle.className = 'todo-list-particle';
            particle.style.left = `${centerX}px`;
            particle.style.top = `${centerY}px`;
            particle.style.background = color;
            this.rootElement.append(particle);

            const burst = particle.animate(
                [
                    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                    {
                        transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) scale(0.2)`,
                        opacity: 0
                    }
                ],
                { duration: settings.burstDurationMs, easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)' }
            );

            burst.onfinish = () => particle.remove();
        }
    }

    private HighlightNewTask ()
    {
        const row = this.taskIdToHighlight ? this.rowElements.get(this.taskIdToHighlight) : undefined;

        this.taskIdToHighlight = undefined;

        if (!row)
        {
            return;
        }

        row.classList.add('is-flashing');
        row.animate(
            [ { opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' } ],
            { duration: todoAnimationSettings.newTaskEnterDurationMs, easing: 'ease-out' }
        );
        this.ScrollRowIntoView(row);
    }

    // Scrolls only the list. scrollIntoView could also scroll the game container while the panel slides.
    private ScrollRowIntoView (row: HTMLElement)
    {
        const visibleTop = this.listElement.scrollTop;
        const visibleBottom = visibleTop + this.listElement.clientHeight;
        const rowTop = row.offsetTop;
        const rowBottom = rowTop + row.offsetHeight;

        if (rowTop < visibleTop)
        {
            this.listElement.scrollTo({ top: rowTop, behavior: 'smooth' });
        }
        else if (rowBottom > visibleBottom)
        {
            this.listElement.scrollTo({ top: rowBottom - this.listElement.clientHeight, behavior: 'smooth' });
        }
    }

    // The scrollbar is hidden, so the list fades out at whichever edge it can still scroll toward
    private UpdateScrollFades ()
    {
        const list = this.listElement;

        list.classList.toggle('can-scroll-up', list.scrollTop > 1);
        list.classList.toggle('can-scroll-down', list.scrollTop + list.clientHeight < list.scrollHeight - 1);
    }
}

// Asks the gentle helper to break the task into a few tiny first steps (see GentleHelpers)
function CreateSmallerButton (task: Task): HTMLButtonElement
{
    const smallerButton = CreateButton('smaller', 'todo-task-smaller pixel-pill', () => {
        const payload: SmallerStepsRequestedPayload = { taskId: task.id };

        EventBus.emit(GameEvents.SmallerStepsRequested, payload);
    });

    smallerButton.title = 'Break this into smaller steps';
    smallerButton.setAttribute('aria-label', `Break ${task.name} into smaller steps`);

    return smallerButton;
}

function CreateDeleteButton (task: Task): HTMLButtonElement
{
    const deleteButton = CreateButton('', 'todo-task-delete', () => playerTaskList.DeleteTask(task.id));
    deleteButton.setAttribute('aria-label', `Delete ${task.name}`);

    const trashIcon = document.createElement('img');
    trashIcon.className = 'todo-task-delete-icon';
    trashIcon.src = uiAssets.trash;
    trashIcon.alt = '';
    trashIcon.draggable = false;
    deleteButton.append(trashIcon);

    return deleteButton;
}

// e.g. "9:30 AM - Health", or just "Health" when the task has no set time
function DescribeTask (task: Task): string
{
    const typeLabel = taskTypes[task.typeId].label;

    return task.scheduledMinutes === null ? typeLabel : `${FormatTimeOfDay(task.scheduledMinutes)} - ${typeLabel}`;
}

// Follows the player's own clock format (9:30 AM or 09:30)
function FormatTimeOfDay (minutesAfterMidnight: number): string
{
    const time = new Date();

    time.setHours(Math.floor(minutesAfterMidnight / 60), minutesAfterMidnight % 60, 0, 0);

    return time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Shrinks a row away while sliding it sideways. It stays collapsed until the list redraws.
async function CollapseRow (row: HTMLElement, slideXPx: number): Promise<void>
{
    const rowStyle = getComputedStyle(row);

    row.style.overflow = 'hidden';

    const collapse = row.animate(
        [
            {
                height: `${row.offsetHeight}px`,
                paddingTop: rowStyle.paddingTop,
                paddingBottom: rowStyle.paddingBottom,
                marginBottom: rowStyle.marginBottom,
                opacity: 1,
                transform: 'translateX(0)'
            },
            {
                height: '0px',
                paddingTop: '0px',
                paddingBottom: '0px',
                marginBottom: '0px',
                opacity: 0,
                transform: `translateX(${slideXPx}px)`
            }
        ],
        { duration: todoAnimationSettings.collapseDurationMs, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
    );

    await WaitForAnimation(collapse);
}

function CreateButton (text: string, className: string, onClick: () => void): HTMLButtonElement
{
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.addEventListener('click', onClick);

    return button;
}

function CreateTextElement<TagName extends keyof HTMLElementTagNameMap> (
    tagName: TagName,
    className: string,
    text: string
): HTMLElementTagNameMap[TagName]
{
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;

    return element;
}

function Wait (durationMs: number): Promise<void>
{
    return new Promise(resolve => window.setTimeout(resolve, durationMs));
}

// Resolves when the animation ends, even if it gets cancelled
function WaitForAnimation (animation: Animation): Promise<void>
{
    return animation.finished.then(() => undefined, () => undefined);
}
