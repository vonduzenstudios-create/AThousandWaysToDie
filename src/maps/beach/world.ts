import * as THREE from 'three';
import { B, type VoxelWorld } from '../../voxel';
import { box, type Box } from '../../town';
import { mulberry32, pick, type Rng } from '../../util';
import { BB } from './blocks';

/**
 * Sandy Shores: a beach town, boardwalk, pier, harbor and a slice of open ocean.
 * North is -z, the sea is +z. Everything here is voxels; water is a separate surface
 * (see water.ts) described by the `water` height grid.
 */
export const SX = 768;
export const SY = 72;
export const SZ = 640;
/** Standing height on inland ground. */
export const GL = 10;
/** Sea surface height. */
export const SEA = 8.6;
/** Boardwalk and pier deck standing height. */
export const DECK = 11;
export const PIER_X0 = 396;
export const PIER_X1 = 404;
export const PIER_END = 470;
export const BUOY_Z = 420;

export const shoreZ = (x: number) => 300 + 6 * Math.sin(x / 37) + 3 * Math.sin(x / 13 + 1);
export const riverX = (z: number) => 110 + 14 * Math.sin(z / 45);
export const RIVER_HALF = 6;

export interface Shop {
  id: string;
  name: string;
  door: THREE.Vector3;
  inside: Box;
  counter: THREE.Vector3;
  sign: { pos: THREE.Vector3; rotY: number; bg: string; fg: string; lines: string[] };
}

/** A cottage the street kit builds (solid, with a front door facing `face`). */
export interface KitHouse {
  x0: number;
  z0: number;
  wd: number;
  dp: number;
  face: 'n' | 's';
  floors: number;
  wall: number;
  roof: number;
  seed: number;
}

/** A walk-in shop shell the runtime builds from the street kit (see town.ts). */
export interface KitShop {
  id: string;
  x0: number;
  z0: number;
  wd: number;
  dp: number;
  face: 'n' | 's';
  floors: number;
  /** Floor height (boardwalk shops sit at deck level). */
  y: number;
}

export interface KitProp {
  kind: 'lamp' | 'bench' | 'planter' | 'pottedTree' | 'cafeTable' | 'umbrellaTable' | 'bin' | 'bollard' | 'hydrant' | 'crates' | 'barrel' | 'flowerPot' | 'mailbox' | 'newsStand' | 'signPost';
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface BeachLayout {
  water: Float32Array;
  /** Columns NPCs must not walk through (building walls and solid cottages). */
  solid: Uint8Array;
  kit: {
    houses: KitHouse[];
    shops: KitShop[];
    props: KitProp[];
    bunting: [THREE.Vector3, THREE.Vector3][];
    paving: { x0: number; z0: number; x1: number; z1: number; y: number; kind: 'cobble' | 'sidewalk' | 'pavers' | 'plaza'; curb?: ('n' | 's' | 'e' | 'w')[] }[];
  };
  spawn: THREE.Vector3;
  areas: Record<string, Box>;
  shops: Shop[];
  houses: { door: THREE.Vector3; inside: Box }[];
  palms: THREE.Vector3[]; // crown positions
  towers: THREE.Vector3[]; // lifeguard tower platform positions (feet)
  towels: THREE.Vector3[];
  benches: THREE.Vector3[];
  sandcastle: THREE.Vector3;
  volleyball: { center: THREE.Vector3; netZ: number; x0: number; x1: number; z0: number; z1: number };
  ripZone: Box;
  reef: Box;
  bloom: Box;
  divingBoard: THREE.Vector3;
  pierEnd: THREE.Vector3;
  lighthouse: { base: THREE.Vector3; top: THREE.Vector3 };
  harbor: {
    anchorWinch: THREE.Vector3;
    anchorDrop: THREE.Vector3;
    ferryDock: THREE.Vector3;
    seaplaneDock: THREE.Vector3;
    charterDock: THREE.Vector3;
    tourDock: THREE.Vector3;
    subDock: THREE.Vector3;
    tenderDock: THREE.Vector3;
    workshop: THREE.Vector3;
    trench: Box;
  };
  cruise: { x0: number; x1: number; z0: number; z1: number; deck: number; lido: number; buffet: THREE.Vector3; queue: THREE.Vector3[]; arrive: THREE.Vector3 };
  busStop: THREE.Vector3;
  belly: THREE.Vector3;
  payphone: THREE.Vector3;
  ferris: THREE.Vector3;
  roads: { points: THREE.Vector3[]; width: number }[];
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildBeach(w: VoxelWorld, seed = 4242): BeachLayout {
  const rng = mulberry32(seed);
  const water = new Float32Array(SX * SZ).fill(NaN);
  const setWater = (x: number, z: number, h: number) => {
    if (x >= 0 && z >= 0 && x < SX && z < SZ) water[z * SX + x] = h;
  };
  const shops: Shop[] = [];
  const houses: BeachLayout['houses'] = [];
  const palms: THREE.Vector3[] = [];
  const towels: THREE.Vector3[] = [];
  const benches: THREE.Vector3[] = [];
  const solid = new Uint8Array(SX * SZ);
  const markSolid = (x0: number, z0: number, x1: number, z1: number) => {
    for (let x = Math.max(0, x0); x <= Math.min(SX - 1, x1); x++) for (let z = Math.max(0, z0); z <= Math.min(SZ - 1, z1); z++) solid[z * SX + x] = 1;
  };
  const kit: BeachLayout['kit'] = { houses: [], shops: [], props: [], bunting: [], paving: [] };
  const prop = (kind: KitProp['kind'], x: number, y: number, z: number, rotY = 0) => kit.props.push({ kind, x, y, z, rotY });

  const harborX = 610;
  const harborZ = 232;
  const trench = box(680, -200, 520, 740, SEA, 600);

  // ---------------------------------------------------------------- terrain
  for (let x = 0; x < SX; x++) {
    const sz = shoreZ(x);
    for (let z = 0; z < SZ; z++) {
      let top = GL;
      let surf: number = B.Grass;
      let sub: number = B.Dirt;
      const inHarbor = x >= harborX && z >= harborZ;
      if (z < 60) {
        // Rolling hills to the north.
        const n = Math.sin(x / 23) * Math.cos(z / 17) + Math.sin(x / 61 + z / 41);
        top = GL + Math.max(0, Math.round(((60 - z) / 60) * (5 + n * 3)));
        if (rng() < 0.02) surf = B.Flower;
      } else if (z < 162) {
        top = GL;
        if (rng() < 0.012) surf = B.Flower;
      } else if (inHarbor) {
        top = 2;
        surf = BB.Seabed;
        sub = BB.Seabed;
      } else if (z < 207) {
        top = GL;
        surf = B.Sand;
        sub = B.Sand;
      } else if (z < sz) {
        // The beach slopes gently to the water.
        const t = (z - 207) / (sz - 207);
        top = t < 0.55 ? GL : t < 0.86 ? GL - 1 : GL - 2;
        surf = t > 0.86 ? BB.WetSand : rng() < 0.01 ? BB.Shell : B.Sand;
        sub = B.Sand;
        if (x < 96) {
          // West lagoon wetlands.
          const m = Math.sin(x / 9) + Math.cos(z / 11);
          top = m > 0.6 ? GL - 1 : GL - 2;
          surf = top < SEA ? BB.Mud : BB.Moss;
          sub = BB.Mud;
        }
      } else {
        // Seabed.
        const d = z - sz;
        top = Math.max(1, Math.round(GL - 2 - d * 0.065));
        surf = d < 30 ? BB.WetSand : BB.Seabed;
        sub = BB.Seabed;
      }
      const inTrench = x >= trench.min.x && x <= trench.max.x && z >= trench.min.z && z <= trench.max.z;
      if (inTrench) continue; // a hole into the abyss, for the submarine
      w.set(x, 0, z, B.Stone);
      for (let y = 1; y < top - 1; y++) w.set(x, y, z, y < top - 4 ? B.Stone : sub);
      w.set(x, top - 1, z, surf);
      if (top < SEA) setWater(x, z, SEA);
    }
  }

  // Reef: a raised shelf of coral outside the buoys.
  const reef = box(200, 0, 440, 300, 0, 520);
  for (let x = reef.min.x; x <= reef.max.x; x++)
    for (let z = reef.min.z; z <= reef.max.z; z++) {
      const dx = (x - 250) / 50, dz = (z - 480) / 40;
      const r = dx * dx + dz * dz;
      if (r > 1) continue;
      const h = Math.round(5 + (1 - r) * 1.5 + Math.sin(x * 0.7) * Math.cos(z * 0.6));
      const base = w.topY(x, z);
      for (let y = base; y < Math.min(h, 7); y++) w.set(x, y, z, pick(rng, [BB.CoralPink, BB.CoralOrange, BB.CoralPurple, BB.Rock, BB.Seabed]));
      if (rng() < 0.12) for (let y = Math.min(h, 7); y < 8; y++) w.set(x, y, z, BB.Kelp);
    }
  // Kelp and rocks on the open seabed.
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(rng() * SX), z = Math.floor(shoreZ(0) + 40 + rng() * (SZ - 350));
    if (x >= harborX && z >= harborZ) continue;
    if (Number.isNaN(water[z * SX + x])) continue;
    const t = w.topY(x, z);
    if (t <= 0) continue;
    const h = 1 + Math.floor(rng() * 4);
    const b = rng() < 0.7 ? BB.Seaweed : BB.Rock;
    for (let y = t; y < Math.min(t + h, SEA - 1.2); y++) w.set(x, y, z, b);
  }

  // ---------------------------------------------------------------- river
  for (let z = 0; z < SZ; z++) {
    const cx = riverX(z);
    if (z > shoreZ(cx) + 4) break;
    for (let x = Math.floor(cx - RIVER_HALF - 3); x <= Math.ceil(cx + RIVER_HALF + 3); x++) {
      const d = Math.abs(x - cx);
      const top = w.topY(x, z);
      if (d <= RIVER_HALF) {
        const bed = Math.round(5 + (d / RIVER_HALF) * 2);
        for (let y = bed; y < Math.max(top, bed + 1); y++) w.set(x, y, z, B.Air);
        w.set(x, bed - 1, z, rng() < 0.3 ? B.Gravel : BB.Mud);
        setWater(x, z, SEA);
      } else if (top > GL) {
        // Cut the banks in the hills.
        for (let y = GL; y < top; y++) w.set(x, y, z, B.Air);
        w.set(x, GL - 1, z, BB.Rock);
      }
    }
  }

  // ---------------------------------------------------------------- roads
  const roads: BeachLayout['roads'] = [];
  const HWY = 156;
  w.fill(0, GL - 1, HWY - 4, SX - 1, GL - 1, HWY + 4, B.Asphalt);
  w.fill(0, GL - 1, HWY - 6, SX - 1, GL - 1, HWY - 5, B.Sidewalk);
  w.fill(0, GL - 1, HWY + 5, SX - 1, GL - 1, HWY + 6, B.Sidewalk);
  for (let x = 0; x < SX; x++) if (x % 6 < 3) w.set(x, GL - 1, HWY, B.Yellow);
  // Highway bridge over the river.
  for (let z = HWY - 6; z <= HWY + 6; z++) {
    const cx = riverX(z);
    for (let x = Math.floor(cx - RIVER_HALF - 2); x <= Math.ceil(cx + RIVER_HALF + 2); x++) {
      w.set(x, GL - 1, z, z === HWY - 6 || z === HWY + 6 ? B.Concrete : B.Asphalt);
      if (z === HWY - 6 || z === HWY + 6) w.set(x, GL, z, B.Concrete);
    }
  }
  roads.push({ points: [v(0, GL, HWY), v(SX - 1, GL, HWY)], width: 8 });
  // Town streets.
  for (const sx of [240, 360, 480, 600, 700]) {
    w.fill(sx - 3, GL - 1, 60, sx + 3, GL - 1, HWY - 5, B.Asphalt);
    w.fill(sx - 5, GL - 1, 60, sx - 4, GL - 1, HWY - 7, B.Sidewalk);
    w.fill(sx + 4, GL - 1, 60, sx + 5, GL - 1, HWY - 7, B.Sidewalk);
    roads.push({ points: [v(sx, GL, 62), v(sx, GL, HWY)], width: 6 });
  }
  for (const sx of [240, 360, 480, 600, 700]) {
    kit.paving.push({ x0: sx - 5, z0: 67, x1: sx - 3, z1: HWY - 6, y: GL, kind: 'sidewalk', curb: ['e'] });
    kit.paving.push({ x0: sx + 4, z0: 67, x1: sx + 6, z1: HWY - 6, y: GL, kind: 'sidewalk', curb: ['w'] });
    for (let z = 74; z < HWY - 8; z += 16) {
      prop('lamp', sx - 4.5, GL, z + 0.5);
      prop('lamp', sx + 5.5, GL, z + 8.5);
    }
    prop('hydrant', sx + 5.4, GL, 100.5);
  }
  w.fill(240, GL - 1, 60, 703, GL - 1, 66, B.Asphalt);
  roads.push({ points: [v(240, GL, 63), v(700, GL, 63)], width: 6 });
  // Harbor road and parking.
  w.fill(612, GL - 1, HWY + 7, 767, GL - 1, harborZ - 1, B.Asphalt);
  for (let x = 620; x < 760; x += 6) w.fill(x, GL - 1, 175, x, GL - 1, 182, B.White);

  // ---------------------------------------------------------------- town
  const HOUSE_WALLS = [0x8fd6d0, 0xf4a38c, 0xf2dc7a, 0xa8dcb4, 0xf3efe6, 0xf6c49a, 0x9cc4e4, 0xd8b8e0];
  const HOUSE_ROOFS = [0xb4553b, 0x35578f, 0x3f7a4a, 0x6b4a3a, 0xc8a46a, 0x5f6066];
  /** Clear a lot and leave the visible building to the street kit (houses are solid). */
  const clearLot = (x0: number, z0: number, wd: number, dp: number, h: number) => {
    const x1 = x0 + wd - 1, z1 = z0 + dp - 1;
    w.fill(x0, GL - 1, z0, x1, GL - 1, z1, B.Plank);
    w.fill(x0, GL, z0, x1, GL + h + 8, z1, B.Air);
  };
  const house = (x0: number, z0: number, wd: number, dp: number, face: 'n' | 's') => {
    clearLot(x0, z0, wd, dp, 4);
    const x1 = x0 + wd - 1, z1 = z0 + dp - 1;
    kit.houses.push({ x0, z0, wd, dp, face, floors: rng() < 0.45 ? 2 : 1, wall: pick(rng, HOUSE_WALLS), roof: pick(rng, HOUSE_ROOFS), seed: Math.floor(rng() * 1e9) });
    markSolid(x0, z0, x1, z1);
    const dx = x0 + wd / 2;
    const door = face === 'n' ? v(dx, GL, z0 - 1.5) : v(dx, GL, z1 + 2);
    // Mailbox by the path.
    prop('mailbox', dx + 2.2, GL, face === 'n' ? z0 - 2.5 : z1 + 3, face === 'n' ? Math.PI : 0);
    return { door, inside: box(x0 + 1, GL, z0 + 1, x1 - 1, GL, z1 - 1) };
  };

  // Beach cottages in the residential blocks between the streets.
  for (const [bx0, bx1] of [[147, 233], [247, 353], [367, 473], [487, 593]] as const)
    for (let row = 0; row < 3; row++) {
      const z0 = 72 + row * 26;
      for (let x0 = bx0 + 2; x0 + 11 < bx1; x0 += 15) {
        if (rng() < 0.12) continue;
        const wd = 10 + Math.floor(rng() * 3), dp = 9 + Math.floor(rng() * 3);
        const h = house(x0, z0, wd, dp, row === 2 ? 's' : 'n');
        houses.push(h);
        // Little fence and garden.
        if (rng() < 0.5) for (let x = x0; x < x0 + wd; x += 2) w.set(x, GL, z0 + dp + 1, B.White);
      }
    }
  // A few cottages up in the hills.
  for (let i = 0; i < 10; i++) {
    const x0 = 150 + i * 58 + Math.floor(rng() * 20), z0 = 18 + Math.floor(rng() * 20);
    if (Math.abs(x0 - riverX(z0)) < 20) continue;
    const y = w.topY(x0 + 5, z0 + 5);
    // Level a pad.
    for (let x = x0 - 1; x < x0 + 12; x++) for (let z = z0 - 1; z < z0 + 12; z++) {
      for (let yy = GL; yy < y + 12; yy++) w.set(x, yy, z, B.Air);
      w.set(x, GL - 1, z, B.Grass);
    }
    houses.push(house(x0, z0, 10, 9, 's'));
  }

  // Shops and civic buildings along the highway's north side.
  const shop = (id: string, name: string, x0: number, z0: number, wd: number, dp: number, h: number, _wall: number, _roof: number, door: 'n' | 's', bg: string, fg: string, lines: string[], fy = GL) => {
    clearLot(x0, z0, wd, dp, h);
    if (fy > GL) w.fill(x0, GL, z0, x0 + wd - 1, fy - 1, z0 + dp - 1, B.Plank);
    const floors = h >= 7 ? 3 : 2;
    kit.shops.push({ id, x0, z0, wd, dp, face: door, floors, y: fy });
    const x1 = x0 + wd - 1, z1 = z0 + dp - 1;
    const cx = x0 + wd / 2;
    // Walls block NPC paths, except the doorway.
    markSolid(x0, z0, x1, z0);
    markSolid(x0, z1, x1, z1);
    markSolid(x0, z0, x0, z1);
    markSolid(x1, z0, x1, z1);
    const dz = door === 's' ? z1 : z0;
    solid[dz * SX + Math.floor(cx) - 1] = 0;
    solid[dz * SX + Math.floor(cx)] = 0;
    // The counter runs along the back wall; customers stand in front of it.
    const backZ = door === 's' ? z0 + 3 : z1 - 3;
    markSolid(x0 + 2, backZ, x1 - 2, backZ);
    const counter = door === 's' ? v(cx, fy, z0 + 4.5) : v(cx, fy, z1 - 4.5);
    const roofY = fy + floors * 3 + 1.05;
    // Gable roofs overhang the facade, so their rooftop signs stand out past the eaves.
    const out = id === 'tikibar' || id === 'harbormaster' || id === 'charters' ? 1.4 : 0;
    const sign: Shop['sign'] = door === 's'
      ? { pos: v(cx, roofY, z1 + 1.1 + out), rotY: 0, bg, fg, lines }
      : { pos: v(cx, roofY, z0 - 0.1 - out), rotY: Math.PI, bg, fg, lines };
    const doorPos = door === 's' ? v(cx, fy, z1 + 2) : v(cx, fy, z0 - 1.5);
    shops.push({ id, name, door: doorPos, inside: box(x0 + 1, fy, z0 + 1, x1 - 1, fy, z1 - 1), counter, sign });
    return { door: doorPos };
  };
  shop('steakhouse', "Big Al's Surf & Turf", 250, 126, 22, 18, 6, B.Brick, B.Dark, 's', '#3a1a0a', '#ffcc66', ["BIG AL'S", 'SURF & TURF']);
  shop('urgentcare', 'Sandy Shores Urgent Care', 372, 126, 24, 18, 7, B.White, B.RoofBlue, 's', '#ffffff', '#d01818', ['URGENT CARE', 'we do our best']);
  shop('motel', 'Seabreeze Motel', 490, 128, 40, 14, 6, BB.Coral, B.RoofGreen, 's', '#ff3ec8', '#ffffff', ['SEABREEZE MOTEL', 'VACANCY']);
  shop('hardware', 'Barnacle Hardware', 535, 128, 16, 14, 5, B.WallBlue, B.Dark, 's', '#1a2a4a', '#ffd84a', ['BARNACLE', 'HARDWARE']);
  shop('lifeguardhq', 'Lifeguard HQ', 610, 128, 18, 14, 5, B.RedPaint, B.White, 's', '#e0302a', '#ffffff', ['LIFEGUARD HQ']);

  // Boardwalk shops (south-facing, between the highway and the boardwalk).
  const bwShop = (id: string, name: string, x0: number, wd: number, wall: number, bg: string, fg: string, lines: string[]) =>
    shop(id, name, x0, 166, wd, 22, 5, wall, BB.Thatch, 's', bg, fg, lines, DECK);
  bwShop('surfshop', 'Gnarly Pete\'s Surf Shop', 160, 22, BB.Turquoise, '#0a6a8a', '#ffffff', ["GNARLY PETE'S", 'SURF · TUBES · BROCHURES']);
  bwShop('fryshack', 'Fry Shack', 200, 16, BB.Lemon, '#e0302a', '#ffe46a', ['FRY SHACK', 'JUMBO BUCKET $12']);
  bwShop('scoops', 'Scoops Ahoy', 236, 16, B.WallPeach, '#ff7fb0', '#ffffff', ['SCOOPS AHOY', 'ice cream']);
  bwShop('tikibar', 'The Drunken Clam', 300, 22, B.Wood, '#2a1a0a', '#ffcc33', ['THE DRUNKEN CLAM', 'tiki bar']);
  bwShop('arcade', 'Neon Shores Arcade', 440, 24, B.Dark, '#111122', '#ff3ec8', ['NEON SHORES', 'ARCADE']);
  bwShop('giftshop', 'Shell Shocked Gifts', 480, 18, BB.Stucco, '#ffffff', '#1c4fa0', ['SHELL SHOCKED', 'GIFTS']);
  bwShop('snackbar', 'Snack Attack', 560, 16, B.WallMint, '#2aa65a', '#ffffff', ['SNACK ATTACK', 'hot dogs · sodas']);

  // Parasail booth sits at the pier entrance.
  // ---------------------------------------------------------------- boardwalk
  const bwX0 = 140, bwX1 = 600;
  for (let x = bwX0; x <= bwX1; x++)
    for (let z = 188; z <= 206; z++) {
      w.set(x, DECK - 1, z, (x + z) % 7 === 0 ? B.Plank : BB.Boardwalk);
      if (z === 206 && x % 4 === 0) for (let y = GL - 2; y < DECK - 1; y++) w.set(x, y, z + 1, BB.Piling);
    }
  // Steps down to the sand every 40 blocks and up from the shops.
  for (let x = bwX0 + 20; x < bwX1; x += 40) w.fill(x, GL, 207, x + 3, GL, 207, BB.Boardwalk);
  // Railing on the sand side with gaps at the steps.
  for (let x = bwX0; x <= bwX1; x++) if ((x - bwX0 - 20) % 40 > 4) w.set(x, DECK, 206, B.Wood);
  // Lamps, with bunting strung lamp to lamp along the sea rail.
  let lastLamp: THREE.Vector3 | null = null;
  for (let x = bwX0 + 10; x < bwX1; x += 15) {
    if (x > 510 && x < 540) continue; // Ferris wheel platform
    prop('lamp', x + 0.5, DECK, 205.5);
    const top = v(x + 0.5, DECK + 3.9, 205.5);
    if (lastLamp && x - lastLamp.x < 20) kit.bunting.push([lastLamp, top]);
    lastLamp = top;
  }
  // Benches facing the sea, with bins between them.
  for (let x = bwX0 + 26; x < bwX1; x += 30) {
    if (x > 505 && x < 545) continue;
    prop('bench', x + 1.5, DECK, 203.2, Math.PI);
    benches.push(v(x + 1.5, DECK, 202.6));
    prop('bin', x + 5, DECK, 204.6);
    prop('planter', x - 6, DECK, 189.4);
  }
  // Cafe tables outside the food stands, on the deck in front of the shops.
  for (const [x0, x1] of [[200, 216], [236, 252], [300, 322], [560, 576]] as const)
    for (let x = x0 + 2; x < x1 - 1; x += 4) prop('umbrellaTable', x + 0.5, DECK, 192.5);
  const payphone = v(285.5, DECK, 190.5);
  w.fill(285, DECK, 189, 285, DECK + 2, 189, B.Metal);
  const ferris = v(525, DECK, 196);
  // Ferris wheel platform.
  w.fill(512, DECK - 1, 188, 538, DECK - 1, 206, B.Concrete);

  // Pines and oaks on the hills and west of the river.
  const tree = (x: number, z: number) => {
    const base = w.topY(x, z);
    if (w.get(x, base - 1, z) !== B.Grass && w.get(x, base - 1, z) !== B.Flower) return;
    const h = 4 + Math.floor(rng() * 4);
    w.fill(x, base, z, x, base + h - 1, z, B.Wood);
    const r = 2 + Math.floor(rng() * 2);
    const leaf = rng() < 0.5 ? B.Leaves : B.LeavesDark;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++)
          if (dx * dx + dy * dy * 1.6 + dz * dz <= r * r + 0.5 && !w.get(x + dx, base + h + dy, z + dz) && rng() > 0.06) w.set(x + dx, base + h + dy, z + dz, leaf);
  };
  for (let i = 0; i < 500; i++) {
    const x = Math.floor(rng() * SX), z = Math.floor(rng() * 150);
    const inTown = x > 140 && x < 610 && z > 58 && z < 150;
    if (inTown || Math.abs(x - riverX(z)) < RIVER_HALF + 4 || (z > 140 && z < 166)) continue;
    if (x > 600 && z > 60) continue;
    tree(x, z);
  }

  // ---------------------------------------------------------------- beach dressing
  const palm = (x: number, z: number) => {
    const base = w.topY(x, z);
    const h = 8 + Math.floor(rng() * 5);
    const lean = rng() < 0.5 ? 1 : -1;
    let px = x;
    for (let i = 0; i < h; i++) {
      if (i > 3 && i % 3 === 0) px += lean;
      w.set(px, base + i, z, BB.PalmTrunk);
    }
    const top = base + h;
    const fronds = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (const [dx, dz] of fronds)
      for (let r = 1; r <= 4; r++) {
        const droop = r > 2 ? -(r - 2) : 0;
        w.set(px + dx * r, top + droop, z + dz * r, BB.PalmLeaf);
      }
    w.set(px, top, z, BB.PalmLeaf);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1]]) w.set(px + dx, top - 1, z + dz, BB.Coconut);
    palms.push(v(px + 0.5, top - 1, z + 0.5));
  };
  for (let x = 150; x < 600; x += 16 + Math.floor(rng() * 10)) palm(x, 212 + Math.floor(rng() * 14));
  for (let x = 140; x < 760; x += 26 + Math.floor(rng() * 14)) palm(x, 140 + Math.floor(rng() * 6));
  for (let i = 0; i < 12; i++) palm(20 + Math.floor(rng() * 70), 170 + Math.floor(rng() * 40));

  // Umbrellas and towels.
  for (let i = 0; i < 70; i++) {
    const x = 150 + Math.floor(rng() * 450), z = 222 + Math.floor(rng() * 50);
    if (x > PIER_X0 - 4 && x < PIER_X1 + 4) continue;
    if (z > shoreZ(x) - 14) continue;
    const t = w.topY(x, z);
    const towel = pick(rng, [BB.Towel1, BB.Towel2, BB.Towel3]);
    w.fill(x, t - 1, z, x + 1, t - 1, z + 2, towel);
    towels.push(v(x + 1, t, z + 1.5));
    if (rng() < 0.6) {
      const ux = x + 3, uz = z + 1;
      w.fill(ux, t, uz, ux, t + 3, uz, B.White);
      const col = pick(rng, [BB.Umbrella1, BB.Umbrella2, BB.Umbrella3]);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) + Math.abs(dz) <= 3) w.set(ux + dx, t + 4 - (Math.abs(dx) + Math.abs(dz) > 2 ? 1 : 0), uz + dz, (dx + dz) % 2 === 0 ? col : B.White);
    }
  }
  // Dune grass near the boardwalk.
  for (let i = 0; i < 400; i++) {
    const x = 140 + Math.floor(rng() * 460), z = 208 + Math.floor(rng() * 8);
    const t = w.topY(x, z);
    if (w.get(x, t - 1, z) === B.Sand) w.set(x, t, z, BB.Reed);
  }
  // Rocks along the waterline at the west end.
  for (let i = 0; i < 40; i++) {
    const x = 96 + Math.floor(rng() * 40), z = Math.floor(shoreZ(x) - 6 + rng() * 14);
    const t = w.topY(x, z);
    w.fill(x, t, z, x + 1, t + Math.floor(rng() * 2), z + 1, BB.Rock);
  }

  // Lifeguard towers every 100 blocks.
  const towers: THREE.Vector3[] = [];
  for (const tx of [200, 300, 500]) {
    const tz = Math.floor(shoreZ(tx) - 6);
    const t = w.topY(tx, tz);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.fill(tx + dx, t, tz + dz, tx + dx, t + 4, tz + dz, B.White);
    w.fill(tx - 2, t + 5, tz - 2, tx + 2, t + 5, tz + 2, B.Plank);
    w.fill(tx - 2, t + 6, tz - 2, tx + 2, t + 6, tz - 2, B.RedPaint);
    w.fill(tx - 2, t + 6, tz - 2, tx - 2, t + 6, tz + 2, B.RedPaint);
    w.fill(tx + 2, t + 6, tz - 2, tx + 2, t + 6, tz + 2, B.RedPaint);
    w.fill(tx - 2, t + 9, tz - 2, tx + 2, t + 9, tz + 2, B.RedPaint);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) w.fill(tx + dx, t + 7, tz + dz, tx + dx, t + 8, tz + dz, B.White);
    // Ramp up the back.
    for (let i = 0; i < 5; i++) w.fill(tx - 1, t + i, tz - 3 - (4 - i), tx + 1, t + i, tz - 3 - (4 - i), B.Plank);
    towers.push(v(tx + 0.5, t + 6, tz + 0.5));
  }

  // Volleyball court: a raked sand rectangle with posts.
  const vb = { x0: 330, x1: 350, z0: 222, z1: 244, netZ: 233 };
  for (let x = vb.x0; x <= vb.x1; x++)
    for (let z = vb.z0; z <= vb.z1; z++) {
      const t = w.topY(x, z);
      const edge = x === vb.x0 || x === vb.x1 || z === vb.z0 || z === vb.z1;
      w.set(x, t - 1, z, edge ? B.White : BB.DarkSand);
    }
  w.fill(vb.x0 - 1, GL, vb.netZ, vb.x0 - 1, GL + 3, vb.netZ, B.Wood);
  w.fill(vb.x1 + 1, GL, vb.netZ, vb.x1 + 1, GL + 3, vb.netZ, B.Wood);

  // Sandcastle with its moat, near the low-tide line.
  const scx = 309, scz = Math.floor(shoreZ(309) - 18);
  {
    const t = w.topY(scx, scz);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const r = Math.max(Math.abs(dx), Math.abs(dz));
      if (r === 3) w.set(scx + dx, t - 1, scz + dz, BB.WetSand);
      else if (r <= 2) w.fill(scx + dx, t, scz + dz, scx + dx, t + (r === 2 ? 1 : 2), scz + dz, BB.DarkSand);
    }
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) w.set(scx + dx, t + 2, scz + dz, BB.DarkSand);
    w.set(scx, t + 3, scz, BB.DarkSand);
  }

  // Red-flag rip current zone at the west end of the beach.
  const ripZone = box(150, 0, shoreZ(170) - 4, 196, 30, 415);

  // ---------------------------------------------------------------- pier
  for (let z = 189; z <= PIER_END; z++)
    for (let x = PIER_X0; x <= PIER_X1; x++) {
      w.set(x, DECK - 1, z, (z % 9 === 0) ? B.Plank : BB.Boardwalk);
      if ((x === PIER_X0 || x === PIER_X1) && z % 6 === 0) {
        for (let y = Math.max(1, w.topY(x, z) - 1); y < DECK - 1; y++) if (!w.get(x, y, z)) w.set(x, y, z, BB.Piling);
      }
      if ((x === PIER_X0 || x === PIER_X1) && z > 206) w.set(x, DECK, z, z % 3 === 0 ? B.Wood : B.Air);
    }
  // End platform (a T), with a ladder down to the water and a high dive.
  const endZ0 = PIER_END - 14;
  for (let x = PIER_X0 - 18; x <= PIER_X1 + 18; x++)
    for (let z = endZ0; z <= PIER_END; z++) {
      w.set(x, DECK - 1, z, BB.Boardwalk);
      const edge = x === PIER_X0 - 18 || x === PIER_X1 + 18 || z === PIER_END || z === endZ0;
      const inner = x > PIER_X0 && x < PIER_X1;
      if (edge && !(z === endZ0 && inner)) w.set(x, DECK, z, (x + z) % 2 ? B.Wood : B.Air);
      if (edge && (x + z) % 5 === 0) for (let y = Math.max(1, w.topY(x, z) - 1); y < DECK - 1; y++) if (!w.get(x, y, z)) w.set(x, y, z, BB.Piling);
    }
  // Gap in the east railing and a ladder down.
  for (let z = endZ0 + 4; z <= endZ0 + 6; z++) w.set(PIER_X1 + 18, DECK, z, B.Air);
  for (let y = 7; y < DECK - 1; y++) w.set(PIER_X1 + 19, y, endZ0 + 5, B.Wood);
  // High dive tower on the east arm: 10 steps up to a board over the bloom.
  const divX = PIER_X1 + 12;
  for (let i = 0; i < 10; i++) w.fill(divX - 2 + (i % 2), DECK + i, endZ0 + 2 + i, divX + 2 - (i % 2) * 0, DECK + i, endZ0 + 2 + i, B.Plank);
  const boardY = DECK + 9;
  w.fill(divX - 1, boardY, endZ0 + 11, divX + 1, boardY, endZ0 + 13, B.Plank);
  w.fill(divX, boardY, PIER_END + 1, divX, boardY, PIER_END + 6, B.Plank);
  for (let y = DECK; y < boardY; y++) w.set(divX, y, endZ0 + 12, B.Metal);
  const divingBoard = v(divX + 0.5, boardY + 1, PIER_END + 5.5);
  const pierEnd = v(400.5, DECK, PIER_END - 4);
  const bloom = box(PIER_X1 + 2, 0, PIER_END - 2, PIER_X1 + 34, 30, PIER_END + 26);

  // ---------------------------------------------------------------- harbor
  // Seawall and quay.
  w.fill(harborX, 1, harborZ - 2, SX - 1, GL - 1, harborZ - 1, B.Concrete);
  for (let x = harborX; x < SX; x += 8) w.fill(x, GL, harborZ - 1, x, GL, harborZ - 1, B.Dark); // bollards
  // Breakwater along the west side, ending at the lighthouse.
  for (let z = harborZ; z <= 478; z++)
    for (let x = harborX - 4; x <= harborX + 4; x++) {
      const t = 2;
      for (let y = t; y < GL; y++) w.set(x, y, z, Math.abs(x - harborX) === 4 ? BB.Rock : y === GL - 1 ? B.Concrete : BB.Rock);
      setWater(x, z, NaN);
    }
  // Lighthouse.
  const lhX = harborX, lhZ = 486;
  for (let x = lhX - 8; x <= lhX + 8; x++)
    for (let z = lhZ - 8; z <= lhZ + 8; z++) {
      if ((x - lhX) ** 2 + (z - lhZ) ** 2 > 64) continue;
      for (let y = 1; y < GL; y++) w.set(x, y, z, BB.Rock);
      w.set(x, GL - 1, z, B.Concrete);
      setWater(x, z, NaN);
    }
  const lhTop = GL + 30;
  for (let y = GL; y < lhTop; y++)
    for (let dx = -3; dx <= 3; dx++)
      for (let dz = -3; dz <= 3; dz++) {
        const r = dx * dx + dz * dz;
        if (r > 10 || r < 5) continue;
        const band = Math.floor((y - GL) / 5) % 2 === 0;
        w.set(lhX + dx, y, lhZ + dz, band ? BB.Lighthouse : B.White);
      }
  // Spiral steps around the outside (like the big oak's).
  for (let i = 0; i < lhTop - GL; i++) {
    const ang = (i * Math.PI * 2) / 12;
    const px = Math.round(lhX + Math.cos(ang) * 4.6), pz = Math.round(lhZ + Math.sin(ang) * 4.6);
    w.fill(px, GL + i, pz, px + (Math.cos(ang) > 0 ? 1 : -1), GL + i, pz, B.Metal);
  }
  w.fill(lhX - 5, lhTop, lhZ - 5, lhX + 5, lhTop, lhZ + 5, B.Metal);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2) w.fill(lhX + dx, lhTop + 1, lhZ + dz, lhX + dx, lhTop + 3, lhZ + dz, B.Glass);
  w.fill(lhX - 2, lhTop + 4, lhZ - 2, lhX + 2, lhTop + 4, lhZ + 2, B.Dark);
  w.fill(lhX - 1, lhTop + 1, lhZ - 1, lhX + 1, lhTop + 2, lhZ + 1, BB.Lamp);

  // Docks (stand height DECK - 1 = 10).
  const dock = (x0: number, x1: number, z1: number) => {
    for (let x = x0; x <= x1; x++)
      for (let z = harborZ; z <= z1; z++) {
        w.set(x, GL - 1, z, BB.Boardwalk);
        if ((x === x0 || x === x1) && z % 6 === 0) for (let y = 2; y < GL - 1; y++) w.set(x, y, z, BB.Piling);
        setWater(x, z, NaN);
      }
  };
  dock(630, 635, 300); // sub + tender
  dock(660, 665, 320); // charter + tours
  dock(690, 698, 340); // ferry
  dock(740, 746, 300); // seaplane
  // Harbor buildings on the quay.
  shop('harbormaster', 'Harbor Master', 626, 188, 18, 14, 6, B.White, B.RoofBlue, 's', '#1c4fa0', '#ffffff', ['HARBOR MASTER']);
  shop('subs', "Davy's Discount Subs", 648, 192, 14, 12, 5, BB.Lemon, B.Dark, 's', '#ffe46a', '#111111', ["DAVY'S DISCOUNT SUBS", 'no refunds']);
  shop('charters', 'Reel Deal Charters', 666, 192, 14, 12, 5, B.WallBlue, B.RoofRed, 's', '#0a3a6a', '#ffffff', ['REEL DEAL', 'charters · whale tours']);
  shop('ferry', 'Ferry Terminal', 684, 186, 22, 18, 7, BB.Stucco, B.RoofGreen, 's', '#ffffff', '#0a6a8a', ['FERRY TERMINAL']);
  shop('workshop', 'Harbor Workshop', 712, 192, 14, 12, 5, B.Brick, B.Dark, 's', '#333333', '#ffcc33', ['WORKSHOP']);
  shop('hangar', 'Seaplane Hangar', 732, 184, 22, 20, 8, B.Metal, B.Dark, 's', '#dddddd', '#c02020', ['SKYHOP SEAPLANES']);
  // Anchor winch on a big work barge at the end of the sub dock.
  const anchorWinch = v(632.5, GL, 298);
  w.fill(624, GL - 1, 300, 641, GL - 1, 312, B.Metal);
  for (let x = 624; x <= 641; x++) for (let z = 300; z <= 312; z++) setWater(x, z, NaN);
  w.fill(624, 2, 300, 641, GL - 2, 312, B.Dark);
  const anchorDrop = v(640.5, GL, 311.5);

  // ---------------------------------------------------------------- cruise ship
  const cr = { x0: 440, x1: 572, z0: 545, z1: 579 };
  const midZ = (cr.z0 + cr.z1) / 2;
  const deckY = 18; // standing height of the main deck
  const lido = 23;
  for (let x = cr.x0; x <= cr.x1; x++) {
    // Pointed bow at the west end.
    const bowT = Math.min(1, (x - cr.x0) / 26);
    const half = Math.round(((cr.z1 - cr.z0) / 2) * Math.sqrt(bowT));
    for (let z = Math.round(midZ - half); z <= Math.round(midZ + half); z++) {
      const side = z === Math.round(midZ - half) || z === Math.round(midZ + half) || x === cr.x1;
      for (let y = 2; y < deckY; y++) {
        if (!side && y > 3 && y < deckY - 1) continue;
        const col = y < 8 ? BB.HullRed : y === 12 ? BB.Stripe : BB.Hull;
        w.set(x, y, z, col);
      }
      w.set(x, deckY - 1, z, BB.Deck);
      if (side) w.set(x, deckY, z, B.White);
      setWater(x, z, NaN);
    }
  }
  // Superstructure, lido deck with pool and buffet, bridge and funnel.
  w.fill(470, deckY, cr.z0 + 4, 560, lido - 2, cr.z1 - 4, BB.Hull);
  w.fill(471, deckY, cr.z0 + 5, 559, lido - 2, cr.z1 - 5, B.Air);
  for (let x = 472; x < 560; x += 3) w.set(x, deckY + 2, cr.z0 + 4, B.Glass);
  for (let x = 472; x < 560; x += 3) w.set(x, deckY + 2, cr.z1 - 4, B.Glass);
  w.fill(470, lido - 1, cr.z0 + 4, 560, lido - 1, cr.z1 - 4, BB.Deck);
  for (let x = 470; x <= 560; x++) for (const z of [cr.z0 + 4, cr.z1 - 4]) w.set(x, lido, z, B.White);
  for (let z = cr.z0 + 4; z <= cr.z1 - 4; z++) w.set(560, lido, z, B.White);
  // Stairs from the main deck up to the lido at the stern.
  for (let i = 0; i < 5; i++) w.fill(561 + i, deckY + i, midZ - 2, 561 + i, deckY + i, midZ + 2, B.Plank);
  w.fill(560, lido, midZ - 2, 560, lido, midZ + 2, B.Air);
  // Pool.
  w.fill(500, lido - 1, midZ - 5, 516, lido - 1, midZ + 5, BB.Turquoise);
  // Buffet tables.
  w.fill(478, lido, midZ - 6, 480, lido, midZ + 6, B.White);
  const buffet = v(482.5, lido, midZ + 0.5);
  const queue: THREE.Vector3[] = [];
  for (let i = 0; i < 9; i++) queue.push(v(540 - i * 1.4, lido, midZ + 0.5 + (i % 2) * 0.6));
  // Bridge and funnel.
  w.fill(474, lido, cr.z0 + 8, 490, lido + 4, cr.z1 - 8, BB.Hull);
  for (let x = 474; x <= 490; x += 2) w.set(x, lido + 2, cr.z0 + 8, B.Glass);
  w.fill(530, lido, midZ - 3, 538, lido + 10, midZ + 3, BB.HullRed);
  w.fill(530, lido + 8, midZ - 3, 538, lido + 8, midZ + 3, B.Dark);
  // Rope ladder up the starboard hull for swimmers.
  for (let y = 7; y < deckY; y++) w.set(520, y, cr.z0 - 1, BB.Rope);
  for (let y = 7; y < deckY; y++) setWater(520, cr.z0 - 1, SEA);

  // ---------------------------------------------------------------- inside the whale
  // A sealed room carved into the bedrock under the hills. The whale's belly: ribs, a
  // pink floor and a junk pile of everything it has swallowed.
  const bx0 = 18, bx1 = 38, bz0 = 12, bz1 = 30, by0 = 1, by1 = 7;
  for (let x = bx0 - 1; x <= bx1 + 1; x++)
    for (let z = bz0 - 1; z <= bz1 + 1; z++)
      for (let y = by0 - 1; y <= by1 + 1; y++) {
        const shell = x < bx0 || x > bx1 || z < bz0 || z > bz1 || y < by0 || y > by1;
        w.set(x, y, z, shell ? (y < by0 ? BB.NeonPink : (x + y) % 4 === 0 ? B.White : BB.CoralPink) : B.Air);
      }
  for (let i = 0; i < 40; i++) {
    const x = bx0 + 6 + Math.floor(rng() * 8), z = bz0 + 5 + Math.floor(rng() * 8);
    const y = w.topY(x, z) > by1 ? by0 : by0;
    let yy = y;
    while (w.get(x, yy, z) && yy < by1 - 2) yy++;
    w.set(x, yy, z, pick(rng, [B.Metal, B.Wood, BB.Rope, B.RedPaint, B.Dark, BB.Shell, B.Yellow]));
  }
  const belly = v((bx0 + bx1) / 2, by0, bz0 + 3);

  // ---------------------------------------------------------------- buoys and the bus stop
  const busStop = v(330.5, GL, HWY - 7.5);
  w.fill(326, GL, HWY - 9, 335, GL, HWY - 9, B.Metal);
  w.fill(326, GL + 3, HWY - 9, 335, GL + 3, HWY - 7, BB.Turquoise);

  const areas: Record<string, Box> = {
    boardwalk: box(150, DECK, 189, 590, DECK, 204),
    beachWest: box(150, GL, 212, 330, GL, 270),
    beachEast: box(420, GL, 212, 600, GL, 270),
    pier: box(PIER_X0 + 1, DECK, 210, PIER_X1 - 1, DECK, PIER_END - 2),
    town: box(150, GL, 70, 600, GL, 148),
    harbor: box(615, GL, 168, 760, GL, 228),
    hills: box(150, GL, 10, 600, GL, 55),
    cruise: box(cr.x0 + 30, deckY, cr.z0 + 2, cr.x1 - 4, deckY, cr.z1 - 2),
  };

  return {
    water,
    spawn: v(330.5, DECK + 3, 196),
    areas,
    shops,
    houses,
    palms,
    towers,
    towels,
    benches,
    sandcastle: v(scx + 0.5, w.topY(scx + 4, scz), scz + 0.5),
    volleyball: { center: v((vb.x0 + vb.x1) / 2 + 0.5, GL, vb.netZ + 0.5), ...vb, netZ: vb.netZ + 0.5 },
    ripZone,
    reef,
    bloom,
    divingBoard,
    pierEnd,
    lighthouse: { base: v(lhX + 0.5, GL, lhZ + 0.5), top: v(lhX + 0.5, lhTop + 1, lhZ + 0.5) },
    harbor: {
      anchorWinch,
      anchorDrop,
      ferryDock: v(694.5, GL, 336),
      seaplaneDock: v(743.5, GL, 296),
      charterDock: v(662.5, GL, 316),
      tourDock: v(663.5, GL, 300),
      subDock: v(632.5, GL, 290),
      tenderDock: v(633.5, GL, 270),
      workshop: v(719, GL, 199),
      trench,
    },
    cruise: { ...cr, deck: deckY, lido, buffet, queue, arrive: v(560.5, deckY, midZ + 0.5) },
    busStop,
    belly,
    payphone,
    ferris,
    roads,
    solid,
    kit,
  };
}

/** Random-ish helpers used by the runtime for scattering. */
export const pickRng = (rng: Rng) => rng;
