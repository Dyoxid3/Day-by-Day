import { Scene, Scenes } from 'phaser';
import { EventBus, GameEvents, type OnlineStateChangedPayload } from '../EventBus';
import { Boat } from '../entities/Boat';
import { WanderingCat } from '../entities/WanderingCat';
import type { IslandPositions, Mooring } from '../data/IslandSettings';
import { IslandTravel } from './IslandTravel';
import { VisitCoinDrops } from './VisitCoinDrops';

// Guests who already dropped their coins this visit. Kept outside the scene, since the island scene restarts after
// every boat trip and the guests sail in again; a guest is forgotten once their visit ends.
const guestsWhoDroppedCoins = new Set<string>();

interface GuestVisit
{
    cat: WanderingCat;
    boat: Boat;
    mooring: Mooring;
    // Resolves once the guest has stepped onto the island
    arrival: Promise<void>;
    coinDrops?: VisitCoinDrops;
    isLeaving: boolean;
}

// On the player's own island: friends who are visiting arrive by boat, wander around (dropping the odd coin),
// and sail off again when they leave. Driven by the visitor list from the online session.
export class VisitorManager
{
    private scene: Scene;
    private positions: IslandPositions;
    private travel: IslandTravel;
    private CreateCat: (x: number, y: number) => WanderingCat;
    private guests = new Map<string, GuestVisit>();
    private latestVisitorNames = new Set<string>();

    constructor (scene: Scene, positions: IslandPositions, travel: IslandTravel, CreateCat: (x: number, y: number) => WanderingCat)
    {
        this.scene = scene;
        this.positions = positions;
        this.travel = travel;
        this.CreateCat = CreateCat;

        EventBus.on(GameEvents.OnlineStateChanged, this.HandleOnlineStateChanged, this);
        scene.events.once(Scenes.Events.SHUTDOWN, () => {
            EventBus.off(GameEvents.OnlineStateChanged, this.HandleOnlineStateChanged, this);
        });
    }

    private HandleOnlineStateChanged (snapshot: OnlineStateChangedPayload)
    {
        this.latestVisitorNames = new Set(snapshot.visitors);

        for (const username of guestsWhoDroppedCoins)
        {
            if (!this.latestVisitorNames.has(username))
            {
                guestsWhoDroppedCoins.delete(username);
            }
        }

        this.WelcomeWaitingGuests();

        for (const [ username, guest ] of this.guests)
        {
            if (!this.latestVisitorNames.has(username) && !guest.isLeaving)
            {
                this.SeeOffGuest(username, guest);
            }
        }
    }

    // Brings in anyone visiting who isn't on the island yet, as long as there's a free mooring
    private WelcomeWaitingGuests ()
    {
        for (const username of this.latestVisitorNames)
        {
            if (!this.guests.has(username) && this.FindFreeMooring())
            {
                this.WelcomeGuest(username);
            }
        }
    }

    private WelcomeGuest (username: string)
    {
        const mooring = this.FindFreeMooring();

        if (!mooring)
        {
            return;
        }

        const boat = new Boat(this.scene, mooring.dock.x, mooring.dock.y);
        const cat = this.CreateCat(mooring.landing.x, mooring.landing.y);

        cat.SetNameTag(username);
        EventBus.emit(GameEvents.VisitorArriving);

        const guest: GuestVisit = { cat, boat, mooring, arrival: Promise.resolve(), isLeaving: false };

        guest.arrival = this.travel.SailIn(cat, boat, mooring).then(() => {
            // Coins only once per visit
            if (!guest.isLeaving && cat.active && !guestsWhoDroppedCoins.has(username))
            {
                guestsWhoDroppedCoins.add(username);
                guest.coinDrops = new VisitCoinDrops(this.scene, cat);
            }
        });

        this.guests.set(username, guest);
    }

    private async SeeOffGuest (username: string, guest: GuestVisit)
    {
        guest.isLeaving = true;
        guest.coinDrops?.Stop();

        await guest.arrival;

        if (guest.cat.active)
        {
            await this.travel.SailAway(guest.cat, guest.boat, guest.mooring);
        }

        guest.cat.destroy();
        guest.boat.destroy();
        this.guests.delete(username);

        // Their mooring is free again, for anyone still waiting (or this guest, if they came straight back)
        if (this.scene.sys.isActive())
        {
            this.WelcomeWaitingGuests();
        }
    }

    private FindFreeMooring (): Mooring | undefined
    {
        const takenMoorings = new Set([ ...this.guests.values() ].map(guest => guest.mooring));

        return this.positions.guestMoorings.find(mooring => !takenMoorings.has(mooring));
    }
}
