// True on phones and tablets, where the main way to point is a finger (no mouse hover, no right-click)
export function IsTouchScreen (): boolean
{
    return window.matchMedia('(pointer: coarse)').matches;
}
