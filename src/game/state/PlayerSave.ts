import { EventBus, GameEvents, type AccountChangedPayload } from '../EventBus';
import { comebacks, type ComebacksSaveData } from './Comebacks';
import { dailyStars, type DailyStarsSaveData } from './DailyStars';
import { dayCycle, type DayCycleSaveData } from './DayCycle';
import { eveningFocus, type EveningFocusSaveData } from './EveningFocus';
import { gentleHelpers, type GentleHelpersSaveData } from './GentleHelpers';
import { playerInventory } from './Inventory';
import { lanterns, type LanternsSaveData } from './Lanterns';
import { letters, type LettersSaveData } from './Letters';
import { moodCheckIn, type MoodCheckInSaveData } from './MoodCheckIn';
import { shopUnlocks, type ShopUnlocksSaveData } from './ShopUnlocks';
import { playerStars, type StarsSaveData } from './Stars';
import { playerTaskList, type TaskListSaveData } from './TaskList';
import { playerWallet } from './Wallet';

const saveSettings = {
    storageKeyPrefix: 'island-save-',
    guestProfile: 'guest',
    // Waits for quick changes to settle before writing
    saveDelayMs: 400,
    // After a reload with a login kept, how long to wait for the account before starting the day as a guest
    waitForAccountMs: 4000
};

// Bump when the save's shape changes in a way older saves can't be read as
const saveVersion = 1;

interface SaveFile
{
    version: number;
    wallet: { coins?: number };
    inventory: { itemCounts?: Record<string, number> };
    stars: StarsSaveData;
    tasks: TaskListSaveData;
    day: DayCycleSaveData;
    dailyStars: DailyStarsSaveData;
    mood: MoodCheckInSaveData;
    evening: EveningFocusSaveData;
    unlocks: ShopUnlocksSaveData;
    comebacks: ComebacksSaveData;
    letters: LettersSaveData;
    lanterns: LanternsSaveData;
    helpers: GentleHelpersSaveData;
}

// Everything the changes below touch gets saved soon after
const eventsThatChangeTheSave = [
    GameEvents.CoinsChanged,
    GameEvents.InventoryChanged,
    GameEvents.StarsChanged,
    GameEvents.TasksChanged,
    GameEvents.DayStarted,
    GameEvents.DayPlanned,
    GameEvents.FeelingShared,
    GameEvents.FocusOffered,
    GameEvents.FocusApplied,
    GameEvents.NightNudge,
    GameEvents.ItemUnlocked,
    GameEvents.ComebackCounted,
    GameEvents.LettersChanged,
    GameEvents.LanternOpened,
    GameEvents.GentleHelpersChanged
];

// Keeps the player's progress (coins, stars, items, today's tasks and check-in) in this browser, separately for each
// account. Guests keep nothing: every visit as a guest starts fresh. A new account starts fresh too, like a new day
// (even if an old account with that name left a save behind). The island's furniture is saved online instead (see
// OnlineSession).
class PlayerSave
{
    private profile = saveSettings.guestProfile;
    private saveTimerId?: number;
    private hasStartedDays = false;

    // Call once at startup, before the UI is built. Pass true when a login from before a reload is being resumed,
    // so the day's check-in waits for that account's progress instead of starting on the guest's.
    Start (isResumingLogin: boolean)
    {
        // Guest progress used to be saved; it isn't any more
        DeleteSaveFile(saveSettings.guestProfile);
        this.Load(saveSettings.guestProfile);

        for (const eventName of eventsThatChangeTheSave)
        {
            EventBus.on(eventName, this.RequestSave, this);
        }

        EventBus.on(GameEvents.AccountChanged, this.HandleAccountChanged, this);
        window.addEventListener('pagehide', () => this.SaveNow());

        if (isResumingLogin)
        {
            window.setTimeout(() => this.StartDaysOnce(), saveSettings.waitForAccountMs);
        }
        else
        {
            this.StartDaysOnce();
        }
    }

    private HandleAccountChanged (payload: AccountChangedPayload)
    {
        const profile = payload.username ? payload.username.toLowerCase() : saveSettings.guestProfile;

        if (payload.isNewAccount)
        {
            DeleteSaveFile(profile);
        }

        if (profile !== this.profile || payload.isNewAccount)
        {
            this.SaveNow();
            // An account with no save here (like a new one) starts fresh, never with the guest's progress
            this.Load(profile);
        }

        this.StartDaysOnce();
    }

    // Loading progress later has the day cycle look at that progress's day again (see Load)
    private StartDaysOnce ()
    {
        if (!this.hasStartedDays)
        {
            this.hasStartedDays = true;
            dayCycle.Start();
        }
    }

    private Load (profile: string)
    {
        const save = ReadSaveFile(profile);

        this.profile = profile;
        playerWallet.LoadSaveData(save?.wallet);
        playerInventory.LoadSaveData(save?.inventory);
        playerStars.LoadSaveData(save?.stars);
        playerTaskList.LoadSaveData(save?.tasks);
        dayCycle.LoadSaveData(save?.day);
        dailyStars.LoadSaveData(save?.dailyStars);
        moodCheckIn.LoadSaveData(save?.mood);
        eveningFocus.LoadSaveData(save?.evening);
        shopUnlocks.LoadSaveData(save?.unlocks);
        comebacks.LoadSaveData(save?.comebacks);
        letters.LoadSaveData(save?.letters);
        lanterns.LoadSaveData(save?.lanterns);
        gentleHelpers.LoadSaveData(save?.helpers);

        EventBus.emit(GameEvents.PlayerDataLoaded);
        shopUnlocks.UnlockNewItems();

        if (this.hasStartedDays)
        {
            dayCycle.Start();
        }
    }

    private RequestSave ()
    {
        window.clearTimeout(this.saveTimerId);
        this.saveTimerId = window.setTimeout(() => this.SaveNow(), saveSettings.saveDelayMs);
    }

    private SaveNow ()
    {
        window.clearTimeout(this.saveTimerId);

        if (this.profile === saveSettings.guestProfile)
        {
            return;
        }

        const save: SaveFile = {
            version: saveVersion,
            wallet: playerWallet.ToSaveData(),
            inventory: playerInventory.ToSaveData(),
            stars: playerStars.ToSaveData(),
            tasks: playerTaskList.ToSaveData(),
            day: dayCycle.ToSaveData(),
            dailyStars: dailyStars.ToSaveData(),
            mood: moodCheckIn.ToSaveData(),
            evening: eveningFocus.ToSaveData(),
            unlocks: shopUnlocks.ToSaveData(),
            comebacks: comebacks.ToSaveData(),
            letters: letters.ToSaveData(),
            lanterns: lanterns.ToSaveData(),
            helpers: gentleHelpers.ToSaveData()
        };

        try
        {
            localStorage.setItem(saveSettings.storageKeyPrefix + this.profile, JSON.stringify(save));
        }
        catch
        {
            // Storage can be blocked (e.g. some private windows); progress then lasts until the page closes
        }
    }
}

function ReadSaveFile (profile: string): Partial<SaveFile> | null
{
    if (profile === saveSettings.guestProfile)
    {
        return null;
    }

    try
    {
        const text = localStorage.getItem(saveSettings.storageKeyPrefix + profile);
        const save: unknown = text ? JSON.parse(text) : null;

        if (typeof save === 'object' && save !== null && (save as Partial<SaveFile>).version === saveVersion)
        {
            return save as Partial<SaveFile>;
        }
    }
    catch
    {
        // An unreadable save starts fresh
    }

    return null;
}

function DeleteSaveFile (profile: string)
{
    try
    {
        localStorage.removeItem(saveSettings.storageKeyPrefix + profile);
    }
    catch
    {
        // Storage can be blocked; there's then nothing saved to delete
    }
}

export const playerSave = new PlayerSave();
