import { B, type VoxelWorld } from '../voxel';
import type { LifeNav, V3 } from './types';

/** A point on a path. */
export interface PathPt {
  x: number;
  y: number;
  z: number;
}

/**
 * Build a LifeNav straight from a voxel world. A column is walkable where there is a
 * solid floor with two blocks of headroom; the lowest such floor wins, so the
 * insides of buildings under roofs count. Works on flat towns and on terrain.
 */
export function voxelNav(
  world: VoxelWorld,
  opts: {
    bounds?: LifeNav['bounds'];
    /** Floors above this height are ignored (rooftops, tree tops). */
    maxFloor?: number;
    /** Floors below this height are ignored. */
    minFloor?: number;
    /** Blocks people refuse to stand on (water, lava, hay). */
    avoid?: number[];
    /** Cost per floor block type. Default: sidewalks and paths cheap, roads expensive. */
    costs?: Record<number, number>;
    maxStep?: number;
  } = {},
): LifeNav {
  const bounds = opts.bounds ?? { x0: 0, z0: 0, x1: world.sx - 1, z1: world.sz - 1 };
  const w = bounds.x1 - bounds.x0 + 1;
  const d = bounds.z1 - bounds.z0 + 1;
  const floor = new Int16Array(w * d).fill(-1);
  const block = new Uint8Array(w * d);
  const avoid = new Set(opts.avoid ?? []);
  const minF = opts.minFloor ?? 1;
  const maxF = opts.maxFloor ?? world.sy - 2;
  const costs: Record<number, number> = opts.costs ?? {
    [B.Sidewalk]: 0.6,
    [B.Gravel]: 0.75,
    [B.Plank]: 0.8,
    [B.Concrete]: 0.8,
    [B.Asphalt]: 3,
    [B.Yellow]: 3,
    [B.Flower]: 1.4,
  };
  for (let z = 0; z < d; z++)
    for (let x = 0; x < w; x++) {
      const wx = bounds.x0 + x, wz = bounds.z0 + z;
      for (let y = minF; y <= maxF; y++) {
        const below = world.get(wx, y - 1, wz);
        if (below && !world.get(wx, y, wz) && !world.get(wx, y + 1, wz)) {
          if (!avoid.has(below)) {
            floor[z * w + x] = y;
            block[z * w + x] = below;
          }
          break;
        }
      }
    }
  const at = (x: number, z: number) => {
    const ix = Math.floor(x) - bounds.x0, iz = Math.floor(z) - bounds.z0;
    if (ix < 0 || iz < 0 || ix >= w || iz >= d) return -1;
    return iz * w + ix;
  };
  return {
    bounds,
    maxStep: opts.maxStep,
    walkable: (x, z) => {
      const i = at(x, z);
      return i >= 0 && floor[i] >= 0;
    },
    groundAt: (x, z) => {
      const i = at(x, z);
      return i >= 0 && floor[i] >= 0 ? floor[i] : 0;
    },
    cost: (x, z) => {
      const i = at(x, z);
      return i >= 0 ? costs[block[i]] ?? 1 : 1;
    },
  };
}

/** Binary min-heap of cell indices keyed by a Float32Array of scores. */
class Heap {
  private items: number[] = [];
  constructor(private score: Float32Array) {}
  get size() {
    return this.items.length;
  }
  clear() {
    this.items.length = 0;
  }
  push(i: number) {
    const a = this.items;
    a.push(i);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[c]]) break;
      [a[p], a[c]] = [a[c], a[p]];
      c = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1, r = l + 1;
        let m = p;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === p) break;
        [a[p], a[m]] = [a[m], a[p]];
        p = m;
      }
    }
    return top;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/**
 * Path-finding grid over a LifeNav: one cell per voxel column, 8-way A*, connected
 * regions for instant "unreachable" answers, string-pulled paths and a path cache.
 */
export class NavGrid {
  readonly x0: number;
  readonly z0: number;
  readonly w: number;
  readonly d: number;
  readonly height: Float32Array;
  readonly cost: Float32Array;
  /** Connected region per cell, -1 for blocked. */
  readonly region: Int32Array;
  private readonly maxStep: number;
  private g: Float32Array;
  private f: Float32Array;
  private came: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private gen = 1;
  private heap: Heap;
  private cache = new Map<string, PathPt[]>();
  /** Searches run this frame; the life system resets it every frame. */
  searches = 0;

  constructor(nav: LifeNav) {
    const b = nav.bounds;
    this.x0 = b.x0;
    this.z0 = b.z0;
    this.w = b.x1 - b.x0 + 1;
    this.d = b.z1 - b.z0 + 1;
    const n = this.w * this.d;
    this.maxStep = nav.maxStep ?? 1.1;
    this.height = new Float32Array(n).fill(NaN);
    this.cost = new Float32Array(n).fill(1);
    for (let z = 0; z < this.d; z++)
      for (let x = 0; x < this.w; x++) {
        const wx = x + this.x0 + 0.5, wz = z + this.z0 + 0.5;
        const i = z * this.w + x;
        if (nav.walkable(wx, wz)) {
          this.height[i] = nav.groundAt(wx, wz);
          this.cost[i] = Math.max(0.2, nav.cost?.(wx, wz) ?? 1);
        }
      }
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.came = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Heap(this.f);
    this.region = new Int32Array(n).fill(-1);
    this.labelRegions();
  }

  private labelRegions() {
    let next = 0;
    const stack: number[] = [];
    for (let s = 0; s < this.region.length; s++) {
      if (this.region[s] !== -1 || Number.isNaN(this.height[s])) continue;
      this.region[s] = next;
      stack.push(s);
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % this.w, z = (i / this.w) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DIRS[k][0], nz = z + DIRS[k][1];
          if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.d) continue;
          const j = nz * this.w + nx;
          if (this.region[j] !== -1 || !this.step(i, j)) continue;
          this.region[j] = next;
          stack.push(j);
        }
      }
      next++;
    }
  }

  private step(i: number, j: number) {
    const hj = this.height[j];
    return !Number.isNaN(hj) && Math.abs(hj - this.height[i]) <= this.maxStep;
  }

  cellOf(x: number, z: number) {
    const ix = Math.floor(x) - this.x0, iz = Math.floor(z) - this.z0;
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.d) return -1;
    return iz * this.w + ix;
  }

  walkable(x: number, z: number) {
    const i = this.cellOf(x, z);
    return i >= 0 && !Number.isNaN(this.height[i]);
  }

  groundAt(x: number, z: number) {
    const i = this.cellOf(x, z);
    if (i < 0) return 0;
    const h = this.height[i];
    return Number.isNaN(h) ? 0 : h;
  }

  regionAt(x: number, z: number) {
    const i = this.cellOf(x, z);
    return i < 0 ? -1 : this.region[i];
  }

  private center(i: number): PathPt {
    return { x: (i % this.w) + this.x0 + 0.5, y: this.height[i], z: ((i / this.w) | 0) + this.z0 + 0.5 };
  }

  /** Nearest walkable cell center to a point (searching outward), optionally in a given region. */
  nearest(p: { x: number; z: number }, maxR = 12, region = -1): PathPt | null {
    const cx = Math.floor(p.x) - this.x0, cz = Math.floor(p.z) - this.z0;
    for (let r = 0; r <= maxR; r++) {
      let best = -1, bd = Infinity;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= this.w || z >= this.d) continue;
          const i = z * this.w + x;
          if (Number.isNaN(this.height[i])) continue;
          if (region >= 0 && this.region[i] !== region) continue;
          const dd = dx * dx + dz * dz;
          if (dd < bd) (bd = dd), (best = i);
        }
      if (best >= 0) {
        const c = this.center(best);
        // Keep the exact point if it is already on that cell.
        if (r === 0) return { x: p.x, y: c.y, z: p.z };
        return c;
      }
    }
    return null;
  }

  /** Can someone walk straight from a to b? Samples the line every quarter voxel. */
  lineClear(a: PathPt, b: PathPt) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len * 4));
    let prev = this.cellOf(a.x, a.z);
    if (prev < 0 || Number.isNaN(this.height[prev])) return false;
    // Keep a little clearance so people don't scrape along walls.
    const px = (-dz / (len || 1)) * 0.3, pz = (dx / (len || 1)) * 0.3;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = a.x + dx * t, z = a.z + dz * t;
      const i = this.cellOf(x, z);
      if (i < 0 || Number.isNaN(this.height[i])) return false;
      if (i !== prev && !this.step(prev, i)) return false;
      if (Math.abs(this.cost[i] - this.cost[prev]) > 0.5 && this.cost[i] > 1.5) return false; // don't shortcut across roads
      if (!this.walkable(x + px, z + pz) || !this.walkable(x - px, z - pz)) return false;
      prev = i;
    }
    return true;
  }

  /**
   * Find a path. Returns smoothed waypoints from start (exclusive) to goal (inclusive),
   * or null if the goal is unreachable or the search ran out of budget.
   */
  find(from: { x: number; z: number }, to: { x: number; z: number }, maxExpand = 40000): PathPt[] | null {
    const sp = this.nearest(from, 4);
    if (!sp) return null;
    const s = this.cellOf(sp.x, sp.z);
    const gp = this.nearest(to, 10, this.region[s]);
    if (!gp) return null;
    const t = this.cellOf(gp.x, gp.z);
    const key = s + '|' + t;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit.map((p) => ({ ...p }));
    }
    const exact = { x: gp.x, y: gp.y, z: gp.z };
    if (s === t || this.lineClear(sp, exact)) return [exact];
    this.searches++;
    const raw = this.astar(s, t, maxExpand);
    if (!raw) return null;
    const pts = raw.map((i) => this.center(i));
    pts[pts.length - 1] = exact;
    const smooth = this.smooth({ ...sp }, pts);
    this.cache.set(key, smooth);
    if (this.cache.size > 600) this.cache.delete(this.cache.keys().next().value!);
    return smooth.map((p) => ({ ...p }));
  }

  private astar(s: number, t: number, maxExpand: number): number[] | null {
    const gen = ++this.gen;
    const { g, f, came, stamp, closed, w } = this;
    const tx = t % w, tz = (t / w) | 0;
    const h = (i: number) => {
      const dx = Math.abs((i % w) - tx), dz = Math.abs(((i / w) | 0) - tz);
      // Octile distance scaled by the cheapest cost so the heuristic stays admissible.
      return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * 0.55;
    };
    const heap = this.heap;
    heap.clear();
    stamp[s] = gen;
    g[s] = 0;
    f[s] = h(s);
    came[s] = -1;
    heap.push(s);
    let expanded = 0;
    while (heap.size) {
      const i = heap.pop();
      if (closed[i] === gen) continue;
      closed[i] = gen;
      if (i === t) {
        const out: number[] = [];
        for (let c = t; c !== -1; c = came[c]) out.push(c);
        out.reverse();
        out.shift();
        return out;
      }
      if (++expanded > maxExpand) return null;
      const x = i % w, z = (i / w) | 0;
      for (let k = 0; k < 8; k++) {
        const [ddx, ddz, len] = DIRS[k];
        const nx = x + ddx, nz = z + ddz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= this.d) continue;
        const j = nz * w + nx;
        if (closed[j] === gen || !this.step(i, j)) continue;
        if (k >= 4) {
          // No cutting corners past walls.
          if (!this.step(i, z * w + nx) || !this.step(i, nz * w + x)) continue;
        }
        const climb = Math.abs(this.height[j] - this.height[i]) > 0.3 ? 4 : 0;
        const ng = g[i] + len * (this.cost[i] + this.cost[j]) * 0.5 + climb;
        if (stamp[j] === gen && ng >= g[j]) continue;
        stamp[j] = gen;
        g[j] = ng;
        f[j] = ng + h(j);
        came[j] = i;
        heap.push(j);
      }
    }
    return null;
  }

  /** String-pull a grid path: skip waypoints whenever the straight line is clear. */
  private smooth(start: PathPt, pts: PathPt[]): PathPt[] {
    const out: PathPt[] = [];
    let anchor = start;
    let i = 0;
    while (i < pts.length) {
      let j = Math.min(pts.length - 1, i + 24);
      while (j > i && !this.lineClear(anchor, pts[j])) j--;
      out.push(pts[j]);
      anchor = pts[j];
      i = j + 1;
    }
    return out;
  }

  /** A random walkable point inside a box (or near a point), in the given region. */
  randomIn(rng: () => number, box: { min: { x: number; z: number }; max: { x: number; z: number } }, region = -1): PathPt | null {
    for (let k = 0; k < 30; k++) {
      const x = box.min.x + rng() * (box.max.x - box.min.x);
      const z = box.min.z + rng() * (box.max.z - box.min.z);
      const i = this.cellOf(x, z);
      if (i < 0 || Number.isNaN(this.height[i])) continue;
      if (region >= 0 && this.region[i] !== region) continue;
      return { x, y: this.height[i], z };
    }
    return this.nearest({ x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 }, 8, region);
  }

  /** Main region: the biggest connected area, where most life happens. */
  mainRegion() {
    const counts = new Map<number, number>();
    for (const r of this.region) if (r >= 0) counts.set(r, (counts.get(r) ?? 0) + 1);
    let best = -1, bc = 0;
    for (const [r, c] of counts) if (c > bc) (bc = c), (best = r);
    return best;
  }

  toV3(p: V3) {
    return { x: p.x, y: this.groundAt(p.x, p.z), z: p.z };
  }
}
