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
| Scream for help | T | LB |
| Pee | Q | RB |
| Death ledger | Tab | Back |
| Ghost: rise / sink | Space or R / Shift or V | A or D-pad up / B or D-pad down |

## What's in this build

- Smallville, a 512 x 512 town: Main Street shops (diner, laundromat, pharmacy, bakery, bank), a bar and cinema, the library, town hall with the DMV and the bus stop, the train station, police and fire stations, Duke's Garage, the Gas-N-Grub, Uncle Boomer's Fireworks, the church with its bell tower and BBQ, Honest Al's Used Cars, the school and gym, a trailer park, the cemetery, suburbs with 12 Maple St (Gary's old house), the water tower, a construction site, Hoffman Farm (barn, hay hoist, electric fence, silo, bull pen, mule, cornfield), the quarry, Whisper Woods and the park with the giant oak and the goose pond. Lots are reserved for the full grocery store and hospital.
- 21 hometown deaths on top of the originals, in `src/hometown.ts`: Bull Launch, For Whom the Bell Tolls, Bathtub Toaster, Forkin' Toast, Shallow End, Piano Recital, Goose Mauling, Grain Expectations, Kicked by a Mule, Trampoline Launch, Rock Bottom, Sleeps With the Fishes, Wacky Inflatable Exit, Died in Line, Overdue, Spin Cycle, Grand Finale, Hot Dog Contest, Gas Pump Fireball, Gas Station Sushi and Nail Gun Demo.
- Ghost mode with scythe vision: read anyone's file (age, job, scheduled death, insurance, net worth, afterlife, allergies) and possess them. Taking someone who isn't due angers God.
- Jobs matter: only a Farmhand can work the hay hoist, and only an allergic body dies from the peanut butter cookies.
- 15 deaths: Treehouse Tumble, Antifreeze Cocktail, Shocking Behavior, Pancake Mode, Water Tower Dive, Forest Fungus, Last Train Home, Faceplant, Edge of the World, Peanut Panic, Resisting Arrest, Don't Tase Me Bro, Baled, Picked the Wrong Fight, Beaten by a Senior.
- Physical health (Feeble, Normal, Athlete) decides run speed and which moves a body can do; mental health is shown on the file.
- The barn is locked unless you're a Farmhand. Non-cops get thrown out of the police station, and keep coming back at your peril.
- Medium falls break your legs: crawl, or scream for help (T / LB) and a passerby calls 911.
- Everyone carries a wallet (cash plus a bank card with a PIN and balance). Rifle your own wallet with skill 1, or withdraw from the card at the downtown ATMs.
- A 1–5 skill bar: slot 1 is the wallet, and slots 2–5 unlock from the body's job, physical health, mental health and afterlife (Tase Self, Laughing Gas, Adrenaline, Morbid Curiosity, Pray, Hellfire Fart and more).
- Living townsfolk: everyone has a home, a job and a daily routine on an in-game clock. They walk to work, order at the diner, sleep at night, chat and gossip about deaths, gawk at accidents, and you can talk to them (E). Family and friends recognize the body you are wearing.
- Fist fights: F punches, punched people fight back (cops nearby join in), and the HUD health bar decides how long you last.
- Ragdoll physics, insurance claim cards with payouts, a 1,000-slot death ledger saved in the browser.

## Tech

Three.js for rendering, Rapier (WASM) for physics and ragdolls, Web Audio API for all sound, Vite + TypeScript for the build. Deployed to GitHub Pages by `.github/workflows/deploy.yml`.

## Code map

- `src/game.ts`: game loop, modes (ghost, play, dying, claim), death triggers
- `src/player.ts`: platformer controller and moveset
- `src/character.ts`: procedural voxel people and animation
- `src/ragdoll.ts`: jointed physics ragdolls
- `src/town.ts`, `src/townkit.ts`, `src/voxel.ts`: Smallville layout (places, transit stops, roads, signs, death spots), building and street kit, voxel mesher with ambient occlusion and merged colliders
- `src/hometown.ts`: the expanded town's deaths, animals and moving props
- `src/props.ts`: train, hay bale, signs, hazards
- `src/npc.ts`, `src/deaths.ts`: townspeople, their files, the death list and save data
- `src/life/`: NPC life: daily schedules, shops, chatting, gossip, talking to townsfolk (see `docs/npc-life.md`)
- `src/skills.ts`: skill definitions and the per-body skill bar
- `src/economy.ts`: ATMs and card withdrawals
- `src/combat.ts`: punching, angry NPCs, player health
- `src/audio.ts`: synthesized sound effects and the chiptune sequencer
- `src/ui.ts`: HUD, scythe vision panel, claim card, ledger
