import { hash3 } from '../util';

/** World size of one detail voxel: 8 per world block, so a 3-block storey is 24 voxels tall. */
export const DV = 1 / 8;
/** Detail voxels per world block. */
export const DPB = 8;

/**
 * Material flags packed with a voxel's color. Jitter is per-voxel brightness noise (done in the
 * shader, so it costs nothing and does not break greedy merging).
 */
export interface VoxMat {
  /** 0..1 brightness noise between neighbouring voxels. Default 0.08. */
  jitter?: number;
  /** Glows (lamp bulbs, lit windows, neon). */
  emissive?: boolean;
  /** Glossy, picks up sky reflections (window panes, puddles, polished metal). */
  glass?: boolean;
}

/**
 * Pack a color and material into one cell value. Every solid cell has bit 24 set, so a cell is
 * air exactly when it is 0, even for pure black.
 */
export function vox(color: number, m: VoxMat = {}): number {
  const j = Math.max(0, Math.min(15, Math.round((m.jitter ?? 0.08) * 40)));
  const meta = 1 | (j << 1) | (m.emissive ? 32 : 0) | (m.glass ? 64 : 0);
  return ((meta << 24) | (color & 0xffffff)) >>> 0;
}

export const colorOf = (v: number) => v & 0xffffff;
export const metaOf = (v: number) => v >>> 24;
export const jitterOf = (v: number) => ((metaOf(v) >> 1) & 15) / 40;
export const isEmissive = (v: number) => (metaOf(v) & 32) !== 0;
export const isGlass = (v: number) => (metaOf(v) & 64) !== 0;

/** A paint: a fixed cell value, or a function of the voxel position (return 0 to skip). */
export type DPaint = number | ((x: number, y: number, z: number) => number);

/**
 * Dense box of detail voxels. Coordinates are integers from 0 to size-1. For buildings, +x runs
 * along the facade, +y is up, and the front faces -z (z = 0 is the street side).
 */
export class DetailGrid {
  readonly data: Uint32Array;
  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {
    this.data = new Uint32Array(sx * sy * sz);
  }

  idx(x: number, y: number, z: number) {
    return (y * this.sz + z) * this.sx + x;
  }

  inBounds(x: number, y: number, z: number) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.data[(y * this.sz + z) * this.sx + x];
  }

  set(x: number, y: number, z: number, v: number) {
    x |= 0;
    y |= 0;
    z |= 0;
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return;
    this.data[(y * this.sz + z) * this.sx + x] = v >>> 0;
  }

  /** Fill an inclusive box. A paint function can return 0 to leave a voxel alone. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: DPaint) {
    const ax = Math.max(0, Math.min(x0, x1)), bx = Math.min(this.sx - 1, Math.max(x0, x1));
    const ay = Math.max(0, Math.min(y0, y1)), by = Math.min(this.sy - 1, Math.max(y0, y1));
    const az = Math.max(0, Math.min(z0, z1)), bz = Math.min(this.sz - 1, Math.max(z0, z1));
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++) {
          if (typeof p === 'number') this.data[this.idx(x, y, z)] = p;
          else {
            const v = p(x, y, z);
            if (v) this.data[this.idx(x, y, z)] = v;
          }
        }
  }

  /** Empty an inclusive box (cut doors, windows, arches). */
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.box(x0, y0, z0, x1, y1, z1, 0);
  }

  /** Recolor only cells that are already solid. */
  paint(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: DPaint) {
    this.box(x0, y0, z0, x1, y1, z1, (x, y, z) => {
      if (!this.get(x, y, z)) return 0;
      return typeof p === 'number' ? p : p(x, y, z);
    });
  }

  /** Copy another grid in at an offset (air in the source is skipped). */
  stamp(src: DetailGrid, ox: number, oy: number, oz: number) {
    for (let y = 0; y < src.sy; y++)
      for (let z = 0; z < src.sz; z++)
        for (let x = 0; x < src.sx; x++) {
          const v = src.data[src.idx(x, y, z)];
          if (v) this.set(x + ox, y + oy, z + oz, v);
        }
  }

  /** Number of solid cells. */
  count() {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i]) n++;
    return n;
  }
}

/** Mix two hex colors. */
export function mix(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Scale a hex color's brightness. */
export function tint(hex: number, f: number) {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Paint that picks between colors by a stable hash, like stucco speckle or terracotta tiles. */
export function speck(seed: number, cells: number[], weights?: number[]): (x: number, y: number, z: number) => number {
  const w = weights ?? cells.map(() => 1);
  const total = w.reduce((s, v) => s + v, 0);
  return (x, y, z) => {
    let r = hash3(x * 7 + seed, y * 13 - seed, z * 5 + seed * 3) * total;
    for (let i = 0; i < cells.length; i++) {
      r -= w[i];
      if (r <= 0) return cells[i];
    }
    return cells[cells.length - 1];
  };
}
