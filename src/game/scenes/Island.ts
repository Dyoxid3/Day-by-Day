import { Scene, Geom, Scenes } from 'phaser';
import { WanderingCat } from '../entities/WanderingCat';
import { IslandCameraController } from '../systems/IslandCameraController';
import { ItemPlacementController } from '../systems/ItemPlacementController';
import { EventBus, GameEvents, type ItemPlacedPayload, type UiPanelToggledPayload } from '../EventBus';
import { shopCatalog, GetItemTextureKey } from '../data/ShopCatalog';
import { RegisterDebugControls } from '../debug/DebugControls';

const catScale = 0.15;
const catMinWanderDelayMs = 3000;
const catMaxWanderDelayMs = 9000;

// Ground area as fractions of the island image (0 = left/top edge, 1 = right/bottom edge).
// The cat wanders here and shop items can be placed here.
const groundArea = { left: 0.2, right: 0.8, top: 0.58, bottom: 0.72 };

export class Island extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    island: Phaser.GameObjects.Image;
    cat: WanderingCat;
    cameraController: IslandCameraController;
    placementController: ItemPlacementController;
    private openPanels = new Map<string, UiPanelToggledPayload>();

    constructor ()
    {
        super('Island');
    }

    preload ()
    {
        this.load.setPath('assets');

        this.load.image('island', 'islandplaceholder.png');
        this.load.image('cat', 'testsprite.png');

        for (const item of shopCatalog)
        {
            this.load.image(GetItemTextureKey(item), item.imageFile);
        }
    }

    create ()
    {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x028af8);

        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        this.island = this.add.image(centerX, centerY, 'island');

        const islandBounds = this.island.getBounds();
        const groundBounds = new Geom.Rectangle(
            islandBounds.left + islandBounds.width * groundArea.left,
            islandBounds.top + islandBounds.height * groundArea.top,
            islandBounds.width * (groundArea.right - groundArea.left),
            islandBounds.height * (groundArea.bottom - groundArea.top)
        );

        this.cat = new WanderingCat(
            this,
            groundBounds.centerX,
            groundBounds.centerY,
            'cat',
            groundBounds,
            catMinWanderDelayMs,
            catMaxWanderDelayMs
        );
        this.cat.setScale(catScale);

        this.cameraController = new IslandCameraController(this, this.cat, islandBounds);

        // Created after the camera controller so its click handler runs second: the click that places an
        // item re-enables camera dragging only after the camera has already ignored that click
        this.placementController = new ItemPlacementController(this, groundBounds);

        if (import.meta.env.DEV)
        {
            RegisterDebugControls(this, this.cat);
        }

        EventBus.on(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
        EventBus.on(GameEvents.PlacementStarted, this.HandlePlacementStarted, this);
        EventBus.on(GameEvents.PlacementEnded, this.HandlePlacementEnded, this);
        EventBus.on(GameEvents.ItemPlaced, this.HandleItemPlaced, this);
        this.events.once(Scenes.Events.SHUTDOWN, () => {
            EventBus.off(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
            EventBus.off(GameEvents.PlacementStarted, this.HandlePlacementStarted, this);
            EventBus.off(GameEvents.PlacementEnded, this.HandlePlacementEnded, this);
            EventBus.off(GameEvents.ItemPlaced, this.HandleItemPlaced, this);
        });
    }

    private HandleItemPlaced (payload: ItemPlacedPayload)
    {
        this.cat.CelebrateNewItem(payload.x, payload.y, payload.width);
    }

    private HandleUiPanelToggled (payload: UiPanelToggledPayload)
    {
        if (payload.isOpen)
        {
            this.openPanels.set(payload.panelId, payload);
        }
        else
        {
            this.openPanels.delete(payload.panelId);
        }

        let coveredLeft = 0;
        let coveredBottom = 0;

        for (const panel of this.openPanels.values())
        {
            if (panel.coveredEdge === 'left')
            {
                coveredLeft = Math.max(coveredLeft, panel.coveredFraction);
            }
            else
            {
                coveredBottom = Math.max(coveredBottom, panel.coveredFraction);
            }
        }

        this.cameraController.SetScreenInsets(coveredLeft, coveredBottom);
    }

    private HandlePlacementStarted ()
    {
        this.cameraController.SetInteractionEnabled(false);
    }

    private HandlePlacementEnded ()
    {
        this.cameraController.SetInteractionEnabled(true);
    }
}
