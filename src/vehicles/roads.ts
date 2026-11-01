import * as THREE from 'three';

/**
 * A drivable road: a centerline polyline at road-surface height (feet y).
 * Roads are two-way and cars drive on the right. Points shared by two roads
 * (within MERGE units) become intersections, and roads that cross mid-segment
 * get an intersection inserted automatically.
 */
export interface Road {
  points: THREE.Vector3[];
  /** Full road width in blocks (both directions). */
  width: number;
  /** Connect the last point back to the first. */
  loop?: boolean;
}

/** Where a parked, empty car waits to be stolen. */
export interface ParkedCar {
  pos: THREE.Vector3;
  facing: number;
}

export interface TrafficConfig {
  roads: Road[];
  parked?: ParkedCar[];
  /** Cars per 100 blocks of lane. Default 2.2. */
  density?: number;
  /** Cruise speed in blocks per second. Default 12. */
  speed?: number;
}

const MERGE = 1.5;

export interface RoadNode {
  id: number;
  pos: THREE.Vector3;
  /** Edges leaving this node. */
  out: LaneEdge[];
  /** Road width at this node (widest road touching it). */
  width: number;
  /** Cars crossing this intersection right now, with the curve each one is driving. */
  holders: Map<number, Path>;
}

/** One direction of one road segment between two nodes, offset to its right-hand lane. */
export interface LaneEdge {
  from: RoadNode;
  to: RoadNode;
  width: number;
  /** The reverse direction of the same segment. */
  twin: LaneEdge | null;
}

/** Points along a path with cumulative distance, for constant-speed travel. */
export class Path {
  readonly len: number;
  private cum: number[] = [0];
  constructor(readonly pts: THREE.Vector3[]) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      s += pts[i].distanceTo(pts[i - 1]);
      this.cum.push(s);
    }
    this.len = s;
  }

  /** Position and unit tangent at distance s. */
  at(s: number, pos: THREE.Vector3, tan: THREE.Vector3) {
    const pts = this.pts;
    if (pts.length === 1) {
      pos.copy(pts[0]);
      return;
    }
    s = Math.max(0, Math.min(this.len, s));
    let i = 1;
    while (i < pts.length - 1 && this.cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i];
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const t = (s - this.cum[i - 1]) / seg;
    pos.lerpVectors(a, b, t);
    tan.subVectors(b, a).normalize();
  }
}

const right = (d: THREE.Vector3) => new THREE.Vector3(-d.z, 0, d.x).normalize();

/** The road network as a graph of nodes and directed lanes. */
export class RoadGraph {
  readonly nodes: RoadNode[] = [];
  readonly edges: LaneEdge[] = [];

  constructor(readonly roads: Road[]) {
    // Collect every road segment, then split segments where they cross.
    type Seg = { a: THREE.Vector3; b: THREE.Vector3; width: number; cuts: THREE.Vector3[] };
    const segs: Seg[] = [];
    for (const r of roads) {
      const pts = r.loop ? [...r.points, r.points[0]] : r.points;
      for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i], width: r.width, cuts: [] });
    }
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++) {
        const x = crossXZ(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
        if (!x) continue;
        // Cut a segment only where the crossing is inside it; endpoints already make nodes.
        if (x.t > 0.02 && x.t < 0.98) segs[i].cuts.push(x.p.clone());
        if (x.u > 0.02 && x.u < 0.98) segs[j].cuts.push(x.p.clone());
      }
    for (const s of segs) {
      const pts = [s.a, ...s.cuts.sort((p, q) => p.distanceTo(s.a) - q.distanceTo(s.a)), s.b];
      for (let i = 1; i < pts.length; i++) {
        const n0 = this.node(pts[i - 1], s.width);
        const n1 = this.node(pts[i], s.width);
        if (n0 === n1 || n0.out.some((e) => e.to === n1)) continue;
        const e0: LaneEdge = { from: n0, to: n1, width: s.width, twin: null };
        const e1: LaneEdge = { from: n1, to: n0, width: s.width, twin: e0 };
        e0.twin = e1;
        n0.out.push(e0);
        n1.out.push(e1);
        this.edges.push(e0, e1);
      }
    }
  }

  private node(p: THREE.Vector3, width: number) {
    for (const n of this.nodes)
      if (Math.hypot(n.pos.x - p.x, n.pos.z - p.z) < MERGE) {
        n.width = Math.max(n.width, width);
        return n;
      }
    const n: RoadNode = { id: this.nodes.length, pos: p.clone(), out: [], width, holders: new Map() };
    this.nodes.push(n);
    return n;
  }

  /** True for nodes where cars have to take turns (3+ roads meet). */
  isJunction(n: RoadNode) {
    return n.out.length > 2;
  }

  /** How far from a node the straight lane stops and the turn curve begins. */
  setback(n: RoadNode) {
    if (n.out.length === 1) return 0;
    // At a junction the lane stops far enough back that a waiting car's nose stays out of the crossing.
    return this.isJunction(n) ? n.width / 2 + 3.2 : 2.5;
  }

  /** The straight lane path for an edge, offset to the right-hand side. */
  lanePath(e: LaneEdge): Path {
    const d = new THREE.Vector3().subVectors(e.to.pos, e.from.pos);
    const len = d.length();
    d.normalize();
    const off = right(d).multiplyScalar(e.width / 4);
    const s0 = Math.min(this.setback(e.from), len * 0.45);
    const s1 = Math.min(this.setback(e.to), len * 0.45);
    const a = e.from.pos.clone().addScaledVector(d, s0).add(off);
    const b = e.to.pos.clone().addScaledVector(d, -s1).add(off);
    return new Path([a, b]);
  }

  /** The curve through node `via` from the end of lane `a` to the start of lane `b`. */
  turnPath(a: LaneEdge, b: LaneEdge): Path {
    const pa = this.lanePath(a), pb = this.lanePath(b);
    const p0 = pa.pts[pa.pts.length - 1];
    const p2 = pb.pts[0];
    if (b === a.twin) {
      // U-turn at a dead end: a little loop across the road.
      const d = new THREE.Vector3().subVectors(a.to.pos, a.from.pos).normalize();
      const mid = a.to.pos.clone().addScaledVector(d, a.width * 0.3);
      return bezier(p0, mid, p2, 8);
    }
    // Control point where the two lane lines would meet.
    const da = new THREE.Vector3().subVectors(a.to.pos, a.from.pos).normalize();
    const db = new THREE.Vector3().subVectors(b.to.pos, b.from.pos).normalize();
    const c = lineMeet(p0, da, p2, db) ?? p0.clone().lerp(p2, 0.5);
    return bezier(p0, c, p2, 10);
  }

  /** Can a car start this turn through the junction while the cars already in it finish theirs? */
  canEnter(n: RoadNode, id: number, turn: Path) {
    for (const [other, p] of n.holders) {
      if (other === id) continue;
      // Cars coming from the same lane just follow each other through.
      if (turn.pts[0].distanceTo(p.pts[0]) < 0.5) continue;
      if (pathsClash(turn, p)) return false;
    }
    return true;
  }

  /** Total lane length, for picking how many cars to spawn. */
  totalLaneLength() {
    let s = 0;
    for (const e of this.edges) s += this.lanePath(e).len;
    return s;
  }
}

function bezier(p0: THREE.Vector3, c: THREE.Vector3, p2: THREE.Vector3, n: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push(new THREE.Vector3(
      u * u * p0.x + 2 * u * t * c.x + t * t * p2.x,
      u * u * p0.y + 2 * u * t * c.y + t * t * p2.y,
      u * u * p0.z + 2 * u * t * c.z + t * t * p2.z,
    ));
  }
  return new Path(pts);
}

/** Where two rays in the xz plane meet, if they are not parallel. */
function lineMeet(p: THREE.Vector3, d: THREE.Vector3, q: THREE.Vector3, e: THREE.Vector3) {
  const den = d.x * e.z - d.z * e.x;
  if (Math.abs(den) < 1e-3) return null;
  const t = ((q.x - p.x) * e.z - (q.z - p.z) * e.x) / den;
  const r = p.clone().addScaledVector(d, t);
  r.y = (p.y + q.y) / 2;
  return r;
}

/** Where two segments cross in xz, with the parameter along each (t on ab, u on cd). */
function crossXZ(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
  const r = { x: b.x - a.x, z: b.z - a.z };
  const s = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  const eps = 0.02;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { t, u, p: new THREE.Vector3(a.x + r.x * t, a.y + (b.y - a.y) * t, a.z + r.z * t) };
}

/** True if two curves come within a car's width of each other anywhere. */
function pathsClash(a: Path, b: Path) {
  for (const p of a.pts) for (const q of b.pts) if (Math.hypot(p.x - q.x, p.z - q.z) < 3.4) return true;
  return false;
}
