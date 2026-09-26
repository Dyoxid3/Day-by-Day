import { Scene, GameObjects } from 'phaser';
import { RequestCoinReward } from '../systems/CoinRewards';

const debugCoinRewardAmount = 10;

// Dev-only shortcuts for testing features before their real triggers exist
export function RegisterDebugControls (scene: Scene, cat: GameObjects.Sprite)
{
    scene.input.keyboard?.on('keydown-P', () => {
        RequestCoinReward(scene, cat.x, cat.y, debugCoinRewardAmount);
    });
}
