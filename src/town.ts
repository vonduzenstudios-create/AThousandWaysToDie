import * as THREE from 'three';
import { B, VoxelWorld } from './voxel';
import { mulberry32, pick, type Rng } from './util';

export const G = 4; // ground surface height
export const SIZE = 160;

export interface Box {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({
  min: new THREE.Vector3(x0, y0, z0),
  max: new THREE.Vector3(x1, y1, z1),
});

export const inBox = (p: THREE.Vector3, b: Box) =>
  p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;

export interface TownInfo {
  world: VoxelWorld;
  spawn: THREE.Vector3;
  treeZone: Box;
  towerZone: Box;
  jug: THREE.Vector3;
  mushroom: THREE.Vector3;
  cookie: THREE.Vector3;
  lever: THREE.Vector3;
  xMark: THREE.Vector3;
  baleHang: THREE.Vector3;
  gantry: { x0: number; x1: number; z: number; top: number };
  fence: { x0: number; z0: number; x1: number; z1: number };
  trackZ: number;
  billboard: THREE.Vector3;
  station: { interior: Box; outside: THREE.Vector3; taser: THREE.Vector3; sign: THREE.Vector3 };
  barnDoor: { x0: number; x1: number; z: number; knock: THREE.Vector3 };
  baler: THREE.Vector3;
  areas: Record<string, Box>;
  treeTops: THREE.Vector3[];
}

function house(w: VoxelWorld, rng: Rng, x0: number, z0: number, wd: number, dp: number, doorSide: 'n' | 's' | 'e' | 'w') {
  const wall = pick(rng, [B.WallBlue, B.WallMint, B.WallPeach, B.White, B.Brick]);
  const roof = pick(rng, [B.RoofRed, B.RoofBlue, B.RoofGreen, B.RoofBrown]);
  const x1 = x0 + wd - 1, z1 = z0 + dp - 1, h = 4;
  w.fill(x0, G - 1, z0, x1, G - 1, z1, B.Plank);
  for (let y = G; y < G + h; y++)
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (!edge) continue;
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        const win = !corner && y === G + 2 && ((x + z) % 3 === 0);
        w.set(x, y, z, corner ? B.Wood : win ? B.Glass : wall);
      }
  // door
  const cx = Math.floor((x0 + x1) / 2), cz = Math.floor((z0 + z1) / 2);
  const door = (x: number, z: number) => {
    w.set(x, G, z, B.Air);
    w.set(x, G + 1, z, B.Air);
    w.set(x, G + 2, z, B.Air);
  };
  if (doorSide === 'n') door(cx, z0), door(cx + 1, z0);
  if (doorSide === 's') door(cx, z1), door(cx + 1, z1);
  if (doorSide === 'e') door(x1, cz), door(x1, cz + 1);
  if (doorSide === 'w') door(x0, cz), door(x0, cz + 1);
  // gable roof along x
  const half = Math.ceil(dp / 2);
  for (let i = 0; i <= half; i++) {
    const y = G + h + i;
    w.fill(x0 - 1, y, z0 - 1 + i, x1 + 1, y, z0 - 1 + i, roof);
    w.fill(x0 - 1, y, z1 + 1 - i, x1 + 1, y, z1 + 1 - i, roof);
    if (i > 0) {
      w.fill(x0, y, z0 - 1 + i + 1, x0, y, z1 - i, wall);
      w.fill(x1, y, z0 - 1 + i + 1, x1, y, z1 - i, wall);
    }
  }
  // chimney
  w.fill(x1 - 1, G + h, z0 + 1, x1 - 1, G + h + half + 1, z0 + 1, B.Brick);
}

function smallTree(w: VoxelWorld, rng: Rng, x: number, z: number, tops: THREE.Vector3[]) {
  const h = 4 + Math.floor(rng() * 3);
  w.fill(x, G, z, x, G + h - 1, z, B.Wood);
  const r = 2 + Math.floor(rng() * 2);
  const cy = G + h;
  const leaf = rng() < 0.5 ? B.Leaves : B.LeavesDark;
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dy * dy * 1.6 + dz * dz > r * r + 0.5) continue;
        if (w.get(x + dx, cy + dy, z + dz) === 0 && rng() > 0.06) w.set(x + dx, cy + dy, z + dz, leaf);
      }
  tops.push(new THREE.Vector3(x + 0.5, cy + r, z + 0.5));
}

function bigOak(w: VoxelWorld, rng: Rng, cx: number, cz: number) {
  // Trunk.
  w.fill(cx - 1, G, cz - 1, cx + 1, G + 15, cz + 1, B.Wood);
  // Spiral of plank ledges up to the treehouse (1-high steps auto-climb; gaps need little hops).
  for (let i = 0; i < 11; i++) {
    const ang = (i * Math.PI * 2) / 8 - Math.PI / 2;
    const px = Math.round(cx + 0.5 + Math.cos(ang) * 5.5);
    const pz = Math.round(cz + 0.5 + Math.sin(ang) * 5.5);
    const y = G + i;
    w.fill(px - 1, y, pz - 1, px, y, pz, B.Plank);
    // branch back to the trunk
    const steps = 4;
    for (let s = 1; s < steps; s++) {
      const bx = Math.round(cx + 0.5 + Math.cos(ang) * (1.5 + s));
      const bz = Math.round(cz + 0.5 + Math.sin(ang) * (1.5 + s));
      if (w.get(bx, y - 1, bz) === 0 && y - 1 >= G) w.set(bx, y - 1, bz, B.Wood);
    }
  }
  // Treehouse platform with railing.
  const py = G + 11;
  w.fill(cx - 3, py, cz - 3, cx + 3, py, cz + 3, B.Plank);
  for (let x = cx - 3; x <= cx + 3; x++)
    for (let z = cz - 3; z <= cz + 3; z++) {
      const edge = x === cx - 3 || x === cx + 3 || z === cz - 3 || z === cz + 3;
      const gap = x === cx + 3 && Math.abs(z - cz) <= 1;
      if (edge && !gap) w.set(x, py + 1, z, B.Wood);
    }
  // Canopy.
  const ccy = G + 19;
  for (let dx = -8; dx <= 8; dx++)
    for (let dy = -4; dy <= 5; dy++)
      for (let dz = -8; dz <= 8; dz++) {
        const d = (dx * dx) / 56 + (dy * dy) / 20 + (dz * dz) / 56;
        if (d < 1 && rng() > 0.05 && w.get(cx + dx, ccy + dy, cz + dz) === 0) w.set(cx + dx, ccy + dy, cz + dz, rng() < 0.7 ? B.Leaves : B.LeavesDark);
      }
}

function waterTower(w: VoxelWorld, cx: number, cz: number) {
  const top = G + 20; // platform block y
  for (const [lx, lz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) w.fill(cx + lx, G, cz + lz, cx + lx, top - 1, cz + lz, B.Metal);
  // cross braces
  for (let y = G + 4; y < top; y += 6) {
    w.fill(cx - 5, y, cz - 5, cx + 5, y, cz - 5, B.Metal);
    w.fill(cx - 5, y, cz + 5, cx + 5, y, cz + 5, B.Metal);
  }
  w.fill(cx - 8, top, cz - 8, cx + 8, top, cz + 8, B.Plank);
  // railing with gap where the stairs arrive
  for (let x = cx - 8; x <= cx + 8; x++)
    for (let z = cz - 8; z <= cz + 8; z++) {
      const edge = x === cx - 8 || x === cx + 8 || z === cz - 8 || z === cz + 8;
      const gap = x === cx - 8 && z >= cz + 5 && z <= cz + 7;
      const jumpGap = z === cz - 8 && Math.abs(x - cx) <= 2; // diving board side
      if (edge && !gap && !jumpGap) w.set(x, top + 1, z, B.Metal);
    }
  // Diving board sticking out north.
  w.fill(cx - 1, top, cz - 13, cx + 1, top, cz - 9, B.Plank);
  // Tank.
  for (let y = top + 1; y < top + 10; y++)
    for (let dx = -5; dx <= 5; dx++)
      for (let dz = -5; dz <= 5; dz++) {
        const d = dx * dx + dz * dz;
        if (d <= 25 && d >= 16) w.set(cx + dx, y, cz + dz, y === top + 5 ? B.White : B.TankBlue);
      }
  // dome
  for (let i = 0; i < 4; i++) {
    const r = 5 - i * 1.3;
    for (let dx = -5; dx <= 5; dx++)
      for (let dz = -5; dz <= 5; dz++) if (dx * dx + dz * dz <= r * r) w.set(cx + dx, top + 10 + i, cz + dz, B.TankBlue);
  }
  // Stairs from ground up to the platform's west side.
  const stairZ0 = cz + 5, stairZ1 = cz + 7;
  for (let i = 0; i < 20; i++) {
    const x = cx - 9 - (19 - i);
    w.fill(x, G, stairZ0, x, G + i, stairZ1, B.Concrete);
  }
}

function fillBuilding(w: VoxelWorld, x0: number, z0: number, x1: number, z1: number, h: number, wall: number, roof: number) {
  w.fill(x0, G - 1, z0, x1, G - 1, z1, B.Concrete);
  for (let y = G; y < G + h; y++)
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) if (x === x0 || x === x1 || z === z0 || z === z1) w.set(x, y, z, wall);
  w.fill(x0 - 1, G + h, z0 - 1, x1 + 1, G + h, z1 + 1, roof);
}

export function buildTown(): TownInfo {
  const w = new VoxelWorld(SIZE, 64, SIZE);
  const rng = mulberry32(1337);
  const treeTops: THREE.Vector3[] = [];

  // Ground.
  for (let x = 0; x < SIZE; x++)
    for (let z = 0; z < SIZE; z++) {
      w.set(x, 0, z, B.Stone);
      w.set(x, 1, z, B.Dirt);
      w.set(x, 2, z, B.Dirt);
      w.set(x, 3, z, rng() < 0.015 ? B.Flower : B.Grass);
    }

  // Roads and sidewalks.
  w.fill(77, G - 1, 0, 83, G - 1, SIZE - 1, B.Asphalt);
  w.fill(0, G - 1, 77, SIZE - 1, G - 1, 83, B.Asphalt);
  w.fill(75, G - 1, 0, 76, G - 1, SIZE - 1, B.Sidewalk);
  w.fill(84, G - 1, 0, 85, G - 1, SIZE - 1, B.Sidewalk);
  w.fill(0, G - 1, 75, SIZE - 1, G - 1, 76, B.Sidewalk);
  w.fill(0, G - 1, 84, SIZE - 1, G - 1, 85, B.Sidewalk);
  w.fill(77, G - 1, 77, 83, G - 1, 83, B.Asphalt);
  for (let i = 0; i < SIZE; i++) {
    if (i % 6 < 3 && (i < 75 || i > 85)) {
      w.set(80, G - 1, i, B.Yellow);
      w.set(i, G - 1, 80, B.Yellow);
    }
  }

  // Park with the big oak.
  w.fill(20, G - 1, 39, 60, G - 1, 41, B.Gravel);
  w.fill(39, G - 1, 20, 41, G - 1, 74, B.Gravel);
  bigOak(w, rng, 30, 30);
  for (const [x, z] of [[52, 26], [55, 50], [25, 55], [22, 44]]) smallTree(w, rng, x, z, treeTops);

  // Water tower.
  waterTower(w, 120, 40);

  // Houses.
  house(w, rng, 62, 8, 10, 9, 'e');
  house(w, rng, 62, 56, 10, 9, 'e');
  house(w, rng, 90, 8, 10, 9, 'w');
  house(w, rng, 90, 58, 10, 9, 'w');
  house(w, rng, 18, 88, 10, 9, 'n');
  house(w, rng, 34, 88, 10, 9, 'n');
  house(w, rng, 140, 60, 10, 9, 'w');

  // Duke's Garage (door faces the main road).
  fillBuilding(w, 52, 92, 66, 104, 6, B.Brick, B.Dark);
  for (let z = 95; z <= 100; z++) for (let y = G; y < G + 4; y++) w.set(66, y, z, B.Air);
  w.fill(53, G, 101, 58, G, 103, B.Wood); // workbench
  w.fill(53, G + 3, 103, 60, G + 3, 103, B.Plank); // shelf

  // Smallville Diner.
  fillBuilding(w, 88, 90, 100, 102, 5, B.White, B.RedPaint);
  for (let x = 89; x < 100; x++) if (x % 2 === 0) w.set(x, G + 2, 90, B.Glass);
  for (let z = 94; z <= 96; z++) for (let y = G; y < G + 3; y++) w.set(88, y, z, B.Air);
  w.fill(92, G, 96, 98, G, 97, B.RedPaint); // counter

  // Hoffman Farm: fence pen, barn and hay hoist.
  const fence = { x0: 104, z0: 96, x1: 122, z1: 114 };
  for (let x = fence.x0; x <= fence.x1; x += 3) {
    w.fill(x, G, fence.z0, x, G + 1, fence.z0, B.Wood);
    w.fill(x, G, fence.z1, x, G + 1, fence.z1, B.Wood);
  }
  for (let z = fence.z0; z <= fence.z1; z += 3) {
    w.fill(fence.x0, G, z, fence.x0, G + 1, z, B.Wood);
    w.fill(fence.x1, G, z, fence.x1, G + 1, z, B.Wood);
  }
  fillBuilding(w, 128, 90, 146, 108, 8, B.BarnRed, B.RoofBrown);
  for (let x = 134; x <= 140; x++) for (let y = G; y < G + 6; y++) w.set(x, y, 108, B.Air);
  w.fill(130, G, 92, 136, G + 1, 96, B.Hay);
  w.fill(139, G, 115, 141, G + 1, 117, B.Hay);
  const gantry = { x0: 133, x1: 141, z: 120, top: G + 12 };
  w.fill(gantry.x0, G, gantry.z, gantry.x0, gantry.top, gantry.z, B.Wood);
  w.fill(gantry.x1, G, gantry.z, gantry.x1, gantry.top, gantry.z, B.Wood);
  w.fill(gantry.x0, gantry.top, gantry.z, gantry.x1, gantry.top, gantry.z, B.Wood);
  // red X on the ground
  for (let i = -1; i <= 1; i++) {
    w.set(137 + i, G - 1, gantry.z + i, B.RedPaint);
    w.set(137 + i, G - 1, gantry.z - i, B.RedPaint);
  }

  // Hay baler inside the barn.
  w.fill(140, G, 96, 143, G + 2, 99, B.RedPaint);
  w.fill(140, G + 3, 97, 143, G + 3, 98, B.Metal);
  w.fill(139, G + 1, 97, 139, G + 1, 98, B.Dark); // intake

  // Smallville Police Station (door faces east toward the main road).
  fillBuilding(w, 46, 60, 60, 72, 6, B.WallBlue, B.Dark);
  for (let z = 65; z <= 67; z++) for (let y = G; y < G + 3; y++) w.set(60, y, z, B.Air);
  for (let x = 48; x < 60; x += 3) w.set(x, G + 2, 60, B.Glass);
  w.fill(49, G, 62, 52, G, 63, B.Wood); // desk
  w.fill(61, G - 1, 64, 74, G - 1, 68, B.Sidewalk); // front walk

  // Whisper Woods.
  for (let i = 0; i < 26; i++) {
    const x = 8 + Math.floor(rng() * 42), z = 108 + Math.floor(rng() * 32);
    if (Math.abs(x - 30) < 3 && Math.abs(z - 126) < 3) continue;
    smallTree(w, rng, x, z, treeTops);
  }

  // Railroad bed.
  const trackZ = 148;
  w.fill(0, G - 1, trackZ - 2, SIZE - 1, G - 1, trackZ + 2, B.Gravel);

  // Billboard posts.
  w.fill(90, G, 70, 90, G + 6, 70, B.Wood);
  w.fill(100, G, 70, 100, G + 6, 70, B.Wood);

  // Remove grass flowers under roads etc. is already handled by order. Done.
  return {
    world: w,
    spawn: new THREE.Vector3(87, G, 88),
    treeZone: box(20, G + 7, 20, 42, G + 40, 42),
    towerZone: box(105, G + 15, 22, 135, G + 40, 55),
    jug: new THREE.Vector3(55.5, G + 1, 102),
    mushroom: new THREE.Vector3(30.5, G, 126.5),
    cookie: new THREE.Vector3(95, G + 1, 96.5),
    lever: new THREE.Vector3(130.5, G, 123.5),
    xMark: new THREE.Vector3(137.5, G, gantry.z + 0.5),
    baleHang: new THREE.Vector3(137.5, gantry.top - 2.5, gantry.z + 0.5),
    gantry,
    fence,
    trackZ,
    billboard: new THREE.Vector3(95.5, G + 7.5, 70.5),
    station: {
      interior: box(47, G - 1, 61, 59.6, G + 4, 71),
      outside: new THREE.Vector3(63, G, 66.5),
      taser: new THREE.Vector3(50.5, G + 1, 62.6),
      sign: new THREE.Vector3(60.6, G + 4.2, 66.5),
    },
    barnDoor: { x0: 134, x1: 140, z: 108, knock: new THREE.Vector3(137.5, G, 110.2) },
    baler: new THREE.Vector3(138.6, G, 97.5),
    areas: {
      downtown: box(70, G, 70, 90, G, 90),
      park: box(18, G, 18, 62, G, 70),
      farm: box(100, G, 85, 150, G, 135),
      woods: box(6, G, 106, 52, G, 142),
      tower: box(95, G, 25, 140, G, 60),
      garage: box(60, G, 86, 74, G, 110),
      station: box(47.5, G, 61.5, 59, G, 70.5),
      construction: box(130, G, 50, 150, G, 75),
    },
    treeTops,
  };
}
