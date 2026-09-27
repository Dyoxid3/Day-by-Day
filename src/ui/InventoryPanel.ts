import { EventBus, GameEvents, type PlacementPayload, type UiPanelToggledPayload } from '../game/EventBus';
import { GetSellPrice, GetShopItem, type ShopItem } from '../game/data/ShopCatalog';
import { playerInventory } from '../game/state/Inventory';
import { RequestCoinRewardAtScreenPoint } from '../game/systems/CoinRewards';
import { onlineSession } from '../online/OnlineSession';
import { GetAssetUrl, uiAssets } from './UiAssets';
import './InventoryPanel.css';

const panelId = 'inventory-panel';

// Slides in from the right: items bought but not yet placed, stacked by type. Clicking a stack shows
// buttons to place one on the island or sell one back for part of its price.
export class InventoryPanel
{
    private container: HTMLElement;
    private panelElement: HTMLDivElement;
    private gridElement: HTMLDivElement;
    private isOpen = false;
    // The stack showing its Place / Sell buttons
    private selectedItemId?: string;

    constructor (container: HTMLElement)
    {
        this.container = container;

        this.panelElement = document.createElement('div');
        this.panelElement.className = 'inventory-panel';

        const headerElement = document.createElement('div');
        headerElement.className = 'inventory-header';

        const titleElement = document.createElement('h2');
        titleElement.className = 'inventory-title';
        titleElement.textContent = 'Inventory';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'inventory-close pixel-circle is-shape-on-hover';
        closeButton.textContent = 'x';
        closeButton.setAttribute('aria-label', 'Close inventory');
        closeButton.addEventListener('click', () => this.SetOpen(false));

        headerElement.append(titleElement, closeButton);

        const hintElement = document.createElement('p');
        hintElement.className = 'inventory-hint';
        hintElement.textContent = 'Click an item to place it on your island or sell it.';

        this.gridElement = document.createElement('div');
        this.gridElement.className = 'inventory-grid';

        this.panelElement.append(headerElement, hintElement, this.gridElement);
        container.append(this.panelElement);

        this.Render();

        EventBus.on(GameEvents.InventoryPanelRequested, () => this.SetOpen(true));
        EventBus.on(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
        EventBus.on(GameEvents.InventoryChanged, this.Render, this);
        EventBus.on(GameEvents.PlayerDataLoaded, this.Render, this);
        // Placing is only possible on your own island, and not mid-trip
        EventBus.on(GameEvents.TravelStarted, this.Render, this);
        EventBus.on(GameEvents.TravelFinished, this.Render, this);
        EventBus.on(GameEvents.VisitStateChanged, this.Render, this);
        window.addEventListener('resize', () => {
            if (this.isOpen)
            {
                this.EmitToggled();
            }
        });
    }

    SetOpen (isOpen: boolean)
    {
        if (this.isOpen === isOpen)
        {
            return;
        }

        this.isOpen = isOpen;
        this.selectedItemId = undefined;
        this.panelElement.classList.toggle('is-open', isOpen);
        this.Render();
        this.EmitToggled();
    }

    private EmitToggled ()
    {
        const payload: UiPanelToggledPayload = {
            panelId,
            isOpen: this.isOpen,
            coveredEdge: 'right',
            // Measured rather than assumed, since the panel has a minimum width on small screens
            coveredFraction: this.panelElement.getBoundingClientRect().width / this.container.getBoundingClientRect().width
        };

        EventBus.emit(GameEvents.UiPanelToggled, payload);
    }

    // Only one panel is open at a time
    private HandleUiPanelToggled (payload: UiPanelToggledPayload)
    {
        if (payload.isOpen && payload.panelId !== panelId)
        {
            this.SetOpen(false);
        }
    }

    private Render ()
    {
        const stacks = playerInventory.GetStacks()
            .map(stack => ({ item: GetShopItem(stack.itemId), count: stack.count }))
            .filter((stack): stack is { item: ShopItem, count: number } => stack.item !== undefined);

        if (!stacks.some(stack => stack.item.id === this.selectedItemId))
        {
            this.selectedItemId = undefined;
        }

        if (stacks.length === 0)
        {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'inventory-empty';
            emptyMessage.textContent = 'Nothing here yet. Buy something in the shop and choose "Store in inventory" to keep it for later.';
            this.gridElement.replaceChildren(emptyMessage);
            return;
        }

        this.gridElement.replaceChildren(...stacks.map(stack => this.CreateStackCard(stack.item, stack.count)));
    }

    private CreateStackCard (item: ShopItem, count: number): HTMLDivElement
    {
        const isSelected = item.id === this.selectedItemId;
        const card = document.createElement('div');
        card.className = 'inventory-item';
        card.classList.toggle('is-selected', isSelected);

        const mainButton = document.createElement('button');
        mainButton.type = 'button';
        mainButton.className = 'inventory-item-main';
        mainButton.setAttribute('aria-expanded', String(isSelected));
        mainButton.addEventListener('click', () => {
            this.selectedItemId = isSelected ? undefined : item.id;
            this.Render();
        });

        const imageElement = document.createElement('img');
        imageElement.className = 'inventory-item-image';
        imageElement.src = GetAssetUrl(item.imageFile);
        imageElement.alt = '';
        imageElement.draggable = false;

        const countElement = document.createElement('span');
        countElement.className = 'inventory-item-count pixel-pill';
        countElement.textContent = `x${count}`;

        const nameElement = document.createElement('span');
        nameElement.className = 'inventory-item-name';
        nameElement.textContent = item.name;

        mainButton.append(imageElement, countElement, nameElement);
        card.append(mainButton);

        if (isSelected)
        {
            card.append(this.CreateStackActions(item));
        }

        return card;
    }

    private CreateStackActions (item: ShopItem): HTMLDivElement
    {
        const actions = document.createElement('div');
        actions.className = 'inventory-item-actions';

        const canPlace = onlineSession.GetVisitingUsername() === null && !onlineSession.IsTraveling();
        const placeButton = document.createElement('button');
        placeButton.type = 'button';
        placeButton.className = 'inventory-action is-primary';
        placeButton.textContent = 'Place';
        placeButton.disabled = !canPlace;
        placeButton.title = canPlace ? 'Put one on your island' : 'Sail home to place things on your island';
        placeButton.addEventListener('click', () => this.PlaceOne(item));

        const sellButton = document.createElement('button');
        sellButton.type = 'button';
        sellButton.className = 'inventory-action';
        sellButton.title = `Sell one back for ${GetSellPrice(item)} coins (bought for ${item.price})`;

        const coinIcon = document.createElement('img');
        coinIcon.src = uiAssets.coin;
        coinIcon.alt = '';
        sellButton.append('Sell ', coinIcon, String(GetSellPrice(item)));
        sellButton.addEventListener('click', () => this.SellOne(item, sellButton));

        actions.append(placeButton, sellButton);

        return actions;
    }

    // Same placing as right after buying: if the player cancels, the item comes back here
    private PlaceOne (item: ShopItem)
    {
        this.SetOpen(false);

        if (!playerInventory.TryRemoveItem(item.id))
        {
            return;
        }

        const payload: PlacementPayload = { itemId: item.id };

        EventBus.emit(GameEvents.PlacementRequested, payload);
    }

    // Coins stream from the sell button to the counter; friends' coin boost doesn't apply to sales
    private SellOne (item: ShopItem, sellButton: HTMLButtonElement)
    {
        const buttonBounds = sellButton.getBoundingClientRect();

        if (!playerInventory.TryRemoveItem(item.id))
        {
            return;
        }

        RequestCoinRewardAtScreenPoint(
            GetSellPrice(item),
            buttonBounds.left + buttonBounds.width / 2,
            buttonBounds.top + buttonBounds.height / 2,
            false
        );
    }
}
