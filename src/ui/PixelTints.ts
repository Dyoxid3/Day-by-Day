// The circle and pill art is white. Colored versions (like the orange "add task" button or a player's avatar)
// multiply the art by a color with a small SVG filter, so they keep the art's pixels and outline.

const svgNamespace = 'http://www.w3.org/2000/svg';

// Tints the CSS can use by name, as var(--tint-<name>). Change a color here to recolor everything using it.
const namedTints = {
    accent: '#e8a33d',
    accentSoft: '#fbeed6',
    blue: '#4f8fd9',
    blueFaded: '#9bbde6',
    blueSoft: '#dff1ff',
    gold: '#f5b331',
    goldSoft: '#fff1c9',
    pinkSoft: '#ffe3ee',
    beige: '#e2d6c3',
    dark: '#3a3226',
    online: '#4cc26a',
    offline: '#b9b0a3'
};

let filtersElement: SVGDefsElement | undefined;
const createdFilterIds = new Set<string>();

// Makes the named tints available to CSS; call once at startup, before any UI is built
export function InstallPixelTints ()
{
    for (const [ name, color ] of Object.entries(namedTints))
    {
        const cssName = name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

        document.documentElement.style.setProperty(`--tint-${cssName}`, GetPixelTint(color));
    }
}

// A CSS filter value that tints the white pixel art to a color (e.g. for --pixel-tint), made on first use
export function GetPixelTint (hexColor: string): string
{
    const hex = hexColor.replace('#', '').toLowerCase();
    const filterId = `pixel-tint-${hex}`;

    if (!createdFilterIds.has(filterId))
    {
        CreateTintFilter(filterId, hex);
        createdFilterIds.add(filterId);
    }

    return `url(#${filterId})`;
}

function CreateTintFilter (filterId: string, hex: string)
{
    const value = Number.parseInt(hex, 16);
    const red = ((value >> 16) & 0xff) / 255;
    const green = ((value >> 8) & 0xff) / 255;
    const blue = (value & 0xff) / 255;

    const filter = document.createElementNS(svgNamespace, 'filter');
    filter.setAttribute('id', filterId);
    // Mixes in plain sRGB so white comes out exactly the tint color
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    const colorMatrix = document.createElementNS(svgNamespace, 'feColorMatrix');
    colorMatrix.setAttribute('type', 'matrix');
    colorMatrix.setAttribute('values', `${red} 0 0 0 0  0 ${green} 0 0 0  0 0 ${blue} 0 0  0 0 0 1 0`);

    filter.append(colorMatrix);
    GetFiltersElement().append(filter);
}

function GetFiltersElement (): SVGDefsElement
{
    if (!filtersElement)
    {
        // Filters only work from an SVG that's in the page, so this one is there but takes up no space
        const svg = document.createElementNS(svgNamespace, 'svg');
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.position = 'absolute';

        filtersElement = document.createElementNS(svgNamespace, 'defs');
        svg.append(filtersElement);
        document.body.append(svg);
    }

    return filtersElement;
}
