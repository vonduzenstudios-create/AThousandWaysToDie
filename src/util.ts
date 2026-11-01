import * as THREE from 'three';

export type Rng = () => number;

/** Small fast seeded RNG so the town and characters are reproducible. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
export const randRange = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Move an angle toward a target angle by at most maxStep radians. */
export function turnToward(a: number, target: number, maxStep: number): number {
  let d = target - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return target;
  return a + Math.sign(d) * maxStep;
}

/** Move a 2D vector (x, z) toward a target by at most maxDelta. */
export function approach2(v: THREE.Vector3, tx: number, tz: number, maxDelta: number) {
  const dx = tx - v.x;
  const dz = tz - v.z;
  const d = Math.hypot(dx, dz);
  if (d <= maxDelta || d === 0) {
    v.x = tx;
    v.z = tz;
  } else {
    v.x += (dx / d) * maxDelta;
    v.z += (dz / d) * maxDelta;
  }
}

/** Build a texture by drawing on a canvas. Everything visual in the game comes from code like this. */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, pixel = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (pixel) {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
  }
  return tex;
}

let _noiseTex: THREE.Texture | null = null;
/** Shared 8x8 grey speckle texture that gives flat colors a voxel-ish grain. */
export function noiseTexture(): THREE.Texture {
  if (_noiseTex) return _noiseTex;
  const rng = mulberry32(99);
  _noiseTex = canvasTexture(8, 8, (ctx) => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const v = Math.floor(215 + rng() * 40);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 1, 1);
      }
  });
  return _noiseTex;
}

export function hexToCss(hex: number) {
  return '#' + hex.toString(16).padStart(6, '0');
}

export function shadeHex(hex: number, f: number) {
  const r = clamp(((hex >> 16) & 255) * f, 0, 255);
  const g = clamp(((hex >> 8) & 255) * f, 0, 255);
  const b = clamp((hex & 255) * f, 0, 255);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
