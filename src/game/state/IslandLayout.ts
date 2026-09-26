import { EventBus, GameEvents, type IslandLayoutChangedPayload } from '../EventBus';

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

    ReplacePlacedItems (records: readonly PlacedItemRecord[])
    {
        this.placedItems = records.map(record => ({ ...record }));
        this.EmitChange('replaced');
    }

    private EmitChange (reason: IslandLayoutChangedPayload['reason'])
    {
        const payload: IslandLayoutChangedPayload = { reason };

        EventBus.emit(GameEvents.IslandLayoutChanged, payload);
    }
}

export const playerIslandLayout = new IslandLayout();
