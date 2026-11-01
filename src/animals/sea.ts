import * as THREE from 'three';
import { BLACK, GUM, TOOTH, WHITE, eyeFront, eyeSide } from './parts';
import { Rigger, animalMaterial, cachedGroup } from './rig';
import { fur, shade, split, type Paint } from './sculpt';
import { charMaterial } from '../chars/grid';

/*
 * Beach and sea creatures. They are plain groups (no legs to walk), with the same named children
 * the beach code looks up: 'tail', 'jaw', 'wl'/'wr' wings, 'spikes'. Sizes match the old models.
 */

// ============================================================================ Shark
export function shark(scale = 1) {
  const g = cachedGroup('shark', () => {
    const r = new Rigger(0.05);
    const grey = 0x6f8494, belly = 0xe8eef0;
    const skin = split(fur(grey, { seed: 201, light: 1.1, dark: 0.9, amount: 0.3 }), belly, -3);
    const b = r.part(null, 0, 0, 0).g;
    b.blob(0, 0, 2, 10, 9, 32, skin);
    b.blob(0, -1, 34, 7.5, 6.5, 13, skin);
    b.tri('yz', [8, -6], [28, 2], [8, 12], -1, 1, grey); // dorsal fin
    b.tri('yz', [-6, -30], [-12, -34], [-5, -24], 0, 0, grey);
    b.sym((s) => {
      for (let i = 0; i < 3; i++) for (let y = -3; y <= 3; y++) b.side(s, y, 24 - i * 3, shade(grey, 0.7));
      eyeSide(b, s, 1, 38, { iris: BLACK, w: 2, h: 2, brow: shade(grey, 0.7), angry: true });
      const fin = r.part(null, s * 9, -5, 14);
      fin.g.tri('xz', [0, 4], [s * 14, -6], [0, -6], -1, 0, grey);
      fin.p.rotation.z = s * 0.4;
    });
    // A permanent toothy grin under the snout.
    for (let z = 36; z <= 44; z++) b.sym((s) => b.set(s * Math.round(6 - (z - 36) * 0.4), -7, z, BLACK));
    const jaw = r.part(null, 0, -6, 44);
    jaw.p.name = 'jaw';
    jaw.g.blob(0, -1, 0, 5.5, 1.6, 6, belly, 2.6);
    jaw.g.recolor((_x, y) => y >= 0, GUM);
    for (let x = -4; x <= 4; x += 2) jaw.g.set(x, 1, 4 - Math.abs(x) * 0.5, TOOTH);
    const tail = r.part(null, 0, 0, -38);
    tail.p.name = 'tail';
    tail.g.limb([0, 0, 2], [0, 0, -4], 3.5, 2, grey);
    tail.g.tri('yz', [-1, 0], [22, -14], [0, -9], -1, 1, grey);
    tail.g.tri('yz', [1, 0], [-13, -9], [0, -7], -1, 1, grey);
    return r.done();
  });
  g.scale.setScalar(scale);
  return g;
}

// ============================================================================ Whale
export function whale() {
  return cachedGroup('whale', () => {
    const r = new Rigger(0.25);
    const blue = 0x3a4f78, belly = 0xd9d4c8;
    const skin = fur(blue, { seed: 211, light: 1.12, dark: 0.88, amount: 0.35, scale: 3 });
    const b = r.part(null, 0, 0, 0).g;
    b.blob(0, 0, 0, 14, 10, 36, skin, 2.4);
    b.blob(0, 1, 26, 13, 9, 10, skin, 2.8);
    // Pale throat grooves.
    b.recolor((_x, y, z) => y < -6 && z > -20, (x, _y, z) => (((x + 40) % 3 === 0) ? 0xb0a898 : belly));
    for (let i = 0; i < 6; i++) b.top((i % 2) * 4 - 2, -10 + i * 6, shade(blue, 1.25), 1); // barnacles
    b.top(0, 12, 0x222a44);
    b.top(1, 12, 0x222a44);
    b.sym((s) => {
      eyeSide(b, s, 1, 24, { iris: BLACK, w: 2, h: 2, white: WHITE, brow: shade(blue, 0.7) });
      const fl = r.part(null, s * 12, -7, 8);
      fl.g.tri('xz', [0, 4], [s * 16, -4], [0, -6], -1, 0, skin);
      fl.p.rotation.z = s * 0.4;
    });
    const jaw = r.part(null, 0, -6.4, 28);
    jaw.p.name = 'jaw';
    jaw.g.blob(0, -1, 2, 13, 2.5, 9, belly, 2.8);
    jaw.g.recolor((_x, y) => y >= 0, 0xd06070);
    const tail = r.part(null, 0, 0, -36);
    tail.p.name = 'tail';
    tail.g.limb([0, 1.6, 2], [0, 2, -10], 6, 4, skin);
    tail.g.tri('xz', [0, -6], [18, -22], [3, -10], 1, 3, skin);
    tail.g.tri('xz', [0, -6], [-18, -22], [-3, -10], 1, 3, skin);
    tail.g.blob(0, 2, -12, 5, 1, 6, skin);
    return r.done();
  });
}

// ============================================================================ Seagull
export function gull() {
  return cachedGroup('gull', () => {
    const r = new Rigger(0.025);
    const white = 0xf4f4f4, grey = 0xbfc6cc, beak = 0xf2b630;
    const b = r.part(null, 0, 0, 0).g;
    b.blob(0, 0, 0, 7, 6, 14, fur(white, { seed: 221, amount: 0.15 }));
    b.tri('xz', [-4, -12], [4, -12], [0, -20], -1, 1, grey);
    b.blob(0, 6, 17, 5, 5, 6, white);
    b.limb([0, 5, 22], [0, 4, 30], 1.4, 0.8, beak);
    b.set(0, 3, 28, 0xd8402a);
    b.sym((s) => {
      // Gulls are jerks: tiny glaring eyes under a heavy brow.
      eyeSide(b, s, 7, 20, { iris: 0xe8d040, w: 2, h: 1, brow: 0x8a9098, angry: true });
      b.limb([s * 3, -6, 2], [s * 3, -9, 3], 0.6, 0.6, 0xe8902a);
      const wing = new THREE.Group();
      wing.position.set(s * 0.18, 0.1, 0);
      wing.name = s < 0 ? 'wl' : 'wr';
      r.root.add(wing);
      const w = r.part(wing, 0, 0, 0).g;
      for (let x = 0; x <= 46; x++) {
        const d = x < 30 ? 8 : 8 - (x - 30) * 0.35;
        for (let z = -Math.round(d); z <= Math.round(d * 0.8); z++) w.set(s * x, 0, z, x > 36 ? (x % 4 === 0 && z < -2 ? WHITE : 0x222222) : z < -5 ? shade(grey, 0.88) : grey);
      }
    });
    return r.done();
  });
}

// ============================================================================ Jellyfish
let jellyMat: THREE.MeshLambertMaterial | null = null;
export function jellyfish() {
  return cachedGroup('jellyfish', () => {
    if (!jellyMat) {
      jellyMat = charMaterial(0.04);
      Object.assign(jellyMat, { transparent: true, opacity: 0.72, emissive: new THREE.Color(0x551144) });
    }
    const r = new Rigger(0.04, jellyMat);
    const pink = 0xff8ad8, deep = 0xd858b0;
    const b = r.part(null, 0, 0, 0).g;
    b.blob(0, 0, 0, 10, 7, 10, (_x, y) => (y < -1 ? null : y < 1 ? deep : pink), 2.2);
    b.blob(0, 1, 0, 4, 3, 4, 0xffc0ec);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * 6), z = Math.round(Math.sin(a) * 6);
      b.chain([[x, -1, z], [x + 1, -8, z], [x - 1, -15, z + 1], [x, -22, z]], [0.6, 0.5, 0.5, 0.4], i % 2 ? pink : deep);
    }
    b.sym((s) => eyeFront(b, s, 2, 2, { iris: BLACK, w: 1, h: 2 }));
    return r.done();
  });
}

// ============================================================================ Pufferfish
export function pufferfish() {
  return cachedGroup('pufferfish', () => {
    const r = new Rigger(0.025);
    const yellow = 0xe8c45a, brown = 0x8a6a2a, belly = 0xf6eedc;
    const skin: Paint = (x, y, z) => (y < -4 ? belly : (x * 7 + y * 3 + z * 5) % 13 === 0 ? brown : yellow);
    const body = r.part(null, 0, 0, 0);
    body.p.name = 'body';
    body.g.blob(0, 0, 0, 14, 12, 16, skin);
    body.g.sym((s) => {
      eyeFront(body.g, s, 4, 2, { iris: BLACK, w: 3, h: 3, white: WHITE });
      body.g.tri('yz', [-2, 4], [4, 0], [-4, -2], s * 14, s * 14, yellow);
    });
    for (const [x, y] of [[-1, -4], [0, -4], [1, -4], [-1, -5], [1, -5], [-1, -6], [0, -6], [1, -6]]) body.g.front(x, y, 0xc84a3a, 1);
    body.g.tri('yz', [0, -16], [7, -24], [-7, -24], -1, 1, yellow);
    const spikes = r.part(null, 0, 0, 0);
    spikes.p.name = 'spikes';
    for (let i = 0; i < 60; i++) {
      const a = i * 2.39996, y = 1 - (2 * (i + 0.5)) / 60, rr = Math.sqrt(1 - y * y);
      const d = new THREE.Vector3(Math.cos(a) * rr * 14, y * 12, Math.sin(a) * rr * 16);
      const tip = d.clone().multiplyScalar(1.35);
      spikes.g.limb([d.x, d.y, d.z], [tip.x, tip.y, tip.z], 0.7, 0.3, WHITE);
    }
    spikes.p.visible = false;
    return r.done();
  });
}

// ============================================================================ Crab
export function crab() {
  return cachedGroup('crab', () => {
    const r = new Rigger(0.025);
    const red = 0xe0402a, dark = 0xb02a1a;
    const shell = fur(red, { seed: 241, light: 1.12, dark: 0.85 });
    const b = r.part(null, 0, 0, 0).g;
    b.blob(0, 6, 0, 10, 4, 7, shell, 2.6);
    b.blob(0, 8, 0, 8, 2, 5, shade(red, 1.1));
    b.sym((s) => {
      // Stalk eyes.
      b.limb([s * 3, 9, 5], [s * 3, 13, 6], 0.6, 0.6, dark);
      b.blob(s * 3, 14, 6, 1.4, 1.4, 1.4, WHITE);
      b.set(s * 3, 14, 8, BLACK);
      b.set(s * 3, 15, 7, BLACK);
      // Big claws.
      b.chain([[s * 9, 5, 4], [s * 13, 6, 8], [s * 13, 7, 11]], [1.2, 1.4, 1.6], red);
      b.blob(s * 13, 7, 13, 2.4, 2, 2.8, red);
      b.limb([s * 14, 7, 15], [s * 14, 8, 18], 1, 0.5, shade(red, 1.15));
      b.limb([s * 12, 6, 15], [s * 12, 5, 17], 0.8, 0.4, dark);
      for (let i = 0; i < 3; i++) b.chain([[s * 9, 5, 2 - i * 3], [s * 14, 6, 2 - i * 3], [s * 16, 0, 1 - i * 3]], [0.6, 0.6, 0.5], dark);
    });
    for (let x = -2; x <= 2; x++) b.set(x, 4, 7, x === 0 ? BLACK : dark);
    return r.done();
  });
}

// ============================================================================ Fish
export function fish(color: number) {
  return cachedGroup(`fish:${color}`, () => {
    const r = new Rigger(0.025);
    const b = r.part(null, 0, 0, 0).g;
    b.blob(0, 0, 0, 3.5, 6, 11, split(fur(color, { seed: 251, light: 1.2 }), shade(color, 1.35), -3));
    b.tri('yz', [0, -10], [6, -16], [-6, -16], -1, 1, shade(color, 0.8));
    b.tri('yz', [5, -2], [8, -6], [5, 4], 0, 0, shade(color, 0.8));
    b.sym((s) => eyeSide(b, s, 1, 7, { iris: BLACK, w: 2, h: 2 }));
    b.front(0, -2, shade(color, 0.6));
    return r.done();
  });
}

// ============================================================================ Marlin
export function marlin() {
  return cachedGroup('marlin', () => {
    const r = new Rigger(0.05);
    const blue = 0x1f3a7a, silver = 0xc8d0e0, sail = 0x2a4f9a;
    const skin: Paint = (x, y, z) => (y < -2 ? (((z % 6) + 6) % 6 === 0 && y > -6 ? 0x8ab0e0 : silver) : fur(blue, { seed: 261 })(x, y, z));
    const b = r.part(null, 0, 0, 0).g;
    b.blob(0, 0, 0, 7, 10, 32, skin);
    b.blob(0, 0, 26, 5.5, 7, 8, skin);
    b.limb([0, 2, 33], [0, 2, 66], 1.2, 0.4, blue);
    b.tri('yz', [8, -14], [36, 2], [8, 22], 0, 0, (_x, y, z) => ((y + z) % 5 === 0 ? 0x1a2a5a : sail));
    b.tri('yz', [8, 22], [30, 6], [24, 18], 0, 0, sail);
    b.sym((s) => {
      eyeSide(b, s, 2, 30, { iris: BLACK, w: 2, h: 2, white: WHITE });
      b.tri('xz', [0, 18], [s * 12, 8], [0, 12], -6, -6, sail);
    });
    b.tri('yz', [0, -30], [20, -44], [4, -36], 0, 0, blue);
    b.tri('yz', [0, -30], [-20, -44], [-4, -36], 0, 0, blue);
    return r.done();
  });
}

export { animalMaterial };
