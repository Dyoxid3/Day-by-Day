// Keeps key presses typed into text fields inside this element from reaching the game's keyboard shortcuts
// (Phaser listens on the window, so stopping the event on its way up is enough)
export function KeepTypingFromGame (element: HTMLElement)
{
    element.addEventListener('keydown', event => {
        const target = event.target;

        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
        {
            event.stopPropagation();
        }
    });
}
