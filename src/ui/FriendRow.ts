import { EventBus, GameEvents, type EncourageRequestedPayload } from '../game/EventBus';
import { onlineSession, RequestToast } from '../online/OnlineSession';
import type { FriendSummary } from '../online/OnlineTypes';
import { CreateAvatar } from './UiAvatar';
import './FriendRow.css';

export interface FriendRowOptions
{
    // Called just before sailing off, e.g. so a panel can close
    onVisitStarting?: () => void;
}

// One friend with their streak and today's progress, plus buttons to cheer them on or sail to their island
export function CreateFriendRow (friend: FriendSummary, options: FriendRowOptions = {}): HTMLDivElement
{
    const row = document.createElement('div');
    row.className = 'friend-row';
    row.dataset.username = friend.username;

    const info = document.createElement('div');
    info.className = 'friend-info';

    const nameLine = document.createElement('div');
    nameLine.className = 'friend-name';
    nameLine.textContent = friend.username;

    if (friend.isVisitingYou)
    {
        const visitingTag = document.createElement('span');
        visitingTag.className = 'friend-tag';
        visitingTag.textContent = '⛵ On your island';
        nameLine.append(visitingTag);
    }

    const statusLine = document.createElement('div');
    statusLine.className = 'friend-status';
    statusLine.textContent = `🔥 ${friend.streakDays} · ${friend.progressPercent}% today`;

    info.append(nameLine, statusLine);

    const actions = document.createElement('div');
    actions.className = 'friend-actions';

    const cheerButton = document.createElement('button');
    cheerButton.type = 'button';
    cheerButton.className = 'friend-button';
    cheerButton.textContent = '💌 Cheer';
    cheerButton.title = `Send ${friend.username} some encouragement`;
    cheerButton.setAttribute('aria-label', cheerButton.title);
    cheerButton.addEventListener('click', () => {
        const payload: EncourageRequestedPayload = { username: friend.username };

        EventBus.emit(GameEvents.EncourageRequested, payload);
    });

    const isHere = onlineSession.GetVisitingUsername()?.toLowerCase() === friend.username.toLowerCase();
    const visitButton = document.createElement('button');
    visitButton.type = 'button';
    visitButton.className = 'friend-button is-primary';

    if (isHere)
    {
        visitButton.textContent = "📍 You're here";
        visitButton.title = `You're on ${friend.username}'s island`;
        visitButton.disabled = true;
    }
    else
    {
        visitButton.textContent = '⛵ Visit';
        visitButton.title = `Sail to ${friend.username}'s island`;
        visitButton.disabled = onlineSession.IsTraveling();
        visitButton.addEventListener('click', () => SailToFriend(friend.username, options.onVisitStarting));
    }

    visitButton.setAttribute('aria-label', visitButton.title);
    actions.append(cheerButton, visitButton);

    row.append(CreateAvatar(friend.username, 'medium', friend.isOnline), info, actions);

    return row;
}

// Friends on your island first, then whoever's online, then by name
export function SortFriends (friends: readonly FriendSummary[]): FriendSummary[]
{
    return [ ...friends ].sort((first, second) =>
        Number(second.isVisitingYou) - Number(first.isVisitingYou)
        || Number(second.isOnline) - Number(first.isOnline)
        || first.username.localeCompare(second.username));
}

export async function SailToFriend (username: string, onVisitStarting?: () => void)
{
    onVisitStarting?.();

    try
    {
        await onlineSession.VisitFriend(username);
    }
    catch (error)
    {
        RequestToast('⚠️', `Couldn't sail to ${username}'s island`, error instanceof Error ? error.message : undefined, 'error');
    }
}
