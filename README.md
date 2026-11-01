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
| Dive | F | X or RT |
| Interact / possess | E | Y |
| Scream for help | T | LB |
| Pee | Q | RB |
| Death ledger | Tab | Back |
| Ghost: rise / sink | Space or R / Shift or V | A or D-pad up / B or D-pad down |

## What's in this build

- Smallville: park with a giant oak treehouse, water tower with a diving board, Duke's Garage, the diner, Hoffman Farm with an electric fence and a hay hoist, Whisper Woods, houses and a railroad.
- Ghost mode with scythe vision: read anyone's file (age, job, scheduled death, insurance, net worth, afterlife, allergies) and possess them. Taking someone who isn't due angers God.
- Jobs matter: only a Farmhand can work the hay hoist, and only an allergic body dies from the peanut butter cookies.
- 13 deaths: Treehouse Tumble, Antifreeze Cocktail, Shocking Behavior, Pancake Mode, Water Tower Dive, Forest Fungus, Last Train Home, Faceplant, Edge of the World, Peanut Panic, Resisting Arrest, Don't Tase Me Bro, Baled.
- Physical health (Feeble, Normal, Athlete) decides run speed and which moves a body can do; mental health is shown on the file.
- The barn is locked unless you're a Farmhand. Non-cops get thrown out of the police station, and keep coming back at your peril.
- Medium falls break your legs: crawl, or scream for help (T / LB) and a passerby calls 911.
- Ragdoll physics, insurance claim cards with payouts, a 1,000-slot death ledger saved in the browser.

## Tech

Three.js for rendering, Rapier (WASM) for physics and ragdolls, Web Audio API for all sound, Vite + TypeScript for the build. Deployed to GitHub Pages by `.github/workflows/deploy.yml`.

## Code map

- `src/game.ts`: game loop, modes (ghost, play, dying, claim), death triggers
- `src/player.ts`: platformer controller and moveset
- `src/character.ts`: procedural voxel people and animation
- `src/ragdoll.ts`: jointed physics ragdolls
- `src/town.ts`, `src/voxel.ts`: town generator, voxel mesher with ambient occlusion
- `src/props.ts`: train, hay bale, signs, hazards
- `src/npc.ts`, `src/deaths.ts`: townspeople, their files, the death list and save data
- `src/audio.ts`: synthesized sound effects and the chiptune sequencer
- `src/ui.ts`: HUD, scythe vision panel, claim card, ledger
