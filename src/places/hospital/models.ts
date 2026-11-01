import * as THREE from 'three';
import { DetailGrid, DV, kitMaterial, meshGrid, rasterText, textWidth, vox } from '../../kit';

/**
 * Detail-voxel models for the hospital's vehicles, in the building kit's style (8 voxels per
 * block, shared kit material). Sizes and pivots match the old box models so the runtime's
 * colliders, rotor kill radius and animations are unchanged.
 */

/** A DetailGrid addressed in model units (blocks) inside fixed bounds. */
class Sculpt {
  readonly g: DetailGrid;
  constructor(readonly min: [number, number, number], max: [number, number, number]) {
    this.g = new DetailGrid(Math.ceil((max[0] - min[0]) / DV), Math.ceil((max[1] - min[1]) / DV), Math.ceil((max[2] - min[2]) / DV));
  }
  private c(v: number, a: 0 | 1 | 2) {
    return Math.round((v - this.min[a]) / DV);
  }
  /** Fill cells whose centres fall inside the box. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: number | ((x: number, y: number, z: number) => number)) {
    const p = typeof v === 'number' ? v : (cx: number, cy: number, cz: number) => v(this.min[0] + (cx + 0.5) * DV, this.min[1] + (cy + 0.5) * DV, this.min[2] + (cz + 0.5) * DV);
    this.g.box(this.c(x0, 0), this.c(y0, 1), this.c(z0, 2), this.c(x1, 0) - 1, this.c(y1, 1) - 1, this.c(z1, 2) - 1, p);
  }
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.box(x0, y0, z0, x1, y1, z1, 0);
  }
  /** Recolor solid cells inside the box. */
  paint(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: number) {
    this.g.paint(this.c(x0, 0), this.c(y0, 1), this.c(z0, 2), this.c(x1, 0) - 1, this.c(y1, 1) - 1, this.c(z1, 2) - 1, v);
  }
  /** A wheel: a disc of radius r around the x axis, centred at (x, y, z), width w. */
  wheel(x: number, y: number, z: number, r: number, w: number, tire: number, hub: number) {
    this.box(x - w / 2, y - r, z - r, x + w / 2, y + r, z + r, (px, py, pz) => {
      const d = Math.hypot(py - y, pz - z);
      return d > r ? 0 : d < r * 0.45 ? hub : tire;
    });
  }
  /** Pixel text on a plane: along +u, up +y, at the given fixed coordinate. */
  text(str: string, plane: 'x' | 'z', at: number, u0: number, y0: number, s: number, v: number, dir = 1) {
    rasterText(str, (px, py) => {
      const u = u0 + dir * px * s * DV, y = y0 + py * s * DV;
      const ua = Math.min(u, u + dir * s * DV), ub = Math.max(u, u + dir * s * DV);
      if (plane === 'x') this.box(at - DV / 2, y, ua, at + DV / 2, y + s * DV, ub, v);
      else this.box(ua, y, at - DV / 2, ub, y + s * DV, at + DV / 2, v);
    });
  }
  mesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(meshGrid(this.g, { origin: [-this.min[0] / DV, -this.min[1] / DV, -this.min[2] / DV] }), kitMaterial(DV));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

const K = {
  white: vox(0xf4f3ee, { jitter: 0.03 }),
  whiteShade: vox(0xdedcd5, { jitter: 0.03 }),
  red: vox(0xd8312b, { jitter: 0.03 }),
  redDark: vox(0xa82520, { jitter: 0.03 }),
  glass: vox(0x23384d, { glass: true, jitter: 0.04 }),
  dark: vox(0x25282e, { jitter: 0.05 }),
  metal: vox(0x8d949c, { jitter: 0.05 }),
  tire: vox(0x1c1d20, { jitter: 0.08 }),
  hub: vox(0xb8c0c8, { jitter: 0.04 }),
  yellow: vox(0xf2c230, { jitter: 0.03 }),
  lightRed: vox(0xff3a2a, { emissive: true, jitter: 0 }),
  lightBlue: vox(0x3a7cff, { emissive: true, jitter: 0 }),
  lamp: vox(0xfff1cf, { emissive: true, jitter: 0 }),
  tail: vox(0xff2a20, { emissive: true, jitter: 0 }),
};

export interface HeliModel {
  body: THREE.Mesh;
  /** Main rotor hub and blades; spin it around y. Its origin is the hub (3.1 above the skids). */
  rotor: THREE.Group;
  /** Tail rotor; spin it around z. */
  tailRotor: THREE.Group;
}

/** Air ambulance, nose toward +x, skids at y = 0. */
export function heliModel(): HeliModel {
  const s = new Sculpt([-7.3, 0, -1.5], [3.6, 3.4, 1.5]);
  // Cabin with bevelled edges.
  s.box(-2.1, 0.45, -1.1, 2.1, 2.4, 1.1, K.white);
  for (const [y, z] of [[0.45, -1.1], [0.45, 0.975], [2.275, -1.1], [2.275, 0.975]] as const) s.clear(-2.1, y, z, 2.1, y + 0.125, z + 0.125);
  s.box(-1.9, 2.4, -0.9, 1.6, 2.65, 0.9, K.whiteShade); // engine cowling
  s.box(-0.8, 2.65, -0.5, 0.8, 2.8, 0.5, K.metal);
  // Nose: tapered glass canopy.
  for (let i = 0; i < 10; i++) {
    const x = 2.1 + i * 0.13, k = i / 10;
    s.box(x, 0.6 + k * 0.35, -1.0 + k * 0.45, x + 0.13, 2.05 - k * 0.55, 1.0 - k * 0.45, i < 2 ? K.white : K.glass);
  }
  s.box(2.1, 0.55, -0.95, 3.3, 0.85, 0.95, K.white); // chin
  // Side windows and doors.
  for (const z of [-1.1, 0.975]) {
    s.box(-1.4, 1.55, z, 1.7, 2.15, z + 0.125, K.glass);
    s.box(-0.1, 0.5, z, -0.025, 2.2, z + 0.125, K.whiteShade);
  }
  // Red stripe and the cross on both sides.
  s.paint(-2.1, 0.95, -1.2, 2.3, 1.3, 1.2, K.red);
  for (const z of [-1.2, 1.075]) {
    s.box(-1.0, 1.35, z, -0.25, 1.5, z + 0.125, K.red);
    s.box(-0.7, 1.05, z, -0.55, 1.8, z + 0.125, K.red);
  }
  // Tail boom, fin and stabiliser.
  for (let i = 0; i < 38; i++) {
    const x = -2.1 - (i + 1) * 0.125, k = i / 38;
    const h = 0.32 - k * 0.12;
    s.box(x, 1.85 - h, -h, x + 0.125, 1.85 + h, h, K.white);
  }
  s.paint(-5.2, 1.4, -0.4, -4.7, 2.3, 0.4, K.red);
  s.box(-7.1, 1.6, -0.1, -6.3, 3.3, 0.1, K.red);
  s.box(-6.4, 1.75, -0.9, -5.9, 1.9, 0.9, K.red);
  s.box(-6.9, 3.1, -0.06, -6.6, 3.25, 0.06, K.lightRed);
  // Skids and struts.
  for (const z of [-1.25, 1.125]) {
    s.box(-2.6, 0, z, 2.4, 0.125, z + 0.125, K.dark);
    s.box(2.4, 0.06, z, 2.7, 0.19, z + 0.125, K.dark);
    for (const x of [-1.3, 1.2]) s.box(x, 0.125, z, x + 0.125, 0.5, z + 0.125, K.dark);
  }
  s.box(-0.15, 2.8, -0.15, 0.15, 3.05, 0.15, K.dark); // mast
  s.box(2.6, 0.6, -0.55, 2.8, 0.75, -0.35, K.lamp); // landing lights
  s.box(2.6, 0.6, 0.35, 2.8, 0.75, 0.55, K.lamp);
  s.box(-0.2, 0.45, -0.2, 0.2, 0.5, 0.2, K.lightRed);
  const body = s.mesh();

  // Rotor: hub plus four blades with yellow tips.
  const rotor = new THREE.Group();
  const hub = new Sculpt([-0.3, -0.1, -0.3], [0.3, 0.2, 0.3]);
  hub.box(-0.25, -0.1, -0.25, 0.25, 0.15, 0.25, K.dark);
  rotor.add(hub.mesh());
  const blade = new Sculpt([0, -0.07, -0.19], [5.6, 0.07, 0.19]);
  blade.box(0.2, -0.06, -0.18, 5.6, 0.06, 0.18, K.dark);
  blade.box(5.2, -0.06, -0.18, 5.6, 0.06, 0.18, K.yellow);
  const bladeMesh = blade.mesh();
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.add(bladeMesh.clone());
    arm.rotation.y = (i / 4) * Math.PI * 2;
    rotor.add(arm);
  }
  const tailRotor = new THREE.Group();
  const tb = new Sculpt([-0.06, -0.8, -0.8], [0.07, 0.8, 0.8]);
  tb.box(-0.06, -0.8, -0.09, 0.06, 0.8, 0.09, K.dark);
  tb.box(-0.06, -0.09, -0.8, 0.06, 0.09, 0.8, K.dark);
  tb.box(-0.06, -0.8, -0.09, 0.06, -0.6, 0.09, K.yellow);
  tb.box(-0.06, 0.6, -0.09, 0.06, 0.8, 0.09, K.yellow);
  tailRotor.add(tb.mesh());
  return { body, rotor, tailRotor };
}

/** Box ambulance, front toward +z, wheels on y = 0. About 2.4 wide, 3 tall, 6.8 long. */
export function ambulanceModel(): THREE.Mesh {
  const s = new Sculpt([-1.3, 0, -3.3], [1.3, 3.2, 3.7]);
  // Box body.
  s.box(-1.2, 0.45, -3.1, 1.2, 2.85, 1.75, K.white);
  s.clear(-1.2, 2.725, -3.1, -1.075, 2.85, 1.75);
  s.clear(1.075, 2.725, -3.1, 1.2, 2.85, 1.75);
  // Cab and hood.
  s.box(-1.15, 0.45, 1.75, 1.15, 2.1, 2.9, K.white);
  s.box(-1.15, 0.45, 2.9, 1.15, 1.35, 3.55, K.white);
  s.box(-1.05, 1.35, 2.9, 1.05, 2.0, 3.0, K.glass); // windshield
  for (const x of [-1.15, 1.025]) s.box(x, 1.4, 2.0, x + 0.125, 1.95, 2.8, K.glass); // side windows
  s.box(-1.0, 0.7, 3.55, 1.0, 1.2, 3.65, K.metal); // grille
  for (const x of [-0.95, 0.65]) s.box(x, 1.0, 3.55, x + 0.3, 1.2, 3.65, K.lamp);
  s.box(-1.2, 0.45, 3.55, 1.2, 0.65, 3.7, K.dark); // bumper
  s.box(-1.25, 0.45, -3.25, 1.25, 0.6, -3.1, K.dark);
  // Red band all round and the light bar.
  s.paint(-1.3, 1.3, -3.3, 1.3, 1.6, 3.7, K.red);
  s.box(-0.9, 2.85, 1.3, -0.1, 3.05, 1.65, K.lightRed);
  s.box(0.1, 2.85, 1.3, 0.9, 3.05, 1.65, K.lightBlue);
  for (const x of [-1.2, 1.075]) {
    s.box(x, 2.6, -3.1, x + 0.125, 2.8, -2.8, K.lightRed);
  }
  // Rear doors, tail lights and the cross.
  s.box(-0.02, 0.6, -3.15, 0.02, 2.6, -3.1, K.whiteShade);
  s.box(-1.1, 0.8, -3.2, -0.85, 1.2, -3.1, K.tail);
  s.box(0.85, 0.8, -3.2, 1.1, 1.2, -3.1, K.tail);
  s.box(-0.55, 2.05, -3.2, 0.55, 2.25, -3.1, K.red);
  s.box(-0.1, 1.7, -3.2, 0.1, 2.6, -3.1, K.red);
  // Side lettering and crosses.
  const label = 'AMBULANCE';
  const tw = textWidth(label) * DV;
  // Read left to right from outside: along -z on the +x side, +z on the -x side.
  s.text(label, 'x', 1.24, -0.7 + tw / 2, 1.95, 1, K.red, -1);
  s.text(label, 'x', -1.24, -0.7 - tw / 2, 1.95, 1, K.red, 1);
  // Wheels and arches.
  for (const z of [-2.2, 2.4]) {
    s.clear(-1.3, 0, z - 0.55, 1.3, 0.85, z + 0.55);
    for (const x of [-1.05, 1.05]) s.wheel(x, 0.45, z, 0.45, 0.3, K.tire, K.hub);
  }
  return s.mesh();
}
