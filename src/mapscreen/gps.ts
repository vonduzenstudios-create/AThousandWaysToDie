import { RoadGraph, type Road, type RoadNode } from '../vehicles/roads';

type P = { x: number; z: number };

/**
 * Turn-by-turn-free GPS: the shortest way along the map's roads from where you are to the
 * waypoint, as a polyline the radar and the full map draw in purple. Maps with no roads (or
 * a waypoint far from any road) get a straight line.
 */
export class Gps {
  private graph: RoadGraph | null;
  private segs: { a: RoadNode; b: RoadNode }[] = [];

  constructor(roads: Road[] | undefined) {
    this.graph = roads?.length ? new RoadGraph(roads) : null;
    if (this.graph)
      for (const n of this.graph.nodes) for (const e of n.out) if (e.from.id < e.to.id) this.segs.push({ a: e.from, b: e.to });
  }

  /** Nearest point on any road segment. */
  private snap(p: P) {
    let best: { a: RoadNode; b: RoadNode; t: number; x: number; z: number; d: number } | null = null;
    for (const s of this.segs) {
      const ax = s.a.pos.x, az = s.a.pos.z, bx = s.b.pos.x, bz = s.b.pos.z;
      const dx = bx - ax, dz = bz - az;
      const L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / L));
      const x = ax + dx * t, z = az + dz * t;
      const d = Math.hypot(p.x - x, p.z - z);
      if (!best || d < best.d) best = { a: s.a, b: s.b, t, x, z, d };
    }
    return best;
  }

  /** The route from `from` to `to`, start and end included. */
  route(from: P, to: P): P[] {
    const straight = [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
    if (!this.graph) return straight;
    const s = this.snap(from), t = this.snap(to);
    if (!s || !t) return straight;
    const direct = Math.hypot(to.x - from.x, to.z - from.z);
    // Close by, or nowhere near a road: just point at it.
    if (direct < 25 || s.d + t.d > direct) return straight;
    if ((s.a === t.a && s.b === t.b) || (s.a === t.b && s.b === t.a)) return [straight[0], { x: s.x, z: s.z }, { x: t.x, z: t.z }, straight[1]];

    // Dijkstra over intersections, seeded from both ends of the start segment.
    const nodes = this.graph.nodes;
    const dist = new Float64Array(nodes.length).fill(Infinity);
    const prev = new Int32Array(nodes.length).fill(-1);
    const done = new Uint8Array(nodes.length);
    const sp = { x: s.x, z: s.z };
    const len = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z);
    dist[s.a.id] = len(sp, s.a.pos);
    dist[s.b.id] = Math.min(dist[s.b.id], len(sp, s.b.pos));
    const tp = { x: t.x, z: t.z };
    const goalCost = (n: RoadNode) => (n === t.a ? len(tp, t.a.pos) : n === t.b ? len(tp, t.b.pos) : Infinity);
    let bestEnd = -1, bestTotal = Infinity;
    for (;;) {
      let u = -1, ud = Infinity;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < ud) (ud = dist[i]), (u = i);
      if (u < 0 || ud >= bestTotal) break;
      done[u] = 1;
      const gc = ud + goalCost(nodes[u]);
      if (gc < bestTotal) (bestTotal = gc), (bestEnd = u);
      for (const e of nodes[u].out) {
        const v = e.to.id;
        const nd = ud + len(nodes[u].pos, e.to.pos);
        if (nd < dist[v]) (dist[v] = nd), (prev[v] = u);
      }
    }
    if (bestEnd < 0) return straight;
    const chain: P[] = [];
    for (let i = bestEnd; i >= 0; i = prev[i]) chain.push({ x: nodes[i].pos.x, z: nodes[i].pos.z });
    chain.reverse();
    return [straight[0], sp, ...chain, tp, straight[1]];
  }

  /** Length of a polyline. */
  static length(pts: P[]) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    return s;
  }
}
