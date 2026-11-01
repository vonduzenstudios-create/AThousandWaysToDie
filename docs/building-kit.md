# Building and street-detail kit

`src/kit/` builds detailed voxel buildings, paving and street props in code, at 8 detail voxels per world block (1 voxel = 1/8 block). `src/render/post.ts` holds the shared render upgrades (warm lighting, sky reflections, bloom, color grade, optional GTAO). Props (trees, tents, fences, street clutter) have their own guide: [prop-kit.md](prop-kit.md). Open `/buildings.html` on the dev server for a showcase street; `?quality=low|medium|high` picks the post-processing level.

## Quick start

```ts
import { StreetKit, PAL } from './kit';

const kit = new StreetKit({ parent: scene, physics }); // physics is optional (previews)

// One building. x/z = world min corner of the footprint, y = ground height (G).
// face = which way the front (door / shopfront) looks: n (-z), s (+z), e (+x), w (-x).
// For n/s the footprint is w (x) by d (z); for e/w it is d (x) by w (z).
const bakery = kit.building({ x: 100, z: 200, y: G, face: 's', w: 10, d: 8, floors: 3, sign: 'BAKERY' });
bakery.doors;   // world positions just outside each door (NPC entrances)
bakery.bounds;  // world Box3

// A whole terrace of attached buildings, varied by seed (party walls handled for you).
kit.row({ x: 60, z: 180, y: G, face: 's', length: 80, depth: 10, preset: 'euro', seed: 7,
          floors: [2, 4], signs: ['CAFE', 'BOOKS'] });

// Paving over a world rectangle (patterns line up across rectangles).
kit.street({ x0: 60, z0: 190, x1: 140, z1: 200, y: G, kind: 'cobble' });        // also 'sidewalk' | 'pavers' | 'plaza'
kit.street({ x0: 60, z0: 188, x1: 140, z1: 190, y: G, kind: 'sidewalk', curb: ['s'] });

// Instanced props (one draw call per kind per 48-block chunk). rotY in radians.
kit.prop('lamp', 70, G, 192);
kit.bunting(new THREE.Vector3(60, G + 9, 190), new THREE.Vector3(60, G + 9, 200));
kit.finish();          // call once after placing props (again if you add more)
await kit.ready();     // optional: resolves when every building mesh is in the scene
```

Buildings are laid out on the main thread (about 20 ms each, colliders are created right away) and meshed in a worker pool, so they pop in a moment later. Pass `sync: true` to `StreetKit` to mesh on the main thread.

## Building options (`BuildingSpec`)

Only `w`, `d` (world blocks) and `floors` (3 blocks per storey) are required. Everything else is picked from `preset` + `seed`, so the same seed always gives the same building.

| Option | Values |
|---|---|
| `preset` | `'euro'` (pastel stucco, shutters, flower boxes, balconies, ivy, awnings), `'mainstreet'` (American brick downtown, flat roof, cornice, shopfront), `'house'` (clapboard, gable roof, porch hood, shutters), `'modern'` (concrete, ribbon windows, rooftop units) |
| `wallStyle`, `groundStyle` | `'stucco' \| 'brick' \| 'stone' \| 'clapboard' \| 'concrete'` |
| `wall`, `groundWall`, `trim`, `roofColor` | hex colors (see `PAL`) |
| `shutter` | hex, or `null` for none |
| `roof` | `'gable'` (ridge along the facade), `'gableSide'` (gable end faces the street), `'flat'` (parapet, AC units, vents, skylights) |
| `ground` | `'shop'` (display windows, sign board, awning, lantern), `'door'` (rusticated base, arched door, barred windows), `'house'` (front door with porch hood), `'blank'` |
| `sign` | shop sign text (A-Z, 0-9, a few symbols), `signBoard` its board color |
| `awning` | `[stripeA, stripeB]` or `false` |
| `windowTop` | `'flat' \| 'pediment' \| 'arch' \| 'none'` |
| `flowerBoxes`, `balconies`, `ivy` | 0..1 amounts |
| `party` | `{ left, right }` sides touching a neighbour, as seen from the street |
| `sideWindows`, `doorAt` (0..1 along facade), `chimney` | |

Colliders: one box for the body, convex hulls for gable roofs, and boxes for balconies and awnings, so players can land on them.

## Making your own pieces

For one-off landmarks (hospital, terminal, prison block), draw straight into a `DetailGrid` and mesh it:

```ts
import { DetailGrid, vox, meshGrid, kitMaterial, PAL } from './kit';
const g = new DetailGrid(64, 48, 64);
g.box(0, 0, 0, 63, 40, 63, vox(PAL.white, { jitter: 0.06 }));
g.box(10, 8, 0, 20, 20, 0, vox(PAL.glass, { glass: true }));   // glossy cells reflect the sky
g.set(5, 30, 0, vox(0xffd890, { emissive: true }));             // glowing cells
scene.add(new THREE.Mesh(meshGrid(g), kitMaterial()));          // 1 cell = 1/8 block
```

`vox(color, { jitter, emissive, glass })` packs a cell. Per-voxel color noise is done in the shader, so large flat areas stay a few big quads after greedy meshing. `buildBuilding(spec)` returns the raw grid if you want to stamp extras on a generated building before meshing it yourself.

## Rendering upgrades (`src/render/post.ts`)

```ts
import { PostFX, warmLighting } from './render/post';
warmLighting(scene, renderer, { sun, hemi });   // golden sun, cool fill, sky reflections, shadow bias for voxels
const post = new PostFX(renderer, scene, camera); // quality from ?quality=, saved choice, or device
post.render();                                     // instead of renderer.render(scene, camera)
post.setSize(w, h);                                // on resize
```

Low = direct render with neutral tone mapping. Medium = MSAA render target, bloom on emissive lamps and windows, warm color grade and vignette. High = medium plus GTAO screen-space ambient occlusion.

## Performance notes

- Greedy meshing with baked vertex AO: a typical 10 x 12 block, 4-storey building is about 25-35k triangles at full detail, 8k at LOD 1 and 2k at LOD 2 (LODs switch at 55 and 120 blocks).
- Buildings are solid inside, so only the outside surface makes faces. Enterable buildings should build their interior separately (or leave a hollow with `g.clear`).
- Props are instanced and chunked for frustum culling; bunting flags are tinted per instance.
