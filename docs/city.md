# Big Apple City

The city map lives in `src/maps/city/` and plugs into the multi-map interface (`src/maps/types.ts`) as `CITY_MAP`.
It is 512 x 64 x 640 voxels (x, y, z), street level y = 12, water level y = 10.

## Layout (x west to east, z north to south)

| Place | Where | Notes |
|---|---|---|
| Airport lot | x 96..415, z 8..231 | Built by the airport module (`src/places/airport.ts`). A placeholder runway and terminal stand in until it lands. Access road centered on z = 240 |
| Street grid | avenues at x 72, 138, 204, 270, 336, 402, 458; streets at z 258, 304, 350, 396, 442, 488, 534 | 36 blocks of walk-ups, brownstones, shops and midtown towers |
| Central Park | blocks (2..3, 1..2) | Pond, fountain, bandshell, groves, benches, the pigeon lady, an empty statue plinth |
| Mortalis Mutual HQ | block (3, 3) | The tallest tower, window washer rig on its north face, scissors in the lobby |
| Construction site | blocks (5, 1..2) | Steel skeleton with the lunch beam, wrecking ball crane, cement mixer, porta potty under a tower crane, food truck |
| Little Italy | blocks (0..1, 4..5) | Don Calzone's Pizzeria (doorman, back room, Big Tony), Italian shops |
| Hospital lot | x 360..425, z 450..499 | Built by the hospital module (`src/places/hospital/`). Placeholder until then |
| Rail yard | x 16..58 | Four tracks, island platform, commuter train on track 31, travel trains on track 42 |
| Subway | under street 350 | 350th St station with stairs at x 150, sax player, third rail, a train every ~30 s |
| Harbor | z 552+ | Pier 13 (the mob's), ferry terminal, container pier, Lady Liability on her island, harbor patrol boat |

Travel stops: `city:bus` (avenue 138), `city:train` (rail yard platform), `city:harbor` (ferry pier), `city:airport` (from the airport module).

## Deaths (`src/maps/city/deaths.ts`, logic in `logic.ts`)

| Death | How |
|---|---|
| Manhole Surprise | Hold R to text and walk into the open manhole outside Sal's Deli. The worker yanks back anyone who is looking where they're going |
| Third Rail | Tip the sax player $20 so he goes to lunch, drop your phone at the platform edge, climb down, reach for it |
| Mind the Gap | Stand in the subway tunnel when the train comes (tip the sax player first) |
| Rush Hour | Stand on track 31 in the rail yard. Good samaritans sprint off the platform to tackle you; dive, long jump, slide, flip or ground pound as they reach you to juke them |
| Window Washer | Take the scissors from the Mortalis lobby, ride Lenny's rig to the top, toss his squeegee so he leaves, cut both cables |
| Sleep With the Fishes | Overhear the password from the delivery guy at the bus stop, say it to the doorman, insult Big Tony's mother, then walk off Pier 13 in cement shoes while the harbor patrol boat is away |
| Mob Hit by Mistake | Same way in, but put on Vinnie's jacket from the coat rack and spill marinara on the FBI agent blocking the back room |
| Wrecking Ball | As a Construction Worker, start the crane. Spike the foreman's coffee at the food truck so he stops yelling STOP. Ride the ball into the wall |
| Cement Statue | Get up to the mixer chute (double jump) and look in. Your statue appears on the Central Park plinth (and is saved for Smallville's park) |
| Parade Balloon | Grab the loose rope of the dog balloon on avenue 336 and hold Jump through two gusts. Only an Athlete can hang on to the Mortalis spire |
| Pigeon Lady's Army | Steal her breadcrumbs |
| Mystery Meat | Buy six hot dogs from the cart outside the park |
| Lunch on the Beam | Climb the scaffold to the top of the steel skeleton and eat lunch on the beam |
| Porta Potty Fling | Use the porta potty at the site |

State the player changes (a tipped sax player, a swinging crane, the password) persists across bodies. Per-body state (jacket, scissors, hot dogs eaten, cement shoes) resets on each possession.

Cement statues are saved to `localStorage['cestlavie-statues-v1']` as `{ map, app, name }` entries, one for `city` and one for `smallville`, so Smallville's park can show them too.

## NPCs

`build()` returns `life`, a `LifeMap` for the NPC life system: every shop, home, office lobby, the park, piers and transit stops as places, 20 city job profiles (Mobster, Cabbie, Window Washer, Tourist...), named residents (Lenny, Sal, Smooth Eddie, Vinnie the Rat, Big Moe), and a nav cost that keeps people on sidewalks and crosswalks.

## Composing sub-places

`src/maps/compose.ts` has `composeRuntimes(parts)` to merge several `MapRuntime`s (interactables are routed by id, so prefix them, e.g. `airport:belt`) and `mergePart(build, { areas, stops, roads })`.

## Preview harness

`npm run dev`, then open `/dev/city.html` for a free camera view of the city (`?x=&y=&z=&lx=&ly=&lz=` set the camera and target, `?life=1` adds townsfolk). The page exposes `possess(job, tier)`, `tp(x, y, z)`, `E(id)`, `run(seconds)`, `kills` and `log` for scripted playtests.
