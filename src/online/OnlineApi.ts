import type { PlacedItemRecord } from '../game/state/IslandLayout';
import type {
    AuthResponse,
    BoostGrantResponse,
    EncourageResponse,
    FriendSummary,
    GiftOffer,
    IslandResponse,
    PlayerStatus,
    PollResponse
} from './OnlineTypes';

const apiBasePath = '/api';
// Kept per browser tab (sessionStorage), so two tabs can be logged in as two different players for playtesting
const tokenStorageKey = 'island-online-token';

export class OnlineApiError extends Error
{
    // HTTP status, or 0 when the server couldn't be reached at all
    readonly status: number;

    constructor (status: number, message: string)
    {
        super(message);
        this.status = status;
    }
}

interface OkResponse
{
    ok: boolean;
}

// Things the demo friend (Sam, when nobody is playing as them) can be asked to do. 'lantern' leaves a kind message
// glowing on your island; 'encourage' sends encouragement with a gift (in the notifications); 'struggle' has them let
// you know they're having a tough day.
export type DemoFriendAction = 'lantern' | 'encourage' | 'visit' | 'struggle';

// Every request the game makes to the online server
export const onlineApi = {
    SignUp: (username: string, password: string) => RequestJson<AuthResponse>('POST', '/signup', { username, password }),
    LogIn: (username: string, password: string) => RequestJson<AuthResponse>('POST', '/login', { username, password }),
    LogOut: () => RequestJson<OkResponse>('POST', '/logout'),
    Poll: () => RequestJson<PollResponse>('GET', '/poll'),
    AddFriend: (username: string) => RequestJson<{ friend: FriendSummary }>('POST', '/friends', { username }),
    SaveIsland: (placedItems: readonly PlacedItemRecord[]) => RequestJson<OkResponse>('PUT', '/island', { placedItems }),
    SaveStatus: (status: PlayerStatus) => RequestJson<OkResponse>('PUT', '/status', status),
    GetIsland: (username: string) => RequestJson<IslandResponse>('GET', `/islands/${encodeURIComponent(username)}`),
    // dayKey is the sender's day, used when the friend hasn't played today yet
    Encourage: (username: string, message: string, gift: GiftOffer, dayKey: string) =>
        RequestJson<EncourageResponse>('POST', '/encourage', { to: username, message, ...gift, dayKey }),
    // Lets friends know the player could use some encouragement today (it never says how they feel)
    AskFriendsForEncouragement: (dayKey: string) => RequestJson<OkResponse>('POST', '/feeling-low', { dayKey }),
    ClaimRewards: (rewardIds: number[]) => RequestJson<OkResponse>('POST', '/rewards/claim', { ids: rewardIds }),
    Reply: (notificationId: number, message: string) => RequestJson<BoostGrantResponse>('POST', `/notifications/${notificationId}/reply`, { message }),
    MarkNotificationsRead: () => RequestJson<OkResponse>('POST', '/notifications/read'),
    SendVisitHeartbeat: (hostUsername: string) => RequestJson<OkResponse>('POST', '/visit', { host: hostUsername }),
    LeaveVisit: () => RequestJson<OkResponse>('POST', '/visit/leave'),
    RunDemoFriendAction: (action: DemoFriendAction) => RequestJson<{ friendUsername: string }>('POST', '/demo/friend-action', { action }),
    // Clears everything the demo friends remember (messages, gifts, visits), for starting a demo fresh
    ResetDemoFriends: () => RequestJson<{ friendNames: string[] }>('POST', '/demo/reset'),

    // For when the page is closing: a normal request might not finish, but a beacon still gets sent
    SendLeaveVisitBeacon ()
    {
        const token = GetStoredToken();

        if (token)
        {
            navigator.sendBeacon(`${apiBasePath}/visit/leave`, new Blob([ JSON.stringify({ token }) ], { type: 'application/json' }));
        }
    }
};

export function GetStoredToken (): string | null
{
    try
    {
        return sessionStorage.getItem(tokenStorageKey);
    }
    catch
    {
        return null;
    }
}

export function StoreToken (token: string | null)
{
    try
    {
        if (token)
        {
            sessionStorage.setItem(tokenStorageKey, token);
        }
        else
        {
            sessionStorage.removeItem(tokenStorageKey);
        }
    }
    catch
    {
        // Storage can be blocked (e.g. some private windows); the login then just lasts until the page reloads
    }
}

async function RequestJson<ResponseType> (method: string, path: string, body?: unknown): Promise<ResponseType>
{
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const token = GetStoredToken();

    if (token)
    {
        headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;

    try
    {
        response = await fetch(`${apiBasePath}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    }
    catch
    {
        throw new OnlineApiError(0, "Can't reach the game server");
    }

    const data: unknown = await response.json().catch(() => ({}));

    if (!response.ok)
    {
        throw new OnlineApiError(response.status, GetErrorMessage(data, response.status));
    }

    return data as ResponseType;
}

function GetErrorMessage (data: unknown, status: number): string
{
    if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string')
    {
        return data.error;
    }

    // No JSON error means the online server isn't running (e.g. a production build without it)
    return status === 404 ? "The online server isn't running" : `Something went wrong (${status})`;
}
