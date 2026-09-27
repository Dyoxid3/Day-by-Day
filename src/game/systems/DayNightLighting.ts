import { Scene, Scenes } from 'phaser';
import { lightingSettings } from '../data/DaySettings';
import { gameClock } from '../state/GameClock';

interface Tint
{
    red: number;
    green: number;
    blue: number;
}

// How quickly the shown light catches up with the time of day. Normally the clock moves so slowly this changes
// nothing, but when the time jumps (the debug menu) the light fades over a couple of seconds instead of snapping.
const catchUpPerSecond = 1.5;

// Dims the island toward a cool blue at night and brightens it again in the morning, with a warm touch in between.
// Follows the game's clock (see GameClock) and changes smoothly. Settings are in DaySettings (lightingSettings).
export class DayNightLighting
{
    private filter: Phaser.Filters.ColorMatrix;
    private shownTint: Tint;
    // How dark it looks right now (0 in the day, 1 at full night), catching up with the clock like the tint
    private shownNight: number;

    constructor (scene: Scene)
    {
        // Applied to everything the camera draws, the sea behind the island included
        this.filter = scene.cameras.main.filters.internal.addColorMatrix();
        this.shownTint = GetTintForHour(gameClock.GetHourOfDay());
        this.shownNight = GetNightAmount(gameClock.GetHourOfDay());
        this.Apply();

        scene.events.on(Scenes.Events.UPDATE, this.Update, this);
        scene.events.once(Scenes.Events.SHUTDOWN, () => scene.events.off(Scenes.Events.UPDATE, this.Update, this));
    }

    // For lights that switch on as it gets dark (see scenes/IslandLights)
    GetNightAmount (): number
    {
        return this.shownNight;
    }

    private Update (_time: number, delta: number)
    {
        const targetTint = GetTintForHour(gameClock.GetHourOfDay());
        const amount = 1 - Math.exp(-catchUpPerSecond * delta / 1000);

        this.shownNight += (GetNightAmount(gameClock.GetHourOfDay()) - this.shownNight) * amount;

        this.shownTint = {
            red: this.shownTint.red + (targetTint.red - this.shownTint.red) * amount,
            green: this.shownTint.green + (targetTint.green - this.shownTint.green) * amount,
            blue: this.shownTint.blue + (targetTint.blue - this.shownTint.blue) * amount
        };
        this.Apply();
    }

    private Apply ()
    {
        const { red, green, blue } = this.shownTint;
        const isDaylight = Math.abs(red - 1) + Math.abs(green - 1) + Math.abs(blue - 1) < 0.002;

        // In full daylight the filter is switched off, so the island is drawn exactly as the art is
        this.filter.setActive(!isDaylight);

        if (!isDaylight)
        {
            this.filter.colorMatrix.set([
                red, 0, 0, 0, 0,
                0, green, 0, 0, 0,
                0, 0, blue, 0, 0,
                0, 0, 0, 1, 0
            ]);
        }
    }
}

// 0 in the day, 1 at night, easing in and out over the fades before and after
function GetNightAmount (hour: number): number
{
    const { nightStartHour, nightEndHour, fadeHours } = lightingSettings;
    // Hours since night began, wrapping past midnight
    const hoursIntoNight = (hour - nightStartHour + 24) % 24;
    const nightLength = (nightEndHour - nightStartHour + 24) % 24;

    if (hoursIntoNight <= nightLength)
    {
        return 1;
    }

    const hoursAfterNight = hoursIntoNight - nightLength;
    const hoursBeforeNight = 24 - hoursIntoNight;

    if (hoursBeforeNight < fadeHours)
    {
        return SmoothStep(1 - hoursBeforeNight / fadeHours);
    }

    if (hoursAfterNight < fadeHours)
    {
        return SmoothStep(1 - hoursAfterNight / fadeHours);
    }

    return 0;
}

function GetTintForHour (hour: number): Tint
{
    const night = GetNightAmount(hour);
    // Strongest halfway through a fade (sunset and sunrise), none at full day or full night
    const warmth = 4 * night * (1 - night);
    const { nightTint, duskTint } = lightingSettings;

    return {
        red: Mix(1, nightTint.red, night) * Mix(1, duskTint.red, warmth),
        green: Mix(1, nightTint.green, night) * Mix(1, duskTint.green, warmth),
        blue: Mix(1, nightTint.blue, night) * Mix(1, duskTint.blue, warmth)
    };
}

function Mix (from: number, to: number, amount: number): number
{
    return from + (to - from) * amount;
}

function SmoothStep (amount: number): number
{
    const clamped = Math.min(1, Math.max(0, amount));

    return clamped * clamped * (3 - 2 * clamped);
}
