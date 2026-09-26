import { EventBus, GameEvents, type UiPanelToggledPayload } from '../game/EventBus';
import './BottomPanel.css';

const panelId = 'bottom-panel';
const panelHeightFraction = 0.4;
// Short screens (like a phone turned sideways) give the panel more of the height so its contents still fit
const shortScreenHeightPx = 500;
const minPanelHeightPx = 260;
const maxPanelHeightFraction = 0.7;

// Names on the tabs that appear on narrow screens, where the three sections become swipeable pages
export interface BottomPanelSectionNames
{
    left: string;
    center: string;
    right: string;
}

export class BottomPanel
{
    // Other UI mounts itself into these: the to-do list goes on the left and the progress ring in the center
    readonly leftSection: HTMLDivElement;
    readonly centerSection: HTMLDivElement;
    readonly rightSection: HTMLDivElement;
    private container: HTMLElement;
    private panelElement: HTMLDivElement;
    private tabButton: HTMLButtonElement;
    private contentElement: HTMLDivElement;
    private layoutElement: HTMLDivElement;
    private sectionTabs: HTMLButtonElement[] = [];
    private isOpen = false;

    constructor (container: HTMLElement, sectionNames: BottomPanelSectionNames)
    {
        this.container = container;

        this.panelElement = document.createElement('div');
        this.panelElement.className = 'bottom-panel';

        this.tabButton = document.createElement('button');
        this.tabButton.className = 'bottom-panel-tab';
        this.tabButton.type = 'button';
        this.tabButton.addEventListener('click', () => this.Toggle());

        this.contentElement = document.createElement('div');
        this.contentElement.className = 'bottom-panel-content';

        this.leftSection = CreateSection('is-left');
        this.centerSection = CreateSection('is-center');
        this.rightSection = CreateSection('is-right');

        this.layoutElement = document.createElement('div');
        this.layoutElement.className = 'bottom-panel-layout';
        this.layoutElement.append(this.leftSection, this.centerSection, this.rightSection);
        this.layoutElement.addEventListener('scroll', () => this.HighlightVisibleSectionTab(), { passive: true });

        this.contentElement.append(this.CreateSectionTabs(sectionNames), this.layoutElement);
        this.panelElement.append(this.tabButton, this.contentElement);
        container.appendChild(this.panelElement);

        this.ApplyHeight();
        this.ApplyOpenState();
        this.HighlightVisibleSectionTab();

        EventBus.on(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
        window.addEventListener('resize', () => this.HandleWindowResize());
    }

    Toggle ()
    {
        this.SetOpen(!this.isOpen);
    }

    SetOpen (isOpen: boolean)
    {
        this.isOpen = isOpen;
        this.ApplyOpenState();
        this.EmitToggled();
    }

    private EmitToggled ()
    {
        const payload: UiPanelToggledPayload = {
            panelId,
            isOpen: this.isOpen,
            coveredEdge: 'bottom',
            coveredFraction: this.GetHeightFraction()
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

    private HandleWindowResize ()
    {
        this.ApplyHeight();

        if (this.isOpen)
        {
            this.EmitToggled();
        }
    }

    private GetHeightFraction (): number
    {
        const containerHeight = this.container.clientHeight;

        if (containerHeight <= 0 || containerHeight >= shortScreenHeightPx)
        {
            return panelHeightFraction;
        }

        return Math.min(maxPanelHeightFraction, Math.max(panelHeightFraction, minPanelHeightPx / containerHeight));
    }

    private ApplyHeight ()
    {
        this.panelElement.style.height = `${this.GetHeightFraction() * 100}%`;
    }

    private ApplyOpenState ()
    {
        this.panelElement.classList.toggle('is-open', this.isOpen);
        this.tabButton.textContent = this.isOpen ? '▼' : '▲';
        this.tabButton.setAttribute('aria-expanded', String(this.isOpen));
        this.tabButton.setAttribute('aria-label', this.isOpen ? 'Close panel' : 'Open panel');
    }

    // Only shown on narrow screens (see BottomPanel.css); tapping one slides to that section
    private CreateSectionTabs (sectionNames: BottomPanelSectionNames): HTMLElement
    {
        const tabsElement = document.createElement('div');
        tabsElement.className = 'bottom-panel-tabs';
        tabsElement.setAttribute('role', 'tablist');

        [ sectionNames.left, sectionNames.center, sectionNames.right ].forEach((name, sectionIndex) => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'bottom-panel-section-tab';
            tab.textContent = name;
            tab.setAttribute('role', 'tab');
            tab.addEventListener('click', () => {
                this.layoutElement.scrollTo({ left: sectionIndex * this.layoutElement.clientWidth, behavior: 'smooth' });
            });
            this.sectionTabs.push(tab);
            tabsElement.append(tab);
        });

        return tabsElement;
    }

    private HighlightVisibleSectionTab ()
    {
        const width = this.layoutElement.clientWidth;
        const visibleIndex = width > 0 ? Math.round(this.layoutElement.scrollLeft / width) : 0;

        this.sectionTabs.forEach((tab, tabIndex) => {
            tab.classList.toggle('is-active', tabIndex === visibleIndex);
            tab.setAttribute('aria-selected', String(tabIndex === visibleIndex));
        });
    }
}

function CreateSection (positionClassName: string): HTMLDivElement
{
    const section = document.createElement('div');
    section.className = `bottom-panel-section ${positionClassName}`;

    return section;
}
