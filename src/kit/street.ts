import { hash3, mulberry32 } from '../util';
import { DPB, DetailGrid, vox, tint } from './grid';
import { PAL } from './palette';

export type PavingKind = 'cobble' | 'sidewalk' | 'pavers' | 'plaza';
export type Side = 'n' | 's' | 'e' | 'w';

/**
 * Cobble rows: each row of 4 voxels (3 stone + 1 grout) is split into stones of 3 to 6 voxels
 * along a 64-voxel loop, so the pattern is seamless everywhere and every street lines up.
 */
const ROW_LOOP = 64;
const rowCache = new Map<number, Int8Array>();
function cobbleRow(r: number): Int8Array {
  let row = rowCache.get(r);
  if (row) return row;
  row = new Int8Array(ROW_LOOP); // value: position inside the stone, or -1 for grout
  const rng = mulberry32(r * 7919 + 13);
  const lens: number[] = [];
  let total = 0;
  while (total < ROW_LOOP) {
    const l = 4 + Math.floor(rng() * 4); // stone + 1 grout
    lens.push(l);
    total += l;
  }
  lens[lens.length - 1] -= total - ROW_LOOP;
  if (lens[lens.length - 1] < 3) {
    const extra = lens.pop()!;
    lens[lens.length - 1] += extra;
  }
  const off = Math.floor(rng() * ROW_LOOP);
  let p = 0;
  for (const l of lens) {
    for (let i = 0; i < l; i++) row[(off + p + i) % ROW_LOOP] = i === l - 1 ? -1 : i;
    p += l;
  }
  rowCache.set(r, row);
  return row;
}

const COBBLES = [PAL.cobble, PAL.cobble, PAL.cobbleLight, PAL.cobbleDark, 0x6a6470, 0x58607a];

/**
 * Cell value of the top paving layer at world voxel (wx, wz), or 0 for a grout gap.
 * `along` = 'x' runs cobble rows along x.
 */
export function pavingCell(kind: PavingKind, wx: number, wz: number, along: 'x' | 'z' = 'x'): number {
  if (along === 'z') [wx, wz] = [wz, wx];
  switch (kind) {
    case 'cobble': {
      if (((wz % 4) + 4) % 4 === 3) return 0;
      const r = Math.floor(wz / 4);
      const row = cobbleRow(((r % 97) + 97) % 97);
      const i = ((wx % ROW_LOOP) + ROW_LOOP) % ROW_LOOP;
      const pos = row[i];
      if (pos < 0) return 0;
      const start = wx - pos;
      const h = hash3(start, r, 11);
      return vox(COBBLES[Math.floor(h * COBBLES.length)], { jitter: 0.06 });
    }
    case 'sidewalk': {
      const mx = ((wx % 8) + 8) % 8, mz = ((wz % 8) + 8) % 8;
      if (mx === 0 || mz === 0) return 0;
      const h = hash3(Math.floor(wx / 8), Math.floor(wz / 8), 5);
      return vox(tint(PAL.paver, 0.94 + h * 0.1), { jitter: 0.04 });
    }
    case 'pavers': {
      // Basket weave of 4x2 bricks.
      const cx = Math.floor(wx / 4), cz = Math.floor(wz / 4);
      const mx = ((wx % 4) + 4) % 4, mz = ((wz % 4) + 4) % 4;
      const flip = (cx + cz) & 1;
      const across = flip ? mx : mz;
      if (across === 1 || across === 3) return across === 3 ? 0 : brick(cx, cz, flip ? 0 : 1);
      return brick(cx, cz, flip ? 2 : 3);
    }
    case 'plaza': {
      const course = Math.floor(wz / 12);
      const t = wx + (course & 1) * 8;
      if (((wz % 12) + 12) % 12 === 0 || ((t % 16) + 16) % 16 === 0) return 0;
      const h = hash3(Math.floor(t / 16), course, 3);
      return vox(tint(0xcfc4ad, 0.9 + h * 0.15), { jitter: 0.05 });
    }
  }
}
function brick(cx: number, cz: number, k: number) {
  const h = hash3(cx, cz, k);
  return vox(tint(0xa8583e, 0.85 + h * 0.25), { jitter: 0.06 });
}

const GROUT: Record<PavingKind, number> = {
  cobble: PAL.grout,
  sidewalk: 0x8d887e,
  pavers: 0x6e6258,
  plaza: 0x9c9482,
};

/**
 * Two-layer paving grid for a world-space rectangle (in world blocks). Layer 0 is grout, layer 1
 * the stones; curbs add a raised edge on the chosen sides.
 */
export function pavingGrid(kind: PavingKind, x0: number, z0: number, x1: number, z1: number, along: 'x' | 'z', curb: Side[] = []): { grid: DetailGrid; wx0: number; wz0: number } {
  const wx0 = Math.round(x0 * DPB), wz0 = Math.round(z0 * DPB);
  const sx = Math.max(1, Math.round(x1 * DPB) - wx0), sz = Math.max(1, Math.round(z1 * DPB) - wz0);
  const g = new DetailGrid(sx, 3, sz);
  const grout = vox(GROUT[kind], { jitter: 0.08 });
  const curbV = vox(0xb4afa5, { jitter: 0.05 });
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      g.data[g.idx(x, 0, z)] = grout;
      const v = pavingCell(kind, wx0 + x, wz0 + z, along);
      if (v) g.data[g.idx(x, 1, z)] = v;
      const onCurb =
        (curb.includes('n') && z < 2) || (curb.includes('s') && z >= sz - 2) || (curb.includes('w') && x < 2) || (curb.includes('e') && x >= sx - 2);
      if (onCurb) {
        g.data[g.idx(x, 1, z)] = curbV;
        g.data[g.idx(x, 2, z)] = curbV;
      }
    }
  return { grid: g, wx0, wz0 };
}
