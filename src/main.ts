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
import { GentleCard } from './ui/GentleCard';
import { LoginPrompt } from './ui/LoginPrompt';
import { DayStartFlow } from './ui/DayStartFlow';
import { EveningPrompts } from './ui/EveningPrompts';
import { RewardNotices } from './ui/RewardNotices';
import { LetterCards } from './ui/Letters';
import { LanternMessages } from './ui/LanternMessages';
import { GentleHelperCards } from './ui/GentleHelpers';
import { DebugMenu } from './ui/DebugMenu';
import { onlineSession } from './online/OnlineSession';
import { GetStoredToken } from './online/OnlineApi';
import { RegisterDemoControls } from './online/DemoControls';
import { playerSave } from './game/state/PlayerSave';
import { InstallUiShapeAssets } from './ui/UiAssets';
import { InstallPixelTints } from './ui/PixelTints';
import { InstallUiScale } from './ui/UiScale';
import { InstallSoundEffects } from './audio/SoundEffects';
import './ui/theme.css';

document.addEventListener('DOMContentLoaded', () => {

    // The pixel-art circles and pills the UI is drawn with, and the colors they can be tinted
    InstallUiShapeAssets();
    InstallPixelTints();
    // Makes the UI bigger on bigger screens
    InstallUiScale();
    // Clicks, coins, plops and other sounds (see audio/SoundEffects for the files and volumes)
    InstallSoundEffects();

    // The game draws some text itself (like cats' name tags), so it waits for the pixel font to load first
    document.fonts.load('16px "Island Pixel"')
        .catch(() => undefined)
        .finally(() => StartGame('game-container'));

    const gameContainer = document.getElementById('game-container') as HTMLElement;

    // The bottom menu: to-do list, today's progress, and buttons for the profile (with friends) and inventory
    const bottomPanel = new BottomPanel(gameContainer, { left: 'To-do', center: 'Progress', right: 'Other' });
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

    // The calm cards for the start of each day, the evening, and moments worth pausing for
    const gentleCard = new GentleCard(gameContainer);
    // First things first: logging in (unless a login was kept), before the day's check-in
    new LoginPrompt(gentleCard);
    new DayStartFlow(gentleCard);
    new EveningPrompts(gentleCard);
    new RewardNotices(gentleCard, hud.bellButtonElement);
    // Letters to future you, the lanterns friends leave, and the gentle helpers (Google Gemini)
    new LetterCards(gentleCard);
    new LanternMessages(gentleCard);
    new GentleHelperCards(gentleCard);

    // Loads this browser's saved progress and starts the day (asking how the player feels if it's a new one).
    // Comes after the UI, which redraws when progress loads. A kept login loads that account's progress instead.
    playerSave.Start(GetStoredToken() !== null);

    // Picks up a login from before the page was reloaded
    onlineSession.Start();

    // E, V and T: a demo friend encourages you, visits you, or has a tough day, for showing things off on one screen.
    // The debug menu (shown with the 1 key, shortcuts J K L N M) moves the clock and hands out stars.
    if (import.meta.env.DEV)
    {
        RegisterDemoControls();
        new DebugMenu(gameContainer);
    }

});
