# C'est La Vie

A browser 3D voxel comedy platformer. Gary died so stupidly that his life insurance was voided, screamed at Death about it, and Death handed him the scythe: "Fine. You do it then." Now he jumps into other people's bodies and finds ridiculous ways for them to die. There are 1,000 deaths to find.

Everything in the game (voxel art, characters, textures, sound effects and music) is generated in code. There are no image or audio files.

## Play

```bash
npm install
npm run dev
```

Then open the URL Vite prints. `npm run build` makes a static build in `dist/`.

## Controls

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | WASD | Left stick |
| Sprint | Double-tap and hold W | Click left stick |
| Orbit camera | Hold left mouse | Right stick |
| Steer (camera stays behind) | Hold right mouse | Right stick |
| Walk forward | Hold both mouse buttons | |
| Zoom / first person | Scroll wheel | |
| Jump (tap on landing for double and triple jump) | Space | A |
| Crouch, slide (running), ground pound (in air) | Shift or C | B or LT |
| Long jump | Run + Shift + Space | Run + B + A |
| Backflip | Shift + Space while standing | B + A |
| Side flip | Reverse direction + Space | Reverse + A |
| Wall kick | Space while touching a wall in the air | A |
| Punch | F | X |
| Dive | G | RT |
| Skills | 1–5 (or click the bar) | D-pad up/down to pick, right to use |
| Interact / possess / talk to townsfolk | E | Y |
| Hijack a car / get out | E | Y |
| Drive / reverse, steer | W / S, A / D | Left stick or RT / LT |
| Handbrake, horn | Space, T | A, LB |
| Scream for help | T | LB |
| Pee | Q | RB |
| Death ledger | Tab | Back |
| Ride / hop off a skateboard or bike | E | Y |
| Ollie (board) / bunny hop (bike) | Space | A |
| Kickflip (board, in the air) | G | RT |
| Wheelie (bike, hold) | Shift | B or LT |
| Bike bell | T | LB |
| Ghost: rise / sink | Space or R / Shift or V | A or D-pad up / B or D-pad down |

## What's in this build

- Smallville: park with a giant oak treehouse, water tower with a diving board, Duke's Garage, the diner, Hoffman Farm with an electric fence and a hay hoist, Whisper Woods, houses and a railroad.
- Ghost mode with scythe vision: read anyone's file (age, job, scheduled death, insurance, net worth, afterlife, allergies) and possess them. Taking someone who isn't due angers God.
- Jobs matter: only a Farmhand can work the hay hoist, and only an allergic body dies from the peanut butter cookies.
- 27 deaths: Treehouse Tumble, Antifreeze Cocktail, Shocking Behavior, Pancake Mode, Water Tower Dive, Forest Fungus, Last Train Home, Faceplant, Edge of the World, Peanut Panic, Resisting Arrest, Don't Tase Me Bro, Baled, Picked the Wrong Fight, Beaten by a Senior, Jaywalker, Cliffhanger, No Seatbelt, Tuck and Roll, Beat the Train, Over the Handlebars, Board Meeting, Evel Kneecap, Grind Rail, Act Your Age, Wheelie Bad Idea, Share the Road.
- Skateboards and bicycles lie around town (outside the diner, Duke's Garage, the park, the police station, the farm road and the rail line). Ride them for speed with momentum steering. Hit the Dare Ramp in the open field by the rail line flat out, kickflip off the park kicker, grind the rails, try not to wheelie too long, and watch out for traffic. Feeble bodies should not skateboard.
- Physical health (Feeble, Normal, Athlete) decides run speed and which moves a body can do; mental health is shown on the file.
- The barn is locked unless you're a Farmhand. Non-cops get thrown out of the police station, and keep coming back at your peril.
- Medium falls break your legs: crawl, or scream for help (T / LB) and a passerby calls 911.
- Everyone carries a wallet (cash plus a bank card with a PIN and balance). Rifle your own wallet with skill 1, or withdraw from the card at the downtown ATMs.
- A 1–5 skill bar: slot 1 is the wallet, and slots 2–5 unlock from the body's job, physical health, mental health and afterlife (Tase Self, Laughing Gas, Adrenaline, Morbid Curiosity, Pray, Hellfire Fart and more).
- Living townsfolk: everyone has a home, a job and a daily routine on an in-game clock. They walk to work, order at the diner, sleep at night, chat and gossip about deaths, gawk at accidents, and you can talk to them (E). Family and friends recognize the body you are wearing.
- Fist fights: F punches, punched people fight back (cops nearby join in), and the HUD health bar decides how long you last.
- Traffic on every road: cars follow their lanes, take turns at intersections, brake (unless they're texting) and honk. Walk up to any car and press E to yank the driver out and drive it. Ram traffic, run people over (God notices if they weren't due), drive off the edge of the world or race the train.
- GTA-style radar in the top right that rotates with the camera, draws itself from the voxels on any map, shows cars and landmarks, a speedometer while driving, and in ghost mode every soul colored by whether they're due.
- Anime-style story cutscenes drawn in code: the opening (Gary's turkey-fryer death, the DENIED stamp, and Death's "Fine. You do it then!"), plus a scene from Death on his day off each time 25 deaths in an area opens the next route (bus to downtown, the harbor boats, the airport). Click, Space, E or A advances; Esc or Start twice skips. Add `?cutscene=opening` (or `smallville:25`, `city:25`, `city:50`) to the URL to replay one.
- Ragdoll physics, insurance claim cards with payouts, a 1,000-slot death ledger saved in the browser.

## Tech

Three.js for rendering, Rapier (WASM) for physics and ragdolls, Web Audio API for all sound, Vite + TypeScript for the build. Deployed to GitHub Pages by `.github/workflows/deploy.yml`.

## Code map

- `src/game.ts`: game loop, modes (ghost, play, dying, claim), death triggers
- `src/player.ts`: platformer controller and moveset
- `src/character.ts`: procedural voxel people and animation
- `src/ragdoll.ts`: jointed physics ragdolls
- `src/rides.ts`: skateboards, bicycles, ramps, tricks and their deaths (Player.ride switches the controller to momentum steering)
- `src/town.ts`, `src/voxel.ts`: town generator, voxel mesher with ambient occlusion
- `src/props.ts`: train, hay bale, signs, hazards
- `src/npc.ts`, `src/deaths.ts`: townspeople, their files, the death list and save data
- `src/life/`: NPC life: daily schedules, shops, chatting, gossip, talking to townsfolk (see `docs/npc-life.md`)
- `src/skills.ts`: skill definitions and the per-body skill bar
- `src/economy.ts`: ATMs and card withdrawals
- `src/combat.ts`: punching, angry NPCs, player health
- `src/audio.ts`: synthesized sound effects and the chiptune sequencer
- `src/story/`: cutscene player (`cutscene.ts`), canvas anime art (`art.ts`), synth stings and voices (`sfx.ts`), scripts (`scenes.ts`) and the director that picks and saves scenes (`director.ts`)
- `src/ui.ts`: HUD, scythe vision panel, claim card, ledger
- `src/minimap.ts`: the radar (works on any VoxelWorld)
- `src/vehicles/`: road graph and lanes (`roads.ts`), traffic AI (`traffic.ts`), drivable cars on Rapier's ray-cast vehicle controller (`car.ts`), voxel car models (`carModel.ts`), car sounds, and Smallville's roads and parked cars (`smallville.ts`)
