# Prop kit

Detailed voxel props (trees, tents, fences, street clutter) built in code by `src/kit/`, the same kit that builds the buildings (see [building-kit.md](building-kit.md)). Open `/props.html` on the dev server to see every model with its triangle count (`?only=tentA:d9c8a0` for one prop up close, `?still=1` for headless shots).

## The look

Chunky voxel forms whose detail lives mostly in paint, like a hand-made voxel model:

- **Foliage** is a cluster of overlapping painted cubes (`puff()`): a dark, ragged underside band, sparse light specks on the top face and upper sides, nibbled top corners. Puffs are drawn bottom-up, so each one's dark underside lands on the tops below it.
- **Bark, canvas, wood** get patterns, not geometry: birch dashes, rough-bark grooves, canvas seams and fabric bands, board seams.
- Paint is free at runtime. The greedy mesher merges neighbouring cells of the same value, and per-cell brightness noise is added in the shader, so a big flat face stays a few quads. Keep speck rates low (a few percent) so faces still merge.

Use the shared tones in `SHADES` (birch, oak, pine, palm, acacia, hedge, canvas) or `shadeOf(hex)` so new props match.

## Placing props

### From map build code (voxel maps)

Most maps build into a `VoxelWorld`. Write the prop's collision shape as invisible ghost blocks, then queue the prop:

```ts
w.fill(x, G, z, x, G + h - 1, z, B.GhostWood);   // trunk: collides, never draws
// ... canopy cells as B.GhostLeaf, anything else as B.GhostProp
w.prop(`tree:${h}:${r}:0`, x + 0.5, G, z + 0.5); // kind, world x/y/z, rotY, scale
```

`game.ts` (`placeWorldProps`) instances every queued prop after the map build. Ghost blocks (`HIDDEN` in voxel.ts) keep collision, nav, standing on things and deaths exactly as they were, and their palette colors are what the minimap shows. If you replace existing blocks, **keep every `rng()` call in the same order**, or the rest of the map lays out differently.

`townkit.ts` already does this for `tree`, `pine`, `lamp`, `hydrant`, `bench`, `trashCan`, `mailbox` and `fenceLine` (white, wood, metal, black, hedge and orange fences), so Smallville code that calls them gets detailed props for free.

### With a StreetKit (kit maps)

```ts
kit.prop('tentA:e0703a', x, y, z, rotY);           // collider from the model's `half`
kit.prop('fence:picket:1', x, y, z, 0, { collide: false });
kit.finish();
```

Props are instanced per kind per chunk (`propChunk`, default 48 blocks). Detailed models get a half-resolution far mesh past `propLod` blocks (default 60). Kinds with only one or two copies in a chunk are merged into one static mesh, so one-off models (each cactus is different) do not cost a draw call each.

## Kinds

Fixed street props: `lamp bench planter pottedTree cafeTable umbrellaTable bin bollard hydrant crates barrel flowerPot mailbox newsStand signPost flag rope`.

Parameterized families (`head:arg:arg`). Each distinct string is built once and cached.

| Kind | Cell size | What |
|---|---|---|
| `tree:h:r:leaf` | 1/4 block | Broadleaf matching `townkit.tree()`: trunk `h`, canopy radius `r`. `leaf` 0 = birch (white bark, light green), 1 = oak |
| `pine:h` | 1/4 | Conifer matching `townkit.pine()` |
| `palm:h:lean` | 1/4 | Leaning palm with fronds and coconuts (beach `palm()`) |
| `acacia:h:r:dx:dz` | 1/4 | Flat-topped savanna tree leaning toward (dx, dz) |
| `cactus:h:arms` | 1/4 | Arms from `cactusArms([{ axis, sign, y, len }])`, `-` for none |
| `bush:s` | 1/4 | Round shrub, `s` blocks wide |
| `tentA:hex` | 1/8 | Ridge tent, 7 x 6 blocks, 4 tall, door on -z. Canvas color as 6 hex digits |
| `beachUmbrella:hex` | 1/8 | Pole plus 8-gore canopy with a scalloped valance |
| `campfire` | 1/8 | Stone ring, crossed charred logs, embers |
| `picnicTable` | 1/8 | 5 x 4 blocks: plank top and two benches |
| `fence:style:h` | 1/8 | One-block segment along x (rotate a quarter turn for z). Styles `picket rail iron chain hedge barrier`, `h` 1 or 2 |

## Adding a prop

1. Write a builder `(args: string[]) => PropModel` in `nature.ts`, `camp.ts` or `fences.ts` (or a new file) using `make(sx, sy, sz, half, draw, size)`. The origin is the bottom center of the grid. `size` is the world size of one cell: `DV` (1/8 block) for small detailed props, `DV * 2` for big chunky ones like trees.
2. Draw with `g.box`, `cyl`, `blob`, `line`, `puff` and paint functions (`birchBark`, `roughBark`, `scatter`).
3. Register it in that file's `*_BUILDERS` map and add the kind to its type.
4. Add it to `ROWS` in `src/kit/propdemo.ts` and check it on `/props.html`. Aim for a few thousand triangles at most for anything placed by the hundred.

## Painted blocks

Blocks that stay plain voxels get the same treatment in the voxel shader (`voxelMaterial()` in voxel.ts): 4 x 4 painted sub-cells per block face, no extra geometry. Styles are set per block id with `blockDetail(Detail.Foliage, ids...)`: `Foliage` (light top specks, dark ragged rim along the bottom of sides), `Grass`, `Bark`, `Stone`, `Soil` and `Plank`. Maps register their own block ids (see `defineWildBlocks` and `defineBeachBlocks`).
