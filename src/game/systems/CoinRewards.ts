import { Scene } from 'phaser';
import { EventBus, GameEvents, type CoinRewardRequestedPayload } from '../EventBus';
import { playerCoinBoost } from '../state/CoinBoost';
import { WorldToScreen } from './CameraMath';

// Plays the coin stream from a world position. The UI animation (ui/CoinRewardAnimation) adds the
// coins to the wallet as each one reaches the counter.
export function RequestCoinReward (scene: Scene, worldX: number, worldY: number, baseAmount: number)
{
    const screenPoint = WorldToScreen(scene.cameras.main, worldX, worldY);
    const canvasBounds = scene.game.canvas.getBoundingClientRect();

    RequestCoinRewardAtScreenPoint(
        baseAmount,
        canvasBounds.left + screenPoint.x * (canvasBounds.width / scene.scale.width),
        canvasBounds.top + screenPoint.y * (canvasBounds.height / scene.scale.height)
    );
}

// Same, from a point on the page (e.g. a to-do list checkbox). Friends' coin boost is applied here,
// rounding up so even a small boost adds at least one coin. Pass isBoostable = false for coins that
// aren't a reward, like selling an item back.
export function RequestCoinRewardAtScreenPoint (baseAmount: number, clientX: number, clientY: number, isBoostable = true)
{
    const multiplier = isBoostable ? playerCoinBoost.GetMultiplier() : 1;
    const payload: CoinRewardRequestedPayload = {
        amount: multiplier > 1 ? Math.ceil(baseAmount * multiplier - 1e-9) : baseAmount,
        multiplier,
        clientX,
        clientY
    };

    EventBus.emit(GameEvents.CoinRewardRequested, payload);
}
