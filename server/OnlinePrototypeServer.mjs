// A tiny online backend for the island prototype. It runs inside the Vite dev server (see vite/config.dev.mjs),
// so `npm run dev` starts it too, and the game talks to it at /api.
// Accounts, friends, islands and notifications are saved in server/data/online-db.json; delete that file to start fresh.
// It's deliberately simple rather than secure or scalable: it's for playtesting and demos.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const serverSettings = {
    dataFilePath: join(process.cwd(), 'server', 'data', 'online-db.json'),
    // A player shows as online if their game checked in this recently
    onlineWindowMs: 8000,
    // A visit ends when the visitor's game stops checking in for this long (e.g. they closed the tab)
    visitTimeoutMs: 12000,
    // An encouragement boosts the coins of whoever receives it; a reply boosts whoever sent the encouragement
    encouragementBoostPercent: 10,
    replyBoostPercent: 10,
    boostDurationMinutes: 30,
    // Boosts stack up to this much
    maxBoostPercent: 50,
    maxMessageLength: 120,
    notificationsPerPoll: 40,
    maxStoredNotifications: 2000,
    maxRequestCharacters: 64 * 1024,

    // The seeded demo players act on their own while nobody is logged in as them, so every online feature
    // can be shown on a single screen: they reply to encouragement, cheer on new friends, and can be sent
    // to visit (see src/online/DemoControls.ts for the keys). Set isEnabled to false to turn this off.
    demoFriends: {
        isEnabled: true,
        usernames: [ 'mochi', 'pixel' ],
        replyDelayMs: 4000,
        welcomeDelayMs: 5000,
        visitDurationMs: 45000,
        encouragements: [ "You've got this! 💪", 'So proud of you! 🌟', 'Keep going, one step at a time 🐾', 'Your island is looking great! 🏝️' ],
        replies: [ 'Aww, thank you!! 💛', 'You made my day! ☀️', 'Right back at you! 💪', 'Thanks friend! 🐾' ]
    }
};

const usernamePattern = /^[A-Za-z0-9_]{3,16}$/;
const defaultEncouragement = "You've got this!";
const defaultReply = 'Thank you!';

// Vite plugin that serves the API from the dev server (and from `vite preview`)
export function OnlinePrototypeServer ()
{
    let onlineApi;

    const MountApi = server => {
        onlineApi ??= new OnlineApi();
        server.middlewares.use('/api', (request, response) => onlineApi.HandleRequest(request, response));
        server.config.logger.info('  [online] Prototype server is on. Data is saved in server/data/online-db.json');
    };

    return {
        name: 'online-prototype-server',
        configureServer: MountApi,
        configurePreviewServer: MountApi
    };
}

class ApiError extends Error
{
    constructor (status, message)
    {
        super(message);
        this.status = status;
    }
}

class OnlineApi
{
    constructor ()
    {
        this.database = LoadDatabase();
        // Kept in memory only: when each player last checked in, and who is visiting whose island
        this.lastSeenAt = new Map();
        this.visits = new Map();
        this.routes = [
            [ 'POST', /^\/signup$/, this.SignUp ],
            [ 'POST', /^\/login$/, this.LogIn ],
            [ 'POST', /^\/logout$/, this.LogOut ],
            [ 'GET', /^\/poll$/, this.Poll ],
            [ 'POST', /^\/friends$/, this.AddFriend ],
            [ 'PUT', /^\/island$/, this.SaveIsland ],
            [ 'PUT', /^\/status$/, this.SaveStatus ],
            [ 'GET', /^\/islands\/(?<username>[^/]+)$/, this.GetIsland ],
            [ 'POST', /^\/encourage$/, this.Encourage ],
            [ 'POST', /^\/notifications\/read$/, this.MarkNotificationsRead ],
            [ 'POST', /^\/notifications\/(?<id>\d+)\/reply$/, this.Reply ],
            [ 'POST', /^\/visit$/, this.ContinueVisit ],
            [ 'POST', /^\/visit\/leave$/, this.LeaveVisit ],
            [ 'POST', /^\/demo\/friend-action$/, this.RunDemoFriendAction ]
        ];
    }

    async HandleRequest (request, response)
    {
        try
        {
            const url = new URL(request.url ?? '/', 'http://localhost');
            const route = this.routes.find(([ method, pattern ]) => method === request.method && pattern.test(url.pathname));

            if (!route)
            {
                throw new ApiError(404, 'Unknown request');
            }

            const [ , pattern, handler ] = route;
            const params = url.pathname.match(pattern).groups ?? {};
            const body = request.method === 'GET' ? {} : await ReadJsonBody(request);
            const result = handler.call(this, { request, body, params });

            SendJson(response, 200, result ?? { ok: true });
        }
        catch (error)
        {
            if (error instanceof ApiError)
            {
                SendJson(response, error.status, { error: error.message });
                return;
            }

            console.error('[online]', error);
            SendJson(response, 500, { error: 'Something went wrong on the server' });
        }
    }

    // --- Accounts ---

    SignUp ({ body })
    {
        const username = String(body.username ?? '').trim();
        const password = String(body.password ?? '');

        if (!usernamePattern.test(username))
        {
            throw new ApiError(400, 'Usernames are 3 to 16 letters, numbers or underscores');
        }

        if (password.length < 3)
        {
            throw new ApiError(400, 'Passwords need at least 3 characters');
        }

        if (this.database.users[username.toLowerCase()])
        {
            throw new ApiError(409, 'That username is already taken');
        }

        return this.StartSession(CreateUser(this.database, username, password));
    }

    LogIn ({ body })
    {
        const user = this.FindUser(body.username);

        if (!user || !IsCorrectPassword(user, String(body.password ?? '')))
        {
            throw new ApiError(401, 'Wrong username or password');
        }

        return this.StartSession(user);
    }

    LogOut ({ request, body })
    {
        const token = GetToken(request, body);
        const userKey = this.database.sessions[token];

        if (userKey)
        {
            this.visits.delete(userKey);
            delete this.database.sessions[token];
            this.Save();
        }
    }

    // --- Everything a game needs to stay up to date, fetched every couple of seconds ---

    Poll ({ request })
    {
        const user = this.RequireUser(request);
        const now = Date.now();
        const boosts = this.GetActiveBoosts(user, now);

        this.lastSeenAt.set(user.key, now);

        return {
            serverTime: now,
            username: user.username,
            friends: user.friends
                .map(friendKey => this.database.users[friendKey])
                .filter(Boolean)
                .map(friend => this.DescribeFriend(friend, user, now)),
            notifications: this.database.notifications
                .filter(notification => notification.to === user.key)
                .slice(-serverSettings.notificationsPerPoll)
                .reverse()
                .map(notification => this.DescribeNotification(notification)),
            boosts,
            boostPercent: Math.min(boosts.reduce((total, boost) => total + boost.percent, 0), serverSettings.maxBoostPercent),
            visitors: this.GetVisitorsOf(user, now)
        };
    }

    // --- Friends and islands ---

    AddFriend ({ request, body })
    {
        const user = this.RequireUser(request);
        const typedName = String(body.username ?? '').trim();
        const friend = this.FindUser(typedName);

        if (!friend)
        {
            throw new ApiError(404, `There's no player called "${typedName}"`);
        }

        if (friend.key === user.key)
        {
            throw new ApiError(400, "You can't add yourself as a friend");
        }

        if (user.friends.includes(friend.key))
        {
            throw new ApiError(409, `${friend.username} is already your friend`);
        }

        MakeFriends(user, friend);
        this.AddNotification(friend.key, user.key, 'friend-added', '');
        this.Save();

        // A demo friend nobody is playing as cheers on their new friend
        this.ScheduleDemoFriendAction(friend, serverSettings.demoFriends.welcomeDelayMs, () => {
            this.AddNotification(user.key, friend.key, 'encouragement', PickRandom(serverSettings.demoFriends.encouragements));
        });

        return { friend: this.DescribeFriend(friend, user, Date.now()) };
    }

    SaveIsland ({ request, body })
    {
        const user = this.RequireUser(request);
        const placedItems = Array.isArray(body.placedItems) ? body.placedItems : [];

        user.island.placedItems = placedItems
            .slice(0, 300)
            .filter(IsValidPlacedItem)
            .map(item => ({ itemId: item.itemId, islandX: item.islandX, islandY: item.islandY }));
        this.Save();
    }

    SaveStatus ({ request, body })
    {
        const user = this.RequireUser(request);

        user.status = {
            streakDays: ClampInteger(body.streakDays, 0, 100000),
            progressPercent: ClampInteger(body.progressPercent, 0, 100)
        };
        this.Save();
    }

    GetIsland ({ request, params })
    {
        const user = this.RequireUser(request);
        const owner = this.FindUser(decodeURIComponent(params.username));

        if (!owner)
        {
            throw new ApiError(404, "That island doesn't exist");
        }

        if (owner.key !== user.key && !user.friends.includes(owner.key))
        {
            throw new ApiError(403, 'You can only visit your friends');
        }

        return { username: owner.username, placedItems: owner.island.placedItems, status: owner.status };
    }

    // --- Encouragement ---

    Encourage ({ request, body })
    {
        const user = this.RequireUser(request);
        const friend = this.RequireFriend(user, body.to);
        const encouragement = this.AddNotification(friend.key, user.key, 'encouragement', CleanMessage(body.message) || defaultEncouragement);

        this.Save();

        // A demo friend nobody is playing as replies by themselves
        this.ScheduleDemoFriendAction(friend, serverSettings.demoFriends.replyDelayMs, () => {
            if (!encouragement.repliedAt)
            {
                encouragement.repliedAt = Date.now();
                encouragement.isRead = true;
                this.AddNotification(user.key, friend.key, 'reply', PickRandom(serverSettings.demoFriends.replies));
            }
        });

        return { boostPercent: serverSettings.encouragementBoostPercent, boostMinutes: serverSettings.boostDurationMinutes };
    }

    MarkNotificationsRead ({ request })
    {
        const user = this.RequireUser(request);
        let hasChanged = false;

        for (const notification of this.database.notifications)
        {
            if (notification.to === user.key && !notification.isRead)
            {
                notification.isRead = true;
                hasChanged = true;
            }
        }

        if (hasChanged)
        {
            this.Save();
        }
    }

    Reply ({ request, params, body })
    {
        const user = this.RequireUser(request);
        const notificationId = Number(params.id);
        const encouragement = this.database.notifications.find(notification =>
            notification.id === notificationId && notification.to === user.key && notification.kind === 'encouragement');

        if (!encouragement)
        {
            throw new ApiError(404, "That message isn't here anymore");
        }

        if (encouragement.repliedAt)
        {
            throw new ApiError(409, 'You already replied to this');
        }

        encouragement.repliedAt = Date.now();
        encouragement.isRead = true;
        this.AddNotification(encouragement.from, user.key, 'reply', CleanMessage(body.message) || defaultReply);
        this.Save();

        return { boostPercent: serverSettings.replyBoostPercent, boostMinutes: serverSettings.boostDurationMinutes };
    }

    // --- Visits: the visitor's game checks in every few seconds while it's on the host's island ---

    ContinueVisit ({ request, body })
    {
        const user = this.RequireUser(request);
        const host = this.RequireFriend(user, body.host);

        this.lastSeenAt.set(user.key, Date.now());
        this.StartOrExtendVisit(user, host, serverSettings.visitTimeoutMs);
    }

    LeaveVisit ({ request, body })
    {
        const user = this.RequireUser(request, body);

        this.visits.delete(user.key);
    }

    // --- Demo friends, for showing things off on one screen ---

    // Makes one of the player's demo friends encourage them or sail over to their island right now
    RunDemoFriendAction ({ request, body })
    {
        const user = this.RequireUser(request);
        const demoSettings = serverSettings.demoFriends;

        if (!demoSettings.isEnabled)
        {
            throw new ApiError(403, 'Demo friends are turned off on the server');
        }

        const demoFriend = this.FindIdleDemoFriend(user);

        if (!demoFriend)
        {
            throw new ApiError(404, 'Add Mochi or Pixel as a friend first (and make sure nobody is logged in as them)');
        }

        if (body.action === 'visit')
        {
            this.StartOrExtendVisit(demoFriend, user, demoSettings.visitDurationMs);
        }
        else
        {
            this.AddNotification(user.key, demoFriend.key, 'encouragement', PickRandom(demoSettings.encouragements));
            this.Save();
        }

        return { friendUsername: demoFriend.username };
    }

    FindIdleDemoFriend (user)
    {
        const now = Date.now();
        const idleDemoFriends = user.friends
            .filter(friendKey => serverSettings.demoFriends.usernames.includes(friendKey))
            .map(friendKey => this.database.users[friendKey])
            .filter(friend => friend && !this.IsOnline(friend, now));

        // Prefers one that isn't already visiting someone
        return idleDemoFriends.find(friend => !this.IsVisiting(friend, now)) ?? idleDemoFriends[0];
    }

    // Runs an action for a demo friend after a delay, if nobody is logged in and playing as them by then
    ScheduleDemoFriendAction (friend, delayMs, Action)
    {
        const demoSettings = serverSettings.demoFriends;

        if (!demoSettings.isEnabled || !demoSettings.usernames.includes(friend.key) || this.IsOnline(friend, Date.now()))
        {
            return;
        }

        setTimeout(() => {
            if (!this.IsOnline(friend, Date.now()))
            {
                Action();
                this.Save();
            }
        }, delayMs);
    }

    // --- Helpers ---

    StartOrExtendVisit (visitor, host, durationMs)
    {
        const now = Date.now();
        const previousVisit = this.visits.get(visitor.key);
        const isNewVisit = !previousVisit || previousVisit.hostKey !== host.key || now >= previousVisit.endsAt;

        this.visits.set(visitor.key, { hostKey: host.key, endsAt: now + durationMs });

        if (isNewVisit)
        {
            this.AddNotification(host.key, visitor.key, 'visit', '');
            this.Save();
        }
    }

    IsOnline (user, now)
    {
        return now - (this.lastSeenAt.get(user.key) ?? 0) < serverSettings.onlineWindowMs;
    }

    IsVisiting (user, now)
    {
        const visit = this.visits.get(user.key);

        return Boolean(visit && now < visit.endsAt);
    }

    StartSession (user)
    {
        const token = randomBytes(24).toString('hex');

        this.database.sessions[token] = user.key;
        this.Save();

        return { token, username: user.username };
    }

    // The token comes in a header, or in the body for requests sent as the page closes
    RequireUser (request, body = {})
    {
        const userKey = this.database.sessions[GetToken(request, body)];
        const user = userKey ? this.database.users[userKey] : undefined;

        if (!user)
        {
            throw new ApiError(401, 'Please log in again');
        }

        return user;
    }

    RequireFriend (user, username)
    {
        const friend = this.FindUser(username);

        if (!friend)
        {
            throw new ApiError(404, "That player doesn't exist");
        }

        if (!user.friends.includes(friend.key))
        {
            throw new ApiError(403, `${friend.username} isn't your friend yet`);
        }

        return friend;
    }

    FindUser (username)
    {
        return this.database.users[String(username ?? '').trim().toLowerCase()];
    }

    DescribeFriend (friend, user, now)
    {
        const visit = this.visits.get(friend.key);

        return {
            username: friend.username,
            streakDays: friend.status.streakDays,
            progressPercent: friend.status.progressPercent,
            // Visiting counts as online, including demo friends sent over with the demo keys
            isOnline: this.IsOnline(friend, now) || this.IsVisiting(friend, now),
            isVisitingYou: Boolean(visit && visit.hostKey === user.key && now < visit.endsAt)
        };
    }

    DescribeNotification (notification)
    {
        return {
            id: notification.id,
            kind: notification.kind,
            fromUsername: this.database.users[notification.from]?.username ?? notification.from,
            message: notification.message,
            createdAt: notification.createdAt,
            isRead: notification.isRead,
            hasReplied: Boolean(notification.repliedAt),
            boostPercent: GetBoostPercent(notification.kind)
        };
    }

    GetActiveBoosts (user, now)
    {
        const durationMs = serverSettings.boostDurationMinutes * 60 * 1000;

        return this.database.notifications
            .filter(notification => notification.to === user.key
                && GetBoostPercent(notification.kind) > 0
                && now - notification.createdAt < durationMs)
            .map(notification => ({
                percent: GetBoostPercent(notification.kind),
                endsInMs: notification.createdAt + durationMs - now,
                fromUsername: this.database.users[notification.from]?.username ?? notification.from,
                kind: notification.kind
            }));
    }

    GetVisitorsOf (user, now)
    {
        const visitors = [];

        for (const [ visitorKey, visit ] of this.visits)
        {
            const visitor = this.database.users[visitorKey];

            if (visitor && visit.hostKey === user.key && now < visit.endsAt)
            {
                visitors.push(visitor.username);
            }
        }

        return visitors;
    }

    AddNotification (toKey, fromKey, kind, message)
    {
        const notifications = this.database.notifications;
        const notification = {
            id: this.database.nextNotificationId++,
            to: toKey,
            from: fromKey,
            kind,
            message,
            createdAt: Date.now(),
            isRead: false,
            repliedAt: null
        };

        notifications.push(notification);

        if (notifications.length > serverSettings.maxStoredNotifications)
        {
            notifications.splice(0, notifications.length - serverSettings.maxStoredNotifications);
        }

        return notification;
    }

    Save ()
    {
        SaveDatabase(this.database);
    }
}

// --- Database file ---

function LoadDatabase ()
{
    const filePath = serverSettings.dataFilePath;

    if (existsSync(filePath))
    {
        const fileText = readFileSync(filePath, 'utf8');

        try
        {
            return JSON.parse(fileText);
        }
        catch (error)
        {
            // Keeps the unreadable file around instead of silently losing it
            writeFileSync(`${filePath}.broken`, fileText);
            console.warn('[online] The database file was unreadable, so it was saved as online-db.json.broken and a fresh one was made.', error);
        }
    }

    const database = CreateSeedDatabase();

    SaveDatabase(database);

    return database;
}

function SaveDatabase (database)
{
    mkdirSync(dirname(serverSettings.dataFilePath), { recursive: true });
    writeFileSync(serverSettings.dataFilePath, JSON.stringify(database, null, 2));
}

// Two ready-made friends for demos and playtesting. Add them by username, or log in as them in another tab (password: demo).
function CreateSeedDatabase ()
{
    const database = { users: {}, sessions: {}, notifications: [], nextNotificationId: 1 };

    const mochi = CreateUser(database, 'Mochi', 'demo', {
        status: { streakDays: 12, progressPercent: 60 },
        placedItems: [
            { itemId: 'table', islandX: 0.34, islandY: 0.66 },
            { itemId: 'table', islandX: 0.63, islandY: 0.7 }
        ]
    });
    const pixel = CreateUser(database, 'Pixel', 'demo', {
        status: { streakDays: 5, progressPercent: 25 },
        placedItems: [ { itemId: 'table', islandX: 0.5, islandY: 0.64 } ]
    });

    MakeFriends(mochi, pixel);

    return database;
}

function CreateUser (database, username, password, { status, placedItems } = {})
{
    const passwordSalt = randomBytes(16).toString('hex');
    const user = {
        key: username.toLowerCase(),
        username,
        passwordSalt,
        passwordHash: HashPassword(password, passwordSalt),
        createdAt: Date.now(),
        friends: [],
        island: { placedItems: placedItems ?? [] },
        status: status ?? { streakDays: 0, progressPercent: 0 }
    };

    database.users[user.key] = user;

    return user;
}

function MakeFriends (firstUser, secondUser)
{
    if (!firstUser.friends.includes(secondUser.key))
    {
        firstUser.friends.push(secondUser.key);
    }

    if (!secondUser.friends.includes(firstUser.key))
    {
        secondUser.friends.push(firstUser.key);
    }
}

function HashPassword (password, salt)
{
    return scryptSync(password, salt, 32).toString('hex');
}

function IsCorrectPassword (user, password)
{
    const actualHash = Buffer.from(HashPassword(password, user.passwordSalt), 'hex');
    const expectedHash = Buffer.from(user.passwordHash, 'hex');

    return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
}

function GetBoostPercent (notificationKind)
{
    if (notificationKind === 'encouragement')
    {
        return serverSettings.encouragementBoostPercent;
    }

    if (notificationKind === 'reply')
    {
        return serverSettings.replyBoostPercent;
    }

    return 0;
}

// --- Request helpers ---

function GetToken (request, body)
{
    const header = request.headers.authorization ?? '';

    if (header.startsWith('Bearer '))
    {
        return header.slice('Bearer '.length);
    }

    return typeof body.token === 'string' ? body.token : '';
}

function ReadJsonBody (request)
{
    return new Promise((resolve, reject) => {
        let text = '';

        request.setEncoding('utf8');
        request.on('data', chunk => {
            text += chunk;

            if (text.length > serverSettings.maxRequestCharacters)
            {
                reject(new ApiError(413, 'That request is too large'));
                request.destroy();
            }
        });
        request.on('end', () => {
            if (text.trim() === '')
            {
                resolve({});
                return;
            }

            try
            {
                const parsed = JSON.parse(text);

                resolve(parsed && typeof parsed === 'object' ? parsed : {});
            }
            catch
            {
                reject(new ApiError(400, 'That request was not valid JSON'));
            }
        });
        request.on('error', reject);
    });
}

function SendJson (response, status, data)
{
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify(data));
}

function PickRandom (items)
{
    return items[Math.floor(Math.random() * items.length)];
}

function CleanMessage (value)
{
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, serverSettings.maxMessageLength);
}

function ClampInteger (value, min, max)
{
    const number = Math.round(Number(value));

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

function IsValidPlacedItem (item)
{
    return item !== null
        && typeof item === 'object'
        && typeof item.itemId === 'string'
        && item.itemId.length <= 40
        && Number.isFinite(item.islandX)
        && Number.isFinite(item.islandY);
}
