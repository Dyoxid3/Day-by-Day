import type { ShopItem } from '../game/data/ShopCatalog';
import { GetAssetUrl, uiAssets } from './UiAssets';
import './PurchasePrompt.css';

export type PurchaseChoice = 'place' | 'store';

// Asks whether a bought item should be placed right away or kept in the inventory
export class PurchasePrompt
{
    private overlayElement: HTMLDivElement;
    private itemImageElement: HTMLImageElement;
    private titleElement: HTMLHeadingElement;
    private priceElement: HTMLSpanElement;
    private placeButton: HTMLButtonElement;
    private onChoice?: (choice: PurchaseChoice) => void;

    constructor (container: HTMLElement)
    {
        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'purchase-prompt-overlay';
        this.overlayElement.addEventListener('click', event => {
            if (event.target === this.overlayElement)
            {
                this.Close();
            }
        });

        const dialogElement = document.createElement('div');
        dialogElement.className = 'purchase-prompt';
        dialogElement.setAttribute('role', 'dialog');
        dialogElement.setAttribute('aria-modal', 'true');

        this.itemImageElement = document.createElement('img');
        this.itemImageElement.className = 'purchase-prompt-image';
        this.itemImageElement.alt = '';

        this.titleElement = document.createElement('h3');
        this.titleElement.className = 'purchase-prompt-title';

        const priceRow = document.createElement('div');
        priceRow.className = 'purchase-prompt-price';
        const coinIcon = document.createElement('img');
        coinIcon.src = uiAssets.coin;
        coinIcon.alt = '';
        this.priceElement = document.createElement('span');
        priceRow.append(coinIcon, this.priceElement);

        this.placeButton = CreateButton('Place now', 'purchase-prompt-button is-primary', () => this.Choose('place'));
        const storeButton = CreateButton('Store in inventory', 'purchase-prompt-button', () => this.Choose('store'));
        const cancelButton = CreateButton('Cancel', 'purchase-prompt-button is-subtle', () => this.Close());

        const buttonRow = document.createElement('div');
        buttonRow.className = 'purchase-prompt-buttons';
        buttonRow.append(this.placeButton, storeButton, cancelButton);

        dialogElement.append(this.itemImageElement, this.titleElement, priceRow, buttonRow);
        this.overlayElement.append(dialogElement);
        container.append(this.overlayElement);

        window.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.IsOpen())
            {
                this.Close();
            }
        });
    }

    IsOpen (): boolean
    {
        return this.overlayElement.classList.contains('is-open');
    }

    Open (item: ShopItem, onChoice: (choice: PurchaseChoice) => void)
    {
        this.onChoice = onChoice;
        this.itemImageElement.src = GetAssetUrl(item.imageFile);
        this.titleElement.textContent = `Buy ${item.name}?`;
        this.priceElement.textContent = String(item.price);
        this.overlayElement.classList.add('is-open');
        this.placeButton.focus();
    }

    Close ()
    {
        this.onChoice = undefined;
        this.overlayElement.classList.remove('is-open');
    }

    private Choose (choice: PurchaseChoice)
    {
        const onChoice = this.onChoice;

        this.Close();
        onChoice?.(choice);
    }
}

function CreateButton (label: string, className: string, onClick: () => void): HTMLButtonElement
{
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);

    return button;
}
