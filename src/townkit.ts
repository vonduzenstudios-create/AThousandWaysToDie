import { B, type VoxelWorld } from './voxel';
import { pick, type Rng } from './util';

/**
 * Voxel building blocks for towns: roads, buildings, furniture and street clutter.
 * Everything is plain voxels so it renders, collides and shows up on the minimap for free.
 */

export const GROUND = 12; // walkable ground surface; deep enough below for the quarry and pools

export type Side = 'n' | 's' | 'e' | 'w';

const G = GROUND;

// ------------------------------------------------------------------ roads

/** A straight road along x (horizontal on the map) centered on z, with sidewalks and a dashed center line. */
export function roadX(w: VoxelWorld, z: number, x0: number, x1: number, half = 3) {
  w.fill(x0, G - 1, z - half, x1, G - 1, z + half, B.Asphalt);
  w.fill(x0, G - 1, z - half - 2, x1, G - 1, z - half - 1, B.Sidewalk);
  w.fill(x0, G - 1, z + half + 1, x1, G - 1, z + half + 2, B.Sidewalk);
  for (let x = x0; x <= x1; x++) if (x % 6 < 3) w.set(x, G - 1, z, B.Yellow);
}

export function roadZ(w: VoxelWorld, x: number, z0: number, z1: number, half = 3) {
  w.fill(x - half, G - 1, z0, x + half, G - 1, z1, B.Asphalt);
  w.fill(x - half - 2, G - 1, z0, x - half - 1, G - 1, z1, B.Sidewalk);
  w.fill(x + half + 1, G - 1, z0, x + half + 2, G - 1, z1, B.Sidewalk);
  for (let z = z0; z <= z1; z++) if (z % 6 < 3) w.set(x, G - 1, z, B.Yellow);
}

/** Clear an intersection to plain asphalt and paint zebra crosswalks on all four sides. */
export function intersection(w: VoxelWorld, x: number, z: number, half = 3) {
  w.fill(x - half, G - 1, z - half, x + half, G - 1, z + half, B.Asphalt);
  // Sidewalk corners.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) w.fill(x + sx * (half + 1), G - 1, z + sz * (half + 1), x + sx * (half + 2), G - 1, z + sz * (half + 2), B.Sidewalk);
  for (let i = -half; i <= half; i += 2) {
    for (const d of [half + 1, half + 2]) {
      w.set(x + i, G - 1, z - d, B.White);
      w.set(x + i, G - 1, z + d, B.White);
      w.set(x - d, G - 1, z + i, B.White);
      w.set(x + d, G - 1, z + i, B.White);
    }
  }
}

/** Paved area (parking lot) with painted stall lines every 4 blocks along x. */
export function parkingLot(w: VoxelWorld, x0: number, z0: number, x1: number, z1: number, stallsAlongX = true) {
  w.fill(x0, G - 1, z0, x1, G - 1, z1, B.Asphalt);
  if (stallsAlongX) {
    for (let x = x0 + 1; x < x1; x += 4) {
      w.fill(x, G - 1, z0 + 1, x, G - 1, z0 + 5, B.White);
      w.fill(x, G - 1, z1 - 5, x, G - 1, z1 - 1, B.White);
    }
  } else {
    for (let z = z0 + 1; z < z1; z += 4) {
      w.fill(x0 + 1, G - 1, z, x0 + 5, G - 1, z, B.White);
      w.fill(x1 - 5, G - 1, z, x1 - 1, G - 1, z, B.White);
    }
  }
}

/** A footpath of gravel or sidewalk from one point to another (L-shaped). */
export function path(w: VoxelWorld, x0: number, z0: number, x1: number, z1: number, mat: number = B.Sidewalk, width = 2) {
  const h = Math.floor(width / 2);
  w.fill(x0 - h, G - 1, z0 - h, x1 + width - 1 - h, G - 1, z0 + width - 1 - h, mat);
  w.fill(x1 - h, G - 1, z0 - h, x1 + width - 1 - h, G - 1, z1 + width - 1 - h, mat);
}

// ------------------------------------------------------------------ buildings

export interface DoorSpec {
  side: Side;
  /** Coordinate along the wall (x for n/s walls, z for e/w walls) of the door's first column. */
  at: number;
  width?: number;
  height?: number;
  /** Which floor the door is on (0 = ground). */
  floor?: number;
}

export interface BuildingSpec {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  floors?: number;
  floorH?: number;
  wall: number;
  /** Corner pillars and the band between floors. */
  trim?: number;
  floor?: number;
  roof?: 'flat' | 'gable' | 'gableZ' | 'none';
  roofMat?: number;
  window?: number;
  /** Window spacing along walls. 0 = no windows. */
  winEvery?: number;
  /** Big storefront windows on this side (ground floor). */
  storefront?: Side;
  doors?: DoorSpec[];
  /** Ceiling slab material for upper floors. */
  slab?: number;
}

/** Hollow building with floors, windows, doors and a roof. Returns the interior bounds of the ground floor. */
export function building(w: VoxelWorld, s: BuildingSpec) {
  const floors = s.floors ?? 1;
  const fh = s.floorH ?? 5;
  const top = G + floors * fh; // y of the roof slab
  const win = s.window ?? B.Glass;
  const every = s.winEvery ?? 3;
  const trim = s.trim ?? s.wall;
  const { x0, z0, x1, z1 } = s;
  // Clear the volume, lay the floor.
  w.fill(x0, G, z0, x1, top + 1, z1, B.Air);
  w.fill(x0, G - 1, z0, x1, G - 1, z1, s.floor ?? B.Plank);
  for (let f = 0; f < floors; f++) {
    const by = G + f * fh;
    for (let y = by; y < by + fh; y++)
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const ex = x === x0 || x === x1;
          const ez = z === z0 || z === z1;
          if (!ex && !ez) continue;
          const corner = ex && ez;
          const band = f > 0 && y === by;
          let b = corner || band ? trim : s.wall;
          const along = ex ? z : x;
          const ly = y - by;
          if (!corner && !band && every > 0 && ly >= 1 && ly <= 2 && along % every === 1) b = win;
          if (!corner && f === 0 && s.storefront && ly >= 1 && ly <= 3) {
            const side: Side = z === z0 ? 'n' : z === z1 ? 's' : x === x0 ? 'w' : 'e';
            if (side === s.storefront && along % 5 !== 0) b = win;
          }
          w.set(x, y, z, b);
        }
    // Floor slab for the storey above.
    if (f > 0) w.fill(x0 + 1, by - 1, z0 + 1, x1 - 1, by - 1, z1 - 1, s.slab ?? s.floor ?? B.Plank);
  }
  // Doors.
  for (const d of s.doors ?? []) {
    const dw = d.width ?? 2;
    const dh = d.height ?? 3;
    const by = G + (d.floor ?? 0) * fh;
    for (let i = 0; i < dw; i++)
      for (let y = by; y < by + dh; y++) {
        if (d.side === 'n') w.set(d.at + i, y, z0, B.Air);
        if (d.side === 's') w.set(d.at + i, y, z1, B.Air);
        if (d.side === 'w') w.set(x0, y, d.at + i, B.Air);
        if (d.side === 'e') w.set(x1, y, d.at + i, B.Air);
      }
  }
  // Roof.
  const roof = s.roof ?? 'flat';
  const rm = s.roofMat ?? B.Dark;
  if (roof === 'flat') {
    w.fill(x0, top, z0, x1, top, z1, rm);
    for (let x = x0; x <= x1; x++) {
      w.set(x, top + 1, z0, trim);
      w.set(x, top + 1, z1, trim);
    }
    for (let z = z0; z <= z1; z++) {
      w.set(x0, top + 1, z, trim);
      w.set(x1, top + 1, z, trim);
    }
  } else if (roof === 'gable') {
    // Ridge runs along x.
    const dp = z1 - z0 + 1;
    const half = Math.ceil(dp / 2);
    w.fill(x0, top - 1, z0, x1, top - 1, z1, s.wall); // top band closes the walls
    w.fill(x0 + 1, top - 1, z0 + 1, x1 - 1, top - 1, z1 - 1, B.Air);
    for (let i = 0; i <= half; i++) {
      const y = top + i - 1;
      w.fill(x0 - 1, y, z0 - 1 + i, x1 + 1, y, z0 - 1 + i, rm);
      w.fill(x0 - 1, y, z1 + 1 - i, x1 + 1, y, z1 + 1 - i, rm);
      if (i > 0 && z0 + i <= z1 - i) {
        w.fill(x0, y, z0 + i, x0, y, z1 - i, s.wall);
        w.fill(x1, y, z0 + i, x1, y, z1 - i, s.wall);
      }
    }
  } else if (roof === 'gableZ') {
    const wd = x1 - x0 + 1;
    const half = Math.ceil(wd / 2);
    for (let i = 0; i <= half; i++) {
      const y = top + i - 1;
      w.fill(x0 - 1 + i, y, z0 - 1, x0 - 1 + i, y, z1 + 1, rm);
      w.fill(x1 + 1 - i, y, z0 - 1, x1 + 1 - i, y, z1 + 1, rm);
      if (i > 0 && x0 + i <= x1 - i) {
        w.fill(x0 + i, y, z0, x1 - i, y, z0, s.wall);
        w.fill(x0 + i, y, z1, x1 - i, y, z1, s.wall);
      }
    }
  }
  return { x0: x0 + 1, z0: z0 + 1, x1: x1 - 1, z1: z1 - 1, top };
}

/** Straight staircase of 1-block steps rising toward +x/-x/+z/-z, 2 wide, cutting a hole in the slab above. */
export function stairs(w: VoxelWorld, x: number, z: number, dir: Side, rise: number, baseY = G, mat: number = B.Plank, width = 2) {
  for (let i = 0; i < rise; i++) {
    for (let k = 0; k < width; k++) {
      let sx = x, sz = z;
      if (dir === 'e') (sx = x + i), (sz = z + k);
      if (dir === 'w') (sx = x - i), (sz = z + k);
      if (dir === 's') (sx = x + k), (sz = z + i);
      if (dir === 'n') (sx = x + k), (sz = z - i);
      w.fill(sx, baseY, sz, sx, baseY + i, sz, mat);
      // headroom
      for (let h = 1; h <= 3; h++) w.set(sx, baseY + i + h, sz, B.Air);
    }
  }
}

// ------------------------------------------------------------------ houses

export interface HouseOpts {
  x0: number;
  z0: number;
  w: number;
  d: number;
  door: Side;
  floors?: number;
}

/** A home with a gable roof, chimney, porch step, front path and furnished rooms. Returns door info. */
export function house(w: VoxelWorld, rng: Rng, o: HouseOpts) {
  const wall = pick(rng, [B.WallBlue, B.WallMint, B.WallPeach, B.White, B.Brick, B.Pink, B.Yellow]);
  const roofMat = pick(rng, [B.RoofRed, B.RoofBlue, B.RoofGreen, B.RoofBrown, B.Dark]);
  const x1 = o.x0 + o.w - 1;
  const z1 = o.z0 + o.d - 1;
  const cx = Math.floor((o.x0 + x1) / 2);
  const cz = Math.floor((o.z0 + z1) / 2);
  const floors = o.floors ?? 1;
  const doorAt = o.door === 'n' || o.door === 's' ? cx : cz;
  const inner = building(w, {
    x0: o.x0,
    z0: o.z0,
    x1,
    z1,
    floors,
    floorH: 5,
    wall,
    trim: B.Wood,
    floor: pick(rng, [B.Plank, B.Carpet, B.Plank, B.Linoleum]),
    roof: o.door === 'n' || o.door === 's' ? 'gable' : 'gableZ',
    roofMat,
    winEvery: 3,
    doors: [{ side: o.door, at: doorAt, width: 2, height: 3 }],
  });
  // Chimney.
  w.fill(x1 - 1, inner.top - 1, o.z0 + 1, x1 - 1, inner.top + Math.ceil(Math.min(o.w, o.d) / 2) + 1, o.z0 + 1, B.Brick);
  // Interior wall splitting bedroom from living room, with a doorway.
  const split = o.door === 'n' || o.door === 's' ? 'x' : 'z';
  if (split === 'x') {
    const sx = o.door === 'n' ? (cx + 4 <= x1 - 3 ? cx + 4 : x1 - 3) : o.x0 + 3;
    for (let y = G; y < G + 4; y++) for (let z = o.z0 + 1; z < z1; z++) if (Math.abs(z - cz) > 1) w.set(sx, y, z, wall);
    furnish(w, rng, inner.x0, inner.z0, sx - 1, inner.z1, 'living');
    furnish(w, rng, sx + 1, inner.z0, inner.x1, inner.z1, 'bedroom');
  } else {
    const sz = o.z0 + 3;
    for (let y = G; y < G + 4; y++) for (let x = o.x0 + 1; x < x1; x++) if (Math.abs(x - cx) > 1) w.set(x, y, sz, wall);
    furnish(w, rng, inner.x0, sz + 1, inner.x1, inner.z1, 'living');
    furnish(w, rng, inner.x0, inner.z0, inner.x1, sz - 1, 'bedroom');
  }
  if (floors > 1) stairs(w, inner.x0, inner.z1 - 1, 'e', 5, G, B.Plank);
  // Porch step and the spot just outside the door.
  const out = doorOutside(o.door, o.x0, o.z0, x1, z1, doorAt);
  return { wall, door: out, inner, x1, z1 };
}

/** The walkable point just outside a door on a given side. */
export function doorOutside(side: Side, x0: number, z0: number, x1: number, z1: number, at: number) {
  if (side === 'n') return { x: at + 1, z: z0 - 1.5 };
  if (side === 's') return { x: at + 1, z: z1 + 2.5 };
  if (side === 'w') return { x: x0 - 1.5, z: at + 1 };
  return { x: x1 + 2.5, z: at + 1 };
}

// ------------------------------------------------------------------ furniture

export function furnish(w: VoxelWorld, rng: Rng, x0: number, z0: number, x1: number, z1: number, kind: 'living' | 'bedroom' | 'kitchen') {
  if (x1 - x0 < 2 || z1 - z0 < 2) return;
  if (kind === 'bedroom') {
    const blanket = pick(rng, [B.WallBlue, B.Pink, B.RoofGreen, B.Purple, B.RedPaint]);
    // Bed against the back wall.
    w.fill(x0, G, z0, x0 + 1, G, z0 + 2, blanket);
    w.fill(x0, G, z0, x0 + 1, G, z0, B.White);
    w.set(x1, G, z0, B.Wood); // nightstand
    w.set(x1, G + 1, z0, B.Lamp);
    w.fill(x1, G, z1, x1, G + 2, z1, B.Wood); // dresser
  } else if (kind === 'living') {
    const couch = pick(rng, [B.Carpet, B.Navy, B.RoofGreen, B.Orange, B.Purple]);
    w.fill(x0, G, z1, x0 + 2, G, z1, couch);
    w.fill(x0, G + 1, z1, x0 + 2, G + 1, z1, couch);
    w.set(x0 + 1, G, z1 - 2, B.Plank); // coffee table
    w.fill(x0, G, z0, x0 + 1, G, z0, B.Wood); // TV stand
    w.fill(x0, G + 1, z0, x0 + 1, G + 1, z0, B.Black);
    // Kitchen corner.
    w.fill(x1, G, z0, x1, G, Math.min(z0 + 2, z1), B.Shelf);
    w.fill(x1, G, z1, x1, G + 1, z1, B.White); // fridge
  } else {
    w.fill(x0, G, z0, x1, G, z0, B.Shelf);
    w.fill(x0, G, z1, x0 + 1, G + 1, z1, B.White);
  }
}

/** A row of 2-high shelving with colorful products, for stores. */
export function shelfRow(w: VoxelWorld, rng: Rng, x0: number, z0: number, x1: number, z1: number, h = 2) {
  const goods = [B.RedPaint, B.Yellow, B.WallBlue, B.Flower, B.Orange, B.RoofGreen, B.White, B.Purple];
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
      for (let y = G; y < G + h; y++) w.set(x, y, z, B.Shelf);
      w.set(x, G + h, z, pick(rng, goods));
    }
}

// ------------------------------------------------------------------ street clutter

export function lamp(w: VoxelWorld, x: number, z: number) {
  w.fill(x, G, z, x, G + 4, z, B.Metal);
  w.set(x, G + 5, z, B.Lamp);
}

export function hydrant(w: VoxelWorld, x: number, z: number) {
  w.set(x, G, z, B.RedPaint);
}

export function bench(w: VoxelWorld, x: number, z: number, alongX = true) {
  if (alongX) w.fill(x, G, z, x + 2, G, z, B.Plank);
  else w.fill(x, G, z, x, G, z + 2, B.Plank);
}

export function trashCan(w: VoxelWorld, x: number, z: number) {
  w.set(x, G, z, B.RoofGreen);
}

export function mailbox(w: VoxelWorld, x: number, z: number) {
  w.set(x, G, z, B.Wood);
  w.set(x, G + 1, z, B.Navy);
}

/** A parked voxel car, 5 long and 3 wide, along x or z. */
export function car(w: VoxelWorld, rng: Rng, x: number, z: number, alongX = true, color?: number) {
  const c = color ?? pick(rng, [B.RedPaint, B.WallBlue, B.White, B.Yellow, B.RoofGreen, B.Black, B.Orange, B.Navy, B.Purple]);
  const L = 5, Wd = 3;
  for (let i = 0; i < L; i++)
    for (let k = 0; k < Wd; k++) {
      const X = alongX ? x + i : x + k;
      const Z = alongX ? z + k : z + i;
      const wheel = (i === 0 || i === L - 1) && k !== 1;
      w.set(X, G, Z, wheel ? B.Black : c);
      if (i >= 1 && i <= 3) w.set(X, G + 1, Z, B.Glass);
      if (i === 2) w.set(X, G + 2, Z, c);
    }
}

/** Low hedge or picket fence along a line. */
export function fenceLine(w: VoxelWorld, x0: number, z0: number, x1: number, z1: number, mat: number = B.White, h = 1, gapAt?: [number, number]) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
      if (gapAt && x >= gapAt[0] && x <= gapAt[1] && (x0 === x1 ? false : true)) continue;
      if (gapAt && x0 === x1 && z >= gapAt[0] && z <= gapAt[1]) continue;
      w.fill(x, G, z, x, G + h - 1, z, mat);
    }
}

export function flowerBed(w: VoxelWorld, rng: Rng, x0: number, z0: number, x1: number, z1: number) {
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      w.set(x, G - 1, z, B.Dirt);
      if (rng() < 0.6) w.set(x, G, z, pick(rng, [B.Flower, B.Yellow, B.Purple, B.Pink, B.Leaves]));
    }
}

/** Small tree. Returns the canopy top. */
export function tree(w: VoxelWorld, rng: Rng, x: number, z: number, big = false) {
  const h = (big ? 6 : 4) + Math.floor(rng() * 3);
  w.fill(x, G, z, x, G + h - 1, z, B.Wood);
  const r = (big ? 3 : 2) + Math.floor(rng() * 2);
  const cy = G + h;
  const leaf = rng() < 0.5 ? B.Leaves : B.LeavesDark;
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dy * dy * 1.6 + dz * dz > r * r + 0.5) continue;
        if (w.get(x + dx, cy + dy, z + dz) === 0 && rng() > 0.06) w.set(x + dx, cy + dy, z + dz, leaf);
      }
  return { x: x + 0.5, y: cy + r, z: z + 0.5 };
}

/** Pine tree for the woods. */
export function pine(w: VoxelWorld, rng: Rng, x: number, z: number) {
  const h = 7 + Math.floor(rng() * 5);
  w.fill(x, G, z, x, G + h, z, B.Wood);
  for (let y = G + 2; y <= G + h + 1; y++) {
    const r = Math.max(0, Math.floor((G + h + 2 - y) / 2.2));
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) + Math.abs(dz) <= r && w.get(x + dx, y, z + dz) === 0) w.set(x + dx, y, z + dz, B.LeavesDark);
  }
  return { x: x + 0.5, y: G + h + 2, z: z + 0.5 };
}
