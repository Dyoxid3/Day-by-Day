import { EventBus, GameEvents, type InventoryChangedPayload } from '../EventBus';

// Items the player owns but hasn't placed, as counts per shop item id
class Inventory
{
    private itemCounts = new Map<string, number>();

    GetCount (itemId: string): number
    {
        return this.itemCounts.get(itemId) ?? 0;
    }

    // Every item held, once each with how many there are (duplicates stack)
    GetStacks (): { itemId: string, count: number }[]
    {
        return [ ...this.itemCounts ]
            .filter(([ , count ]) => count > 0)
            .map(([ itemId, count ]) => ({ itemId, count }));
    }

    GetTotalCount (): number
    {
        return this.GetStacks().reduce((total, stack) => total + stack.count, 0);
    }

    AddItem (itemId: string, count = 1)
    {
        this.itemCounts.set(itemId, this.GetCount(itemId) + count);
        this.EmitChange(itemId);
    }

    TryRemoveItem (itemId: string): boolean
    {
        const count = this.GetCount(itemId);

        if (count <= 0)
        {
            return false;
        }

        this.itemCounts.set(itemId, count - 1);
        this.EmitChange(itemId);

        return true;
    }

    private EmitChange (itemId: string)
    {
        const payload: InventoryChangedPayload = { itemId, count: this.GetCount(itemId) };

        EventBus.emit(GameEvents.InventoryChanged, payload);
    }
}

export const playerInventory = new Inventory();
