import { Game } from 'phaser';

// The canvas is drawn at the screen's real resolution rather than stretched by the browser, so each canvas pixel is
// exactly one screen pixel and pixel art can line up with them. On a 125%-scaled Windows screen or a phone, one CSS
// pixel covers several screen pixels, so the canvas has more pixels than its size on the page suggests.

// How many screen pixels make up one CSS pixel (1 on a basic monitor, 1.25 or 1.5 on scaled laptops, 2-3 on phones)
export function GetScreenPixelsPerCssPixel (): number
{
    return window.devicePixelRatio || 1;
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

    const ResizeCanvas = (screenPixelWidth: number, screenPixelHeight: number) => {
        const pixelRatio = GetScreenPixelsPerCssPixel();

        // Shrinks the canvas back down to the container's size on the page
        if (pixelRatio !== appliedPixelRatio)
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

        if (screenPixelSize)
        {
            ResizeCanvas(screenPixelSize.inlineSize, screenPixelSize.blockSize);
        }
        else
        {
            const pixelRatio = GetScreenPixelsPerCssPixel();

            ResizeCanvas(Math.round(entry.contentRect.width * pixelRatio), Math.round(entry.contentRect.height * pixelRatio));
        }
    });

    try
    {
        observer.observe(container, { box: 'device-pixel-content-box' });
    }
    catch
    {
        // Browsers without screen-pixel sizes (older Safari) still get told about size changes
        observer.observe(container);
    }
}
