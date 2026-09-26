import { Scene, Geom, Scenes, Cameras } from 'phaser';
import { WanderingCat } from '../entities/WanderingCat';
import { Boat, boatSettings, boatTextureKey } from '../entities/Boat';
import { IslandCameraController } from '../systems/IslandCameraController';
import { ItemPlacementController } from '../systems/ItemPlacementController';
import { PlacedItemsLayer } from '../systems/PlacedItemsLayer';
import { IslandTravel } from '../systems/IslandTravel';
import { VisitorManager } from '../systems/VisitorManager';
import { VisitCoinDrops, coinTextureKey } from '../systems/VisitCoinDrops';
import {
    EventBus,
    GameEvents,
    type IslandLayoutChangedPayload,
    type ItemPlacedPayload,
    type TravelRequestedPayload,
    type TravelStartedPayload,
    type UiPanelToggledPayload,
    type VisitedIsland,
    type VisitStateChangedPayload
} from '../EventBus';
import { GetIslandPositions, islandCatSettings, type IslandPositions, type Mooring } from '../data/IslandSettings';
import { shopCatalog, GetItemTextureKey } from '../data/ShopCatalog';
import { playerIslandLayout } from '../state/IslandLayout';
import { RegisterDebugControls } from '../debug/DebugControls';

// Boat trips fade through the sea's color
const seaColor = { red: 2, green: 138, blue: 248 };
const travelFadeMs = 450;

export interface IslandSceneData
{
    // The friend's island to show; missing means the player's own island
    visitedIsland?: VisitedIsland;
    // True after a boat trip, so the player's cat sails in instead of starting on the island
    arrivesByBoat?: boolean;
}

// The player's island, or a friend's island while visiting. Travelling restarts this scene with the other island.
export class Island extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    island: Phaser.GameObjects.Image;
    playerCat: WanderingCat;
    cameraController: IslandCameraController;
    placementController?: ItemPlacementController;
    private groundBounds: Phaser.Geom.Rectangle;
    private positions: IslandPositions;
    private itemsLayer: PlacedItemsLayer;
    private travel: IslandTravel;
    private playerBoat: Boat;
    // Where the player's boat is moored on the island being shown
    private playerMooring: Mooring;
    private playerCoinDrops?: VisitCoinDrops;
    private visitedIsland?: VisitedIsland;
    private isTraveling = false;
    // Counts scene (re)starts, so an animation sequence from before a restart can't touch the new island
    private runNumber = 0;
    // Kept across restarts: which UI panels are open, so the camera keeps framing around them
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
        this.load.image(coinTextureKey, 'coin.png');

        if (boatSettings.imageFile)
        {
            this.load.image(boatTextureKey, boatSettings.imageFile);
        }

        for (const item of shopCatalog)
        {
            this.load.image(GetItemTextureKey(item), item.imageFile);
        }
    }

    create (data: IslandSceneData = {})
    {
        this.runNumber++;
        this.visitedIsland = data.visitedIsland;
        this.isTraveling = false;
        this.placementController = undefined;
        this.playerCoinDrops = undefined;

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x028af8);

        this.island = this.add.image(this.scale.width / 2, this.scale.height / 2, 'island');

        const islandBounds = this.island.getBounds();

        this.positions = GetIslandPositions(islandBounds);
        this.groundBounds = new Geom.Rectangle(
            this.positions.ground.left,
            this.positions.ground.top,
            this.positions.ground.width,
            this.positions.ground.height
        );
        this.itemsLayer = new PlacedItemsLayer(this, islandBounds);
        this.travel = new IslandTravel(this);

        if (this.visitedIsland)
        {
            this.SetUpVisitedIsland(this.visitedIsland);
        }
        else
        {
            this.SetUpHomeIsland(data.arrivesByBoat === true);
        }

        this.cameraController = new IslandCameraController(this, this.playerCat, islandBounds);
        this.ApplyScreenInsets();
        this.cameraController.SnapToDefaultView();

        if (!this.visitedIsland)
        {
            // Created after the camera controller so its click handler runs second: the click that places an
            // item re-enables camera dragging only after the camera has already ignored that click
            this.placementController = new ItemPlacementController(this, this.groundBounds, this.itemsLayer);
            new VisitorManager(this, this.positions, this.travel, (x, y) => this.CreateCat(x, y));
        }

        if (import.meta.env.DEV)
        {
            RegisterDebugControls(this, this.playerCat);
        }

        this.ListenToEvents();

        if (this.visitedIsland || data.arrivesByBoat)
        {
            this.PlayPlayerArrival();
        }

        const visitPayload: VisitStateChangedPayload = { hostUsername: this.visitedIsland?.ownerUsername ?? null };

        EventBus.emit(GameEvents.VisitStateChanged, visitPayload);
    }

    private SetUpHomeIsland (arrivesByBoat: boolean)
    {
        this.itemsLayer.Load(playerIslandLayout.GetPlacedItems());

        this.playerMooring = this.positions.homeMooring;
        this.playerBoat = this.CreateMooredBoat(this.playerMooring, !arrivesByBoat);
        this.playerCat = this.CreateCat(this.groundBounds.centerX, this.groundBounds.centerY);
    }

    private SetUpVisitedIsland (visitedIsland: VisitedIsland)
    {
        this.itemsLayer.Load(visitedIsland.placedItems);

        // The friend's own boat and cat, which just wanders about as usual
        this.CreateMooredBoat(this.positions.homeMooring, true);
        this.CreateCat(this.groundBounds.centerX, this.groundBounds.centerY).SetNameTag(visitedIsland.ownerUsername);

        this.playerMooring = this.positions.guestMoorings[0];
        this.playerBoat = this.CreateMooredBoat(this.playerMooring, false);
        this.playerCat = this.CreateCat(this.playerMooring.landing.x, this.playerMooring.landing.y);
        this.playerCat.SetNameTag(visitedIsland.visitorUsername);
    }

    private CreateCat (x: number, y: number): WanderingCat
    {
        const cat = new WanderingCat(
            this,
            x,
            y,
            'cat',
            this.groundBounds,
            islandCatSettings.minWanderDelayMs,
            islandCatSettings.maxWanderDelayMs
        );

        cat.setScale(islandCatSettings.scale);

        return cat;
    }

    // Moored boats point toward the island, the way they sailed in
    private CreateMooredBoat (mooring: Mooring, isBobbing: boolean): Boat
    {
        const boat = new Boat(this, mooring.dock.x, mooring.dock.y);

        boat.Face(mooring.seaSide === -1 ? 1 : -1);

        if (isBobbing)
        {
            boat.StartBobbing();
        }

        return boat;
    }

    private ListenToEvents ()
    {
        EventBus.on(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
        EventBus.on(GameEvents.PlacementStarted, this.HandlePlacementStarted, this);
        EventBus.on(GameEvents.PlacementEnded, this.HandlePlacementEnded, this);
        EventBus.on(GameEvents.ItemPlaced, this.HandleItemPlaced, this);
        EventBus.on(GameEvents.IslandLayoutChanged, this.HandleIslandLayoutChanged, this);
        EventBus.on(GameEvents.TravelRequested, this.HandleTravelRequested, this);

        this.events.once(Scenes.Events.SHUTDOWN, () => {
            EventBus.off(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
            EventBus.off(GameEvents.PlacementStarted, this.HandlePlacementStarted, this);
            EventBus.off(GameEvents.PlacementEnded, this.HandlePlacementEnded, this);
            EventBus.off(GameEvents.ItemPlaced, this.HandleItemPlaced, this);
            EventBus.off(GameEvents.IslandLayoutChanged, this.HandleIslandLayoutChanged, this);
            EventBus.off(GameEvents.TravelRequested, this.HandleTravelRequested, this);
        });
    }

    // --- Boat trips ---

    private async PlayPlayerArrival ()
    {
        const runNumber = this.runNumber;

        this.isTraveling = true;
        this.cameraController.SetInteractionEnabled(false);
        this.camera.fadeIn(travelFadeMs, seaColor.red, seaColor.green, seaColor.blue);

        await this.travel.SailIn(this.playerCat, this.playerBoat, this.playerMooring);

        if (runNumber !== this.runNumber)
        {
            return;
        }

        this.isTraveling = false;

        if (!this.placementController?.IsPlacing())
        {
            this.cameraController.SetInteractionEnabled(true);
        }

        // On a friend's island, the player's cat drops a few coins for them
        if (this.visitedIsland)
        {
            this.playerCoinDrops = new VisitCoinDrops(this, this.playerCat);
        }

        EventBus.emit(GameEvents.TravelFinished);
    }

    private HandleTravelRequested (payload: TravelRequestedPayload)
    {
        const destination = payload.destination;
        const isAlreadyThere = destination
            ? destination.ownerUsername.toLowerCase() === this.visitedIsland?.ownerUsername.toLowerCase()
            : !this.visitedIsland;

        if (this.isTraveling || isAlreadyThere)
        {
            return;
        }

        this.SailToIsland(destination);
    }

    private async SailToIsland (destination: VisitedIsland | null)
    {
        const runNumber = this.runNumber;
        const startedPayload: TravelStartedPayload = { destinationUsername: destination?.ownerUsername ?? null };

        this.isTraveling = true;
        EventBus.emit(GameEvents.TravelStarted, startedPayload);

        // Put away anything being placed before turning off camera controls, since ending placement turns them back on
        this.placementController?.CancelPlacement();
        this.cameraController.SetInteractionEnabled(false);
        this.cameraController.ReturnToDefaultView();
        this.playerCoinDrops?.Stop();

        await this.travel.SailAway(this.playerCat, this.playerBoat, this.playerMooring);

        if (runNumber !== this.runNumber)
        {
            return;
        }

        this.camera.once(Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            const nextData: IslandSceneData = { visitedIsland: destination ?? undefined, arrivesByBoat: true };

            this.scene.restart(nextData);
        });
        this.camera.fadeOut(travelFadeMs, seaColor.red, seaColor.green, seaColor.blue);
        EventBus.emit(GameEvents.TravelFadeOut, startedPayload);
    }

    // --- Other events ---

    private HandleItemPlaced (payload: ItemPlacedPayload)
    {
        if (!this.visitedIsland)
        {
            this.playerCat.CelebrateNewItem(payload.x, payload.y, payload.width);
        }
    }

    // Logging in loads the account's saved island
    private HandleIslandLayoutChanged (payload: IslandLayoutChangedPayload)
    {
        if (payload.reason === 'replaced' && !this.visitedIsland)
        {
            this.placementController?.CancelPlacement();
            this.itemsLayer.Load(playerIslandLayout.GetPlacedItems());
        }
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

        this.ApplyScreenInsets();
    }

    private ApplyScreenInsets ()
    {
        let coveredLeft = 0;
        let coveredRight = 0;
        let coveredBottom = 0;

        for (const panel of this.openPanels.values())
        {
            if (panel.coveredEdge === 'left')
            {
                coveredLeft = Math.max(coveredLeft, panel.coveredFraction);
            }
            else if (panel.coveredEdge === 'right')
            {
                coveredRight = Math.max(coveredRight, panel.coveredFraction);
            }
            else
            {
                coveredBottom = Math.max(coveredBottom, panel.coveredFraction);
            }
        }

        this.cameraController.SetScreenInsets(coveredLeft, coveredBottom, coveredRight);
    }

    private HandlePlacementStarted ()
    {
        this.cameraController.SetInteractionEnabled(false);
    }

    private HandlePlacementEnded ()
    {
        if (!this.isTraveling)
        {
            this.cameraController.SetInteractionEnabled(true);
        }
    }
}
