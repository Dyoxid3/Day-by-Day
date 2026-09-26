import { Scene, GameObjects, Math as PhaserMath } from 'phaser';

const catSettings = {
    walkSpeedPxPerSecond: 100,
    celebrationHopCount: 3,
    celebrationHopHeightPx: 14,
    // One full hop (up and back down)
    celebrationHopDurationMs: 260,
    // Wait before hopping, so the reaction starts as the item lands
    celebrationDelayMs: 150,
    // Pause after celebrating before walking over to the new item
    visitDelayMinMs: 300,
    visitDelayMaxMs: 800,
    // How far past the item's side edge the cat stands, as a fraction of the cat's width
    visitSideGapFraction: 0.3,
    // A single hop from one spot to another, like onto a boat
    hopHeightPx: 36,
    hopDurationMs: 420,
    // Name shown above visiting cats
    nameTagFontSizePx: 14,
    nameTagGapPx: 4,
    // Keeps name tags above everything on the island (the item placement preview sits higher still)
    nameTagDepth: 90000
};

/**
 * A cat sprite that picks a random point within its bounds at random
 * intervals and wanders there. Not player-controlled.
 */
export class WanderingCat extends GameObjects.Sprite
{
    private wanderBounds: Phaser.Geom.Rectangle;
    private minIntervalMs: number;
    private maxIntervalMs: number;
    private wanderTimer?: Phaser.Time.TimerEvent;
    private activeTween?: Phaser.Tweens.Tween;
    private celebrationTween?: Phaser.Tweens.Tween;
    private isCelebrating = false;
    private isWanderingPaused = false;
    // Where the cat stands while hopping, so hops don't change which things it draws in front of
    private groundY = 0;
    private isAirborne = false;
    // Overrides the next random wander destination once
    private nextWanderTarget?: { x: number, y: number };
    private nameTag?: GameObjects.Text;
    // While aboard a boat, the cat draws just in front of it instead of sorting by where its feet are
    private ridingBoat: { depth: number } | null = null;

    constructor (scene: Scene, x: number, y: number, texture: string, wanderBounds: Phaser.Geom.Rectangle, minIntervalMs = 2000, maxIntervalMs = 5000)
    {
        super(scene, x, y, texture);

        this.wanderBounds = wanderBounds;
        this.minIntervalMs = minIntervalMs;
        this.maxIntervalMs = maxIntervalMs;

        scene.add.existing(this);
        this.ScheduleNextWander();
    }

    SetNameTag (name: string)
    {
        this.nameTag?.destroy();
        this.nameTag = this.scene.add.text(this.x, this.y, name, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: `${catSettings.nameTagFontSizePx}px`,
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#3a3226',
            strokeThickness: 4,
            // Stays crisp when the camera zooms in
            resolution: 3
        });
        this.nameTag.setOrigin(0.5, 1);
        this.nameTag.setDepth(catSettings.nameTagDepth);
        this.UpdateNameTag();
    }

    // Pass the boat when climbing aboard, and null once back on land
    SetRidingBoat (boat: { depth: number } | null)
    {
        this.ridingBoat = boat;
    }

    // Stops wandering (e.g. for boat trips) until ResumeWandering
    StopWandering ()
    {
        this.isWanderingPaused = true;
        this.StopMoving();
    }

    ResumeWandering (delayMs?: number)
    {
        this.isWanderingPaused = false;
        this.ScheduleNextWander(delayMs);
    }

    // Walks straight to a point; resolves on arrival
    WalkTo (x: number, y: number, speedMultiplier = 1): Promise<void>
    {
        this.StopMoving();

        const distance = PhaserMath.Distance.Between(this.x, this.y, x, y);
        const durationMs = (distance / (catSettings.walkSpeedPxPerSecond * speedMultiplier)) * 1000;

        return new Promise(resolve => {
            if (durationMs < 16)
            {
                this.setPosition(x, y);
                resolve();
                return;
            }

            this.activeTween = this.scene.tweens.add({
                targets: this,
                x,
                y,
                duration: durationMs,
                ease: 'Sine.easeInOut',
                onComplete: () => resolve()
            });
        });
    }

    // Jumps in an arc to a point; resolves on landing
    HopTo (x: number, y: number): Promise<void>
    {
        this.StopMoving();

        const startX = this.x;
        const startY = this.y;

        this.groundY = startY;
        this.isAirborne = true;

        return new Promise(resolve => {
            this.activeTween = this.scene.tweens.addCounter({
                from: 0,
                to: 1,
                duration: catSettings.hopDurationMs,
                ease: 'Linear',
                onUpdate: tween => {
                    const progress = tween.getValue() ?? 0;

                    this.groundY = PhaserMath.Linear(startY, y, progress);
                    this.x = PhaserMath.Linear(startX, x, progress);
                    this.y = this.groundY - catSettings.hopHeightPx * 4 * progress * (1 - progress);
                },
                onComplete: () => {
                    this.isAirborne = false;
                    this.setPosition(x, y);
                    resolve();
                }
            });
        });
    }

    // Hops excitedly, then walks over to stand beside the new item on its next wander
    CelebrateNewItem (itemX: number, itemBaseY: number, itemWidth: number)
    {
        if (this.isWanderingPaused)
        {
            return;
        }

        this.StopMoving();
        this.nextWanderTarget = this.GetSpotBesideItem(itemX, itemBaseY, itemWidth);
        this.wanderTimer = this.scene.time.delayedCall(catSettings.celebrationDelayMs, this.PlayCelebrationHops, [], this);
    }

    private PlayCelebrationHops ()
    {
        this.isCelebrating = true;
        this.groundY = this.y;

        // Yoyo plays the ease in reverse on the way down, giving a gravity-like fall
        this.celebrationTween = this.scene.tweens.add({
            targets: this,
            y: this.groundY - catSettings.celebrationHopHeightPx,
            duration: catSettings.celebrationHopDurationMs / 2,
            ease: 'Quad.easeOut',
            yoyo: true,
            repeat: catSettings.celebrationHopCount - 1,
            onComplete: () => {
                this.y = this.groundY;
                this.isCelebrating = false;
                this.ScheduleNextWander(PhaserMath.Between(catSettings.visitDelayMinMs, catSettings.visitDelayMaxMs));
            }
        });
    }

    private StopMoving ()
    {
        this.wanderTimer?.remove();
        this.activeTween?.stop();

        if (this.isCelebrating)
        {
            this.celebrationTween?.stop();
            this.y = this.groundY;
            this.isCelebrating = false;
        }

        if (this.isAirborne)
        {
            this.y = this.groundY;
            this.isAirborne = false;
        }
    }

    private GetSpotBesideItem (itemX: number, itemBaseY: number, itemWidth: number)
    {
        const sideOffset = itemWidth / 2 + this.displayWidth * (0.5 + catSettings.visitSideGapFraction);
        const nearSide = this.x < itemX ? -1 : 1;
        const nearSpotX = itemX + nearSide * sideOffset;
        const farSpotX = itemX - nearSide * sideOffset;
        const bounds = this.wanderBounds;

        // Prefer the side the cat is already on, unless that side is off the ground
        const spotX = nearSpotX >= bounds.left && nearSpotX <= bounds.right ? nearSpotX : farSpotX;
        // Line the cat's feet up with the item's base
        const spotY = itemBaseY - this.displayHeight / 2;

        return {
            x: PhaserMath.Clamp(spotX, bounds.left, bounds.right),
            y: PhaserMath.Clamp(spotY, bounds.top, bounds.bottom)
        };
    }

    private ScheduleNextWander (delayMs = PhaserMath.Between(this.minIntervalMs, this.maxIntervalMs))
    {
        if (this.isWanderingPaused)
        {
            return;
        }

        this.wanderTimer?.remove();
        this.wanderTimer = this.scene.time.addEvent({
            delay: delayMs,
            callback: this.WanderToNextPoint,
            callbackScope: this
        });
    }

    private WanderToNextPoint ()
    {
        if (this.isWanderingPaused)
        {
            return;
        }

        const target = this.nextWanderTarget ?? {
            x: PhaserMath.Between(this.wanderBounds.left, this.wanderBounds.right),
            y: PhaserMath.Between(this.wanderBounds.top, this.wanderBounds.bottom)
        };

        this.nextWanderTarget = undefined;

        const distance = PhaserMath.Distance.Between(this.x, this.y, target.x, target.y);
        const durationMs = (distance / catSettings.walkSpeedPxPerSecond) * 1000;

        this.activeTween = this.scene.tweens.add({
            targets: this,
            x: target.x,
            y: target.y,
            duration: durationMs,
            ease: 'Linear',
            onComplete: () => this.ScheduleNextWander()
        });
    }

    private UpdateNameTag ()
    {
        this.nameTag?.setPosition(this.x, this.y - this.displayHeight / 2 - catSettings.nameTagGapPx);
    }

    protected preUpdate (time: number, delta: number)
    {
        super.preUpdate(time, delta);

        if (this.ridingBoat)
        {
            this.setDepth(this.ridingBoat.depth + 1);
        }
        else
        {
            // Sort by where its feet are, so it walks in front of / behind placed items correctly
            const standingY = this.isCelebrating || this.isAirborne ? this.groundY : this.y;

            this.setDepth(standingY + this.displayHeight / 2);
        }

        this.UpdateNameTag();
    }

    destroy (fromScene?: boolean)
    {
        this.StopMoving();
        this.nameTag?.destroy();
        super.destroy(fromScene);
    }
}
