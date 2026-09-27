import { EventBus, GameEvents, type InventoryChangedPayload } from '../EventBus';
import { GetShopItem } from '../data/ShopCatalog';

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

    ToSaveData (): { itemCounts: Record<string, number> }
    {
        return { itemCounts: Object.fromEntries(this.itemCounts) };
    }

    // Items that have left the shop catalog (like the old placeholder table) are dropped
    LoadSaveData (data: { itemCounts?: Record<string, number> } | undefined)
    {
        this.itemCounts = new Map(Object.entries(data?.itemCounts ?? {})
            .filter(([ itemId, count ]) => count > 0 && GetShopItem(itemId) !== undefined));
    }

    private EmitChange (itemId: string)
    {
        const payload: InventoryChangedPayload = { itemId, count: this.GetCount(itemId) };

        EventBus.emit(GameEvents.InventoryChanged, payload);
    }
}

export const playerInventory = new Inventory();
