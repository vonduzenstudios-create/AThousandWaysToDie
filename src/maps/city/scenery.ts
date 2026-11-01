import * as THREE from 'three';
import { canvasTexture, mulberry32 } from '../../util';
import type { CityLayout, TowerSpec } from './build';
import { BoxBatch, Scenery, signMesh } from './mesh';
import { G, POND, RAIL, RAIL_PLATFORM, SEWER_FLOOR, SUBWAY, SX, SZ, TUNNEL_FLOOR, WATER } from './layout';

/** Facade looks for the mesh skyscrapers: wall, window, lit window, frame. */
const STYLES = [
  { wall: '#5f87b0', win: '#2a4a6e', lit: '#cfe6ff', frame: '#8fb2d4', cols: 4, glass: true },
  { wall: '#d8cbb0', win: '#3a3a44', lit: '#ffe9a8', frame: '#c2b494', cols: 2, glass: false },
  { wall: '#8a4a35', win: '#2a2226', lit: '#ffd88a', frame: '#a86a52', cols: 2, glass: false },
  { wall: '#3a3f48', win: '#1c2028', lit: '#ffeeb0', frame: '#5a606a', cols: 3, glass: false },
  { wall: '#4f9a86', win: '#1e4a40', lit: '#bff0e0', frame: '#79c2ae', cols: 4, glass: true },
  { wall: '#15171d', win: '#0b0c10', lit: '#c9a227', frame: '#c9a227', cols: 4, glass: true }, // Mortalis
];

/** One texture tile = 8 x 8 blocks = 2 floors x 2 window bays. */
function facadeTexture(style: number) {
  const s = STYLES[style];
  const rng = mulberry32(400 + style);
  const tex = canvasTexture(64, 64, (c) => {
    c.fillStyle = s.wall;
    c.fillRect(0, 0, 64, 64);
    const bays = s.cols;
    const bw = 64 / bays;
    for (let f = 0; f < 2; f++)
      for (let b = 0; b < bays; b++) {
        const x = b * bw + (s.glass ? 1 : bw * 0.2);
        const y = f * 32 + (s.glass ? 2 : 8);
        const w = s.glass ? bw - 2 : bw * 0.6;
        const h = s.glass ? 28 : 18;
        c.fillStyle = rng() < 0.18 ? s.lit : s.win;
        c.fillRect(x, y, w, h);
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.fillRect(x, y, w * 0.35, h);
      }
    c.fillStyle = s.frame;
    c.fillRect(0, 31, 64, 2);
    c.fillRect(0, 63, 64, 1);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Merged textured boxes for every tower, one mesh per facade style, plus roof caps and colliders. */
function buildTowers(sc: Scenery, towers: TowerSpec[]) {
  const per: { pos: number[]; uv: number[]; nor: number[]; idx: number[] }[] = STYLES.map(() => ({ pos: [], uv: [], nor: [], idx: [] }));
  const roofs = new BoxBatch();
  const T = 8;
  const quad = (g: (typeof per)[number], p: number[][], n: number[], uw: number, vh: number, u0: number, v0: number) => {
    const b = g.pos.length / 3;
    for (const q of p) g.pos.push(q[0], q[1], q[2]);
    for (let i = 0; i < 4; i++) g.nor.push(n[0], n[1], n[2]);
    g.uv.push(u0 / T, v0 / T, (u0 + uw) / T, v0 / T, (u0 + uw) / T, (v0 + vh) / T, u0 / T, (v0 + vh) / T);
    g.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (const t of towers) {
    let y = t.y0;
    const g = per[t.style];
    let topRect = { x0: t.x0, z0: t.z0, x1: t.x1, z1: t.z1 };
    for (const [inset, h] of t.segs) {
      const x0 = t.x0 + inset, x1 = t.x1 - inset, z0 = t.z0 + inset, z1 = t.z1 - inset;
      if (x1 - x0 < 4 || z1 - z0 < 4) break;
      const y1 = y + h;
      const v0 = y - G;
      // south (+z), north (-z), east (+x), west (-x)
      quad(g, [[x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], x1 - x0, h, x0, v0);
      quad(g, [[x1, y, z0], [x0, y, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], x1 - x0, h, x0, v0);
      quad(g, [[x1, y, z1], [x1, y, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], z1 - z0, h, z0, v0);
      quad(g, [[x0, y, z0], [x0, y, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], z1 - z0, h, z0, v0);
      // Roof cap and parapet.
      roofs.box((x0 + x1) / 2, y1 + 0.25, (z0 + z1) / 2, x1 - x0 + 0.6, 0.5, z1 - z0 + 0.6, t.style === 5 ? 0x222428 : 0x6a6a70);
      // Rooftop clutter on the top segment only adds up, so put a couple of AC boxes on each.
      roofs.box(x0 + 3, y1 + 1, z0 + 3, 2.5, 1.5, 2, 0x9aa3ad);
      roofs.box(x1 - 4, y1 + 1.2, z1 - 4, 3, 2, 3, 0x8a9096);
      sc.solid((x0 + x1) / 2, (y + y1) / 2 + 0.25, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y) / 2 + 0.25, (z1 - z0) / 2);
      topRect = { x0, z0, x1, z1 };
      y = y1;
    }
    if (t.spire) {
      const cx = (topRect.x0 + topRect.x1) / 2, cz = (topRect.z0 + topRect.z1) / 2;
      roofs.box(cx, y + 2, cz, 3, 4, 3, t.style === 5 ? 0xc9a227 : 0xb0b4bb);
      roofs.box(cx, y + 4 + t.spire / 2, cz, 0.6, t.spire, 0.6, t.style === 5 ? 0xc9a227 : 0xd0d4da);
      roofs.box(cx, y + 4 + t.spire + 0.4, cz, 1, 0.8, 1, 0xff3030);
    }
  }
  per.forEach((g, i) => {
    if (!g.pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: facadeTexture(i) }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    sc.add(mesh);
  });
  sc.add(roofs.build());
}

function waterMaterial(color: number, opacity: number) {
  const tex = canvasTexture(32, 32, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(180,210,255,${0.3 + Math.random() * 0.4})`;
      c.fillRect(Math.floor(Math.random() * 32), Math.floor(Math.random() * 32), 2 + Math.floor(Math.random() * 4), 1);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshLambertMaterial({ color, map: tex, transparent: true, opacity, depthWrite: false });
}

const AD_COPY: [string[], string, string][] = [
  [['MORTALIS MUTUAL', "We're there for you.*", '*not valid on Earth'], '#1d2b4f', '#c9a227'],
  [['DIE TRYING 7', 'NOW SHOWING'], '#d01818', '#ffffff'],
  [['GARY TOWN SQUARE', 'YOUR AD HERE', 'call 1-800-FUNERAL'], '#111111', '#40ff80'],
  [['DR. PEPPERONI', 'the pizza soda'], '#7a1a6a', '#ffe040'],
];

export interface SceneryHandles {
  water: THREE.Mesh;
  steam: THREE.Vector3[];
  lampHeads: THREE.InstancedMesh;
  tick(dt: number, t: number): void;
}

/** Everything static that isn't voxels: skyline, water, signs, billboards, benches, parked cars, rails. */
export function buildScenery(sc: Scenery, L: CityLayout): SceneryHandles {
  buildTowers(sc, L.towers);

  // Water: one big sheet at the waterline, the park pond, the sewer.
  const water = sc.add(new THREE.Mesh(new THREE.PlaneGeometry(SX + 800, SZ + 800), waterMaterial(0x2f6f9e, 0.82)));
  water.rotation.x = -Math.PI / 2;
  water.position.set(SX / 2, WATER, SZ / 2);
  ((water.material as THREE.MeshLambertMaterial).map as THREE.Texture).repeat.set(120, 120);
  const pond = sc.add(new THREE.Mesh(new THREE.CircleGeometry(1, 32), waterMaterial(0x3f8fbe, 0.85)));
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(POND.rx + 0.5, POND.rz + 0.5, 1);
  pond.position.set(POND.x + 0.5, G - 1.4, POND.z + 0.5);
  for (const m of L.manholes) {
    const sw = sc.add(new THREE.Mesh(new THREE.PlaneGeometry(8, 8), waterMaterial(0x5a6a3a, 0.9)));
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(Math.floor(m.x), SEWER_FLOOR + 0.15, Math.floor(m.z));
  }

  // Signs over every shop door.
  for (const p of L.places) {
    if (!p.sign) continue;
    const s = p.sign;
    const w = Math.max(4, Math.min(s.w ?? 8, 10));
    const m = signMesh(s.text, w, 1.3, s.bg, s.fg);
    m.position.copy(s.pos);
    m.rotation.y = s.rotY;
    sc.add(m);
  }

  // Times Squared billboards (glowing).
  for (const b of L.billboards) {
    const [lines, bg, fg] = AD_COPY[b.kind % AD_COPY.length];
    const n = new THREE.Vector3(Math.sin(b.rotY), 0, Math.cos(b.rotY));
    for (const side of [1, -1]) {
      const m = signMesh(lines, b.w, b.h, bg, fg, { glow: true });
      m.rotation.y = b.rotY + (side < 0 ? Math.PI : 0);
      m.position.copy(b.pos).addScaledVector(n, 0.2 * side);
      sc.add(m);
    }
    sc.add(new BoxBatch().box(b.pos.x, b.pos.y, b.pos.z, b.w + 0.4, b.h + 0.4, 0.3, 0x222222, b.rotY).build());
    // Support strut down to the podium roof.
    const strutH = b.pos.y - b.h / 2 - (G + 13);
    if (strutH > 0) sc.add(new BoxBatch().box(b.pos.x, G + 13 + strutH / 2, b.pos.z, 0.5, strutH, 0.5, 0x333333).build());
  }

  // Benches, parked cars, rail yard rails and ties, subway rails, park lamps.
  const props = new BoxBatch();
  for (const b of L.benches) {
    const { x, z } = b.pos;
    props.box(x, G + 0.45, z, 2.4, 0.15, 0.7, 0x8a5a2b, b.rotY);
    props.box(x, G + 0.9, z + (b.rotY ? -0.3 : 0.3), 2.4, 0.6, 0.12, 0x8a5a2b, b.rotY, new THREE.Vector3(x, G, z));
    props.box(x - 1, G + 0.2, z, 0.12, 0.4, 0.6, 0x222222, b.rotY, new THREE.Vector3(x, G, z));
    props.box(x + 1, G + 0.2, z, 0.12, 0.4, 0.6, 0x222222, b.rotY, new THREE.Vector3(x, G, z));
    sc.solid(x, G + 0.35, z, 1.2, 0.35, 0.35, b.rotY);
  }
  const carColors = [0xf2c230, 0xf2c230, 0x2a6ab0, 0xb02a2a, 0xeeeeee, 0x222226, 0x3a9a4a];
  L.parked.forEach((c, i) => {
    const col = carColors[i % carColors.length];
    const { x, z } = c.pos;
    const p = new THREE.Vector3(x, G, z);
    props.box(x, G + 0.75, z, 2, 0.9, 4.2, col, c.rotY, p);
    props.box(x, G + 1.55, z - 0.2, 1.8, 0.7, 2.2, col, c.rotY, p);
    props.box(x, G + 1.55, z - 0.2, 1.84, 0.5, 1.8, 0x9ac8e8, c.rotY, p);
    for (const [wx, wz] of [[-1, -1.4], [1, -1.4], [-1, 1.4], [1, 1.4]]) props.box(x + wx, G + 0.35, z + wz, 0.3, 0.7, 0.7, 0x111111, c.rotY, p);
    if (col === 0xf2c230) props.box(x, G + 2.05, z - 0.2, 0.8, 0.3, 0.4, 0xffffff, c.rotY, p);
    sc.solid(x, G + 1, z, 1, 1, 2.1, c.rotY);
  });
  // Rail yard tracks.
  for (const tx of RAIL.tracks) {
    for (let z = RAIL.z0; z <= RAIL.z1; z += 1.2) props.box(tx + 0.5, G + 0.08, z, 3.6, 0.16, 0.45, 0x5a3a22);
    for (const off of [-1, 1]) props.box(tx + 0.5 + off, G + 0.26, (RAIL.z0 + RAIL.z1) / 2, 0.18, 0.2, RAIL.z1 - RAIL.z0, 0xb0b4bb);
  }
  // Subway rails and the (glowing-ish) third rail.
  for (let x = 60; x < 466; x += 1.5) props.box(x, TUNNEL_FLOOR + 0.06, SUBWAY.trainZ + 0.5, 0.4, 0.12, 4, 0x4a3a2a);
  for (const off of [-1, 1]) props.box(263, TUNNEL_FLOOR + 0.22, SUBWAY.trainZ + 0.5 + off, 406, 0.18, 0.16, 0xb0b4bb);
  props.box(263, TUNNEL_FLOOR + 0.45, SUBWAY.liveRailZ, 406, 0.3, 0.3, 0x7a6a40);
  // Platform canopy in the rail yard.
  const P = RAIL_PLATFORM;
  props.box((P.x0 + P.x1 + 1) / 2, G + 5.2, (P.z0 + P.z1) / 2, P.x1 - P.x0 + 3, 0.3, P.z1 - P.z0, 0x3a5a3a);
  for (let z = P.z0 + 4; z < P.z1; z += 10) props.box((P.x0 + P.x1 + 1) / 2, G + 3, z, 0.3, 4.4, 0.3, 0x222222);
  sc.add(props.build());

  // Street lamps: thin poles with an arm (batched) and glowing heads (instanced).
  const poles = new BoxBatch();
  const lampHeads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.3, 0.45), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), Math.max(1, L.lamps.length));
  const d = new THREE.Object3D();
  L.lamps.forEach((p, i) => {
    poles.box(p.x, G + 2.6, p.z, 0.22, 5.2, 0.22, 0x2a2e33);
    poles.box(p.x, G + 0.25, p.z, 0.45, 0.5, 0.45, 0x2a2e33);
    poles.box(p.x, G + 5.3, p.z, 1.1, 0.14, 0.14, 0x2a2e33);
    d.position.set(p.x + 0.55, G + 5.1, p.z);
    d.updateMatrix();
    lampHeads.setMatrixAt(i, d.matrix);
    sc.solid(p.x, G + 2.6, p.z, 0.12, 2.6, 0.12);
  });
  sc.add(poles.build());
  sc.add(lampHeads);

  // Subway station signs.
  const sub = signMesh(['SUBWAY', 'Uptown & Downtown'], 4, 1.2, '#1a6a2a', '#ffffff');
  sub.position.set(SUBWAY.stairX0 - 0.4, G + 2.4, SUBWAY.platZ0 + 3);
  sub.rotation.y = -Math.PI / 2;
  sc.add(sub);
  const plat = signMesh(['350 St'], 6, 1, '#111111', '#ffffff');
  plat.position.set(171, TUNNEL_FLOOR + 3.4, SUBWAY.platZ1 + 0.9);
  plat.rotation.y = Math.PI;
  sc.add(plat);
  for (const z of [P.z0 + 6, P.z1 - 6]) {
    const ps = signMesh(['TRACK 2'], 3, 0.8, '#1a2a6a', '#ffffff', { double: true });
    ps.position.set((P.x0 + P.x1 + 1) / 2, G + 4.4, z);
    ps.rotation.y = Math.PI / 2;
    sc.add(ps);
  }

  const water2 = water;
  return {
    water: water2,
    steam: L.steam,
    lampHeads,
    tick(dt) {
      const map = (water2.material as THREE.MeshLambertMaterial).map!;
      map.offset.x += dt * 0.01;
      map.offset.y += dt * 0.004;
    },
  };
}
