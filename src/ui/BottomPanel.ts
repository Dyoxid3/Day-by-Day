import { EventBus, GameEvents, type UiPanelToggledPayload } from '../game/EventBus';
import './BottomPanel.css';

const panelId = 'bottom-panel';
const panelHeightFraction = 0.4;

export class BottomPanel
{
    // Other UI mounts itself into these: the to-do list goes on the left and the progress ring in the center
    readonly leftSection: HTMLDivElement;
    readonly centerSection: HTMLDivElement;
    readonly rightSection: HTMLDivElement;
    private panelElement: HTMLDivElement;
    private tabButton: HTMLButtonElement;
    private contentElement: HTMLDivElement;
    private isOpen = false;

    constructor (container: HTMLElement)
    {
        this.panelElement = document.createElement('div');
        this.panelElement.className = 'bottom-panel';
        this.panelElement.style.height = `${panelHeightFraction * 100}%`;

        this.tabButton = document.createElement('button');
        this.tabButton.className = 'bottom-panel-tab';
        this.tabButton.type = 'button';
        this.tabButton.addEventListener('click', () => this.Toggle());

        this.contentElement = document.createElement('div');
        this.contentElement.className = 'bottom-panel-content';

        this.leftSection = CreateSection('is-left');
        this.centerSection = CreateSection('is-center');
        this.rightSection = CreateSection('is-right');

        const layoutElement = document.createElement('div');
        layoutElement.className = 'bottom-panel-layout';
        layoutElement.append(this.leftSection, this.centerSection, this.rightSection);
        this.contentElement.append(layoutElement);

        this.panelElement.append(this.tabButton, this.contentElement);
        container.appendChild(this.panelElement);

        this.ApplyOpenState();

        EventBus.on(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
    }

    Toggle ()
    {
        this.SetOpen(!this.isOpen);
    }

    SetOpen (isOpen: boolean)
    {
        this.isOpen = isOpen;
        this.ApplyOpenState();

        const payload: UiPanelToggledPayload = {
            panelId,
            isOpen,
            coveredEdge: 'bottom',
            coveredFraction: panelHeightFraction
        };

        EventBus.emit(GameEvents.UiPanelToggled, payload);
    }

    // Only one panel is open at a time
    private HandleUiPanelToggled (payload: UiPanelToggledPayload)
    {
        if (payload.isOpen && payload.panelId !== panelId && this.isOpen)
        {
            this.SetOpen(false);
        }
    }

    private ApplyOpenState ()
    {
        this.panelElement.classList.toggle('is-open', this.isOpen);
        this.tabButton.textContent = this.isOpen ? '▼' : '▲';
        this.tabButton.setAttribute('aria-expanded', String(this.isOpen));
        this.tabButton.setAttribute('aria-label', this.isOpen ? 'Close panel' : 'Open panel');
    }
}

function CreateSection (positionClassName: string): HTMLDivElement
{
    const section = document.createElement('div');
    section.className = `bottom-panel-section ${positionClassName}`;

    return section;
}
