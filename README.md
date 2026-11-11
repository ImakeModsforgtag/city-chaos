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
| **Grip (either hand)** | Grab a weapon, ammo or health near your hand. Grab a car to hijack it. As a Cop, grab a wanted player to arrest them. In prison: **hold grip** on objects, grip inmates to talk, grab and throw the basketball |
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
| E | Pick up · hijack a car / get out · arrest (Cop) · talk to inmates · **hold E** to use prison objects |
| L | Police car siren and lights (Cop) |
| Space | Jump (hold against a ledge to climb up) |
| 1 / 2 / 3, mouse wheel, Q | Switch weapon |
| Tab | Scoreboard |
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
2. **Aim any gun at the shopkeeper** from close range (within about 6m) and keep aiming. In VR, just point your gun at them.
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
│   │   ├── weapons.js      weapon stats
│   │   └── constants.js    health, hitboxes, modes, cosmetics list
│   ├── js/main.js          game flow + frame loop
│   ├── js/engine/          3D engine: renderer + sky, city.js (per-block batches + LOD), cityDecor.js (facades, roads,
│   │                       street furniture, landmarks), cityAnim.js (traffic lights, fans, flags, signs), effects
│   ├── js/vr/              VR controls (vrInput.js) + in-headset UI (vrUI.js)
│   ├── js/physics/         Gorilla arm locomotion, walking, VR comfort movement
│   ├── js/weapons/         weapon models, firing/reload system, pickups
│   ├── js/net/             networking (network.js) + voice chat (voice.js)
│   ├── js/player/          avatars, other players (interpolation), NPC visuals
│   ├── js/ui/              menus, HUD, settings, desktop input
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
