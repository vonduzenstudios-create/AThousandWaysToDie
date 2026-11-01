import { mulberry32, pick, hash3, type Rng } from '../util';
import { DPB, DV, DetailGrid, vox, tint, mix, speck, type DPaint } from './grid';
import { rasterText, textWidth } from './font';
import { AWNINGS, FLOWERS, PAL, SHUTTERS, SIGN_BOARDS, V, WALLS_EURO, WALLS_HOUSE } from './palette';

export type Preset = 'euro' | 'mainstreet' | 'house' | 'modern';
export type WallStyle = 'stucco' | 'brick' | 'stone' | 'clapboard' | 'concrete';
export type RoofKind = 'gable' | 'gableSide' | 'flat';
export type GroundKind = 'shop' | 'door' | 'house' | 'blank' | 'none';
export type WindowTop = 'flat' | 'pediment' | 'arch' | 'none';

/**
 * Everything about one building. Only w, d and floors are needed; the rest is filled in from
 * the preset and the seed, so the same seed always gives the same building.
 */
export interface BuildingSpec {
  /** Facade width in world blocks. */
  w: number;
  /** Depth in world blocks. */
  d: number;
  /** Storeys including the ground floor. Each storey is 3 blocks tall. */
  floors: number;
  preset?: Preset;
  seed?: number;
  wallStyle?: WallStyle;
  /** Main wall color. */
  wall?: number;
  /** Ground floor wall color/style (defaults to a darker version of the walls). */
  groundWall?: number;
  groundStyle?: WallStyle;
  trim?: number;
  /** Shutter color, or null for no shutters. */
  shutter?: number | null;
  roof?: RoofKind;
  roofColor?: number;
  ground?: GroundKind;
  /** Shop sign text (ground 'shop'). Use null for a blank sign board. */
  sign?: string | null;
  signBoard?: number;
  /** Awning stripe colors, or false for none. */
  awning?: [number, number] | false;
  windowTop?: WindowTop;
  /** 0..1 chance of a flower box under each upper window. */
  flowerBoxes?: number;
  /** 0..1 chance of a balcony per upper floor. */
  balconies?: number;
  /** 0..1 how much ivy climbs the facade. */
  ivy?: number;
  /** Which sides touch a neighbour (no windows, no wrapped trim). */
  party?: { left?: boolean; right?: boolean };
  /** Put windows on exposed side walls too. Default true. */
  sideWindows?: boolean;
  /** Door position along the facade, 0..1. Default 0.5. */
  doorAt?: number;
  chimney?: boolean;
}

/** An axis-aligned collider box in building-local world units (front at z = 0, faces -z). */
export interface LocalBox {
  min: [number, number, number];
  max: [number, number, number];
}

export interface BuiltBuilding {
  grid: DetailGrid;
  /** Grid cell that maps to the footprint's local (0,0,0). */
  origin: [number, number, number];
  boxes: LocalBox[];
  /** Convex roof hulls (points in local units). */
  hulls: number[][];
  /** Door centers at the facade, local units. */
  doors: [number, number, number][];
  /** Wall top and overall height in world units. */
  wallTop: number;
  height: number;
  spec: Required<Omit<BuildingSpec, 'party' | 'awning' | 'sign' | 'shutter'>> & Pick<BuildingSpec, 'party' | 'awning' | 'sign' | 'shutter'>;
}

/** Voxels per storey. */
export const FLOOR_H = 24;
const FRONT_M = 12;
const SIDE_M = 6;

type FaceKind = 'front' | 'back' | 'left' | 'right';

/**
 * A view of one wall: u runs left-to-right as seen from outside, y is up, and `out` is the
 * distance from the wall's outer surface layer (0 = the outermost wall voxel, 1 = first cell of
 * air outside, -1 = one cell into the wall).
 */
class Face {
  readonly len: number;
  constructor(
    readonly g: DetailGrid,
    readonly kind: FaceKind,
    readonly x0: number,
    readonly z0: number,
    readonly W: number,
    readonly D: number,
  ) {
    this.len = kind === 'front' || kind === 'back' ? W : D;
  }
  map(u: number, out: number): [number, number] {
    const { x0, z0, W, D } = this;
    switch (this.kind) {
      case 'front':
        return [x0 + W - 1 - u, z0 - out];
      case 'back':
        return [x0 + u, z0 + D - 1 + out];
      case 'right':
        return [x0 + W - 1 + out, z0 + D - 1 - u];
      case 'left':
        return [x0 - out, z0 + u];
    }
  }
  set(u: number, y: number, out: number, v: number) {
    const [x, z] = this.map(u, out);
    this.g.set(x, y, z, v);
  }
  get(u: number, y: number, out: number) {
    const [x, z] = this.map(u, out);
    return this.g.get(x, y, z);
  }
  box(u0: number, y0: number, o0: number, u1: number, y1: number, o1: number, p: DPaint) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let o = Math.min(o0, o1); o <= Math.max(o0, o1); o++)
        for (let u = Math.min(u0, u1); u <= Math.max(u0, u1); u++) {
          const v = typeof p === 'number' ? p : p(u, y, o);
          if (v || typeof p === 'number') this.set(u, y, o, v);
        }
  }
  /** Local (building-space, world units) point in front of the face at u, y. */
  local(u: number, y: number, out: number): [number, number, number] {
    const [x, z] = this.map(u, out);
    return [(x - this.x0) * DV, y * DV, (z - this.z0) * DV];
  }
}

function wallPaint(style: WallStyle, base: number, seed: number): (x: number, y: number, z: number) => number {
  const j = 0.06;
  switch (style) {
    case 'stucco': {
      // One cell value: the shader's per-voxel noise gives the speckle, and walls stay mergeable.
      const c = vox(base, { jitter: 0.09 });
      return () => c;
    }
    case 'concrete': {
      const cells = [vox(base, { jitter: 0.04 }), vox(tint(base, 0.96), { jitter: 0.04 })];
      const joint = vox(tint(base, 0.82), { jitter: 0.03 });
      return (x, y, z) => (y % 24 === 23 || (x + z) % 32 === 0 ? joint : cells[hash3(x >> 3, y >> 3, z >> 3) < 0.5 ? 0 : 1]);
    }
    case 'brick': {
      const shades = [vox(base, { jitter: 0.06 }), vox(tint(base, 0.88), { jitter: 0.06 }), vox(tint(base, 1.1), { jitter: 0.06 }), vox(mix(base, 0x5a3a30, 0.25), { jitter: 0.06 })];
      const mortar = vox(mix(base, 0xd8cfc0, 0.7), { jitter: 0.04 });
      return (x, y, z) => {
        const course = Math.floor(y / 3);
        if (y % 3 === 2) return mortar;
        const t = x + z + (course & 1) * 2;
        if (t % 4 === 3) return mortar;
        return shades[Math.floor(hash3(Math.floor(t / 4), course, seed) * 4)];
      };
    }
    case 'stone': {
      const shades = [vox(base, { jitter: 0.07 }), vox(tint(base, 0.92), { jitter: 0.07 }), vox(tint(base, 1.06), { jitter: 0.07 })];
      return (x, y, z) => {
        const course = Math.floor(y / 4);
        const t = x + z + (course & 1) * 4;
        return shades[Math.floor(hash3(Math.floor(t / 8), course, seed + 3) * 3)];
      };
    }
    case 'clapboard': {
      const board = vox(base, { jitter: 0.03 });
      const shadow = vox(tint(base, 0.8), { jitter: 0.03 });
      const lite = vox(tint(base, 1.04), { jitter: 0.03 });
      return (_x, y) => (y % 3 === 0 ? shadow : y % 3 === 2 ? lite : board);
    }
  }
}

function fillDefaults(s: BuildingSpec): BuiltBuilding['spec'] {
  const seed = s.seed ?? Math.floor(Math.random() * 1e9);
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const preset = s.preset ?? 'euro';
  const P = (eu: unknown, ms: unknown, ho: unknown, mo: unknown) =>
    (preset === 'euro' ? eu : preset === 'mainstreet' ? ms : preset === 'house' ? ho : mo) as never;
  const wall = s.wall ?? P(pick(rng, WALLS_EURO), pick(rng, [PAL.brickRed, PAL.brickBrown, PAL.brickPink, PAL.cream, PAL.ochre]), pick(rng, WALLS_HOUSE), pick(rng, [PAL.concrete, PAL.white, 0xa9b0b8, 0xd8d2c4]));
  const wallStyle: WallStyle =
    s.wallStyle ?? P('stucco', wall === PAL.cream || wall === PAL.ochre ? 'stucco' : 'brick', 'clapboard', 'concrete');
  const roof: RoofKind = s.roof ?? P(rng() < 0.55 ? 'flat' : 'gable', 'flat', rng() < 0.5 ? 'gable' : 'gableSide', 'flat');
  return {
    w: s.w,
    d: s.d,
    floors: Math.max(1, Math.round(s.floors)),
    preset,
    seed,
    wallStyle,
    wall,
    groundWall: s.groundWall ?? P(rng() < 0.6 ? tint(wall, 0.86) : PAL.stone, tint(wall, 0.92), wall, tint(wall, 0.85)),
    groundStyle: s.groundStyle ?? P(rng() < 0.6 ? 'stone' : 'stucco', wallStyle, wallStyle, 'concrete'),
    trim: s.trim ?? P(pick(rng, [PAL.trimCream, PAL.trimWhite, PAL.trimStone]), pick(rng, [PAL.trimCream, PAL.trimStone, PAL.stoneGrey]), PAL.trimWhite, tint(wall, 0.75)),
    shutter: s.shutter !== undefined ? s.shutter : P(pick(rng, SHUTTERS), null, rng() < 0.6 ? pick(rng, SHUTTERS) : null, null),
    roof,
    roofColor: s.roofColor ?? (roof === 'flat' ? pick(rng, [PAL.gravel, 0x6e6a66, 0x8c8478]) : null) ?? P(pick(rng, [PAL.tile, PAL.tileDark, PAL.tileOrange]), PAL.gravel, pick(rng, [PAL.shingleBrown, PAL.shingleGrey, PAL.slate, PAL.tileDark]), PAL.gravel),
    ground: s.ground ?? P(rng() < 0.6 ? 'shop' : 'door', 'shop', 'house', 'door'),
    sign: s.sign !== undefined ? s.sign : null,
    signBoard: s.signBoard ?? pick(rng, SIGN_BOARDS),
    awning: s.awning !== undefined ? s.awning : P(pick(rng, AWNINGS), rng() < 0.7 ? pick(rng, AWNINGS) : false, false, false),
    windowTop: s.windowTop ?? P(pick(rng, ['flat', 'pediment', 'arch', 'flat'] as WindowTop[]), pick(rng, ['flat', 'arch'] as WindowTop[]), 'none', 'none'),
    flowerBoxes: s.flowerBoxes ?? P(0.65, 0.15, 0.4, 0),
    balconies: s.balconies ?? P(0.55, 0.05, 0, 0.1),
    ivy: s.ivy ?? P(rng() < 0.35 ? 0.5 + rng() * 0.5 : 0, rng() < 0.2 ? 0.4 : 0, rng() < 0.2 ? 0.5 : 0, 0),
    party: s.party,
    sideWindows: s.sideWindows ?? true,
    doorAt: s.doorAt ?? 0.5,
    chimney: s.chimney ?? P(rng() < 0.5, false, rng() < 0.7, false),
  };
}

/** Build the voxels and colliders for one building. Pure: no scene or physics. */
export function buildBuilding(input: BuildingSpec): BuiltBuilding {
  const s = fillDefaults(input);
  const rng: Rng = mulberry32(s.seed);
  const W = Math.round(s.w * DPB);
  const D = Math.round(s.d * DPB);
  const wallTop = s.floors * FLOOR_H;
  const roofH = s.roof === 'gable' ? Math.ceil((D + 6) / 4) + 2 : s.roof === 'gableSide' ? Math.ceil((W + 6) / 4) + 2 : 5;
  const chimH = s.chimney ? 10 : 0;
  const x0 = SIDE_M, z0 = FRONT_M;
  const g = new DetailGrid(W + SIDE_M * 2, wallTop + roofH + chimH + 2, D + FRONT_M + SIDE_M);
  const boxes: LocalBox[] = [];
  const hulls: number[][] = [];
  const doors: [number, number, number][] = [];
  const partyL = !!s.party?.left, partyR = !!s.party?.right;

  // ---- Body: solid, so only the outside surface makes faces.
  const upper = wallPaint(s.wallStyle, s.wall, s.seed);
  const lower = wallPaint(s.groundStyle, s.groundWall, s.seed + 1);
  g.box(x0, 0, z0, x0 + W - 1, wallTop - 1, z0 + D - 1, (x, y, z) => (y < FLOOR_H ? lower(x, y, z) : upper(x, y, z)));
  boxes.push({ min: [0, 0, 0], max: [W * DV, wallTop * DV, D * DV] });

  const trim = vox(s.trim, { jitter: 0.04 });
  const trimDark = vox(tint(s.trim, 0.85), { jitter: 0.04 });
  const faces: Face[] = [new Face(g, 'front', x0, z0, W, D)];
  if (s.sideWindows) {
    if (!partyR) faces.push(new Face(g, 'left', x0, z0, W, D));
    if (!partyL) faces.push(new Face(g, 'right', x0, z0, W, D));
  }
  const allFaces = [new Face(g, 'front', x0, z0, W, D), new Face(g, 'back', x0, z0, W, D), new Face(g, 'left', x0, z0, W, D), new Face(g, 'right', x0, z0, W, D)];
  // Seen from the street, the building's left is local +x and its right is local -x.
  const wraps = (f: Face) => {
    // Which ends (u = 0, u = len-1) of this face may wrap trim around a corner.
    if (f.kind === 'front') return [!partyL, !partyR];
    if (f.kind === 'back') return [!partyR, !partyL];
    return [true, true];
  };
  const isPartyFace = (f: Face) => (f.kind === 'left' && partyR) || (f.kind === 'right' && partyL);

  // ---- Bands: plinth, string courses, top cornice.
  const band = (f: Face, y0: number, y1: number, out: number, v: DPaint) => {
    if (isPartyFace(f)) return;
    const [a, b] = wraps(f);
    f.box(a ? -out : 0, y0, out, b ? f.len - 1 + out : f.len - 1, y1, out, v);
  };
  for (const f of allFaces) {
    band(f, 0, 1, 1, vox(tint(s.groundWall, 0.7), { jitter: 0.06 }));
    for (let k = 1; k < s.floors; k++) band(f, k * FLOOR_H - 1, k * FLOOR_H, 1, trim);
    if (s.preset !== 'modern') {
      band(f, wallTop - 3, wallTop - 1, 1, trim);
      band(f, wallTop - 2, wallTop - 1, 2, trim);
      if (s.roof === 'flat') band(f, wallTop - 1, wallTop - 1, 3, trimDark);
      // Dentils under the cornice.
      band(f, wallTop - 4, wallTop - 4, 1, (u) => (u & 1 ? trim : 0));
    }
  }

  // ---- Quoins on exposed corners.
  if (s.preset === 'euro' || (s.preset === 'mainstreet' && rng() < 0.5)) {
    const q = vox(mix(s.trim, s.wall, 0.25), { jitter: 0.05 });
    for (const f of allFaces) {
      if (isPartyFace(f)) continue;
      const [a, b] = wraps(f);
      for (let y = FLOOR_H; y < wallTop - 4; y++) {
        const wide = Math.floor(y / 4) % 2 === 0 ? 5 : 3;
        if (y % 4 === 3) continue;
        if (a) f.box(-1, y, 1, wide - 1, y, 1, q);
        if (b) f.box(f.len - wide, y, 1, f.len, y, 1, q);
      }
    }
  }

  // ---- Windows.
  const glass = V.glass;
  const frameV = s.preset === 'modern' ? vox(0x3a3f46, { jitter: 0.03 }) : trim;
  const shutterBase = s.shutter ?? 0;
  const shutterA = vox(shutterBase, { jitter: 0.05 });
  const shutterB = vox(tint(shutterBase, 0.72), { jitter: 0.05 });
  const leaf = speck(s.seed + 9, [vox(PAL.leaf, { jitter: 0.15 }), vox(PAL.leafDark, { jitter: 0.15 }), vox(PAL.leafLight, { jitter: 0.15 })]);
  const boxV = vox(pick(rng, [PAL.terracotta, PAL.woodDark, PAL.shutterGreen, PAL.wood]), { jitter: 0.06 });
  const flowerCols = [pick(rng, FLOWERS), pick(rng, FLOWERS)];
  const curtain = vox(pick(rng, [0xf0e8d8, 0xd8c8a8, 0xb04040, 0xe8d8b0]), { jitter: 0.05 });

  const shutterPaint = (u0: number) => (u: number, y: number) => {
    // Louvres with a solid stile on the outer edges and rails top and bottom.
    return (y & 1) === 0 || u === u0 ? shutterA : shutterB;
  };

  interface WinOpts {
    w?: number;
    h?: number;
    top?: WindowTop;
    shutters?: boolean;
    closed?: boolean;
    box?: boolean;
    french?: boolean;
    bars?: boolean;
  }
  const windowAt = (f: Face, cx: number, y0: number, o: WinOpts = {}) => {
    const w = o.w ?? 7;
    const h = o.h ?? 13;
    const hw = (w - 1) >> 1;
    const u0 = cx - hw, u1 = cx + hw;
    const ya = y0, yb = y0 + h - 1;
    // Recess and glass.
    f.box(u0, ya, -1, u1, yb, 0, 0);
    f.box(u0, ya, -2, u1, yb, -2, glass);
    if (rng() < 0.4) {
      f.box(u0, ya + 2, -2, u0, yb, -2, curtain);
      f.box(u1, ya + 2, -2, u1, yb, -2, curtain);
    }
    // Muntins.
    f.box(cx, ya, -1, cx, yb, -1, frameV);
    const ym = o.french ? ya + Math.floor(h * 0.45) : ya + Math.floor(h * 0.6);
    f.box(u0, ym, -1, u1, ym, -1, frameV);
    if (o.french) f.box(u0, ya, -1, u1, ya + 3, -1, V.woodDark);
    // Architrave.
    for (let u = u0 - 1; u <= u1 + 1; u++) {
      f.set(u, yb + 1, 1, frameV);
      if (!o.french) f.set(u, ya - 1, 1, frameV);
    }
    for (let y = ya; y <= yb; y++) {
      f.set(u0 - 1, y, 1, frameV);
      f.set(u1 + 1, y, 1, frameV);
    }
    // Arch: round the top corners inside the frame.
    const top = o.top ?? s.windowTop;
    if (top === 'arch') {
      f.box(u0, yb, -1, u0 + 1, yb, 1, frameV);
      f.box(u1 - 1, yb, -1, u1, yb, 1, frameV);
      f.box(u0, yb - 1, -1, u0, yb - 1, 1, frameV);
      f.box(u1, yb - 1, -1, u1, yb - 1, 1, frameV);
      f.box(cx - 1, yb + 2, 1, cx + 1, yb + 2, 2, trim); // keystone
      f.set(cx, yb + 3, 1, trim);
    } else if (top === 'flat') {
      f.box(u0 - 2, yb + 2, 1, u1 + 2, yb + 3, 1, trim);
      f.box(u0 - 2, yb + 3, 2, u1 + 2, yb + 3, 2, trim);
    } else if (top === 'pediment') {
      for (let i = 0; ; i++) {
        const a = u0 - 2 + i * 2, b = u1 + 2 - i * 2;
        if (a > b) break;
        f.box(a, yb + 2 + i, 1, b, yb + 2 + i, 2, trim);
      }
    }
    // Sill.
    if (!o.french) {
      f.box(u0 - 2, ya - 2, 1, u1 + 2, ya - 2, 2, trim);
      f.box(u0 - 1, ya - 3, 1, u1 + 1, ya - 3, 1, trimDark);
    }
    // Iron bars on ground floor windows.
    if (o.bars) for (let u = u0; u <= u1; u += 2) f.box(u, ya, 1, u, yb, 1, V.iron);
    // Shutters.
    if (o.shutters && s.shutter != null) {
      if (o.closed) {
        f.box(u0, ya, 0, u1, yb, 0, (u, y) => (u === cx ? shutterB : (y & 1) === 0 ? shutterA : shutterB));
      } else {
        const sw = Math.max(3, hw);
        f.box(u0 - 1 - sw, ya, 1, u0 - 2, yb, 1, shutterPaint(u0 - 1 - sw));
        f.box(u1 + 2, ya, 1, u1 + 1 + sw, yb, 1, shutterPaint(u1 + 1 + sw));
      }
    }
    // Flower box with trailing plants.
    if (o.box && !o.french) {
      f.box(u0 - 1, ya - 6, 2, u1 + 1, ya - 4, 4, boxV);
      const fc = vox(pick(rng, flowerCols), { jitter: 0.15 });
      for (let u = u0 - 1; u <= u1 + 1; u++)
        for (let out = 2; out <= 4; out++) {
          const r = hash3(u * 3 + cx, out, s.seed + y0);
          f.set(u, ya - 3, out, r < 0.55 ? fc : leaf(u, ya, out));
          if (r < 0.7) f.set(u, ya - 2, out, r < 0.4 ? fc : leaf(u, ya + 1, out));
          if (r < 0.25) f.set(u, ya - 1, out + (out === 2 ? 1 : 0), fc);
        }
      for (let u = u0 - 1; u <= u1 + 1; u++) {
        const drop = Math.floor(hash3(u, cx, s.seed) * 6);
        for (let k = 0; k < drop; k++) f.set(u, ya - 7 - k, 5, leaf(u, k, 5));
      }
    }
  };

  const bayCenters = (len: number, pitch: number, margin: number) => {
    const n = Math.max(1, Math.floor((len - margin * 2) / pitch));
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(Math.round(margin + ((len - margin * 2) * (i + 0.5)) / n));
    return out;
  };

  const pitch = s.preset === 'modern' ? 10 : s.shutter != null ? 22 : 16;
  const balconyFloors = new Set<number>();
  for (let k = 1; k < s.floors; k++) if (rng() < s.balconies) balconyFloors.add(k);

  for (const f of faces) {
    const isFront = f.kind === 'front';
    const centers = bayCenters(f.len, pitch, 8);
    if (s.preset === 'modern') {
      // Ribbon windows with mullions on every floor.
      for (let k = isFront ? 1 : 0; k < s.floors; k++) {
        const ya = k * FLOOR_H + 5, yb = k * FLOOR_H + 19;
        f.box(4, ya, -1, f.len - 5, yb, 0, 0);
        f.box(4, ya, -1, f.len - 5, yb, -1, (u) => ((u - 4) % 10 === 0 ? frameV : glass));
        f.box(3, ya - 1, 1, f.len - 4, ya - 1, 1, frameV);
      }
      continue;
    }
    for (let k = 1; k < s.floors; k++) {
      const base = k * FLOOR_H;
      const balcony = isFront && balconyFloors.has(k);
      // A balcony spans the middle bays (or all of them on narrow buildings).
      const mid = centers.length >= 3 ? centers.slice(1, -1) : centers;
      for (const cx of centers) {
        const onBalcony = balcony && mid.includes(cx);
        windowAt(f, cx, onBalcony ? base + 1 : base + 6, {
          h: onBalcony ? 19 : 13,
          french: onBalcony,
          shutters: s.shutter != null,
          closed: rng() < 0.18,
          box: !onBalcony && rng() < s.flowerBoxes,
        });
      }
      if (balcony) {
        const ua = mid[0] - 8, ub = mid[mid.length - 1] + 8;
        const slab = vox(s.trim, { jitter: 0.05 });
        f.box(ua, base, 1, ub, base + 1, 5, slab);
        // Brackets.
        for (const u of [ua + 1, ub - 1, ...(mid.length > 1 ? [Math.round((ua + ub) / 2)] : [])]) {
          f.box(u, base - 1, 1, u, base - 1, 4, slab);
          f.box(u, base - 2, 1, u, base - 2, 3, slab);
          f.box(u, base - 3, 1, u, base - 3, 2, slab);
        }
        // Railing: posts every other cell, a top rail, and side rails.
        for (let u = ua; u <= ub; u++) {
          if ((u - ua) % 2 === 0) f.box(u, base + 2, 5, u, base + 8, 5, V.iron);
          f.set(u, base + 9, 5, V.iron);
          f.set(u, base + 3, 5, V.iron);
        }
        for (let out = 1; out <= 5; out++) {
          f.box(ua, base + 2, out, ua, base + 9, out, (_u, y) => (y === base + 9 || y === base + 3 || out % 2 === 1 ? V.iron : 0));
          f.box(ub, base + 2, out, ub, base + 9, out, (_u, y) => (y === base + 9 || y === base + 3 || out % 2 === 1 ? V.iron : 0));
        }
        // Potted plants on the balcony.
        for (let u = ua + 2; u < ub - 1; u += 3 + Math.floor(rng() * 4)) {
          if (rng() < 0.5) continue;
          const pot = vox(PAL.terracotta, { jitter: 0.06 });
          f.box(u, base + 2, 3, u + 1, base + 3, 4, pot);
          f.box(u - 1, base + 4, 2, u + 2, base + 6, 4, (uu, y, o) => (hash3(uu, y, o + s.seed) < 0.75 ? leaf(uu, y, o) : 0));
          if (rng() < 0.6) f.set(u, base + 6, 3, vox(pick(rng, FLOWERS), { jitter: 0.1 }));
        }
        const a = f.local(ua, base, 1), b = f.local(ub, base + 2, 6);
        boxes.push({ min: [Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2])], max: [Math.max(a[0], b[0]) + DV, b[1], Math.max(a[2], b[2]) + DV] });
      }
    }

    // Ground floor.
    const ground: GroundKind = isFront ? s.ground : 'blank';
    if (ground === 'shop') {
      const board = vox(s.signBoard, { jitter: 0.03 });
      const frameShop = vox(tint(s.signBoard, 1.1), { jitter: 0.04 });
      const dc = Math.round(f.len * s.doorAt);
      const doorW = 9;
      // Fascia board and lettering.
      f.box(2, 16, 1, f.len - 3, 22, 1, board);
      f.box(2, 16, 2, f.len - 3, 16, 2, board);
      f.box(2, 22, 2, f.len - 3, 22, 2, board);
      if (s.sign) {
        const text = s.sign.slice(0, Math.floor((f.len - 8) / 4));
        const tw = textWidth(text);
        const start = Math.floor((f.len - tw) / 2);
        const letter = vox(s.signBoard === 0xf0e6cc ? 0x2a2a2e : PAL.gold, { jitter: 0.02 });
        rasterText(text, (px, py) => f.set(start + px, 17 + py, 2, letter));
      }
      // Display windows either side of the door, with a stall riser.
      const segs: [number, number][] = [];
      if (dc - doorW / 2 - 3 > 3) segs.push([3, Math.floor(dc - doorW / 2) - 2]);
      if (dc + doorW / 2 + 3 < f.len - 4) segs.push([Math.ceil(dc + doorW / 2) + 2, f.len - 4]);
      for (const [a, b] of segs) {
        f.box(a, 3, -2, b, 14, 0, 0);
        f.box(a, 3, -2, b, 14, -2, glass);
        f.box(a - 1, 0, 1, b + 1, 2, 1, frameShop);
        f.box(a - 1, 3, 1, a - 1, 15, 1, frameShop);
        f.box(b + 1, 3, 1, b + 1, 15, 1, frameShop);
        f.box(a - 1, 15, 1, b + 1, 15, 1, frameShop);
        for (let u = a + 6; u < b - 2; u += 7) f.box(u, 3, -1, u, 14, -1, frameShop);
        // Goods on display behind the glass.
        for (let u = a; u <= b; u++) if (hash3(u, s.seed, 7) < 0.5) f.box(u, 3, -1, u, 3 + Math.floor(hash3(u, 1, s.seed) * 4), -1, vox(pick(rng, [...FLOWERS, PAL.woodLight, PAL.cream]), { jitter: 0.12 }));
      }
      // Door.
      const da = Math.round(dc - (doorW - 1) / 2), db = da + doorW - 1;
      f.box(da, 1, -3, db, 15, 0, 0);
      f.box(da, 1, -3, db, 15, -3, (u, y) => (y > 7 && u !== da && u !== db && u !== Math.round(dc) ? glass : V.woodDark));
      f.box(da - 1, 0, 1, db + 1, 0, 2, vox(PAL.stoneGrey, { jitter: 0.06 }));
      doors.push(f.local(Math.round(dc), 0, 2));
      // Awning over the whole shopfront. It hangs from just under the first-floor string
      // course and its lowest voxel is 2 blocks up, so people walk under it; the shop name is
      // lettered on the valance, where it reads from the street.
      if (s.awning) {
        const [c1, c2] = s.awning;
        const A = vox(c1, { jitter: 0.04 }), Bv = vox(c2, { jitter: 0.04 });
        const stripe = (u: number) => (Math.floor(u / 3) % 2 === 0 ? A : Bv);
        const reach = 9;
        const slopeY = (i: number) => 22 - Math.floor(i * 0.25);
        for (let i = 0; i < reach; i++) f.box(2, slopeY(i), 1 + i, f.len - 3, slopeY(i), 1 + i, (u) => stripe(u));
        const yEdge = slopeY(reach - 1); // 20
        const vTop = yEdge - 1, vBot = yEdge - 5; // valance rows 15..19
        f.box(2, vBot, reach, f.len - 3, vTop, reach, s.sign ? A : (u: number) => stripe(u));
        f.box(2, vBot - 1, reach, f.len - 3, vBot - 1, reach, (u) => (u % 3 === 1 ? stripe(u) : 0));
        if (s.sign) {
          const text = s.sign.slice(0, Math.floor((f.len - 8) / 4));
          const start = Math.floor((f.len - textWidth(text)) / 2);
          rasterText(text, (px, py) => f.set(start + px, vBot + py, reach + 1, Bv));
        }
        // Side cheeks.
        for (let i = 0; i < reach; i++) {
          f.box(2, vTop, 1 + i, 2, slopeY(i), 1 + i, A);
          f.box(f.len - 3, vTop, 1 + i, f.len - 3, slopeY(i), 1 + i, A);
        }
        // Collider: the canopy only (2.5 blocks up and higher), so it never blocks walking.
        const ca = f.local(2, yEdge, 1), cb = f.local(f.len - 3, 23, reach + 1);
        boxes.push({ min: [Math.min(ca[0], cb[0]), ca[1], Math.min(ca[2], cb[2])], max: [Math.max(ca[0], cb[0]) + DV, cb[1], Math.max(ca[2], cb[2]) + DV] });
      }
      // Wall lantern beside the door.
      lantern(f, db + 3, 13);
    } else if (ground === 'door' || ground === 'house') {
      // Rusticated base with grooves (euro), or plain.
      if (s.preset === 'euro' && s.groundStyle === 'stone') {
        for (let y = 2; y < FLOOR_H - 1; y++)
          for (let u = 0; u < f.len; u++) {
            const course = Math.floor(y / 4);
            if (y % 4 === 3 || (u + (course & 1) * 5) % 10 === 0) f.set(u, y, 0, 0);
          }
      }
      const dc = Math.round(f.len * s.doorAt);
      const dw = ground === 'house' ? 7 : 11;
      const dh = ground === 'house' ? 17 : 19;
      const da = dc - ((dw - 1) >> 1), db = da + dw - 1;
      f.box(da, 1, -3, db, dh, 1, 0);
      const doorCol = vox(pick(rng, [PAL.woodDark, PAL.shutterGreen, PAL.shutterRed, PAL.shutterBlue, PAL.wood]), { jitter: 0.05 });
      const panel = vox(tint(colorOfV(doorCol), 0.8), { jitter: 0.05 });
      f.box(da, 1, -3, db, dh, -3, (u, y) => (y > dh - 4 ? glass : (u - da) % 3 === 1 && y % 5 !== 0 ? panel : doorCol));
      f.set(db - 2, 9, -2, V.gold);
      // Surround.
      f.box(da - 2, 1, 1, da - 1, dh + 1, 1, trim);
      f.box(db + 1, 1, 1, db + 2, dh + 1, 1, trim);
      f.box(da - 2, dh + 1, 1, db + 2, dh + 2, 1, trim);
      if (ground === 'door') {
        f.box(da - 1, dh, -2, da, dh, 0, trim);
        f.box(db, dh, -2, db + 1, dh, 0, trim);
        f.box(dc - 1, dh + 2, 1, dc + 1, dh + 3, 2, trim);
      } else {
        // Porch hood.
        f.box(da - 3, dh + 3, 1, db + 3, dh + 3, 5, vox(s.roofColor, { jitter: 0.06 }));
        f.box(da - 3, 1, 5, da - 3, dh + 2, 5, trim);
        f.box(db + 3, 1, 5, db + 3, dh + 2, 5, trim);
      }
      // Step.
      f.box(da - 2, 0, 1, db + 2, 0, 3, vox(PAL.stoneGrey, { jitter: 0.06 }));
      doors.push(f.local(dc, 0, 2));
      // Windows either side.
      for (const cx of centers) {
        if (Math.abs(cx - dc) < dw / 2 + 8) continue;
        windowAt(f, cx, 6, { shutters: ground === 'house', bars: ground === 'door', box: ground === 'house' && rng() < s.flowerBoxes });
      }
      lantern(f, db + 4, 14);
    } else if (ground === 'blank') {
      for (const cx of centers) if (rng() < 0.5) windowAt(f, cx, 6, { bars: s.preset === 'euro', shutters: s.preset === 'house' });
    }
  }

  function lantern(f: Face, u: number, y: number) {
    if (u >= f.len - 1) return;
    f.box(u, y + 3, 1, u, y + 3, 2, V.iron);
    f.box(u, y - 1, 2, u, y + 2, 3, (_u, yy) => (yy === y - 1 || yy === y + 2 ? V.iron : V.warmBulb));
  }

  // ---- Drainpipe.
  if (s.preset !== 'modern') {
    const f = faces[0];
    const u = partyR ? 1 : f.len - 2;
    const pipe = vox(0x6f757d, { jitter: 0.04 });
    f.box(u, 0, 1, u, wallTop - 3, 1, pipe);
    f.box(u - 1, wallTop - 5, 1, u + 1, wallTop - 4, 2, pipe);
  }

  // ---- Ivy.
  if (s.ivy > 0) {
    const f = faces[0];
    const stems = 1 + Math.floor(s.ivy * 3);
    for (let k = 0; k < stems; k++) {
      let u = Math.floor(rng() * f.len);
      const maxY = Math.floor(wallTop * (0.35 + s.ivy * 0.6) * (0.6 + rng() * 0.4));
      for (let y = 0; y < maxY; y++) {
        if (rng() < 0.3) u += rng() < 0.5 ? -1 : 1;
        const spread = 2 + Math.floor((1 - y / maxY) * 4);
        for (let du = -spread; du <= spread; du++) {
          if (hash3(u + du, y, s.seed + k) > 0.55 - Math.abs(du) * 0.06) continue;
          const out = hash3(u + du, y, k) < 0.2 ? 2 : 1;
          if (!f.get(u + du, y, out)) f.set(u + du, y, out, leaf(u + du, y, out));
        }
      }
    }
  }

  // ---- Roof.
  // Tile courses alternate shade; the shader adds per-tile noise.
  const roofA = vox(s.roofColor, { jitter: 0.12 }), roofB = vox(tint(s.roofColor, 0.86), { jitter: 0.12 });
  const roofV = (t: number, _x: number, _z: number) => (t % 2 === 0 ? roofA : roofB);
  const ox = partyR ? 0 : 1, oxR = partyL ? 0 : 1;
  if (s.roof === 'flat') {
    // Parapet with coping, gravel deck, rooftop clutter.
    const pTop = wallTop + 3;
    const parapet = (x: number, y: number, z: number) => (y < FLOOR_H ? lower(x, y, z) : upper(x, y, z));
    g.box(x0, wallTop, z0, x0 + W - 1, pTop - 1, z0 + D - 1, (x, y, z) => {
      const edge = x < x0 + 2 || x > x0 + W - 3 || z < z0 + 2 || z > z0 + D - 3;
      return edge ? parapet(x, y, z) : 0;
    });
    g.box(x0, pTop, z0, x0 + W - 1, pTop, z0 + D - 1, (x, _y, z) => (x < x0 + 2 || x > x0 + W - 3 || z < z0 + 2 || z > z0 + D - 3 ? trim : 0));
    g.paint(x0 + 2, wallTop - 1, z0 + 2, x0 + W - 3, wallTop - 1, z0 + D - 3, speck(s.seed, [vox(s.roofColor, { jitter: 0.12 }), vox(tint(s.roofColor, 0.9), { jitter: 0.12 })]));
    const nThings = Math.floor((W * D) / 900);
    for (let i = 0; i < nThings; i++) {
      const bx = x0 + 4 + Math.floor(rng() * (W - 14)), bz = z0 + 4 + Math.floor(rng() * (D - 14));
      const kind = rng();
      if (kind < 0.5) {
        // AC unit with a fan grille.
        g.box(bx, wallTop, bz, bx + 6, wallTop + 4, bz + 5, V.metal);
        g.box(bx + 1, wallTop + 5, bz + 1, bx + 5, wallTop + 5, bz + 4, (x, _y, z) => ((x + z) % 2 ? V.iron : V.metal));
      } else if (kind < 0.75) {
        g.box(bx, wallTop, bz, bx + 1, wallTop + 6, bz + 1, vox(0x6f757d));
        g.box(bx - 1, wallTop + 7, bz - 1, bx + 2, wallTop + 7, bz + 2, vox(0x6f757d));
      } else {
        // Skylight.
        g.box(bx, wallTop, bz, bx + 8, wallTop + 1, bz + 6, trim);
        g.box(bx + 1, wallTop + 2, bz + 1, bx + 7, wallTop + 2, bz + 5, glass);
      }
    }
  } else if (s.roof === 'gable') {
    // Ridge runs along the facade; slopes face the street and the back.
    let t = 0;
    for (; ; t++) {
      const zf = z0 - 2 + t * 2, zb = z0 + D + 1 - t * 2;
      if (zf > zb) break;
      const y = wallTop + t;
      for (let x = x0 - ox; x <= x0 + W - 1 + oxR; x++) {
        for (let z = zf; z <= zb; z++) {
          const shell = z <= zf + 1 || z >= zb - 1;
          if (shell) g.set(x, y, z, roofV(t, x, z));
          else if (x >= x0 && x <= x0 + W - 1) g.set(x, y, z, upper(x, y, z));
        }
      }
    }
    const ridgeY = wallTop + t - 1;
    g.box(x0 - ox, ridgeY + 1, z0 + Math.floor(D / 2) - 1, x0 + W - 1 + oxR, ridgeY + 1, z0 + Math.floor(D / 2), vox(tint(s.roofColor, 0.7), { jitter: 0.05 }));
    const L = (x: number, y: number, z: number) => [(x - x0) * DV, y * DV, (z - z0) * DV];
    hulls.push([
      ...L(x0 - ox, wallTop, z0 - 2), ...L(x0 + W + oxR, wallTop, z0 - 2),
      ...L(x0 - ox, wallTop, z0 + D + 2), ...L(x0 + W + oxR, wallTop, z0 + D + 2),
      ...L(x0 - ox, ridgeY + 2, z0 + D / 2), ...L(x0 + W + oxR, ridgeY + 2, z0 + D / 2),
    ]);
  } else {
    // gableSide: ridge runs front to back, the gable end faces the street.
    let t = 0;
    for (; ; t++) {
      const xa = x0 - 2 + t * 2, xb = x0 + W + 1 - t * 2;
      if (xa > xb) break;
      const y = wallTop + t;
      for (let z = z0 - 2; z <= z0 + D + 1; z++)
        for (let x = xa; x <= xb; x++) {
          const shell = x <= xa + 1 || x >= xb - 1 || z < z0 || z > z0 + D - 1;
          const edgeZ = z < z0 || z > z0 + D - 1;
          if (shell && (!edgeZ || x <= xa + 1 || x >= xb - 1)) g.set(x, y, z, roofV(t, z, x));
          else if (!edgeZ) g.set(x, y, z, upper(x, y, z));
        }
    }
    const ridgeY = wallTop + t - 1;
    g.box(x0 + Math.floor(W / 2) - 1, ridgeY + 1, z0 - 2, x0 + Math.floor(W / 2), ridgeY + 1, z0 + D + 1, vox(tint(s.roofColor, 0.7), { jitter: 0.05 }));
    // A round window in the street gable.
    const f = faces[0];
    const gy = wallTop + Math.floor(t / 3);
    const cu = Math.floor(W / 2);
    f.box(cu - 2, gy, -1, cu + 2, gy + 4, 0, 0);
    f.box(cu - 2, gy, -2, cu + 2, gy + 4, -2, glass);
    f.box(cu, gy, -1, cu, gy + 4, -1, trim);
    f.box(cu - 2, gy + 2, -1, cu + 2, gy + 2, -1, trim);
    for (const [du, dy] of [[-2, 0], [2, 0], [-2, 4], [2, 4]]) f.set(cu + du, gy + dy, 0, trim);
    const L = (x: number, y: number, z: number) => [(x - x0) * DV, y * DV, (z - z0) * DV];
    hulls.push([
      ...L(x0 - 2, wallTop, z0 - 2), ...L(x0 + W + 2, wallTop, z0 - 2),
      ...L(x0 - 2, wallTop, z0 + D + 2), ...L(x0 + W + 2, wallTop, z0 + D + 2),
      ...L(x0 + W / 2, ridgeY + 2, z0 - 2), ...L(x0 + W / 2, ridgeY + 2, z0 + D + 2),
    ]);
  }

  // ---- Chimney.
  if (s.chimney && s.roof !== 'flat') {
    const brick = wallPaint('brick', PAL.brickRed, s.seed + 5);
    const cx = x0 + 6 + Math.floor(rng() * (W - 16));
    const cz = z0 + Math.floor(D * 0.55);
    const top = g.sy - 2;
    g.box(cx, wallTop, cz, cx + 4, top, cz + 4, brick);
    g.box(cx - 1, top, cz - 1, cx + 5, top, cz + 5, trimDark);
    g.box(cx + 1, top + 1, cz + 1, cx + 3, top + 1, cz + 3, vox(0x3a3a3a));
  }

  // Overall height = topmost solid cell.
  let topCell = 0;
  for (let y = g.sy - 1; y >= 0 && !topCell; y--)
    for (let i = y * g.sz * g.sx, e = i + g.sz * g.sx; i < e; i++)
      if (g.data[i]) {
        topCell = y + 1;
        break;
      }

  return { grid: g, origin: [x0, 0, z0], boxes, hulls, doors, wallTop: wallTop * DV, height: topCell * DV, spec: s };
}

const colorOfV = (v: number) => v & 0xffffff;
