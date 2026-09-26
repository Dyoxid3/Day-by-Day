import StartGame from './game/main';
import { BottomPanel } from './ui/BottomPanel';
import { TodoList } from './ui/TodoList';
import { ProgressRing } from './ui/ProgressRing';
import { PlayerMenu } from './ui/PlayerMenu';
import { ShopPanel } from './ui/ShopPanel';
import { ProfilePanel } from './ui/ProfilePanel';
import { InventoryPanel } from './ui/InventoryPanel';
import { EncouragePrompt } from './ui/EncouragePrompt';
import { VisitBanner } from './ui/VisitBanner';
import { NotificationsMenu } from './ui/NotificationsMenu';
import { NotificationToasts } from './ui/NotificationToasts';
import { Hud } from './ui/Hud';
import { CoinRewardAnimation } from './ui/CoinRewardAnimation';
import { onlineSession } from './online/OnlineSession';
import { RegisterDemoControls } from './online/DemoControls';
import './ui/theme.css';

document.addEventListener('DOMContentLoaded', () => {

    StartGame('game-container');

    const gameContainer = document.getElementById('game-container') as HTMLElement;

    // The bottom menu: to-do list, today's progress, and buttons for the profile (with friends) and inventory
    const bottomPanel = new BottomPanel(gameContainer, { left: 'To-do', center: 'Progress', right: 'Friends' });
    new TodoList(bottomPanel.leftSection, gameContainer);
    new ProgressRing(bottomPanel.centerSection);
    new PlayerMenu(bottomPanel.rightSection);

    const shopPanel = new ShopPanel(gameContainer);
    new ProfilePanel(gameContainer);
    new InventoryPanel(gameContainer);
    new EncouragePrompt(gameContainer);
    new VisitBanner(gameContainer);

    const notificationsMenu = new NotificationsMenu(gameContainer);
    const hud = new Hud(gameContainer, {
        onShopPressed: () => shopPanel.Toggle(),
        onNotificationsPressed: () => notificationsMenu.Toggle()
    });

    notificationsMenu.SetAnchor(hud.bellButtonElement);

    new NotificationToasts(gameContainer);
    new CoinRewardAnimation(gameContainer, hud.coinIconElement);

    // Picks up a login from before the page was reloaded
    onlineSession.Start();

    // E and V: a demo friend encourages you or visits you, for showing things off on one screen
    if (import.meta.env.DEV)
    {
        RegisterDemoControls();
    }

});
