# The Wilds

A 640 x 640 wilderness map in `src/maps/wilderness/`. It runs from snowy pine forest in the north, past a river, a waterfall gorge and a swamp, into an African-style savanna in the south east and a desert with a nuclear test site and a crop circle in the east. Everything (terrain, buildings, animals, vehicles, signs) is generated in code.

## Files

- `terrain.ts`: height field, biomes, rivers, lakes, roads and building pads. Block ids 180-214 are registered with `defineBlock`.
- `structures.ts`: every building and set piece (train depot, ranger station, campground, bear cave, lumber camp, gator show, bungee bridge, safari lodge, airstrip, Pride Rock, gas station, conspiracy trailer, crop circle, Doom Town, beaver dam, oasis), plus scattered trees, cacti and rocks. Returns named `spots` the runtime uses.
- `kitbuild.ts`: the depot, ranger station, lodge gift shop and kitchen, diner, airstrip terminal and Doom Town houses, drawn with the shared building kit (`docs/building-kit.md`), plus the paving, lamps, benches, bunting and props around them. The voxel world only gets a slab under each building. `blockFootprints` marks the footprints as roofs in the floor map so NPCs walk around them. Shops serve from walk-up counters out front.
- `roads.ts`: smooth driving ribbons laid over the carved roads. They follow an upper envelope of the road's ground with the grade capped at 15%, and become causeways over water. Each ribbon has a trimesh collider, and traffic and the GPS follow the same profile. The Wilds keep traffic light (`MapBuild.traffic`): 3 cars at most, plus pickups and jeeps parked at the ranger station, campground, lodge, gas station and bunker.
- `models.ts`: voxel-style animals (lion, elephant, giraffe, zebra, gazelle, rhino, hippo, bear, camel, vulture, monkey, roadrunner, gator, beaver, piranha), the jeep, the balloon, the UFO, the ACME rocket and props.
- `animals.ts`: `Animal` (wander, flee, charge, mood meter 0-3 shown as `?`, `!`, `!!` over the head) and `Actor` (scripted humans who save you, or don't).
- `scenery.ts`: water surfaces and waterfalls, savanna tall grass (you can hide in it by crouching), clouds.
- `runtime.ts`: all the death puzzles, savers, items and minigames.
- `index.ts`: the `WILDERNESS` MapDef, the death list, travel stops (bus, train, airstrip) and NPC life data (23 places, 14 new jobs).

## Deaths

Most deaths need a body with the right traits, an item or two, and a way past the person who would save you. Normal mental state refuses the silliest ones ("Nope.").

| Id | Where | How |
| --- | --- | --- |
| bear | Bear cave | Steal a picnic basket, take honey from the beehive tree, knock on the cave. Ranger Rick's flare scares the bear off, so wait for his lunch, blow the campground air horn, or steal the flare. |
| bungee | Thunder Ridge bridge | Buy a jump. Swap Brad's 60 m cord for the 300 m spool while he's busy. |
| falls | Rapids dock | Athletes only. Take a barrel from the sawmill, launch, steer into the middle lane and dodge the guide's rope (crouch). |
| piranha | Swamp pool | Get a steak from the lodge kitchen, put it in your pants, swim. |
| gator | Gator show | Athletes only. Wear the spare jumpsuit so the host can't grab your belt, win the wrestling timing bar, then taunt (T). |
| lions | Pride Rock | Wear the meat suit from the gift shop. The guide honks the lions away unless you take his keys, steal the jeep, or wait for his headcount. Feeble bodies fill the lions' mood twice as fast. |
| hippo | Hippo crossing | Pet the hippo three times while it yawns. |
| elephant | Watering hole | Steal the baby's peanuts while the mother can see you (tall grass hides you). |
| rhino | Game drive | Paint a target on the jeep, park it side-on near the rhinos, honk. Chains into the hippo. |
| vulture | Balloon pad | Buy a balloon ride, unclip the propane, vent low over the dead tree and throw your sandwich. |
| abduction | Crop circle | Tinfoil hat from the trailer, set the camera timer, lie down in the circle. Without the photo it's just a faceplant. |
| quicksand | Desert | Walk in. Jumping makes it worse. Humphrey the camel pulls you out if he's close. |
| rocket | Mesa | Buy the ACME kit at the gas station, sit on it, light the fuse. The roadrunner does the rest. |
| cactus | Desert | Hug the friendly cactus three times. |
| nuke / groundzero | Doom Town | Hide in the fridge for the test (every 4 minutes, or a Scientist presses the bunker button). Standing outside nearby counts as ground zero. |
| mirage | Dune Sea | Walk into the dunes until the heat gets you. |
| beaver | Beaver dam | Ground pound the dam three times. |
| logroll | Log pond | Lose the log rolling minigame (A and D to balance). |

## Travel

The map has a bus stop by the ranger station, a train depot on the south edge and an airstrip by the safari lodge. They are listed in `build().stops` for the transit system.
