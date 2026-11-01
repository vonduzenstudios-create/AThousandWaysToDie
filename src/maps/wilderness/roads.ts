import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from '../../physics';
import { blockColor } from '../../voxel';
import { ROADS, type RoadDef, type Terrain } from './terrain';

/**
 * Smooth driving surfaces for the wilderness roads. Carved roads follow the voxel grid, so a hill
 * becomes a staircase of 1-block steps that wheels can't climb. Each road gets a ribbon laid over
 * its voxels instead: an upper envelope of the road's columns with the grade capped at MAX_GRADE,
 * drawn as a dirt/gravel/asphalt strip with a collider. Traffic follows the same profile.
 */

/** Steepest grade the ribbon allows (rise per block). */
const MAX_GRADE = 0.15;
const STEP = 1;

export interface RoadSample {
  x: number;
  y: number;
  z: number;
  /** Unit direction along the road (x, z). */
  dx: number;
  dz: number;
  bridge: boolean;
  /** Lowest ground under the road here (skirts reach down to it). */
  low: number;
}

export interface RoadProfile {
  def: RoadDef;
  samples: RoadSample[];
}

export function roadProfiles(t: Terrain): RoadProfile[] {
  return ROADS.map((def) => {
    const samples: RoadSample[] = [];
    for (let s = 0; s < def.points.length - 1; s++) {
      const [ax, az] = def.points[s];
      const [bx, bz] = def.points[s + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const last = s === def.points.length - 2;
      for (let d = 0; d < L || (last && d <= L); d += STEP) {
        const k = Math.min(1, d / L);
        samples.push({ x: ax + (bx - ax) * k, y: 0, z: az + (bz - az) * k, dx: (bx - ax) / L, dz: (bz - az) / L, bridge: !!def.bridges?.includes(s), low: 0 });
        if (k >= 1) break;
      }
    }
    // Highest dry ground across the road at each sample.
    const half = def.width / 2;
    const raw = samples.map((p) => {
      let m = -Infinity, lo = Infinity;
      for (let o = -half - 1; o <= half + 1; o += 0.5) {
        const x = p.x - p.dz * o, z = p.z + p.dx * o;
        // Over water the road becomes a causeway just above the surface.
        const h = Math.max(t.ground(x, z), t.waterAt(x, z) + 0.3);
        lo = Math.min(lo, h);
        if (Math.abs(o) <= half) m = Math.max(m, h);
      }
      p.low = lo;
      return m;
    });
    // Upper envelope with capped grade: y[i] = max_j raw[j] - grade * |i - j| (two linear passes),
    // then soften the kinks so a car's bumper doesn't dig in where a climb starts.
    const g = MAX_GRADE * STEP;
    const cap = (e: number[]) => {
      for (let i = 1; i < e.length; i++) e[i] = Math.max(e[i], e[i - 1] - g);
      for (let i = e.length - 2; i >= 0; i--) e[i] = Math.max(e[i], e[i + 1] - g);
      return e;
    };
    let env = cap(raw.slice());
    for (let it = 0; it < 6; it++) {
      const sm = env.map((v, i) => {
        let s = 0, n = 0;
        for (let k = -3; k <= 3; k++) {
          const j = i + k;
          if (j < 0 || j >= env.length) continue;
          s += env[j];
          n++;
        }
        return s / n;
      });
      env = cap(sm.map((v, i) => Math.max(v, raw[i])));
    }
    samples.forEach((p, i) => (p.y = env[i]));
    // Bridges: a straight line between the ground at either end (the deck is voxels).
    for (let i = 0; i < samples.length; i++) {
      if (!samples[i].bridge) continue;
      let j = i;
      while (j < samples.length - 1 && samples[j + 1].bridge) j++;
      const a = samples[Math.max(0, i - 1)].y, b = samples[Math.min(samples.length - 1, j + 1)].y;
      for (let k = i; k <= j; k++) samples[k].y = a + ((b - a) * (k - i + 1)) / (j - i + 2);
      i = j;
    }
    // Smooth the direction so corners don't pinch the ribbon.
    for (let i = 0; i < samples.length; i++) {
      const a = samples[Math.max(0, i - 2)], b = samples[Math.min(samples.length - 1, i + 2)];
      const ddx = b.x - a.x, ddz = b.z - a.z, L = Math.hypot(ddx, ddz) || 1;
      samples[i].dx = ddx / L;
      samples[i].dz = ddz / L;
    }
    return { def, samples };
  });
}

/**
 * Road centerlines for traffic and the GPS, at ribbon height. The traffic graph makes every point a
 * node (lanes stop short of nodes for the turn curve), so points stay at least MIN_SEG apart: the
 * original corners, plus extra points only where a straight line would leave the ribbon by more
 * than a few tenths of a block.
 */
const MIN_SEG = 14;
export function trafficRoads(profiles: RoadProfile[]) {
  return profiles.map(({ def, samples }) => {
    // Indices of the road's own corner points in the sample list.
    const keep = new Set<number>([0, samples.length - 1]);
    let si = 0;
    for (const [x, z] of def.points) {
      let best = si, bd = Infinity;
      for (let i = si; i < samples.length; i++) {
        const d = Math.hypot(samples[i].x - x, samples[i].z - z);
        if (d < bd) { bd = d; best = i; }
        if (d > bd + 4) break;
      }
      keep.add(best);
      si = best;
    }
    // Split spans whose straight line strays from the profile.
    const split = (a: number, b: number) => {
      if (b - a < MIN_SEG * 2) return;
      let worst = -1, wd = 0.3;
      for (let i = a + MIN_SEG; i <= b - MIN_SEG; i++) {
        const y = samples[a].y + ((samples[b].y - samples[a].y) * (i - a)) / (b - a);
        const d = Math.abs(samples[i].y - y);
        if (d > wd) { wd = d; worst = i; }
      }
      if (worst < 0) return;
      keep.add(worst);
      split(a, worst);
      split(worst, b);
    };
    const sorted = [...keep].sort((p, q) => p - q);
    for (let i = 1; i < sorted.length; i++) split(sorted[i - 1], sorted[i]);
    const pts = [...keep].sort((p, q) => p - q).map((i) => new THREE.Vector3(samples[i].x, samples[i].y, samples[i].z));
    // Keep the exact end points so roads still join at intersections.
    const [sx, sz] = def.points[0];
    const [ex, ez] = def.points[def.points.length - 1];
    pts[0].x = sx;
    pts[0].z = sz;
    pts[pts.length - 1].x = ex;
    pts[pts.length - 1].z = ez;
    return { width: def.width, points: pts };
  });
}

/** The ribbon meshes (with skirts) and their trimesh colliders. */
export function buildRoadRibbons(profiles: RoadProfile[], physics: RAPIER.World) {
  const group = new THREE.Group();
  group.name = 'wild-roads';
  const body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const col = new THREE.Color();
  for (const { def, samples } of profiles) {
    const half = def.width / 2 + 0.4;
    const base = blockColor(def.surface);
    // Split into runs that are not bridges.
    let run: RoadSample[] = [];
    const flush = () => {
      if (run.length >= 2) {
        const { mesh, verts, idx } = ribbon(run, half, base, col, def.centerLine);
        group.add(mesh);
        const cd = RAPIER.ColliderDesc.trimesh(verts, idx).setFriction(1).setCollisionGroups(groups(G_WORLD, G_ALL));
        physics.createCollider(cd, body);
      }
      run = [];
    };
    for (const s of samples) {
      if (s.bridge) flush();
      else run.push(s);
    }
    flush();
  }
  return { group, body };
}

function ribbon(run: RoadSample[], half: number, base: number, col: THREE.Color, centerLine?: boolean) {
  const pos: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const LIFT = 0.04;
  const SKIRT = 1.4;
  // 4 vertices per sample: left skirt bottom, left top, right top, right skirt bottom.
  run.forEach((p, i) => {
    const nx = -p.dz, nz = p.dx;
    const y = p.y + LIFT;
    const pts = [
      [p.x + nx * (half + 0.3), Math.min(y - SKIRT, p.low - 0.3), p.z + nz * (half + 0.3)],
      [p.x + nx * half, y, p.z + nz * half],
      [p.x - nx * half, y, p.z - nz * half],
      [p.x - nx * (half + 0.3), Math.min(y - SKIRT, p.low - 0.3), p.z - nz * (half + 0.3)],
    ];
    const n = Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453;
    const shade = 0.9 + (n - Math.floor(n)) * 0.14;
    pts.forEach((v, k) => {
      pos.push(v[0], v[1], v[2]);
      col.setHex(base).multiplyScalar(k === 0 || k === 3 ? shade * 0.72 : shade);
      colors.push(col.r, col.g, col.b);
    });
    if (i > 0) {
      const a = (i - 1) * 4, b = i * 4;
      for (let k = 0; k < 3; k++) index.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  if (centerLine) {
    // Dashed yellow center line, a thin strip just above the road.
    const lp: number[] = [];
    const li: number[] = [];
    run.forEach((p, i) => {
      if (i % 6 >= 3 || i === run.length - 1) return;
      const q = run[i + 1];
      const nx = -p.dz * 0.12, nz = p.dx * 0.12;
      const o = lp.length / 3;
      lp.push(p.x + nx, p.y + LIFT + 0.02, p.z + nz, p.x - nx, p.y + LIFT + 0.02, p.z - nz, q.x - nx, q.y + LIFT + 0.02, q.z - nz, q.x + nx, q.y + LIFT + 0.02, q.z + nz);
      li.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lg.setIndex(li);
    lg.computeVertexNormals();
    mesh.add(new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ color: 0xf2c230, side: THREE.DoubleSide })));
  }
  // Collider: the top surface only (vertices 1 and 2 of each sample).
  const verts = new Float32Array(run.length * 2 * 3);
  const idx: number[] = [];
  run.forEach((p, i) => {
    const nx = -p.dz, nz = p.dx, y = p.y + LIFT;
    verts.set([p.x + nx * half, y, p.z + nz * half, p.x - nx * half, y, p.z - nz * half], i * 6);
    if (i > 0) {
      const a = (i - 1) * 2, b = i * 2;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  });
  return { mesh, verts, idx: new Uint32Array(idx) };
}
