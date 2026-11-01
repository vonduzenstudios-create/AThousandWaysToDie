import * as THREE from 'three';
import { B, type VoxelWorld } from '../voxel';
import { box } from '../town';
import type { Rng } from '../util';
import type { MapDef, TravelStop } from './types';

/**
 * Stand-in maps so travel works end to end before the real maps land. Each one only has to be
 * big, walkable and have its stops in sensible places. The wilderness thread replaces this in
 * src/maps/index.ts with its real MapDef (same id and stop ids).
 */

const GY = 4; // ground surface height, same as Smallville

function ground(w: VoxelWorld, top: number, x0 = 0, z0 = 0, x1 = w.sx - 1, z1 = w.sz - 1) {
  w.fill(x0, 0, z0, x1, 0, z1, B.Stone);
  w.fill(x0, 1, z0, x1, GY - 2, z1, B.Dirt);
  w.fill(x0, GY - 1, z0, x1, GY - 1, z1, top);
}

function tree(w: VoxelWorld, rng: Rng, x: number, z: number, y = GY, palm = false) {
  const h = palm ? 7 + Math.floor(rng() * 3) : 4 + Math.floor(rng() * 4);
  w.fill(x, y, z, x, y + h - 1, z, B.Wood);
  const leaf = rng() < 0.5 ? B.Leaves : B.LeavesDark;
  if (palm) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      for (let i = 1; i <= 3; i++) w.set(x + dx * i, y + h - (i === 3 ? 1 : 0), z + dz * i, leaf);
    w.set(x, y + h, z, leaf);
    return;
  }
  const r = 2 + Math.floor(rng() * 2);
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++)
        if (dx * dx + dy * dy * 1.6 + dz * dz <= r * r + 0.5 && !w.get(x + dx, y + h + dy, z + dz)) w.set(x + dx, y + h + dy, z + dz, leaf);
}

function shelter(w: VoxelWorld, x: number, z: number, roof: number) {
  for (const dx of [-3, 3]) w.fill(x + dx, GY, z + 1, x + dx, GY + 3, z + 1, B.Metal);
  w.fill(x - 3, GY, z + 2, x + 3, GY + 2, z + 2, B.Glass);
  w.fill(x - 4, GY + 4, z, x + 4, GY + 4, z + 2, roof);
  w.fill(x - 2, GY, z + 1, x + 2, GY, z + 1, B.Wood);
}

// ------------------------------------------------------------------ wilderness

export const wilderness: MapDef = {
  id: 'wilderness',
  name: 'The Wilderness',
  size: { x: 384, y: 64, z: 384 },
  sky: { top: 0x4f8fd0, bottom: 0xe8e0c8, fogNear: 120, fogFar: 240 },
  build(w, rng) {
    const S = w.sx;
    // Rolling hills, flattened near the road, the railway and the airstrip.
    for (let x = 0; x < S; x++)
      for (let z = 0; z < w.sz; z++) {
        const flat = Math.abs(z - 190) < 14 || Math.abs(z - 340) < 12 || (z > 30 && z < 64);
        const hill = flat ? 0 : Math.max(0, Math.round(4 * (Math.sin(x / 19) + Math.cos(z / 27)) + 3 * Math.sin((x + z) / 41)));
        const top = GY - 1 + hill;
        w.set(x, 0, z, B.Stone);
        for (let y = 1; y < top; y++) w.set(x, y, z, B.Dirt);
        w.set(x, top, z, hill > 5 ? B.Stone : B.Grass);
      }
    w.fill(0, GY - 1, 187, S - 1, GY - 1, 193, B.Gravel); // dirt road
    w.fill(0, GY - 1, 336, S - 1, GY - 1, 340, B.Gravel); // rail bed
    w.fill(0, GY - 1, 36, S - 1, GY - 1, 52, B.Dirt); // airstrip
    for (let i = 0; i < 160; i++) {
      const x = 2 + Math.floor(rng() * (S - 4)), z = 2 + Math.floor(rng() * (w.sz - 4));
      if (Math.abs(z - 190) < 8 || Math.abs(z - 338) < 6 || (z > 30 && z < 60)) continue;
      tree(w, rng, x, z, w.topY(x, z));
    }
    shelter(w, 120, 194, B.RoofBrown);
    w.fill(180, GY - 1, 341, 220, GY - 1, 343, B.Plank);
    w.fill(196, GY, 54, 206, GY + 4, 60, B.Plank); // airstrip hut
    w.fill(195, GY + 5, 53, 207, GY + 5, 61, B.RoofGreen);
    return {
      spawn: new THREE.Vector3(120, GY, 200),
      areas: { camp: box(100, GY, 194, 160, GY, 200), strip: box(180, GY, 52, 220, GY, 58), halt: box(180, GY, 341, 220, GY, 343) },
      stops: [
        { id: 'bus', kind: 'bus', name: 'Trailhead Bus Stop', pos: new THREE.Vector3(120.5, GY, 194.5), facing: 0 },
        { id: 'train', kind: 'train', name: 'Middle-of-Nowhere Halt', pos: new THREE.Vector3(200.5, GY, 342.5), facing: 0 },
        { id: 'airport', kind: 'plane', name: 'Dirt Strip Airfield', pos: new THREE.Vector3(200.5, GY, 52.5), facing: 0 },
      ],
    };
  },
};
