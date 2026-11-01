# Characters

Every person in the game is a detailed voxel body generated in code (`src/chars/`). The look is
modeled on the style references Matthew shared on 2026-11-01: about 67 voxels tall, a head a bit
under a quarter of the height, long legs, chunky fists and boots, faces with eye whites, irises,
brows, a raised nose and ears, and layered clothes.

## Files

- `spec.ts`: `PersonSpec` (plain data) and the generators: `specForJob`, `specFromFile` (from a
  victim's file, with physical/mental stats), `specFromAppearance` (old box-person Appearances).
  Job looks live in `JOB_LOOKS`.
- `head.ts`: head, face, expressions, facial hair, hair styles, hats, glasses, head extras.
- `body.ts`: torso and outfits, skirts and coat tails, arms and hands, legs and shoes, held items.
- `build.ts`: `dims()` proportions and `buildVoxelBody()` assembly.
- `grid.ts`: sparse `VoxelGrid` painter, meshed with the building kit's greedy mesher, and
  `charMaterial()` (per-person Lambert material with per-voxel noise in the shader).

## Rig

Six parts (`head`, `torso`, `armL/R`, `legL/R`), each a pivot plus a mesh centered on its
collision box, so `Ragdoll` works unchanged. Arms and legs also have elbow and knee hinges
(`VoxelBody.joints`); `Character.animate` bends them for walking, running, crouching, swimming and
so on, and `Character.bend()` sets them directly (seated drivers). In a ragdoll the joints keep
whatever bend they had.

Hats, glasses and held items are separate meshes in `accessories`; anything they cover is cut
out of the head so they never z-fight.

## Dev sheet

`/characters.html` (dev server): Jobs, Crowd, Showcase and Close-up views, plus
`?view=hair|hats|faces|outfits` to see every option on one person, `?cam=face` for close-ups,
`?pose=walk` for a mid-stride frame and `?bg=6f9fe6` for a background color.

About 3,700 triangles per person on average.
