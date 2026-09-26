import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { Island } from './scenes/Island';
import { MainMenu } from './scenes/MainMenu';
import { AUTO, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1024,
    height: 768,
    parent: 'game-container',
    // Matches the sea at the island art's edges (see islandArt.seaColor)
    backgroundColor: '#1ea9e0',
    // Fills #game-container (the whole window) at 1024x768 scale, showing extra world on the longer side
    scale: {
        mode: Scale.EXPAND,
        expandParent: false
    },
    // Tracks two fingers at once on touch screens, for pinch-zooming
    input: {
        activePointers: 3
    },
    scene: [
        Boot,
        Island,
        Preloader,
        MainMenu,
        MainGame,
        GameOver
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
