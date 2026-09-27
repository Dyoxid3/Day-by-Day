import type { Feeling } from '../game/data/DaySettings';

// Requests to the gentle helpers (Google Gemini), which the game server makes on the game's behalf so the API key
// never reaches the browser (see server/GentleHelperServer.mjs)
const helperBasePath = '/ai';

// When a new task counts as big: 'rated-hard' (the player rated it hard: big unless it's short), or 'sounds-hard' (it
// sounds like more than bigTaskMinutes of real effort)
export type TaskSplitRule = 'rated-hard' | 'sounds-hard';

// A task, with what the helper should know about the player today
export interface TaskHelperRequest
{
    taskName: string;
    // How hard it feels to the player: 'easy', 'medium' or 'hard'
    difficulty: string;
    feeling: Feeling | null;
    splitRule: TaskSplitRule;
    // A task that sounds like more than this many minutes of effort counts as big
    bigTaskMinutes: number;
    // Each suggested step takes about this long or less
    stepMinutes: number;
    maxSteps: number;
}

export interface TaskCheckResult
{
    isBig: boolean;
    // Smaller steps that together finish the task, when it's big
    steps: string[];
    // A kinder way to say it, when it's worded harshly
    gentlerName: string | null;
}

export const gentleHelperApi = {
    GetStatus: () => RequestJson<{ isAvailable: boolean }>('GET', '/status'),
    // For a new task, as it's added: is it big for the player today, and is it worded kindly?
    CheckTask: (request: TaskHelperRequest) => RequestJson<TaskCheckResult>('POST', '/check-task', request),
    // When the player asks for smaller steps (the "smaller" button)
    SuggestSmallerSteps: (request: TaskHelperRequest) => RequestJson<{ steps: string[] }>('POST', '/smaller-steps', request)
};

async function RequestJson<ResponseType> (method: string, path: string, body?: unknown): Promise<ResponseType>
{
    let response: Response;

    try
    {
        response = await fetch(`${helperBasePath}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    }
    catch
    {
        throw new Error("Can't reach the game server");
    }

    const data: unknown = await response.json().catch(() => ({}));

    if (!response.ok)
    {
        const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
            ? data.error
            : "The helper isn't available right now";

        throw new Error(message);
    }

    return data as ResponseType;
}
