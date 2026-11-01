import { hash3 } from '../util';
import { DetailGrid, DV, vox } from './grid';
import { birchBark, line, make, puff, roughBark, SHADES, type PropModel, type Shade } from './shapes';

/**
 * Trees, palms, cacti and other plants. Built at 4 cells per world block (cell size DV * 2) in
 * the chunky "cluster of painted cubes" style: few big faces, so they stay cheap to draw, with
 * the detail in paint (light specks on top, dark ragged undersides, bark bands).
 *
 * Kinds carry their size so a model can match the blocky collision shape a map writes under it
 * (see townkit.ts tree()/pine() and VoxelWorld.prop()):
 *   tree:h:r:leaf    broadleaf; leaf 0 = birch (white bark, light green), 1 = oak (darker)
 *   pine:h           stacked-tier conifer
 *   palm:h:lean      leaning palm with fronds and coconuts (lean -1, 0 or 1 along x)
 *   acacia:h:r:dx:dz flat-topped savanna tree leaning toward (dx, dz)
 *   cactus:h:arms    arms = '-' or dot-separated arm codes (see cactusArms)
 *   bush:s           round shrub, s = width in blocks
 */
export type NatureKind = `tree:${string}` | `pine:${string}` | `palm:${string}` | `acacia:${string}` | `cactus:${string}` | `bush:${string}`;

/** Cells per world block for nature props. */
export const NC = 4;
const SIZE = DV * 2;

const num = (s: string | undefined, d: number) => (s === undefined || s === '' || isNaN(+s) ? d : +s);

/**
 * Canopy of overlapping painted cubes filling an ellipsoid. Puffs are drawn bottom-up so each
 * one's dark underside sits over the tops below it, which is what reads as depth.
 */
function canopy(g: DetailGrid, cx: number, cy: number, cz: number, rx: number, ry: number, shade: Shade, seed: number, n: number) {
  const boxes: [number, number, number, number, number, number][] = [];
  // Core.
  boxes.push([cx - rx * 0.5, cy - ry * 0.5, cz - rx * 0.5, cx + rx * 0.5, cy + ry * 0.5, cz + rx * 0.5]);
  for (let i = 0; i < n; i++) {
    const a = hash3(i, seed, 1) * Math.PI * 2;
    const e = hash3(i, seed, 2) * 2 - 1;
    const rr = Math.sqrt(hash3(i, seed, 3)) * 0.78;
    const px = cx + Math.cos(a) * rx * rr * Math.sqrt(1 - e * e * 0.5);
    const pz = cz + Math.sin(a) * rx * rr * Math.sqrt(1 - e * e * 0.5);
    const py = cy + e * ry * 0.7;
    const s = Math.max(2.5, (0.2 + hash3(i, seed, 4) * 0.16) * rx);
    const sy = Math.max(2.5, s * (0.8 + hash3(i, seed, 5) * 0.5));
    boxes.push([px - s, py - sy, pz - s, px + s, py + sy, pz + s]);
  }
  boxes.sort((a, b) => a[1] - b[1]);
  boxes.forEach((b, i) => {
    const [x0, y0, z0, x1, y1, z1] = b.map(Math.round);
    puff(g, x0, y0, z0, x1, y1, z1, shade, seed * 31 + i);
  });
}

/** Broadleaf tree matching townkit tree(): trunk h blocks, canopy radius r centered h blocks up. */
function tree(args: string[]): PropModel {
  const h = num(args[0], 5), r = num(args[1], 2), oak = num(args[2], 0) === 1;
  const seed = h * 13 + r * 7 + (oak ? 3 : 0);
  const sx = (2 * r + 3) * NC, sy = Math.ceil((h + r + 2) * NC);
  return make(
    sx,
    sy,
    sx,
    [0.25, h / 2, 0.25],
    (g, cx, cz) => {
      const bark = oak ? roughBark(0x5e4128, seed) : birchBark(seed);
      const tw = oak ? 2 : 1; // half width in cells: 4 or 2 cells
      const top = Math.round((h + 0.3) * NC);
      g.box(cx - tw, 0, cz - tw, cx + tw - 1, top, cz + tw - 1, bark);
      // Root flare.
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const fx = dx < 0 ? cx - tw - 1 : dx > 0 ? cx + tw : cx - tw + Math.floor(hash3(dx, dz, seed) * tw * 2);
        const fz = dz < 0 ? cz - tw - 1 : dz > 0 ? cz + tw : cz - tw + Math.floor(hash3(dz, dx, seed) * tw * 2);
        g.box(fx, 0, fz, fx, hash3(dx, seed, dz) > 0.5 ? 1 : 0, fz, bark);
      }
      // A few branches reaching into the canopy.
      const by = Math.round((h - 1.2) * NC);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + hash3(seed, i, 9) * 1.5;
        const len = r * NC * 0.7;
        line(g, [cx, by, cz], [cx + Math.cos(a) * len, by + len * 0.7, cz + Math.sin(a) * len], bark);
      }
      const shade = oak ? SHADES.oakLeafDark : SHADES.birchLeaf;
      const rx = (r + 0.45) * NC, ry = (r / 1.26 + 0.55) * NC;
      canopy(g, cx, (h + 0.5) * NC, cz, rx, ry, shade, seed, 10 + r * 7);
    },
    SIZE,
  );
}

/** Conifer matching townkit pine(): trunk h + 1 blocks, tiers narrowing to a tip at h + 2. */
function pine(args: string[]): PropModel {
  const h = num(args[0], 9);
  const seed = h * 17 + 5;
  const rMax = (h + 2 - 2) / 2.2;
  const sx = (Math.ceil(rMax) * 2 + 3) * NC, sy = (h + 3) * NC;
  return make(
    sx,
    sy,
    sx,
    [0.25, (h + 2) / 2, 0.25],
    (g, cx, cz) => {
      const bark = roughBark(0x5a3e28, seed);
      g.box(cx - 1, 0, cz - 1, cx, (h + 1) * NC, cz, bark);
      const step = 1.6;
      let i = 0;
      const sh = h % 2 ? SHADES.pineLeaf : SHADES.pineLeafB;
      for (let k = 2; k <= h + 1; k += step, i++) {
        const r = Math.max(0.3, (h + 2 - k) / 2.2) * 0.95;
        const hw = Math.max(2, Math.round(r * NC));
        const y0 = Math.round(k * NC), y1 = Math.round((k + step) * NC) + 1;
        // Core of the tier, then branch clumps poking out round its lower edge so the
        // silhouette is ragged rather than a stack of slabs.
        const cw = Math.max(1, Math.round(hw * 0.6));
        puff(g, cx - cw, y0 + 1, cz - cw, cx + cw - 1, y1, cz + cw - 1, sh, seed + i * 7);
        const clumps = 3 + Math.floor(hash3(i, seed, 4) * 3);
        for (let c = 0; c < clumps; c++) {
          const a = ((c + hash3(i, c, seed) * 0.6) / clumps) * Math.PI * 2 + i;
          const d = hw * (0.55 + hash3(c, i, seed) * 0.25);
          const bx = Math.round(cx + Math.cos(a) * d), bz = Math.round(cz + Math.sin(a) * d);
          const bw = Math.max(1, Math.round(hw * (0.35 + hash3(c, seed, i) * 0.15)));
          const by = y0 + Math.round(hash3(seed, c, i) * 2);
          puff(g, bx - bw, by, bz - bw, bx + bw, by + 2 + Math.round(hash3(c, c, i) * 2), bz + bw, sh, seed + i * 13 + c);
        }
      }
      puff(g, cx - 1, Math.round((h + 1.6) * NC), cz - 1, cx, (h + 3) * NC - 1, cz, SHADES.pineLeaf, seed + 99);
    },
    SIZE,
  );
}

/** Palm matching beach world.ts palm(): trunk shifts one block toward `lean` at i = 6, 9 (i > 3, i % 3 == 0). */
function palm(args: string[]): PropModel {
  const h = num(args[0], 10), lean = num(args[1], 1);
  const seed = h * 11 + (lean + 2) * 3;
  const offAt = (i: number) => {
    let o = 0;
    for (let k = 4; k <= i; k++) if (k % 3 === 0) o += lean;
    return o;
  };
  const R = 9;
  const sx = R * 2 * NC, sz = 12 * NC, sy = (h + 3) * NC;
  return make(
    sx,
    sy,
    sz,
    [0.3, h / 2, 0.3],
    (g, cx, cz) => {
      const trunkA = vox(0x9b7a4e, { jitter: 0.06 }), trunkB = vox(0x7a5a36, { jitter: 0.06 }), trunkC = vox(0xb8996a, { jitter: 0.05 });
      // Smooth the stepped lean: interpolate the offset between steps.
      for (let y = 0; y < h * NC; y++) {
        const fi = y / NC;
        const i0 = Math.floor(fi);
        const o = offAt(i0) + (offAt(i0 + 1) - offAt(i0)) * (fi - i0);
        const ox = Math.round(cx + o * NC);
        const band = y % 3 === 0 ? trunkB : y % 3 === 1 ? trunkA : trunkC;
        const w = y < 3 ? 2 : 1;
        g.box(ox - w, y, cz - w, ox + w - (y < 3 ? 0 : 0), y, cz + w, band);
      }
      const px = Math.round(cx + offAt(h) * NC), top = h * NC;
      // Fronds: the eight block directions, drooping past two blocks out.
      const rib = vox(0x8fb84a, { jitter: 0.04 }), leaf = vox(SHADES.palmLeaf.base, { jitter: 0.06 }), leafD = vox(SHADES.palmLeaf.dark, { jitter: 0.06 }), leafL = vox(SHADES.palmLeaf.light, { jitter: 0.03 });
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const steps = Math.round(4.6 * NC);
        const nx = -dz, nz = dx; // perpendicular
        const nl = Math.hypot(nx, nz);
        const yAt = (s: number) => {
          const rr = s / NC;
          const droop = rr > 1.6 ? -((rr - 1.6) * (rr - 1.6)) * 0.42 : rr * 0.3;
          return Math.round(top + 2 + droop * NC);
        };
        for (let s = 0; s <= steps; s++) {
          const x = px + dx * s, z = cz + dz * s, y = yAt(s), yp = s ? yAt(s - 1) : y;
          // Fill down to the previous step so a steep droop stays one connected leaf.
          const ylo = Math.min(y, yp), yhi = Math.max(y, yp);
          for (let yy = ylo; yy <= yhi; yy++) g.set(x, yy, z, rib);
          const width = Math.max(1, Math.round((1 - Math.abs(s / steps - 0.35) * 1.2) * 5));
          for (let k = 1; k <= width; k++) {
            if (k === width && (s + k) % 3 === 0) continue; // ragged leaflet edge
            const c = s > steps * 0.82 ? leafD : hash3(s, k, seed) > 0.92 ? leafL : k > width - 2 ? leafD : leaf;
            const sag = Math.floor(k / 2.5);
            for (const side of [-1, 1]) {
              const bx = Math.round(x + (side * nx * k) / nl), bz = Math.round(z + (side * nz * k) / nl);
              for (let yy = ylo - sag; yy <= yhi - sag; yy++) g.set(bx, yy, bz, c);
            }
          }
        }
      }
      puff(g, px - 2, top, cz - 2, px + 2, top + 3, cz + 2, SHADES.palmLeaf, seed);
      // Coconuts one block below the crown, at +x, -x and +z (same as the blocks they replace).
      const nut = vox(0x5a3a1e, { jitter: 0.1 }), nutL = vox(0x7a5230, { jitter: 0.08 });
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1]]) {
        const ncx = px + dx * 3, ncz = cz + dz * 3, ncy = top - 3;
        g.box(ncx - 1, ncy - 1, ncz - 1, ncx + 1, ncy + 1, ncz + 1, (x, y, z) => ((x === ncx - 1 || x === ncx + 1) && (y === ncy - 1 || y === ncy + 1) && (z === ncz - 1 || z === ncz + 1) ? 0 : y === ncy + 1 ? nutL : nut));
      }
    },
    SIZE,
  );
}

/** Flat-topped acacia: a leaning trunk, a wide two-layer umbrella crown. */
function acacia(args: string[]): PropModel {
  const h = num(args[0], 6), r = num(args[1], 5), ldx = num(args[2], 1), ldz = num(args[3], 0);
  const seed = h * 7 + r * 5 + ldx * 3 + ldz;
  const R = r + 4;
  const sx = R * 2 * NC, sy = (h + 3) * NC;
  const offAt = (i: number) => {
    let ox = 0, oz = 0;
    for (let k = 3; k <= i; k++) if (k % 2 === 0) (ox += ldx), (oz += ldz);
    return [ox, oz];
  };
  return make(
    sx,
    sy,
    sx,
    [0.3, h / 2, 0.3],
    (g, cx, cz) => {
      const bark = roughBark(0x6a5038, seed);
      for (let y = 0; y < h * NC; y++) {
        const fi = y / NC, i0 = Math.floor(fi);
        const a = offAt(i0), b = offAt(i0 + 1);
        const ox = Math.round(cx + (a[0] + (b[0] - a[0]) * (fi - i0)) * NC), oz = Math.round(cz + (a[1] + (b[1] - a[1]) * (fi - i0)) * NC);
        g.box(ox - 1, y, oz - 1, ox, y, oz, bark);
      }
      const [tx, tz] = offAt(h);
      const px = cx + tx * NC, pz = cz + tz * NC, top = h * NC;
      // Forked branches up to the crown.
      for (const s of [-1, 1]) line(g, [px, top - NC, pz], [px + s * 2 * NC, top, pz + s * NC], bark);
      const sh = SHADES.acaciaLeaf;
      // Two flat layers of puffs: wide and thin, then a narrower one on top.
      for (let i = 0; i < 9 + r; i++) {
        const a = hash3(i, seed, 1) * Math.PI * 2, d = Math.sqrt(hash3(i, seed, 2)) * (r - 1) * NC;
        const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d * 0.87;
        const s = Math.round(NC * (0.9 + hash3(i, seed, 3) * 0.8));
        puff(g, Math.round(x - s), top, Math.round(z - s), Math.round(x + s), top + NC - 1 + (hash3(i, seed, 4) > 0.6 ? 1 : 0), Math.round(z + s), sh, seed + i);
      }
      for (let i = 0; i < 5; i++) {
        const a = hash3(i, seed, 7) * Math.PI * 2, d = Math.sqrt(hash3(i, seed, 8)) * (r - 2.5) * NC;
        const s = Math.round(NC * (0.9 + hash3(i, seed, 9) * 0.6));
        const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d * 0.87;
        puff(g, Math.round(x - s), top + NC - 1, Math.round(z - s), Math.round(x + s), top + 2 * NC - 1, Math.round(z + s), sh, seed + 50 + i);
      }
    },
    SIZE,
  );
}

/**
 * Saguaro-style cactus. Arm codes: `<axis><sign><y>l<len>` e.g. 'x+2l3' = an arm toward +x
 * that leaves the trunk 2 blocks up and rises 3 blocks (matching wilderness cactus()).
 */
export function cactusArms(arms: { axis: 'x' | 'z'; sign: 1 | -1; y: number; len: number }[]) {
  return arms.length ? arms.map((a) => `${a.axis}${a.sign > 0 ? '+' : '-'}${a.y}l${a.len}`).join('.') : '-';
}

function cactus(args: string[]): PropModel {
  const h = num(args[0], 5);
  const arms = (args[1] ?? '-')
    .split('.')
    .map((c) => /^([xz])([+-])(\d+)l(\d+)$/.exec(c))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ axis: m[1], sign: m[2] === '+' ? 1 : -1, y: +m[3], len: +m[4] }));
  const seed = h * 19 + arms.length * 7;
  const sx = 7 * NC, sy = (h + 2) * NC;
  return make(
    sx,
    sy,
    sx,
    [0.3, h / 2, 0.3],
    (g, cx, cz) => {
      const G = vox(0x4f8a3a, { jitter: 0.05 }), D = vox(0x3a6a2c, { jitter: 0.05 }), L = vox(0x86b860, { jitter: 0.03 }), S = vox(0xf0e6b8, { jitter: 0 });
      // Ribs: alternating light and dark columns around the trunk, little spines.
      const ribbed = (x: number, y: number, z: number, ax: number, az: number) => {
        const k = (x - ax + z - az + 8) % 2;
        if (hash3(x, y, z + seed) > 0.96) return S;
        return k ? D : G;
      };
      const col = (ax: number, az: number, y0: number, y1: number) => {
        g.box(ax - 1, y0, az - 1, ax + 1, y1, az + 1, (x, y, z) => ((x === ax - 1 || x === ax + 1) && (z === az - 1 || z === az + 1) ? 0 : ribbed(x, y, z, ax, az)));
        g.box(ax, y1 + 1, az, ax, y1 + 1, az, L);
      };
      // Trunk: 1 block wide = 4 cells, drawn as a rounded 4x4.
      g.box(cx - 2, 0, cz - 2, cx + 1, h * NC - 2, cz + 1, (x, y, z) => ((x === cx - 2 || x === cx + 1) && (z === cz - 2 || z === cz + 1) ? 0 : ribbed(x, y, z, cx, cz)));
      g.box(cx - 1, h * NC - 1, cz - 1, cx, h * NC - 1, cz, L);
      for (const a of arms) {
        const dx = a.axis === 'x' ? a.sign : 0, dz = a.axis === 'z' ? a.sign : 0;
        const y = Math.round((a.y + 0.5) * NC);
        const ex = cx + dx * 2 * NC, ez = cz + dz * 2 * NC;
        // Elbow out, then up.
        for (let s = 2; s <= 2 * NC; s++) g.box(cx + dx * s - 1 + (dx ? 0 : 0), y - 1, cz + dz * s - 1, cx + dx * s + 1, y + 1, cz + dz * s + 1, (x, yy, z) => ribbed(x, yy, z, cx, cz));
        col(ex, ez, y, Math.round((a.y + a.len + 0.8) * NC));
      }
    },
    SIZE,
  );
}

function bush(args: string[]): PropModel {
  const s = num(args[0], 1.5);
  const seed = Math.round(s * 10);
  const n = Math.ceil(s * NC) + 4;
  return make(
    n * 2,
    Math.ceil(s * NC * 1.2) + 2,
    n * 2,
    null,
    (g, cx, cz) => {
      const rx = (s / 2) * NC;
      canopy(g, cx, rx * 0.8, cz, rx, rx * 0.8, SHADES.oakLeaf, seed, 4);
    },
    SIZE,
  );
}

export const NATURE_BUILDERS: Record<string, (args: string[]) => PropModel> = { tree, pine, palm, acacia, cactus, bush };
