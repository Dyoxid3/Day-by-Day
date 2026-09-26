import { EventBus, GameEvents, type UiPanelToggledPayload } from '../game/EventBus';
import { GetCompletionPercent } from '../game/data/TaskTypes';
import { playerCoinBoost } from '../game/state/CoinBoost';
import { playerStreak } from '../game/state/DailyStreak';
import { playerIslandLayout } from '../game/state/IslandLayout';
import { playerTaskList } from '../game/state/TaskList';
import { playerWallet } from '../game/state/Wallet';
import { onlineSession, RequestToast } from '../online/OnlineSession';
import { CreateAvatar } from './UiAvatar';
import { ShakeElement } from './UiAnimations';
import { FormatBoostMultiplier } from './UiFormat';
import { KeepTypingFromGame } from './UiKeyboard';
import { CreateFriendRow, SortFriends } from './FriendRow';
import './ProfilePanel.css';

const panelId = 'profile-panel';

type AuthMode = 'signup' | 'login';

// Slides in from the right: your profile (or signing up / logging in), adding friends, and your friends list
export class ProfilePanel
{
    private container: HTMLElement;
    private panelElement: HTMLDivElement;
    private serverWarningElement: HTMLParagraphElement;
    private accountSection: HTMLDivElement;
    private friendsSection: HTMLDivElement;
    private friendsTitleElement: HTMLHeadingElement;
    private friendsListElement: HTMLDivElement;
    private addFriendInput: HTMLInputElement;
    private addFriendButton: HTMLButtonElement;
    private addFriendStatusElement: HTMLParagraphElement;
    private statsElement?: HTMLDivElement;
    private isOpen = false;
    private authMode: AuthMode = 'signup';
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
        closeButton.className = 'profile-close';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', 'Close profile');
        closeButton.addEventListener('click', () => this.SetOpen(false));

        headerElement.append(titleElement, closeButton);

        const bodyElement = document.createElement('div');
        bodyElement.className = 'profile-body';

        this.serverWarningElement = document.createElement('p');
        this.serverWarningElement.className = 'profile-warning';
        this.serverWarningElement.textContent = "⚠️ Can't reach the game server. Is `npm run dev` still running?";
        this.serverWarningElement.hidden = true;

        this.accountSection = document.createElement('div');
        this.accountSection.className = 'profile-account';

        this.friendsSection = document.createElement('div');
        this.friendsSection.className = 'profile-friends';

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

        this.friendsTitleElement = CreateSectionTitle('Friends');

        this.friendsListElement = document.createElement('div');
        this.friendsListElement.className = 'profile-friends-list';

        this.friendsSection.append(addFriendTitle, addFriendForm, this.addFriendStatusElement, this.friendsTitleElement, this.friendsListElement);
        bodyElement.append(this.serverWarningElement, this.accountSection, this.friendsSection);
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
        EventBus.on(GameEvents.StreakChanged, () => this.UpdateStats());
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
            coveredFraction: this.panelElement.offsetWidth / this.container.clientWidth
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
        subtitleElement.textContent = username ? 'Online · friends can visit your island' : 'Playing offline';

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
                RequestToast('👋', 'Logged out', 'Your island is still here. Log back in any time.');
            });

            this.accountSection.replaceChildren(card, this.statsElement, logOutButton);
        }
        else
        {
            const pitch = document.createElement('p');
            pitch.className = 'profile-pitch';
            pitch.textContent = 'Make a free account to add friends, sail to their islands and cheer each other on.';

            this.accountSection.replaceChildren(card, this.statsElement, pitch, this.CreateAuthForm());
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
            CreateStat(`🔥 ${playerStreak.GetStreakDays()}`, 'day streak'),
            CreateStat(`${GetCompletionPercent(progress)}%`, 'done today'),
            CreateStat(`${progress.completedCount}/${progress.totalCount}`, 'tasks done'),
            CreateStat(`🪙 ${playerWallet.GetCoins()}`, 'coins'),
            CreateStat(`🪑 ${playerIslandLayout.GetPlacedItems().length}`, 'on your island'),
            CreateStat(boostPercent > 0 ? FormatBoostMultiplier(boostPercent) : '×1', 'coin boost', boostPercent > 0)
        );
    }

    private CreateAuthForm (): HTMLElement
    {
        const wrapper = document.createElement('div');
        wrapper.className = 'auth';

        const tabs = document.createElement('div');
        tabs.className = 'auth-tabs';
        tabs.setAttribute('role', 'tablist');

        const form = document.createElement('form');
        form.className = 'auth-form';
        form.noValidate = true;

        const usernameInput = CreateLabeledInput(form, 'Username', 'text', 'username');
        const passwordInput = CreateLabeledInput(form, 'Password', 'password', this.authMode === 'signup' ? 'new-password' : 'current-password');

        const submitButton = document.createElement('button');
        submitButton.type = 'submit';
        submitButton.className = 'profile-button is-primary auth-submit';

        const errorElement = document.createElement('p');
        errorElement.className = 'auth-error';
        errorElement.setAttribute('role', 'alert');

        const hintElement = document.createElement('p');
        hintElement.className = 'auth-hint';

        form.append(submitButton, errorElement, hintElement);

        const ApplyMode = () => {
            const isSignUp = this.authMode === 'signup';

            submitButton.textContent = isSignUp ? 'Create account' : 'Log in';
            hintElement.textContent = isSignUp ? '3–16 letters, numbers or _ for your username.' : '';
            passwordInput.autocomplete = isSignUp ? 'new-password' : 'current-password';
            errorElement.textContent = '';

            for (const tab of tabs.children)
            {
                const isSelected = tab instanceof HTMLElement && tab.dataset.mode === this.authMode;

                tab.classList.toggle('is-selected', isSelected);
                tab.setAttribute('aria-selected', String(isSelected));
            }
        };

        for (const [ mode, label ] of [ [ 'signup', 'Sign up' ], [ 'login', 'Log in' ] ] as const)
        {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'auth-tab';
            tab.textContent = label;
            tab.dataset.mode = mode;
            tab.setAttribute('role', 'tab');
            tab.addEventListener('click', () => {
                this.authMode = mode;
                ApplyMode();
                usernameInput.focus();
            });
            tabs.append(tab);
        }

        form.addEventListener('submit', async event => {
            event.preventDefault();

            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            if (username === '' || password === '')
            {
                const emptyInput = username === '' ? usernameInput : passwordInput;

                ShakeElement(emptyInput);
                emptyInput.focus();
                return;
            }

            const isSignUp = this.authMode === 'signup';

            submitButton.disabled = true;
            submitButton.textContent = isSignUp ? 'Creating account…' : 'Logging in…';
            errorElement.textContent = '';

            try
            {
                if (isSignUp)
                {
                    await onlineSession.SignUp(username, password);
                    RequestToast('🎉', `Welcome, ${onlineSession.GetUsername()}!`, 'Add a friend by their username to get started.', 'reward');
                }
                else
                {
                    await onlineSession.LogIn(username, password);
                    RequestToast('🏝️', `Welcome back, ${onlineSession.GetUsername()}!`, 'Your island has been loaded.', 'reward');
                }
            }
            catch (error)
            {
                submitButton.disabled = false;
                ApplyMode();
                errorElement.textContent = error instanceof Error ? error.message : 'Something went wrong';
                ShakeElement(form);
            }
        });

        ApplyMode();
        wrapper.append(tabs, form);

        return wrapper;
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
        this.SetAddFriendStatus('Looking for them…', '');

        try
        {
            const friend = await onlineSession.AddFriend(username);

            this.addFriendInput.value = '';
            this.SetAddFriendStatus(`🎉 ${friend.username} is now your friend!`, 'is-success');
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
            emptyMessage.textContent = "No friends yet. Add someone by their username above, then you can cheer them on and sail to their island.";
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

function CreateStat (value: string, label: string, isHighlighted = false): HTMLDivElement
{
    const stat = document.createElement('div');
    stat.className = 'profile-stat';
    stat.classList.toggle('is-highlighted', isHighlighted);

    const valueElement = document.createElement('span');
    valueElement.className = 'profile-stat-value';
    valueElement.textContent = value;

    const labelElement = document.createElement('span');
    labelElement.className = 'profile-stat-label';
    labelElement.textContent = label;

    stat.append(valueElement, labelElement);

    return stat;
}

function CreateLabeledInput (form: HTMLFormElement, labelText: string, type: string, autocomplete: AutoFill): HTMLInputElement
{
    const label = document.createElement('label');
    label.className = 'auth-field';

    const labelTextElement = document.createElement('span');
    labelTextElement.textContent = labelText;

    const input = document.createElement('input');
    input.type = type;
    input.className = 'profile-input';
    input.autocomplete = autocomplete;
    input.maxLength = 40;

    label.append(labelTextElement, input);
    form.append(label);

    return input;
}
