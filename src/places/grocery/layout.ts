import { B, type VoxelWorld } from '../../voxel';
import type { Frame } from '../types';

/**
 * Smallville Grocery, in local coordinates (see Frame). The lot is W x D voxels.
 * z = 0 is the street edge, the parking lot climbs from z = 0 to z = LOT_TOP, and the
 * store sits on a raised pad behind it with its floor surface at y = F.
 */
export const W = 80;
export const D = 104;
/** Floor surface height of the store (the lot climbs up to it). */
export const F = 6;
export const LOT_TOP = 44;
/** Inside of the outer walls. */
export const IN = { x0: 3, x1: 76, z0: 47, z1: 100 };
export const CEIL = F + 10;
/** Back wall of the sales floor (staff doors are cut into it). */
export const BACK_WALL_Z = 91;

/** Parking lot surface height at local z (continuous, for carts). */
export const lotY = (z: number) => (z <= 0 ? 0 : z >= LOT_TOP ? F : (F * z) / LOT_TOP);

/** Shelf units: x of each unit's first column (units are 2 wide), running z SHELF_Z0..SHELF_Z1. */
export const SHELF_X = [24, 30, 36, 42, 48, 54, 60];
export const SHELF_Z0 = 60;
export const SHELF_Z1 = 86;
export const SHELF_H = 5;
/** Aisle n (1-based) runs between unit n-1 and unit n: x from SHELF_X[n-1]+2 to SHELF_X[n]-1. */
export const aisleX = (n: number) => SHELF_X[n - 1] + 4; // center of the aisle
export const AISLES = [
  { n: 1, name: 'Cereal · Bread', colors: [0xe8b030, 0xd8443a, 0x3a6fd8, 0xf2e2b0] },
  { n: 2, name: 'Canned Goods · Soup', colors: [0xc8302a, 0xe0e0e0, 0x3a9a4a, 0xe0a020] },
  { n: 3, name: 'Dairy · Eggs', colors: [0xf4f4f4, 0x6ab0f0, 0xf2d060, 0xf0a0c0] },
  { n: 4, name: 'Condiments · Hot Sauce', colors: [0xd82a1a, 0xf0c020, 0x7a3a1a, 0x2a8a3a] },
  { n: 5, name: 'Snacks · Nuts', colors: [0xf07a2a, 0x8a4ad8, 0xe0302a, 0xd8b45a] },
  { n: 6, name: 'Cleaning · Laundry', colors: [0x2ab0e0, 0xf0f0f0, 0xf07ab0, 0x40c070] },
];

/** Gameplay spots (local, feet height unless noted). */
export const SPOT = {
  doorX0: 37,
  doorX1: 42,
  entrance: { x: 39.5, z: 42 },
  cansBase: { x: 7, z: 52 },
  serviceDesk: { x: 69, z: 52.5 },
  payphone: { x: 46, z: 44.6 },
  basketStack: { x: 33.5, z: 48.5 },
  disguiseRack: { x: 58, z: 56.5 },
  sampleTable: { x: 47, z: 50 },
  melons: { x: 14, z: 61.5 },
  bananas: { x: 13, z: 66 },
  misters: { x0: 3, x1: 5, z0: 63, z1: 77 },
  puddle: { x: 7.5, z: 70 },
  gummyBin: { x0: 8, x1: 11, z0: 84, z1: 87 },
  bulkBins: { z0: 83, z1: 88 },
  hotSauce: { x: 46, z: 58.6 },
  peanuts: { x: 51.5, z: 87.6 },
  pickles: { x: 56.25, z: 66 },
  detergent: { x: 56.25, z: 76 },
  selfCheckout: [52, 55, 58, 61].map((x) => ({ x, z: 52 })),
  lobsterTank: { x: 68, z: 61 },
  seafoodBell: { x: 64.8, z: 63.5 },
  ticket: { x: 64.6, z: 67 },
  deliCounterX: 65,
  deli: { x0: 66, x1: 76, z0: 68, z1: 80 },
  slicer: { x: 72.5, z: 74 },
  rotisserie: { x: 72.5, z: 85 },
  staffDoorStock: { x0: 30, x1: 33 },
  staffDoorMeat: { x0: 66, x1: 68 },
  forklift: { x: 20, z: 94 },
  topShelf: { x: 20, z: 96.2 },
  freezer: { x0: 70, x1: 75, z0: 95, z1: 99 },
  freezerDoor: { x: 69, z: 97 },
  corral: { x: 66, z: 39 },
};

/** The six hot sauces, mildest first. */
export const SAUCES = [
  { name: "Mild Mike's", color: 0xf0c020 },
  { name: 'Tangy Tina', color: 0xf08a20 },
  { name: 'Habanero Hank', color: 0xe05a1a },
  { name: 'Reaper Ray', color: 0xc82a1a },
  { name: 'Ghost of Grandma', color: 0x8a1a2a },
  { name: 'Liquid Regret', color: 0x2a0a0a },
];

/** Fill the voxels of the store and its parking lot. */
export function buildVoxels(world: VoxelWorld, f: Frame) {
  const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: number) => f.fill(world, x0, y0, z0, x1, y1, z1, b);
  const set = (x: number, y: number, z: number, b: number) => f.set(world, x, y, z, b);

  // Clear the lot above ground.
  fill(0, 0, 0, W - 1, CEIL + 8, D - 1, B.Air);

  // ---- Parking lot: climbs from street level to the store pad.
  for (let z = 0; z < LOT_TOP; z++) {
    const top = Math.floor(lotY(z + 0.5));
    for (let x = 0; x < W; x++) {
      if (top > 0) fill(x, 0, z, x, top - 1, z, B.Concrete);
      // Surface: asphalt, with yellow parking lines every 6 blocks in two rows.
      const row = (z >= 8 && z <= 16) || (z >= 26 && z <= 34);
      const line = row && x % 6 === 0 && x > 2 && x < W - 3;
      const curbSide = x < 2 || x >= W - 2;
      set(x, top - 1, z, curbSide ? B.Grass : line ? B.Yellow : B.Asphalt);
    }
  }
  // Grass strips and retaining walls on both sides of the lot.
  for (let z = 0; z < LOT_TOP; z++) {
    const top = Math.floor(lotY(z + 0.5));
    for (const x of [0, W - 1]) fill(x, 0, z, x, top, z, B.Brick);
  }

  // ---- Store pad.
  fill(0, 0, LOT_TOP, W - 1, F - 1, D - 1, B.Concrete);
  // Front sidewalk.
  fill(0, F - 1, LOT_TOP, W - 1, F - 1, 46, B.Sidewalk);

  // ---- Shell: two-thick walls, brick outside, white inside.
  const X0 = 1, X1 = W - 2, Z0 = 46, Z1 = D - 2;
  for (let y = F; y < CEIL; y++) {
    for (let x = X0; x <= X1; x++) {
      set(x, y, Z0, B.Brick);
      set(x, y, Z1, B.Brick);
    }
    for (let z = Z0; z <= Z1; z++) {
      set(X0, y, z, B.Brick);
      set(X1, y, z, B.Brick);
      set(X0 + 1, y, z, B.White);
      set(X1 - 1, y, z, B.White);
    }
    for (let x = X0 + 1; x <= X1 - 1; x++) set(x, y, Z1 - 1, B.White);
  }
  // A mint stripe at waist height inside.
  for (let x = X0 + 2; x <= X1 - 2; x++) set(x, F + 1, Z1 - 1, B.WallMint);
  for (let z = Z0 + 1; z <= Z1 - 1; z++) {
    set(X0 + 1, F + 1, z, B.WallMint);
    set(X1 - 1, F + 1, z, B.WallMint);
  }
  // Roof with a parapet.
  fill(X0, CEIL, Z0, X1, CEIL, Z1, B.Concrete);
  for (let x = X0; x <= X1; x++) {
    set(x, CEIL + 1, Z0, B.White);
    set(x, CEIL + 1, Z1, B.White);
  }
  for (let z = Z0; z <= Z1; z++) {
    set(X0, CEIL + 1, z, B.White);
    set(X1, CEIL + 1, z, B.White);
  }
  // HVAC boxes on the roof.
  fill(14, CEIL + 1, 70, 18, CEIL + 2, 74, B.Metal);
  fill(56, CEIL + 1, 80, 61, CEIL + 2, 84, B.Metal);

  // Front: storefront windows and the automatic door opening.
  for (let x = 4; x <= W - 5; x++) {
    if (x >= SPOT.doorX0 && x <= SPOT.doorX1) continue;
    if (x % 9 === 3) continue; // pillars
    fill(x, F + 1, Z0, x, F + 5, Z0, B.Glass);
  }
  fill(SPOT.doorX0, F, Z0, SPOT.doorX1, F + 4, Z0, B.Air);
  // Red awning band over the windows.
  fill(X0, F + 7, Z0 - 1, X1, F + 7, Z0 - 1, B.RedPaint);

  // ---- Floor: checkerboard linoleum.
  for (let z = Z0 + 1; z <= Z1 - 1; z++)
    for (let x = X0 + 1; x <= X1 - 1; x++) set(x, F - 1, z, (x + z) % 2 ? B.White : B.Sidewalk);

  // ---- Checkout lanes (left of the doors): counters with belts.
  for (const x of [12, 18, 24, 30]) {
    fill(x, F, 50, x + 1, F, 55, B.Dark);
    fill(x + 1, F, 50, x + 1, F, 51, B.Metal); // register stand
  }
  // Self-checkout island (right of the doors).
  fill(50, F, 53, 62, F, 53, B.Dark);
  // Customer service desk.
  fill(64, F, 51, 74, F, 51, B.WallBlue);
  fill(64, F, 48, 64, F, 51, B.WallBlue);

  // ---- Shelving units (voxel cores; products are meshes).
  for (const x of SHELF_X) fill(x, F, SHELF_Z0, x + 1, F + SHELF_H - 1, SHELF_Z1, B.Metal);

  // ---- Produce tables.
  for (const [x, z] of [[12, 66], [12, 72], [12, 78], [17, 66], [17, 72], [17, 78]]) fill(x, F, z, x + 2, F, z + 3, B.Plank);
  // Wet rack along the left wall.
  fill(SPOT.misters.x0, F, SPOT.misters.z0, SPOT.misters.x1, F, SPOT.misters.z1, B.Plank);

  // ---- Bulk bins: a row of chest-high bins, the gummy bin is deep and open.
  for (let x = 4; x <= 20; x++)
    for (let z = SPOT.bulkBins.z0; z <= SPOT.bulkBins.z1; z++) {
      const inGummy = x >= SPOT.gummyBin.x0 && x <= SPOT.gummyBin.x1 && z >= SPOT.gummyBin.z0 && z <= SPOT.gummyBin.z1;
      const gummyWall = x >= SPOT.gummyBin.x0 - 1 && x <= SPOT.gummyBin.x1 + 1 && z >= SPOT.gummyBin.z0 - 1 && z <= SPOT.gummyBin.z1 + 1;
      if (inGummy) {
        fill(x, F - 4, z, x, F + 1, z, B.Air);
        set(x, F - 5, z, B.Dark);
      } else if (gummyWall) fill(x, F, z, x, F + 1, z, B.Glass);
      else if (z >= SPOT.bulkBins.z0 + 1 && z <= SPOT.bulkBins.z1 - 1 && x % 4 !== 3) set(x, F, z, B.Wood);
    }
  // Line the gummy pit.
  for (let y = F - 4; y <= F - 1; y++)
    for (let x = SPOT.gummyBin.x0 - 1; x <= SPOT.gummyBin.x1 + 1; x++)
      for (let z = SPOT.gummyBin.z0 - 1; z <= SPOT.gummyBin.z1 + 1; z++) {
        const edge = x < SPOT.gummyBin.x0 || x > SPOT.gummyBin.x1 || z < SPOT.gummyBin.z0 || z > SPOT.gummyBin.z1;
        if (edge) set(x, y, z, B.Glass);
      }

  // ---- Seafood counter and lobster tank stand.
  fill(65, F, 58, 65, F, 65, B.White);
  fill(66, F, 59, 70, F, 62, B.Metal);
  // ---- Deli counter with a gap at the far end for staff.
  fill(SPOT.deliCounterX, F, SPOT.deli.z0, SPOT.deliCounterX, F, SPOT.deli.z1, B.Metal);
  fill(SPOT.deli.x1 - 1, F, SPOT.deli.z0, SPOT.deli.x1, F, SPOT.deli.z1, B.Metal); // back counter
  // Low partition so the deli reads as a room.
  fill(66, F, SPOT.deli.z0 - 1, 76, F + 2, SPOT.deli.z0 - 1, B.WallPeach);
  fill(66, F, SPOT.deli.z1 + 1, 74, F + 2, SPOT.deli.z1 + 1, B.WallPeach);
  // ---- Rotisserie case base.
  fill(70, F, 84, 75, F, 86, B.Metal);

  // ---- Freezer cases along the back wall of the sales floor.
  for (let x = 24; x <= 62; x++) if (!(x >= SPOT.staffDoorStock.x0 && x <= SPOT.staffDoorStock.x1)) fill(x, F, 89, x, F + 4, 90, B.White);

  // ---- Back wall with two staff doorways.
  for (let x = X0 + 2; x <= X1 - 2; x++)
    for (let y = F; y < CEIL; y++) {
      const stock = x >= SPOT.staffDoorStock.x0 && x <= SPOT.staffDoorStock.x1 && y < F + 4;
      const meat = x >= SPOT.staffDoorMeat.x0 && x <= SPOT.staffDoorMeat.x1 && y < F + 4;
      set(x, y, BACK_WALL_Z, stock || meat ? B.Air : y === F + 1 ? B.WallMint : B.White);
    }

  // ---- Back room: concrete floor.
  fill(X0 + 2, F - 1, BACK_WALL_Z + 1, X1 - 2, F - 1, Z1 - 2, B.Concrete);
  // Stockroom racks: tall steel uprights with plank shelves every 2 blocks.
  for (const rz of [96, 99]) {
    for (let x = 4; x <= 52; x++) {
      const upright = x % 6 === 4;
      for (let y = F; y <= F + 8; y++) {
        if (upright) set(x, y, rz, B.Metal);
        else if ((y - F) % 3 === 2) set(x, y, rz, B.Plank);
      }
    }
  }
  // Wall between stockroom and the office.
  fill(55, F, BACK_WALL_Z + 1, 55, CEIL - 1, Z1 - 2, B.White);
  fill(55, F, 95, 55, F + 3, 96, B.Air);
  // Office desk.
  fill(58, F, 96, 61, F, 97, B.Wood);
  // Wall between office and meat room.
  fill(63, F, BACK_WALL_Z + 1, 63, CEIL - 1, Z1 - 2, B.White);
  fill(63, F, 93, 63, F + 3, 94, B.Air);
  // Butcher block.
  fill(65, F, 93, 66, F, 95, B.Wood);
  // Walk-in freezer: insulated box with a doorway on its west side.
  const fz = SPOT.freezer;
  for (let y = F; y <= F + 5; y++)
    for (let x = fz.x0 - 1; x <= fz.x1 + 1; x++)
      for (let z = fz.z0 - 1; z <= fz.z1 + 1; z++) {
        const wall = x === fz.x0 - 1 || x === fz.x1 + 1 || z === fz.z0 - 1 || z === fz.z1 + 1 || y === F + 5;
        if (wall) set(x, y, z, B.Metal);
      }
  fill(fz.x0 - 1, F, 96, fz.x0 - 1, F + 3, 97, B.Air);
  // Freezer floor is metal too.
  fill(fz.x0, F - 1, fz.z0, fz.x1, F - 1, fz.z1, B.Metal);
}

/** Floor height at a local column for NPC walking (NaN where people can't stand). */
export function localGround(x: number, z: number) {
  if (x < 0 || x >= W || z < 0 || z >= D) return NaN;
  if (z < LOT_TOP) return Math.floor(lotY(z + 0.5));
  return F;
}
