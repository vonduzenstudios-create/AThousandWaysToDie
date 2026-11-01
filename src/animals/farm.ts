import * as THREE from 'three';
import { BLACK, WHITE, ear, eyeFront, eyeSide, fourLegs } from './parts';
import { Rigger, cached, cachedGroup, type Rig } from './rig';
import { fur, shade, split } from './sculpt';
import { legT } from './wild';

/*
 * Farm and town animals. Hometown's bull, mule and geese were built facing +x, so they come
 * wrapped in a group (`facingX`) that turns the +z rig to face +x; the rig is kept for walk cycles.
 */

/** Wrap a +z rig so its group faces +x, the way the town's farm code drives them. */
function facingX(rig: Rig): THREE.Group & { rig: Rig } {
  const g = new THREE.Group() as THREE.Group & { rig: Rig };
  rig.root.rotation.y = Math.PI / 2;
  g.add(rig.root);
  g.rig = rig;
  return g;
}

// ============================================================================ Bull
export function bullRig(): Rig {
  return cached('bull', () => {
    const r = new Rigger(0.06);
    const base = 0x3a2418, muzzle = 0xc89a80, horn = 0xf2eee0;
    const coat = fur(base, { light: 1.3, dark: 0.8, amount: 0.45, seed: 301 });
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 22, 0, 11, 11.5, 21, coat);
    body.blob(0, 27, 9, 10, 8, 9, coat);
    body.blob(0, 18, 12, 7, 6, 6, coat); // dewlap
    const L = { coat, foot: 'hoof' as const, footColor: 0x1a120c, footH: 2 };
    const { legs, knees } = fourLegs(
      r,
      { x: 6.5, y: 15, z: 15, o: { ...L, upper: 6, lower: 9, r: [4, 3, 2.8], thigh: [4.5, 6, 6] } },
      { x: 6.5, y: 15, z: -16, o: { ...L, upper: 6, lower: 9, r: [4.5, 3, 2.8], kneeZ: -2, thigh: [5, 7, 7] } },
    );
    const head = r.part(null, 0, 27, 24);
    const h = head.g;
    h.blob(0, 0, 3, 7, 7, 6, coat);
    h.blob(0, -4, 9, 5, 3.5, 3.5, muzzle, 2.6);
    h.blob(0, 6, 2, 4, 2, 3, fur(shade(base, 0.7), { seed: 302, amount: 0.6 })); // forelock curls
    h.sym((s) => {
      h.front(s * 2, -3, 0x5a3a30);
      eyeFront(h, s, 3, 1, { iris: 0x2a1410, white: WHITE, brow: BLACK, angry: true });
      h.chain([[s * 6, 3, 2], [s * 11, 4, 2], [s * 13, 8, 4]], [1.7, 1.3, 0.8], (_x, y) => (y >= 7 ? 0x4a4038 : horn));
    });
    // Brass nose ring.
    for (const [x, y] of [[-1, -6], [0, -7], [1, -6], [-2, -5], [2, -5]]) h.front(x, y, 0xe8b830, 1);
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 7, 1, 0, { w: 3, h: 5, tip: 1, coat, inner: 0x8a5a4a, droop: 1.45 }));
    const tail = r.part(null, 0, 30, -21);
    tail.g.limb([0, 0, 0], [0, -16, -1], 0.7, 0.7, coat);
    tail.g.blob(0, -18, -1, 1.4, 2.4, 1.4, BLACK);
    r.done();
    return { root: r.root, legs, knees, head: head.p, tail: tail.p, ears, top: 2.3, len: 1.3 };
  });
}
export const bull = () => facingX(bullRig());

// ============================================================================ Mule
export function muleRig(): Rig {
  return cached('mule', () => {
    const r = new Rigger(0.05);
    const base = 0x8a7060, light = 0xd8c8b0, dark = 0x4a3a30;
    const coat = fur(base, { light: 1.12, dark: 0.88, amount: 0.4, seed: 311 });
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 28, 0, 10, 10, 22, split(coat, light, 21));
    const L = { coat, foot: 'hoof' as const, footColor: 0x2a2018, footH: 2, sock: { color: light, h: 3 } };
    const { legs, knees } = fourLegs(
      r,
      { x: 5, y: 20, z: 16, o: { ...L, upper: 9, lower: 11, r: [3, 2, 1.8], thigh: [3.5, 6, 5] } },
      { x: 5, y: 20, z: -16, o: { ...L, upper: 9, lower: 11, r: [3.4, 2, 1.8], kneeZ: -2, thigh: [4, 7, 6] } },
    );
    const head = r.part(null, 0, 36, 20);
    const h = head.g;
    h.limb([0, -6, -5], [0, 6, 6], 5, 4, coat);
    h.limb([0, 7, 5], [0, 3, 18], 4, 3.2, (x, y, z) => (z >= 14 ? light : coat(x, y, z)));
    h.chain([[0, 11, 4], [0, 4, -3], [0, -4, -9]], [1.2, 1.2, 1.2], dark); // bristly mane
    h.front(-1, 3, BLACK);
    h.front(1, 3, BLACK);
    for (let x = -2; x <= 2; x++) h.front(x, 1, 0x6a5a50);
    // Smug, half-lidded eyes.
    h.sym((s) => eyeSide(h, s, 6, 11, { iris: 0x2a1a10, w: 2, h: 2, brow: dark }));
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 2.5, 9, 4, { w: 4, h: 14, tip: 2, coat, inner: shade(base, 0.6), tipColor: dark, tilt: 0.15 }));
    const tail = r.part(null, 0, 33, -22);
    tail.g.limb([0, 0, 0], [0, -14, -2], 0.8, 0.8, coat);
    tail.g.blob(0, -16, -2, 1.4, 2.4, 1.4, dark);
    r.done();
    return { root: r.root, legs, knees, head: head.p, tail: tail.p, ears, top: 2.0, len: 1.1 };
  });
}
export function mule() {
  const g = facingX(muleRig());
  // The kick death looks for this marker behind the mule.
  const hind = new THREE.Group();
  hind.name = 'hind';
  hind.position.set(-0.8, 0.9, 0);
  g.add(hind);
  return g;
}

// ============================================================================ Goose
export function gooseRig(): Rig {
  return cached('goose', () => {
    const r = new Rigger(0.025);
    const white = 0xf4f2ea, grey = 0xc8c6be, orange = 0xf08a24;
    const coat = fur(white, { seed: 321, amount: 0.2, dark: 0.93 });
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 18, 0, 8, 8, 14, coat);
    body.tri('yz', [16, -12], [24, -18], [20, -10], -3, 3, coat); // perky tail
    body.sym((s) => body.blob(s * 7, 19, -2, 2, 5, 10, (x, y, z) => ((y + z) % 3 === 0 ? shade(grey, 0.85) : grey)));
    const legs: THREE.Object3D[] = [], knees: THREE.Object3D[] = [];
    for (const s of [1, -1]) {
      const l = legT(r, s * 3, 11, 2, orange);
      legs.push(l.hip);
      knees.push(l.knee);
    }
    const head = r.part(null, 0, 24, 10);
    const h = head.g;
    h.chain([[0, 0, 0], [0, 10, 2], [0, 18, 3]], [3.2, 2.4, 2.4], coat);
    h.blob(0, 21, 5, 3, 3, 4, coat);
    h.limb([0, 20, 8], [0, 19, 13], 1.4, 1, orange);
    h.set(0, 19, 14, 0x2a2a2a);
    // Pure malice.
    h.sym((s) => eyeSide(h, s, 21, 7, { iris: BLACK, w: 1, h: 1, brow: 0x2a2a2a, angry: true }));
    r.done();
    return { root: r.root, legs, knees, head: head.p, top: 1.2, len: 0.35 };
  });
}
export const goose = () => facingX(gooseRig());

// ============================================================================ Pigeon
export function pigeon() {
  return cachedGroup('pigeon', () => {
    const r = new Rigger(0.02);
    const grey = 0x8a8f96, head = 0x5a6a7a, neck = 0x4a8a6a, bar = 0x2a2a30;
    const b = r.part(null, 0, 0, 0).g;
    b.blob(0, 9, 0, 5.5, 6, 10, fur(grey, { seed: 331, amount: 0.3 }));
    b.sym((s) => {
      b.blob(s * 5, 10, -2, 1.5, 4, 8, (_x, _y, z) => (z === -2 || z === -5 ? bar : shade(grey, 0.9)));
      b.limb([s * 2, 3, 1], [s * 2, 0, 2], 0.6, 0.6, 0xd87a8a);
      eyeSide(b, s, 18, 13, { iris: 0xe86a20, w: 1, h: 1 });
    });
    b.tri('xz', [-3, -8], [3, -8], [0, -16], 8, 9, bar);
    b.limb([0, 11, 6], [0, 16, 9], 3.6, 3, (_x, y) => (y < 14 ? neck : head));
    b.blob(0, 18, 10, 3.6, 3.6, 3.8, head);
    b.limb([0, 17, 13], [0, 16.5, 17], 0.8, 0.6, 0x3a3a3a);
    b.set(0, 18, 14, WHITE);
    return r.done();
  });
}
