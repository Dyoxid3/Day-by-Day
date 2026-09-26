import { Scene, GameObjects, Math as PhaserMath } from 'phaser';
import { coinRewardSettings } from '../data/CoinRewardSettings';
import { WanderingCat } from '../entities/WanderingCat';
import { RequestCoinReward } from './CoinRewards';

export const coinTextureKey = 'coin';

const coinDropSettings = {
    coinScale: 0.16,
    // How far beside the cat the coin lands
    minThrowDistancePx: 14,
    maxThrowDistancePx: 28,
    throwHeightPx: 30,
    throwDurationMs: 480,
    bounceHeightPx: 9,
    bounceDurationMs: 200,
    // How long the coin sits on the ground before flying to the coin counter
    restDurationMs: 700,
    sparkleColor: 0xfff3b0
};

// A visiting cat now and then tosses a coin onto the ground, which then flies to the coin counter.
// Stops after coinRewardSettings.visitMaxDropsPerVisit coins.
export class VisitCoinDrops
{
    private scene: Scene;
    private cat: WanderingCat;
    private dropsLeft = coinRewardSettings.visitMaxDropsPerVisit;
    private timer?: Phaser.Time.TimerEvent;

    constructor (scene: Scene, cat: WanderingCat)
    {
        this.scene = scene;
        this.cat = cat;
        this.ScheduleNextDrop();
    }

    Stop ()
    {
        this.dropsLeft = 0;
        this.timer?.remove();
    }

    private ScheduleNextDrop ()
    {
        if (this.dropsLeft <= 0)
        {
            return;
        }

        const delayMs = PhaserMath.Between(coinRewardSettings.visitDropIntervalMinMs, coinRewardSettings.visitDropIntervalMaxMs);

        this.timer = this.scene.time.delayedCall(delayMs, () => this.DropCoin());
    }

    private DropCoin ()
    {
        if (!this.cat.active || this.dropsLeft <= 0)
        {
            return;
        }

        this.dropsLeft--;

        const settings = coinDropSettings;
        // The cat's position is where its feet are; the coin comes out of its middle
        const feetY = this.cat.y;
        const side = Math.random() < 0.5 ? -1 : 1;
        const startX = this.cat.x;
        const startY = this.cat.y - this.cat.GetStandingHeight() / 2;
        const landX = startX + side * PhaserMath.Between(settings.minThrowDistancePx, settings.maxThrowDistancePx);
        const landY = feetY + PhaserMath.Between(-4, 8);
        const coin = this.scene.add.image(startX, startY, coinTextureKey);

        coin.setOrigin(0.5, 1);
        coin.setScale(settings.coinScale);
        coin.setDepth(landY);

        // Tossed out in an arc, spinning (squashing sideways) as it flies
        this.scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: settings.throwDurationMs,
            ease: 'Linear',
            onUpdate: tween => {
                const progress = tween.getValue() ?? 0;

                coin.x = PhaserMath.Linear(startX, landX, progress);
                coin.y = PhaserMath.Linear(startY, landY, progress) - settings.throwHeightPx * 4 * progress * (1 - progress);
                coin.scaleX = settings.coinScale * Math.abs(Math.cos(progress * Math.PI * 3));
            },
            onComplete: () => {
                coin.setPosition(landX, landY);
                coin.setScale(settings.coinScale);
                this.PlayLanding(coin);
            }
        });

        this.ScheduleNextDrop();
    }

    private PlayLanding (coin: GameObjects.Image)
    {
        const settings = coinDropSettings;
        const sparkle = this.scene.add.ellipse(coin.x, coin.y - coin.displayHeight / 2, coin.displayWidth * 1.4, coin.displayWidth * 1.4, settings.sparkleColor, 0.8);

        sparkle.setDepth(coin.depth - 0.1);
        this.scene.tweens.add({
            targets: sparkle,
            scale: 1.8,
            alpha: 0,
            duration: 450,
            ease: 'Cubic.easeOut',
            onComplete: () => sparkle.destroy()
        });

        this.scene.tweens.add({
            targets: coin,
            y: coin.y - settings.bounceHeightPx,
            duration: settings.bounceDurationMs / 2,
            ease: 'Quad.easeOut',
            yoyo: true
        });

        this.scene.time.delayedCall(settings.restDurationMs, () => {
            if (!coin.active)
            {
                return;
            }

            RequestCoinReward(this.scene, coin.x, coin.y - coin.displayHeight / 2, coinRewardSettings.visitCoinsPerDrop);

            this.scene.tweens.add({
                targets: coin,
                scale: 0,
                alpha: 0,
                duration: 160,
                ease: 'Back.easeIn',
                onComplete: () => coin.destroy()
            });
        });
    }
}
