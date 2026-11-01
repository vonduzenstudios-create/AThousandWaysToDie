import * as THREE from 'three';
import type { PartName } from '../character';
import { paintArm, paintHeld, paintLeg, paintTorso, type Dims } from './body';
import { VOXEL, VoxelGrid, charMaterial } from './grid';
import { HD, HH, HW, paintGlasses, paintHat, paintHead, paintHeadExtras } from './head';
import type { Expression, PersonSpec } from './spec';

/** Same shape as Character's parts, so ragdoll.ts can use them unchanged. */
export interface VoxelPart {
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  /** Size of the collision box in world units (details like hat brims and shoe toes stick out of it). */
  size: THREE.Vector3;
}

export interface VoxelBody {
  /** Group with feet at y = 0, facing +z. Holds one pivot per part. */
  body: THREE.Group;
  parts: Record<PartName, VoxelPart>;
  /** Hats, glasses, held items. Children of part meshes; pop them off for comedy. */
  accessories: THREE.Mesh[];
  /** One shared material per person, so tint/flash affect just this person. White, multiplied by vertex colors. */
  material: THREE.MeshLambertMaterial;
  /** Height of the top of the head (without hat), in world units. */
  headTop: number;
  /** Height of the hip joints (top of the legs), in world units. */
  hip: number;
  /**
   * Elbow and knee hinges inside the arm and leg meshes. Rotate on x: a negative elbow angle
   * brings the forearm forward, a positive knee angle folds the shin back.
   */
  joints: { elbowL: THREE.Group; elbowR: THREE.Group; kneeL: THREE.Group; kneeR: THREE.Group };
  /** Swap the face (eyes etc.) by rebuilding just the head mesh. */
  setExpression(e: Expression): void;
  dispose(): void;
}

/**
 * Part sizes in voxels. Proportions follow the reference renders: a head a little under a quarter
 * of the height, long legs (about 45%), chunky hands and boots. Kids keep a nearly adult head on a
 * small body, which is what makes them read as kids.
 */
export function dims(s: PersonSpec): Dims {
  const age = s.age;
  const child = age === 'child', teen = age === 'teen', elder = age === 'elder';
  const b = s.build;
  // Stature stretches the legs (and a little of the torso) under the same head.
  const st = child ? 0 : s.stature === 'tall' ? 3 : s.stature === 'short' ? -3 : 0;
  const torsoW = child ? (b === 'heavy' ? 14 : 12) : b === 'slim' ? 14 : b === 'heavy' || b === 'buff' ? 18 : 16;
  const torsoD = child ? 8 : b === 'heavy' ? 11 : b === 'slim' ? 8 : b === 'buff' ? 10 : 9;
  const torsoH = (child ? 13 : teen ? 17 : elder ? 18 : 19) + Math.round(st / 3);
  const legH = (child ? 17 : teen ? 27 : elder ? 28 : 30) + st - Math.round(st / 3);
  const legW = child ? (b === 'heavy' ? 6 : 5) : b === 'slim' ? 6 : b === 'heavy' || b === 'buff' ? 8 : 7;
  const armW = child ? 4 : b === 'buff' ? 6 : b === 'slim' ? 4 : 5;
  const armH = (child ? 18 : teen ? 26 : elder ? 27 : 28) + Math.round(st / 2);
  return {
    head: [HW, HH, HD] as const,
    torso: [torsoW, torsoH, torsoD] as const,
    arm: [armW, armH, armW] as const,
    leg: [legW, legH, legW] as const,
    neck: 2,
    scale: child ? 0.92 : 1,
  };
}

// ---------------------------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------------------------

/**
 * Build a detailed voxel person. Every part is its own mesh on its own pivot, laid out exactly
 * like Character's box parts: legs hang from the hips, arms from the shoulders, the head sits on
 * the neck, and each part's mesh is centered on its collision box so ragdolls can use it directly.
 */
export function buildVoxelBody(s: PersonSpec): VoxelBody {
  const d = dims(s);
  const V = VOXEL * d.scale;
  const material = charMaterial(V);
  const body = new THREE.Group();
  const parts = {} as Record<PartName, VoxelPart>;
  const accessories: THREE.Mesh[] = [];
  const [tW, tH] = d.torso;
  const [lW, lH] = d.leg;
  const [aW, aH] = d.arm;
  const [hW, hH, hD] = d.head;

  // Meshes are centered on their collision box. The geometry origin has to be a whole voxel (the
  // shader hashes voxel cells for its color noise), so odd sizes nudge the mesh by half a voxel.
  const geo = (g: VoxelGrid, sz: readonly [number, number, number]) => {
    const o: [number, number, number] = [Math.floor(sz[0] / 2), Math.floor(sz[1] / 2), Math.floor(sz[2] / 2)];
    return { geometry: g.toGeometry(o, V), nudge: new THREE.Vector3((sz[0] / 2 - o[0]) * V, (sz[1] / 2 - o[1]) * V, (sz[2] / 2 - o[2]) * V) };
  };
  const mesh = (g: VoxelGrid, sz: readonly [number, number, number]) => {
    const { geometry, nudge } = geo(g, sz);
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    m.receiveShadow = true;
    m.geometry.translate(-nudge.x, -nudge.y, -nudge.z);
    return m;
  };
  const add = (name: PartName, g: VoxelGrid, sz: readonly [number, number, number], pivotAt: [number, number, number], centerFromPivot: [number, number, number]) => {
    const pivot = new THREE.Group();
    pivot.position.set(pivotAt[0] * V, pivotAt[1] * V, pivotAt[2] * V);
    const m = mesh(g, sz);
    m.position.set(centerFromPivot[0] * V, centerFromPivot[1] * V, centerFromPivot[2] * V);
    pivot.add(m);
    body.add(pivot);
    parts[name] = { pivot, mesh: m, size: new THREE.Vector3(sz[0] * V, sz[1] * V, sz[2] * V) };
    return m;
  };
  const attach = (to: THREE.Mesh, g: VoxelGrid, sz: readonly [number, number, number]) => {
    if (!g.size) return;
    const m = mesh(g, sz);
    m.castShadow = false; // a brim shadow over the whole face looks muddy at this scale
    to.add(m);
    accessories.push(m);
  };

  // A limb mesh with a hinge: voxels below `at` go in a child mesh on a hinge group, so the lower
  // half can bend while the whole limb is still one part for the rig and the ragdoll.
  const hinge = (upper: THREE.Mesh, g: VoxelGrid, sz: readonly [number, number, number], at: number) => {
    const lower = g.split((_x, y) => y < at);
    const j = new THREE.Group();
    const local = new THREE.Vector3(0, (at - sz[1] / 2) * V, 0);
    j.position.copy(local);
    upper.add(j);
    const m = mesh(lower, sz);
    m.position.copy(local).negate();
    j.add(m);
    return { joint: j, lower: m };
  };
  const joints = {} as VoxelBody['joints'];

  // Legs hang from the hips with a one-voxel gap between them.
  const legX = lW / 2 + 0.5;
  const knee = Math.round(lH * 0.5);
  for (const [name, side] of [['legL', 1], ['legR', -1]] as const) {
    const g = new VoxelGrid(0.035, s.seed + (side > 0 ? 1 : 2));
    paintLeg(g, s, d, side);
    const shin = g.split((_x, y) => y < knee);
    const m = add(name, g, d.leg, [side * legX, lH, 0], [0, -lH / 2, 0]);
    joints[side > 0 ? 'kneeL' : 'kneeR'] = hinge(m, shin, d.leg, knee).joint;
  }

  // Torso (with the neck on top and any skirt or coat tails hanging below).
  const tg = new VoxelGrid(0.03, s.seed + 3);
  paintTorso(tg, s, d);
  add('torso', tg, d.torso, [0, lH, 0], [0, tH / 2, 0]);

  // Head, with hat, glasses and head extras as separate meshes in the same coordinates. Anything
  // they cover is cut out of the head so the two never z-fight.
  const neckY = lH + tH + d.neck;
  const hat = new VoxelGrid(0.05, s.seed + 5);
  paintHat(hat, s);
  const glasses = new VoxelGrid(0.01, s.seed + 6);
  paintGlasses(glasses, s);
  paintHeadExtras(glasses, s);
  const headGrid = (e: Expression) => {
    const g = new VoxelGrid(0.025, s.seed + 4);
    paintHead(g, s, e);
    hat.forEach((x, y, z) => g.set(x, y, z, null));
    // Hair under a full hat is squashed flat: drop the outer hair layer above the brim line.
    if (hat.size && !['bow', 'tiara', 'headMirror', 'party', 'visor'].includes(s.hat))
      g.forEach((x, y, z) => {
        if (y >= 14 && (y >= hH || x < 0 || x >= hW || z < 0 || z >= hD)) g.set(x, y, z, null);
      });
    glasses.forEach((x, y, z) => g.set(x, y, z, null));
    return g;
  };
  const head = add('head', headGrid(s.expression), d.head, [0, neckY, 0], [0, hH / 2, 0]);
  attach(head, hat, d.head);
  attach(head, glasses, d.head);

  // Arms hang from the shoulders with a sliver of air between them and the body.
  const armX = tW / 2 + aW / 2 + 0.5;
  const elbow = Math.round(aH * 0.52);
  for (const [name, side] of [['armL', 1], ['armR', -1]] as const) {
    const g = new VoxelGrid(0.03, s.seed + (side > 0 ? 7 : 8));
    paintArm(g, s, d, side);
    const fore = g.split((_x, y) => y < elbow);
    const m = add(name, g, d.arm, [side * armX, neckY - d.neck - 1, 0], [0, -aH / 2 + 1, 0]);
    const h = hinge(m, fore, d.arm, elbow);
    joints[side > 0 ? 'elbowL' : 'elbowR'] = h.joint;
    if (side < 0) {
      const held = new VoxelGrid(0.04, s.seed + 9);
      if (paintHeld(held, s, d)) attach(h.lower, held, d.arm);
    }
  }

  const headMesh = parts.head.mesh;
  return {
    body,
    parts,
    accessories,
    material,
    headTop: (neckY + hH) * V,
    hip: lH * V,
    joints,
    setExpression(e: Expression) {
      s.expression = e;
      headMesh.geometry.dispose();
      headMesh.geometry = mesh(headGrid(e), [hW, hH, hD]).geometry;
    },
    dispose() {
      body.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const p of Object.values(parts)) p.mesh.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      material.dispose();
    },
  };
}
