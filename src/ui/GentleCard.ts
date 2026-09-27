import './GentleCard.css';

// A breather between one card sequence and the next, so they never arrive back to back
const pauseBetweenSequencesMs = 4000;

export interface GentleCardButton
{
    label: string;
    isPrimary?: boolean;
    onClick: () => void;
}

export interface GentleCardContent
{
    title: string;
    text?: string;
    // Anything extra between the text and the buttons, like choices or a list
    body?: HTMLElement;
    buttons: GentleCardButton[];
}

// One or more cards shown in a row; call finish once the last one is done
export type GentleCardSequence = (card: GentleCard, finish: () => void) => void;

// A calm card in the middle of the screen for the day's check-in, evening offers and other moments that deserve a
// pause. Sequences wait their turn, so two never show at once.
export class GentleCard
{
    private overlayElement: HTMLDivElement;
    private cardElement: HTMLDivElement;
    private titleElement: HTMLHeadingElement;
    private textElement: HTMLParagraphElement;
    private bodySlot: HTMLDivElement;
    private buttonRow: HTMLDivElement;
    private queue: { sequence: GentleCardSequence, shouldPauseBefore: boolean }[] = [];
    private isRunning = false;

    constructor (container: HTMLElement)
    {
        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'gentle-card-overlay';
        // Typing in the card shouldn't trigger the game's keyboard shortcuts
        this.overlayElement.addEventListener('keydown', event => event.stopPropagation());

        this.cardElement = document.createElement('div');
        this.cardElement.className = 'gentle-card';
        this.cardElement.setAttribute('role', 'dialog');
        this.cardElement.setAttribute('aria-modal', 'true');

        this.titleElement = document.createElement('h3');
        this.titleElement.className = 'gentle-card-title';

        this.textElement = document.createElement('p');
        this.textElement.className = 'gentle-card-text';

        this.bodySlot = document.createElement('div');
        this.bodySlot.className = 'gentle-card-body';

        this.buttonRow = document.createElement('div');
        this.buttonRow.className = 'gentle-card-buttons';

        this.cardElement.append(this.titleElement, this.textElement, this.bodySlot, this.buttonRow);
        this.overlayElement.append(this.cardElement);
        container.append(this.overlayElement);
    }

    // Runs after any sequences already waiting. Normally there's a short breather before it if another sequence just
    // finished; shouldPauseBefore = false follows straight on instead (like the day's check-in after logging in).
    Enqueue (sequence: GentleCardSequence, shouldPauseBefore = true)
    {
        this.queue.push({ sequence, shouldPauseBefore });

        if (!this.isRunning)
        {
            this.RunNext();
        }
    }

    // Shows a card, replacing the one on screen
    Show (content: GentleCardContent)
    {
        const wasOpen = this.overlayElement.classList.contains('is-open');

        this.titleElement.textContent = content.title;
        this.textElement.textContent = content.text ?? '';
        this.textElement.hidden = !content.text;
        this.bodySlot.replaceChildren(...(content.body ? [ content.body ] : []));
        this.buttonRow.replaceChildren(...content.buttons.map(CreateButton));
        this.overlayElement.classList.add('is-open');

        // A soft change from one card to the next
        if (wasOpen)
        {
            this.cardElement.animate(
                [ { opacity: 0.4, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' } ],
                { duration: 220, easing: 'ease-out' }
            );
        }

        this.buttonRow.querySelector<HTMLButtonElement>('.is-primary')?.focus({ preventScroll: true });
    }

    // isAfterAnother: a sequence just finished, so the next one waits a moment rather than following straight on
    private RunNext (isAfterAnother = false)
    {
        const next = this.queue.shift();

        if (!next)
        {
            this.isRunning = false;
            this.overlayElement.classList.remove('is-open');
            return;
        }

        this.isRunning = true;

        if (isAfterAnother && next.shouldPauseBefore)
        {
            this.overlayElement.classList.remove('is-open');
            window.setTimeout(() => this.Start(next.sequence), pauseBetweenSequencesMs);
            return;
        }

        this.Start(next.sequence);
    }

    private Start (sequence: GentleCardSequence)
    {
        let hasFinished = false;

        sequence(this, () => {
            // Only the first call counts, in case a button is pressed twice
            if (!hasFinished)
            {
                hasFinished = true;
                this.RunNext(true);
            }
        });
    }
}

function CreateButton (buttonDetails: GentleCardButton): HTMLButtonElement
{
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `gentle-card-button pixel-pill${buttonDetails.isPrimary ? ' is-primary' : ''}`;
    button.textContent = buttonDetails.label;
    button.addEventListener('click', buttonDetails.onClick);

    return button;
}
