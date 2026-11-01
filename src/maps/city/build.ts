import * as THREE from 'three';
import { B, type VoxelWorld } from '../../voxel';
import { pick, type Rng } from '../../util';
import { buildHospital, type HospitalInfo } from '../../places/hospital';
import { StreetKit, PAL, type BuildingSpec, type Placement, type Preset, type WallStyle } from '../../kit';
import {
  AIRPORT_LOT,
  AIRPORT_ROAD_Z,
  HOSPITAL_LOT,
  AVES,
  AVE_HALF,
  G,
  GRID,
  ITALY,
  LAND,
  LIBERTY,
  MORTALIS,
  PARK,
  PIERS,
  POND,
  RAIL,
  RAIL_PLATFORM,
  SEWER_FLOOR,
  SITE,
  STATION,
  STREETS,
  ST_HALF,
  SUBWAY,
  SX,
  SZ,
  TUNNEL_FLOOR,
  WALK,
  blockRect,
  type Rect,
} from './layout';

export type Side = 'n' | 's' | 'e' | 'w';

/** A shop, home or other place the townsfolk can visit. */
export interface CityPlace {
  id: string;
  name: string;
  kind: string;
  /** Walkable point outside the entrance. */
  door: THREE.Vector3;
  inside?: Rect;
  sign?: { text: string[]; pos: THREE.Vector3; rotY: number; bg: string; fg: string; w?: number };
  jobs?: string[];
  sells?: { item: string; price: number }[];
  hours?: [number, number];
  spots?: THREE.Vector3[];
  staffSpots?: THREE.Vector3[];
  allowedJobs?: string[];
  lines?: string[];
  residents?: number;
}

/** A skyscraper tower drawn as textured boxes above a voxel podium. */
export interface TowerSpec {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y0: number;
  /** Stacked setback segments, bottom to top: [inset, height]. */
  segs: [number, number][];
  style: number;
  spire?: number;
  name?: string;
}

/** One kit building: its spec, and whether its ground floor is hollowed out to walk in. */
export interface KitLot {
  spec: BuildingSpec & Placement;
  hollow: boolean;
  /** Front fire escape (walk-ups): local x where it starts. */
  fireEscape?: number;
  /** Wooden water tank on the roof, at this fraction of the footprint. */
  tank?: [number, number];
}

export interface CityLayout {
  places: CityPlace[];
  towers: TowerSpec[];
  manholes: THREE.Vector3[];
  lamps: THREE.Vector3[];
  trees: THREE.Vector3[];
  benches: { pos: THREE.Vector3; rotY: number }[];
  parked: { pos: THREE.Vector3; rotY: number }[];
  steam: THREE.Vector3[];
  billboards: { pos: THREE.Vector3; rotY: number; w: number; h: number; kind: number }[];
  awnings: { x0: number; x1: number; z0: number; z1: number; y: number; colors: [number, number] }[];
  statuePlinth: THREE.Vector3;
  /** Detailed buildings drawn by the shared kit (src/kit) in setup. */
  kit: KitLot[];
  /** Columns people can't walk through (kit buildings have no voxels). Index z * SX + x. */
  blocked: Uint8Array;
  /** Street props from the kit (hydrants, bins, cafe tables...). */
  props: { kind: string; x: number; z: number; rotY: number }[];
  /** Bunting strung across streets (world end points). */
  bunting: [THREE.Vector3, THREE.Vector3][];
  dumpsters: { x: number; z: number; rotY: number }[];
  /** City General Hospital (src/places/hospital), stamped into HOSPITAL_LOT. */
  hospital?: HospitalInfo;
  /** Base of the tube man's fan on the Crazy Larry Motors lot (src/maps/city/tubeman.ts). */
  dealerFan?: THREE.Vector3;
}

const SHOP_NAMES: [string, string, string, { item: string; price: number }[]][] = [
  ['Bodega', 'shop', 'Cat Sleeps On Bread Bodega', [{ item: 'chopped cheese', price: 6 }, { item: 'lottery ticket', price: 2 }, { item: 'mystery soda', price: 1 }]],
  ['Deli', 'food', "Sal's Deli", [{ item: 'pastrami on rye', price: 14 }, { item: 'pickle', price: 1 }]],
  ['Laundromat', 'shop', 'Spin Cycle Laundromat', [{ item: 'wash and fold', price: 9 }]],
  ['Bank', 'civic', 'First National Bank of Debt', []],
  ['Bar', 'bar', 'The Rusty Liver', [{ item: 'beer', price: 7 }, { item: 'shot of regret', price: 5 }]],
  ['Coffee', 'food', 'Overpriced Coffee Co.', [{ item: 'oat latte', price: 9 }, { item: 'drip coffee', price: 4 }]],
  ['Bagels', 'food', 'Bagel Bros', [{ item: 'everything bagel', price: 3 }]],
  ['Pharmacy', 'shop', 'Wayne Drugs', [{ item: 'antacids', price: 6 }, { item: 'band-aids', price: 4 }]],
  ['Pawn', 'shop', 'Honest Eddie Pawn', [{ item: 'used trumpet', price: 40 }]],
  ['Dollar', 'shop', '99 Cent Dreams', [{ item: 'plastic flamingo', price: 1 }]],
  ['Noodles', 'food', 'Slurp City Noodles', [{ item: 'ramen', price: 13 }]],
  ['Barber', 'shop', 'Little Shaver Barber', [{ item: 'haircut', price: 20 }]],
];

const ITALY_SHOPS: [string, string, string, { item: string; price: number }[]][] = [
  ['Cannoli', 'food', 'Sorella Cannoli', [{ item: 'cannoli', price: 4 }]],
  ['Butcher', 'shop', 'Fratelli Butcher', [{ item: 'salami', price: 8 }]],
  ['Social', 'bar', 'Ravioli Social Club', [{ item: 'espresso', price: 3 }]],
  ['Gelato', 'food', 'Gelato Gelato', [{ item: 'gelato', price: 5 }]],
];

const BRIGHT = [B.RedPaint, B.RoofGreen, B.RoofBlue, B.Yellow, B.WallMint, B.RoofBrown];

/**
 * Builds the city's voxels and returns where everything is.
 * About 512 x 640 voxels: a lot for the airport, a grid of 42 blocks, Central Park, Little Italy,
 * Mortalis Mutual HQ, a construction site, a rail yard, a subway line and the harbor.
 */
type BOpts = {
  floors: number;
  wall: number;
  trim: number;
  front: Side;
  shop?: { name: string; kind: string; sells?: { item: string; price: number }[]; jobs?: string[]; awning?: [number, number]; sign?: [string, string]; lines?: string[] };
  home?: string;
  fireEscape?: boolean;
  roofJunk?: boolean;
  glassy?: boolean;
  solidGround?: boolean;
  /** Old-style voxel building (landmarks whose interiors the deaths use). */
  voxel?: boolean;
  preset?: Preset;
  /** Kit storeys (3 blocks each); default matches the voxel height. */
  kitFloors?: number;
  look?: Partial<BuildingSpec>;
  /** Shops: put a counter across the back (default true). */
  counter?: boolean;
};

export function buildCity(w: VoxelWorld, rng: Rng): CityLayout {
  const out: CityLayout = {
    places: [],
    towers: [],
    manholes: [],
    lamps: [],
    trees: [],
    benches: [],
    parked: [],
    steam: [],
    billboards: [],
    awnings: [],
    statuePlinth: new THREE.Vector3(),
    kit: [],
    blocked: new Uint8Array(SX * SZ),
    props: [],
    bunting: [],
    dumpsters: [],
  };
  const set = (x: number, y: number, z: number, b: number) => w.set(x, y, z, b);
  const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: number) => w.fill(x0, y0, z0, x1, y1, z1, b);
  const surf = (r: Rect, b: number) => fill(r.x0, G - 1, r.z0, r.x1, G - 1, r.z1, b);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  let uid = 0;

  // ------------------------------------------------------------------ ground and water
  fill(0, 0, 0, SX - 1, 2, SZ - 1, B.Sand); // sea bed everywhere
  fill(LAND.x0, 0, LAND.z0, LAND.x1, 0, LAND.z1, B.Stone);
  fill(LAND.x0, 1, LAND.z0, LAND.x1, G - 2, LAND.z1, B.Dirt);
  // Quay walls: stone faces where land meets water.
  fill(LAND.x0, 3, LAND.z0, LAND.x0, G - 1, LAND.z1, B.Stone);
  fill(LAND.x1, 3, LAND.z0, LAND.x1, G - 1, LAND.z1, B.Stone);
  fill(LAND.x0, 3, LAND.z0, LAND.x1, G - 1, LAND.z0, B.Stone);
  fill(LAND.x0, 3, LAND.z1, LAND.x1, G - 1, LAND.z1, B.Stone);
  surf({ x0: LAND.x0 + 1, z0: LAND.z0 + 1, x1: LAND.x1 - 1, z1: LAND.z1 - 1 }, B.Concrete);
  // Waterfront railings (low, 1 block) with gaps for piers.
  const railing = (x0: number, z0: number, x1: number, z1: number) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if ((x + z) % 2 === 0) set(x, G, z, B.Metal);
  };

  // ------------------------------------------------------------------ streets
  const ave = (c: number, z0: number, z1: number) => {
    fill(c - AVE_HALF - WALK, G - 1, z0, c + AVE_HALF - 1 + WALK, G - 1, z1, B.Sidewalk);
    fill(c - AVE_HALF, G - 1, z0, c + AVE_HALF - 1, G - 1, z1, B.Asphalt);
    for (let z = z0; z <= z1; z++) if (z % 8 < 4) set(c, G - 1, z, B.White);
  };
  const street = (c: number, x0: number, x1: number) => {
    fill(x0, G - 1, c - ST_HALF - WALK, x1, G - 1, c + ST_HALF - 1 + WALK, B.Sidewalk);
    fill(x0, G - 1, c - ST_HALF, x1, G - 1, c + ST_HALF - 1, B.Asphalt);
    for (let x = x0; x <= x1; x++) if (x % 8 < 4) set(x, G - 1, c - 1, B.Yellow);
  };
  for (const c of AVES) ave(c, GRID.z0, GRID.z1);
  for (const c of STREETS) street(c, GRID.x0, GRID.x1);
  // Airport access road and the west waterfront drive.
  street(AIRPORT_ROAD_Z, LAND.x0 + 2, LAND.x1 - 2);
  // Intersections: plain asphalt plus zebra crosswalks on all four sides.
  for (const ax of AVES)
    for (const sz of STREETS) {
      fill(ax - AVE_HALF, G - 1, sz - ST_HALF, ax + AVE_HALF - 1, G - 1, sz + ST_HALF - 1, B.Asphalt);
      for (let x = ax - AVE_HALF; x < ax + AVE_HALF; x++)
        if (x % 2 === 0)
          for (const z of [sz - ST_HALF - 3, sz - ST_HALF - 2, sz + ST_HALF + 1, sz + ST_HALF + 2]) if (w.get(x, G - 1, z) === B.Asphalt) set(x, G - 1, z, B.White);
      for (let z = sz - ST_HALF; z < sz + ST_HALF; z++)
        if (z % 2 === 0)
          for (const x of [ax - AVE_HALF - 3, ax - AVE_HALF - 2, ax + AVE_HALF + 1, ax + AVE_HALF + 2]) if (w.get(x, G - 1, z) === B.Asphalt) set(x, G - 1, z, B.White);
    }
  // Crosswalks sit in the road just outside each intersection: paint them there.
  for (const ax of AVES)
    for (const sz of STREETS) {
      for (let x = ax - AVE_HALF; x < ax + AVE_HALF; x++)
        if (x % 2 === 0) for (const z of [sz - ST_HALF - 2, sz - ST_HALF - 1, sz + ST_HALF, sz + ST_HALF + 1]) if (z >= GRID.z0 && z <= GRID.z1) set(x, G - 1, z, B.White);
      for (let z = sz - ST_HALF; z < sz + ST_HALF; z++)
        if (z % 2 === 0) for (const x of [ax - AVE_HALF - 2, ax - AVE_HALF - 1, ax + AVE_HALF, ax + AVE_HALF + 1]) if (x >= GRID.x0 && x <= GRID.x1) set(x, G - 1, z, B.White);
    }

  // Street furniture along every sidewalk: lamps, hydrants, trash cans, newspaper boxes.
  const furnish = (x: number, z: number, i: number) => {
    if (w.get(x, G - 1, z) !== B.Sidewalk || w.get(x, G, z) !== 0) return;
    if (i % 14 === 0) out.lamps.push(V(x + 0.5, G, z + 0.5)); // thin mesh lamp posts, see scenery
    else if (i % 37 === 5) out.props.push({ kind: 'hydrant', x: x + 0.5, z: z + 0.5, rotY: 0 });
    else if (i % 29 === 9) out.props.push({ kind: 'bin', x: x + 0.5, z: z + 0.5, rotY: 0 });
    else if (i % 53 === 21) out.props.push({ kind: 'newsStand', x: x + 0.5, z: z + 0.5, rotY: 0 });
    else if (i % 61 === 40) out.props.push({ kind: 'mailbox', x: x + 0.5, z: z + 0.5, rotY: 0 });
    else if (i % 47 === 30) out.props.push({ kind: 'bollard', x: x + 0.5, z: z + 0.5, rotY: 0 });
  };
  for (const c of AVES) {
    let i = 0;
    for (let z = GRID.z0; z <= GRID.z1; z++, i++) {
      furnish(c - AVE_HALF - 1, z, i);
      furnish(c + AVE_HALF, z, i + 7);
    }
  }
  for (const c of STREETS) {
    let i = 3;
    for (let x = GRID.x0; x <= GRID.x1; x++, i++) {
      furnish(x, c - ST_HALF - 1, i);
      furnish(x, c + ST_HALF, i + 7);
    }
  }
  // Keep intersections' corners clear (furniture can land on corner sidewalks).
  for (const ax of AVES)
    for (const sz of STREETS) fill(ax - AVE_HALF - WALK, G, sz - ST_HALF - WALK, ax + AVE_HALF - 1 + WALK, G + 5, sz + ST_HALF - 1 + WALK, B.Air);
  out.props = out.props.filter((p) => !AVES.some((ax) => STREETS.some((sz) => p.x >= ax - AVE_HALF - WALK && p.x <= ax + AVE_HALF + WALK && p.z >= sz - ST_HALF - WALK && p.z <= sz + ST_HALF + WALK)));

  // ------------------------------------------------------------------ buildings
  /** Hex colors for the few block colors call sites still use for awnings. */
  const HEX: Record<number, number> = { [B.RoofGreen]: 0x2f7a45, [B.White]: 0xf2ece0, [B.RedPaint]: 0xc8302c, [B.RoofBlue]: 0x2f5a9a, [B.Yellow]: 0xe0a830 };
  /** New York walls: brownstone, red and brown brick, limestone, the odd cream stucco. */
  const NY_LOOKS: { wall: number; wallStyle: WallStyle; trim?: number }[] = [
    { wall: 0x7a4a36, wallStyle: 'stone', trim: 0x8e5a44 },
    { wall: 0x6e4030, wallStyle: 'stone', trim: 0x85513e },
    { wall: PAL.brickRed, wallStyle: 'brick' },
    { wall: PAL.brickBrown, wallStyle: 'brick' },
    { wall: 0x9a5a40, wallStyle: 'brick' },
    { wall: 0x7c3a2c, wallStyle: 'brick' },
    { wall: PAL.stone, wallStyle: 'stone' },
    { wall: 0xc9b48e, wallStyle: 'brick' },
    { wall: PAL.cream, wallStyle: 'stucco' },
  ];
  const signText = (name: string) => name.toUpperCase().replace(/[^A-Z0-9 .,!?'&$+/:#-]/g, '').trim();

  /**
   * A detailed kit building on a lot (drawn in setup). Shops get a hollow ground floor with
   * an open door, a plank floor and a counter, so people and the player can walk in.
   */
  const kitShell = (r: Rect, o: BOpts) => {
    const wx = r.x1 - r.x0 + 1, wz = r.z1 - r.z0 + 1;
    const along = o.front === 'n' || o.front === 's';
    const wd = along ? wx : wz, dp = along ? wz : wx;
    const floors = o.kitFloors ?? Math.max(1, Math.round((o.floors * 4) / 3));
    const preset: Preset = o.preset ?? (o.glassy ? 'modern' : 'mainstreet');
    const look = preset === 'mainstreet' ? pick(rng, NY_LOOKS) : {};
    const hollow = !!o.shop;
    const spec: BuildingSpec & Placement = {
      x: r.x0,
      z: r.z0,
      y: G,
      face: o.front,
      w: wd,
      d: dp,
      floors,
      preset,
      seed: Math.floor(rng() * 1e9),
      ground: o.shop ? 'shop' : o.home ? 'door' : 'blank',
      ...look,
      ...(o.shop ? { sign: signText(o.shop.name) } : {}),
      ...(o.shop?.awning ? { awning: [HEX[o.shop.awning[0]] ?? 0xc8302c, HEX[o.shop.awning[1]] ?? 0xf2ece0] as [number, number] } : {}),
      ...o.look,
};
    const lot: KitLot = { spec, hollow };
    if (o.fireEscape && !o.shop && floors >= 3 && wd >= 9) lot.fireEscape = Math.min(wd / 2 + 0.8, wd - 4.9);
    if (o.roofJunk && wd >= 8 && dp >= 8 && rng() < 0.6) lot.tank = [0.25 + rng() * 0.5, 0.35 + rng() * 0.4];
    out.kit.push(lot);
    surf(r, hollow ? B.Plank : B.Concrete);
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) out.blocked[z * SX + x] = 1;
    // Building-local (front at z = 0, facing -z) to world.
    const m = StreetKit.placement(spec, wd, dp);
    const L = (lx: number, lz: number) => new THREE.Vector3(lx, 0, lz).applyMatrix4(m).setY(G);
    const doorOut = L(wd / 2, -1.5);
    const top = G + floors * 3;
    if (o.shop) {
      for (let x = r.x0 + 1; x < r.x1; x++) for (let z = r.z0 + 1; z < r.z1; z++) out.blocked[z * SX + x] = 0;
      const dc = L(wd / 2, 0.5);
      out.blocked[Math.floor(dc.z) * SX + Math.floor(dc.x)] = 0;
      // Counter two blocks off the back wall, staff behind it.
      const cr = L(wd / 2, dp - 2.5);
      if (o.counter === false) void 0;
      else if (along) fill(r.x0 + 2, G, Math.floor(cr.z), r.x1 - 2, G, Math.floor(cr.z), o.shop.kind === 'bar' ? B.Wood : B.White);
      else fill(Math.floor(cr.x), G, r.z0 + 2, Math.floor(cr.x), G, r.z1 - 2, o.shop.kind === 'bar' ? B.Wood : B.White);
      out.places.push({
        id: `shop-${uid++}`,
        name: o.shop.name,
        kind: o.shop.kind,
        door: doorOut,
        inside: { x0: r.x0 + 1, z0: r.z0 + 1, x1: r.x1 - 1, z1: r.z1 - 1 },
        sells: o.shop.sells,
        jobs: o.shop.jobs ?? ['Clerk'],
        hours: o.shop.kind === 'bar' ? [16, 3] : [7, 21],
        staffSpots: [L(wd / 2, dp - 1.5)],
        lines: o.shop.lines,
      });
    } else if (o.home) {
      out.places.push({ id: `home-${uid++}`, name: o.home, kind: 'home', door: doorOut, residents: 2 + Math.floor(rng() * 3) });
    }
    if (lot.fireEscape !== undefined) {
      // A dumpster under the first landing, so anyone can climb up.
      const dpos = L(lot.fireEscape + 1.2, -1.1);
      out.dumpsters.push({ x: dpos.x, z: dpos.z, rotY: { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 }[o.front] });
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) out.blocked[Math.floor(dpos.z + dz * 0.7) * SX + Math.floor(dpos.x + dx * 0.9)] = 1;
    }
    return { top, doorOut };
  };

  /** Generic building with windows, cornice, optional storefront, fire escape and roof clutter. */
  const building = (r: Rect, o: BOpts) => {
    if (!o.voxel) return kitShell(r, o);
    const h = o.floors * 4;
    const top = G + h;
    surf(r, B.Concrete);
    // Shell.
    for (let y = G; y < top; y++)
      for (let x = r.x0; x <= r.x1; x++)
        for (let z = r.z0; z <= r.z1; z++) {
          const edge = x === r.x0 || x === r.x1 || z === r.z0 || z === r.z1;
          if (!edge) continue;
          const corner = (x === r.x0 || x === r.x1) && (z === r.z0 || z === r.z1);
          const fy = (y - G) % 4;
          const u = x === r.x0 || x === r.x1 ? z : x;
          const win = !corner && (o.glassy ? fy !== 0 : (fy === 1 || fy === 2) && u % 3 !== 0);
          set(x, y, z, corner ? o.trim : win ? B.Glass : fy === 0 && y > G ? o.trim : o.wall);
        }
    // Solid core above the ground floor (no interior faces to mesh).
    fill(r.x0 + 1, G + 4, r.z0 + 1, r.x1 - 1, top - 1, r.z1 - 1, o.wall);
    if (o.solidGround) fill(r.x0 + 1, G, r.z0 + 1, r.x1 - 1, G + 3, r.z1 - 1, o.wall);
    else fill(r.x0 + 1, G + 3, r.z0 + 1, r.x1 - 1, G + 3, r.z1 - 1, o.trim);
    // Cornice and parapet.
    fill(r.x0 - 1, top, r.z0 - 1, r.x1 + 1, top, r.z1 + 1, o.trim);
    fill(r.x0, top + 1, r.z0, r.x1, top + 1, r.z1, o.trim);
    fill(r.x0 + 1, top + 1, r.z0 + 1, r.x1 - 1, top + 1, r.z1 - 1, B.Air);
    fill(r.x0 + 1, top, r.z0 + 1, r.x1 - 1, top, r.z1 - 1, B.Dark); // tar roof

    // Front geometry.
    const cx = Math.floor((r.x0 + r.x1) / 2), cz = Math.floor((r.z0 + r.z1) / 2);
    const fz = o.front === 'n' ? r.z0 : o.front === 's' ? r.z1 : cz;
    const fx = o.front === 'w' ? r.x0 : o.front === 'e' ? r.x1 : cx;
    const along = o.front === 'n' || o.front === 's';
    const out1 = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[o.front];
    const doorOut = V(fx + out1[0] * 1.5 + 0.5, G, fz + out1[1] * 1.5 + 0.5);
    if (along) doorOut.x = cx + 1;
    else doorOut.z = cz + 1;

    if (o.shop) {
      // Storefront: display glass, a double door and an awning.
      const a0 = along ? r.x0 + 1 : r.z0 + 1, a1 = along ? r.x1 - 1 : r.z1 - 1;
      for (let u = a0; u <= a1; u++)
        for (let y = G; y <= G + 2; y++) {
          const x = along ? u : fx, z = along ? fz : u;
          set(x, y, z, y === G ? o.trim : B.Glass);
        }
      for (let y = G; y <= G + 2; y++)
        for (const d of [0, 1]) {
          const x = along ? cx + d : fx, z = along ? fz : cz + d;
          set(x, y, z, B.Air);
        }
      const aw = o.shop.awning ?? [pick(rng, BRIGHT), B.White];
      const ax0 = along ? r.x0 : fx + out1[0], ax1 = along ? r.x1 : fx + out1[0];
      const az0 = along ? fz + out1[1] : r.z0, az1 = along ? fz + out1[1] : r.z1;
      for (let x = Math.min(ax0, ax1); x <= Math.max(ax0, ax1); x++)
        for (let z = Math.min(az0, az1); z <= Math.max(az0, az1); z++) set(x, G + 3, z, ((along ? x : z) % 2 === 0 ? aw[0] : aw[1]));
      out.awnings.push({ x0: Math.min(ax0, ax1), x1: Math.max(ax0, ax1), z0: Math.min(az0, az1), z1: Math.max(az0, az1), y: G + 3, colors: aw });
      // Floor and a counter along the back wall.
      fill(r.x0 + 1, G - 1, r.z0 + 1, r.x1 - 1, G - 1, r.z1 - 1, B.Plank);
      const back = { n: r.z1 - 2, s: r.z0 + 2, e: r.x0 + 2, w: r.x1 - 2 }[o.front];
      if (along) fill(r.x0 + 2, G, back, r.x1 - 2, G, back, o.shop.kind === 'bar' ? B.Wood : B.White);
      else fill(back, G, r.z0 + 2, back, G, r.z1 - 2, o.shop.kind === 'bar' ? B.Wood : B.White);
      const inside = { x0: r.x0 + 1, z0: r.z0 + 1, x1: r.x1 - 1, z1: r.z1 - 1 };
      const staff = along ? V(cx + 0.5, G, back + (o.front === 'n' ? 1.5 : -0.5)) : V(back + (o.front === 'w' ? 1.5 : -0.5), G, cz + 0.5);
      const signPos = along ? V(cx + 1, G + 4.4, fz + out1[1] * 0.62 + (o.front === 's' ? 1 : 0)) : V(fx + out1[0] * 0.62 + (o.front === 'e' ? 1 : 0), G + 4.4, cz + 1);
      const rotY = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }[o.front];
      const [bg, fg] = o.shop.sign ?? [pick(rng, ['#1d2b4f', '#7a1a1a', '#1a5a2a', '#222222', '#5a2a7a', '#c06010']), '#ffffff'];
      out.places.push({
        id: `shop-${uid++}`,
        name: o.shop.name,
        kind: o.shop.kind,
        door: doorOut,
        inside,
        sells: o.shop.sells,
        jobs: o.shop.jobs ?? ['Clerk'],
        hours: o.shop.kind === 'bar' ? [16, 3] : [7, 21],
        staffSpots: [staff],
        lines: o.shop.lines,
        sign: { text: [o.shop.name.toUpperCase()], pos: signPos, rotY, bg, fg, w: Math.min(r.x1 - r.x0, r.z1 - r.z0, 12) },
      });
    } else if (o.home) {
      // Stoop: three stone steps up to a dark door.
      for (let s = 0; s < 3; s++)
        for (const d of [0, 1]) {
          const x = along ? cx + d : fx + out1[0] * (3 - s), z = along ? fz + out1[1] * (3 - s) : cz + d;
          fill(x, G, z, x, G + s, z, B.Stone);
        }
      for (let y = G + 3; y <= G + 5; y++)
        for (const d of [0, 1]) set(along ? cx + d : fx, y, along ? fz : cz + d, B.Dark);
      const st = V(along ? cx + 1 : fx + out1[0] * 4.5 + 0.5, G, along ? fz + out1[1] * 4.5 + 0.5 : cz + 1);
      out.places.push({ id: `home-${uid++}`, name: o.home, kind: 'home', door: st, residents: 2 + Math.floor(rng() * 3) });
    }

    // Fire escape: switchback stairs up the side, climbable to the roof.
    if (o.fireEscape && o.floors >= 3) {
      const side: Side = o.front === 'n' || o.front === 's' ? (rng() < 0.5 ? 'e' : 'w') : 'n';
      const len = side === 'n' ? r.x1 - r.x0 : r.z1 - r.z0;
      if (len >= 10) {
        const base = side === 'n' ? r.x0 + 1 : r.z0 + 1;
        const P = (u: number, d: number, y: number) => {
          if (side === 'n') set(base + u, y, r.z0 - d, B.Metal);
          else if (side === 'e') set(r.x1 + d, y, base + u, B.Metal);
          else set(r.x0 - d, y, base + u, B.Metal);
        };
        // Drop ladder platform starts 4 up, reachable with a double jump or a dumpster.
        for (let f = 1; f < o.floors; f++) {
          const y = G + f * 4 - 1;
          for (let u = 0; u < 8; u++) for (let d = 1; d <= 2; d++) if (u < 2 || u > 5) P(u, d, y);
          // Stairs: row 1 climbs left to right, row 2 right to left.
          const goingRight = f % 2 === 1;
          for (let s = 0; s < 4; s++) {
            const u = goingRight ? 2 + s : 5 - s;
            P(u, goingRight ? 1 : 2, y + s + 1);
          }
        }
        // Dumpster under the bottom landing so anyone can reach it.
        const du = 0;
        if (side === 'n') fill(base + du, G, r.z0 - 3, base + du + 2, G + 1, r.z0 - 2, B.RoofGreen);
        else if (side === 'e') fill(r.x1 + 2, G, base + du, r.x1 + 3, G + 1, base + du + 2, B.RoofGreen);
        else fill(r.x0 - 3, G, base + du, r.x0 - 2, G + 1, base + du + 2, B.RoofGreen);
      }
    }

    // Roof: water tank on legs, AC units, stair hut.
    if (o.roofJunk) {
      const ry = top + 1;
      if (r.x1 - r.x0 >= 8 && r.z1 - r.z0 >= 8 && rng() < 0.7) {
        const tx = r.x0 + 3 + Math.floor(rng() * (r.x1 - r.x0 - 6)), tz = r.z0 + 3 + Math.floor(rng() * (r.z1 - r.z0 - 6));
        for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fill(tx + lx, ry, tz + lz, tx + lx, ry + 2, tz + lz, B.Metal);
        for (let y = ry + 3; y < ry + 7; y++)
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (dx * dx + dz * dz <= 5) set(tx + dx, y, tz + dz, y === ry + 4 ? B.Dark : B.Wood);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(tx + dx, ry + 7, tz + dz, B.RoofBrown);
        set(tx, ry + 8, tz, B.RoofBrown);
      }
      for (let i = 0; i < 3; i++) {
        const ax = r.x0 + 2 + Math.floor(rng() * Math.max(1, r.x1 - r.x0 - 4)), az = r.z0 + 2 + Math.floor(rng() * Math.max(1, r.z1 - r.z0 - 4));
        if (w.get(ax, ry, az) === 0 && w.get(ax + 1, ry, az) === 0) fill(ax, ry, az, ax + 1, ry, az, B.Metal);
      }
    }
    return { top, doorOut };
  };

  /** Split a block into a row of lots facing a street, and build each. */
  const lotRow = (x0: number, x1: number, z0: number, z1: number, front: Side, make: (r: Rect, i: number) => void) => {
    let x = x0;
    let i = 0;
    while (x <= x1) {
      let wd = 9 + Math.floor(rng() * 6);
      if (x1 - (x + wd - 1) < 9) wd = x1 - x + 1;
      make({ x0: x, z0, x1: x + wd - 1, z1 }, i++);
      x += wd;
    }
    void front;
  };

  let shopIdx = Math.floor(rng() * SHOP_NAMES.length);
  const nextShop = () => {
    const s = SHOP_NAMES[shopIdx++ % SHOP_NAMES.length];
    return { name: s[2], kind: s[1], sells: s[3] };
  };
  const BROWN = [B.RoofBrown, B.Brick, B.Brick, B.WallPeach, B.Stone];
  const homeNames = ['Brownstone', 'Walk-up', 'Row House', 'Apartments', 'Tenement'];

  /** A block of mixed shops and walk-ups: lots along the north and south halves. */
  const mixedBlock = (r: Rect, floorsMin: number, floorsMax: number, shopChance: number, shops = nextShop, preset?: Preset) => {
    const mid = Math.floor((r.z0 + r.z1) / 2);
    for (const half of ['n', 's'] as Side[]) {
      const z0 = half === 'n' ? r.z0 : mid + 1, z1 = half === 'n' ? mid - 1 : r.z1;
      lotRow(r.x0, r.x1, z0, z1, half, (lot, i) => {
        const floors = floorsMin + Math.floor(rng() * (floorsMax - floorsMin + 1));
        const shop = rng() < shopChance;
        building(lot, {
          floors,
          wall: pick(rng, BROWN),
          trim: rng() < 0.6 ? B.White : B.Concrete,
          front: half,
          shop: shop ? shops() : undefined,
          home: shop ? undefined : `${pick(rng, homeNames)} ${100 + uid}`,
          fireEscape: i % 2 === 0,
          roofJunk: true,
          preset,
        });
      });
    }
  };

  /** Split [a0, a1] into runs between min and max long. */
  const splitRange = (a0: number, a1: number, min: number, max: number) => {
    const runs: [number, number][] = [];
    let a = a0;
    while (a <= a1) {
      let len = min + Math.floor(rng() * (max - min + 1));
      if (a1 - (a + len - 1) < min) len = a1 - a + 1;
      runs.push([a, a + len - 1]);
      a += len;
    }
    return runs;
  };

  /**
   * Midtown: a four-storey podium of kit buildings (lobby in the middle of the front, shops
   * beside it) with a mesh tower rising from its roof.
   */
  const towerBlock = (r: Rect, name: string, style: number, heights: [number, number], front: Side, lobby = true) => {
    const alongX = front === 'n' || front === 's';
    const back: Side = ({ n: 's', s: 'n', e: 'w', w: 'e' } as const)[front];
    const classic = style % 2 === 0;
    const look: Partial<BuildingSpec> = classic
      ? { wall: pick(rng, [PAL.stone, 0xd2c6ae, 0xbfae92]), wallStyle: 'stone', trim: PAL.trimStone, windowTop: 'arch' }
      : { wall: pick(rng, [PAL.concrete, 0xa9b0b8, 0xd8d2c4, 0x8a8f96]), wallStyle: 'concrete' };
    const preset: Preset = classic ? 'mainstreet' : 'modern';
    const mid = alongX ? Math.floor((r.z0 + r.z1) / 2) : Math.floor((r.x0 + r.x1) / 2);
    for (const side of [front, back]) {
      const lo = side === 'n' || side === 'w';
      const runs = alongX ? splitRange(r.x0, r.x1, 14, 22) : splitRange(r.z0, r.z1, 12, 20);
      runs.forEach(([a0, a1], i) => {
        const rect = alongX
          ? { x0: a0, x1: a1, z0: lo ? r.z0 : mid + 1, z1: lo ? mid : r.z1 }
          : { z0: a0, z1: a1, x0: lo ? r.x0 : mid + 1, x1: lo ? mid : r.x1 };
        const isLobby = lobby && side === front && i === Math.floor(runs.length / 2);
        const shop = isLobby
          ? { name, kind: 'work', jobs: ['Office Worker', 'Stockbroker', 'Security Guard'], sells: [] }
          : side === front && rng() < 0.6
            ? nextShop()
            : undefined;
        building(rect, { floors: 3, kitFloors: 4, wall: 0, trim: 0, front: side, glassy: true, preset, shop, look: { ...look, awning: isLobby ? false : undefined } });
      });
    }
    const inset = 3;
    const h = heights[0] + Math.floor(rng() * (heights[1] - heights[0]));
    const segs: [number, number][] = [[inset, Math.floor(h * 0.6)]];
    if (rng() < 0.7) segs.push([inset + 4, Math.floor(h * 0.25)]);
    if (rng() < 0.5) segs.push([inset + 8, Math.floor(h * 0.15)]);
    out.towers.push({ x0: r.x0, z0: r.z0, x1: r.x1 + 1, z1: r.z1 + 1, y0: G + 12, segs, style, spire: rng() < 0.3 ? 10 + rng() * 20 : undefined, name });
  };

  // Districts block by block.
  const office = ['Dewey Cheatem & Howe', 'Globex Tower', 'One Penny Plaza', 'Big Money Building', 'Synergy Center', 'Leverage Tower', 'Fiduciary Spire', 'Paperwork Plaza', 'The Quarterly'];
  let oi = 0;
  for (let col = 0; col < 6; col++)
    for (let row = 0; row < 6; row++) {
      const r = blockRect(col, row);
      const inPark = col >= 2 && col <= 3 && (row === 1 || row === 2);
      const inSite = col === 5 && (row === 1 || row === 2);
      const inItaly = col <= 1 && row >= 4;
      if (inPark || inSite || inItaly) continue;
      if (col === 0 && row === 1) continue; // the station
      if (col === 3 && row === 3) continue; // Mortalis
      if (col >= 4 && row >= 4) continue; // hospital superblock
      if (col === 2 && row === 5) continue; // car dealership
      if (col === 2 && row === 4) continue; // the deli block with the manhole
      if (row <= 3 && col >= 1 && col <= 4) {
        const fr: Side = row === 0 ? 's' : row === 3 ? 'n' : col === 1 ? 'e' : 'w';
        towerBlock(r, office[oi++ % office.length], (col * 7 + row * 3) % 5, row === 0 ? [70, 150] : [50, 120], fr);
      } else if (row <= 3) {
        mixedBlock(r, 4, 7, 0.55);
      } else {
        mixedBlock(r, 3, 6, 0.4);
      }
    }

  // The deli block: the manhole sits right outside Sal's Deli. "HEY!"
  {
    const r = blockRect(2, 4);
    const mid = Math.floor((r.z0 + r.z1) / 2);
    building({ x0: r.x0, z0: r.z0, x1: r.x0 + 13, z1: mid - 1 }, { floors: 4, wall: B.Brick, trim: B.White, front: 'n', shop: { name: "Sal's Deli", kind: 'food', sells: [{ item: 'pastrami on rye', price: 14 }, { item: 'pickle', price: 1 }], awning: [B.RoofGreen, B.White], jobs: ['Line Cook'] }, fireEscape: true, roofJunk: true });
    lotRow(r.x0 + 14, r.x1, r.z0, mid - 1, 'n', (lot, i) => building(lot, { floors: 4 + (i % 3), wall: pick(rng, BROWN), trim: B.White, front: 'n', home: `Walk-up ${uid}`, fireEscape: true, roofJunk: true }));
    lotRow(r.x0, r.x1, mid + 1, r.z1, 's', (lot, i) => building(lot, { floors: 3 + (i % 3), wall: pick(rng, BROWN), trim: B.White, front: 's', shop: rng() < 0.4 ? nextShop() : undefined, home: `Brownstone ${uid}`, roofJunk: true }));
    // Open manhole in the street in front of the deli (street 330, north curb lane).
    out.manholes.push(V(r.x0 + 7.5, G, STREETS[4] + 1.5));
  }
  // A second manhole on 5th... er, the avenue by the bus stop.
  out.manholes.push(V(AVES[2] - 2.5, G, STREETS[1] + 22.5));

  // Dig the manholes: a 2x2 shaft down to the sewer, a short sewer pipe with murky water.
  for (const m of out.manholes) {
    const mx = Math.floor(m.x), mz = Math.floor(m.z);
    fill(mx - 1, SEWER_FLOOR, mz - 1, mx, G - 1, mz, B.Air);
    fill(mx - 4, SEWER_FLOOR - 1, mz - 4, mx + 3, SEWER_FLOOR - 1, mz + 3, B.Stone);
    fill(mx - 4, SEWER_FLOOR, mz - 4, mx + 3, SEWER_FLOOR + 3, mz + 3, B.Air);
    // ring
    for (const [dx, dz] of [[-2, -2], [1, -2], [-2, 1], [1, 1], [-2, -1], [-2, 0], [1, -1], [1, 0], [-1, -2], [0, -2], [-1, 1], [0, 1]]) set(mx + dx, G - 1, mz + dz, B.Metal);
    out.steam.push(V(mx, G, mz));
  }

  // Steam vents in random streets for atmosphere.
  for (let i = 0; i < 10; i++) {
    const sz = pick(rng, STREETS);
    const x = GRID.x0 + 12 + Math.floor(rng() * (GRID.x1 - GRID.x0 - 24));
    if (w.get(x, G - 1, sz) === B.Asphalt) {
      set(x, G - 1, sz, B.Metal);
      out.steam.push(V(x + 0.5, G, sz + 0.5));
    }
  }

  // ------------------------------------------------------------------ Central Park
  {
    const p = PARK;
    fill(p.x0, G - 1, p.z0, p.x1, G - 1, p.z1, B.Grass);
    for (let x = p.x0; x <= p.x1; x++) for (let z = p.z0; z <= p.z1; z++) if (((x * 7 + z * 13) % 97) === 0) set(x, G - 1, z, B.Flower);
    // Low stone wall around the park with gates midway on every side.
    const gate = (x: number, z: number) => Math.abs(x - (p.x0 + p.x1) / 2) < 4 || Math.abs(z - (p.z0 + p.z1) / 2) < 4 || Math.abs(x - 238) < 3 || Math.abs(x - 300) < 3;
    for (let x = p.x0; x <= p.x1; x++)
      for (const z of [p.z0, p.z1]) if (!gate(x, -999)) set(x, G, z, B.Stone);
    for (let z = p.z0; z <= p.z1; z++)
      for (const x of [p.x0, p.x1]) if (!gate(-999, z)) set(x, G, z, B.Stone);
    // Paths: a ring and two cross paths.
    const path = (x0: number, z0: number, x1: number, z1: number) => fill(x0, G - 1, z0, x1, G - 1, z1, B.Gravel);
    path(p.x0 + 4, p.z0 + 4, p.x1 - 4, p.z0 + 6);
    path(p.x0 + 4, p.z1 - 6, p.x1 - 4, p.z1 - 4);
    path(p.x0 + 4, p.z0 + 4, p.x0 + 6, p.z1 - 4);
    path(p.x1 - 6, p.z0 + 4, p.x1 - 4, p.z1 - 4);
    const mx = Math.floor((p.x0 + p.x1) / 2), mz = Math.floor((p.z0 + p.z1) / 2);
    path(p.x0, mz - 1, p.x1, mz + 1);
    path(mx - 1, p.z0, mx + 1, p.z1);
    // Fountain plaza in the middle.
    fill(mx - 7, G - 1, mz - 7, mx + 7, G - 1, mz + 7, B.Sidewalk);
    for (let dx = -4; dx <= 4; dx++)
      for (let dz = -4; dz <= 4; dz++) {
        const d = dx * dx + dz * dz;
        if (d <= 16 && d >= 10) set(mx + dx, G, mz + dz, B.White);
        else if (d < 10) set(mx + dx, G - 1, mz + dz, B.TankBlue);
      }
    fill(mx, G, mz, mx, G + 3, mz, B.White);
    set(mx, G + 4, mz, B.TankBlue);
    // Pond with sandy edges (dug two deep; water drawn as a plane in setup).
    for (let dx = -POND.rx - 2; dx <= POND.rx + 2; dx++)
      for (let dz = -POND.rz - 2; dz <= POND.rz + 2; dz++) {
        const d = (dx * dx) / (POND.rx * POND.rx) + (dz * dz) / (POND.rz * POND.rz);
        const x = POND.x + dx, z = POND.z + dz;
        if (d < 1) {
          fill(x, G - 3, z, x, G - 1, z, B.Air);
          set(x, G - 4, z, B.Sand);
        } else if (d < 1.35) set(x, G - 1, z, B.Sand);
      }
    // Trees: dense groves, avoiding paths, plaza and pond.
    const tree = (x: number, z: number) => {
      const hh = 5 + Math.floor(rng() * 4);
      fill(x, G, z, x, G + hh - 1, z, B.Wood);
      const rr = 2 + Math.floor(rng() * 2);
      const leaf = rng() < 0.5 ? B.Leaves : B.LeavesDark;
      for (let dx = -rr; dx <= rr; dx++)
        for (let dy = -rr; dy <= rr; dy++)
          for (let dz = -rr; dz <= rr; dz++) if (dx * dx + dy * dy * 1.6 + dz * dz <= rr * rr + 0.5 && w.get(x + dx, G + hh + dy, z + dz) === 0 && rng() > 0.06) set(x + dx, G + hh + dy, z + dz, leaf);
      out.trees.push(V(x + 0.5, G + hh + rr, z + 0.5));
};
    for (let i = 0; i < 160; i++) {
      const x = p.x0 + 3 + Math.floor(rng() * (p.x1 - p.x0 - 6)), z = p.z0 + 3 + Math.floor(rng() * (p.z1 - p.z0 - 6));
      if (w.get(x, G - 1, z) !== B.Grass && w.get(x, G - 1, z) !== B.Flower) continue;
      let ok = true;
      for (let dx = -2; dx <= 2 && ok; dx++) for (let dz = -2; dz <= 2 && ok; dz++) if (w.get(x + dx, G - 1, z + dz) !== B.Grass && w.get(x + dx, G - 1, z + dz) !== B.Flower) ok = false;
      if (ok && w.get(x, G, z) === 0 && w.get(x + 1, G + 3, z) === 0) tree(x, z);
    }
    // Benches along the paths.
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const x = Math.floor(p.x0 + 8 + t * (p.x1 - p.x0 - 16));
      out.benches.push({ pos: V(x + 0.5, G, p.z0 + 7.6), rotY: 0 });
      if (i % 2) out.benches.push({ pos: V(x + 0.5, G, p.z1 - 7.6), rotY: Math.PI });
    }
    // Bandshell at the north-west.
    fill(p.x0 + 12, G - 1, p.z0 + 10, p.x0 + 26, G, p.z0 + 18, B.White);
    for (let i = 0; i < 6; i++) fill(p.x0 + 12 + i, G + 1 + i, p.z0 + 10 + i, p.x0 + 26 - i, G + 1 + i, p.z0 + 10 + i, B.White);
    fill(p.x0 + 12, G + 1, p.z0 + 10, p.x0 + 12, G + 6, p.z0 + 18, B.White);
    fill(p.x0 + 26, G + 1, p.z0 + 10, p.x0 + 26, G + 6, p.z0 + 18, B.White);
    // Empty statue plinth (the cement statue death fills it).
    const sp = V(mx + 0.5, G, p.z1 - 14 + 0.5);
    fill(mx - 1, G, p.z1 - 15, mx + 1, G + 1, p.z1 - 13, B.Stone);
    out.statuePlinth.set(sp.x, G + 2, sp.z);
    out.places.push({ id: 'park', name: 'Central Park', kind: 'park', door: V(mx + 0.5, G, p.z1 + 2), inside: { x0: p.x0 + 4, z0: p.z0 + 4, x1: p.x1 - 4, z1: p.z1 - 4 } });
    out.places.push({ id: 'fountain', name: 'Bethesda-ish Fountain', kind: 'attraction', door: V(mx + 6.5, G, mz + 0.5), spots: [V(mx + 5.5, G, mz + 0.5), V(mx - 4.5, G, mz + 0.5), V(mx + 0.5, G, mz + 5.5)] });
  }

  // ------------------------------------------------------------------ Mortalis Mutual HQ
  {
    const r = MORTALIS;
    building(r, { floors: 3, wall: B.Dark, trim: B.Metal, front: 'n', glassy: true, shop: { name: 'Mortalis Mutual', kind: 'work', jobs: ['Insurance Salesman', 'Claims Adjuster', 'Security Guard', 'Office Worker'], sign: ['#1d2b4f', '#c9a227'], sells: [], lines: ['Have you considered our Platinum Exclusions plan?', 'Your claim is very important to us.'] }, voxel: true });
    out.towers.push({ x0: r.x0, z0: r.z0, x1: r.x1 + 1, z1: r.z1 + 1, y0: G + 13, segs: [[2, 120], [6, 40], [12, 20]], style: 5, spire: 34, name: 'Mortalis Mutual' });
    // Plaza in front with a reflecting strip.
    fill(r.x0, G - 1, r.z0 - 3, r.x1, G - 1, r.z0 - 1, B.Sidewalk);
  }

  // ------------------------------------------------------------------ station
  {
    const r = STATION;
    building(r, { floors: 4, wall: B.Stone, trim: B.White, front: 'w', shop: { name: 'Grand Centralish Station', kind: 'transit', sells: [{ item: 'train ticket', price: 50 }], jobs: ['Conductor', 'Ticket Clerk'], sign: ['#2a2a2a', '#f2d77a'] }, roofJunk: false, voxel: true });
    // Big arched windows on the west face.
    for (let z = r.z0 + 3; z <= r.z1 - 3; z += 6) fill(r.x0, G + 4, z, r.x0, G + 12, z + 2, B.Glass);
  }

  // ------------------------------------------------------------------ rail yard
  {
    const R = RAIL;
    fill(R.x0, G - 1, R.z0, R.x1, G - 1, R.z1, B.Gravel);
    // Chain-link-ish fence on the city side with a gate at the crossing.
    for (let z = R.z0; z <= R.z1; z++) if (Math.abs(z - SUBWAY.z) > 2 && z % 2 === 0) fill(61, G, z, 61, G + 1, z, B.Metal);
    // Pedestrian crossing planks from the avenue to the island platform.
    fill(R.x0 + 20, G - 1, SUBWAY.z - 1, 63, G - 1, SUBWAY.z + 1, B.Plank);
    // Island platform (one block up) with a yellow safety edge.
    const P = RAIL_PLATFORM;
    fill(P.x0, G, P.z0, P.x1, G, P.z1, B.Concrete);
    fill(P.x0, G, P.z0, P.x0, G, P.z1, B.Yellow);
    fill(P.x1, G, P.z0, P.x1, G, P.z1, B.Yellow);
    // Bumper blocks at the north end of the spur tracks.
    for (const tx of [R.tracks[0], R.tracks[3]]) fill(tx - 1, G, R.z0 + 2, tx + 1, G + 1, R.z0 + 3, B.RedPaint);
  }

  // ------------------------------------------------------------------ subway
  {
    const S = SUBWAY;
    const x0 = 60, x1 = LAND.x1 - 6;
    const ceil = G - 4; // tunnel air up to ceil (inclusive), slab above
    fill(x0, TUNNEL_FLOOR, S.bedZ0, x1, ceil, S.bedZ1, B.Air);
    fill(x0, TUNNEL_FLOOR - 1, S.bedZ0, x1, TUNNEL_FLOOR - 1, S.bedZ1, B.Gravel);
    // Tiled walls and a concrete ceiling so the tunnel isn't a dirt hole.
    fill(x0, TUNNEL_FLOOR, S.bedZ0 - 1, x1, ceil, S.bedZ0 - 1, B.Concrete);
    fill(x0, TUNNEL_FLOOR, S.bedZ1 + 1, x1, ceil, S.bedZ1 + 1, B.Concrete);
    fill(x0, ceil + 1, S.bedZ0 - 1, x1, ceil + 1, S.platZ1 + 1, B.Concrete);
    for (let x = x0; x <= x1; x += 12) fill(x, TUNNEL_FLOOR + 3, S.bedZ0 - 1, x, TUNNEL_FLOOR + 3, S.bedZ0 - 1, B.Yellow);
    // Station: platform along the south side, tiled walls.
    fill(S.stationX0, TUNNEL_FLOOR, S.platZ0, S.stationX1, ceil, S.platZ1, B.Air);
    fill(S.stationX0, TUNNEL_FLOOR, S.platZ0, S.stationX1, TUNNEL_FLOOR, S.platZ1, B.Concrete);
    fill(S.stationX0, TUNNEL_FLOOR, S.platZ0, S.stationX1, TUNNEL_FLOOR, S.platZ0, B.Yellow);
    fill(S.stationX0, TUNNEL_FLOOR + 1, S.platZ1 + 1, S.stationX1, ceil, S.platZ1 + 1, B.White);
    for (let x = S.stationX0; x <= S.stationX1; x += 2) set(x, TUNNEL_FLOOR + 3, S.platZ1 + 1, B.RoofGreen);
    fill(S.stationX0, TUNNEL_FLOOR + 1, S.bedZ0 - 1, S.stationX1, ceil, S.bedZ0 - 1, B.White);
    // Columns between platform and tracks.
    for (let x = S.stationX0 + 4; x < S.stationX1; x += 8) fill(x, TUNNEL_FLOOR + 1, S.platZ0 + 1, x, ceil, S.platZ0 + 1, B.Metal);
    // Stairs from the south sidewalk down to the platform, stepping east.
    const sz0 = S.platZ0 + 1, sz1 = S.platZ1;
    const steps = G - (TUNNEL_FLOOR + 1); // 12 -> 4
    for (let k = 0; k < steps; k++) {
      const x = S.stairX0 + k;
      const surfaceY = G - 1 - k; // standing height
      fill(x, surfaceY, sz0, x, G + 2, sz1, B.Air);
      fill(x, TUNNEL_FLOOR, sz0, x, surfaceY - 1, sz1, B.Concrete);
    }
    // Railings around the opening at street level.
    for (let x = S.stairX0; x < S.stairX0 + steps; x++) {
      set(x, G, sz0 - 1, B.RoofGreen);
      set(x, G, sz1 + 1, B.RoofGreen);
    }
    fill(S.stairX0 + steps, G, sz0, S.stairX0 + steps, G, sz1, B.RoofGreen);
    out.places.push({ id: 'subway', name: '350th St Subway', kind: 'transit', door: V(S.stairX0 - 1.5, G, (sz0 + sz1) / 2 + 0.5), spots: [V(170, TUNNEL_FLOOR + 1, SUBWAY.platZ0 + 2.5), V(185, TUNNEL_FLOOR + 1, SUBWAY.platZ0 + 2.5)] });
  }

  // ------------------------------------------------------------------ construction site
  {
    const s = SITE;
    fill(s.x0, G - 1, s.z0, s.x1, G - 1, s.z1, B.Dirt);
    // Plywood fence with a gate on the west (avenue) side.
    for (let x = s.x0; x <= s.x1; x++) for (const z of [s.z0, s.z1]) fill(x, G, z, x, G + 2, z, B.Plank);
    for (let z = s.z0; z <= s.z1; z++) for (const x of [s.x0, s.x1]) if (!(x === s.x0 && Math.abs(z - SUBWAY.z) <= 3)) fill(x, G, z, x, G + 2, z, B.Plank);
    // Steel skeleton: 6 floors of columns and beams.
    const k = { x0: s.x0 + 6, z0: s.z0 + 6, x1: s.x0 + 26, z1: s.z0 + 30 };
    for (let f = 0; f <= 6; f++) {
      const y = G + f * 5 - 1;
      if (f > 0) {
        for (let x = k.x0; x <= k.x1; x++) for (const z of [k.z0, k.z1]) set(x, y, z, B.RedPaint);
        for (let z = k.z0; z <= k.z1; z++) for (const x of [k.x0, k.x1]) set(x, y, z, B.RedPaint);
        if (f < 6) fill(k.x0 + 1, y, k.z0 + 1, k.x1 - 1, y, k.z1 - 1, B.Plank); // decking
        if (f < 6) fill(k.x0 + 2, y, k.z0 + 2, k.x0 + 4, y, k.z0 + 4, B.Air); // stair hole
      }
    }
    for (let x = k.x0; x <= k.x1; x += 5) for (const z of [k.z0, k.z1]) fill(x, G, z, x, G + 29, z, B.RedPaint);
    for (let z = k.z0; z <= k.z1; z += 6) for (const x of [k.x0, k.x1]) fill(x, G, z, x, G + 29, z, B.RedPaint);
    // Scaffold stairs up the outside south face to the top beam.
    for (let i = 0; i < 30; i++) {
      const up = i;
      const x = k.x0 + 1 + (Math.floor(i / 15) % 2 === 0 ? i % 15 : 14 - (i % 15));
      const z = k.z1 + 2 + (Math.floor(i / 15) % 2);
      fill(x, G + up - 1, z, x, G + up - 1, z, B.Plank);
      if (i % 15 === 14) fill(x - 1, G + up - 1, k.z1 + 2, x + 1, G + up - 1, k.z1 + 3, B.Plank);
    }
    // The lunch beam: an I-beam cantilevered off the top floor over the street.
    fill(k.x1, G + 29, k.z0 + 10, k.x1 + 14, G + 29, k.z0 + 10, B.RedPaint);
    // Half-demolished brick building beside it (the wrecking ball's target).
    const d = { x0: s.x0 + 20, z0: s.z0 + 50, x1: s.x0 + 34, z1: s.z0 + 66 };
    building(d, { floors: 4, wall: B.Brick, trim: B.Concrete, front: 'w', solidGround: true, voxel: true });
    // The wrecking ball has already taken a bite out of the west wall.
    fill(d.x0, G + 2, d.z0 + 4, d.x0 + 2, G + 9, d.z0 + 12, B.Air);
    fill(d.x0 + 3, G + 10, d.z0 + 2, d.x0 + 5, G + 15, d.z0 + 7, B.Air);
    // Rubble piles, a sand pile, pallets.
    for (let i = 0; i < 18; i++) set(s.x0 + 30 + Math.floor(rng() * 12), G, s.z0 + 30 + Math.floor(rng() * 40), pick(rng, [B.Brick, B.Concrete, B.Gravel]));
    fill(s.x0 + 4, G, s.z1 - 12, s.x0 + 9, G + 1, s.z1 - 8, B.Sand);
    out.places.push({ id: 'site', name: 'Overbudget Tower (Under Construction)', kind: 'work', door: V(s.x0 - 1.5, G, SUBWAY.z + 0.5), inside: { x0: s.x0 + 2, z0: s.z0 + 2, x1: s.x1 - 2, z1: s.z1 - 2 }, jobs: ['Construction Worker', 'Foreman'], allowedJobs: ['Construction Worker', 'Foreman'] });
  }

  // ------------------------------------------------------------------ Little Italy
  {
    const I = ITALY;
    let n = 0;
    const italyShop = () => {
      const s = ITALY_SHOPS[n++ % ITALY_SHOPS.length];
      return { name: s[2], kind: s[1], sells: s[3], awning: [B.RoofGreen, B.White] as [number, number] };
};
    // Don Calzone's Pizzeria takes the corner of block (1,4).
    const r14 = blockRect(1, 4);
    const pz = { x0: r14.x0, z0: r14.z0, x1: r14.x0 + 17, z1: r14.z0 + 14 };
    building(pz, {
      floors: 3,
      wall: B.Brick,
      trim: B.White,
      front: 'n',
      shop: {
        name: "Don Calzone's Pizzeria",
        kind: 'food',
        sells: [{ item: 'slice', price: 3 }, { item: 'garlic knots', price: 5 }],
        awning: [B.RedPaint, B.White],
        jobs: ['Pizza Chef', 'Mobster'],
        sign: ['#1a5a2a', '#ffffff'],
        lines: ['Whaddya want?', "Kitchen's closed. For you.", 'You lost, pal?'],
      },
      fireEscape: true,
      roofJunk: true,
      counter: false,
      kitFloors: 4,
      look: { wall: PAL.brickRed, wallStyle: 'brick', signBoard: 0x23402c, trim: PAL.trimCream, flowerBoxes: 0.8 },
    });
    // Back room (separated by a wall with a doorway).
    fill(pz.x0 + 1, G, pz.z0 + 9, pz.x1 - 1, G + 2, pz.z0 + 9, B.Brick);
    fill(pz.x0 + 3, G, pz.z0 + 9, pz.x0 + 4, G + 2, pz.z0 + 9, B.Air);
    fill(pz.x0 + 8, G, pz.z0 + 3, pz.x0 + 10, G, pz.z0 + 4, B.RedPaint); // tables
    fill(pz.x0 + 13, G, pz.z0 + 3, pz.x0 + 15, G, pz.z0 + 4, B.RedPaint);
    fill(pz.x0 + 9, G, pz.z0 + 11, pz.x0 + 13, G, pz.z0 + 12, B.Wood); // the boss's table
    mixedBlock({ x0: r14.x0 + 18, z0: r14.z0, x1: r14.x1, z1: r14.z0 + 14 }, 3, 5, 0.7, italyShop, 'euro');
    for (const [c, rr] of [[0, 4], [0, 5], [1, 5]] as [number, number][]) mixedBlock(blockRect(c, rr), 3, 5, 0.55, italyShop, 'euro');
    mixedBlock({ x0: r14.x0, z0: r14.z0 + 16, x1: r14.x1, z1: r14.z1 }, 3, 5, 0.5, italyShop, 'euro');
    // Feast lights strung across the street between the two halves, cafe tables on the sidewalks.
    for (let x = I.x0 + 6; x < I.x1 - 4; x += 9) {
      out.bunting.push([V(x, G + 7.5, STREETS[5] - ST_HALF - WALK + 0.2), V(x + 4, G + 7.5, STREETS[5] + ST_HALF + WALK - 0.2)]);
      if ((x / 9) % 2 < 1) out.props.push({ kind: 'umbrellaTable', x: x + 1.5, z: STREETS[5] - ST_HALF - 1.6, rotY: 0.3 });
      else out.props.push({ kind: 'cafeTable', x: x + 1.5, z: STREETS[5] + ST_HALF + 1.6, rotY: 0.2 });
    }
    out.places.push({ id: 'italy', name: 'Little Italy', kind: 'attraction', door: V((I.x0 + I.x1) / 2, G, STREETS[5] + 0.5) });
  }

  // ------------------------------------------------------------------ car dealership (block 5,5)
  {
    const r = blockRect(2, 5);
    surf(r, B.Asphalt);
    for (let x = r.x0 + 2; x <= r.x1 - 2; x += 5) fill(x, G - 1, r.z0 + 2, x, G - 1, r.z0 + 12, B.White);
    for (let i = 0; i < 6; i++) out.parked.push({ pos: V(r.x0 + 4.5 + i * 5, G, r.z0 + 7), rotY: 0 });
    building({ x0: r.x0 + 4, z0: r.z0 + 16, x1: r.x1 - 4, z1: r.z1 }, { floors: 2, wall: B.White, trim: B.RoofBlue, front: 'n', glassy: true, shop: { name: 'Crazy Larry Motors', kind: 'shop', sells: [{ item: 'convertible', price: 4000 }, { item: 'used sedan', price: 4000 }], jobs: ['Car Salesman'], lines: ['Honest Al. Used to sell in Smallville. The city has better margins.'], sign: ['#d01818', '#ffff00'] }, look: { signBoard: 0xd01818, awning: [0xd01818, 0xf2d040] } });
    // Pennant poles.
    for (let x = r.x0; x <= r.x1; x += 6) fill(x, G, r.z0, x, G + 5, r.z0, B.Metal);
    out.dealerFan = V(r.x0 + 3.5, G, r.z0 + 14);
  }

  // ------------------------------------------------------------------ waterfront and harbor
  {
    // Promenade south of the last street.
    const qz0 = STREETS[6] + ST_HALF + WALK, qz1 = LAND.z1 - 1;
    fill(LAND.x0 + 1, G - 1, qz0, LAND.x1 - 1, G - 1, qz1, B.Plank);
    railing(LAND.x0 + 1, LAND.z1 - 1, PIERS.mob.x0 - 1, LAND.z1 - 1);
    railing(PIERS.mob.x1 + 1, LAND.z1 - 1, PIERS.ferry.x0 - 1, LAND.z1 - 1);
    railing(PIERS.ferry.x1 + 1, LAND.z1 - 1, PIERS.cargo.x0 - 1, LAND.z1 - 1);
    railing(PIERS.cargo.x1 + 1, LAND.z1 - 1, LAND.x1 - 1, LAND.z1 - 1);
    const pier = (p: Rect, deck: number) => {
      fill(p.x0, G - 1, p.z0, p.x1, G - 1, p.z1, deck);
      for (let x = p.x0; x <= p.x1; x += 4) for (let z = p.z0; z <= p.z1; z += 4) fill(x, 1, z, x, G - 2, z, B.Wood);
      for (let z = p.z0; z <= p.z1; z += 3) {
        set(p.x0, G, z, B.Wood);
        set(p.x1, G, z, B.Wood);
      }
};
    // Pier 13: the mob's pier, with a bait shack at the end.
    pier(PIERS.mob, B.Plank);
    const m = PIERS.mob;
    building({ x0: m.x0 + 1, z0: m.z1 - 9, x1: m.x1 - 1, z1: m.z1 - 4 }, { floors: 1, wall: B.Plank, trim: B.Wood, front: 'n', solidGround: true, voxel: true });
    fill(m.x0, G, m.z1, m.x1, G, m.z1, B.Air); // open end, nothing to stop you
    // Ferry terminal pier.
    pier(PIERS.ferry, B.Concrete);
    const f = PIERS.ferry;
    building({ x0: f.x0 + 3, z0: f.z0 + 2, x1: f.x1 - 3, z1: f.z0 + 12 }, { floors: 2, wall: B.WallBlue, trim: B.White, front: 'n', glassy: true, shop: { name: 'Big Apple Ferry', kind: 'transit', sells: [{ item: 'ferry ticket', price: 80 }], jobs: ['Deckhand', 'Ticket Clerk'], sign: ['#1a3a6a', '#ffffff'] }, voxel: true });
    // Cargo pier with stacked shipping containers to climb.
    pier(PIERS.cargo, B.Concrete);
    const c = PIERS.cargo;
    const colors = [B.RedPaint, B.WallBlue, B.Yellow, B.RoofGreen, B.BarnRed, B.WallMint];
    for (let x = c.x0 + 4; x < c.x1 - 10; x += 14)
      for (let z = c.z0 + 4; z < c.z1 - 4; z += 6) {
        const stack = 1 + Math.floor(rng() * 4);
        for (let k = 0; k < stack; k++) {
          const col = pick(rng, colors);
          fill(x, G + k * 3, z, x + 11, G + k * 3 + 2, z + 4, col);
          for (let xx = x; xx <= x + 11; xx += 2) fill(xx, G + k * 3, z, xx, G + k * 3 + 2, z, B.Dark);
        }
      }
    out.places.push({ id: 'pier13', name: 'Pier 13', kind: 'attraction', door: V(m.x0 + 4.5, G, LAND.z1 - 2), inside: { x0: m.x0 + 1, z0: m.z0 + 2, x1: m.x1 - 1, z1: m.z1 - 12 } });
    out.places.push({ id: 'cargo', name: 'Container Terminal', kind: 'work', door: V(c.x0 + 2.5, G, LAND.z1 - 2), jobs: ['Dock Worker'], inside: { x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1 } });
    // Benches along the promenade.
    for (let x = 30; x < 460; x += 22) out.benches.push({ pos: V(x + 0.5, G, qz0 + 2), rotY: Math.PI });
    out.places.push({ id: 'promenade', name: 'Harbor Promenade', kind: 'park', door: V(150, G, qz0 + 3), inside: { x0: LAND.x0 + 3, z0: qz0 + 1, x1: LAND.x1 - 3, z1: qz1 - 2 } });

    // Lady Liability on her island.
    const L = LIBERTY;
    for (let dx = -L.r; dx <= L.r; dx++)
      for (let dz = -L.r; dz <= L.r; dz++) if (dx * dx + dz * dz <= L.r * L.r) fill(L.x + dx, 1, L.z + dz, L.x + dx, G - 1, L.z + dz, dx * dx + dz * dz > (L.r - 2) ** 2 ? B.Stone : B.Grass);
    // Star-shaped base and pedestal.
    fill(L.x - 6, G, L.z - 6, L.x + 6, G + 2, L.z + 6, B.Stone);
    fill(L.x - 4, G + 3, L.z - 4, L.x + 4, G + 12, L.z + 4, B.Concrete);
    // The lady: robe, arm holding up a clipboard instead of a torch.
    for (let y = G + 13; y < G + 34; y++) {
      const rr = y < G + 28 ? 3.4 - (y - G - 13) * 0.08 : 2.2;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (dx * dx + dz * dz <= rr * rr) set(L.x + dx, y, L.z + dz, B.RoofGreen);
    }
    for (let y = G + 34; y < G + 39; y++) fill(L.x - 2, y, L.z - 2, L.x + 2, y, L.z + 2, B.RoofGreen);
    for (let i = 0; i < 5; i++) set(L.x - 3 + i, G + 39, L.z, B.RoofGreen); // crown
    fill(L.x + 3, G + 30, L.z, L.x + 3, G + 44, L.z, B.RoofGreen); // raised arm
    fill(L.x + 2, G + 45, L.z - 1, L.x + 4, G + 48, L.z + 1, B.White); // the clipboard
    fill(L.x + 3, G + 49, L.z, L.x + 3, G + 50, L.z, B.Yellow);
  }

  // The airport lot (AIRPORT_LOT) is filled by src/places/airport, called from index.ts.

  // ------------------------------------------------------------------ hospital superblock
  {
    const sb = { x0: blockRect(4, 4).x0, z0: blockRect(4, 4).z0, x1: blockRect(5, 5).x1, z1: blockRect(5, 5).z1 };
    fill(sb.x0, G - 1, sb.z0, sb.x1, G - 1, sb.z1, B.Concrete);
    fill(sb.x0, G, sb.z0, sb.x1, G + 8, sb.z1, B.Air);
    const H = HOSPITAL_LOT;
    // City General Hospital: four floors, job-gated past the lobby (src/places/hospital).
    out.hospital = buildHospital(w, { x: H.x, y: G, z: H.z }, rng);
    out.places.push({ id: 'hospital', name: 'City General Hospital', kind: 'civic', door: V(H.x + 32, G, H.z - 4), jobs: ['Doctor', 'Nurse'] });
    for (let x = sb.x0 + 4; x < sb.x1 - 4; x += 5) fill(x, G - 1, H.z + H.sz + 2, x, G - 1, sb.z1 - 3, B.White);
  }

  // Parked cars along curbs in residential streets.
  for (let i = 0; i < 40; i++) {
    const sz = pick(rng, STREETS.slice(3));
    const x = GRID.x0 + 20 + Math.floor(rng() * (GRID.x1 - GRID.x0 - 40));
    const nearAve = AVES.some((a) => Math.abs(a - x) < 14);
    if (nearAve) continue;
    if (x > SITE.x0 - 4 && x < SITE.x1 + 4 && sz === STREETS[2]) continue;
    out.parked.push({ pos: V(x + 0.5, G, sz + (rng() < 0.5 ? -ST_HALF + 1.2 : ST_HALF - 1.2)), rotY: Math.PI / 2 });
  }

  // Billboards on Times Squared (around the 336 / 192 intersection).
  const tsx = AVES[4], tsz = STREETS[1];
  out.billboards.push(
    { pos: V(tsx - 9, G + 38, tsz - 9.5), rotY: Math.PI / 4 - Math.PI / 2, w: 14, h: 8, kind: 0 },
    { pos: V(tsx + 9, G + 40, tsz - 9.5), rotY: -Math.PI / 4 + Math.PI / 2, w: 14, h: 9, kind: 1 },
    { pos: V(tsx - 9, G + 37, tsz + 10.5), rotY: Math.PI * 0.75 - Math.PI / 2, w: 12, h: 7, kind: 2 },
    { pos: V(tsx + 9, G + 36, tsz + 10.5), rotY: -Math.PI * 0.75 + Math.PI / 2, w: 12, h: 8, kind: 3 },
  );

  // Party walls: a kit building's side touching another kit building gets no windows or trim.
  {
    const owner = new Int32Array(SX * SZ).fill(-1);
    out.kit.forEach((k, i) => {
      const s = k.spec;
      const ex = s.face === 'n' || s.face === 's' ? s.w : s.d, ez = s.face === 'n' || s.face === 's' ? s.d : s.w;
      for (let x = s.x; x < s.x + ex; x++) for (let z = s.z; z < s.z + ez; z++) owner[z * SX + x] = i;
    });
    const LEFT: Record<Side, [number, number]> = { n: [1, 0], s: [-1, 0], e: [0, 1], w: [0, -1] };
    out.kit.forEach((k, i) => {
      const s = k.spec;
      const f = s.face as Side;
      const ex = f === 'n' || f === 's' ? s.w : s.d, ez = f === 'n' || f === 's' ? s.d : s.w;
      const cx = s.x + ex / 2, cz = s.z + ez / 2;
      const probe = (dx: number, dz: number) => {
        const x = Math.floor(cx + dx * (ex / 2 + 0.5)), z = Math.floor(cz + dz * (ez / 2 + 0.5));
        const o = x >= 0 && z >= 0 && x < SX && z < SZ ? owner[z * SX + x] : -1;
        return o >= 0 && o !== i;
      };
      const [lx, lz] = LEFT[f];
      s.party = { left: probe(lx, lz), right: probe(-lx, -lz) };
    });
  }

  return out;
}

/** Standing height for townsfolk at a column, or NaN if nobody can stand there. */
export function standHeight(w: VoxelWorld, x: number, z: number, blocked?: Uint8Array) {
  x = Math.floor(x);
  z = Math.floor(z);
  if (blocked && x >= 0 && z >= 0 && x < SX && z < SZ && blocked[z * SX + x]) return NaN;
  for (let y = G + 1; y >= G - 2; y--) {
    if (w.get(x, y, z) !== 0 && w.get(x, y + 1, z) === 0 && w.get(x, y + 2, z) === 0) return y + 1;
  }
  return NaN;
}
