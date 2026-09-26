// Small text formatters shared across the UI

// e.g. "just now", "5m ago", "3h ago", "2d ago"
export function FormatTimeAgo (elapsedMs: number): string
{
    const minutes = Math.floor(elapsedMs / 60000);

    if (minutes < 1)
    {
        return 'just now';
    }

    if (minutes < 60)
    {
        return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);

    return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

// e.g. "12 min left"
export function FormatMinutesLeft (remainingMs: number): string
{
    return `${Math.max(1, Math.ceil(remainingMs / 60000))} min left`;
}

// A coin boost as a multiplier, e.g. 20 → "×1.2"
export function FormatBoostMultiplier (percent: number): string
{
    return `×${Number((1 + percent / 100).toFixed(2))}`;
}

// e.g. 1 → "1 friend", 3 → "3 friends"
export function Pluralize (count: number, singular: string, plural = `${singular}s`): string
{
    return `${count} ${count === 1 ? singular : plural}`;
}
