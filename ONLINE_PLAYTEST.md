# Playtesting the online features

The online prototype (accounts, friends, encouragement, coin boosts and island visits) runs inside the normal
dev server. `npm run dev` starts it, and the game talks to it at `/api`.

It is built to work, not to be secure or scalable. Accounts, friends, islands and notifications are saved to
`server/data/online-db.json` (git ignores this file).

## Ready-made friends

Two demo players already exist: **Mochi** and **Pixel**. Both use the password `demo`, and both have furnished
islands you can visit.

While nobody is logged in as them, they act on their own:
- They cheer you on a few seconds after you add them.
- They reply when you encourage them, which gives you the reply coin boost.
- They can be sent over to visit you with the demo keys below.

## Two players on one computer

1. Run `npm run dev` and open `http://localhost:8080`.
2. Open the bottom menu and click **Profile** under Friends on the right. Sign up as yourself. Your friends
   list is in this Profile menu too.
3. Open a **second browser window**, then go to the same address. Use Ctrl+N or a different browser, not a
   duplicated tab. Each window keeps its own login.
4. In the second window, log in as `Mochi` / `demo` or sign up a second account.
5. Add each other by username, then try the features:
   - **💌 Cheer:** send encouragement. The other window gets a toast, a red badge on the bell and a coin boost
     chip (×1.1) next to the coins.
   - **Replying:** open the bell and reply. The player who sent the encouragement gets a boost too.
   - **⛵ Visit:** your cat boards the boat and sails to their island. In their window, your boat arrives and
     your cat wanders their island.
   - **Coins from visits:** visiting cats drop a few coins for whoever is watching, up to 5 per visit.
   - **🏠 Sail home** at the top brings you back.

Put the two windows side by side. A browser pauses the game in background tabs, so separate windows look best.

## One screen (for presenting)

Sign up, then add `Mochi` as a friend. After that, these dev-only keys work (not while typing in a text box):

| Key | What happens |
| --- | --- |
| `E` | A demo friend sends you encouragement (+10% coins for 30 min) |
| `V` | A demo friend sails over and wanders your island for 45 seconds, dropping coins |
| `P` | Coins burst out of your cat (debug) |

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

Stop the dev server, delete `server/data/online-db.json`, and start it again. Mochi and Pixel come back with
their islands.

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
