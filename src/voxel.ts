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

/** Base color and how much per-voxel color noise each block gets. Maps may add blocks with registerBlock. */
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

const AO_CURVE = [0.42, 0.62, 0.8, 1.0];

/** Add a block type (for maps that need new materials). Returns the id. Ids 1-255. */
export function registerBlock(id: number, color: number, noise = 0.1) {
  if (id < 1 || id > 255) throw new Error(`block id ${id} out of range`);
  PALETTE[id] = [color, noise];
  return id;
}

/**
 * Same as registerBlock, with the beach thread's name. Id ranges: town expansions < 100,
 * beach 100-139, city 140-179, wilderness 180-219, travel 220-229.
 */
export const defineBlock = (id: number, hex: number, variation = 0.1) => registerBlock(id, hex, variation);

/** Chunk edge length. Voxels are stored in sparse CS^3 chunks; empty chunks cost nothing. */
export const CS = 16;
/** Mesh section footprint (full height). Streaming works in sections. */
export const SECTION = 32;

/**
 * A voxel world of any size. Storage is sparse (16^3 chunks allocated on first write),
 * so a 2048 x 128 x 2048 map only pays for the chunks it actually uses.
 */
export class VoxelWorld {
  readonly ncx: number;
  readonly ncy: number;
  readonly ncz: number;
  private chunks: (Uint8Array | null)[];
  /** Called with section coords when voxels in that section change (the streamer listens). */
  onChange: ((sx: number, sz: number) => void) | null = null;

  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {
    this.ncx = Math.ceil(sx / CS);
    this.ncy = Math.ceil(sy / CS);
    this.ncz = Math.ceil(sz / CS);
    this.chunks = new Array(this.ncx * this.ncy * this.ncz).fill(null);
  }

  inBounds(x: number, y: number, z: number) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  /** The chunk at chunk coords, or null if it was never written. */
  chunk(cx: number, cy: number, cz: number) {
    if (cx < 0 || cy < 0 || cz < 0 || cx >= this.ncx || cy >= this.ncy || cz >= this.ncz) return null;
    return this.chunks[(cy * this.ncz + cz) * this.ncx + cx];
  }

  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    x |= 0;
    y |= 0;
    z |= 0;
    const c = this.chunks[((y >> 4) * this.ncz + (z >> 4)) * this.ncx + (x >> 4)];
    return c ? c[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] : 0;
  }

  set(x: number, y: number, z: number, b: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (!this.inBounds(x, y, z)) return;
    const ci = ((y >> 4) * this.ncz + (z >> 4)) * this.ncx + (x >> 4);
    let c = this.chunks[ci];
    if (!c) {
      if (!b) return;
      c = this.chunks[ci] = new Uint8Array(CS * CS * CS);
    }
    c[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] = b;
    if (this.onChange) {
      const sxi = Math.floor(x / SECTION), szi = Math.floor(z / SECTION);
      this.onChange(sxi, szi);
      // Neighbouring sections share faces and AO at the border.
      const lx = x % SECTION, lz = z % SECTION;
      if (lx === 0) this.onChange(sxi - 1, szi);
      if (lx === SECTION - 1) this.onChange(sxi + 1, szi);
      if (lz === 0) this.onChange(sxi, szi - 1);
      if (lz === SECTION - 1) this.onChange(sxi, szi + 1);
    }
  }

  /** Fill an inclusive box. */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: number) {
    const ax = Math.max(0, Math.floor(Math.min(x0, x1))), bx = Math.min(this.sx - 1, Math.floor(Math.max(x0, x1)));
    const ay = Math.max(0, Math.floor(Math.min(y0, y1))), by = Math.min(this.sy - 1, Math.floor(Math.max(y0, y1)));
    const az = Math.max(0, Math.floor(Math.min(z0, z1))), bz = Math.min(this.sz - 1, Math.floor(Math.max(z0, z1)));
    const cb = this.onChange;
    this.onChange = null;
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++) this.set(x, y, z, b);
    this.onChange = cb;
    if (cb)
      for (let sz = Math.floor((az - 1) / SECTION); sz <= Math.floor((bz + 1) / SECTION); sz++)
        for (let sx = Math.floor((ax - 1) / SECTION); sx <= Math.floor((bx + 1) / SECTION); sx++) cb(sx, sz);
  }

  /** Highest solid block's top surface at a column (0 if empty). Skips empty chunks. */
  topY(x: number, z: number) {
    x = Math.floor(x);
    z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return 0;
    const cx = x >> 4, cz = z >> 4, li = ((z & 15) << 4) | (x & 15);
    for (let cy = this.ncy - 1; cy >= 0; cy--) {
      const c = this.chunks[(cy * this.ncz + cz) * this.ncx + cx];
      if (!c) continue;
      for (let ly = CS - 1; ly >= 0; ly--) if (c[(ly << 8) | li]) return cy * CS + ly + 1;
    }
    return 0;
  }

  /** Highest y (exclusive) with any allocated chunk in a section, for meshing. */
  sectionTop(sxi: number, szi: number) {
    const per = SECTION / CS;
    for (let cy = this.ncy - 1; cy >= 0; cy--)
      for (let dz = 0; dz < per; dz++)
        for (let dx = 0; dx < per; dx++) if (this.chunk(sxi * per + dx, cy, szi * per + dz)) return (cy + 1) * CS;
    return 0;
  }

  private solid(x: number, y: number, z: number) {
    return this.get(x, y, z) !== 0 ? 1 : 0;
  }

  /**
   * Mesh one SECTION x SECTION column (face culling, per-vertex AO, per-voxel color noise).
   * Returns null if the section is empty.
   */
  meshSection(sxi: number, szi: number) {
    const x0 = sxi * SECTION, z0 = szi * SECTION;
    const x1 = Math.min(x0 + SECTION, this.sx), z1 = Math.min(z0 + SECTION, this.sz);
    if (x0 >= x1 || z0 >= z1 || x0 < 0 || z0 < 0) return null;
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const ind: number[] = [];
    const color = new THREE.Color();
    const per = SECTION / CS;
    const L = [0, 0, 0], s1p = [0, 0, 0], s2p = [0, 0, 0], cp = [0, 0, 0], p = [0, 0, 0], nv = [0, 0, 0];
    const aos = [0, 0, 0, 0];
    const CORNERS_POS = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const CORNERS_NEG = [[0, 0], [0, 1], [1, 1], [1, 0]];
    for (let cy = 0; cy < this.ncy; cy++)
      for (let dz = 0; dz < per; dz++)
        for (let dx = 0; dx < per; dx++) {
          const ccx = sxi * per + dx, ccz = szi * per + dz;
          const c = this.chunk(ccx, cy, ccz);
          if (!c) continue;
          for (let ly = 0; ly < CS; ly++)
            for (let lz = 0; lz < CS; lz++)
              for (let lx = 0; lx < CS; lx++) {
                const b = c[(ly << 8) | (lz << 4) | lx];
                if (!b) continue;
                const x = ccx * CS + lx, y = cy * CS + ly, z = ccz * CS + lz;
                const [hex, vari] = PALETTE[b] ?? [0xff00ff, 0];
                const f = 1 + (hash3(x, y, z) - 0.5) * vari * 2;
                color.setHex(hex);
                for (let a = 0; a < 3; a++)
                  for (let si = 0; si < 2; si++) {
                    const s = si === 0 ? 1 : -1;
                    nv[0] = nv[1] = nv[2] = 0;
                    nv[a] = s;
                    if (this.solid(x + nv[0], y + nv[1], z + nv[2])) continue;
                    const u = (a + 1) % 3;
                    const v = (a + 2) % 3;
                    L[0] = x + nv[0];
                    L[1] = y + nv[1];
                    L[2] = z + nv[2];
                    const corners = s > 0 ? CORNERS_POS : CORNERS_NEG;
                    const base = pos.length / 3;
                    // Slightly darker sides and bottoms read better than relying on light alone.
                    const faceShade = a === 1 ? (s > 0 ? 1 : 0.6) : a === 0 ? 0.86 : 0.92;
                    for (let k = 0; k < 4; k++) {
                      const du = corners[k][0], dv = corners[k][1];
                      p[0] = x;
                      p[1] = y;
                      p[2] = z;
                      p[a] += s > 0 ? 1 : 0;
                      p[u] += du;
                      p[v] += dv;
                      s1p[0] = L[0], s1p[1] = L[1], s1p[2] = L[2];
                      s1p[u] += du ? 1 : -1;
                      s2p[0] = L[0], s2p[1] = L[1], s2p[2] = L[2];
                      s2p[v] += dv ? 1 : -1;
                      cp[0] = L[0], cp[1] = L[1], cp[2] = L[2];
                      cp[u] += du ? 1 : -1;
                      cp[v] += dv ? 1 : -1;
                      const e1 = this.solid(s1p[0], s1p[1], s1p[2]);
                      const e2 = this.solid(s2p[0], s2p[1], s2p[2]);
                      const ec = this.solid(cp[0], cp[1], cp[2]);
                      const ao = e1 && e2 ? 0 : 3 - (e1 + e2 + ec);
                      aos[k] = ao;
                      pos.push(p[0], p[1], p[2]);
                      nor.push(nv[0], nv[1], nv[2]);
                      const kk = f * AO_CURVE[ao] * faceShade;
                      col.push(color.r * kk, color.g * kk, color.b * kk);
                    }
                    if (aos[0] + aos[2] > aos[1] + aos[3]) ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
                    else ind.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
                  }
              }
        }
    if (!pos.length) return null;
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), ind: new Uint32Array(ind) };
  }

  /**
   * Build every section at once. Kept for small maps and tools; the game uses ChunkStreamer.
   */
  build(scene: THREE.Scene, physics: RAPIER.World) {
    const s = new ChunkStreamer(this, scene, physics, { radius: 1e9 });
    s.buildAll();
    return s;
  }
}

interface Section {
  mesh: THREE.Mesh;
  collider: RAPIER.Collider | null;
}

/**
 * Meshes the sections near a focus point and throws away far ones, so maps can be much bigger
 * than what fits on the GPU at once. Colliders come with the meshes, nearest sections first.
 */
export class ChunkStreamer {
  readonly radius: number;
  private sections = new Map<number, Section | 'empty'>();
  private dirty = new Set<number>();
  private body: RAPIER.RigidBody;
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private nsx: number;
  private nsz: number;
  /** Sections built so far (for the loading bar and tests). */
  built = 0;

  constructor(readonly world: VoxelWorld, private scene: THREE.Scene, private physics: RAPIER.World, opts: { radius?: number } = {}) {
    this.radius = opts.radius ?? 200;
    this.nsx = Math.ceil(world.sx / SECTION);
    this.nsz = Math.ceil(world.sz / SECTION);
    this.body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.onChange = (sx, sz) => {
      if (sx < 0 || sz < 0 || sx >= this.nsx || sz >= this.nsz) return;
      const k = sz * this.nsx + sx;
      if (this.sections.has(k)) this.dirty.add(k);
    };
  }

  private key(sx: number, sz: number) {
    return sz * this.nsx + sx;
  }

  private drop(k: number) {
    const s = this.sections.get(k);
    if (s && s !== 'empty') {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      if (s.collider) this.physics.removeCollider(s.collider, false);
    }
    this.sections.delete(k);
  }

  private buildSection(sx: number, sz: number) {
    const k = this.key(sx, sz);
    this.drop(k);
    this.built++;
    const m = this.world.meshSection(sx, sz);
    if (!m) {
      this.sections.set(k, 'empty');
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
    geo.setIndex(new THREE.BufferAttribute(m.ind, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    const cd = RAPIER.ColliderDesc.trimesh(m.pos, m.ind).setFriction(0.9).setCollisionGroups(groups(G_WORLD, G_ALL));
    const collider = this.physics.createCollider(cd, this.body);
    this.sections.set(k, { mesh, collider });
  }

  /** Sections within r of (x, z), nearest first. */
  private wanted(x: number, z: number, r: number) {
    const out: [number, number, number][] = [];
    const a = Math.max(0, Math.floor((x - r) / SECTION)), b = Math.min(this.nsx - 1, Math.floor((x + r) / SECTION));
    const c = Math.max(0, Math.floor((z - r) / SECTION)), d = Math.min(this.nsz - 1, Math.floor((z + r) / SECTION));
    for (let sz = c; sz <= d; sz++)
      for (let sx = a; sx <= b; sx++) {
        const cx = (sx + 0.5) * SECTION, cz = (sz + 0.5) * SECTION;
        const dist = Math.hypot(cx - x, cz - z) - SECTION * 0.71;
        if (dist <= r) out.push([sx, sz, dist]);
      }
    out.sort((p, q) => p[2] - q[2]);
    return out;
  }

  /** Synchronously build everything within r (loading screens). */
  buildNear(focus: THREE.Vector3, r = this.radius) {
    for (const [sx, sz] of this.wanted(focus.x, focus.z, r)) if (!this.sections.has(this.key(sx, sz))) this.buildSection(sx, sz);
  }

  buildAll() {
    for (let sz = 0; sz < this.nsz; sz++) for (let sx = 0; sx < this.nsx; sx++) this.buildSection(sx, sz);
  }

  /** Is the ground under (x, z) meshed and solid yet? */
  ready(x: number, z: number) {
    const sx = Math.floor(x / SECTION), sz = Math.floor(z / SECTION);
    return this.sections.has(this.key(sx, sz));
  }

  /** Stream around focus within a time budget (ms). Call every frame. */
  update(focus: THREE.Vector3, budgetMs = 4) {
    const t0 = performance.now();
    // Rebuild edited sections first (they're on screen).
    for (const k of this.dirty) {
      this.dirty.delete(k);
      this.buildSection(k % this.nsx, Math.floor(k / this.nsx));
      if (performance.now() - t0 > budgetMs) return;
    }
    for (const [sx, sz] of this.wanted(focus.x, focus.z, this.radius)) {
      if (this.sections.has(this.key(sx, sz))) continue;
      this.buildSection(sx, sz);
      if (performance.now() - t0 > budgetMs) break;
    }
    // Unload far sections with some hysteresis.
    const far = this.radius + SECTION * 1.5;
    for (const k of this.sections.keys()) {
      const sx = k % this.nsx, sz = Math.floor(k / this.nsx);
      const d = Math.hypot((sx + 0.5) * SECTION - focus.x, (sz + 0.5) * SECTION - focus.z) - SECTION * 0.71;
      if (d > far) this.drop(k);
    }
  }

  /** Number of non-empty sections on the GPU. */
  get loaded() {
    let n = 0;
    for (const s of this.sections.values()) if (s !== 'empty') n++;
    return n;
  }

  dispose() {
    for (const k of [...this.sections.keys()]) this.drop(k);
    this.physics.removeRigidBody(this.body);
    this.mat.dispose();
    if (this.world.onChange) this.world.onChange = null;
  }
}

/** Base color of a block id (used by the minimap). */
export function blockColor(b: number): number {
  return PALETTE[b]?.[0] ?? 0xff00ff;
}
