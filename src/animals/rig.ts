import * as THREE from 'three';
import { charMaterial } from '../chars/grid';
import { Sculpt } from './sculpt';

/**
 * An animal model. Every model faces +z, stands with its feet at y = 0, and exposes named pivots
 * the animation and death code swing.
 */
export interface Rig {
  root: THREE.Group;
  /** Rotates with walking (x axis). Front legs first: front-left, front-right, back-left, back-right. */
  legs: THREE.Object3D[];
  /** Knee/hock hinges inside each leg (same order as legs). Positive x folds the lower leg back. */
  knees?: THREE.Object3D[];
  head?: THREE.Object3D;
  jaw?: THREE.Object3D;
  tail?: THREE.Object3D;
  wings?: THREE.Object3D[];
  trunk?: THREE.Object3D;
  /** Ears that flick (z axis). */
  ears?: THREE.Object3D[];
  /** Height of the back, used for riders and mood icons. */
  top: number;
  /** Half length, used for collisions. */
  len: number;
}

const mats = new Map<number, THREE.MeshLambertMaterial>();
/** One shared vertex-colored material per voxel size (the shader adds per-voxel brightness noise). */
export function animalMaterial(size: number) {
  let m = mats.get(size);
  if (!m) {
    m = charMaterial(size);
    mats.set(size, m);
  }
  return m;
}

/**
 * Builds an animal out of voxel parts. Each part is a Sculpt grid in voxel units, drawn relative to
 * its own pivot, so a leg grid hangs down from its hip at (0, 0, 0). Call done() to mesh them all.
 */
export class Rigger {
  readonly root = new THREE.Group();
  private parts: { pivot: THREE.Group; grid: Sculpt }[] = [];

  /** `s` is the world size of one voxel. */
  constructor(readonly s: number, readonly material: THREE.Material = animalMaterial(s)) {}

  /** A new pivot at voxel position (x, y, z) in `parent`'s frame, with an empty grid to draw in. */
  part(parent: THREE.Object3D | null, x: number, y: number, z: number, name?: string): { p: THREE.Group; g: Sculpt } {
    const pivot = new THREE.Group();
    pivot.position.set(x * this.s, y * this.s, z * this.s);
    if (name) pivot.name = name;
    (parent ?? this.root).add(pivot);
    const grid = new Sculpt(0.06);
    this.parts.push({ pivot, grid });
    return { p: pivot, g: grid };
  }

  /** Mesh every grid and hang it on its pivot. */
  done() {
    for (const { pivot, grid } of this.parts) {
      if (!grid.size) continue;
      const mesh = new THREE.Mesh(grid.toGeometry([0, 0, 0], this.s), this.material);
      // Voxel (0,0,0)'s center sits exactly on the pivot.
      mesh.position.set(-this.s / 2, -this.s / 2, -this.s / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pivot.add(mesh);
    }
    this.parts = [];
    return this.root;
  }
}

// ---------------------------------------------------------------------------------------------
// Template cache: every species is meshed once, and each animal is a clone sharing geometry.
// ---------------------------------------------------------------------------------------------

const templates = new Map<string, Rig>();

function cloneRig(t: Rig): Rig {
  const root = t.root.clone(true);
  const map = new Map<THREE.Object3D, THREE.Object3D>();
  const walk = (a: THREE.Object3D, b: THREE.Object3D) => {
    map.set(a, b);
    a.children.forEach((c, i) => walk(c, b.children[i]));
  };
  walk(t.root, root);
  const m = <T extends THREE.Object3D | undefined>(o: T) => (o ? map.get(o) : undefined) as T;
  return {
    root: root as THREE.Group,
    legs: t.legs.map((l) => map.get(l)!),
    knees: t.knees?.map((k) => map.get(k)!),
    head: m(t.head),
    jaw: m(t.jaw),
    tail: m(t.tail),
    wings: t.wings?.map((w) => map.get(w)!),
    trunk: m(t.trunk),
    ears: t.ears?.map((e) => map.get(e)!),
    top: t.top,
    len: t.len,
  };
}

/** Build a species once, then hand out clones that share its geometry. */
export function cached(key: string, build: () => Rig): Rig {
  let t = templates.get(key);
  if (!t) {
    t = build();
    templates.set(key, t);
  }
  return cloneRig(t);
}

/** Same as cached() for plain groups (fish, crabs) where pivots are found by name. */
const groupTemplates = new Map<string, THREE.Group>();
export function cachedGroup(key: string, build: () => THREE.Group): THREE.Group {
  let t = groupTemplates.get(key);
  if (!t) {
    t = build();
    groupTemplates.set(key, t);
  }
  return t.clone(true);
}

/**
 * The shared walk cycle: legs swing in diagonal pairs and the lower legs fold back while each
 * foot swings forward, so strides read as steps instead of pendulums. `phase` advances with speed.
 */
export function walkCycle(r: Rig, phase: number, amp: number, k = 1) {
  r.legs.forEach((l, i) => {
    const s = i === 0 || i === 3 ? 1 : -1;
    l.rotation.x += (Math.sin(phase) * amp * s - l.rotation.x) * k;
    const knee = r.knees?.[i];
    if (knee) {
      const lift = Math.max(0, -Math.cos(phase) * s) * amp * 1.4;
      knee.rotation.x += (lift - knee.rotation.x) * k;
    }
  });
}
