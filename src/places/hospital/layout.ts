import * as THREE from 'three';
import { B, type VoxelWorld } from '../../voxel';
import type { Rng } from '../../util';

/**
 * City General Hospital: a 64 x 48 block, four floors and a roof helipad.
 *
 * Local coordinates: lx 0..63 along x, lz 0..47 along z, ly up from the ground floor's
 * walking surface. The main entrance is on the -z side (lz = 0). Each floor is 7 tall:
 * floor f's walking surface is at ly = 7f, its ceiling slab at ly = 7f + 6.
 *
 *  F1 (ground)  Lobby, waiting room, cafeteria (public) | badge door | ER, trauma room,
 *               laundry, morgue, staff lounge
 *  F2           Patient ward: six rooms, nurses' station
 *  F3           Surgery: pre-op, OR 1, OR 2, anesthesia storage
 *  F4           Radiology: X-ray, MRI control, MRI, doctors' lounge, laundry chute hatch
 *  Roof         Helipad with the air ambulance
 *
 * Every floor shares a core on the north side: a switchback stairwell (lx 1..7),
 * the elevator shaft (lx 10..13) and the laundry chute (lx 16..17).
 */

export const HOSP_W = 64;
export const HOSP_D = 48;
export const FLOOR_H = 7;
export const FLOORS = 4;
export const ROOF = FLOORS * FLOOR_H; // roof walking surface (local ly)
export const FLOOR_NAMES = ['1 · Lobby & ER', '2 · Patient Ward', '3 · Surgery', '4 · Radiology', 'Roof · Helipad'];

export interface Box3 {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface HospitalInfo {
  origin: THREE.Vector3;
  /** World y of floor f's walking surface (f = 4 is the roof). */
  floorY: (f: number) => number;
  /** Which floor a world y is on (0..4). */
  floorAt: (y: number) => number;
  /** Local -> world (block corner). */
  P: (lx: number, ly: number, lz: number) => THREE.Vector3;
  /** Local -> world, centred on the block in x and z. */
  C: (lx: number, ly: number, lz: number) => THREE.Vector3;
  /** Local box (inclusive block coords) -> world box. */
  box: (lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number) => Box3;
  zones: {
    building: Box3;
    lobby: Box3;
    cafeteria: Box3;
    stairwell: Box3;
    shaft: Box3;
    chute: Box3;
    preop: Box3;
    or1: Box3;
    or2: Box3;
    mri: Box3;
    ward: Box3;
    rotor: Box3;
  };
  /** NPC wander areas, for the map's `areas` (ground floor only; upper floors use posted people). */
  areas: Record<string, Box3>;
  /** Patient beds on the ward: where the patient lies, plus their monitor and IV stand. */
  beds: { at: THREE.Vector3; facing: number; monitor: THREE.Vector3; iv: THREE.Vector3; room: number }[];
  /** Spot in the lobby just outside the badge door, where security throws people. */
  lobbyDrop: THREE.Vector3;
  /** The front door, outside. */
  entrance: THREE.Vector3;
}

const T = {
  tile: B.White,
  wall: B.WallMint,
  ext: B.White,
  trim: B.WallBlue,
  slab: B.Concrete,
  glass: B.Glass,
};

export function buildHospital(w: VoxelWorld, origin: { x: number; y: number; z: number }, _rng?: Rng): HospitalInfo {
  const ox = Math.floor(origin.x), oy = Math.floor(origin.y), oz = Math.floor(origin.z);
  const set = (lx: number, ly: number, lz: number, b: number) => w.set(ox + lx, oy + ly, oz + lz, b);
  const fill = (lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number, b: number) =>
    w.fill(ox + lx0, oy + ly0, oz + lz0, ox + lx1, oy + ly1, oz + lz1, b);
  const air = (lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number) => fill(lx0, ly0, lz0, lx1, ly1, lz1, B.Air);
  const Y = (f: number) => f * FLOOR_H;

  // Clear the lot (and the space above it) first.
  air(0, 0, -3, HOSP_W - 1, ROOF + 12, HOSP_D - 1);

  // Floors and the shell.
  for (let f = 0; f <= FLOORS; f++) fill(0, Y(f) - 1, 0, HOSP_W - 1, Y(f) - 1, HOSP_D - 1, f === FLOORS ? T.slab : T.tile);
  for (let f = 0; f < FLOORS; f++) {
    for (let ly = Y(f); ly < Y(f) + 6; ly++)
      for (let lx = 0; lx < HOSP_W; lx++)
        for (let lz = 0; lz < HOSP_D; lz++) {
          const edgeX = lx === 0 || lx === HOSP_W - 1;
          const edgeZ = lz === 0 || lz === HOSP_D - 1;
          if (!edgeX && !edgeZ) continue;
          const corner = edgeX && edgeZ;
          const along = edgeX ? lz : lx;
          const win = !corner && (ly - Y(f) === 2 || ly - Y(f) === 3) && along % 4 !== 0 && along > 1 && along < (edgeX ? HOSP_D : HOSP_W) - 2;
          set(lx, ly, lz, corner ? T.trim : win ? T.glass : ly - Y(f) === 5 ? T.trim : T.ext);
        }
  }
  // Roof parapet.
  for (let lx = 0; lx < HOSP_W; lx++) for (const lz of [0, HOSP_D - 1]) set(lx, ROOF, lz, T.trim);
  for (let lz = 0; lz < HOSP_D; lz++) for (const lx of [0, HOSP_W - 1]) set(lx, ROOF, lz, T.trim);

  // Shared interior walls on every floor: rooms | wall lz 28 | corridor lz 29..34 | wall lz 35 | core.
  const wallX = (f: number, lz: number, lx0: number, lx1: number, b: number = T.wall) => fill(lx0, Y(f), lz, lx1, Y(f) + 5, lz, b);
  const wallZ = (f: number, lx: number, lz0: number, lz1: number, b: number = T.wall) => fill(lx, Y(f), lz0, lx, Y(f) + 5, lz1, b);
  const door = (f: number, lx0: number, lz0: number, lx1: number, lz1: number, h = 4) => air(lx0, Y(f), lz0, lx1, Y(f) + h - 1, lz1);
  for (let f = 0; f < FLOORS; f++) {
    wallX(f, 35, 1, 62);
    door(f, 1, 35, 7, 35, 5); // stairwell
    door(f, 11, 35, 12, 35); // elevator (closed by a sliding door prop)
    // Corridor stripe.
    fill(1, Y(f) - 1, 31, 62, Y(f) - 1, 32, f === 0 ? B.WallBlue : B.WallMint);
  }

  // ---------- Core: stairwell ----------
  // Lanes: A = lx 1..3 (going up toward +z), B = lx 5..7 (coming back toward -z), divider lx 4.
  for (let f = 0; f < FLOORS; f++) {
    const y = Y(f);
    // Remove the slab above (the next floor's floor) except its landing.
    air(1, y + 6, 39, 7, y + 6, 46);
    set(5, y + 6, 39, T.tile), set(6, y + 6, 39, T.tile), set(7, y + 6, 39, T.tile);
    for (let k = 1; k <= 4; k++) fill(1, y + k - 1, 38 + k, 3, y + k - 1, 38 + k, B.Concrete); // lane A
    fill(1, y + 3, 43, 7, y + 3, 46, B.Concrete); // mid landing
    fill(5, y + 4, 42, 7, y + 4, 42, B.Concrete); // lane B
    fill(5, y + 5, 41, 7, y + 5, 41, B.Concrete);
    fill(5, y + 6, 40, 7, y + 6, 40, B.Concrete);
    fill(4, y, 39, 4, y + 6, 42, B.Metal); // divider / railing
  }
  wallZ(0, 8, 36, 46), wallZ(1, 8, 36, 46), wallZ(2, 8, 36, 46), wallZ(3, 8, 36, 46);
  // Rooftop bulkhead over the stairwell.
  fill(0, ROOF, 35, 8, ROOF + 5, 35, T.ext);
  fill(8, ROOF, 35, 8, ROOF + 5, 47, T.ext);
  fill(0, ROOF, 35, 0, ROOF + 5, 47, T.ext);
  fill(0, ROOF, 47, 8, ROOF + 5, 47, T.ext);
  fill(0, ROOF + 6, 35, 8, ROOF + 6, 47, T.trim);
  air(1, ROOF, 35, 3, ROOF + 3, 35);

  // ---------- Core: elevator shaft ----------
  for (let f = 0; f < FLOORS; f++) {
    wallZ(f, 9, 36, 40, B.Metal);
    wallZ(f, 14, 36, 40, B.Metal);
    wallX(f, 40, 9, 14, B.Metal);
  }
  for (let f = 1; f <= FLOORS; f++) air(10, Y(f) - 1, 36, 13, Y(f) - 1, 39);
  fill(9, ROOF, 35, 14, ROOF + 4, 40, B.Concrete); // machine room
  air(10, ROOF, 36, 13, ROOF + 3, 39);
  fill(10, -1, 36, 13, -1, 39, B.Dark); // pit floor

  // ---------- Core: laundry chute (F4 hatch -> F1 laundry) ----------
  for (let f = 0; f < FLOORS; f++) {
    wallZ(f, 15, 36, 39, B.Metal);
    wallZ(f, 18, 36, 39, B.Metal);
    wallX(f, 36, 15, 18, B.Metal);
    wallX(f, 39, 15, 18, B.Metal);
  }
  for (let f = 1; f < FLOORS; f++) air(16, Y(f) - 1, 37, 17, Y(f) - 1, 38);
  air(16, Y(3) + 1, 36, 17, Y(3) + 2, 36); // the hatch (a flap prop covers it)
  air(16, 0, 39, 17, 3, 39); // bottom opens into the laundry room
  fill(16, -1, 37, 17, -1, 38, B.Dark);

  // ================= F1: lobby, cafeteria, ER =================
  {
    const f = 0;
    // Front entrance and canopy.
    air(28, 0, 0, 35, 3, 0);
    fill(26, 5, -3, 37, 5, -1, T.trim);
    fill(26, 6, -3, 37, 6, -3, T.ext);
    // Red cross on the facade above the door.
    fill(31, 8, 0, 32, 12, 0, B.RedPaint);
    fill(29, 9, 0, 34, 11, 0, B.RedPaint);
    // Welcome mat and floor pattern.
    fill(28, -1, 1, 35, -1, 3, B.Dark);
    for (let lx = 2; lx < 62; lx += 4) for (let lz = 2; lz < 18; lz += 4) set(lx, -1, lz, B.WallBlue);
    // Reception desk.
    fill(25, 0, 12, 38, 1, 13, T.trim);
    fill(25, 1, 12, 38, 1, 13, B.White);
    // Waiting room chairs.
    for (const lz of [5, 9]) {
      fill(3, 0, lz, 19, 0, lz, B.WallBlue);
      fill(3, 0, lz + 1, 19, 1, lz + 1, B.WallBlue);
    }
    // Cafeteria: half wall and tables.
    wallZ(f, 43, 1, 8, T.wall);
    fill(43, 3, 1, 43, 5, 8, B.Glass);
    for (const [tx, tz] of [[47, 4], [53, 4], [59, 4], [47, 9], [53, 9], [59, 9]]) {
      set(tx, 0, tz, B.Metal);
      fill(tx - 1, 1, tz - 1, tx + 1, 1, tz + 1, B.Plank);
    }
    fill(48, 0, 15, 62, 1, 16, B.RedPaint); // serving counter
    fill(48, 1, 15, 62, 1, 16, B.Metal);
    // Staff wall with the badge door.
    wallX(f, 19, 1, 62);
    door(f, 30, 19, 33, 19);
    fill(29, 4, 19, 34, 5, 19, B.RedPaint); // "STAFF ONLY" stripe
    // ER bays: curtain rails are props; floor stripes mark each bay.
    for (let lx = 2; lx < 40; lx += 8) fill(lx, -1, 21, lx + 5, -1, 26, B.WallMint);
    // Trauma room.
    wallZ(f, 43, 20, 27);
    door(f, 43, 22, 43, 25);
    fill(44, -1, 20, 62, -1, 27, B.WallBlue);
    // North block: laundry (19..22), morgue (24..40), staff lounge (42..62).
    wallZ(f, 23, 36, 46);
    wallZ(f, 41, 36, 46);
    door(f, 20, 35, 21, 35);
    door(f, 31, 35, 32, 35);
    door(f, 50, 35, 51, 35);
    fill(24, -1, 36, 40, -1, 46, B.Concrete);
    fill(24, 0, 46, 40, 5, 46, B.Metal); // morgue drawer wall
    fill(53, 0, 44, 61, 1, 45, B.Plank); // lounge counter
  }

  // ================= F2: patient ward =================
  const beds: HospitalInfo['beds'] = [];
  {
    const f = 1, y = Y(f);
    wallX(f, 28, 1, 62);
    const rooms = [
      [1, 10],
      [12, 20],
      [22, 30],
      [32, 40],
      [42, 50],
      [52, 62],
    ];
    rooms.forEach(([a, b], i) => {
      if (i > 0) wallZ(f, a - 1, 1, 27);
      const mid = Math.floor((a + b) / 2);
      door(f, mid, 28, mid + 1, 28);
      // Two beds per room against the windows. Bed props are added at runtime.
      for (const lx of [a + 1, b - 3]) {
        if (lx + 2 > b) continue;
        beds.push({
          at: new THREE.Vector3(ox + lx + 1.5, oy + y + 0.85, oz + 4.5),
          facing: 0,
          monitor: new THREE.Vector3(ox + lx + 3.3, oy + y, oz + 2.6),
          iv: new THREE.Vector3(ox + lx - 0.2, oy + y, oz + 3.5),
          room: i,
        });
      }
      fill(a, y - 1, 1, b, y - 1, 27, i % 2 ? B.WallBlue : B.White);
    });
    // Nurses' station.
    fill(26, y, 33, 37, y + 1, 34, T.trim);
    fill(26, y + 1, 33, 37, y + 1, 34, B.White);
    // North block: closed, except the rec room.
    door(f, 40, 35, 43, 35);
    fill(55, y, 45, 60, y + 2, 46, B.Dark); // TV
  }

  // ================= F3: surgery =================
  {
    const f = 2, y = Y(f);
    wallX(f, 28, 1, 62);
    wallZ(f, 21, 1, 27);
    wallZ(f, 42, 1, 27);
    door(f, 10, 28, 12, 28);
    door(f, 31, 28, 32, 28);
    door(f, 52, 28, 53, 28);
    fill(22, y - 1, 1, 41, y - 1, 27, B.WallMint);
    fill(43, y - 1, 1, 62, y - 1, 27, B.WallMint);
    for (const cx of [31, 52]) fill(cx - 4, y - 1, 10, cx + 4, y - 1, 18, B.White);
    // OR windows into the corridor.
    fill(24, y + 2, 28, 28, y + 3, 28, B.Glass);
    fill(45, y + 2, 28, 49, y + 3, 28, B.Glass);
    // Anesthesia storage.
    wallZ(f, 20, 36, 46);
    wallZ(f, 31, 36, 46);
    door(f, 24, 35, 25, 35);
    fill(21, y - 1, 36, 30, y - 1, 46, B.Concrete);
  }

  // ================= F4: radiology =================
  {
    const f = 3, y = Y(f);
    wallX(f, 28, 1, 62);
    wallZ(f, 13, 1, 27);
    wallZ(f, 23, 1, 27);
    wallZ(f, 45, 1, 27);
    door(f, 6, 28, 7, 28);
    door(f, 17, 28, 18, 28);
    door(f, 33, 28, 35, 28);
    door(f, 53, 28, 54, 28);
    fill(23, y + 2, 8, 23, y + 3, 18, B.Glass); // control room window
    fill(24, y - 1, 1, 44, y - 1, 27, B.White);
    // Yellow "magnet zone" ring around the MRI.
    for (let lx = 26; lx <= 42; lx++) set(lx, y - 1, 5, B.Yellow), set(lx, y - 1, 25, B.Yellow);
    for (let lz = 5; lz <= 25; lz++) set(26, y - 1, lz, B.Yellow), set(42, y - 1, lz, B.Yellow);
    fill(15, y, 10, 21, y + 1, 11, T.trim); // control desk
  }

  // ================= Roof: helipad =================
  {
    const y = ROOF - 1;
    const cx = 40, cz = 20;
    for (let lx = cx - 10; lx <= cx + 10; lx++)
      for (let lz = cz - 10; lz <= cz + 10; lz++) {
        const d = Math.hypot(lx - cx, lz - cz);
        if (d > 9.5 && d < 10.6) set(lx, y, lz, B.Yellow);
      }
    // The H.
    fill(cx - 3, y, cz - 4, cx - 2, y, cz + 4, B.White);
    fill(cx + 2, y, cz - 4, cx + 3, y, cz + 4, B.White);
    fill(cx - 1, y, cz - 1, cx + 1, y, cz, B.White);
    // AC units.
    fill(52, ROOF, 38, 56, ROOF + 2, 43, B.Metal);
    fill(20, ROOF, 40, 23, ROOF + 1, 44, B.Metal);
  }

  // ---------- Info ----------
  const P = (lx: number, ly: number, lz: number) => new THREE.Vector3(ox + lx, oy + ly, oz + lz);
  const C = (lx: number, ly: number, lz: number) => new THREE.Vector3(ox + lx + 0.5, oy + ly, oz + lz + 0.5);
  const box = (lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number): Box3 => ({
    min: new THREE.Vector3(ox + lx0, oy + ly0, oz + lz0),
    max: new THREE.Vector3(ox + lx1 + 1, oy + ly1 + 1, oz + lz1 + 1),
  });
  return {
    origin: new THREE.Vector3(ox, oy, oz),
    floorY: (f) => oy + f * FLOOR_H,
    floorAt: (wy) => Math.max(0, Math.min(FLOORS, Math.floor((wy - oy + 0.5) / FLOOR_H))),
    P,
    C,
    box,
    zones: {
      building: box(1, -1, 1, 62, ROOF + 6, 46),
      lobby: box(1, -1, 1, 62, 5, 18),
      cafeteria: box(44, -1, 1, 62, 5, 18),
      stairwell: box(1, 0, 36, 7, ROOF + 5, 46),
      shaft: box(10, 1, 36, 13, ROOF + 3, 39),
      chute: box(16, 8, 37, 17, ROOF - 2, 38),
      preop: box(1, Y(2) - 1, 1, 20, Y(2) + 5, 27),
      or1: box(22, Y(2) - 1, 1, 41, Y(2) + 5, 27),
      or2: box(43, Y(2) - 1, 1, 62, Y(2) + 5, 27),
      mri: box(24, Y(3) - 1, 1, 44, Y(3) + 5, 27),
      ward: box(1, Y(1) - 1, 1, 62, Y(1) + 5, 46),
      rotor: box(34, ROOF + 2.4, 14, 46, ROOF + 4.4, 26),
    },
    areas: {
      hospitalLobby: box(3, 0, 2, 40, 0, 10),
      hospitalCafeteria: box(45, 0, 2, 61, 0, 12),
    },
    beds,
    lobbyDrop: C(31, 0, 16),
    entrance: C(31, 0, -2),
  };
}
