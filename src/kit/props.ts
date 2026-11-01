import { hash3 } from '../util';
import { vox, tint, speck } from './grid';
import { AWNINGS, FLOWERS, PAL, V } from './palette';
import { blob, cyl, make, type PropModel } from './shapes';
import { NATURE_BUILDERS, type NatureKind } from './nature';
import { CAMP_BUILDERS, type CampKind } from './camp';
import { FENCE_BUILDERS, type FenceKind } from './fences';

export type { PropModel } from './shapes';

/**
 * Small street props, each built once as a voxel model and then instanced. Every prop's grid
 * origin is its footprint center at ground level; `half` is a collider half-size in world units.
 */
export type StreetPropKind =
  | 'lamp'
  | 'bench'
  | 'planter'
  | 'pottedTree'
  | 'cafeTable'
  | 'umbrellaTable'
  | 'bin'
  | 'bollard'
  | 'hydrant'
  | 'crates'
  | 'barrel'
  | 'flowerPot'
  | 'mailbox'
  | 'newsStand'
  | 'signPost'
  | 'flag'
  | 'rope';

/**
 * Every prop the kit can instance. Street props are fixed models; nature, camp and fence kinds
 * may carry parameters after a colon (e.g. 'oak:5:3', 'tentA:d9c8a0', 'fence:picket:1'), each
 * distinct string is its own cached model. See docs/prop-kit.md.
 */
export type PropKind = StreetPropKind | NatureKind | CampKind | FenceKind;

const leafPaint = (seed: number) => speck(seed, [vox(PAL.leaf, { jitter: 0.15 }), vox(PAL.leafDark, { jitter: 0.15 }), vox(PAL.leafLight, { jitter: 0.15 })]);

const BUILDERS: Record<StreetPropKind, () => PropModel> = {
  lamp: () =>
    make(9, 36, 9, [0.15, 2.2, 0.15], (g, c) => {
      const iron = V.iron;
      g.box(c - 2, 0, c - 2, c + 2, 1, c + 2, iron);
      g.box(c - 1, 2, c - 1, c + 1, 4, c + 1, iron);
      g.box(c, 5, c, c, 28, c, iron);
      g.box(c - 1, 12, c - 1, c + 1, 12, c + 1, iron);
      // Lantern: cap, glowing panes, base.
      g.box(c - 2, 29, c - 2, c + 2, 29, c + 2, iron);
      g.box(c - 2, 30, c - 2, c + 2, 33, c + 2, (x, _y, z) => ((x === c - 2 || x === c + 2) && (z === c - 2 || z === c + 2) ? iron : V.warmBulb));
      g.box(c - 3, 34, c - 3, c + 3, 34, c + 3, iron);
      g.box(c - 1, 35, c - 1, c + 1, 35, c + 1, iron);
    }),
  bench: () =>
    make(16, 8, 6, [0.95, 0.4, 0.3], (g) => {
      const slat = vox(PAL.woodLight, { jitter: 0.1 });
      for (const x of [1, 14]) {
        g.box(x, 0, 0, x, 3, 0, V.iron);
        g.box(x, 0, 4, x, 7, 4, V.iron);
        g.box(x, 3, 0, x, 3, 4, V.iron);
      }
      g.box(0, 4, 0, 15, 4, 3, (_x, _y, z) => (z % 2 === 0 ? slat : 0));
      g.box(0, 5, 4, 15, 7, 4, (_x, y) => (y !== 6 ? slat : 0));
    }),
  planter: () =>
    make(10, 12, 10, [0.6, 0.45, 0.6], (g, c) => {
      const wood = vox(PAL.woodDark, { jitter: 0.08 });
      g.box(0, 0, 0, 9, 4, 9, (x, y, z) => (y === 4 || x === 0 || x === 9 || z === 0 || z === 9 ? wood : vox(0x4a3424)));
      blob(g, c, 7.5, c, 4.6, leafPaint(3), 0.7, 3);
      for (let i = 0; i < 8; i++) g.set(2 + Math.floor(hash3(i, 1, 2) * 6), 9 + Math.floor(hash3(i, 2, 3) * 3), 2 + Math.floor(hash3(i, 3, 4) * 6), vox(FLOWERS[i % FLOWERS.length]));
    }),
  pottedTree: () =>
    make(13, 30, 13, [0.3, 1.8, 0.3], (g, c) => {
      cyl(g, c, c, 3, 0, 4, vox(PAL.terracotta, { jitter: 0.06 }));
      cyl(g, c, c, 3.6, 5, 5, vox(tint(PAL.terracotta, 0.85), { jitter: 0.06 }));
      g.box(c, 5, c, c, 18, c, V.wood);
      blob(g, c + 0.5, 22, c + 0.5, 6.2, leafPaint(5), 0.7, 5);
    }),
  cafeTable: () =>
    make(18, 8, 8, [0.4, 0.4, 0.4], (g) => {
      const top = vox(PAL.trimWhite, { jitter: 0.04 });
      cyl(g, 9, 4, 2.6, 6, 6, top);
      g.box(9, 0, 4, 9, 5, 4, V.iron);
      g.box(8, 0, 3, 10, 0, 5, V.iron);
      const chair = vox(0x2f5e3b, { jitter: 0.05 });
      for (const [x, back] of [[3, 1], [14, 16]]) {
        g.box(x - 1, 0, 2, x + 1, 3, 6, (xx, y, z) => (y === 3 || ((xx === x - 1 || xx === x + 1) && (z === 2 || z === 6)) ? chair : 0));
        g.box(back, 4, 2, back, 7, 6, (_x, y) => (y % 2 === 1 ? chair : 0));
        g.box(back, 4, 2, back, 7, 2, chair);
        g.box(back, 4, 6, back, 7, 6, chair);
      }
    }),
  umbrellaTable: () =>
    make(23, 26, 23, [0.4, 0.4, 0.4], (g, c) => {
      const top = vox(PAL.trimWhite, { jitter: 0.04 });
      cyl(g, c, c, 2.8, 6, 6, top);
      g.box(c, 0, c, c, 21, c, V.iron);
      const [a, b] = AWNINGS[0];
      const A = vox(a, { jitter: 0.04 }), B = vox(b, { jitter: 0.04 });
      for (let i = 0; i < 4; i++) {
        const r = 11 - i * 3;
        cyl(g, c + 0.5, c + 0.5, r, 18 + i, 18 + i, (x, _y, z) => (Math.floor((Math.atan2(z - c, x - c) + Math.PI) / (Math.PI / 4)) % 2 ? A : B));
      }
      const chairV = vox(0x2f5e3b, { jitter: 0.05 });
      for (const [x, z, bx, bz] of [[c - 6, c, -1, 0], [c + 6, c, 1, 0], [c, c - 6, 0, -1], [c, c + 6, 0, 1]]) {
        g.box(x - 1, 3, z - 1, x + 1, 3, z + 1, chairV);
        for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.box(x + lx, 0, z + lz, x + lx, 2, z + lz, chairV);
        // Back on the side away from the table.
        g.box(x + bx * 1 - (bz ? 1 : 0), 4, z + bz * 1 - (bx ? 1 : 0), x + bx * 1 + (bz ? 1 : 0), 6, z + bz * 1 + (bx ? 1 : 0), chairV);
      }
    }),
  bin: () =>
    make(6, 9, 6, [0.3, 0.55, 0.3], (g, c) => {
      const green = vox(0x2f5e3b, { jitter: 0.05 });
      cyl(g, c, c, 2.6, 0, 7, (_x, y) => (y % 3 === 2 ? vox(0x24472e) : green));
      cyl(g, c, c, 3, 8, 8, V.iron);
    }),
  bollard: () =>
    make(3, 7, 3, [0.15, 0.45, 0.15], (g) => {
      g.box(0, 0, 0, 2, 5, 2, (_x, y) => (y === 4 ? V.gold : V.iron));
      g.set(1, 6, 1, V.iron);
    }),
  hydrant: () =>
    make(6, 8, 6, [0.25, 0.5, 0.25], (g, c) => {
      const red = vox(0xc8302c, { jitter: 0.05 });
      cyl(g, c, c, 2.2, 0, 0, red);
      cyl(g, c, c, 1.6, 1, 6, red);
      g.box(c - 3, 3, c - 1, c + 2, 4, c, red);
      g.box(c - 1, 7, c - 1, c, 7, c, V.metal);
    }),
  crates: () =>
    make(14, 14, 8, [0.85, 0.85, 0.5], (g) => {
      const wood = vox(PAL.woodLight, { jitter: 0.12 });
      const dark = vox(PAL.wood, { jitter: 0.1 });
      const crate = (x: number, y: number, z: number, s: number) =>
        g.box(x, y, z, x + s - 1, y + s - 1, z + s - 1, (xx, yy, zz) => {
          const ex = [xx === x || xx === x + s - 1, yy === y || yy === y + s - 1, zz === z || zz === z + s - 1].filter(Boolean).length;
          return ex >= 2 ? dark : wood;
        });
      crate(0, 0, 0, 7);
      crate(7, 0, 1, 6);
      crate(2, 7, 1, 6);
    }),
  barrel: () =>
    make(7, 9, 7, [0.35, 0.55, 0.35], (g, c) => {
      cyl(g, c, c, 2.8, 0, 8, (_x, y) => (y === 1 || y === 7 ? V.iron : y > 2 && y < 6 ? vox(PAL.wood, { jitter: 0.12 }) : vox(tint(PAL.wood, 0.9), { jitter: 0.12 })));
      cyl(g, c, c, 3.3, 3, 5, vox(PAL.wood, { jitter: 0.12 }));
    }),
  flowerPot: () =>
    make(6, 8, 6, null, (g, c) => {
      cyl(g, c, c, 2.4, 0, 3, vox(PAL.terracotta, { jitter: 0.06 }));
      blob(g, c, 5, c, 2.8, (x, y, z) => (hash3(x, y, z) < 0.35 ? vox(FLOWERS[Math.floor(hash3(z, x, y) * FLOWERS.length)]) : leafPaint(7)(x, y, z)), 0.6, 9);
    }),
  mailbox: () =>
    make(5, 11, 5, [0.25, 0.65, 0.25], (g) => {
      const blue = vox(0x2f4f8f, { jitter: 0.05 });
      g.box(0, 0, 0, 4, 0, 4, V.iron);
      g.box(1, 1, 1, 3, 3, 3, blue);
      g.box(0, 4, 0, 4, 9, 4, blue);
      g.box(1, 10, 0, 3, 10, 4, blue);
      g.box(1, 7, -1, 3, 7, -1, V.iron);
    }),
  newsStand: () =>
    make(8, 10, 6, [0.5, 0.6, 0.4], (g) => {
      const red = vox(0xb8302c, { jitter: 0.05 });
      g.box(0, 0, 0, 7, 9, 5, red);
      g.box(1, 4, 0, 6, 8, 0, V.glass);
      g.box(1, 5, 0, 6, 6, 0, vox(0xeeeeee));
    }),
  signPost: () =>
    make(9, 24, 3, [0.12, 1.5, 0.12], (g) => {
      g.box(4, 0, 1, 4, 23, 1, V.metal);
      g.box(0, 18, 1, 8, 22, 1, vox(0x2f7a45, { jitter: 0.03 }));
      g.box(1, 19, 0, 7, 21, 0, vox(0x2f7a45, { jitter: 0.03 }));
      g.box(1, 20, 0, 7, 20, 0, (x) => (x % 2 ? vox(0xf0f0f0) : 0));
    }),
  flag: () =>
    // A small pennant for bunting; tinted per instance.
    make(5, 5, 1, null, (g) => {
      const w = vox(0xffffff, { jitter: 0.04 });
      for (let y = 0; y < 5; y++) {
        const inset = Math.floor((4 - y) / 2);
        g.box(inset, y, 0, 4 - inset, y, 0, w);
      }
    }),
  rope: () => make(1, 1, 1, null, (g) => g.set(0, 0, 0, vox(0x2a2a2a, { jitter: 0 }))),
};

/** Parameterized families: the part before the first colon picks the builder. */
const FAMILIES: Record<string, (args: string[]) => PropModel> = { ...NATURE_BUILDERS, ...CAMP_BUILDERS, ...FENCE_BUILDERS };

const models = new Map<string, PropModel>();
export function propModel(kind: PropKind): PropModel {
  let m = models.get(kind);
  if (!m) {
    const [head, ...args] = kind.split(':');
    const street = (BUILDERS as Record<string, () => PropModel>)[head];
    const fam = FAMILIES[head];
    if (street) m = street();
    else if (fam) m = fam(args);
    else throw new Error(`unknown prop kind ${kind}`);
    models.set(kind, m);
  }
  return m;
}

/** The fixed street props plus one example of each family (for showcases). */
export const PROP_KINDS = Object.keys(BUILDERS) as StreetPropKind[];
