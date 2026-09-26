import { Scene } from 'phaser';
import { Boat } from '../entities/Boat';
import { WanderingCat } from '../entities/WanderingCat';
import type { Mooring } from '../data/IslandSettings';
import { ScreenToWorld } from './CameraMath';

const travelSettings = {
    // Cats hurry to the boat
    runSpeedMultiplier: 2.2,
    // How far past the screen edge boats start and finish, in world px
    offscreenMarginPx: 140,
    // Pause after stepping off the boat before wandering off
    wanderDelayAfterLandingMs: 900
};

// Boat trips: a cat boarding at a mooring and sailing off-screen, or sailing in and stepping off onto the island.
// Used for the player's own trips and for friends arriving and leaving.
export class IslandTravel
{
    private scene: Scene;

    constructor (scene: Scene)
    {
        this.scene = scene;
    }

    // The cat runs to the mooring, hops aboard, and the boat sails off-screen
    async SailAway (cat: WanderingCat, boat: Boat, mooring: Mooring)
    {
        cat.StopWandering();
        await cat.WalkTo(mooring.landing.x, mooring.landing.y, travelSettings.runSpeedMultiplier);

        if (!cat.active || !boat.active)
        {
            return;
        }

        const seat = boat.GetSeatPoint();

        boat.StopBobbing();
        cat.SetRidingBoat(boat);
        await cat.HopTo(seat.x, seat.y - cat.displayHeight / 2);

        if (!cat.active || !boat.active)
        {
            return;
        }

        await boat.SailTo(this.GetOffscreenX(mooring.seaSide), boat.y, [ cat ]);
    }

    // The boat sails in from off-screen with the cat aboard, then the cat hops onto the island and starts wandering
    async SailIn (cat: WanderingCat, boat: Boat, mooring: Mooring)
    {
        cat.StopWandering();
        boat.setPosition(this.GetOffscreenX(mooring.seaSide), mooring.dock.y);

        const seat = boat.GetSeatPoint();

        cat.setPosition(seat.x, seat.y - cat.displayHeight / 2);
        cat.SetRidingBoat(boat);
        await boat.SailTo(mooring.dock.x, mooring.dock.y, [ cat ]);

        if (!cat.active || !boat.active)
        {
            return;
        }

        boat.StartBobbing();
        // Still drawn in front of the boat while jumping off it
        await cat.HopTo(mooring.landing.x, mooring.landing.y);

        if (cat.active)
        {
            cat.SetRidingBoat(null);
            cat.ResumeWandering(travelSettings.wanderDelayAfterLandingMs);
        }
    }

    // Just past the left or right edge of what the camera shows
    private GetOffscreenX (side: -1 | 1): number
    {
        const camera = this.scene.cameras.main;
        const edgeX = side < 0 ? ScreenToWorld(camera, 0, 0).x : ScreenToWorld(camera, camera.width, 0).x;

        return edgeX + side * travelSettings.offscreenMarginPx;
    }
}
