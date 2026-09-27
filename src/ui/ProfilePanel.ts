import { EventBus, GameEvents, type UiPanelToggledPayload } from '../game/EventBus';
import { GetCompletionPercent } from '../game/data/TaskTypes';
import { playerCoinBoost } from '../game/state/CoinBoost';
import { playerStars } from '../game/state/Stars';
import { comebacks } from '../game/state/Comebacks';
import { gentleHelpers } from '../game/state/GentleHelpers';
import { letters } from '../game/state/Letters';
import { playerIslandLayout } from '../game/state/IslandLayout';
import { playerTaskList } from '../game/state/TaskList';
import { playerWallet } from '../game/state/Wallet';
import { onlineSession, RequestToast } from '../online/OnlineSession';
import { CreateAvatar } from './UiAvatar';
import { ShakeElement } from './UiAnimations';
import { CreateAuthForm } from './AuthForm';
import { FormatBoostMultiplier, Pluralize } from './UiFormat';
import { KeepTypingFromGame } from './UiKeyboard';
import { CreateFriendRow, SortFriends } from './FriendRow';
import { uiAssets } from './UiAssets';
import './ProfilePanel.css';

const panelId = 'profile-panel';

// Slides in from the right, top to bottom: your profile and stats (or signing up / logging in), your friends list,
// adding a friend, letters to future you, the gentle helpers switch, and logging out
export class ProfilePanel
{
    private container: HTMLElement;
    private panelElement: HTMLDivElement;
    private serverWarningElement: HTMLParagraphElement;
    private accountSection: HTMLDivElement;
    private friendsSection: HTMLDivElement;
    // Logging out, at the very bottom
    private footerSection: HTMLDivElement;
    private lettersSection: HTMLDivElement;
    private helpersSection: HTMLDivElement;
    private friendsTitleElement: HTMLHeadingElement;
    private friendsListElement: HTMLDivElement;
    private addFriendInput: HTMLInputElement;
    private addFriendButton: HTMLButtonElement;
    private addFriendStatusElement: HTMLParagraphElement;
    private statsElement?: HTMLDivElement;
    private isOpen = false;
    private friendsSignature = '';
    // Briefly highlighted after being added
    private newFriendUsername?: string;

    constructor (container: HTMLElement)
    {
        this.container = container;

        this.panelElement = document.createElement('div');
        this.panelElement.className = 'profile-panel';

        const headerElement = document.createElement('div');
        headerElement.className = 'profile-header';

        const titleElement = document.createElement('h2');
        titleElement.className = 'profile-title';
        titleElement.textContent = 'Profile';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'profile-close pixel-circle is-shape-on-hover';
        closeButton.textContent = 'x';
        closeButton.setAttribute('aria-label', 'Close profile');
        closeButton.addEventListener('click', () => this.SetOpen(false));

        headerElement.append(titleElement, closeButton);

        const bodyElement = document.createElement('div');
        bodyElement.className = 'profile-body';

        this.serverWarningElement = document.createElement('p');
        this.serverWarningElement.className = 'profile-warning';
        this.serverWarningElement.textContent = "Can't reach the game server. Is `npm run dev` still running?";
        this.serverWarningElement.hidden = true;

        this.accountSection = document.createElement('div');
        this.accountSection.className = 'profile-account';

        this.friendsSection = document.createElement('div');
        this.friendsSection.className = 'profile-friends';

        this.friendsTitleElement = CreateSectionTitle('Friends');

        this.friendsListElement = document.createElement('div');
        this.friendsListElement.className = 'profile-friends-list';

        const addFriendArea = document.createElement('div');
        addFriendArea.className = 'profile-add-friend';

        const addFriendTitle = CreateSectionTitle('Add a friend');

        const addFriendForm = document.createElement('form');
        addFriendForm.className = 'add-friend-form';
        addFriendForm.noValidate = true;

        this.addFriendInput = document.createElement('input');
        this.addFriendInput.type = 'text';
        this.addFriendInput.className = 'profile-input';
        this.addFriendInput.placeholder = 'Their username';
        this.addFriendInput.autocomplete = 'off';
        this.addFriendInput.setAttribute('aria-label', "Friend's username");

        this.addFriendButton = document.createElement('button');
        this.addFriendButton.type = 'submit';
        this.addFriendButton.className = 'profile-button is-primary';
        this.addFriendButton.textContent = 'Add';

        addFriendForm.append(this.addFriendInput, this.addFriendButton);
        addFriendForm.addEventListener('submit', event => {
            event.preventDefault();
            this.SubmitAddFriend();
        });

        this.addFriendStatusElement = document.createElement('p');
        this.addFriendStatusElement.className = 'add-friend-status';

        addFriendArea.append(addFriendTitle, addFriendForm, this.addFriendStatusElement);
        // The friends themselves first, right below the stats, with adding one underneath
        this.friendsSection.append(this.friendsTitleElement, this.friendsListElement, addFriendArea);
        this.lettersSection = document.createElement('div');
        this.lettersSection.className = 'profile-section profile-letters';
        this.helpersSection = document.createElement('div');
        this.helpersSection.className = 'profile-section profile-helpers';
        this.footerSection = document.createElement('div');
        this.footerSection.className = 'profile-footer';
        this.RenderLetters();
        this.RenderHelpers();

        bodyElement.append(
            this.serverWarningElement,
            this.accountSection,
            this.friendsSection,
            this.lettersSection,
            this.helpersSection,
            this.footerSection
        );
        this.panelElement.append(headerElement, bodyElement);
        container.append(this.panelElement);
        KeepTypingFromGame(this.panelElement);

        this.RenderAccount();
        this.RenderFriends(true);

        EventBus.on(GameEvents.UiPanelToggled, this.HandleUiPanelToggled, this);
        EventBus.on(GameEvents.ProfilePanelRequested, () => this.SetOpen(true));
        EventBus.on(GameEvents.AccountChanged, () => {
            this.RenderAccount();
            this.RenderFriends(true);
        });
        EventBus.on(GameEvents.OnlineStateChanged, () => {
            this.RenderFriends(false);
            this.serverWarningElement.hidden = onlineSession.GetSnapshot().isServerReachable;
        });
        EventBus.on(GameEvents.TravelStarted, () => this.RenderFriends(true));
        EventBus.on(GameEvents.VisitStateChanged, () => this.RenderFriends(true));
        EventBus.on(GameEvents.TravelFinished, () => this.RenderFriends(true));
        EventBus.on(GameEvents.StarsChanged, () => this.UpdateStats());
        EventBus.on(GameEvents.PlayerDataLoaded, () => {
            this.UpdateStats();
            this.RenderLetters();
            this.RenderHelpers();
        });
        EventBus.on(GameEvents.ComebackCounted, () => this.UpdateStats());
        EventBus.on(GameEvents.LettersChanged, () => this.RenderLetters());
        EventBus.on(GameEvents.GentleHelpersChanged, () => this.RenderHelpers());
        EventBus.on(GameEvents.TasksChanged, () => this.UpdateStats());
        EventBus.on(GameEvents.CoinBoostChanged, () => this.UpdateStats());
        EventBus.on(GameEvents.CoinsChanged, () => this.UpdateStats());
        EventBus.on(GameEvents.IslandLayoutChanged, () => this.UpdateStats());
        window.addEventListener('resize', () => {
            if (this.isOpen)
            {
                this.EmitToggled();
            }
        });
    }

    Toggle ()
    {
        this.SetOpen(!this.isOpen);
    }

    SetOpen (isOpen: boolean)
    {
        if (this.isOpen === isOpen)
        {
            return;
        }

        this.isOpen = isOpen;
        this.panelElement.classList.toggle('is-open', isOpen);
        this.EmitToggled();
    }

    private EmitToggled ()
    {
        const payload: UiPanelToggledPayload = {
            panelId,
            isOpen: this.isOpen,
            coveredEdge: 'right',
            // Measured rather than assumed, since the panel has a minimum width on small screens
            coveredFraction: this.panelElement.getBoundingClientRect().width / this.container.getBoundingClientRect().width
        };

        EventBus.emit(GameEvents.UiPanelToggled, payload);
    }

    // Only one panel is open at a time
    private HandleUiPanelToggled (payload: UiPanelToggledPayload)
    {
        if (payload.isOpen && payload.panelId !== panelId)
        {
            this.SetOpen(false);
        }
    }

    // --- Account ---

    private RenderAccount ()
    {
        const username = onlineSession.GetUsername();
        const card = document.createElement('div');
        card.className = 'profile-card';

        const identity = document.createElement('div');
        identity.className = 'profile-identity';

        const nameElement = document.createElement('div');
        nameElement.className = 'profile-name';
        nameElement.textContent = username ?? 'Guest';

        const subtitleElement = document.createElement('div');
        subtitleElement.className = 'profile-subtitle';
        subtitleElement.textContent = username ? 'Online - friends can visit your island' : 'Playing offline';

        identity.append(nameElement, subtitleElement);
        card.append(CreateAvatar(username, 'large', username ? true : undefined), identity);

        this.statsElement = document.createElement('div');
        this.statsElement.className = 'profile-stats';
        this.UpdateStats();

        if (username)
        {
            const logOutButton = document.createElement('button');
            logOutButton.type = 'button';
            logOutButton.className = 'profile-button is-subtle profile-logout';
            logOutButton.textContent = 'Log out';
            logOutButton.addEventListener('click', async () => {
                logOutButton.disabled = true;
                await onlineSession.LogOut();
                RequestToast('Logged out', 'Your island is still here. Log back in any time.');
            });

            this.accountSection.replaceChildren(card, this.statsElement);
            this.footerSection.replaceChildren(logOutButton);
        }
        else
        {
            const pitch = document.createElement('p');
            pitch.className = 'profile-pitch';
            pitch.textContent = 'Make a free account to add friends, sail to their islands and cheer each other on.';

            // Where the friends would be: signing up is how you get them
            this.accountSection.replaceChildren(card, this.statsElement, pitch, CreateAuthForm());
            this.footerSection.replaceChildren();
        }
    }

    private UpdateStats ()
    {
        if (!this.statsElement)
        {
            return;
        }

        const boostPercent = playerCoinBoost.GetTotalPercent();
        const progress = playerTaskList.GetProgress();

        this.statsElement.replaceChildren(
            CreateStat(String(playerStars.GetStars()), 'stars', false, uiAssets.star),
            CreateStat(`${GetCompletionPercent(progress)}%`, 'done today'),
            CreateStat(String(comebacks.GetCount()), 'comebacks'),
            CreateStat(String(playerWallet.GetCoins()), 'coins', false, uiAssets.coin),
            CreateStat(String(playerIslandLayout.GetPlacedItems().length), 'props on your island'),
            CreateStat(boostPercent > 0 ? FormatBoostMultiplier(boostPercent) : 'x1', 'coin boost', boostPercent > 0)
        );
    }

    // --- Letters and gentle helpers ---

    // Letters to future you (kept on this device)
    private RenderLetters ()
    {
        const letterCount = letters.GetFutureLetterCount();
        const noteElement = document.createElement('p');
        noteElement.className = 'profile-section-note';
        noteElement.textContent = letterCount === 0
            ? 'Write a few kind words to yourself, and your cat will hand them to you on a harder day.'
            : `${Pluralize(letterCount, 'letter')} saved for a harder day.`;

        const writeButton = document.createElement('button');
        writeButton.type = 'button';
        writeButton.className = 'profile-button';
        writeButton.textContent = 'Write to future you';
        writeButton.addEventListener('click', () => EventBus.emit(GameEvents.FutureLetterWriteRequested));

        const buttonRow = document.createElement('div');
        buttonRow.className = 'profile-section-buttons';
        buttonRow.append(writeButton);

        this.lettersSection.replaceChildren(CreateSectionTitle('Letters'), noteElement, buttonRow);
    }

    // The switch for the gentle helpers (Google Gemini), which are off until the player turns them on
    private RenderHelpers ()
    {
        const switchInput = document.createElement('input');
        switchInput.type = 'checkbox';
        switchInput.checked = gentleHelpers.IsEnabled();
        switchInput.disabled = !gentleHelpers.IsAvailable();
        switchInput.addEventListener('change', () => gentleHelpers.SetEnabled(switchInput.checked));

        const switchLabel = document.createElement('label');
        switchLabel.className = 'profile-helper-switch';
        switchLabel.append(switchInput, 'Use Google Gemini for gentle suggestions');

        // What the helpers do, in a tooltip (shown on hover, or on tap on touch screens)
        const tooltipId = 'profile-helpers-tooltip';
        const tooltip = document.createElement('span');
        tooltip.className = 'profile-tooltip';
        tooltip.id = tooltipId;
        tooltip.setAttribute('role', 'tooltip');
        tooltip.textContent = 'Suggests smaller steps for tasks that are hard, or sound hard, and kinder names for harsh '
            + "ones. While it's on, your task names, how hard they feel and how you're feeling today are sent to Google. "
            + 'Your letters to yourself never are.';

        const infoButton = document.createElement('button');
        infoButton.type = 'button';
        infoButton.className = 'profile-info-button pixel-circle';
        infoButton.textContent = '?';
        infoButton.setAttribute('aria-label', 'About the gentle helpers');
        infoButton.setAttribute('aria-describedby', tooltipId);

        const switchRow = document.createElement('div');
        switchRow.className = 'profile-helper-row';
        switchRow.append(switchLabel, infoButton, tooltip);

        this.helpersSection.replaceChildren(CreateSectionTitle('Gentle helpers'), switchRow);

        if (!gentleHelpers.IsAvailable())
        {
            const unavailableElement = document.createElement('p');
            unavailableElement.className = 'profile-section-note is-warning';
            unavailableElement.textContent = "Not set up on this game server yet: it needs a GEMINI_API_KEY in .env.local.";
            this.helpersSection.append(unavailableElement);
        }
    }

    // --- Friends ---

    private async SubmitAddFriend ()
    {
        const username = this.addFriendInput.value.trim();

        if (username === '')
        {
            ShakeElement(this.addFriendInput);
            this.addFriendInput.focus();
            return;
        }

        this.addFriendButton.disabled = true;
        this.SetAddFriendStatus('Looking for them...', '');

        try
        {
            const friend = await onlineSession.AddFriend(username);

            this.addFriendInput.value = '';
            this.SetAddFriendStatus(`${friend.username} is now your friend.`, 'is-success');
            this.newFriendUsername = friend.username;
            this.RenderFriends(true);
        }
        catch (error)
        {
            this.SetAddFriendStatus(error instanceof Error ? error.message : 'Something went wrong', 'is-error');
            ShakeElement(this.addFriendInput);
        }
        finally
        {
            this.addFriendButton.disabled = false;
        }
    }

    private SetAddFriendStatus (text: string, stateClassName: '' | 'is-success' | 'is-error')
    {
        this.addFriendStatusElement.textContent = text;
        this.addFriendStatusElement.className = `add-friend-status ${stateClassName}`;
    }

    private RenderFriends (isForced: boolean)
    {
        const snapshot = onlineSession.GetSnapshot();
        const signature = JSON.stringify([ snapshot.username, snapshot.friends, onlineSession.GetVisitingUsername(), onlineSession.IsTraveling() ]);

        if (!isForced && signature === this.friendsSignature)
        {
            return;
        }

        this.friendsSignature = signature;
        this.friendsSection.hidden = snapshot.username === null;

        if (snapshot.username === null)
        {
            this.SetAddFriendStatus('', '');
            return;
        }

        this.friendsTitleElement.textContent = `Friends (${snapshot.friends.length})`;

        if (snapshot.friends.length === 0)
        {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'profile-empty';
            emptyMessage.textContent = "No friends yet. Add someone by their username below, then you can cheer them on and sail to their island.";
            this.friendsListElement.replaceChildren(emptyMessage);
            return;
        }

        const rows = SortFriends(snapshot.friends).map(friend => CreateFriendRow(friend, {
            onVisitStarting: () => this.SetOpen(false)
        }));

        this.friendsListElement.replaceChildren(...rows);

        const newFriendRow = rows.find(row => row.dataset.username === this.newFriendUsername);

        if (newFriendRow)
        {
            newFriendRow.animate(
                [ { backgroundColor: '#fff0c9', transform: 'scale(0.96)' }, { backgroundColor: '#ffffff', transform: 'scale(1)' } ],
                { duration: 900, easing: 'ease-out' }
            );
            this.newFriendUsername = undefined;
        }
    }
}

function CreateSectionTitle (text: string): HTMLHeadingElement
{
    const title = document.createElement('h3');
    title.className = 'profile-section-title';
    title.textContent = text;

    return title;
}

// iconSource: a pixel-art picture shown before the value, like the star
function CreateStat (value: string, label: string, isHighlighted = false, iconSource?: string): HTMLDivElement
{
    const stat = document.createElement('div');
    stat.className = 'profile-stat';
    stat.classList.toggle('is-highlighted', isHighlighted);

    const valueElement = document.createElement('span');
    valueElement.className = 'profile-stat-value';

    if (iconSource)
    {
        const icon = document.createElement('img');
        icon.className = 'profile-stat-icon';
        icon.src = iconSource;
        icon.alt = '';
        icon.draggable = false;
        valueElement.append(icon);
    }

    valueElement.append(value);

    const labelElement = document.createElement('span');
    labelElement.className = 'profile-stat-label';
    labelElement.textContent = label;

    stat.append(valueElement, labelElement);

    return stat;
}
