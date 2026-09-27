import { Scene, GameObjects, Input, Scenes } from 'phaser';
import { EventBus, GameEvents, type ToastRequestedPayload } from '../EventBus';
import { GetShopItem } from '../data/ShopCatalog';
import { PlacedItem } from '../entities/PlacedItem';
import { playerInventory } from '../state/Inventory';
import { playerIslandLayout } from '../state/IslandLayout';
import { ScreenToWorld } from './CameraMath';
import { PlacedItemsLayer } from './PlacedItemsLayer';
import { GetScreenPixelsPerCssPixel } from './ScreenResolution';

const pickUpSettings = {
    // How long a prop has to be held to put it away
    holdDurationMs: 700,
    // The progress ring only shows after this long, so quick clicks don't flash it
    ringDelayMs: 150,
    // Moving the pointer further than this (CSS px) is a camera drag instead, and cancels
    moveTolerance: 8,
    ringRadiusPx: 7,
    ringThicknessPx: 3,
    ringGapAbovePx: 10,
    ringColor: 0xffffff,
    ringBackColor: 0x3a3226,
    // The prop shrinks a little while held, then lifts away
    heldShrink: 0.08,
    liftHeightPx: 18,
    liftDurationMs: 220,
    // Above everything on the island
    ringDepth: 95000
};

// Pressing and holding a prop on the player's own island puts it back in their inventory. A ring above it fills up
// while it's held; letting go early or dragging the camera cancels.
export class PropPickUpController
{
    private scene: Scene;
    private itemsLayer: PlacedItemsLayer;
    private canPickUp: () => boolean;
    private ring: GameObjects.Graphics;
    private heldItem?: PlacedItem;
    private heldPointer?: Phaser.Input.Pointer;
    private heldSinceMs = 0;
    private heldItemScale = { x: 1, y: 1 };

    // canPickUp says whether it's allowed right now (not while placing an item or sailing)
    constructor (scene: Scene, itemsLayer: PlacedItemsLayer, canPickUp: () => boolean)
    {
        this.scene = scene;
        this.itemsLayer = itemsLayer;
        this.canPickUp = canPickUp;
        this.ring = scene.add.graphics().setDepth(pickUpSettings.ringDepth);

        scene.input.on(Input.Events.POINTER_DOWN, this.HandlePointerDown, this);
        scene.input.on(Input.Events.POINTER_UP, this.Cancel, this);
        scene.input.on(Input.Events.POINTER_UP_OUTSIDE, this.Cancel, this);
        scene.events.on(Scenes.Events.UPDATE, this.HandleUpdate, this);
        scene.events.once(Scenes.Events.SHUTDOWN, this.Destroy, this);
    }

    private HandlePointerDown (pointer: Phaser.Input.Pointer)
    {
        // A second finger (pinch-zooming) cancels
        if (this.heldItem)
        {
            this.Cancel();
            return;
        }

        if (!this.canPickUp() || pointer.rightButtonDown())
        {
            return;
        }

        const item = this.FindItemAt(pointer);

        if (item)
        {
            this.heldItem = item;
            this.heldPointer = pointer;
            this.heldSinceMs = this.scene.time.now;
            this.heldItemScale = { x: item.scaleX, y: item.scaleY };
        }
    }

    // The front-most prop under the pointer
    private FindItemAt (pointer: Phaser.Input.Pointer): PlacedItem | undefined
    {
        const worldPoint = ScreenToWorld(this.scene.cameras.main, pointer.x, pointer.y);

        return [ ...this.itemsLayer.GetItems() ]
            .filter(item => item.getBounds().contains(worldPoint.x, worldPoint.y))
            .sort((first, second) => second.depth - first.depth)[0];
    }

    private HandleUpdate ()
    {
        const item = this.heldItem;
        const pointer = this.heldPointer;

        if (!item || !pointer)
        {
            return;
        }

        const movedDistance = Math.hypot(pointer.x - pointer.downX, pointer.y - pointer.downY);

        if (!pointer.isDown || movedDistance > pickUpSettings.moveTolerance * GetScreenPixelsPerCssPixel() || !this.canPickUp())
        {
            this.Cancel();
            return;
        }

        const heldMs = this.scene.time.now - this.heldSinceMs;
        const progress = Math.min(1, heldMs / pickUpSettings.holdDurationMs);

        if (heldMs < pickUpSettings.ringDelayMs)
        {
            return;
        }

        const shrink = 1 - pickUpSettings.heldShrink * progress;

        item.setScale(this.heldItemScale.x * shrink, this.heldItemScale.y * shrink);
        this.DrawRing(item, progress);

        if (progress >= 1)
        {
            this.PutAway(item);
        }
    }

    private DrawRing (item: PlacedItem, progress: number)
    {
        const settings = pickUpSettings;
        const bounds = item.getBounds();
        const x = bounds.centerX;
        const y = bounds.top - settings.ringGapAbovePx;

        this.ring.clear();
        this.ring.lineStyle(settings.ringThicknessPx + 2, settings.ringBackColor, 0.6);
        this.ring.strokeCircle(x, y, settings.ringRadiusPx);
        this.ring.lineStyle(settings.ringThicknessPx, settings.ringColor, 1);
        this.ring.beginPath();
        this.ring.arc(x, y, settings.ringRadiusPx, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        this.ring.strokePath();
    }

    private Cancel ()
    {
        if (this.heldItem)
        {
            this.heldItem.setScale(this.heldItemScale.x, this.heldItemScale.y);
        }

        this.heldItem = undefined;
        this.heldPointer = undefined;
        this.ring.clear();
    }

    // Off the island and into the inventory, with a little lift as it goes
    private PutAway (item: PlacedItem)
    {
        const record = this.itemsLayer.ToRecord(item);

        this.heldItem = undefined;
        this.heldPointer = undefined;
        this.ring.clear();
        this.itemsLayer.Remove(item);
        playerIslandLayout.RemovePlacedItem(record);
        playerInventory.AddItem(item.itemId);
        EventBus.emit(GameEvents.PropStored);

        this.scene.tweens.add({
            targets: item,
            y: item.y - pickUpSettings.liftHeightPx,
            alpha: 0,
            scaleX: item.scaleX * 0.6,
            scaleY: item.scaleY * 0.6,
            duration: pickUpSettings.liftDurationMs,
            ease: 'Quad.easeIn',
            onComplete: () => item.destroy()
        });

        const toast: ToastRequestedPayload = {
            title: `${GetShopItem(item.itemId)?.name ?? 'Prop'} put away`,
            message: "It's waiting in your inventory.",
            tone: 'info'
        };

        EventBus.emit(GameEvents.ToastRequested, toast);
    }

    private Destroy ()
    {
        this.scene.input.off(Input.Events.POINTER_DOWN, this.HandlePointerDown, this);
        this.scene.input.off(Input.Events.POINTER_UP, this.Cancel, this);
        this.scene.input.off(Input.Events.POINTER_UP_OUTSIDE, this.Cancel, this);
        this.scene.events.off(Scenes.Events.UPDATE, this.HandleUpdate, this);
    }
}
