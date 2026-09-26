import { Scene, GameObjects, Math as PhaserMath } from 'phaser';

export const boatSettings = {
    // Boat image in public/assets (e.g. 'boat.png'). While empty, a ⛵ emoji stands in for it.
    imageFile: '',
    imageScale: 0.25,
    // Which way the art's front points; the boat flips to face where it's sailing
    imageFacesRight: true,
    placeholderEmoji: '⛵',
    placeholderFontSizePx: 64,
    placeholderFacesRight: false,
    bobHeightPx: 3,
    bobDurationMs: 1400,
    // Where passengers stand (drawn in front of the boat), as a fraction of the boat's height above its waterline
    seatHeightFraction: 0.22,
    sailSpeedPxPerSecond: 360,
    minSailDurationMs: 1100,
    maxSailDurationMs: 2600,
    // Little foam puffs left behind while sailing
    wakeIntervalMs: 90,
    wakeColor: 0xffffff
};

export const boatTextureKey = 'boat';

type Passenger = { x: number, y: number };

// A boat on the water, positioned by its waterline (bottom-center). Carries cats between islands.
export class Boat extends GameObjects.Container
{
    private visual: GameObjects.Image | GameObjects.Text;
    private facesRight: boolean;
    private bobTween?: Phaser.Tweens.Tween;

    constructor (scene: Scene, x: number, y: number)
    {
        super(scene, x, y);

        if (boatSettings.imageFile && scene.textures.exists(boatTextureKey))
        {
            this.visual = new GameObjects.Image(scene, 0, 0, boatTextureKey).setScale(boatSettings.imageScale);
            this.facesRight = boatSettings.imageFacesRight;
        }
        else
        {
            this.visual = new GameObjects.Text(scene, 0, 0, boatSettings.placeholderEmoji, {
                fontSize: `${boatSettings.placeholderFontSizePx}px`,
                // Emoji can poke past the normal text box
                padding: { top: 10, bottom: 6 },
                resolution: 2
            });
            this.facesRight = boatSettings.placeholderFacesRight;
        }

        this.visual.setOrigin(0.5, 1);
        this.add(this.visual);
        this.setDepth(y);

        scene.add.existing(this);
    }

    GetSeatPoint (): Passenger
    {
        return { x: this.x, y: this.y - this.visual.displayHeight * boatSettings.seatHeightFraction };
    }

    // Faces left (-1) or right (1)
    Face (direction: -1 | 1)
    {
        this.visual.setFlipX((direction > 0) !== this.facesRight);
    }

    StartBobbing ()
    {
        this.StopBobbing();
        this.bobTween = this.scene.tweens.add({
            targets: this.visual,
            y: -boatSettings.bobHeightPx,
            duration: boatSettings.bobDurationMs,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
    }

    StopBobbing ()
    {
        this.bobTween?.stop();
        this.bobTween = undefined;
        this.visual.y = 0;
    }

    // Sails to a point, carrying the passengers along; resolves on arrival
    SailTo (targetX: number, targetY: number, passengers: Passenger[] = []): Promise<void>
    {
        const startX = this.x;
        const startY = this.y;
        const passengerOffsets = passengers.map(passenger => ({ passenger, offsetX: passenger.x - startX, offsetY: passenger.y - startY }));
        const distance = PhaserMath.Distance.Between(startX, startY, targetX, targetY);
        const durationMs = PhaserMath.Clamp(
            (distance / boatSettings.sailSpeedPxPerSecond) * 1000,
            boatSettings.minSailDurationMs,
            boatSettings.maxSailDurationMs
        );
        let lastWakeTime = 0;

        this.StopBobbing();
        this.Face(targetX >= startX ? 1 : -1);

        return new Promise(resolve => {
            this.scene.tweens.addCounter({
                from: 0,
                to: 1,
                duration: durationMs,
                ease: 'Sine.easeInOut',
                onUpdate: tween => {
                    const progress = tween.getValue() ?? 0;
                    // A gentle rise and fall on the waves while moving
                    const waveOffset = Math.sin(progress * Math.PI * 8) * 2;

                    this.setPosition(PhaserMath.Linear(startX, targetX, progress), PhaserMath.Linear(startY, targetY, progress) + waveOffset);
                    this.setDepth(this.y);

                    for (const { passenger, offsetX, offsetY } of passengerOffsets)
                    {
                        passenger.x = this.x + offsetX;
                        passenger.y = this.y + offsetY;
                    }

                    if (this.scene.time.now - lastWakeTime >= boatSettings.wakeIntervalMs)
                    {
                        lastWakeTime = this.scene.time.now;
                        this.SpawnWakePuff(targetX >= startX ? -1 : 1);
                    }
                },
                onComplete: () => resolve()
            });
        });
    }

    private SpawnWakePuff (behindDirection: -1 | 1)
    {
        const width = this.visual.displayWidth;
        const puff = this.scene.add.ellipse(
            this.x + behindDirection * width * (0.3 + Math.random() * 0.15),
            this.y - 2 - Math.random() * 4,
            10 + Math.random() * 8,
            5 + Math.random() * 3,
            boatSettings.wakeColor,
            0.8
        );

        puff.setDepth(this.depth - 0.5);

        this.scene.tweens.add({
            targets: puff,
            x: puff.x + behindDirection * (12 + Math.random() * 10),
            scale: 2,
            alpha: 0,
            duration: 650,
            ease: 'Cubic.easeOut',
            onComplete: () => puff.destroy()
        });
    }
}
