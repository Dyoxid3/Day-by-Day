import { Scene, Scenes, BlendModes, GameObjects, Cameras } from 'phaser';
import type { PlacedItem, PropLightPlacement } from '../entities/PlacedItem';

export const islandLightsSceneKey = 'IslandLights';

// The pixel-art look of every glow: the light steps down in bands from the middle outward (distance from the middle,
// 0 to 1, and how bright that band is)
const glowBands: [ number, number ][] = [
    [ 0.34, 1 ],
    [ 0.58, 0.66 ],
    [ 0.8, 0.4 ],
    [ 1, 0.18 ]
];
// Pools of light on the ground are this much flatter than they are wide
const groundFlattening = 0.42;

// What the lights follow: the island scene's camera and props, and how dark it is
export interface IslandLightsTarget
{
    camera: Cameras.Scene2D.Camera;
    GetItems: () => readonly PlacedItem[];
    // 0 in the day, 1 at full night
    GetNightAmount: () => number;
}

interface Glow
{
    halo: GameObjects.Image;
    ground: GameObjects.Image;
}

let currentTarget: IslandLightsTarget | null = null;

// Called by the island scene each time it starts (and with null as it shuts down)
export function SetIslandLightsTarget (target: IslandLightsTarget | null)
{
    currentTarget = target;
}

// Lamps and other props that light up at night. The island scene's night darkening is a filter on its whole camera,
// so anything drawn there is darkened too; these glows are drawn by this scene instead, on top of the island with no
// darkening, adding warm light to the dark around each lit prop. Its camera copies the island scene's every frame.
export class IslandLights extends Scene
{
    private glows: Glow[] = [];

    constructor ()
    {
        super(islandLightsSceneKey);
    }

    create ()
    {
        this.glows = [];

        // Just before drawing: Phaser updates the scenes above first, so during update the island's camera and props
        // haven't moved for this frame yet
        this.events.on(Scenes.Events.PRE_RENDER, this.FollowIsland, this);
        this.events.once(Scenes.Events.SHUTDOWN, () => this.events.off(Scenes.Events.PRE_RENDER, this.FollowIsland, this));
    }

    private FollowIsland ()
    {
        const target = currentTarget;
        const lights: { item: PlacedItem, placement: PropLightPlacement }[] = [];

        for (const item of target?.GetItems() ?? [])
        {
            const placement = item.GetLightPlacement();

            if (placement)
            {
                lights.push({ item, placement });
            }
        }

        // Fades with the night, and with the island camera's fade while sailing between islands
        const brightness = target ? target.GetNightAmount() * (1 - GetFadeAlpha(target.camera)) : 0;

        if (target)
        {
            this.FollowCamera(target.camera);
        }

        while (this.glows.length < lights.length)
        {
            this.glows.push(this.CreateGlow());
        }

        this.glows.forEach((glow, glowIndex) => {
            const light = lights[glowIndex] as typeof lights[number] | undefined;
            const isShown = light !== undefined && brightness > 0.01;

            glow.halo.setVisible(isShown);
            glow.ground.setVisible(isShown);

            if (!light || !isShown)
            {
                return;
            }

            const { placement, item } = light;
            const settings = placement.light;
            const itemAlpha = item.alpha;

            // Each art pixel of the glow lands on an art pixel of the island
            glow.halo
                .setTexture(this.GetGlowTexture(settings.haloRadiusPx, settings.haloRadiusPx))
                .setPosition(Math.round(placement.sourceX), Math.round(placement.sourceY))
                .setTint(settings.color)
                .setAlpha(settings.haloIntensity * brightness * itemAlpha);

            const groundRadiusY = Math.max(1, Math.round(settings.groundRadiusPx * groundFlattening));

            glow.ground
                .setTexture(this.GetGlowTexture(settings.groundRadiusPx, groundRadiusY))
                .setPosition(Math.round(placement.groundX), Math.round(placement.groundY))
                .setTint(settings.color)
                .setAlpha(settings.groundIntensity * brightness * itemAlpha);
        });
    }

    private FollowCamera (source: Cameras.Scene2D.Camera)
    {
        const camera = this.cameras.main;

        if (camera.width !== source.width || camera.height !== source.height)
        {
            camera.setSize(source.width, source.height);
        }

        camera.setPosition(source.x, source.y);
        camera.setOrigin(source.originX, source.originY);
        camera.setZoom(source.zoomX, source.zoomY);
        camera.setScroll(source.scrollX, source.scrollY);
    }

    private CreateGlow (): Glow
    {
        const CreateImage = () => this.add.image(0, 0, this.GetGlowTexture(1, 1))
            .setBlendMode(BlendModes.ADD)
            .setVisible(false);

        return { ground: CreateImage(), halo: CreateImage() };
    }

    // A white oval (a circle when both radii match) in light bands, one texture pixel per art pixel; made once per size
    private GetGlowTexture (radiusX: number, radiusY: number): string
    {
        const key = `prop-light-glow-${radiusX}x${radiusY}`;

        if (this.textures.exists(key))
        {
            return key;
        }

        const width = radiusX * 2;
        const height = radiusY * 2;
        const texture = this.textures.createCanvas(key, width, height);
        const context = texture?.getContext();

        if (!texture || !context)
        {
            return key;
        }

        const image = context.createImageData(width, height);

        for (let y = 0; y < height; y++)
        {
            for (let x = 0; x < width; x++)
            {
                // Measured from each pixel's middle
                const distance = Math.hypot((x + 0.5 - radiusX) / radiusX, (y + 0.5 - radiusY) / radiusY);
                const band = glowBands.find(([ bandEdge ]) => distance < bandEdge);
                const pixelIndex = (y * width + x) * 4;

                image.data[pixelIndex] = 255;
                image.data[pixelIndex + 1] = 255;
                image.data[pixelIndex + 2] = 255;
                image.data[pixelIndex + 3] = band ? Math.round(band[1] * 255) : 0;
            }
        }

        context.putImageData(image, 0, 0);
        texture.refresh();

        return key;
    }
}

// How far the camera has faded out (0 = not at all, 1 = fully covered)
function GetFadeAlpha (camera: Cameras.Scene2D.Camera): number
{
    const fade = camera.fadeEffect as unknown as { alpha?: number };

    return Math.min(1, Math.max(0, fade.alpha ?? 0));
}
