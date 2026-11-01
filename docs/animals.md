# Animals

Every animal in the game is a detailed voxel model generated in code (`src/animals/`). The look
follows the style reference Matthew shared on 2026-11-01 (a sheet of voxel woodland animals):
dense voxels, patchy hand-shaded fur, expressive faces with glinting eyes and brows, snouts and
teeth, and legs with real knees. The reference is style only; every design here is original.

## Files

- `sculpt.ts`: `Sculpt`, a `VoxelGrid` (from `src/chars/grid.ts`) with shape tools: `blob` (rounded
  ellipsoids and pillows), `limb`/`chain` (tapered limbs, necks, tails, trunks), `tri` (flat fins,
  wings, flukes) and surface decals (`front`, `side`, `top` find the outermost voxel and paint it
  or raise a detail out of it). Paints: `fur` (blocky light/dark clumps), `split` (belly line),
  `stripes`, `spots`.
- `parts.ts`: reusable anatomy: `leg`/`fourLegs` (hip pivot + knee pivot, hooves, paws with claws,
  pads, bird toes, socks), `eyeFront`/`eyeSide` (iris, pupil, glint, sclera, brows, rims), `ear`
  (on its own pivot so it flicks), `teeth`.
- `rig.ts`: the `Rig` interface, `Rigger` (builds parts on pivots and meshes them with the
  building kit's greedy mesher), the template cache (`cached`, `cachedGroup`: each species is
  meshed once and every animal is a clone sharing its geometry and one material per voxel size)
  and `walkCycle` (diagonal leg pairs, lower legs fold back on the forward swing).
- `wild.ts`: the Wilds: lion/lioness, elephant (+ baby), giraffe, zebra, gazelle, rhino, hippo,
  grizzly, camel, vulture, monkey, roadrunner, alligator, beaver, piranha.
- `sea.ts`: the beach: shark, whale, gull, jellyfish, pufferfish, crab, fish, marlin.
- `farm.ts`: Smallville's bull, mule and geese (wrapped to face +x like the farm code expects)
  and the city's pigeons.

## Contract with the maps

Models keep the old box models' sizes, pivot positions, `top` and `len`, and the beach models keep
their named children (`tail`, `jaw`, `wl`/`wr`, `spikes`, `body`), so every scripted death works
unchanged. `src/maps/wilderness/models.ts` and `src/maps/beach/models.ts` re-export the new
models under the old names.

A `Rig` may also carry `knees` (bent by `walkCycle`) and `ears` (flicked by the Wilds' `Animal`).

The asylum's bear is Gerald from Ward B in a bear suit, so it stays a person in a costume.

## Dev sheet

`/animals.html` (dev server) puts every animal on one stage. `?only=bear,lion` shows just those
(a single animal is framed close up), `?yaw=0.7` turns them, `?walk=1` plays the walk cycle and
`?bg=5a8de8` sets the background.

## Adding an animal

Pick a voxel size so the animal is 30 to 60 voxels across its longest dimension, draw the body in
the root part, use `fourLegs` for walkers, put the head on its own part (with a `jaw` part if a
death opens its mouth), give it `fur` with a seed of its own, add it to `ZOO` in `index.ts`, and
check it on the dev sheet.
