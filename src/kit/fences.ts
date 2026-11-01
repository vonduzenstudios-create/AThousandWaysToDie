import { hash3 } from '../util';
import { tint, vox } from './grid';
import { make, puff, SHADES, type PropModel } from './shapes';

/**
 * One-block fence segments, laid along x (rotate a quarter turn for lines along z). Kind
 * `fence:<style>:<h>` with h = height in blocks (1 or 2), styles:
 *   picket   white pointed pickets on two rails
 *   rail     wooden post with split rails
 *   iron     black wrought iron with spear tips
 *   chain    galvanised chain-link on a top rail
 *   hedge    clipped hedge (painted foliage block)
 *   barrier  orange and white construction barrier
 * A segment fills the block from x -0.5..0.5 around its origin, so segments butt seamlessly.
 */
export type FenceKind = `fence:${string}`;

function fence(args: string[]): PropModel {
  const style = args[0] ?? 'picket';
  const h = Math.max(1, Math.min(3, +(args[1] ?? 1) || 1));
  const H = h * 8;
  return make(8, H + 2, 8, null, (g) => {
    switch (style) {
      case 'rail': {
        const post = vox(0x6a4a2a, { jitter: 0.1 }), rail = vox(0x8a6038, { jitter: 0.12 }), top = vox(0x9a7048, { jitter: 0.06 }), railD = vox(tint(0x8a6038, 0.8), { jitter: 0.1 });
        g.box(3, 0, 3, 4, H - 1, 4, post);
        g.box(3, H, 3, 4, H, 4, top);
        for (const y of h > 1 ? [3, 8, 13] : [2, 5]) g.box(0, y, 3, 7, y + 1, 4, (x, yy) => (hash3(x, yy, 3) > 0.85 ? railD : rail));
        break;
      }
      case 'iron': {
        const iron = vox(0x1e2024, { jitter: 0.04 }), gold = vox(0xc9a440, { jitter: 0.04 });
        for (const y of [1, H - 3]) g.box(0, y, 3, 7, y, 4, iron);
        for (const x of [1, 5]) {
          g.box(x, 0, 3, x + 1, H, 4, iron);
          g.set(x, H + 1, 3, gold);
          g.set(x + 1, H + 1, 4, gold);
        }
        break;
      }
      case 'chain': {
        const post = vox(0x8d949c, { jitter: 0.05 }), wire = vox(0xa9b0b6, { jitter: 0.03 });
        g.box(0, 0, 4, 0, H, 4, post);
        g.box(0, H, 4, 7, H, 4, post);
        g.box(1, 1, 4, 7, H - 1, 4, (x, y) => ((x + y) % 3 === 0 || (x - y + 30) % 3 === 0 ? wire : 0));
        break;
      }
      case 'hedge':
        puff(g, 0, 0, 1, 7, H - 1, 6, SHADES.hedge, 7);
        // Hedges butt into each other, so no nibbled corners along x: refill the top edge.
        g.box(0, H - 1, 2, 7, H - 1, 5, (x, _y, z) => (g.get(x, H - 1, z) ? 0 : vox(SHADES.hedge.base, { jitter: 0.05 })));
        break;
      case 'barrier': {
        const o = vox(0xf07a2a, { jitter: 0.03 }), w = vox(0xf4f0e6, { jitter: 0.03 }), leg = vox(0x3a3a3e, { jitter: 0.04 });
        for (const x of [0, 7]) g.box(x, 0, 2, x, H - 2, 5, (_x, y, z) => (y < 2 || z === 3 || z === 4 ? leg : 0));
        for (const y0 of h > 1 ? [5, 11] : [3]) g.box(0, y0, 3, 7, y0 + 2, 4, (x) => (Math.floor(x / 2) % 2 ? o : w));
        break;
      }
      default: {
        // Picket.
        const w = vox(0xf2efe6, { jitter: 0.03 }), shade = vox(0xcfcabd, { jitter: 0.03 });
        for (const y of [2, H - 3]) g.box(0, y, 4, 7, y, 4, shade);
        for (const x of [1, 5]) {
          g.box(x, 0, 3, x + 1, H - 1, 3, w);
          g.set(x, H, 3, w);
          g.set(x + 1, H, 3, w);
          g.set(x, H + 1, 3, w);
        }
      }
    }
  });
}

export const FENCE_BUILDERS: Record<string, (args: string[]) => PropModel> = { fence };
