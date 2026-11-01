import * as THREE from 'three';
import type { RAPIER } from '../../physics';
import { StreetKit, PAL, type BuildingSpec, type Placement } from '../../kit';
import { PADS, SX, type Terrain } from './terrain';

/**
 * The wilderness buildings drawn with the shared building kit (8 detail voxels per block).
 * The voxel world only gets a floor slab under each one; the kit adds the mesh and colliders
 * at runtime. Footprints are also marked as roofs in the floor map so NPCs path around them.
 */
export interface KitBuilding {
  id: string;
  pad: keyof typeof PADS;
  spec: BuildingSpec & Omit<Placement, 'y'>;
}

const THATCH = 0xc8a24a;
const ADOBE = 0xd9b48a;
const LOG = 0x8a5a36;

export const KIT_BUILDINGS: KitBuilding[] = [
  {
    id: 'depot',
    pad: 'depot',
    spec: { x: 66, z: 590, face: 's', w: 27, d: 10, floors: 2, preset: 'house', seed: 11, wallStyle: 'clapboard', wall: LOG, trim: PAL.trimCream, shutter: PAL.shutterForest, roof: 'gable', roofColor: 0x3f6a3a, ground: 'shop', sign: 'DEPOT', signBoard: 0x23402c, awning: [0x2f7a45, 0xf2ece0], chimney: true },
  },
  {
    id: 'ranger',
    pad: 'ranger',
    spec: { x: 122, z: 551, face: 's', w: 19, d: 14, floors: 2, preset: 'house', seed: 21, wallStyle: 'clapboard', wall: 0x6e4a2b, trim: PAL.trimCream, shutter: PAL.shutterGreen, roof: 'gableSide', roofColor: PAL.shingleBrown, ground: 'shop', sign: 'RANGERS', signBoard: 0x4a3a20, awning: [0x2f5e3b, 0xe9d9b0], chimney: true },
  },
  {
    id: 'giftshop',
    pad: 'lodge',
    spec: { x: 424, z: 542, face: 's', w: 14, d: 14, floors: 2, preset: 'euro', seed: 31, wallStyle: 'stucco', wall: ADOBE, trim: 0xf0e0c0, shutter: PAL.shutterBrown, roof: 'gable', roofColor: THATCH, ground: 'shop', sign: 'GIFTS', signBoard: 0x6a3a1c, awning: [0x6a4a2a, 0xe9d9b0], flowerBoxes: 0.5, balconies: 0, ivy: 0 },
  },
  {
    id: 'kitchen',
    pad: 'lodge',
    spec: { x: 438, z: 542, face: 's', w: 15, d: 14, floors: 2, preset: 'euro', seed: 32, wallStyle: 'stucco', wall: 0xd0a070, trim: 0xf0e0c0, shutter: PAL.shutterBrown, roof: 'gable', roofColor: THATCH, ground: 'shop', sign: 'MBALI LODGE', signBoard: 0x5a1f24, awning: [0xd86a2a, 0xf4e8d0], flowerBoxes: 0.7, balconies: 0.5, ivy: 0.2, chimney: true },
  },
  {
    id: 'diner',
    pad: 'gas',
    spec: { x: 286, z: 134, face: 's', w: 21, d: 13, floors: 1, preset: 'mainstreet', seed: 41, wallStyle: 'stucco', wall: 0xd8b080, trim: 0xf3ecd9, roof: 'flat', ground: 'shop', sign: 'GAS AND GRUB', signBoard: 0xc8302c, awning: [0xc8302c, 0xf2ece0] },
  },
  {
    id: 'terminal',
    pad: 'hangar',
    spec: { x: 343, z: 587, face: 's', w: 12, d: 10, floors: 2, preset: 'modern', seed: 51, wall: PAL.white, roof: 'flat', ground: 'shop', sign: 'MBALI AIR', signBoard: 0x1d2c4a, awning: [0x2f5a9a, 0xf2ece0] },
  },
  {
    id: 'doom1',
    pad: 'doomtown',
    spec: { x: 562, z: 40, face: 's', w: 11, d: 9, floors: 1, preset: 'house', seed: 61, wall: PAL.mint, shutter: PAL.shutterTeal, roof: 'gable', roofColor: PAL.shingleBrown, ground: 'house' },
  },
  {
    id: 'doom2',
    pad: 'doomtown',
    spec: { x: 586, z: 56, face: 's', w: 11, d: 9, floors: 2, preset: 'house', seed: 62, wall: PAL.peach, shutter: PAL.shutterRed, roof: 'gableSide', roofColor: PAL.shingleGrey, ground: 'house' },
  },
];

/** Footprint rectangle (x0, z0 inclusive; x1, z1 exclusive) in world blocks. */
export function footprint(b: KitBuilding) {
  const s = b.spec;
  const ew = s.face === 'e' || s.face === 'w';
  return { x0: s.x, z0: s.z, x1: s.x + (ew ? s.d : s.w), z1: s.z + (ew ? s.w : s.d) };
}

export const kitY = (b: KitBuilding) => PADS[b.pad].y!;

/** Mark kit footprints as tall solids in the floor map so nav and groundAt treat them as buildings. */
export function blockFootprints(floor: Int16Array, t: Terrain) {
  for (const b of KIT_BUILDINGS) {
    const f = footprint(b);
    for (let z = f.z0; z < f.z1; z++)
      for (let x = f.x0; x < f.x1; x++) {
        const i = z * SX + x;
        floor[i] = Math.max(floor[i], t.h[i] + 3 * b.spec.floors + 2);
      }
  }
}

/** Front-door position (outside, on the ground) of a kit building, without building it. */
export function frontOf(id: string, along = 0.5, out = 1.2) {
  const b = KIT_BUILDINGS.find((k) => k.id === id)!;
  const f = footprint(b);
  return new THREE.Vector3(f.x0 + (f.x1 - f.x0) * along, kitY(b), f.z1 + out);
}

/** Build every kit building, paving and prop. Returns the kit so the runtime can dispose it. */
export function buildKit(parent: THREE.Object3D, physics: RAPIER.World) {
  const kit = new StreetKit({ parent, physics });
  for (const b of KIT_BUILDINGS) kit.building({ ...b.spec, y: kitY(b) });

  const dy = PADS.depot.y!;
  // Depot platform: sidewalk slabs, lamps and benches facing the track.
  kit.street({ x0: 56, z0: 602, x1: 113, z1: 609, y: dy + 1, kind: 'sidewalk', curb: ['s'] });
  for (let x = 60; x <= 108; x += 12) kit.prop('lamp', x, dy + 1, 607.5);
  for (const x of [66, 90, 102]) kit.prop('bench', x, dy + 1, 603.5, Math.PI);
  kit.prop('crates', 98, dy, 598);
  kit.prop('barrel', 96, dy, 597);
  kit.prop('bin', 72, dy + 1, 603);
  kit.prop('signPost', 58, dy + 1, 604);

  // Ranger station: flag, bench, mailbox.
  const ry = PADS.ranger.y!;
  kit.prop('flag', 132.5, ry, 568.5, 0, { scale: 1.4 });
  kit.prop('bench', 125, ry, 567.5, Math.PI);
  kit.prop('mailbox', 138, ry, 568);
  kit.prop('planter', 128, ry, 566.5);

  // Lodge forecourt: brick pavers, lanterns, potted plants and café tables under bunting.
  const ly = PADS.lodge.y!;
  kit.street({ x0: 422, z0: 556, x1: 455, z1: 563, y: ly, kind: 'pavers' });
  for (const x of [423, 438, 454]) kit.prop('lamp', x, ly, 562);
  for (const x of [426, 433, 443, 450]) kit.prop('flowerPot', x, ly, 556.6);
  for (const [x, z] of [[441, 560], [446, 560.5], [451, 560]]) kit.prop('umbrellaTable', x, ly, z);
  kit.prop('pottedTree', 424, ly, 558);
  kit.prop('pottedTree', 453, ly, 558);
  kit.bunting(new THREE.Vector3(423, ly + 5, 562), new THREE.Vector3(454, ly + 5, 562), { colors: [0xd86a2a, 0xf2d040, 0x2f7a45, 0x8a2a3a, 0xf4f0f0] });

  // Gas station: sidewalk, lamps, barrels and crates out back.
  const gy = PADS.gas.y!;
  kit.street({ x0: 285, z0: 147, x1: 308, z1: 150, y: gy, kind: 'sidewalk', curb: ['s'] });
  for (const x of [287, 306]) kit.prop('lamp', x, gy, 149.4);
  kit.prop('bench', 291, gy, 148.5, Math.PI);
  kit.prop('newsStand', 300, gy, 148.6, Math.PI);
  for (const [x, z] of [[283, 136], [283, 138], [284.5, 137]]) kit.prop('barrel', x, gy, z);
  kit.prop('crates', 309, gy, 136);
  kit.prop('bin', 308.5, gy, 148.5);

  // Airstrip terminal.
  const hy = PADS.hangar.y!;
  kit.street({ x0: 341, z0: 597, x1: 357, z1: 600, y: hy, kind: 'plaza' });
  kit.prop('flag', 357, hy, 598.5, 0, { scale: 1.3 });
  kit.prop('bench', 346, hy, 598.4, Math.PI);
  kit.prop('lamp', 342, hy, 599);

  // Doom Town: a too-perfect suburban street for the test.
  const ty = PADS.doomtown.y!;
  kit.prop('mailbox', 566, ty, 52.8);
  kit.prop('mailbox', 590, ty, 66.8);
  kit.prop('lamp', 578, ty, 54);
  kit.prop('hydrant', 580, ty, 53);
  kit.prop('planter', 570, ty, 49.6);

  kit.finish();
  return kit;
}

/** Remove the kit's meshes and colliders. */
export function disposeKit(kit: StreetKit, physics: RAPIER.World) {
  kit.group.removeFromParent();
  const body = (kit as unknown as { body: RAPIER.RigidBody | null }).body;
  if (body) physics.removeRigidBody(body);
}
