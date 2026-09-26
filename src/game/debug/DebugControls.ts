import { Scene, GameObjects } from 'phaser';
import { EventBus, GameEvents, type ToastRequestedPayload } from '../EventBus';
import { playerCatMood } from '../state/CatMood';
import { RequestCoinReward } from '../systems/CoinRewards';

const debugCoinRewardAmount = 10;
// How much the neglect / cheer-up keys move the cat's attention
const debugAttentionStep = 20;

// Dev-only shortcuts for testing features before their real triggers exist:
// P = coins from the cat, M = show the cat's mood, N = neglect the cat, H = cheer the cat up
export function RegisterDebugControls (scene: Scene, cat: GameObjects.Sprite)
{
    const keyboard = scene.input.keyboard;

    keyboard?.on('keydown-P', () => {
        // From the cat's middle (its position is where its feet are)
        RequestCoinReward(scene, cat.x, cat.y - cat.displayHeight / 3, debugCoinRewardAmount);
    });
    keyboard?.on('keydown-M', ShowCatMood);
    keyboard?.on('keydown-N', () => {
        playerCatMood.AdjustAttention(-debugAttentionStep);
        ShowCatMood();
    });
    keyboard?.on('keydown-H', () => {
        playerCatMood.AdjustAttention(debugAttentionStep);
        ShowCatMood();
    });
}

function ShowCatMood ()
{
    const payload: ToastRequestedPayload = {
        icon: '🐱',
        title: `Cat mood: ${playerCatMood.GetMood().name} (${playerCatMood.GetHappiness()}/100)`,
        message: `Showing "${playerCatMood.GetExpression()}". N = neglect, H = cheer up.`
    };

    EventBus.emit(GameEvents.ToastRequested, payload);
}
