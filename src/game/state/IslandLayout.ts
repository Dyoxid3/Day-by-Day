import { EventBus, GameEvents, type IslandLayoutChangedPayload } from '../EventBus';
import { GetShopItem } from '../data/ShopCatalog';

export interface PlacedItemRecord
{
    itemId: string;
    // Where the item's base sits, as fractions of the island image (0 = left/top edge, 1 = right/bottom edge),
    // so layouts still line up if the island art changes size
    islandX: number;
    islandY: number;
}

// The furniture on the player's own island. Saved online when they have an account.
class IslandLayout
{
    private placedItems: PlacedItemRecord[] = [];

    GetPlacedItems (): readonly PlacedItemRecord[]
    {
        return this.placedItems;
    }

    AddPlacedItem (record: PlacedItemRecord)
    {
        this.placedItems.push(record);
        this.EmitChange('added');
    }

    // Takes an item off the island (the closest saved one of that kind to where it stood)
    RemovePlacedItem (record: PlacedItemRecord)
    {
        let closestIndex = -1;
        let closestDistance = Number.POSITIVE_INFINITY;

        this.placedItems.forEach((placedItem, index) => {
            const distance = Math.hypot(placedItem.islandX - record.islandX, placedItem.islandY - record.islandY);

            if (placedItem.itemId === record.itemId && distance < closestDistance)
            {
                closestIndex = index;
                closestDistance = distance;
            }
        });

        if (closestIndex !== -1)
        {
            this.placedItems.splice(closestIndex, 1);
            this.EmitChange('removed');
        }
    }

    // Items that have left the shop catalog (like the old placeholder table) are dropped
    ReplacePlacedItems (records: readonly PlacedItemRecord[])
    {
        this.placedItems = records
            .filter(record => GetShopItem(record.itemId) !== undefined)
            .map(record => ({ ...record }));
        this.EmitChange('replaced');
    }

    private EmitChange (reason: IslandLayoutChangedPayload['reason'])
    {
        const payload: IslandLayoutChangedPayload = { reason };

        EventBus.emit(GameEvents.IslandLayoutChanged, payload);
    }
}

export const playerIslandLayout = new IslandLayout();
