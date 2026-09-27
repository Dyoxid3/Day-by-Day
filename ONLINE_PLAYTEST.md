# Playtesting the online features

The online prototype (accounts, friends, encouragement, coin boosts and island visits) runs inside the normal
dev server. `npm run dev` starts it, and the game talks to it at `/api`.

It is built to work, not to be secure or scalable. Accounts, friends, islands and notifications are saved to
`server/data/online-db.json` (git ignores this file).

## Ready-made friend

One demo player already exists: **Sam** (password `demo`), with a furnished island you can visit.

While nobody is logged in as Sam, he acts on his own:
- He cheers you on a few seconds after you add him.
- He replies when you encourage him (which gives you the reply coin boost), and reaches the goal of your encouragement a few seconds later.
- He can be sent to leave a lantern, encourage you, visit you or have a tough day with the keys below.

Signing up as `daniel` always makes a brand new account, wiping any old one with that name, so a demo can start from
scratch every time.

## Two players on one computer

1. Run `npm run dev` and open `http://localhost:8080`.
2. Log in or sign up in the card that opens first (or later from **Profile**, under Other in the bottom menu). Your friends
   list is in this Profile menu too.
3. Open a **second browser window**, then go to the same address. Use Ctrl+N or a different browser, not a
   duplicated tab. Each window keeps its own login.
4. In the second window, log in as `Sam` / `demo` or sign up a second account.
5. Add each other by username, then try the features:
   - **Encourage:** send encouragement, with an optional gift. The other window gets a toast, a red badge on the bell and a lantern on their island; the gift and a coin boost
     arrive once they finish the goal you set.
   - **Replying:** open the bell and reply. The player who sent the encouragement gets a boost too.
   - **⛵ Visit:** your cat boards the boat and sails to their island. In their window, your boat arrives and
     your cat wanders their island.
   - **Coins from visits:** a visiting cat drops 5 coins shortly after it arrives, for whoever is watching.
   - **🏠 Sail home** at the top brings you back.

Put the two windows side by side. A browser pauses the game in background tabs, so separate windows look best.

## One screen (for presenting)

Sign up (Sam befriends you the first time you use one of his keys). These dev-only keys work while not typing in a
text box. `1` shows the Debug button, whose menu has all of them as buttons too.

| Key | What happens |
| --- | --- |
| `Y` | Get 50 coins |
| `U` | Earn 5 stars |
| `H` | Time passes to tomorrow morning |
| `J` | Time passes to tonight |
| `K` | Be away for 3 days (counts as missed days, for a comeback) |
| `N` | Sam leaves a lantern on your island |
| `M` | Sam encourages you, with a small gift once you finish a third of your day |
| `V` | Sam sails over and wanders your island for 45 seconds, dropping 5 coins |
| `T` | Sam lets you know he is having a tough day |
| `O`, `9`, `0` | Show the cat's mood, neglect the cat, cheer the cat up |

Checking off tasks also earns coins, and the friend boost applies to all coin rewards.

## On your phone

The whole game works on phones:
- Drag to look around, pinch with two fingers to zoom, and double-tap the cat to follow it.
- Tap a spot to place furniture. The **Store it** button puts it away instead.
- The bottom menu becomes three swipeable pages (To-do / Progress / Friends) with tabs.
- The shop, profile and inventory open full screen. Close them with their ×.

A phone and a computer also make a good pair of players: each keeps its own login.

**Same Wi-Fi (easiest)**
1. Connect the phone and the computer to the same Wi-Fi.
2. On the computer, run `npm run dev-phone` instead of `npm run dev`. It prints two addresses, for example:
   ```
   ➜  Local:   http://localhost:8080/
   ➜  Network: http://192.168.1.23:8080/
   ```
3. On the phone's browser, type in the **Network** address.
4. If Windows asks about the firewall, allow Node on **Private networks**. If the page never loads, the Wi-Fi
   may be marked Public in Windows; allow Node on Public networks too, or switch that network to Private.

**If the phone can't reach the computer** (school or event Wi-Fi often blocks devices from talking to each
other):
- **Hotspot:** turn on the phone's hotspot and connect the computer to it. Then run `npm run dev-phone` and
  open the new Network address on the phone.
- **Temporary public link:** keep `npm run dev` running, and in a second terminal run
  `npx cloudflared tunnel --url http://localhost:8080`. The first run downloads Cloudflare's tunnel tool. Open
  the `https://….trycloudflare.com` link it prints on any phone, on any network. Anyone with that link can open
  the game while it's running, so close the terminal when you're done.

**Quick check without a phone:** in Chrome press F12, then Ctrl+Shift+M, and pick a phone from the list at the
top. Hold Shift and drag to test pinch-zooming. For real touch behaviour, use an actual phone.

## Starting fresh

To wipe just the demo friend (his messages, gifts and visits), press `1` to show the Debug button and use
**Clear Sam's memory**. He stays your friend.

To reset everything, stop the dev server, delete `server/data/online-db.json`, and start it again. Sam comes back with
his island.

Playing as a guest keeps nothing: every visit as a guest starts fresh.

## Where to tweak things

| What | Where |
| --- | --- |
| Boost size and length, visit timeouts, demo friend behaviour | `serverSettings` in `server/OnlinePrototypeServer.mjs` |
| Coins for tasks and visits | `src/game/data/CoinRewardSettings.ts` |
| Streak start (27) and the 33% rule | `streakSettings` in `src/game/state/DailyStreak.ts` |
| Boat art (currently a ⛵ emoji) | `boatSettings` in `src/game/entities/Boat.ts` |
| Mooring spots and the walkable ground on the island art | `islandMap` in `src/game/data/IslandSettings.ts` |
| How often the game checks for updates | `onlineSettings` in `src/online/OnlineSession.ts` |

`npm run build` makes a static build without the server. The online features need `npm run dev`, or
`npx vite preview --config vite/config.prod.mjs` after a build.
