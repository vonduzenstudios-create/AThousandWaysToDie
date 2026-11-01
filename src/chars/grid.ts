import * as THREE from 'three';
import { hash3 } from '../util';

/** World size of one character voxel. A full adult is about 25 voxels (~1.8 units) tall. */
export const VOXEL = 0.072;

/** A color, or a function that picks a color per voxel (for straw, plaid, stains...). */
export type Paint = number | ((x: number, y: number, z: number) => number | null);

const KEY_OFF = 512;
const key = (x: number, y: number, z: number) =>
  ((x + KEY_OFF) & 1023) | (((y + KEY_OFF) & 1023) << 10) | (((z + KEY_OFF) & 1023) << 20);

const AO_CURVE = [0.55, 0.72, 0.87, 1.0];

/**
 * Sparse voxel grid used to paint one body part or accessory. Coordinates are integers and may
 * go negative, so a hat brim or a shoe toe can stick out past the part's collision box.
 * +x is the character's left, +y is up, +z is forward (the face).
 */
export class VoxelGrid {
  private cells = new Map<number, { x: number; y: number; z: number; c: number }>();

  /** How much random brightness each voxel gets, so flat colors read as individual blocks. */
  constructor(public jitter = 0.07, public seed = 0) {}

  get size() {
    return this.cells.size;
  }

  set(x: number, y: number, z: number, c: number | null) {
    const k = key(x, y, z);
    if (c === null) this.cells.delete(k);
    else this.cells.set(k, { x, y, z, c });
  }

  get(x: number, y: number, z: number): number | null {
    return this.cells.get(key(x, y, z))?.c ?? null;
  }

  has(x: number, y: number, z: number) {
    return this.cells.has(key(x, y, z));
  }

  /** Fill an inclusive box. A paint function can return null to leave a voxel alone. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: Paint) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          const c = typeof p === 'number' ? p : p(x, y, z);
          if (c !== null) this.set(x, y, z, c);
        }
  }

  /** Recolor only voxels that already exist (paint onto a surface). */
  paint(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: Paint) {
    this.box(x0, y0, z0, x1, y1, z1, (x, y, z) => {
      if (!this.has(x, y, z)) return null;
      return typeof p === 'number' ? p : p(x, y, z);
    });
  }

  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, null);
  }

  /**
   * Mesh the grid: one quad per exposed voxel face, per-vertex ambient occlusion, per-voxel color
   * jitter and baked face shading. `origin` (in voxel units) becomes the geometry's (0,0,0).
   */
  toGeometry(origin: [number, number, number], size = VOXEL): THREE.BufferGeometry {
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const ind: number[] = [];
    const color = new THREE.Color();
    const solid = (x: number, y: number, z: number) => (this.cells.has(key(x, y, z)) ? 1 : 0);
    const [ox, oy, oz] = origin;

    for (const { x, y, z, c } of this.cells.values()) {
      color.setHex(c);
      const f = 1 + (hash3(x + this.seed * 31, y, z - this.seed * 17) - 0.5) * 2 * this.jitter;
      for (let a = 0; a < 3; a++)
        for (const s of [1, -1]) {
          const nv = [0, 0, 0];
          nv[a] = s;
          if (solid(x + nv[0], y + nv[1], z + nv[2])) continue;
          const u = (a + 1) % 3;
          const v = (a + 2) % 3;
          const L = [x + nv[0], y + nv[1], z + nv[2]];
          const corners = s > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
          const aos: number[] = [];
          const base = pos.length / 3;
          const faceShade = a === 1 ? (s > 0 ? 1 : 0.62) : a === 0 ? 0.84 : 0.93;
          for (const [du, dv] of corners) {
            const p = [x, y, z];
            p[a] += s > 0 ? 1 : 0;
            p[u] += du;
            p[v] += dv;
            const s1 = L.slice();
            s1[u] += du ? 1 : -1;
            const s2 = L.slice();
            s2[v] += dv ? 1 : -1;
            const cc = L.slice();
            cc[u] += du ? 1 : -1;
            cc[v] += dv ? 1 : -1;
            const o1 = solid(s1[0], s1[1], s1[2]);
            const o2 = solid(s2[0], s2[1], s2[2]);
            const o3 = solid(cc[0], cc[1], cc[2]);
            const ao = o1 && o2 ? 0 : 3 - (o1 + o2 + o3);
            aos.push(ao);
            pos.push((p[0] - ox) * size, (p[1] - oy) * size, (p[2] - oz) * size);
            nor.push(nv[0], nv[1], nv[2]);
            const k = f * AO_CURVE[ao] * faceShade;
            col.push(color.r * k, color.g * k, color.b * k);
          }
          if (aos[0] + aos[2] > aos[1] + aos[3]) ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
          else ind.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(ind);
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Mix two hex colors. */
export function mixHex(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Scale a hex color's brightness. */
export function shade(hex: number, f: number) {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A paint that picks randomly (but stably) between several colors, like woven straw. */
export function speckle(seed: number, colors: number[], weights?: number[]): (x: number, y: number, z: number) => number {
  const w = weights ?? colors.map(() => 1);
  const total = w.reduce((s, v) => s + v, 0);
  return (x, y, z) => {
    let r = hash3(x * 7 + seed, y * 13 - seed, z * 5 + seed * 3) * total;
    for (let i = 0; i < colors.length; i++) {
      r -= w[i];
      if (r <= 0) return colors[i];
    }
    return colors[colors.length - 1];
  };
}
