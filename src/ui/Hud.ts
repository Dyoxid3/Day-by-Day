import { EventBus, GameEvents, type CoinsChangedPayload, type StreakChangedPayload, type UiPanelToggledPayload } from '../game/EventBus';
import { playerWallet } from '../game/state/Wallet';
import { playerStreak } from '../game/state/DailyStreak';
import { uiAssets } from './UiAssets';
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
    private hudElement: HTMLDivElement;
    private coinCounterElement: HTMLDivElement;
    private coinCountElement: HTMLSpanElement;
    private streakCountElement: HTMLSpanElement;
    private placementHintElement: HTMLDivElement;
    private openSidePanelIds = new Set<string>();

    constructor (container: HTMLElement, actions: HudActions)
    {
        this.hudElement = document.createElement('div');
        this.hudElement.className = 'hud';

        const shopButton = CreateRoundButton('hud-shop-button', uiAssets.shoppingCart, 'Shop');
        shopButton.addEventListener('click', actions.onShopPressed);

        this.coinIconElement = CreateImage(uiAssets.coin, 'hud-counter-icon');
        this.coinCountElement = CreateCounterValue();
        this.coinCounterElement = CreateCounter('hud-coin-counter', 'Coins');
        this.coinCounterElement.append(this.coinIconElement, this.coinCountElement);

        // The bell and streak step aside while a panel covers the left side (like the shop)
        const bellButton = CreateRoundButton('hud-bell-button is-small hides-for-side-panel', uiAssets.bell, 'Notifications');
        bellButton.addEventListener('click', () => {
            SwingBell(bellButton);
            actions.onNotificationsPressed();
        });

        // Only shows the streak for now, so it isn't a button
        const streakBadge = document.createElement('div');
        streakBadge.className = 'hud-round is-small hud-streak-badge hides-for-side-panel';
        streakBadge.title = 'Daily streak';
        streakBadge.append(CreateImage(uiAssets.fire, 'hud-round-icon'));

        this.streakCountElement = CreateCounterValue();
        const streakCounter = CreateCounter('hud-streak-counter hides-for-side-panel', 'Daily streak');
        streakCounter.append(this.streakCountElement);

        this.hudElement.append(shopButton, this.coinCounterElement, bellButton, streakBadge, streakCounter);

        this.placementHintElement = document.createElement('div');
        this.placementHintElement.className = 'placement-hint';
        this.placementHintElement.textContent = 'Click to place · Esc or right-click to store it';

        container.append(this.hudElement, this.placementHintElement);

        this.SetCoinCount(playerWallet.GetCoins());
        this.SetStreakCount(playerStreak.GetStreakDays());

        EventBus.on(GameEvents.CoinsChanged, this.HandleCoinsChanged, this);
        EventBus.on(GameEvents.StreakChanged, (payload: StreakChangedPayload) => this.SetStreakCount(payload.streakDays));
        EventBus.on(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
        EventBus.on(GameEvents.PlacementStarted, () => this.SetPlacementHintVisible(true));
        EventBus.on(GameEvents.PlacementEnded, () => this.SetPlacementHintVisible(false));
    }

    private HandleCoinsChanged (payload: CoinsChangedPayload)
    {
        this.SetCoinCount(payload.coins);

        if (payload.change > 0)
        {
            this.PulseCoinCounter();
        }
    }

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

    private SetCoinCount (coins: number)
    {
        this.coinCountElement.textContent = String(coins);
    }

    private SetStreakCount (streakDays: number)
    {
        this.streakCountElement.textContent = String(streakDays);
    }

    private PulseCoinCounter ()
    {
        this.coinCounterElement.animate(
            [ { transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' } ],
            { duration: 180, easing: 'ease-out' }
        );
    }

    private SetPlacementHintVisible (isVisible: boolean)
    {
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

function CreateCounter (className: string, label: string): HTMLDivElement
{
    const counter = document.createElement('div');
    counter.className = `hud-counter ${className}`;
    counter.title = label;

    return counter;
}

function CreateCounterValue (): HTMLSpanElement
{
    const value = document.createElement('span');
    value.className = 'hud-counter-value';

    return value;
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

// Little ring of the bell when it's pressed
function SwingBell (bellButton: HTMLButtonElement)
{
    bellButton.querySelector('img')?.animate(
        [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(-16deg)' },
            { transform: 'rotate(13deg)' },
            { transform: 'rotate(-8deg)' },
            { transform: 'rotate(4deg)' },
            { transform: 'rotate(0deg)' }
        ],
        { duration: 500, easing: 'ease-out' }
    );
}
