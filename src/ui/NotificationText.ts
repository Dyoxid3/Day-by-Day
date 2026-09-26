import type { OnlineNotification } from '../online/OnlineTypes';

export interface NotificationDescription
{
    icon: string;
    // What happened, after the sender's name, e.g. "encouraged you"
    action: string;
    // A line of extra detail for toasts
    toastDetail: string;
}

// How each kind of notification is worded, shared by the notifications menu and the pop-up toasts
export function DescribeNotification (notification: OnlineNotification): NotificationDescription
{
    const boostText = notification.boostPercent > 0 ? ` · +${notification.boostPercent}% coins for you` : '';

    switch (notification.kind)
    {
        case 'encouragement':
            return { icon: '💌', action: 'encouraged you', toastDetail: `“${notification.message}”${boostText}` };

        case 'reply':
            return { icon: '💛', action: 'replied to your encouragement', toastDetail: `“${notification.message}”${boostText}` };

        case 'friend-added':
            return { icon: '👋', action: 'added you as a friend', toastDetail: 'Send them some encouragement!' };

        case 'visit':
            return { icon: '⛵', action: 'is visiting your island', toastDetail: 'Their cat just sailed in to say hi.' };
    }
}
