import * as THREE from 'three';
import { B, VoxelWorld } from './voxel';
import { mulberry32, pick, type Rng } from './util';
import {
  GROUND,
  bench,
  building,
  car,
  doorOutside,
  fenceLine,
  flowerBed,
  furnish,
  house,
  hydrant,
  intersection,
  lamp,
  mailbox,
  parkingLot,
  path,
  pine,
  roadX,
  roadZ,
  shelfRow,
  stairs,
  trashCan,
  tree,
  type Side,
} from './townkit';

/** Ground surface height. Everything below it is dirt and stone (the quarry and pools dig into it). */
export const G = GROUND;
/** Smallville is SIZE x SIZE voxels. */
export const SIZE = 512;
export const HEIGHT = 80;

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

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A place townspeople go (same shape as LifePlace in the NPC life system). */
export interface Place {
  id: string;
  name: string;
  kind: string;
  door: THREE.Vector3;
  inside?: Box;
  spots?: THREE.Vector3[];
  staffSpots?: THREE.Vector3[];
  jobs?: string[];
  hours?: [number, number];
  sells?: { item: string; price: number }[];
  allowedJobs?: string[];
  residents?: number;
  patrol?: THREE.Vector3[];
  lines?: string[];
  tags?: string[];
}

/** A bus stop or train platform (same shape as TravelStop in the travel system). */
export interface TransitStop {
  id: string;
  kind: 'bus' | 'train' | 'plane' | 'boat';
  name: string;
  pos: THREE.Vector3;
  facing: number;
  board?: Box;
  lane?: { from: THREE.Vector3; stop: THREE.Vector3; to: THREE.Vector3 };
}

/** Road centerline for traffic (same shape as Road in the vehicles system). Junction points are shared. */
export interface RoadLine {
  name: string;
  points: THREE.Vector3[];
  width: number;
}

/** A painted sign. rotY 0 faces +z (south), PI faces north, PI/2 faces east, -PI/2 faces west. */
export interface SignSpec {
  lines: string[];
  pos: THREE.Vector3;
  rotY: number;
  bg: string;
  fg: string;
  w?: number;
  h?: number;
}

export interface TownInfo {
  world: VoxelWorld;
  size: number;
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
  crossing: THREE.Vector3;
  billboard: THREE.Vector3;
  station: { interior: Box; outside: THREE.Vector3; taser: THREE.Vector3; sign: THREE.Vector3 };
  barnDoor: { x0: number; x1: number; z: number; knock: THREE.Vector3 };
  baler: THREE.Vector3;
  areas: Record<string, Box>;
  treeTops: THREE.Vector3[];
  /** Where people live, work, shop and hang out. */
  places: Place[];
  /** Bus stop and train platform. */
  transit: TravelStops;
  roads: RoadLine[];
  signs: SignSpec[];
  /** Named points used by the hometown deaths (src/hometown.ts). */
  spots: Record<string, THREE.Vector3>;
  /** Named zones used by the hometown deaths. */
  zones: Record<string, Box>;
}

type TravelStops = TransitStop[];

// ------------------------------------------------------------------ landmarks

function bigOak(w: VoxelWorld, rng: Rng, cx: number, cz: number) {
  w.fill(cx - 1, G, cz - 1, cx + 1, G + 15, cz + 1, B.Wood);
  for (let i = 0; i < 11; i++) {
    const ang = (i * Math.PI * 2) / 8 - Math.PI / 2;
    const px = Math.round(cx + 0.5 + Math.cos(ang) * 5.5);
    const pz = Math.round(cz + 0.5 + Math.sin(ang) * 5.5);
    const y = G + i;
    w.fill(px - 1, y, pz - 1, px, y, pz, B.Plank);
    for (let s = 1; s < 4; s++) {
      const bx = Math.round(cx + 0.5 + Math.cos(ang) * (1.5 + s));
      const bz = Math.round(cz + 0.5 + Math.sin(ang) * (1.5 + s));
      if (w.get(bx, y - 1, bz) === 0 && y - 1 >= G) w.set(bx, y - 1, bz, B.Wood);
    }
  }
  const py = G + 11;
  w.fill(cx - 3, py, cz - 3, cx + 3, py, cz + 3, B.Plank);
  for (let x = cx - 3; x <= cx + 3; x++)
    for (let z = cz - 3; z <= cz + 3; z++) {
      const edge = x === cx - 3 || x === cx + 3 || z === cz - 3 || z === cz + 3;
      const gap = x === cx + 3 && Math.abs(z - cz) <= 1;
      if (edge && !gap) w.set(x, py + 1, z, B.Wood);
    }
  // Treehouse hut on the platform.
  w.fill(cx - 3, py + 1, cz - 3, cx - 1, py + 3, cz - 1, B.Plank);
  w.fill(cx - 2, py + 1, cz - 1, cx - 2, py + 2, cz - 1, B.Air);
  w.fill(cx - 4, py + 4, cz - 4, cx, py + 4, cz, B.RoofRed);
  // The thin branch sticking out east (the one that snaps).
  w.fill(cx + 4, py + 4, cz, cx + 10, py + 4, cz, B.Wood);
  const ccy = G + 19;
  for (let dx = -8; dx <= 8; dx++)
    for (let dy = -4; dy <= 5; dy++)
      for (let dz = -8; dz <= 8; dz++) {
        const d = (dx * dx) / 56 + (dy * dy) / 20 + (dz * dz) / 56;
        if (d < 1 && rng() > 0.05 && w.get(cx + dx, ccy + dy, cz + dz) === 0) w.set(cx + dx, ccy + dy, cz + dz, rng() < 0.7 ? B.Leaves : B.LeavesDark);
      }
}

function waterTower(w: VoxelWorld, cx: number, cz: number) {
  const top = G + 20;
  for (const [lx, lz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) w.fill(cx + lx, G, cz + lz, cx + lx, top - 1, cz + lz, B.Metal);
  for (let y = G + 4; y < top; y += 6) {
    w.fill(cx - 5, y, cz - 5, cx + 5, y, cz - 5, B.Metal);
    w.fill(cx - 5, y, cz + 5, cx + 5, y, cz + 5, B.Metal);
  }
  w.fill(cx - 8, top, cz - 8, cx + 8, top, cz + 8, B.Plank);
  for (let x = cx - 8; x <= cx + 8; x++)
    for (let z = cz - 8; z <= cz + 8; z++) {
      const edge = x === cx - 8 || x === cx + 8 || z === cz - 8 || z === cz + 8;
      const gap = x === cx - 8 && z >= cz + 5 && z <= cz + 7;
      const jumpGap = x === cx + 8 && Math.abs(z - cz) <= 2; // diving board side faces east
      if (edge && !gap && !jumpGap) w.set(x, top + 1, z, B.Metal);
    }
  // Diving board sticking out east, toward the backyards on Tower Rd.
  w.fill(cx + 9, top, cz - 1, cx + 13, top, cz + 1, B.Plank);
  for (let y = top + 1; y < top + 10; y++)
    for (let dx = -5; dx <= 5; dx++)
      for (let dz = -5; dz <= 5; dz++) {
        const d = dx * dx + dz * dz;
        if (d <= 25 && d >= 16) w.set(cx + dx, y, cz + dz, y === top + 5 ? B.White : B.TankBlue);
      }
  for (let i = 0; i < 4; i++) {
    const r = 5 - i * 1.3;
    for (let dx = -5; dx <= 5; dx++)
      for (let dz = -5; dz <= 5; dz++) if (dx * dx + dz * dz <= r * r) w.set(cx + dx, top + 10 + i, cz + dz, B.TankBlue);
  }
  // Stairs up the west side; the bottom 3 steps are missing (bring a ladder, or jump).
  const z0 = cz + 5, z1 = cz + 7;
  for (let i = 3; i < 20; i++) {
    const x = cx - 9 - (19 - i);
    w.fill(x, G + i - 1, z0, x, G + i, z1, B.Metal);
  }
  return top;
}

/** A round silo with an open top, filled with grain, and a stair tower up the side. */
function silo(w: VoxelWorld, cx: number, cz: number, h: number) {
  for (let y = G; y < G + h; y++)
    for (let dx = -5; dx <= 5; dx++)
      for (let dz = -5; dz <= 5; dz++) {
        const d = dx * dx + dz * dz;
        if (d <= 25 && d >= 17) w.set(cx + dx, y, cz + dz, (y - G) % 6 === 0 ? B.Metal : B.WallBlue);
        else if (d < 17 && y < G + h - 6) w.set(cx + dx, y, cz + dz, B.Grain);
      }
  // Stair tower on the east side, rising north to south.
  for (let i = 0; i < h; i++) w.fill(cx + 7, G, cz + 16 - i, cx + 8, G + i, cz + 16 - i, B.Plank);
  // Catwalk into the open top.
  w.fill(cx + 4, G + h - 1, cz - 1, cx + 8, G + h - 1, cz + 1, B.Metal);
  w.fill(cx + 4, G + h - 1, cz - 1, cx + 4, G + h - 1, cz + 1, B.Air);
}

/** Tall rows of 2-high corn you can hide in (crops are passable). */
function cornfield(w: VoxelWorld, x0: number, z0: number, x1: number, z1: number) {
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      w.set(x, G - 1, z, B.Dirt);
      if (x % 3 !== 0) w.fill(x, G, z, x, G + 1, z, B.Corn);
    }
}

// ------------------------------------------------------------------ town

export function buildTown(existing?: VoxelWorld): TownInfo {
  const w = existing ?? new VoxelWorld(SIZE, HEIGHT, SIZE);
  const rng = mulberry32(1337);
  const treeTops: THREE.Vector3[] = [];
  const tops: { x: number; y: number; z: number }[] = [];
  const places: Place[] = [];
  const signs: SignSpec[] = [];
  const spots: Record<string, THREE.Vector3> = {};
  const zones: Record<string, Box> = {};
  const roads: RoadLine[] = [];

  const place = (p: Place) => places.push(p);
  const sign = (lines: string[], x: number, y: number, z: number, rotY: number, bg: string, fg: string, wd = 6, h = 1.5) =>
    signs.push({ lines, pos: v(x, y, z), rotY, bg, fg, w: wd, h });
  /** Interior walkable box of a building footprint (one block in from the walls). */
  const inner = (x0: number, z0: number, x1: number, z1: number) => box(x0 + 1, G, z0 + 1, x1 - 1, G, z1 - 1);

  // ---- Ground: stone, dirt, grass with the odd flower.
  for (let x = 0; x < SIZE; x++)
    for (let z = 0; z < SIZE; z++) {
      for (let y = 0; y < G - 4; y++) w.set(x, y, z, B.Stone);
      for (let y = G - 4; y < G - 1; y++) w.set(x, y, z, B.Dirt);
      w.set(x, G - 1, z, rng() < 0.012 ? B.Flower : B.Grass);
    }

  // ---- Railroad across the north edge.
  const trackZ = 20;
  w.fill(0, G - 1, trackZ - 2, SIZE - 1, G - 1, trackZ + 2, B.Gravel);

  // ---- Road grid. Streets run east-west (along x), avenues north-south (along z).
  const streets = [
    { name: 'Railroad Ave', z: 60, x0: 145, x1: 445 },
    { name: 'Park St', z: 150, x0: 245, x1: 505 },
    { name: 'Main St', z: 240, x0: 0, x1: SIZE - 1 },
    { name: 'Church St', z: 330, x0: 145, x1: 505 },
    { name: 'School St', z: 420, x0: 145, x1: 505 },
    { name: 'Maple St', z: 375, x0: 350, x1: 505 },
  ];
  const aves = [
    { name: 'Farm Rd', x: 70, z0: 145, z1: 420 },
    { name: 'Elm Ave', x: 150, z0: 60, z1: 420 },
    { name: 'Oak Ave', x: 250, z0: 52, z1: 420 },
    { name: 'Birch Ave', x: 350, z0: 60, z1: 505 },
    { name: 'Tower Rd', x: 440, z0: 60, z1: 505 },
  ];
  for (const s of streets) roadX(w, s.z, s.x0, s.x1);
  for (const a of aves) roadZ(w, a.x, a.z0, a.z1);
  const junctions: { x: number; z: number }[] = [];
  for (const s of streets)
    for (const a of aves)
      if (a.x >= s.x0 && a.x <= s.x1 && s.z >= a.z0 && s.z <= a.z1) {
        intersection(w, a.x, s.z);
        junctions.push({ x: a.x, z: s.z });
      }
  for (const s of streets) {
    const xs = [s.x0, ...junctions.filter((j) => j.z === s.z).map((j) => j.x), s.x1].sort((a, b) => a - b);
    roads.push({ name: s.name, width: 7, points: [...new Set(xs)].map((x) => v(x + 0.5, G, s.z + 0.5)) });
  }
  for (const a of aves) {
    const zs = [a.z0, ...junctions.filter((j) => j.x === a.x).map((j) => j.z), a.z1].sort((p, q) => p - q);
    roads.push({ name: a.name, width: 7, points: [...new Set(zs)].map((z) => v(a.x + 0.5, G, z + 0.5)) });
  }
  // Street lamps and hydrants along every road.
  for (const s of streets)
    for (let x = s.x0 + 8; x < s.x1; x += 24) {
      if (junctions.some((j) => Math.abs(j.x - x) < 8)) continue;
      lamp(w, x, s.z - 5);
      lamp(w, x + 12, s.z + 5);
      if (x % 48 === 8) hydrant(w, x + 3, s.z + 5);
    }
  for (const a of aves)
    for (let z = a.z0 + 8; z < a.z1; z += 24) {
      if (junctions.some((j) => Math.abs(j.z - z) < 8)) continue;
      lamp(w, a.x - 5, z);
      lamp(w, a.x + 5, z + 12);
    }

  // ================================================================ NORTH: train station
  {
    // Platform along the tracks, one step up.
    w.fill(212, G, 23, 288, G, 27, B.Concrete);
    for (let x = 212; x <= 288; x++) w.set(x, G, 23, B.Yellow); // mind the gap
    const st = building(w, { x0: 228, z0: 30, x1: 272, z1: 48, wall: B.Brick, trim: B.White, floor: B.Tile, roof: 'gable', roofMat: B.RoofGreen, floorH: 7, winEvery: 4, doors: [{ side: 's', at: 248, width: 4, height: 4 }, { side: 'n', at: 248, width: 4, height: 4 }] });
    w.fill(229, G - 1, 28, 271, G - 1, 29, B.Concrete); // step between platform and station
    w.fill(228, G - 1, 26, 272, G - 1, 29, B.Concrete);
    // Ticket counter and benches inside.
    w.fill(232, G, 34, 244, G, 34, B.Wood);
    w.fill(232, G + 1, 31, 244, G + 2, 31, B.Glass);
    for (let x = 252; x < 270; x += 4) bench(w, x, 40);
    // Platform canopy.
    for (let x = 216; x <= 284; x += 8) w.fill(x, G + 1, 27, x, G + 5, 27, B.Metal);
    w.fill(214, G + 6, 24, 286, G + 6, 28, B.RoofGreen);
    for (let x = 220; x < 284; x += 10) bench(w, x, 26);
    // Plaza to Oak Ave and a parking lot.
    w.fill(226, G - 1, 49, 274, G - 1, 54, B.Concrete);
    flowerBed(w, rng, 230, 50, 240, 51);
    flowerBed(w, rng, 260, 50, 270, 51);
    parkingLot(w, 282, 32, 330, 54);
    for (let x = 284; x < 328; x += 4) if (rng() < 0.5) car(w, rng, x, 33, false);
    sign(['SMALLVILLE', 'STATION'], 250.5, G + 9, 48.7, 0, '#2a4a2a', '#f5e6c8', 8, 2);
    sign(['EXPRESS PASSES :15 AND :45', 'DO NOT STAND ON TRACKS'], 260, G + 3, 27.6, Math.PI, '#ffffff', '#202020', 4, 1);
    spots.timetable = v(260.5, G + 1, 26);
    place({ id: 'train-station', name: 'Smallville Station', kind: 'transit', door: v(250, G, 51), inside: inner(228, 30, 272, 48), staffSpots: [v(238, G, 33)], jobs: ['Conductor'], spots: [v(222, G + 1, 25.5), v(240, G + 1, 25.5), v(262, G + 1, 25.5), v(278, G + 1, 25.5)] });
    void st;
  }

  // ================================================================ WEST: quarry (z 36..140)
  {
    const qx0 = 18, qx1 = 132, qz0 = 38, qz1 = 136;
    const cx = (qx0 + qx1) / 2, cz = (qz0 + qz1) / 2;
    const rx = (qx1 - qx0) / 2, rz = (qz1 - qz0) / 2;
    // Terraced pit: rings step down 3 blocks at a time toward a pond at the bottom.
    for (let x = qx0; x <= qx1; x++)
      for (let z = qz0; z <= qz1; z++) {
        const d = Math.hypot((x - cx) / rx, (z - cz) / rz) + (rng() - 0.5) * 0.03;
        if (d > 1) continue;
        const depth = d > 0.92 ? 11 : d > 0.75 ? 11 : d > 0.55 ? 8 : d > 0.3 ? 5 : 2; // blocks of ground left
        const floorTop = G - 1 - (11 - (11 - depth)) - 0; // placeholder, recomputed below
        void floorTop;
        const left = d > 0.85 ? 0 : d > 0.65 ? 3 : d > 0.45 ? 6 : 9; // how far below ground this ring sits
        const keep = G - 1 - left - (d > 0.85 ? 0 : 0);
        void depth;
        for (let y = keep + 1; y < G; y++) w.set(x, y, z, B.Air);
        w.set(x, keep, z, d > 0.85 ? B.Gravel : (x + z) % 7 === 0 ? B.Gravel : B.Stone);
      }
    // Steepen the rim: the first ring drops straight down 11 blocks so the fall is fatal.
    for (let x = qx0; x <= qx1; x++)
      for (let z = qz0; z <= qz1; z++) {
        const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
        if (d <= 0.85 && d > 0.65) for (let y = G - 4; y < G; y++) w.set(x, y, z, B.Air);
        if (d <= 0.85 && d > 0.65) w.set(x, G - 5, z, B.Stone);
      }
    // Flooded bottom.
    for (let x = qx0; x <= qx1; x++)
      for (let z = qz0; z <= qz1; z++) {
        const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
        if (d <= 0.45) {
          for (let y = 0; y < G - 1; y++) w.set(x, y, z, y < 2 ? B.Mud : y <= G - 10 - 1 + 3 ? B.Water : B.Air);
          w.set(x, 0, z, B.Stone);
        }
      }
    // Rusty conveyor and a crusher shed on the terraces.
    w.fill(cx + 30, G - 7, cz - 2, cx + 40, G - 7, cz + 2, B.Steel);
    building(w, { x0: 30, z0: 42, x1: 42, z1: 52, wall: B.Metal, roof: 'flat', roofMat: B.Steel, floor: B.Concrete, winEvery: 0, doors: [{ side: 's', at: 35 }] });
    // Chain-link fence around the rim with a locked gate on Farm Rd.
    fenceLine(w, qx0 - 2, qz0 - 4, qx1 + 2, qz0 - 4, B.Metal, 2);
    fenceLine(w, qx0 - 2, qz1 + 3, qx1 + 2, qz1 + 3, B.Metal, 2, [64, 76]);
    fenceLine(w, qx0 - 2, qz0 - 4, qx0 - 2, qz1 + 3, B.Metal, 2);
    fenceLine(w, qx1 + 2, qz0 - 4, qx1 + 2, qz1 + 3, B.Metal, 2);
    w.fill(66, G, qz1 + 3, 74, G + 1, qz1 + 3, B.Steel); // the locked gate
    // Gravel haul road from Farm Rd through the gate to the rim, ending at a sheer edge.
    w.fill(67, G - 1, qz1 - 6, 73, G - 1, 146, B.Gravel);
    sign(['SMALLVILLE QUARRY', 'KEEP OUT · NO SWIMMING'], 70.5, G + 3.2, qz1 + 3.6, 0, '#f5c400', '#151515', 5, 1.4);
    zones.quarry = box(qx0, 0, qz0, qx1, G + 40, qz1);
    zones.quarryGate = box(66, G, qz1 + 2, 75, G + 3, qz1 + 4);
    place({ id: 'quarry', name: 'Smallville Quarry', kind: 'attraction', door: v(70.5, G, 146), tags: ['locked'] });
  }

  // ================================================================ WEST: Hoffman Farm (x 12..144, z 156..414)
  const farmX0 = 156;
  // Barn (north of Main St).
  const barn = { x0: 90, z0: 186, x1: 108, z1: 204 };
  building(w, { ...barn, wall: B.BarnRed, trim: B.White, floor: B.Dirt, floors: 1, floorH: 8, roof: 'gable', roofMat: B.RoofBrown, winEvery: 0 });
  const barnDoor = { x0: 96, x1: 102, z: barn.z1, knock: v(99.5, G, barn.z1 + 2.2) };
  for (let x = barnDoor.x0; x <= barnDoor.x1; x++) for (let y = G; y < G + 6; y++) w.set(x, y, barn.z1, B.Air);
  w.fill(92, G, 188, 98, G + 1, 192, B.Hay);
  w.fill(92, G, 193, 94, G + 3, 196, B.Hay);
  // Hay baler inside the barn.
  w.fill(102, G, 192, 105, G + 2, 195, B.RedPaint);
  w.fill(102, G + 3, 193, 105, G + 3, 194, B.Metal);
  w.fill(101, G + 1, 193, 101, G + 1, 194, B.Dark);
  const baler = v(100.6, G, 193.5);
  // Hay hoist gantry south of the barn.
  const gantry = { x0: 95, x1: 103, z: 216, top: G + 12 };
  w.fill(gantry.x0, G, gantry.z, gantry.x0, gantry.top, gantry.z, B.Wood);
  w.fill(gantry.x1, G, gantry.z, gantry.x1, gantry.top, gantry.z, B.Wood);
  w.fill(gantry.x0, gantry.top, gantry.z, gantry.x1, gantry.top, gantry.z, B.Wood);
  for (let i = -1; i <= 1; i++) {
    w.set(99 + i, G - 1, gantry.z + i, B.RedPaint);
    w.set(99 + i, G - 1, gantry.z - i, B.RedPaint);
  }
  w.fill(108, G, 212, 110, G + 1, 214, B.Hay);
  // Farmhouse on Farm Rd.
  {
    const h = house(w, rng, { x0: 80, z0: 162, w: 16, d: 12, door: 'w', floors: 2 });
    w.fill(76, G - 1, 166, 79, G - 1, 170, B.Plank); // porch
    place({ id: 'farmhouse', name: 'Hoffman Farmhouse', kind: 'home', door: v(h.door.x, G, h.door.z), inside: box(81, G, 163, 94, G, 172), residents: 3 });
  }
  // Electric fence pen west of Farm Rd, with cows.
  const fence = { x0: 22, z0: 160, x1: 46, z1: 184 };
  for (let x = fence.x0; x <= fence.x1; x += 3) {
    w.fill(x, G, fence.z0, x, G + 1, fence.z0, B.Wood);
    w.fill(x, G, fence.z1, x, G + 1, fence.z1, B.Wood);
  }
  for (let z = fence.z0; z <= fence.z1; z += 3) {
    w.fill(fence.x0, G, z, fence.x0, G + 1, z, B.Wood);
    w.fill(fence.x1, G, z, fence.x1, G + 1, z, B.Wood);
  }
  for (let x = fence.x0 + 1; x < fence.x1; x++) for (let z = fence.z0 + 1; z < fence.z1; z++) if (rng() < 0.15) w.set(x, G - 1, z, B.Mud);
  w.fill(30, G, 170, 33, G, 171, B.Metal); // trough
  // Silo with an open top.
  const siloC = { x: 40, z: 205, h: 24 };
  silo(w, siloC.x, siloC.z, siloC.h);
  zones.silo = box(siloC.x - 4, G, siloC.z - 4, siloC.x + 4.99, G + siloC.h - 7, siloC.z + 4.99);
  // Tractor parked by the barn.
  w.fill(112, G, 196, 116, G, 198, B.RoofGreen);
  w.fill(112, G, 196, 112, G + 1, 198, B.Black);
  w.fill(116, G, 196, 116, G + 1, 198, B.Black);
  w.fill(114, G + 1, 197, 115, G + 2, 197, B.RoofGreen);
  // South of Main: cornfield, bull pen with hay ramp, mule paddock, pasture.
  cornfield(w, 82, 252, 140, 326);
  zones.cornfield = box(82, G, 252, 140, G + 3, 326);
  // Bull pen: 2-block fence, a gate on the farm lane, a hay ramp that sets your launch angle.
  const bull = { x0: 20, z0: 250, x1: 54, z1: 284 };
  fenceLine(w, bull.x0, bull.z0, bull.x1, bull.z0, B.Wood, 2);
  fenceLine(w, bull.x0, bull.z1, bull.x1, bull.z1, B.Wood, 2);
  fenceLine(w, bull.x0, bull.z0, bull.x0, bull.z1, B.Wood, 2);
  fenceLine(w, bull.x1, bull.z0, bull.x1, bull.z1, B.Wood, 2, [265, 268]);
  for (let i = 0; i < 5; i++) w.fill(24 + i, G, 262, 24 + i, G + i, 268, B.Hay); // ramp rises west
  for (let x = bull.x0 + 1; x < bull.x1; x++) for (let z = bull.z0 + 1; z < bull.z1; z++) if (w.get(x, G, z) === 0) w.set(x, G - 1, z, rng() < 0.5 ? B.Dirt : B.Mud);
  zones.bullPen = box(bull.x0 + 1, G - 1, bull.z0 + 1, bull.x1 - 0.01, G + 6, bull.z1 - 0.01);
  spots.bull = v(44, G, 275);
  spots.bullRamp = v(28.5, G + 5, 265.5);
  spots.bullGate = v(56, G, 266.5);
  // Porta potty (for locking up the rodeo clown).
  w.fill(58, G, 252, 59, G + 2, 253, B.WallBlue);
  w.set(58, G + 1, 252, B.Air);
  spots.portaPotty = v(57.5, G, 252.5);
  // Mule paddock.
  fenceLine(w, 20, 296, 46, 296, B.Wood, 1);
  fenceLine(w, 20, 318, 46, 318, B.Wood, 1);
  fenceLine(w, 20, 296, 20, 318, B.Wood, 1);
  fenceLine(w, 46, 296, 46, 318, B.Wood, 1, [305, 308]);
  spots.mule = v(33, G, 307);
  // Chicken coop and pumpkin patch.
  building(w, { x0: 50, z0: 300, x1: 58, z1: 306, wall: B.Plank, roof: 'gable', roofMat: B.RoofRed, floor: B.Hay, floorH: 3, winEvery: 0, doors: [{ side: 'e', at: 302, width: 1, height: 2 }] });
  for (let x = 82; x < 140; x += 3) for (let z = 336; z < 356; z += 3) if (rng() < 0.6) w.set(x, G, z, B.Orange);
  // Pasture with hay bales and a pond.
  for (let i = 0; i < 12; i++) {
    const x = 20 + Math.floor(rng() * 40), z = 330 + Math.floor(rng() * 80);
    w.fill(x, G, z, x + 1, G + 1, z + 1, B.Hay);
  }
  for (let x = 100; x <= 136; x++)
    for (let z = 372; z <= 404; z++) {
      const d = Math.hypot((x - 118) / 18, (z - 388) / 16);
      if (d < 1) for (let y = G - 1; y >= G - (d < 0.6 ? 4 : 2); y--) w.set(x, y, z, B.Water);
    }
  place({ id: 'barn', name: 'Hoffman Barn', kind: 'work', door: v(99.5, G, barn.z1 + 2.5), inside: box(91, G, 197, 107, G, 203), jobs: ['Farmhand'], allowedJobs: ['Farmhand'] });
  place({ id: 'pasture', name: 'Hoffman Pasture', kind: 'work', door: v(64, G, 300), inside: box(20, G, 330, 64, G, 410), jobs: ['Farmhand'] });
  sign(['HOFFMAN FARM'], 99.5, G + 9.5, barn.z1 + 0.6, 0, '#6b3a1e', '#f5e6c8');
  sign(['FRESH EGGS', 'HONOR SYSTEM'], 64.5, G + 2.5, 235, Math.PI, '#ffffff', '#7a3b16', 3, 1);
  void farmX0;

  // ================================================================ WOODS (south-west)
  {
    for (let i = 0; i < 160; i++) {
      const x = 8 + Math.floor(rng() * 236), z = 428 + Math.floor(rng() * 78);
      if (Math.abs(x - 60) < 5 && Math.abs(z - 470) < 5) continue;
      if (x > 112 && x < 136 && z > 444 && z < 464) continue;
      if (w.get(x, G - 1, z) !== B.Grass) continue;
      if (z < 426 && x > 140) continue;
      tops.push(rng() < 0.6 ? pine(w, rng, x, z) : tree(w, rng, x, z, true));
    }
    for (let i = 0; i < 40; i++) {
      const x = 8 + Math.floor(rng() * 130), z = 420 + Math.floor(rng() * 8);
      if (w.get(x, G - 1, z) === B.Grass && w.get(x, G, z) === 0) tops.push(pine(w, rng, x, z));
    }
    // Hunting cabin.
    building(w, { x0: 116, z0: 448, x1: 130, z1: 458, wall: B.Wood, trim: B.Dark, roof: 'gable', roofMat: B.RoofBrown, floor: B.Plank, winEvery: 4, doors: [{ side: 'n', at: 122 }] });
    furnish(w, rng, 117, 449, 129, 457, 'living');
    // Mushroom clearing.
    w.fill(56, G - 1, 466, 64, G - 1, 474, B.Mud);
    place({ id: 'woods', name: 'Whisper Woods', kind: 'park', door: v(150, G, 428), inside: box(20, G, 430, 240, G, 500) });
  }
  const mushroom = v(60.5, G, 470.5);

  // ================================================================ B1: Smallville Park (x 156..244, z 66..144)
  {
    bigOak(w, rng, 180, 92);
    // Gravel paths.
    w.fill(156, G - 1, 124, 244, G - 1, 125, B.Gravel);
    w.fill(200, G - 1, 66, 201, G - 1, 125, B.Gravel);
    fenceLine(w, 156, 128, 244, 128, B.LeavesDark, 1, [154, 158]);
    // Pond with sloped banks and a goose nest.
    for (let x = 206; x <= 242; x++)
      for (let z = 90; z <= 120; z++) {
        const d = Math.hypot((x - 224) / 17, (z - 105) / 12);
        if (d > 1) continue;
        const depth = d < 0.55 ? 4 : d < 0.8 ? 2 : 1;
        for (let y = G - 1; y >= G - depth; y--) w.set(x, y, z, B.Water);
        w.set(x, G - depth - 1, z, B.Mud);
      }
    w.fill(207, G, 92, 209, G, 94, B.Hay);
    spots.gooseNest = v(208.5, G + 1, 93.5);
    spots.pond = v(224, G, 105);
    // Playground: slide, swings, sandbox.
    w.fill(156, G - 1, 104, 172, G - 1, 122, B.Sand);
    for (let i = 0; i < 5; i++) w.fill(158, G + i, 106 + i, 160, G + i, 106 + i, B.RedPaint); // ladder steps
    w.fill(158, G + 5, 111, 160, G + 5, 113, B.Yellow);
    for (let i = 0; i < 6; i++) w.fill(158, G + 5 - i, 114 + i, 160, G + 5 - i, 114 + i, B.Yellow);
    w.fill(164, G, 106, 164, G + 4, 106, B.Metal);
    w.fill(170, G, 106, 170, G + 4, 106, B.Metal);
    w.fill(164, G + 5, 106, 170, G + 5, 106, B.Metal);
    w.fill(165, G - 1, 116, 170, G - 1, 121, B.Sand);
    // Gazebo.
    w.fill(222, G - 1, 74, 234, G - 1, 86, B.Plank);
    for (const [x, z] of [[222, 74], [234, 74], [222, 86], [234, 86], [228, 74], [228, 86], [222, 80], [234, 80]]) w.fill(x, G, z, x, G + 4, z, B.White);
    for (let i = 0; i < 4; i++) w.fill(221 + i * 2, G + 5 + i, 73 + i * 2, 235 - i * 2, G + 5 + i, 87 - i * 2, B.RoofRed);
    // Benches, trash cans, flower beds, trees.
    for (let x = 176; x < 240; x += 14) {
      bench(w, x, 122);
      trashCan(w, x + 4, 122);
    }
    w.fill(152, G - 1, 66, 155, G - 1, 66, B.Gravel);
    for (const [x, z] of [[160, 72], [215, 70], [240, 70], [196, 108], [242, 124], [190, 120]]) tops.push(tree(w, rng, x, z));
    sign(['SMALLVILLE PARK'], 155.4, G + 3, 96, -Math.PI / 2, '#2f6a2c', '#ffffff', 5, 1.2);
    place({ id: 'park', name: 'Smallville Park', kind: 'park', door: v(157, G, 96), inside: box(158, G, 68, 242, G, 126), spots: [v(177, G, 121), v(191, G, 121), v(205, G, 121), v(219, G, 121), v(233, G, 121)] });
    place({ id: 'gazebo', name: 'Park Gazebo', kind: 'bench', door: v(228, G, 88), inside: box(223, G, 75, 233, G, 85) });
  }

  // ================================================================ C1: Library, post office, court, construction
  {
    building(w, { x0: 262, z0: 102, x1: 302, z1: 140, wall: B.Brick, trim: B.Marble, floor: B.Carpet, floorH: 9, roof: 'flat', roofMat: B.Dark, winEvery: 4, doors: [{ side: 's', at: 280, width: 3, height: 4 }] });
    // Tall bookshelves in rows; the tallest one at the back has a ladder rail.
    const books = [B.RedPaint, B.WallBlue, B.RoofGreen, B.Yellow, B.Purple, B.Orange];
    for (let x = 266; x <= 298; x += 4)
      for (let z = 106; z <= 128; z++)
        for (let y = G; y < G + 7; y++) w.set(x, y, z, y % 2 === 0 ? B.Wood : pick(rng, books));
    w.fill(268, G, 134, 280, G, 136, B.Wood); // reading tables
    w.fill(284, G, 134, 296, G, 135, B.Wood); // librarian desk
    spots.bookshelf = v(282, G, 117);
    sign(['PUBLIC LIBRARY', 'SHHH'], 281.5, G + 7, 140.6, 0, '#5a1e1e', '#f5e6c8');
    place({ id: 'library', name: 'Smallville Public Library', kind: 'civic', door: v(281.5, G, 143), inside: box(263, G, 130, 301, G, 139), staffSpots: [v(290, G, 137)], jobs: ['Librarian'], hours: [9, 19], lines: ['Shhh.', 'That book is 30 years overdue.'] });
    // Basketball court.
    w.fill(262, G - 1, 70, 292, G - 1, 96, B.Asphalt);
    fenceLine(w, 262, 70, 292, 70, B.White, 1);
    w.fill(277, G - 1, 70, 277, G - 1, 96, B.White);
    w.fill(264, G, 83, 264, G + 4, 83, B.Metal);
    w.fill(290, G, 83, 290, G + 4, 83, B.Metal);
    // Construction site: a steel skeleton you can climb.
    w.fill(300, G - 1, 68, 342, G - 1, 100, B.Mud);
    for (let x = 304; x <= 336; x += 8) for (let z = 72; z <= 96; z += 8) w.fill(x, G, z, x, G + 19, z, B.Steel);
    for (let f = 1; f <= 4; f++) {
      const y = G + f * 5 - 1;
      for (let x = 304; x <= 336; x += 8) w.fill(x, y, 72, x, y, 96, B.Steel);
      for (let z = 72; z <= 96; z += 8) w.fill(304, y, z, 336, y, z, B.Steel);
      if (f < 4) w.fill(305, y, 73, 319, y, 87, B.Plank);
    }
    stairs(w, 338, 98, 'n', 5, G, B.Plank);
    for (let f = 1; f < 4; f++) w.fill(337, G + f * 5 - 1, 92, 339, G + f * 5 - 1, 97, B.Plank);
    fenceLine(w, 298, 66, 344, 66, B.Orange, 2);
    fenceLine(w, 298, 102, 344, 102, B.Orange, 2, [318, 324]);
    w.fill(340, G, 68, 341, G + 2, 69, B.WallBlue); // porta potty
    place({ id: 'construction', name: 'Construction Site', kind: 'work', door: v(321, G, 104), inside: box(300, G, 68, 342, G, 100), jobs: ['Construction Worker'] });
    place({ id: 'court', name: 'Basketball Court', kind: 'park', door: v(277, G, 98), inside: box(263, G, 71, 291, G, 95) });
  }

  // ================================================================ D1: water tower (x 356..434, z 66..144)
  const towerC = { x: 418, z: 100 };
  const towerTop = waterTower(w, towerC.x, towerC.z);
  building(w, { x0: 362, z0: 72, x1: 372, z1: 80, wall: B.Concrete, roof: 'flat', roofMat: B.Dark, winEvery: 0, doors: [{ side: 's', at: 366 }] });
  fenceLine(w, 358, 68, 434, 68, B.Metal, 1);
  sign(['SMALLVILLE', 'EST. 1887'], towerC.x + 0.5, towerTop + 6, towerC.z + 5.4, 0, '#7fb8e0', '#ffffff', 5, 2);
  place({ id: 'water-tower', name: 'Water Tower', kind: 'attraction', door: v(395, G, 108), inside: box(380, G, 90, 432, G, 140) });

  // ================================================================ E1: two backyards on Tower Rd (kiddie pool target)
  {
    const a = house(w, rng, { x0: 482, z0: 76, w: 14, d: 12, door: 'w' });
    const b = house(w, rng, { x0: 482, z0: 116, w: 14, d: 12, door: 'w' });
    // Backyards sit between the road and the houses here.
    fenceLine(w, 448, 70, 480, 70, B.White, 1);
    fenceLine(w, 448, 110, 480, 110, B.White, 1);
    fenceLine(w, 448, 142, 480, 142, B.White, 1);
    // Kiddie pool: 30 cm deep (one block of water).
    for (let x = 456; x <= 462; x++)
      for (let z = 96; z <= 104; z++) {
        const edge = x === 456 || x === 462 || z === 96 || z === 104;
        if (edge) w.set(x, G, z, B.Pink);
        else w.set(x, G - 1, z, B.Water);
      }
    zones.kiddiePool = box(457, G - 2, 97, 462, G + 1, 104);
    // Garden gnome and a grill.
    w.set(466, G, 90, B.RedPaint);
    w.fill(470, G, 120, 470, G + 1, 120, B.Black);
    place({ id: 'home-tower-1', name: '3 Tower Rd', kind: 'home', door: v(a.door.x, G, a.door.z), inside: box(483, G, 77, 494, G, 86) });
    place({ id: 'home-tower-2', name: '7 Tower Rd', kind: 'home', door: v(b.door.x, G, b.door.z), inside: box(483, G, 117, 494, G, 126) });
    for (let z = 74; z < 140; z += 20) mailbox(w, 446, z);
  }

  // ================================================================ B2: grocery + hardware (x 156..244, z 156..234)
  {
    // Placeholder for the Smallville Grocery stamp (its own thread builds the full store and its deaths).
    // Reserved lot: x 160..239, z 130..233, entrance and parking face Main St.
    const gx0 = 166, gz0 = 136, gx1 = 234, gz1 = 196;
    building(w, { x0: gx0, z0: gz0, x1: gx1, z1: gz1, wall: B.WallMint, trim: B.RoofGreen, floor: B.Tile, floorH: 7, roof: 'flat', roofMat: B.Concrete, winEvery: 0, storefront: 's', doors: [{ side: 's', at: 198, width: 4, height: 4 }] });
    for (let i = 0; i < 9; i++) shelfRow(w, rng, 172 + i * 6, 146, 173 + i * 6, 180, 3);
    for (let x = 172; x < 196; x += 5) w.fill(x, G, 188, x + 2, G, 189, B.Black);
    parkingLot(w, 160, 200, 239, 233);
    for (let x = 162; x < 236; x += 4) if (rng() < 0.45) car(w, rng, x, rng() < 0.5 ? 201 : 227, false);
    w.fill(196, G - 1, 197, 204, G - 1, 199, B.Sidewalk);
    sign(['SMALLMART GROCERY'], 200, G + 6, gz1 + 0.6, 0, '#2f8a4a', '#ffffff', 10, 1.8);
    zones.groceryLot = box(160, G, 130, 239.99, G + 30, 233.99);
    place({ id: 'grocery', name: 'SmallMart Grocery', kind: 'shop', door: v(200, G, 198.5), inside: inner(gx0, gz0, gx1, gz1), staffSpots: [v(174, G, 191), v(179, G, 191), v(184, G, 191)], jobs: ['Cashier', 'Stocker'], hours: [7, 22], sells: [{ item: 'bread', price: 3 }, { item: 'butter', price: 4 }, { item: 'spicy chips', price: 2 }, { item: 'peanuts', price: 3 }] });
  }

  // ================================================================ C1 (moved): hardware store replaces the old post office spot
  {
    // Hardware store.
    const hx0 = 310, hz0 = 108, hx1 = 342, hz1 = 140;
    building(w, { x0: hx0, z0: hz0, x1: hx1, z1: hz1, wall: B.Orange, trim: B.Dark, floor: B.Concrete, floorH: 6, roof: 'flat', roofMat: B.Dark, winEvery: 0, storefront: 's', doors: [{ side: 's', at: 324, width: 3, height: 4 }] });
    for (let i = 0; i < 3; i++) shelfRow(w, rng, 314 + i * 7, 112, 315 + i * 7, 128, 3);
    w.fill(334, G, 132, 339, G, 134, B.Wood); // nail gun demo table
    spots.nailgun = v(336.5, G + 1, 133.5);
    w.fill(313, G, 136, 318, G, 137, B.Black);
    spots.ladderShop = v(340.5, G, 113.5);
    w.fill(340, G, 110, 340, G + 4, 116, B.Metal); // ladders on display
    sign(["HANDY HANK'S HARDWARE"], 325.5, G + 5, hz1 + 0.6, 0, '#e07a10', '#1a1a1a', 8, 1.5);
    place({ id: 'hardware', name: "Handy Hank's Hardware", kind: 'shop', door: v(325.5, G, 143), inside: inner(hx0, hz0, hx1, hz1), staffSpots: [v(221, G, 196)], jobs: ['Cashier'], hours: [8, 18], sells: [{ item: 'duct tape', price: 6 }, { item: 'ladder', price: 80 }, { item: 'extension cord', price: 12 }, { item: 'rope', price: 15 }] });
  }

  // ================================================================ C2: Main Street shops (x 256..344, z 156..234)
  const shopRow: { id: string; name: string; x0: number; x1: number; wall: number; trim: number; kind: string; bg: string; fg: string; jobs?: string[]; sells?: { item: string; price: number }[] }[] = [
    { id: 'diner', name: 'Smallville Diner', x0: 258, x1: 276, wall: B.White, trim: B.RedPaint, kind: 'food', bg: '#d8302a', fg: '#ffffff', jobs: ['Diner Cook', 'Waitress'], sells: [{ item: 'pie', price: 5 }, { item: 'coffee', price: 2 }, { item: 'pancakes', price: 7 }] },
    { id: 'laundromat', name: 'Suds City Laundromat', x0: 279, x1: 294, wall: B.WallBlue, trim: B.White, kind: 'shop', bg: '#3b77c8', fg: '#ffffff' },
    { id: 'pharmacy', name: 'Rx Pharmacy', x0: 297, x1: 310, wall: B.White, trim: B.RoofGreen, kind: 'shop', bg: '#2f8a4a', fg: '#ffffff', jobs: ['Pharmacist'], sells: [{ item: 'cough syrup', price: 8 }, { item: 'EpiPen', price: 300 }] },
    { id: 'bakery', name: 'Sweet Cheeks Bakery', x0: 313, x1: 326, wall: B.Pink, trim: B.White, kind: 'food', bg: '#f59ac8', fg: '#5a1e3a', jobs: ['Baker'], sells: [{ item: 'donut', price: 2 }, { item: 'cake', price: 20 }] },
    { id: 'bank', name: 'First Bank of Smallville', x0: 329, x1: 344, wall: B.Marble, trim: B.Navy, kind: 'civic', bg: '#24305e', fg: '#e8d48a', jobs: ['Banker'] },
  ];
  const rowZ0 = 204, rowZ1 = 231;
  for (const s of shopRow) {
    const door = Math.floor((s.x0 + s.x1) / 2) - 1;
    building(w, { x0: s.x0, z0: rowZ0, x1: s.x1, z1: rowZ1, wall: s.wall, trim: s.trim, floor: s.id === 'diner' ? B.Tile : B.Linoleum, floorH: 6, roof: 'flat', roofMat: B.Dark, winEvery: 0, storefront: 's', doors: [{ side: 's', at: door, width: 2, height: 3 }, { side: 'n', at: s.x0 + 2, width: 1, height: 3 }] });
    w.fill(s.x0, G - 1, rowZ1 + 1, s.x1, G - 1, 234, B.Sidewalk);
    sign([s.name.toUpperCase()], (s.x0 + s.x1 + 1) / 2, G + 5, rowZ1 + 0.6, 0, s.bg, s.fg, Math.min(s.x1 - s.x0, 12), 1.2);
    place({ id: s.id, name: s.name, kind: s.kind, door: v(door + 1, G, rowZ1 + 2.5), inside: inner(s.x0, rowZ0, s.x1, rowZ1), staffSpots: [v(door + 1, G, rowZ0 + 6)], jobs: s.jobs, hours: s.id === 'diner' ? [6, 22] : [8, 20], sells: s.sells });
  }
  // Diner: counter with stools, booths, kitchen, the pie cooling on the back windowsill.
  w.fill(260, G, 216, 272, G, 216, B.RedPaint);
  for (let x = 260; x <= 272; x += 2) w.set(x, G, 218, B.Metal);
  for (let z = 220; z <= 228; z += 4) {
    w.fill(273, G, z, 275, G, z, B.RedPaint);
    w.fill(273, G, z + 2, 275, G, z + 2, B.RedPaint);
  }
  w.fill(260, G, 206, 274, G, 207, B.Metal); // kitchen line
  w.fill(262, G, 210, 263, G + 1, 210, B.Black); // deep fryer
  w.set(268, G + 2, rowZ0, B.Air); // open back window
  const cookie = v(266, G + 1, 216.5);
  spots.pieSill = v(268.5, G + 2.3, rowZ0 - 0.2);
  // Laundromat: washers and dryers, plus the big industrial dryer.
  for (let x = 281; x <= 292; x += 2) w.fill(x, G, 206, x, G + 1, 206, B.White);
  for (let x = 281; x <= 292; x += 2) w.fill(x, G, 212, x, G + 1, 212, B.White);
  w.fill(284, G, 222, 288, G + 3, 226, B.Metal);
  w.fill(285, G + 1, 222, 287, G + 2, 222, B.Black);
  spots.dryer = v(286.5, G, 220.5);
  // Pharmacy counter, bakery display, bank vault and teller line.
  w.fill(299, G, 210, 308, G, 210, B.White);
  w.fill(315, G, 214, 324, G, 214, B.Glass);
  w.fill(331, G, 212, 342, G, 212, B.Marble);
  w.fill(331, G, 205, 342, G + 4, 208, B.Metal);
  // Back of the block: the Rusty Nail bar and the cinema face Park St.
  building(w, { x0: 262, z0: 160, x1: 292, z1: 184, wall: B.Brick, trim: B.Dark, floor: B.Plank, roof: 'flat', roofMat: B.Dark, winEvery: 4, doors: [{ side: 'n', at: 276 }] });
  w.fill(266, G, 172, 288, G, 172, B.Wood);
  sign(['THE RUSTY NAIL'], 277, G + 4.5, 159.4, Math.PI, '#3a1a10', '#ff9a3a', 6, 1.2);
  place({ id: 'bar', name: 'The Rusty Nail', kind: 'bar', door: v(277, G, 157.5), inside: inner(262, 160, 292, 184), staffSpots: [v(277, G, 174)], jobs: ['Bartender'], hours: [16, 2] });
  building(w, { x0: 298, z0: 160, x1: 342, z1: 192, wall: B.Purple, trim: B.Yellow, floor: B.Carpet, floorH: 8, roof: 'flat', roofMat: B.Dark, winEvery: 0, doors: [{ side: 'n', at: 318, width: 4, height: 4 }] });
  for (let z = 170; z < 190; z += 3) w.fill(304, G, z, 336, G, z, B.Carpet);
  w.fill(302, G + 1, 191, 338, G + 6, 191, B.White); // screen
  sign(['CINEMA', 'NOW SHOWING: FINAL DESTINATION 9'], 320, G + 7, 159.4, Math.PI, '#ffe680', '#7a1e1e', 9, 2);
  place({ id: 'cinema', name: 'Smallville Cinema', kind: 'attraction', door: v(320, G, 157.5), inside: inner(298, 160, 342, 192), hours: [14, 24] });
  for (let x = 262; x < 342; x += 18) trashCan(w, x, 198); // the alley's dumpsters
  w.fill(262, G, 194, 266, G + 1, 196, B.RoofGreen);

  // ================================================================ D2: Town Hall + DMV + bus stop (x 356..434, z 156..234)
  {
    const tx0 = 364, tz0 = 186, tx1 = 426, tz1 = 222;
    building(w, { x0: tx0, z0: tz0, x1: tx1, z1: tz1, floors: 2, floorH: 6, wall: B.Marble, trim: B.Brick, floor: B.Tile, roof: 'flat', roofMat: B.Dark, winEvery: 3, doors: [{ side: 's', at: 393, width: 4, height: 4 }] });
    // Columns along the front and steps.
    for (let x = tx0 + 2; x <= tx1 - 2; x += 4) w.fill(x, G, tz1 + 2, x, G + 9, tz1 + 2, B.Marble);
    w.fill(tx0 + 1, G + 10, tz1 + 1, tx1 - 1, G + 10, tz1 + 3, B.Marble);
    w.fill(tx0, G - 1, tz1 + 1, tx1, G - 1, 234, B.Concrete);
    // Clock tower.
    w.fill(390, G + 12, 198, 400, G + 22, 208, B.Brick);
    w.fill(391, G + 12, 199, 399, G + 21, 207, B.Air);
    for (let i = 0; i < 4; i++) w.fill(390 + i, G + 23 + i, 198 + i, 400 - i, G + 23 + i, 208 - i, B.RoofGreen);
    sign(['XII'], 395.5, G + 19, 208.6, 0, '#ffffff', '#111111', 3, 3);
    // DMV inside: take-a-number machine, rows of chairs, the counter.
    w.fill(368, G, 190, 400, G, 191, B.Wood);
    for (let z = 198; z <= 214; z += 3) w.fill(370, G, z, 388, G, z, B.WallBlue);
    w.fill(392, G, 214, 392, G + 1, 214, B.RedPaint);
    spots.dmv = v(392.5, G, 216);
    stairs(w, 420, 216, 'n', 6, G, B.Marble);
    // Statue of the founder and the bus stop shelter.
    w.fill(374, G, 226, 378, G + 1, 230, B.Marble);
    w.fill(376, G + 2, 228, 376, G + 5, 228, B.Steel);
    w.fill(375, G + 4, 228, 377, G + 4, 228, B.Steel);
    w.fill(376, G + 6, 228, 376, G + 6, 228, B.Steel);
    w.fill(404, G, 231, 412, G, 231, B.Glass);
    w.fill(404, G, 231, 404, G + 3, 233, B.Glass);
    w.fill(412, G, 231, 412, G + 3, 233, B.Glass);
    w.fill(404, G + 4, 230, 412, G + 4, 234, B.Metal);
    bench(w, 406, 232);
    sign(['BUS', 'TO THE CITY · BEACH · WILDERNESS'], 408.5, G + 5.6, 234.6, 0, '#1a5aa8', '#ffffff', 4, 1);
    sign(['TOWN HALL', 'DMV · SECOND FLOOR WINDOW 1 OF 1'], 395.5, G + 11.5, tz1 + 3.6, 0, '#e8e4dc', '#24305e', 10, 1.6);
    place({ id: 'dmv', name: 'Town Hall & DMV', kind: 'civic', door: v(395, G, 225), inside: inner(tx0, tz0, tx1, tz1), staffSpots: [v(372, G, 192), v(380, G, 192), v(388, G, 192)], jobs: ['Clerk', 'Mayor'], hours: [9, 16], lines: ['Take a number.', 'Now serving... number four.'] });
    place({ id: 'bus-stop', name: 'Main Street Bus Stop', kind: 'transit', door: v(408.5, G, 235.5), spots: [v(406.5, G + 1, 232.5), v(408.5, G + 1, 232.5)] });
    // Post office north of town hall, facing Park St.
    building(w, { x0: 362, z0: 158, x1: 390, z1: 180, wall: B.White, trim: B.Navy, floor: B.Linoleum, roof: 'flat', roofMat: B.Navy, winEvery: 3, doors: [{ side: 'n', at: 375 }] });
    w.fill(366, G, 168, 386, G, 168, B.Wood);
    sign(['US MAIL'], 376, G + 5.5, 157.4, Math.PI, '#24305e', '#ffffff', 4, 1);
    place({ id: 'post-office', name: 'Post Office', kind: 'civic', door: v(376, G, 156.5), inside: inner(362, 158, 390, 180), staffSpots: [v(376, G, 170)], jobs: ['Mail Carrier'], hours: [8, 17], patrol: [v(255, G, 146), v(445, G, 146), v(445, G, 235), v(155, G, 235), v(155, G, 330), v(345, G, 334)] });
    parkingLot(w, 396, 158, 430, 180);
    for (let x = 398; x < 428; x += 4) if (rng() < 0.4) car(w, rng, x, 159, false);
  }

  // ================================================================ E2: Honest Al's used cars + billboard (x 446..505, z 156..234)
  {
    parkingLot(w, 446, 176, 506, 234, false);
    const colors = [B.RedPaint, B.WallBlue, B.Yellow, B.White, B.Black, B.RoofGreen, B.Orange, B.Purple, B.Pink];
    for (let z = 182; z < 230; z += 6)
      for (const x of [452, 470, 490]) car(w, rng, x, z, true, pick(rng, colors));
    building(w, { x0: 486, z0: 158, x1: 504, z1: 172, wall: B.White, trim: B.RedPaint, floor: B.Linoleum, roof: 'flat', roofMat: B.Metal, winEvery: 2, doors: [{ side: 'w', at: 164 }] });
    w.fill(490, G, 166, 496, G, 167, B.Wood);
    for (let x = 448; x < 504; x += 4) w.fill(x, G, 175, x, G + 3, 175, B.Metal); // bunting poles
    spots.tubeMan = v(466.5, G, 232.5);
    sign(["HONEST AL'S", 'USED CARS · NO REFUNDS'], 476, G + 5, 175.4, 0, '#f5c400', '#c01818', 10, 2);
    place({ id: 'car-lot', name: "Honest Al's Used Cars", kind: 'shop', door: v(484, G, 165), inside: box(447, G, 177, 505, G, 233), staffSpots: [v(470, G, 205)], jobs: ['Car Salesman'], hours: [9, 19], sells: [{ item: 'used car', price: 500 }, { item: 'convertible', price: 4000 }, { item: 'minivan', price: 1500 }] });
    w.fill(462, G, 160, 462, G + 7, 160, B.Wood);
    w.fill(474, G, 160, 474, G + 7, 160, B.Wood);
  }
  const billboard = v(468.5, G + 9, 160.5);

  // ================================================================ B3: police, fire station, apartments (x 156..244, z 246..324)
  const stationBox = { x0: 158, z0: 250, x1: 186, z1: 274 };
  {
    building(w, { ...stationBox, wall: B.WallBlue, trim: B.Navy, floor: B.Linoleum, floorH: 6, roof: 'flat', roofMat: B.Dark, winEvery: 3, doors: [{ side: 'e', at: 261, width: 3, height: 3 }] });
    w.fill(163, G, 253, 167, G, 254, B.Wood); // desk
    // Holding cell with bars.
    for (let x = 160; x <= 170; x += 2) w.fill(x, G, 266, x, G + 4, 266, B.Metal);
    w.fill(170, G, 267, 170, G + 4, 273, B.Metal);
    w.fill(161, G, 270, 163, G, 272, B.White); // cot
    w.fill(187, G - 1, 260, 194, G - 1, 264, B.Sidewalk);
    parkingLot(w, 192, 250, 214, 280, false);
    car(w, rng, 196, 252, true, B.Black);
    car(w, rng, 196, 258, true, B.White);
    place({ id: 'police', name: 'Smallville Police', kind: 'civic', door: v(189.5, G, 262.5), inside: inner(stationBox.x0, stationBox.z0, stationBox.x1, stationBox.z1), staffSpots: [v(165, G, 255), v(176, G, 255)], jobs: ['Cop'], allowedJobs: ['Cop'], patrol: [v(160, G, 245), v(345, G, 245), v(345, G, 335), v(160, G, 335)] });
    // Fire station with two bays.
    building(w, { x0: 218, z0: 248, x1: 244, z1: 276, wall: B.Brick, trim: B.White, floor: B.Concrete, floorH: 7, roof: 'flat', roofMat: B.Dark, winEvery: 4, doors: [{ side: 'n', at: 221, width: 7, height: 5 }, { side: 'n', at: 233, width: 7, height: 5 }] });
    for (const x of [222, 234]) {
      w.fill(x, G, 254, x + 4, G + 2, 266, B.RedPaint);
      w.fill(x, G + 3, 256, x + 4, G + 3, 264, B.Metal);
    }
    w.fill(240, G, 250, 240, G + 6, 250, B.Metal); // fire pole
    sign(['FIRE DEPT', 'STATION 1'], 231.5, G + 6.2, 247.4, Math.PI, '#b0201a', '#ffffff', 8, 1.4);
    place({ id: 'fire-station', name: 'Fire Station 1', kind: 'civic', door: v(231, G, 245.5), inside: inner(218, 248, 244, 276), jobs: ['Firefighter'], allowedJobs: ['Firefighter'] });
    // Elm Street Apartments: three floors, a piano hanging from the roof beam.
    const ax0 = 160, az0 = 290, ax1 = 194, az1 = 320;
    const ap = building(w, { x0: ax0, z0: az0, x1: ax1, z1: az1, floors: 3, floorH: 5, wall: B.Brick, trim: B.White, floor: B.Carpet, roof: 'flat', roofMat: B.Dark, winEvery: 3, doors: [{ side: 's', at: 176, width: 2 }, { side: 'e', at: 300, width: 2, floor: 2 }] });
    stairs(w, 162, 292, 's', 5, G, B.Plank);
    stairs(w, 166, 296, 's', 5, G + 5, B.Plank);
    for (let f = 0; f < 3; f++) furnish(w, rng, 170, 292, 192, 300, f === 0 ? 'living' : 'bedroom');
    // Third-floor balcony and roof beam over the sidewalk.
    w.fill(ax1 + 1, G + 9, 298, ax1 + 3, G + 9, 304, B.Plank);
    w.fill(ax1, ap.top + 1, 301, ax1 + 8, ap.top + 1, 301, B.Wood);
    spots.pianoHang = v(ax1 + 6.5, G + 13, 301.5);
    spots.pianoX = v(ax1 + 6.5, G, 301.5);
    for (let i = -1; i <= 1; i++) {
      w.set(ax1 + 6 + i, G - 1, 301 + i, B.RedPaint);
      w.set(ax1 + 6 + i, G - 1, 301 - i, B.RedPaint);
    }
    spots.movers = v(ax1 + 12.5, G, 312.5);
    sign(['ELM STREET APTS'], 177, G + 15.5, az1 + 0.6, 0, '#5a1e1e', '#f5e6c8', 7, 1.2);
    place({ id: 'apartments', name: 'Elm Street Apartments', kind: 'home', door: v(177, G, az1 + 2.5), inside: inner(ax0, az0, ax1, az1), residents: 8 });
    // Two houses facing Church St.
    for (const x0 of [206, 226]) {
      const h = house(w, rng, { x0, z0: 304, w: 14, d: 12, door: 's' });
      place({ id: `home-church-${x0}`, name: `${x0 - 180} Church St`, kind: 'home', door: v(h.door.x, G, h.door.z), inside: box(x0 + 1, G, 305, x0 + 12, G, 314) });
      mailbox(w, x0 + 2, 324);
    }
  }

  // ================================================================ C3: gas station, Duke's Garage, fireworks (x 256..344, z 246..324)
  {
    // Gas-N-Grub: apron, canopy, two pump islands, store.
    w.fill(256, G - 1, 246, 300, G - 1, 280, B.Concrete);
    for (const [x, z] of [[262, 252], [290, 252], [262, 270], [290, 270]]) w.fill(x, G, z, x, G + 5, z, B.White);
    w.fill(260, G + 6, 250, 292, G + 6, 272, B.RedPaint);
    for (const x of [270, 282]) {
      w.fill(x - 1, G - 1, 258, x + 1, G - 1, 264, B.Concrete);
      w.fill(x, G, 260, x, G + 1, 260, B.RedPaint);
      w.fill(x, G, 264, x, G + 1, 264, B.RedPaint);
    }
    spots.pump = v(270.5, G, 262);
    spots.pump2 = v(282.5, G, 262);
    building(w, { x0: 260, z0: 282, x1: 292, z1: 300, wall: B.White, trim: B.RedPaint, floor: B.Linoleum, roof: 'flat', roofMat: B.Dark, winEvery: 0, storefront: 'n', doors: [{ side: 'n', at: 275, width: 2 }] });
    w.fill(264, G, 288, 272, G, 288, B.Wood); // counter
    w.fill(280, G, 286, 290, G + 1, 286, B.Shelf);
    w.fill(262, G, 296, 270, G + 2, 298, B.Ice); // drinks cooler
    spots.sushi = v(266.5, G + 1, 289);
    spots.cigars = v(270.5, G + 1, 289);
    sign(['GAS-N-GRUB', 'SUSHI · BAIT · LOTTO'], 276, G + 7.6, 249.4, Math.PI, '#d8302a', '#ffe000', 8, 1.6);
    place({ id: 'gas-station', name: 'Gas-N-Grub', kind: 'shop', door: v(276, G, 279.5), inside: inner(260, 282, 292, 300), staffSpots: [v(268, G, 290)], jobs: ['Cashier'], hours: [0, 24], sells: [{ item: 'cigar', price: 6 }, { item: 'sushi', price: 4 }, { item: 'lotto ticket', price: 1 }] });
    // Duke's Garage: big bay door on Main St, workbench, shelf, car lift.
    building(w, { x0: 306, z0: 248, x1: 340, z1: 278, wall: B.Brick, trim: B.Dark, floor: B.Concrete, floorH: 7, roof: 'flat', roofMat: B.Dark, winEvery: 4, doors: [{ side: 'n', at: 316, width: 9, height: 5 }] });
    w.fill(308, G, 272, 316, G, 276, B.Wood);
    w.fill(308, G + 3, 276, 318, G + 3, 276, B.Plank);
    w.fill(326, G, 258, 326, G + 4, 258, B.Metal);
    w.fill(334, G, 258, 334, G + 4, 258, B.Metal);
    w.fill(326, G + 3, 258, 334, G + 3, 270, B.Steel);
    car(w, rng, 328, 262, false, B.Orange);
    sign(["DUKE'S GARAGE"], 320.5, G + 6, 247.4, Math.PI, '#20304a', '#ffcc33', 8, 1.5);
    place({ id: 'garage', name: "Duke's Garage", kind: 'work', door: v(320, G, 245.5), inside: inner(306, 248, 340, 278), staffSpots: [v(312, G, 270)], jobs: ['Mechanic'] });
    // Uncle Boomer's Fireworks shack.
    building(w, { x0: 300, z0: 304, x1: 320, z1: 316, wall: B.RedPaint, trim: B.Yellow, floor: B.Plank, floorH: 4, roof: 'flat', roofMat: B.Yellow, winEvery: 2, doors: [{ side: 's', at: 309, width: 2 }] });
    w.fill(302, G, 306, 318, G, 306, B.Shelf);
    for (let x = 302; x <= 318; x++) w.set(x, G + 1, 306, pick(rng, [B.RedPaint, B.WallBlue, B.Yellow, B.Purple]));
    spots.finale = v(330.5, G, 312.5);
    w.fill(326, G - 1, 308, 334, G - 1, 316, B.Concrete);
    sign(["UNCLE BOOMER'S", 'FIREWORKS · 100% LEGAL-ISH'], 310, G + 5.6, 316.6, 0, '#ffe000', '#c01818', 7, 1.6);
    place({ id: 'fireworks', name: "Uncle Boomer's Fireworks", kind: 'shop', door: v(310, G, 318.5), inside: inner(300, 304, 320, 316), staffSpots: [v(310, G, 308)], jobs: ['Cashier'], hours: [10, 22], sells: [{ item: 'sparklers', price: 5 }, { item: 'Grand Finale', price: 250 }] });
    // A house on the corner.
    const h = house(w, rng, { x0: 262, z0: 306, w: 14, d: 12, door: 's' });
    place({ id: 'home-church-262', name: '82 Church St', kind: 'home', door: v(h.door.x, G, h.door.z), inside: box(263, G, 307, 274, G, 316) });
  }

  // ================================================================ D3: church, bell tower, BBQ lawn (x 356..434, z 246..324)
  {
    building(w, { x0: 366, z0: 252, x1: 392, z1: 300, wall: B.White, trim: B.Wood, floor: B.Plank, floorH: 9, roof: 'gableZ', roofMat: B.Dark, window: B.Purple, winEvery: 4, doors: [{ side: 'n', at: 377, width: 4, height: 5 }] });
    for (let z = 258; z <= 288; z += 3) {
      w.fill(369, G, z, 376, G, z, B.Wood);
      w.fill(382, G, z, 389, G, z, B.Wood);
    }
    w.fill(374, G, 293, 384, G, 297, B.Carpet);
    w.fill(377, G + 1, 295, 381, G + 1, 295, B.Marble); // altar
    // Bell tower: hollow, a ladder of steps inside, the bell hangs at the top.
    const bx0 = 398, bz0 = 252, bx1 = 406, bz1 = 260;
    w.fill(bx0, G, bz0, bx1, G + 24, bz1, B.White);
    w.fill(bx0 + 1, G, bz0 + 1, bx1 - 1, G + 23, bz1 - 1, B.Air);
    w.fill(bx0 + 3, G, bz0, bx0 + 4, G + 2, bz0, B.Air); // door (locked except on Sunday)
    for (let i = 0; i < 18; i++) {
      const k = i % 4;
      const x = k === 0 ? bx0 + 1 + (i % 3) : k === 1 ? bx1 - 1 : k === 2 ? bx1 - 1 - (i % 3) : bx0 + 1;
      const z = k === 0 ? bz0 + 1 : k === 1 ? bz0 + 1 + (i % 3) : k === 2 ? bz1 - 1 : bz1 - 1 - (i % 3);
      w.set(x, G + i, z, B.Plank);
    }
    // Belfry: open arches at the top, platform under the bell.
    w.fill(bx0, G + 19, bz0 + 2, bx1, G + 22, bz1 - 2, B.Air);
    w.fill(bx0 + 2, G + 19, bz0, bx1 - 2, G + 22, bz1, B.Air);
    w.fill(bx0 + 1, G + 18, bz0 + 1, bx1 - 1, G + 18, bz1 - 1, B.Plank);
    w.fill(bx0 + 4, G + 18, bz0 + 4, bx0 + 4, G + 18, bz0 + 4, B.Air);
    for (let i = 0; i < 6; i++) w.fill(bx0 - 1 + i, G + 25 + i, bz0 - 1 + i, bx1 + 1 - i, G + 25 + i, bz1 + 1 - i, B.Dark);
    w.fill(bx0 + 4, G + 31, bz0 + 4, bx0 + 4, G + 33, bz0 + 4, B.Yellow); // cross
    spots.bell = v(bx0 + 4.5, G + 19, bz0 + 4.5);
    spots.bellDoor = v(bx0 + 4, G, bz0 - 1.5);
    zones.belfry = box(bx0 + 1, G + 18, bz0 + 1, bx1, G + 24, bz1);
    sign(['FIRST CHURCH', 'OF SMALLVILLE'], 379, G + 7, 251.4, Math.PI, '#ffffff', '#2a2a6a', 6, 1.4);
    // BBQ lawn: picnic tables, grill, hot dog table, bouncy castle.
    for (let z = 280; z < 318; z += 8) for (const x of [400, 412]) {
      w.fill(x, G, z, x + 5, G, z + 1, B.Wood);
      w.fill(x, G, z, x + 5, G, z, B.RedPaint); // red tablecloths
    }
    spots.tablecloth = v(402.5, G + 1, 296.5);
    w.fill(424, G, 282, 426, G, 284, B.Black);
    w.fill(424, G + 1, 282, 426, G + 1, 284, B.Metal);
    w.fill(414, G, 272, 422, G, 273, B.White);
    spots.hotdogs = v(418.5, G + 1, 272.5);
    for (let x = 414; x <= 430; x++)
      for (let z = 304; z <= 320; z++) {
        const e = x === 414 || x === 430 || z === 304 || z === 320;
        w.set(x, G, z, B.Pink);
        if (e) w.fill(x, G + 1, z, x, G + 3, z, (x + z) % 4 < 2 ? B.Yellow : B.WallBlue);
      }
    for (const [x, z] of [[414, 304], [430, 304], [414, 320], [430, 320]]) w.fill(x, G + 4, z, x, G + 6, z, B.RedPaint);
    zones.bouncy = box(415, G, 305, 429.99, G + 2, 319.99);
    place({ id: 'church', name: 'First Church of Smallville', kind: 'worship', door: v(379, G, 249.5), inside: inner(366, 252, 392, 300), staffSpots: [v(379, G, 293)], jobs: ['Pastor'], hours: [8, 20] });
    place({ id: 'bbq', name: 'Church BBQ', kind: 'food', door: v(410, G, 276), inside: box(398, G, 276, 432, G, 322), staffSpots: [v(425, G, 286)], sells: [{ item: 'hot dog', price: 1 }], hours: [11, 18] });
  }

  // ================================================================ E3: Smallville General Hospital (x 446..505, z 246..324)
  {
    // Placeholder for the hospital stamp: reserved lot x 446..511, z 250..301 (64 x 48 building at origin 446, G, 250).
    const hx0 = 446, hz0 = 250, hx1 = 509, hz1 = 297;
    building(w, { x0: hx0, z0: hz0, x1: hx1, z1: hz1, floors: 3, floorH: 6, wall: B.White, trim: B.WallBlue, floor: B.Tile, roof: 'flat', roofMat: B.Concrete, winEvery: 2, doors: [{ side: 'n', at: 476, width: 4, height: 4 }] });
    zones.hospitalLot = box(446, G, 247, 511.99, G + 42, 301.99);
    // Reception, waiting room, ward beds with IV stands and heart monitors on every floor.
    w.fill(468, G, 256, 482, G, 257, B.White);
    for (let z = 260; z <= 268; z += 4) w.fill(454, G, z, 464, G, z, B.WallBlue);
    for (let f = 0; f < 3; f++) {
      const y = G + f * 6;
      for (let x = 486; x <= 498; x += 4) {
        w.fill(x, y, 280, x + 1, y, 284, B.White);
        w.set(x + 2, y, 283, B.Metal);
        w.set(x + 2, y + 1, 283, B.Metal);
        w.set(x - 1, y + 1, 280, B.Black); // monitor
      }
      stairs(w, 452, 290, 'e', 6, y, B.Linoleum);
    }
    spots.hospitalBed = v(490.5, G, 286);
    spots.stairsTop = v(455.5, G + 12, 291);
    // Helipad on the roof.
    w.fill(468, G + 18, 266, 484, G + 18, 282, B.Concrete);
    w.fill(472, G + 18, 270, 472, G + 18, 278, B.Yellow);
    w.fill(480, G + 18, 270, 480, G + 18, 278, B.Yellow);
    w.fill(472, G + 18, 274, 480, G + 18, 274, B.Yellow);
    // Ambulance bay and parking.
    parkingLot(w, 446, 302, 506, 324);
    w.fill(452, G, 304, 456, G + 2, 311, B.White);
    w.fill(452, G + 2, 304, 456, G + 2, 304, B.RedPaint);
    sign(['SMALLVILLE GENERAL', 'EMERGENCY'], 478, G + 14, hz0 - 0.6, Math.PI, '#ffffff', '#c01818', 10, 2);
    spots.ambulance = v(458, G, 307);
    place({ id: 'hospital', name: 'Smallville General Hospital', kind: 'civic', door: v(478, G, 247.5), inside: inner(hx0, hz0, hx1, hz1), staffSpots: [v(472, G, 258), v(478, G, 258), v(492, G, 278)], jobs: ['Nurse', 'Doctor', 'EMT'], tags: ['hospital'] });
  }

  // ================================================================ B4: school (x 156..244, z 336..414)
  {
    const sx0 = 158, sz0 = 340, sx1 = 210, sz1 = 372;
    building(w, { x0: sx0, z0: sz0, x1: sx1, z1: sz1, floors: 2, floorH: 5, wall: B.Brick, trim: B.White, floor: B.Linoleum, roof: 'flat', roofMat: B.Dark, winEvery: 2, doors: [{ side: 'n', at: 182, width: 4, height: 3 }] });
    // Hallway and classrooms with chalkboards and desks.
    for (const x of [172, 196]) for (let y = G; y < G + 4; y++) for (let z = sz0 + 1; z < sz1; z++) if (z !== 356 && z !== 357) w.set(x, y, z, B.Brick);
    for (const [x0, x1] of [[160, 170], [198, 208]]) {
      w.fill(x0, G + 1, sz1 - 1, x1, G + 2, sz1 - 1, B.Chalk);
      for (let x = x0 + 1; x < x1; x += 2) for (let z = sz0 + 3; z < sz1 - 4; z += 3) w.set(x, G, z, B.Plank);
    }
    stairs(w, 184, 366, 'n', 5, G, B.Linoleum);
    // Gym with the dodgeball game.
    building(w, { x0: 214, z0: 340, x1: 244, z1: 372, wall: B.WallBlue, trim: B.White, floor: B.Plank, floorH: 9, roof: 'flat', roofMat: B.Dark, winEvery: 0, doors: [{ side: 'w', at: 354, width: 2 }] });
    w.fill(229, G - 1, 341, 229, G - 1, 371, B.RedPaint);
    for (let z = 344; z <= 368; z += 6) w.fill(242, G, z, 243, G + 2, z + 3, B.Plank); // bleachers
    spots.dodgeball = v(222.5, G, 356.5);
    zones.dodgeCourt = box(215, G, 341, 228.9, G + 4, 371);
    // Field, track and playground.
    w.fill(160, G - 1, 380, 242, G - 1, 414, B.Grass);
    for (let x = 160; x <= 242; x++) for (const z of [380, 414]) w.set(x, G - 1, z, B.RedPaint);
    for (let z = 380; z <= 414; z++) for (const x of [160, 242]) w.set(x, G - 1, z, B.RedPaint);
    for (const x of [166, 236]) w.fill(x, G, 393, x, G + 2, 401, B.White);
    w.fill(214, G - 1, 376, 244, G - 1, 378, B.Sand);
    sign(['SMALLVILLE SCHOOL', 'HOME OF THE FIGHTING POSSUMS'], 184, G + 8, 339.4, Math.PI, '#5a1e1e', '#f5c400', 10, 1.8);
    place({ id: 'school', name: 'Smallville School', kind: 'work', door: v(184, G, 337.5), inside: inner(sx0, sz0, sx1, sz1), staffSpots: [v(165, G, 368), v(203, G, 368)], jobs: ['Teacher', 'Janitor'], hours: [7, 16] });
    place({ id: 'gym', name: 'School Gym', kind: 'attraction', door: v(212, G, 355), inside: inner(214, 340, 244, 372) });
    place({ id: 'field', name: 'Possum Field', kind: 'park', door: v(200, G, 377), inside: box(162, G, 382, 240, G, 412) });
  }

  // ================================================================ C4: Shady Acres trailer park (x 256..344, z 336..414)
  {
    w.fill(256, G - 1, 372, 344, G - 1, 376, B.Gravel);
    w.fill(298, G - 1, 336, 302, G - 1, 414, B.Gravel);
    let n = 1;
    for (const x0 of [260, 306])
      for (const z0 of [340, 356, 380, 396]) {
        const wall = pick(rng, [B.White, B.WallMint, B.Yellow, B.WallBlue, B.Pink]);
        building(w, { x0, z0, x1: x0 + 22, z1: z0 + 8, wall, trim: B.Metal, floor: B.Linoleum, floorH: 4, roof: 'flat', roofMat: B.Metal, winEvery: 3, doors: [{ side: x0 === 260 ? 'e' : 'w', at: z0 + 3, width: 1 }] });
        furnish(w, rng, x0 + 1, z0 + 1, x0 + 10, z0 + 7, 'living');
        furnish(w, rng, x0 + 12, z0 + 1, x0 + 21, z0 + 7, 'bedroom');
        const d = x0 === 260 ? v(x0 + 24.5, G, z0 + 3.5) : v(x0 - 1.5, G, z0 + 3.5);
        if (rng() < 0.5) w.fill(x0 + 2, G, z0 + 10, x0 + 5, G, z0 + 10, B.Black); // a car on blocks
        place({ id: `trailer-${n}`, name: `Shady Acres Lot ${n}`, kind: 'home', door: d, inside: box(x0 + 1, G, z0 + 1, x0 + 21, G, z0 + 7) });
        n++;
      }
    sign(['SHADY ACRES', 'MOBILE HOME PARK'], 300, G + 3.5, 335.4, Math.PI, '#4a6a2a', '#ffffff', 6, 1.4);
  }

  // ================================================================ C5: cemetery (x 256..344, z 426..505)
  {
    fenceLine(w, 258, 428, 342, 428, B.Black, 2, [297, 303]);
    fenceLine(w, 258, 504, 342, 504, B.Black, 2);
    fenceLine(w, 258, 428, 258, 504, B.Black, 2);
    fenceLine(w, 342, 428, 342, 504, B.Black, 2);
    w.fill(298, G - 1, 429, 302, G - 1, 500, B.Gravel);
    for (let x = 264; x < 338; x += 5)
      for (let z = 436; z < 498; z += 6) {
        if (x > 294 && x < 306) continue;
        if (rng() < 0.85) w.fill(x, G, z, x, G + (rng() < 0.3 ? 2 : 1), z, B.Tombstone);
      }
    building(w, { x0: 292, z0: 484, x1: 308, z1: 498, wall: B.Marble, trim: B.Tombstone, floor: B.Marble, roof: 'gable', roofMat: B.Tombstone, winEvery: 0, doors: [{ side: 'n', at: 299, width: 2 }] });
    // An open grave, waiting.
    w.fill(316, G - 3, 470, 317, G - 1, 474, B.Air);
    w.fill(318, G, 470, 318, G, 474, B.Dirt);
    spots.openGrave = v(317, G - 3, 472);
    for (const [x, z] of [[262, 432], [338, 432], [262, 500], [338, 500]]) tops.push(tree(w, rng, x, z));
    sign(['SMALLVILLE CEMETERY', 'PLOTS AVAILABLE · ASK ABOUT FINANCING'], 300, G + 3.5, 427.4, Math.PI, '#2a2a2a', '#d8d8d8', 7, 1.4);
    place({ id: 'cemetery', name: 'Smallville Cemetery', kind: 'park', door: v(300, G, 424.5), inside: box(259, G, 429, 341, G, 503), staffSpots: [v(314, G, 470)], jobs: ['Gravedigger'] });
  }

  // ================================================================ SUBURBS (x 356..505, z 336..505) — includes 12 Maple St
  {
    const lots: { x0: number; z0: number; door: Side }[] = [];
    // North side of Maple St (backing onto Church St lots) and south side.
    for (let x0 = 358; x0 < 500; x0 += 24) {
      if (x0 + 14 > 434 && x0 < 446) continue;
      lots.push({ x0, z0: 352, door: 's' });
      lots.push({ x0, z0: 386, door: 'n' });
    }
    // South of School St.
    for (let x0 = 358; x0 < 500; x0 += 24) {
      if (x0 + 14 > 434 && x0 < 446) continue;
      lots.push({ x0, z0: 432, door: 'n' });
    }
    let num = 2;
    for (const lot of lots) {
      const isMaple12 = lot.x0 === 358 && lot.z0 === 352;
      const h = house(w, rng, { x0: lot.x0, z0: lot.z0, w: 16, d: 13, door: lot.door, floors: rng() < 0.3 ? 2 : 1 });
      const street = lot.z0 === 432 ? 'School St' : 'Maple St';
      const addr = isMaple12 ? 12 : num;
      num += 2;
      if (num === 12) num += 2;
      // Front path and mailbox.
      const fz = lot.door === 's' ? lot.z0 + 13 : lot.z0 - 1;
      const sz = lot.door === 's' ? 369 : lot.z0 === 432 ? 425 : 381;
      w.fill(lot.x0 + 8, G - 1, Math.min(fz, sz), lot.x0 + 9, G - 1, Math.max(fz, sz), B.Sidewalk);
      mailbox(w, lot.x0 + 11, sz);
      // Backyard: fence, a tree, sometimes a pool, a garden or a shed.
      const by0 = lot.door === 's' ? lot.z0 - 14 : lot.z0 + 14;
      const by1 = lot.door === 's' ? lot.z0 - 2 : lot.z0 + 26;
      if (by0 >= 337 && by1 <= 505) {
        fenceLine(w, lot.x0 - 1, Math.min(by0, by1), lot.x0 + 17, Math.min(by0, by1), B.White, 1);
        fenceLine(w, lot.x0 - 1, Math.min(by0, by1), lot.x0 - 1, Math.max(by0, by1), B.White, 1);
        fenceLine(w, lot.x0 + 17, Math.min(by0, by1), lot.x0 + 17, Math.max(by0, by1), B.White, 1);
        const r = rng();
        const yz = Math.min(by0, by1) + 2;
        if (r < 0.25 && !isMaple12) {
          for (let x = lot.x0 + 3; x <= lot.x0 + 12; x++) for (let z = yz; z <= yz + 6; z++) for (let y = G - 3; y < G; y++) w.set(x, y, z, B.Water);
          fenceLine(w, lot.x0 + 2, yz - 1, lot.x0 + 13, yz - 1, B.Tile, 1);
        } else if (r < 0.5) flowerBed(w, rng, lot.x0 + 2, yz, lot.x0 + 8, yz + 4);
        else if (r < 0.7) building(w, { x0: lot.x0 + 10, z0: yz, x1: lot.x0 + 15, z1: yz + 4, wall: B.Plank, roof: 'flat', roofMat: B.RoofBrown, floorH: 3, winEvery: 0, doors: [{ side: 'w', at: yz + 1, width: 1 }] });
        tops.push(tree(w, rng, lot.x0 + 14, Math.max(by0, by1) - 2));
      }
      place({ id: `home-${street.split(' ')[0].toLowerCase()}-${addr}`, name: `${addr} ${street}`, kind: 'home', door: v(h.door.x, G, h.door.z), inside: box(lot.x0 + 1, G, lot.z0 + 1, lot.x0 + 14, G, lot.z0 + 11), residents: isMaple12 ? 2 : undefined, tags: isMaple12 ? ['maple12'] : undefined });
      if (isMaple12) {
        // 12 Maple St: Gary's old house. Garage with the antifreeze, a bathroom with the tub, the trampoline next door.
        building(w, { x0: lot.x0 + 16, z0: lot.z0 + 2, x1: lot.x0 + 24, z1: lot.z0 + 12, wall: h.wall, trim: B.Wood, floor: B.Concrete, floorH: 5, roof: 'flat', roofMat: B.Dark, winEvery: 0, doors: [{ side: 's', at: lot.x0 + 18, width: 5, height: 4 }] });
        w.fill(lot.x0 + 23, G, lot.z0 + 3, lot.x0 + 23, G, lot.z0 + 8, B.Wood); // garage workbench
        w.fill(lot.x0 + 23, G + 2, lot.z0 + 3, lot.x0 + 23, G + 2, lot.z0 + 8, B.Plank); // top shelf
        spots.mapleGarageShelf = v(lot.x0 + 23.5, G + 3, lot.z0 + 5.5);
        // Bathroom in the back corner: tub.
        w.fill(lot.x0 + 1, G, lot.z0 + 1, lot.x0 + 4, G, lot.z0 + 2, B.White);
        w.fill(lot.x0 + 2, G, lot.z0 + 1, lot.x0 + 3, G, lot.z0 + 1, B.Water);
        spots.bathtub = v(lot.x0 + 2.5, G + 1, lot.z0 + 2.5);
        spots.toaster = v(lot.x0 + 13.5, G + 1, lot.z0 + 2.5);
        spots.shedCord = v(lot.x0 + 12, G, lot.z0 - 10);
        sign(['12 MAPLE ST'], lot.x0 + 8.5, G + 1.3, sz - 0.3, 0, '#ffffff', '#24305e', 1.4, 0.4);
      }
      if (lot.x0 === 382 && lot.z0 === 352) {
        // The neighbor's trampoline and greenhouse.
        const tx = lot.x0 + 3, tz = lot.z0 - 12;
        w.fill(tx, G, tz, tx + 5, G, tz + 5, B.Rubber);
        for (const [x, z] of [[tx - 1, tz - 1], [tx + 6, tz - 1], [tx - 1, tz + 6], [tx + 6, tz + 6]]) w.set(x, G, z, B.Metal);
        zones.trampoline = box(tx, G + 0.5, tz, tx + 5.99, G + 1.6, tz + 5.99);
        spots.trampoline = v(tx + 3, G + 1, tz + 3);
        building(w, { x0: lot.x0 + 10, z0: tz, x1: lot.x0 + 16, z1: tz + 6, wall: B.Glass, trim: B.Glass, roof: 'flat', roofMat: B.Glass, floor: B.Dirt, floorH: 3, winEvery: 0, doors: [{ side: 's', at: lot.x0 + 12, width: 1 }] });
      }
      if (lot.x0 === 406 && lot.z0 === 352) {
        // Neighbor with Christmas lights in November.
        for (let x = lot.x0; x < lot.x0 + 16; x++) if (x % 2 === 0) w.set(x, G + 4, lot.z0 + 13, pick(rng, [B.RedPaint, B.RoofGreen, B.Yellow, B.WallBlue]));
        spots.christmasLights = v(lot.x0 + 8, G, lot.z0 + 15);
      }
    }
    for (let x = 360; x < 500; x += 16) if (w.get(x, G, 380) === 0 && w.get(x, G - 1, 380) === B.Grass) tops.push(tree(w, rng, x, 380));
  }

  // ================================================================ edge details, billboard posts, park benches on Main
  for (let x = 160; x < 344; x += 30) bench(w, x, 236);
  // Scatter some trees on leftover lawns (east of station, around the tower).
  for (let i = 0; i < 70; i++) {
    const x = 4 + Math.floor(rng() * 504), z = 4 + Math.floor(rng() * 504);
    let clear = true;
    for (let dx = -3; dx <= 3 && clear; dx++)
      for (let dz = -3; dz <= 3 && clear; dz++) if (w.get(x + dx, G - 1, z + dz) !== B.Grass || w.get(x + dx, G, z + dz) !== 0) clear = false;
    if (clear && (z < 36 ? z > 26 : true) && !(z > 14 && z < 28)) tops.push(tree(w, rng, x, z));
  }

  // ---- Transit stops.
  const transit: TransitStop[] = [
    {
      id: 'bus',
      kind: 'bus',
      name: 'Main Street Bus Stop',
      pos: v(408.5, G, 235.5),
      facing: Math.PI,
      board: box(403, G - 1, 230, 414, G + 4, 237),
      lane: { from: v(SIZE + 20, G, 238.5), stop: v(408.5, G, 238.5), to: v(-20, G, 238.5) },
    },
    {
      id: 'train',
      kind: 'train',
      name: 'Smallville Station',
      pos: v(250.5, G + 1, 25.5),
      facing: Math.PI,
      board: box(212, G, 23, 289, G + 4, 28),
      lane: { from: v(-60, G, trackZ + 0.5), stop: v(250.5, G, trackZ + 0.5), to: v(SIZE + 60, G, trackZ + 0.5) },
    },
  ];

  const stationInterior = box(stationBox.x0 + 1, G - 1, stationBox.z0 + 1, stationBox.x1 - 0.4, G + 4, stationBox.z1);

  return {
    world: w,
    size: SIZE,
    spawn: v(250.5, G, 236),
    treeZone: box(168, G + 7, 80, 196, G + 40, 104),
    towerZone: box(395, G + 15, 85, 440, G + 40, 115),
    jug: spots.mapleGarageShelf.clone(),
    mushroom,
    cookie,
    lever: v(gantry.x0 - 2.5, G, gantry.z + 3.5),
    xMark: v(99.5, G, gantry.z + 0.5),
    baleHang: v(99.5, gantry.top - 2.5, gantry.z + 0.5),
    gantry,
    fence,
    trackZ,
    crossing: v(292.5, G, trackZ + 4.5),
    billboard,
    station: {
      interior: stationInterior,
      outside: v(190, G, 262.5),
      taser: v(165.5, G + 1, 253.6),
      sign: v(stationBox.x1 + 0.6, G + 4.2, 262),
    },
    barnDoor,
    baler,
    areas: {
      downtown: box(152, G, 233, 348, G, 247),
      park: box(158, G, 68, 242, G, 112),
      farm: box(14, G, 156, 140, G, 232),
      woods: box(20, G, 430, 240, G, 500),
      tower: box(380, G, 104, 434, G, 140),
      garage: box(306, G, 244, 345, G, 247),
      station: box(stationBox.x0 + 1.5, G, stationBox.z0 + 1.5, stationBox.x1 - 1.5, G, stationBox.z1 - 1.5),
      construction: box(300, G, 68, 342, G, 100),
      grocery: box(162, G, 202, 238, G, 232),
      suburbs: box(352, G, 371, 505, G, 379),
      school: box(162, G, 382, 240, G, 412),
      church: box(398, G, 276, 412, G, 302),
      hospital: box(446, G, 244, 505, G, 247),
      trainStation: box(214, G + 1, 24, 286, G + 1, 27),
      mainStreet: box(150, G, 233, 440, G, 236),
      trailerPark: box(256, G, 372, 344, G, 376),
      cemetery: box(296, G, 430, 304, G, 480),
    },
    treeTops: tops.map((t) => v(t.x, t.y, t.z)),
    places,
    transit,
    roads,
    signs,
    spots,
    zones,
  };
}

