import { EventBus, GameEvents, type TasksChangedPayload } from '../game/EventBus';
import { playerTaskList } from '../game/state/TaskList';
import { GetCompletionPercent, taskTypeIds, taskTypes, type DailyProgress, type TaskTypeId } from '../game/data/TaskTypes';
import './ProgressRing.css';

const ringSettings = {
    // In SVG units: the ring is drawn in a 120 x 120 box, then scaled to fit the panel
    radius: 50,
    thickness: 12,
    // Space between sections of different colors
    sectionGap: 1.6,
    fillDurationMs: 900,
    // Lets a task's check-off animation start before the ring moves
    fillDelayMs: 150,
    // Little bounce when the ring finishes filling up more
    pulseDurationMs: 350
};

const svgNamespace = 'http://www.w3.org/2000/svg';
const ringCenter = 60;
const ringCircumference = 2 * Math.PI * ringSettings.radius;

type TypeFractions = Record<TaskTypeId, number>;

interface RingSection
{
    arc: SVGCircleElement;
    tooltip: SVGTitleElement;
}

// Today's progress. The ring fills as tasks are checked off: each task type gets its own colored section,
// sized by how many tasks of that type are done, with the percentage done in the middle.
export class ProgressRing
{
    private rootElement: HTMLElement;
    private graphicElement: SVGSVGElement;
    private percentValueElement: SVGTSpanElement;
    private sections = new Map<TaskTypeId, RingSection>();
    private shownFractions: TypeFractions;
    private startFractions: TypeFractions;
    private targetFractions: TypeFractions;
    private shownPercent: number;
    private startPercent: number;
    private targetPercent: number;
    private animationStartTime = 0;
    private animationFrameId?: number;

    constructor (parent: HTMLElement)
    {
        this.rootElement = document.createElement('section');
        this.rootElement.className = 'progress-ring';

        const headingElement = document.createElement('h3');
        headingElement.className = 'bottom-panel-heading';
        headingElement.textContent = "Today's progress";

        this.graphicElement = CreateSvgElement('svg', {
            class: 'progress-ring-graphic',
            viewBox: `0 0 ${ringCenter * 2} ${ringCenter * 2}`,
            role: 'img'
        });

        const ringAttributes = { cx: ringCenter, cy: ringCenter, r: ringSettings.radius, 'stroke-width': ringSettings.thickness };
        const track = CreateSvgElement('circle', { ...ringAttributes, class: 'progress-ring-track' });

        // Turned so the sections start at the top and run clockwise
        const sectionGroup = CreateSvgElement('g', { transform: `rotate(-90 ${ringCenter} ${ringCenter})` });

        for (const typeId of taskTypeIds)
        {
            const arc = CreateSvgElement('circle', { ...ringAttributes, class: 'progress-ring-section', stroke: taskTypes[typeId].color });
            const tooltip = CreateSvgElement('title', {});

            arc.append(tooltip);
            sectionGroup.append(arc);
            this.sections.set(typeId, { arc, tooltip });
        }

        const percentElement = CreateSvgElement('text', { class: 'progress-ring-percent', x: ringCenter, y: ringCenter, dy: '0.35em' });
        this.percentValueElement = CreateSvgElement('tspan', {});
        const percentSignElement = CreateSvgElement('tspan', { class: 'progress-ring-percent-sign' });
        percentSignElement.textContent = '%';
        percentElement.append(this.percentValueElement, percentSignElement);

        this.graphicElement.append(track, sectionGroup, percentElement);
        this.rootElement.append(headingElement, this.graphicElement);
        parent.append(this.rootElement);

        const progress = playerTaskList.GetProgress();

        this.shownFractions = GetTypeFractions(progress);
        this.startFractions = { ...this.shownFractions };
        this.targetFractions = { ...this.shownFractions };
        this.shownPercent = GetCompletionPercent(progress);
        this.startPercent = this.shownPercent;
        this.targetPercent = this.shownPercent;
        this.Draw();
        this.UpdateLabels(progress);

        EventBus.on(GameEvents.TasksChanged, this.HandleTasksChanged, this);
    }

    private HandleTasksChanged (payload: TasksChangedPayload)
    {
        this.UpdateLabels(payload.progress);
        this.AnimateTo(payload.progress);
    }

    private AnimateTo (progress: DailyProgress)
    {
        // Starts from whatever is showing, so a change in the middle of an animation carries on smoothly
        this.startFractions = { ...this.shownFractions };
        this.targetFractions = GetTypeFractions(progress);
        this.startPercent = this.shownPercent;
        this.targetPercent = GetCompletionPercent(progress);
        this.animationStartTime = performance.now() + ringSettings.fillDelayMs;

        if (this.animationFrameId === undefined)
        {
            this.animationFrameId = requestAnimationFrame(time => this.StepAnimation(time));
        }
    }

    private StepAnimation (time: number)
    {
        const linearProgress = Math.min(Math.max((time - this.animationStartTime) / ringSettings.fillDurationMs, 0), 1);
        // Ease out: fast at first, then settles
        const easedProgress = 1 - Math.pow(1 - linearProgress, 3);

        for (const typeId of taskTypeIds)
        {
            this.shownFractions[typeId] = Lerp(this.startFractions[typeId], this.targetFractions[typeId], easedProgress);
        }

        // The number counts up (or down) along with the ring
        this.shownPercent = Math.round(Lerp(this.startPercent, this.targetPercent, easedProgress));
        this.Draw();

        if (linearProgress < 1)
        {
            this.animationFrameId = requestAnimationFrame(nextTime => this.StepAnimation(nextTime));
            return;
        }

        this.animationFrameId = undefined;

        if (this.targetPercent > this.startPercent)
        {
            this.Pulse();
        }
    }

    private Draw ()
    {
        const visibleSectionCount = taskTypeIds.filter(typeId => this.shownFractions[typeId] > 0.001).length;
        // Gaps only go between sections, so a lone section stays whole
        const gap = visibleSectionCount > 1 ? ringSettings.sectionGap : 0;
        let sectionStart = 0;

        for (const typeId of taskTypeIds)
        {
            const sectionLength = this.shownFractions[typeId] * ringCircumference;
            const arc = this.sections.get(typeId)?.arc;

            // One dash the length of the section, pushed along the ring to where the section starts
            arc?.setAttribute('stroke-dasharray', `${Math.max(0, sectionLength - gap)} ${ringCircumference}`);
            arc?.setAttribute('stroke-dashoffset', String(-(sectionStart + gap / 2)));
            sectionStart += sectionLength;
        }

        this.percentValueElement.textContent = String(this.shownPercent);
        this.rootElement.classList.toggle('is-complete', this.shownPercent === 100);
    }

    private Pulse ()
    {
        this.graphicElement.animate(
            [ { transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' } ],
            { duration: ringSettings.pulseDurationMs, easing: 'ease-out' }
        );
    }

    // Hover text for each section, plus a description for screen readers
    private UpdateLabels (progress: DailyProgress)
    {
        for (const typeId of taskTypeIds)
        {
            const tooltip = this.sections.get(typeId)?.tooltip;

            if (tooltip)
            {
                tooltip.textContent = `${taskTypes[typeId].label}: ${progress.completedCountByType[typeId]} done`;
            }
        }

        this.graphicElement.setAttribute(
            'aria-label',
            `Today's progress: ${GetCompletionPercent(progress)}%, ${progress.completedCount} of ${progress.totalCount} tasks done`
        );
    }
}

// Each type's share of the whole ring: its finished tasks out of all of today's tasks
function GetTypeFractions (progress: DailyProgress): TypeFractions
{
    const fractions = {} as TypeFractions;

    for (const typeId of taskTypeIds)
    {
        fractions[typeId] = progress.totalCount === 0 ? 0 : progress.completedCountByType[typeId] / progress.totalCount;
    }

    return fractions;
}

function Lerp (from: number, to: number, amount: number): number
{
    return from * (1 - amount) + to * amount;
}

function CreateSvgElement<TagName extends keyof SVGElementTagNameMap> (
    tagName: TagName,
    attributes: Record<string, string | number>
): SVGElementTagNameMap[TagName]
{
    const element = document.createElementNS(svgNamespace, tagName);

    for (const [ name, value ] of Object.entries(attributes))
    {
        element.setAttribute(name, String(value));
    }

    return element;
}
