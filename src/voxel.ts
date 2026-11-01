import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from './physics';
import { hash3 } from './util';

/** Block ids. 0 is air. */
export const B = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Asphalt: 4,
  Sidewalk: 5,
  Wood: 6,
  Leaves: 7,
  Plank: 8,
  Brick: 9,
  RoofRed: 10,
  RoofBlue: 11,
  White: 12,
  Metal: 13,
  TankBlue: 14,
  Glass: 15,
  Hay: 16,
  BarnRed: 17,
  Concrete: 18,
  Gravel: 19,
  Yellow: 20,
  Sand: 21,
  RedPaint: 22,
  RoofGreen: 23,
  WallBlue: 24,
  WallMint: 25,
  Dark: 26,
  Flower: 27,
  LeavesDark: 28,
  WallPeach: 29,
  RoofBrown: 30,
} as const;

/** Base color and how much per-voxel color noise each block gets. */
export const PALETTE: Record<number, [number, number]> = {
  [B.Grass]: [0x6cbf3f, 0.16],
  [B.Dirt]: [0x8a5a35, 0.14],
  [B.Stone]: [0x8a8f96, 0.12],
  [B.Asphalt]: [0x3d3f45, 0.1],
  [B.Sidewalk]: [0xb9b5ab, 0.06],
  [B.Wood]: [0x6e4a2b, 0.14],
  [B.Leaves]: [0x3f9a35, 0.22],
  [B.Plank]: [0xb78a55, 0.1],
  [B.Brick]: [0xa8513b, 0.14],
  [B.RoofRed]: [0xb83a32, 0.08],
  [B.RoofBlue]: [0x3b5fa8, 0.08],
  [B.White]: [0xeeeae0, 0.04],
  [B.Metal]: [0x9aa3ad, 0.06],
  [B.TankBlue]: [0x7fb8e0, 0.05],
  [B.Glass]: [0xa8dcf0, 0.04],
  [B.Hay]: [0xe3c25a, 0.15],
  [B.BarnRed]: [0x9c2c25, 0.1],
  [B.Concrete]: [0xa7a39a, 0.07],
  [B.Gravel]: [0x7d7468, 0.25],
  [B.Yellow]: [0xf2c230, 0.05],
  [B.Sand]: [0xe2cf8f, 0.1],
  [B.RedPaint]: [0xe0302a, 0.04],
  [B.RoofGreen]: [0x3f7d4a, 0.08],
  [B.WallBlue]: [0x9cc3e6, 0.05],
  [B.WallMint]: [0xa8e0c0, 0.05],
  [B.Dark]: [0x2a2a2e, 0.06],
  [B.Flower]: [0xf06aa8, 0.2],
  [B.LeavesDark]: [0x2f7a2c, 0.2],
  [B.WallPeach]: [0xf2c6a0, 0.05],
  [B.RoofBrown]: [0x6b4330, 0.08],
};

/**
 * Register a block color. Maps own id ranges so they don't collide: Smallville < 100,
 * beach 100-139, city 140-179, wilderness 180-219.
 */
export function defineBlock(id: number, hex: number, variation = 0.1) {
  PALETTE[id] = [hex, variation];
}

const AO_CURVE = [0.42, 0.62, 0.8, 1.0];

export class VoxelWorld {
  readonly data: Uint8Array;
  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {
    this.data = new Uint8Array(sx * sy * sz);
  }

  private idx(x: number, y: number, z: number) {
    return (y * this.sz + z) * this.sx + x;
  }

  inBounds(x: number, y: number, z: number) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 0;
    return this.data[this.idx(x, y, z)];
  }

  set(x: number, y: number, z: number, b: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (!this.inBounds(x, y, z)) return;
    this.data[this.idx(x, y, z)] = b;
  }

  /** Fill an inclusive box. */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: number) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, b);
  }

  /** Highest solid block's top surface at a column (0 if empty). */
  topY(x: number, z: number) {
    for (let y = this.sy - 1; y >= 0; y--) if (this.get(Math.floor(x), y, Math.floor(z))) return y + 1;
    return 0;
  }

  private solid(x: number, y: number, z: number) {
    return this.get(x, y, z) !== 0 ? 1 : 0;
  }

  /**
   * Build chunk meshes (face culling, per-vertex ambient occlusion, per-voxel color noise)
   * and matching static trimesh colliders.
   */
  build(scene: THREE.Scene, physics: RAPIER.World, chunk = 32) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const color = new THREE.Color();
    const meshes: THREE.Mesh[] = [];
    const body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    for (let cz = 0; cz < this.sz; cz += chunk)
      for (let cx = 0; cx < this.sx; cx += chunk) {
        const pos: number[] = [];
        const nor: number[] = [];
        const col: number[] = [];
        const ind: number[] = [];
        for (let y = 0; y < this.sy; y++)
          for (let z = cz; z < Math.min(cz + chunk, this.sz); z++)
            for (let x = cx; x < Math.min(cx + chunk, this.sx); x++) {
              const b = this.get(x, y, z);
              if (!b) continue;
              const [hex, vari] = PALETTE[b] ?? [0xff00ff, 0];
              const n = hash3(x, y, z);
              const f = 1 + (n - 0.5) * vari * 2;
              color.setHex(hex);
              for (let a = 0; a < 3; a++)
                for (const s of [1, -1]) {
                  const nv = [0, 0, 0];
                  nv[a] = s;
                  if (this.solid(x + nv[0], y + nv[1], z + nv[2])) continue;
                  const u = (a + 1) % 3;
                  const v = (a + 2) % 3;
                  const L = [x + nv[0], y + nv[1], z + nv[2]];
                  const corners = s > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
                  const aos: number[] = [];
                  const base = pos.length / 3;
                  // Slightly darker sides and bottoms read better than relying on light alone.
                  const faceShade = a === 1 ? (s > 0 ? 1 : 0.6) : a === 0 ? 0.86 : 0.92;
                  for (const [du, dv] of corners) {
                    const p = [x, y, z];
                    p[a] += s > 0 ? 1 : 0;
                    p[u] += du;
                    p[v] += dv;
                    const s1p = L.slice();
                    s1p[u] += du ? 1 : -1;
                    const s2p = L.slice();
                    s2p[v] += dv ? 1 : -1;
                    const cp = L.slice();
                    cp[u] += du ? 1 : -1;
                    cp[v] += dv ? 1 : -1;
                    const s1 = this.solid(s1p[0], s1p[1], s1p[2]);
                    const s2 = this.solid(s2p[0], s2p[1], s2p[2]);
                    const c = this.solid(cp[0], cp[1], cp[2]);
                    const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
                    aos.push(ao);
                    pos.push(p[0], p[1], p[2]);
                    nor.push(nv[0], nv[1], nv[2]);
                    const k = f * AO_CURVE[ao] * faceShade;
                    col.push(color.r * k, color.g * k, color.b * k);
                  }
                  if (aos[0] + aos[2] > aos[1] + aos[3]) ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
                  else ind.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
                }
            }
        if (!pos.length) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.setIndex(ind);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        meshes.push(mesh);

        const cd = RAPIER.ColliderDesc.trimesh(new Float32Array(pos), new Uint32Array(ind))
          .setFriction(0.9)
          .setCollisionGroups(groups(G_WORLD, G_ALL));
        physics.createCollider(cd, body);
      }
    return meshes;
  }
}

/** Base color of a block id (used by the minimap). */
export function blockColor(b: number): number {
  return PALETTE[b]?.[0] ?? 0xff00ff;
}
