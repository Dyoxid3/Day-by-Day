import {
    EventBus,
    GameEvents,
    type CoinsChangedPayload,
    type DayStarEarnedPayload,
    type TasksChangedPayload
} from '../game/EventBus';

interface SoundEffectSettings
{
    // Inside public/assets/sounds
    file: string;
    // 0 = silent, 1 = the file's full volume
    volume: number;
}

// Every sound effect. Swap a file or change a volume here; when each one plays is in InstallSoundEffects below.
export const soundEffects = {
    // Checking off a task
    menuButton: { file: 'MenuButton.wav', volume: 0.16 },
    // Buying an item in the shop
    menuConfirm: { file: 'MenuConfirm.wav', volume: 0.18 },
    // Each coin landing on the coin counter
    coinCollect: { file: 'coincollect.wav', volume: 0.14 },
    // Receiving a lantern, a letter from past you, or finishing the whole day
    positivity: { file: 'positivity.wav', volume: 0.22 },
    // A prop landing on the island, or being put away
    propPlop: { file: 'propPlop.wav', volume: 0.2 },
    // The boat actually setting off to another island (or home), once boarded
    sailToIsland: { file: 'sailToIsland.wav', volume: 0.05 },
    // A friend's boat sailing in to visit
    visitorArrival: { file: 'visitorarrival.wav', volume: 0.2 }
} satisfies Record<string, SoundEffectSettings>;

export type SoundEffectName = keyof typeof soundEffects;

const soundSettings = {
    folder: 'assets/sounds/',
    // Every sound effect together (0 = silent, 1 = as set above)
    masterVolume: 1,
    // The same sound won't start again sooner than this, so a burst of coins doesn't turn into noise
    minRepeatGapMs: 70,
    // Sound takes a moment to switch on after a click or key press; sounds this soon after one still play
    unlockGraceMs: 1000
};

// Plays the sound effects with the Web Audio API, which can play the same sound over itself with no delay.
// Browsers keep sound off until the player first clicks, taps or presses a key, so sounds before that are skipped
// (never saved up to play later).
class SoundEffectPlayer
{
    private context: AudioContext | null = null;
    private output: GainNode | null = null;
    private sounds = new Map<SoundEffectName, Promise<AudioBuffer | null>>();
    private lastPlayedMs = new Map<SoundEffectName, number>();
    private lastUnlockMs = -Infinity;

    Play (name: SoundEffectName)
    {
        const context = this.context;
        const now = performance.now();
        const canPlay = context?.state === 'running' || now - this.lastUnlockMs < soundSettings.unlockGraceMs;

        if (!context || !this.output || !canPlay
            || now - (this.lastPlayedMs.get(name) ?? -Infinity) < soundSettings.minRepeatGapMs)
        {
            return;
        }

        this.lastPlayedMs.set(name, now);
        this.LoadSound(name).then(buffer => {
            if (!buffer || !this.output)
            {
                return;
            }

            const volume = context.createGain();
            volume.gain.value = soundEffects[name].volume;

            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(volume).connect(this.output);
            source.start();
        });
    }

    // Called on the player's first click, tap or key press (and again on later ones, in case the browser paused sound)
    Unlock ()
    {
        this.lastUnlockMs = performance.now();

        if (!this.context)
        {
            const AudioContextType = window.AudioContext
                ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

            if (!AudioContextType)
            {
                return;
            }

            this.context = new AudioContextType();
            this.output = this.context.createGain();
            this.output.gain.value = soundSettings.masterVolume;
            this.output.connect(this.context.destination);

            // Loaded now, so the first time each sound plays it's already ready
            for (const name of Object.keys(soundEffects) as SoundEffectName[])
            {
                this.LoadSound(name);
            }
        }

        if (this.context.state === 'suspended')
        {
            this.context.resume().catch(() => undefined);
        }
    }

    private LoadSound (name: SoundEffectName): Promise<AudioBuffer | null>
    {
        let sound = this.sounds.get(name);

        if (!sound)
        {
            const context = this.context;

            sound = context
                ? fetch(soundSettings.folder + soundEffects[name].file)
                    .then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status))))
                    .then(data => context.decodeAudioData(data))
                    .catch((error: unknown) => {
                        console.warn(`Sound effect "${name}" couldn't load:`, error);

                        return null;
                    })
                : Promise.resolve(null);

            this.sounds.set(name, sound);
        }

        return sound;
    }
}

export const soundEffectPlayer = new SoundEffectPlayer();

export function PlaySoundEffect (name: SoundEffectName)
{
    soundEffectPlayer.Play(name);
}

// Listens for the moments that have a sound. Call once, when the page loads.
export function InstallSoundEffects ()
{
    const Unlock = () => soundEffectPlayer.Unlock();

    // Capture, so sound is on before the first click's own sound tries to play
    window.addEventListener('pointerdown', Unlock, true);
    window.addEventListener('keydown', Unlock, true);

    // Checking a task off the to-do list (not reopening one)
    EventBus.on(GameEvents.TasksChanged, (payload: TasksChangedPayload) => {
        if (payload.reason === 'completed')
        {
            PlaySoundEffect('menuButton');
        }
    });

    // Buying something in the shop
    EventBus.on(GameEvents.ItemPurchased, () => PlaySoundEffect('menuConfirm'));

    EventBus.on(GameEvents.CoinsChanged, (payload: CoinsChangedPayload) => {
        if (payload.change > 0)
        {
            PlaySoundEffect('coinCollect');
        }
    });

    EventBus.on(GameEvents.LanternsReceived, () => PlaySoundEffect('positivity'));
    EventBus.on(GameEvents.FutureLetterDelivered, () => PlaySoundEffect('positivity'));
    // The second star of the day is for finishing everything on the list
    EventBus.on(GameEvents.DayStarEarned, (payload: DayStarEarnedPayload) => {
        if (payload.reason === 'second')
        {
            PlaySoundEffect('positivity');
        }
    });

    EventBus.on(GameEvents.PropLanded, () => PlaySoundEffect('propPlop'));
    EventBus.on(GameEvents.PropStored, () => PlaySoundEffect('propPlop'));
    // Only once the boat is actually sailing (after boarding), not while walking or hopping toward it
    EventBus.on(GameEvents.BoatSetSail, () => PlaySoundEffect('sailToIsland'));
    EventBus.on(GameEvents.VisitorArriving, () => PlaySoundEffect('visitorArrival'));
}
