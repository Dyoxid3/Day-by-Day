import { Scene, GameObjects, Geom } from 'phaser';
import { GetItemTextureKey, type PropLight, type ShopItem } from '../data/ShopCatalog';

// Where a lit prop's light is, in world positions
export interface PropLightPlacement
{
    light: PropLight;
    sourceX: number;
    sourceY: number;
    // The middle of the item's base, where the pool of light on the ground goes
    groundX: number;
    groundY: number;
}

// A shop item standing on the island. Positioned by its base (the bottom-center of the art itself, not of the image,
// which can have empty space underneath).
export class PlacedItem extends GameObjects.Image
{
    readonly itemId: string;
    // Only for props that light up at night
    readonly light?: PropLight;
    private baseWidthPx: number;
    private baseDepthPx: number;

    constructor (scene: Scene, x: number, y: number, item: ShopItem)
    {
        super(scene, x, y, GetItemTextureKey(item));

        this.itemId = item.id;
        this.light = item.light;
        this.baseWidthPx = item.baseWidthPx;
        this.baseDepthPx = item.baseDepthPx;

        this.setOrigin(0.5, 1 - item.bottomPaddingPx / this.height);
        this.setScale(item.placedScale);
        this.UpdateDepth();

        scene.add.existing(this);
    }

    // Ground space this item's base occupies; other placed items can't overlap it
    GetFootprint (): Phaser.Geom.Rectangle
    {
        const width = this.baseWidthPx * Math.abs(this.scaleX);
        const depth = this.baseDepthPx * Math.abs(this.scaleY);

        return new Geom.Rectangle(this.x - width / 2, this.y - depth, width, depth);
    }

    // Null for props that don't give off light
    GetLightPlacement (): PropLightPlacement | null
    {
        if (!this.light)
        {
            return null;
        }

        return {
            light: this.light,
            sourceX: this.x + (this.light.sourceX - this.displayOriginX) * this.scaleX,
            sourceY: this.y + (this.light.sourceY - this.displayOriginY) * this.scaleY,
            groundX: this.x,
            groundY: this.y
        };
    }

    // Things lower on screen draw in front
    UpdateDepth ()
    {
        this.setDepth(this.y);
    }
}
