import { Scene, GameObjects, Math as PhaserMath } from 'phaser';
import {
    catAppearance,
    catTextureKeys,
    GetCatAnimationKey,
    GetCatFaceTextureKey,
    type CatExpression,
    type CatFacing
} from '../data/CatAppearance';
import type { IslandGround } from '../systems/IslandGround';

const catSettings = {
    walkSpeedPxPerSecond: 70,
    // How much faster the cat moves when hurrying: to a boat, or over to a prop that was just placed
    runSpeedMultiplier: 3.5,
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
    // The cat shows its back when walking up the screen more steeply than this (up per sideways)
    backFacingSlope: 0.35,
    // After its face changes, the cat keeps facing the camera this long so the change can be seen
    faceFrontAfterExpressionMs: 1500,
    // Quick stretch when the face changes, so the change is noticeable
    expressionPopScale: 1.12,
    expressionPopDurationMs: 180,
    // Name shown above visiting cats (the pixel font is crisp at multiples of 8px)
    nameTagFontSizePx: 16,
    nameTagGapPx: 3,
    // Keeps name tags above everything on the island (the item placement preview sits higher still)
    nameTagDepth: 90000
};

/**
 * The cat: a body sprite (walking and idle animations, facing the camera or away), with its head and face
 * drawn on top, positioned by its feet. Picks a random spot on the island's walkable ground at random
 * intervals and wanders there. Not player-controlled.
 */
export class WanderingCat extends GameObjects.Sprite
{
    private ground: IslandGround;
    private minIntervalMs: number;
    private maxIntervalMs: number;
    private headImage: GameObjects.Image;
    private faceImage: GameObjects.Image;
    private expression: CatExpression = 'default';
    private facing: CatFacing = 'front';
    // Which way the current walk points; the cat shows it unless it's turned to the camera for a new face
    private walkFacing: CatFacing = 'front';
    private faceFrontUntil = 0;
    private isWalking = false;
    private isIdleAnimationEnabled = true;
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
    // The overridden destination above should be hurried to (running to see a newly placed prop)
    private nextWanderIsRun = false;
    // Where the current wander is heading, so it can carry on after pausing to show a new face
    private walkTarget?: { x: number, y: number };
    private nameTag?: GameObjects.Text;
    // While aboard a boat, the cat draws just in front of it instead of sorting by where its feet are
    private ridingBoat: { depth: number } | null = null;

    constructor (scene: Scene, x: number, y: number, ground: IslandGround, minIntervalMs = 2000, maxIntervalMs = 5000)
    {
        super(scene, x, y, catTextureKeys.bodySheet, catAppearance.bodyFrames.front.stand);

        const feetOrigin = catAppearance.feetLine / catAppearance.frameSize;

        CreateCatAnimations(scene);

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

    // A sad cat stands still instead of doing its idle breathing
    SetIdleAnimationEnabled (isEnabled: boolean)
    {
        this.isIdleAnimationEnabled = isEnabled;
    }

    SetExpression (expression: CatExpression)
    {
        if (expression === this.expression)
        {
            return;
        }

        this.expression = expression;
        this.faceImage.setTexture(GetCatFaceTextureKey(expression));

        // During boat trips the cat keeps going and just swaps faces
        if (!this.isWanderingPaused)
        {
            this.PauseToShowFace();
        }

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
        // The pixel font only has lowercase letters
        this.nameTag = this.scene.add.text(this.x, this.y, name.toLowerCase(), {
            fontFamily: '"Island Pixel", system-ui, sans-serif',
            fontSize: `${catSettings.nameTagFontSizePx}px`,
            color: '#ffffff',
            stroke: '#3a3226',
            strokeThickness: 4,
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

            this.StartWalking(x, y);
            this.activeTween = this.scene.tweens.add({
                targets: this,
                x,
                y,
                duration: durationMs,
                ease: 'Sine.easeInOut',
                onComplete: () => {
                    this.isWalking = false;
                    resolve();
                }
            });
        });
    }

    // Jumps in an arc to a point (where its feet land); resolves on landing
    HopTo (x: number, y: number): Promise<void>
    {
        this.StopMoving();

        const startX = this.x;
        const startY = this.y;

        this.walkFacing = this.GetFacingToward(x, y);
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
        this.nextWanderIsRun = true;
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

    // Stops and faces the camera for a moment so a new face can be seen, then carries on where it was going
    private PauseToShowFace ()
    {
        this.facing = 'front';
        this.faceFrontUntil = this.scene.time.now + catSettings.faceFrontAfterExpressionMs;

        if (this.isWalking)
        {
            const interruptedTarget = this.walkTarget;

            this.StopMoving();
            this.nextWanderTarget ??= interruptedTarget;
            // Starts walking again once the pause is over (see WanderToNextPoint)
            this.ScheduleNextWander(0);
        }
    }

    private StartWalking (targetX: number, targetY: number)
    {
        this.walkFacing = this.GetFacingToward(targetX, targetY);
        this.isWalking = true;
    }

    // Away from the camera when heading up the screen, toward it otherwise
    private GetFacingToward (targetX: number, targetY: number): CatFacing
    {
        const deltaX = targetX - this.x;
        const deltaY = targetY - this.y;

        return deltaY < -Math.abs(deltaX) * catSettings.backFacingSlope ? 'back' : 'front';
    }

    private StopMoving ()
    {
        this.wanderTimer?.remove();
        this.activeTween?.stop();
        this.isWalking = false;
        this.walkTarget = undefined;

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

        // Still showing off a new face: waits until that's over, so it never walks away mid-pause
        const pauseLeftMs = this.faceFrontUntil - this.scene.time.now;

        if (pauseLeftMs > 0)
        {
            this.ScheduleNextWander(pauseLeftMs);
            return;
        }

        const target = this.nextWanderTarget ?? this.PickWanderTarget();
        const isRun = this.nextWanderTarget !== undefined && this.nextWanderIsRun;

        this.nextWanderTarget = undefined;
        this.nextWanderIsRun = false;

        if (!target)
        {
            this.ScheduleNextWander();
            return;
        }

        const distance = PhaserMath.Distance.Between(this.x, this.y, target.x, target.y);
        const speed = catSettings.walkSpeedPxPerSecond * (isRun ? catSettings.runSpeedMultiplier : 1);
        const durationMs = (distance / speed) * 1000;

        this.walkTarget = target;
        this.StartWalking(target.x, target.y);
        this.activeTween = this.scene.tweens.add({
            targets: this,
            x: target.x,
            y: target.y,
            duration: durationMs,
            ease: 'Linear',
            onComplete: () => {
                this.isWalking = false;
                this.walkTarget = undefined;
                this.ScheduleNextWander();
            }
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

    // Walking plays the walk cycle; standing plays the idle breathing (unless it's turned off, like for a
    // sad cat); hopping and riding boats hold the standing frame
    private UpdateBodyAnimation ()
    {
        // Same clock SetExpression uses for faceFrontUntil
        const isShowingNewFace = this.scene.time.now < this.faceFrontUntil;

        if (!isShowingNewFace && (this.isWalking || this.isAirborne))
        {
            this.facing = this.walkFacing;
        }

        if (this.isWalking)
        {
            this.anims.play(GetCatAnimationKey('walk', this.facing), true);
        }
        else if (this.isIdleAnimationEnabled && !this.isAirborne && !this.isCelebrating && !this.ridingBoat)
        {
            this.anims.play(GetCatAnimationKey('idle', this.facing), true);
        }
        else
        {
            const standFrame = catAppearance.bodyFrames[this.facing].stand;

            if (this.anims.isPlaying)
            {
                this.anims.stop();
            }

            if (Number(this.frame.name) !== standFrame)
            {
                this.setFrame(standFrame);
            }
        }
    }

    // Keeps the head, face and name tag on the body
    private SyncLayers ()
    {
        const bodyFrame = Number(this.frame.name);
        const isIdleFrame = bodyFrame === catAppearance.bodyFrames.front.idle || bodyFrame === catAppearance.bodyFrames.back.idle;
        const headKey = isIdleFrame ? catTextureKeys.idleHead : catTextureKeys.head;

        if (this.headImage.texture.key !== headKey)
        {
            this.headImage.setTexture(headKey);
        }

        for (const layer of [ this.headImage, this.faceImage ])
        {
            layer.setPosition(this.x, this.y);
            layer.setScale(this.scaleX, this.scaleY);
            layer.setAlpha(this.alpha);
        }

        this.headImage.setVisible(this.visible);
        // Facing away, there's no face to see
        this.faceImage.setVisible(this.visible && this.facing === 'front');
        this.headImage.setDepth(this.depth + 0.001);
        this.faceImage.setDepth(this.depth + 0.002);
        this.nameTag?.setPosition(this.x, this.y - this.GetStandingHeight() - catSettings.nameTagGapPx);
    }

    protected preUpdate (time: number, delta: number)
    {
        this.UpdateBodyAnimation();
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

// Walk cycles (step, stand, step, stand) and idle breathing (stand, then idle) for each facing.
// Animations belong to the whole game, so they're only made once.
function CreateCatAnimations (scene: Scene)
{
    for (const facing of [ 'front', 'back' ] as const)
    {
        const frames = catAppearance.bodyFrames[facing];
        const walkKey = GetCatAnimationKey('walk', facing);
        const idleKey = GetCatAnimationKey('idle', facing);
        const ToFrames = (frameNumbers: number[]) => frameNumbers.map(frame => ({ key: catTextureKeys.bodySheet, frame }));

        if (!scene.anims.exists(walkKey))
        {
            scene.anims.create({
                key: walkKey,
                frames: ToFrames([ frames.firstStep, frames.stand, frames.secondStep, frames.stand ]),
                frameRate: catAppearance.walkFramesPerSecond,
                repeat: -1
            });
        }

        if (!scene.anims.exists(idleKey))
        {
            scene.anims.create({
                key: idleKey,
                // Each frame shows for its own duration
                frames: [
                    { key: catTextureKeys.bodySheet, frame: frames.stand, duration: catAppearance.idleStandMs },
                    { key: catTextureKeys.bodySheet, frame: frames.idle, duration: catAppearance.idleBreathMs }
                ],
                repeat: -1
            });
        }
    }
}
