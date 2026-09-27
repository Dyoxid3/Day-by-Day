import { EventBus, GameEvents, type TasksChangedPayload } from '../game/EventBus';
import { playerTaskList } from '../game/state/TaskList';
import { GetCompletionPercent, taskTypeIds, taskTypes, type DailyProgress, type TaskTypeId } from '../game/data/TaskTypes';
import { uiAssets } from './UiAssets';
import './ProgressRing.css';

const ringSettings = {
    // Clear pixels between sections of different colors, measured along the ring (in the art's pixels)
    sectionGapPx: 1.5,
    // Used until the track color can be read from the CSS (--ring-track-color)
    fallbackTrackColor: '#efe4d3',
    fillDurationMs: 900,
    // Lets a task's check-off animation start before the ring moves
    fillDelayMs: 150,
    // Little bounce when the ring finishes filling up more
    pulseDurationMs: 350
};

type TypeFractions = Record<TaskTypeId, number>;
type Rgb = [ number, number, number ];

// One pixel of the ring art, with where it sits around the ring
interface RingPixel
{
    index: number;
    // How far around the ring, clockwise from the top: 0 to 1
    fraction: number;
    // The ring's length at this pixel's distance from the middle, so gaps stay the same width inside and out
    circumference: number;
}

// Today's progress. The ring fills as tasks are checked off: each task type gets its own colored section, sized by
// how many tasks of that type are done, with the percentage done in the middle.
// The ring is the pixel-art ring (uiAssets.progressRing) colored in pixel by pixel at its own size, then drawn bigger
// by a whole number of screen pixels (see ProgressRing.css), so it stays pixel perfect.
export class ProgressRing
{
    private rootElement: HTMLElement;
    private graphicElement: HTMLDivElement;
    private canvasElement: HTMLCanvasElement;
    private percentValueElement: HTMLSpanElement;
    private ringPixels: RingPixel[] = [];
    private ringImage?: ImageData;
    private trackColor?: Rgb;
    private labelsByType = {} as Record<TaskTypeId, string>;
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

        this.graphicElement = document.createElement('div');
        this.graphicElement.className = 'progress-ring-graphic';
        this.graphicElement.setAttribute('role', 'img');

        this.canvasElement = document.createElement('canvas');
        this.canvasElement.className = 'progress-ring-canvas';
        // Hovering a section shows its task type and how many are done
        this.canvasElement.addEventListener('pointermove', event => this.UpdateHoverText(event));
        this.canvasElement.addEventListener('pointerleave', () => {
            this.graphicElement.title = '';
        });

        const percentElement = document.createElement('p');
        percentElement.className = 'progress-ring-percent';
        this.percentValueElement = document.createElement('span');

        const percentSignElement = document.createElement('span');
        percentSignElement.className = 'progress-ring-percent-sign';
        percentSignElement.textContent = '%';
        percentElement.append(this.percentValueElement, percentSignElement);

        this.graphicElement.append(this.canvasElement, percentElement);
        this.rootElement.append(headingElement, this.graphicElement);
        parent.append(this.rootElement);

        const progress = playerTaskList.GetProgress();

        this.shownFractions = GetTypeFractions(progress);
        this.startFractions = { ...this.shownFractions };
        this.targetFractions = { ...this.shownFractions };
        this.shownPercent = GetCompletionPercent(progress);
        this.startPercent = this.shownPercent;
        this.targetPercent = this.shownPercent;
        this.LoadRingArt();
        this.Draw();
        this.UpdateLabels(progress);

        EventBus.on(GameEvents.TasksChanged, this.HandleTasksChanged, this);
        EventBus.on(GameEvents.PlayerDataLoaded, () => {
            const loadedProgress = playerTaskList.GetProgress();

            this.UpdateLabels(loadedProgress);
            this.AnimateTo(loadedProgress);
        });
    }

    // Reads which pixels make up the ring, and where each one sits around it
    private LoadRingArt ()
    {
        const art = new Image();

        art.addEventListener('load', () => {
            const width = art.naturalWidth;
            const height = art.naturalHeight;
            const readingCanvas = document.createElement('canvas');
            readingCanvas.width = width;
            readingCanvas.height = height;

            const readingContext = readingCanvas.getContext('2d', { willReadFrequently: true });

            if (!readingContext)
            {
                return;
            }

            readingContext.drawImage(art, 0, 0);

            const artPixels = readingContext.getImageData(0, 0, width, height).data;
            const centerX = width / 2;
            const centerY = height / 2;

            this.ringPixels = [];

            for (let y = 0; y < height; y++)
            {
                for (let x = 0; x < width; x++)
                {
                    const index = y * width + x;

                    if (artPixels[index * 4 + 3] === 0)
                    {
                        continue;
                    }

                    // Measured from the pixel's middle, clockwise from straight up
                    const offsetX = x + 0.5 - centerX;
                    const offsetY = y + 0.5 - centerY;
                    const angle = Math.atan2(offsetX, -offsetY);

                    this.ringPixels.push({
                        index,
                        fraction: (angle / (Math.PI * 2) + 1) % 1,
                        circumference: Math.PI * 2 * Math.hypot(offsetX, offsetY)
                    });
                }
            }

            this.canvasElement.width = width;
            this.canvasElement.height = height;
            this.ringImage = new ImageData(width, height);
            this.Draw();
        });

        art.src = uiAssets.progressRing;
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
        this.percentValueElement.textContent = String(this.shownPercent);
        this.rootElement.classList.toggle('is-complete', this.shownPercent === 100);

        const context = this.canvasElement.getContext('2d');

        if (!this.ringImage || !context)
        {
            return;
        }

        const pixels = this.ringImage.data;
        const trackColor = this.GetTrackColor();

        for (const ringPixel of this.ringPixels)
        {
            const typeId = this.FindSectionAt(ringPixel);
            const color = typeId ? ParseColor(taskTypes[typeId].color) : trackColor;
            const pixelStart = ringPixel.index * 4;

            pixels[pixelStart] = color[0];
            pixels[pixelStart + 1] = color[1];
            pixels[pixelStart + 2] = color[2];
            pixels[pixelStart + 3] = 255;
        }

        context.putImageData(this.ringImage, 0, 0);
    }

    // The task type whose section covers this pixel, or null for the track (or the gap between two sections)
    private FindSectionAt (ringPixel: RingPixel): TaskTypeId | null
    {
        const visibleSectionCount = taskTypeIds.filter(typeId => this.shownFractions[typeId] > 0.001).length;
        // Gaps only go between sections, so a lone section stays whole
        const halfGap = visibleSectionCount > 1 ? ringSettings.sectionGapPx / 2 / ringPixel.circumference : 0;
        let sectionStart = 0;

        for (const typeId of taskTypeIds)
        {
            const sectionEnd = sectionStart + this.shownFractions[typeId];

            if (ringPixel.fraction >= sectionStart + halfGap && ringPixel.fraction < sectionEnd - halfGap)
            {
                return typeId;
            }

            sectionStart = sectionEnd;
        }

        return null;
    }

    private GetTrackColor (): Rgb
    {
        if (!this.trackColor)
        {
            const cssColor = getComputedStyle(this.rootElement).getPropertyValue('--ring-track-color').trim();

            // Only remembered once the CSS has loaded, so an early guess is corrected
            if (cssColor)
            {
                this.trackColor = ParseColor(cssColor);
            }

            return this.trackColor ?? ParseColor(ringSettings.fallbackTrackColor);
        }

        return this.trackColor;
    }

    private UpdateHoverText (event: PointerEvent)
    {
        const bounds = this.canvasElement.getBoundingClientRect();
        const width = this.canvasElement.width;
        const pixelX = Math.floor((event.clientX - bounds.left) / bounds.width * width);
        const pixelY = Math.floor((event.clientY - bounds.top) / bounds.height * this.canvasElement.height);
        const ringPixel = this.ringPixels.find(candidate => candidate.index === pixelY * width + pixelX);
        const typeId = ringPixel ? this.FindSectionAt(ringPixel) : null;

        this.graphicElement.title = typeId ? this.labelsByType[typeId] : '';
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
            this.labelsByType[typeId] = `${taskTypes[typeId].label}: ${progress.completedCountByType[typeId]} done`;
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

const parsedColors = new Map<string, Rgb>();

// "#5fb86b" (or "#abc") as red, green and blue
function ParseColor (hexColor: string): Rgb
{
    let color = parsedColors.get(hexColor);

    if (!color)
    {
        const digits = hexColor.replace('#', '');
        const fullDigits = digits.length === 3 ? digits.split('').map(digit => digit + digit).join('') : digits;
        const value = parseInt(fullDigits, 16) || 0;

        color = [ (value >> 16) & 255, (value >> 8) & 255, value & 255 ];
        parsedColors.set(hexColor, color);
    }

    return color;
}
