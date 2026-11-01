import { B } from '../../voxel';
import type { Rng } from '../../util';
import { Frame, SIZE_X, SIZE_Z, dbox } from './frame';

/**
 * Everything about where things are, in design coordinates (see frame.ts).
 * Ground floor walks at y = 0, the upper concourse at y = UP.
 */
export const UP = 8;

export const TERM = { x0: 40, x1: 280, z0: 16, z1: 70 };
/** Security wall between the landside hall and the airside ground floor. */
export const SEC_Z = 44;
export const LANES = [124, 134, 144]; // lane x0, each 3 wide
export const STAIRS = { x0: 148, x1: 155, z0: 52 }; // 8 steps of 2 along +z
export const BELT = { x0: 80, x1: 81, z0: 39, z1: 57 }; // check-in bag belt, surface y = 1
export const SORTER = { x0: 76, x1: 85, z0: 57, z1: 63 };
export const CAROUSELS = [
  { x: 205, z: 30 },
  { x: 250, z: 30 },
];
export const CAROUSEL_R = { inner: 3.6, outer: 6.4 };
export const WALKWAY = { x0: 168, x1: 232, east: { z0: 50, z1: 51 }, west: { z0: 54, z1: 55 } };
export const GATES = [
  { id: 'A1', x: 60 },
  { id: 'A2', x: 110 },
  { id: 'A3', x: 190 },
  { id: 'A4', x: 240 },
];
export const BRIDGE_END = 88; // last deck z of each jet bridge
/** Parked plane center for a gate (fuselage along x, nose toward +x, door by the bridge). */
export const planeSpot = (gx: number) => ({ x: gx - 12.5, z: 92 });
export const LOUNGE = { x0: 264, x1: 279, z0: 45, z1: 69, doorZ: 56 };
export const DUTY_FREE = { x0: 44, x1: 76, z0: 46, z1: 60 };
export const TSA_OFFICE = { x0: 116, x1: 128, z0: 58, z1: 69, doorX: 122 };
export const BAG_W = { x0: 41, x1: 114 };
export const BAG_E = { x0: 166, x1: 279 };
export const STAFF_DOORS = {
  bagW: { x: 44, z: SEC_Z }, // check-in hall to west baggage room
  bagE: { x: 268, z: SEC_Z }, // baggage claim to east baggage room
  apronW: { x: 70, z: TERM.z1 }, // west baggage room to apron
  apronE: { x: 250, z: TERM.z1 },
};
export const RUNWAY = { x0: 16, x1: 286, z0: 160, z1: 184, cz: 172 };
export const TAXIWAY = { z0: 132, z1: 140 };
export const TOWER = { x0: 296, x1: 303, z0: 78, z1: 85, cabY: 38 };
export const HANGAR = { x0: 4, x1: 56, z0: 80, z1: 122 };
export const MOUNTAIN = { x0: 292, z0: 140 };
export const FENCE_Z = 71;
export const FENCE_GAP = { x0: 20, x1: 22 }; // walkway from the parking lot to the hangar
export const DEICE = dbox(220, 0, 99, 238, 7, 110);

/** Height of Mount Mortalis at a design column (0 outside it). */
export function mountainH(x: number, z: number) {
  if (x < MOUNTAIN.x0 || z < MOUNTAIN.z0) return 0;
  const dx = (SIZE_X + 8 - x) / 34;
  const dz = (z - 200) / 56;
  const d = Math.sqrt(dx * dx + dz * dz);
  return Math.max(0, Math.floor(36 * (1 - d * d) + Math.sin(x * 0.7 + z * 0.3) * 1.5));
}

// A tiny 3x5 font for painted runway numbers and wall lettering.
const FONT: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
};

/** Paint glyphs flat on the ground, reading along +x when viewed from -z... rotated so they read from the runway threshold. */
function paintFlat(f: Frame, text: string, x0: number, z0: number, scale: number, b: number, alongZ = false) {
  let cursor = 0;
  for (const ch of text) {
    const g = FONT[ch];
    if (!g) continue;
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) {
        if (g[r][c] !== '#') continue;
        for (let sx = 0; sx < scale; sx++)
          for (let sz = 0; sz < scale; sz++) {
            // Read from the approach end (west), letters stacked upright along +z.
            const gx = alongZ ? x0 + (4 - r) * scale + sx : x0 + (cursor + c) * scale + sx;
            const gz = alongZ ? z0 + (cursor + c) * scale + sz : z0 + (4 - r) * scale + sz;
            f.set(gx, -1, gz, b);
          }
      }
    cursor += 4;
  }
}

/** Paint glyphs upright on a wall facing -z (letters run along +x). */
function paintWall(f: Frame, text: string, x0: number, y0: number, z: number, b: number) {
  let cursor = 0;
  for (const ch of text) {
    const g = FONT[ch];
    if (!g) continue;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === '#') f.set(x0 + cursor + c, y0 + 4 - r, z, b);
    cursor += 4;
  }
}

function fence(f: Frame, x0: number, z0: number, x1: number, z1: number) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
      const post = (x + z) % 4 === 0;
      f.fill(x, 0, z, x, 3, z, post ? B.Dark : B.Metal);
      if (post) f.set(x, 4, z, B.Dark);
    }
}

export function buildAirport(f: Frame, rng: Rng) {
  // ---- Clear the lot and lay the ground.
  f.fill(0, -3, 0, SIZE_X - 1, -2, SIZE_Z - 1, B.Dirt);
  f.fill(0, 0, 0, SIZE_X - 1, 50, SIZE_Z - 1, B.Air);
  f.fill(0, -1, 0, SIZE_X - 1, -1, SIZE_Z - 1, B.Grass);

  // Landside: sidewalk, curb lane, sidewalk.
  f.fill(0, -1, 0, SIZE_X - 1, -1, 3, B.Sidewalk);
  f.fill(0, -1, 4, SIZE_X - 1, -1, 12, B.Asphalt);
  for (let x = 2; x < SIZE_X; x += 6) f.fill(x, -1, 8, x + 2, -1, 8, B.White);
  f.fill(0, -1, 13, SIZE_X - 1, -1, 15, B.Sidewalk);
  // Curb lane spurs to the city road.
  f.fill(8, -1, 0, 14, -1, 3, B.Asphalt);
  f.fill(304, -1, 0, 310, -1, 3, B.Asphalt);
  // Parking lot with painted bays.
  f.fill(0, -1, 16, 38, -1, 70, B.Asphalt);
  for (let z = 20; z <= 66; z += 4) {
    f.fill(2, -1, z, 14, -1, z, B.White);
    f.fill(24, -1, z, 36, -1, z, B.White);
  }
  // Cars: chunky voxel sedans.
  const carCols = [B.RedPaint, B.WallBlue, B.Yellow, B.White, B.Dark, B.WallMint];
  for (let z = 21; z <= 63; z += 4)
    for (const x0 of [4, 26]) {
      if (rng() < 0.35) continue;
      const c = carCols[Math.floor(rng() * carCols.length)];
      f.fill(x0, 0, z + 1, x0 + 6, 0, z + 2, c);
      f.fill(x0 + 1, 1, z + 1, x0 + 4, 1, z + 2, B.Glass);
    }
  // East lawn with shrubs and a big sign plinth.
  for (let i = 0; i < 26; i++) {
    const x = 284 + Math.floor(rng() * 34);
    const z = 18 + Math.floor(rng() * 50);
    f.fill(x, 0, z, x + 1, 1, z + 1, rng() < 0.5 ? B.Leaves : B.LeavesDark);
  }
  f.fill(290, 0, 4, 312, 0, 5, B.Concrete);

  // ---- Airside pavement.
  f.fill(0, -1, FENCE_Z, SIZE_X - 1, -1, 128, B.Concrete); // apron
  for (const g of GATES) {
    // Lead-in lines and stop bars.
    f.fill(g.x - 30, -1, 92, g.x + 8, -1, 92, B.Yellow);
    f.fill(g.x + 8, -1, 86, g.x + 8, -1, 98, B.Yellow);
  }
  f.fill(20, -1, TAXIWAY.z0, 300, -1, TAXIWAY.z1, B.Asphalt);
  for (let x = 20; x <= 300; x++) f.set(x, -1, 136, B.Yellow);
  for (const tx of [26, 156, 290]) {
    f.fill(tx, -1, 129, tx + 8, -1, RUNWAY.z0, B.Asphalt);
    for (let z = 129; z <= RUNWAY.z0; z++) f.set(tx + 4, -1, z, B.Yellow);
  }
  // Runway: asphalt, threshold piano keys, centerline, the numbers 0 and 22.
  f.fill(RUNWAY.x0, -1, RUNWAY.z0, RUNWAY.x1, -1, RUNWAY.z1, B.Asphalt);
  for (let x = RUNWAY.x0 + 30; x < RUNWAY.x1 - 30; x += 10) f.fill(x, -1, RUNWAY.cz, x + 5, -1, RUNWAY.cz, B.White);
  for (let z = RUNWAY.z0 + 2; z <= RUNWAY.z1 - 2; z += 3) {
    f.fill(RUNWAY.x0 + 1, -1, z, RUNWAY.x0 + 6, -1, z + 1, B.White);
    f.fill(RUNWAY.x1 - 6, -1, z, RUNWAY.x1 - 1, -1, z + 1, B.White);
  }
  paintFlat(f, '0', RUNWAY.x0 + 9, RUNWAY.cz - 3, 2, B.White, true);
  paintFlat(f, '22', RUNWAY.x1 - 19, RUNWAY.cz - 7, 2, B.White, true);
  // Runway edge lights (little posts the plane plows through).
  for (let x = RUNWAY.x0; x <= RUNWAY.x1; x += 12) {
    f.set(x, 0, RUNWAY.z0 - 1, B.Yellow);
    f.set(x, 0, RUNWAY.z1 + 1, B.Yellow);
  }

  // ---- Mount Mortalis, right off the end of the runway. Whoever planned this airport is fired.
  for (let x = MOUNTAIN.x0; x < SIZE_X; x++)
    for (let z = MOUNTAIN.z0; z < SIZE_Z; z++) {
      const h = mountainH(x, z);
      for (let y = 0; y < h; y++) f.set(x, y, z, y > h - 2 ? (h > 26 ? B.White : B.Grass) : y > h - 4 ? B.Dirt : B.Stone);
    }

  // ---- Perimeter fence.
  fence(f, 0, FENCE_Z, TERM.x0 - 1, FENCE_Z);
  fence(f, TERM.x1 + 1, FENCE_Z, SIZE_X - 1, FENCE_Z);
  fence(f, 0, FENCE_Z, 0, SIZE_Z - 1);
  fence(f, SIZE_X - 1, FENCE_Z, SIZE_X - 1, MOUNTAIN.z0);
  fence(f, 0, SIZE_Z - 1, MOUNTAIN.x0, SIZE_Z - 1);
  // Gap + fenced walkway from the parking lot to the hangar's back door.
  f.fill(FENCE_GAP.x0, 0, FENCE_Z, FENCE_GAP.x1, 4, FENCE_Z, B.Air);
  fence(f, FENCE_GAP.x0 - 1, FENCE_Z, FENCE_GAP.x0 - 1, HANGAR.z0);
  fence(f, FENCE_GAP.x1 + 1, FENCE_Z, FENCE_GAP.x1 + 1, HANGAR.z0);
  f.fill(FENCE_GAP.x0, -1, FENCE_Z, FENCE_GAP.x1, -1, HANGAR.z0, B.Sidewalk);

  buildTerminal(f, rng);
  buildBridges(f);
  buildTower(f);
  buildHangar(f);
}

function buildTerminal(f: Frame, rng: Rng) {
  const { x0, x1, z0, z1 } = TERM;
  // Floors.
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) f.set(x, -1, z, (x + z) % 2 ? B.White : B.Sidewalk);
  // Outer walls, 15 tall, roof on top.
  for (let y = 0; y <= 14; y++) {
    for (let x = x0; x <= x1; x++) {
      const pillar = x % 8 === 0 || x === x0 || x === x1;
      f.set(x, y, z0, pillar || y === 7 || y === 14 ? B.White : B.Glass);
      f.set(x, y, z1, y >= 9 && y <= 12 && !pillar ? B.Glass : B.Concrete);
    }
    for (let z = z0; z <= z1; z++) {
      const band = y >= 9 && y <= 12 && z % 6 !== 0;
      f.set(x0, y, z, band ? B.Glass : B.Concrete);
      f.set(x1, y, z, band ? B.Glass : B.Concrete);
    }
  }
  f.fill(x0 - 1, 15, z0 - 1, x1 + 1, 15, z1 + 1, B.White);
  // Rooftop units.
  for (let i = 0; i < 6; i++) {
    const rx = x0 + 20 + i * 38;
    f.fill(rx, 16, z0 + 30, rx + 5, 18, z0 + 35, B.Metal);
  }
  // Entrances (4 wide, 4 tall) with canopies.
  for (const ex of [98, 158, 218]) {
    f.fill(ex, 0, z0, ex + 3, 3, z0, B.Air);
    f.fill(ex - 3, 5, z0 - 5, ex + 6, 5, z0 - 1, B.White);
    f.fill(ex - 3, 0, z0 - 5, ex - 3, 4, z0 - 5, B.Metal);
    f.fill(ex + 6, 0, z0 - 5, ex + 6, 4, z0 - 5, B.Metal);
  }

  // ---- Upper concourse slab (floor block y = 7, walk on y = 8), ceiling of the ground floor below.
  f.fill(x0 + 1, 6, SEC_Z + 1, x1 - 1, 6, z1 - 1, B.White);
  f.fill(x0 + 1, 7, SEC_Z, x1 - 1, 7, z1 - 1, B.RoofBlue);
  // Glass wall along the concourse edge, overlooking the landside hall.
  f.fill(x0 + 1, 8, SEC_Z, x1 - 1, 14, SEC_Z, B.Glass);
  for (let x = x0; x <= x1; x += 16) f.fill(x, 8, SEC_Z, x, 14, SEC_Z, B.White);

  // ---- Security wall (ground floor), with lanes and staff doors.
  f.fill(x0 + 1, 0, SEC_Z, x1 - 1, 6, SEC_Z, B.Concrete);
  for (let x = x0 + 1; x < x1; x += 2) f.set(x, 3, SEC_Z, B.WallBlue);
  for (const lx of LANES) {
    f.fill(lx, 0, SEC_Z, lx + 2, 3, SEC_Z, B.Air);
    // X-ray machine beside each lane on the landside, with its belt.
    f.fill(lx + 4, 0, 36, lx + 6, 0, SEC_Z - 1, B.Dark);
    f.fill(lx + 4, 1, 39, lx + 6, 2, 41, B.Metal);
    // Body scanner booth just past the wall.
    f.fill(lx - 1, 0, SEC_Z + 1, lx - 1, 3, SEC_Z + 3, B.Metal);
    f.fill(lx + 3, 0, SEC_Z + 1, lx + 3, 3, SEC_Z + 3, B.Metal);
    f.fill(lx - 1, 4, SEC_Z + 1, lx + 3, 4, SEC_Z + 3, B.Metal);
  }
  // Queue stanchions are props; the lanes' last row of tape is voxels.
  for (const d of [STAFF_DOORS.bagW, STAFF_DOORS.bagE]) f.fill(d.x, 0, d.z, d.x + 1, 2, d.z, B.Air);
  // Bag belt flap through the security wall (2 tall, on the belt).
  f.fill(BELT.x0, 1, SEC_Z, BELT.x1, 2, SEC_Z, B.Air);

  // ---- Ground floor airside: rooms behind the security wall.
  // Partition walls.
  f.fill(115, 0, SEC_Z + 1, 115, 5, z1 - 1, B.Concrete);
  f.fill(165, 0, SEC_Z + 1, 165, 5, z1 - 1, B.Concrete);
  for (let z = SEC_Z + 2; z < z1; z += 3) {
    f.set(115, 3, z, B.Yellow);
    f.set(165, 3, z, B.Yellow);
  }
  // Baggage room floors (grimy concrete) and back doors to the apron.
  f.fill(BAG_W.x0, -1, SEC_Z + 1, BAG_W.x1, -1, z1 - 1, B.Concrete);
  f.fill(BAG_E.x0, -1, SEC_Z + 1, BAG_E.x1, -1, z1 - 1, B.Concrete);
  for (const d of [STAFF_DOORS.apronW, STAFF_DOORS.apronE]) f.fill(d.x, 0, d.z, d.x + 1, 2, d.z, B.Air);
  // Check-in bag belt: rails and belt run from behind the counters into the sorter.
  f.fill(BELT.x0, 0, BELT.z0, BELT.x1, 0, BELT.z1, B.Dark);
  f.fill(BELT.x0 - 1, 0, BELT.z0, BELT.x0 - 1, 1, BELT.z1, B.Metal);
  f.fill(BELT.x1 + 1, 0, BELT.z0, BELT.x1 + 1, 1, BELT.z1, B.Metal);
  f.fill(BELT.x0 - 1, 1, SEC_Z, BELT.x1 + 1, 1, SEC_Z, B.Air);
  f.set(BELT.x0 - 1, 1, SEC_Z, B.Metal);
  f.set(BELT.x1 + 1, 1, SEC_Z, B.Metal);
  // The sorting machine: a big angry yellow box with teeth.
  f.fill(SORTER.x0, 0, SORTER.z0, SORTER.x1, 5, SORTER.z1, B.Yellow);
  f.fill(SORTER.x0, 3, SORTER.z0, SORTER.x1, 3, SORTER.z1, B.Dark);
  f.fill(BELT.x0, 1, SORTER.z0, BELT.x1, 2, SORTER.z0 + 1, B.Air);
  f.fill(SORTER.x0 + 1, 6, SORTER.z0 + 1, SORTER.x1 - 1, 6, SORTER.z1 - 1, B.Metal);
  // Baggage carts and stacked crates in both baggage rooms.
  for (let i = 0; i < 14; i++) {
    const west = i < 7;
    const bx = west ? 46 + Math.floor(rng() * 25) : 175 + Math.floor(rng() * 80);
    const bz = 50 + Math.floor(rng() * 14);
    f.fill(bx, 0, bz, bx + 3, 0, bz + 1, B.Metal);
    f.fill(bx, 1, bz, bx + 3, 1 + Math.floor(rng() * 2), bz + 1, rng() < 0.5 ? B.Plank : B.WallBlue);
  }
  // Carousel feeder belts in the east room (they end at the wall above each carousel chute).
  for (const c of CAROUSELS) f.fill(c.x - 1, 0, SEC_Z + 1, c.x, 0, SEC_Z + 10, B.Dark);

  // Post-security hall: stairs up to the concourse.
  f.fill(STAIRS.x0, 6, SEC_Z + 1, STAIRS.x1, 7, STAIRS.z0 + 13, B.Air);
  for (let k = 0; k < 8; k++) {
    const sz = STAIRS.z0 + k * 2;
    f.fill(STAIRS.x0, 0, sz, STAIRS.x1, k, sz + 1, k === 7 ? B.RoofBlue : B.Concrete);
  }
  f.fill(STAIRS.x0 - 1, 0, STAIRS.z0, STAIRS.x0 - 1, 1, STAIRS.z0 + 15, B.Metal); // banister
  f.fill(STAIRS.x0 - 1, 8, SEC_Z + 1, STAIRS.x0 - 1, 9, STAIRS.z0 + 13, B.Glass);
  f.fill(STAIRS.x1 + 1, 8, SEC_Z + 1, STAIRS.x1 + 1, 9, STAIRS.z0 + 13, B.Glass);
  // TSA office.
  const o = TSA_OFFICE;
  f.fill(o.x0, 0, o.z0 - 1, o.x1 + 1, 5, o.z0 - 1, B.Concrete);
  f.fill(o.x1 + 1, 0, o.z0, o.x1 + 1, 5, o.z1, B.Concrete);
  f.fill(o.doorX, 0, o.z0 - 1, o.doorX + 1, 2, o.z0 - 1, B.Air);
  f.fill(o.x0 + 1, 0, o.z1 - 2, o.x0 + 5, 1, o.z1 - 1, B.WallBlue); // confiscated bin
  f.fill(o.x0 + 8, 0, o.z0 + 3, o.x0 + 10, 1, o.z0 + 4, B.Plank); // desk
  // Benches in the post-security hall.
  for (const bz of [48, 50]) f.fill(118, 0, bz, 130, 0, bz, B.Plank);

  // ---- Landside hall: check-in counters, kiosks, TSA queue, baggage claim.
  for (let x = 50; x <= 112; x++) {
    if (x === 79 || x === 82) continue;
    const scale = x === BELT.x0 || x === BELT.x1;
    f.fill(x, 0, 36, x, scale ? 0 : 1, 37, x % 6 === 0 ? B.RoofBlue : B.White);
  }
  f.fill(50, 5, 37, 112, 6, 37, B.RoofBlue); // counter header
  for (let x = 50; x <= 112; x += 9) f.fill(x, 2, 37, x, 4, 37, B.Metal);
  // Small belts behind the counters feeding the big belt.
  f.fill(50, 0, 39, 78, 0, 39, B.Dark);
  f.fill(83, 0, 39, 112, 0, 39, B.Dark);
  // Kiosks.
  for (const kx of [56, 64, 72]) {
    f.fill(kx, 0, 27, kx + 1, 1, 27, B.Metal);
    f.set(kx, 2, 27, B.Glass);
    f.set(kx + 1, 2, 27, B.Glass);
  }
  // Benches and planters.
  for (let x = 120; x <= 175; x += 11) {
    f.fill(x, 0, 22, x + 5, 0, 22, B.Plank);
    f.fill(x + 7, 0, 20, x + 8, 1, 21, B.Brick);
    f.set(x + 7, 2, 20, B.Leaves);
    f.set(x + 8, 2, 21, B.LeavesDark);
  }
  // Massage chairs (bases; the chairs are props).
  f.fill(166, 0, 28, 180, 0, 29, B.Dark);
  // Baggage carousels.
  for (const c of CAROUSELS) {
    for (let dx = -8; dx <= 8; dx++)
      for (let dz = -8; dz <= 8; dz++) {
        const r = Math.hypot(dx + 0.5, dz + 0.5);
        if (r < CAROUSEL_R.inner) f.fill(c.x + dx, 0, c.z + dz, c.x + dx, 1, c.z + dz, B.Metal);
        else if (r < CAROUSEL_R.outer) f.set(c.x + dx, 0, c.z + dz, B.Dark);
        else if (r < CAROUSEL_R.outer + 0.9) f.set(c.x + dx, 0, c.z + dz, B.Metal);
      }
    // Chute from the wall down to the carousel.
    for (let i = 0; i < 8; i++) f.fill(c.x - 1, 6 - Math.floor(i * 0.7), SEC_Z - 1 - i, c.x, 6 - Math.floor(i * 0.7), SEC_Z - 1 - i, B.Metal);
    f.fill(c.x - 1, 4, SEC_Z, c.x, 5, SEC_Z, B.Air);
  }

  // ---- Upper concourse contents.
  // Railing gaps were cut for the stairs; seal the slab around the stair hole.
  // Duty free shelves.
  const d = DUTY_FREE;
  for (let sx = d.x0 + 2; sx <= d.x1 - 2; sx += 6) f.fill(sx, UP, d.z0 + 4, sx + 1, UP + 2, d.z1 - 2, B.Plank);
  f.fill(d.x0, UP, d.z0 + 1, d.x0 + 18, UP + 1, d.z0 + 1, B.White); // perfume counter
  // Food court tables.
  for (let tx = 82; tx <= 106; tx += 6)
    for (let tz = 47; tz <= 57; tz += 5) {
      f.set(tx, UP, tz, B.Metal);
      f.fill(tx - 1, UP + 1, tz - 1, tx + 1, UP + 1, tz + 1, B.White);
    }
  f.fill(80, UP, 46, 80, UP + 2, 60, B.Brick);
  // Moving walkways: belts flush with the floor, 2-tall rails.
  const w = WALKWAY;
  f.fill(w.x0, 7, w.east.z0, w.x1, 7, w.east.z1, B.Dark);
  f.fill(w.x0, 7, w.west.z0, w.x1, 7, w.west.z1, B.Dark);
  for (const rz of [w.east.z0 - 1, w.east.z1 + 1, w.west.z0 - 1, w.west.z1 + 1]) f.fill(w.x0, UP, rz, w.x1, UP + 1, rz, B.Glass);
  f.fill(w.x0, UP, w.east.z1 + 1, w.x1, UP + 1, w.west.z0 - 1, B.Metal);
  // Gates: seating, desks, gate numbers, openings to the jet bridges.
  for (const g of GATES) {
    for (const rz of [61, 64]) f.fill(g.x - 12, UP, rz, g.x - 2, UP, rz, B.WallBlue);
    f.fill(g.x + 5, UP, 63, g.x + 8, UP + 1, 64, B.RoofBlue); // desk
    f.fill(g.x, UP, TERM.z1, g.x + 3, UP + 2, TERM.z1, B.Air);
    f.fill(g.x - 1, UP + 3, TERM.z1 - 1, g.x + 4, UP + 3, TERM.z1 - 1, B.Yellow);
  }
  // Sky lounge walls and bar.
  const l = LOUNGE;
  f.fill(l.x0 - 1, UP, l.z0, l.x0 - 1, 14, l.z1, B.WallPeach);
  f.fill(l.x0 - 1, UP, l.doorZ, l.x0 - 1, UP + 2, l.doorZ + 1, B.Air);
  f.fill(l.x0 - 1, UP + 1, l.z0 + 2, l.x0 - 1, UP + 1, l.doorZ - 2, B.Glass);
  f.fill(l.x0 + 2, UP, l.z1 - 3, l.x1 - 1, UP + 1, l.z1 - 3, B.Wood); // bar
  f.fill(l.x0 + 2, UP, l.z1 - 1, l.x1 - 1, UP + 3, l.z1 - 1, B.Glass); // bottle wall
  for (let lx = l.x0 + 3; lx <= l.x1 - 2; lx += 4) f.fill(lx, UP, l.z0 + 3, lx + 1, UP, l.z0 + 4, B.RedPaint); // armchairs
}

function buildBridges(f: Frame) {
  for (const g of GATES) {
    const x0 = g.x - 1, x1 = g.x + 4;
    // Deck, walls with windows, roof.
    f.fill(g.x, 7, TERM.z1 + 1, g.x + 3, 7, BRIDGE_END, B.Plank);
    for (let z = TERM.z1 + 1; z <= BRIDGE_END; z++) {
      f.fill(x0, 8, z, x0, 10, z, z % 3 === 0 ? B.Metal : B.Glass);
      f.fill(x1, 8, z, x1, 10, z, z % 3 === 0 ? B.Metal : B.Glass);
      f.set(x0, 8, z, B.Metal);
      f.set(x1, 8, z, B.Metal);
    }
    f.fill(x0, 11, TERM.z1 + 1, x1, 11, BRIDGE_END, B.Metal);
    // Support leg and wheel bogie.
    f.fill(g.x + 1, 0, BRIDGE_END - 4, g.x + 2, 6, BRIDGE_END - 4, B.Metal);
    f.fill(g.x, 0, BRIDGE_END - 5, g.x + 3, 0, BRIDGE_END - 3, B.Dark);
  }
}

function buildTower(f: Frame) {
  const t = TOWER;
  f.fill(t.x0, 0, t.z0, t.x1, t.cabY - 1, t.z1, B.Concrete);
  for (let y = 4; y < t.cabY; y += 5) f.fill(t.x0, y, t.z0, t.x1, y, t.z1, B.White);
  // Hollow base room with a door facing the terminal.
  f.fill(t.x0 + 1, 0, t.z0 + 1, t.x1 - 1, 3, t.z1 - 1, B.Air);
  f.fill(t.x0 + 3, 0, t.z0, t.x0 + 4, 2, t.z0, B.Air);
  // The cab: a flared glass box.
  const cx0 = t.x0 - 4, cx1 = t.x1 + 4, cz0 = t.z0 - 4, cz1 = t.z1 + 4, cy = t.cabY;
  f.fill(cx0, cy, cz0, cx1, cy, cz1, B.Concrete);
  for (let y = cy + 1; y <= cy + 4; y++)
    for (let x = cx0; x <= cx1; x++)
      for (let z = cz0; z <= cz1; z++) {
        const edge = x === cx0 || x === cx1 || z === cz0 || z === cz1;
        if (edge) f.set(x, y, z, y === cy + 1 ? B.Metal : B.Glass);
      }
  f.fill(cx0 - 1, cy + 5, cz0 - 1, cx1 + 1, cy + 5, cz1 + 1, B.Dark);
  f.fill(t.x0 + 2, cy + 1, t.z0 + 1, t.x1 - 2, cy + 1, t.z0 + 2, B.Dark); // radar console
}

function buildHangar(f: Frame) {
  const h = HANGAR;
  f.fill(h.x0, -1, h.z0, h.x1, -1, h.z1, B.Concrete);
  for (let y = 0; y <= 13; y++) {
    for (let x = h.x0; x <= h.x1; x++) {
      f.set(x, y, h.z0, B.Metal);
      if (y >= 11) f.set(x, y, h.z1, B.RedPaint);
    }
    for (let z = h.z0; z <= h.z1; z++) {
      f.set(h.x0, y, z, z % 5 === 0 ? B.Dark : B.Metal);
      f.set(h.x1, y, z, z % 5 === 0 ? B.Dark : B.Metal);
    }
  }
  // Curved roof.
  const w = h.x1 - h.x0;
  for (let x = h.x0; x <= h.x1; x++) {
    const t = (x - h.x0) / w - 0.5;
    const y = 14 + Math.round(5 * (1 - 4 * t * t));
    f.fill(x, 14, h.z0, x, y, h.z0, B.Metal);
    f.fill(x, 14, h.z1, x, y, h.z1, B.RedPaint);
    f.fill(x, y, h.z0, x, y, h.z1, B.Metal);
  }
  // Back door to the fenced walkway.
  f.fill(FENCE_GAP.x0, 0, h.z0, FENCE_GAP.x1, 2, h.z0, B.Air);
  // Skydive desk and lost-and-found shelf.
  f.fill(h.x0 + 3, 0, h.z0 + 5, h.x0 + 10, 1, h.z0 + 6, B.Plank);
  f.fill(h.x1 - 8, 0, h.z0 + 1, h.x1 - 2, 3, h.z0 + 2, B.Wood);
  f.fill(h.x1 - 7, 1, h.z0 + 2, h.x1 - 3, 1, h.z0 + 2, B.Air);
  f.fill(h.x1 - 7, 3, h.z0 + 2, h.x1 - 3, 3, h.z0 + 2, B.Air);
  // Oil stains, toolboxes.
  f.fill(h.x0 + 2, 0, h.z1 - 12, h.x0 + 3, 1, h.z1 - 10, B.RedPaint);
}
