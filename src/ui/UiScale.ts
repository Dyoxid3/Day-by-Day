// The whole HTML UI grows on bigger screens, with CSS zoom (see theme.css). It's designed at 1x for a screen of
// designScreenSize, and zooms up when the screen is bigger in both directions, never past maxZoom.
// Phones and small windows stay at 1x.
const uiScaleSettings = {
    designScreenSize: { width: 1280, height: 760 },
    maxZoom: 2,
    // Zoom goes up in steps of this many screen pixels per CSS pixel, so pixel art in the UI keeps landing on whole
    // screen pixels (0.5 = two screen pixels per step)
    zoomStepScreenPixels: 0.5
};

let currentZoom = 1;

// How much the UI is zoomed. Positions measured on the page (getBoundingClientRect) are in screen space, so divide by
// this before using them as left/top inside the UI.
export function GetUiZoom (): number
{
    return currentZoom;
}

// Call once at startup, before the UI is built
export function InstallUiScale ()
{
    UpdateUiScale();
    window.addEventListener('resize', UpdateUiScale);
}

function UpdateUiScale ()
{
    const settings = uiScaleSettings;
    const pixelRatio = window.devicePixelRatio || 1;
    const screenFit = Math.min(window.innerWidth / settings.designScreenSize.width, window.innerHeight / settings.designScreenSize.height);
    const wantedZoom = Math.min(settings.maxZoom, Math.max(1, screenFit));
    // Rounded down so a whole number of screen pixels makes up each CSS pixel step
    const step = settings.zoomStepScreenPixels / pixelRatio;
    const zoom = Math.max(1, Math.floor(wantedZoom / step) * step);
    const rootStyle = document.documentElement.style;

    currentZoom = zoom;
    rootStyle.setProperty('--ui-zoom', String(zoom));
    // One screen pixel, measured inside the zoomed UI: pixel-art shapes round their pixels to multiples of this
    rootStyle.setProperty('--screen-pixel', `${1 / (pixelRatio * zoom)}px`);
}
