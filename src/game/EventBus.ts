import { Events } from 'phaser';
import type { DailyProgress } from './data/TaskTypes';
import type { CatExpression } from './data/CatAppearance';
import type { PlacedItemRecord } from './state/IslandLayout';
import type { OnlineNotification, OnlineSnapshot } from '../online/OnlineTypes';

// Shared channel between the HTML UI, the online layer and Phaser scenes
export const EventBus = new Events.EventEmitter();

export const GameEvents = {
    UiPanelToggled: 'ui-panel-toggled',
    CoinsChanged: 'coins-changed',
    InventoryChanged: 'inventory-changed',
    CoinRewardRequested: 'coin-reward-requested',
    PlacementRequested: 'placement-requested',
    PlacementStarted: 'placement-started',
    PlacementEnded: 'placement-ended',
    // Puts the item being placed back in the inventory (the "Store it" button on touch screens)
    PlacementCancelRequested: 'placement-cancel-requested',
    ItemPlaced: 'item-placed',
    TasksChanged: 'tasks-changed',
    StreakChanged: 'streak-changed',
    IslandLayoutChanged: 'island-layout-changed',
    CoinBoostChanged: 'coin-boost-changed',
    ItemPurchased: 'item-purchased',
    CatMoodChanged: 'cat-mood-changed',

    // Travelling between islands, in the order they happen
    TravelRequested: 'travel-requested',
    TravelStarted: 'travel-started',
    // The island fades out to the open sea
    TravelFadeOut: 'travel-fade-out',
    // The next island has loaded (the boat is still sailing in)
    VisitStateChanged: 'visit-state-changed',
    // The cat has stepped off the boat, so another trip can start
    TravelFinished: 'travel-finished',

    // Online
    AccountChanged: 'account-changed',
    OnlineStateChanged: 'online-state-changed',
    NotificationReceived: 'notification-received',

    // Requests between parts of the UI
    ToastRequested: 'toast-requested',
    ProfilePanelRequested: 'profile-panel-requested',
    InventoryPanelRequested: 'inventory-panel-requested',
    NotificationsMenuRequested: 'notifications-menu-requested',
    EncourageRequested: 'encourage-requested'
} as const;

export type ScreenEdge = 'left' | 'right' | 'bottom';

export interface UiPanelToggledPayload
{
    panelId: string;
    isOpen: boolean;
    coveredEdge: ScreenEdge;
    // Fraction of the screen covered while open (of the width for 'left' and 'right', of the height for 'bottom')
    coveredFraction: number;
}

export interface CoinsChangedPayload
{
    coins: number;
    change: number;
}

export interface InventoryChangedPayload
{
    itemId: string;
    count: number;
}

export interface CoinRewardRequestedPayload
{
    // Coins to give, with any coin boost already applied
    amount: number;
    // The coin boost that was applied (1 = none)
    multiplier: number;
    // Where the coins burst from, in browser viewport coordinates
    clientX: number;
    clientY: number;
}

export interface PlacementPayload
{
    itemId: string;
}

export interface PlacementEndedPayload
{
    itemId: string;
    wasPlaced: boolean;
}

export interface ItemPlacedPayload
{
    itemId: string;
    // World position of the item's base (bottom-center) and its width
    x: number;
    y: number;
    width: number;
}

export type TaskChangeReason = 'added' | 'completed' | 'reopened' | 'deleted';

export interface TasksChangedPayload
{
    reason: TaskChangeReason;
    taskId: string;
    // Today's progress after the change
    progress: DailyProgress;
    // True only the first time a task is checked off, so checking it again doesn't pay out twice
    isFirstCompletion: boolean;
}

export interface StreakChangedPayload
{
    streakDays: number;
    // +1 when today starts counting toward the streak, -1 when it stops
    change: number;
    isTodayCounted: boolean;
}

export interface IslandLayoutChangedPayload
{
    // 'added' when the player places an item, 'replaced' when a whole saved layout is loaded
    reason: 'added' | 'replaced';
}

export interface ItemPurchasedPayload
{
    itemId: string;
}

export interface CatMoodChangedPayload
{
    // 0 (miserable) to 100 (thriving)
    happiness: number;
    // Name of the mood band the happiness falls in, e.g. 'content'
    moodName: string;
    // The face the cat is showing right now
    expression: CatExpression;
}

export interface CoinBoostChangedPayload
{
    // Extra coins from friends, e.g. 20 means rewards are worth 20% more
    percent: number;
    change: number;
}

// A friend's island to visit
export interface VisitedIsland
{
    ownerUsername: string;
    placedItems: PlacedItemRecord[];
    // Name shown above the player's own cat while visiting
    visitorUsername: string;
}

export interface TravelRequestedPayload
{
    // The island to sail to, or null to sail home
    destination: VisitedIsland | null;
}

export interface TravelStartedPayload
{
    // Whose island the boat is heading to, or null when heading home
    destinationUsername: string | null;
}

export interface VisitStateChangedPayload
{
    // Whose island the player is on, or null on their own island
    hostUsername: string | null;
}

export interface AccountChangedPayload
{
    // null when signed out
    username: string | null;
}

export type OnlineStateChangedPayload = OnlineSnapshot;

export interface NotificationReceivedPayload
{
    notification: OnlineNotification;
}

export type ToastTone = 'info' | 'reward' | 'error';

export interface ToastRequestedPayload
{
    icon: string;
    title: string;
    message?: string;
    tone?: ToastTone;
    // Clicking the toast opens the notifications menu
    opensNotifications?: boolean;
}

export interface EncourageRequestedPayload
{
    username: string;
}
