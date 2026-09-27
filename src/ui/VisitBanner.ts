import { EventBus, GameEvents, type TravelStartedPayload, type VisitStateChangedPayload } from '../game/EventBus';
import { onlineSession } from '../online/OnlineSession';
import './VisitBanner.css';

// How long the "Sailing to..." caption lingers after arriving, while the island fades in
const captionLingerMs = 900;

// While on a friend's island: a banner saying whose island it is, with a button to sail home.
// During the boat trip itself: a caption over the sea saying where you're headed.
export class VisitBanner
{
    private bannerElement: HTMLDivElement;
    private bannerTextElement: HTMLSpanElement;
    private homeButton: HTMLButtonElement;
    private captionElement: HTMLDivElement;
    private captionTimerId?: number;

    constructor (container: HTMLElement)
    {
        this.bannerElement = document.createElement('div');
        this.bannerElement.className = 'visit-banner pixel-pill';

        this.bannerTextElement = document.createElement('span');
        this.bannerTextElement.className = 'visit-banner-text';

        this.homeButton = document.createElement('button');
        this.homeButton.type = 'button';
        this.homeButton.className = 'visit-banner-home pixel-pill';
        this.homeButton.textContent = 'Sail home';
        this.homeButton.addEventListener('click', () => onlineSession.ReturnHome());

        this.bannerElement.append(this.bannerTextElement, this.homeButton);

        this.captionElement = document.createElement('div');
        this.captionElement.className = 'travel-caption pixel-pill';
        this.captionElement.setAttribute('aria-live', 'polite');

        container.append(this.bannerElement, this.captionElement);

        EventBus.on(GameEvents.TravelStarted, this.HandleTravelStarted, this);
        EventBus.on(GameEvents.TravelFadeOut, this.HandleTravelFadeOut, this);
        EventBus.on(GameEvents.VisitStateChanged, this.HandleVisitStateChanged, this);
        EventBus.on(GameEvents.TravelFinished, () => this.SetHomeButtonReady(true));
    }

    private HandleTravelStarted ()
    {
        this.SetHomeButtonReady(false);
    }

    // The caption shows over the open sea between islands
    private HandleTravelFadeOut (payload: TravelStartedPayload)
    {
        window.clearTimeout(this.captionTimerId);
        this.captionElement.textContent = payload.destinationUsername
            ? `Sailing to ${payload.destinationUsername}'s island...`
            : 'Sailing home...';
        this.captionElement.classList.add('is-visible');
    }

    private HandleVisitStateChanged (payload: VisitStateChangedPayload)
    {
        const isVisiting = payload.hostUsername !== null;

        if (isVisiting)
        {
            // "Visiting" is dropped on phones to save room
            const prefixElement = document.createElement('span');
            prefixElement.className = 'visit-banner-prefix';
            prefixElement.textContent = 'Visiting ';

            const nameElement = document.createElement('strong');
            nameElement.textContent = payload.hostUsername;
            this.bannerTextElement.replaceChildren(prefixElement, nameElement, "'s island");
        }

        this.bannerElement.classList.toggle('is-visible', isVisiting);

        window.clearTimeout(this.captionTimerId);
        this.captionTimerId = window.setTimeout(() => this.captionElement.classList.remove('is-visible'), captionLingerMs);
    }

    // Off while a boat trip is under way
    private SetHomeButtonReady (isReady: boolean)
    {
        this.homeButton.disabled = !isReady;
        this.homeButton.textContent = isReady ? 'Sail home' : 'Sailing...';
    }
}
