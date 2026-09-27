import { Scene, Geom, Scenes, Cameras } from 'phaser';
import { WanderingCat } from '../entities/WanderingCat';
import { Boat, boatSettings, boatTextureKey } from '../entities/Boat';
import { IslandCameraController } from '../systems/IslandCameraController';
import { ItemPlacementController } from '../systems/ItemPlacementController';
import { PlacedItemsLayer } from '../systems/PlacedItemsLayer';
import { IslandGround } from '../systems/IslandGround';
import { IslandTravel } from '../systems/IslandTravel';
import { VisitorManager } from '../systems/VisitorManager';
import { VisitCoinDrops, coinTextureFile, coinTextureKey } from '../systems/VisitCoinDrops';
import { PixelSnapping } from '../systems/PixelSnapping';
import { DayNightLighting } from '../systems/DayNightLighting';
import { islandLightsSceneKey, SetIslandLightsTarget } from './IslandLights';
import { PlayBackgroundMusic, PreloadBackgroundMusic } from '../systems/BackgroundMusic';
import { PropPickUpController } from '../systems/PropPickUpController';
import { LanternLayer, lanternArt } from '../systems/LanternLayer';
import {
    EventBus,
    GameEvents,
    type CatMoodChangedPayload,
    type IslandLayoutChangedPayload,
    type ItemPlacedPayload,
    type TravelRequestedPayload,
    type TravelStartedPayload,
    type UiPanelToggledPayload,
    type VisitedIsland,
    type VisitStateChangedPayload
} from '../EventBus';
import { GetIslandPositions, islandArt, islandCatSettings, type IslandPositions, type Mooring } from '../data/IslandSettings';
import { catAppearance, catExpressions, catTextureKeys, GetCatFaceTextureKey, type CatExpression } from '../data/CatAppearance';
import { shopCatalog, GetItemTextureKey } from '../data/ShopCatalog';
import { playerIslandLayout } from '../state/IslandLayout';
import { playerCatMood } from '../state/CatMood';
import { RegisterDebugControls } from '../debug/DebugControls';

// Boat trips fade through the sea's color
const seaColor = {
    red: (islandArt.seaColor >> 16) & 0xff,
    green: (islandArt.seaColor >> 8) & 0xff,
    blue: islandArt.seaColor & 0xff
};
const travelFadeMs = 450;
// Below anything that sorts by its y position, wherever it is on the island
const islandBackgroundDepth = -1000000;
// Other players' cats show these faces now and then (their real mood isn't shared online yet)
const otherCatExpressions: CatExpression[] = [ 'default', 'cool', 'satisfied', 'dazed' ];

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
    // The grass and sand, where cats walk and items go
    private ground: IslandGround;
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

        this.load.image(islandArt.textureKey, islandArt.file);
        this.load.spritesheet(catTextureKeys.bodySheet, catAppearance.folder + catAppearance.bodySheetFile, {
            frameWidth: catAppearance.frameSize,
            frameHeight: catAppearance.frameSize
        });
        this.load.image(catTextureKeys.head, catAppearance.folder + catAppearance.headFile);
        this.load.image(catTextureKeys.idleHead, catAppearance.folder + catAppearance.idleHeadFile);

        for (const expression of catExpressions)
        {
            this.load.image(GetCatFaceTextureKey(expression), catAppearance.folder + catAppearance.faceFiles[expression]);
        }

        this.load.image(coinTextureKey, coinTextureFile);

        this.load.image(boatTextureKey, boatSettings.imageFile);
        this.load.image(lanternArt.textureKey, lanternArt.file);
        PreloadBackgroundMusic(this);

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
        this.camera.setBackgroundColor(islandArt.seaColor);
        // Draws everything lined up with the art's pixels, with the camera still moving smoothly
        new PixelSnapping(this);
        // Dims the island at night and brightens it in the morning
        const lighting = new DayNightLighting(this);

        // Lamps glow at night, drawn by a scene on top of this one so the night's darkening doesn't dim them
        SetIslandLightsTarget({
            camera: this.camera,
            GetItems: () => this.itemsLayer.GetItems(),
            GetNightAmount: () => lighting.GetNightAmount()
        });
        this.events.once(Scenes.Events.SHUTDOWN, () => SetIslandLightsTarget(null));

        if (!this.scene.isActive(islandLightsSceneKey))
        {
            this.scene.launch(islandLightsSceneKey);
        }
        // Quiet music in the background, carrying on through boat trips
        PlayBackgroundMusic(this);

        // The island art is drawn at 1x, behind everything. Cats and items sort by their y position, which is
        // negative on the upper part of the island (it's centered on the screen), so the island goes far lower.
        // Placed on whole pixels, so the walkable-ground map lines up with the art exactly.
        this.island = this.add.image(Math.round(this.scale.width / 2), Math.round(this.scale.height / 2), islandArt.textureKey);
        this.island.setDepth(islandBackgroundDepth);

        const islandBounds = this.island.getBounds();

        this.positions = GetIslandPositions(islandBounds);
        this.ground = new IslandGround(this, this.island);
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

        // The player's own cat shows their cat's mood (see state/CatMood)
        this.playerCat.SetExpression(playerCatMood.GetExpression());
        this.playerCat.SetIdleAnimationEnabled(playerCatMood.GetMood().playsIdleAnimation);

        // Frames the island itself rather than the whole image, so the default view is closer in
        const viewArea = this.positions.viewArea;
        const framedArea = new Geom.Rectangle(viewArea.left, viewArea.top, viewArea.width, viewArea.height);

        this.cameraController = new IslandCameraController(this, this.playerCat, framedArea);
        this.ApplyScreenInsets();
        this.cameraController.SnapToDefaultView();

        if (!this.visitedIsland)
        {
            // Created after the camera controller so its click handler runs second: the click that places an
            // item re-enables camera dragging only after the camera has already ignored that click
            this.placementController = new ItemPlacementController(this, this.ground, this.itemsLayer);
            // Press and hold a prop to put it back in the inventory
            new PropPickUpController(this, this.itemsLayer, () => !this.isTraveling && !this.placementController?.IsPlacing());
            // Lanterns left by friends' encouragement; tap one to read it
            new LanternLayer(this, this.ground, () => !this.isTraveling && !this.placementController?.IsPlacing());
            new VisitorManager(this, this.positions, this.travel, (x, y) => this.CreateOtherPlayersCat(x, y));
        }

        if (import.meta.env.DEV)
        {
            RegisterDebugControls(this);
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
        const startPoint = this.GetIslandMiddle();

        this.itemsLayer.Load(playerIslandLayout.GetPlacedItems());

        this.playerMooring = this.positions.homeMooring;
        this.playerBoat = this.CreateMooredBoat(this.playerMooring, !arrivesByBoat);
        this.playerCat = this.CreateCat(startPoint.x, startPoint.y);
    }

    private SetUpVisitedIsland (visitedIsland: VisitedIsland)
    {
        const startPoint = this.GetIslandMiddle();

        this.itemsLayer.Load(visitedIsland.placedItems);

        // The friend's own boat and cat, which just wanders about as usual
        this.CreateMooredBoat(this.positions.homeMooring, true);
        this.CreateOtherPlayersCat(startPoint.x, startPoint.y).SetNameTag(visitedIsland.ownerUsername);

        this.playerMooring = this.positions.guestMoorings[0];
        this.playerBoat = this.CreateMooredBoat(this.playerMooring, false);
        this.playerCat = this.CreateCat(this.playerMooring.landing.x, this.playerMooring.landing.y);
        this.playerCat.SetNameTag(visitedIsland.visitorUsername);
    }

    // A spot on the grass near the middle of the island
    private GetIslandMiddle ()
    {
        const bounds = this.ground.GetBounds();

        return this.ground.FindNearestStandablePoint(bounds.centerX, bounds.centerY);
    }

    // Positioned by its feet
    private CreateCat (x: number, y: number): WanderingCat
    {
        const cat = new WanderingCat(this, x, y, this.ground, islandCatSettings.minWanderDelayMs, islandCatSettings.maxWanderDelayMs);

        cat.SetRestingScale(islandCatSettings.scale);

        return cat;
    }

    // Friends' cats (as hosts or visitors), which change faces now and then on their own
    private CreateOtherPlayersCat (x: number, y: number): WanderingCat
    {
        const cat = this.CreateCat(x, y);

        cat.StartRandomExpressions(otherCatExpressions);

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
        EventBus.on(GameEvents.CatMoodChanged, this.HandleCatMoodChanged, this);

        this.events.once(Scenes.Events.SHUTDOWN, () => {
            EventBus.off(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
            EventBus.off(GameEvents.PlacementStarted, this.HandlePlacementStarted, this);
            EventBus.off(GameEvents.PlacementEnded, this.HandlePlacementEnded, this);
            EventBus.off(GameEvents.ItemPlaced, this.HandleItemPlaced, this);
            EventBus.off(GameEvents.IslandLayoutChanged, this.HandleIslandLayoutChanged, this);
            EventBus.off(GameEvents.TravelRequested, this.HandleTravelRequested, this);
            EventBus.off(GameEvents.CatMoodChanged, this.HandleCatMoodChanged, this);
        });
    }

    private HandleCatMoodChanged (payload: CatMoodChangedPayload)
    {
        this.playerCat.SetExpression(payload.expression);
        this.playerCat.SetIdleAnimationEnabled(playerCatMood.GetMood().playsIdleAnimation);
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
