import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from './physics';
import { B, type VoxelWorld } from './voxel';
import { G, type Box } from './town';
import { canvasTexture, money } from './util';
import type { Interactable } from './props';
import type { PersonFile } from './deaths';

/** Daily ATM limit, by job. Bankers know a guy. */
export function atmLimit(f: PersonFile) {
  return f.job === 'Banker' ? 5000 : 500;
}

export interface AtmResult {
  ok: boolean;
  amount: number;
  title: string;
  sub: string;
}

/** Withdraw from the possessed body's card. Mutates the wallet; the caller pays Gary. */
export function withdraw(f: PersonFile, withdrawnToday: number): AtmResult {
  const w = f.wallet;
  const card = `${w.bank} ****${w.last4}`;
  if (w.balance <= 0) {
    return {
      ok: false,
      amount: 0,
      title: 'INSUFFICIENT FUNDS',
      sub: w.balance < 0 ? `${card} is overdrawn by ${money(-w.balance)}. Also, a $35 fee.` : `${card} has exactly $0. Respect.`,
    };
  }
  const left = atmLimit(f) - withdrawnToday;
  if (left <= 0) return { ok: false, amount: 0, title: 'DAILY LIMIT REACHED', sub: `The machine thinks ${f.name.split(' ')[0]} has a gambling problem.` };
  const amount = Math.min(w.balance, left);
  w.balance -= amount;
  return { ok: true, amount, title: `+${money(amount)} WITHDRAWN`, sub: `PIN ${w.pin} (you can just tell). ${card} now has ${money(w.balance)}.` };
}

function atmMesh() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x5d6a78 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23282f });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  box(1.2, 2.2, 0.8, body, 0, 1.1, 0);
  box(1.3, 0.3, 0.9, new THREE.MeshLambertMaterial({ color: 0x2e7d4f }), 0, 2.35, 0);
  const screen = canvasTexture(128, 96, (c) => {
    c.fillStyle = '#0d3b2a';
    c.fillRect(0, 0, 128, 96);
    c.fillStyle = '#5dff9e';
    c.font = 'bold 34px monospace';
    c.textAlign = 'center';
    c.fillText('ATM', 64, 44);
    c.font = '14px monospace';
    c.fillText('INSERT SOUL', 64, 74);
  });
  const scr = box(0.8, 0.6, 0.05, new THREE.MeshBasicMaterial({ map: screen }), 0, 1.6, 0.42);
  scr.castShadow = false;
  box(0.6, 0.35, 0.12, dark, 0, 1.05, 0.42); // keypad
  box(0.5, 0.06, 0.1, dark, 0, 0.7, 0.42); // cash slot
  return g;
}

/**
 * ATMs placed on sidewalk cells, found by scanning the voxel world so they survive
 * map rewrites. Each one pushes an `atm:N` interactable.
 */
export class Atms {
  readonly spots: { pos: THREE.Vector3; facing: number }[] = [];

  constructor(scene: THREE.Scene, physics: RAPIER.World, world: VoxelWorld, near: Box, interactables: Interactable[], count = 3) {
    const cx = (near.min.x + near.max.x) / 2, cz = (near.min.z + near.max.z) / 2;
    const cands: { x: number; z: number; d: number; facing: number }[] = [];
    const isSide = (x: number, z: number) => world.get(x, G - 1, z) === B.Sidewalk && world.get(x, G, z) === B.Air && world.get(x, G + 1, z) === B.Air && world.get(x, G + 2, z) === B.Air;
    for (let x = 2; x < world.sx - 2; x++)
      for (let z = 2; z < world.sz - 2; z++) {
        if (!isSide(x, z)) continue;
        // Outer edge of a two-wide sidewalk: the machine backs onto the grass and its
        // screen faces the road, so you use it standing on the inner sidewalk cell.
        const road = (b: number) => b === B.Asphalt || b === B.Yellow;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const inner = world.get(x + dx, G - 1, z + dz) === B.Sidewalk;
          const roadBeyond = road(world.get(x + 2 * dx, G - 1, z + 2 * dz));
          const back = world.get(x - dx, G - 1, z - dz);
          if (!inner || !roadBeyond || back === B.Sidewalk || road(back)) continue;
          cands.push({ x, z, d: Math.hypot(x - cx, z - cz), facing: Math.atan2(dx, dz) });
          break;
        }
      }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands) {
      if (this.spots.length >= count) break;
      // Keep away from intersections and from each other.
      if (this.spots.some((s) => Math.hypot(s.pos.x - c.x, s.pos.z - c.z) < 22)) continue;
      if (c.d < 9) continue;
      const pos = new THREE.Vector3(c.x + 0.5, G, c.z + 0.5);
      this.spots.push({ pos, facing: c.facing });
    }
    const fixed = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.spots.forEach((s, i) => {
      const m = atmMesh();
      m.position.copy(s.pos);
      m.rotation.y = s.facing;
      scene.add(m);
      physics.createCollider(
        RAPIER.ColliderDesc.cuboid(0.6, 1.25, 0.4)
          .setTranslation(s.pos.x, G + 1.25, s.pos.z)
          .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.facing))
          .setCollisionGroups(groups(G_WORLD, G_ALL)),
        fixed,
      );
      const front = new THREE.Vector3(Math.sin(s.facing), 0, Math.cos(s.facing)).multiplyScalar(1.2).add(s.pos);
      interactables.push({ id: `atm:${i}`, pos: front, radius: 2.2, prompt: 'Use the ATM', mesh: m, enabled: true });
    });
  }
}
