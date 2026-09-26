import { EventBus, GameEvents, type PlacementPayload, type UiPanelToggledPayload } from '../game/EventBus';
import { shopCatalog, type ShopItem } from '../game/data/ShopCatalog';
import { playerWallet } from '../game/state/Wallet';
import { playerInventory } from '../game/state/Inventory';
import { PurchasePrompt, type PurchaseChoice } from './PurchasePrompt';
import { GetAssetUrl, uiAssets } from './UiAssets';
import { ShakeElement } from './UiAnimations';
import './ShopPanel.css';

const panelId = 'shop-panel';

// Slides in from the left; lists everything in the shop catalog in two scrollable columns
export class ShopPanel
{
    private container: HTMLElement;
    private panelElement: HTMLDivElement;
    private itemCards = new Map<string, HTMLButtonElement>();
    private purchasePrompt: PurchasePrompt;
    private isOpen = false;

    constructor (container: HTMLElement)
    {
        this.container = container;

        this.panelElement = document.createElement('div');
        this.panelElement.className = 'shop-panel';

        const headerElement = document.createElement('div');
        headerElement.className = 'shop-header';

        const titleElement = document.createElement('h2');
        titleElement.className = 'shop-title';
        titleElement.textContent = 'Shop';

        const closeButton = document.createElement('button');
        closeButton.className = 'shop-close-button';
        closeButton.type = 'button';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', 'Close shop');
        closeButton.addEventListener('click', () => this.SetOpen(false));

        headerElement.append(titleElement, closeButton);

        const itemGridElement = document.createElement('div');
        itemGridElement.className = 'shop-item-grid';

        for (const item of shopCatalog)
        {
            const card = this.CreateItemCard(item);

            this.itemCards.set(item.id, card);
            itemGridElement.append(card);
        }

        this.panelElement.append(headerElement, itemGridElement);
        container.append(this.panelElement);

        this.purchasePrompt = new PurchasePrompt(container);

        this.RefreshAffordability();

        EventBus.on(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
        EventBus.on(GameEvents.CoinsChanged, this.RefreshAffordability, this);
        window.addEventListener('resize', () => this.HandleWindowResize());
    }

    Toggle ()
    {
        this.SetOpen(!this.isOpen);
    }

    SetOpen (isOpen: boolean)
    {
        if (this.isOpen === isOpen)
        {
            return;
        }

        this.isOpen = isOpen;
        this.panelElement.classList.toggle('is-open', isOpen);

        if (!isOpen)
        {
            this.purchasePrompt.Close();
        }

        this.EmitToggled();
    }

    private EmitToggled ()
    {
        const payload: UiPanelToggledPayload = {
            panelId,
            isOpen: this.isOpen,
            coveredEdge: 'left',
            // Measured rather than assumed, since the panel has a minimum width on small screens
            coveredFraction: this.panelElement.offsetWidth / this.container.clientWidth
        };

        EventBus.emit(GameEvents.UiPanelToggled, payload);
    }

    private CreateItemCard (item: ShopItem): HTMLButtonElement
    {
        const card = document.createElement('button');
        card.className = 'shop-item-card';
        card.type = 'button';
        card.addEventListener('click', () => this.HandleItemPressed(item, card));

        const imageElement = document.createElement('img');
        imageElement.className = 'shop-item-image';
        imageElement.src = GetAssetUrl(item.imageFile);
        imageElement.alt = '';
        imageElement.draggable = false;

        const nameElement = document.createElement('span');
        nameElement.className = 'shop-item-name';
        nameElement.textContent = item.name;

        const priceElement = document.createElement('span');
        priceElement.className = 'shop-item-price';
        const coinIcon = document.createElement('img');
        coinIcon.src = uiAssets.coin;
        coinIcon.alt = '';
        const priceText = document.createElement('span');
        priceText.textContent = String(item.price);
        priceElement.append(coinIcon, priceText);

        card.append(imageElement, nameElement, priceElement);

        return card;
    }

    private HandleItemPressed (item: ShopItem, card: HTMLButtonElement)
    {
        if (!playerWallet.CanAfford(item.price))
        {
            ShakeElement(card);
            return;
        }

        this.purchasePrompt.Open(item, choice => this.HandlePurchaseChoice(item, card, choice));
    }

    // Coins are spent on every purchase, including repeats of items already owned
    private HandlePurchaseChoice (item: ShopItem, card: HTMLButtonElement, choice: PurchaseChoice)
    {
        if (!playerWallet.TrySpendCoins(item.price))
        {
            ShakeElement(card);
            return;
        }

        if (choice === 'store')
        {
            playerInventory.AddItem(item.id);
            return;
        }

        this.SetOpen(false);

        const payload: PlacementPayload = { itemId: item.id };

        EventBus.emit(GameEvents.PlacementRequested, payload);
    }

    private RefreshAffordability ()
    {
        for (const item of shopCatalog)
        {
            this.itemCards.get(item.id)?.classList.toggle('is-unaffordable', !playerWallet.CanAfford(item.price));
        }
    }

    // Only one panel is open at a time
    private HandleUiPanelToggled (payload: UiPanelToggledPayload)
    {
        if (payload.isOpen && payload.panelId !== panelId)
        {
            this.SetOpen(false);
        }
    }

    private HandleWindowResize ()
    {
        if (this.isOpen)
        {
            this.EmitToggled();
        }
    }
}
