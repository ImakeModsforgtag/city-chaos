# CITY CHAOS

A browser-based multiplayer VR shooter for **Meta Quest 3** and desktop.
Low-poly cartoon city, Gorilla Tag-style arm movement, 7 weapons, real online multiplayer with room codes.
No Unity, no Steam, no APK: everything runs from one website link.

**Built with:** HTML, CSS, JavaScript, Three.js (graphics), WebXR (VR), Node.js + WebSockets (multiplayer server).

---

## 1. What's in the box

| Feature | Details |
|---|---|
| City map | 240m x 240m, 16 city blocks: apartments (3), shops + Mega Mart, police station, gas station, big park, basketball court, underground parking garage, abandoned building, warehouse with catwalks, container yard, diner + arcade, construction site with scaffolding, towers with alleys, a secret passage through Green Towers. Enterable buildings with stairs to the roofs, ladders, fire escapes. |
| Movement (VR) | Gorilla Tag-style: push the ground, climb walls, wall-jump, swing. Optional "Arms + stick" and "Joystick" comfort modes, snap/smooth turning, comfort vignette. |
| Movement (desktop) | WASD, sprint, jump, stair stepping, ladders, ledge climbing (hold Space against a ledge). |
| Weapons | Pistol, Revolver, Assault Rifle, SMG, Shotgun, Sniper Rifle, Rocket Launcher. Each has its own model, sound, damage, fire rate, magazine, reload animation, muzzle flash and tracers. 66 pickups (weapons, ammo, health) placed by theme. |
| Combat | 100 health, headshots, damage direction indicators, hit markers, kill feed, eliminations, 5 second respawn, rocket jumps. **All damage is calculated and verified by the server.** |
| Multiplayer | PLAY (public quick match), CREATE ROOM (private, 6-character code), JOIN FRIEND, copy invite link, up to 8 players, auto-reconnect (you keep your spot and score for 45 seconds). |
| Modes | Free For All, Team Deathmatch (host can switch in the lobby), scoreboard, match timer, automatic next match. |
| NPCs + robbery | 18 pedestrians walking the sidewalks (they panic and run from gunfire), 7 shopkeepers you can rob (GUN SHOP, SNAX, DONUTS, MEGA MART, GAS & GO, STAR DINER, ARCADE), and cops that chase and shoot wanted players. Cash, wanted stars ★, bounties. All NPCs run on the server, so everyone sees the same ones. |
| Customization | Color wheel, accent color, 4 heads, 4 bodies, 7 hats, 5 glasses, 5 back items, live 3D preview. |
| Voice chat | Proximity voice (voices come from each player's head), mic toggle in lobby and VR menu. |
| Audio | All sounds generated in code (works offline, no files): 7 gun sounds, reloads, footsteps/hand taps, hits, eliminations, explosions, pickups, city ambience, menu music. |

---

## 2. Run it on your PC (5 minutes)

1. Install **Node.js LTS** from https://nodejs.org (click the big "LTS" button, run the installer, keep all defaults).
2. Unzip `city-chaos.zip` somewhere easy, for example `C:\Users\<you>\Downloads\city-chaos`.
3. Open that folder in File Explorer. Click the address bar, type `cmd`, press **Enter**. A black Command Prompt window opens already inside the folder.
4. Type this and press Enter (only needed the first time):
   ```
   npm install
   ```
5. Start the game server:
   ```
   npm start
   ```
   You'll see `CITY CHAOS server running on http://localhost:3000`.
6. Open **Microsoft Edge** and go to **http://localhost:3000**
7. To test multiplayer on one PC, open a second Edge window (or an InPrivate window) to the same address, CREATE ROOM in one, JOIN FRIEND with the code in the other.

Press **Ctrl + C** in the Command Prompt to stop the server.

> **Note:** VR needs HTTPS, so the Quest can't use VR from your PC's local address. That's what step 3 (deploying) is for. Once it's online you never need the Command Prompt again.

---

## 3. Put it online (free, about 15 minutes, one time)

We'll use **GitHub** (stores the files) and **Render** (runs the server 24/7 with HTTPS, so your PC can be off).

### 3a. Upload the project to GitHub
1. Make a free account at https://github.com
2. Click the **+** (top right) → **New repository**. Name it `city-chaos`. Choose **Private** or Public. Click **Create repository**.
3. On the next page click **"uploading an existing file"**.
4. Open your unzipped `city-chaos` folder, select **everything inside it EXCEPT the `node_modules` folder** (if you ran `npm install`), and drag it into the browser window.
5. Wait for the upload to finish, then click **Commit changes**.

### 3b. Deploy on Render
1. Go to https://render.com and click **Get Started**. Sign up **with your GitHub account** (easiest).
2. In the Render Dashboard click **New** → **Blueprint**.
3. Pick your `city-chaos` repository (click "Configure account" if it isn't listed and give Render access to it).
4. Render finds the included `render.yaml` and shows a service called **city-chaos** on the **Free** plan. Click **Apply** / **Deploy**.
   - If you prefer the manual way: **New** → **Web Service** → pick the repo → Build Command `npm install` → Start Command `npm start` → Instance type **Free** → **Create Web Service**.
5. Wait 2 to 5 minutes until the status says **Live**.
6. Your game's public link is shown at the top, like **https://city-chaos-abcd.onrender.com**. That's your game. Bookmark it.

### About the free plan (important)
- While people are playing, the server stays awake.
- After **15 minutes with nobody connected**, Render puts it to sleep. The next person to open the link waits **about 1 minute** while it wakes up (Render shows a loading page), then it works normally.
- Render may restart free servers occasionally. Rooms in progress are lost when that happens; players are sent back to the menu and can create a new room.
- Want it always instantly ready? In Render, open the service → **Settings** → **Instance Type** → choose a paid instance (check Render's pricing page for the current price).

### Updating the game later
Upload changed files to the same GitHub repository (same drag and drop, **Commit changes**). Render automatically redeploys within a few minutes.

### 3c. Optional: host the website on Netlify instead
Netlify can host the **website**, but it can't run the **multiplayer server** (that needs a program running 24/7 with live connections). So you still do 3a + 3b for the server, then:
1. In the project, open `public/config.js` in Notepad and put your Render link between the quotes:
   `window.CITY_CHAOS_SERVER = "https://city-chaos-abcd.onrender.com";` then save.
2. Go to https://app.netlify.com/drop (sign up free if asked).
3. Drag the **`public` folder** (just that folder) onto the page.
4. Netlify gives you a link like `https://something.netlify.app`. Use that link in the Quest browser and for invites. (In Netlify: **Site configuration** → **Change site name** to get something nicer, like `city-chaos-chris.netlify.app`.)

To update later: edit files, then on your Netlify site page go to **Deploys** and drag the `public` folder in again.

---

## 4. Play on Meta Quest 3

1. Put on the headset and open the **Meta Quest Browser**.
2. Type your Render link (for example `https://city-chaos-abcd.onrender.com`) and bookmark it.
3. Type your name, then **CREATE ROOM** (or **PLAY** for a public match).
4. In the lobby press **ENTER VR** and allow the permissions the browser asks for.
5. To turn on voice chat, press **MIC** in the lobby (or in the VR menu) and allow the microphone.

## 5. Invite friends

1. Press **CREATE ROOM**. You'll see a big code, like `ABC123`.
2. Press **COPY INVITE LINK** and paste it into a text, Discord, etc. It looks like:
   *Join my CITY CHAOS game! Open https://city-chaos-abcd.onrender.com/?room=ABC123 and enter code ABC123*
3. Your friend opens the link (Quest browser or a PC browser). The code is already filled in; they type their name and press **JOIN ROOM**.
4. Everyone appears in the same city. Friends on PC can play with friends in VR.

---

## 6. Controls

### Meta Quest 3 (VR)
| Control | Action |
|---|---|
| **Hands on the ground + push** | Move like a gorilla. Swing arms back to run, shove down to jump, slap walls to climb. |
| **Grip (either hand)** | Grab a weapon, ammo or health near your hand. Grab a car to hijack it. Near a shopkeeper: open the store. As a Cop, grab a wanted player to arrest them. In prison: **hold grip** on objects, grip inmates to talk, grab and throw the basketball |
| **Right trigger** | Shoot (hold for automatic weapons) |
| **A** | Reload |
| **B** | Switch weapon · skip the arrest cutscene |
| **X** | Jump boost (when touching something / standing). In a police car: siren on/off |
| **Y** | Menu (laser pointer + right trigger to click) |
| **Left stick click (hold)** | Scoreboard |
| **Right stick** | Turn (snap or smooth) |
| **Left stick** | Walk (only in "Arms + stick" or "Joystick" mode) |

Your **left wrist** shows health, timer and score. The **gun** shows its ammo.

### Desktop (keyboard + mouse)
| Key | Action |
|---|---|
| WASD | Move · **Shift** sprint |
| Mouse | Look |
| Left click | Shoot |
| R | Reload |
| E | Pick up · hijack a car / get out · arrest (Cop) · open a store near a shopkeeper · talk to inmates · **hold E** to use prison objects |
| Right click (hold) | Aim: scope in, and aim a gun at a shopkeeper to rob the store |
| L | Police car siren and lights (Cop) |
| Space | Jump · **walk into a wall and hold Space to climb it** (keep holding W and Space; at the top you pull yourself onto the roof or ledge. Let go to drop. Not in prison) |
| 1 / 2 / 3, mouse wheel, Q | Switch weapon |
| Tab | Scoreboard |
| M | 🗺️ Big city map (click to set your GPS) |
| V | 📷 Camera: click = photo, hold = video, F = selfie |
| P | 📱 Phone |
| Esc | Pause menu |
| Space / Enter | Skip the arrest cutscene |

Walk into a ladder to climb it.

---

## 7. Weapons

| Weapon | Damage | Shots per second | Magazine | Reload | Where to find it |
|---|---|---|---|---|---|
| Pistol | 20 (40 head) | 4.5 | 12 | 1.2s | Shops, Mega Mart, gas station (you also spawn with one) |
| Revolver | 45 (90 head) | 1.8 | 6 | 2.0s | Gun shop, gas station canopy, diner, plaza art cube |
| Assault Rifle | 16 (32 head) | 10 | 30 | 1.8s | Hidden crates (alley, garage, warehouse, abandoned building) |
| SMG | 11 (18 head) | 15 | 35 | 1.5s | Park fountain, basketball court, parking garage |
| Shotgun | 8 pellets x 12 | 1.2 | 6 | 2.2s | Police station, container yard, warehouse catwalk |
| Sniper Rifle | 90 (225 head) | 0.7 | 5 | 2.6s | Rooftops |
| Rocket Launcher | 110 direct, up to 95 splash | 0.8 | 1 | 2.5s | Rare red crates (abandoned building top floor, scaffolding top) |

Bullets lose up to half their damage at long range (except the sniper). Rocket blasts can launch you (rocket jumps).

---

## 8. Cop or Civilian, NPCs, robbing stores and the police

**Pick your role** on the main menu, in the lobby, in the pause menu (Esc), or in the VR menu (Y):
- 🧑 **Civilian** (default): rob stores, steal cars, cause chaos. Crimes make you wanted and the police come for you.
- 👮 **Cop:** you spawn at the police station in a blue uniform with a police cap, and your name tag says 👮. Your job is to stop robbers.
Switching role mid match respawns you right away (no death counted).

**Playing as a Cop**
- You get an alert (🚨) whenever someone starts robbing a store, and wanted players have **red star badges** floating over their heads.
- **Stores can't be robbed while a cop player is close by** (about 12m), so standing guard works.
- **Arrest:** walk up to a wanted player and press **E** (desktop) or **grab them with grip** (VR). Arresting pays a **double bounty** ($200 per star).
- **Police cars:** three police cars wait in the station lot. Cops can drive them freely. Toggle the **siren and flashing lights** with **L** (desktop) or **X** on the left controller (VR). Cops can also commandeer normal cars without getting stars.
- Cops can't rob stores, never get wanted stars, and NPC cops never shoot at you. Your bullets don't hurt NPC cops.
- Eliminating an innocent (not wanted) player or an NPC civilian costs you **$100**.

**How the police come after a wanted Civilian** (mixed at random):
- 🚓 **A police car** leaves the station, drives the roads to you with its siren on, stops, and **two cops jump out**. The empty police car stays parked there for a while.
- 🍩 **Cops run out of the donut shop**, still holding a donut ("HEY! STOP!").
- 👮 Cops on foot from nearby streets.
- Stealing a police car as a Civilian gives you **2 stars**.

**Robbing a store**
1. Walk into a store with a shopkeeper behind the counter (GUN SHOP, SNAX, DONUTS, MEGA MART, GAS & GO, STAR DINER, ARCADE).
2. **Aim any gun at the shopkeeper** from close range (within about 6m) and keep aiming. On PC **hold right click** to aim; in VR **point your gun at them at arm's length**. (Just looking at the clerk with a gun out doesn't rob them, so you can walk in to buy things.)
3. They put their hands up ("DON'T SHOOT!") and a progress bar fills. Hold your aim for about 4 seconds.
4. You get **$150 to $500**, the store closes for about 75 seconds, and you get **2 wanted stars ★★**.

**Wanted stars (up to 5 ★★★★★, shown at the top of your screen)**
| Crime | Stars |
|---|---|
| Robbing a store | +2 |
| Shooting a civilian (first shot) / eliminating one | +1 / +1 |
| Shooting a cop | +1 (eliminating one adds another) |
| Carjacking | +1 |
| Stealing a police car | +2 |
| Attacking or eliminating an innocent player in public (Free For All, with witnesses nearby) | +1 |
| Destruction (rocket explosions with witnesses nearby) | +1 |
| Resisting arrest (running away or shooting while being cuffed) | +1 |
| Escaping from prison | straight to 5 |

| Level | What the police do |
|---|---|
| ★ | Investigate: cops walk up to check on you, but don't shoot (unless you shot at them) |
| ★★ | Chase: cops chase you and open fire |
| ★★★ | Arrest: stronger police SUVs, cops close in and try to **cuff you** (3 seconds, run or shoot to resist) |
| ★★★★ | SWAT joins: armored SWAT officers with rifles (more health, more damage) |
| ★★★★★ | Maximum response: up to 12 officers, mostly SWAT |

Crimes against players and "destruction" only count when somebody sees it (a pedestrian, shopkeeper or cop nearby), and never in Team Deathmatch, so normal deathmatch fights aren't punished.

- Cops come after you in police cars (siren on), out of the donut shop, or on foot.
- **Lose the cops:** stay out of their sight for 25 seconds to drop a star. Rooftops and buildings help (cops can't climb).
- **Dying clears your stars.**
- **Bounty:** eliminating a wanted player pays you $100 per star they had.
- Your cash and stars show on the top bar (desktop) and on your left wrist (VR). Cash is on the scoreboard.

**Getting arrested**
- **Under 3 stars:** a short arrest. You spend about 12 seconds in the police station **holding cell** (weapons taken), then you're released out front.
- **3 stars or more:** you're going to **prison** (see the next section).
- A cop *player* can arrest you (E or grip), and so can NPC cops at 3+ stars.

**Pedestrians** walk the sidewalks and run away when shooting starts nearby. Eliminated NPCs come back after a short time.

**Cars and hijacking**
- About 10 NPC cars drive the roads in proper lanes. They brake for cars, players and pedestrians in front of them, and honk if you block them.
- **Hijack a car:** walk up to it (the driver freezes) and press **E** on desktop, or **grab the car with grip** in VR. The driver jumps out and runs away. Carjacking gives you **1 wanted star**.
- **Drive (desktop):** W/S gas and reverse, A/D steer, Space brake, H honk, E get out. Mouse looks around the car.
- **Drive (VR):** you sit in the driver seat. Right trigger gas, left trigger brake/reverse, left stick steer, A honk, B get out.
- Running people over hurts them (and NPCs). Abandoned cars stay parked, then rejoin traffic after a while.

**Getaway rides (passengers)**
- When a friend is driving, walk up to their car and press **E** (desktop) or **grab it with grip** (VR) to **hop in** as a passenger. Up to 3 passengers (front seat + 2 back seats).
- Civilians ride with civilians and cops ride with cops (a cop can't jump into a robber's getaway car).
- Passengers can look around and **shoot from the car** while the driver drives. Get out with **E** (desktop) or **B** (VR).
- If the driver gets out, passengers stay in their seats until they get out or someone drives again.
- In prison, friends can ride along in the stolen prison van and **escape together**.

---

## 8-ter. Saved progress

Your **cash** and **lifetime stats** now save automatically and carry over between games, rooms and server restarts.
- New players start with **$200**. Cash is now a wallet: a new match resets takedowns and deaths, but not your cash.
- **📊 MY PROGRESS** on the main menu shows your saved cash and stats: takedowns, knockouts, headshots, players arrested,
  stores robbed, robbers stopped, cash earned and spent, time played, matches played and won, and cars hijacked.
  **START OVER** (tap twice) erases it.
- Saves happen every few seconds while something changes, at the end of each match and when you leave a room.
- **How it's stored:** the server keeps the real numbers and sends your browser a *signed* save. When you join, the server
  checks the signature, so editing the save in the browser gives you a fresh start, not free cash. No database is needed,
  and saves survive the free Render server going to sleep or redeploying.
- Progress lives in that device's browser (your Quest browser and your PC each have their own). Clearing browser data erases it.
- **Set `PROFILE_SECRET` on your server** (Render > your service > Environment > add `PROFILE_SECRET` with any long random
  text). Do it once and never change it: changing it makes every existing save unreadable.

## 8-quater. Levels and XP

You earn **XP** for playing and go up in **levels** (max level 50). Your level is saved with your progress.

| Action | XP |
|---|---|
| Takedown | 25 (+10 for a headshot) |
| Arresting a wanted player | 60 |
| Robbing a store | 40 |
| Stopping an NPC robber | 50 (arresting one as a cop: 70) |
| Hijacking a car | 5 |
| Finishing a match | 30 (+70 if you win) |
| Every minute played | 4 |

- Level 2 takes 100 XP, level 5 about 500, level 10 about 2,100, level 20 about 11,000 and level 50 about 82,600.
- **Level-up bonus:** every new level pays cash ($50 + $25 x the level) and shows a big LEVEL UP banner (VR: a notice and a controller buzz).
  Everyone else sees "⭐ Name reached level N" in the feed.
- **Your level is shown** on the HUD (badge + XP bar above your health), on your VR wrist, over your head (Lv12 Name),
  and on the scoreboard. Small "+25 XP · Takedown" pops show under the crosshair.
- **Unlocks:** some cosmetics unlock with levels. In CUSTOMIZE you can still try them on (they show 🔒 Lv N), but in games
  other players see the default until you reach that level. The server enforces this.

| Level | Unlock |
|---|---|
| 2 | Top Hat |
| 3 | Jetpack |
| 4 | Beanie |
| 5 | Visor |
| 6 | Traffic Cone hat |
| 7 | Guitar |
| 8 | Cowboy hat |
| 9 | Cape |
| 10 | Monocle |
| 12 | Crown |
| 14 | Bean head |
| 16 | Robot body |

- **MY PROGRESS** shows your level, an XP bar, XP to the next level and what unlocks next.

## 8-quinquies. Daily missions

Every day at **midnight Pacific time** everyone gets the same **3 daily missions**, picked from 15 kinds:
take down players, land headshots, stop NPC robbers, hijack cars, buy things at stores, buy food, spend or earn cash,
play for a while, finish or win matches, try your luck at the arcade / scratch tickets, buy boosts or armor, and
**stand on the very top of the Chaos Tower** (the server checks where you really are).

- Each mission pays **cash + XP** the moment you finish it (a MISSION COMPLETE banner, VR: notice + chime).
- Finish **all 3** for a bonus of **+$300 and +150 XP**.
- **Where to see them:** the mission list pops up on the left for a few seconds when you join and whenever progress
  changes; hold **Tab** (or pause) to see it any time. In VR: **Y menu > 📋 DAILY MISSIONS**. On the main menu:
  **📊 MY PROGRESS**. Each shows progress bars, rewards and when the next missions arrive.
- Progress is saved with the rest of your profile. A new day replaces the missions even mid-game.
- Several banners at once (mission complete + level up) now wait their turn instead of covering each other.

## 8-sexies. The CITY BANK, the vault heist and jobs

The **CITY BANK** stands on the west side of the downtown plaza (above the parking garage). The plaza kiosk is now the
**💼 JOBS** board.

**Savings (the teller in the lobby)** — walk up and press **E** (Quest: squeeze grip): Deposit $100 / $500 / ALL,
Withdraw $100 / $500 / ALL.
- Savings are saved with your progress and grow **2% a day** (real days, also while you're offline, at most $1,000 a day).
  You're told how much interest you earned when you come back.
- **Why bother:** cash in your pocket is at risk now. Get knocked out by another player and they grab **10% of the cash
  you carry** (at most $300). Get arrested and the police confiscate **25%** (half goes to the cop). Savings are always safe.
- Moving money in or out isn't counted as cash earned or spent.

**The vault heist** (civilians only)
1. Go behind the teller to the big steel **vault door** and **hold E** (Quest: hold grip) to drill it for **15 seconds**.
   The alarm goes off (**1 wanted star**, cops get the 🚨 alert). Stop drilling and the drill cools down.
2. The door swings open (**+1 star**). Inside are **3 cash stacks** ($700 to $1,100 each). Press **E** / grip next to one
   to grab it (**+1 star**). One stack per person, so bring friends.
3. **Get 120 m away from the bank** with it to keep it (+150 XP). Knocked out or arrested on the way and it's gone.
4. The vault closes after 90 seconds and the bank goes on **lockdown for 8 minutes**.
- A line at the top of the screen shows how much further you have to run.

**Jobs** (anyone; at the 💼 JOBS kiosk press E / grip)
- **📦 Food Delivery:** pick up an order at a food store counter (SNAX, DONUTS, STAR DINER or GAS & GO), then run it to a
  customer's door (houses and apartment buildings) before the timer runs out. Late = half pay; very late = cancelled.
- **🚕 Taxi Driver:** get any car (E / grip on a car), drive to the passenger waiting on the sidewalk and **stop** next to
  them, then drive them to their stop and stop again.
- A **big glowing beam** marks where to go (green = pick up, yellow = drop off), and the top line shows the task, an
  arrow + distance and the timer (VR: a notice every few seconds). Pay grows with the distance ($100 to $300 a run) and
  every job gives 40 to 50 XP. You can quit a job at the kiosk.
- New daily missions: **Finish N jobs** and **Put $N in the CITY BANK**. New stats on MY PROGRESS: jobs done, bank
  heists and interest earned. MY PROGRESS also shows your savings.

## 8-octies. Your own cars (🚗 CAR LOT) and street races (🏁)

**CAR LOT.** At the gas station there's a 🚗 CAR LOT kiosk with four show cars on glowing pads. Press E (VR: grip) at
the kiosk to buy a car with your saved cash:

| Car | Price | Unlocks at | Top speed |
|---|---|---|---|
| 🚗 Pocket Rocket | $1,000 | level 1 | 94 km/h |
| 🛻 Big Rig Pickup | $2,500 | level 3 | 90 km/h |
| 🏎 Thunder V8 | $4,500 | level 5 | 112 km/h |
| 🏁 Viper GT | $8,000 | level 8 | 122 km/h |
| 👑 Gold Rush | $20,000 | level 12 | 122 km/h (solid gold) |

- Each car comes in a random color; a repaint costs $250 (10 colors). If you own several, pick which one you drive.
- **Call your car anywhere:** press **C** on PC, or **Y menu > CALL MY CAR** in VR. It parks on the nearest street
  and a pink beam shows where. Only one of your cars is out at a time; calling again moves it (15 s wait).
- **Only you can drive your car.** Friends can hop in as passengers while you drive. Driving your own car never gives
  wanted stars. Your car stays parked where you leave it, and goes away a minute after you leave the game.
- Your cars are kept in your save.

**Street races.** Drive any car (your own, a stolen one, even a police car) into the 🏁 STREET RACE arch on the avenue
next to the gas station. A race opens for 15 seconds so friends can line up, then it starts. Follow the cyan beam to
each checkpoint in order (skipping one doesn't count). The two routes take turns: **CITY LOOP** (9 checkpoints,
target 0:40) and **GRAND TOUR** (14 checkpoints around the outer roads, target 1:30).
- With friends: 1st wins $200 + $100 for every other racer, 2nd $100, 3rd $50. Solo: beat the target time for $150.
- Every finish gives 60 XP (+60 for a win). Your best time on each route is saved. New daily mission: finish street races.
- You drop out if you get out of your car for more than 8 seconds, get knocked out, or the race goes past 3:20.

## 8-nonies. Gang turf (🏴)

Pick a gang in the pause menu (or **Y menu > GANG** in VR): 🔴 RED FANGS, 🔵 BLUE SHARKS, 🟢 GREEN VIPERS or 🟡 GOLD CROWNS.
Your gang is saved. Six turf zones are marked with a big ring and a flag: CHAOS PARK, THE COURTS, CONTAINER YARD,
DINER STRIP, CONSTRUCTION SITE and MEGA MART LOT.
- Stand in a ring (on foot) to take it over: 20 seconds alone, faster with more of your gang (up to 3x).
  A rival gang member (or a cop) in the ring makes it **CONTESTED** and stops the clock. Walk away and the progress fades.
- Taking a zone pays everyone who helped $60 + 40 XP. Owning turf pays every member of the gang $8 per zone every minute.
- Cops standing in a gang's ring clear it back to neutral (+$30 each).
- The flag and ring show the owner's color; the top of the screen shows the zone and progress while you're in it;
  the Tab scoreboard shows how many zones each gang owns and everyone's gang. New daily mission: take over turf.

## 8-decies. The BOSS CREW (👑)

Every 8 to 12 minutes (the first one 4 to 6 minutes after someone joins), a **BOSS CREW** hits one of the stores:
an armored boss with a gold crown (450 health) and two armored guards (180 each).
- **Everyone** gets the alert (banner, alarm, a yellow beam on the boss, and a boss health bar at the top of the screen).
- The boss holds up the store for 20 seconds while the guards watch the door. They shoot at anyone who comes within
  about 18 m, and they don't panic or surrender like normal robbers. Then they run with $1,500 to $2,500.
- Bounties: **$800** for the boss (plus all the loot) and 150 XP, $250 per guard, and **+$300** for whoever drops the last one.
- Cops can only cuff a crew member once they're worn down below 30% health.

## 8-undecies. 👕 THREADS clothing store

On the east side of the downtown plaza (next to the JOBS kiosk) is **THREADS**, with three mannequins showing off
outfits. Press E (VR: grip) at the counter. Outfits are bought with cash and kept forever in your save:
🧥 Hoodie $150 · 🌺 Hawaiian Shirt $250 · 🏃 Track Suit $350 · 🤵 Tuxedo $700 · 🦸 Hero Suit (with cape) $1,200 · 💰 Gold Drip $3,000.
Buying one puts it on. Switch between the ones you own at the counter or in CUSTOMIZE (new **Outfit** row; outfits you
don't own show their price). Everyone sees your outfit; police, guard and prison uniforms go over it.

## 8-duodecies. 🏠 Apartments

There's a 🏠 APARTMENTS elevator door on the front of the PINK PALMS building. Press E (VR: grip) there.
- **Buy an apartment for $5,000** (unlocks at level 4). It's yours forever (saved).
- **GO HOME** takes you to your own private room: a trophy shelf, a bed, a couch, a TV and a "window" on the city.
  - The **trophy shelf** shows what you've earned: a gold bar for each bank heist (up to 6), a race cup, a crown for
    taking down a boss crew, a police badge for robbers stopped, your gang's flag if you've taken turf, toy versions of
    the cars you own, and a plaque with your level, stats and best race times.
  - **Nap** in your bed (E / grip next to it) for full health (every 20 seconds).
  - It's a **safe zone**: nobody can hurt you inside. You can't go home while you have wanted stars.
  - Walk to the 🚪 EXIT door and press E / grip to go back outside.
- **Friends can visit** while you're home: at the APARTMENTS door they'll see "Visit <name>'s place". When you leave,
  your guests go back outside too. Up to 6 people can be home at once.
- (Technical: the rooms are sealed boxes under the city, so they never get in the way of anything above.)

## 8-terdecies. 🎉 Parties

On the main menu (or the pause menu) press **🎉 PARTY**:
- **MAKE A PARTY** gives you a 5-letter party code (and a 📋 COPY INVITE LINK button: opening the link joins the party).
- Friends type the code and press **JOIN PARTY**.
- Whenever the **party leader** (👑) creates a room, joins a room or presses PLAY for a quick match, everyone in the
  party is sent to the same room automatically. Joining a party while the leader is already in a room takes you there.
- The party screen shows who's in the party and which room they're in. If the leader leaves, someone else becomes
  leader. Reloading the page or a dropped connection keeps your spot for 90 seconds. Up to 8 people per party.
- In VR the Y menu shows your party (click it to leave). Make or join the party on the menu screen before you enter VR.

## 8-quattuordecies. 😀 Emotes

- **PC:** hold **G** to open the emote wheel, move the mouse toward an emote (or press its number 1-8), let go of G.
- **VR:** Y menu > **EMOTES**, or simply **raise your hand above your head and wave it side to side** for 👋.
- Emotes: 👋 Wave, 😂 Laugh, 💃 Dance, 👍 Thumbs up, 😡 Angry, ❤️ Love, 🦍 Chest beat, 🤝 GG. Everyone nearby sees an
  emoji bubble over your head and a little move (desktop players' avatars wave, dance, beat their chest...).

## 8-quindecies. ⭐ Weekly challenges

Every Monday at midnight (Pacific) everyone gets the same **4 weekly challenges**, bigger than the daily missions:
things like "Take down 30 players", "Win 3 street races", "Get away with 2 CITY BANK heists", "Take down a BOSS CREW
member", "Complete 9 daily missions" or "Take over 8 gang turf zones". Each one pays $100 to $1,000+ and XP.
Finish all 4 for **+$1,000 + 500 XP** and a ⭐ star on your apartment's trophy shelf. They show under the daily
missions when you hold Tab, on the pause screen, on MY PROGRESS and on the VR missions page. Progress is saved.

## 8-sedecies. 🏆 Leaderboards

**🏆 LEADERBOARDS** is on the main menu, the pause menu and the VR Y menu. Ten boards, top 10 each:
💰 Richest (cash + savings) · ⭐ Highest level · 🏦 Bank heists · 🦹 Robbers stopped · 🏁 Street race wins ·
⏱ Fastest CITY LOOP · ⏱ Fastest GRAND TOUR · 🏴 Turf taken · 👑 Bosses taken down · 💥 Takedowns.
You're highlighted and the screen tells you your rank on each board.

How it works without a database: every save now has a permanent player ID and is signed by the server (so nobody
can fake their numbers). The board updates every time a game saves. When the game connects it sends its signed save,
so after a server restart (or the free Render plan going to sleep) the boards fill back up as players come online.
The server also writes the board to `data/leaderboard.json` (kept between restarts on hosts that have a disk;
on Render's free plan it starts empty after a restart and refills as people play). Don't upload the `data` folder.

## 8-septendecies. 🎄 Holiday event

From **December 1 to January 5** (Pacific time) the city turns wintry by itself: falling snow, a grey winter sky,
a giant decorated tree (blinking lights, gold star, presents) on the downtown plaza and snowmen around town.
- **12 🎁 gifts** are hidden around the city every day (different spots each day, the same for everyone). Walk up and
  press E (VR: grip). Each player can open each gift once a day: cash ($50 to $250), XP, or (5% chance) the
  exclusive **🎅 Santa Suit** outfit, which you can't buy anywhere. Hold Tab to see how many you've found today.
- To turn it on outside those dates (or off during them), set `SEASON=winter` (or `SEASON=off`) in Render's Environment.

## 8-duodevicies. 🔊 Sound and the 📻 car radio

All sounds are still made in the browser (no audio files to download), now with more detail:
- **📻 Car radio** with three stations: **CHAOS FM** (upbeat pop), **LO-FI 88** (chill) and **BASS 101** (wobbly bass).
  It turns on by itself in your own car. Press **N** on PC (VR: **X** on the left controller while driving) for the
  next station; after the last one it turns off. It stops when you get out, and remembers your station.
- **Gunshots** have a body thump and a mechanical click up close, a short "slap back" echo off the buildings, and far
  away shots (and explosions) sound muffled, like real gunfire across a city.
- **The city sounds like where you are:** lots of birds in the parks, traffic and honking downtown and in the
  shopping streets, and during the holiday event a cold wind and the odd sleigh bell.

## 8-undevicies. 📱 The phone

- **PC:** press **P**. **VR:** roll your left wrist toward your face (like checking a watch) and the phone appears on
  the inside of your wrist; tap an app by touching it with your right controller. It hides again when you look away.
- It shows the time, your **cash and savings**, your **level and XP**, what you're doing right now (job, race,
  heist, turf...), **today's missions**, how many **weekly challenges** you've done and the holiday gifts you've found.
- Apps: **🚗 Call my car**, **📻 Radio** (in a car), **👋 Wave**, **🗺️ Map** (see below) and **📍 GPS**: pick a place (JOBS, CITY BANK, CAR LOT,
  THREADS, APARTMENTS, RACE START, GUN SHOP, CHAOS TOWER) and a purple beam guides you there; it turns off when you arrive.
  On PC the phone frees the mouse without pausing; P or Esc puts it away.

## 8-vicies. 🌗 Day and night, 🌧 weather, living streets and the 🗺️ city map

- **Day and night:** the city has its own clock, the same for everyone in the room. One full day takes **24 real
  minutes** (a game hour is one real minute). The sun sets around 7 PM and rises around 6 AM. At night the
  **streetlights** and **neon** glow, **windows light up**, the stars come out and cars drive with their **headlights** on.
  The phone shows the game time (☀️ / 🌙). **More NPC robbers come out at night** (they show up faster and one extra can be
  around at once), so nights are busier for cops.
- **Weather:** every few game hours the sky changes between **clear**, **🌧 rain** and **⛈ thunderstorms**. Rain falls
  around you, splashes on the street, greys out the sky and makes the roads **slippery** (cars grip about 20% less in
  heavy rain, so brake earlier). Storms add **lightning flashes and thunder**. The holiday event keeps its snow instead.
- **Pedestrians react to you:**
  - They **run from gunfire** (as before) and scream.
  - **Emote next to them** and they answer: **wave** and they wave back, **dance** and they dance with you, laugh and
    they laugh, beat your chest and they cheer, get angry and they back off. Up to 4 people nearby answer.
  - **Street races** draw a **crowd of fans** at the 🏁 start line. They **cheer on GO** and cheer again when a racer
    crosses the line (louder for the winner). Shoot near them and they scatter.
  - Drive fast at someone and they **jump out of the way** ("HEY! WATCH IT!").
  - In the rain most pedestrians walk with an **umbrella** ☂️.
- **🗺️ City map:**
  - **PC minimap:** bottom right, it turns with you (the pink **N** shows north) and zooms out while you drive.
    It shows you (yellow arrow), your target (job, race checkpoint, GPS, your called car) as a pin that sticks to the edge
    when it's off the map, the places (jobs, bank, car lot, threads, apartments, race start, gun shop, chaos tower),
    gang turf rings in their gang's color, other players (white, **blue = cops**, **red = wanted**), the police chasing
    you when you're wanted, and holiday gifts.
  - **Big map:** press **M** (or open the phone and tap 🗺️ Map). **Click anywhere to drop a GPS pin** there (a purple beam
    guides you), or click a place to go to it. Buttons: **Clear GPS** and **Minimap ON/OFF**. M or Esc closes it. The
    game keeps running while it's open.
  - **VR:** look at your wrist phone and tap **🗺️ MAP**: the screen turns into the whole city map with you and your target.
    Tap **◀ BACK** to return to the apps.

## 8-unvicies. 📷 The camera (photos + videos)

- **PC:** press **V** to take out the camera (your gun goes away; V again, or 1/2/3/Q, brings the gun back).
  **Click = photo**, **hold the left mouse button = record a video** (let go to stop, 30 seconds max), **F = selfie**.
- **VR:** Y menu > **📷 CAMERA**, or tap **📷** on your wrist phone. The camera sits in your right hand with a **live
  screen on the back** so you can frame the shot. **Tap the trigger = photo**, **hold the trigger = video**, **A = selfie**
  (turn the camera around to get yourself and your friends in the picture), **B = back to your gun**.
- In selfie mode **you appear in the picture** with your outfit (and your emotes: dance, then take the selfie).
- Photos are saved as **JPG (1600 x 1200)** and videos as **MP4** (or WEBM if the browser can't do MP4), 640 x 480 at
  24 fps **with the game's sound**, all with a small CITY CHAOS logo in the corner.
- **Where they go:** a web game can't put files straight into the Quest **Gallery** (only the headset's own capture can).
  They download to the **Downloads** folder instead. **On Quest:** open the **Files** app (App library > Files) and look
  in Downloads / Recents. **On PC:** your normal Downloads folder.
- The phone's **🖼️ Photos** app (PC) shows your last 30 photos and 6 videos (kept on this device) with **⬇ Save** to
  download one again and **🗑** to delete it.
- Want it in the Quest Gallery anyway? Use the headset's own capture at the same time: **hold the Meta button and tap the
  trigger** for a screenshot, **hold the Meta button and hold the trigger** to start / stop a video.

## 8-septies. First-time tutorial and bug reports

**Tutorial.** New players get a short 7-step tutorial the first time they're in the city (blue panel at the top on PC,
notices in VR): move, jump/climb, shoot, open the daily missions (Tab on PC, Y menu in VR), follow a glowing beam to the
💼 JOBS kiosk, open it, done. Each step checks that you actually did it (a few steps move on by themselves after a while
so nobody gets stuck). Finishing it pays **$100 + 50 XP, once per save**; skipping (K on PC, SKIP TUTORIAL in the VR
menu) pays nothing. Replay it any time from HOW TO PLAY > 🎓 PLAY THE TUTORIAL (no second reward).

**Bug reports.** Players can send a bug report from the pause menu (🐞 REPORT A BUG, type what happened) or the VR menu
(🐞 REPORT A BUG HERE: sends their position and what they were doing). The game also reports its own crashes and script
errors automatically (at most 8 per player per session). Every report goes into the server log as a `[BUG]` or
`[CLIENT ERROR]` line (Render > your service > Logs) with the player, room, position, frame rate, browser and game
version.
- **To see them on a web page:** in Render > your service > Environment, add `ADMIN_KEY` with any password you like,
  save, then open `https://YOUR-GAME.onrender.com/bugs?key=YOUR_PASSWORD`. Without `ADMIN_KEY` the page doesn't exist.
  The page keeps the last 300 reports since the server last started (the logs keep them longer).

## 8-bis. NPC bad guys: robbers and car thieves

Every 35 to 70 seconds a masked robber (black hoodie, black beanie, red bandana, a gun) shows up somewhere in the city.
There are never more than 2 at once. Each one does one of two jobs:
- 🏪 **Store robbery:** he walks in through the door, pulls his gun on the clerk ("HANDS UP! EMPTY THE REGISTER!"), and the
  clerk puts their hands up. After about 6 seconds he grabs the cash, the store closes like after a player robbery, and he
  runs off carrying a cash bag to a street corner far away, where he disappears.
- 🚗 **Car theft:** he walks up to a car waiting at a light, throws the driver out (they run off screaming) and floors it,
  running red lights, for about 45 seconds before he vanishes into traffic.

Everyone sees it in the feed ("A robber is holding up GUN SHOP!", "A car thief stole a car!", "A robber got away with $300").
Cop players also get the 🚨 alert and siren.

**Stopping them**
- **Shoot him:** a **$150 bounty** (cops get **$300**) **plus all the cash he stole**. Shooting robbers never gives you wanted stars.
- **Cop players arrest him:** walk up and press **E** (PC) or **grip him** (VR) for **$250** plus the stolen cash.
- **He fights back:** a robber shoots at whoever shoots him, and at cops close by while he's on a job. A badly hurt robber with a cop nearby gives up (hands up) and waits to be cuffed.
- **NPC police** show up about 8 seconds after a store robbery starts, chase him (in through the store door if they need to) and shoot or arrest him. Sometimes he still gets away.
- **Take the car back:** hijack a stolen car (E / grip) and the thief jumps out and runs. Taking a car back from a thief gives you no wanted stars. Shooting the thief through the window stops the car.
- To turn robbers off on your server, set the environment variable **CROOKS=off** (Render: your service > Environment).

## 8a. Buying things at the stores

Every store with a shopkeeper sells something. Walk up to the counter and press **E** (PC) or **squeeze grip** (Quest)
to open the store. On PC click an item or press its number key (1 to 0), **E** or **Esc** leaves. On Quest point the
laser at an item and pull the trigger, **LEAVE STORE** or **Y** closes it. Walking away closes the store too.
You pay with the cash you earn from robberies and bounties (shown at the top of the screen and on your left wrist).

| Store | Sells |
|---|---|
| 🔫 GUN SHOP | Pistol $100, Revolver $200, SMG $300, Shotgun $350, Assault Rifle $450, Sniper Rifle $700, Rocket Launcher $1200, Ammo Box $40, Body Armor (50) $150, Heavy Armor (100) $300 |
| 🥔 SNAX | Chips (+20 health) $15, Candy Bar (+30) $20, Fizz Soda (speed boost 30s) $30, Mega Jerky (+60) $45 |
| 🍩 DONUTS | Glazed Donut (+30) $15, Dozen Donuts (full health) $60, Cop Coffee (speed 45s) $25, Sprinkle Rush (speed + jump 40s) $40 |
| 🛒 MEGA MART | Bandages (+35) $25, Medkit (full health) $80, Ammo Box $45, Body Armor $170, Running Shoes (1.5x speed 60s) $60 |
| ⛽ GAS & GO | Energy Drink (speed + jump 40s) $40, Hot Dog (+35) $20, Scratch Ticket $25 (win $40, $200 or $1000), Ammo Box $50 |
| ⭐ STAR DINER | Star Burger (full health) $50, Fries (+30) $20, Rocket Shake (2x jump 35s) $35, Apple Pie (+50) $30 |
| 👾 ARCADE | Claw Machine $20 (win $20 to $200), Jackpot Spin $100 (win $100 to $2500), Pixel Power-Up (speed + big jump 30s) $50, Blue Slushie (+25) $15 |

- **Guns:** the new gun goes in your hands (if you already have it you get more ammo). You still carry 3 guns max.
- **Armor** (🛡 next to your health bar, and on your wrist in VR) takes 70% of every hit until it runs out. You lose it when you're eliminated.
- **Boosts** (⚡ on screen) also work with Gorilla arm movement in VR. They end when you die.
- **Lottery** prizes are paid straight into your cash; on average the house wins.
- The store won't take your money for nothing: no food at full health, no ammo when you're full, no smaller armor than you have.
- You can't shop while a store is closed after a robbery, while the clerk is being robbed (hands up), when the clerk is down, from inside a car, or in prison. The server checks your distance to the counter, that there's no wall in between, and your cash.
- The secret **Golden Sniper** is now bought from the GUN SHOP menu too: it shows up as the first item, and only for the cop who unlocked it.

## 8b. Prison: arrest cutscene and escaping

**The arrest cutscene (3+ stars).** Real 3D scenes, not pictures:
1. **Capture:** you freeze, your weapons are taken, two officers walk up and cuff you, and one walks you to the police car.
2. **The ride:** you sit in the back seat while the car drives real city streets with lights flashing, siren and police radio chatter. Desktop gets camera angles (back seat, side window, roadside, chase); VR keeps you in a fixed seat in the back, so the game never turns your head for you.
3. **Arrival:** the prison gate opens, guards watch, the gate closes behind you, and you're walked inside.
4. **"6 HOURS LATER..."** You wake up on your cell bed: **YOU HAVE BEEN SENT TO PRISON.**
Skip it any time: **SPACE** (desktop) or **B** (VR).

**Inside the prison** (a whole new low-poly map, south of the city): cell block with 10 cells and showers, cafeteria, yard with a basketball court, medical room, laundry, workshop, admin building (security checkpoint, guard offices, control room, armory, staff lockers), sally port with the prison van, 4 guard towers with searchlights, security cameras, an electric fence on top of the walls, maintenance tunnels and an old sewer underneath. You wear an orange jumpsuit and have no weapons.

- **Schedule:** Free time, Breakfast, Yard time, Work duty (laundry + workshop open), Free time, then **LOCKDOWN** (be in your cell when the doors close). Announcements play over the speakers.
- **Guards** patrol, investigate noises (digging, cutting, tools), and chase anyone in a restricted area. **Cameras** sweep and sound the alarm. **Tower guards** watch the walls and roofs. Get caught and you're dragged back to your cell and lose everything you were carrying.
- **Restricted areas:** admin building, sally port, rooftops, near the walls, maintenance areas, tunnels and sewer, and the laundry and workshop outside work duty. Being out of your cell during lockdown counts too.
- **Talk to inmates** (E, or grip in VR). Each one knows something about a way out. Two of them have **missions**: BIG MIKE wants you to sink 3 baskets, DOC wants a food tray.
- **Interact:** look at an object and **hold E** (desktop) or **hold grip** with your hand on it (VR). A ✋ marker shows what you can use.
- **Basketball:** E or grip to pick up, click to shoot (desktop), or let go of grip while swinging your arm to throw (VR).

**Five ways out (each takes several steps):**
| Route | Steps |
|---|---|
| 🪛 Maintenance | Screwdriver from the workshop (work duty) → unscrew the maintenance panel in the laundry → down the ladder into the tunnels → bolt cutters from the tunnel storage room → cut the tunnel gate → climb out the manhole outside the walls |
| 🥄 Sewer | Food tray at breakfast → give it to DOC (he tells you about the loose shower tile) → swipe a spoon in the cafeteria (don't let a guard see) → dig out the tile (loud, 10 s) → in the sewer, turn **both** valves to drain the water and open the grate → climb out past the wall |
| 🦺 Guard disguise | Sink 3 baskets → BIG MIKE gives you the drawer code → keycard from the medical drawer → keycard into the admin building and staff lockers → put on a guard uniform (cameras ignore you, but don't hang around a guard for long) → badge out through the staff gate |
| 🪢 Rooftop | Tie bedsheets into a rope in the laundry (work duty) → get on the workshop roof (unscrew the roof hatch, or climb in VR) → cut the fence power at the fuse box (45 s, guards hear it) → throw the rope over the wall |
| 🚐 Vehicle | Keycard → control room: grab the van keys and press OPEN MAIN GATE (open 30 s, the alarm goes off 8 s later) → drive the prison van out of the gate |

Unique items (screwdriver, bolt cutters, keycard, van keys) exist once per room; if someone gets caught, theirs goes back.

**Escape:** "PRISON ESCAPE SUCCESSFUL!", your normal clothes and weapons come back, you're dropped in the city with **5 stars** and a full police pursuit. Hide and lose them. Get caught again with 3+ stars and it's straight back to prison.

**Multiplayer:** every player has their own stars and their own arrest. Friends arrested together share the prison (up to 8 per room), see each other, and the guards, alarms, doors and escape progress are the same for everyone, so you can split the work (one opens the gate from the control room, the other drives the van; one turns each sewer valve).

---

## 8c. The city

CITY CHAOS is a 4 by 4 grid of city blocks with its own neighborhoods. Every building, pickup, shop and spawn point
from before is still in the same place, so nothing about the game changed, only how the city looks and feels.

| Neighborhood | What's there |
|---|---|
| Downtown (north east) | **Chaos Tower** (the landmark: glass setbacks, color cycling crown, spire with a beacon), glass offices, Cafe Chaos, a helipad office, the plaza above the parking garage with a statue and art cube |
| Shopping (north west) | Gun Shop, Snax, Donuts (giant spinning donut on the roof), Mega Mart (rooftop sign with chasing bulbs), Electro (TV billboard), Style Street clothing, striped awnings |
| City services | Police HQ (flags, badge, parking stalls), Fire Station 7 (walk in: two fire trucks, stairs to the roof), Hospital (helipad, red crosses, ambulance bay), Joe's Auto Repair (car on a lift), Chaos Motors car dealership (cars in the showroom), Hotel Royal |
| Residential (south) | Six houses with porches, garages, driveways, mailboxes, gardens and picket fences, a backyard pool, the **City Chaos water tower** (sniper on the catwalk), a swing set |
| Park (west) | Fountain, pond with lily pads, playground, picnic tables, flower beds, lanterns, basketball court |
| Industrial | Warehouse 9 with loading docks and a semi truck, container yard with a forklift, construction site with a crane |

Streets have double yellow center lines, crosswalks at every corner, stop lines, manholes, **traffic lights at the 9 main
intersections** (NPC cars stop on red), stop signs at the ring road, street name signs (Main St, Chaos Ave, Pixel Blvd...),
bus stops, benches, hydrants, trash cans, planters, street trees and parking meters. The edge of the map is a skyline of
tall buildings. Little things move: rooftop fans spin, flags wave, clouds drift, the fountain splashes, neon signs flicker,
antennas blink. There are a few hidden details too (look up at Chaos Tower now and then, and check the pond and the gardens).

Climbing: awnings, balconies, bus stop roofs, fences, porches, house roofs, water tanks and the water tower are all solid,
so gorilla movement can climb them. Small street furniture sits right at the curb so it never blocks the sidewalk.

Performance: the city is split into one batch of meshes per block, so the parts behind you aren't drawn and small details
switch off past about 95 m. Street level is about 50 draw calls and 90k to 150k triangles (less than before the update).

## 9. Settings
- **VR body:** Gorilla (default: true Gorilla Tag physics, no feet, your hands hold you up, eyes about 0.6 to 1m off the ground) / Small (standing, eyes about 1.25m, auto-calibrated to your height; use RECALIBRATE in the VR menu while standing tall) / Human (real height)
- **VR movement:** Gorilla arms (default) / Arms + stick / Joystick
- **VR turning:** Snap 30/45/60 degrees, Smooth, Off
- **Comfort vignette**, **Arm strength** (how far a push throws you, default 1.0. Hands now let go as soon as you lift them, so movement is not sticky)
- Mouse sensitivity, field of view, volumes (master, music, effects, voice)
- Shadows (on PC; in VR only with "Pretty" graphics to protect frame rate), graphics quality, FPS counter

---

## 10. Project structure

```
city-chaos/
├── server/                 BACKEND (Node.js)
│   ├── index.js            web server + WebSockets, room codes, reconnects
│   ├── room.js             authoritative game: hits, damage, ammo, pickups, kills, respawns, modes
│   ├── npcs.js             pedestrians, shopkeepers, cops, SWAT, robbery, wanted stars, NPC arrests
│   ├── crooks.js           NPC robbers + car thieves: store holdups, stealing cars, fleeing, fighting back, bounties
│   ├── bank.js             CITY BANK: savings accounts, interest, the vault heist
│   ├── jobs.js             delivery + taxi jobs
│   ├── profiles.js         saved progress: signed save tokens, stats, XP + levels, daily missions, autosave
│   ├── shops.js            buying at the stores: counter + cash checks, guns, ammo, food, armor, boosts, lottery
│   ├── vehicles.js         NPC traffic, police cars, dispatch, the prison van
│   └── prison.js           arrests, cutscene timer, prison schedule, guards, cameras, alarms, escapes, basketball
├── public/                 FRONTEND (what the browser downloads; this folder alone can go on Netlify)
│   ├── index.html, css/style.css
│   ├── config.js           game server address (only needed when the website is hosted separately)
│   ├── shared/             used by BOTH server and browser
│   │   ├── map.js          the whole city: districts, buildings, roofs, houses, signals, street furniture, pickups, spawns
│   │   ├── cityKit.js      neighborhoods + the traffic light timing (server and browser share it)
│   │   ├── prison.js       the prison map + all escape objects, zones, cameras, guard routes
│   │   ├── roads.js        road routing (police cars + the cutscene car)
│   │   ├── collision.js    collision + raycasting (movement and bullet hits)
│   │   ├── shops.js        what every store sells and the prices
│   │   ├── weapons.js      weapon stats
│   │   ├── daynight.js     the city clock + weather schedule (same on server and browser)
│   │   └── constants.js    health, hitboxes, modes, cosmetics list
│   ├── js/main.js          game flow + frame loop
│   ├── js/engine/          3D engine: renderer + sky, city.js (per-block batches + LOD), cityDecor.js (facades, roads,
│   │                       street furniture, landmarks), cityAnim.js (traffic lights, fans, flags, signs), effects
│   ├── js/vr/              VR controls (vrInput.js) + in-headset UI (vrUI.js)
│   ├── js/physics/         Gorilla arm locomotion, walking, VR comfort movement
│   ├── js/weapons/         weapon models, firing/reload system, pickups
│   ├── js/net/             networking (network.js) + voice chat (voice.js)
│   ├── js/player/          avatars, other players (interpolation), NPC visuals
│   ├── js/ui/              menus, HUD, settings, desktop input, store menus (shopMenu.js), phone.js, citymap.js (minimap + big map)
│   ├── js/world/           daynight.js (sun, sky, lights), weather.js (rain, storms), photocam.js (📷 camera), races, turf, apartments, holiday event
│   ├── js/prison/          prison visuals, arrest cutscene, prison interactions
│   ├── js/audio/           synthesized sound effects + music
│   └── vendor/three/       Three.js (bundled, no internet CDN needed)
├── test/                   automated tests
├── render.yaml             Render deploy config
└── package.json
```

---

## 11. What was tested, and what still needs your real headset

**Tested and passing:**
- **Phone (`test/browser/phone_test.py`):** PC: P opens it with your money and missions, the GPS beam, Esc closes it without pausing. Emulated Quest 3: hidden during normal play, shown when you roll your wrist toward your face, tapping WAVE with the right hand sends a wave.
- **Sound (`test/browser/sound_test.py`):** the radio starting in your own car, N going through all three stations and off, stopping when you get out; new gunshots near and far, explosions and the park / winter ambience with no errors.
- **Camera (`test/browser/camera_test.py`, `test/browser/quest3_camera_test.py`):** V takes it out and hides the gun, a click
  saves a 1600 x 1200 JPG that's properly exposed, F flips to selfie (you're in the shot), holding records an MP4 with data,
  the phone Photos app lists them, Esc closes it, putting it away brings the gun back. On the emulated Quest 3: Y menu >
  CAMERA puts it in your right hand, the live screen draws, a trigger tap saves a photo from inside VR, A = selfie,
  holding the trigger records a video, B puts it away. **Not tested on a real headset yet:** how the Quest browser
  handles a download while you're in VR, and whether its MediaRecorder makes MP4 or WEBM.
- **Living city (`test/server-test-27.mjs`, `test/browser/daynight_test.py`, `test/browser/citymap_test.py`):** the clock
  (wraps after 24 minutes, day/night hours, the weather cycle), pinning the test clock, pedestrians dancing and waving back
  and turning to face you, far away peds ignoring you, gunfire beating a dance, race fans gathering (once), cheering on GO,
  settling down, scattering at gunshots and going home, dodging a fast car (and not a slow one). In the browser: noon,
  sunset, night (lamps, windows, stars, headlights), rain and a storm; the minimap, the M map, clicking a GPS pin and a
  place, the phone MAP app, the VR phone MAP page and BACK, a ped dancing back and umbrellas in the rain.
- **Holiday event (`test/server-test-26.mjs`, `test/browser/season_test.py`):** the dates, 12 gifts a day in reachable spots (not the prison), different every day, opening one (cash, XP, the Santa Suit, $500 if you already have it), once per player per day, too far = no, the Santa Suit saved and wearable only by its owner, the odds. In the browser: snow, the grey sky, the tree, opening a gift, the Tab count and turning it off again.
- **Leaderboards (`test/server-test-25.mjs`, `test/browser/leaderboard_test.py`):** sorting (fastest times low to high, zeros left off), one row per player, ranks, a real game save showing up on /api/leaderboard, a signed save sent on connect counting, a forged save ignored. In the browser: the screen from the pause menu, switching boards and your row highlighted.
- **Weekly challenges (`test/server-test-24.mjs`, `test/browser/weekly_test.py`):** 4 a week, the same for everyone, changing weekly, every kind showing up, progress from real events (race wins, heists, daily missions...), rewards, the all-4 bonus and star, no double rewards, the new-week reset, saved. In the browser: Tab with both lists (the scoreboard moves aside) and the WEEKLY CHALLENGE banner.
- **Emotes (`test/server-test-21.mjs`, `test/browser/emote_test.py`):** relayed to everyone, rate limited, junk ignored; in the browser the G wheel, picking with the mouse, the other player receiving it, and the emoji bubbles.
- **Parties (`test/server-test-23.mjs`, `test/browser/party_test.py`):** making a party, wrong codes, joining by code, the leader creating a room pulling the party in, joining late, quick match together, only the leader pulls, a new leader, reconnecting. In the browser: the PARTY screen on two players and the friend following the leader into a new room.
- **Apartments (`test/server-test-22.mjs`, `test/browser/apartment_test.py`):** level + cash to buy, no buying twice, no going home with stars, your own unit, the trophy shelf data for everyone, the safe zone, the nap and its wait, friends visiting, guests walked out when you leave, the unit freeing up, respawning out of it, no turf capturing from under the city, saved. In the browser: the door, buying, going home, the room and shelf, the nap and leaving through the exit door.
- **THREADS (`test/server-test-21.mjs`, `test/browser/threads_test.py`):** buying with cash, wearing and taking off, no buying twice, outfits you don't own can't be worn (joining or CUSTOMIZE), saved and loaded. In the browser: the mannequins, the store menu, buying the Tuxedo, a second player seeing it, and the CUSTOMIZE row.
- **Boss crew (`test/server-test-20.mjs`, `test/browser/boss_test.py`):** the boss + 2 guards, the alert to everyone, the walk in, the 20 s hold up, guards at the door, shooting anyone close, no cuffing at full health, bounties, the loot, the last-one bonus, the crew running together, escaping, the timer. In the browser: the banner, the health bar, the beam, the crowned boss and armored guards.
- **Gang turf (`test/server-test-19.mjs`, `test/browser/turf_test.py`):** joining and leaving a gang (saved), no gang = no capturing, the 20 s capture, faster with two, contested zones, fading progress, taking a rival's zone, cops clearing turf (and not taking neutral zones), turf income only for gang members. In the browser: the pause menu picker, the rings and flags, the capture line, the TURF TAKEN banner and the scoreboard count.
- **Your own cars (`test/server-test-17.mjs`, `test/browser/garage_test.py`):** buying (cash + level locks), no buying twice, repainting, picking a car, the save, calling your car to a street (cooldown, one car out at a time), only the owner can drive it, friends can ride, no carjacking stat or stars, it stays parked, it goes away after you leave and comes back with your save. In the browser: the show cars, the CAR LOT menu, buying, C to call, the beam, getting in and driving.
- **Street races (`test/server-test-18.mjs`, `test/browser/race_test.py`):** you need a car to start, the lobby, a second racer joining, dropping out before the start, GO, checkpoints in order only, places and prizes, stats and best times saved, getting out of the car, timeouts, the solo target time (prize only when you beat it), the cooldown and the two routes taking turns. In the browser: a whole CITY LOOP from the start line to the finish banner.
- **Tutorial + bug reports (`test/server-test-16.mjs`, `test/browser/tutorial_test.py`):** the reward paid once per save, nothing for skipping, no second reward after coming back with the same save; in the browser every one of the 7 steps on PC (including the beam to the kiosk), the COMPLETE banner and cash, skipping with K, not showing again on the next visit, the VR steps and SKIP TUTORIAL in the VR menu; a bug report from the pause menu reaching the server log, automatic error reports (script errors and failed promises) and the `/bugs` page (hidden without the key).
- **Soak tests:** `test/soak-test.mjs` runs 8 bots doing random things for 20 to 40 simulated minutes on a fake clock and checks nothing breaks (cash never negative, no NaN positions, no stuck players, no crashes). `test/browser/browser_soak_test.py` runs 2 desktop players and an emulated Quest 3 in one room for 3 minutes of random keys, clicks, menus, teleports and shooting: zero page errors and zero server errors.
- **CITY BANK + jobs (`test/server-test-15.mjs`, `test/browser/bank_jobs_test.py`, `test/browser/quest3_bank_jobs_test.py`):** deposits, withdrawals, not counted as earned/spent, saved, interest (2%/day, capped), only at the teller; knockouts taking 10% of pocket cash (max $300), arrests confiscating 25%, savings safe; the heist (cops can't drill, alarm + stars, drill cooling down, door opening and its collision going away, a separate door per room, grabbing one stack each, escaping 120 m to keep it, losing it when knocked out, the vault closing and the lockdown, new players getting the vault state); delivery jobs (on time, late = half pay, too late = cancelled, quit), taxi jobs (needs a car, real passenger NPC, stopping to pick up and drop off, out of the car too long = failed). In the browser on PC and an emulated Quest 3: the bank building, the teller and JOBS menus, a full delivery with the marker, and a full heist from drilling to getting away.
- **Daily missions (`test/server-test-14.mjs`, `test/browser/missions_test.py`):** 3 different missions a day, the same for everyone, changing daily, every kind showing up over time, progress from real takedowns / store purchases / the Chaos Tower roof, cash + XP rewards, the all-3 bonus, no double rewards, saved progress, new day reset mid-game (also tested on a dozen different days); in the browser: the tracker, progress bars, banners (queued), Tab, MY PROGRESS and the VR menu page.
- **Levels and XP (`test/server-test-13.mjs`, `test/browser/level_test.py`):** the level curve, XP for takedowns, headshots, robberies, robbers, cars, matches, wins and time played (none for dying), level-up cash bonuses (also when jumping several levels), unlock announcements, everyone seeing your level, locked cosmetics showing as the default until unlocked, XP saved and loaded; in the browser: HUD badge + XP bar, XP pops, LEVEL UP banner, level on the other player's screen and the scoreboard, 🔒 labels in CUSTOMIZE and the level on MY PROGRESS.
- **Saved progress (`test/server-test-12.mjs`, `test/browser/save_test.py`):** new players get $200, cash and stats (takedowns, headshots, deaths, earned, spent, play time, matches, wins) are saved, a new match keeps your cash, a new room / server restart loads them back, edited or junk saves are rejected, old mod menu messages are ignored, leaving saves right away, and in the browser: the save survives leaving and coming back, MY PROGRESS shows it, START OVER erases it.
- **NPC robbers and car thieves (`test/server-test-11.mjs`, `test/browser/crook_test.py`):** a robber walks in through the door and robs every one of the 7 stores, the clerk puts their hands up, the store closes, he escapes with the cash; bounty + stolen cash for shooting one with no wanted stars; robbers shooting back; NPC police responding after a delay and getting him; cop players arresting (E) and civilians not; surrendering; car thieves stealing a car at a light, the driver running off, speeding, taking the car back with no stars, shooting the driver stopping the car, the joyride ending; robbers showing up by themselves (max 2) and the CROOKS=off switch. In the browser: the masked robber, the holdup, the cash bag, the car thief in the driver's seat and the cop arrest prompt.
- **PC wall climbing (`test/browser/wall_climb_test.py`):** walking into a wall without Space stays on the ground, holding Space climbs a 9 m building and pulls up onto the roof, letting go drops you, and the old mod menu code does nothing.
- **Stores (`test/server-test-10.mjs`, plus a PC and emulated Quest 3 browser test):** buying at all 7 stores, prices taken and shown to everyone, guns into your hands, ammo boxes, armor soaking 70% of a hit, food healing, speed and jump boosts, lottery payouts, too far / through a wall / wrong store refused, closed after a robbery, scared clerk, dead or jailed players, double clicks, a short Gorilla body buying over the counter, the PC store panel (click and number keys), the VR store page (grip to open, trigger to buy), and the Golden Sniper bought from the GUN SHOP menu on PC and Quest.
- **Getaway rides (`test/server-test-7.mjs`):** hopping in, seats, 3 passengers max, cops vs civilians, passengers not hit by their own car, driver getting out and back in, passengers getting out, knocked-out passengers leaving, and escaping prison together in the van. Also tested live: a desktop driver with a VR passenger who stays locked to the seat while the car moves, shoots from the car, and is seen in the seat by the driver.
- **Prison (77 more checks, `test/server-test-6.mjs`):** wanted levels up to 5, NPC cops cuffing you at 3 stars and resisting arrest, SWAT at 4-5, no shooting at 1 star, police SUVs, prison vs holding cell, the cutscene freezing you and taking weapons, skipping it, waking in your own cell, separate cells for friends, schedule + lockdown doors, guards chasing and catching, noises, camera alarms, looped cameras, the electric fence, escape progress shared between players, and every step of all five escape routes (including a real basketball throw scoring), then being caught again.
- **Server (about 89 automated checks with real WebSocket clients, all passing):** room creation (6-character codes), joining by code (case-insensitive), wrong-code and room-full (9th player) errors, 8 players in one room, position sync, server hit detection with headshots and body shots, ammo tracking, fire-rate cheat blocked, fake-origin and wrong-weapon cheats blocked, bullets blocked by walls, eliminations, kill feed, scores, 5-second respawn, pickups (range-checked, disappear for everyone), reload timing, weapon switching, reconnect with the same player and score, public quick match, Team Deathmatch 4 v 4 split, rocket projectile + splash damage, match ending at the kill limit and auto-restarting, NPCs walking, robbing a store (progress, cash payout, store closing), wanted stars, cops spawning and shooting, NPC hit detection and eliminations, bounty, stars clearing on death, NPC traffic and hijacking, and the Cop/Civilian roles (cop spawns at the station, police cars and siren, cops can't rob, a nearby cop blocks robberies, robbery alerts, police dispatch cars driving the roads, donut-shop cops, arrests with a double bounty, no arresting innocent players, switching roles). Run them with `npm start` in one window and `npm test` in another.
- **Desktop in Chrome (two real browser windows playing together):** menus, create room, invite link, join, WASD movement, jumping, shooting a friend until eliminated with server-confirmed headshots, kill feed, death screen, respawn, scoreboard, reload, pickup with E, customization preview, team name tags, reconnecting after a dropped connection, robbing the GUN SHOP through the front door (clerk hands up, progress bar, cash, wanted stars) and cops arriving and taking down the robber.
- **Cop vs Civilian in two browser windows and in emulated VR:** choosing Cop on the menu, spawning at the station, driving a police car with the siren and flashing lights, a Civilian robbing the GUN SHOP, the cop seeing the alert and the red star badge, the arrest prompt and arresting (E on desktop, grip in VR), the VR menu role button, and switching role from the pause menu.
- **VR on an emulated Meta Quest 3** (Meta's official WebXR emulator, IWER): entering VR, both controllers detected, Gorilla movement (hands hold you up, pushing back moves you forward, shoving down lifts you, letting go mid-push launches you), snap turn, trigger shooting, A reload, Y menu with scoreboard, grip-to-grab pickups, other players seeing you as a VR player.
- **Arrest + prison in the browser and emulated Quest 3:** robbing to 4 stars, a cop player arresting you, the whole cutscene (screenshots of every scene), skipping with SPACE and with B in VR, VR back seat ride (head locked to the seat), waking in the cell, walking out, talking to inmates, basketball, hold-E and hold-grip interactions, guards catching you, camera alarms.
- **Performance:** city about 35-50 draw calls and 60,000 triangles; prison about 65-100 draw calls and 17,000 triangles (only one of them is drawn at a time). Well inside Quest 3 limits.

**Not yet tested (I don't have a physical headset or a second real device):**
- How the Gorilla movement *feels* on a real Quest 3 at full frame rate. The **Arm strength** setting is there to tune it.
- A measured frame rate on the actual headset (the numbers above suggest 72+ FPS, but confirm with Settings → Show FPS on desktop and by feel in VR).
- Voice chat between two real devices. The code is complete, but some home/school networks block direct peer-to-peer audio. If voice doesn't connect for a friend, a TURN relay server fixes it: add an environment variable in Render named `ICE_SERVERS` with your TURN server details (JSON list).
- Real internet latency between distant players (the game uses interpolation and lag compensation to handle it).
- **No final public link yet:** I can't create accounts on GitHub or Render for you, so step 3 above gives you your link in about 15 minutes.

---

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| ENTER VR is greyed out | You must open the **https://** Render link (not localhost) in the Meta Quest Browser. |
| "Connecting..." forever / page takes a minute | The free server was asleep. Wait about 1 minute and refresh. |
| No sound on Quest | Tap/click anything once; browsers only allow sound after you interact. |
| Friend can't join | Check the 6-character code. Codes never use 0, O, 1 or I. Rooms close when everyone leaves. |
| NPCs freeze / pickups stop working for a few seconds | Your connection to the server stalled. The game now detects this within about 4 seconds and reconnects by itself (you'll see "Reconnecting..."). If it happens a lot, the free tunnel is the weak link: the Render setup (section 3) is much more stable. |
| Something looks broken | Check the `npm start` window: errors from players' browsers now show up there as `[client error]`. Screenshot it and send it over. |
| Movement feels too weak/strong | Settings → Arm strength. Or switch VR movement to "Arms + stick". |
| Feeling motion sick | Turn on Comfort vignette, use Snap turning, try "Joystick" mode. |
| `npm` is not recognized | Node.js isn't installed, or close and reopen the Command Prompt after installing it. |
