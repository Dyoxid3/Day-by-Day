import { EventBus, GameEvents, type TaskChangeReason, type TasksChangedPayload } from '../EventBus';
import { taskTypeIds, type DailyProgress, type NewTaskDetails, type Task, type TaskTypeId } from '../data/TaskTypes';

// Today's tasks. Finished tasks stay in the list, since they still count toward the day's progress.
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

    GetProgress (): DailyProgress
    {
        const completedCountByType = Object.fromEntries(taskTypeIds.map(typeId => [ typeId, 0 ])) as Record<TaskTypeId, number>;
        let completedCount = 0;

        for (const task of this.tasks)
        {
            if (task.isCompleted)
            {
                completedCount++;
                completedCountByType[task.typeId]++;
            }
        }

        return { totalCount: this.tasks.length, completedCount, completedCountByType };
    }

    AddTask (details: NewTaskDetails): Task
    {
        const task: Task = {
            ...details,
            id: `task-${this.nextTaskNumber++}`,
            isCompleted: false
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

    private SetCompleted (taskId: string, isCompleted: boolean)
    {
        const task = this.GetTask(taskId);

        if (!task || task.isCompleted === isCompleted)
        {
            return;
        }

        task.isCompleted = isCompleted;
        this.EmitChange(isCompleted ? 'completed' : 'reopened', taskId);
    }

    private EmitChange (reason: TaskChangeReason, taskId: string)
    {
        const payload: TasksChangedPayload = { reason, taskId, progress: this.GetProgress() };

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

export const playerTaskList = new TaskList();
