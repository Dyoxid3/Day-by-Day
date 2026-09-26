import { EventBus, GameEvents, type EncourageRequestedPayload } from '../game/EventBus';
import { onlineSession, RequestToast } from '../online/OnlineSession';
import { CreateAvatar } from './UiAvatar';
import { ShakeElement } from './UiAnimations';
import './EncouragePrompt.css';

// Ready-made messages to pick from; the first is used if nothing is picked or typed
const presetMessages = [
    "You've got this! 💪",
    'Proud of you! 🌟',
    'One step at a time 🐾',
    'Sending good vibes ☀️',
    'Keep that streak going! 🔥'
];
const messageMaxLength = 120;

// Asks what to send a friend as encouragement. Sending gives them a coin boost.
export class EncouragePrompt
{
    private overlayElement: HTMLDivElement;
    private formElement: HTMLFormElement;
    private avatarSlot: HTMLDivElement;
    private titleElement: HTMLHeadingElement;
    private subtitleElement: HTMLParagraphElement;
    private presetButtons: HTMLButtonElement[] = [];
    private messageInput: HTMLInputElement;
    private sendButton: HTMLButtonElement;
    private errorElement: HTMLParagraphElement;
    private friendUsername = '';
    private focusBeforeOpening: HTMLElement | null = null;

    constructor (container: HTMLElement)
    {
        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'encourage-overlay';
        this.overlayElement.addEventListener('click', event => {
            if (event.target === this.overlayElement)
            {
                this.Close();
            }
        });
        this.overlayElement.addEventListener('keydown', event => {
            // Typing a message shouldn't trigger the game's keyboard shortcuts
            event.stopPropagation();

            if (event.key === 'Escape')
            {
                this.Close();
            }
        });

        this.formElement = document.createElement('form');
        this.formElement.className = 'encourage-prompt';
        this.formElement.noValidate = true;
        this.formElement.tabIndex = -1;
        this.formElement.setAttribute('role', 'dialog');
        this.formElement.setAttribute('aria-modal', 'true');
        this.formElement.addEventListener('submit', event => {
            event.preventDefault();
            this.Send();
        });

        const headerElement = document.createElement('div');
        headerElement.className = 'encourage-header';

        this.avatarSlot = document.createElement('div');

        const headingText = document.createElement('div');
        this.titleElement = document.createElement('h3');
        this.titleElement.className = 'encourage-title';
        this.subtitleElement = document.createElement('p');
        this.subtitleElement.className = 'encourage-subtitle';
        headingText.append(this.titleElement, this.subtitleElement);
        headerElement.append(this.avatarSlot, headingText);

        const presetsElement = document.createElement('div');
        presetsElement.className = 'encourage-presets';

        for (const message of presetMessages)
        {
            const presetButton = document.createElement('button');
            presetButton.type = 'button';
            presetButton.className = 'encourage-preset';
            presetButton.textContent = message;
            presetButton.addEventListener('click', () => this.PickPreset(presetButton, message));
            this.presetButtons.push(presetButton);
            presetsElement.append(presetButton);
        }

        this.messageInput = document.createElement('input');
        this.messageInput.type = 'text';
        this.messageInput.className = 'encourage-input';
        this.messageInput.maxLength = messageMaxLength;
        this.messageInput.placeholder = 'Or write your own…';
        this.messageInput.setAttribute('aria-label', 'Message');
        // Typing your own message un-picks the presets
        this.messageInput.addEventListener('input', () => this.HighlightPreset(null));

        const noteElement = document.createElement('p');
        noteElement.className = 'encourage-note';
        noteElement.textContent = '💰 Encouragement gives your friend a coin boost, and you get one too if they reply.';

        this.errorElement = document.createElement('p');
        this.errorElement.className = 'encourage-error';
        this.errorElement.setAttribute('role', 'alert');

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'encourage-button is-subtle';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => this.Close());

        this.sendButton = document.createElement('button');
        this.sendButton.type = 'submit';
        this.sendButton.className = 'encourage-button is-primary';
        this.sendButton.textContent = 'Send 💌';

        const buttonRow = document.createElement('div');
        buttonRow.className = 'encourage-buttons';
        buttonRow.append(cancelButton, this.sendButton);

        this.formElement.append(headerElement, presetsElement, this.messageInput, noteElement, this.errorElement, buttonRow);
        this.overlayElement.append(this.formElement);
        container.append(this.overlayElement);

        EventBus.on(GameEvents.EncourageRequested, (payload: EncourageRequestedPayload) => this.Open(payload.username));
    }

    Open (friendUsername: string)
    {
        const friend = onlineSession.GetFriend(friendUsername);

        this.friendUsername = friend?.username ?? friendUsername;
        this.focusBeforeOpening = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        this.avatarSlot.replaceChildren(CreateAvatar(this.friendUsername, 'large', friend?.isOnline));
        this.titleElement.textContent = `Cheer on ${this.friendUsername}`;
        this.subtitleElement.textContent = friend
            ? `🔥 ${friend.streakDays}-day streak · ${friend.progressPercent}% done today`
            : '';
        this.messageInput.value = '';
        this.errorElement.textContent = '';
        this.sendButton.disabled = false;
        this.PickPreset(this.presetButtons[0], presetMessages[0]);

        this.overlayElement.classList.add('is-open');
        this.presetButtons[0].focus();
    }

    Close ()
    {
        if (!this.overlayElement.classList.contains('is-open'))
        {
            return;
        }

        this.overlayElement.classList.remove('is-open');
        this.focusBeforeOpening?.focus({ preventScroll: true });
        this.focusBeforeOpening = null;
    }

    private PickPreset (presetButton: HTMLButtonElement, message: string)
    {
        this.messageInput.value = '';
        this.messageInput.placeholder = message;
        this.HighlightPreset(presetButton);
    }

    private HighlightPreset (pickedButton: HTMLButtonElement | null)
    {
        for (const presetButton of this.presetButtons)
        {
            presetButton.classList.toggle('is-picked', presetButton === pickedButton);
        }

        if (!pickedButton)
        {
            this.messageInput.placeholder = 'Or write your own…';
        }
    }

    private GetMessage (): string
    {
        const typedMessage = this.messageInput.value.trim();

        if (typedMessage)
        {
            return typedMessage;
        }

        const pickedButton = this.presetButtons.find(presetButton => presetButton.classList.contains('is-picked'));

        return pickedButton?.textContent ?? presetMessages[0];
    }

    private async Send ()
    {
        const friendUsername = this.friendUsername;
        const message = this.GetMessage();

        this.sendButton.disabled = true;
        this.sendButton.textContent = 'Sending…';
        this.errorElement.textContent = '';

        try
        {
            const result = await onlineSession.EncourageFriend(friendUsername, message);

            this.Close();
            RequestToast('💌', `Sent to ${friendUsername}!`, `They get +${result.boostPercent}% coins for ${result.boostMinutes} min.`, 'reward');
        }
        catch (error)
        {
            this.errorElement.textContent = error instanceof Error ? error.message : 'Something went wrong';
            ShakeElement(this.formElement);
        }
        finally
        {
            this.sendButton.disabled = false;
            this.sendButton.textContent = 'Send 💌';
        }
    }
}
