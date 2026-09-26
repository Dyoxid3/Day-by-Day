// Small effects shared by several parts of the UI

// Quick side-to-side shake, e.g. for an item you can't afford or a form field that still needs filling in
export function ShakeElement (element: HTMLElement)
{
    element.animate(
        [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' },
            { transform: 'translateX(-4px)' },
            { transform: 'translateX(0)' }
        ],
        { duration: 300, easing: 'ease-out' }
    );
}
