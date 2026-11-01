import * as THREE from 'three';
import { canvasTexture, mulberry32, noiseTexture, pick, shadeHex } from '../../util';
import { AISLES, CEIL, F, SAUCES, SHELF_H, SHELF_X, SHELF_Z0, SHELF_Z1, SPOT, aisleX } from './layout';

/** Mesh builders for the grocery store. Everything is boxes, cylinders and canvas textures. */

const matCache = new Map<number, THREE.MeshLambertMaterial>();
export function mat(color: number) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, map: noiseTexture() });
    matCache.set(color, m);
  }
  return m;
}

export function box(w: number, h: number, d: number, m: THREE.Material | number, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === 'number' ? mat(m) : m);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

/** A flat sign: text lines on a colored board. */
export function sign(lines: string[], w: number, h: number, bg: string, fg: string, px = 128) {
  const tw = Math.round(w * px);
  const th = Math.round(h * px);
  const tex = canvasTexture(
    tw,
    th,
    (c) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, tw, th);
      c.strokeStyle = fg;
      c.lineWidth = Math.max(4, th * 0.05);
      c.strokeRect(c.lineWidth, c.lineWidth, tw - c.lineWidth * 2, th - c.lineWidth * 2);
      c.fillStyle = fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const n = lines.length;
      lines.forEach((line, i) => {
        const size = Math.floor((th / (n + 0.6)) * (i === 0 ? 0.8 : 0.55));
        c.font = `bold ${size}px Arial Black, Impact, sans-serif`;
        let s = size;
        while (c.measureText(line).width > tw * 0.9 && s > 8) {
          s -= 2;
          c.font = `bold ${s}px Arial Black, Impact, sans-serif`;
        }
        c.fillText(line, tw / 2, (th / (n + 1)) * (i + 1));
      });
    },
    false,
  );
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  return m;
}

// ---------------------------------------------------------------- shelves and products

/** Aisle signs hanging from the ceiling (the shelves themselves are detail pieces, see detail.ts). */
export function stockShelves(): THREE.Object3D {
  const g = new THREE.Group();
  // Aisle signs hanging from the ceiling at the front of each aisle.
  AISLES.forEach((a) => {
    const s = sign([`AISLE ${a.n}`, a.name], 3.6, 1.6, '#1f6b3a', '#ffffff');
    at(s, aisleX(a.n), CEIL - 2.4, SHELF_Z0 - 1);
    g.add(s);
    const wire = box(0.04, 1.4, 0.04, 0x333333, false);
    at(wire, aisleX(a.n), CEIL - 0.9, SHELF_Z0 - 1);
    g.add(wire);
  });
  return g;
}

/** The FROZEN FOODS sign (the freezer cases are detail pieces). */
export function freezerDoors(): THREE.Object3D {
  const g = new THREE.Group();
  const s = sign(['FROZEN FOODS'], 8, 1.2, '#2a6ab0', '#ffffff');
  at(s, 44, F + 5.5, 88.9, Math.PI);
  g.add(s);
  return g;
}

// ---------------------------------------------------------------- big props

/** A shopping cart, facing +z (handle at -z). */
export function cart(): THREE.Group {
  const g = new THREE.Group();
  const wire = new THREE.MeshLambertMaterial({ color: 0xc0c6cc, transparent: true, opacity: 0.85 });
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.3), wire);
  basket.position.set(0, 0.95, 0.1);
  g.add(basket);
  const inner = box(0.82, 0.05, 1.22, 0x8a9096, false);
  inner.position.set(0, 0.62, 0.1);
  g.add(inner);
  const handle = box(1, 0.08, 0.08, 0xd8302a, false);
  handle.position.set(0, 1.35, -0.65);
  g.add(handle);
  const frame = box(0.1, 0.6, 0.1, 0x8a9096, false);
  frame.position.set(0, 0.35, -0.4);
  g.add(frame);
  for (const [x, z] of [[-0.35, -0.45], [0.35, -0.45], [-0.35, 0.6], [0.35, 0.6]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8), mat(0x222222));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.1, z);
    g.add(w);
  }
  return g;
}

export function metalBasket(): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35), new THREE.MeshLambertMaterial({ color: 0xb8c0c8, transparent: true, opacity: 0.9 }));
  g.add(b);
  const h = box(0.04, 0.3, 0.04, 0x888888, false);
  h.position.y = 0.3;
  g.add(h);
  return g;
}

export function banana(): THREE.Mesh {
  const m = box(0.12, 0.12, 0.45, 0xf2d040, false);
  m.rotation.x = 0.3;
  return m;
}

export function watermelon(): THREE.Mesh {
  const tex = canvasTexture(16, 16, (c) => {
    c.fillStyle = '#2f8a3a';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#1d5a24';
    for (let x = 0; x < 16; x += 4) c.fillRect(x, 0, 2, 16);
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshLambertMaterial({ map: tex }));
  m.scale.set(1, 0.85, 1.25);
  m.castShadow = true;
  return m;
}

export function lobster(): THREE.Group {
  const g = new THREE.Group();
  const red = mat(0xc8301e);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.6), red);
  body.position.y = 0.12;
  g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.3), red);
  tail.position.set(0, 0.1, -0.42);
  g.add(tail);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), red);
    arm.position.set(s * 0.18, 0.15, 0.4);
    arm.rotation.y = s * 0.4;
    g.add(arm);
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.22), red);
    claw.position.set(s * 0.26, 0.15, 0.6);
    claw.name = 'claw';
    g.add(claw);
    const eye = box(0.04, 0.08, 0.04, 0x111111, false);
    eye.position.set(s * 0.06, 0.26, 0.28);
    g.add(eye);
  }
  return g;
}

export function chicken(): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0xc8862a);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), m);
  b.scale.set(1, 0.8, 1.2);
  g.add(b);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.3, 6), m);
    leg.position.set(s * 0.13, 0.1, 0.3);
    leg.rotation.x = 1.1;
    g.add(leg);
  }
  return g;
}

/** Hot sauce bottle with a pepper-count label. */
export function sauceBottle(i: number): THREE.Group {
  const sc = SAUCES[i];
  const g = new THREE.Group();
  const tex = canvasTexture(
    64,
    96,
    (c) => {
      c.fillStyle = '#' + sc.color.toString(16).padStart(6, '0');
      c.fillRect(0, 0, 64, 96);
      c.fillStyle = '#fff4d0';
      c.fillRect(4, 30, 56, 48);
      c.fillStyle = '#c8201a';
      for (let k = 0; k <= i; k++) {
        const px = 8 + (k % 3) * 18;
        const py = 36 + Math.floor(k / 3) * 20;
        c.beginPath();
        c.ellipse(px + 6, py + 7, 5, 8, 0.5, 0, Math.PI * 2);
        c.fill();
      }
    },
    false,
  );
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.55, 10), new THREE.MeshLambertMaterial({ map: tex }));
  body.position.y = 0.28;
  g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.2, 8), mat(sc.color));
  neck.position.y = 0.65;
  g.add(neck);
  const cap = box(0.1, 0.06, 0.1, 0xffffff, false);
  cap.position.y = 0.78;
  g.add(cap);
  return g;
}

/** The deli slicer: base, round blade, carriage, and a thickness dial. */
export function slicer(): { group: THREE.Group; blade: THREE.Mesh; dial: THREE.Mesh } {
  const g = new THREE.Group();
  const base = box(1, 0.3, 0.8, 0xd8d8dc);
  base.position.y = 0.15;
  g.add(base);
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), new THREE.MeshLambertMaterial({ color: 0xe8eef4, emissive: 0x222222 }));
  blade.rotation.z = Math.PI / 2;
  blade.position.set(-0.2, 0.62, 0);
  g.add(blade);
  const guard = box(0.08, 0.5, 0.9, 0xa8b0b8);
  guard.position.set(-0.28, 0.6, 0);
  g.add(guard);
  const carriage = box(0.4, 0.25, 0.5, 0xb0b8c0);
  carriage.position.set(0.15, 0.45, 0);
  g.add(carriage);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), mat(0x2a2a2a));
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.3, 0.2, 0.42);
  g.add(dial);
  return { group: g, blade, dial };
}

/** Forklift with movable forks. Faces +z (forks at +z). */
export function forklift(): { group: THREE.Group; forks: THREE.Group } {
  const g = new THREE.Group();
  const yellow = mat(0xf2c230);
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 2.2), yellow);
  bodyM.position.set(0, 0.9, -0.4);
  bodyM.castShadow = true;
  g.add(bodyM);
  const cage = box(1.5, 0.1, 1.4, 0x222222);
  cage.position.set(0, 2.6, -0.3);
  g.add(cage);
  for (const [x, z] of [[-0.7, 0.3], [0.7, 0.3], [-0.7, -0.9], [0.7, -0.9]]) {
    const post = box(0.08, 1.2, 0.08, 0x222222, false);
    post.position.set(x, 2, z);
    g.add(post);
  }
  const mast = box(1.2, 9.5, 0.15, 0x555a60);
  mast.position.set(0, 4.9, 0.8);
  g.add(mast);
  for (const [x, z] of [[-0.7, 0.5], [0.7, 0.5], [-0.7, -1.2], [0.7, -1.2]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10), mat(0x1a1a1a));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.35, z);
    g.add(w);
  }
  const forks = new THREE.Group();
  for (const x of [-0.4, 0.4]) {
    const f = box(0.18, 0.08, 1.4, 0x333333);
    f.position.set(x, 0.05, 1.6);
    forks.add(f);
  }
  const pallet = box(1.4, 0.18, 1.4, 0xb78a55);
  pallet.position.set(0, 0.18, 1.6);
  forks.add(pallet);
  forks.position.y = 0.2;
  g.add(forks);
  return { group: g, forks };
}

/** A big semi truck for the parking lot gag, facing +x. */
export function truck(): THREE.Group {
  const g = new THREE.Group();
  const trailer = box(14, 4, 2.8, 0xeeeeee);
  trailer.position.set(-3, 2.8, 0);
  g.add(trailer);
  const logo = sign(['FRESH FOODS', 'We deliver. Hard.'], 10, 2.4, '#ffffff', '#c8201a');
  logo.position.set(-3, 3, 1.42);
  g.add(logo);
  const cab = box(3, 3.2, 2.8, 0xc8201a);
  cab.position.set(5.6, 2.4, 0);
  g.add(cab);
  const wind = box(0.05, 1.2, 2.4, 0x88c8f0, false);
  wind.position.set(7.12, 3.1, 0);
  g.add(wind);
  for (const x of [-8, -6.8, 2, 5.5])
    for (const z of [-1.3, 1.3]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 10), mat(0x1a1a1a));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.6, z);
      g.add(w);
    }
  return g;
}

/** Disguises for the free sample gag, in order. */
export const DISGUISES = ['fake mustache', 'sombrero', 'curly wig', 'viking helmet', 'groucho glasses'] as const;

export function disguiseMesh(i: number): THREE.Group {
  const g = new THREE.Group();
  switch (i) {
    case 0: {
      const m = box(0.5, 0.1, 0.06, 0x2a1a10, false);
      m.position.set(0, -0.12, 0.42);
      g.add(m);
      break;
    }
    case 1: {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 16), mat(0xe0b040));
      brim.position.y = 0.42;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.38, 0.55, 12), mat(0xd8302a));
      crown.position.y = 0.7;
      g.add(brim, crown);
      break;
    }
    case 2: {
      const rng = mulberry32(9);
      for (let k = 0; k < 14; k++) {
        const curl = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), mat(0xf07ab0));
        curl.position.set((rng() - 0.5) * 0.9, 0.3 + rng() * 0.25, (rng() - 0.6) * 0.8);
        g.add(curl);
      }
      break;
    }
    case 3: {
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8a9096));
      helm.position.y = 0.3;
      g.add(helm);
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), mat(0xf2ead0));
        horn.position.set(s * 0.5, 0.55, 0);
        horn.rotation.z = -s * 0.8;
        g.add(horn);
      }
      break;
    }
    default: {
      const glasses = box(0.6, 0.14, 0.05, 0x111111, false);
      glasses.position.set(0, 0.05, 0.43);
      const nose = box(0.14, 0.2, 0.14, 0xf0b090, false);
      nose.position.set(0, -0.06, 0.48);
      const stache = box(0.44, 0.08, 0.05, 0x111111, false);
      stache.position.set(0, -0.16, 0.45);
      g.add(glasses, nose, stache);
    }
  }
  return g;
}

/** A few real lights under the lit ceiling panels so the inside isn't a cave. */
export function lights(): THREE.Object3D {
  const g = new THREE.Group();
  for (const [x, z] of [[20, 58], [56, 58], [20, 80], [56, 80], [38, 96]]) {
    const l = new THREE.PointLight(0xfff4e0, 60, 40, 1.2);
    l.position.set(x, CEIL - 1.5, z);
    g.add(l);
  }
  return g;
}
