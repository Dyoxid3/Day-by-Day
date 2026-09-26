import { EventBus, GameEvents } from '../game/EventBus';
import { playerStreak } from '../game/state/DailyStreak';
import { onlineSession } from '../online/OnlineSession';
import { CreateAvatar } from './UiAvatar';
import { Pluralize } from './UiFormat';
import { CreateFriendRow, SortFriends } from './FriendRow';
import './FriendsCard.css';

// The bottom panel's right side: a button that opens your profile and friends, plus quick buttons for each friend
export class FriendsCard
{
    private profileButton: HTMLButtonElement;
    private listElement: HTMLDivElement;
    private renderedSignature = '';

    constructor (parent: HTMLElement)
    {
        const rootElement = document.createElement('section');
        rootElement.className = 'friends-card';

        const headingElement = document.createElement('h3');
        headingElement.className = 'bottom-panel-heading';
        headingElement.textContent = 'Friends';

        this.profileButton = document.createElement('button');
        this.profileButton.type = 'button';
        this.profileButton.className = 'friends-card-profile';
        this.profileButton.setAttribute('aria-label', 'Open your profile and friends');
        this.profileButton.addEventListener('click', () => EventBus.emit(GameEvents.ProfilePanelRequested));

        this.listElement = document.createElement('div');
        this.listElement.className = 'friends-card-list';

        rootElement.append(headingElement, this.profileButton, this.listElement);
        parent.append(rootElement);

        this.Render(true);

        EventBus.on(GameEvents.AccountChanged, () => this.Render(true));
        EventBus.on(GameEvents.OnlineStateChanged, () => this.Render(false));
        EventBus.on(GameEvents.TravelStarted, () => this.Render(true));
        EventBus.on(GameEvents.VisitStateChanged, () => this.Render(true));
        EventBus.on(GameEvents.TravelFinished, () => this.Render(true));
        EventBus.on(GameEvents.StreakChanged, () => this.Render(true));
    }

    private Render (isForced: boolean)
    {
        const snapshot = onlineSession.GetSnapshot();
        const signature = JSON.stringify([ snapshot.username, snapshot.friends, onlineSession.GetVisitingUsername(), onlineSession.IsTraveling() ]);

        if (!isForced && signature === this.renderedSignature)
        {
            return;
        }

        this.renderedSignature = signature;
        this.RenderProfileButton();

        if (!snapshot.username)
        {
            this.listElement.replaceChildren(CreateNote('Sign up to add friends, cheer each other on and visit each other\'s islands.'));
            return;
        }

        if (snapshot.friends.length === 0)
        {
            this.listElement.replaceChildren(CreateNote('No friends yet. Open your profile to add one by username.'));
            return;
        }

        this.listElement.replaceChildren(...SortFriends(snapshot.friends).map(friend => CreateFriendRow(friend, { isCompact: true })));
    }

    private RenderProfileButton ()
    {
        const snapshot = onlineSession.GetSnapshot();
        const identity = document.createElement('span');
        identity.className = 'friends-card-identity';

        const nameElement = document.createElement('span');
        nameElement.className = 'friends-card-name';
        nameElement.textContent = snapshot.username ?? 'Guest';

        const subtitleElement = document.createElement('span');
        subtitleElement.className = 'friends-card-subtitle';

        if (snapshot.username)
        {
            const onlineCount = snapshot.friends.filter(friend => friend.isOnline).length;

            subtitleElement.textContent = `🔥 ${playerStreak.GetStreakDays()} · ${Pluralize(snapshot.friends.length, 'friend')} · ${onlineCount} online`;
        }
        else
        {
            subtitleElement.textContent = 'Sign up or log in';
        }

        identity.append(nameElement, subtitleElement);

        const chevron = document.createElement('span');
        chevron.className = 'friends-card-chevron';
        chevron.textContent = '›';

        this.profileButton.classList.toggle('is-guest', !snapshot.username);
        this.profileButton.replaceChildren(CreateAvatar(snapshot.username, 'medium', snapshot.username ? true : undefined), identity, chevron);
    }
}

function CreateNote (text: string): HTMLParagraphElement
{
    const note = document.createElement('p');
    note.className = 'friends-card-note';
    note.textContent = text;

    return note;
}
