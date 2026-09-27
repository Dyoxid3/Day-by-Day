import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { Island } from './scenes/Island';
import { IslandLights } from './scenes/IslandLights';
import { MainMenu } from './scenes/MainMenu';
import { AUTO, Core, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { GetContainerSizeInScreenPixels, GetScreenPixelsPerCssPixel, KeepCanvasAtScreenResolution } from './systems/ScreenResolution';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    // Replaced with the container's size in screen pixels when the game starts (see StartGame)
    width: 1024,
    height: 768,
    parent: 'game-container',
    // Matches the sea at the island art's edges (see islandArt.seaColor)
    backgroundColor: '#1ea9e0',
    // Pixel art stays as crisp squares at any zoom: exact when the camera rests on a whole-number zoom (see
    // systems/PixelSnapping), with just the edges between pixels softened mid-zoom
    render: {
        smoothPixelArt: true
    },
    // Fills #game-container (the whole window) at the screen's real resolution, so art pixels can line up with
    // screen pixels. KeepCanvasAtScreenResolution handles resizing, rather than Phaser's scale modes.
    scale: {
        mode: Scale.NONE
    },
    // Tracks two fingers at once on touch screens, for pinch-zooming
    input: {
        activePointers: 3
    },
    scene: [
        Boot,
        Island,
        // Right after Island, so its lamp glows draw on top of the island
        IslandLights,
        Preloader,
        MainMenu,
        MainGame,
        GameOver
    ]
};

const StartGame = (parent: string) => {

    const container = document.getElementById(parent) as HTMLElement;
    const startSize = GetContainerSizeInScreenPixels(container);

    const game = new Game({
        ...config,
        parent,
        width: startSize.width,
        height: startSize.height,
        scale: { ...config.scale, zoom: 1 / GetScreenPixelsPerCssPixel() }
    });

    game.events.once(Core.Events.READY, () => KeepCanvasAtScreenResolution(game, container));

    return game;

}

export default StartGame;
