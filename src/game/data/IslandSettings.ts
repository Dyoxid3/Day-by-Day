// The island image, and how the game reads it
export const islandArt = {
    textureKey: 'island',
    // Inside public/assets. Drawn at 1x.
    file: 'PixelArt/FinalIsland.png',
    // The sea color at the image's edges; the scene's background uses it so the world blends in past the image
    seaColor: 0x1ea9e0,
    // Colors in the art that cats can walk on and items can be placed on: the grass (with its ramp and edge)
    // and the sand. Everything else (water, cliffs, rocks, outlines) is off limits.
    walkableColors: [ '#aae378', '#8cbb62', '#64c84e', '#529d42', '#e3db79' ],
    // How far (per color channel) a pixel may be from those colors and still count
    colorTolerance: 12,
    // Size of each square in the walkable map, in image pixels: smaller is more exact but slower to build
    groundCellSize: 4,
    // A square counts as walkable when at least this share of its pixels are walkable colors
    walkableCellFraction: 0.5,
    // A cat needs walkable ground this far to each side of its feet to stand somewhere (keeps it off thin edges)
    standingRoomPx: 8
};

// Places on the island image, as fractions of its size (0 = left/top edge, 1 = right/bottom edge).
// Update these when the island art changes.
export const islandMap = {
    // What the default camera view frames: the island and its rocks, not the open sea around them
    viewArea: { left: 0.07, right: 0.81, top: 0.19, bottom: 0.83 },
    // Where the island owner's boat is moored (its waterline) and where cats step on and off it.
    // seaSide is the side boats sail in from and leave toward: -1 = left, 1 = right.
    homeMooring: { dock: { x: 0.518, y: 0.733 }, landing: { x: 0.456, y: 0.726 }, seaSide: 1 as const },
    // Moorings for visitors' boats, used in this order
    guestMoorings: [
        { dock: { x: 0.391, y: 0.83 }, landing: { x: 0.391, y: 0.768 }, seaSide: 1 as const },
        { dock: { x: 0.846, y: 0.365 }, landing: { x: 0.775, y: 0.365 }, seaSide: 1 as const },
        { dock: { x: 0.114, y: 0.456 }, landing: { x: 0.186, y: 0.456 }, seaSide: -1 as const }
    ]
};

export const islandCatSettings = {
    // The cat art is pixel art, drawn at 1x
    scale: 1,
    // Random pause between wanders
    minWanderDelayMs: 3000,
    maxWanderDelayMs: 9000
};

export interface IslandPoint
{
    x: number;
    y: number;
}

export interface Mooring
{
    // Where the boat's waterline sits
    dock: IslandPoint;
    // Where cats step off onto the island (where their feet land)
    landing: IslandPoint;
    // Side boats arrive from and leave toward: -1 = left, 1 = right
    seaSide: -1 | 1;
}

export interface IslandPositions
{
    viewArea: { left: number, top: number, width: number, height: number };
    homeMooring: Mooring;
    guestMoorings: Mooring[];
}

interface IslandBounds
{
    left: number;
    top: number;
    width: number;
    height: number;
}

// Turns the fractions above into world positions for an island drawn at the given bounds
export function GetIslandPositions (islandBounds: IslandBounds): IslandPositions
{
    const area = islandMap.viewArea;
    const ToWorld = (point: IslandPoint): IslandPoint => ({
        x: islandBounds.left + islandBounds.width * point.x,
        y: islandBounds.top + islandBounds.height * point.y
    });
    const ToMooring = (mooring: { dock: IslandPoint, landing: IslandPoint, seaSide: -1 | 1 }): Mooring => ({
        dock: ToWorld(mooring.dock),
        landing: ToWorld(mooring.landing),
        seaSide: mooring.seaSide
    });

    return {
        viewArea: {
            left: islandBounds.left + islandBounds.width * area.left,
            top: islandBounds.top + islandBounds.height * area.top,
            width: islandBounds.width * (area.right - area.left),
            height: islandBounds.height * (area.bottom - area.top)
        },
        homeMooring: ToMooring(islandMap.homeMooring),
        guestMoorings: islandMap.guestMoorings.map(ToMooring)
    };
}
