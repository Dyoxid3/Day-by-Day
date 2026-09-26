import {
    EventBus,
    GameEvents,
    type CoinBoostChangedPayload,
    type CoinsChangedPayload,
    type StreakChangedPayload,
    type UiPanelToggledPayload,
    type VisitStateChangedPayload
} from '../game/EventBus';
import { playerWallet } from '../game/state/Wallet';
import { playerStreak } from '../game/state/DailyStreak';
import { playerCoinBoost } from '../game/state/CoinBoost';
import { onlineSession } from '../online/OnlineSession';
import { uiAssets } from './UiAssets';
import { FormatBoostMultiplier, FormatMinutesLeft } from './UiFormat';
import { IsTouchScreen } from './UiDevice';
import './Hud.css';

export interface HudActions
{
    onShopPressed: () => void;
    onNotificationsPressed: () => void;
}

// Always-visible top-left controls (shop, coins, notifications bell, daily streak) plus the placement hint.
// How they're arranged is set in Hud.css.
export class Hud
{
    readonly coinIconElement: HTMLImageElement;
    readonly bellButtonElement: HTMLButtonElement;
    private hudElement: HTMLDivElement;
    private coinCounterElement: HTMLDivElement;
    private coinCountElement: HTMLSpanElement;
    private boostChipElement: HTMLSpanElement;
    private bellBadgeElement: HTMLSpanElement;
    private streakElement: HTMLDivElement;
    private streakCountElement: HTMLSpanElement;
    private placementHintElement: HTMLDivElement;
    private placementHintTextElement: HTMLSpanElement;
    private openSidePanelIds = new Set<string>();
    private shownUnreadCount = 0;

    constructor (container: HTMLElement, actions: HudActions)
    {
        this.hudElement = document.createElement('div');
        this.hudElement.className = 'hud';

        // Hidden while visiting a friend, since items can only be placed on your own island
        const shopButton = CreateRoundButton('hud-shop-button hides-while-visiting', uiAssets.shoppingCart, 'Shop');
        shopButton.addEventListener('click', actions.onShopPressed);

        this.coinIconElement = CreateImage(uiAssets.coin, 'hud-counter-icon');
        this.coinCountElement = document.createElement('span');
        this.coinCountElement.className = 'hud-counter-value';
        this.boostChipElement = document.createElement('span');
        this.boostChipElement.className = 'hud-boost-chip';
        this.coinCounterElement = document.createElement('div');
        this.coinCounterElement.className = 'hud-counter hud-coin-counter';
        this.coinCounterElement.append(this.coinIconElement, this.coinCountElement, this.boostChipElement);
        // Built when hovered, so the time left is current
        this.coinCounterElement.addEventListener('pointerenter', () => this.UpdateCoinTooltip());

        // The bell and streak step aside while a panel covers the left side (like the shop)
        this.bellButtonElement = CreateRoundButton('hud-bell-button is-small hides-for-side-panel', uiAssets.bell, 'Notifications');
        this.bellBadgeElement = document.createElement('span');
        this.bellBadgeElement.className = 'hud-badge';
        this.bellButtonElement.append(this.bellBadgeElement);
        this.bellButtonElement.addEventListener('click', () => {
            SwingBell(this.bellButtonElement);
            actions.onNotificationsPressed();
        });

        // The streak is just a flame with the number on it, not a button
        this.streakElement = document.createElement('div');
        this.streakElement.className = 'hud-streak hides-for-side-panel';
        this.streakCountElement = document.createElement('span');
        this.streakCountElement.className = 'hud-streak-count';
        this.streakElement.append(CreateImage(uiAssets.fire, 'hud-streak-fire'), this.streakCountElement);

        this.hudElement.append(shopButton, this.coinCounterElement, this.bellButtonElement, this.streakElement);

        this.placementHintElement = document.createElement('div');
        this.placementHintElement.className = 'placement-hint';
        this.placementHintTextElement = document.createElement('span');

        // Touch screens have no Esc key or right-click, so they get a button instead (hidden on computers by CSS)
        const storeButton = document.createElement('button');
        storeButton.type = 'button';
        storeButton.className = 'placement-hint-store';
        storeButton.textContent = 'Store it';
        storeButton.addEventListener('click', () => EventBus.emit(GameEvents.PlacementCancelRequested));

        this.placementHintElement.append(this.placementHintTextElement, storeButton);

        container.append(this.hudElement, this.placementHintElement);

        this.SetCoinCount(playerWallet.GetCoins());
        this.UpdateStreak();
        this.UpdateBoostChip();
        this.UpdateBellBadge();

        EventBus.on(GameEvents.CoinsChanged, this.HandleCoinsChanged, this);
        EventBus.on(GameEvents.StreakChanged, this.HandleStreakChanged, this);
        EventBus.on(GameEvents.CoinBoostChanged, this.HandleCoinBoostChanged, this);
        EventBus.on(GameEvents.OnlineStateChanged, this.UpdateBellBadge, this);
        EventBus.on(GameEvents.NotificationReceived, () => this.RingForNewNotification());
        EventBus.on(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
        EventBus.on(GameEvents.VisitStateChanged, (payload: VisitStateChangedPayload) => {
            this.hudElement.classList.toggle('is-visiting', payload.hostUsername !== null);
        });
        EventBus.on(GameEvents.PlacementStarted, () => this.SetPlacementHintVisible(true));
        EventBus.on(GameEvents.PlacementEnded, () => this.SetPlacementHintVisible(false));
    }

    // --- Coins ---

    private HandleCoinsChanged (payload: CoinsChangedPayload)
    {
        this.SetCoinCount(payload.coins);

        if (payload.change > 0)
        {
            this.coinCounterElement.animate(
                [ { transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' } ],
                { duration: 180, easing: 'ease-out' }
            );
        }
    }

    private SetCoinCount (coins: number)
    {
        this.coinCountElement.textContent = String(coins);
    }

    private HandleCoinBoostChanged (payload: CoinBoostChangedPayload)
    {
        this.UpdateBoostChip();

        if (payload.change > 0)
        {
            this.boostChipElement.animate(
                [ { transform: 'scale(0.4)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' } ],
                { duration: 450, easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)' }
            );
            this.coinCounterElement.animate(
                [ { boxShadow: '0 0 0 0 rgba(242, 182, 50, 0.9)' }, { boxShadow: '0 0 0 14px rgba(242, 182, 50, 0)' } ],
                { duration: 800, easing: 'ease-out' }
            );
        }
    }

    private UpdateBoostChip ()
    {
        const percent = playerCoinBoost.GetTotalPercent();

        this.boostChipElement.textContent = FormatBoostMultiplier(percent);
        this.coinCounterElement.classList.toggle('has-boost', percent > 0);
    }

    private UpdateCoinTooltip ()
    {
        const percent = playerCoinBoost.GetTotalPercent();

        if (percent <= 0)
        {
            this.coinCounterElement.title = 'Coins';
            return;
        }

        const now = Date.now();
        const lines = playerCoinBoost.GetActiveBoosts().map(boost => {
            const reason = boost.kind === 'encouragement' ? 'encouraged you' : 'replied to you';

            return `+${boost.percent}%: ${boost.fromUsername} ${reason} (${FormatMinutesLeft(boost.endsAt - now)})`;
        });

        this.coinCounterElement.title = [ `Coins earned ${FormatBoostMultiplier(percent)} thanks to friends`, ...lines ].join('\n');
    }

    // --- Streak ---

    private HandleStreakChanged (payload: StreakChangedPayload)
    {
        this.UpdateStreak();

        if (payload.change > 0)
        {
            this.CelebrateStreak();
        }
        else
        {
            this.streakElement.animate(
                [
                    { transform: 'scale(1)', filter: 'grayscale(0)' },
                    { transform: 'scale(0.82)', filter: 'grayscale(0.9)' },
                    { transform: 'scale(1)', filter: 'grayscale(0)' }
                ],
                { duration: 650, easing: 'ease-out' }
            );
        }
    }

    private UpdateStreak ()
    {
        const streakDays = playerStreak.GetStreakDays();
        const todayNote = playerStreak.IsTodayCounted()
            ? 'Today counts, nice work!'
            : `Finish over ${playerStreak.GetThresholdPercent()}% of today's tasks to keep it going.`;

        this.streakCountElement.textContent = String(streakDays);
        this.streakElement.title = `${streakDays}-day streak. ${todayNote}`;
        this.streakElement.classList.toggle('is-lit', playerStreak.IsTodayCounted());
    }

    private CelebrateStreak ()
    {
        this.streakElement.animate(
            [
                { transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' },
                { transform: 'scale(1.45) rotate(-8deg)', filter: 'brightness(1.35)', offset: 0.35 },
                { transform: 'scale(0.95) rotate(4deg)', filter: 'brightness(1.1)', offset: 0.7 },
                { transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' }
            ],
            { duration: 750, easing: 'ease-out' }
        );

        const plusOne = document.createElement('span');
        plusOne.className = 'hud-streak-plus';
        plusOne.textContent = '+1';
        this.streakElement.append(plusOne);
        plusOne.animate(
            [
                { opacity: 0, transform: 'translate(-50%, 0) scale(0.6)' },
                { opacity: 1, transform: 'translate(-50%, -14px) scale(1.1)', offset: 0.3 },
                { opacity: 0, transform: 'translate(-50%, -34px) scale(1)' }
            ],
            { duration: 1100, easing: 'ease-out' }
        ).onfinish = () => plusOne.remove();
    }

    // --- Notifications bell ---

    private UpdateBellBadge ()
    {
        const unreadCount = onlineSession.GetUnreadCount();

        this.bellBadgeElement.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
        this.bellButtonElement.classList.toggle('has-unread', unreadCount > 0);
        this.bellButtonElement.setAttribute('aria-label', unreadCount > 0 ? `Notifications (${unreadCount} new)` : 'Notifications');

        if (unreadCount > this.shownUnreadCount)
        {
            this.bellBadgeElement.animate(
                [ { transform: 'scale(0)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' } ],
                { duration: 400, easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)' }
            );
        }

        this.shownUnreadCount = unreadCount;
    }

    private RingForNewNotification ()
    {
        SwingBell(this.bellButtonElement);
        this.bellButtonElement.animate(
            [ { boxShadow: '0 0 0 0 rgba(229, 72, 77, 0.7)' }, { boxShadow: '0 0 0 16px rgba(229, 72, 77, 0)' } ],
            { duration: 900, easing: 'ease-out', iterations: 2 }
        );
    }

    // --- Other ---

    private HandleUiPanelToggled (payload: UiPanelToggledPayload)
    {
        if (payload.coveredEdge !== 'left')
        {
            return;
        }

        if (payload.isOpen)
        {
            this.openSidePanelIds.add(payload.panelId);
        }
        else
        {
            this.openSidePanelIds.delete(payload.panelId);
        }

        this.hudElement.classList.toggle('is-side-panel-open', this.openSidePanelIds.size > 0);
    }

    private SetPlacementHintVisible (isVisible: boolean)
    {
        this.placementHintTextElement.textContent = IsTouchScreen()
            ? 'Tap a spot on the island to place it'
            : 'Click to place · Esc or right-click to store it';
        this.placementHintElement.classList.toggle('is-visible', isVisible);
    }
}

function CreateRoundButton (className: string, iconSource: string, label: string): HTMLButtonElement
{
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `hud-round ${className}`;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(CreateImage(iconSource, 'hud-round-icon'));

    return button;
}

function CreateImage (source: string, className: string): HTMLImageElement
{
    const image = document.createElement('img');
    image.src = source;
    image.alt = '';
    image.className = className;
    image.draggable = false;

    return image;
}

// A little ring of the bell
function SwingBell (bellButton: HTMLButtonElement)
{
    bellButton.querySelector('img')?.animate(
        [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(-18deg)' },
            { transform: 'rotate(15deg)' },
            { transform: 'rotate(-10deg)' },
            { transform: 'rotate(5deg)' },
            { transform: 'rotate(0deg)' }
        ],
        { duration: 600, easing: 'ease-out' }
    );
}
