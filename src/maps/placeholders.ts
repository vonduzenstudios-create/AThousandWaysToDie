import * as THREE from 'three';
import { B, type VoxelWorld } from '../voxel';
import { box } from '../town';
import { pick, type Rng } from '../util';
import type { MapDef, TravelStop } from './types';

/**
 * Stand-in maps so travel works end to end before the real maps land. Each one only has to be
 * big, walkable and have its stops in sensible places. The city, beach and wilderness threads
 * replace these in src/maps/index.ts with their real MapDefs (same ids and stop ids).
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

function tower(w: VoxelWorld, rng: Rng, x0: number, z0: number, x1: number, z1: number, h: number) {
  const wall = pick(rng, [B.Concrete, B.Brick, B.WallBlue, B.White, B.Stone, B.WallPeach]);
  for (let y = GY; y < GY + h; y++) {
    const win = (y - GY) % 4 === 2;
    for (let x = x0; x <= x1; x++) {
      w.set(x, y, z0, win && x % 3 !== 0 ? B.Glass : wall);
      w.set(x, y, z1, win && x % 3 !== 0 ? B.Glass : wall);
    }
    for (let z = z0; z <= z1; z++) {
      w.set(x0, y, z, win && z % 3 !== 0 ? B.Glass : wall);
      w.set(x1, y, z, win && z % 3 !== 0 ? B.Glass : wall);
    }
  }
  w.fill(x0, GY + h, z0, x1, GY + h, z1, B.Dark);
  // Lobby door on the south side.
  const cx = Math.floor((x0 + x1) / 2);
  w.fill(cx - 1, GY, z1, cx + 1, GY + 2, z1, B.Air);
}

// ------------------------------------------------------------------ city

export const city: MapDef = {
  id: 'city',
  name: 'Big City',
  size: { x: 384, y: 96, z: 384 },
  waterLevel: 3.4,
  sky: { top: 0x5a7fb8, bottom: 0xd8e2ee, fogNear: 110, fogFar: 230 },
  build(w, rng) {
    const S = w.sx;
    ground(w, B.Sidewalk);
    const harborX = 330;
    // Harbor: dig the east edge into a bay.
    w.fill(harborX, 1, 0, S - 1, GY - 1, S - 1, B.Air);
    w.fill(harborX, 0, 0, S - 1, 0, S - 1, B.Sand);
    w.fill(harborX - 1, 0, 0, harborX - 1, GY - 1, S - 1, B.Concrete); // seawall
    // Roads every 64 blocks.
    const roads: number[] = [96, 160, 224, 288];
    for (const r of [32, ...roads]) {
      w.fill(r, GY - 1, 64, r + 6, GY - 1, S - 40, B.Asphalt);
      for (let z = 64; z < S - 40; z += 6) w.fill(r + 3, GY - 1, z, r + 3, GY - 1, z + 2, B.Yellow);
    }
    for (const r of roads) {
      w.fill(0, GY - 1, r, harborX - 2, GY - 1, r + 6, B.Asphalt);
      for (let x = 0; x < harborX - 2; x += 6) w.fill(x, GY - 1, r + 3, x + 2, GY - 1, r + 3, B.Yellow);
    }
    // Towers in the blocks between roads.
    const areas: Record<string, ReturnType<typeof box>> = {};
    for (let bz = 0; bz < 3; bz++)
      for (let bx = 0; bx < 4; bx++) {
        const x0 = 39 + bx * 64, z0 = 103 + bz * 64;
        if (x0 + 56 > harborX - 4) continue;
        const downtown = bx >= 1 && bx <= 2 && bz === 1;
        for (const [ox, oz] of [[2, 2], [30, 2], [2, 30], [30, 30]]) {
          if (rng() < 0.15) continue;
          const h = downtown ? 40 + Math.floor(rng() * 40) : 10 + Math.floor(rng() * 26);
          tower(w, rng, x0 + ox, z0 + oz, x0 + ox + 20, z0 + oz + 20, h);
        }
        areas[`block${bx}${bz}`] = box(x0 - 3, GY, z0 - 3, x0 + 59, GY, z0 + 59);
      }
    // Airport along the north edge.
    w.fill(0, GY - 1, 22, harborX - 2, GY - 1, 50, B.Asphalt);
    for (let x = 4; x < harborX - 6; x += 10) w.fill(x, GY - 1, 36, x + 5, GY - 1, 36, B.White);
    w.fill(120, GY, 52, 200, GY + 8, 60, B.Glass);
    w.fill(120, GY + 9, 51, 200, GY + 9, 61, B.White);
    w.fill(150, GY, 52, 160, GY + 3, 52, B.Air); // terminal doors
    w.fill(150, GY - 1, 44, 160, GY - 1, 51, B.Sidewalk);
    // Train station along the south edge.
    w.fill(0, GY - 1, 346, harborX - 2, GY - 1, 352, B.Gravel);
    w.fill(140, GY - 1, 353, 220, GY - 1, 356, B.Concrete);
    for (const x of [150, 170, 190, 210]) w.fill(x, GY, 356, x, GY + 4, 356, B.Metal);
    w.fill(146, GY + 5, 353, 214, GY + 5, 357, B.RoofRed);
    // Harbor pier.
    w.fill(harborX - 2, GY - 1, 196, 347, GY - 1, 202, B.Plank);
    for (let x = harborX; x <= 347; x += 4) for (const z of [196, 202]) w.fill(x, 0, z, x, GY - 2, z, B.Wood);
    // Bus shelter on 160th.
    shelter(w, 182, 167, B.RoofBlue);
    for (let i = 0; i < 20; i++) tree(w, rng, 40 + Math.floor(rng() * 260), 330 + Math.floor(rng() * 10), GY);

    const stops: TravelStop[] = [
      { id: 'bus', kind: 'bus', name: '160th Street Terminal', pos: new THREE.Vector3(182.5, GY, 167.5), facing: 0 },
      { id: 'train', kind: 'train', name: 'Grand Central-ish Station', pos: new THREE.Vector3(180.5, GY, 354.5), facing: 0 },
      { id: 'airport', kind: 'plane', name: 'Big City International', pos: new THREE.Vector3(155.5, GY, 44.5), facing: 0 },
      { id: 'harbor', kind: 'boat', name: 'Pier 13', pos: new THREE.Vector3(346.5, GY, 199.5), facing: -Math.PI / 2 },
    ];
    return {
      spawn: new THREE.Vector3(182, GY, 175),
      groundAt: () => GY,
      areas: { ...areas, terminal: box(130, GY, 44, 190, GY, 50), station: box(145, GY, 353, 215, GY, 356), pier: box(harborX, GY, 197, 345, GY, 201) },
      stops,
    };
  },
};

// ------------------------------------------------------------------ beach

export const beach: MapDef = {
  id: 'beach',
  name: 'Sunburn Beach',
  size: { x: 384, y: 48, z: 320 },
  waterLevel: 3.4,
  sky: { top: 0x2f8fe8, bottom: 0xd6f2ff, fogNear: 120, fogFar: 240 },
  build(w, rng) {
    ground(w, B.Sand);
    // The sea floor drops away south of the shoreline.
    for (let z = 200; z < w.sz; z++) {
      const d = Math.min(GY, Math.floor((z - 200) / 6) + 1);
      w.fill(0, GY - d, z, w.sx - 1, GY - 1, z, B.Air);
    }
    // Coastal road, boardwalk, palms.
    w.fill(0, GY - 1, 20, w.sx - 1, GY - 1, 26, B.Asphalt);
    w.fill(0, GY - 1, 150, w.sx - 1, GY - 1, 153, B.Plank);
    for (let i = 0; i < 40; i++) tree(w, rng, 4 + Math.floor(rng() * (w.sx - 8)), 40 + Math.floor(rng() * 100), GY, true);
    // Snack shacks.
    for (const x of [80, 200, 320]) {
      w.fill(x, GY, 140, x + 8, GY + 3, 146, B.WallMint);
      w.fill(x - 1, GY + 4, 139, x + 9, GY + 4, 147, B.RoofRed);
      w.fill(x + 3, GY, 146, x + 5, GY + 2, 146, B.Air);
    }
    // Pier out to the ferry.
    w.fill(298, GY - 1, 185, 303, GY - 1, 238, B.Plank);
    for (let z = 200; z <= 238; z += 4) for (const x of [298, 303]) w.fill(x, 0, z, x, GY - 2, z, B.Wood);
    shelter(w, 190, 27, B.RoofGreen);
    return {
      spawn: new THREE.Vector3(190, GY, 40),
      groundAt: () => GY,
      areas: { sand: box(10, GY, 160, 370, GY, 195), boardwalk: box(10, GY, 150, 370, GY, 153), palms: box(10, GY, 40, 370, GY, 130) },
      stops: [
        { id: 'bus', kind: 'bus', name: 'Beach Road Stop', pos: new THREE.Vector3(190.5, GY, 27.5), facing: 0 },
        { id: 'harbor', kind: 'boat', name: 'Ferry Pier', pos: new THREE.Vector3(300.5, GY, 237.5), facing: Math.PI },
      ],
    };
  },
};

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
