import { Scene, GameObjects, Input, Scenes, BlendModes, Math as PhaserMath } from 'phaser';
import { EventBus, GameEvents, type LanternOpenedPayload } from '../EventBus';
import { lanterns, type LanternInfo } from '../state/Lanterns';
import { IslandGround } from './IslandGround';
import { GetScreenPixelsPerCssPixel } from './ScreenResolution';

// The lantern picture, inside public/assets. A placeholder: the star sprite, until there's lantern art.
export const lanternArt = {
    textureKey: 'lantern',
    file: 'PixelArt/Cat/star.png'
};

const lanternSettings = {
    glowColor: 0xffd98a,
    glowRadiusPx: 18,
    glowAlphaMin: 0.18,
    glowAlphaMax: 0.42,
    glowPulseMs: 1600,
    bobHeightPx: 2,
    bobDurationMs: 1800,
    // Lanterns try not to sit closer together than this
    minSpacingPx: 28,
    spotAttempts: 12,
    // New lanterns drift down onto the island; opened ones float up and away
    arrivalDropPx: 50,
    arrivalDurationMs: 1400,
    departureRisePx: 70,
    departureDurationMs: 1500,
    // A tap only counts if the pointer barely moved (otherwise it was a camera drag), in CSS px
    tapTolerance: 8
};

interface ShownLantern
{
    sprite: GameObjects.Image;
    glow: GameObjects.Arc;
    tweens: Phaser.Tweens.Tween[];
    // Where it rests on the ground
    spot: { x: number, y: number };
}

// Draws the lanterns friends' encouragement left on the player's own island (see state/Lanterns). Tapping one opens
// its message, and the lantern floats away.
export class LanternLayer
{
    private scene: Scene;
    private ground: IslandGround;
    private canTap: () => boolean;
    private shown = new Map<number, ShownLantern>();

    // canTap says whether lanterns can be tapped right now (not while placing an item or sailing)
    constructor (scene: Scene, ground: IslandGround, canTap: () => boolean)
    {
        this.scene = scene;
        this.ground = ground;
        this.canTap = canTap;

        this.Sync(false);

        EventBus.on(GameEvents.LanternsChanged, this.HandleLanternsChanged, this);
        EventBus.on(GameEvents.LanternOpened, this.HandleLanternOpened, this);
        scene.events.once(Scenes.Events.SHUTDOWN, () => {
            EventBus.off(GameEvents.LanternsChanged, this.HandleLanternsChanged, this);
            EventBus.off(GameEvents.LanternOpened, this.HandleLanternOpened, this);
        });
    }

    private HandleLanternsChanged ()
    {
        this.Sync(true);
    }

    // Adds lanterns that aren't shown yet and removes ones that are gone
    private Sync (isArriving: boolean)
    {
        const lanternIds = new Set(lanterns.GetLanterns().map(lantern => lantern.id));

        for (const [ lanternId, shownLantern ] of this.shown)
        {
            if (!lanternIds.has(lanternId))
            {
                this.Remove(lanternId, shownLantern);
            }
        }

        for (const lantern of lanterns.GetLanterns())
        {
            if (!this.shown.has(lantern.id))
            {
                this.Show(lantern, isArriving);
            }
        }
    }

    private Show (lantern: LanternInfo, isArriving: boolean)
    {
        const settings = lanternSettings;
        const spot = this.FindSpot(lantern.id);

        if (!spot)
        {
            return;
        }

        const glow = this.scene.add.circle(spot.x, spot.y - 16, settings.glowRadiusPx, settings.glowColor, settings.glowAlphaMin);
        const sprite = this.scene.add.image(spot.x, spot.y, lanternArt.textureKey).setOrigin(0.5, 1);

        glow.setBlendMode(BlendModes.ADD);
        glow.setDepth(spot.y - 0.5);
        sprite.setDepth(spot.y);
        sprite.setInteractive({ useHandCursor: true });
        sprite.on(Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
            const movedDistance = PhaserMath.Distance.Between(pointer.downX, pointer.downY, pointer.x, pointer.y);

            if (this.canTap() && movedDistance <= settings.tapTolerance * GetScreenPixelsPerCssPixel())
            {
                lanterns.OpenLantern(lantern.id);
            }
        });

        const tweens = [
            this.scene.tweens.add({
                targets: glow,
                alpha: settings.glowAlphaMax,
                scale: 1.15,
                duration: settings.glowPulseMs,
                ease: 'Sine.easeInOut',
                yoyo: true,
                repeat: -1
            })
        ];

        if (isArriving)
        {
            // Drifts down onto the island, then bobs
            sprite.setAlpha(0).setY(spot.y - settings.arrivalDropPx);
            tweens.push(this.scene.tweens.add({
                targets: sprite,
                y: spot.y,
                alpha: 1,
                duration: settings.arrivalDurationMs,
                ease: 'Sine.easeOut',
                onComplete: () => tweens.push(this.StartBobbing(sprite, spot.y))
            }));
        }
        else
        {
            tweens.push(this.StartBobbing(sprite, spot.y));
        }

        this.shown.set(lantern.id, { sprite, glow, tweens, spot });
    }

    private StartBobbing (sprite: GameObjects.Image, restingY: number): Phaser.Tweens.Tween
    {
        return this.scene.tweens.add({
            targets: sprite,
            y: restingY - lanternSettings.bobHeightPx,
            duration: lanternSettings.bobDurationMs,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
    }

    // An opened lantern floats up and fades, released
    private HandleLanternOpened (payload: LanternOpenedPayload)
    {
        const shownLantern = this.shown.get(payload.lantern.id);

        if (!shownLantern)
        {
            return;
        }

        this.shown.delete(payload.lantern.id);
        shownLantern.sprite.disableInteractive();

        for (const tween of shownLantern.tweens)
        {
            tween.stop();
        }

        this.scene.tweens.add({
            targets: [ shownLantern.sprite, shownLantern.glow ],
            y: `-=${lanternSettings.departureRisePx}`,
            alpha: 0,
            duration: lanternSettings.departureDurationMs,
            ease: 'Sine.easeIn',
            onComplete: () => {
                shownLantern.sprite.destroy();
                shownLantern.glow.destroy();
            }
        });
    }

    private Remove (lanternId: number, shownLantern: ShownLantern)
    {
        for (const tween of shownLantern.tweens)
        {
            tween.stop();
        }

        shownLantern.sprite.destroy();
        shownLantern.glow.destroy();
        this.shown.delete(lanternId);
    }

    // Always the same spot for the same lantern, a little apart from the others where possible
    private FindSpot (lanternId: number): { x: number, y: number } | undefined
    {
        let fallbackSpot: { x: number, y: number } | undefined;

        for (let attempt = 0; attempt < lanternSettings.spotAttempts; attempt++)
        {
            const spot = this.ground.FindStandablePointFromSeed(lanternId * 31 + attempt);

            if (!spot)
            {
                return undefined;
            }

            fallbackSpot ??= spot;

            const isCrowded = [ ...this.shown.values() ].some(shownLantern =>
                PhaserMath.Distance.Between(spot.x, spot.y, shownLantern.spot.x, shownLantern.spot.y) < lanternSettings.minSpacingPx);

            if (!isCrowded)
            {
                return spot;
            }
        }

        return fallbackSpot;
    }
}
