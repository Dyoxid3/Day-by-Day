import { Scene, Scenes, GameObjects } from 'phaser';

// Pixel-perfect drawing with a smooth camera, the way pixel-art games that draw at a low resolution do it:
// - Everything is drawn on the art's pixel grid (positions rounded to whole art pixels), so a cat's pixels always line
//   up with the island's pixels instead of sitting between them.
// - The camera is drawn at whole *screen* pixels. Zoomed in, one art pixel covers several screen pixels, so the camera
//   still glides in small steps instead of jumping a whole art pixel at a time.
// The rounding only lasts while a frame is being drawn. Real positions are put back straight after, so walking, tweens
// and camera easing all keep their exact values and stay smooth.
// It's only exact at the zooms GetNearestPixelPerfectZoom gives, so the camera comes to rest on those.

// A game object with a position (everything the island draws). Only some have an origin point they're drawn around.
type PositionedObject = GameObjects.GameObject
    & GameObjects.Components.Transform
    & Partial<Pick<GameObjects.Components.Origin, 'displayOriginX' | 'displayOriginY'>>;

interface SavedPosition
{
    gameObject: PositionedObject;
    x: number;
    y: number;
}

interface SavedScroll
{
    camera: Phaser.Cameras.Scene2D.Camera;
    scrollX: number;
    scrollY: number;
}

// The closest zoom where every art pixel is drawn the same whole number of screen pixels wide: 1x, 2x, 3x ... zoomed
// in, and 1/2, 1/4 ... zoomed out (each screen pixel then shows an exact 2x2, 4x4 ... block of art pixels)
export function GetNearestPixelPerfectZoom (zoom: number): number
{
    if (!(zoom > 0))
    {
        return 1;
    }

    if (zoom >= 1)
    {
        return Math.round(zoom);
    }

    return 1 / Math.pow(2, Math.round(Math.log2(1 / zoom)));
}

// The pixel-perfect zoom one step in (direction 1) or out (-1) from this one: 2x to 3x, 1x to 1/2, and so on
export function GetNextPixelPerfectZoom (zoom: number, direction: 1 | -1): number
{
    const current = GetNearestPixelPerfectZoom(zoom);

    if (direction > 0)
    {
        return current >= 1 ? current + 1 : current * 2;
    }

    return current > 1 ? current - 1 : current / 2;
}

// Rounds the scene's drawing to the pixel grid every frame; create one per scene
export class PixelSnapping
{
    private scene: Scene;
    private savedPositions: SavedPosition[] = [];
    private savedScrolls: SavedScroll[] = [];

    constructor (scene: Scene)
    {
        this.scene = scene;

        scene.events.on(Scenes.Events.PRE_RENDER, this.SnapForDrawing, this);
        scene.events.on(Scenes.Events.RENDER, this.RestoreAfterDrawing, this);
        scene.events.once(Scenes.Events.SHUTDOWN, this.Destroy, this);
    }

    private SnapForDrawing ()
    {
        for (const camera of this.scene.cameras.cameras)
        {
            this.savedScrolls.push({ camera, scrollX: camera.scrollX, scrollY: camera.scrollY });
            SnapCameraToScreenPixels(camera);
        }

        this.SnapToArtPixels(this.scene.children.list);
    }

    private SnapToArtPixels (gameObjects: GameObjects.GameObject[])
    {
        for (const gameObject of gameObjects)
        {
            if (!IsPositioned(gameObject))
            {
                continue;
            }

            this.savedPositions.push({ gameObject, x: gameObject.x, y: gameObject.y });

            if (gameObject instanceof GameObjects.Container)
            {
                // Its contents are placed relative to it, so they're rounded the same way
                gameObject.x = Math.round(gameObject.x);
                gameObject.y = Math.round(gameObject.y);
                this.SnapToArtPixels(gameObject.list);
                continue;
            }

            // Rounds where the picture's top-left corner lands rather than its origin, since an odd-sized picture's
            // middle is on a half pixel
            const originOffsetX = (gameObject.displayOriginX ?? 0) * gameObject.scaleX;
            const originOffsetY = (gameObject.displayOriginY ?? 0) * gameObject.scaleY;

            gameObject.x = Math.round(gameObject.x - originOffsetX) + originOffsetX;
            gameObject.y = Math.round(gameObject.y - originOffsetY) + originOffsetY;
        }
    }

    private RestoreAfterDrawing ()
    {
        for (const saved of this.savedPositions)
        {
            saved.gameObject.x = saved.x;
            saved.gameObject.y = saved.y;
        }

        for (const saved of this.savedScrolls)
        {
            saved.camera.scrollX = saved.scrollX;
            saved.camera.scrollY = saved.scrollY;
        }

        this.savedPositions.length = 0;
        this.savedScrolls.length = 0;
    }

    private Destroy ()
    {
        this.scene.events.off(Scenes.Events.PRE_RENDER, this.SnapForDrawing, this);
        this.scene.events.off(Scenes.Events.RENDER, this.RestoreAfterDrawing, this);
    }
}

function IsPositioned (gameObject: GameObjects.GameObject): gameObject is PositionedObject
{
    const candidate = gameObject as Partial<PositionedObject>;

    return typeof candidate.x === 'number' && typeof candidate.y === 'number';
}

// Nudges the camera (by less than half a screen pixel) so the art's pixel grid lines up with the screen's pixels.
// The camera zooms around its origin (the middle of the screen), which is why that appears here.
function SnapCameraToScreenPixels (camera: Phaser.Cameras.Scene2D.Camera)
{
    const originX = camera.width * camera.originX;
    const originY = camera.height * camera.originY;
    // How far the world's (0, 0) point is drawn up and to the left of the screen's top-left corner, in screen pixels
    const worldOffsetX = (camera.scrollX + originX) * camera.zoomX - originX;
    const worldOffsetY = (camera.scrollY + originY) * camera.zoomY - originY;

    camera.scrollX = (Math.round(worldOffsetX) + originX) / camera.zoomX - originX;
    camera.scrollY = (Math.round(worldOffsetY) + originY) / camera.zoomY - originY;
}
