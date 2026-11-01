import * as THREE from 'three';
import { hash3 } from '../util';
import { vox } from '../kit/grid';
import { meshGrid } from '../kit/mesher';

/** World size of one character voxel. A full adult is about 67 voxels (~1.8 units) tall. */
export const VOXEL = 0.027;

/** A color, or a function that picks a color per voxel (for straw, plaid, stains...). */
export type Paint = number | ((x: number, y: number, z: number) => number | null);

const KEY_OFF = 512;
const key = (x: number, y: number, z: number) =>
  ((x + KEY_OFF) & 1023) | (((y + KEY_OFF) & 1023) << 10) | (((z + KEY_OFF) & 1023) << 20);

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

  /** Move every voxel that matches `pred` into a new grid (same coordinates) and return it. */
  split(pred: (x: number, y: number, z: number) => boolean): VoxelGrid {
    const out = new VoxelGrid(this.jitter, this.seed);
    for (const [k, v] of [...this.cells]) {
      if (!pred(v.x, v.y, v.z)) continue;
      out.set(v.x, v.y, v.z, v.c);
      this.cells.delete(k);
    }
    return out;
  }

  /** Visit every voxel. */
  forEach(fn: (x: number, y: number, z: number, c: number) => void) {
    for (const { x, y, z, c } of this.cells.values()) fn(x, y, z, c);
  }

  /**
   * Mesh the grid with the building kit's greedy mesher: faces that share a color and corner AO
   * merge into one quad, and per-voxel brightness noise is added in the shader (charMaterial), so
   * a flat shirt front is a few triangles while a face keeps every pixel.
   *
   * `origin` (in voxel units, integers) becomes the geometry's (0,0,0).
   */
  toGeometry(origin: [number, number, number], size = VOXEL): THREE.BufferGeometry {
    if (!this.cells.size) return new THREE.BufferGeometry();
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const { x, y, z } of this.cells.values()) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (z < z0) z0 = z;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      if (z > z1) z1 = z;
    }
    // One empty cell of padding on every side so outer faces get proper AO samples.
    x0--; y0--; z0--;
    const sx = x1 - x0 + 2, sy = y1 - y0 + 2, sz = z1 - z0 + 2;
    const data = new Uint32Array(sx * sy * sz);
    const jit = (j: number) => vox(0, { jitter: j }) & 0xff000000;
    const meta = jit(this.jitter);
    for (const { x, y, z, c } of this.cells.values()) data[((y - y0) * sz + (z - z0)) * sx + (x - x0)] = (meta | (c & 0xffffff)) >>> 0;
    return meshGrid({ data, sx, sy, sz }, { origin: [origin[0] - x0, origin[1] - y0, origin[2] - z0], size, ao: 0.9 });
  }
}

/**
 * A per-person material (tint and flash change it, so it is never shared between people). It
 * reads the kit mesher's vmeta attribute and adds per-voxel brightness noise in the shader.
 */
export function charMaterial(size = VOXEL): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.voxInv = { value: 1 / size };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 vmeta;
uniform float voxInv;
varying float vJit;
varying vec3 vVox;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vJit = vmeta.x;
vVox = position * voxInv - normal * 0.5;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vJit;
varying vec3 vVox;
float chHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 1.0 + (chHash(floor(vVox + 0.001) + 17.0) - 0.5) * 2.0 * vJit;`);
  };
  mat.customProgramCacheKey = () => `charvox:${size}`;
  return mat;
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
