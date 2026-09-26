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
    visitSideGapFraction: 0.3
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
    // Where the cat stands while hopping, so hops don't change which things it draws in front of
    private groundY = 0;
    // Overrides the next random wander destination once
    private nextWanderTarget?: { x: number, y: number };

    constructor (scene: Scene, x: number, y: number, texture: string, wanderBounds: Phaser.Geom.Rectangle, minIntervalMs = 2000, maxIntervalMs = 5000)
    {
        super(scene, x, y, texture);

        this.wanderBounds = wanderBounds;
        this.minIntervalMs = minIntervalMs;
        this.maxIntervalMs = maxIntervalMs;

        scene.add.existing(this);
        this.ScheduleNextWander();
    }

    // Hops excitedly, then walks over to stand beside the new item on its next wander
    CelebrateNewItem (itemX: number, itemBaseY: number, itemWidth: number)
    {
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
        this.wanderTimer = this.scene.time.addEvent({
            delay: delayMs,
            callback: this.WanderToNextPoint,
            callbackScope: this
        });
    }

    private WanderToNextPoint ()
    {
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

    protected preUpdate (time: number, delta: number)
    {
        super.preUpdate(time, delta);

        // Sort by where its feet are, so it walks in front of / behind placed items correctly
        const standingY = this.isCelebrating ? this.groundY : this.y;

        this.setDepth(standingY + this.displayHeight / 2);
    }

    destroy (fromScene?: boolean)
    {
        this.StopMoving();
        super.destroy(fromScene);
    }
}
