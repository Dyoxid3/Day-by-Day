// Light a prop gives off at night (drawn by scenes/IslandLights, above the night's darkness)
export interface PropLight
{
    // Where the light comes from, in pixels of the item's image counted from its top-left corner (e.g. a lamp's bulb)
    sourceX: number;
    sourceY: number;
    color: number;
    // A glow around the source, in art pixels
    haloRadiusPx: number;
    // A pool of light on the ground around the item's base, in art pixels (it's flattened, since the ground is seen
    // at an angle)
    groundRadiusPx: number;
    // How bright each is at full night (0 to 1)
    haloIntensity: number;
    groundIntensity: number;
}

export interface ShopItem
{
    id: string;
    name: string;
    price: number;
    // File name inside public/assets
    imageFile: string;
    // Scale of the sprite when placed on the island (pixel art stays crisp at 1, like the cat and the island)
    placedScale: number;
    // Empty rows of pixels under the art, so its visible base (not the edge of the image) stands on the ground
    bottomPaddingPx: number;
    // The ground the item's base covers, in art pixels (width, and depth back from its front edge). Placed items
    // can't overlap each other's.
    baseWidthPx: number;
    baseDepthPx: number;
    // Stars the player needs to have earned (in total) before this can be bought. The first time it unlocks, one
    // is given for free. 0 = available from the start. Spaced well apart (a day earns at most 2 stars), so
    // one session, like a demo, doesn't unlock them all.
    unlockStars: number;
    // Only for props that light up at night
    light?: PropLight;
}

// Add new shop items here; they show up in the shop in this order. All are pixel art at 1x, next to the 48px cat.
export const shopCatalog: ShopItem[] = [
    {
        id: 'fence',
        name: 'Fence',
        price: 10,
        imageFile: 'PixelArt/Cat/fence.png',
        placedScale: 1,
        bottomPaddingPx: 15,
        baseWidthPx: 54,
        baseDepthPx: 8,
        unlockStars: 1
    },
    {
        id: 'tree',
        name: 'Tree',
        price: 15,
        imageFile: 'PixelArt/Cat/tree.png',
        placedScale: 1,
        bottomPaddingPx: 6,
        baseWidthPx: 40,
        baseDepthPx: 12,
        unlockStars: 10
    },
    {
        id: 'streetlight',
        name: 'Street light',
        price: 20,
        imageFile: 'PixelArt/Cat/streetlight.png',
        placedScale: 1,
        bottomPaddingPx: 1,
        baseWidthPx: 20,
        baseDepthPx: 8,
        unlockStars: 20,
        // The bulb is the white glass at x 64-65, y 24-30 of the image
        light: {
            sourceX: 65,
            sourceY: 27.5,
            color: 0xffd98a,
            haloRadiusPx: 30,
            groundRadiusPx: 52,
            haloIntensity: 0.6,
            groundIntensity: 0.38
        }
    },
    {
        id: 'house',
        name: 'House',
        price: 40,
        imageFile: 'PixelArt/Cat/house.png',
        placedScale: 1,
        bottomPaddingPx: 2,
        baseWidthPx: 96,
        baseDepthPx: 36,
        unlockStars: 35
    }
];

// Selling an item from the inventory pays back this share of its shop price
export const sellPriceFraction = 0.5;

export function GetShopItem (itemId: string): ShopItem | undefined
{
    return shopCatalog.find(item => item.id === itemId);
}

// Rounded down, but always at least 1 coin
export function GetSellPrice (item: ShopItem): number
{
    return Math.max(1, Math.floor(item.price * sellPriceFraction));
}

export function GetItemTextureKey (item: ShopItem): string
{
    return `shop-item-${item.id}`;
}
