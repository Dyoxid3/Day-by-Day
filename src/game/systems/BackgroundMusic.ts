import { Scene } from 'phaser';

export const musicSettings = {
    // Off for now. Set to true (and point file at a track) to play music again; while off, nothing is downloaded.
    isEnabled: false,
    key: 'background-music',
    // Inside public/assets
    file: 'sounds/game_music_draft.wav',
    // Quiet, so it sits in the background (0 = silent, 1 = full volume)
    volume: 0.18
};

// Call from a scene's preload. The island scene restarts on every boat trip, so the music only loads once.
export function PreloadBackgroundMusic (scene: Scene)
{
    if (musicSettings.isEnabled && !scene.cache.audio.exists(musicSettings.key))
    {
        scene.load.audio(musicSettings.key, musicSettings.file);
    }
}

// Loops the music quietly for the whole game. Sounds belong to the game rather than a scene, so it keeps playing
// through boat trips. Browsers only allow sound after the player first clicks or taps, and Phaser waits for that.
export function PlayBackgroundMusic (scene: Scene)
{
    if (!musicSettings.isEnabled)
    {
        return;
    }

    const existingMusic = scene.sound.get(musicSettings.key);

    if (existingMusic)
    {
        return;
    }

    scene.sound.add(musicSettings.key, { loop: true, volume: musicSettings.volume }).play();
}
