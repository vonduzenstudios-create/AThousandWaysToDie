import * as THREE from 'three';
import { DetailGrid, kitMaterial, meshGrid, rasterText, textWidth, vox, type DPaint } from '../../kit';
import { hash3 } from '../../util';
import type { Frame } from './frame';
import { FENCE_GAP, GATES, HANGAR, STAFF_DOORS, TERM, TOWER } from './layout';

/**
 * High-detail exterior skin for the airport, drawn with the building kit (8 detail voxels per block).
 * It is visual only: the voxel shell in layout.ts keeps every collider, door and interior, and the
 * skin sits a fraction of a block outside those walls, leaving holes wherever a door or jet bridge is.
 */

const D = 8; // detail cells per block

/** A detail grid placed by a design-space box (blocks, continuous). Handles the frame's z mirror. */
class Skin {
  readonly g: DetailGrid;
  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly z0: number,
    readonly x1: number,
    readonly y1: number,
    readonly z1: number,
  ) {
    this.g = new DetailGrid(Math.round((x1 - x0) * D), Math.round((y1 - y0) * D), Math.round((z1 - z0) * D));
  }

  private range(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const r = (v: number) => Math.round(v * D);
    return [
      r(Math.min(ax, bx) - this.x0),
      r(Math.min(ay, by) - this.y0),
      r(this.z1 - Math.max(az, bz)),
      r(Math.max(ax, bx) - this.x0) - 1,
      r(Math.max(ay, by) - this.y0) - 1,
      r(this.z1 - Math.min(az, bz)) - 1,
    ] as const;
  }

  /** Fill a design box (end exclusive, in blocks; eighths are exact). */
  box(ax: number, ay: number, az: number, bx: number, by: number, bz: number, p: DPaint) {
    const [i0, j0, k0, i1, j1, k1] = this.range(ax, ay, az, bx, by, bz);
    if (i1 < i0 || j1 < j0 || k1 < k0) return;
    this.g.box(i0, j0, k0, i1, j1, k1, p);
  }

  clear(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    this.box(ax, ay, az, bx, by, bz, 0);
  }

  /** One cell at a design point. */
  dot(x: number, y: number, z: number, v: number) {
    this.box(x, y, z, x + 1 / D, y + 1 / D, z + 1 / D, v);
  }

  /**
   * Text on a vertical wall. `face` is the way the wall looks: '-z' (toward the curb), '+z' (toward
   * the runway), '-x' or '+x'. (x, y) is the bottom-left corner as a viewer sees it; px is one pixel's
   * size in cells; the letters are `depth` cells thick, standing out from the plane at `plane`.
   */
  text(s: string, face: '-z' | '+z' | '-x' | '+x', u0: number, y0: number, plane: number, px: number, depth: number, v: number) {
    const c = 1 / D;
    rasterText(s, (ix, iy) => {
      const a = ix * px * c, b = iy * px * c;
      const y = y0 + b;
      const t = depth * c;
      if (face === '-z') this.box(u0 + a, y, plane - t, u0 + a + px * c, y + px * c, plane, v);
      else if (face === '+z') this.box(u0 - a - px * c, y, plane, u0 - a, y + px * c, plane + t, v);
      else if (face === '-x') this.box(plane - t, y, u0 - a - px * c, plane, y + px * c, u0 - a, v);
      else this.box(plane, y, u0 + a, plane + t, y + px * c, u0 + a + px * c, v);
    });
  }

  mesh(f: Frame) {
    const m = new THREE.Mesh(meshGrid(this.g), kitMaterial());
    m.position.copy(f.p(this.x0, this.y0, this.z1));
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = 'airport-skin';
    return m;
  }
}

const textW = (s: string, px: number) => (textWidth(s) * px) / D;

// Cell values.
const WHITE = vox(0xf1ede4, { jitter: 0.03 });
const WHITE_SHADE = vox(0xd9d5cc, { jitter: 0.03 });
const CONCRETE = vox(0xb3afa5, { jitter: 0.06 });
const CONCRETE_DARK = vox(0x9d998f, { jitter: 0.06 });
const JOINT = vox(0x6a6862, { jitter: 0.02 });
const MULLION = vox(0x9aa2ac, { jitter: 0.03 });
const STEEL = vox(0x3a3f47, { jitter: 0.04 });
const PANES = [0x2a4660, 0x2a4660, 0x2a4660, 0x335576, 0x23394f].map((col) => vox(col, { glass: true, jitter: 0.03 }));
/** Glass that varies a little pane by pane (whole panes, so greedy meshing still merges them). */
const GLASS: DPaint = (x, y, z) => PANES[Math.floor(hash3(Math.floor((x + z) / 8), Math.floor(y / 28), 11) * PANES.length)];
const BLUE = vox(0x2f5fa8, { jitter: 0.03 });
const RED = vox(0xc8302a, { jitter: 0.03 });
const YELLOW = vox(0xf2c230, { jitter: 0.03 });
const BLACK = vox(0x1e1f22, { jitter: 0.02 });
const SIGN_LIT = vox(0xfff4d6, { emissive: true, jitter: 0 });
const AMBER_LIT = vox(0xffb84a, { emissive: true, jitter: 0 });
const RED_LIT = vox(0xff3a2a, { emissive: true, jitter: 0 });
const DOWNLIGHT = vox(0xfff0c8, { emissive: true, jitter: 0 });
const HANGAR_A = vox(0xa7b0ba, { jitter: 0.04 });
const HANGAR_B = vox(0x8a939d, { jitter: 0.04 });
const HANGAR_RED = vox(0xc93a30, { jitter: 0.04 });
const HANGAR_RED_B = vox(0xa82e26, { jitter: 0.04 });

/** Hazard stripes (yellow/black diagonals) for door frames on the apron. */
const hazard: DPaint = (x, y) => (Math.floor((x + y) / 3) % 2 ? YELLOW : BLACK);

const ENTRANCES = [98, 158, 218];
const c = 1 / D;

/** Curb facade: curtain wall, fins, spandrels, entrances, canopy fascias, soffit lights. */
function landside(): Skin[] {
  const { x0, x1, z0 } = TERM; // front wall plane is design z = z0 (outside is z < z0)
  const s = new Skin(x0 - 1, 0, z0 - 1.5, x1 + 2, 16.5, z0);
  const out = [s];
  const Z = z0;
  // Curtain-wall glass, one cell proud of the voxel wall.
  s.box(x0, 0, Z - c, x1 + 1, 15, Z, GLASS);
  // Vertical mullions every block, transoms.
  for (let x = x0; x <= x1 + 1; x++) s.box(x - c, 0, Z - 2 * c, x + c, 15, Z, MULLION);
  for (const y of [0, 3.5, 10.5]) s.box(x0, y, Z - 2 * c, x1 + 1, y + 2 * c, Z, MULLION);
  // Spandrel bands at the concourse floor and the roof edge, with a shadow reveal under each.
  for (const [ya, yb] of [
    [7, 8.25],
    [13.75, 15],
  ]) {
    s.box(x0, ya, Z - 3 * c, x1 + 1, yb, Z, WHITE);
    s.box(x0, ya, Z - 4 * c, x1 + 1, ya + c, Z - 3 * c, JOINT);
  }
  // Big structural fins every 8 blocks.
  for (let x = x0; x <= x1 + 1; x += 8) {
    s.box(x - 3 * c, 0, Z - 6 * c, x + 3 * c, 15, Z, WHITE);
    s.box(x - 3 * c, 0, Z - 6 * c, x - 2 * c, 15, Z - 3 * c, WHITE_SHADE);
    s.box(x - 4 * c, 0, Z - 7 * c, x + 4 * c, 0.5, Z, CONCRETE_DARK); // plinth
  }
  // Corner piers.
  s.box(x0 - 0.5, 0, Z - 0.75, x0 + 0.75, 15, Z, WHITE);
  s.box(x1 + 0.25, 0, Z - 0.75, x1 + 1.5, 15, Z, WHITE);
  // Roof fascia (the slab overhangs to z0 - 1): blue stripe, white bands, soffit downlights.
  const F = Z - 1;
  s.box(x0 - 1, 15, F - 2 * c, x1 + 2, 16, F, WHITE);
  s.box(x0 - 1, 15.375, F - 3 * c, x1 + 2, 15.625, F - 2 * c, BLUE);
  s.box(x0 - 1, 16, F - 2 * c, x1 + 2, 16.5, F + 2 * c, MULLION); // parapet cap
  for (let x = x0 + 2; x < x1; x += 4) s.box(x, 15 - c, F + 2 * c, x + 2 * c, 15, F + 4 * c, DOWNLIGHT);

  // Entrances: steel portals with an amber header strip and the opening left clear.
  for (const ex of ENTRANCES) {
    s.clear(ex - c, 0, Z - 6, ex + 4 + c, 4, Z);
    s.box(ex - 0.375, 0, Z - 4 * c, ex, 4.375, Z, STEEL);
    s.box(ex + 4, 0, Z - 4 * c, ex + 4.375, 4.375, Z, STEEL);
    s.box(ex - 0.375, 4, Z - 4 * c, ex + 4.375, 4.375, Z, STEEL);
    s.box(ex, 4.375, Z - 2 * c, ex + 4, 4.625, Z, AMBER_LIT);
    // Door tracks on the floor and sliding leaves pushed open into the side pockets.
    s.box(ex, 0, Z - 3 * c, ex + 4, c, Z, STEEL);
    s.box(ex - 1.25, 0.125, Z - 3 * c, ex - 0.375, 4, Z - 2 * c, vox(0x5d7f9c, { glass: true }));
    s.box(ex + 4.375, 0.125, Z - 3 * c, ex + 5.25, 4, Z - 2 * c, vox(0x5d7f9c, { glass: true }));
  }

  // Canopies (voxel slab y 5..6, x ex-3..ex+7, z z0-5..z0): fascia with a lit label and downlights.
  const labels = ['DEPARTURES', 'DEPARTURES', 'ARRIVALS'];
  ENTRANCES.forEach((ex, i) => {
    const a = ex - 3, b = ex + 7, front = Z - 5;
    const s = new Skin(a - 0.5, 0, front - 0.5, b + 0.5, 6.5, Z - 0.5);
    out.push(s);
    // Front and side fascias.
    s.box(a - c, 4.75, front - 2 * c, b + c, 6.25, front, RED);
    s.box(a - 2 * c, 4.75, front, a, 6.25, Z - 6 * c, RED);
    s.box(b, 4.75, front, b + 2 * c, 6.25, Z - 6 * c, RED);
    s.box(a - c, 6.25, front - 2 * c, b + c, 6.375, Z - 6 * c, WHITE); // cap
    const label = labels[i];
    const w = textW(label, 1);
    s.text(label, '-z', (a + b) / 2 - w / 2, 5.125, front - 2 * c, 1, 1, SIGN_LIT);
    // Soffit lights.
    for (let x = a + 1; x < b - 0.5; x += 2) for (let z = front + 1; z < Z - 1; z += 2) s.box(x, 5 - c, z, x + 0.375, 5, z + 0.375, DOWNLIGHT);
    // Post cladding: round-ish steel columns with a base collar.
    for (const px of [a, b - 1]) {
      s.box(px - c, 0, front - c, px + 1 + c, 4.75, front + 1 + c, MULLION);
      s.box(px - 2 * c, 0, front - 2 * c, px + 1 + 2 * c, 0.375, front + 1 + 2 * c, MULLION);
    }
  });
  return out;
}

/** The rooftop name sign, lit at night. */
function roofSign(): Skin {
  const big = 'FUHGEDDABOUDIT';
  const small = 'INTERNATIONAL AIRPORT';
  const pxBig = 6, pxSmall = 3;
  const wBig = textW(big, pxBig), wSmall = textW(small, pxSmall);
  const cx = (TERM.x0 + TERM.x1 + 1) / 2;
  const s = new Skin(cx - wBig / 2 - 1, 16, TERM.z0 - 1, cx + wBig / 2 + 1, 24, TERM.z0 + 1.5);
  const plane = TERM.z0 - 0.25;
  // Truss frame behind the letters, with legs down to the roof.
  s.box(cx - wBig / 2 - 0.5, 16.25, plane + 0.25, cx + wBig / 2 + 0.5, 16.5, plane + 0.75, STEEL);
  s.box(cx - wBig / 2 - 0.5, 19.25, plane + 0.25, cx + wBig / 2 + 0.5, 19.5, plane + 0.75, STEEL);
  s.box(cx - wBig / 2 - 0.5, 23.5, plane + 0.25, cx + wBig / 2 + 0.5, 23.75, plane + 0.75, STEEL);
  for (let x = cx - wBig / 2; x <= cx + wBig / 2; x += 3) {
    s.box(x, 16, plane + 0.25, x + 0.25, 23.75, plane + 0.75, STEEL);
    s.box(x, 16, plane + 1, x + 0.25, 18, plane + 1.5, STEEL); // kicker brace
  }
  // Letters: a lit face on a dark return.
  const put = (t: string, px: number, y: number, w: number) => {
    s.text(t, '-z', cx - w / 2, y, plane + c, px, 1, BLACK);
    s.text(t, '-z', cx - w / 2, y, plane, px, 2, SIGN_LIT);
  };
  put(big, pxBig, 19.75, wBig);
  put(small, pxSmall, 16.75, wSmall);
  return s;
}

/** Side walls and the airside wall: precast panels with joints, glass band mullions, gate numbers. */
function sidesAndAirside(): Skin[] {
  const { x0, x1, z0, z1 } = TERM;
  const out: Skin[] = [];
  // Side walls (planes x = x0 looking -x, and x = x1 + 1 looking +x).
  for (const side of [-1, 1] as const) {
    const P = side < 0 ? x0 : x1 + 1;
    const s = new Skin(side < 0 ? P - 0.5 : P, 0, z0, side < 0 ? P : P + 0.5, 15, z1 + 1);
    const a = side < 0 ? P - 2 * c : P, b = side < 0 ? P : P + 2 * c;
    s.box(a, 0, z0 + 1, b, 15, z1 + 1, CONCRETE);
    // Glass band (voxel y 9..12) with mullions.
    s.box(a, 9, z0 + 1, b, 13, z1 + 1, GLASS);
    for (let z = z0 + 1; z <= z1 + 1; z++) s.box(side < 0 ? P - 3 * c : P, 9, z - c, side < 0 ? P : P + 3 * c, 13, z + c, MULLION);
    for (let z = z0; z <= z1 + 1; z += 6) s.box(side < 0 ? P - 4 * c : P, 0, z, side < 0 ? P : P + 4 * c, 15, z + 0.5, WHITE);
    // Panel joints.
    for (const y of [3, 6]) s.box(a, y, z0 + 1, b, y + c, z1 + 1, JOINT);
    for (let z = z0 + 3; z <= z1; z += 6) {
      s.box(a, 0, z, b, 9, z + c, JOINT);
    }
    s.box(side < 0 ? P - 4 * c : P, 8.5, z0 + 1, side < 0 ? P : P + 4 * c, 9, z1 + 1, WHITE); // sill
    s.box(side < 0 ? P - 4 * c : P, 13, z0 + 1, side < 0 ? P : P + 4 * c, 13.5, z1 + 1, WHITE); // head
    out.push(s);
  }
  // Airside wall: plane z = z1 + 1, looking +z toward the apron.
  const P = z1 + 1;
  const s = new Skin(x0, 0, P, x1 + 1, 15, P + 0.5);
  s.box(x0, 0, P, x1 + 1, 15, P + 2 * c, CONCRETE);
  for (let x = x0; x <= x1 + 1; x += 8) s.box(x - 0.25, 0, P, x + 0.25, 15, P + 4 * c, WHITE);
  s.box(x0, 9, P, x1 + 1, 13, P + 2 * c, GLASS);
  for (let x = x0; x <= x1 + 1; x++) s.box(x - c, 9, P, x + c, 13, P + 3 * c, MULLION);
  s.box(x0, 8.5, P, x1 + 1, 9, P + 4 * c, WHITE);
  s.box(x0, 13, P, x1 + 1, 13.5, P + 4 * c, WHITE);
  for (const y of [3, 6]) s.box(x0, y, P, x1 + 1, y + c, P + 2 * c, JOINT);
  for (let x = x0 + 4; x <= x1; x += 8) s.box(x, 0, P, x + c, 8.5, P + 2 * c, JOINT);
  // Kick strip along the bottom (scuffed by tugs).
  s.box(x0, 0, P, x1 + 1, 0.75, P + 3 * c, CONCRETE_DARK);
  // Jet bridge holes, with a steel collar and the gate number above.
  for (const g of GATES) {
    s.clear(g.x - 1, 7, P, g.x + 5, 12, P + 1);
    s.box(g.x - 1.375, 6.625, P, g.x - 1, 12.375, P + 4 * c, STEEL);
    s.box(g.x + 5, 6.625, P, g.x + 5.375, 12.375, P + 4 * c, STEEL);
    s.box(g.x - 1.375, 12, P, g.x + 5.375, 12.375, P + 4 * c, STEEL);
    s.box(g.x - 0.5, 12.75, P, g.x + 4.5, 14.75, P + 2 * c, BLUE);
    const w = textW(g.id, 2);
    s.text(g.id, '+z', g.x + 2 + w / 2, 13.125, P + 2 * c, 2, 1, YELLOW);
  }
  // Apron doors: clear, hazard frame, a red light over each.
  for (const d of [STAFF_DOORS.apronW, STAFF_DOORS.apronE]) {
    s.clear(d.x, 0, P, d.x + 2, 3, P + 1);
    s.box(d.x - 0.5, 0, P, d.x, 3.5, P + 3 * c, hazard);
    s.box(d.x + 2, 0, P, d.x + 2.5, 3.5, P + 3 * c, hazard);
    s.box(d.x - 0.5, 3, P, d.x + 2.5, 3.5, P + 3 * c, hazard);
    s.box(d.x + 0.75, 3.75, P, d.x + 1.25, 4.125, P + 3 * c, RED_LIT);
  }
  out.push(s);
  return out;
}

/** Roof parapet around the whole terminal, plus louvres on the rooftop units. Many small grids. */
function roof(): Skin[] {
  const { x0, x1, z0, z1 } = TERM;
  const out: Skin[] = [];
  const ax = x0 - 1, bx = x1 + 2, az = z0 - 1, bz = z1 + 2;
  // Parapet on the back and sides (the front has the fascia from landside()).
  const back = new Skin(ax - 0.25, 16, bz - 0.5, bx + 0.25, 17, bz + 0.25);
  back.box(ax, 16, bz - 0.25, bx, 16.75, bz, WHITE);
  back.box(ax - c, 16.75, bz - 0.375, bx + c, 16.875, bz + c, MULLION);
  out.push(back);
  for (const side of [-1, 1]) {
    const P = side < 0 ? ax : bx - 0.25;
    const w = new Skin(P - 0.25, 16, az, P + 0.5, 17, bz);
    w.box(P, 16, az + 1.25, P + 0.25, 16.75, bz - 0.25, WHITE);
    w.box(P - c, 16.75, az + 1.25, P + 0.25 + c, 16.875, bz - 0.25, MULLION);
    out.push(w);
  }
  // Rooftop units (voxels at rx..rx+5, y 16..18, z z0+30..z0+35): louvres and fans.
  for (let i = 0; i < 6; i++) {
    const rx = x0 + 20 + i * 38, rz = z0 + 30;
    const s = new Skin(rx - 0.25, 16, rz - 0.25, rx + 6.25, 19.25, rz + 6.25);
    for (let y = 16.25; y < 19; y += 0.375) {
      s.box(rx - c, y, rz, rx, y + c, rz + 6, JOINT);
      s.box(rx + 6, y, rz, rx + 6 + c, y + c, rz + 6, JOINT);
      s.box(rx, y, rz - c, rx + 6, y + c, rz, JOINT);
      s.box(rx, y, rz + 6, rx + 6, y + c, rz + 6 + c, JOINT);
    }
    for (const fx of [rx + 1, rx + 3.5]) {
      s.box(fx, 19, rz + 1.5, fx + 1.5, 19.125, rz + 4.5, STEEL);
      s.box(fx + 0.625, 19, rz + 2.5, fx + 0.875, 19.25, rz + 3.5, MULLION);
    }
    out.push(s);
  }
  // Skylights over the concourse.
  for (let x = x0 + 8; x < x1 - 8; x += 16) {
    const s = new Skin(x - 0.25, 16, z0 + 41.75, x + 6.25, 16.5, z0 + 46.25);
    s.box(x - c, 16, z0 + 42 - c, x + 6 + c, 16.375, z0 + 46 + c, MULLION);
    s.box(x, 16.125, z0 + 42, x + 6, 16.375, z0 + 46, vox(0x5d7f9c, { glass: true }));
    for (let gx = x + 1.5; gx < x + 6; gx += 1.5) s.box(gx - c, 16.125, z0 + 42, gx, 16.5, z0 + 46, MULLION);
    out.push(s);
  }
  return out;
}

/** Control tower: ribbed shaft, door surround, cab mullions, catwalk, roof gear. */
function tower(): Skin[] {
  const t = TOWER;
  const cx0 = t.x0 - 4, cx1 = t.x1 + 5, cz0 = t.z0 - 4, cz1 = t.z1 + 5, cy = t.cabY;
  const X0 = t.x0, X1 = t.x1 + 1, Z0 = t.z0, Z1 = t.z1 + 1;
  let s = new Skin(X0 - 1.5, 0, Z0 - 1, X1 + 1, cy, Z1 + 1);
  const shaft = s;
  // Shaft ribs (fins every block on each face) and floor bands.
  for (let u = 0; u <= X1 - X0; u++) {
    s.box(X0 + u - c, 0, Z0 - 3 * c, X0 + u + c, cy, Z0, CONCRETE);
    s.box(X0 + u - c, 0, Z1, X0 + u + c, cy, Z1 + 3 * c, CONCRETE);
  }
  for (let u = 0; u <= Z1 - Z0; u++) {
    s.box(X0 - 3 * c, 0, Z0 + u - c, X0, cy, Z0 + u + c, CONCRETE);
    s.box(X1, 0, Z0 + u - c, X1 + 3 * c, cy, Z0 + u + c, CONCRETE);
  }
  for (let y = 4; y < cy; y += 5) {
    s.box(X0 - 4 * c, y, Z0 - 4 * c, X1 + 4 * c, y + 1, Z0, WHITE);
    s.box(X0 - 4 * c, y, Z1, X1 + 4 * c, y + 1, Z1 + 4 * c, WHITE);
    s.box(X0 - 4 * c, y, Z0, X0, y + 1, Z1, WHITE);
    s.box(X1, y, Z0, X1 + 4 * c, y + 1, Z1, WHITE);
  }
  // Slit windows up the shaft (the stairwell).
  for (let y = 6; y < cy - 2; y += 5) s.box(X0 + 3.25, y, Z0 - 4 * c, X0 + 3.75, y + 2.5, Z0 - 3 * c, GLASS);
  // Door (voxel x0+3..x0+4, y 0..2 on face z0): clear and frame it, with a lit TOWER sign.
  const dx = t.x0 + 3;
  s.clear(dx, 0, Z0 - 1, dx + 2, 3, Z0);
  s.box(dx - 0.375, 0, Z0 - 4 * c, dx, 3.375, Z0, STEEL);
  s.box(dx + 2, 0, Z0 - 4 * c, dx + 2.375, 3.375, Z0, STEEL);
  s.box(dx - 0.375, 3, Z0 - 4 * c, dx + 2.375, 3.375, Z0, STEEL);
  s.box(dx - 1, 3.5, Z0 - 6 * c, dx + 3, 3.625, Z0, WHITE); // little hood
  const tw = textW('ATC', 1);
  s.text('ATC', '-z', dx + 1 - tw / 2, 3.75, Z0 - 4 * c, 1, 1, SIGN_LIT);
  s = new Skin(cx0 - 1.5, cy - 0.5, cz0 - 1.5, cx1 + 1.5, cy + 10, cz1 + 1.5);
  const cab = s;
  // Cab: mullions on the glass (voxel cab x cx0..cx1-1, z cz0..cz1-1, glass y cy+2..cy+4).
  for (let x = cx0; x <= cx1; x += 2) {
    s.box(x - c, cy + 1, cz0 - 2 * c, x + c, cy + 5, cz0, MULLION);
    s.box(x - c, cy + 1, cz1, x + c, cy + 5, cz1 + 2 * c, MULLION);
  }
  for (let z = cz0; z <= cz1; z += 2) {
    s.box(cx0 - 2 * c, cy + 1, z - c, cx0, cy + 5, z + c, MULLION);
    s.box(cx1, cy + 1, z - c, cx1 + 2 * c, cy + 5, z + c, MULLION);
  }
  // Catwalk ring with railing under the cab.
  s.box(cx0 - 1, cy - 0.25, cz0 - 1, cx1 + 1, cy, cz1 + 1, STEEL);
  s.clear(cx0, cy - 0.25, cz0, cx1, cy, cz1);
  for (const [a, b, e, f2] of [
    [cx0 - 1, cz0 - 1, cx1 + 1, cz0 - 1 + c],
    [cx0 - 1, cz1 + 1 - c, cx1 + 1, cz1 + 1],
    [cx0 - 1, cz0 - 1, cx0 - 1 + c, cz1 + 1],
    [cx1 + 1 - c, cz0 - 1, cx1 + 1, cz1 + 1],
  ])
    s.box(a, cy + 0.875, b, e, cy + 1, f2, MULLION);
  for (let x = cx0 - 1; x <= cx1 + 1; x += 1) {
    s.box(x, cy, cz0 - 1, x + c, cy + 1, cz0 - 1 + c, MULLION);
    s.box(x, cy, cz1 + 1 - c, x + c, cy + 1, cz1 + 1, MULLION);
  }
  for (let z = cz0 - 1; z <= cz1 + 1; z += 1) {
    s.box(cx0 - 1, cy, z, cx0 - 1 + c, cy + 1, z + c, MULLION);
    s.box(cx1 + 1 - c, cy, z, cx1 + 1, cy + 1, z + c, MULLION);
  }
  // Roof (voxel y cy+5, one block overhang): fascia, antenna masts with red beacons.
  s.box(cx0 - 1 - c, cy + 5, cz0 - 1 - c, cx1 + 1 + c, cy + 5.25, cz1 + 1 + c, WHITE);
  s.clear(cx0 - 1, cy + 5, cz0 - 1, cx1 + 1, cy + 5.25, cz1 + 1);
  for (const [ax, az, h] of [
    [cx0 + 1, cz0 + 1, 3.5],
    [cx1 - 1.25, cz1 - 1.25, 2.5],
  ]) {
    s.box(ax, cy + 6, az, ax + 0.25, cy + 6 + h, az + 0.25, MULLION);
    s.box(ax - c, cy + 6 + h, az - c, ax + 0.25 + c, cy + 6.25 + h, az + 0.25 + c, RED_LIT);
  }
  return [shaft, cab];
}

/** The rotating radar: a little kit model centred on its axis (the runtime spins it). */
function radarModel(): THREE.Object3D {
  const g = new DetailGrid(36, 12, 8);
  // Pedestal.
  g.box(16, 0, 2, 19, 3, 5, vox(0x6a7078));
  // Dish: a curved slat, open toward -z.
  for (let x = 0; x < 36; x++) {
    const t = (x - 17.5) / 18;
    const back = Math.round(3 * t * t);
    g.box(x, 4, 4 - back, x, 10, 5 - back, vox(0xeeeeee, { jitter: 0.03 }));
  }
  g.box(16, 4, 5, 19, 10, 6, vox(0x9aa2ac));
  const m = new THREE.Mesh(meshGrid(g), kitMaterial());
  m.position.set((-36 * c) / 2, -0.75, (-8 * c) / 2);
  m.castShadow = true;
  const holder = new THREE.Group();
  holder.add(m);
  return holder;
}

/** Hangar: corrugated siding, SKYDIVE lettering on the front, a painted header over the door. */
function hangar(): Skin[] {
  const h = HANGAR;
  const X0 = h.x0, X1 = h.x1 + 1, Z0 = h.z0, Z1 = h.z1 + 1;
  const rib = (a: number, b: number): DPaint => (x, _y, z) => ((x + z) % 4 < 2 ? a : b);
  const roofTop = (x: number) => {
    const t = (x - h.x0) / (h.x1 - h.x0) - 0.5;
    return 14 + Math.round(5 * (1 - 4 * t * t));
  };
  // Sides (x faces): vertical corrugation, a steel post every 5 blocks.
  const sides = [-1, 1].map((side) => {
    const P = side < 0 ? X0 : X1;
    const s = new Skin(side < 0 ? P - 0.5 : P, 0, Z0, side < 0 ? P : P + 0.5, 14.5, Z1);
    s.box(side < 0 ? P - 2 * c : P, 0, Z0, side < 0 ? P : P + 2 * c, 14, Z1, rib(HANGAR_A, HANGAR_B));
    for (let z = Z0; z < Z1; z += 5) s.box(side < 0 ? P - 3 * c : P, 0, z, side < 0 ? P : P + 3 * c, 14, z + 0.25, STEEL);
    s.box(side < 0 ? P - 3 * c : P, 13.75, Z0, side < 0 ? P : P + 3 * c, 14, Z1, STEEL); // eave
    return s;
  });
  // Front (faces -z toward the parking walkway), up the curved gable.
  const front = new Skin(X0 - 0.5, 0, Z0 - 0.5, X1 + 0.5, 20.5, Z0);
  front.box(X0, 0, Z0 - 2 * c, X1, 14, Z0, rib(HANGAR_A, HANGAR_B));
  front.box(X0, 0, Z0 - 3 * c, X1, 0.75, Z0, CONCRETE_DARK);
  for (let x = h.x0; x <= h.x1; x++) {
    front.box(x, 14, Z0 - 2 * c, x + 1, roofTop(x) + 1, Z0, rib(HANGAR_A, HANGAR_B));
    front.box(x, roofTop(x) + 1 - c, Z0 - 3 * c, x + 1, roofTop(x) + 1 + c, Z0, STEEL); // edge trim
  }
  front.box(X0 + 8, 7, Z0 - 3 * c, X1 - 8, 12.5, Z0 - 2 * c, WHITE);
  const sw = textW('SKYDIVE', 8);
  front.text('SKYDIVE', '-z', (X0 + X1) / 2 - sw / 2, 7.625, Z0 - 3 * c, 8, 1, RED);
  // Door to the fenced walkway: clear it and frame it.
  front.clear(FENCE_GAP.x0, 0, Z0 - 1, FENCE_GAP.x1 + 1, 3, Z0);
  front.box(FENCE_GAP.x0 - 0.375, 0, Z0 - 4 * c, FENCE_GAP.x0, 3.375, Z0, STEEL);
  front.box(FENCE_GAP.x1 + 1, 0, Z0 - 4 * c, FENCE_GAP.x1 + 1.375, 3.375, Z0, STEEL);
  front.box(FENCE_GAP.x0 - 0.375, 3, Z0 - 4 * c, FENCE_GAP.x1 + 1.375, 3.375, Z0, STEEL);
  front.box(FENCE_GAP.x0 + 1.25, 3.5, Z0 - 3 * c, FENCE_GAP.x0 + 1.75, 3.875, Z0, AMBER_LIT);
  // Runway side: red gable and header over the open door, tracks, HANGAR 1, door leaves stacked open.
  const back = new Skin(X0 - 0.5, 0, Z1, X1 + 0.5, 20.5, Z1 + 0.5);
  for (let x = h.x0; x <= h.x1; x++) {
    back.box(x, 14, Z1, x + 1, roofTop(x) + 1, Z1 + 2 * c, rib(HANGAR_RED, HANGAR_RED_B));
    back.box(x, roofTop(x) + 1 - c, Z1, x + 1, roofTop(x) + 1 + c, Z1 + 3 * c, STEEL);
  }
  back.box(X0, 11, Z1, X1, 14, Z1 + 2 * c, rib(HANGAR_RED, HANGAR_RED_B));
  back.box(X0, 10.625, Z1, X1, 11, Z1 + 4 * c, STEEL);
  back.box(X0, 0, Z1, X1, c, Z1 + 0.5, STEEL);
  const hw = textW('HANGAR 1', 4);
  back.text('HANGAR 1', '+z', (X0 + X1) / 2 + hw / 2, 11.75, Z1 + 2 * c, 4, 1, WHITE);
  for (const [a, b] of [
    [X0, X0 + 3],
    [X1 - 3, X1],
  ])
    back.box(a, c, Z1 + 0.25, b, 10.625, Z1 + 0.5, rib(HANGAR_A, HANGAR_B));
  return [...sides, front, back];
}

/** Build every skin piece and add it under `parent`. Returns the radar so the runtime can spin it. */
export function buildAirportSkin(f: Frame, parent: THREE.Object3D) {
  const group = new THREE.Group();
  group.name = 'airport-skin';
  const t0 = performance.now();
  const pieces = [...landside(), roofSign(), ...sidesAndAirside(), ...roof(), ...tower(), ...hangar()];
  let tris = 0;
  for (const p of pieces) {
    const m = p.mesh(f);
    tris += (m.geometry.index?.count ?? 0) / 3;
    group.add(m);
  }
  const radar = radarModel();
  radar.position.copy(f.p((TOWER.x0 + TOWER.x1 + 1) / 2, TOWER.cabY + 6.75, (TOWER.z0 + TOWER.z1 + 1) / 2));
  group.add(radar);
  parent.add(group);
  return {
    group,
    radar,
    stats: { ms: Math.round(performance.now() - t0), tris: Math.round(tris) },
    dispose() {
      group.removeFromParent();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    },
  };
}

