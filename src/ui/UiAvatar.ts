import { uiAssets } from './UiAssets';
import './UiAvatar.css';

// Each player gets one of these inside their profile picture, picked from their name so it's always the same
const avatarColors = [ '#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff', '#fdffb6', '#a0c4ff', '#ffadad' ];
const guestAvatarColor = '#e9e2d6';

export type AvatarSize = 'small' | 'medium' | 'large';

// A round profile picture: the profile art (uiAssets.profile) with the inside of its circle filled with the player's
// color. Pass null for a signed-out guest.
export function CreateAvatar (username: string | null, size: AvatarSize, isOnline?: boolean): HTMLSpanElement
{
    const avatar = document.createElement('span');
    avatar.className = `avatar is-${size}`;

    const image = document.createElement('img');
    image.className = 'avatar-image';
    // The plain art until the colored-in one is ready (it's made once per color, then reused)
    image.src = uiAssets.profile;
    image.alt = '';
    image.draggable = false;
    avatar.append(image);

    GetFilledAvatarUrl(username ? GetAvatarColor(username) : guestAvatarColor)
        .then(url => {
            image.src = url;
        })
        .catch(() => undefined);

    if (isOnline !== undefined)
    {
        const dot = document.createElement('span');
        dot.className = `avatar-status pixel-circle ${isOnline ? 'is-online' : 'is-offline'}`;
        dot.title = isOnline ? 'Online' : 'Offline';
        avatar.append(dot);
    }

    return avatar;
}

function GetAvatarColor (username: string): string
{
    let hash = 0;

    for (const character of username.toLowerCase())
    {
        hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }

    return avatarColors[hash % avatarColors.length];
}

let profileArt: Promise<HTMLImageElement> | null = null;
const filledAvatarUrls = new Map<string, Promise<string>>();

function LoadProfileArt (): Promise<HTMLImageElement>
{
    profileArt ??= new Promise((resolve, reject) => {
        const art = new Image();

        art.addEventListener('load', () => resolve(art));
        art.addEventListener('error', reject);
        art.src = uiAssets.profile;
    });

    return profileArt;
}

// The profile art with every see-through pixel enclosed by its lines filled with the color, at the art's own size
// (so it stays pixel perfect when drawn bigger). The see-through pixels reachable from the edge stay see-through.
function GetFilledAvatarUrl (color: string): Promise<string>
{
    let url = filledAvatarUrls.get(color);

    if (!url)
    {
        url = LoadProfileArt().then(art => {
            const width = art.naturalWidth;
            const height = art.naturalHeight;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const context = canvas.getContext('2d');

            if (!context)
            {
                return uiAssets.profile;
            }

            context.drawImage(art, 0, 0);

            const image = context.getImageData(0, 0, width, height);
            const pixels = image.data;
            const IsClear = (index: number) => pixels[index * 4 + 3] === 0;
            const isOutside = new Uint8Array(width * height);
            const toVisit: number[] = [];

            // Starts from every clear pixel on the border, then spreads through clear neighbors
            for (let x = 0; x < width; x++)
            {
                toVisit.push(x, (height - 1) * width + x);
            }

            for (let y = 0; y < height; y++)
            {
                toVisit.push(y * width, y * width + width - 1);
            }

            while (toVisit.length > 0)
            {
                const index = toVisit.pop() as number;

                if (isOutside[index] || !IsClear(index))
                {
                    continue;
                }

                isOutside[index] = 1;

                const x = index % width;

                if (x > 0) toVisit.push(index - 1);
                if (x < width - 1) toVisit.push(index + 1);
                if (index >= width) toVisit.push(index - width);
                if (index < width * (height - 1)) toVisit.push(index + width);
            }

            const fill = ParseHexColor(color);

            for (let index = 0; index < width * height; index++)
            {
                if (IsClear(index) && !isOutside[index])
                {
                    pixels[index * 4] = fill[0];
                    pixels[index * 4 + 1] = fill[1];
                    pixels[index * 4 + 2] = fill[2];
                    pixels[index * 4 + 3] = 255;
                }
            }

            context.putImageData(image, 0, 0);

            return canvas.toDataURL('image/png');
        });

        filledAvatarUrls.set(color, url);
    }

    return url;
}

function ParseHexColor (hexColor: string): [ number, number, number ]
{
    const value = parseInt(hexColor.replace('#', ''), 16) || 0;

    return [ (value >> 16) & 255, (value >> 8) & 255, value & 255 ];
}
