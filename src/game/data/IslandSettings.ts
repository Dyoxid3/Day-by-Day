// Where things are on the island image, as fractions of its size (0 = left/top edge, 1 = right/bottom edge).
// Update these when the island art changes.
export const islandMap = {
    // Cats wander in here, and shop items can be placed in here
    groundArea: { left: 0.2, right: 0.8, top: 0.58, bottom: 0.72 },
    // Where the island owner's boat is moored (its waterline), and where cats step on and off it
    homeMooring: { dock: { x: 0.07, y: 0.78 }, landing: { x: 0.22, y: 0.66 } },
    // Moorings for visitors' boats, used in this order
    guestMoorings: [
        { dock: { x: 0.94, y: 0.76 }, landing: { x: 0.78, y: 0.66 } },
        { dock: { x: 0.8, y: 0.9 }, landing: { x: 0.68, y: 0.71 } },
        { dock: { x: 0.24, y: 0.92 }, landing: { x: 0.34, y: 0.71 } }
    ]
};

export const islandCatSettings = {
    scale: 0.15,
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
    // Where cats step off onto the island
    landing: IslandPoint;
    // Side boats arrive from and leave toward: -1 = left, 1 = right
    seaSide: -1 | 1;
}

export interface IslandPositions
{
    ground: { left: number, top: number, width: number, height: number };
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
    const area = islandMap.groundArea;
    const ToWorld = (point: IslandPoint): IslandPoint => ({
        x: islandBounds.left + islandBounds.width * point.x,
        y: islandBounds.top + islandBounds.height * point.y
    });
    const ToMooring = (mooring: { dock: IslandPoint, landing: IslandPoint }): Mooring => ({
        dock: ToWorld(mooring.dock),
        landing: ToWorld(mooring.landing),
        seaSide: mooring.dock.x < 0.5 ? -1 : 1
    });

    return {
        ground: {
            left: islandBounds.left + islandBounds.width * area.left,
            top: islandBounds.top + islandBounds.height * area.top,
            width: islandBounds.width * (area.right - area.left),
            height: islandBounds.height * (area.bottom - area.top)
        },
        homeMooring: ToMooring(islandMap.homeMooring),
        guestMoorings: islandMap.guestMoorings.map(ToMooring)
    };
}
