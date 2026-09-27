import { EventBus, GameEvents } from '../game/EventBus';
import { gameClock } from '../game/state/GameClock';
import { playerStars } from '../game/state/Stars';
import { RequestCoinRewardAtScreenPoint } from '../game/systems/CoinRewards';
import { onlineSession, RequestToast } from '../online/OnlineSession';
import { KeepTypingFromGame } from './UiKeyboard';
import './DebugMenu.css';

// Quick times of day to move to, as [label, hours, minutes]. The first is "tomorrow morning" for passing a day.
const presetTimes: [ string, number, number ][] = [
    [ 'Morning', 9, 0 ],
    [ 'Evening', 18, 0 ],
    [ 'Night', 21, 30 ]
];

// Keys (lowercase) for the menu's actions, which work whether or not it's showing
const debugKeys = {
    // Shows or hides the Debug button (and closes the menu)
    toggleButton: '1',
    giveCoins: 'y',
    giveStars: 'u',
    // Time passes (as if the game stayed open) until tomorrow morning, stopping when something comes up
    passDay: 'h',
    // Time passes until tonight (the Night preset), stopping when something comes up
    goToNight: 'j',
    // Away for 3 days (as if the game was closed), which counts as missing days
    awayThreeDays: 'k',
    // Sam leaves a lantern on your island (a kind message)
    samLantern: 'n',
    // Sam sends encouragement with a gift for reaching your goal (in the notifications)
    samEncouragement: 'm'
};

const debugRewards = {
    coins: 50,
    stars: 5
};

// What pauses passing time, so the player sees it when it happens: the evening offer and the night prompts
const eventsThatPauseTime = [ GameEvents.FocusOffered, GameEvents.FocusApplied, GameEvents.NightNudge ];

// Development only: a button that opens a menu for moving the game's clock (to try new days, evenings, nights and
// coming back after days away) and for earning stars. The button is hidden until the 1 key is pressed.
// Moving the clock forward passes time step by step, as if the game stayed open, so the end-of-day prompts come up
// on a day where hardly anything got done. Only "Be away" jumps straight ahead (the days in between count as missed).
export class DebugMenu
{
    private toggleButton: HTMLButtonElement;
    private panelElement: HTMLDivElement;
    private clockElement: HTMLParagraphElement;
    private timeInput: HTMLInputElement;

    constructor (container: HTMLElement)
    {
        this.toggleButton = document.createElement('button');
        this.toggleButton.type = 'button';
        this.toggleButton.className = 'debug-toggle pixel-pill';
        this.toggleButton.textContent = 'Debug';
        this.toggleButton.hidden = true;
        this.toggleButton.addEventListener('click', () => this.SetOpen(!this.panelElement.classList.contains('is-open')));

        this.panelElement = document.createElement('div');
        this.panelElement.className = 'debug-panel';
        this.panelElement.setAttribute('role', 'dialog');
        this.panelElement.setAttribute('aria-label', 'Debug menu');

        const titleElement = document.createElement('h3');
        titleElement.className = 'debug-title';
        titleElement.textContent = 'Debug';

        this.clockElement = document.createElement('p');
        this.clockElement.className = 'debug-clock';

        this.timeInput = document.createElement('input');
        this.timeInput.type = 'time';
        this.timeInput.className = 'debug-time-input';
        this.timeInput.setAttribute('aria-label', 'Time of day');

        const setTimeButton = CreateButton('Set time', () => {
            const [ hours, minutes ] = this.timeInput.value.split(':').map(Number);

            if (Number.isInteger(hours) && Number.isInteger(minutes))
            {
                PassTimeTo(hours, minutes);
            }
        });

        this.panelElement.append(
            titleElement,
            this.clockElement,
            CreateSection('Days', [
                CreateButton('Pass to tomorrow morning (H)', PassDay),
                CreateButton('Be away 3 days (K)', () => gameClock.SkipDays(3))
            ]),
            CreateSection('Time passes forward (J: to tonight)', [
                this.timeInput,
                setTimeButton,
                ...presetTimes.map(([ label, hours, minutes ]) => CreateButton(label, () => PassTimeTo(hours, minutes))),
                CreateButton('Real time', () => gameClock.ResetToRealTime())
            ]),
            CreateSection('Coins and stars', [
                CreateButton(`Get ${debugRewards.coins} coins (Y)`, GiveCoins),
                CreateButton('Earn a star', () => playerStars.AddStars(1)),
                CreateButton(`Earn ${debugRewards.stars} stars (U)`, () => playerStars.AddStars(debugRewards.stars))
            ]),
            CreateSection('Sam, the demo friend (needs you logged in)', [
                CreateButton('Sam leaves a lantern (N)', () => onlineSession.RunDemoFriendAction('lantern')),
                CreateButton('Sam encourages you (M)', () => onlineSession.RunDemoFriendAction('encourage')),
                // Same as the V key (see online/DemoControls); Sam befriends you first if needed
                CreateButton('Sam visits (V)', () => onlineSession.RunDemoFriendAction('visit')),
                CreateButton('Sam has a tough day (T)', () => onlineSession.RunDemoFriendAction('struggle')),
                // His messages, gifts and visits are wiped; he stays your friend
                CreateButton("Clear Sam's memory", () => onlineSession.ClearDemoFriendsMemory())
            ])
        );

        container.append(this.toggleButton, this.panelElement);
        KeepTypingFromGame(this.panelElement);
        window.addEventListener('keydown', event => this.HandleKeyDown(event));

        EventBus.on(GameEvents.MinutePassed, this.UpdateClock, this);
        EventBus.on(GameEvents.ClockChanged, this.UpdateClock, this);
        this.UpdateClock();
    }

    private HandleKeyDown (event: KeyboardEvent)
    {
        const target = event.target;
        const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

        if (isTyping || event.repeat || event.ctrlKey || event.metaKey || event.altKey)
        {
            return;
        }

        switch (event.key.toLowerCase())
        {
            case debugKeys.toggleButton:
                this.toggleButton.hidden = !this.toggleButton.hidden;
                this.SetOpen(false);
                break;

            case debugKeys.giveCoins:
                GiveCoins();
                break;

            case debugKeys.giveStars:
                playerStars.AddStars(debugRewards.stars);
                break;

            case debugKeys.passDay:
                PassDay();
                break;

            case debugKeys.goToNight:
                GoToNight();
                break;

            case debugKeys.awayThreeDays:
                gameClock.SkipDays(3);
                break;

            case debugKeys.samLantern:
                onlineSession.RunDemoFriendAction('lantern');
                break;

            case debugKeys.samEncouragement:
                onlineSession.RunDemoFriendAction('encourage');
                break;
        }
    }

    private SetOpen (isOpen: boolean)
    {
        this.panelElement.classList.toggle('is-open', isOpen);
        this.UpdateClock();
    }

    private UpdateClock ()
    {
        const now = gameClock.GetDate();
        const timeText = now.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

        this.clockElement.textContent = gameClock.IsTimeTravelling() ? `Game time: ${timeText}` : `Real time: ${timeText}`;

        if (document.activeElement !== this.timeInput)
        {
            this.timeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        }
    }
}

// Time passes until tomorrow morning (or this morning, before it's here)
function PassDay ()
{
    const [ , hours, minutes ] = presetTimes[0];

    PassTimeTo(hours, minutes);
}

// Time passes until tonight (the last preset)
function GoToNight ()
{
    const [ , hours, minutes ] = presetTimes[presetTimes.length - 1];

    PassTimeTo(hours, minutes);
}

// Coins burst from the middle of the screen into the counter
function GiveCoins ()
{
    RequestCoinRewardAtScreenPoint(debugRewards.coins, window.innerWidth / 2, window.innerHeight / 2, false);
}

// Time passes, as if the game stayed open, until the clock next shows this time. It pauses early when an end-of-day
// prompt comes up, so it shows at the time it belongs to; passing time again carries on from there.
function PassTimeTo (hours: number, minutes: number)
{
    let hasSomethingComeUp = false;

    const PauseTime = () => {
        hasSomethingComeUp = true;
    };

    for (const eventName of eventsThatPauseTime)
    {
        EventBus.on(eventName, PauseTime);
    }

    const hasArrived = gameClock.PassTime(gameClock.GetMsUntilNextTimeOfDay(hours, minutes), () => hasSomethingComeUp);

    for (const eventName of eventsThatPauseTime)
    {
        EventBus.off(eventName, PauseTime);
    }

    if (!hasArrived)
    {
        const timeText = gameClock.GetDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        RequestToast(`Time paused at ${timeText}`, 'Something came up. Pass time again to carry on.', 'info');
    }
}

function CreateSection (title: string, controls: HTMLElement[]): HTMLElement
{
    const section = document.createElement('div');
    section.className = 'debug-section';

    const titleElement = document.createElement('span');
    titleElement.className = 'debug-section-title';
    titleElement.textContent = title;

    const controlRow = document.createElement('div');
    controlRow.className = 'debug-controls';
    controlRow.append(...controls);

    section.append(titleElement, controlRow);

    return section;
}

function CreateButton (label: string, onClick: () => void): HTMLButtonElement
{
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'debug-button';
    button.textContent = label;
    button.addEventListener('click', onClick);

    return button;
}
