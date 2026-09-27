import { EventBus, GameEvents } from '../EventBus';

const msPerMinute = 60 * 1000;
const msPerDay = 24 * 60 * msPerMinute;
// Passing time (see PassTime) moves in steps this long, so nothing scheduled for a time of day gets skipped over
const passTimeStepMs = 10 * msPerMinute;
// Only used in development, so the debug menu's time travel survives reloads
const debugOffsetStorageKey = 'island-debug-clock-offset';

// The game's idea of "now". It's the real time, except that the debug menu can move it forward a few days or set
// the time of day, to try out new days, evenings and nights. Everything about days (stars, check-ins, the day and
// night lighting) reads the time from here instead of from Date.now().
class GameClock
{
    private offsetMs = 0;

    constructor ()
    {
        if (import.meta.env.DEV)
        {
            this.offsetMs = LoadDebugOffset();
        }
    }

    Now (): number
    {
        return Date.now() + this.offsetMs;
    }

    GetDate (): Date
    {
        return new Date(this.Now());
    }

    // Today (or the day of the given time) as "YYYY-MM-DD" in the player's own time zone
    GetDayKey (time = this.Now()): string
    {
        const date = new Date(time);

        return `${date.getFullYear()}-${Pad(date.getMonth() + 1)}-${Pad(date.getDate())}`;
    }

    // e.g. 13.5 at half past one in the afternoon
    GetHourOfDay (): number
    {
        const date = this.GetDate();

        return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    }

    GetMinutesIntoDay (): number
    {
        const date = this.GetDate();

        return date.getHours() * 60 + date.getMinutes();
    }

    // How long until midnight, in real milliseconds
    GetMsUntilEndOfDay (): number
    {
        const endOfDay = this.GetDate();

        endOfDay.setHours(24, 0, 0, 0);

        return endOfDay.getTime() - this.Now();
    }

    // --- Debug time travel ---

    // Jumps ahead at once, as if the game was closed meanwhile (the days in between count as missed)
    SkipDays (days: number)
    {
        this.SetOffset(this.offsetMs + days * msPerDay);
    }

    // Moves the clock forward bit by bit, as if the game stayed open, so whatever happens as time passes (evening
    // offers, night, a new day) happens along the way. shouldStop is checked after every step; returns true if it got
    // all the way.
    PassTime (durationMs: number, shouldStop: () => boolean): boolean
    {
        let remainingMs = durationMs;

        while (remainingMs > 0)
        {
            const stepMs = Math.min(passTimeStepMs, remainingMs);

            remainingMs -= stepMs;
            this.SetOffset(this.offsetMs + stepMs);

            if (shouldStop())
            {
                return false;
            }
        }

        return true;
    }

    // How long until the clock next shows this time of day (a whole day when it shows it now)
    GetMsUntilNextTimeOfDay (hours: number, minutes: number): number
    {
        const now = this.Now();
        const target = new Date(now);

        target.setHours(hours, minutes, 0, 0);

        if (target.getTime() <= now)
        {
            target.setDate(target.getDate() + 1);
        }

        return target.getTime() - now;
    }

    // Keeps the same day and moves to this time on it
    SetTimeOfDay (hours: number, minutes: number)
    {
        const target = this.GetDate();

        target.setHours(hours, minutes, 0, 0);
        this.SetOffset(this.offsetMs + target.getTime() - this.Now());
    }

    // Back to the real time
    ResetToRealTime ()
    {
        this.SetOffset(0);
    }

    IsTimeTravelling (): boolean
    {
        return this.offsetMs !== 0;
    }

    private SetOffset (offsetMs: number)
    {
        this.offsetMs = offsetMs;
        SaveDebugOffset(offsetMs);
        EventBus.emit(GameEvents.ClockChanged);
    }
}

// The number of whole days from one day key to a later one ("2025-01-01" to "2025-01-04" is 3)
export function GetDaysBetween (fromDayKey: string, toDayKey: string): number
{
    const from = ParseDayKey(fromDayKey);
    const to = ParseDayKey(toDayKey);

    // Rounded, since a day with a daylight saving change is an hour longer or shorter
    return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

function ParseDayKey (dayKey: string): Date
{
    const [ year, month, day ] = dayKey.split('-').map(Number);

    return new Date(year, month - 1, day);
}

function Pad (value: number): string
{
    return String(value).padStart(2, '0');
}

function LoadDebugOffset (): number
{
    try
    {
        const offset = Number(localStorage.getItem(debugOffsetStorageKey));

        return Number.isFinite(offset) ? offset : 0;
    }
    catch
    {
        return 0;
    }
}

function SaveDebugOffset (offsetMs: number)
{
    if (!import.meta.env.DEV)
    {
        return;
    }

    try
    {
        localStorage.setItem(debugOffsetStorageKey, String(offsetMs));
    }
    catch
    {
        // Storage can be blocked; the time travel then just lasts until the page reloads
    }
}

export const gameClock = new GameClock();
