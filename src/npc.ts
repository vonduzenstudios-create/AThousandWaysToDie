import * as THREE from 'three';
import { Character, randomAppearance, type Appearance } from './character';
import { randomFile, type Job, type PersonFile } from './deaths';
import { G, type Box } from './town';
import type { VoxelWorld } from './voxel';
import type { Rng } from './util';

/** A townsperson who wanders around until Gary decides they're next. */
export class Npc {
  readonly character: Character;
  readonly file: PersonFile;
  readonly app: Appearance;
  readonly pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private facing = 0;
  private pause = 0;
  private speed: number;
  private helpTarget: THREE.Vector3 | null = null;
  private onArrive: (() => void) | null = null;

  /** Run toward someone screaming for help. */
  summon(target: THREE.Vector3, onArrive: () => void) {
    this.helpTarget = target.clone();
    this.helpTarget.y = G;
    this.onArrive = onArrive;
    this.pause = 0;
  }

  get helping() {
    return this.helpTarget !== null;
  }

  constructor(scene: THREE.Scene, private world: VoxelWorld, private area: Box, private rng: Rng, job?: Job) {
    this.app = randomAppearance(rng);
    this.file = randomFile(rng, job);
    this.character = new Character(this.app);
    this.speed = 1.6 + rng() * 1.4;
    this.pos.copy(this.randomPoint());
    this.target.copy(this.pos);
    scene.add(this.character.root);
  }

  private walkable(x: number, z: number) {
    return this.world.topY(x, z) === G;
  }

  private randomPoint(): THREE.Vector3 {
    for (let i = 0; i < 40; i++) {
      const x = this.area.min.x + this.rng() * (this.area.max.x - this.area.min.x);
      const z = this.area.min.z + this.rng() * (this.area.max.z - this.area.min.z);
      if (this.walkable(x, z)) return new THREE.Vector3(x, G, z);
    }
    return new THREE.Vector3((this.area.min.x + this.area.max.x) / 2, G, (this.area.min.z + this.area.max.z) / 2);
  }

  private clearPath(a: THREE.Vector3, b: THREE.Vector3) {
    const d = a.distanceTo(b);
    for (let t = 0; t <= d; t += 0.5) {
      const p = a.clone().lerp(b, t / d);
      if (!this.walkable(p.x, p.z)) return false;
    }
    return true;
  }

  update(dt: number) {
    if (this.helpTarget) {
      const to = this.helpTarget.clone().sub(this.pos);
      to.y = 0;
      const d = to.length();
      if (d < 1.8) {
        const cb = this.onArrive;
        this.helpTarget = null;
        this.onArrive = null;
        this.target.copy(this.pos);
        this.pause = 6;
        cb?.();
      } else {
        to.normalize();
        this.pos.addScaledVector(to, Math.min(d, 5 * dt));
        this.facing = Math.atan2(to.x, to.z);
      }
      this.character.root.position.copy(this.pos);
      this.character.root.rotation.y = this.facing;
      this.character.animate(dt, { speed: 5, grounded: true, state: 'ground', stateTime: 0, airTime: 0 });
      return;
    }
    const toT = this.target.clone().sub(this.pos);
    toT.y = 0;
    const dist = toT.length();
    let speed = 0;
    if (this.pause > 0) {
      this.pause -= dt;
    } else if (dist < 0.3) {
      this.pause = 1 + this.rng() * 4;
      for (let i = 0; i < 8; i++) {
        const p = this.randomPoint();
        if (this.clearPath(this.pos, p)) {
          this.target.copy(p);
          break;
        }
      }
    } else {
      speed = this.speed;
      toT.normalize();
      this.pos.addScaledVector(toT, Math.min(dist, speed * dt));
      const want = Math.atan2(toT.x, toT.z);
      let dd = want - this.facing;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      this.facing += dd * Math.min(1, dt * 6);
    }
    this.character.root.position.copy(this.pos);
    this.character.root.rotation.y = this.facing;
    this.character.animate(dt, { speed, grounded: true, state: 'ground', stateTime: 0, airTime: 0 });
  }

  headPos() {
    return this.pos.clone().add(new THREE.Vector3(0, 2.2 * this.app.height, 0));
  }

  remove(scene: THREE.Scene) {
    scene.remove(this.character.root);
    this.character.dispose();
  }
}
