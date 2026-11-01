/**
 * Meshing core with no three.js dependency, so it also runs inside the mesh worker.
 */

/** World size of one detail voxel (same as grid.ts DV). */
const DV = 1 / 8;

/** The parts of a DetailGrid the mesher needs. */
export interface GridLike {
  data: Uint32Array;
  sx: number;
  sy: number;
  sz: number;
}

/** Raw mesh arrays, ready for a BufferGeometry or a postMessage transfer. */
export interface MeshArrays {
  pos: Float32Array;
  nor: Int8Array;
  col: Float32Array;
  meta: Uint8Array;
  index: Uint16Array | Uint32Array;
}

const colorOf = (v: number) => v & 0xffffff;
const jitterOf = (v: number) => (((v >>> 24) >> 1) & 15) / 40;
const isEmissive = (v: number) => ((v >>> 24) & 32) !== 0;
const isGlass = (v: number) => ((v >>> 24) & 64) !== 0;

const AO_CURVE = [0.5, 0.68, 0.85, 1.0];

/** sRGB byte to linear float, since vertex colors are linear. */
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Growable typed vertex arrays. */
class VertexBuffers {
  pos = new Float32Array(3 * 4096);
  nor = new Int8Array(3 * 4096);
  col = new Float32Array(3 * 4096);
  meta = new Uint8Array(3 * 4096);
  count = () => 0;
  reserve(n: number) {
    const need = (this.count() + n) * 3;
    if (need <= this.pos.length) return;
    const len = Math.max(need, this.pos.length * 2);
    const grow = <T extends Float32Array | Int8Array | Uint8Array>(a: T, make: (n: number) => T) => {
      const b = make(len);
      b.set(a);
      return b;
    };
    this.pos = grow(this.pos, (n) => new Float32Array(n));
    this.nor = grow(this.nor, (n) => new Int8Array(n));
    this.col = grow(this.col, (n) => new Float32Array(n));
    this.meta = grow(this.meta, (n) => new Uint8Array(n));
  }
}

export interface MeshOptions {
  /** Grid cell (in voxels) that becomes the geometry's (0,0,0). Default [0,0,0]. */
  origin?: [number, number, number];
  /** World size of one cell. Default DV (1/8). */
  size?: number;
  /** Strength of baked ambient occlusion, 0..1. Default 1. */
  ao?: number;
  /** Skip downward faces on the bottom layer (things that sit on the ground). */
  noBottom?: boolean;
}

/**
 * Greedy mesher with baked per-vertex ambient occlusion. Adjacent faces with the same cell value
 * and the same corner AO merge into one quad, so a flat stucco wall is a handful of triangles
 * while a shutter with slats keeps every slat. Per-voxel color noise is added later in the
 * shader (see material.ts), which is why it does not stop faces from merging.
 *
 * Arrays: position, normal, color (linear rgb with AO), vmeta (jitter, emissive, glass), index.
 */
export function meshArrays(g: GridLike, opts: MeshOptions = {}): MeshArrays {
  const [ox, oy, oz] = opts.origin ?? [0, 0, 0];
  const size = opts.size ?? DV;
  const aoK = opts.ao ?? 1;
  const curve = AO_CURVE.map((c) => 1 - (1 - c) * aoK);
  const dims = [g.sx, g.sy, g.sz];
  const data = g.data;
  const sx = g.sx, sz = g.sz;
  // Index strides per axis: x = 1, y = sx*sz, z = sx.
  const strides = [1, sx * sz, sx];

  const out = new VertexBuffers();
  const ind: number[] = [];
  let nVerts = 0;
  const cv = [0, 0, 0];
  const aoq = [0, 0, 0, 0];
  out.count = () => nVerts;

  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    const du = dims[u], dv = dims[v], da = dims[a];
    const sA = strides[a], sU = strides[u], sV = strides[v];
    const maskV = new Uint32Array(du * dv);
    const maskA = new Uint8Array(du * dv);
    for (const s of [1, -1]) {
      for (let d = 0; d < da; d++) {
        // Skip only the faces resting on the ground; ceilings, awnings and balconies keep their undersides.
        if (opts.noBottom && a === 1 && s === -1 && d === 0) continue;
        const nd = d + s;
        const neighbourIn = nd >= 0 && nd < da;
        // Build the face mask for this slice.
        let any = false;
        for (let j = 0; j < dv; j++) {
          const rowBase = d * sA + j * sV;
          for (let i = 0; i < du; i++) {
            const m = j * du + i;
            const idx = rowBase + i * sU;
            const val = data[idx];
            if (!val) {
              maskV[m] = 0;
              continue;
            }
            const L = idx + s * sA; // the air cell in front of the face
            if (neighbourIn && data[L]) {
              maskV[m] = 0;
              continue;
            }
            let packed = 0;
            if (neighbourIn) {
              // AO for the 4 corners, sampled in the air layer in front of the face.
              const um = i > 0, up = i < du - 1, vm = j > 0, vp = j < dv - 1;
              const sUm = um && data[L - sU] ? 1 : 0;
              const sUp = up && data[L + sU] ? 1 : 0;
              const sVm = vm && data[L - sV] ? 1 : 0;
              const sVp = vp && data[L + sV] ? 1 : 0;
              if (sUm | sUp | sVm | sVp | (um && vm && data[L - sU - sV] ? 1 : 0) | (up && vm && data[L + sU - sV] ? 1 : 0) | (up && vp && data[L + sU + sV] ? 1 : 0) | (um && vp && data[L - sU + sV] ? 1 : 0)) {
                const cMM = um && vm && data[L - sU - sV] ? 1 : 0;
                const cPM = up && vm && data[L + sU - sV] ? 1 : 0;
                const cPP = up && vp && data[L + sU + sV] ? 1 : 0;
                const cMP = um && vp && data[L - sU + sV] ? 1 : 0;
                const a0 = sUm && sVm ? 0 : 3 - (sUm + sVm + cMM);
                const a1 = sUp && sVm ? 0 : 3 - (sUp + sVm + cPM);
                const a2 = sUp && sVp ? 0 : 3 - (sUp + sVp + cPP);
                const a3 = sUm && sVp ? 0 : 3 - (sUm + sVp + cMP);
                packed = a0 | (a1 << 2) | (a2 << 4) | (a3 << 6);
              } else packed = 255;
            } else packed = 255;
            maskV[m] = val;
            maskA[m] = packed;
            any = true;
          }
        }
        if (!any) continue;

        // Greedy merge.
        for (let j = 0; j < dv; j++)
          for (let i = 0; i < du; ) {
            const m = j * du + i;
            const val = maskV[m];
            if (!val) {
              i++;
              continue;
            }
            const ao = maskA[m];
            let w = 1;
            while (i + w < du && maskV[m + w] === val && maskA[m + w] === ao) w++;
            let h = 1;
            outer: while (j + h < dv) {
              for (let k = 0; k < w; k++) {
                const mm = (j + h) * du + i + k;
                if (maskV[mm] !== val || maskA[mm] !== ao) break outer;
              }
              h++;
            }
            for (let jj = 0; jj < h; jj++) maskV.fill(0, (j + jj) * du + i, (j + jj) * du + i + w);

            // Emit the quad. Corners k: 0=(i,j) 1=(i+w,j) 2=(i+w,j+h) 3=(i,j+h).
            const hex = colorOf(val);
            const r = LIN[(hex >> 16) & 255], gg = LIN[(hex >> 8) & 255], bb = LIN[hex & 255];
            const jit = Math.round(jitterOf(val) * 255), em = isEmissive(val) ? 255 : 0, gl = isGlass(val) ? 255 : 0;
            const base = nVerts;
            out.reserve(4);
            const P = out.pos, N = out.nor, C = out.col, M = out.meta;
            for (let q = 0; q < 4; q++) {
              const k = s > 0 ? q : (4 - q) & 3; // 0,1,2,3 or 0,3,2,1
              cv[a] = d + (s > 0 ? 1 : 0);
              cv[u] = i + (k === 1 || k === 2 ? w : 0);
              cv[v] = j + (k >= 2 ? h : 0);
              const o3 = nVerts * 3;
              P[o3] = (cv[0] - ox) * size;
              P[o3 + 1] = (cv[1] - oy) * size;
              P[o3 + 2] = (cv[2] - oz) * size;
              N[o3] = a === 0 ? s * 127 : 0;
              N[o3 + 1] = a === 1 ? s * 127 : 0;
              N[o3 + 2] = a === 2 ? s * 127 : 0;
              const aov = (ao >> (k * 2)) & 3;
              aoq[q] = aov;
              const f = em ? 1 : curve[aov];
              C[o3] = r * f;
              C[o3 + 1] = gg * f;
              C[o3 + 2] = bb * f;
              M[o3] = jit;
              M[o3 + 1] = em;
              M[o3 + 2] = gl;
              nVerts++;
            }
            if (aoq[0] + aoq[2] > aoq[1] + aoq[3]) ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
            else ind.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            i += w;
          }
      }
    }
  }

  const n3 = nVerts * 3;
  return {
    pos: out.pos.slice(0, n3),
    nor: out.nor.slice(0, n3),
    col: out.col.slice(0, n3),
    meta: out.meta.slice(0, n3),
    index: nVerts > 65535 ? new Uint32Array(ind) : new Uint16Array(ind),
  };
}

/**
 * Shrink a grid by an integer factor for distant LODs. A block is solid when at least
 * `fill` of its cells are (default: half), and takes its most common cell value.
 */
export function downsample(g: GridLike, f: number, fill = 0.5): GridLike {
  const osx = Math.ceil(g.sx / f), osy = Math.ceil(g.sy / f), osz = Math.ceil(g.sz / f);
  const out: GridLike = { data: new Uint32Array(osx * osy * osz), sx: osx, sy: osy, sz: osz };
  const need = Math.max(1, Math.round(f * f * f * fill));
  const n3 = f * f * f;
  const vals = new Uint32Array(n3);
  const counts = new Uint8Array(n3);
  const src = g.data, dst = out.data;
  const gsx = g.sx, gsy = g.sy, gsz = g.sz, gxz = gsx * gsz;
  for (let y = 0; y < out.sy; y++)
    for (let z = 0; z < out.sz; z++)
      for (let x = 0; x < out.sx; x++) {
        let nv = 0, n = 0;
        for (let yy = y * f, ye = Math.min(yy + f, gsy); yy < ye; yy++)
          for (let zz = z * f, ze = Math.min(zz + f, gsz); zz < ze; zz++) {
            const row = yy * gxz + zz * gsx;
            for (let xx = x * f, xe = Math.min(xx + f, gsx); xx < xe; xx++) {
              const v = src[row + xx];
              if (!v) continue;
              n++;
              let k = 0;
              while (k < nv && vals[k] !== v) k++;
              if (k === nv) {
                vals[nv] = v;
                counts[nv++] = 1;
              } else counts[k]++;
            }
          }
        if (n < need) continue;
        let best = 0;
        for (let k = 1; k < nv; k++) if (counts[k] > counts[best]) best = k;
        dst[(y * out.sz + z) * out.sx + x] = vals[best];
      }
  return out;
}

/**
 * Full-detail mesh plus optional half- and quarter-resolution LODs for one building grid.
 * `origin` is the grid cell that becomes (0,0,0).
 */
export function meshLevels(g: GridLike, origin: [number, number, number], lods: boolean): MeshArrays[] {
  const out = [meshArrays(g, { origin, noBottom: true })];
  if (!lods) return out;
  const g2 = downsample(g, 2);
  out.push(meshArrays(g2, { origin: [origin[0] / 2, origin[1] / 2, origin[2] / 2], size: DV * 2, noBottom: true }));
  const g4 = downsample(g2, 2);
  out.push(meshArrays(g4, { origin: [origin[0] / 4, origin[1] / 4, origin[2] / 4], size: DV * 4, noBottom: true, ao: 0.6 }));
  return out;
}

/** Every buffer in a set of mesh arrays, for postMessage transfer lists. */
export const buffersOf = (ms: MeshArrays[]) => ms.flatMap((m) => [m.pos.buffer, m.nor.buffer, m.col.buffer, m.meta.buffer, m.index.buffer]) as ArrayBuffer[];
