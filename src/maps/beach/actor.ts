import * as THREE from 'three';
import { Character, randomAppearance, type Appearance } from '../../character';
import { mulberry32 } from '../../util';

/**
 * A scripted person the beach drives directly: lifeguards, the volleyball pro, the
 * boat guy, kids, cruise passengers. Ambient townsfolk come from the life system;
 * actors are the people a death puzzle needs to be in exactly the right place.
 */
export class Actor {
  readonly character: Character;
  readonly pos = new THREE.Vector3();
  facing = 0;
  speed = 3;
  target: THREE.Vector3 | null = null;
  pose: 'stand' | 'walk' | 'sit' | 'swim' | 'cheer' | 'lean' | 'lie' = 'stand';
  bubble = '';
  private t = 0;

  constructor(
    readonly scene: THREE.Object3D,
    readonly name: string,
    seed: number,
    tweak: Partial<Appearance> = {},
    scale = 1,
  ) {
    const app = { ...randomAppearance(mulberry32(seed)), ...tweak };
    this.character = new Character(app);
    this.character.root.scale.setScalar(app.height * scale);
    scene.add(this.character.root);
  }

  place(p: THREE.Vector3, facing = this.facing) {
    this.pos.copy(p);
    this.facing = facing;
    this.target = null;
  }

  goto(p: THREE.Vector3, speed = this.speed) {
    this.target = p.clone();
    this.speed = speed;
  }

  get arrived() {
    return this.target === null;
  }

  faceToward(p: THREE.Vector3) {
    this.facing = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  update(dt: number) {
    this.t += dt;
    let speed = 0;
    if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) {
        this.pos.x = this.target.x;
        this.pos.z = this.target.z;
        this.target = null;
      } else {
        const step = Math.min(d, this.speed * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.pos.y += (this.target.y - this.pos.y) * Math.min(1, dt * 4);
        this.facing = Math.atan2(dx, dz);
        speed = this.speed;
      }
    }
    const ch = this.character;
    ch.root.position.copy(this.pos);
    ch.root.rotation.y = this.facing;
    const state = this.pose === 'swim' ? 'swim' : this.pose === 'sit' ? 'tube' : 'ground';
    ch.animate(dt, { speed: this.pose === 'swim' ? 2 : speed, grounded: true, state, stateTime: 0, airTime: 0 });
    const p = ch.parts;
    if (this.pose === 'cheer') {
      p.armL.pivot.rotation.x = -2.8 + Math.sin(this.t * 10) * 0.3;
      p.armR.pivot.rotation.x = -2.8 - Math.sin(this.t * 10) * 0.3;
    } else if (this.pose === 'lean') {
      ch.spinner.rotation.x = 0.9 + Math.sin(this.t * 3) * 0.1;
    } else if (this.pose === 'lie') {
      ch.spinner.rotation.x = -Math.PI / 2;
      ch.spinner.position.y = 0.25;
    }
  }

  dispose() {
    this.scene.remove(this.character.root);
    this.character.dispose();
  }
}
