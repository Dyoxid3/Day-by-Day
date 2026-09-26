import { Scene } from 'phaser';
import { EventBus, GameEvents, type CoinRewardRequestedPayload } from '../EventBus';
import { WorldToScreen } from './CameraMath';

// Plays the coin burst from a world position. The UI animation (ui/CoinRewardAnimation) adds the
// coins to the wallet as each one reaches the counter.
export function RequestCoinReward (scene: Scene, worldX: number, worldY: number, amount: number)
{
    const screenPoint = WorldToScreen(scene.cameras.main, worldX, worldY);
    const canvasBounds = scene.game.canvas.getBoundingClientRect();

    const payload: CoinRewardRequestedPayload = {
        amount,
        clientX: canvasBounds.left + screenPoint.x * (canvasBounds.width / scene.scale.width),
        clientY: canvasBounds.top + screenPoint.y * (canvasBounds.height / scene.scale.height)
    };

    EventBus.emit(GameEvents.CoinRewardRequested, payload);
}
