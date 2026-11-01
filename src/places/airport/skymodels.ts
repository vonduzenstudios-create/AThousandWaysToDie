import * as THREE from 'three';
import { DetailGrid, DV, kitMaterial, meshGrid, rasterText, tint, vox } from '../../kit';
import { hash3 } from '../../util';

/**
 * Detail-voxel models for the skydive (8 voxels per block, the building kit's material):
 * Frank's jump plane with a walkable cabin, canopies, rigs, the bargain rig's laundry, and clouds.
 */

/** A DetailGrid addressed in model units (blocks) inside fixed bounds. */
class Sculpt {
  readonly g: DetailGrid;
  constructor(
    readonly min: [number, number, number],
    max: [number, number, number],
    readonly cell = DV,
  ) {
    this.g = new DetailGrid(Math.ceil((max[0] - min[0]) / cell), Math.ceil((max[1] - min[1]) / cell), Math.ceil((max[2] - min[2]) / cell));
  }
  private c(v: number, a: 0 | 1 | 2) {
    return Math.round((v - this.min[a]) / this.cell);
  }
  /** World-space centre of a cell. */
  private w(c: number, a: 0 | 1 | 2) {
    return this.min[a] + (c + 0.5) * this.cell;
  }
  /** Fill cells whose centres fall inside the box. A paint function gets model coordinates. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: number | ((x: number, y: number, z: number) => number)) {
    const p = typeof v === 'number' ? v : (cx: number, cy: number, cz: number) => v(this.w(cx, 0), this.w(cy, 1), this.w(cz, 2));
    this.g.box(this.c(Math.min(x0, x1), 0), this.c(Math.min(y0, y1), 1), this.c(Math.min(z0, z1), 2), this.c(Math.max(x0, x1), 0) - 1, this.c(Math.max(y0, y1), 1) - 1, this.c(Math.max(z0, z1), 2) - 1, p);
  }
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.box(x0, y0, z0, x1, y1, z1, 0);
  }
  /** Recolor solid cells inside the box. */
  paint(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: number | ((x: number, y: number, z: number) => number)) {
    const p = typeof v === 'number' ? v : (cx: number, cy: number, cz: number) => v(this.w(cx, 0), this.w(cy, 1), this.w(cz, 2));
    this.g.paint(this.c(Math.min(x0, x1), 0), this.c(Math.min(y0, y1), 1), this.c(Math.min(z0, z1), 2), this.c(Math.max(x0, x1), 0) - 1, this.c(Math.max(y0, y1), 1) - 1, this.c(Math.max(z0, z1), 2) - 1, p);
  }
  /** A thick straight segment (struts, gear legs). */
  rod(a: [number, number, number], b: [number, number, number], r: number, v: number) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (this.cell * 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      this.box(x - r, y - r, z - r, x + r, y + r, z + r, v);
    }
  }
  /** A filled ellipsoid; the paint gets the normalized offset from the centre too. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, v: number | ((x: number, y: number, z: number, nx: number, ny: number, nz: number) => number)) {
    this.box(cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz, (x, y, z) => {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, nz = (z - cz) / rz;
      if (nx * nx + ny * ny + nz * nz > 1) return 0;
      return typeof v === 'number' ? v : v(x, y, z, nx, ny, nz);
    });
  }
  /** Pixel text on a plane: along +u (dir 1) or -u (dir -1), up +y, at the given fixed coordinate. */
  text(str: string, plane: 'x' | 'z', at: number, u0: number, y0: number, s: number, v: number, dir = 1, depth = this.cell) {
    rasterText(str, (px, py) => {
      const u = u0 + dir * px * s * this.cell, y = y0 + py * s * this.cell;
      const ua = Math.min(u, u + dir * s * this.cell), ub = Math.max(u, u + dir * s * this.cell);
      if (plane === 'x') this.box(at - depth / 2, y, ua, at + depth / 2, y + s * this.cell, ub, v);
      else this.box(ua, y, at - depth / 2, ub, y + s * this.cell, at + depth / 2, v);
    });
  }
  mesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(
      meshGrid(this.g, { origin: [-this.min[0] / this.cell, -this.min[1] / this.cell, -this.min[2] / this.cell], size: this.cell }),
      kitMaterial(this.cell),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

const v = (c: number, jitter = 0.04) => vox(c, { jitter });
const lit = (c: number) => vox(c, { emissive: true, jitter: 0 });
const glass = (c = 0x26405a) => vox(c, { glass: true, jitter: 0.03 });

const P = {
  white: v(0xf3f1ea, 0.03),
  whiteShade: v(0xd9d6cc, 0.03),
  panel: v(0xe6e3d9, 0.03),
  olive: v(0x5f7f22),
  oliveDark: v(0x47611a),
  yellow: v(0xf2c230, 0.03),
  red: v(0xc8302a),
  redDark: v(0x9a221e),
  dark: v(0x26282d),
  black: v(0x17181b),
  metal: v(0x8e959d),
  metalDark: v(0x5f656c),
  rubber: v(0x1d1e21, 0.1),
  floorA: v(0x3a3c40, 0.06),
  floorB: v(0x2e3034, 0.06),
  wallA: v(0xb9bcc0, 0.04),
  wallB: v(0xa9adb2, 0.04),
  seat: v(0x2b4a7c, 0.06),
  seatDark: v(0x203a62, 0.06),
  gauge: lit(0xb8ffcf),
  gaugeAmber: lit(0xffc65a),
  nav: lit(0xff3a2a),
  navG: lit(0x3aff6a),
  strobe: lit(0xffffff),
  glass: glass(),
};

export const JUMP_PLANE = {
  /** Top of the cabin floor above the wheels' contact patch. */
  floorY: 1.5,
  /** Cabin interior, local (nose +x, door on the -z side). */
  cabin: { x0: -4.5, x1: 3.0, z0: -1.25, z1: 1.25, y1: 4.0 },
  /** Open door on the -z side. */
  door: { x0: -3.9, x1: -1.7, y1: 3.9 },
  /** Skin outside faces. */
  skin: { z: 1.5, y0: 1.25, y1: 4.25 },
  /** Bench seats along both walls: depth from the wall and height above the floor. */
  bench: { depth: 0.45, h: 0.5, x0: -4.3, x1: 2.6 },
  /** Prop hub. */
  prop: new THREE.Vector3(8.25, 2.65, 0),
};

export interface JumpPlaneModel {
  root: THREE.Group;
  prop: THREE.Object3D;
  /** Jump lights by the door: set .visible to switch. */
  redLight: THREE.Object3D;
  greenLight: THREE.Object3D;
}

/**
 * Freefall Frank's jump plane: a high-wing turboprop with a walk-through cabin, two bench seats,
 * a roll-up door on the left and a cockpit behind a narrow bulkhead. Nose +x, wheels at y = 0.
 */
export function jumpPlaneModel(): JumpPlaneModel {
  const s = new Sculpt([-12.4, 0, -11.9], [8.8, 7.9, 11.9]);
  const { cabin: C, door: D, skin: S, floorY: F } = JUMP_PLANE;
  const fuselageSide = (x: number, y: number) => (y < 2.0 ? P.olive : y < 2.25 ? P.yellow : x > 3.0 && y < 2.6 ? P.whiteShade : P.white);

  // ---- Fuselage barrel: cockpit + cabin, bevelled corners, painted belly and cheatline.
  s.box(-4.75, S.y0, -S.z, 5.0, S.y1, S.z, (x, y) => fuselageSide(x, y));
  for (const [y, z] of [[S.y0, -S.z], [S.y0, S.z - 0.25], [S.y1 - 0.25, -S.z], [S.y1 - 0.25, S.z - 0.25]] as const) s.clear(-4.75, y, z, 5.0, y + 0.125, z + 0.25);
  for (const [y, z] of [[S.y0, -S.z], [S.y0, S.z - 0.125], [S.y1 - 0.125, -S.z], [S.y1 - 0.125, S.z - 0.125]] as const) s.clear(-4.75, y, z, 5.0, y + 0.125, z + 0.125);
  // Panel seams every 1.5 blocks.
  for (let x = -4.5; x < 5; x += 1.5) {
    s.paint(x, S.y0 + 0.75, -S.z, x + 0.125, S.y1, -S.z + 0.125, P.whiteShade);
    s.paint(x, S.y0 + 0.75, S.z - 0.125, x + 0.125, S.y1, S.z, P.whiteShade);
  }
  // Hollow cabin and cockpit.
  s.clear(C.x0, F, C.z0, 4.75, C.y1, C.z1);
  // Floor: ribbed rubber.
  s.box(C.x0, S.y0, C.z0, 4.75, F, C.z1, (x) => (Math.floor(x * 4) % 2 ? P.floorA : P.floorB));
  // Quilted wall lining and ceiling.
  const quilt = (x: number, y: number, z: number) => ((Math.floor(x * 2) + Math.floor(y * 2) + Math.floor(z * 2)) % 2 ? P.wallA : P.wallB);
  s.box(C.x0, F, C.z0, C.x1, C.y1, C.z0 + 0.125, quilt);
  s.box(C.x0, F, C.z1 - 0.125, C.x1, C.y1, C.z1, quilt);
  s.box(C.x0, C.y1 - 0.125, C.z0, 4.75, C.y1, C.z1, quilt);
  s.box(C.x0, F, C.z0, C.x0 + 0.125, C.y1, C.z1, quilt);
  // Grab rail along the ceiling and a yellow handle by the door.
  s.box(C.x0 + 0.3, C.y1 - 0.375, -0.06, C.x1 - 0.3, C.y1 - 0.25, 0.06, P.yellow);
  for (let x = C.x0 + 0.5; x < C.x1; x += 1.5) s.box(x, C.y1 - 0.25, -0.06, x + 0.125, C.y1 - 0.125, 0.06, P.metalDark);
  s.box(D.x1 + 0.05, F + 0.6, C.z0 + 0.125, D.x1 + 0.175, D.y1 - 0.3, C.z0 + 0.25, P.yellow);
  // Benches on both walls (the left one stops short of the door).
  const bench = (x0: number, x1: number, side: -1 | 1) => {
    const zw = side < 0 ? C.z0 : C.z1;
    const zi = zw - side * JUMP_PLANE.bench.depth;
    s.box(x0, F, Math.min(zw, zi), x1, F + JUMP_PLANE.bench.h, Math.max(zw, zi), (x) => (Math.floor(x * 2) % 2 ? P.seat : P.seatDark));
    s.box(x0, F, Math.min(zi, zi + side * 0.125), x1, F + JUMP_PLANE.bench.h - 0.125, Math.max(zi, zi + side * 0.125), P.metalDark);
    // Seat belts hanging down.
    for (let x = x0 + 0.4; x < x1; x += 1.1) s.box(x, F + JUMP_PLANE.bench.h, Math.min(zw, zw - side * 0.25), x + 0.125, F + 1.3, Math.max(zw, zw - side * 0.25), P.yellow);
  };
  bench(JUMP_PLANE.bench.x0, JUMP_PLANE.bench.x1, 1);
  bench(D.x1 + 0.3, JUMP_PLANE.bench.x1, -1);
  // Fire extinguisher and a helmet rack on the aft wall.
  s.box(C.x0 + 0.125, F, 0.6, C.x0 + 0.375, F + 0.6, 0.85, P.red);
  s.box(C.x0 + 0.125, F + 0.6, 0.66, C.x0 + 0.3, F + 0.75, 0.8, P.black);
  for (const [z, c] of [[-0.7, P.red], [-0.2, P.yellow], [0.25, P.olive]] as const) {
    s.box(C.x0 + 0.125, F + 1.6, z, C.x0 + 0.25, F + 1.7, z + 0.1, P.metal);
    s.blob(C.x0 + 0.42, F + 1.55, z + 0.05, 0.2, 0.17, 0.2, (_x, _y, _z, _nx, ny) => (ny < -0.4 ? P.black : c));
  }
  // Placard by the door.
  s.box(D.x1 + 0.3, 3.0, C.z0 + 0.125, D.x1 + 1.5, 3.55, C.z0 + 0.19, P.yellow);
  s.text('NO PUSHING', 'z', C.z0 + 0.22, D.x1 + 1.45, 3.12, 1, P.black, -1, 0.06);

  // ---- Bulkhead with a narrow gap into the cockpit, pilot seats, panel, windshield.
  s.box(C.x1, F, C.z0, C.x1 + 0.25, C.y1, -0.3, P.wallB);
  s.box(C.x1, F, 0.3, C.x1 + 0.25, C.y1, C.z1, P.wallB);
  s.box(C.x1, 3.5, -0.3, C.x1 + 0.25, C.y1, 0.3, P.wallB);
  for (const z of [-0.65, 0.65]) {
    s.box(3.35, F, z - 0.35, 3.95, F + 0.55, z + 0.35, P.black);
    s.box(3.3, F + 0.55, z - 0.35, 3.5, F + 1.6, z + 0.35, P.black);
    s.box(3.32, F + 1.2, z - 0.33, 3.48, F + 1.25, z + 0.33, P.red); // seat belt
  }
  s.box(4.4, F, C.z0, 4.75, 3.05, C.z1, P.dark); // instrument panel
  s.box(4.3, 2.95, C.z0, 4.75, 3.1, C.z1, P.black); // glare shield
  for (let i = 0; i < 6; i++) {
    const z = -1.0 + i * 0.4;
    s.box(4.37, 2.45, z, 4.4, 2.75, z + 0.25, i % 3 === 1 ? P.gaugeAmber : P.gauge);
    s.box(4.37, 1.95, z + 0.05, 4.4, 2.15, z + 0.2, P.metal);
  }
  for (const z of [-0.65, 0.65]) s.box(3.95, F + 0.5, z - 0.06, 4.35, F + 0.62, z + 0.06, P.black); // yokes
  // Windshield and cockpit side windows.
  s.box(4.75, 3.05, -1.2, 5.0, S.y1 - 0.125, 1.2, P.glass);
  s.box(4.75, 3.05, -0.06, 5.0, S.y1 - 0.125, 0.06, P.whiteShade); // centre post
  for (const z of [-S.z, S.z - 0.125]) s.box(3.2, 2.7, z, 4.65, 3.75, z + 0.125, P.glass);
  // Cabin windows: square with a frame.
  for (const wx of [-4.2, -2.9, -1.4, -0.1, 1.2, 2.3]) {
    for (const z of [-S.z, S.z - 0.125]) {
      if (z < 0 && wx > D.x0 - 0.7 && wx < D.x1) continue;
      s.box(wx - 0.05, 2.62, z, wx + 0.65, 3.43, z + 0.125, P.whiteShade);
      s.box(wx, 2.68, z, wx + 0.6, 3.37, z + 0.125, P.glass);
    }
  }

  // ---- Engine cowling tapering to the spinner, with intake, exhaust stacks and rivet lines.
  for (let i = 0; i < 24; i++) {
    const x = 5.0 + i * 0.125, k = i / 24;
    const hw = 1.4 - k * 0.55, top = 4.05 - k * 0.85, bot = 1.45 + k * 0.45;
    s.box(x, bot, -hw, x + 0.125, top, hw, (_x, y) => (y < 2.0 ? P.olive : y < 2.25 ? P.yellow : i % 6 === 0 ? P.whiteShade : P.white));
  }
  s.box(7.0, 1.85, -0.5, 8.0, 2.25, 0.5, P.black); // intake
  s.box(7.7, 1.75, -0.6, 8.0, 1.85, 0.6, P.metal);
  for (const z of [-1.25, 1.0]) {
    s.box(5.9, 2.2, z, 6.5, 2.85, z + 0.25, P.metalDark);
    s.box(5.95, 2.3, z < 0 ? z - 0.06 : z + 0.25, 6.45, 2.75, z < 0 ? z : z + 0.31, P.black);
  }
  s.blob(8.25, 2.65, 0, 0.5, 0.42, 0.42, (x) => (x > 8.5 ? P.red : P.redDark)); // spinner

  // ---- Tail cone: bottom sweeps up, sides pinch in.
  for (let i = 0; i < 58; i++) {
    const x = -4.75 - (i + 1) * 0.125, k = i / 58;
    const hw = S.z - k * 1.05, bot = S.y0 + k * k * 2.3, top = S.y1 - k * 0.25;
    s.box(x, bot, -hw, x + 0.125, top, hw, (_x, y) => (y < 2.0 ? P.olive : y < 2.25 ? P.yellow : P.white));
  }
  // Vertical fin with a swept leading edge and a red rudder, and the stabilizer.
  for (let y = 4.0; y < 7.6; y += 0.125) {
    const k = (y - 4.0) / 3.6;
    const x0 = -12.2, x1 = -9.0 - k * 2.0;
    s.box(x0 + k * 0.6, y, -0.15, x1, y + 0.125, 0.15, (x) => (x < -11.5 + k * 0.3 ? P.red : P.white));
  }
  s.box(-11.4, 6.0, -0.19, -10.0, 7.0, 0.19, P.red);
  s.text('FF', 'z', 0.21, -11.3, 6.15, 3, P.white, 1, 0.06);
  s.text('FF', 'z', -0.21, -10.1, 6.15, 3, P.white, -1, 0.06);
  s.box(-12.2, 3.75, -3.4, -10.4, 3.95, 3.4, (x, _y, z) => (Math.abs(z) > 3.1 ? P.red : x < -11.8 ? P.whiteShade : P.white));
  s.box(-12.3, 7.45, -0.08, -12.0, 7.6, 0.08, P.strobe);

  // ---- High wing, struts, nav lights.
  s.box(0.6, S.y1, -11.6, 3.1, S.y1 + 0.375, 11.6, (x, _y, z) => (Math.abs(z) > 11.2 ? P.red : x < 1.05 ? P.whiteShade : P.white));
  s.box(2.6, S.y1 + 0.375, -11.6, 3.1, S.y1 + 0.5, 11.6, P.white); // thicker leading edge
  for (const z of [-11.7, 11.6]) s.box(1.6, S.y1, z, 2.1, S.y1 + 0.25, z + 0.1, z < 0 ? P.nav : P.navG);
  for (const z of [-7, -3.5, 3.5, 7]) s.paint(0.6, S.y1, z, 1.05, S.y1 + 0.375, z + 0.125, P.metalDark); // flap seams
  // Wing struts.
  for (const side of [-1, 1]) {
    s.rod([1.6, 1.7, side * 1.5], [1.85, S.y1, side * 6.2], 0.07, P.metalDark);
    s.rod([2.3, 1.7, side * 1.5], [2.45, S.y1, side * 6.0], 0.07, P.metalDark);
  }

  // ---- Livery lettering on both sides.
  s.text("FREEFALL FRANK'S", 'z', S.z + 0.06, -0.9, 3.55, 1, P.olive, 1, 0.125);
  s.text("FRANK'S", 'z', -S.z - 0.06, 2.9, 3.55, 1, P.olive, -1, 0.125);
  s.text('N13FF', 'z', S.z, -9.2, 3.2, 1, P.dark, 1, 0.06);
  s.text('N13FF', 'z', -S.z, -5.2, 3.2, 1, P.dark, -1, 0.06);

  // ---- Door: cut the opening, roll-up door rolled above it, step plate below.
  s.clear(D.x0, F, -S.z - 0.1, D.x1, D.y1, C.z0 + 0.125);
  s.box(D.x0 - 0.125, F - 0.125, -S.z, D.x1 + 0.125, F, C.z0 + 0.125, P.metal); // sill
  s.box(D.x0 - 0.1, D.y1, -S.z - 0.3, D.x1 + 0.1, D.y1 + 0.3, -S.z, (x) => (Math.floor(x * 4) % 2 ? P.whiteShade : P.panel));
  s.box(D.x0 + 0.4, F - 0.6, -S.z - 0.45, D.x1 - 0.4, F - 0.5, -S.z, P.metal);
  s.rod([D.x0 + 0.5, F - 0.55, -S.z - 0.4], [D.x0 + 0.7, S.y0, -S.z], 0.05, P.metalDark);
  s.rod([D.x1 - 0.5, F - 0.55, -S.z - 0.4], [D.x1 - 0.7, S.y0, -S.z], 0.05, P.metalDark);

  // ---- Landing gear: spring legs to the mains with wheel pants, nose leg.
  for (const side of [-1, 1]) {
    s.rod([0.9, S.y0 + 0.1, side * 1.3], [1.0, 0.55, side * 2.5], 0.08, P.metal);
    s.box(0.95 - 0.2, 0, side * 2.5 - 0.17, 0.95 + 0.2, 1.1, side * 2.5 + 0.17, 0); // room for the wheel
    s.box(0.45, 0, side * 2.5 - 0.17, 1.45, 1.1, side * 2.5 + 0.17, (x, y, z) => {
      const d = Math.hypot(x - 0.95, y - 0.55);
      return d < 0.2 ? P.metal : d < 0.55 ? P.rubber : 0;
    });
    s.box(0.25, 0.65, side * 2.5 - 0.22, 1.7, 1.1, side * 2.5 + 0.22, (x) => (x > 1.4 ? P.olive : P.oliveDark));
  }
  s.rod([6.0, S.y0 + 0.1, 0], [6.1, 0.45, 0], 0.07, P.metal);
  s.box(5.85, 0, -0.12, 6.35, 0.5, 0.12, (x, y) => (Math.hypot(x - 6.1, y - 0.25) < 0.25 ? P.rubber : 0));
  // Belly beacon.
  s.box(-1.0, S.y0 - 0.1, -0.1, -0.8, S.y0, 0.1, P.nav);

  const body = s.mesh();
  const root = new THREE.Group();
  root.add(body);

  // ---- Prop: three blades with yellow tips, spins around x.
  const ps = new Sculpt([-0.2, -2.0, -2.0], [0.2, 2.0, 2.0]);
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2;
    for (let r = 0.3; r < 1.9; r += 0.06) {
      const w = 0.16 - r * 0.03;
      const y = Math.cos(a) * r, z = Math.sin(a) * r;
      ps.box(-0.06, y - w, z - w, 0.06, y + w, z + w, r > 1.65 ? P.yellow : P.black);
    }
  }
  const prop = new THREE.Group();
  prop.add(ps.mesh());
  prop.position.copy(JUMP_PLANE.prop).setX(JUMP_PLANE.prop.x + 0.45);
  prop.name = 'prop';
  root.add(prop);

  // ---- Jump lights above the door, inside.
  const light = (c: number, x: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.08), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(x, D.y1 + 0.02, C.z0 + 0.18);
    root.add(m);
    return m;
  };
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.34, 0.06), new THREE.MeshLambertMaterial({ color: 0x1a1b1e }));
  housing.position.set((D.x0 + D.x1) / 2, D.y1 + 0.02, C.z0 + 0.14);
  root.add(housing);
  const redLight = light(0xff2a1a, (D.x0 + D.x1) / 2 - 0.16);
  const greenLight = light(0x2aff5a, (D.x0 + D.x1) / 2 + 0.16);
  greenLight.visible = false;
  return { root, prop, redLight, greenLight };
}

// ------------------------------------------------------------------ canopies

export interface CanopyColors {
  a: number;
  b: number;
  trim: number;
}

export const CANOPY_RENTAL: CanopyColors = { a: 0xd8312b, b: 0xf2f0e8, trim: 0x2b4a7c };
export const CANOPY_RESERVE: CanopyColors = { a: 0xf2f0e8, b: 0xc9ccd2, trim: 0xf2c230 };

/**
 * A nine-cell ram-air canopy, span along z, nose toward +x, with lines down to the harness.
 * Origin is the character's feet; the canopy sits 4.3 above them.
 */
export function canopyModel(c: CanopyColors): THREE.Group {
  const span = 2.9, chord = 1.15, H = 4.3;
  const s = new Sculpt([-chord - 0.2, H - 1.0, -span - 0.2], [chord + 0.2, H + 0.7, span + 0.2]);
  const cells = 9;
  const cw = (span * 2) / cells;
  for (let zc = -span; zc < span; zc += DV) {
    const cell = Math.min(cells - 1, Math.floor((zc + span) / cw));
    const t = zc / span;
    const droop = (1 - Math.cos(t * 1.15)) * 1.2; // arch: tips hang lower
    const ribs = Math.abs(((zc + span) % cw) - 0) < DV * 1.01;
    for (let xc = -chord; xc < chord; xc += DV) {
      const u = (xc + chord) / (chord * 2); // 0 tail .. 1 nose
      const th = 0.55 * Math.sin(Math.min(1, u * 1.25) * Math.PI * 0.95) + 0.08; // airfoil thickness
      const y0 = H - droop - th * 0.25, y1 = H - droop + th * 0.75;
      const col = ribs ? c.trim : cell % 2 ? c.a : c.b;
      const shade = xc < -chord + 0.25 ? v(tint(cell % 2 ? c.a : c.b, 0.82)) : v(col);
      s.box(xc, y0, zc, xc + DV, y1, zc + DV, shade);
    }
    // Open cell mouths at the nose.
    if (!ribs) s.clear(chord - DV * 2, H - droop - 0.05, zc, chord, H - droop + 0.35, zc + DV);
  }
  // Stabilizer panels at the tips.
  for (const z of [-span - 0.1, span - 0.025]) s.box(-chord * 0.6, H - 1.55, z, chord * 0.5, H - 1.2, z + 0.125, v(c.trim));
  const g = new THREE.Group();
  const m = s.mesh();
  g.add(m);
  // Lines: four groups from the canopy's underside down to the risers at the shoulders.
  const pts: number[] = [];
  const harnessL = new THREE.Vector3(0, 1.45, -0.28), harnessR = new THREE.Vector3(0, 1.45, 0.28);
  for (let i = 0; i <= cells; i++) {
    const z = -span + i * cw;
    const t = z / span;
    const y = H - (1 - Math.cos(t * 1.15)) * 1.2 - 0.15;
    for (const x of [chord * 0.7, 0, -chord * 0.7]) {
      const h = z < 0 ? harnessL : harnessR;
      pts.push(x, y, z, h.x, h.y, h.z);
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x3a3a3a }));
  g.add(lines);
  // Slider: a little square partway down the lines.
  const slider = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 1.2), new THREE.MeshLambertMaterial({ color: c.trim }));
  slider.position.set(0, 2.4, 0);
  g.add(slider);
  return g;
}

/** Pilot chute: a little round dome on a bridle, used while the main is coming out. */
export function pilotChuteModel(): THREE.Group {
  const s = new Sculpt([-0.6, -0.1, -0.6], [0.6, 0.6, 0.6]);
  s.blob(0, 0, 0, 0.55, 0.5, 0.55, (_x, y, _z, nx, ny, nz) => (ny < 0.15 ? 0 : Math.abs(Math.atan2(nz, nx)) % 1.05 < 0.5 ? v(0xf2c230) : v(0x17181b)));
  const g = new THREE.Group();
  g.add(s.mesh());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -3.2, 0], 3));
  g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf2f0e8 })));
  return g;
}

/**
 * The bargain rig's "canopy": a floral bedsheet, a pair of boxers and two socks on a tangle of
 * clothesline. Children named sheet/boxers/sock0/sock1 flap in the wind.
 */
export function laundryModel(): THREE.Group {
  const g = new THREE.Group();
  // Bedsheet: pale yellow with roses and a hem.
  const sh = new Sculpt([-1.3, -0.05, -1.6], [1.3, 0.05, 1.6]);
  sh.box(-1.25, -0.05, -1.55, 1.25, 0.05, 1.55, (x, _y, z) => {
    if (Math.abs(x) > 1.12 || Math.abs(z) > 1.42) return v(0xd6c79a);
    const fx = Math.round(x * 2.2) / 2.2, fz = Math.round(z * 2.2 + (Math.round(x * 2.2) % 2) * 0.5) / 2.2;
    const d = Math.hypot(x - fx, z - fz);
    if (d < 0.09) return v(0xc8302a);
    if (d < 0.15) return v(0xe36a5a);
    if (d < 0.2 && hash3(Math.round(x * 8), 0, Math.round(z * 8)) > 0.5) return v(0x5f7f22);
    return v(0xf3e6b8, 0.03);
  });
  const sheet = sh.mesh();
  sheet.name = 'sheet';
  sheet.position.set(0, 4.0, 0);
  g.add(sheet);
  // Boxers: red with white hearts.
  const bx = new Sculpt([-0.5, -0.45, -0.1], [0.5, 0.45, 0.1]);
  bx.box(-0.45, 0.0, -0.08, 0.45, 0.4, 0.08, (x, y) => (y > 0.3 ? v(0xf2f0e8) : (Math.round(x * 6) + Math.round(y * 6)) % 3 === 0 ? v(0xf2f0e8) : v(0xc8302a)));
  for (const sx of [-1, 1]) bx.box(sx > 0 ? 0.05 : -0.45, -0.4, -0.08, sx > 0 ? 0.45 : -0.05, 0.0, 0.08, (x, y) => ((Math.round(x * 6) + Math.round(y * 6)) % 3 === 0 ? v(0xf2f0e8) : v(0xc8302a)));
  const boxers = bx.mesh();
  boxers.name = 'boxers';
  boxers.position.set(1.4, 2.9, 0.6);
  g.add(boxers);
  // Socks: striped tube socks.
  for (let i = 0; i < 2; i++) {
    const so = new Sculpt([-0.15, -0.7, -0.15], [0.45, 0.1, 0.15]);
    so.box(-0.12, -0.55, -0.1, 0.12, 0.05, 0.1, (_x, y) => (y > -0.05 ? v(0xc8302a) : y > -0.15 ? v(0x2b4a7c) : v(0xf2f0e8)));
    so.box(-0.12, -0.7, -0.1, 0.4, -0.5, 0.1, v(0xe9e4d6));
    const sock = so.mesh();
    sock.name = `sock${i}`;
    sock.position.set(-1.2 + i * 0.6, 3.1 + i * 0.4, -0.9 + i * 1.4);
    g.add(sock);
  }
  // Clothesline tangle down to the harness.
  const pts = [0, 1.45, 0, -1.1, 4.0, -1.4, 0, 1.45, 0, 1.1, 4.0, 1.4, 0, 1.45, 0, 1.4, 3.3, 0.6, 0, 1.45, 0, -1.2, 3.1, -0.9, -1.2, 3.1, -0.9, -0.6, 3.5, 0.5];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xd8d4c8 })));
  return g;
}

// ------------------------------------------------------------------ rigs

export type RigKind = 'rental' | 'bargain' | 'teddy';

/**
 * The container worn on the back, in the character's spinner space (hip at the origin, back toward
 * -z). Rental: black container with a red trim and the ripcord handle; bargain: a patched army
 * duffel with duct tape; teddy: a kid's pink backpack with bear ears.
 */
export function rigModel(kind: RigKind): THREE.Group {
  const s = new Sculpt([-0.4, -0.1, -0.5], [0.4, 0.9, 0.05]);
  if (kind === 'rental') {
    s.box(-0.3, 0.0, -0.42, 0.3, 0.78, -0.18, (x, y) => (Math.abs(x) > 0.25 || y > 0.72 ? v(0xc8302a) : v(0x1d1e22, 0.06)));
    s.box(-0.24, 0.5, -0.45, 0.24, 0.7, -0.42, v(0x2a2c31)); // reserve flap
    s.box(-0.06, 0.6, -0.47, 0.06, 0.68, -0.45, v(0xc8302a)); // reserve pin cover
    s.box(-0.25, 0.04, -0.47, 0.25, 0.14, -0.42, v(0x2a2c31)); // bottom of container
    s.box(0.12, -0.02, -0.5, 0.22, 0.06, -0.44, v(0xf2c230)); // pilot chute hackey
    for (const x of [-0.28, 0.2]) s.box(x, 0.0, -0.2, x + 0.08, 0.8, -0.05, v(0x2b4a7c)); // harness straps
    s.box(0.18, 0.42, -0.06, 0.3, 0.52, 0.03, v(0xc8302a)); // cutaway pillow
  } else if (kind === 'bargain') {
    s.blob(0, 0.36, -0.3, 0.3, 0.42, 0.15, (x, y) => (Math.abs(y - 0.5) < 0.05 ? v(0xb7b9bc) : (Math.round(x * 9) + Math.round(y * 9)) % 7 === 0 ? v(0x6b5a35) : v(0x5b6236, 0.08)));
    s.box(-0.32, 0.45, -0.46, 0.32, 0.55, -0.4, v(0xb7b9bc)); // duct tape
    s.box(-0.08, 0.1, -0.47, 0.12, 0.28, -0.43, v(0x8a6a3a)); // patch
    s.box(0.0, -0.05, -0.4, 0.04, 0.1, -0.36, v(0xd8d4c8)); // a sock sticks out
    for (const x of [-0.24, 0.18]) s.box(x, 0.0, -0.2, x + 0.06, 0.8, -0.05, v(0x3a3a2a));
  } else {
    s.box(-0.26, 0.05, -0.4, 0.26, 0.65, -0.18, (_x, y) => (y > 0.58 ? v(0xd86aa0) : v(0xf29ac0, 0.05)));
    s.box(-0.18, 0.12, -0.44, 0.18, 0.4, -0.4, v(0xf7d0e2)); // front pocket
    s.blob(0, 0.5, -0.43, 0.13, 0.1, 0.03, v(0x9a6a3a)); // bear face patch
    for (const x of [-0.2, 0.2]) s.blob(x, 0.7, -0.29, 0.07, 0.07, 0.06, v(0x9a6a3a)); // ears
    for (const x of [-0.22, 0.16]) s.box(x, 0.05, -0.2, x + 0.06, 0.7, -0.05, v(0xd86aa0));
  }
  const g = new THREE.Group();
  g.add(s.mesh());
  return g;
}

/** Lost and found's teddy bear "parachute", now with stitching and a bow tie. Feet at y = -0.8. */
export function teddyModel(): THREE.Group {
  const fur = (x: number, y: number, z: number) => (hash3(Math.round(x * 8), Math.round(y * 8), Math.round(z * 8)) > 0.8 ? v(0x87592f) : v(0x9a6a3a, 0.08));
  const s = new Sculpt([-1.1, -0.85, -0.7], [1.1, 2.3, 0.8]);
  s.blob(0, 0.05, 0, 0.7, 0.85, 0.55, fur); // body
  s.blob(0, 0.05, 0.3, 0.42, 0.55, 0.3, v(0xd8b48a)); // belly
  s.blob(0, 1.35, 0, 0.6, 0.55, 0.5, fur); // head
  s.blob(0, 1.22, 0.45, 0.25, 0.18, 0.15, v(0xd8b48a)); // snout
  s.box(-0.07, 1.27, 0.58, 0.07, 1.36, 0.62, v(0x1a1210)); // nose
  for (const x of [-0.22, 0.22]) s.box(x - 0.06, 1.48, 0.43, x + 0.06, 1.6, 0.5, v(0x1a1210)); // eyes
  for (const x of [-0.45, 0.45]) {
    s.blob(x, 1.85, 0, 0.2, 0.2, 0.14, fur);
    s.blob(x, 1.85, 0.08, 0.1, 0.1, 0.08, v(0xd8b48a));
    s.blob(x * 1.85, 0.25, 0.05, 0.22, 0.45, 0.22, fur); // arms
    s.blob(x * 0.75, -0.62, 0.12, 0.25, 0.22, 0.32, fur); // legs
    s.blob(x * 0.75, -0.62, 0.38, 0.15, 0.15, 0.06, v(0xd8b48a)); // paw pads
  }
  s.box(-0.3, 0.82, 0.38, 0.3, 0.98, 0.5, (x) => (Math.abs(x) < 0.07 ? v(0x9a221e) : v(0xc8302a))); // bow tie
  s.box(-0.03, -0.3, 0.52, 0.03, 0.4, 0.56, v(0x5a3a20)); // seam stitching
  const g = new THREE.Group();
  g.add(s.mesh());
  return g;
}

// ------------------------------------------------------------------ sky

/** A puffy cumulus: white tops, grey-blue bellies. Built from half-block voxels. */
export function cloudModel(seed: number, size = 1): THREE.Mesh {
  const r = (i: number) => hash3(seed * 31 + i, seed * 7 - i, i * 13);
  const W = 18 * size, Hh = 7 * size, D = 12 * size;
  const s = new Sculpt([-W, 0, -D], [W, Hh * 1.6, D], 0.5);
  const puffs = 5 + Math.floor(r(0) * 4);
  for (let i = 0; i < puffs; i++) {
    const px = (r(i + 1) - 0.5) * W * 1.2, pz = (r(i + 20) - 0.5) * D * 0.9;
    const rad = (4 + r(i + 40) * 5) * size;
    s.blob(px, rad * 0.55, pz, rad * 1.3, rad, rad, (_x, y) => (y < 1.2 * size ? v(0xb9c6d6, 0.02) : y < 3 * size ? v(0xdfe6ee, 0.02) : v(0xffffff, 0.02)));
  }
  s.box(-W, 0, -D, W, 0.5, D, (x, y, z) => (s.g.get(Math.round((x + W) / 0.5), Math.round((y + 0.5) / 0.5), Math.round((z + D) / 0.5)) ? v(0xaab6c6, 0.02) : 0));
  const m = s.mesh();
  m.castShadow = false;
  return m;
}
