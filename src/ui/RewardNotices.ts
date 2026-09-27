import {
    EventBus,
    GameEvents,
    type ComebackCountedPayload,
    type DayStarEarnedPayload,
    type GiftReceivedPayload,
    type ItemUnlockedPayload
} from '../game/EventBus';
import { coinRewardSettings } from '../game/data/CoinRewardSettings';
import { comebackEarnedMessage, firstStarMessages, GetComebackNoticeMessage, PickMessage, secondStarMessages } from '../game/data/GentleMessages';
import { GetShopItem } from '../game/data/ShopCatalog';
import { playerStars } from '../game/state/Stars';
import { RequestCoinRewardAtScreenPoint } from '../game/systems/CoinRewards';
import { RequestToast } from '../online/OnlineSession';
import { GentleCard } from './GentleCard';
import { DescribeGiftItems } from './NotificationText';

// Lets the player know about good things as they happen: stars earned, new shop items unlocked, and gifts from friends
// arriving (whose coins fly in from the notifications bell)
export class RewardNotices
{
    private bellElement: HTMLElement;

    constructor (card: GentleCard, bellElement: HTMLElement)
    {
        this.bellElement = bellElement;

        EventBus.on(GameEvents.DayStarEarned, (payload: DayStarEarnedPayload) => {
            if (payload.reason === 'comeback')
            {
                card.Enqueue((shownCard, finish) => shownCard.Show({
                    title: comebackEarnedMessage.title,
                    text: comebackEarnedMessage.text,
                    buttons: [ { label: 'Thank you', isPrimary: true, onClick: finish } ]
                }));
                return;
            }

            RequestToast(PickMessage(payload.reason === 'first' ? firstStarMessages : secondStarMessages), undefined, 'reward', false, 'star');

            // Finishing the whole day is worth a big handful of coins, streaming out of the progress ring
            if (payload.reason === 'second')
            {
                const origin = GetDayCompleteCoinOrigin();

                RequestCoinRewardAtScreenPoint(coinRewardSettings.dayCompleteBonusCoins, origin.x, origin.y);
            }
        });

        EventBus.on(GameEvents.ItemUnlocked, (payload: ItemUnlockedPayload) => {
            const item = GetShopItem(payload.itemId);

            if (item)
            {
                RequestToast(`New in the shop: ${item.name}`, 'Your first one is free. It is waiting in your inventory.', 'reward', false, 'star');
            }
        });

        EventBus.on(GameEvents.GiftReceived, this.HandleGiftReceived, this);

        // Every comeback, however long the time away, even on a hard day (a longer absence also gets the offer to
        // earn back its stars, see DayStartFlow)
        EventBus.on(GameEvents.ComebackCounted, (payload: ComebackCountedPayload) => {
            const message = GetComebackNoticeMessage(payload.count);

            RequestToast(message.title, message.text, 'reward', false, 'star');
        });
    }

    private HandleGiftReceived (payload: GiftReceivedPayload)
    {
        const bellBounds = this.bellElement.getBoundingClientRect();

        // The coins stream from the bell into the counter (friends' coin boosts don't apply to gifts)
        if (payload.coins > 0)
        {
            RequestCoinRewardAtScreenPoint(payload.coins, bellBounds.left + bellBounds.width / 2, bellBounds.top + bellBounds.height / 2, false);
        }

        if (payload.kind === 'gift')
        {
            playerStars.AddStars(payload.stars);
            RequestToast(`A gift from ${payload.fromUsername}`, `You reached your goal and received ${DescribeGiftItems(payload)}.`, 'reward', true, 'star');
        }
        else
        {
            // Stars given away and returned aren't new stars
            playerStars.RefundStars(payload.stars);
            RequestToast('Your gift came back to you', `${DescribeGiftItems(payload)} from your encouragement to ${payload.fromUsername}.`, 'info', true, 'coin');
        }
    }
}

// The middle of the progress ring when it's on screen (the bottom panel is open), otherwise the middle of the screen
function GetDayCompleteCoinOrigin (): { x: number, y: number }
{
    const ring = document.querySelector('.progress-ring-graphic')?.getBoundingClientRect();
    const isRingShowing = ring !== undefined && ring.width > 0 && ring.bottom > 0 && ring.top < window.innerHeight;

    return isRingShowing
        ? { x: ring.left + ring.width / 2, y: ring.top + ring.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}
