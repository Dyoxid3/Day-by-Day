import { EventBus, GameEvents } from '../EventBus';

export interface GentleHelpersSaveData
{
    isEnabled: boolean;
    // Whether the player turned them on or off themselves. Until they do, the helpers follow the default (on).
    hasChosen: boolean;
}

// On unless the player turns them off in their profile
const isEnabledByDefault = true;

// Whether the gentle helpers are on: Google Gemini suggesting smaller steps for big tasks and kinder names for harsh
// ones. They're on by default; the player can turn them off in their profile (task names and how the player feels are
// sent to Google while they're on). They also need the game server to have a Gemini key.
class GentleHelpers
{
    private isEnabled = isEnabledByDefault;
    private hasChosen = false;
    private isAvailable = false;

    IsEnabled (): boolean
    {
        return this.isEnabled;
    }

    // Whether the game server can reach Gemini (it has an API key)
    IsAvailable (): boolean
    {
        return this.isAvailable;
    }

    // On, and able to work
    IsActive (): boolean
    {
        return this.isEnabled && this.isAvailable;
    }

    // The player's own choice, from the switch in their profile (saved even if it matches the default)
    SetEnabled (isEnabled: boolean)
    {
        this.hasChosen = true;
        this.isEnabled = isEnabled;
        EventBus.emit(GameEvents.GentleHelpersChanged);
    }

    SetAvailable (isAvailable: boolean)
    {
        if (isAvailable !== this.isAvailable)
        {
            this.isAvailable = isAvailable;
            EventBus.emit(GameEvents.GentleHelpersChanged);
        }
    }

    ToSaveData (): GentleHelpersSaveData
    {
        return { isEnabled: this.isEnabled, hasChosen: this.hasChosen };
    }

    LoadSaveData (data: Partial<GentleHelpersSaveData> | undefined)
    {
        this.hasChosen = data?.hasChosen === true;
        this.isEnabled = this.hasChosen ? data?.isEnabled === true : isEnabledByDefault;
    }
}

export const gentleHelpers = new GentleHelpers();
