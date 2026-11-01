import * as THREE from 'three';
import { BLACK, CLAW, GUM, TOOTH, WHITE, ear, eyeFront, eyeSide, fourLegs, leg, teeth } from './parts';
import { Rigger, cached, cachedGroup, type Rig } from './rig';
import { fur, shade, split, spots, stripes, type Paint } from './sculpt';

/*
 * Safari and wilderness animals, drawn voxel by voxel in the style of the reference renders:
 * dense voxels, patchy shaded fur, expressive faces and two-part legs with knees. Sizes, pivot
 * positions, `top` and `len` match the old box models so every scripted death still lines up.
 */

// ============================================================================ Bear
export function bear(): Rig {
  return cached('bear', () => {
    const r = new Rigger(0.05);
    const base = 0x7a5838, dark = 0x5a3e26, muzzle = 0xdcc29a;
    const coat = fur(base, { light: 1.2, dark: 0.82, amount: 0.5, scale: 3, seed: 2 });
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 30, -2, 14, 12.5, 20, coat, 2.6);
    body.blob(0, 36, 8, 13, 9, 10, coat, 2.4); // shoulder hump
    body.blob(0, 29, 14, 12, 11.5, 8, coat);
    body.blob(0, 30, -16, 13, 12, 8, coat);
    // Stepped lighter fur bands across the back, like the reference bear.
    for (let z = -18; z <= 16; z += 5) for (let x = -10; x <= 10; x++) body.top(x, z, shade(base, 1.22));
    const L = { r: [6, 5, 4.6] as [number, number, number], coat, foot: 'paw' as const, footColor: dark, footH: 3, claws: CLAW };
    const { legs, knees } = fourLegs(
      r,
      { x: 9, y: 22, z: 13, o: { ...L, upper: 10, lower: 12, thigh: [6.5, 6, 6] } },
      { x: 9, y: 22, z: -14, o: { ...L, upper: 10, lower: 12, kneeZ: -1, thigh: [7, 8, 7] } },
    );
    const head = r.part(null, 0, 37, 25);
    const h = head.g;
    h.blob(0, 1, 2, 9, 8, 7.5, coat);
    h.blob(0, -1, 0, 10.5, 7, 6, coat); // cheek ruff
    h.blob(0, 1, 8, 3.5, 2.5, 3, coat); // brow bridge
    h.blob(0, -3, 10, 4.5, 3.2, 4, muzzle, 2.6);
    for (let x = -2; x <= 2; x++) h.front(x, -1, BLACK);
    for (let x = -1; x <= 1; x++) h.front(x, 0, BLACK, 1);
    h.front(0, -2, BLACK);
    // Snarl: dark mouth line with teeth along the bottom of the muzzle.
    for (let x = -3; x <= 3; x++) h.front(x, -5, x % 2 ? TOOTH : 0x2a1a14);
    h.sym((s) => eyeFront(h, s, 3, 3, { iris: BLACK, white: WHITE, brow: dark, angry: true }));
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 6, 5, -1, { w: 6, h: 5, round: true, coat: dark, inner: 0x3a2a1a }));
    const jaw = r.part(head.p, 0, -6, 6);
    jaw.g.blob(0, -1, 3, 4, 1.6, 3.4, muzzle, 2.6);
    jaw.g.box(-3, 0, 1, 3, 0, 5, GUM);
    teeth(jaw.g, -3, 3, 1, 6);
    const tail = r.part(null, 0, 32, -22);
    tail.g.blob(0, 0, -1, 2.5, 2.5, 2, coat);
    r.done();
    return { root: r.root, legs, knees, head: head.p, jaw: jaw.p, tail: tail.p, ears, top: 2.4, len: 1.2 };
  });
}

// ============================================================================ Lion
export function lion(male: boolean): Rig {
  const rig = cached(male ? 'lion' : 'lioness', () => {
    const r = new Rigger(0.05);
    const base = male ? 0xc8963c : 0xd0a050, light = 0xecd6a6, mane = 0x7a4220;
    const coat = fur(base, { light: 1.1, dark: 0.88, amount: 0.35, seed: 5 });
    const maneP = fur(mane, { light: 1.25, dark: 0.75, amount: 0.6, scale: 2, seed: 9 });
    const body = r.part(null, 0, 0, 0).g;
    const belly = split(coat, light, 20);
    body.blob(0, 24, -1, 10, 8.5, 19, belly);
    body.blob(0, 24.5, 10, 10, 9.5, 8, belly);
    body.blob(0, 25, -13, 9.5, 8.5, 7, belly);
    if (male) body.blob(0, 28, 15, 9.5, 9, 7, maneP);
    const L = { coat, foot: 'paw' as const, footColor: light, footH: 2, claws: shade(light, 0.85) };
    const { legs, knees } = fourLegs(
      r,
      { x: 6, y: 17, z: 12, o: { ...L, upper: 8, lower: 9, r: [3.6, 2.6, 2.4], thigh: [4, 5, 5] } },
      { x: 6, y: 17, z: -14, o: { ...L, upper: 8, lower: 9, r: [4, 2.6, 2.4], kneeZ: -2, thigh: [4.5, 6, 6] } },
    );
    const head = r.part(null, 0, 31, 22);
    const h = head.g;
    if (male) {
      h.blob(0, 0, -1, 11.5, 11.5, 6, maneP, 2.2);
      h.blob(0, -7, 2, 8, 6, 5, maneP);
    }
    h.blob(0, 0, 3, 7, 6.5, 6.5, coat);
    h.blob(0, -3, 8, 3.6, 2.6, 2.6, light, 2.6);
    h.blob(0, 1.5, 7, 2.5, 2.5, 3, coat);
    // Nose, mouth line and whisker dots.
    for (let x = -1; x <= 1; x++) h.front(x, -1, 0x9a5a48, x ? 0 : 1);
    h.front(0, -2, 0x9a5a48);
    h.front(0, -3, 0x5a2a20);
    for (let x = -2; x <= 2; x++) if (x) h.front(x, -4, 0x5a3a28);
    h.sym((s) => {
      eyeFront(h, s, 2, 1, { iris: 0xd8a030, brow: shade(base, 0.7), rim: shade(base, 0.6), angry: male });
      h.front(s * 3, -3, 0x6a4a30);
    });
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 5, 5, 0, { w: 4, h: 4, round: true, coat, inner: shade(base, 0.6) }));
    const jaw = r.part(head.p, 0, -6, 4.5);
    jaw.g.blob(0, -0.5, 2.5, 3, 1.3, 2.8, light, 2.6);
    jaw.g.box(-2, 0, 1, 2, 0, 4, GUM);
    teeth(jaw.g, -2, 2, 1, 5);
    const tail = r.part(null, 0, 27, -20);
    tail.g.chain([[0, 0, 0], [0, -4, -6], [0, -10, -9], [0, -13, -8]], [1.1, 1, 0.9, 0.9], coat);
    tail.g.blob(0, -14, -8, 1.8, 2.2, 1.8, mane);
    r.done();
    return { root: r.root, legs, knees, head: head.p, jaw: jaw.p, tail: tail.p, ears, top: 1.7, len: 1.1 };
  });
  rig.root.scale.setScalar(male ? 1.15 : 1);
  return rig;
}

// ============================================================================ Elephant
export function elephant(baby = false): Rig {
  const rig = cached(baby ? 'elephant-baby' : 'elephant', () => {
    const r = new Rigger(0.08);
    const base = 0x8a8d90;
    const skin = fur(base, { light: 1.08, dark: 0.9, amount: 0.4, scale: 1.6, seed: 12 });
    const wrinkled: Paint = (x, y, z) => ((y + (x & 1)) % 3 === 0 ? shade(base, 0.9) : skin(x, y, z));
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 36, 0, 15, 13.5, 22, skin, 2.6);
    body.blob(0, 40, 10, 13, 10, 10, skin);
    const L = { coat: wrinkled, foot: 'pad' as const, footColor: 0x6e7073, footH: 2 };
    const { legs, knees } = fourLegs(
      r,
      { x: 9, y: 23, z: 14, o: { ...L, upper: 11, lower: 12, r: [6, 5.5, 5.5] } },
      { x: 9, y: 23, z: -14, o: { ...L, upper: 11, lower: 12, r: [6.5, 5.5, 5.5], thigh: [7, 8, 7] } },
    );
    const head = r.part(null, 0, 42, 24);
    const h = head.g;
    h.blob(0, 0, 3, 9, 9.5, 7, skin);
    h.blob(0, 4, 2, 8, 6, 6, skin); // domed forehead
    h.sym((s) => eyeSide(h, s, 1, 7, { iris: 0x3a2a1a, brow: shade(base, 0.7), w: 2, h: 2 }));
    h.box(-2, -8, 6, 2, -7, 8, 0x5a4a4a); // mouth
    if (!baby)
      h.sym((s) => {
        h.limb([s * 4, -6, 7], [s * 5, -11, 14], 1.3, 0.8, 0xf4efe0);
      });
    const ears = [1, -1].map((s) => {
      const e = ear(r, head.p, s as 1 | -1, 8, -9, -1, { w: 14, h: 18, round: true, t: 2, coat: skin, inner: 0xa89090 });
      e.rotation.y = s * 0.5;
      return e;
    });
    const trunk = r.part(head.p, 0, -4, 9);
    let seg = trunk.p;
    const radii = [3.2, 2.8, 2.4, 2.0];
    for (let i = 0; i < 4; i++) {
      const p = i === 0 ? trunk : r.part(seg, 0, -7.5, 0);
      p.g.limb([0, 0, 0], [0, -7.5, 0], radii[i], i === 3 ? 1.8 : radii[i + 1], wrinkled);
      if (i === 3) p.g.box(-1, -8, 0, 1, -8, 1, 0x4a4a4a);
      p.p.rotation.x = 0.12;
      seg = p.p;
    }
    const tail = r.part(null, 0, 42, -22);
    tail.g.limb([0, 0, 0], [0, -12, -1], 0.9, 0.7, skin);
    tail.g.blob(0, -13, -1, 1.2, 1.6, 1.2, 0x3a3a3a);
    r.done();
    return { root: r.root, legs, knees, head: head.p, tail: tail.p, trunk: trunk.p, ears, top: 4.0, len: 2.2 };
  });
  rig.root.scale.setScalar(baby ? 0.42 : 1.05);
  return rig;
}

// ============================================================================ Gazelle
export function gazelle(): Rig {
  return cached('gazelle', () => {
    const r = new Rigger(0.03);
    const base = 0xc98a4a, cream = 0xf2e6cc, band = 0x3a2414;
    const coat = fur(base, { light: 1.1, dark: 0.9, amount: 0.3, seed: 21 });
    const paint: Paint = (x, y, z) => (y < 35 ? cream : y <= 36 ? band : coat(x, y, z));
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 39, 0, 7.5, 7, 17, paint);
    body.blob(0, 40, 10, 7, 7.5, 7, paint);
    body.limb([0, 43, 12], [0, 51, 17], 3.6, 2.6, coat);
    body.blob(0, 40, -16, 6, 5, 2, cream); // white rump
    const legCoat = fur(0xd8a86a, { seed: 22 });
    const L = { coat: legCoat, foot: 'hoof' as const, footColor: 0x2a2018, footH: 2 };
    const { legs, knees } = fourLegs(
      r,
      { x: 4, y: 31, z: 12, o: { ...L, upper: 14, lower: 17, r: [2.6, 1.4, 1.1], thigh: [3, 5, 4] } },
      { x: 4, y: 31, z: -13, o: { ...L, upper: 14, lower: 17, r: [3, 1.4, 1.1], kneeZ: -3, thigh: [3.5, 7, 5] } },
    );
    const head = r.part(null, 0, 51, 18);
    const h = head.g;
    h.blob(0, 1, 1, 3, 3.5, 3.5, coat);
    h.limb([0, 1, 3], [0, -1, 10], 2.3, 1.6, coat);
    h.front(0, -1, BLACK);
    h.front(-1, -1, BLACK);
    h.front(1, -1, BLACK);
    h.sym((s) => {
      eyeSide(h, s, 1, 3, { iris: 0x1a1210, w: 2, h: 2, rim: cream });
      for (let z = 4; z <= 9; z++) h.side(s, Math.round((z - 4) * -0.3), z, band); // face stripe
      h.chain([[s * 1.5, 3, 0], [s * 2.5, 9, -3], [s * 2, 14, -6], [s * 2.5, 17, -5]], [1, 0.8, 0.7, 0.5], (x, y) => (y % 3 === 0 ? 0x4a4038 : 0x2a2420));
    });
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 3, 3, -1, { w: 3, h: 6, tip: 1, coat, inner: cream, droop: 1.0 }));
    const tail = r.part(null, 0, 42, -17);
    tail.g.limb([0, 0, 0], [0, -5, -1], 1, 0.8, coat);
    tail.g.box(0, -7, -1, 0, -6, -1, band);
    r.done();
    return { root: r.root, legs, knees, head: head.p, tail: tail.p, ears, top: 1.5, len: 0.6 };
  });
}

// ============================================================================ Alligator
export function gator(): Rig {
  return cached('gator', () => {
    const r = new Rigger(0.04);
    const base = 0x4a6a3a, scute = 0x34502a, belly = 0xd8d0a0;
    const skin = fur(base, { light: 1.12, dark: 0.82, amount: 0.45, scale: 2, seed: 31 });
    const hide = split(skin, belly, 8);
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 11, 0, 11, 5.5, 22, hide, 3);
    for (let z = -20; z <= 20; z += 3) for (const x of [-7, -4, -1, 2, 5]) body.top(x + ((z / 3) & 1), z, scute, 1);
    const L = { coat: skin, foot: 'claw' as const, footColor: skin, footH: 1, claws: 0xd8d0a0, kneeX: 4 };
    const { legs, knees } = fourLegs(
      r,
      { x: 9, y: 8, z: 13, o: { ...L, upper: 3, lower: 5, r: [2.5, 2, 1.8] } },
      { x: 9, y: 8, z: -14, o: { ...L, upper: 3, lower: 5, r: [3, 2.2, 1.8] } },
    );
    const head = r.part(null, 0, 12.5, 22.5);
    const h = head.g;
    h.blob(0, 1, 5, 7, 3, 6, skin, 3);
    h.blob(0, 0, 17, 5, 2, 10, skin, 3);
    h.blob(0, 0.5, 25, 5, 2, 2.5, skin, 3);
    h.sym((s) => {
      h.blob(s * 4, 4, 5, 2, 1.6, 2, skin, 2);
      h.set(s * 5, 4, 6, 0xd8c030);
      h.set(s * 5, 5, 6, 0xd8c030);
      h.set(s * 4, 4, 7, BLACK);
      h.set(s * 4, 5, 7, BLACK);
      h.set(s * 4, 6, 6, scute);
      h.set(s * 5, 6, 5, scute);
      h.top(s * 2, 26, BLACK);
      // Upper teeth poking out over the lip: the crocodilian grin.
      for (let z = 9; z <= 26; z += 3) h.set(s * 5, -2, z, TOOTH);
    });
    for (let z = 2; z <= 26; z += 2) h.recolor((x, y, zz) => zz === z && y === -2 && Math.abs(x) < 5, GUM);
    const jaw = r.part(head.p, 0, -2.5, 1);
    jaw.g.blob(0, -1, 13, 5, 1.5, 12, belly, 3);
    jaw.g.recolor((_x, y) => y >= 0, GUM);
    jaw.g.sym((s) => {
      for (let z = 4; z <= 23; z += 3) jaw.g.set(s * 4, 1, z, TOOTH);
    });
    const tail = r.part(null, 0, 11, -22);
    tail.g.limb([0, 0, 0], [0, -1, -38], 5, 1, hide);
    for (let z = -2; z >= -34; z -= 3) tail.g.top(0, z, scute, 1);
    r.done();
    return { root: r.root, legs, knees, head: head.p, jaw: jaw.p, tail: tail.p, top: 0.8, len: 1.4 };
  });
}


// ============================================================================ Giraffe
export function giraffe(): Rig {
  return cached('giraffe', () => {
    const r = new Rigger(0.06);
    const cream = 0xf2dcb0, patch = 0xb86a2a, dark = 0x6a3a1a;
    const coat = spots(fur(cream, { seed: 41, amount: 0.2 }), patch, 4, 0.8, 41);
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 47, 0, 8, 8.5, 16, coat);
    body.blob(0, 49, 9, 8, 8.5, 8, coat);
    body.blob(0, 45.5, -10, 7.5, 7.5, 7, coat);
    const L = { coat, foot: 'hoof' as const, footColor: 0x3a2a1a, footH: 2, sock: { color: fur(cream, { seed: 42 }), h: 12 } };
    const { legs, knees } = fourLegs(
      r,
      { x: 5, y: 40, z: 11, o: { ...L, upper: 18, lower: 22, r: [3, 1.8, 1.6], thigh: [3.5, 6, 5] } },
      { x: 5, y: 40, z: -12, o: { ...L, upper: 18, lower: 22, r: [3.4, 1.8, 1.6], kneeZ: -3, thigh: [4, 8, 6] } },
    );
    const neck = r.part(null, 0, 50, 12.5);
    neck.p.rotation.x = 0.35;
    neck.g.limb([0, -4, 0], [0, 50, 0], 4.2, 2.6, coat);
    neck.g.limb([0, 0, -4.5], [0, 48, -2.5], 0.7, 0.6, dark); // mane
    const head = r.part(neck.p, 0, 50, 0);
    head.p.rotation.x = -0.35;
    const h = head.g;
    h.blob(0, 0, 3, 3.8, 3.5, 5, coat);
    h.blob(0, -1, 9, 3, 2.6, 3, 0xe8c898, 2.6);
    h.front(-1, 0, 0x4a2a1a);
    h.front(1, 0, 0x4a2a1a);
    h.sym((s) => {
      eyeSide(h, s, 1, 5, { iris: 0x1a1210, brow: BLACK });
      h.limb([s * 1.5, 3, 1], [s * 2, 8, 0], 0.8, 0.8, coat);
      h.blob(s * 2, 9, 0, 1.3, 1.3, 1.3, dark);
    });
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 4, 2, -1, { w: 2, h: 4, tip: 1, coat: cream, inner: 0xd8a080, droop: 1.3 }));
    const tail = r.part(null, 0, 49, -16);
    tail.g.limb([0, 0, 0], [0, -14, -1], 0.6, 0.6, cream);
    tail.g.blob(0, -16, -1, 1.2, 2.2, 1.2, BLACK);
    r.done();
    return { root: r.root, legs, knees, head: neck.p, tail: tail.p, ears, top: 6.4, len: 1.0 };
  });
}

// ============================================================================ Zebra
export function zebra(): Rig {
  return cached('zebra', () => {
    const r = new Rigger(0.04);
    const white = 0xf2f2ee, black = 0x1a1a1a;
    const coat = stripes(white, black, 5, 2, 0.35);
    const legCoat: Paint = (_x, y) => (((y % 4) + 4) % 4 < 2 ? black : white);
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 35, 0, 10, 10.5, 21, coat);
    body.blob(0, 36, 12, 9.5, 10, 8, coat);
    const L = { coat: legCoat, foot: 'hoof' as const, footColor: 0x2a2a2a, footH: 2 };
    const { legs, knees } = fourLegs(
      r,
      { x: 5.5, y: 25, z: 14, o: { ...L, upper: 11, lower: 14, r: [3, 2, 1.6], thigh: [4, 6, 5] } },
      { x: 5.5, y: 25, z: -15, o: { ...L, upper: 11, lower: 14, r: [3.4, 2, 1.6], kneeZ: -2, thigh: [4.5, 7, 6] } },
    );
    const head = r.part(null, 0, 42, 21);
    const h = head.g;
    const neckCoat: Paint = (_x, y, z) => (((y + Math.round(z * 0.6)) % 5 + 5) % 5 < 2 ? black : white);
    h.limb([0, -3, -3], [0, 8, 5], 4.2, 3, neckCoat);
    h.limb([0, 9, 4], [0, 3, 15], 2.8, 2, (_x, y, z) => (z >= 14 ? 0x3a3a3a : (((y + z) % 4) + 4) % 4 < 2 ? black : white));
    h.chain([[0, 12, 2], [0, 7, -2], [0, 1, -5]], [1.3, 1.3, 1.1], (_x, y) => (y % 3 === 0 ? white : black));
    h.sym((s) => eyeSide(h, s, 8, 8, { iris: 0x1a1210, w: 2, h: 2, rim: black }));
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 2.5, 11, 3, { w: 3, h: 5, tip: 1, coat: white, inner: 0xc8c8c8, tipColor: black, droop: 0.4 }));
    const tail = r.part(null, 0, 40, -21);
    tail.g.limb([0, 0, 0], [0, -11, -1], 0.7, 0.7, white);
    tail.g.blob(0, -13, -1, 1.2, 2.4, 1.2, black);
    r.done();
    return { root: r.root, legs, knees, head: head.p, tail: tail.p, ears, top: 2.0, len: 0.9 };
  });
}

// ============================================================================ Rhino
export function rhino(): Rig {
  return cached('rhino', () => {
    const r = new Rigger(0.06);
    const base = 0x7d7470, horn = 0xd8d0c0;
    const skin0 = fur(base, { light: 1.1, dark: 0.86, amount: 0.4, scale: 2, seed: 51 });
    // Armor folds: darker creases behind the shoulder and in front of the hips.
    const skin: Paint = (x, y, z) => (z === 7 || z === -11 || (y === 16 && Math.abs(z) < 18) ? shade(base, 0.72) : skin0(x, y, z));
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 25, 0, 11.5, 11, 21.5, skin, 2.8);
    body.blob(0, 29, 9, 10.5, 8, 8, skin);
    const L = { coat: skin0, foot: 'hoof' as const, footColor: 0x5a524e, footH: 2 };
    const { legs, knees } = fourLegs(
      r,
      { x: 7, y: 15, z: 13, o: { ...L, upper: 6, lower: 9, r: [5, 4, 4], thigh: [5, 6, 6] } },
      { x: 7, y: 15, z: -14, o: { ...L, upper: 6, lower: 9, r: [5.5, 4, 4], thigh: [6, 7, 7] } },
    );
    const head = r.part(null, 0, 23, 22);
    const h = head.g;
    h.blob(0, 0, 5, 6.5, 6, 8, skin0);
    h.blob(0, -2, 11, 5, 4, 4, skin0);
    h.limb([0, 1, 13], [0, 10, 15.5], 2.4, 0.5, horn);
    h.limb([0, 4, 8], [0, 8, 8.5], 1.6, 0.5, horn);
    for (let x = -3; x <= 3; x++) h.front(x, -5, shade(base, 0.6));
    h.sym((s) => {
      eyeSide(h, s, 0, 6, { iris: BLACK, w: 1, h: 1, brow: shade(base, 0.7) });
      h.front(s * 2, -1, 0x3a3230);
    });
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 4, 5, 1, { w: 3, h: 5, tip: 1, coat: skin0, inner: 0x9a8a88, droop: 0.5 }));
    const tail = r.part(null, 0, 30, -22);
    tail.g.limb([0, 0, 0], [0, -8, -1], 0.6, 0.6, skin0);
    tail.g.blob(0, -9, -1, 1, 1.5, 1, BLACK);
    r.done();
    return { root: r.root, legs, knees, head: head.p, tail: tail.p, ears, top: 2.4, len: 1.6 };
  });
}

// ============================================================================ Hippo
export function hippo(): Rig {
  return cached('hippo', () => {
    const r = new Rigger(0.065);
    const base = 0x7a6a78, pink = 0xc89aa0;
    const skin = fur(base, { light: 1.1, dark: 0.88, amount: 0.35, scale: 2, seed: 61 });
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 21, 0, 15.5, 12.5, 23, split(skin, pink, 12), 2.6);
    const L = { coat: skin, foot: 'pad' as const, footColor: 0x5a4a58, footH: 2 };
    const { legs, knees } = fourLegs(
      r,
      { x: 10, y: 11, z: 15, o: { ...L, upper: 5, lower: 6, r: [5, 4.5, 4.5] } },
      { x: 10, y: 11, z: -15, o: { ...L, upper: 5, lower: 6, r: [5.5, 4.5, 4.5] } },
    );
    const head = r.part(null, 0, 23, 23);
    const h = head.g;
    h.blob(0, 5, 8, 11, 5.5, 10, skin, 3);
    h.blob(0, 3, 18, 12, 4, 6, skin, 3);
    h.recolor((_x, y) => y <= -1, GUM);
    h.sym((s) => {
      h.blob(s * 6, 10, 5, 2.6, 2, 2.6, skin);
      eyeFront(h, s, 5, 10, { iris: 0x2a1a1a, w: 2, h: 2, brow: shade(base, 0.7) });
      h.blob(s * 4, 7, 22, 1.5, 1, 1.2, skin);
      h.top(s * 4, 23, 0x2a1a2a);
      h.top(s * 4, 22, 0x2a1a2a);
    });
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 8, 10, 2, { w: 3, h: 3, round: true, coat: skin, inner: pink }));
    const jaw = r.part(head.p, 0, 0, 0);
    jaw.g.blob(0, -3, 11.5, 12, 3, 11.5, skin, 3);
    jaw.g.recolor((_x, y) => y >= -1, GUM);
    jaw.g.sym((s) => {
      jaw.g.limb([s * 9, -1, 21], [s * 9, 4, 21], 1.1, 0.8, TOOTH);
      jaw.g.limb([s * 5, -1, 22], [s * 5, 1, 22], 0.8, 0.8, TOOTH);
    });
    const tail = r.part(null, 0, 25, -23);
    tail.g.limb([0, 0, 0], [0, -5, -1], 1, 0.8, skin);
    r.done();
    return { root: r.root, legs, knees, head: head.p, jaw: jaw.p, tail: tail.p, ears, top: 2.2, len: 2.0 };
  });
}

// ============================================================================ Camel
export function camel(): Rig {
  return cached('camel', () => {
    const r = new Rigger(0.05);
    const base = 0xc8a06a;
    const coat = fur(base, { light: 1.12, dark: 0.86, amount: 0.4, seed: 71 });
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 42, 0, 9, 9, 20, coat);
    body.blob(0, 51, 7, 7, 7, 7, coat);
    body.blob(0, 51, -9, 7, 7, 7, coat);
    body.top(0, 7, shade(base, 0.8), 1);
    body.top(0, -9, shade(base, 0.8), 1);
    const L = { coat, foot: 'pad' as const, footColor: 0x8a6a48, footH: 2 };
    const { legs, knees } = fourLegs(
      r,
      { x: 5, y: 34, z: 13, o: { ...L, upper: 15, lower: 19, r: [3, 1.8, 1.8], thigh: [3.5, 6, 5] } },
      { x: 5, y: 34, z: -14, o: { ...L, upper: 15, lower: 19, r: [3.5, 1.8, 1.8], kneeZ: -3, thigh: [4, 8, 6] } },
    );
    const head = r.part(null, 0, 44, 20);
    const h = head.g;
    h.chain([[0, 0, -2], [0, -1, 7], [0, 7, 13], [0, 15, 15]], [4, 3.2, 2.8, 2.6], coat);
    h.blob(0, 17, 18, 3, 3.2, 5, coat);
    h.blob(0, 15, 22.5, 2.6, 2, 2, 0xb08a58, 2.6);
    h.front(-1, 16, 0x4a3a2a);
    h.front(1, 16, 0x4a3a2a);
    for (let x = -1; x <= 1; x++) h.front(x, 14, 0x6a4a2a);
    // Heavy-lidded, deeply unimpressed eyes.
    h.sym((s) => eyeSide(h, s, 17, 19, { iris: 0x2a1a10, w: 2, h: 2, brow: shade(base, 0.72) }));
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 2.5, 19, 15, { w: 2, h: 3, round: true, coat }));
    const tail = r.part(null, 0, 46, -20);
    tail.g.limb([0, 0, 0], [0, -12, -1], 0.7, 0.7, coat);
    tail.g.blob(0, -13, -1, 1, 2, 1, 0x6a4a2a);
    r.done();
    return { root: r.root, legs, knees, head: head.p, tail: tail.p, ears, top: 3.1, len: 1.0 };
  });
}

// ============================================================================ Vulture
export function vulture(): Rig {
  return cached('vulture', () => {
    const r = new Rigger(0.04);
    const feather = 0x2a2522, light = 0x4a4440, ruff = 0xf2ead8, skin = 0xd88a8a, beak = 0xe0c060;
    const coat = fur(feather, { light: 1.35, dark: 0.85, amount: 0.4, scale: 2, seed: 81 });
    const body = r.part(null, 0, 0, 0);
    body.g.blob(0, 0, 0, 6, 5.5, 11, coat);
    body.g.blob(0, 2, 9, 5, 4, 3, fur(ruff, { seed: 82 }));
    for (const s of [1, -1]) body.g.limb([s * 2, -5, 2], [s * 2, -7, 3], 0.8, 0.6, 0x9a8a7a);
    const head = r.part(body.p, 0, 4, 14);
    const hg = head.g;
    hg.limb([0, -1, -3], [0, 1, 2], 2, 2, skin);
    hg.blob(0, 1, 4, 2.6, 2.6, 3, skin);
    hg.limb([0, 1, 7], [0, -0.5, 10], 1.2, 0.6, beak);
    hg.set(0, -1, 10, 0x3a3020);
    hg.sym((s) => eyeSide(hg, s, 2, 5, { iris: 0xc83a20, w: 1, h: 1, brow: 0x8a4a4a }));
    const wings = [1, -1].map((s) => {
      const w = r.part(body.p, s * 6, 2.5, 0);
      for (let x = 0; x <= 34; x++) {
        const depth = x < 24 ? 7 : 7 - (x - 24) * 0.3;
        for (let z = -Math.round(depth); z <= Math.round(depth); z++) {
          // Finger feathers at the tip.
          if (x > 26 && ((z + 20) % 3 === 0)) continue;
          const c = z < -3 ? light : x > 22 ? shade(feather, 0.8) : coat(x, 0, z);
          w.g.set(s * x, 0, z, c);
          if (x < 18 && z > -3) w.g.set(s * x, 1, z, coat(x, 1, z));
        }
      }
      return w.p;
    });
    const tail = r.part(body.p, 0, 0, -11);
    for (let z = 0; z >= -9; z--) for (let x = -3 - Math.floor(-z / 3); x <= 3 + Math.floor(-z / 3); x++) tail.g.set(x, 0, z, z < -6 ? light : feather);
    r.done();
    return { root: r.root, legs: [], head: head.p, tail: tail.p, wings, top: 0.4, len: 0.5 };
  });
}

// ============================================================================ Monkey
export function monkey(): Rig {
  return cached('monkey', () => {
    const r = new Rigger(0.025);
    const base = 0x7a5a3a, face = 0xe0b890;
    const coat = fur(base, { light: 1.15, dark: 0.85, amount: 0.4, seed: 91 });
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 24, -1, 8, 8.5, 12, coat);
    body.blob(0, 23, 5, 6, 6, 6, face);
    const L = { coat, foot: 'pad' as const, footColor: face, footH: 2 };
    const { legs, knees } = fourLegs(
      r,
      { x: 5, y: 16, z: 8, o: { ...L, upper: 8, lower: 8, r: [2.4, 1.8, 1.6] } },
      { x: 5, y: 16, z: -8, o: { ...L, upper: 8, lower: 8, r: [2.8, 1.8, 1.6], kneeZ: 2 } },
    );
    const head = r.part(null, 0, 34, 12);
    const h = head.g;
    h.blob(0, 1, 1, 7, 6.5, 6, coat);
    h.blob(0, 0, 5, 5, 4.5, 2.2, face, 2.6);
    h.blob(0, -2.5, 7, 3, 2, 2, face, 2.6);
    h.sym((s) => eyeFront(h, s, 1, 1, { iris: 0x3a2010, w: 2, h: 2, brow: shade(base, 0.7) }));
    h.front(-1, -2, 0x4a2a1a);
    h.front(1, -2, 0x4a2a1a);
    for (let x = -2; x <= 2; x++) h.front(x, -4, x ? 0x6a3a2a : 0x6a3a2a);
    h.front(-3, -3, 0x6a3a2a);
    h.front(3, -3, 0x6a3a2a);
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 7, -3, 0, { w: 5, h: 6, round: true, coat: face, inner: 0xc89878, droop: 1.45 }));
    const tail = r.part(null, 0, 28, -12);
    tail.g.chain([[0, 0, 0], [0, 4, -8], [0, 12, -12], [0, 17, -8], [0, 15, -5]], [1.2, 1.1, 1, 0.9, 0.9], coat);
    r.done();
    return { root: r.root, legs, knees, head: head.p, tail: tail.p, ears, top: 1.0, len: 0.35 };
  });
}

// ============================================================================ Roadrunner
export function roadrunner(): Rig {
  return cached('roadrunner', () => {
    const r = new Rigger(0.025);
    const base = 0x4a5a8a, crest = 0x2a3a7a, leg = 0xe0a020;
    const speckle: Paint = (x, y, z) => ((x * 3 + y * 5 + z * 7) % 11 === 0 ? 0xe8e4d8 : fur(base, { seed: 101 })(x, y, z));
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 26, 0, 5, 6, 12, speckle);
    body.blob(0, 24, 6, 4, 4.5, 5, 0xe8e4d8);
    const legs: THREE.Object3D[] = [], knees: THREE.Object3D[] = [];
    for (const s of [1, -1]) {
      const l = legT(r, s * 2.5, 20, 0, leg);
      legs.push(l.hip);
      knees.push(l.knee);
    }
    const head = r.part(null, 0, 36, 12);
    const h = head.g;
    h.limb([0, -6, -4], [0, 0, 0], 3, 3, speckle);
    h.blob(0, 1, 1, 4, 4, 4.5, speckle);
    h.limb([0, 0, 4], [0, -1, 12], 1.2, 0.5, 0x3a3a3a);
    h.chain([[0, 4, 0], [0, 9, -3], [0, 10, -6]], [1.6, 1.3, 1], crest);
    h.sym((s) => {
      eyeSide(h, s, 1, 3, { iris: 0xe0a020, w: 2, h: 2, brow: crest });
      h.side(s, 1, -1, 0xe8602a);
      h.side(s, 2, -1, 0x4a8ad8);
    });
    const tail = r.part(null, 0, 28, -12);
    tail.g.limb([0, 0, 0], [0, 4, -22], 2, 1.5, crest);
    for (let z = -6; z >= -22; z -= 4) tail.g.top(0, z, 0xe8e4d8);
    r.done();
    return { root: r.root, legs, knees, head: head.p, tail: tail.p, top: 1.0, len: 0.3 };
  });
}

/** Thin bird leg: feathered thigh, scaly shin and three toes. */
export function legT(r: Rigger, x: number, y: number, z: number, color: number, thigh?: Paint) {
  return leg(r, null, x, y, z, { upper: Math.round(y * 0.45), lower: y - Math.round(y * 0.45), r: [1.2, 0.7, 0.6], coat: color, foot: 'toes', footColor: color, footH: 1, thigh: thigh ? [2, 3, 2.5] : undefined });
}

// ============================================================================ Beaver
export function beaver(): Rig {
  return cached('beaver', () => {
    const r = new Rigger(0.025);
    const base = 0x6a4426, light = 0x8a6440, tailC = 0x3a2a1a;
    const coat = fur(base, { light: 1.15, dark: 0.85, amount: 0.45, seed: 111 });
    const body = r.part(null, 0, 0, 0).g;
    body.blob(0, 17, -1, 10, 9, 14, coat);
    const L = { coat, foot: 'paw' as const, footColor: shade(base, 0.7), footH: 2, claws: 0x2a1a10 };
    const { legs, knees } = fourLegs(
      r,
      { x: 6, y: 8, z: 8, o: { ...L, upper: 3, lower: 5, r: [2.5, 2, 2] } },
      { x: 6, y: 8, z: -8, o: { ...L, upper: 3, lower: 5, r: [3, 2, 2] } },
    );
    const head = r.part(null, 0, 22, 14);
    const h = head.g;
    h.blob(0, 0, 2, 7, 6, 6, coat);
    h.blob(0, -2, 7, 4, 3, 2.5, light, 2.6);
    for (let x = -1; x <= 1; x++) h.front(x, 0, BLACK);
    // The famous orange buck teeth.
    for (const x of [-1, 0]) for (const y of [-6, -5]) h.front(x, y, 0xe8902a, 1);
    h.sym((s) => {
      eyeFront(h, s, 2, 2, { iris: BLACK, w: 1, h: 2 });
      h.front(s * 3, -2, 0x2a1a10);
    });
    const ears = [1, -1].map((s) => ear(r, head.p, s as 1 | -1, 5, 4, 0, { w: 3, h: 3, round: true, coat: shade(base, 0.8) }));
    const tail = r.part(null, 0, 12, -14);
    for (let z = 0; z >= -20; z--) {
      const hw = Math.round(5 + Math.sin((-z / 20) * Math.PI) * 3);
      for (let x = -hw; x <= hw; x++) for (const y of [-1, 0, 1]) tail.g.set(x, y, z, (x + z + y) % 2 === 0 ? tailC : shade(tailC, 1.3));
    }
    r.done();
    return { root: r.root, legs, knees, head: head.p, tail: tail.p, ears, top: 0.7, len: 0.4 };
  });
}

// ============================================================================ Piranha
export function piranha(): THREE.Group {
  return cachedGroup('piranha', () => {
    const r = new Rigger(0.016);
    const silver = 0x8a8a90, red = 0xd83a2a;
    const scales = fur(silver, { seed: 121, light: 1.25, dark: 0.85, scale: 1.5 });
    const b = r.part(null, 0, 0, 0).g;
    b.blob(0, 0, 0, 3.5, 7.5, 10, (x, y, z) => (y < -2 && z > -6 ? red : scales(x, y, z)));
    // Underbite full of teeth.
    b.blob(0, -4, 8, 3, 2.5, 3, red);
    for (let x = -2; x <= 2; x++) b.set(x, -2, 11, TOOTH);
    b.sym((s) => {
      eyeSide(b, s, 1, 7, { iris: 0xe0b020, w: 2, h: 2, brow: BLACK, angry: true });
      for (let z = -2; z <= 1; z++) b.side(s, -3, z, shade(red, 0.8), 1); // pectoral fin
    });
    for (let z = -10; z >= -15; z--) for (let y = -(-10 - z) - 1; y <= -10 - z + 1; y++) b.set(0, y, z, shade(silver, 0.75));
    for (let z = -4; z <= 2; z++) for (let y = 7; y <= 8 + Math.floor((z + 4) / 3); y++) b.set(0, y, z, shade(silver, 0.75));
    return r.done();
  });
}
