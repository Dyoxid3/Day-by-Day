import { Scene } from 'phaser';
import { GetShopItem } from '../data/ShopCatalog';
import { PlacedItem } from '../entities/PlacedItem';
import type { PlacedItemRecord } from '../state/IslandLayout';

// The furniture standing on the island being shown, whether it's the player's own or a friend's
export class PlacedItemsLayer
{
    private scene: Scene;
    private islandBounds: Phaser.Geom.Rectangle;
    private items: PlacedItem[] = [];

    constructor (scene: Scene, islandBounds: Phaser.Geom.Rectangle)
    {
        this.scene = scene;
        this.islandBounds = islandBounds;
    }

    // Replaces everything shown with a saved layout
    Load (records: readonly PlacedItemRecord[])
    {
        this.Clear();

        for (const record of records)
        {
            const shopItem = GetShopItem(record.itemId);

            // Skips items that are no longer in the shop catalog
            if (shopItem)
            {
                const x = this.islandBounds.left + this.islandBounds.width * record.islandX;
                const y = this.islandBounds.top + this.islandBounds.height * record.islandY;

                this.items.push(new PlacedItem(this.scene, x, y, shopItem));
            }
        }
    }

    Clear ()
    {
        for (const item of this.items)
        {
            item.destroy();
        }

        this.items = [];
    }

    // For an item the player just placed
    Add (item: PlacedItem)
    {
        this.items.push(item);
    }

    // Stops showing an item (the caller destroys it once any animation is done)
    Remove (item: PlacedItem)
    {
        this.items = this.items.filter(shownItem => shownItem !== item);
    }

    GetItems (): readonly PlacedItem[]
    {
        return this.items;
    }

    GetFootprints (): Phaser.Geom.Rectangle[]
    {
        return this.items.map(item => item.GetFootprint());
    }

    ToRecord (item: PlacedItem): PlacedItemRecord
    {
        return {
            itemId: item.itemId,
            islandX: (item.x - this.islandBounds.left) / this.islandBounds.width,
            islandY: (item.y - this.islandBounds.top) / this.islandBounds.height
        };
    }
}
