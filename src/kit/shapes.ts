import { hash3 } from '../util';
import { DetailGrid, mix, tint, vox, type DPaint } from './grid';
import { DV } from './grid';

/**
 * Shape and surface-paint helpers shared by every prop builder (props.ts, nature.ts, camp.ts,
 * fences.ts). The look we aim for: chunky voxel forms whose detail comes mostly from paint, like
 * a hand-made voxel model. Darker undersides and rims, sparse light specks on top faces, bark
 * bands, canvas seams. Paint is free at runtime (greedy meshing keeps big flat faces as a few
 * quads as long as neighbouring cells match), so prefer paint over extra geometry.
 */

export interface PropModel {
  grid: DetailGrid;
  /** Grid cell that becomes the prop's (0, 0, 0): footprint center at ground level. */
  origin: [number, number, number];
  /** Collider half extents in world units (null = walk-through). */
  half: [number, number, number] | null;
  /** World size of one cell. DV (1/8 block) for street props; DV * 2 for big chunky nature props. */
  size: number;
}

/** Make a prop model: an sx * sy * sz grid whose origin is its bottom center. */
export function make(sx: number, sy: number, sz: number, half: PropModel['half'], draw: (g: DetailGrid, cx: number, cz: number) => void, size = DV): PropModel {
  const g = new DetailGrid(sx, sy, sz);
  const cx = Math.floor(sx / 2), cz = Math.floor(sz / 2);
  draw(g, cx, cz);
  return { grid: g, origin: [sx / 2, 0, sz / 2], half, size };
}

/** Vertical cylinder of cells. */
export function cyl(g: DetailGrid, cx: number, cz: number, r: number, y0: number, y1: number, p: DPaint) {
  for (let y = y0; y <= y1; y++)
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
        if (dx * dx + dz * dz > r * r) continue;
        const v = typeof p === 'number' ? p : p(x, y, z);
        if (v) g.set(x, y, z, v);
      }
}

/** Rough sphere; cells on the outer shell are dropped by hash (keep = fraction kept). */
export function blob(g: DetailGrid, cx: number, cy: number, cz: number, r: number, p: DPaint, keep = 0.85, seed = 0) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > r) continue;
        if (d > r - 1.5 && hash3(x + seed, y, z) > keep) continue;
        const v = typeof p === 'number' ? p : p(x, y, z);
        if (v) g.set(x, y, z, v);
      }
}

/** Draw a straight line of cells (ropes, branches, guy lines). `r` thickens it to a small cube. */
export function line(g: DetailGrid, a: [number, number, number], b: [number, number, number], p: DPaint, r = 0) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]))));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(a[0] + (b[0] - a[0]) * t), y = Math.round(a[1] + (b[1] - a[1]) * t), z = Math.round(a[2] + (b[2] - a[2]) * t);
    g.box(x - r, y - r, z - r, x + r, y + r, z + r, p);
  }
}

/** Three tones of one surface: the body color, a highlight for specks, a shadow for rims. */
export interface Shade {
  base: number;
  light: number;
  dark: number;
  /** Per-cell brightness noise (see vox). Default 0.05. */
  jitter?: number;
}

/** Shade from one color: light and dark are derived. */
export function shadeOf(base: number, jitter = 0.05): Shade {
  return { base, light: mix(base, 0xffffff, 0.35), dark: tint(base, 0.68), jitter };
}

export const SHADES = {
  birchLeaf: { base: 0x8cc63f, light: 0xc4ea86, dark: 0x3f9a2c } as Shade,
  oakLeaf: { base: 0x5ea83a, light: 0x9ad06a, dark: 0x2f6e25 } as Shade,
  oakLeafDark: { base: 0x3f8a33, light: 0x78b55a, dark: 0x22561f } as Shade,
  pineLeaf: { base: 0x2f6e44, light: 0x6aa86a, dark: 0x1b4630 } as Shade,
  pineLeafB: { base: 0x3a7a3e, light: 0x78b46a, dark: 0x1f4e2a } as Shade,
  palmLeaf: { base: 0x58a83a, light: 0x96d062, dark: 0x2f6e22 } as Shade,
  acaciaLeaf: { base: 0x7a9a3a, light: 0xaec46a, dark: 0x4a6624 } as Shade,
  hedge: { base: 0x3a7d34, light: 0x6aab55, dark: 0x22521f } as Shade,
  canvas: { base: 0xd9c8a0, light: 0xeee2c2, dark: 0xa8956c } as Shade,
};

/**
 * A chunky foliage (or cloth, or hedge) block with painted detail: a darker underside whose top
 * edge is ragged, sparse light specks on the top face and upper sides, a few darker specks, and
 * nibbled top corners so the silhouette is not a perfect box.
 */
export function puff(g: DetailGrid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s: Shade, seed = 0) {
  const j = s.jitter ?? 0.05;
  const B = vox(s.base, { jitter: j }), L = vox(s.light, { jitter: 0.02 }), D = vox(s.dark, { jitter: j }), M = vox(mix(s.base, s.dark, 0.5), { jitter: j });
  const h = y1 - y0;
  g.box(x0, y0, z0, x1, y1, z1, (x, y, z) => {
    const ex = x === x0 || x === x1, ez = z === z0 || z === z1;
    const r = hash3(x * 3 + seed, y * 7 - seed, z * 5 + seed * 11);
    // Nibbled top corners and a few missing top-edge cells.
    if (y === y1 && ex && ez) return 0;
    if (y === y1 && (ex || ez) && r < 0.12) return 0;
    if (y === y0) return D;
    if (h > 3 && y === y0 + 1 && (ex || ez) && r < 0.6) return D;
    if (h > 5 && y === y0 + 2 && (ex || ez) && r < 0.18) return D;
    if (y === y1 && r > 0.93) return L;
    if ((ex || ez) && y > y0 + h * 0.5 && r > 0.975) return L;
    if ((ex || ez) && r < 0.03) return M;
    return B;
  });
}

/** Birch bark: chalky white with short dark dashes. */
export function birchBark(seed = 0): (x: number, y: number, z: number) => number {
  const W = vox(0xeee9df, { jitter: 0.04 }), K = vox(0x3a3029, { jitter: 0.06 }), G = vox(0xbdb6aa, { jitter: 0.04 });
  return (x, y, z) => {
    // Short dark dashes: about a third of the rows carry one, wrapping part way round.
    if (hash3(y + seed, 3, 7) > 0.66 && hash3(x * 3 + z * 5, y, seed) > 0.3) return K;
    if (hash3(x + seed, y, z) > 0.92) return G;
    return W;
  };
}

/** Rough brown bark with vertical grooves. */
export function roughBark(base = 0x6b4a2e, seed = 0): (x: number, y: number, z: number) => number {
  const A = vox(base, { jitter: 0.08 }), D = vox(tint(base, 0.7), { jitter: 0.06 }), L = vox(mix(base, 0xffffff, 0.18), { jitter: 0.06 });
  return (x, y, z) => {
    const groove = hash3(x + seed, Math.floor(y / 3), z) > 0.78;
    if (groove) return D;
    if (hash3(x, y + seed, z) > 0.93) return L;
    return A;
  };
}

/** Pick a cell by hash among weighted options (like grid.speck, but takes colors). */
export function scatter(seed: number, colors: number[], jitter = 0.06) {
  const cells = colors.map((c) => vox(c, { jitter }));
  return (x: number, y: number, z: number) => cells[Math.floor(hash3(x * 7 + seed, y * 13, z * 5 - seed) * cells.length) % cells.length];
}
