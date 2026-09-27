import { Events } from 'phaser';
import type { DailyProgress } from './data/TaskTypes';
import type { CatExpression } from './data/CatAppearance';
import type { Feeling } from './data/DaySettings';
import type { PlacedItemRecord } from './state/IslandLayout';
import type { LanternInfo } from './state/Lanterns';
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
    StarsChanged: 'stars-changed',
    IslandLayoutChanged: 'island-layout-changed',
    CoinBoostChanged: 'coin-boost-changed',
    ItemPurchased: 'item-purchased',
    // A shop item became available to buy (the first one is a free gift, put in the inventory)
    ItemUnlocked: 'item-unlocked',
    CatMoodChanged: 'cat-mood-changed',
    // The saved progress for the current account (or guest) was loaded, so everything should redraw
    PlayerDataLoaded: 'player-data-loaded',

    // Days, in the order they happen
    // The debug menu moved the game's clock
    ClockChanged: 'clock-changed',
    // The game's clock reached a new minute
    MinutePassed: 'minute-passed',
    // A new day began (today's tasks were cleared)
    DayStarted: 'day-started',
    // The player came back after at least a day away (the count never goes down)
    ComebackCounted: 'comeback-counted',
    // The player hasn't said how they feel or planned the day yet, so the check-in should open
    CheckInNeeded: 'check-in-needed',
    // The player answered "How are you feeling today?"
    FeelingShared: 'feeling-shared',
    // The player finished planning today's tasks (possibly choosing a rest day)
    DayPlanned: 'day-planned',
    // A star was earned for today's progress, or for coming back after days away
    DayStarEarned: 'day-star-earned',
    // In the evening: the player is offered a shorter list of just their most important tasks
    FocusOffered: 'focus-offered',
    // The list was shortened, either because the player said yes to the offer or because it's late
    FocusApplied: 'focus-applied',
    // It's night and hardly anything is done (and the list is already short): a nudge to do just one thing
    NightNudge: 'night-nudge',

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
    // The player just signed up or logged in (not a login kept from before a reload)
    LoggedIn: 'logged-in',
    OnlineStateChanged: 'online-state-changed',
    NotificationReceived: 'notification-received',
    // A friend's gift arrived (they reached the goal of your encouragement), or your own gift came back
    GiftReceived: 'gift-received',
    // The lanterns friends' encouragement left on the island changed (one arrived, or one was opened)
    LanternsChanged: 'lanterns-changed',
    // The player tapped a lantern, so its message should show
    LanternOpened: 'lantern-opened',

    // Letters to future you: written on good days, handed over on hard ones
    LettersChanged: 'letters-changed',
    FutureLetterWriteRequested: 'future-letter-write-requested',
    // The cat handed over a letter the player wrote on a better day
    FutureLetterDelivered: 'future-letter-delivered',
    // New lanterns appeared on the island (friends' encouragement)
    LanternsReceived: 'lanterns-received',

    // Moments with a sound of their own (see audio/SoundEffects)
    // A placed prop landed on the ground
    PropLanded: 'prop-landed',
    // A prop was put back in the inventory
    PropStored: 'prop-stored',
    // A friend's boat is sailing in to visit the player's island
    VisitorArriving: 'visitor-arriving',
    // A boat actually starts sailing off (after boarding), whether the player's own or a visitor's
    BoatSetSail: 'boat-set-sail',

    // The gentle helpers (Google Gemini) were turned on or off, or found to be (un)available
    GentleHelpersChanged: 'gentle-helpers-changed',
    // The player asked to break a task into smaller steps
    SmallerStepsRequested: 'smaller-steps-requested',

    // Requests between parts of the UI
    ToastRequested: 'toast-requested',
    NewTaskPromptRequested: 'new-task-prompt-requested',
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

// 'focus' when the list was shortened to its most important tasks, 'cleared' when a new day emptied it
export type TaskChangeReason = 'added' | 'completed' | 'reopened' | 'deleted' | 'renamed' | 'focus' | 'cleared';

export interface TasksChangedPayload
{
    reason: TaskChangeReason;
    taskId: string;
    // Today's progress after the change
    progress: DailyProgress;
    // True only the first time a task is checked off, so checking it again doesn't pay out twice
    isFirstCompletion: boolean;
}

export interface StarsChangedPayload
{
    // Stars the player has now (what they can give away)
    stars: number;
    // Every star ever earned or received; shop items unlock by this, so giving stars away never locks anything
    lifetimeStars: number;
    change: number;
}

export interface DayStartedPayload
{
    dayKey: string;
    // Whole days in between that the player didn't play (0 when they played yesterday)
    missedDays: number;
}

export interface ComebackCountedPayload
{
    // Comebacks so far, this one included
    count: number;
    missedDays: number;
}

export interface LanternOpenedPayload
{
    lantern: LanternInfo;
}

export interface LanternsReceivedPayload
{
    // How many new lanterns appeared
    count: number;
}

export interface SmallerStepsRequestedPayload
{
    taskId: string;
}

export interface FeelingSharedPayload
{
    feeling: Feeling;
    dayKey: string;
}

export type DayStarReason = 'first' | 'second' | 'comeback';

export interface DayStarEarnedPayload
{
    amount: number;
    reason: DayStarReason;
}

export interface FocusAppliedPayload
{
    // 'offer' when the player said yes to the evening offer, 'night' when it happened late at night
    reason: 'offer' | 'night';
    // How many tasks were marked as able to wait
    exemptCount: number;
}

export interface NightNudgePayload
{
    // The most important task still to do
    taskName: string;
}

export interface ItemUnlockedPayload
{
    itemId: string;
}

export interface GiftReceivedPayload
{
    coins: number;
    stars: number;
    fromUsername: string;
    // 'gift' from a friend's encouragement, 'returned' when your own gift came back
    kind: 'gift' | 'returned';
}

export interface IslandLayoutChangedPayload
{
    // 'added' when the player places an item, 'removed' when they put one away, 'replaced' when a whole saved layout is loaded
    reason: 'added' | 'removed' | 'replaced';
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
    // True right after signing up: the account starts completely fresh
    isNewAccount: boolean;
}

export interface LoggedInPayload
{
    isNewAccount: boolean;
}

export type OnlineStateChangedPayload = OnlineSnapshot;

export interface NotificationReceivedPayload
{
    notification: OnlineNotification;
}

export type ToastTone = 'info' | 'reward' | 'error';

// Pixel-art pictures a toast can show beside its text (see uiAssets)
export type ToastIcon = 'coin' | 'star' | 'bell';

export interface ToastRequestedPayload
{
    title: string;
    icon?: ToastIcon;
    message?: string;
    tone?: ToastTone;
    // Clicking the toast opens the notifications menu
    opensNotifications?: boolean;
}

export interface EncourageRequestedPayload
{
    username: string;
}
