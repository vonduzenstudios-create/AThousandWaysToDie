import { hash3 } from '../util';
import { VoxelGrid, shade, mixHex } from '../chars/grid';

export { shade, mixHex };

/** A color, or a function that picks one per voxel (null leaves the voxel alone). */
export type Paint = number | ((x: number, y: number, z: number) => number | null);
type V3 = readonly [number, number, number];

const pick = (p: Paint, x: number, y: number, z: number) => (typeof p === 'number' ? p : p(x, y, z));

/**
 * A VoxelGrid with sculpting tools for animals: rounded blobs, tapered limbs and surface decals.
 * Coordinates are voxels: +x is the animal's left, +y up, +z forward (the face).
 */
export class Sculpt extends VoxelGrid {
  /**
   * Fill a rounded blob centered on (cx, cy, cz) with half-sizes (rx, ry, rz). `n` sets the shape:
   * 2 is an ellipsoid, 3-4 is a boxy pillow (the chunky look of hand-made voxel animals).
   */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, p: Paint, n = 2.4) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const d = Math.abs((x - cx) / (rx + 0.01)) ** n + Math.abs((y - cy) / (ry + 0.01)) ** n + Math.abs((z - cz) / (rz + 0.01)) ** n;
          if (d > 1) continue;
          const c = pick(p, x, y, z);
          if (c !== null) this.set(x, y, z, c);
        }
    return this;
  }

  /** A tapered limb from a to b, radius r0 at a and r1 at b, with a rounded-square cross-section. */
  limb(a: V3, b: V3, r0: number, r1: number, p: Paint) {
    const [ax, ay, az] = a, [bx, by, bz] = b;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L2 = dx * dx + dy * dy + dz * dz || 1;
    const R = Math.max(r0, r1) + 1;
    for (let y = Math.floor(Math.min(ay, by) - R); y <= Math.ceil(Math.max(ay, by) + R); y++)
      for (let z = Math.floor(Math.min(az, bz) - R); z <= Math.ceil(Math.max(az, bz) + R); z++)
        for (let x = Math.floor(Math.min(ax, bx) - R); x <= Math.ceil(Math.max(ax, bx) + R); x++) {
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2));
          const px = x - (ax + dx * t), py = y - (ay + dy * t), pz = z - (az + dz * t);
          const r = r0 + (r1 - r0) * t + 0.35;
          if (px ** 4 + py ** 4 + pz ** 4 > r ** 4) continue;
          const c = pick(p, x, y, z);
          if (c !== null) this.set(x, y, z, c);
        }
    return this;
  }

  /** A chain of limbs through several points (necks, tails, trunks). Radii per point. */
  chain(pts: V3[], radii: number[], p: Paint) {
    for (let i = 0; i < pts.length - 1; i++) this.limb(pts[i], pts[i + 1], radii[i], radii[i + 1], p);
    return this;
  }

  /**
   * A flat triangle (fins, flukes, wing plates). Points are 2D in the plane named by `plane`
   * ('yz' for vertical fins seen from the side, 'xz' for flat flukes and wings); `t0..t1` is the
   * plate's extent along the remaining axis.
   */
  tri(plane: 'yz' | 'xz' | 'xy', a: [number, number], b: [number, number], c: [number, number], t0: number, t1: number, p: Paint) {
    const minU = Math.floor(Math.min(a[0], b[0], c[0])), maxU = Math.ceil(Math.max(a[0], b[0], c[0]));
    const minV = Math.floor(Math.min(a[1], b[1], c[1])), maxV = Math.ceil(Math.max(a[1], b[1], c[1]));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-6) return this;
    for (let u = minU; u <= maxU; u++)
      for (let v = minV; v <= maxV; v++) {
        const w0 = ((b[0] - u) * (c[1] - v) - (c[0] - u) * (b[1] - v)) / area;
        const w1 = ((c[0] - u) * (a[1] - v) - (a[0] - u) * (c[1] - v)) / area;
        const w2 = 1 - w0 - w1;
        const e = -0.08;
        if (w0 < e || w1 < e || w2 < e) continue;
        for (let t = t0; t <= t1; t++) {
          const [x, y, z] = plane === 'yz' ? [t, u, v] : plane === 'xz' ? [u, t, v] : [u, v, t];
          const col = pick(p, x, y, z);
          if (col !== null) this.set(x, y, z, col);
        }
      }
    return this;
  }

  /** Mirror everything a builder draws on +x onto -x as well. */
  sym(fn: (s: 1 | -1) => void) {
    fn(1);
    fn(-1);
    return this;
  }

  /** Recolor every existing voxel the predicate picks. */
  recolor(pred: (x: number, y: number, z: number, c: number) => boolean, p: Paint) {
    const hits: [number, number, number, number][] = [];
    this.forEach((x, y, z, c) => {
      if (pred(x, y, z, c)) hits.push([x, y, z, c]);
    });
    for (const [x, y, z] of hits) {
      const c = pick(p, x, y, z);
      if (c !== null) this.set(x, y, z, c);
    }
    return this;
  }

  /**
   * Find the outermost voxel on a surface. Marches from outside toward the body along `dir`
   * (e.g. 'z-' looks at the front face from the front) through column (u, v).
   * Returns its coordinates or null.
   */
  surface(dir: 'x+' | 'x-' | 'y-' | 'z-' | 'z+', a: number, b: number, from = 80): V3 | null {
    for (let i = from; i >= -from; i--) {
      const q: V3 =
        dir === 'z-' ? [a, b, i] : dir === 'z+' ? [a, b, -i] : dir === 'x-' ? [i, a, b] : dir === 'x+' ? [-i, a, b] : [a, i, b];
      if (this.has(q[0], q[1], q[2])) return q;
    }
    return null;
  }

  /** Paint the front-facing (+z) surface voxel at (x, y). `out` pushes it forward instead (raised detail). */
  front(x: number, y: number, c: number, out = 0) {
    const q = this.surface('z-', x, y);
    if (!q) return this;
    if (out > 0) for (let i = 1; i <= out; i++) this.set(x, y, q[2] + i, c);
    else this.set(q[0], q[1], q[2], c);
    return this;
  }

  /** Paint the side surface voxel at (y, z) on side s (+1 = +x). */
  side(s: 1 | -1, y: number, z: number, c: number, out = 0) {
    const q = this.surface(s > 0 ? 'x-' : 'x+', y, z);
    if (!q) return this;
    if (out > 0) for (let i = 1; i <= out; i++) this.set(q[0] + s * i, y, z, c);
    else this.set(q[0], q[1], q[2], c);
    return this;
  }

  /** Paint the top surface voxel at (x, z). */
  top(x: number, z: number, c: number, out = 0) {
    const q = this.surface('y-', x, z);
    if (!q) return this;
    if (out > 0) for (let i = 1; i <= out; i++) this.set(x, q[1] + i, z, c);
    else this.set(q[0], q[1], q[2], c);
    return this;
  }
}

// ---------------------------------------------------------------------------------------------
// Paints
// ---------------------------------------------------------------------------------------------

/**
 * Patchy fur: blocky clumps a shade lighter or darker than the base, like the hand-shaded fur in
 * the reference renders. `scale` is the clump size in voxels.
 */
export function fur(base: number, o: { seed?: number; scale?: number; dark?: number; light?: number; amount?: number } = {}): (x: number, y: number, z: number) => number {
  const sd = o.seed ?? 1, sc = o.scale ?? 2.5, amt = o.amount ?? 0.32;
  const dark = o.dark ?? 0.84, light = o.light ?? 1.12;
  return (x, y, z) => {
    const n = hash3(Math.floor(x / sc) + sd * 31, Math.floor(y / (sc * 0.8)) - sd * 17, Math.floor(z / (sc * 1.3)) + sd * 7);
    if (n < amt * 0.5) return shade(base, dark);
    if (n > 1 - amt * 0.5) return shade(base, light);
    return base;
  };
}

/** Two coats split by height: `top` above y = split, `under` below (bellies, socks). */
export function split(top: Paint, under: Paint, splitY: number): (x: number, y: number, z: number) => number | null {
  return (x, y, z) => pick(y >= splitY ? top : under, x, y, z);
}

/** Stripes along z (zebra, tiger): `w` voxels of `b` every `period` voxels, wobbling with height. */
export function stripes(a: Paint, b: number, period: number, w: number, wobble = 0.35): (x: number, y: number, z: number) => number | null {
  return (x, y, z) => {
    const k = (((z + Math.round(Math.abs(x) * 0.15 + y * wobble)) % period) + period) % period;
    return k < w ? b : pick(a, x, y, z);
  };
}

/** Blocky spots (giraffe patches, leopard rosettes). */
export function spots(base: Paint, spot: number, cell: number, fill = 0.72, seed = 3): (x: number, y: number, z: number) => number | null {
  return (x, y, z) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    // Leave a 1-voxel seam between patches so the base shows as a net.
    const seam = ((x % cell) + cell) % cell === 0 || ((y % cell) + cell) % cell === 0 || ((z % cell) + cell) % cell === 0;
    if (!seam && hash3(cx + seed, cy * 3, cz - seed) < fill) return spot;
    return pick(base, x, y, z);
  };
}
