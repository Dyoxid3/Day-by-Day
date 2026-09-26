import { EventBus, GameEvents, type EncourageRequestedPayload } from '../game/EventBus';
import { onlineSession, RequestToast } from '../online/OnlineSession';
import type { OnlineNotification } from '../online/OnlineTypes';
import { CreateAvatar } from './UiAvatar';
import { FormatTimeAgo } from './UiFormat';
import { KeepTypingFromGame } from './UiKeyboard';
import { DescribeNotification } from './NotificationText';
import { SailToFriend } from './FriendRow';
import './NotificationsMenu.css';

// One-click replies to an encouragement
const quickReplies = [ 'Thank you! 💛', 'You too! 💪', "Let's do this! 🔥" ];
const replyMaxLength = 120;

// Drops down beside the bell: encouragement from friends (with replies), friend requests and visits
export class NotificationsMenu
{
    private container: HTMLElement;
    private menuElement: HTMLDivElement;
    private listElement: HTMLDivElement;
    private anchorElement?: HTMLElement;
    private isOpen = false;
    // Unread when the menu opened; they stay highlighted until it closes
    private newNotificationIds = new Set<number>();
    // What the list last showed, so unrelated online updates don't redraw it (and wipe a reply being typed)
    private renderedSignature = '';

    constructor (container: HTMLElement)
    {
        this.container = container;

        this.menuElement = document.createElement('div');
        this.menuElement.className = 'notifications-menu';
        this.menuElement.setAttribute('role', 'dialog');
        this.menuElement.setAttribute('aria-label', 'Notifications');

        const headerElement = document.createElement('div');
        headerElement.className = 'notifications-header';

        const titleElement = document.createElement('h3');
        titleElement.className = 'notifications-title';
        titleElement.textContent = 'Notifications';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'notifications-close';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', 'Close notifications');
        closeButton.addEventListener('click', () => this.Close());

        headerElement.append(titleElement, closeButton);

        this.listElement = document.createElement('div');
        this.listElement.className = 'notifications-list';

        this.menuElement.append(headerElement, this.listElement);
        container.append(this.menuElement);
        KeepTypingFromGame(this.menuElement);

        // Clicking anywhere else closes it (the bell toggles it itself)
        document.addEventListener('pointerdown', event => {
            const target = event.target;

            if (this.isOpen && target instanceof Node && !this.menuElement.contains(target) && !this.anchorElement?.contains(target))
            {
                this.Close();
            }
        });
        window.addEventListener('keydown', event => {
            if (this.isOpen && event.key === 'Escape')
            {
                this.Close();
            }
        });
        window.addEventListener('resize', () => {
            if (this.isOpen)
            {
                this.PositionBesideAnchor();
            }
        });

        EventBus.on(GameEvents.OnlineStateChanged, () => this.RenderIfOpen());
        EventBus.on(GameEvents.AccountChanged, () => this.RenderIfOpen());
        EventBus.on(GameEvents.NotificationsMenuRequested, () => this.Open());
    }

    SetAnchor (anchorElement: HTMLElement)
    {
        this.anchorElement = anchorElement;
    }

    Toggle ()
    {
        if (this.isOpen)
        {
            this.Close();
        }
        else
        {
            this.Open();
        }
    }

    Open ()
    {
        const snapshot = onlineSession.GetSnapshot();

        this.newNotificationIds = new Set(snapshot.notifications.filter(notification => !notification.isRead).map(notification => notification.id));
        this.isOpen = true;
        this.PositionBesideAnchor();
        this.Render();
        this.menuElement.classList.add('is-open');
        onlineSession.MarkNotificationsRead();
    }

    Close ()
    {
        this.isOpen = false;
        this.newNotificationIds.clear();
        this.menuElement.classList.remove('is-open');
    }

    private PositionBesideAnchor ()
    {
        if (!this.anchorElement)
        {
            return;
        }

        const containerBounds = this.container.getBoundingClientRect();
        const anchorBounds = this.anchorElement.getBoundingClientRect();

        this.menuElement.style.left = `${anchorBounds.right - containerBounds.left + 12}px`;
        this.menuElement.style.top = `${anchorBounds.top - containerBounds.top}px`;
    }

    private RenderIfOpen ()
    {
        if (this.isOpen)
        {
            this.Render(false);
        }
    }

    private Render (isForced = true)
    {
        const snapshot = onlineSession.GetSnapshot();
        const signature = JSON.stringify([ snapshot.username, snapshot.notifications.map(notification => [ notification.id, notification.hasReplied ]) ]);

        if (!isForced && signature === this.renderedSignature)
        {
            return;
        }

        this.renderedSignature = signature;

        if (!snapshot.username)
        {
            this.listElement.replaceChildren(this.CreateSignedOutMessage());
            return;
        }

        if (snapshot.notifications.length === 0)
        {
            this.listElement.replaceChildren(CreateMessage('🌱', 'Nothing yet', 'When friends cheer you on or drop by your island, it shows up here.'));
            return;
        }

        this.listElement.replaceChildren(...snapshot.notifications.map(notification => this.CreateNotificationItem(notification)));
    }

    private CreateSignedOutMessage (): HTMLElement
    {
        const message = CreateMessage('💌', 'Get encouragement from friends', 'Make an account to add friends, cheer each other on and visit each other\'s islands.');
        const signUpButton = document.createElement('button');

        signUpButton.type = 'button';
        signUpButton.className = 'notifications-button is-primary';
        signUpButton.textContent = 'Sign up or log in';
        signUpButton.addEventListener('click', () => {
            this.Close();
            EventBus.emit(GameEvents.ProfilePanelRequested);
        });
        message.append(signUpButton);

        return message;
    }

    private CreateNotificationItem (notification: OnlineNotification): HTMLElement
    {
        const description = DescribeNotification(notification);
        const item = document.createElement('div');
        item.className = `notification is-${notification.kind}`;
        item.classList.toggle('is-new', this.newNotificationIds.has(notification.id));

        const avatar = CreateAvatar(notification.fromUsername, 'medium');
        const iconBadge = document.createElement('span');
        iconBadge.className = 'notification-icon';
        iconBadge.textContent = description.icon;
        avatar.append(iconBadge);

        const body = document.createElement('div');
        body.className = 'notification-body';

        const titleElement = document.createElement('p');
        titleElement.className = 'notification-title';
        const nameElement = document.createElement('strong');
        nameElement.textContent = notification.fromUsername;
        titleElement.append(nameElement, ` ${description.action}`);
        body.append(titleElement);

        if (notification.message)
        {
            const messageElement = document.createElement('p');
            messageElement.className = 'notification-message';
            messageElement.textContent = `“${notification.message}”`;
            body.append(messageElement);
        }

        const metaElement = document.createElement('p');
        metaElement.className = 'notification-meta';

        if (notification.boostPercent > 0)
        {
            const boostTag = document.createElement('span');
            boostTag.className = 'notification-boost';
            boostTag.textContent = `+${notification.boostPercent}% coins`;
            metaElement.append(boostTag, ' · ');
        }

        metaElement.append(FormatTimeAgo(onlineSession.GetServerNow() - notification.createdAt));
        body.append(metaElement);

        if (notification.kind === 'encouragement')
        {
            body.append(notification.hasReplied ? CreateRepliedNote() : this.CreateReplyControls(notification));
        }
        else if (notification.kind === 'friend-added' || notification.kind === 'visit')
        {
            body.append(this.CreateFollowUpButton(notification));
        }

        item.append(avatar, body);

        return item;
    }

    // A quick way to respond: say hi to a new friend, or visit back someone who dropped by
    private CreateFollowUpButton (notification: OnlineNotification): HTMLElement
    {
        const actions = document.createElement('div');
        actions.className = 'notification-reply-chips notification-follow-up';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'notification-reply-chip';

        if (notification.kind === 'visit')
        {
            const isThereAlready = onlineSession.GetVisitingUsername()?.toLowerCase() === notification.fromUsername.toLowerCase();

            button.textContent = isThereAlready ? "📍 You're on their island" : '⛵ Visit back';
            button.disabled = isThereAlready;
            button.addEventListener('click', () => SailToFriend(notification.fromUsername, () => this.Close()));
        }
        else
        {
            button.textContent = '💌 Say hi';
            button.addEventListener('click', () => {
                const payload: EncourageRequestedPayload = { username: notification.fromUsername };

                this.Close();
                EventBus.emit(GameEvents.EncourageRequested, payload);
            });
        }

        actions.append(button);

        return actions;
    }

    // Quick replies plus a box to write your own. Replying gives the friend who sent it a coin boost.
    private CreateReplyControls (notification: OnlineNotification): HTMLElement
    {
        const controls = document.createElement('div');
        controls.className = 'notification-replies';

        const chips = document.createElement('div');
        chips.className = 'notification-reply-chips';

        const form = document.createElement('form');
        form.className = 'notification-reply-form';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'notification-reply-input';
        input.maxLength = replyMaxLength;
        input.placeholder = 'Write a reply…';
        input.setAttribute('aria-label', `Reply to ${notification.fromUsername}`);

        const sendButton = document.createElement('button');
        sendButton.type = 'submit';
        sendButton.className = 'notification-reply-send';
        sendButton.textContent = 'Send';

        form.append(input, sendButton);

        const SendReply = async (message: string) => {
            if (message.trim() === '')
            {
                input.focus();
                return;
            }

            controls.classList.add('is-sending');

            for (const control of controls.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input'))
            {
                control.disabled = true;
            }

            try
            {
                const result = await onlineSession.ReplyToNotification(notification.id, message.trim());

                RequestToast('💛', `Reply sent to ${notification.fromUsername}`, `They get +${result.boostPercent}% coins for ${result.boostMinutes} min.`, 'reward');
            }
            catch (error)
            {
                controls.classList.remove('is-sending');

                for (const control of controls.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input'))
                {
                    control.disabled = false;
                }

                RequestToast('⚠️', "Couldn't send your reply", error instanceof Error ? error.message : undefined, 'error');
            }
        };

        for (const reply of quickReplies)
        {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'notification-reply-chip';
            chip.textContent = reply;
            chip.addEventListener('click', () => SendReply(reply));
            chips.append(chip);
        }

        form.addEventListener('submit', event => {
            event.preventDefault();
            SendReply(input.value);
        });

        controls.append(chips, form);

        return controls;
    }
}

function CreateRepliedNote (): HTMLElement
{
    const note = document.createElement('p');
    note.className = 'notification-replied';
    note.textContent = '✓ You replied';

    return note;
}

function CreateMessage (icon: string, title: string, text: string): HTMLDivElement
{
    const message = document.createElement('div');
    message.className = 'notifications-empty';

    const iconElement = document.createElement('span');
    iconElement.className = 'notifications-empty-icon';
    iconElement.textContent = icon;

    const titleElement = document.createElement('strong');
    titleElement.textContent = title;

    const textElement = document.createElement('p');
    textElement.textContent = text;

    message.append(iconElement, titleElement, textElement);

    return message;
}
