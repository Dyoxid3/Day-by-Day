import { Events } from 'phaser';
import type { DailyProgress } from './data/TaskTypes';

// Shared channel between the HTML UI and Phaser scenes
export const EventBus = new Events.EventEmitter();

export const GameEvents = {
    UiPanelToggled: 'ui-panel-toggled',
    CoinsChanged: 'coins-changed',
    InventoryChanged: 'inventory-changed',
    CoinRewardRequested: 'coin-reward-requested',
    PlacementRequested: 'placement-requested',
    PlacementStarted: 'placement-started',
    PlacementEnded: 'placement-ended',
    ItemPlaced: 'item-placed',
    TasksChanged: 'tasks-changed',
    StreakChanged: 'streak-changed'
} as const;

export type ScreenEdge = 'left' | 'bottom';

export interface UiPanelToggledPayload
{
    panelId: string;
    isOpen: boolean;
    coveredEdge: ScreenEdge;
    // Fraction of the screen covered while open (of the width for 'left', of the height for 'bottom')
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
    amount: number;
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
}

export interface StreakChangedPayload
{
    streakDays: number;
}
