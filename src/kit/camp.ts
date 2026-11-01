import { hash3 } from '../util';
import { mix, tint, vox } from './grid';
import { cyl, line, make, roughBark, scatter, shadeOf, SHADES, type PropModel } from './shapes';

/**
 * Camping and beach props at full detail (8 cells per block).
 *   tentA:hex          ridge tent, 7 x 6 blocks, 4 tall, door on the -z end (wilderness tent())
 *   beachUmbrella:hex  pole plus 8-gore canopy (beach world.ts umbrellas)
 *   campfire           stone ring with crossed logs, 5 blocks across
 *   picnicTable        5 long (x) by 4 deep (z): table and two benches
 */
export type CampKind = `tentA:${string}` | `beachUmbrella:${string}` | 'campfire' | 'picnicTable';

const hex = (s: string | undefined, d: number) => (s && /^[0-9a-f]{6}$/i.test(s) ? parseInt(s, 16) : d);

/**
 * A-frame canvas tent. The roof is built column by column so each step of the slope is its own
 * strip of canvas: that stepped, layered fabric look plus seams, a dark hem, a ridge pole, a
 * recessed front wall with a tied-back door and stakes with guy lines.
 */
function tentA(args: string[]): PropModel {
  const base = hex(args[0], SHADES.canvas.base);
  const sh = args[0] ? shadeOf(base) : SHADES.canvas;
  const W = 56, D = 48, H = 31;
  return make(
    W + 10,
    H + 4,
    D + 14,
    [3.4, 2, 2.9],
    (g, cx, cz) => {
      const x0 = cx - W / 2, x1 = cx + W / 2 - 1, z0 = cz - D / 2, z1 = cz + D / 2 - 1;
      const C = vox(sh.base, { jitter: 0.04 }), CL = vox(sh.light, { jitter: 0.03 }), CD = vox(sh.dark, { jitter: 0.05 }), CM = vox(mix(sh.base, sh.dark, 0.4), { jitter: 0.04 });
      const hem = vox(tint(sh.dark, 0.8), { jitter: 0.06 });
      const roofY = (x: number, z: number) => {
        const t = 1 - Math.abs(x + 0.5 - cx) / (W / 2);
        const along = (z - z0) / (D - 1);
        // Slight sag between the poles and a soft belly halfway down each side.
        return Math.max(0, Math.round(H * t - Math.sin(Math.PI * along) * 1.2 - Math.sin(Math.PI * t) * 1.4));
      };
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const y = roofY(x, z);
          const lo = Math.min(y, roofY(x - 1, z), roofY(x + 1, z));
          for (let yy = Math.max(0, lo - 1); yy <= y; yy++) {
            const seam = (z - z0) % 12 === 0 && z !== z0;
            const r = hash3(x, yy, z);
            let c = C;
            if (yy <= 1) c = hem;
            else if (seam) c = CM;
            else if (yy % 4 === 0) c = r > 0.5 ? CM : C; // the layered bands of the fabric
            else if (yy === y && r > 0.965) c = CL;
            else if (z === z0 || z === z1) c = CD; // rolled edges
            g.set(x, yy, z, c);
          }
        }
      // Ridge pole, poking out at both ends.
      const pole = vox(0x9a7448, { jitter: 0.06 });
      const ry = roofY(cx, cz);
      g.box(cx - 1, ry + 1, z0 - 1, cx, ry + 1, z1 + 1, pole);
      for (const z of [z0 + 1, z1 - 1]) g.box(cx - 1, 0, z, cx - 1, ry, z, pole);
      // Front and back walls, set back two cells under the roof.
      const wall = vox(mix(sh.base, sh.dark, 0.25), { jitter: 0.04 });
      const dark = vox(0x2a241c, { jitter: 0.04 });
      const doorH = 21;
      for (const [wz, front] of [[z0 + 2, true], [z1 - 2, false]] as [number, boolean][])
        for (let x = x0 + 2; x <= x1 - 2; x++)
          for (let y = 0; y < roofY(x, wz); y++) {
            const inDoor = front && y < doorH && Math.abs(x + 0.5 - cx) < (doorH - y) * 0.42;
            if (inDoor) {
              g.set(x, y, wz + 6, dark); // shadowy inside
              continue;
            }
            g.set(x, y, wz, y <= 1 ? hem : wall);
          }
      // Tied-back door flaps.
      for (const s of [-1, 1])
        for (let y = 2; y < doorH - 4; y++) {
          const w = Math.max(1, Math.round((doorH - 4 - y) * 0.22));
          const xe = Math.round(cx + s * ((doorH - y) * 0.42));
          for (let k = 0; k < w; k++) g.set(xe + s * k, y, z0 + 1, k === w - 1 ? CD : CL);
        }
      g.box(cx - 6, 7, z0 + 1, cx - 5, 8, z0 + 1, vox(0x7a5a3a));
      g.box(cx + 4, 7, z0 + 1, cx + 5, 8, z0 + 1, vox(0x7a5a3a));
      // Ground cloth inside.
      g.box(x0 + 6, 0, z0 + 3, x1 - 6, 0, z1 - 3, vox(tint(sh.dark, 0.7), { jitter: 0.05 }));
      // Corner stakes and guy lines to front/back stakes.
      const stake = vox(0x8a5a2e, { jitter: 0.06 }), stakeTop = vox(0xc28a52, { jitter: 0.04 });
      const rope = vox(0xcfc2a0, { jitter: 0.02 });
      for (const [sx, sz] of [[x0 - 2, z0], [x1 + 2, z0], [x0 - 2, z1], [x1 + 2, z1]]) {
        g.box(sx, 0, sz, sx, 3, sz, stake);
        g.set(sx, 4, sz, stakeTop);
        line(g, [sx, 3, sz], [sx + (sx < cx ? 2 : -2), 3, sz], rope);
      }
      for (const [sz, dz] of [[z0 - 6, -1], [z1 + 6, 1]]) {
        g.box(cx - 1, 0, sz, cx - 1, 2, sz, stake);
        g.set(cx - 1, 3, sz, stakeTop);
        line(g, [cx - 1, ry, dz < 0 ? z0 - 2 : z1 + 2], [cx - 1, 2, sz], rope);
      }
    },
  );
}

/** Beach umbrella over a pole block, canopy covering the blocks a 5x5 diamond did. */
function beachUmbrella(args: string[]): PropModel {
  const col = hex(args[0], 0xe8423a);
  return make(46, 42, 46, [0.1, 2, 0.1], (g, cx, cz) => {
    const pole = vox(0xe8e4dc, { jitter: 0.03 }), poleD = vox(0x9a9a96, { jitter: 0.03 });
    g.box(cx - 1, 0, cz - 1, cx, 38, cz, (_x, y) => (y % 10 === 0 ? poleD : pole));
    const A = vox(col, { jitter: 0.03 }), AD = vox(tint(col, 0.75), { jitter: 0.03 }), Wt = vox(0xf6f2ea, { jitter: 0.03 }), WD = vox(0xcfc8bb, { jitter: 0.03 });
    const R = 21;
    for (let z = cz - R; z <= cz + R; z++)
      for (let x = cx - R; x <= cx + R; x++) {
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz, d = Math.hypot(dx, dz);
        if (d > R) continue;
        const t = d / R;
        const y = Math.round(38 - t * 9 - t * t * 4);
        const gore = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 8) % 2;
        const rib = Math.abs(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 8 - Math.round(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 8)) < 0.04 && t > 0.15;
        g.set(x, y, z, rib ? (gore ? WD : AD) : gore ? Wt : A);
        g.set(x, y - 1, z, gore ? WD : AD);
        // Scalloped valance.
        if (d > R - 1.5) {
          const sc = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 32) % 2;
          g.box(x, y - (sc ? 3 : 2), z, x, y - 1, z, gore ? Wt : A);
        }
      }
    g.box(cx - 1, 39, cz - 1, cx, 40, cz, poleD);
  });
}

/** Ring of chunky stones round a pile of crossed, charred logs (wilderness fire ring). */
function campfire(): PropModel {
  return make(46, 10, 46, null, (g, cx, cz) => {
    const stones = scatter(7, [0x8a8a84, 0x9f9e96, 0x75746e, 0xa9a69c]);
    for (let a = 0; a < 10; a++) {
      const sx = Math.round(cx + Math.cos(a * 0.63) * 2.2 * 8), sz = Math.round(cz + Math.sin(a * 0.63) * 2.2 * 8);
      const r = 3 + hash3(a, 1, 2) * 1.2;
      for (let y = 0; y < 5; y++) cyl(g, sx, sz, r - y * 0.45, y, y, (x, yy, z) => (yy === 4 || hash3(x, yy, z) > 0.8 ? vox(0xb8b5aa, { jitter: 0.05 }) : stones(x, yy, z)));
    }
    cyl(g, cx, cz, 11, 0, 0, scatter(3, [0x3a3530, 0x4a443c, 0x2a2622, 0x5a5048]));
    const log = roughBark(0x5a3e28, 4), char = vox(0x1e1a18, { jitter: 0.05 }), ember = vox(0xff8a2a, { emissive: true, jitter: 0.1 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI + 0.3;
      const ax = Math.cos(a) * 9, az = Math.sin(a) * 9;
      line(g, [cx - ax, 1, cz - az], [cx + ax, 5, cz + az], (x, y, z) => (hash3(x, y, z) > 0.7 ? char : log(x, y, z)), 1);
    }
    for (let i = 0; i < 14; i++) g.set(cx - 4 + Math.floor(hash3(i, 3, 3) * 9), 1, cz - 4 + Math.floor(hash3(i, 4, 4) * 9), ember);
  });
}

/** Picnic table: plank top with gaps, A-frame legs, two benches. 5 x 4 blocks. */
function picnicTable(): PropModel {
  return make(40, 17, 32, [2.5, 0.9, 2], (g) => {
    const wood = vox(0x9a6a3a, { jitter: 0.1 }), woodL = vox(0xb07e48, { jitter: 0.08 }), woodD = vox(0x6e4a28, { jitter: 0.08 });
    // Top: z 8..23 (the middle two blocks), planks along x with 1-cell gaps.
    for (let z = 8; z <= 23; z++) if ((z - 8) % 4 !== 3) g.box(0, 14, z, 39, 15, z, (x, y) => (y === 15 && hash3(x, z, 1) > 0.95 ? woodL : wood));
    // Benches: z 0..5 and 26..31.
    for (const [b0, b1] of [[1, 6], [25, 30]]) {
      for (let z = b0; z <= b1; z++) if ((z - b0) % 3 !== 2) g.box(0, 7, z, 39, 7, z, wood);
      for (const x of [4, 35]) g.box(x, 0, b0 + 1, x + 1, 6, b1 - 1, (_x, y, z) => (y < 6 && z !== b0 + 2 && z !== b1 - 2 ? 0 : woodD));
    }
    // A-frame legs from the bench rails up under the top.
    for (const x of [6, 33])
      for (let y = 0; y <= 13; y++) {
        const off = Math.round((13 - y) * 0.85);
        g.box(x, y, 9 - off + 4, x + 1, y, 10 - off + 4, woodD);
        g.box(x, y, 21 + off - 4, x + 1, y, 22 + off - 4, woodD);
      }
    for (const x of [6, 33]) g.box(x, 6, 2, x + 1, 6, 29, woodD);
  });
}

export const CAMP_BUILDERS: Record<string, (args: string[]) => PropModel> = { tentA, beachUmbrella, campfire, picnicTable };

