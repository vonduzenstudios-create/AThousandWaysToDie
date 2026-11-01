import * as THREE from 'three';
import { noiseTexture, pick, type Rng } from '../util';

/** Body center height above the road when resting on its wheels. */
export const RIDE = 1.1;
export const HALF = new THREE.Vector3(1.25, 0.55, 2.6);
export const WHEEL_R = 0.45;
/** Wheel mount points relative to the body center: front-left, front-right, rear-left, rear-right. */
export const WHEELS = [
  new THREE.Vector3(1.12, -0.25, 1.65),
  new THREE.Vector3(-1.12, -0.25, 1.65),
  new THREE.Vector3(1.12, -0.25, -1.65),
  new THREE.Vector3(-1.12, -0.25, -1.65),
];
/** Driver sits on the left (+x when facing +z), cars drive on the right. */
export const SEAT = new THREE.Vector3(0.55, -0.2, 0.05);
/** Where someone stands when they get out of the driver's door. */
export const DOOR_OUT = new THREE.Vector3(2.3, -RIDE, 0.2);

export type CarKind = 'sedan' | 'hatch' | 'pickup' | 'van' | 'taxi' | 'muscle';

const PAINT = [0xd8443a, 0x3a6fd8, 0x3aa65a, 0xe0b030, 0xeeeeee, 0x2a2a2a, 0x8a4ad8, 0xf07a2a, 0x2ab0b0, 0x9aa3ad, 0x7a2a2a, 0x6b8e23];

export interface CarModel {
  root: THREE.Group;
  kind: CarKind;
  paint: number;
  /** Steer pivots for the front wheels, spin pivots for all four. */
  wheelSteer: THREE.Group[];
  wheelSpin: THREE.Object3D[];
  door: THREE.Group;
  brakeLights: THREE.MeshLambertMaterial;
  headLights: THREE.MeshLambertMaterial;
  paintMat: THREE.MeshLambertMaterial;
  dispose(): void;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A chunky voxel-style car, built from boxes. Local +z is forward. */
export function buildCar(rng: Rng, kind?: CarKind): CarModel {
  kind ??= pick(rng, ['sedan', 'sedan', 'hatch', 'pickup', 'van', 'taxi', 'muscle'] as CarKind[]);
  const paint = kind === 'taxi' ? 0xf2c230 : pick(rng, PAINT);
  const noise = noiseTexture();
  const mats: THREE.Material[] = [];
  const lam = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, map: noise, ...extra });
    mats.push(m);
    return m;
  };
  const paintMat = lam(paint);
  const trim = lam(0x2a2a2e);
  const chrome = lam(0xc8ccd2);
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd6f0, transparent: true, opacity: 0.45, emissive: 0x112233 });
  mats.push(glass);
  const headLights = lam(0xfff6c8, { emissive: 0x555533 });
  const brakeLights = lam(0xb01818, { emissive: 0x200000 });
  const tire = lam(0x1a1a1a);
  const hub = lam(0xbfbfbf);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const H = HALF;

  // Lower body.
  box(H.x * 2, 0.75, H.z * 2, paintMat, 0, -0.18, 0, body);
  // Bumpers and skirts.
  box(H.x * 2 + 0.06, 0.25, 0.25, chrome, 0, -0.45, H.z + 0.05, body);
  box(H.x * 2 + 0.06, 0.25, 0.25, chrome, 0, -0.45, -H.z - 0.05, body);
  box(H.x * 2 + 0.04, 0.12, H.z * 2 - 0.4, trim, 0, -0.55, 0, body);
  // Lights.
  for (const x of [0.8, -0.8]) {
    box(0.45, 0.22, 0.08, headLights, x, -0.02, H.z + 0.02, body);
    box(0.45, 0.2, 0.08, brakeLights, x, -0.02, -H.z - 0.02, body);
  }
  // Grille.
  box(0.9, 0.22, 0.06, trim, 0, -0.05, H.z + 0.03, body);

  // Cabin by kind.
  const cabin = (len: number, z: number, h = 0.95, roofMat: THREE.Material = paintMat) => {
    const y0 = 0.2;
    // pillars
    for (const x of [H.x - 0.12, -H.x + 0.12])
      for (const zz of [z + len / 2 - 0.12, z - len / 2 + 0.12]) box(0.16, h, 0.16, paintMat, x, y0 + h / 2, zz, body);
    box(H.x * 2 - 0.1, 0.14, len, roofMat, 0, y0 + h + 0.07, z, body);
    // windshield, rear window and side windows
    box(H.x * 2 - 0.3, h - 0.1, 0.06, glass, 0, y0 + h / 2, z + len / 2 - 0.1, body);
    box(H.x * 2 - 0.3, h - 0.1, 0.06, glass, 0, y0 + h / 2, z - len / 2 + 0.1, body);
    box(0.05, h - 0.15, len - 0.35, glass, -H.x + 0.1, y0 + h / 2, z, body);
  };
  if (kind === 'sedan' || kind === 'taxi') cabin(2.6, -0.3);
  else if (kind === 'hatch') cabin(3.0, -0.7);
  else if (kind === 'muscle') {
    cabin(2.2, -0.5, 0.75);
    box(0.5, 0.18, 1.6, trim, 0, 0.26, 1.5, body); // hood scoop
    box(H.x * 2, 0.1, 0.5, trim, 0, 0.35, -H.z + 0.3, body); // spoiler
  } else if (kind === 'pickup') {
    cabin(1.8, 0.2, 1.0);
    // Bed walls.
    box(0.15, 0.5, 2.1, paintMat, H.x - 0.08, 0.45, -1.45, body);
    box(0.15, 0.5, 2.1, paintMat, -H.x + 0.08, 0.45, -1.45, body);
    box(H.x * 2, 0.5, 0.15, paintMat, 0, 0.45, -H.z + 0.08, body);
  } else if (kind === 'van') {
    cabin(4.0, -0.4, 1.25);
    box(H.x * 2 - 0.02, 1.0, 2.6, paintMat, 0, 0.75, -1.1, body); // solid cargo walls
  }
  if (kind === 'taxi') {
    box(0.9, 0.3, 0.4, lam(0xffffff, { emissive: 0x333300 }), 0, 1.38, -0.3, body);
    box(H.x * 2 + 0.02, 0.18, 1.2, trim, 0, -0.05, -0.4, body); // checker stripe
  }

  // Driver door (left side, +x) on a hinge at its front edge so it can swing open.
  const door = new THREE.Group();
  door.position.set(H.x, 0, 1.0);
  box(0.08, 0.7, 1.6, paintMat, 0, -0.15, -0.8, door);
  box(0.05, kind === 'muscle' ? 0.6 : 0.8, 1.4, glass, 0, 0.62, -0.8, door);
  body.add(door);

  // Wheels.
  const wheelSteer: THREE.Group[] = [];
  const wheelSpin: THREE.Object3D[] = [];
  const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.36, 10);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.BoxGeometry(0.38, 0.3, 0.3);
  WHEELS.forEach((w, i) => {
    const steer = new THREE.Group();
    steer.position.set(w.x, w.y - 0.4, w.z);
    const spin = new THREE.Group();
    const t = new THREE.Mesh(tireGeo, tire);
    t.castShadow = true;
    spin.add(t);
    spin.add(new THREE.Mesh(hubGeo, hub));
    steer.add(spin);
    root.add(steer);
    wheelSteer.push(steer);
    wheelSpin.push(spin);
  });

  return {
    root,
    kind,
    paint,
    wheelSteer,
    wheelSpin,
    door,
    brakeLights,
    headLights,
    paintMat,
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry !== tireGeo && o.geometry !== hubGeo) o.geometry.dispose();
      });
      tireGeo.dispose();
      hubGeo.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
