import { Scene, Geom, Input, Scenes } from 'phaser';
import { EventBus, GameEvents, type ItemPlacedPayload, type PlacementPayload, type PlacementEndedPayload, type UiPanelToggledPayload } from '../EventBus';
import { GetShopItem } from '../data/ShopCatalog';
import { PlacedItem } from '../entities/PlacedItem';
import { playerInventory } from '../state/Inventory';
import { ScreenToWorld } from './CameraMath';
import { PlayPlacementImpact } from '../effects/PlacementImpactEffect';

const placementSettings = {
    previewAlpha: 0.75,
    invalidTint: 0xff6b6b,
    // Keeps the preview above everything else while it's being moved
    previewDepth: 100000
};

// Lets the player move a newly bought item around and drop it on free ground
export class ItemPlacementController
{
    private scene: Scene;
    private placeableArea: Phaser.Geom.Rectangle;
    private placedItems: PlacedItem[] = [];
    private previewItem?: PlacedItem;
    private isPreviewValid = false;
    private hasPointerMovedSinceStart = false;

    constructor (scene: Scene, placeableArea: Phaser.Geom.Rectangle)
    {
        this.scene = scene;
        this.placeableArea = placeableArea;

        scene.input.mouse?.disableContextMenu();
        scene.input.on(Input.Events.POINTER_DOWN, this.HandlePointerDown, this);
        scene.input.on(Input.Events.POINTER_MOVE, this.HandlePointerMove, this);
        scene.input.keyboard?.on('keydown-ESC', this.CancelPlacement, this);
        scene.events.on(Scenes.Events.UPDATE, this.HandleUpdate, this);
        EventBus.on(GameEvents.PlacementRequested, this.HandlePlacementRequested, this);
        EventBus.on(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
        scene.events.once(Scenes.Events.SHUTDOWN, this.Destroy, this);
    }

    IsPlacing (): boolean
    {
        return this.previewItem !== undefined;
    }

    StartPlacing (itemId: string)
    {
        const item = GetShopItem(itemId);

        if (!item)
        {
            return;
        }

        this.CancelPlacement();

        this.previewItem = new PlacedItem(this.scene, this.placeableArea.centerX, this.placeableArea.centerY, item);
        this.previewItem.setAlpha(placementSettings.previewAlpha);
        this.previewItem.setDepth(placementSettings.previewDepth);
        this.hasPointerMovedSinceStart = false;
        this.UpdatePreview();

        const payload: PlacementPayload = { itemId };

        EventBus.emit(GameEvents.PlacementStarted, payload);
    }

    // Bought items that don't get placed go to the inventory, since their coins are already spent
    CancelPlacement ()
    {
        if (!this.previewItem)
        {
            return;
        }

        playerInventory.AddItem(this.previewItem.itemId);
        this.previewItem.destroy();
        this.EndPlacement(false);
    }

    private ConfirmPlacement ()
    {
        if (!this.previewItem)
        {
            return;
        }

        const placedItem = this.previewItem;
        const placedPayload: ItemPlacedPayload = {
            itemId: placedItem.itemId,
            x: placedItem.x,
            y: placedItem.y,
            width: placedItem.displayWidth
        };

        placedItem.setAlpha(1);
        placedItem.clearTint();
        placedItem.UpdateDepth();
        this.placedItems.push(placedItem);
        PlayPlacementImpact(this.scene, placedItem);
        this.EndPlacement(true);

        EventBus.emit(GameEvents.ItemPlaced, placedPayload);
    }

    private EndPlacement (wasPlaced: boolean)
    {
        const payload: PlacementEndedPayload = { itemId: this.previewItem?.itemId ?? '', wasPlaced };

        this.previewItem = undefined;
        EventBus.emit(GameEvents.PlacementEnded, payload);
    }

    private HandlePlacementRequested (payload: PlacementPayload)
    {
        this.StartPlacing(payload.itemId);
    }

    // Opening any UI panel puts the item away
    private HandleUiPanelToggled (payload: UiPanelToggledPayload)
    {
        if (payload.isOpen)
        {
            this.CancelPlacement();
        }
    }

    private HandlePointerDown (pointer: Phaser.Input.Pointer)
    {
        if (!this.previewItem)
        {
            return;
        }

        if (pointer.rightButtonDown())
        {
            this.CancelPlacement();
            return;
        }

        this.hasPointerMovedSinceStart = true;
        this.UpdatePreview();

        if (this.isPreviewValid)
        {
            this.ConfirmPlacement();
        }
    }

    private HandlePointerMove ()
    {
        this.hasPointerMovedSinceStart = true;
    }

    private HandleUpdate ()
    {
        if (this.previewItem)
        {
            this.UpdatePreview();
        }
    }

    private UpdatePreview ()
    {
        if (!this.previewItem)
        {
            return;
        }

        // Until the mouse moves over the game, its last known position is stale, so the preview waits on the island
        if (this.hasPointerMovedSinceStart)
        {
            const pointer = this.scene.input.activePointer;
            const worldPoint = ScreenToWorld(this.scene.cameras.main, pointer.x, pointer.y);

            this.previewItem.setPosition(worldPoint.x, worldPoint.y);
        }

        this.isPreviewValid = this.IsFootprintFree(this.previewItem.GetFootprint());

        if (this.isPreviewValid)
        {
            this.previewItem.clearTint();
        }
        else
        {
            this.previewItem.setTint(placementSettings.invalidTint);
        }
    }

    private IsFootprintFree (footprint: Phaser.Geom.Rectangle): boolean
    {
        if (!Geom.Rectangle.ContainsRect(this.placeableArea, footprint))
        {
            return false;
        }

        return !this.placedItems.some(placedItem => Geom.Intersects.RectangleToRectangle(footprint, placedItem.GetFootprint()));
    }

    private Destroy ()
    {
        this.scene.input.off(Input.Events.POINTER_DOWN, this.HandlePointerDown, this);
        this.scene.input.off(Input.Events.POINTER_MOVE, this.HandlePointerMove, this);
        this.scene.input.keyboard?.off('keydown-ESC', this.CancelPlacement, this);
        this.scene.events.off(Scenes.Events.UPDATE, this.HandleUpdate, this);
        EventBus.off(GameEvents.PlacementRequested, this.HandlePlacementRequested, this);
        EventBus.off(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
    }
}
