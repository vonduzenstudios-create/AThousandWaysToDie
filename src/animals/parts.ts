import type * as THREE from 'three';
import type { Rigger } from './rig';
import { shade, type Paint, type Sculpt } from './sculpt';

export const BLACK = 0x15120f;
export const WHITE = 0xf6f3ea;
export const CLAW = 0xe8e0c8;
export const TOOTH = 0xfbf8ee;
export const GUM = 0xb84a5a;

export interface LegOpts {
  /** Hip to knee, and knee to the ground (foot included), in voxels. */
  upper: number;
  lower: number;
  /** Radii at hip, knee and ankle. */
  r: [number, number, number];
  coat: Paint;
  foot: 'hoof' | 'paw' | 'pad' | 'claw' | 'toes' | 'none';
  footColor?: Paint;
  footH?: number;
  /** Lower leg color up to `h` voxels above the ground (white stockings, dark socks). */
  sock?: { color: Paint; h: number };
  /** How far forward the knee sits from the hip (negative for hind legs that angle back). */
  kneeZ?: number;
  /** Knee pushed sideways (sprawling reptile legs), toward the side the leg is on. */
  kneeX?: number;
  claws?: number;
  /** A thick muscle blob at the top of the leg (shoulders, haunches). */
  thigh?: [number, number, number];
}

/**
 * A two-part leg: a hip pivot (swung by the walk cycle) holding the upper leg, and a knee pivot
 * holding the lower leg and foot. The foot's bottom voxel lands on y = 0 when the hip is at
 * y = upper + lower in the root's frame.
 */
export function leg(r: Rigger, parent: THREE.Object3D | null, x: number, y: number, z: number, o: LegOpts) {
  const hip = r.part(parent, x, y, z);
  const kz = o.kneeZ ?? 0;
  const kx = (o.kneeX ?? 0) * Math.sign(x || 1);
  const [r0, r1, r2] = o.r;
  hip.g.limb([0, 0, 0], [kx, -o.upper, kz], r0, r1, o.coat);
  if (o.thigh) hip.g.blob(0, -o.thigh[1] * 0.4, 0, o.thigh[0], o.thigh[1], o.thigh[2], o.coat, 2.6);
  const knee = r.part(hip.p, kx, -o.upper, kz);
  const fh = o.footH ?? (o.foot === 'none' ? 0 : 2);
  const bot = -o.lower;
  knee.g.limb([0, 0, 0], [0, bot + fh, -kz], r1, r2, o.coat);
  const fz = -kz;
  const w = Math.max(1, Math.round(r2));
  const fc = o.footColor ?? BLACK;
  switch (o.foot) {
    case 'hoof':
      knee.g.box(-w, bot, fz - w, w, bot + fh - 1, fz + w, fc);
      if (typeof fc === 'number') knee.g.box(-w + 1, bot + fh, fz - w + 1, w - 1, bot + fh, fz + w - 1, shade(fc, 1.3));
      break;
    case 'paw':
    case 'claw':
      knee.g.blob(0, bot + fh / 2, fz + 1, w + 1, fh / 2 + 0.3, w + 1.6, o.footColor ?? o.coat, 3);
      for (let cx = -w; cx <= w; cx += 2) knee.g.set(cx, bot, fz + w + 2, o.claws ?? (o.foot === 'claw' ? CLAW : BLACK));
      break;
    case 'pad':
      knee.g.blob(0, bot + fh / 2, fz, w + 1, fh / 2 + 0.3, w + 1, fc, 2.2);
      break;
    case 'toes':
      // Bird feet: three forward toes and a back one.
      for (const dx of [-1, 0, 1]) knee.g.limb([0, bot, fz], [dx * 2, bot, fz + 3], 0.4, 0.4, fc);
      knee.g.limb([0, bot, fz], [0, bot, fz - 2], 0.4, 0.4, fc);
      break;
  }
  if (o.sock) {
    const top = bot + o.sock.h;
    knee.g.recolor((_x, yy) => yy <= top, o.sock.color);
    if (o.foot === 'hoof') knee.g.recolor((_x, yy) => yy < bot + fh, fc);
  }
  return { hip: hip.p, knee: knee.p, upper: hip.g, lower: knee.g };
}

/** Four legs in the order the walk cycle expects. Returns hips and knees. */
export function fourLegs(
  r: Rigger,
  front: { x: number; y: number; z: number; o: LegOpts },
  back: { x: number; y: number; z: number; o: LegOpts },
) {
  const legs: THREE.Object3D[] = [], knees: THREE.Object3D[] = [];
  for (const [d, s] of [[front, 1], [front, -1], [back, 1], [back, -1]] as const) {
    const l = leg(r, null, s * d.x, d.y, d.z, d.o);
    legs.push(l.hip);
    knees.push(l.knee);
  }
  return { legs, knees };
}

export interface EyeOpts {
  iris?: number;
  pupil?: number;
  /** Sclera column on the outer side (expressive cartoon eyes). */
  white?: number;
  /** Width/height in voxels. */
  w?: number;
  h?: number;
  brow?: number;
  /** Brow slants down toward the nose (grumpy/fierce). */
  angry?: boolean;
  glint?: boolean;
  /** Dark rim below the eye (wolves, lions, cheetah tear marks). */
  rim?: number;
}

/**
 * Paint an eye on the front of a head. (x, y) is the inner-bottom corner of the eye; side s puts it
 * on +x or -x. The pupil sits toward the nose, with a white glint on the outer top corner.
 */
export function eyeFront(g: Sculpt, s: 1 | -1, x: number, y: number, o: EyeOpts = {}) {
  const w = o.w ?? 2, h = o.h ?? 2;
  const iris = o.iris ?? 0x2a1a10, pupil = o.pupil ?? BLACK;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const inner = dx === 0, low = dy === 0;
      let c = iris;
      if (inner && (low || h <= 2)) c = pupil;
      if (o.glint !== false && dx === w - 1 && dy === h - 1 && w >= 2) c = WHITE;
      g.front(s * (x + dx), y + dy, c);
    }
  if (o.white !== undefined) for (let dy = 0; dy < h; dy++) g.front(s * (x + w), y + dy, o.white);
  if (o.brow !== undefined)
    for (let dx = -1; dx <= w; dx++) {
      const by = y + h + (o.angry && dx <= 0 ? -1 : 0);
      g.front(s * (x + dx), by, o.brow, 1);
    }
  if (o.rim !== undefined) for (let dx = 0; dx < w; dx++) g.front(s * (x + dx), y - 1, o.rim);
}

/** Paint an eye on the side of a head (prey animals, birds, fish). (y, z) is its lower-front corner. */
export function eyeSide(g: Sculpt, s: 1 | -1, y: number, z: number, o: EyeOpts = {}) {
  const w = o.w ?? 2, h = o.h ?? 2;
  const iris = o.iris ?? 0x2a1a10, pupil = o.pupil ?? BLACK;
  for (let dy = 0; dy < h; dy++)
    for (let dz = 0; dz < w; dz++) {
      let c = iris;
      if (dz === 0 && dy === 0) c = pupil;
      if (w === 1 && h === 1) c = pupil;
      if (o.glint !== false && dz === w - 1 && dy === h - 1 && (w > 1 || h > 1)) c = WHITE;
      g.side(s, y + dy, z - dz, c);
    }
  if (o.white !== undefined) for (let dy = 0; dy < h; dy++) g.side(s, y + dy, z - w, o.white);
  if (o.brow !== undefined) for (let dz = -1; dz <= w; dz++) g.side(s, y + h, z - dz + (o.angry ? 0 : 0), o.brow);
  if (o.rim !== undefined) for (let dz = 0; dz < w; dz++) g.side(s, y - 1, z - dz, o.rim);
}

/**
 * An ear on its own pivot so it can flick. Drawn as a plate `t` voxels thick, `w` wide at the base,
 * `h` tall, narrowing to `tip` at the top. Inner face (+z) gets `inner`.
 */
export function ear(
  r: Rigger,
  head: THREE.Object3D,
  s: 1 | -1,
  x: number,
  y: number,
  z: number,
  o: { w: number; h: number; tip?: number; t?: number; coat: Paint; inner?: number; tipColor?: number; tilt?: number; droop?: number; round?: boolean },
) {
  const e = r.part(head, s * x, y, z);
  const t = o.t ?? 2, tip = o.tip ?? 0;
  for (let yy = 0; yy < o.h; yy++) {
    const k = yy / Math.max(1, o.h - 1);
    let hw = (o.w / 2) * (1 - k) + (tip / 2) * k;
    if (o.round) hw = (o.w / 2) * Math.sqrt(Math.max(0, 1 - ((yy - o.h * 0.35) / (o.h * 0.75)) ** 2));
    const cx = s * (o.tilt ?? 0) * yy;
    for (let xx = Math.round(cx - hw); xx <= Math.round(cx + hw); xx++)
      for (let zz = 0; zz < t; zz++) {
        const edge = xx === Math.round(cx - hw) || xx === Math.round(cx + hw);
        let c: Paint = o.coat;
        if (o.inner !== undefined && zz === t - 1 && !edge && yy < o.h - 1) c = o.inner;
        if (o.tipColor !== undefined && yy >= o.h - Math.max(2, Math.round(o.h * 0.25))) c = o.tipColor;
        e.g.set(xx, yy, zz, typeof c === 'number' ? c : c(xx, yy, zz));
      }
  }
  if (o.droop) e.p.rotation.z = s * o.droop;
  return e.p;
}

/** Row of teeth along a jaw edge: (x0..x1) at height y, front surface. Every other voxel is a tooth. */
export function teeth(g: Sculpt, x0: number, x1: number, y: number, z: number, fangs = true) {
  for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1;
    if (edge && fangs) {
      g.set(x, y, z, TOOTH);
      g.set(x, y + 1, z, TOOTH);
    } else if ((x - x0) % 2 === 0) g.set(x, y, z, TOOTH);
  }
}
