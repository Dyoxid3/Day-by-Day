import { EventBus, GameEvents } from '../game/EventBus';
import { playerInventory } from '../game/state/Inventory';
import './InventoryButton.css';

// Sits under the friends list in the bottom panel and opens the inventory
export class InventoryButton
{
    private buttonElement: HTMLButtonElement;
    private countElement: HTMLSpanElement;

    constructor (parent: HTMLElement)
    {
        this.buttonElement = document.createElement('button');
        this.buttonElement.type = 'button';
        this.buttonElement.className = 'inventory-button';
        this.buttonElement.addEventListener('click', () => EventBus.emit(GameEvents.InventoryPanelRequested));

        const iconElement = document.createElement('span');
        iconElement.className = 'inventory-button-icon';
        iconElement.textContent = '🎒';

        const labelElement = document.createElement('span');
        labelElement.className = 'inventory-button-label';
        labelElement.textContent = 'Inventory';

        // How many items are waiting to be placed or sold
        this.countElement = document.createElement('span');
        this.countElement.className = 'inventory-button-count';

        const chevron = document.createElement('span');
        chevron.className = 'inventory-button-chevron';
        chevron.textContent = '›';

        this.buttonElement.append(iconElement, labelElement, this.countElement, chevron);
        parent.append(this.buttonElement);

        this.UpdateCount();
        EventBus.on(GameEvents.InventoryChanged, this.UpdateCount, this);
    }

    private UpdateCount ()
    {
        const totalCount = playerInventory.GetTotalCount();

        this.countElement.textContent = String(totalCount);
        this.countElement.hidden = totalCount === 0;
        this.buttonElement.setAttribute('aria-label', totalCount > 0 ? `Inventory (${totalCount} items)` : 'Inventory');
    }
}
