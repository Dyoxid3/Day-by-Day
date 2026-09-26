import { uiAssets } from './UiAssets';
import './UiAvatar.css';

// Each player gets one of these behind their profile picture, picked from their name so it's always the same
const avatarColors = [ '#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff', '#fdffb6', '#a0c4ff', '#ffadad' ];
const guestAvatarColor = '#e9e2d6';

export type AvatarSize = 'small' | 'medium' | 'large';

// A round profile picture. Pass null for a signed-out guest.
export function CreateAvatar (username: string | null, size: AvatarSize, isOnline?: boolean): HTMLSpanElement
{
    const avatar = document.createElement('span');
    avatar.className = `avatar is-${size}`;
    avatar.style.setProperty('--avatar-color', username ? GetAvatarColor(username) : guestAvatarColor);

    const image = document.createElement('img');
    image.className = 'avatar-image';
    image.src = uiAssets.profile;
    image.alt = '';
    image.draggable = false;
    avatar.append(image);

    if (isOnline !== undefined)
    {
        const dot = document.createElement('span');
        dot.className = `avatar-status ${isOnline ? 'is-online' : 'is-offline'}`;
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
