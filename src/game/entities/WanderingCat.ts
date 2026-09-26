import { Scene, GameObjects, Math as PhaserMath } from 'phaser';
import { catAppearance, catTextureKeys, GetCatFaceTextureKey, type CatExpression } from '../data/CatAppearance';
import type { IslandGround } from '../systems/IslandGround';

const catSettings = {
    walkSpeedPxPerSecond: 70,
    celebrationHopCount: 3,
    celebrationHopHeightPx: 14,
    // One full hop (up and back down)
    celebrationHopDurationMs: 260,
    // Wait before hopping, so the reaction starts as the item lands
    celebrationDelayMs: 150,
    // Pause after celebrating before walking over to the new item
    visitDelayMinMs: 300,
    visitDelayMaxMs: 800,
    // Gap between the cat and the item's side when it goes to look at a new item
    visitSideGapPx: 6,
    // A single hop from one spot to another, like onto a boat
    hopHeightPx: 36,
    hopDurationMs: 420,
    // Random spots tried when picking where to wander next (some can't be reached in a straight line)
    wanderAttempts: 25,
    minWanderDistancePx: 24,
    // Quick stretch when the face changes, so the change is noticeable
    expressionPopScale: 1.12,
    expressionPopDurationMs: 180,
    // Name shown above visiting cats
    nameTagFontSizePx: 12,
    nameTagGapPx: 3,
    // Keeps name tags above everything on the island (the item placement preview sits higher still)
    nameTagDepth: 90000
};

/**
 * The cat: body, head and face images stacked on top of each other, positioned by its feet. Picks a random
 * spot on the island's walkable ground at random intervals and wanders there. Not player-controlled.
 */
export class WanderingCat extends GameObjects.Sprite
{
    private ground: IslandGround;
    private minIntervalMs: number;
    private maxIntervalMs: number;
    private headImage: GameObjects.Image;
    private faceImage: GameObjects.Image;
    private expression: CatExpression = 'default';
    // Size when not mid-animation
    private restingScale = 1;
    private expressionPopTween?: Phaser.Tweens.Tween;
    private wanderTimer?: Phaser.Time.TimerEvent;
    private activeTween?: Phaser.Tweens.Tween;
    private celebrationTween?: Phaser.Tweens.Tween;
    private randomExpressionTimer?: Phaser.Time.TimerEvent;
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

    constructor (scene: Scene, x: number, y: number, ground: IslandGround, minIntervalMs = 2000, maxIntervalMs = 5000)
    {
        super(scene, x, y, catTextureKeys.body);

        const feetOrigin = catAppearance.feetLine / catAppearance.frameSize;

        this.ground = ground;
        this.minIntervalMs = minIntervalMs;
        this.maxIntervalMs = maxIntervalMs;
        this.setOrigin(0.5, feetOrigin);

        this.headImage = scene.add.image(x, y, catTextureKeys.head).setOrigin(0.5, feetOrigin);
        this.faceImage = scene.add.image(x, y, GetCatFaceTextureKey(this.expression)).setOrigin(0.5, feetOrigin);

        scene.add.existing(this);
        this.SyncLayers();
        this.ScheduleNextWander();
    }

    SetRestingScale (scale: number)
    {
        this.restingScale = scale;
        this.setScale(scale);
    }

    // Height from the feet to the top of the head, in world units
    GetStandingHeight (): number
    {
        return (catAppearance.feetLine - catAppearance.headTop) * this.restingScale;
    }

    SetExpression (expression: CatExpression)
    {
        if (expression === this.expression)
        {
            return;
        }

        this.expression = expression;
        this.faceImage.setTexture(GetCatFaceTextureKey(expression));

        this.expressionPopTween?.stop();
        this.setScale(this.restingScale * catSettings.expressionPopScale);
        this.expressionPopTween = this.scene.tweens.add({
            targets: this,
            scaleX: this.restingScale,
            scaleY: this.restingScale,
            duration: catSettings.expressionPopDurationMs,
            ease: 'Back.easeOut'
        });
    }

    // For other players' cats: now and then shows one of these faces at random
    StartRandomExpressions (expressions: CatExpression[], minDelayMs = 7000, maxDelayMs = 14000)
    {
        this.randomExpressionTimer?.remove();
        this.randomExpressionTimer = this.scene.time.addEvent({
            delay: PhaserMath.Between(minDelayMs, maxDelayMs),
            callback: () => {
                this.SetExpression(expressions[PhaserMath.Between(0, expressions.length - 1)]);
                this.StartRandomExpressions(expressions, minDelayMs, maxDelayMs);
            }
        });
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
            strokeThickness: 3,
            // Stays crisp when the camera zooms in
            resolution: 4
        });
        this.nameTag.setOrigin(0.5, 1);
        this.nameTag.setDepth(catSettings.nameTagDepth);
        this.SyncLayers();
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

    // Walks straight to a point (where its feet end up); resolves on arrival
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

    // Jumps in an arc to a point (where its feet land); resolves on landing
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

    // Hops excitedly, then walks over to stand beside the new item on its next wander (if it can get there)
    CelebrateNewItem (itemX: number, itemBaseY: number, itemWidth: number)
    {
        if (this.isWanderingPaused)
        {
            return;
        }

        this.StopMoving();
        this.nextWanderTarget = this.FindSpotBesideItem(itemX, itemBaseY, itemWidth);
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

    // Beside the item (the near side if possible), lined up with its base, as long as the cat can walk there
    private FindSpotBesideItem (itemX: number, itemBaseY: number, itemWidth: number)
    {
        const sideOffset = itemWidth / 2 + this.displayWidth * 0.25 + catSettings.visitSideGapPx;
        const nearSide = this.x < itemX ? -1 : 1;

        for (const side of [ nearSide, -nearSide ])
        {
            const spot = { x: itemX + side * sideOffset, y: itemBaseY };

            if (this.ground.IsStandable(spot.x, spot.y) && this.CanWalkTo(spot.x, spot.y))
            {
                return spot;
            }
        }

        return undefined;
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

        const target = this.nextWanderTarget ?? this.PickWanderTarget();

        this.nextWanderTarget = undefined;

        if (!target)
        {
            this.ScheduleNextWander();
            return;
        }

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

    // A random standable spot the cat can reach in a straight line without crossing water or cliffs
    private PickWanderTarget ()
    {
        for (let attempt = 0; attempt < catSettings.wanderAttempts; attempt++)
        {
            const point = this.ground.FindRandomStandablePoint();

            if (point
                && PhaserMath.Distance.Between(this.x, this.y, point.x, point.y) >= catSettings.minWanderDistancePx
                && this.CanWalkTo(point.x, point.y))
            {
                return point;
            }
        }

        return undefined;
    }

    private CanWalkTo (x: number, y: number): boolean
    {
        // A cat that's somehow off the walkable ground may walk anywhere, so it can't get stuck
        return !this.ground.IsWalkable(this.x, this.y) || this.ground.IsPathClear(this.x, this.y, x, y);
    }

    // Keeps the head, face and name tag on the body
    private SyncLayers ()
    {
        for (const layer of [ this.headImage, this.faceImage ])
        {
            layer.setPosition(this.x, this.y);
            layer.setScale(this.scaleX, this.scaleY);
            layer.setAlpha(this.alpha);
            layer.setVisible(this.visible);
        }

        this.headImage.setDepth(this.depth + 0.001);
        this.faceImage.setDepth(this.depth + 0.002);
        this.nameTag?.setPosition(this.x, this.y - this.GetStandingHeight() - catSettings.nameTagGapPx);
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
            // Sorted by where its feet are, so it walks in front of / behind placed items correctly
            this.setDepth(this.isCelebrating || this.isAirborne ? this.groundY : this.y);
        }

        this.SyncLayers();
    }

    destroy (fromScene?: boolean)
    {
        this.StopMoving();
        this.randomExpressionTimer?.remove();
        this.headImage?.destroy();
        this.faceImage?.destroy();
        this.nameTag?.destroy();
        super.destroy(fromScene);
    }
}
