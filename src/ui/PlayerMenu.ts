import { EventBus, GameEvents } from '../game/EventBus';
import { playerInventory } from '../game/state/Inventory';
import { CreateAvatar } from './UiAvatar';
import './PlayerMenu.css';

// Title above the buttons in the bottom panel's right-hand section
const sectionTitle = 'Friends';

// Buttons in the bottom panel that open the player's own menus: their profile (with their friends) and
// their inventory. Nothing personal shows until a menu is opened.
export class PlayerMenu
{
    private inventoryCountElement: HTMLSpanElement;

    constructor (parent: HTMLElement)
    {
        const rootElement = document.createElement('section');
        rootElement.className = 'player-menu';

        const headingElement = document.createElement('h3');
        headingElement.className = 'bottom-panel-heading';
        headingElement.textContent = sectionTitle;

        // A plain picture, not the player's own colors, so it gives nothing away
        const profileButton = CreateMenuButton(CreateAvatar(null, 'small'), 'Profile', GameEvents.ProfilePanelRequested);

        const inventoryIcon = document.createElement('span');
        inventoryIcon.className = 'player-menu-emoji';
        inventoryIcon.textContent = '🎒';

        const inventoryButton = CreateMenuButton(inventoryIcon, 'Inventory', GameEvents.InventoryPanelRequested);

        // How many items are waiting to be placed or sold
        this.inventoryCountElement = document.createElement('span');
        this.inventoryCountElement.className = 'player-menu-count';
        inventoryButton.insertBefore(this.inventoryCountElement, inventoryButton.lastChild);

        rootElement.append(headingElement, profileButton, inventoryButton);
        parent.append(rootElement);

        this.UpdateInventoryCount();
        EventBus.on(GameEvents.InventoryChanged, this.UpdateInventoryCount, this);
    }

    private UpdateInventoryCount ()
    {
        const totalCount = playerInventory.GetTotalCount();

        this.inventoryCountElement.textContent = String(totalCount);
        this.inventoryCountElement.hidden = totalCount === 0;
    }
}

function CreateMenuButton (icon: HTMLElement, label: string, requestEvent: string): HTMLButtonElement
{
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'player-menu-button';
    button.addEventListener('click', () => EventBus.emit(requestEvent));

    const iconSlot = document.createElement('span');
    iconSlot.className = 'player-menu-icon';
    iconSlot.append(icon);

    const labelElement = document.createElement('span');
    labelElement.className = 'player-menu-label';
    labelElement.textContent = label;

    const chevron = document.createElement('span');
    chevron.className = 'player-menu-chevron';
    chevron.textContent = '›';

    button.append(iconSlot, labelElement, chevron);

    return button;
}
