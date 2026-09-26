import { Scene, GameObjects, Geom } from 'phaser';
import { GetItemTextureKey, type ShopItem } from '../data/ShopCatalog';

// A shop item standing on the island. Positioned by its base (bottom-center).
export class PlacedItem extends GameObjects.Image
{
    readonly itemId: string;
    private footprintHeightFraction: number;

    constructor (scene: Scene, x: number, y: number, item: ShopItem)
    {
        super(scene, x, y, GetItemTextureKey(item));

        this.itemId = item.id;
        this.footprintHeightFraction = item.footprintHeightFraction;

        this.setOrigin(0.5, 1);
        this.setScale(item.placedScale);
        this.UpdateDepth();

        scene.add.existing(this);
    }

    // Ground space this item occupies; other placed items can't overlap it
    GetFootprint (): Phaser.Geom.Rectangle
    {
        const footprintHeight = this.displayHeight * this.footprintHeightFraction;

        return new Geom.Rectangle(this.x - this.displayWidth / 2, this.y - footprintHeight, this.displayWidth, footprintHeight);
    }

    // Things lower on screen draw in front
    UpdateDepth ()
    {
        this.setDepth(this.y);
    }
}
