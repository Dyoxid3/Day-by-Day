// Image files used by the HTML UI, inside public/assets
export const uiAssets = {
    coin: 'assets/coin.png',
    shoppingCart: 'assets/shoppingcart.png',
    bell: 'assets/bell.png',
    fire: 'assets/fire.png',
    // No trash image yet, so the delete button shows an emoji. Set this (e.g. 'assets/trash.png') to use an image instead.
    trash: ''
};

export function GetAssetUrl (fileName: string): string
{
    return `assets/${fileName}`;
}
