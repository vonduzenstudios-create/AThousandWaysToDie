import * as THREE from 'three';
import { RAPIER, G_PROP, G_RAGDOLL, G_WORLD, groups } from './physics';
import { Character, PART_NAMES, type PartName } from './character';

interface RagPart {
  body: RAPIER.RigidBody;
  mesh: THREE.Mesh;
}

/** Turns a Character's box parts into jointed physics bodies. Comedy lives here. */
export class Ragdoll {
  readonly parts = {} as Record<PartName, RagPart>;
  readonly joints: RAPIER.ImpulseJoint[] = [];
  readonly startPos = new THREE.Vector3();

  constructor(
    private physics: RAPIER.World,
    private scene: THREE.Scene,
    readonly character: Character,
    vel: THREE.Vector3,
    spin = 6,
    bounciness = 0.45,
  ) {
    character.root.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pivots: Record<string, THREE.Vector3> = {};

    for (const name of PART_NAMES) {
      const part = character.parts[name];
      part.mesh.getWorldPosition(p);
      part.mesh.getWorldQuaternion(q);
      part.mesh.getWorldScale(s);
      pivots[name] = part.pivot.getWorldPosition(new THREE.Vector3());
      const half = part.size.clone().multiply(s).multiplyScalar(0.5);
      const rnd = () => (Math.random() - 0.5) * 2;
      const bd = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinvel(vel.x + rnd() * 1.5, vel.y + rnd() * 1.5, vel.z + rnd() * 1.5)
        .setAngvel({ x: rnd() * spin, y: rnd() * spin, z: rnd() * spin })
        .setLinearDamping(0.05)
        .setAngularDamping(0.4)
        .setCcdEnabled(true);
      const body = physics.createRigidBody(bd);
      const cd = RAPIER.ColliderDesc.cuboid(Math.max(half.x, 0.05), Math.max(half.y, 0.05), Math.max(half.z, 0.05))
        .setDensity(name === 'torso' ? 3 : 1.5)
        .setFriction(0.7)
        .setRestitution(bounciness)
        .setCollisionGroups(groups(G_RAGDOLL, G_WORLD | G_PROP));
      physics.createCollider(cd, body);
      this.scene.attach(part.mesh);
      this.parts[name] = { body, mesh: part.mesh };
    }
    this.startPos.copy(this.parts.torso.mesh.position);

    const torso = this.parts.torso.body;
    const toLocal = (body: RAPIER.RigidBody, world: THREE.Vector3) => {
      const t = body.translation();
      const r = body.rotation();
      const inv = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
      return world.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(inv);
    };
    for (const name of PART_NAMES) {
      if (name === 'torso') continue;
      const other = this.parts[name].body;
      const anchor = pivots[name];
      const a1 = toLocal(torso, anchor);
      const a2 = toLocal(other, anchor);
      const jd = RAPIER.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z });
      const j = physics.createImpulseJoint(jd, torso, other, true);
      j.setContactsEnabled(false);
      this.joints.push(j);
    }
  }

  get torso() {
    return this.parts.torso.body;
  }

  position(out = new THREE.Vector3()) {
    const t = this.torso.translation();
    return out.set(t.x, t.y, t.z);
  }

  /** Push every part (used by trains, explosions, etc). */
  impulse(v: THREE.Vector3) {
    for (const n of PART_NAMES) this.parts[n].body.applyImpulse({ x: v.x, y: v.y, z: v.z }, true);
  }

  setVelocity(v: THREE.Vector3) {
    for (const n of PART_NAMES) this.parts[n].body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
  }

  update() {
    for (const n of PART_NAMES) {
      const { body, mesh } = this.parts[n];
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  dispose() {
    for (const j of this.joints) this.physics.removeImpulseJoint(j, false);
    for (const n of PART_NAMES) {
      const { body, mesh } = this.parts[n];
      this.physics.removeRigidBody(body);
      this.scene.remove(mesh);
    }
    this.character.dispose();
  }
}
