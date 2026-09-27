import type { ToastIcon } from '../game/EventBus';

// Image files used by the HTML UI, inside public/assets
export const uiAssets = {
    coin: 'assets/PixelArt/Cat/pixielcoin.png',
    shoppingCart: 'assets/PixelArt/Cat/shoppingcartt.png',
    bell: 'assets/PixelArt/Cat/bell.png',
    star: 'assets/PixelArt/Cat/star.png',
    // 32x32 line art in a circle: every profile picture (the inside is filled with each player's color, see UiAvatar)
    profile: 'assets/PixelArt/Cat/profile.png',
    trash: 'assets/PixelArt/Cat/trash.png',
    // Shown beside "Inventory" in the bottom panel (set to '' for no picture)
    inventory: 'assets/PixelArt/Cat/backpack.png',
    // 48x48 white ring on a clear background: its pixels are colored in to show today's progress (see ProgressRing)
    progressRing: 'assets/PixelArt/Cat/progressring.png'
};

// The picture each kind of toast icon uses (see ToastIcon in EventBus)
export const toastIconAssets = {
    coin: uiAssets.coin,
    star: uiAssets.star,
    bell: uiAssets.bell
} satisfies Record<ToastIcon, string>;

// Pixel art that round buttons and pill-shaped labels are drawn with (see "Pixel-art shapes" in theme.css).
// If you swap one for a different size, update the numbers there too.
export const uiShapeAssets = {
    // 48x48: a white circle with a light gray outline
    circle: 'assets/PixelArt/Cat/circle.png',
    // 96x48: a white 78x30 pill with 9px of clear space around it
    pill: 'assets/PixelArt/Cat/cylinder.png',
    // 32x32: a 14px red dot in the middle, behind the bell's unread count
    notificationDot: 'assets/PixelArt/Cat/notif.png'
};

export function GetAssetUrl (fileName: string): string
{
    return `assets/${fileName}`;
}

// Lets the CSS use the shapes above, as var(--pixel-circle-art) and so on; call once at startup
export function InstallUiShapeAssets ()
{
    const rootStyle = document.documentElement.style;

    rootStyle.setProperty('--pixel-circle-art', `url('${uiShapeAssets.circle}')`);
    rootStyle.setProperty('--pixel-pill-art', `url('${uiShapeAssets.pill}')`);
    rootStyle.setProperty('--pixel-notification-art', `url('${uiShapeAssets.notificationDot}')`);
}
