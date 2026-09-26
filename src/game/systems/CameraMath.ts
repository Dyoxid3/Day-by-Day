// Conversions between world and game-screen coordinates for an unrotated camera that zooms around its center

export function WorldToScreen (camera: Phaser.Cameras.Scene2D.Camera, worldX: number, worldY: number)
{
    return {
        x: camera.x + camera.width / 2 + (worldX - camera.scrollX - camera.width / 2) * camera.zoom,
        y: camera.y + camera.height / 2 + (worldY - camera.scrollY - camera.height / 2) * camera.zoom
    };
}

export function ScreenToWorld (camera: Phaser.Cameras.Scene2D.Camera, screenX: number, screenY: number)
{
    return {
        x: camera.scrollX + camera.width / 2 + (screenX - camera.x - camera.width / 2) / camera.zoom,
        y: camera.scrollY + camera.height / 2 + (screenY - camera.y - camera.height / 2) / camera.zoom
    };
}
