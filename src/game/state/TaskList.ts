import { EventBus, GameEvents, type TaskChangeReason, type TasksChangedPayload } from '../EventBus';
import { defaultTaskDifficulty, smallerStepDifficulty, taskTypeIds, type DailyProgress, type NewTaskDetails, type Task, type TaskTypeId } from '../data/TaskTypes';

export interface TaskListSaveData
{
    tasks: Task[];
    nextTaskNumber: number;
}

// Today's tasks. Finished tasks stay in the list, since they still count toward the day's progress.
// A new day starts with an empty list (see DayCycle).
class TaskList
{
    private tasks: Task[] = [];
    private nextTaskNumber = 1;

    GetTask (taskId: string): Task | undefined
    {
        return this.tasks.find(task => task.id === taskId);
    }

    // In to-do list order (see CompareTasks)
    GetSortedTasks (): Task[]
    {
        return [ ...this.tasks ].sort(CompareTasks);
    }

    GetTaskCount (): number
    {
        return this.tasks.length;
    }

    GetProgress (): DailyProgress
    {
        const completedCountByType = Object.fromEntries(taskTypeIds.map(typeId => [ typeId, 0 ])) as Record<TaskTypeId, number>;
        let completedCount = 0;
        let totalCount = 0;

        for (const task of this.tasks)
        {
            if (task.isExempt)
            {
                continue;
            }

            totalCount++;

            if (task.isCompleted)
            {
                completedCount++;
                completedCountByType[task.typeId]++;
            }
        }

        return { totalCount, completedCount, completedCountByType };
    }

    AddTask (details: NewTaskDetails): Task
    {
        const task: Task = {
            ...details,
            id: `task-${this.nextTaskNumber++}`,
            isCompleted: false,
            hasEarnedCoins: false,
            isExempt: false
        };

        this.tasks.push(task);
        this.EmitChange('added', task.id);

        return task;
    }

    CompleteTask (taskId: string)
    {
        this.SetCompleted(taskId, true);
    }

    ReopenTask (taskId: string)
    {
        this.SetCompleted(taskId, false);
    }

    DeleteTask (taskId: string)
    {
        const taskIndex = this.tasks.findIndex(task => task.id === taskId);

        if (taskIndex === -1)
        {
            return;
        }

        this.tasks.splice(taskIndex, 1);
        this.EmitChange('deleted', taskId);
    }

    RenameTask (taskId: string, name: string)
    {
        const task = this.GetTask(taskId);

        if (task && name.trim() !== '' && task.name !== name)
        {
            task.name = name.trim();
            this.EmitChange('renamed', taskId);
        }
    }

    // Swaps a task for a few smaller steps of the same type and importance (the first step keeps its set time)
    ReplaceWithSteps (taskId: string, stepNames: string[]): Task[]
    {
        const task = this.GetTask(taskId);

        if (!task || stepNames.length === 0)
        {
            return [];
        }

        this.DeleteTask(taskId);

        return stepNames.map((stepName, stepIndex) => this.AddTask({
            name: stepName,
            typeId: task.typeId,
            importance: task.importance,
            scheduledMinutes: stepIndex === 0 ? task.scheduledMinutes : null,
            difficulty: smallerStepDifficulty
        }));
    }

    // Keeps only the most important unfinished tasks counting toward today; the rest can wait. Returns how many
    // tasks were set aside.
    FocusOnMostImportant (tasksKept: number): number
    {
        const openTasks = this.tasks
            .filter(task => !task.isCompleted && !task.isExempt)
            .sort((first, second) => second.importance - first.importance || CompareTasks(first, second));
        const tasksToSetAside = openTasks.slice(Math.max(1, tasksKept));

        for (const task of tasksToSetAside)
        {
            task.isExempt = true;
        }

        if (tasksToSetAside.length > 0)
        {
            this.EmitChange('focus', tasksToSetAside[0].id);
        }

        return tasksToSetAside.length;
    }

    // The unfinished task that matters most today (among those that still count), if any
    GetMostImportantOpenTask (): Task | undefined
    {
        return this.tasks
            .filter(task => !task.isCompleted && !task.isExempt)
            .sort((first, second) => second.importance - first.importance || CompareTasks(first, second))[0];
    }

    // How many unfinished tasks FocusOnMostImportant would set aside
    CountTasksBeyond (tasksKept: number): number
    {
        const openCount = this.tasks.filter(task => !task.isCompleted && !task.isExempt).length;

        return Math.max(0, openCount - Math.max(1, tasksKept));
    }

    ClearForNewDay ()
    {
        this.tasks = [];
        this.EmitChange('cleared', '');
    }

    ToSaveData (): TaskListSaveData
    {
        return { tasks: this.tasks.map(task => ({ ...task })), nextTaskNumber: this.nextTaskNumber };
    }

    LoadSaveData (data: Partial<TaskListSaveData> | undefined)
    {
        this.tasks = (data?.tasks ?? []).map(task => ({
            ...task,
            isExempt: task.isExempt === true,
            // Tasks saved before difficulty existed
            difficulty: task.difficulty ?? defaultTaskDifficulty
        }));
        this.nextTaskNumber = Math.max(data?.nextTaskNumber ?? 1, this.tasks.length + 1);
    }

    private SetCompleted (taskId: string, isCompleted: boolean)
    {
        const task = this.GetTask(taskId);

        if (!task || task.isCompleted === isCompleted)
        {
            return;
        }

        const isFirstCompletion = isCompleted && !task.hasEarnedCoins;

        task.isCompleted = isCompleted;
        task.hasEarnedCoins ||= isCompleted;

        // Finishing a task that could have waited makes it count again
        if (isCompleted)
        {
            task.isExempt = false;
        }

        this.EmitChange(isCompleted ? 'completed' : 'reopened', taskId, isFirstCompletion);
    }

    private EmitChange (reason: TaskChangeReason, taskId: string, isFirstCompletion = false)
    {
        const payload: TasksChangedPayload = { reason, taskId, progress: this.GetProgress(), isFirstCompletion };

        EventBus.emit(GameEvents.TasksChanged, payload);
    }
}

// To-do list order: tasks with a set time come first, earliest first, then tasks without one.
// Between tasks at the same time (or both without one), the more important task comes first.
// Anything still tied keeps the order it was added in, since sort is stable.
function CompareTasks (first: Task, second: Task): number
{
    const firstTime = first.scheduledMinutes ?? Number.POSITIVE_INFINITY;
    const secondTime = second.scheduledMinutes ?? Number.POSITIVE_INFINITY;

    if (firstTime !== secondTime)
    {
        return firstTime < secondTime ? -1 : 1;
    }

    return second.importance - first.importance;
}

// Whether at least this percent of the day is done, compared without rounding (1 of 3 tasks is 33.3%, so it's
// at least 33%)
export function HasReachedPercent (progress: DailyProgress, percent: number): boolean
{
    return progress.totalCount > 0 && progress.completedCount * 100 >= percent * progress.totalCount;
}

export const playerTaskList = new TaskList();
