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
  Water: 31,
  Corn: 32,
  Tile: 33,
  Carpet: 34,
  Lamp: 35,
  Orange: 36,
  Purple: 37,
  Pink: 38,
  Steel: 39,
  Marble: 40,
  Chalk: 41,
  Black: 42,
  Tombstone: 43,
  Linoleum: 44,
  Shelf: 45,
  Navy: 46,
  Rubber: 47,
  Grain: 48,
  Mud: 49,
  Ice: 50,
  /** Draws nothing; marks a footprint that a mesh from elsewhere (the building kit) stands on, so nav and collision see it. */
  Footprint: 51,
  /**
   * Invisible solids under detailed kit props (src/kit/props.ts) placed through VoxelWorld.prop():
   * the block shape keeps collision, nav and deaths working while the prop model is what you see.
   * Their palette colors are what the minimap shows.
   */
  GhostWood: 52,
  GhostLeaf: 53,
  GhostProp: 54,
  // Prison and asylum blocks (src/maps/institutions). Ids 230-238 (beach 100-139, city 140-179, wilderness 180-219, travel 220-229).
  PrisonGrey: 230,
  CellFloor: 231,
  ShowerTile: 232,
  Padding: 233,
  PoolTile: 234,
  AsylumWall: 235,
  AsylumLino: 236,
  OrangePaint: 237,
  OfficeCarpet: 238,
} as const;

/** Blocks you can walk (or sink) through. They still render and hide faces behind them. */
export const PASSABLE = new Set<number>([B.Water, B.Corn, B.Grain]);

/** Blocks that collide but never draw (a kit mesh from elsewhere shows instead). */
export const HIDDEN = new Set<number>([B.Footprint, B.GhostWood, B.GhostLeaf, B.GhostProp]);

/** A detailed kit prop queued by map build code; game.ts places these after the build. */
export interface WorldProp {
  kind: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
}

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
  [B.Water]: [0x3f86c8, 0.06],
  [B.Corn]: [0x9cc244, 0.25],
  [B.Tile]: [0xd9dde0, 0.03],
  [B.Carpet]: [0x8a2f3c, 0.08],
  [B.Lamp]: [0xfff3b0, 0.0],
  [B.Orange]: [0xf08a24, 0.05],
  [B.Purple]: [0x7a4fb8, 0.06],
  [B.Pink]: [0xf59ac8, 0.06],
  [B.Steel]: [0xc0582a, 0.08],
  [B.Marble]: [0xe8e4dc, 0.03],
  [B.Chalk]: [0x2f5a3a, 0.05],
  [B.Black]: [0x18181b, 0.05],
  [B.Tombstone]: [0x9a9ca0, 0.1],
  [B.Linoleum]: [0xcfc7a8, 0.05],
  [B.Shelf]: [0xd9d2c0, 0.05],
  [B.Navy]: [0x24305e, 0.05],
  [B.Rubber]: [0x26262b, 0.03],
  [B.Grain]: [0xd9b85a, 0.18],
  [B.Mud]: [0x5e4128, 0.12],
  [B.Ice]: [0xcdeefa, 0.04],
  [B.Footprint]: [0x8c6e60, 0],
  [B.GhostWood]: [0x6e4a2b, 0],
  [B.GhostLeaf]: [0x3f9a35, 0],
  [B.GhostProp]: [0x9a9a96, 0],
  [B.PrisonGrey]: [0x7c8088, 0.08],
  [B.CellFloor]: [0x5d6168, 0.1],
  [B.ShowerTile]: [0xdfe8ec, 0.05],
  [B.Padding]: [0xf1ead2, 0.07],
  [B.PoolTile]: [0x4aa8d8, 0.06],
  [B.AsylumWall]: [0xc9d8c2, 0.05],
  [B.AsylumLino]: [0xb9c4a8, 0.12],
  [B.OrangePaint]: [0xf07a2a, 0.04],
  [B.OfficeCarpet]: [0x7a3a4a, 0.12],
};

const AO_CURVE = [0.42, 0.62, 0.8, 1.0];

/**
 * Painted surface detail per block type, drawn in the shader at 4 x 4 sub-cells per block face
 * (no extra geometry): foliage gets light specks on top and a dark ragged rim along the bottom of
 * its sides, grass gets blade specks, bark grooves, stone and soil grain, planks board seams.
 */
export const Detail = { None: 0, Foliage: 1, Grass: 2, Bark: 3, Stone: 4, Soil: 5, Plank: 6 } as const;
const DETAIL = new Uint8Array(256);
/** Give block ids a painted surface style (maps call this for their own blocks). */
export function blockDetail(style: number, ...ids: number[]) {
  for (const id of ids) DETAIL[id] = style;
}
blockDetail(Detail.Foliage, B.Leaves, B.LeavesDark, B.Hay);
blockDetail(Detail.Grass, B.Grass, B.Flower);
blockDetail(Detail.Bark, B.Wood);
blockDetail(Detail.Stone, B.Stone, B.Gravel, B.Concrete, B.Tombstone, B.Marble);
blockDetail(Detail.Soil, B.Dirt, B.Sand, B.Mud);
blockDetail(Detail.Plank, B.Plank, B.BarnRed);

/** Lambert material for voxel sections, with the painted detail from blockDetail(). */
function voxelMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float vdetail;\nvarying float vDet;\nvarying vec3 vWP;\nvarying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDet = vdetail;\nvON = normal;\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vDet;
varying vec3 vWP;
varying vec3 vON;
float vxHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  int det = int(vDet + 0.5);
  if (det > 0) {
    vec3 p = vWP - vON * 0.02;
    vec3 sub = floor(p * 4.0);
    vec3 fr = fract(p);
    float h = vxHash(sub + 7.0);
    float k = 1.0;
    if (det == 1) {
      if (vON.y > 0.5) k = h > 0.9 ? 1.3 : h < 0.07 ? 0.84 : 1.0;
      else if (vON.y < -0.5) k = 0.8;
      else if (fr.y < 0.25 || (fr.y < 0.5 && h < 0.4)) k = 0.72;
      else k = h > 0.965 ? 1.25 : h < 0.04 ? 0.85 : 1.0;
    } else if (det == 2) {
      if (vON.y > 0.5) k = 0.94 + h * 0.12 + (h > 0.95 ? 0.16 : 0.0);
      else k = (fr.y > 0.7 || (fr.y > 0.45 && h < 0.5)) ? 1.0 : 0.8;
    } else if (det == 3) {
      float g = vxHash(vec3(sub.x, floor(sub.y / 3.0), sub.z) + 3.0);
      k = g > 0.72 ? 0.74 : (h > 0.93 ? 1.15 : 1.0);
    } else if (det == 4) {
      k = 0.9 + h * 0.2;
      if (h < 0.05) k = 0.72;
    } else if (det == 5) {
      k = 0.93 + h * 0.14;
      if (h > 0.95) k = 0.8;
    } else if (det == 6) {
      float board = floor(p.y * 2.0);
      k = 0.94 + vxHash(vec3(board, floor(p.x * 0.5), floor(p.z * 0.5)) + 1.0) * 0.12;
      if (abs(vON.y) < 0.5 && fract(p.y * 2.0) < 0.1) k *= 0.72;
    }
    diffuseColor.rgb *= k;
  }
}`,
      );
  };
  mat.customProgramCacheKey = () => 'voxdetail';
  return mat;
}

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
  /** Detailed kit props queued by build code (see prop()). */
  readonly props: WorldProp[] = [];
  /** Called with section coords when voxels in that section change (the streamer listens). */
  onChange: ((sx: number, sz: number) => void) | null = null;

  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {
    this.ncx = Math.ceil(sx / CS);
    this.ncy = Math.ceil(sy / CS);
    this.ncz = Math.ceil(sz / CS);
    this.chunks = new Array(this.ncx * this.ncy * this.ncz).fill(null);
  }

  /**
   * Queue a detailed kit prop (src/kit/props.ts) at a world position. It is purely visual:
   * write Ghost* blocks for its collision shape. game.ts instances every queued prop after
   * the map build. rotY in radians.
   */
  prop(kind: string, x: number, y: number, z: number, rotY = 0, scale = 1) {
    this.props.push({ kind, x, y, z, rotY, scale });
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
    const b = this.get(x, y, z);
    return b !== 0 && !HIDDEN.has(b) ? 1 : 0;
  }

  private collides(x: number, y: number, z: number) {
    const b = this.get(x, y, z);
    return b !== 0 && !PASSABLE.has(b);
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
    const det: number[] = [];
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
                if (!b || HIDDEN.has(b)) continue;
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
                      det.push(DETAIL[b]);
                    }
                    if (aos[0] + aos[2] > aos[1] + aos[3]) ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
                    else ind.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
                  }
              }
        }
    if (!pos.length) return null;
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), det: new Uint8Array(det), ind: new Uint32Array(ind) };
  }

  /**
   * Collider triangles for one section. Faces are merged greedily into big rectangles, so a flat
   * street is a handful of triangles instead of thousands. Water, crops and other PASSABLE blocks
   * are left out, and so are faces they hide (a riverbed under water still collides).
   */
  sectionCollider(sxi: number, szi: number) {
    const x0 = sxi * SECTION, z0 = szi * SECTION;
    const lo = [x0, 0, z0];
    const hi = [Math.min(x0 + SECTION, this.sx), Math.min(this.sectionTop(sxi, szi), this.sy), Math.min(z0 + SECTION, this.sz)];
    if (hi[0] <= lo[0] || hi[1] <= 0 || hi[2] <= lo[2]) return null;
    const verts: number[] = [];
    const ind: number[] = [];
    const p = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const u = (a + 1) % 3;
      const v = (a + 2) % 3;
      const nu = hi[u] - lo[u];
      const nv = hi[v] - lo[v];
      const mask = new Uint8Array(nu * nv);
      for (const s of [1, -1]) {
        for (let d = lo[a]; d < hi[a]; d++) {
          let any = false;
          for (let j = 0; j < nv; j++)
            for (let i = 0; i < nu; i++) {
              p[a] = d;
              p[u] = lo[u] + i;
              p[v] = lo[v] + j;
              let m = 0;
              if (this.collides(p[0], p[1], p[2])) {
                p[a] += s;
                if (!this.collides(p[0], p[1], p[2])) m = 1;
              }
              mask[j * nu + i] = m;
              if (m) any = true;
            }
          if (!any) continue;
          const plane = d + (s > 0 ? 1 : 0);
          for (let j = 0; j < nv; j++)
            for (let i = 0; i < nu; ) {
              if (!mask[j * nu + i]) {
                i++;
                continue;
              }
              let w = 1;
              while (i + w < nu && mask[j * nu + i + w]) w++;
              let h = 1;
              outer: while (j + h < nv) {
                for (let k = 0; k < w; k++) if (!mask[(j + h) * nu + i + k]) break outer;
                h++;
              }
              for (let jj = 0; jj < h; jj++) for (let k = 0; k < w; k++) mask[(j + jj) * nu + i + k] = 0;
              const base = verts.length / 3;
              const corner = (du: number, dv: number) => {
                const q = [0, 0, 0];
                q[a] = plane;
                q[u] = lo[u] + i + du;
                q[v] = lo[v] + j + dv;
                verts.push(q[0], q[1], q[2]);
              };
              corner(0, 0);
              corner(w, 0);
              corner(w, h);
              corner(0, h);
              if (s > 0) ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
              else ind.push(base, base + 2, base + 1, base, base + 3, base + 2);
              i += w;
            }
        }
      }
    }
    if (!ind.length) return null;
    return { pos: new Float32Array(verts), ind: new Uint32Array(ind) };
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
  private mat = voxelMaterial();
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
    geo.setAttribute('vdetail', new THREE.BufferAttribute(m.det, 1));
    geo.setIndex(new THREE.BufferAttribute(m.ind, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    const c = this.world.sectionCollider(sx, sz);
    const collider = c ? this.physics.createCollider(RAPIER.ColliderDesc.trimesh(c.pos, c.ind).setFriction(0.9).setCollisionGroups(groups(G_WORLD, G_ALL)), this.body) : null;
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
