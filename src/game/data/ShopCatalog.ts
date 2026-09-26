export interface ShopItem
{
    id: string;
    name: string;
    price: number;
    // File name inside public/assets
    imageFile: string;
    // Scale of the sprite when placed on the island
    placedScale: number;
    // Bottom portion of the sprite (0-1) that takes up ground space; placed items can't overlap each other's
    footprintHeightFraction: number;
}

// Add new shop items here; they show up in the shop in this order
export const shopCatalog: ShopItem[] = [
    {
        id: 'table',
        name: 'Table',
        price: 15,
        imageFile: 'table.png',
        placedScale: 0.14,
        footprintHeightFraction: 0.35
    }
];

export function GetShopItem (itemId: string): ShopItem | undefined
{
    return shopCatalog.find(item => item.id === itemId);
}

export function GetItemTextureKey (item: ShopItem): string
{
    return `shop-item-${item.id}`;
}
