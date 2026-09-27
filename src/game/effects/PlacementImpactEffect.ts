import { Scene, GameObjects, TintModes } from 'phaser';
import { EventBus, GameEvents } from '../EventBus';

const impactSettings = {
    dropHeightPx: 26,
    dropDurationMs: 150,
    // How much the item squashes on landing (0.2 = 20% wider and shorter)
    squashAmount: 0.2,
    settleDurationMs: 420,
    flashDurationMs: 80,
    dustColor: 0xf6ead0,
    dustRingDurationMs: 380,
    dustPuffCount: 6,
    dustPuffSizePx: 10,
    dustPuffTravelPx: 28,
    dustPuffDurationMs: 450,
    cameraShakeDurationMs: 120,
    cameraShakeIntensity: 0.004
};

// Drop, squash-and-settle, flash, dust and a small camera shake when an item is placed.
// Expects the item at its final position with its origin at the bottom-center.
export function PlayPlacementImpact (scene: Scene, item: GameObjects.Image)
{
    const settings = impactSettings;
    const restingY = item.y;
    const baseScaleX = item.scaleX;
    const baseScaleY = item.scaleY;

    item.y = restingY - settings.dropHeightPx;

    scene.tweens.add({
        targets: item,
        y: restingY,
        duration: settings.dropDurationMs,
        ease: 'Quad.easeIn',
        onComplete: () => {
            item.setScale(baseScaleX * (1 + settings.squashAmount), baseScaleY * (1 - settings.squashAmount));

            scene.tweens.add({
                targets: item,
                scaleX: baseScaleX,
                scaleY: baseScaleY,
                duration: settings.settleDurationMs,
                ease: 'Back.easeOut'
            });

            FlashWhite(scene, item);
            SpawnDustRing(scene, item);
            SpawnDustPuffs(scene, item);
            scene.cameras.main.shake(settings.cameraShakeDurationMs, settings.cameraShakeIntensity);
            EventBus.emit(GameEvents.PropLanded);
        }
    });
}

function FlashWhite (scene: Scene, item: GameObjects.Image)
{
    item.setTint(0xffffff).setTintMode(TintModes.FILL);

    scene.time.delayedCall(impactSettings.flashDurationMs, () => {
        item.clearTint().setTintMode(TintModes.MULTIPLY);
    });
}

function SpawnDustRing (scene: Scene, item: GameObjects.Image)
{
    const ring = scene.add.ellipse(item.x, item.y, item.displayWidth * 1.2, item.displayWidth * 0.3, impactSettings.dustColor, 0.6);

    ring.setDepth(item.depth - 0.5);
    ring.setScale(0.5);

    scene.tweens.add({
        targets: ring,
        scale: 1.3,
        alpha: 0,
        duration: impactSettings.dustRingDurationMs,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy()
    });
}

function SpawnDustPuffs (scene: Scene, item: GameObjects.Image)
{
    const settings = impactSettings;

    for (let index = 0; index < settings.dustPuffCount; index++)
    {
        // Alternate sides so puffs spread out both ways from the base
        const direction = index % 2 === 0 ? -1 : 1;
        const startX = item.x + direction * item.displayWidth * (0.25 + Math.random() * 0.25);
        const size = settings.dustPuffSizePx * (0.7 + Math.random() * 0.6);
        const puff = scene.add.ellipse(startX, item.y, size, size * 0.8, settings.dustColor, 0.9);

        puff.setDepth(item.depth + 0.5);

        scene.tweens.add({
            targets: puff,
            x: startX + direction * settings.dustPuffTravelPx * (0.6 + Math.random() * 0.6),
            y: item.y - (4 + Math.random() * 10),
            scale: 1.8,
            alpha: 0,
            duration: settings.dustPuffDurationMs,
            ease: 'Cubic.easeOut',
            onComplete: () => puff.destroy()
        });
    }
}
