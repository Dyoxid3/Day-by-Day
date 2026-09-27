// The gentle helpers: small requests to Google Gemini for suggesting smaller steps for a big task and a kinder name
// for a harsh one. It runs inside the Vite dev server (see vite/config.dev.mjs), so the
// API key stays on this computer and never reaches the browser.
// The key comes from GEMINI_API_KEY in .env.local (which git ignores), or the host's settings when the game is hosted
// (see server/ProductionServer.mjs). GEMINI_MODEL can pick a different model.
// The game only asks for these when the player has turned the gentle helpers on in their profile.

import { ApiError, ReadJsonBody, SendJson } from './OnlinePrototypeServer.mjs';

const helperSettings = {
    // A quick, low-cost model is plenty for short suggestions. If it isn't available, the fallback is tried.
    defaultModel: 'gemini-3.5-flash-lite',
    fallbackModel: 'gemini-3.8-flash',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    requestTimeoutMs: 20000,
    // A simple limit, so a bug can't run up a bill
    maxRequestsPerMinute: 30,
    maxTaskNameLength: 80,
    // Most steps one task can be split into (the game asks for up to its own taskSplitSettings.maxSteps)
    maxSteps: 8,
    // Longest answers passed back to the game
    maxStepLength: 60,
    maxNameLength: 60
};

// What Gemini is asked. Answers are plain text (parsed below), which keeps the requests simple and dependable.
const prompts = {
    // The player asked for smaller steps (the "smaller" button)
    smallerSteps: task => [
        'You are a gentle helper in a cozy self-care game. The player has a task that feels too big.',
        DescribePlayer(task),
        ...DescribeSteps(task),
        'Reply with only the steps, one per line.',
        '',
        `Task: "${task.taskName}"`
    ].join('\n'),

    // A new task, checked as it's added: is it big for this player today, and is it worded kindly?
    checkTask: task => [
        'You help people plan to-do items in a gentle self-care game.',
        DescribePlayer(task),
        `1. ${DescribeSplitRule(task)}`,
        '2. If it is big, split it into steps.',
        ...DescribeSteps(task),
        '3. Only if the wording is harsh, self-critical or guilt-driven (for example insults, "stop being lazy", "no',
        'excuses", "you idiot"), suggest a kinder wording with the same goal, under 50 characters. Plain, neutral tasks',
        'like "run for an hour" or "do the dishes" are not harsh: write KEEP for them, and never change a task\'s goal.',
        'Reply in exactly this format and nothing else, with no emojis. Write one STEP line per step, and only when BIG is yes:',
        'BIG: yes or no',
        'NAME: the kinder wording, or KEEP',
        'STEP: first step',
        'STEP: next step',
        '',
        `Task: "${task.taskName}"`
    ].join('\n')
};

const feelings = [ 'good', 'okay', 'bad', 'terrible' ];
const difficulties = [ 'easy', 'medium', 'hard' ];
// When a new task counts as big (see DescribeSplitRule)
const splitRules = [ 'rated-hard', 'sounds-hard' ];

// Vite plugin that serves the gentle helpers at /ai
export function GentleHelperServer ({ apiKey, model } = {})
{
    let helper;

    const MountHelper = server => {
        helper ??= new GentleHelper(apiKey, model);
        server.middlewares.use('/ai', (request, response) => helper.HandleRequest(request, response));
        server.config.logger.info(apiKey
            ? `  [gentle helpers] On, using ${model || helperSettings.defaultModel}`
            : '  [gentle helpers] Off: add GEMINI_API_KEY to .env.local (or the host\'s settings) to turn them on');
    };

    return {
        name: 'gentle-helper-server',
        configureServer: MountHelper,
        configurePreviewServer: MountHelper
    };
}

class GentleHelper
{
    constructor (apiKey, model)
    {
        this.apiKey = apiKey || '';
        this.models = [ ...new Set([ model || helperSettings.defaultModel, helperSettings.fallbackModel ]) ];
        this.recentRequestTimes = [];
        this.routes = [
            [ 'GET', '/status', this.GetStatus ],
            [ 'POST', '/smaller-steps', this.SuggestSmallerSteps ],
            [ 'POST', '/check-task', this.CheckTask ]
        ];
    }

    async HandleRequest (request, response)
    {
        try
        {
            const path = new URL(request.url ?? '/', 'http://localhost').pathname;
            const route = this.routes.find(([ method, routePath ]) => method === request.method && routePath === path);

            if (!route)
            {
                throw new ApiError(404, 'Unknown request');
            }

            const body = request.method === 'GET' ? {} : await ReadJsonBody(request);
            const result = await route[2].call(this, body);

            SendJson(response, 200, result);
        }
        catch (error)
        {
            if (error instanceof ApiError)
            {
                SendJson(response, error.status, { error: error.message });
                return;
            }

            console.error('[gentle helpers]', error);
            SendJson(response, 500, { error: 'The helper had a problem' });
        }
    }

    GetStatus ()
    {
        return { isAvailable: this.apiKey !== '' };
    }

    // Smaller steps that together finish a task, when the player asks (the "smaller" button)
    async SuggestSmallerSteps (body)
    {
        const task = this.ReadTask(body);
        const answer = await this.AskGemini(prompts.smallerSteps(task), 0.5);
        const steps = answer
            .split('\n')
            .map(line => CleanLine(line.replace(/^\s*(?:[-*•]|\d+\s*[.):-]|step\s*\d+\s*[.):-]?)\s*/i, '')))
            .filter(line => line.length > 0)
            .slice(0, task.maxSteps)
            .map(step => step.slice(0, helperSettings.maxStepLength));

        if (steps.length < 2)
        {
            throw new ApiError(502, "The helper's answer didn't make sense this time");
        }

        return { steps };
    }

    // A new task, as it's added: whether it's big for the player today (with smaller steps if so), and a kinder name if
    // it's worded harshly (gentlerName is null when it's fine as it is)
    async CheckTask (body)
    {
        const task = this.ReadTask(body);
        const answer = await this.AskGemini(prompts.checkTask(task), 0.3);
        const lines = answer.split('\n').map(line => line.trim());
        const ReadField = fieldName => lines.find(line => new RegExp(`^${fieldName}\\s*:`, 'i').test(line))?.replace(/^[^:]*:/, '') ?? '';
        const saysBig = /\byes\b/i.test(ReadField('big'));
        const steps = lines
            .filter(line => /^step\s*\d*\s*:/i.test(line))
            .map(line => CleanLine(line.replace(/^[^:]*:/, '')))
            .filter(step => step.length > 0)
            .slice(0, task.maxSteps)
            .map(step => step.slice(0, helperSettings.maxStepLength));
        const nameSuggestion = CleanLine(ReadField('name')).slice(0, helperSettings.maxNameLength);
        const isBig = saysBig && steps.length >= 2;
        const hasKinderName = nameSuggestion !== ''
            && !/^keep\b/i.test(nameSuggestion)
            && nameSuggestion.toLowerCase() !== task.taskName.toLowerCase();

        return { isBig, steps: isBig ? steps : [], gentlerName: hasKinderName ? nameSuggestion : null };
    }

    // The task and what the game knows about the player today, in expected shapes and sizes
    ReadTask (body)
    {
        const taskName = String(body.taskName ?? '').replace(/\s+/g, ' ').trim().slice(0, helperSettings.maxTaskNameLength);

        if (taskName === '')
        {
            throw new ApiError(400, 'Which task?');
        }

        return {
            taskName,
            difficulty: difficulties.includes(body.difficulty) ? body.difficulty : 'medium',
            feeling: feelings.includes(body.feeling) ? body.feeling : null,
            splitRule: splitRules.includes(body.splitRule) ? body.splitRule : 'sounds-hard',
            bigTaskMinutes: Math.min(240, Math.max(1, ClampCount(body.bigTaskMinutes) || 30)),
            stepMinutes: Math.min(120, Math.max(1, ClampCount(body.stepMinutes) || 20)),
            maxSteps: Math.min(helperSettings.maxSteps, Math.max(2, ClampCount(body.maxSteps) || 6))
        };
    }

    // Sends a prompt to Gemini and returns its text answer
    async AskGemini (prompt, temperature)
    {
        if (!this.apiKey)
        {
            throw new ApiError(503, "The gentle helpers aren't set up on this server (it needs a GEMINI_API_KEY)");
        }

        this.CheckRateLimit();

        for (const [ modelIndex, model ] of this.models.entries())
        {
            let response;

            try
            {
                response = await fetch(`${helperSettings.apiBaseUrl}/${encodeURIComponent(model)}:generateContent`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
                    body: JSON.stringify({
                        contents: [ { role: 'user', parts: [ { text: prompt } ] } ],
                        generationConfig: { temperature }
                    }),
                    signal: AbortSignal.timeout(helperSettings.requestTimeoutMs)
                });
            }
            catch (error)
            {
                console.warn('[gentle helpers] Gemini request failed:', error instanceof Error ? error.message : error);
                throw new ApiError(504, "The helper couldn't be reached. Try again in a moment.");
            }

            // That model isn't available to this key: try the next one
            if (response.status === 404 && modelIndex < this.models.length - 1)
            {
                continue;
            }

            if (!response.ok)
            {
                const details = await response.text().catch(() => '');

                console.warn(`[gentle helpers] Gemini answered ${response.status} (${model}): ${details.slice(0, 300)}`);
                throw new ApiError(response.status === 429 ? 429 : 502, response.status === 429
                    ? 'The helper needs a short rest. Try again in a minute.'
                    : "The helper couldn't answer right now");
            }

            const data = await response.json().catch(() => ({}));
            // Thinking models can include their thoughts as separate parts; only the answer is kept
            const text = (data.candidates?.[0]?.content?.parts ?? [])
                .filter(part => typeof part.text === 'string' && !part.thought)
                .map(part => part.text)
                .join('')
                .trim();

            if (text === '')
            {
                throw new ApiError(502, "The helper didn't have an answer this time");
            }

            return text;
        }

        throw new ApiError(502, "The helper couldn't answer right now");
    }

    CheckRateLimit ()
    {
        const now = Date.now();

        this.recentRequestTimes = this.recentRequestTimes.filter(time => now - time < 60000);

        if (this.recentRequestTimes.length >= helperSettings.maxRequestsPerMinute)
        {
            throw new ApiError(429, 'The helper needs a short rest. Try again in a minute.');
        }

        this.recentRequestTimes.push(now);
    }
}

function ClampCount (value)
{
    const number = Math.round(Number(value));

    return Number.isFinite(number) ? Math.min(1000, Math.max(0, number)) : 0;
}

// The game has no emojis, so none come through from the helper either
function RemoveEmoji (text)
{
    return text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '');
}

// One line of an answer, without formatting, quotes or emojis
function CleanLine (line)
{
    // Trimmed before the quotes come off, since answers like 'NAME: "..."' have a space in front
    return RemoveEmoji(line)
        .replace(/[*_#`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '')
        .trim();
}

// How the player is doing, for the prompts: e.g. "Today the player is feeling bad, and they rated this task hard for them."
function DescribePlayer (task)
{
    const feelingText = task.feeling ? `Today the player is feeling ${task.feeling}` : "The player didn't say how they feel today";

    return `${feelingText}, and they rated this task ${task.difficulty} for them.`;
}

// When the task counts as big: only when the player rated it hard (and it isn't short), or when it sounds hard.
// A short task like "study for 5 minutes" is never big.
function DescribeSplitRule (task)
{
    const shortTasks = 'A short task is never big: one with a short time in it, like "study for 5 minutes" or "walk for '
        + '10 minutes", or a quick one, like "drink a glass of water" or "text mom".';

    if (task.splitRule === 'rated-hard')
    {
        return 'Decide if the task is big for them. They rated it hard, so answer BIG: yes unless it takes about 5 '
            + `minutes or less. ${shortTasks}`;
    }

    return 'Decide if the task sounds hard: a real effort that would take more than '
        + `${task.bigTaskMinutes} minutes, like "run for an hour", "clean the whole house" or "write my essay". `
        + `${shortTasks} If you are unsure, answer BIG: no.`;
}

// How to split a task: steps that finish all of it (not just its start), each small enough for how the player feels
function DescribeSteps (task)
{
    return [
        `Split it into steps they can do one at a time, each taking about ${task.stepMinutes} minutes or less. Use as`,
        `few steps as that allows (a quick task needs only 2 or 3), and never more than ${task.maxSteps}.`,
        'Done in order, the steps must finish the WHOLE task, not just the start of it: together they add up to',
        'everything the task asks. For example, "study for two hours" in 30-minute steps could be "Set out your notes",',
        '"Study for 30 minutes", "Study 30 more minutes", "Study 30 more minutes", "Study the last 30 minutes", and "clean',
        'the kitchen" could be "Wash the dishes", "Wipe the counters", "Sweep the floor".',
        `If the whole task doesn't fit in ${task.maxSteps} steps that size, make the steps a little bigger instead of`,
        'leaving anything out. Make the first step easy to start. Start each step with a verb and keep it under 50',
        'characters. Keep the player\'s own words where you can. No emojis and no numbering.'
    ];
}
