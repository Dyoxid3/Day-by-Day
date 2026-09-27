import { Game } from 'phaser';

// The canvas is drawn at the screen's real resolution rather than stretched by the browser, so each canvas pixel is
// exactly one screen pixel and pixel art can line up with them. On a 125%-scaled Windows screen or a phone, one CSS
// pixel covers several screen pixels, so the canvas has more pixels than its size on the page suggests.

// The screen pixels per CSS pixel the canvas was last sized with (0 until it's first measured)
let measuredPixelRatio = 0;

// How many screen pixels make up one CSS pixel (1 on a basic monitor, 1.25 or 1.5 on scaled laptops, 2-3 on phones)
export function GetScreenPixelsPerCssPixel (): number
{
    return measuredPixelRatio || window.devicePixelRatio || 1;
}

// The game's starting size in screen pixels, filling the container
export function GetContainerSizeInScreenPixels (container: HTMLElement)
{
    const pixelRatio = GetScreenPixelsPerCssPixel();

    return {
        width: Math.max(1, Math.round(container.clientWidth * pixelRatio)),
        height: Math.max(1, Math.round(container.clientHeight * pixelRatio))
    };
}

// Keeps the canvas filling the container at full resolution as the window resizes, the browser zooms, or the window
// moves to a screen with a different pixel density. Use with the NONE scale mode.
export function KeepCanvasAtScreenResolution (game: Game, container: HTMLElement)
{
    let appliedPixelRatio = 0;

    // One ratio (screen pixels per CSS pixel) sizes everything: the canvas's pixels and its size on the page. It comes
    // from the screen-pixel width where the browser gives one, rather than window.devicePixelRatio, since the two can
    // disagree (Firefox's mobile emulation gives the emulated phone's ratio for one and the monitor's for the other).
    // The height uses the same ratio, so the canvas's pixels always stay square.
    const ResizeCanvas = (cssWidth: number, cssHeight: number, screenPixelWidth?: number) => {
        const pixelRatio = screenPixelWidth && cssWidth > 0 ? screenPixelWidth / cssWidth : (window.devicePixelRatio || 1);
        const pixelWidth = Math.max(1, screenPixelWidth ?? Math.round(cssWidth * pixelRatio));
        const pixelHeight = Math.max(1, Math.round(cssHeight * pixelRatio));

        measuredPixelRatio = pixelRatio;

        if (Math.abs(pixelRatio - appliedPixelRatio) > 0.0001)
        {
            appliedPixelRatio = pixelRatio;
            game.scale.setZoom(1 / pixelRatio);
        }

        // Shrinks the canvas back down to the container's size on the page. Set here as well as by Phaser, which skips
        // it when the zoom is exactly 1 (a pixel ratio of 1, as in some emulators) and would leave the size from before,
        // stretching the game. Set before resizing: that's when Phaser measures the canvas on the page to turn clicks
        // and drags into game positions, so it has to be the right size by then.
        game.canvas.style.width = `${pixelWidth / pixelRatio}px`;
        game.canvas.style.height = `${pixelHeight / pixelRatio}px`;

        game.scale.resize(pixelWidth, pixelHeight);
    };

    const observer = new ResizeObserver(entries => {
        const entry = entries[entries.length - 1];
        // The exact width in screen pixels, where the browser provides it
        const screenPixelSize = entry.devicePixelContentBoxSize?.[0];

        ResizeCanvas(entry.contentRect.width, entry.contentRect.height, screenPixelSize?.inlineSize);
    });

    const Observe = () => {
        try
        {
            observer.observe(container, { box: 'device-pixel-content-box' });
        }
        catch
        {
            // Browsers without screen-pixel sizes (older Safari) still get told about size changes
            observer.observe(container);
        }
    };

    // Some browsers (like Firefox, when switching phones in its mobile emulation) don't report a change in pixel
    // density alone, so it's watched separately: observing again measures the container afresh
    const WatchPixelDensity = () => {
        const densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);

        densityQuery.addEventListener('change', () => {
            observer.unobserve(container);
            Observe();
            WatchPixelDensity();
        }, { once: true });
    };

    Observe();
    WatchPixelDensity();
}
