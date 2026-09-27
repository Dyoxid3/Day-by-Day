import { Scene, GameObjects, Geom, Math as PhaserMath } from 'phaser';
import { islandArt } from '../data/IslandSettings';

interface GroundGrid
{
    columns: number;
    rows: number;
    // 1 where the cell is (mostly) grass or sand
    walkableCells: Uint8Array;
    // Cells where a cat has room to stand, to pick wander spots from
    standableCells: number[];
}

// Built once per island image and reused whenever the scene restarts
const gridCache = new Map<string, GroundGrid>();

export interface GroundPoint
{
    x: number;
    y: number;
}

// Where on the island cats can walk and items can be placed (the grass and sand), worked out from the
// island art's colors. Positions are in world coordinates.
export class IslandGround
{
    private grid: GroundGrid;
    private originX: number;
    private originY: number;
    // Size of one grid cell in world units
    private cellWorldSize: number;

    constructor (scene: Scene, islandImage: GameObjects.Image)
    {
        const textureKey = islandImage.texture.key;

        this.grid = gridCache.get(textureKey) ?? BuildGrid(scene, textureKey);
        gridCache.set(textureKey, this.grid);

        const topLeft = islandImage.getTopLeft();

        this.originX = topLeft.x;
        this.originY = topLeft.y;
        this.cellWorldSize = islandArt.groundCellSize * islandImage.scaleX;
    }

    IsWalkable (x: number, y: number): boolean
    {
        const column = Math.floor((x - this.originX) / this.cellWorldSize);
        const row = Math.floor((y - this.originY) / this.cellWorldSize);

        if (column < 0 || row < 0 || column >= this.grid.columns || row >= this.grid.rows)
        {
            return false;
        }

        return this.grid.walkableCells[row * this.grid.columns + column] === 1;
    }

    // Room for a cat's feet: walkable there and a little to each side
    IsStandable (x: number, y: number): boolean
    {
        const room = islandArt.standingRoomPx;

        return this.IsWalkable(x, y) && this.IsWalkable(x - room, y) && this.IsWalkable(x + room, y);
    }

    // Whether a whole area (like an item's footprint) is on walkable ground
    IsAreaWalkable (area: Phaser.Geom.Rectangle): boolean
    {
        const step = this.cellWorldSize / 2;

        for (let y = area.top; y <= area.bottom; y += step)
        {
            for (let x = area.left; x <= area.right; x += step)
            {
                if (!this.IsWalkable(Math.min(x, area.right), Math.min(y, area.bottom)))
                {
                    return false;
                }
            }
        }

        return this.IsWalkable(area.right, area.bottom);
    }

    // Whether walking in a straight line stays on walkable ground (so cats don't cross water or cliffs)
    IsPathClear (fromX: number, fromY: number, toX: number, toY: number): boolean
    {
        const distance = PhaserMath.Distance.Between(fromX, fromY, toX, toY);
        const steps = Math.max(1, Math.ceil(distance / (this.cellWorldSize / 2)));

        for (let step = 1; step <= steps; step++)
        {
            const progress = step / steps;

            if (!this.IsWalkable(PhaserMath.Linear(fromX, toX, progress), PhaserMath.Linear(fromY, toY, progress)))
            {
                return false;
            }
        }

        return true;
    }

    FindRandomStandablePoint (): GroundPoint | undefined
    {
        const cells = this.grid.standableCells;

        if (cells.length === 0)
        {
            return undefined;
        }

        return this.GetCellCenter(cells[Math.floor(Math.random() * cells.length)]);
    }

    // A standable spot picked from a number, always the same one for the same number (so things placed this way,
    // like lanterns, keep their spot every time the island loads)
    FindStandablePointFromSeed (seed: number): GroundPoint | undefined
    {
        const cells = this.grid.standableCells;

        if (cells.length === 0)
        {
            return undefined;
        }

        // A quick integer hash, so nearby seeds land far apart
        let hash = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);

        hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
        hash ^= hash >>> 16;

        return this.GetCellCenter(cells[(hash >>> 0) % cells.length]);
    }

    // The standable spot nearest a point, e.g. to start a cat or an item preview somewhere sensible
    FindNearestStandablePoint (x: number, y: number): GroundPoint
    {
        let nearest: GroundPoint = { x, y };
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const cell of this.grid.standableCells)
        {
            const center = this.GetCellCenter(cell);
            const distance = PhaserMath.Distance.Squared(x, y, center.x, center.y);

            if (distance < nearestDistance)
            {
                nearest = center;
                nearestDistance = distance;
            }
        }

        return nearest;
    }

    // The walkable area's bounding box, in world coordinates
    GetBounds (): Phaser.Geom.Rectangle
    {
        let left = Number.POSITIVE_INFINITY;
        let top = Number.POSITIVE_INFINITY;
        let right = Number.NEGATIVE_INFINITY;
        let bottom = Number.NEGATIVE_INFINITY;

        for (const cell of this.grid.standableCells)
        {
            const center = this.GetCellCenter(cell);

            left = Math.min(left, center.x);
            top = Math.min(top, center.y);
            right = Math.max(right, center.x);
            bottom = Math.max(bottom, center.y);
        }

        return new Geom.Rectangle(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    }

    private GetCellCenter (cell: number): GroundPoint
    {
        const column = cell % this.grid.columns;
        const row = Math.floor(cell / this.grid.columns);

        return {
            x: this.originX + (column + 0.5) * this.cellWorldSize,
            y: this.originY + (row + 0.5) * this.cellWorldSize
        };
    }
}

// Reads the island image's pixels once and marks each cell walkable if enough of its pixels are walkable colors
function BuildGrid (scene: Scene, textureKey: string): GroundGrid
{
    const source = scene.textures.get(textureKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const width = source.width;
    const height = source.height;
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context)
    {
        return { columns: 0, rows: 0, walkableCells: new Uint8Array(0), standableCells: [] };
    }

    context.drawImage(source, 0, 0);

    const pixels = context.getImageData(0, 0, width, height).data;
    const palette = islandArt.walkableColors.map(HexToRgb);
    const tolerance = islandArt.colorTolerance;
    const cellSize = islandArt.groundCellSize;
    const columns = Math.floor(width / cellSize);
    const rows = Math.floor(height / cellSize);
    const walkableCells = new Uint8Array(columns * rows);

    const IsWalkableColor = (pixelIndex: number) => palette.some(color =>
        Math.abs(pixels[pixelIndex] - color.red) <= tolerance
        && Math.abs(pixels[pixelIndex + 1] - color.green) <= tolerance
        && Math.abs(pixels[pixelIndex + 2] - color.blue) <= tolerance
        && pixels[pixelIndex + 3] > 0);

    const walkablePixelsNeeded = cellSize * cellSize * islandArt.walkableCellFraction;

    for (let row = 0; row < rows; row++)
    {
        for (let column = 0; column < columns; column++)
        {
            let walkablePixels = 0;

            for (let y = row * cellSize; y < (row + 1) * cellSize; y++)
            {
                for (let x = column * cellSize; x < (column + 1) * cellSize; x++)
                {
                    if (IsWalkableColor((y * width + x) * 4))
                    {
                        walkablePixels++;
                    }
                }
            }

            walkableCells[row * columns + column] = walkablePixels >= walkablePixelsNeeded ? 1 : 0;
        }
    }

    // Standable: walkable with walkable neighbors on both sides, matching IslandGround.IsStandable
    const roomCells = Math.ceil(islandArt.standingRoomPx / cellSize);
    const standableCells: number[] = [];

    for (let row = 0; row < rows; row++)
    {
        for (let column = roomCells; column < columns - roomCells; column++)
        {
            let hasRoom = true;

            for (let offset = -roomCells; offset <= roomCells; offset++)
            {
                if (walkableCells[row * columns + column + offset] !== 1)
                {
                    hasRoom = false;
                    break;
                }
            }

            if (hasRoom)
            {
                standableCells.push(row * columns + column);
            }
        }
    }

    return { columns, rows, walkableCells, standableCells };
}

function HexToRgb (hex: string): { red: number, green: number, blue: number }
{
    const value = Number.parseInt(hex.replace('#', ''), 16);

    return { red: (value >> 16) & 0xff, green: (value >> 8) & 0xff, blue: value & 0xff };
}
