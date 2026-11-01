import { B, blockDetail, defineBlock, Detail, type VoxelWorld } from '../../voxel';

/**
 * Terrain for the wilderness: Lost Pines forest and river country in the west,
 * Thunder Ridge and its gorge in the middle, the Dry Gulch desert in the northeast
 * and the Mbali savanna in the southeast. Everything here is plain math on a heightmap
 * that is then written into the voxel world.
 */

export const SX = 640;
export const SY = 96;
export const SZ = 640;

/** Wilderness block ids live in 180-219 so they never collide with other maps. */
export const W = {
  Pine: 180,
  Bark: 181,
  Snow: 182,
  DryGrass: 183,
  RedEarth: 184,
  SandA: 185,
  SandB: 186,
  SandC: 187,
  Mud: 188,
  Thatch: 189,
  Cactus: 190,
  Acacia: 191,
  Wheat: 192,
  Bone: 193,
  Rust: 194,
  Moss: 195,
  LogEnd: 196,
  TentOrange: 197,
  TentGreen: 198,
  Khaki: 199,
  Adobe: 200,
  Termite: 201,
  Foil: 202,
  SwampGrass: 203,
  Dune: 204,
  ForestFloor: 205,
  Rock: 206,
  DarkRock: 207,
  Steel: 208,
  Canvas: 209,
  Hazard: 210,
  Baobab: 211,
  Cypress: 212,
  Wheat2: 213,
  Shadow: 214,
} as const;

let blocksDefined = false;
export function defineWildBlocks() {
  if (blocksDefined) return;
  blocksDefined = true;
  const d: [number, number, number][] = [
    [W.Pine, 0x2c5b3c, 0.18],
    [W.Bark, 0x5a3b26, 0.14],
    [W.Snow, 0xf2f6fb, 0.04],
    [W.DryGrass, 0xc4ae55, 0.16],
    [W.RedEarth, 0xb0603a, 0.14],
    [W.SandA, 0xd98a4a, 0.08],
    [W.SandB, 0xb8562e, 0.08],
    [W.SandC, 0xe8c07a, 0.08],
    [W.Mud, 0x5e4630, 0.14],
    [W.Thatch, 0xc9a35a, 0.2],
    [W.Cactus, 0x3f8a3a, 0.12],
    [W.Acacia, 0x6f9a3a, 0.2],
    [W.Wheat, 0xe6cf6a, 0.14],
    [W.Bone, 0xefe8d8, 0.05],
    [W.Rust, 0x8a4a2a, 0.18],
    [W.Moss, 0x6f7f4f, 0.18],
    [W.LogEnd, 0xc8a070, 0.1],
    [W.TentOrange, 0xe0703a, 0.05],
    [W.TentGreen, 0x4a8a5a, 0.05],
    [W.Khaki, 0xb8a878, 0.08],
    [W.Adobe, 0xd0956a, 0.08],
    [W.Termite, 0x9a6a40, 0.16],
    [W.Foil, 0xc8ccd4, 0.12],
    [W.SwampGrass, 0x5a7a3a, 0.2],
    [W.Dune, 0xead39a, 0.07],
    [W.ForestFloor, 0x4f8a35, 0.2],
    [W.Rock, 0x9a8f84, 0.14],
    [W.DarkRock, 0x5f5a55, 0.14],
    [W.Steel, 0x6c747c, 0.06],
    [W.Canvas, 0xe8dcc0, 0.06],
    [W.Hazard, 0xe8b820, 0.04],
    [W.Baobab, 0x8f7a68, 0.12],
    [W.Cypress, 0x3d5a2a, 0.2],
    [W.Wheat2, 0xa89040, 0.14],
    [W.Shadow, 0x1a1a1a, 0.02],
  ];
  for (const [id, c, n] of d) defineBlock(id, c, n);
  // Painted surface detail (voxel.ts blockDetail): cheap texture on the blocky forest and ground.
  blockDetail(Detail.Foliage, W.Pine, W.Acacia, W.Cypress, W.Moss, W.Thatch);
  blockDetail(Detail.Grass, W.DryGrass, W.SwampGrass, W.ForestFloor);
  blockDetail(Detail.Bark, W.Bark, W.Baobab, W.Rust, W.Cactus);
  blockDetail(Detail.Stone, W.Rock, W.DarkRock);
  blockDetail(Detail.Soil, W.RedEarth, W.SandA, W.SandB, W.SandC, W.Mud, W.Dune);
}

export const enum Biome {
  Forest = 0,
  Desert = 1,
  Savanna = 2,
  Mountain = 3,
  Swamp = 4,
  Ridge = 5,
}

// ---------------------------------------------------------------- noise

function hash2(x: number, z: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x: number, z: number, seed: number) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed), c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

export function fbm(x: number, z: number, seed: number, oct = 4) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, z * f, seed + i * 31) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------- rivers

export interface RiverNode {
  x: number;
  z: number;
  /** Water surface level (water fills voxels below this y). */
  y: number;
  /** Half width. */
  w: number;
  /** Depth below the surface at the center. */
  d: number;
  /** How steeply banks rise (higher = canyon walls). */
  slope?: number;
  /** Swamp-style islands poke out of the water. */
  islands?: boolean;
}

/** Main river: Lake Kettle, the rapids, Bridal Veil Falls, the Thunder Ridge gorge, then across the savanna. */
export const RIVER_A: RiverNode[] = [
  { x: 110, z: 82, y: 45, w: 26, d: 5 },
  { x: 112, z: 92, y: 45, w: 22, d: 5 },
  { x: 122, z: 122, y: 44, w: 5, d: 2 },
  { x: 132, z: 155, y: 42, w: 5, d: 2 },
  { x: 140, z: 185, y: 41, w: 5, d: 2 },
  { x: 146, z: 215, y: 39, w: 5, d: 2 },
  { x: 151, z: 240, y: 38, w: 5, d: 2 },
  { x: 155, z: 258, y: 37, w: 5, d: 2 },
  { x: 156, z: 262, y: 22, w: 6, d: 3, slope: 6 },
  { x: 164, z: 276, y: 22, w: 12, d: 4, slope: 6 },
  { x: 195, z: 290, y: 22, w: 6, d: 2, slope: 6 },
  { x: 235, z: 296, y: 21, w: 6, d: 2, slope: 6 },
  { x: 275, z: 302, y: 21, w: 6, d: 2, slope: 5 },
  { x: 305, z: 318, y: 20, w: 7, d: 2 },
  { x: 345, z: 352, y: 20, w: 8, d: 2 },
  { x: 390, z: 380, y: 20, w: 14, d: 3 },
  { x: 450, z: 398, y: 19, w: 8, d: 2 },
  { x: 520, z: 438, y: 19, w: 7, d: 2 },
  { x: 580, z: 466, y: 19, w: 7, d: 2 },
  { x: 660, z: 490, y: 19, w: 7, d: 2 },
];

/** Whisper Creek: beaver dam, the lumber camp pond, the piranha pool and the swamp. */
export const RIVER_B: RiverNode[] = [
  { x: 178, z: 346, y: 22, w: 2.5, d: 1 },
  { x: 156, z: 378, y: 22, w: 3, d: 1 },
  { x: 141, z: 397, y: 22, w: 3.5, d: 1.5 },
  { x: 138, z: 402, y: 20, w: 3, d: 1 },
  { x: 128, z: 420, y: 20, w: 3, d: 1 },
  { x: 110, z: 440, y: 20, w: 15, d: 3 },
  { x: 125, z: 462, y: 19, w: 3, d: 1 },
  { x: 160, z: 478, y: 19, w: 10, d: 4 },
  { x: 135, z: 503, y: 18, w: 3, d: 1 },
  { x: 90, z: 515, y: 17, w: 6, d: 1 },
  { x: 52, z: 528, y: 17, w: 40, d: 1, islands: true },
  { x: 30, z: 540, y: 17, w: 36, d: 1, islands: true },
];

/** The Mbali watering hole, a separate pond. */
export const WATERING_HOLE = { x: 482, z: 470, y: 21, w: 16, d: 2 };
/** The oasis by the gas station (a real one, unlike the mirage). */
export const OASIS = { x: 268, z: 120, y: 22, w: 7, d: 2 };

interface RiverHit {
  dist: number;
  y: number;
  w: number;
  d: number;
  slope: number;
  islands: boolean;
}

function nearestOnRiver(nodes: RiverNode[], x: number, z: number, out: RiverHit) {
  let best = Infinity;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L2 = dx * dx + dz * dz;
    let t = L2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / L2 : 0;
    t = Math.min(1, Math.max(0, t));
    const px = a.x + dx * t, pz = a.z + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    const w = lerp(a.w, b.w, t);
    // Score by how far outside the channel we are, so wide pools win over thin creeks.
    const score = dist - w;
    if (score < best) {
      best = score;
      out.dist = dist;
      // Water level steps down at the node where it changes (waterfalls are crisp).
      out.y = b.y < a.y && b.y < a.y - 2 ? (t < 0.5 ? a.y : b.y) : Math.round(lerp(a.y, b.y, t));
      out.w = w;
      out.d = lerp(a.d, b.d, t);
      out.slope = lerp(a.slope ?? 0.7, b.slope ?? 0.7, t);
      out.islands = !!(a.islands || b.islands);
    }
  }
  return best;
}

// ---------------------------------------------------------------- roads

export interface RoadDef {
  id: string;
  points: [number, number][];
  width: number;
  surface: number;
  /** Segments [i, i+1] that are bridges: leave the terrain alone there. */
  bridges?: number[];
  centerLine?: boolean;
}

export const ROADS: RoadDef[] = [
  // Depot to the bus stop and ranger station.
  { id: 'depot', points: [[84, 598], [120, 590], [150, 580]], width: 5, surface: B.Gravel },
  // The long dirt road east to the Mbali lodge.
  { id: 'lodge', points: [[150, 580], [210, 584], [270, 578], [330, 572], [390, 568], [432, 562]], width: 6, surface: W.RedEarth },
  // North past the campground, up Thunder Ridge, over the bridge and on to the highway.
  {
    id: 'ridge',
    points: [[150, 580], [172, 530], [196, 470], [214, 420], [225, 380], [225, 318], [225, 272], [228, 238], [238, 200], [250, 166]],
    width: 5,
    surface: B.Gravel,
    bridges: [5],
  },
  // Route 66-ish two-lane highway across the desert.
  { id: 'highway', points: [[244, 166], [330, 166], [420, 166], [520, 166], [640, 166]], width: 7, surface: B.Asphalt, centerLine: true },
  // Safari game drive loop.
  { id: 'drive', points: [[432, 562], [470, 520], [470, 492], [500, 440], [505, 360], [470, 340], [420, 352], [380, 420], [345, 488], [380, 540], [432, 562]], width: 5, surface: W.RedEarth },
  // Test site service road.
  { id: 'testsite', points: [[520, 166], [522, 120], [540, 80], [575, 60]], width: 4, surface: B.Gravel },
  // Lumber camp spur.
  { id: 'lumber', points: [[196, 470], [150, 452], [128, 452]], width: 4, surface: B.Gravel },
];

// ---------------------------------------------------------------- terrain

export interface Pad {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y?: number;
  block?: number;
}

/** Flat building pads. Filled in by the map so structures sit level. */
export const PADS: Record<string, Pad> = {
  depot: { x0: 50, z0: 592, x1: 118, z1: 626, block: B.Gravel },
  ranger: { x0: 118, z0: 548, x1: 146, z1: 572 },
  busstop: { x0: 146, z0: 572, x1: 162, z1: 586, block: B.Concrete },
  campground: { x0: 176, z0: 414, x1: 214, z1: 452 },
  lumber: { x0: 112, z0: 448, x1: 140, z1: 470, block: B.Dirt },
  gatorshow: { x0: 72, z0: 468, x1: 100, z1: 500, block: B.Plank },
  raftdock: { x0: 116, z0: 180, x1: 132, z1: 198 },
  bungee: { x0: 214, z0: 314, x1: 238, z1: 330, block: B.Gravel },
  bungeeN: { x0: 214, z0: 258, x1: 238, z1: 271, block: B.Gravel },
  lodge: { x0: 420, z0: 538, x1: 474, z1: 590 },
  balloon: { x0: 482, z0: 522, x1: 500, z1: 540, block: W.RedEarth },
  airstrip: { x0: 290, z0: 600, x1: 610, z1: 624, block: B.Asphalt },
  hangar: { x0: 300, z0: 582, x1: 330, z1: 600, block: B.Concrete },
  overlook: { x0: 492, z0: 340, x1: 512, z1: 356, block: W.RedEarth },
  gas: { x0: 282, z0: 132, x1: 330, z1: 160, block: B.Concrete },
  trailer: { x0: 392, z0: 120, x1: 416, z1: 146 },
  cropcircle: { x0: 430, z0: 46, x1: 520, z1: 118, block: W.Wheat },
  doomtown: { x0: 556, z0: 30, x1: 612, z1: 84, block: W.Dune },
  bunker: { x0: 510, z0: 92, x1: 534, z1: 112, block: B.Concrete },
};

/** Pride Rock center (a built structure, but the ground around it is raised too). */
export const PRIDE_ROCK = { x: 572, z: 384 };

export class Terrain {
  /** Ground surface height per column (top of the highest terrain voxel). */
  readonly h = new Int16Array(SX * SZ);
  /** Water surface level per column, 0 = dry. */
  readonly water = new Int16Array(SX * SZ);
  readonly biome = new Uint8Array(SX * SZ);
  /** 1 where a road, pad or water claims the column (no trees). */
  readonly claimed = new Uint8Array(SX * SZ);
  readonly surface = new Uint8Array(SX * SZ);
  readonly roadAt = new Uint8Array(SX * SZ);

  idx(x: number, z: number) {
    return z * SX + x;
  }

  inside(x: number, z: number) {
    return x >= 0 && z >= 0 && x < SX && z < SZ;
  }

  ground(x: number, z: number) {
    x = Math.floor(x);
    z = Math.floor(z);
    if (!this.inside(x, z)) return 0;
    return this.h[this.idx(x, z)];
  }

  waterAt(x: number, z: number) {
    x = Math.floor(x);
    z = Math.floor(z);
    if (!this.inside(x, z)) return 0;
    return this.water[this.idx(x, z)];
  }

  biomeAt(x: number, z: number): Biome {
    x = Math.floor(x);
    z = Math.floor(z);
    if (!this.inside(x, z)) return Biome.Forest;
    return this.biome[this.idx(x, z)] as Biome;
  }

  /** Steepest height step to a neighbor. */
  slope(x: number, z: number) {
    const h = this.ground(x, z);
    return Math.max(Math.abs(this.ground(x + 1, z) - h), Math.abs(this.ground(x - 1, z) - h), Math.abs(this.ground(x, z + 1) - h), Math.abs(this.ground(x, z - 1) - h));
  }

  generate() {
    const hit: RiverHit = { dist: 0, y: 0, w: 0, d: 0, slope: 0, islands: false };
    const hitB: RiverHit = { ...hit };
    const mesas = [
      { x: 312, z: 218, r: 24, top: 50 },
      { x: 532, z: 236, r: 22, top: 44 },
      { x: 616, z: 182, r: 16, top: 54 },
      { x: 360, z: 26, r: 14, top: 40 },
      { x: 455, z: 205, r: 10, top: 36 },
    ];
    for (let z = 0; z < SZ; z++)
      for (let x = 0; x < SX; x++) {
        const i = this.idx(x, z);
        const n1 = fbm(x / 80, z / 80, 11);
        const n2 = fbm(x / 23, z / 23, 29);
        const edgeWarp = fbm(x / 60, z / 60, 7) * 22;
        const fw = 1 - smoothstep(248, 292, x + edgeWarp);
        const dw = (1 - fw) * (1 - smoothstep(262, 300, z + edgeWarp));
        const sw = Math.max(0, 1 - fw - dw);

        // Lost Pines: lowlands in the south, the Pine Highlands north of Thunder Ridge, mountains on the north edge.
        const highland = smoothstep(352, 272, z);
        let forestH = lerp(21, 42, highland) + n1 * 5 + n2 * 1.5;
        const mtn = smoothstep(150, 20, z) * (0.7 + 0.3 * fbm(x / 40, z / 40, 3));
        const peaks = Math.pow(Math.max(0, fbm(x / 34, z / 34, 5) * 0.5 + 0.5), 1.6) * 44;
        forestH += mtn * (18 + peaks * 1.5);
        // Swamp lowlands.
        const swampD = Math.hypot(x - 45, z - 530);
        forestH = lerp(forestH, 17.5 + n2 * 1.2, smoothstep(70, 30, swampD));

        // Dry Gulch: flat desert floor, rolling dunes in the Dune Sea (northwest of the desert), mesas.
        let desertH = 21 + n1 * 1.5;
        const duneMask = smoothstep(150, 90, Math.hypot(x - 370, z - 60) + fbm(x / 50, z / 50, 9) * 30);
        const dune = Math.pow(Math.sin(x * 0.07 + z * 0.03 + fbm(x / 40, z / 40, 13) * 3) * 0.5 + 0.5, 2) * 8 + n2 * 2;
        desertH += dune * duneMask;
        let mesaTop = 0;
        for (const m of mesas) {
          const d = Math.hypot(x - m.x, z - m.z) + fbm(x / 12, z / 12, 17 + m.x) * 5;
          if (d < m.r) mesaTop = Math.max(mesaTop, m.top + Math.round(n2 * 1.2));
          else if (d < m.r + 5) mesaTop = Math.max(mesaTop, lerp(m.top - 6, 22, (d - m.r) / 5));
        }
        if (mesaTop) desertH = Math.max(desertH, mesaTop);

        // Mbali savanna: gentle plains with rocky kopjes.
        let savH = 21 + n1 * 2 + n2 * 0.6;
        const kop = Math.max(0, fbm(x / 28, z / 28, 41) - 0.45) * 30;
        savH += kop;
        const pr = Math.hypot(x - PRIDE_ROCK.x, z - PRIDE_ROCK.z);
        savH = Math.max(savH, lerp(30, 21, smoothstep(14, 34, pr)));

        let hgt = forestH * fw + desertH * dw + savH * sw;

        // Thunder Ridge: a high bar of rock the river has cut a gorge through.
        const rx = Math.max(0, Math.abs(x - 232) - 58), rz = Math.max(0, Math.abs(z - 296) - 26);
        const rr = Math.hypot(rx, rz) + fbm(x / 30, z / 30, 23) * 10;
        const ridge = smoothstep(16, -6, rr);
        hgt = lerp(hgt, 57 + n2 * 2, ridge);

        let b: Biome = fw > 0.5 ? Biome.Forest : dw > sw ? Biome.Desert : Biome.Savanna;
        if (b === Biome.Forest && mtn > 0.35 && hgt > 50) b = Biome.Mountain;
        if (b === Biome.Forest && swampD < 55) b = Biome.Swamp;
        if (ridge > 0.5) b = Biome.Ridge;
        if (mesaTop && b === Biome.Desert) b = Biome.Desert;

        // Rivers.
        let ground = Math.round(hgt);
        let water = 0;
        const sA = nearestOnRiver(RIVER_A, x, z, hit);
        const sB = nearestOnRiver(RIVER_B, x, z, hitB);
        const r = sB < sA ? hitB : hit;
        const isle = r.islands && fbm(x / 9, z / 9, 61) > 0.12;
        if (r.dist < r.w && !isle) {
          const k = 1 - (r.dist / r.w) ** 2;
          ground = Math.min(ground, Math.floor(r.y - 1 - r.d * k + 0.5));
          ground = Math.min(ground, r.y - 1);
          water = r.y;
        } else if (r.dist < r.w + 40) {
          const g = r.y + (r.dist - r.w) * r.slope;
          let c = Math.min(hgt, g);
          if (r.dist < r.w + 3 || isle) c = Math.max(c, r.y);
          ground = Math.round(c);
        }
        for (const p of [WATERING_HOLE, OASIS]) {
          const d = Math.hypot(x - p.x, z - p.z) + fbm(x / 8, z / 8, 77) * 2;
          if (d < p.w) {
            ground = Math.min(ground, Math.floor(p.y - 1 - p.d * (1 - (d / p.w) ** 2) + 0.5));
            water = p.y;
          } else if (d < p.w + 6) ground = Math.max(p.y, Math.min(ground, Math.round(p.y + (d - p.w) * 0.6)));
        }
        this.h[i] = Math.max(2, Math.min(SY - 6, ground));
        this.water[i] = water;
        this.biome[i] = b;
        if (water) this.claimed[i] = 1;
      }
    this.carveRoads();
    for (const p of Object.values(PADS)) this.flatten(p);
  }

  /** Lay a road: smooth its height along the line, flatten a band, and mark the surface. */
  private carveRoads() {
    for (const road of ROADS) {
      const samples: { x: number; z: number; seg: number }[] = [];
      for (let s = 0; s < road.points.length - 1; s++) {
        const [ax, az] = road.points[s];
        const [bx, bz] = road.points[s + 1];
        const L = Math.hypot(bx - ax, bz - az);
        for (let t = 0; t < L; t += 1) samples.push({ x: ax + ((bx - ax) * t) / L, z: az + ((bz - az) * t) / L, seg: s });
      }
      const last = road.points[road.points.length - 1];
      samples.push({ x: last[0], z: last[1], seg: road.points.length - 2 });
      const raw = samples.map((p) => this.ground(p.x, p.z));
      const ys = raw.map((_, i) => {
        let s = 0, n = 0;
        for (let k = -8; k <= 8; k++) {
          const j = Math.min(raw.length - 1, Math.max(0, i + k));
          s += raw[j];
          n++;
        }
        return s / n;
      });
      // Clamp grade so people can walk it.
      for (let i = 1; i < ys.length; i++) ys[i] = Math.min(ys[i - 1] + 0.75, Math.max(ys[i - 1] - 0.75, ys[i]));
      for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i + 1] + 0.75, Math.max(ys[i + 1] - 0.75, ys[i]));
      const half = road.width / 2;
      samples.forEach((p, si) => {
        if (road.bridges?.includes(p.seg)) return;
        const y = Math.round(ys[si]);
        const R = Math.ceil(half + 4);
        for (let dz = -R; dz <= R; dz++)
          for (let dx = -R; dx <= R; dx++) {
            const x = Math.floor(p.x + dx), z = Math.floor(p.z + dz);
            if (!this.inside(x, z)) continue;
            const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z);
            const i = this.idx(x, z);
            if (this.water[i]) continue;
            if (d <= half) {
              this.h[i] = y;
              this.surface[i] = road.surface;
              this.roadAt[i] = 1;
              this.claimed[i] = 1;
            } else if (d <= half + 4 && !this.roadAt[i]) {
              const t = (d - half) / 4;
              this.h[i] = Math.round(lerp(y, this.h[i], t * t));
              if (d <= half + 1.5) this.claimed[i] = 1;
            }
          }
      });
      if (road.centerLine)
        samples.forEach((p, si) => {
          if (si % 6 < 3) this.surface[this.idx(Math.floor(p.x), Math.floor(p.z))] = B.Yellow;
        });
    }
  }

  /** Flatten a pad to one height with a short skirt so it blends into the hills. */
  flatten(p: Pad) {
    let y = p.y;
    if (y === undefined) {
      let s = 0, n = 0;
      for (let z = p.z0; z <= p.z1; z += 2)
        for (let x = p.x0; x <= p.x1; x += 2) {
          s += this.ground(x, z);
          n++;
        }
      y = Math.round(s / n);
      p.y = y;
    }
    const skirt = 6;
    for (let z = p.z0 - skirt; z <= p.z1 + skirt; z++)
      for (let x = p.x0 - skirt; x <= p.x1 + skirt; x++) {
        if (!this.inside(x, z)) continue;
        const i = this.idx(x, z);
        if (this.water[i]) continue;
        const dx = Math.max(p.x0 - x, 0, x - p.x1), dz = Math.max(p.z0 - z, 0, z - p.z1);
        const d = Math.hypot(dx, dz);
        if (d === 0) {
          this.h[i] = y;
          this.claimed[i] = 1;
          if (p.block !== undefined && !this.roadAt[i]) this.surface[i] = p.block;
        } else if (d < skirt && !this.roadAt[i]) {
          const t = d / skirt;
          this.h[i] = Math.round(lerp(y, this.h[i], t * t));
          if (d < 2) this.claimed[i] = 1;
        }
      }
  }

  /** Surface block for a column (top voxel). */
  topBlock(x: number, z: number): number {
    const i = this.idx(x, z);
    if (this.surface[i]) return this.surface[i];
    const h = this.h[i];
    const b = this.biome[i] as Biome;
    const n = fbm(x / 14, z / 14, 91);
    if (this.water[i]) {
      if (b === Biome.Swamp) return W.Mud;
      if (b === Biome.Desert || b === Biome.Savanna) return B.Sand;
      return n > 0.2 ? B.Stone : B.Gravel;
    }
    const nearWater = this.water[this.idx(Math.min(SX - 1, x + 2), z)] || this.water[this.idx(Math.max(0, x - 2), z)] || this.water[this.idx(x, Math.min(SZ - 1, z + 2))] || this.water[this.idx(x, Math.max(0, z - 2))];
    const steep = this.slope(x, z) >= 3;
    switch (b) {
      case Biome.Mountain:
        if (h > 70) return W.Snow;
        if (steep || h > 62) return n > 0 ? B.Stone : W.Rock;
        return n > 0.3 ? W.Moss : W.ForestFloor;
      case Biome.Ridge:
        if (steep) return n > 0 ? W.Rock : W.DarkRock;
        return n > 0.25 ? W.Rock : B.Grass;
      case Biome.Swamp:
        if (nearWater) return W.Mud;
        return n > 0.2 ? W.Moss : W.SwampGrass;
      case Biome.Desert:
        if (h > 30) return this.mesaBand(h - 1);
        if (nearWater) return B.Grass;
        return n > 0.35 ? B.Sand : W.Dune;
      case Biome.Savanna:
        if (steep || h > 27) return n > 0 ? W.Rock : W.DarkRock;
        if (nearWater) return W.Mud;
        return n > 0.32 ? W.RedEarth : n < -0.4 ? B.Grass : W.DryGrass;
      default:
        if (steep) return n > 0 ? B.Stone : W.Rock;
        if (nearWater) return n > 0 ? B.Gravel : W.Mud;
        return n > 0.15 ? W.ForestFloor : n < -0.45 ? W.Moss : B.Grass;
    }
  }

  mesaBand(y: number) {
    const k = Math.floor(y / 2) % 4;
    return k === 0 ? W.SandA : k === 1 ? W.SandC : k === 2 ? W.SandB : W.SandA;
  }

  /** Write the heightmap into voxels. */
  fill(world: VoxelWorld) {
    for (let z = 0; z < SZ; z++)
      for (let x = 0; x < SX; x++) {
        const i = this.idx(x, z);
        const h = this.h[i];
        const b = this.biome[i] as Biome;
        const top = this.topBlock(x, z);
        const layered = (b === Biome.Desert && h > 26) || b === Biome.Ridge;
        for (let y = 0; y < h; y++) {
          let blk: number;
          if (y === h - 1) blk = top;
          else if (y >= h - 4) {
            if (layered) blk = b === Biome.Desert ? this.mesaBand(y) : y % 5 === 0 ? W.DarkRock : W.Rock;
            else if (b === Biome.Desert) blk = W.SandC;
            else if (b === Biome.Savanna) blk = W.RedEarth;
            else blk = B.Dirt;
          } else if (layered) blk = b === Biome.Desert ? this.mesaBand(y) : y % 5 === 0 ? W.DarkRock : W.Rock;
          else blk = B.Stone;
          world.set(x, y, z, blk);
        }
      }
  }
}
