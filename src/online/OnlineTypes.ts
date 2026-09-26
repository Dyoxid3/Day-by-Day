import type { PlacedItemRecord } from '../game/state/IslandLayout';

// Shapes of the data the online server (server/OnlinePrototypeServer.mjs) sends and receives

export interface AuthResponse
{
    token: string;
    username: string;
}

export interface PlayerStatus
{
    streakDays: number;
    progressPercent: number;
}

export interface FriendSummary extends PlayerStatus
{
    username: string;
    isOnline: boolean;
    isVisitingYou: boolean;
}

export type NotificationKind = 'encouragement' | 'reply' | 'friend-added' | 'visit';

export interface OnlineNotification
{
    id: number;
    kind: NotificationKind;
    fromUsername: string;
    message: string;
    // Server time (ms)
    createdAt: number;
    isRead: boolean;
    // For encouragements: whether the player already replied
    hasReplied: boolean;
    // Coin boost this notification gave the player (0 for none)
    boostPercent: number;
}

export interface ServerCoinBoost
{
    percent: number;
    endsInMs: number;
    fromUsername: string;
    kind: 'encouragement' | 'reply';
}

export interface PollResponse
{
    serverTime: number;
    username: string;
    friends: FriendSummary[];
    // Newest first
    notifications: OnlineNotification[];
    boosts: ServerCoinBoost[];
    // All active boosts added up (with a cap)
    boostPercent: number;
    // Friends on the player's island right now
    visitors: string[];
}

export interface IslandResponse
{
    username: string;
    placedItems: PlacedItemRecord[];
    status: PlayerStatus;
}

export interface BoostGrantResponse
{
    boostPercent: number;
    boostMinutes: number;
}

// Everything the UI shows about the online side, sent with GameEvents.OnlineStateChanged
export interface OnlineSnapshot
{
    // null when signed out
    username: string | null;
    friends: FriendSummary[];
    notifications: OnlineNotification[];
    visitors: string[];
    // False when the game can't reach the server (e.g. it's running without `npm run dev`)
    isServerReachable: boolean;
}
