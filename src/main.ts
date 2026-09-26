import StartGame from './game/main';
import { BottomPanel } from './ui/BottomPanel';
import { TodoList } from './ui/TodoList';
import { ProgressRing } from './ui/ProgressRing';
import { ShopPanel } from './ui/ShopPanel';
import { Hud } from './ui/Hud';
import { CoinRewardAnimation } from './ui/CoinRewardAnimation';
import './ui/theme.css';

document.addEventListener('DOMContentLoaded', () => {

    StartGame('game-container');

    const gameContainer = document.getElementById('game-container') as HTMLElement;

    const bottomPanel = new BottomPanel(gameContainer);
    new TodoList(bottomPanel.leftSection, gameContainer);
    new ProgressRing(bottomPanel.centerSection);

    const shopPanel = new ShopPanel(gameContainer);
    const hud = new Hud(gameContainer, {
        onShopPressed: () => shopPanel.Toggle(),
        // Nothing to open yet; connect the notifications panel here once it exists
        onNotificationsPressed: () => {}
    });

    new CoinRewardAnimation(gameContainer, hud.coinIconElement);

});
