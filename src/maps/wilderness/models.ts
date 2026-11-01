import * as THREE from 'three';
import { canvasTexture, noiseTexture } from '../../util';

/**
 * Voxel-style animals and vehicles built from boxes. Every model faces +z
 * (forward = (sin yaw, 0, cos yaw)), stands with its feet at y = 0, and exposes
 * named pivots the animation code swings.
 */

const matCache = new Map<string, THREE.MeshLambertMaterial>();
export function mat(color: number, map: THREE.Texture | null = noiseTexture()) {
  const key = `${color}:${map ? map.uuid : 'none'}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, map });
    matCache.set(key, m);
  }
  return m;
}

export function bx(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function pivot(parent: THREE.Object3D, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export interface Rig {
  root: THREE.Group;
  /** Rotates with walking (x axis). Front legs first. */
  legs: THREE.Object3D[];
  head?: THREE.Object3D;
  jaw?: THREE.Object3D;
  tail?: THREE.Object3D;
  wings?: THREE.Object3D[];
  trunk?: THREE.Object3D;
  /** Height of the back, used for riders and mood icons. */
  top: number;
  /** Half length, used for collisions. */
  len: number;
}

function quad(parent: THREE.Object3D, m: THREE.Material, w: number, legH: number, legW: number, bodyLen: number, y: number) {
  const legs: THREE.Object3D[] = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const p = pivot(parent, sx * (w / 2 - legW / 2), y, sz * (bodyLen / 2 - legW * 0.8));
    bx(p, legW, legH, legW, m, 0, -legH / 2, 0);
    legs.push(p);
  }
  return legs;
}

const spotTex = () =>
  canvasTexture(16, 16, (c) => {
    c.fillStyle = '#e8b85a';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#8a5a2a';
    for (const [x, y, s] of [[1, 1, 4], [8, 2, 5], [3, 8, 4], [10, 9, 5], [6, 13, 3], [13, 5, 2]]) c.fillRect(x, y, s, s - 1);
  });
const stripeTex = () =>
  canvasTexture(16, 16, (c) => {
    c.fillStyle = '#f2f2ee';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#1a1a1a';
    for (let x = 0; x < 16; x += 4) c.fillRect(x, 0, 2, 16);
  });

let _spots: THREE.Texture | null = null, _stripes: THREE.Texture | null = null;

export function eyes(parent: THREE.Object3D, y: number, z: number, spread: number, size = 0.12) {
  const em = mat(0x111111, null);
  for (const s of [-1, 1]) bx(parent, size, size, 0.04, em, s * spread, y, z);
}

export function lion(male: boolean): Rig {
  const root = new THREE.Group();
  const fur = mat(0xc8963c);
  const legs = quad(root, fur, 1.0, 0.8, 0.28, 1.9, 0.8);
  bx(root, 1.0, 0.85, 2.0, fur, 0, 1.2, 0);
  const head = pivot(root, 0, 1.55, 1.1);
  bx(head, 0.75, 0.7, 0.7, fur, 0, 0, 0.25);
  bx(head, 0.4, 0.3, 0.3, mat(0xe0b878), 0, -0.15, 0.65);
  bx(head, 0.16, 0.12, 0.06, mat(0x3a2a1a, null), 0, -0.02, 0.81);
  eyes(head, 0.12, 0.61, 0.2);
  for (const s of [-1, 1]) bx(head, 0.16, 0.18, 0.1, fur, s * 0.3, 0.42, 0.15);
  if (male) bx(head, 1.25, 1.2, 0.6, mat(0x6a3a18), 0, 0.05, -0.05);
  const jaw = pivot(head, 0, -0.3, 0.45);
  bx(jaw, 0.38, 0.12, 0.35, mat(0xe0b878), 0, 0, 0.12);
  const tail = pivot(root, 0, 1.4, -1.0);
  bx(tail, 0.1, 0.1, 1.0, fur, 0, 0, -0.5);
  bx(tail, 0.22, 0.22, 0.22, mat(0x6a3a18), 0, 0, -1.05);
  tail.rotation.x = 0.6;
  root.scale.setScalar(male ? 1.15 : 1);
  return { root, legs, head, jaw, tail, top: 1.7, len: 1.1 };
}

export function elephant(baby = false): Rig {
  const root = new THREE.Group();
  const skin = mat(0x8a8d90);
  const legs = quad(root, skin, 2.2, 1.8, 0.75, 3.2, 1.8);
  bx(root, 2.4, 2.2, 3.6, skin, 0, 2.9, 0);
  const head = pivot(root, 0, 3.4, 1.9);
  bx(head, 1.6, 1.6, 1.3, skin, 0, 0, 0.4);
  for (const s of [-1, 1]) {
    const ear = bx(head, 0.15, 1.5, 1.2, mat(0x7c7f82), s * 1.0, 0, 0.1);
    ear.rotation.y = s * 0.3;
  }
  eyes(head, 0.25, 1.06, 0.45, 0.14);
  const trunk = pivot(head, 0, -0.4, 1.0);
  let seg: THREE.Object3D = trunk;
  for (let i = 0; i < 4; i++) {
    const s = 0.5 - i * 0.07;
    const p = pivot(seg, 0, i === 0 ? 0 : -0.55, 0);
    bx(p, s, 0.6, s, skin, 0, -0.3, 0);
    p.rotation.x = 0.12;
    seg = p;
  }
  if (!baby) for (const s of [-1, 1]) {
    const t = bx(head, 0.16, 0.16, 0.9, mat(0xf4efe0, null), s * 0.45, -0.6, 1.2);
    t.rotation.x = 0.4;
  }
  const tail = pivot(root, 0, 3.4, -1.8);
  bx(tail, 0.12, 1.0, 0.12, skin, 0, -0.5, 0);
  root.scale.setScalar(baby ? 0.42 : 1.05);
  return { root, legs, head, tail, trunk, top: 4.0, len: 2.2 };
}

export function giraffe(): Rig {
  const root = new THREE.Group();
  _spots ??= spotTex();
  const skin = mat(0xffffff, _spots);
  const legs = quad(root, skin, 0.9, 2.4, 0.24, 1.6, 2.4);
  bx(root, 0.95, 1.0, 1.9, skin, 0, 2.8, 0);
  const neck = pivot(root, 0, 3.0, 0.75);
  bx(neck, 0.38, 3.0, 0.42, skin, 0, 1.5, 0);
  neck.rotation.x = 0.35;
  const head = pivot(neck, 0, 3.0, 0);
  bx(head, 0.45, 0.42, 0.85, skin, 0, 0, 0.25);
  bx(head, 0.32, 0.25, 0.3, mat(0x8a5a2a), 0, -0.1, 0.65);
  eyes(head, 0.1, 0.5, 0.23, 0.08);
  for (const s of [-1, 1]) {
    bx(head, 0.08, 0.35, 0.08, mat(0x6a4a2a), s * 0.13, 0.35, 0);
    bx(head, 0.25, 0.1, 0.1, skin, s * 0.32, 0.15, -0.05);
  }
  head.rotation.x = -0.35;
  const tail = pivot(root, 0, 3.1, -0.95);
  bx(tail, 0.06, 1.0, 0.06, skin, 0, -0.5, 0);
  return { root, legs, head: neck, tail, top: 6.4, len: 1.0 };
}

export function zebra(): Rig {
  const root = new THREE.Group();
  _stripes ??= stripeTex();
  const skin = mat(0xffffff, _stripes);
  const legs = quad(root, skin, 0.75, 1.0, 0.2, 1.5, 1.0);
  bx(root, 0.8, 0.85, 1.7, skin, 0, 1.4, 0);
  const head = pivot(root, 0, 1.7, 0.85);
  bx(head, 0.32, 0.9, 0.35, skin, 0, 0.25, 0.1).rotation.x = 0.5;
  bx(head, 0.34, 0.34, 0.75, skin, 0, 0.6, 0.45);
  bx(head, 0.08, 0.6, 0.3, mat(0x1a1a1a, null), 0, 0.5, -0.1);
  eyes(head, 0.7, 0.62, 0.17, 0.07);
  const tail = pivot(root, 0, 1.6, -0.85);
  bx(tail, 0.06, 0.7, 0.06, mat(0x1a1a1a, null), 0, -0.35, 0);
  return { root, legs, head, tail, top: 2.0, len: 0.9 };
}

export function gazelle(): Rig {
  const root = new THREE.Group();
  const skin = mat(0xc98a4a);
  const legs = quad(root, mat(0xe8d8b8), 0.5, 0.9, 0.12, 0.9, 0.9);
  bx(root, 0.5, 0.5, 1.1, skin, 0, 1.15, 0);
  bx(root, 0.52, 0.1, 1.0, mat(0x2a1a10), 0, 1.05, 0);
  const head = pivot(root, 0, 1.4, 0.55);
  bx(head, 0.25, 0.25, 0.45, skin, 0, 0.1, 0.15);
  for (const s of [-1, 1]) bx(head, 0.05, 0.5, 0.05, mat(0x2a2a2a, null), s * 0.08, 0.45, 0).rotation.x = -0.3;
  const tail = pivot(root, 0, 1.3, -0.55);
  bx(tail, 0.06, 0.3, 0.06, skin, 0, -0.15, 0);
  return { root, legs, head, tail, top: 1.5, len: 0.6 };
}

export function rhino(): Rig {
  const root = new THREE.Group();
  const skin = mat(0x7d7470);
  const legs = quad(root, skin, 1.3, 0.9, 0.4, 2.2, 0.9);
  bx(root, 1.4, 1.3, 2.6, skin, 0, 1.5, 0);
  bx(root, 1.2, 0.3, 2.2, mat(0x6d6460), 0, 2.2, 0);
  const head = pivot(root, 0, 1.4, 1.3);
  bx(head, 0.8, 0.8, 1.0, skin, 0, 0, 0.45);
  bx(head, 0.18, 0.6, 0.18, mat(0xd8d0c0, null), 0, 0.5, 0.85).rotation.x = -0.4;
  bx(head, 0.12, 0.3, 0.12, mat(0xd8d0c0, null), 0, 0.45, 0.5);
  eyes(head, 0.1, 0.96, 0.4, 0.08);
  for (const s of [-1, 1]) bx(head, 0.1, 0.25, 0.12, skin, s * 0.3, 0.5, 0.05);
  const tail = pivot(root, 0, 1.8, -1.3);
  bx(tail, 0.08, 0.5, 0.08, skin, 0, -0.25, 0);
  return { root, legs, head, tail, top: 2.4, len: 1.6 };
}

export function hippo(): Rig {
  const root = new THREE.Group();
  const skin = mat(0x7a6a78);
  const pink = mat(0xe08aa0, null);
  const legs = quad(root, skin, 1.8, 0.7, 0.55, 2.6, 0.7);
  bx(root, 2.0, 1.6, 3.0, skin, 0, 1.4, 0);
  const head = pivot(root, 0, 1.5, 1.5);
  bx(head, 1.6, 0.8, 1.6, skin, 0, 0.3, 0.7);
  for (const s of [-1, 1]) {
    bx(head, 0.25, 0.2, 0.25, skin, s * 0.55, 0.85, 0.2);
    bx(head, 0.2, 0.2, 0.1, mat(0x111111, null), s * 0.45, 0.6, 0.0);
    bx(head, 0.2, 0.15, 0.08, mat(0x2a1a2a, null), s * 0.3, 0.55, 1.5);
  }
  const jaw = pivot(head, 0, 0, 0.0);
  bx(jaw, 1.55, 0.4, 1.5, skin, 0, -0.15, 0.75);
  bx(jaw, 1.3, 0.05, 1.3, pink, 0, 0.07, 0.75);
  for (const s of [-1, 1]) bx(jaw, 0.14, 0.4, 0.14, mat(0xf4efe0, null), s * 0.6, 0.2, 1.35);
  bx(head, 1.3, 0.05, 1.3, pink, 0, -0.08, 0.75);
  const tail = pivot(root, 0, 1.6, -1.5);
  bx(tail, 0.1, 0.4, 0.1, skin, 0, -0.2, 0);
  return { root, legs, head, jaw, tail, top: 2.2, len: 2.0 };
}

export function bear(): Rig {
  const root = new THREE.Group();
  const fur = mat(0x5a3a22);
  const legs = quad(root, fur, 1.3, 0.9, 0.42, 2.0, 0.9);
  bx(root, 1.4, 1.3, 2.2, fur, 0, 1.5, 0);
  bx(root, 1.3, 0.5, 0.8, fur, 0, 2.2, 0.5);
  const head = pivot(root, 0, 1.9, 1.15);
  bx(head, 0.9, 0.85, 0.8, fur, 0, 0, 0.3);
  bx(head, 0.45, 0.35, 0.35, mat(0x8a6a4a), 0, -0.15, 0.85);
  bx(head, 0.18, 0.12, 0.06, mat(0x111111, null), 0, -0.02, 1.03);
  eyes(head, 0.12, 0.71, 0.22);
  for (const s of [-1, 1]) bx(head, 0.22, 0.22, 0.1, fur, s * 0.35, 0.5, 0.15);
  const jaw = pivot(head, 0, -0.35, 0.6);
  bx(jaw, 0.4, 0.12, 0.3, mat(0x8a6a4a), 0, 0, 0.1);
  const tail = pivot(root, 0, 1.7, -1.1);
  bx(tail, 0.2, 0.2, 0.2, fur, 0, 0, 0);
  return { root, legs, head, jaw, tail, top: 2.4, len: 1.2 };
}

export function camel(): Rig {
  const root = new THREE.Group();
  const fur = mat(0xc8a06a);
  const legs = quad(root, fur, 0.8, 1.7, 0.22, 1.6, 1.7);
  bx(root, 0.9, 0.9, 2.0, fur, 0, 2.1, 0);
  bx(root, 0.7, 0.6, 0.6, fur, 0, 2.8, 0.35);
  bx(root, 0.7, 0.6, 0.6, fur, 0, 2.8, -0.45);
  const head = pivot(root, 0, 2.2, 1.0);
  bx(head, 0.3, 1.1, 0.35, fur, 0, 0.4, 0.3).rotation.x = 0.8;
  bx(head, 0.35, 0.35, 0.75, fur, 0, 0.85, 0.85);
  eyes(head, 0.97, 0.9, 0.18, 0.07);
  bx(head, 0.25, 0.08, 0.2, mat(0x6a4a2a), 0, 0.68, 1.15);
  const tail = pivot(root, 0, 2.3, -1.0);
  bx(tail, 0.06, 0.6, 0.06, fur, 0, -0.3, 0);
  return { root, legs, head, tail, top: 3.1, len: 1.0 };
}

export function vulture(): Rig {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);
  bx(body, 0.5, 0.45, 0.9, mat(0x2a2522), 0, 0, 0);
  bx(body, 0.4, 0.3, 0.2, mat(0xf2ead8, null), 0, 0.1, 0.45);
  const head = pivot(body, 0, 0.15, 0.55);
  bx(head, 0.2, 0.22, 0.3, mat(0xd88a8a, null), 0, 0.05, 0.1);
  bx(head, 0.08, 0.1, 0.18, mat(0xe0c060, null), 0, 0.0, 0.32);
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const w = pivot(body, s * 0.25, 0.1, 0);
    bx(w, 1.4, 0.08, 0.6, mat(0x1e1a18), s * 0.7, 0, 0);
    wings.push(w);
  }
  const tail = pivot(body, 0, 0, -0.45);
  bx(tail, 0.35, 0.06, 0.4, mat(0x1e1a18), 0, 0, -0.2);
  return { root, legs: [], head, tail, wings, top: 0.4, len: 0.5 };
}

export function monkey(): Rig {
  const root = new THREE.Group();
  const fur = mat(0x7a5a3a);
  const legs = quad(root, fur, 0.4, 0.4, 0.12, 0.5, 0.4);
  bx(root, 0.4, 0.45, 0.6, fur, 0, 0.6, 0);
  const head = pivot(root, 0, 0.85, 0.3);
  bx(head, 0.35, 0.32, 0.3, fur, 0, 0.1, 0.05);
  bx(head, 0.25, 0.2, 0.08, mat(0xe0b890), 0, 0.06, 0.21);
  eyes(head, 0.13, 0.26, 0.07, 0.05);
  const tail = pivot(root, 0, 0.7, -0.3);
  bx(tail, 0.06, 0.06, 0.8, fur, 0, 0.25, -0.35).rotation.x = -0.7;
  return { root, legs, head, tail, top: 1.0, len: 0.35 };
}

export function roadrunner(): Rig {
  const root = new THREE.Group();
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const p = pivot(root, s * 0.08, 0.5, 0);
    bx(p, 0.05, 0.5, 0.05, mat(0xe0a020, null), 0, -0.25, 0);
    legs.push(p);
  }
  bx(root, 0.25, 0.3, 0.6, mat(0x4a5a8a), 0, 0.65, 0);
  const head = pivot(root, 0, 0.9, 0.3);
  bx(head, 0.2, 0.22, 0.25, mat(0x4a5a8a), 0, 0.05, 0.05);
  bx(head, 0.06, 0.06, 0.3, mat(0xe0a020, null), 0, 0.0, 0.3);
  bx(head, 0.05, 0.25, 0.25, mat(0x2a3a7a), 0, 0.22, -0.05).rotation.x = -0.6;
  eyes(head, 0.08, 0.18, 0.07, 0.05);
  const tail = pivot(root, 0, 0.7, -0.3);
  bx(tail, 0.12, 0.05, 0.6, mat(0x2a3a7a), 0, 0.1, -0.3).rotation.x = -0.5;
  return { root, legs, head, tail, top: 1.0, len: 0.3 };
}

export function gator(): Rig {
  const root = new THREE.Group();
  const skin = mat(0x4a6a3a);
  const legs = quad(root, skin, 1.0, 0.3, 0.2, 1.6, 0.3);
  bx(root, 0.9, 0.45, 1.8, skin, 0, 0.45, 0);
  for (let i = 0; i < 6; i++) bx(root, 0.12, 0.1, 0.12, mat(0x3a5a2a), (i % 2 ? 0.2 : -0.2), 0.72, -0.7 + i * 0.28);
  const head = pivot(root, 0, 0.5, 0.9);
  bx(head, 0.6, 0.25, 1.1, skin, 0, 0.05, 0.55);
  eyes(head, 0.24, 0.3, 0.2, 0.1);
  const jaw = pivot(head, 0, -0.1, 0.05);
  bx(jaw, 0.58, 0.15, 1.05, mat(0xd8d0a0), 0, -0.05, 0.5);
  for (let i = 0; i < 4; i++) bx(head, 0.5, 0.06, 0.06, mat(0xffffff, null), 0, -0.1, 0.4 + i * 0.22);
  const tail = pivot(root, 0, 0.45, -0.9);
  bx(tail, 0.5, 0.35, 1.6, skin, 0, 0, -0.8);
  return { root, legs, head, jaw, tail, top: 0.8, len: 1.4 };
}

export function beaver(): Rig {
  const root = new THREE.Group();
  const fur = mat(0x6a4426);
  const legs = quad(root, fur, 0.4, 0.2, 0.12, 0.5, 0.2);
  bx(root, 0.5, 0.45, 0.7, fur, 0, 0.42, 0);
  const head = pivot(root, 0, 0.55, 0.35);
  bx(head, 0.35, 0.3, 0.3, fur, 0, 0.05, 0.1);
  bx(head, 0.14, 0.12, 0.04, mat(0xffffff, null), 0, -0.08, 0.26);
  eyes(head, 0.12, 0.26, 0.09, 0.05);
  const tail = pivot(root, 0, 0.3, -0.35);
  bx(tail, 0.4, 0.06, 0.5, mat(0x3a2a1a), 0, 0, -0.25);
  return { root, legs, head, tail, top: 0.7, len: 0.4 };
}

export function piranha(): THREE.Group {
  const g = new THREE.Group();
  bx(g, 0.12, 0.25, 0.35, mat(0x8a8a90), 0, 0, 0);
  bx(g, 0.13, 0.12, 0.2, mat(0xd83a2a, null), 0, -0.08, 0.05);
  bx(g, 0.04, 0.18, 0.12, mat(0x8a8a90), 0, 0, -0.22);
  return g;
}

// ---------------------------------------------------------------- vehicles and props

export function jeep(target = false): THREE.Group {
  const g = new THREE.Group();
  _stripes ??= stripeTex();
  const body = mat(0xffffff, _stripes);
  const khaki = mat(0xb8a878);
  bx(g, 2.2, 0.9, 4.2, body, 0, 1.0, 0);
  bx(g, 2.0, 0.5, 1.2, khaki, 0, 1.65, 1.4); // hood
  bx(g, 2.0, 0.6, 0.12, mat(0x9ad0e8, null), 0, 2.1, 0.75); // windshield
  for (const [x, z] of [[-1, -1.6], [1, -1.6], [-1, 0.6], [1, 0.6]]) bx(g, 0.1, 1.6, 0.1, mat(0x333333, null), x, 2.3, z); // roll bar
  bx(g, 2.2, 0.1, 2.4, khaki, 0, 3.1, -0.5);
  for (const [x, z] of [[-1.1, 1.4], [1.1, 1.4], [-1.1, -1.3], [1.1, -1.3]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), mat(0x1a1a1a, null));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.5, z);
    w.castShadow = true;
    w.name = 'wheel';
    g.add(w);
  }
  bx(g, 0.5, 0.5, 0.5, mat(0x222222, null), 0, 1.2, -2.2); // spare
  // Seats.
  bx(g, 1.8, 0.3, 0.7, mat(0x6a3a1a), 0, 1.5, 0.2);
  bx(g, 1.8, 0.3, 0.7, mat(0x6a3a1a), 0, 1.5, -1.1);
  const tgt = new THREE.Group();
  tgt.name = 'target';
  const tex = canvasTexture(32, 32, (c) => {
    for (let r = 16, i = 0; r > 0; r -= 4, i++) {
      c.fillStyle = i % 2 ? '#ffffff' : '#d01818';
      c.beginPath();
      c.arc(16, 16, r, 0, Math.PI * 2);
      c.fill();
    }
  });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshLambertMaterial({ map: tex, transparent: true }));
    p.position.set(s * 1.12, 1.1, -0.4);
    p.rotation.y = s * Math.PI / 2;
    tgt.add(p);
  }
  tgt.visible = target;
  g.add(tgt);
  return g;
}

export function balloon(): { root: THREE.Group; envelope: THREE.Group; flame: THREE.Mesh } {
  const root = new THREE.Group();
  const basket = mat(0x9a6a3a);
  bx(root, 2.2, 1.1, 2.2, basket, 0, 0.55, 0);
  bx(root, 1.8, 0.2, 1.8, mat(0x6a4a2a), 0, 0.1, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(root, 0.06, 3.2, 0.06, mat(0x3a2a1a, null), x, 2.6, z);
  bx(root, 0.5, 0.4, 0.5, mat(0x555555, null), 0, 4.0, 0); // burner
  const flame = bx(root, 0.3, 0.8, 0.3, new THREE.MeshBasicMaterial({ color: 0xffa020 }), 0, 4.6, 0);
  const envelope = new THREE.Group();
  envelope.position.y = 9.5;
  const cols = [0xd83a2a, 0xf2c230, 0x3a6fd8, 0xf2c230];
  for (let i = 0; i < 9; i++) {
    const y = -4 + i;
    const r = Math.sin(((i + 0.5) / 9) * Math.PI) * 4.2 + (i < 3 ? 0.4 : 0);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const slab = bx(envelope, r * 1.42, 1.02, 0.6, mat(cols[(k + i) % 4]), Math.cos(a) * r * 0.7, y, Math.sin(a) * r * 0.7);
      slab.rotation.y = -a + Math.PI / 2;
      const slab2 = bx(envelope, r * 1.42, 1.02, 0.6, mat(cols[(k + i + 1) % 4]), Math.cos(a + Math.PI / 4) * r * 0.7, y, Math.sin(a + Math.PI / 4) * r * 0.7);
      slab2.rotation.y = -(a + Math.PI / 4) + Math.PI / 2;
    }
  }
  bx(envelope, 4, 0.6, 4, mat(0xd83a2a), 0, 4.8, 0);
  root.add(envelope);
  return { root, envelope, flame };
}

export function barrel(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 10), mat(0x8a5a2a));
  m.castShadow = true;
  m.position.y = 0.65;
  g.add(m);
  for (const y of [0.2, 1.1]) {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.08, 10), mat(0x444444, null));
    hoop.position.y = y;
    g.add(hoop);
  }
  return g;
}

export function rocket(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.6, 8), mat(0xd82a2a, null));
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.6;
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 8), mat(0xeeeeee, null));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.6, 1.7);
  g.add(nose);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const f = bx(g, 0.05, 0.5, 0.5, mat(0x222222, null), Math.sin(a) * 0.4, 0.6 + Math.cos(a) * 0.4, -1.1);
    f.rotation.z = a;
  }
  const label = canvasTexture(64, 16, (c) => {
    c.fillStyle = '#d82a2a';
    c.fillRect(0, 0, 64, 16);
    c.fillStyle = '#ffffff';
    c.font = 'bold 13px Arial Black, Impact';
    c.textAlign = 'center';
    c.fillText('A.C.M.E.', 32, 13);
  }, false);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38), new THREE.MeshBasicMaterial({ map: label }));
    p.position.set(s * 0.36, 0.6, 0);
    p.rotation.y = s * Math.PI / 2;
    g.add(p);
  }
  return g;
}

export function ufo(): { root: THREE.Group; beam: THREE.Mesh; lights: THREE.Mesh[] } {
  const root = new THREE.Group();
  const metal = mat(0xb8c0c8, null);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(7, 4, 1.2, 16), metal);
  root.add(disc);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(4, 7, 0.8, 16), metal);
  top.position.y = 0.9;
  root.add(top);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8af0c0, emissive: 0x2a8a5a, transparent: true, opacity: 0.8 }));
  dome.position.y = 1.3;
  root.add(dome);
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffff60 }));
    l.position.set(Math.cos(a) * 6.2, -0.2, Math.sin(a) * 6.2);
    root.add(l);
    lights.push(l);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.4, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9affc0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  beam.visible = false;
  root.add(beam);
  return { root, beam, lights };
}

export function truck(): THREE.Group {
  const g = new THREE.Group();
  const red = mat(0xc83a2a);
  bx(g, 2.2, 1.0, 5, red, 0, 1.0, 0);
  bx(g, 2.0, 1.1, 1.8, red, 0, 2.0, 1.0);
  bx(g, 1.9, 0.6, 0.1, mat(0x9ad0e8, null), 0, 2.2, 1.92);
  for (const [x, z] of [[-1.1, 1.6], [1.1, 1.6], [-1.1, -1.6], [1.1, -1.6]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), mat(0x1a1a1a, null));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.5, z);
    g.add(w);
  }
  return g;
}

export function spool(color = 0xf2c230): THREE.Group {
  const g = new THREE.Group();
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.9, 12), mat(color, null));
  reel.rotation.z = Math.PI / 2;
  reel.position.y = 0.7;
  g.add(reel);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 12), mat(0x6a4a2a));
    side.rotation.z = Math.PI / 2;
    side.position.set(s * 0.48, 0.7, 0);
    g.add(side);
  }
  return g;
}

/** A small item model to show something sitting in the world (basket, steak, can, hat...). */
export function item(kind: string): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'basket':
      bx(g, 0.7, 0.4, 0.5, mat(0xb8884a), 0, 0.2, 0);
      bx(g, 0.72, 0.06, 0.52, mat(0xd83a3a, null), 0, 0.42, 0);
      bx(g, 0.06, 0.35, 0.06, mat(0x8a6a3a), 0, 0.6, 0);
      break;
    case 'steak':
      bx(g, 0.5, 0.1, 0.35, mat(0xc83a3a), 0, 0.05, 0);
      bx(g, 0.1, 0.11, 0.3, mat(0xf2e8d8, null), 0.18, 0.05, 0);
      break;
    case 'paint':
      bx(g, 0.35, 0.45, 0.35, mat(0xd8d8d8, null), 0, 0.22, 0);
      bx(g, 0.36, 0.15, 0.36, mat(0xd01818, null), 0, 0.3, 0);
      break;
    case 'hat':
      bx(g, 0.5, 0.06, 0.5, mat(0xd0d4dc, null), 0, 0.03, 0);
      for (let i = 0; i < 3; i++) bx(g, 0.4 - i * 0.12, 0.12, 0.4 - i * 0.12, mat(0xc8ccd4, null), 0, 0.12 + i * 0.12, 0);
      break;
    case 'flare':
      bx(g, 0.18, 0.18, 0.5, mat(0xf07a2a, null), 0, 0.1, 0);
      bx(g, 0.1, 0.25, 0.12, mat(0x333333, null), 0, -0.05, -0.15);
      break;
    case 'peanuts':
      bx(g, 0.35, 0.45, 0.15, mat(0xc8a060), 0, 0.22, 0);
      bx(g, 0.36, 0.12, 0.16, mat(0xd83a3a, null), 0, 0.3, 0);
      break;
    case 'horn':
      bx(g, 0.2, 0.3, 0.2, mat(0xd83a3a, null), 0, 0.15, 0);
      bx(g, 0.15, 0.15, 0.3, mat(0xeeeeee, null), 0, 0.35, 0.1);
      break;
    case 'camera':
      for (const a of [0, 2.1, 4.2]) {
        const leg = bx(g, 0.05, 1.4, 0.05, mat(0x222222, null), Math.cos(a) * 0.25, 0.65, Math.sin(a) * 0.25);
        leg.rotation.z = Math.cos(a) * 0.2;
        leg.rotation.x = -Math.sin(a) * 0.2;
      }
      bx(g, 0.45, 0.3, 0.3, mat(0x222222, null), 0, 1.45, 0);
      bx(g, 0.18, 0.18, 0.2, mat(0x555555, null), 0, 1.45, 0.22);
      break;
    case 'crate':
      bx(g, 1.2, 1.0, 1.0, mat(0xb8884a), 0, 0.5, 0);
      break;
    case 'sandwich':
      bx(g, 0.35, 0.06, 0.35, mat(0xe8c890), 0, 0.03, 0);
      bx(g, 0.36, 0.05, 0.36, mat(0x5aa83a, null), 0, 0.08, 0);
      bx(g, 0.35, 0.06, 0.35, mat(0xe8c890), 0, 0.13, 0);
      break;
    default:
      bx(g, 0.4, 0.4, 0.4, mat(0xff00ff, null), 0, 0.2, 0);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** A text sign on a post, made from a canvas. */
export function signBoard(lines: string[], bg = '#6b4a2a', fg = '#f5e6c8', w = 4, h = 1.6, post = true): THREE.Group {
  const g = new THREE.Group();
  const tex = canvasTexture(
    512,
    Math.round((512 * h) / w),
    (c) => {
      const H = Math.round((512 * h) / w);
      c.fillStyle = bg;
      c.fillRect(0, 0, 512, H);
      c.strokeStyle = fg;
      c.lineWidth = 8;
      c.strokeRect(6, 6, 500, H - 12);
      c.fillStyle = fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      lines.forEach((line, i) => {
        const big = i === 0;
        let size = big ? 64 : 34;
        c.font = `bold ${size}px Arial Black, Impact, sans-serif`;
        while (c.measureText(line).width > 470 && size > 12) {
          size -= 2;
          c.font = `bold ${size}px Arial Black, Impact, sans-serif`;
        }
        c.fillText(line, 256, (H / (lines.length + 1)) * (i + 1));
      });
    },
    false,
  );
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), [mat(0x4a3220, null), mat(0x4a3220, null), mat(0x4a3220, null), mat(0x4a3220, null), new THREE.MeshLambertMaterial({ map: tex }), new THREE.MeshLambertMaterial({ map: tex })]);
  board.position.y = post ? 1.4 + h / 2 : 0;
  board.castShadow = true;
  g.add(board);
  if (post) bx(g, 0.15, 1.4 + h / 2, 0.15, mat(0x4a3220), 0, (1.4 + h / 2) / 2, -0.1);
  return g;
}
