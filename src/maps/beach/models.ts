import * as THREE from 'three';
import { canvasTexture, noiseTexture } from '../../util';

/** Procedural voxel-style models for the beach. Every model is built from boxes. */

const matCache = new Map<number, THREE.MeshLambertMaterial>();
export const mat = (color: number, opts: { emissive?: number; transparent?: boolean; opacity?: number } = {}) => {
  if (!opts.emissive && !opts.transparent) {
    let m = matCache.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, map: noiseTexture() });
      matCache.set(color, m);
    }
    return m;
  }
  return new THREE.MeshLambertMaterial({ color, map: noiseTexture(), emissive: opts.emissive ?? 0, transparent: opts.transparent, opacity: opts.opacity ?? 1 });
};

export function cube(w: number, h: number, d: number, color: number | THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? mat(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent?.add(m);
  return m;
}

export function textSign(lines: string[], w: number, h: number, bg: string, fg: string) {
  return canvasTexture(
    w,
    h,
    (c) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = fg;
      c.lineWidth = 6;
      c.strokeRect(5, 5, w - 10, h - 10);
      c.fillStyle = fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      lines.forEach((line, i) => {
        const size = i === 0 ? Math.min(h / (lines.length + 0.6), 60) : Math.min(h / (lines.length + 1.5), 34);
        c.font = `bold ${Math.round(size)}px Arial Black, Impact, sans-serif`;
        let s = size;
        while (c.measureText(line).width > w - 24 && s > 10) {
          s -= 2;
          c.font = `bold ${Math.round(s)}px Arial Black, Impact, sans-serif`;
        }
        c.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1));
      });
    },
    false,
  );
}

export function signBoard(lines: string[], width: number, height: number, bg: string, fg: string) {
  const tex = textSign(lines, 512, Math.round((512 * height) / width), bg, fg);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  return m;
}

/** Updatable text sign (buffet countdown, depth gauge board). */
export class LiveSign {
  readonly mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private last = '';
  constructor(width: number, height: number, private bg: string, private fg: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = Math.round((512 * height) / width);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.tex, side: THREE.DoubleSide }));
  }
  set(lines: string[]) {
    const key = lines.join('|');
    if (key === this.last) return;
    this.last = key;
    const c = this.canvas.getContext('2d')!;
    const w = this.canvas.width, h = this.canvas.height;
    c.fillStyle = this.bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = this.fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach((line, i) => {
      c.font = `bold ${i === 0 ? 54 : 36}px Arial Black, Impact, sans-serif`;
      c.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1));
    });
    this.tex.needsUpdate = true;
  }
}

export function shark(scale = 1) {
  const g = new THREE.Group();
  const grey = 0x6f8494, belly = 0xe8eef0;
  cube(1.0, 0.9, 3.6, grey, 0, 0, 0, g);
  cube(0.9, 0.35, 3.2, belly, 0, -0.45, 0.1, g);
  cube(0.7, 0.7, 1.0, grey, 0, 0, 2.2, g); // snout
  cube(0.12, 1.1, 0.7, grey, 0, 0.9, -0.2, g).rotation.x = -0.35; // dorsal fin
  const tail = new THREE.Group();
  tail.position.z = -1.9;
  cube(0.15, 1.4, 0.6, grey, 0, 0.3, -0.4, tail).rotation.x = 0.5;
  cube(0.15, 0.8, 0.5, grey, 0, -0.35, -0.3, tail).rotation.x = -0.6;
  tail.name = 'tail';
  g.add(tail);
  for (const s of [-1, 1]) cube(0.9, 0.1, 0.5, grey, s * 0.8, -0.3, 0.6, g).rotation.z = s * 0.4;
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.3, 2.2);
  cube(0.65, 0.2, 0.9, 0xc04040, 0, 0, 0.1, jaw);
  for (let i = 0; i < 4; i++) cube(0.08, 0.14, 0.08, 0xffffff, -0.24 + i * 0.16, 0.14, 0.5, jaw);
  jaw.name = 'jaw';
  g.add(jaw);
  for (const s of [-1, 1]) cube(0.08, 0.12, 0.12, 0x111111, s * 0.36, 0.15, 2.4, g);
  g.scale.setScalar(scale);
  return g;
}

export function whale() {
  const g = new THREE.Group();
  const blue = 0x3a4f78, belly = 0xd9d4c8;
  cube(7, 5, 18, blue, 0, 0, 0, g);
  cube(6, 1.5, 16, belly, 0, -2.6, 0.5, g);
  for (let i = 0; i < 7; i++) cube(6.2, 0.15, 0.3, 0xb0a898, 0, -2.2, -4 + i * 1.6, g);
  const tail = new THREE.Group();
  tail.position.z = -9;
  cube(3, 2.5, 5, blue, 0, 0.4, -2, tail);
  cube(9, 0.5, 2.5, blue, 0, 0.6, -4.8, tail);
  tail.name = 'tail';
  g.add(tail);
  const jaw = new THREE.Group();
  jaw.position.set(0, -1.6, 7);
  cube(6.6, 1.2, 4.5, blue, 0, -0.2, 0.5, jaw);
  cube(5.8, 0.3, 4.0, 0xd06070, 0, 0.45, 0.4, jaw);
  jaw.name = 'jaw';
  g.add(jaw);
  for (const s of [-1, 1]) {
    cube(0.4, 0.6, 0.6, 0x111111, s * 3.5, 0.3, 6, g);
    cube(4, 0.4, 2, blue, s * 4.5, -1.8, 2, g).rotation.z = s * 0.4;
  }
  cube(0.8, 0.3, 0.8, 0x222a44, 0, 2.55, 3, g); // blowhole
  return g;
}

export function gull() {
  const g = new THREE.Group();
  cube(0.35, 0.3, 0.7, 0xf4f4f4, 0, 0, 0, g);
  cube(0.28, 0.28, 0.3, 0xf4f4f4, 0, 0.15, 0.42, g);
  cube(0.08, 0.08, 0.2, 0xf2b630, 0, 0.12, 0.66, g);
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(s * 0.18, 0.1, 0);
    cube(0.9, 0.06, 0.4, 0xbfc6cc, s * 0.45, 0, 0, wing);
    cube(0.25, 0.07, 0.38, 0x222222, s * 0.95, 0, 0, wing);
    wing.name = s < 0 ? 'wl' : 'wr';
    g.add(wing);
  }
  return g;
}

export function jetSki() {
  const g = new THREE.Group();
  cube(1.2, 0.6, 3, 0xe8302a, 0, 0.3, 0, g);
  cube(1.0, 0.4, 1.0, 0xffffff, 0, 0.75, -0.4, g);
  cube(0.9, 0.3, 0.6, 0xe8302a, 0, 0.6, 1.3, g);
  cube(1.2, 0.08, 0.1, 0x222222, 0, 1.05, 0.6, g);
  return g;
}

export function boat(kind: 'charter' | 'tour' | 'parasail' | 'tender') {
  const g = new THREE.Group();
  const len = kind === 'parasail' ? 6 : kind === 'tender' ? 7 : 12;
  const wid = kind === 'parasail' ? 2.6 : kind === 'tender' ? 3 : 4.4;
  const hull = kind === 'charter' ? 0xffffff : kind === 'tour' ? 0x2a8ae0 : kind === 'tender' ? 0xf2c230 : 0xe8423a;
  cube(wid, 1.4, len, hull, 0, 0.3, 0, g);
  cube(wid * 0.7, 1.2, 1.6, hull, 0, 0.2, len / 2 + 0.6, g); // bow
  cube(wid - 0.3, 0.12, len - 0.3, 0xc8a070, 0, 1.0, 0, g); // deck
  for (const s of [-1, 1]) cube(0.12, 0.5, len, 0xeeeeee, (s * wid) / 2, 1.3, 0, g);
  if (kind !== 'parasail') {
    cube(wid * 0.7, 1.8, 2.4, 0xeeeeee, 0, 2, kind === 'tour' ? -2 : 1, g);
    cube(wid * 0.72, 0.15, 2.6, 0x222222, 0, 2.95, kind === 'tour' ? -2 : 1, g);
  }
  if (kind === 'charter') {
    // Fishing rods.
    for (const s of [-1, 1]) cube(0.06, 3.5, 0.06, 0x222222, s * 1.6, 2.6, -5, g).rotation.x = -0.5;
  }
  return g;
}

export function innerTube() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.22, 6, 10), mat(0xff7a2a));
  m.rotation.x = Math.PI / 2;
  m.castShadow = true;
  g.add(m);
  return g;
}

export function coconut() {
  const g = new THREE.Group();
  cube(0.5, 0.5, 0.5, 0x5a3a1e, 0, 0, 0, g);
  return g;
}

export function jellyfish() {
  const g = new THREE.Group();
  const m = mat(0xff8ad8, { transparent: true, opacity: 0.7, emissive: 0x551144 });
  cube(0.8, 0.45, 0.8, m, 0, 0, 0, g);
  for (let i = 0; i < 4; i++) cube(0.06, 0.9, 0.06, m, -0.25 + (i % 2) * 0.5, -0.65, -0.25 + Math.floor(i / 2) * 0.5, g);
  return g;
}

export function pufferfish() {
  const g = new THREE.Group();
  const body = cube(0.7, 0.6, 0.8, 0xe8c45a, 0, 0, 0, g);
  body.name = 'body';
  const spikes = new THREE.Group();
  spikes.name = 'spikes';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    cube(0.06, 0.06, 0.25, 0xffffff, Math.cos(a) * 0.4, Math.sin(a * 2) * 0.25, Math.sin(a) * 0.45, spikes).lookAt(0, 0, 0);
  }
  spikes.visible = false;
  g.add(spikes);
  for (const s of [-1, 1]) cube(0.12, 0.14, 0.1, 0x111111, s * 0.2, 0.12, 0.38, g);
  cube(0.05, 0.4, 0.3, 0xe8c45a, 0, 0, -0.5, g);
  return g;
}

export function crab() {
  const g = new THREE.Group();
  cube(0.5, 0.2, 0.35, 0xe0402a, 0, 0.15, 0, g);
  for (const s of [-1, 1]) {
    cube(0.15, 0.15, 0.15, 0xe0402a, s * 0.35, 0.2, 0.2, g);
    for (let i = 0; i < 3; i++) cube(0.25, 0.04, 0.04, 0xc0301a, s * 0.32, 0.06, -0.1 + i * 0.1, g);
    cube(0.06, 0.12, 0.06, 0x111111, s * 0.1, 0.32, 0.12, g);
  }
  return g;
}

export function volleyball() {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), mat(0xfff6e0));
  m.castShadow = true;
  return m;
}

export function parachute() {
  const g = new THREE.Group();
  const cols = [0xe8423a, 0xffffff, 0x2a8ae0, 0xf6d23a, 0xe8423a, 0xffffff, 0x2a8ae0];
  cols.forEach((c, i) => {
    const a = (i - 3) * 0.32;
    const seg = cube(1.1, 0.12, 2.2, c, Math.sin(a) * 3.2, Math.cos(a) * 3.2 - 3.2, 0, g);
    seg.rotation.z = -a;
  });
  for (const s of [-1, 1]) {
    const line = cube(0.03, 4.4, 0.03, 0x333333, s * 1.5, -2.2, 0, g);
    line.rotation.z = s * 0.35;
  }
  return g;
}

export function submarine() {
  const g = new THREE.Group();
  cube(2, 2, 5, 0xf2d020, 0, 0, 0, g);
  cube(1.4, 1.2, 1.4, 0xf2d020, 0, 1.4, 0.6, g);
  cube(0.3, 0.8, 0.3, 0x333333, 0, 2.3, 0.6, g);
  for (const s of [-1, 1]) cube(0.05, 0.5, 0.5, 0x8ad8ff, s * 1.01, 0.2, 1.2, g);
  cube(0.6, 0.6, 0.05, 0x8ad8ff, 0, 0.2, 2.51, g);
  const prop = cube(1.4, 0.15, 0.15, 0x333333, 0, 0, -2.7, g);
  prop.name = 'prop';
  // Patches and duct tape: it's a discount sub.
  cube(0.5, 0.4, 0.02, 0x888888, 1.01, -0.4, -1, g).rotation.y = Math.PI / 2;
  cube(0.02, 0.2, 1.2, 0xaaaaaa, -1.01, 0.5, -0.5, g);
  return g;
}

export function anchor() {
  const g = new THREE.Group();
  cube(0.25, 2.2, 0.25, 0x333338, 0, 0, 0, g);
  cube(1.6, 0.25, 0.25, 0x333338, 0, -1.0, 0, g);
  for (const s of [-1, 1]) cube(0.25, 0.6, 0.25, 0x333338, s * 0.8, -0.75, 0, g);
  cube(0.9, 0.2, 0.25, 0x333338, 0, 0.85, 0, g);
  return g;
}

export function ferrisWheel() {
  const g = new THREE.Group();
  const wheel = new THREE.Group();
  wheel.name = 'wheel';
  wheel.position.y = 14;
  const R = 11;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const spoke = cube(0.25, R, 0.25, 0xffffff, Math.sin(a) * R * 0.5, Math.cos(a) * R * 0.5, 0, wheel);
    spoke.rotation.z = -a;
    const rim = cube(0.3, (2 * Math.PI * R) / 16 + 0.1, 0.3, 0xff3ec8, Math.sin(a) * R, Math.cos(a) * R, 0, wheel);
    rim.rotation.z = -a - Math.PI / 16 + Math.PI / 2 - Math.PI / 2;
  }
  const cars: THREE.Object3D[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const car = new THREE.Group();
    car.position.set(Math.sin(a) * R, Math.cos(a) * R, 0);
    cube(1.6, 1.2, 1.4, [0xe8423a, 0x2a8ae0, 0xf6d23a, 0x3aa65a][i % 4], 0, -1.2, 0, car);
    wheel.add(car);
    cars.push(car);
  }
  wheel.userData.cars = cars;
  g.add(wheel);
  for (const s of [-1, 1]) {
    const leg = cube(0.5, 15, 0.5, 0xdddddd, s * 4, 7, -1.2, g);
    leg.rotation.z = s * 0.28;
    const leg2 = cube(0.5, 15, 0.5, 0xdddddd, s * 4, 7, 1.2, g);
    leg2.rotation.z = s * 0.28;
  }
  return g;
}

export function flag(color: number) {
  const g = new THREE.Group();
  cube(0.12, 4, 0.12, 0xdddddd, 0, 2, 0, g);
  const cloth = cube(1.4, 0.8, 0.04, color, 0.75, 3.5, 0, g);
  cloth.name = 'cloth';
  return g;
}

export function buoy() {
  const g = new THREE.Group();
  cube(0.8, 0.8, 0.8, 0xff5a1a, 0, 0, 0, g);
  cube(0.85, 0.2, 0.85, 0xffffff, 0, 0.2, 0, g);
  return g;
}

export function friesBucket() {
  const g = new THREE.Group();
  cube(0.45, 0.45, 0.45, 0xe0302a, 0, 0, 0, g);
  for (let i = 0; i < 9; i++) cube(0.06, 0.35, 0.06, 0xffd84a, -0.15 + (i % 3) * 0.15, 0.32, -0.15 + Math.floor(i / 3) * 0.15, g);
  return g;
}

export function lifeRing() {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.15, 6, 10), mat(0xffffff));
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.16, 6, 10, Math.PI / 2), mat(0xe8302a));
  m.add(stripe);
  return m;
}

export function shoppingCart() {
  const g = new THREE.Group();
  cube(1.2, 0.8, 0.8, 0xaaaaaa, 0, 0.6, 0, g);
  cube(1.1, 0.7, 0.7, 0x667788, 0, 0.65, 0, g);
  for (const [x, z] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]]) cube(0.15, 0.15, 0.15, 0x222222, x, 0.08, z, g);
  return g;
}

export function treasureChest() {
  const g = new THREE.Group();
  cube(1.2, 0.7, 0.8, 0x7a4a22, 0, 0.35, 0, g);
  const lid = new THREE.Group();
  lid.position.set(0, 0.7, -0.4);
  cube(1.2, 0.3, 0.8, 0x8a5a2a, 0, 0.15, 0.4, lid);
  lid.name = 'lid';
  g.add(lid);
  cube(1.25, 0.1, 0.85, 0xe0b030, 0, 0.6, 0, g);
  const brochure = cube(0.4, 0.04, 0.3, 0x1d2b4f, 0, 0.72, 0, g);
  brochure.name = 'brochure';
  return g;
}

export function fish(color: number) {
  const g = new THREE.Group();
  cube(0.2, 0.3, 0.6, color, 0, 0, 0, g);
  cube(0.05, 0.3, 0.2, color, 0, 0, -0.4, g);
  return g;
}

export function marlin() {
  const g = new THREE.Group();
  cube(0.7, 1.0, 3.2, 0x1f3a7a, 0, 0, 0, g);
  cube(0.6, 0.4, 2.8, 0xc8d0e0, 0, -0.45, 0, g);
  cube(0.1, 0.1, 1.8, 0x1f3a7a, 0, 0.1, 2.4, g); // bill
  cube(0.08, 1.4, 1.8, 0x2a4f9a, 0, 0.9, 0.2, g); // sail fin
  cube(0.08, 1.6, 0.4, 0x1f3a7a, 0, 0, -1.8, g).rotation.x = 0.2;
  return g;
}

export function payphone() {
  const g = new THREE.Group();
  cube(0.7, 1.2, 0.4, 0x8a8a90, 0, 1.4, 0, g);
  cube(0.2, 0.5, 0.15, 0x111111, -0.2, 1.5, 0.25, g);
  return g;
}

export function screwdriver() {
  const g = new THREE.Group();
  cube(0.08, 0.3, 0.08, 0xe8302a, 0, 0, 0, g);
  cube(0.03, 0.3, 0.03, 0xcccccc, 0, 0.3, 0, g);
  return g;
}

export function keys() {
  const g = new THREE.Group();
  cube(0.15, 0.15, 0.03, 0xf2d020, 0, 0, 0, g);
  cube(0.04, 0.25, 0.02, 0xcccccc, 0.08, -0.15, 0, g);
  return g;
}

export function bucket() {
  const g = new THREE.Group();
  cube(0.4, 0.45, 0.4, 0x3a8ae0, 0, 0, 0, g);
  cube(0.36, 0.05, 0.36, 0xff9aa0, 0, 0.2, 0, g);
  return g;
}

export function knife() {
  const g = new THREE.Group();
  cube(0.06, 0.15, 0.06, 0x5a3a1e, 0, 0, 0, g);
  cube(0.04, 0.25, 0.02, 0xdddddd, 0, 0.2, 0, g);
  return g;
}

export function tackleBox() {
  const g = new THREE.Group();
  cube(0.8, 0.4, 0.5, 0x2a7a3a, 0, 0.2, 0, g);
  cube(0.85, 0.05, 0.55, 0x1a5a2a, 0, 0.42, 0, g);
  return g;
}
