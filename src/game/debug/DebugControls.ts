import { Scene } from 'phaser';
import { EventBus, GameEvents, type ToastRequestedPayload } from '../EventBus';
import { playerCatMood } from '../state/CatMood';

// How much the neglect / cheer-up keys move the cat's attention
const debugAttentionStep = 20;

// Dev-only shortcuts for testing the cat's mood: O = show it, 9 = neglect the cat, 0 = cheer the cat up
// (1, Y, U, H, J, K, N and M belong to the debug menu, see ui/DebugMenu; V and T to online/DemoControls)
export function RegisterDebugControls (scene: Scene)
{
    const keyboard = scene.input.keyboard;

    keyboard?.on('keydown-O', ShowCatMood);
    keyboard?.on('keydown-NINE', () => {
        playerCatMood.AdjustAttention(-debugAttentionStep);
        ShowCatMood();
    });
    keyboard?.on('keydown-ZERO', () => {
        playerCatMood.AdjustAttention(debugAttentionStep);
        ShowCatMood();
    });
}

function ShowCatMood ()
{
    const payload: ToastRequestedPayload = {
        title: `Cat mood: ${playerCatMood.GetMood().name} (${playerCatMood.GetHappiness()}/100)`,
        message: `Showing "${playerCatMood.GetExpression()}". 9 = neglect, 0 = cheer up.`
    };

    EventBus.emit(GameEvents.ToastRequested, payload);
}
