import * as THREE from 'three';
import { canvasTexture, noiseTexture } from '../util';
import type { TravelKind } from '../maps/types';

/**
 * Procedural transit vehicles. Each model faces local +x, sits on y = 0 (wheels, keel or gear),
 * and has its passenger door on the local +z side (the right-hand side when driving forward).
 */
export interface VehicleModel {
  group: THREE.Group;
  /** Half sizes of the hit box, centered at (0, half.y, 0) locally. */
  half: THREE.Vector3;
  /** Door position in local coords, at floor height outside the door. */
  door: THREE.Vector3;
  /** Spinning bits (wheels, propellers) to animate by distance travelled. */
  spinners: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; rate: number }[];
  /** Name painted on the side. */
  label: string;
}

const lam = (c: number, tex = true) => new THREE.MeshLambertMaterial({ color: c, map: tex ? noiseTexture() : null });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function wheel(r: number, w: number) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 10), lam(0x1a1a1a, false));
  m.rotation.x = Math.PI / 2;
  m.castShadow = true;
  const hub = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, w + 0.02, r * 0.25), lam(0x999999, false));
  m.add(hub);
  return m;
}

function sideText(text: string, w: number, h: number, bg: string, fg: string) {
  const tex = canvasTexture(
    512,
    Math.round((512 * h) / w),
    (c) => {
      const W = c.canvas.width, H = c.canvas.height;
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);
      c.fillStyle = fg;
      c.font = `bold ${Math.round(H * 0.62)}px Impact, 'Arial Black', sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, W / 2, H / 2 + 2);
    },
    false,
  );
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: bg === 'transparent' }));
}

/** Strip of windows on both sides. */
function windows(g: THREE.Group, len: number, y: number, halfW: number, n: number, x0 = 0, h = 0.9, mat = lam(0x9fd6ef, false)) {
  const step = len / n;
  for (let i = 0; i < n; i++)
    for (const s of [1, -1]) g.add(box(step * 0.72, h, 0.06, mat, x0 - len / 2 + step * (i + 0.5), y, s * (halfW + 0.02)));
}

export function makeBus(livery = 0xf2c230): VehicleModel {
  const g = new THREE.Group();
  const spinners: VehicleModel['spinners'] = [];
  const L = 12, W = 3, H = 3.2;
  g.add(box(L, H - 0.6, W, lam(livery), 0, 0.6 + (H - 0.6) / 2, 0));
  g.add(box(L + 0.05, 0.35, W + 0.05, lam(0x2a6ab0), 0, 1.4, 0)); // stripe
  g.add(box(L - 0.4, 0.2, W - 0.3, lam(0xdddddd), 0, H + 0.1, 0)); // roof
  windows(g, L - 3.5, 2.5, W / 2, 6, -1.2);
  g.add(box(0.06, 1.3, W - 0.5, lam(0x9fd6ef, false), L / 2 + 0.01, 2.3, 0)); // windshield
  // Door (front right) - darker panel with a gap.
  g.add(box(1.4, 2.3, 0.08, lam(0x333a44, false), L / 2 - 1.6, 1.75, W / 2 + 0.03));
  // Destination sign.
  const sign = sideText('CITY ▸ EXPRESS', 2.4, 0.42, '#111', '#ffb020');
  sign.position.set(L / 2 + 0.04, H - 0.3, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  const side = sideText('SMALLVILLE TRANSIT', 6, 0.5, 'transparent', '#1b3f7a');
  side.position.set(-1.5, 1.0, W / 2 + 0.04);
  g.add(side);
  for (const x of [-L / 2 + 2, L / 2 - 2.2])
    for (const z of [-W / 2, W / 2]) {
      const w = wheel(0.55, 0.4);
      w.position.set(x, 0.55, z);
      g.add(w);
      spinners.push({ obj: w, axis: 'y', rate: -1 / 0.55 });
    }
  // headlights
  for (const z of [-1, 1]) g.add(box(0.05, 0.3, 0.5, new THREE.MeshBasicMaterial({ color: 0xfff6c0 }), L / 2 + 0.03, 1.0, z));
  return { group: g, half: new THREE.Vector3(L / 2, H / 2 + 0.2, W / 2), door: new THREE.Vector3(L / 2 - 1.6, 0, W / 2 + 1.2), spinners, label: 'bus' };
}

export function makeTrain(): VehicleModel {
  const g = new THREE.Group();
  const spinners: VehicleModel['spinners'] = [];
  const cars = 4, carL = 13, gap = 0.8, W = 3.2, H = 3.6;
  const total = cars * carL + (cars - 1) * gap;
  for (let i = 0; i < cars; i++) {
    const cx = total / 2 - carL / 2 - i * (carL + gap);
    const engine = i === 0;
    const body = lam(engine ? 0xc23b30 : 0xc9ced6);
    g.add(box(carL, H - 0.8, W, body, cx, 0.8 + (H - 0.8) / 2, 0));
    g.add(box(carL, 0.3, W + 0.04, lam(0xc23b30), cx, 1.5, 0));
    g.add(box(carL - 0.6, 0.25, W - 0.4, lam(0x777d86), cx, H + 0.12, 0));
    if (engine) {
      g.add(box(0.08, 1.2, W - 0.6, lam(0x9fd6ef, false), cx + carL / 2 + 0.01, 2.7, 0));
      g.add(box(1.2, 1.2, W - 0.2, lam(0x333333), cx + carL / 2 - 0.6, 0.9, 0)); // cowcatcher block
    } else {
      windows(g, carL - 1, 2.6, W / 2, 6, cx);
      g.add(box(1.4, 2.4, 0.08, lam(0x333a44, false), cx, 2.0, W / 2 + 0.03));
    }
    for (const x of [cx - carL / 2 + 1.6, cx + carL / 2 - 1.6])
      for (const z of [-1.2, 1.2]) {
        const w = wheel(0.5, 0.3);
        w.position.set(x, 0.5, z);
        g.add(w);
        spinners.push({ obj: w, axis: 'y', rate: -2 });
      }
  }
  const side = sideText('VALLEY RAIL', 5, 0.6, 'transparent', '#ffffff');
  side.position.set(total / 2 - carL / 2, 2.4, W / 2 + 0.04);
  g.add(side);
  for (const z of [-0.9, 0.9]) g.add(box(0.05, 0.35, 0.5, new THREE.MeshBasicMaterial({ color: 0xfff6c0 }), total / 2 + 0.05, 1.2, z));
  // Door of the second car.
  const doorX = total / 2 - carL / 2 - (carL + gap);
  return { group: g, half: new THREE.Vector3(total / 2, H / 2 + 0.2, W / 2), door: new THREE.Vector3(doorX, 0, W / 2 + 1.3), spinners, label: 'train' };
}

export function makePlane(): VehicleModel {
  const g = new THREE.Group();
  const spinners: VehicleModel['spinners'] = [];
  const L = 26, R = 1.9;
  const white = lam(0xf3f3f0);
  const blue = lam(0x2a5ab8);
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L - 6, 12), white);
  fus.rotation.z = Math.PI / 2;
  fus.position.set(0, 2.6, 0);
  fus.castShadow = true;
  g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(R, 4, 12), white);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(L / 2 - 1, 2.6, 0);
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(R, 4, 12), white);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-L / 2 + 1, 2.9, 0);
  g.add(tail);
  g.add(box(L - 7, 0.35, 0.05, blue, 0, 2.0, R + 0.01)); // cheat line
  g.add(box(L - 7, 0.35, 0.05, blue, 0, 2.0, -R - 0.01));
  windows(g, L - 10, 3.0, R - 0.05, 12, 0.5, 0.45);
  g.add(box(3.5, 0.3, 22, white, 0.5, 2.0, 0)); // wings
  g.add(box(2, 0.25, 8, white, -L / 2 + 1.5, 3.1, 0)); // stabilizer
  g.add(box(3, 4, 0.3, blue, -L / 2 + 1.5, 5, 0)); // fin
  for (const z of [-5.5, 5.5]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 3, 10), lam(0xaaaaaa));
    eng.rotation.z = Math.PI / 2;
    eng.position.set(1.2, 1.3, z);
    g.add(eng);
    const prop = box(0.1, 2.6, 0.25, lam(0x222222, false), 2.8, 1.3, z);
    g.add(prop);
    spinners.push({ obj: prop, axis: 'x', rate: 3 });
  }
  for (const [x, z] of [[L / 2 - 4, 0], [-1, -1.6], [-1, 1.6]]) {
    const w = wheel(0.45, 0.35);
    w.position.set(x, 0.45, z);
    g.add(w);
    g.add(box(0.15, 0.7, 0.15, lam(0x666666, false), x, 1.0, z));
  }
  const side = sideText('BUDGET WINGS', 7, 0.8, 'transparent', '#2a5ab8');
  side.position.set(-2, 3.6, R - 0.15);
  g.add(side);
  return { group: g, half: new THREE.Vector3(L / 2, 2.5, 11), door: new THREE.Vector3(L / 2 - 6, 0, R + 1.6), spinners, label: 'plane' };
}

export function makeBoat(): VehicleModel {
  const g = new THREE.Group();
  const spinners: VehicleModel['spinners'] = [];
  const L = 22, W = 7;
  const hull = lam(0x1d3557);
  g.add(box(L, 2.2, W, hull, 0, 0.1, 0));
  const bow = box(4, 2.2, W * 0.7, hull, L / 2 + 1.2, 0.1, 0);
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(0.8, 1, 0.8);
  g.add(bow);
  g.add(box(L, 0.4, W + 0.1, lam(0xc23b30), 0, -0.6, 0)); // waterline
  g.add(box(L - 1, 0.25, W - 0.6, lam(0xb78a55), 0, 1.3, 0)); // deck
  g.add(box(10, 2.6, W - 1.6, lam(0xf3f3f0), -1.5, 2.7, 0)); // cabin
  windows(g, 9, 3.0, (W - 1.6) / 2, 6, -1.5, 0.8);
  g.add(box(6, 1.8, W - 2.4, lam(0xf3f3f0), -2.5, 4.9, 0)); // bridge
  g.add(box(1.4, 2.6, 1.4, lam(0xf2c230), -5, 6.6, 0)); // funnel
  g.add(box(1.5, 0.5, 1.5, lam(0x222222, false), -5, 8.0, 0));
  // Railings.
  for (const s of [1, -1]) g.add(box(L - 2, 0.12, 0.12, lam(0xffffff, false), 0, 2.3, s * (W / 2 - 0.2)));
  const side = sideText('S.S. PROBABLY FINE', 9, 0.8, 'transparent', '#ffffff');
  side.position.set(1, 0.3, W / 2 + 0.03);
  g.add(side);
  return { group: g, half: new THREE.Vector3(L / 2 + 1.5, 2.5, W / 2), door: new THREE.Vector3(3, 1.4, W / 2 + 1.6), spinners, label: 'boat' };
}

export function makeVehicle(kind: TravelKind): VehicleModel {
  if (kind === 'bus') return makeBus();
  if (kind === 'train') return makeTrain();
  if (kind === 'plane') return makePlane();
  return makeBoat();
}
