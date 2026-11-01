import * as THREE from 'three';
import { DetailGrid, DV, DPB, PAL, V, kitMaterial, meshArrays, mix, rasterText, speck, textWidth, tint, toGeometry, vox, type DPaint } from '../../kit';
import { MeshPool } from '../../kit/pool';
import type { MeshArrays } from '../../kit';
import { hash3, mulberry32, pick } from '../../util';
import { AISLES, BACK_WALL_Z, CEIL, F, SHELF_H, SHELF_X, SHELF_Z0, SHELF_Z1, SPOT, W } from './layout';

/**
 * High-detail skins for Smallville Grocery, built with the shared kit (1 cell = 1/8 block).
 *
 * The coarse store voxels stay in the VoxelWorld for collision and NPC navigation. Each detail
 * piece wraps the coarse blocks it replaces with a one-cell outset, so only the detailed
 * surface is visible. Every piece is authored in local store coordinates and added to the
 * store's frame group, so it turns with the store.
 */

/** A detail grid and the local block position of its cell (0, 0, 0). */
interface Piece {
  grid: DetailGrid;
  at: [number, number, number];
  lod?: boolean;
  /** Keep downward faces (the pool's mesher drops them). Meshed on the main thread, no LOD. */
  bottom?: boolean;
}

const O = DV; // one-cell outset
const cell = (blocks: number) => Math.round(blocks * DPB);

// ---------------------------------------------------------------- paints

const BRICK = vox(0xa4503a, { jitter: 0.14 });
const BRICK2 = vox(0x8f4433, { jitter: 0.14 });
const BRICK3 = vox(0xb35c42, { jitter: 0.14 });
const MORTAR = vox(0xcfc4b0, { jitter: 0.06 });
const STONE = vox(PAL.stone, { jitter: 0.1 });
const STONE2 = vox(tint(PAL.stone, 0.9), { jitter: 0.1 });
const TRIM = vox(PAL.trimCream, { jitter: 0.04 });
const IRON = V.iron;
const GLASS = vox(0x3b5a74, { glass: true, jitter: 0.04 });
const ALU = vox(0xb8c0c8, { jitter: 0.03 });
const WHITE = vox(0xf2efe6, { jitter: 0.03 });
const TILE_W = vox(0xf4f1ea, { jitter: 0.04 });
const MINT = vox(0x8ccfae, { jitter: 0.04 });
const GREEN = vox(0x2f8a4a, { jitter: 0.05 });
const GREEN_D = vox(0x23683a, { jitter: 0.05 });

/** Running-bond brick in the plane (u along the wall, y up). */
function brick(u: number, y: number) {
  if (y % 3 === 2) return MORTAR;
  const row = Math.floor(y / 3);
  if ((u + (row % 2) * 3) % 6 === 5) return MORTAR;
  const h = hash3(Math.floor((u + (row % 2) * 3) / 6), row, 11);
  return h < 0.2 ? BRICK2 : h > 0.85 ? BRICK3 : BRICK;
}
/** Big stone blocks for the base course. */
function stoneBlock(u: number, y: number) {
  if (y % 6 === 5 || (u + (Math.floor(y / 6) % 2) * 6) % 12 === 11) return MORTAR;
  return hash3(Math.floor(u / 12), Math.floor(y / 6), 3) < 0.5 ? STONE : STONE2;
}
/** Inside wall: tiled wainscot to 1.5 blocks with a mint band, painted above. */
function insideWall(u: number, y: number) {
  const yb = y; // cells above the floor
  if (yb < 12) return u % 8 === 0 || yb % 8 === 0 ? vox(0xd8d4c8) : TILE_W;
  if (yb < 16) return MINT;
  return WHITE;
}

// ---------------------------------------------------------------- shell

/** Storefront: brick, stone base, big windows, entrance, green striped awning, cornice, roof sign. */
function facade(): Piece {
  // Local x from 0.875 to 79.125, y from F-1, z from 44 to 47.125.
  const x0 = 1 - O, y0 = F - 1, z0 = 44;
  const sx = cell(78 + 2 * O), sy = cell(CEIL + 2 - y0) + 28, sz = cell(47 + O - z0);
  const g = new DetailGrid(sx, sy, sz);
  const X = (bx: number) => cell(bx - x0); // block x -> cell
  const Y = (by: number) => cell(by - y0);
  const Z = (bz: number) => cell(bz - z0);
  const kOut = Z(46) - 1; // outer face (outset)
  const kIn = Z(47); // inner face cell (outset)
  const top = Y(CEIL + 2) - 1;
  // Wall body.
  g.box(0, Y(F) - 8, kOut, sx - 1, top, kIn, (x, y, z) => {
    if (z === kIn) return insideWall(x, y - Y(F));
    if (y < Y(F + 1)) return stoneBlock(x, y);
    return brick(x, y);
  });
  // Pilasters between window bays (where the coarse pillars are).
  for (let bx = 3; bx < W - 3; bx += 9) {
    if (bx >= SPOT.doorX0 - 1 && bx <= SPOT.doorX1 + 1) continue;
    g.box(X(bx) - 1, Y(F), kOut - 2, X(bx + 1), Y(CEIL), kOut - 1, (x, y) => (y < Y(F + 1) ? stoneBlock(x, y) : brick(x, y)));
    g.box(X(bx) - 2, Y(CEIL) - 3, kOut - 3, X(bx + 1) + 1, Y(CEIL) - 1, kOut - 1, TRIM);
  }
  // Windows: recessed glass with aluminium mullions and a transom bar, stone sill.
  for (let bx = 4; bx <= W - 5; bx++) {
    if (bx >= SPOT.doorX0 && bx <= SPOT.doorX1) continue;
    if (bx % 9 === 3) continue;
    const xa = X(bx), xb = X(bx + 1) - 1;
    g.clear(xa, Y(F + 1), kOut, xb, Y(F + 6) - 1, kIn);
    g.box(xa, Y(F + 1), Z(46) + 3, xb, Y(F + 6) - 1, Z(46) + 3, (x, y) => {
      const lx = x - xa;
      if (y === Y(F + 1) || y === Y(F + 6) - 1 || y === Y(F + 4) + 4) return ALU;
      if ((bx % 9 === 4 && lx === 0) || (bx % 9 === 2 && lx === 7)) return ALU;
      if (bx % 3 === 0 && lx === 0) return ALU;
      // A few posters taped inside the glass.
      const poster = hash3(bx, 7, 1) < 0.18 && y > Y(F + 2) && y < Y(F + 3) + 4 && lx > 1 && lx < 7;
      if (poster) return vox(pick(mulberry32(bx), [0xf2d040, 0xe0302a, 0xf4f0f0]), { jitter: 0.02 });
      return GLASS;
    });
    // Sill.
    g.box(xa, Y(F + 1) - 2, kOut - 2, xb, Y(F + 1) - 1, kOut, TRIM);
  }
  // Entrance: opening with an aluminium frame and a flat canopy with downlights.
  const da = X(SPOT.doorX0), db = X(SPOT.doorX1 + 1) - 1;
  g.clear(da, Y(F), kOut, db, Y(F + 5) - 1, kIn);
  g.box(da - 2, Y(F), kOut, da - 1, Y(F + 5) + 1, kIn, ALU);
  g.box(db + 1, Y(F), kOut, db + 2, Y(F + 5) + 1, kIn, ALU);
  g.box(da - 2, Y(F + 5), kOut, db + 2, Y(F + 5) + 1, kIn, ALU);
  // Canopy over the doors.
  g.box(da - 12, Y(F + 5) + 2, 0, db + 12, Y(F + 5) + 4, kOut - 1, (x, y, z) => (y === Y(F + 5) + 4 && z > 1 ? GREEN : z === 0 || y === Y(F + 5) + 2 ? ALU : WHITE));
  for (let x = da - 8; x <= db + 8; x += 8) g.set(x, Y(F + 5) + 1, 6, V.warmBulb);
  // Support posts for the canopy.
  for (const x of [da - 11, db + 11]) g.box(x, Y(F), 1, x + 1, Y(F + 5) + 1, 2, ALU);
  // "WELCOME" over the doors.
  const welcome = 'WELCOME';
  const ww = textWidth(welcome);
  const wx = Math.floor((da + db) / 2 - ww / 2);
  rasterText(welcome, (px, py) => g.set(wx + ww - 1 - px, Y(F + 5) + 6 + py, kOut - 1, vox(0xffffff, { emissive: true, jitter: 0 })));
  // Green and white striped awning over each window bay (not the door).
  const awTop = Y(F + 7) + 2;
  for (let z = 0; z <= kOut - 1; z++) {
    const y = awTop - Math.floor((kOut - 1 - z) / 2);
    g.box(X(3), y, z, X(W - 3) - 1, y, z, (x) => {
      if (x >= da - 13 && x <= db + 13) return 0;
      return Math.floor(x / 6) % 2 ? GREEN : WHITE;
    });
    if (z === 0) g.box(X(3), y - 3, 0, X(W - 3) - 1, y, 0, (x) => (x >= da - 13 && x <= db + 13 ? 0 : Math.floor(x / 6) % 2 ? GREEN_D : WHITE));
  }
  // Cornice and parapet coping.
  g.box(0, Y(CEIL) - 2, kOut - 4, sx - 1, Y(CEIL) + 1, kOut - 1, (_x, y) => (y === Y(CEIL) - 2 ? vox(tint(PAL.trimCream, 0.85)) : TRIM));
  for (let x = 2; x < sx - 2; x += 6) g.box(x, Y(CEIL) - 5, kOut - 2, x + 1, Y(CEIL) - 3, kOut - 1, TRIM); // dentils
  g.box(0, top - 1, kOut - 2, sx - 1, top, kIn, TRIM);
  // Roof sign: big lit letters on an iron frame above the parapet.
  const text = 'SMALLVILLE GROCERY';
  const s = 4;
  const tw = textWidth(text) * s;
  const tx = Math.floor(sx / 2 - tw / 2);
  const ty = top + 3;
  const red = vox(0xe8402e, { emissive: true, jitter: 0 });
  const kSign = kOut + 2;
  rasterText(text, (px, py) => {
    const x = tx + tw - s - px * s;
    g.box(x, ty + py * s, kSign, x + s - 1, ty + py * s + s - 1, kSign + 1, red);
  });
  // Frame and legs.
  g.box(tx - 4, ty - 2, kSign + 3, tx + tw + 3, ty - 1, kSign + 3, IRON);
  for (let x = tx - 4; x <= tx + tw + 3; x += 24) g.box(x, top + 1, kSign + 3, x + 1, ty + 5 * s, kSign + 4, IRON);
  return { grid: g, at: [x0, y0, z0], lod: true };
}

/** A side wall (left = local x 1..2, right = 77..78), with pilasters and downspouts. */
function sideWall(right: boolean): Piece {
  const z0 = 47 + O, z1 = 103 + O;
  const y0 = F - 1;
  const xIn = right ? W - 3 : 3; // inside face block coordinate
  const x0 = right ? W - 3 - O : 0.5;
  const sx = cell(right ? W - 0.5 - x0 : 3 + O - x0);
  const sy = cell(CEIL + 2 - y0), sz = cell(z1 - z0);
  const g = new DetailGrid(sx, sy, sz);
  const X = (bx: number) => cell(bx - x0);
  const Y = (by: number) => cell(by - y0);
  const iOut = right ? X(W - 1) : X(1) - 1; // outer face (outset)
  const iIn = right ? X(xIn) - 1 : X(xIn); // inner face cell (outset)
  const lo = Math.min(iOut, iIn), hi = Math.max(iOut, iIn);
  g.box(lo, Y(F) - 8, 0, hi, sy - 1, sz - 1, (x, y, z) => {
    if (x === iIn) return insideWall(z, y - Y(F));
    if (y < Y(F + 1)) return stoneBlock(z, y);
    return brick(z, y);
  });
  const outDir = right ? 1 : -1;
  for (let z = 4; z < sz - 4; z += 64) {
    // Pilaster.
    g.box(iOut + outDir, Y(F), z, iOut + outDir * 2, Y(CEIL), z + 9, (_x, y, zz) => (y < Y(F + 1) ? stoneBlock(zz, y) : brick(zz, y)));
    // Downspout.
    g.box(iOut + outDir, Y(F), z + 20, iOut + outDir, sy - 3, z + 21, vox(0x7a8088));
  }
  // Cornice and coping.
  g.box(iOut + outDir * 3, Y(CEIL) - 2, 0, iOut, Y(CEIL) + 1, sz - 1, TRIM);
  g.box(lo, sy - 2, 0, hi, sy - 1, sz - 1, TRIM);
  // Painted wall ad on the left side, a fire exit door on the right.
  if (!right) {
    const msg = 'FRESH DAILY';
    const s = 3;
    const w = textWidth(msg) * s;
    const zc = Math.floor(sz / 2 - w / 2);
    g.box(iOut, Y(F + 5), zc - 6, iOut, Y(F + 5) + 5 * s + 8, zc + w + 5, vox(0xf2ece0, { jitter: 0.12 }));
    rasterText(msg, (px, py) => g.box(iOut, Y(F + 5) + 4 + py * s, zc + px * s, iOut, Y(F + 5) + 4 + py * s + s - 1, zc + px * s + s - 1, vox(0x2f8a4a, { jitter: 0.1 })));
  } else {
    const zc = cell(96 - z0);
    g.box(iOut, Y(F), zc, iOut, Y(F + 3), zc + 15, vox(0x8a2a2a, { jitter: 0.04 }));
    g.box(iOut, Y(F + 3) + 1, zc - 1, iOut, Y(F + 3) + 2, zc + 16, IRON);
    g.set(iOut + outDir, Y(F + 3) + 4, zc + 7, vox(0x40ff60, { emissive: true }));
  }
  return { grid: g, at: [x0, y0, z0], lod: true };
}

/** The back wall, with a loading dock and roll-up door. */
function backWall(): Piece {
  const x0 = 3 + O, x1 = W - 3 - O, z0 = 101 - O, y0 = F - 1;
  const sx = cell(x1 - x0), sy = cell(CEIL + 2 - y0), sz = cell(103.75 - z0);
  const g = new DetailGrid(sx, sy, sz);
  const Y = (by: number) => cell(by - y0);
  const kIn = 0, kOut = cell(103 - z0);
  g.box(0, Y(F) - 8, kIn, sx - 1, sy - 1, kOut, (x, y, z) => (z === kIn ? insideWall(x, y - Y(F)) : y < Y(F + 1) ? stoneBlock(sx - x, y) : brick(sx - x, y)));
  g.box(0, sy - 2, kIn, sx - 1, sy - 1, kOut + 1, TRIM);
  // Roll-up door and dock bumpers outside.
  const dx = cell(40 - x0);
  g.box(dx, Y(F) - 8, kOut, dx + 47, Y(F + 4), kOut, (_x, y) => (y % 3 === 0 ? vox(0x8a9096) : vox(0xa8b0b8)));
  g.box(dx - 2, Y(F + 4) + 1, kOut, dx + 49, Y(F + 4) + 2, kOut + 4, IRON);
  for (const x of [dx - 3, dx + 48]) g.box(x, Y(F) - 6, kOut + 1, x + 1, Y(F) - 2, kOut + 2, vox(0x1a1a1a));
  return { grid: g, at: [x0, y0, z0], lod: true };
}

/** The wall between the sales floor and the back room, with framed staff doorways. */
function partition(): Piece {
  const x0 = 3 + O, x1 = W - 3 - O, z0 = BACK_WALL_Z - O, y0 = F;
  const sx = cell(x1 - x0), sy = cell(CEIL - y0), sz = cell(1 + 2 * O);
  const g = new DetailGrid(sx, sy, sz);
  g.box(0, 0, 0, sx - 1, sy - 1, sz - 1, (x, y) => insideWall(x, y));
  for (const d of [SPOT.staffDoorStock, SPOT.staffDoorMeat]) {
    const a = cell(d.x0 - x0), b = cell(d.x1 + 1 - x0) - 1;
    g.clear(a, 0, 0, b, cell(4) - 1, sz - 1);
    g.box(a - 2, 0, 0, a - 1, cell(4) + 1, sz - 1, vox(0x6a7078));
    g.box(b + 1, 0, 0, b + 2, cell(4) + 1, sz - 1, vox(0x6a7078));
    g.box(a - 2, cell(4), 0, b + 2, cell(4) + 1, sz - 1, vox(0x6a7078));
  }
  return { grid: g, at: [x0, y0, z0] };
}

/** Drop ceiling: 2x2 block tiles with lit panels. */
function ceiling(): Piece {
  const x0 = 3, z0 = 47, x1 = W - 3, z1 = 101;
  const sx = cell(x1 - x0), sz = cell(z1 - z0);
  const g = new DetailGrid(sx, 1, sz);
  const lit = vox(0xfffbea, { emissive: true, jitter: 0 });
  g.box(0, 0, 0, sx - 1, 0, sz - 1, (x, _y, z) => {
    const bx = x0 + x / DPB, bz = z0 + z / DPB;
    // Light panels (the same spots as the point lights' grid).
    for (let lx = 6; lx <= 74; lx += 8)
      for (let lz = 50; lz <= 88; lz += 6) if (Math.abs(bx - lx) < 1.5 && Math.abs(bz - lz) < 0.4) return lit;
    if (bz > BACK_WALL_Z && Math.abs(bz - 96) < 0.3 && (bx - 6) % 12 < 3) return lit;
    // Faintly self-lit: the underside only gets the hemisphere's ground color otherwise, which
    // reads as brown. A dim base color keeps the glow well under the bloom threshold.
    if (x % 16 === 0 || z % 16 === 0) return vox(0x6c6a64, { jitter: 0.02, emissive: true });
    return vox(0x8e8c86, { jitter: 0.04, emissive: true });
  });
  return { grid: g, at: [x0, CEIL - DV, z0], bottom: true };
}

/** Floor overlay: vinyl tiles on the sales floor, sealed concrete in the back. */
function floor(): Piece {
  const x0 = 3, z0 = 47, x1 = W - 3, z1 = 101;
  const sx = cell(x1 - x0), sz = cell(z1 - z0);
  const g = new DetailGrid(sx, 1, sz);
  const gp = SPOT.gummyBin;
  const fz = SPOT.freezer;
  g.box(0, 0, 0, sx - 1, 0, sz - 1, (x, _y, z) => {
    const bx = x0 + x / DPB, bz = z0 + z / DPB;
    if (bx >= gp.x0 && bx < gp.x1 + 1 && bz >= gp.z0 && bz < gp.z1 + 1) return 0;
    if (bz >= BACK_WALL_Z && bz < BACK_WALL_Z + 1) return 0;
    if (bz > BACK_WALL_Z) {
      if (bx >= fz.x0 && bx < fz.x1 + 1 && bz >= fz.z0 && bz < fz.z1 + 1) return (x + z) % 4 === 0 ? vox(0xb0b8c0) : vox(0x8d949c, { glass: true, jitter: 0.03 });
      // Yellow safety lane around the forklift.
      if ((Math.abs(bx - 14) < 0.15 || Math.abs(bx - 26) < 0.15) && bz < 95.5) return vox(0xf2c230, { jitter: 0.04 });
      return vox(0x9a968c, { jitter: 0.1 });
    }
    // 1-block tiles with thin grout, a darker border strip along the aisles' front.
    if (x % 8 === 0 || z % 8 === 0) return vox(0xb8b2a4, { jitter: 0.02 });
    const tx = Math.floor(bx), tz = Math.floor(bz);
    if (bz > 57 && bz < 59) return vox(0x2f8a4a, { jitter: 0.04 });
    return (tx + tz) % 2 ? vox(0xf2eee4, { jitter: 0.05 }) : vox(0xd8d2c4, { jitter: 0.05 });
  });
  return { grid: g, at: [x0, F - DV + 0.02, z0] };
}

// ---------------------------------------------------------------- fixtures

/** One shelving unit wrapped around its coarse 2 x 5 x 27 core, stocked on both faces. */
/** Cells the shelf detail sticks out past the coarse shelf blocks on each aisle side. */
export const SHELF_OUT = 6;

function shelfUnit(ui: number): Piece {
  const bx = SHELF_X[ui];
  // Products hang out past the coarse block (SHELF_OUT cells each side), so nothing shares a
  // plane with the coarse faces, which stay hidden inside.
  const P = SHELF_OUT;
  const x0 = bx - P * DV, y0 = F, z0 = SHELF_Z0 - O;
  const sx = cell(2) + 2 * P, sy = cell(SHELF_H + O), sz = cell(SHELF_Z1 + 1 - SHELF_Z0 + 2 * O);
  const g = new DetailGrid(sx, sy, sz);
  const rng = mulberry32(900 + ui * 31);
  const back = vox(0x9aa3ad, { jitter: 0.04 });
  const deck = vox(0xdcdfe2, { jitter: 0.03 });
  // Core and pegboard back.
  g.box(P - 1, 0, 1, sx - P, sy - 1, sz - 2, back);
  const decks = [0, 10, 20, 30];
  for (const side of [0, 1]) {
    const aisle = AISLES[side === 0 ? ui - 1 : ui];
    const faceX = side === 0 ? 0 : sx - 1;
    const inward = side === 0 ? 1 : -1;
    // Kick plate.
    g.box(faceX, 0, 0, faceX + inward, 1, sz - 1, vox(0x3a3f45));
    if (!aisle) {
      g.box(faceX, 0, 0, faceX + inward * (P - 1), sy - 1, sz - 1, back);
      continue;
    }
    for (let li = 0; li < decks.length; li++) {
      const dy = decks[li] + 2;
      // Shelf lip with a price strip and yellow tags.
      g.box(faceX, dy - 1, 0, faceX + inward * 6, dy - 1, sz - 1, deck);
      g.box(faceX, dy - 2, 0, faceX, dy - 2, sz - 1, (_x, _y, z) => (z % 12 === 3 ? vox(0xf2d040, { jitter: 0 }) : vox(0xf4f4f0, { jitter: 0 })));
      // Products between this deck and the next.
      const ceilY = li + 1 < decks.length ? decks[li + 1] + 1 : sy - 3;
      let z = 1;
      while (z < sz - 2) {
        const kind = rng();
        const w = kind < 0.35 ? 3 + Math.floor(rng() * 2) : kind < 0.6 ? 2 : kind < 0.85 ? 4 + Math.floor(rng() * 2) : 3;
        const h = Math.min(ceilY - dy - 1, kind < 0.35 ? 7 + Math.floor(rng() * 2) : kind < 0.6 ? 8 : kind < 0.85 ? 5 : 4);
        const col = pick(rng, aisle.colors);
        const band = mix(col, 0xffffff, 0.6);
        const depth = 5;
        const facings = 1 + Math.floor(rng() * 3);
        for (let f = 0; f < facings && z < sz - 2; f++) {
          const zz1 = Math.min(z + w - 1, sz - 3);
          g.box(faceX + inward, dy, z, faceX + inward * depth, dy + h - 1, zz1, (x, y, zc) => {
            const front = x === faceX + inward;
            // Bottles: narrow neck; cans: rounded top corners.
            if (kind >= 0.35 && kind < 0.6 && y > dy + h - 3 && zc !== z) return 0;
            if (front && y === dy + Math.floor(h / 2)) return vox(band, { jitter: 0.02 });
            if (front && kind < 0.35 && y === dy + h - 2 && zc === z + 1) return vox(0xffffff, { jitter: 0 });
            return vox(tint(col, front ? 1 : 0.8), { jitter: 0.06 });
          });
          z = zz1 + 1;
        }
        z += rng() < 0.15 ? 2 : 0;
      }
    }
  }
  // Top cap, end caps with promo panels.
  g.box(0, sy - 2, 0, sx - 1, sy - 1, sz - 1, vox(0xe8eaec, { jitter: 0.02 }));
  for (const zEnd of [0, sz - 1]) {
    g.box(0, 0, zEnd, sx - 1, sy - 1, zEnd, vox(0xdcdfe2, { jitter: 0.02 }));
    g.box(2, cell(2), zEnd, sx - 3, cell(3.5), zEnd, vox([0xe0302a, 0xf2d040, 0x2f8a4a, 0x2a6ab0][ui % 4], { jitter: 0.03 }));
  }
  return { grid: g, at: [x0, y0, z0] };
}

/** Glass-door freezer run along the back of the sales floor (x from a to b inclusive). */
function freezerRun(a: number, b: number): Piece {
  const x0 = a - O, y0 = F, z0 = 89 - O;
  const sx = cell(b + 1 - a + 2 * O), sy = cell(5 + O), sz = cell(BACK_WALL_Z - O - z0);
  const g = new DetailGrid(sx, sy, sz);
  const body = vox(0xf2f2ee, { jitter: 0.03 });
  g.box(0, 0, 0, sx - 1, sy - 1, sz - 1, body);
  // Base grille and a lit header.
  g.box(0, 0, 0, sx - 1, 3, 0, (x) => (x % 2 ? vox(0x2a2a2e) : vox(0x4a4a4e)));
  g.box(0, sy - 6, 0, sx - 1, sy - 2, 0, vox(0x2a6ab0, { jitter: 0.03 }));
  g.box(0, sy - 7, 0, sx - 1, sy - 7, 0, vox(0xeaf6ff, { emissive: true, jitter: 0 }));
  const rng = mulberry32(a * 7);
  for (let x = 1; x < sx - 1; x += 16) {
    // Door frame, glass with products behind it, handle.
    g.box(x, 4, 0, x + 14, sy - 9, 0, ALU);
    g.box(x + 1, 5, 0, x + 13, sy - 10, 0, (xx, y) => {
      const shelf = (y - 5) % 9 === 0;
      if (shelf) return vox(0x8aa0b0, { glass: true, jitter: 0.02 });
      const item = hash3(Math.floor(xx / 3), Math.floor((y - 5) / 9), a) < 0.75 && (y - 5) % 9 < 6;
      if (item) return vox(mix(pick(rng, [0x3a6fd8, 0xe0302a, 0xf2c230, 0xffffff, 0x6b4330, 0x3aa65a]), 0x9ad0f0, 0.45), { glass: true, jitter: 0.08 });
      return vox(0x6a90b0, { glass: true, jitter: 0.03 });
    });
    g.box(x + 12, 14, 0, x + 12, 24, 0, vox(0x30343a));
  }
  return { grid: g, at: [x0, y0, z0] };
}

/** A checkout counter over its coarse 2 x 1 x 6 block, with belt, scanner and register. */
function checkout(x: number): Piece {
  const x0 = x - O, y0 = F, z0 = 50 - O;
  const sx = cell(2 + 2 * O), sy = cell(2.6), sz = cell(6 + 2 * O);
  const g = new DetailGrid(sx, sy, sz);
  g.box(0, 0, 0, sx - 1, 8, sz - 1, (_x, y) => (y < 2 ? vox(0x2a2a2e) : vox(0x2f8a4a, { jitter: 0.04 })));
  g.box(0, 9, 0, sx - 1, 9, sz - 1, vox(0xe8e4dc, { jitter: 0.02 }));
  g.box(1, 9, 14, 9, 9, sz - 2, (_x, _y, z) => (z % 3 === 0 ? vox(0x2a2a2e) : vox(0x1a1a1c))); // belt
  g.box(2, 9, 8, 7, 9, 11, vox(0x6ab0e0, { glass: true })); // scanner glass
  // Register and screen on a post.
  g.box(10, 10, 2, 16, 13, 7, vox(0x30343a));
  g.box(12, 14, 4, 13, 18, 5, vox(0x30343a));
  g.box(11, 19, 3, 15, 22, 4, vox(0x4ac0f0, { emissive: true, jitter: 0 }));
  // Lane light.
  g.box(14, 10, 1, 14, sy - 3, 1, ALU);
  g.box(13, sy - 2, 0, 15, sy - 1, 2, vox(0x40ff70, { emissive: true, jitter: 0 }));
  return { grid: g, at: [x0, y0, z0] };
}

/** Rooftop clutter: AC units, vents and skylights. */
function roofUnits(): Piece {
  const x0 = 3, z0 = 48, y0 = CEIL + 1;
  const sx = cell(W - 6), sz = cell(52), sy = cell(3);
  const g = new DetailGrid(sx, sy, sz);
  const rng = mulberry32(5150);
  // Gravel layer.
  g.box(0, 0, 0, sx - 1, 0, sz - 1, speck(3, [vox(PAL.gravel, { jitter: 0.15 }), vox(tint(PAL.gravel, 0.85), { jitter: 0.15 })]));
  for (let i = 0; i < 14; i++) {
    const bx = 8 + Math.floor(rng() * (sx - 60)), bz = 8 + Math.floor(rng() * (sz - 50));
    const k = rng();
    if (k < 0.45) {
      g.box(bx, 1, bz, bx + 24, 14, bz + 18, V.metal);
      g.box(bx + 3, 15, bz + 3, bx + 21, 15, bz + 15, (x, _y, z) => ((x + z) % 2 ? V.iron : V.metal));
    } else if (k < 0.7) {
      g.box(bx, 1, bz, bx + 2, 10, bz + 2, vox(0x6f757d));
      g.box(bx - 1, 11, bz - 1, bx + 3, 11, bz + 3, vox(0x6f757d));
    } else {
      g.box(bx, 1, bz, bx + 30, 2, bz + 22, TRIM);
      g.box(bx + 1, 3, bz + 1, bx + 29, 3, bz + 21, vox(0x9ad0f0, { glass: true }));
    }
  }
  return { grid: g, at: [x0, y0 - 0.98, z0] };
}

/** Tall pylon sign by the street. Local position of its base center. */
export const PYLON = { x: 6, z: 3 };
function pylon(): Piece {
  const sx = cell(5), sy = cell(12), sz = cell(1.5);
  const g = new DetailGrid(sx, sy, sz);
  const cx = Math.floor(sx / 2);
  g.box(cx - 3, 0, 4, cx + 3, sy - 1, 7, vox(0x5a6068));
  // Board with lit lettering on both faces.
  const by0 = cell(7), by1 = sy - 1;
  g.box(0, by0, 1, sx - 1, by1, sz - 2, vox(0x2f8a4a, { jitter: 0.03 }));
  g.box(0, by0, 1, sx - 1, by0 + 1, sz - 2, ALU);
  g.box(0, by1 - 1, 1, sx - 1, by1, sz - 2, ALU);
  const lines = ['SMALLVILLE', 'GROCERY'];
  lines.forEach((t, i) => {
    const s = 1;
    const w = textWidth(t) * s;
    const tx = Math.floor(sx / 2 - w / 2);
    const ty = by1 - 8 - i * 8 - 5;
    rasterText(t, (px, py) => {
      g.set(sx - 1 - (tx + px), ty + py, 0, vox(0xffffff, { emissive: true, jitter: 0 }));
      g.set(tx + px, ty + py, sz - 1, vox(0xffffff, { emissive: true, jitter: 0 }));
    });
  });
  g.box(4, by0 + 3, 0, sx - 5, by0 + 9, 0, vox(0xf2d040, { emissive: true, jitter: 0 }));
  g.box(4, by0 + 3, sz - 1, sx - 5, by0 + 9, sz - 1, vox(0xf2d040, { emissive: true, jitter: 0 }));
  const msg = 'OPEN 7-10';
  const mw = textWidth(msg);
  rasterText(msg, (px, py) => {
    g.set(sx - 1 - (Math.floor(sx / 2 - mw / 2) + px), by0 + 4 + py, 0, vox(0x1a1a1a, { jitter: 0 }));
    g.set(Math.floor(sx / 2 - mw / 2) + px, by0 + 4 + py, sz - 1, vox(0x1a1a1a, { jitter: 0 }));
  });
  return { grid: g, at: [PYLON.x - 2.5, 0, PYLON.z - 0.75], lod: true };
}

// ---------------------------------------------------------------- assembly

/** Every detail piece of the store, in local coordinates. */
export function groceryPieces(): Piece[] {
  const pieces: Piece[] = [facade(), sideWall(false), sideWall(true), backWall(), partition(), ceiling(), floor(), roofUnits(), pylon()];
  SHELF_X.forEach((_x, i) => pieces.push(shelfUnit(i)));
  pieces.push(freezerRun(24, SPOT.staffDoorStock.x0 - 1), freezerRun(SPOT.staffDoorStock.x1 + 1, 62));
  for (const x of [12, 18, 24, 30]) pieces.push(checkout(x));
  return pieces;
}

let pool: MeshPool | null = null;

/**
 * Mesh all detail pieces (in workers) and add them to `parent` at their local positions.
 * Resolves when every piece is in.
 */
export async function addGroceryDetail(parent: THREE.Object3D, opts: { shadows?: boolean; sync?: boolean } = {}) {
  pool ??= new MeshPool();
  const shadows = opts.shadows ?? true;
  const pieces = groceryPieces();
  const root = new THREE.Group();
  root.name = 'grocery-detail';
  parent.add(root);
  await Promise.all(
    pieces.map(async (p) => {
      const levels = p.bottom ? [meshArrays(p.grid)] : await pool!.mesh(p.grid, [0, 0, 0], !!p.lod, opts.sync);
      root.add(toObject(levels, p, shadows));
    }),
  );
  return root;
}

function toObject(levels: MeshArrays[], p: Piece, shadows: boolean): THREE.Object3D {
  const sizes = [DV, DV * 2, DV * 4];
  const make = (m: MeshArrays, i: number) => {
    const mesh = new THREE.Mesh(toGeometry(m), kitMaterial(sizes[i]));
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    return mesh;
  };
  if (levels.length === 1) {
    const m = make(levels[0], 0);
    m.position.set(...p.at);
    return m;
  }
  const lod = new THREE.LOD();
  const w = p.grid.sx * DV, d = p.grid.sz * DV;
  lod.position.set(p.at[0] + w / 2, p.at[1], p.at[2] + d / 2);
  const dists = [0, 70, 150];
  levels.forEach((lv, i) => {
    const m = make(lv, i);
    m.position.set(-w / 2, 0, -d / 2);
    lod.addLevel(m, dists[i]);
  });
  return lod;
}

export type { DPaint };
