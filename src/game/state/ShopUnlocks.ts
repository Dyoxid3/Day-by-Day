import { EventBus, GameEvents, type ItemUnlockedPayload } from '../EventBus';
import { shopCatalog, type ShopItem } from '../data/ShopCatalog';
import { playerInventory } from './Inventory';
import { playerStars } from './Stars';

export interface ShopUnlocksSaveData
{
    unlockedItemIds: string[];
}

// Shop items unlock as the player earns stars (their lifetime total, so giving stars away never locks anything).
// The first time an item unlocks, one is put in the inventory as a free gift; after that it's bought with coins.
class ShopUnlocks
{
    // Items whose free gift has been given
    private unlockedItemIds = new Set<string>();

    constructor ()
    {
        EventBus.on(GameEvents.StarsChanged, this.UnlockNewItems, this);
    }

    IsUnlocked (item: ShopItem): boolean
    {
        return item.unlockStars <= 0 || this.unlockedItemIds.has(item.id) || playerStars.GetLifetimeStars() >= item.unlockStars;
    }

    // Gives any gifts owed for the current star total (e.g. after loading older progress)
    UnlockNewItems ()
    {
        const lifetimeStars = playerStars.GetLifetimeStars();

        for (const item of shopCatalog)
        {
            if (item.unlockStars > 0 && lifetimeStars >= item.unlockStars && !this.unlockedItemIds.has(item.id))
            {
                this.unlockedItemIds.add(item.id);
                playerInventory.AddItem(item.id);

                const payload: ItemUnlockedPayload = { itemId: item.id };

                EventBus.emit(GameEvents.ItemUnlocked, payload);
            }
        }
    }

    ToSaveData (): ShopUnlocksSaveData
    {
        return { unlockedItemIds: [ ...this.unlockedItemIds ] };
    }

    LoadSaveData (data: Partial<ShopUnlocksSaveData> | undefined)
    {
        this.unlockedItemIds = new Set(data?.unlockedItemIds ?? []);
    }
}

export const shopUnlocks = new ShopUnlocks();
