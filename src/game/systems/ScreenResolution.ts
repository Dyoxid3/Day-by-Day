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

    // The ratio comes from this one measurement (screen pixels over CSS pixels) rather than window.devicePixelRatio,
    // so the canvas always ends up exactly the container's size. The two can disagree: Firefox's mobile emulation
    // gives the emulated phone's ratio for one and the monitor's for the other, which drew the game tiny or stretched.
    const ResizeCanvas = (screenPixelWidth: number, screenPixelHeight: number, cssWidth: number) => {
        const pixelRatio = cssWidth > 0 ? screenPixelWidth / cssWidth : (window.devicePixelRatio || 1);

        measuredPixelRatio = pixelRatio;

        // Shrinks the canvas back down to the container's size on the page
        if (Math.abs(pixelRatio - appliedPixelRatio) > 0.0001)
        {
            appliedPixelRatio = pixelRatio;
            game.scale.setZoom(1 / pixelRatio);
        }

        game.scale.resize(Math.max(1, screenPixelWidth), Math.max(1, screenPixelHeight));
    };

    const observer = new ResizeObserver(entries => {
        const entry = entries[entries.length - 1];
        // The exact size in screen pixels, where the browser provides it
        const screenPixelSize = entry.devicePixelContentBoxSize?.[0];
        const cssWidth = entry.contentRect.width;

        if (screenPixelSize)
        {
            ResizeCanvas(screenPixelSize.inlineSize, screenPixelSize.blockSize, cssWidth);
        }
        else
        {
            const pixelRatio = window.devicePixelRatio || 1;

            ResizeCanvas(Math.round(cssWidth * pixelRatio), Math.round(entry.contentRect.height * pixelRatio), cssWidth);
        }
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
