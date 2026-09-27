import { EventBus, GameEvents, type EncourageRequestedPayload } from '../game/EventBus';
import { encouragementSettings } from '../game/data/DaySettings';
import { playerStars } from '../game/state/Stars';
import { playerWallet } from '../game/state/Wallet';
import { onlineSession, RequestToast } from '../online/OnlineSession';
import type { GiftOffer } from '../online/OnlineTypes';
import { CreateAvatar } from './UiAvatar';
import { ShakeElement } from './UiAnimations';
import { uiAssets } from './UiAssets';
import { DescribeGiftItems } from './NotificationText';
import { Pluralize } from './UiFormat';
import './EncouragePrompt.css';

const messageMaxLength = 120;
// Coin boost a friend gets for the rest of their day once they reach the goal (the server decides; this is for the note)
const boostPercentForNote = 10;

// A number the player picks with - and + buttons or by typing, from 0 up to what they have
interface AmountPicker
{
    element: HTMLElement;
    input: HTMLInputElement;
    SetMax: (max: number) => void;
    GetValue: () => number;
}

// Writing a friend some encouragement. The player can send some of their own coins and stars along with it, which the
// friend receives once they finish a chosen share of their day (and which come back if they don't). Reaching that
// goal also boosts the friend's coins for the rest of the day, even with no gift.
export class EncouragePrompt
{
    private overlayElement: HTMLDivElement;
    private formElement: HTMLFormElement;
    private avatarSlot: HTMLDivElement;
    private titleElement: HTMLHeadingElement;
    private subtitleElement: HTMLParagraphElement;
    private messageInput: HTMLTextAreaElement;
    private coinPicker: AmountPicker;
    private starPicker: AmountPicker;
    private goalInput: HTMLInputElement;
    private goalValueElement: HTMLSpanElement;
    private noteElement: HTMLParagraphElement;
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

        this.messageInput = document.createElement('textarea');
        this.messageInput.className = 'encourage-input';
        this.messageInput.maxLength = messageMaxLength;
        this.messageInput.rows = 3;
        this.messageInput.placeholder = 'Leave a thoughtful message';
        this.messageInput.setAttribute('aria-label', 'Message');

        this.coinPicker = CreateAmountPicker('Coins', uiAssets.coin, () => this.UpdateNote());
        this.starPicker = CreateAmountPicker('Stars', uiAssets.star, () => this.UpdateNote());

        const settings = encouragementSettings;

        this.goalInput = document.createElement('input');
        this.goalInput.type = 'range';
        this.goalInput.className = 'encourage-goal-slider';
        this.goalInput.min = String(settings.minGoalPercent);
        this.goalInput.max = String(settings.maxGoalPercent);
        this.goalInput.step = String(settings.goalPercentStep);
        this.goalInput.setAttribute('aria-label', 'Share of their day to finish');
        this.goalInput.addEventListener('input', () => this.UpdateNote());

        this.goalValueElement = document.createElement('span');
        this.goalValueElement.className = 'encourage-goal-value';

        const goalLabel = document.createElement('span');
        goalLabel.className = 'encourage-gift-label';
        goalLabel.textContent = 'Goal';

        const goalRow = document.createElement('div');
        goalRow.className = 'encourage-gift-row';
        goalRow.append(goalLabel, this.goalInput, this.goalValueElement);

        const giftTitle = document.createElement('legend');
        giftTitle.className = 'encourage-gift-title';
        giftTitle.textContent = 'Send a gift too (optional)';

        const giftElement = document.createElement('fieldset');
        giftElement.className = 'encourage-gift';
        giftElement.append(giftTitle, this.coinPicker.element, this.starPicker.element, goalRow);

        this.noteElement = document.createElement('p');
        this.noteElement.className = 'encourage-note';

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
        this.sendButton.textContent = 'Send';

        const buttonRow = document.createElement('div');
        buttonRow.className = 'encourage-buttons';
        buttonRow.append(cancelButton, this.sendButton);

        this.formElement.append(headerElement, this.messageInput, giftElement, this.noteElement, this.errorElement, buttonRow);
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
        this.titleElement.textContent = `Encourage ${this.friendUsername}`;
        this.subtitleElement.textContent = friend
            ? `${Pluralize(friend.stars, 'star')} - ${Pluralize(friend.comebacks, 'comeback')} - ${friend.progressPercent}% done today`
            : '';
        this.messageInput.value = '';
        this.coinPicker.SetMax(playerWallet.GetCoins());
        this.starPicker.SetMax(playerStars.GetStars());
        this.goalInput.value = String(encouragementSettings.defaultGoalPercent);
        this.errorElement.textContent = '';
        this.sendButton.disabled = false;
        this.UpdateNote();

        this.overlayElement.classList.add('is-open');
        this.messageInput.focus();
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

    private GetGift (): GiftOffer
    {
        return {
            coins: this.coinPicker.GetValue(),
            stars: this.starPicker.GetValue(),
            goalPercent: Number(this.goalInput.value)
        };
    }

    // Explains what the friend gets and when, as the gift changes
    private UpdateNote ()
    {
        const gift = this.GetGift();
        const giftText = gift.coins > 0 || gift.stars > 0 ? `${DescribeGiftItems(gift)} and ` : '';

        this.goalValueElement.textContent = `${gift.goalPercent}%`;
        this.noteElement.textContent = `Once they finish ${gift.goalPercent}% of their day, they receive ${giftText}`
            + `${boostPercentForNote}% more coins for the rest of it.`
            + (giftText ? ' If they don\'t reach it, your gift comes back to you.' : '');
    }

    private async Send ()
    {
        const friendUsername = this.friendUsername;
        const message = this.messageInput.value.trim();
        const gift = this.GetGift();

        if (message === '')
        {
            ShakeElement(this.messageInput);
            this.messageInput.focus();
            return;
        }

        // The gift leaves the player's wallet now, and comes back if sending fails
        if (!this.TakeGiftFromWallet(gift))
        {
            this.errorElement.textContent = "You don't have that many to give";
            ShakeElement(this.formElement);
            return;
        }

        this.sendButton.disabled = true;
        this.sendButton.textContent = 'Sending...';
        this.errorElement.textContent = '';

        try
        {
            const result = await onlineSession.EncourageFriend(friendUsername, message, gift);

            this.Close();
            RequestToast(`Sent to ${friendUsername}`, `They'll receive it once they finish ${result.goalPercent}% of their day.`, 'reward', false, 'star');
        }
        catch (error)
        {
            playerWallet.AddCoins(gift.coins);
            playerStars.RefundStars(gift.stars);
            this.coinPicker.SetMax(playerWallet.GetCoins());
            this.starPicker.SetMax(playerStars.GetStars());
            this.errorElement.textContent = error instanceof Error ? error.message : 'Something went wrong';
            ShakeElement(this.formElement);
        }
        finally
        {
            this.sendButton.disabled = false;
            this.sendButton.textContent = 'Send';
        }
    }

    private TakeGiftFromWallet (gift: GiftOffer): boolean
    {
        if (gift.coins > 0 && !playerWallet.TrySpendCoins(gift.coins))
        {
            return false;
        }

        if (gift.stars > 0 && !playerStars.TrySpendStars(gift.stars))
        {
            playerWallet.AddCoins(gift.coins);
            return false;
        }

        return true;
    }
}

function CreateAmountPicker (label: string, iconSource: string, onChange: () => void): AmountPicker
{
    let max = 0;

    const row = document.createElement('div');
    row.className = 'encourage-gift-row';

    const icon = document.createElement('img');
    icon.className = 'encourage-gift-icon';
    icon.src = iconSource;
    icon.alt = '';
    icon.draggable = false;

    const labelElement = document.createElement('span');
    labelElement.className = 'encourage-gift-label';
    labelElement.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'encourage-amount-input';
    input.min = '0';
    input.step = '1';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', `${label} to send`);

    const maxElement = document.createElement('span');
    maxElement.className = 'encourage-amount-max';

    const Clamp = (value: number) => Math.min(max, Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));
    const SetValue = (value: number) => {
        input.value = String(Clamp(value));
        onChange();
    };

    const lessButton = CreateStepButton('-', `Fewer ${label.toLowerCase()}`, () => SetValue(Number(input.value) - 1));
    const moreButton = CreateStepButton('+', `More ${label.toLowerCase()}`, () => SetValue(Number(input.value) + 1));

    input.addEventListener('change', () => SetValue(Number(input.value)));
    input.addEventListener('input', onChange);

    row.append(icon, labelElement, lessButton, input, moreButton, maxElement);

    return {
        element: row,
        input,
        SetMax: (newMax: number) => {
            max = Math.max(0, newMax);
            input.max = String(max);
            maxElement.textContent = `of ${max}`;
            SetValue(0);
        },
        GetValue: () => Clamp(Number(input.value))
    };
}

function CreateStepButton (text: string, label: string, onClick: () => void): HTMLButtonElement
{
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'encourage-step-button pixel-circle';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', onClick);

    return button;
}
