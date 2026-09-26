import { EventBus, GameEvents, type CoinRewardRequestedPayload } from '../game/EventBus';
import { playerWallet } from '../game/state/Wallet';
import { uiAssets } from './UiAssets';
import { FormatBoostMultiplier } from './UiFormat';
import './CoinRewardAnimation.css';

const coinAnimationSettings = {
    // Size when leaving the character
    coinSizePx: 34,
    // Size when reaching the counter; roughly matches the counter's coin icon
    endSizePx: 22,
    // Bigger rewards split their value across this many coins at most
    maxVisibleCoins: 15,
    flightDurationMs: 900,
    // Time between each coin leaving, lower = tighter stream
    streamIntervalMs: 55,
    // Different horizontal and vertical easing is what bends the path into an arc
    horizontalEasing: 'cubic-bezier(0.45, 0, 0.85, 0.6)',
    verticalEasing: 'cubic-bezier(0.2, 0.6, 0.5, 1)',
    shrinkEasing: 'cubic-bezier(0.5, 0, 0.9, 0.7)'
};

interface Point
{
    x: number;
    y: number;
}

// Coins leave a point on screen one after another in a single stream and fly into the coin counter,
// adding to the wallet as each one lands
export class CoinRewardAnimation
{
    private container: HTMLElement;
    private targetElement: HTMLElement;
    private layerElement: HTMLDivElement;

    constructor (container: HTMLElement, targetElement: HTMLElement)
    {
        this.container = container;
        this.targetElement = targetElement;

        this.layerElement = document.createElement('div');
        Object.assign(this.layerElement.style, {
            position: 'absolute',
            inset: '0',
            zIndex: '4',
            overflow: 'hidden',
            pointerEvents: 'none'
        });
        container.append(this.layerElement);

        EventBus.on(GameEvents.CoinRewardRequested, this.Play, this);
    }

    Play (payload: CoinRewardRequestedPayload)
    {
        if (payload.amount <= 0)
        {
            return;
        }

        const settings = coinAnimationSettings;
        const containerBounds = this.container.getBoundingClientRect();
        const targetBounds = this.targetElement.getBoundingClientRect();

        const source: Point = {
            x: payload.clientX - containerBounds.left,
            y: payload.clientY - containerBounds.top
        };
        const counter: Point = {
            x: targetBounds.left + targetBounds.width / 2 - containerBounds.left,
            y: targetBounds.top + targetBounds.height / 2 - containerBounds.top
        };

        const coinCount = Math.min(payload.amount, settings.maxVisibleCoins);
        const baseValue = Math.floor(payload.amount / coinCount);
        const remainder = payload.amount % coinCount;

        for (let index = 0; index < coinCount; index++)
        {
            const coinValue = baseValue + (index < remainder ? 1 : 0);

            this.AnimateCoin(source, counter, index * settings.streamIntervalMs, coinValue);
        }

        this.ShowAmountLabel(source, payload);
    }

    // "+6" rising from where the coins came from, with the friends' boost if there is one
    private ShowAmountLabel (source: Point, payload: CoinRewardRequestedPayload)
    {
        const label = document.createElement('div');
        label.className = 'coin-reward-label';
        label.style.left = `${source.x}px`;
        label.style.top = `${source.y}px`;
        label.textContent = `+${payload.amount}`;

        if (payload.multiplier > 1)
        {
            const boostElement = document.createElement('span');
            boostElement.className = 'coin-reward-boost';
            boostElement.textContent = `${FormatBoostMultiplier((payload.multiplier - 1) * 100)} boost`;
            label.append(boostElement);
        }

        this.layerElement.append(label);
        label.animate(
            [
                { opacity: 0, transform: 'translate(-50%, -30%) scale(0.6)' },
                { opacity: 1, transform: 'translate(-50%, -110%) scale(1.1)', offset: 0.2 },
                { opacity: 1, transform: 'translate(-50%, -150%) scale(1)', offset: 0.75 },
                { opacity: 0, transform: 'translate(-50%, -190%) scale(1)' }
            ],
            { duration: 1400, easing: 'ease-out' }
        ).onfinish = () => label.remove();
    }

    private AnimateCoin (source: Point, counter: Point, delayMs: number, coinValue: number)
    {
        const settings = coinAnimationSettings;
        const halfSize = settings.coinSizePx / 2;
        const endScale = settings.endSizePx / settings.coinSizePx;

        // Nested so horizontal movement, vertical movement and size can each ease differently
        const horizontalMover = CreateMoverElement();
        const verticalMover = CreateMoverElement();
        const coinImage = document.createElement('img');
        coinImage.src = uiAssets.coin;
        coinImage.alt = '';
        Object.assign(coinImage.style, {
            display: 'block',
            width: `${settings.coinSizePx}px`,
            height: `${settings.coinSizePx}px`,
            objectFit: 'contain'
        });

        verticalMover.append(coinImage);
        horizontalMover.append(verticalMover);
        this.layerElement.append(horizontalMover);

        // 'both' keeps waiting coins hidden at the start and finished coins at the counter until removed
        const timing: KeyframeAnimationOptions = { duration: settings.flightDurationMs, delay: delayMs, fill: 'both' };

        horizontalMover.animate([
            { transform: `translateX(${source.x - halfSize}px)` },
            { transform: `translateX(${counter.x - halfSize}px)` }
        ], { ...timing, easing: settings.horizontalEasing });

        verticalMover.animate([
            { transform: `translateY(${source.y - halfSize}px)` },
            { transform: `translateY(${counter.y - halfSize}px)` }
        ], { ...timing, easing: settings.verticalEasing });

        const flight = coinImage.animate([
            { transform: 'scale(1)', opacity: 0 },
            { transform: 'scale(1)', opacity: 1, offset: 0.06 },
            { transform: `scale(${endScale})`, opacity: 1 }
        ], { ...timing, easing: settings.shrinkEasing });

        flight.onfinish = () => {
            horizontalMover.remove();
            playerWallet.AddCoins(coinValue);
        };
    }
}

function CreateMoverElement (): HTMLDivElement
{
    const mover = document.createElement('div');
    Object.assign(mover.style, { position: 'absolute', left: '0', top: '0' });

    return mover;
}
