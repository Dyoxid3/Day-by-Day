export interface TaskType
{
    label: string;
    // Outlines the task's checkbox in the to-do list and colors its section of the progress ring
    color: string;
}

// The kinds of task a player can make, in the order they're offered in the new task menu
// and drawn around the progress ring. Add a type by adding a line here.
export const taskTypes = {
    health: { label: 'Health', color: '#5fb86b' },
    study: { label: 'Study', color: '#4f8fd9' },
    mental: { label: 'Mental', color: '#9a78d6' },
    social: { label: 'Social', color: '#ee8a5a' },
    other: { label: 'Other', color: '#a0968a' }
} satisfies Record<string, TaskType>;

export type TaskTypeId = keyof typeof taskTypes;

export const taskTypeIds = Object.keys(taskTypes) as TaskTypeId[];

export const defaultTaskTypeId: TaskTypeId = 'other';

export interface TaskImportanceLevel
{
    // Higher is more important; more important tasks are listed first
    level: number;
    label: string;
    // Shown beside the task in the to-do list
    marker: string;
    markerColor: string;
}

// Offered in this order in the new task menu
export const taskImportanceLevels: TaskImportanceLevel[] = [
    { level: 1, label: 'Low', marker: '!', markerColor: '#c9b89e' },
    { level: 2, label: 'Medium', marker: '!!', markerColor: '#e8a33d' },
    { level: 3, label: 'High', marker: '!!!', markerColor: '#d9534f' }
];

export const defaultTaskImportance = 2;

export function GetImportanceLevel (importance: number): TaskImportanceLevel
{
    return taskImportanceLevels.find(importanceLevel => importanceLevel.level === importance) ?? taskImportanceLevels[0];
}

export interface NewTaskDetails
{
    name: string;
    typeId: TaskTypeId;
    // A level from taskImportanceLevels
    importance: number;
    // Minutes after midnight, or null when the task has no set time
    scheduledMinutes: number | null;
}

export interface Task extends NewTaskDetails
{
    id: string;
    isCompleted: boolean;
    // Set the first time the task is checked off; unchecking and checking again doesn't earn coins twice
    hasEarnedCoins: boolean;
}

export interface DailyProgress
{
    totalCount: number;
    completedCount: number;
    completedCountByType: Record<TaskTypeId, number>;
}

// Whole-number percentage of today's tasks that are done. Rounds down, so 100% only shows once everything is done.
export function GetCompletionPercent (progress: DailyProgress): number
{
    if (progress.totalCount === 0)
    {
        return 0;
    }

    return Math.floor((progress.completedCount * 100) / progress.totalCount);
}
