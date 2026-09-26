import { EventBus, GameEvents, type NotificationReceivedPayload, type ToastRequestedPayload } from '../game/EventBus';
import { DescribeNotification } from './NotificationText';
import './NotificationToasts.css';

const toastSettings = {
    visibleMs: 6000,
    maxVisible: 4
};

// Little cards that pop in at the top-right: new notifications from friends, plus confirmations and errors
export class NotificationToasts
{
    private stackElement: HTMLDivElement;

    constructor (container: HTMLElement)
    {
        this.stackElement = document.createElement('div');
        this.stackElement.className = 'toast-stack';
        this.stackElement.setAttribute('aria-live', 'polite');
        container.append(this.stackElement);

        EventBus.on(GameEvents.ToastRequested, (payload: ToastRequestedPayload) => this.Show(payload));
        EventBus.on(GameEvents.NotificationReceived, (payload: NotificationReceivedPayload) => {
            const notification = payload.notification;
            const description = DescribeNotification(notification);

            this.Show({
                icon: description.icon,
                title: `${notification.fromUsername} ${description.action}`,
                message: description.toastDetail,
                tone: notification.boostPercent > 0 ? 'reward' : 'info',
                opensNotifications: true
            });
        });
    }

    Show (toast: ToastRequestedPayload)
    {
        const toastElement = document.createElement('div');
        toastElement.className = `toast is-${toast.tone ?? 'info'}`;
        toastElement.setAttribute('role', toast.tone === 'error' ? 'alert' : 'status');

        const iconElement = document.createElement('span');
        iconElement.className = 'toast-icon';
        iconElement.textContent = toast.icon;

        const textElement = document.createElement('div');
        textElement.className = 'toast-text';

        const titleElement = document.createElement('strong');
        titleElement.className = 'toast-title';
        titleElement.textContent = toast.title;
        textElement.append(titleElement);

        if (toast.message)
        {
            const messageElement = document.createElement('span');
            messageElement.className = 'toast-message';
            messageElement.textContent = toast.message;
            textElement.append(messageElement);
        }

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'toast-close';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', 'Dismiss');
        closeButton.addEventListener('click', event => {
            event.stopPropagation();
            this.Dismiss(toastElement);
        });

        toastElement.append(iconElement, textElement, closeButton);

        if (toast.opensNotifications)
        {
            toastElement.classList.add('is-clickable');
            toastElement.addEventListener('click', () => {
                EventBus.emit(GameEvents.NotificationsMenuRequested);
                this.Dismiss(toastElement);
            });
        }

        this.stackElement.append(toastElement);
        toastElement.animate(
            [
                { opacity: 0, transform: 'translateX(40px) scale(0.96)' },
                { opacity: 1, transform: 'translateX(-6px) scale(1.01)', offset: 0.7 },
                { opacity: 1, transform: 'translateX(0) scale(1)' }
            ],
            { duration: 380, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' }
        );

        // Too many at once: the oldest makes room
        const toasts = this.stackElement.querySelectorAll<HTMLElement>('.toast:not(.is-leaving)');

        if (toasts.length > toastSettings.maxVisible)
        {
            this.Dismiss(toasts[0]);
        }

        this.StartDismissTimer(toastElement);
    }

    // Counts down while the pointer isn't resting on the toast
    private StartDismissTimer (toastElement: HTMLElement)
    {
        let timerId = window.setTimeout(() => this.Dismiss(toastElement), toastSettings.visibleMs);

        toastElement.addEventListener('pointerenter', () => window.clearTimeout(timerId));
        toastElement.addEventListener('pointerleave', () => {
            timerId = window.setTimeout(() => this.Dismiss(toastElement), toastSettings.visibleMs / 2);
        });
    }

    private Dismiss (toastElement: HTMLElement)
    {
        if (toastElement.classList.contains('is-leaving'))
        {
            return;
        }

        toastElement.classList.add('is-leaving');

        const exit = toastElement.animate(
            [
                { opacity: 1, transform: 'translateX(0)', maxHeight: `${toastElement.offsetHeight}px`, marginBottom: '8px' },
                { opacity: 0, transform: 'translateX(30px)', maxHeight: '0px', marginBottom: '0px' }
            ],
            { duration: 260, easing: 'ease-in', fill: 'forwards' }
        );

        exit.onfinish = () => toastElement.remove();
    }
}
