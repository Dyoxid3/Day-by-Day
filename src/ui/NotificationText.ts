import type { ToastIcon } from '../game/EventBus';
import type { EncouragementGift, OnlineNotification } from '../online/OnlineTypes';
import { Pluralize } from './UiFormat';

export interface NotificationDescription
{
    // A pixel-art picture for it, if any
    icon: ToastIcon | null;
    // What happened, after the sender's name, e.g. "encouraged you"
    action: string;
    // A line of extra detail for toasts
    toastDetail: string;
    // Good news (shown in the reward color)
    isReward: boolean;
}

// How each kind of notification is worded, shared by the notifications menu and the pop-up toasts
export function DescribeNotification (notification: OnlineNotification): NotificationDescription
{
    const gift = notification.gift;

    switch (notification.kind)
    {
        case 'encouragement':
            return {
                icon: 'star',
                action: 'encouraged you',
                toastDetail: gift ? `"${notification.message}" ${DescribeGiftGoal(gift, notification.boostPercent)}` : `"${notification.message}"`,
                isReward: true
            };

        case 'reply':
            return { icon: 'star', action: 'replied to your encouragement', toastDetail: `"${notification.message}"`, isReward: notification.boostPercent > 0 };

        case 'friend-added':
            return { icon: null, action: 'added you as a friend', toastDetail: 'Maybe send them a few kind words.', isReward: false };

        case 'visit':
            return { icon: null, action: 'is visiting your island', toastDetail: 'Their cat just sailed in to say hello.', isReward: false };

        case 'friend-struggling':
            return notification.reason === 'off-track'
                ? { icon: 'bell', action: 'could use a little encouragement', toastDetail: 'Their day is getting away from them. A kind word might help.', isReward: false }
                : { icon: 'bell', action: 'is having a tough day', toastDetail: 'A few kind words from you could mean a lot.', isReward: false };

        case 'goal-reached':
            return {
                icon: 'star',
                action: 'reached the goal you set',
                toastDetail: gift && HasGiftItems(gift)
                    ? `Your encouragement helped. They received ${DescribeGiftItems(gift)}.`
                    : 'Your encouragement helped.',
                isReward: true
            };

        case 'gift-returned':
            return {
                icon: 'coin',
                action: 'had a quieter day',
                toastDetail: gift ? `${Capitalize(DescribeGiftItems(gift))} came back to you. Your kind words still count.` : 'Your gift came back to you.',
                isReward: false
            };
    }
}

// e.g. "Finish 33% of your day to receive 10 coins and 1 star, and 10% more coins for the rest of the day."
export function DescribeGiftGoal (gift: EncouragementGift, boostPercent: number): string
{
    const boostText = boostPercent > 0 ? `${boostPercent}% more coins for the rest of the day` : '';
    const rewardText = [ HasGiftItems(gift) ? DescribeGiftItems(gift) : '', boostText ].filter(Boolean).join(', and ');

    if (gift.state === 'earned')
    {
        return `You reached ${gift.goalPercent}% and received ${rewardText}.`;
    }

    if (gift.state === 'returned')
    {
        return 'That day has passed, but the kind words are still yours.';
    }

    return `Finish ${gift.goalPercent}% of your day to receive ${rewardText}.`;
}

// e.g. "10 coins and 1 star"
export function DescribeGiftItems (gift: { coins: number, stars: number }): string
{
    return [ gift.coins > 0 ? Pluralize(gift.coins, 'coin') : '', gift.stars > 0 ? Pluralize(gift.stars, 'star') : '' ]
        .filter(Boolean)
        .join(' and ');
}

function HasGiftItems (gift: EncouragementGift): boolean
{
    return gift.coins > 0 || gift.stars > 0;
}

function Capitalize (text: string): string
{
    return text.charAt(0).toUpperCase() + text.slice(1);
}
