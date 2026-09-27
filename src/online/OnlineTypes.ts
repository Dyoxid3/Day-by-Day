import type { PlacedItemRecord } from '../game/state/IslandLayout';

// Shapes of the data the online server (server/OnlinePrototypeServer.mjs) sends and receives

export interface AuthResponse
{
    token: string;
    username: string;
}

// What the player's game tells the server about their day
export interface PlayerStatus
{
    stars: number;
    // Times they came back after some time away (it never goes down)
    comebacks: number;
    progressPercent: number;
    // The player's own day ("YYYY-MM-DD"), so gifts are settled against the right day
    dayKey: string;
    // False when they have tasks but are well behind for the time of day (friends then get a note, once a day)
    isOnTrack: boolean;
}

// What friends see of each other
export interface FriendStatus
{
    stars: number;
    comebacks: number;
    progressPercent: number;
}

export interface FriendSummary extends FriendStatus
{
    username: string;
    isOnline: boolean;
    isVisitingYou: boolean;
}

export type NotificationKind =
    | 'encouragement'
    | 'reply'
    | 'friend-added'
    | 'visit'
    // A friend could use some encouragement (see reason)
    | 'friend-struggling'
    // A friend reached the goal of your encouragement
    | 'goal-reached'
    // Your gift came back because the friend's day ended before they reached its goal
    | 'gift-returned';

// Coins and stars sent with an encouragement, received once the friend finishes goalPercent of their day
export interface EncouragementGift
{
    coins: number;
    stars: number;
    goalPercent: number;
    state: 'pending' | 'earned' | 'returned';
}

export type StrugglingReason = 'off-track' | 'feeling-low';

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
    // Coin boost this notification gives (0 for none). An encouragement's boost starts when its goal is reached.
    boostPercent: number;
    // For encouragements, and for goal-reached and gift-returned notifications about them
    gift: EncouragementGift | null;
    // For friend-struggling notifications
    reason: StrugglingReason | null;
    // For encouragements: whether it glows as a lantern on the island (some only show in the notifications)
    leavesLantern: boolean;
}

export interface ServerCoinBoost
{
    percent: number;
    // null when it lasts until the end of the player's day
    endsInMs: number | null;
    fromUsername: string;
    kind: 'encouragement' | 'reply';
}

// Coins and stars waiting to be added to the player's wallet
export interface ServerReward
{
    id: number;
    coins: number;
    stars: number;
    fromUsername: string;
    // 'gift' from a friend's encouragement, 'returned' when the player's own gift came back
    kind: 'gift' | 'returned';
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
    rewards: ServerReward[];
}

export interface IslandResponse
{
    username: string;
    placedItems: PlacedItemRecord[];
    status: FriendStatus;
}

export interface BoostGrantResponse
{
    boostPercent: number;
    boostMinutes: number;
}

export interface EncourageResponse
{
    goalPercent: number;
    boostPercent: number;
}

// What an encouragement can carry along with its message
export interface GiftOffer
{
    coins: number;
    stars: number;
    goalPercent: number;
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
