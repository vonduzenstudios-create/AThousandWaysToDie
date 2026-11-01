import * as THREE from 'three';
import { Character, randomAppearance, type Appearance } from '../character';
import type { Rng } from '../util';

/**
 * A scripted set-piece person inside a place (cashier, sample lady, stock boy). Actors are
 * not possessable townspeople: they stand at their post, walk short routes when sent
 * somewhere, and get in the way of deaths. They live in local place coordinates, so add
 * `root` to the place's frame group.
 */
export class Actor {
  readonly ch: Character;
  readonly pos = new THREE.Vector3();
  facing = 0;
  speed = 3;
  /** Where they go back to when idle. */
  readonly home = new THREE.Vector3();
  homeFacing = 0;
  private path: THREE.Vector3[] = [];
  private onArrive: (() => void) | null = null;
  private wait = 0;
  private bob = 0;
  /** True while they are off on an errand, away from their post. */
  away = false;
  /** Held item mesh, if any. */
  held: THREE.Object3D | null = null;

  constructor(
    readonly name: string,
    rng: Rng,
    at: THREE.Vector3,
    facing: number,
    look: Partial<Appearance> = {},
  ) {
    this.ch = new Character({ ...randomAppearance(rng), ...look });
    this.pos.copy(at);
    this.home.copy(at);
    this.facing = facing;
    this.homeFacing = facing;
    this.bob = rng() * 10;
  }

  get root() {
    return this.ch.root;
  }

  get moving() {
    return this.path.length > 0;
  }

  /** Walk through points (local), then call back. */
  walk(points: THREE.Vector3[], onArrive?: () => void) {
    this.path = points.map((p) => p.clone());
    this.onArrive = onArrive ?? null;
    this.wait = 0;
  }

  /** Walk away along `there`, stay `secs`, come back along the same points reversed. */
  errand(there: THREE.Vector3[], secs: number, onBack?: () => void) {
    this.away = true;
    this.walk(there, () => {
      this.wait = secs;
      this.onArrive = () => {
        this.walk([...there].reverse().slice(1).concat([this.home]), () => {
          this.away = false;
          this.facing = this.homeFacing;
          onBack?.();
        });
      };
    });
  }

  goHome(then?: () => void) {
    this.walk([this.home], () => {
      this.facing = this.homeFacing;
      then?.();
    });
  }

  face(target: THREE.Vector3) {
    this.facing = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
  }

  update(dt: number) {
    let speed = 0;
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0 && this.onArrive) {
        const cb = this.onArrive;
        this.onArrive = null;
        cb();
      }
    } else if (this.path.length) {
      const t = this.path[0];
      const dx = t.x - this.pos.x;
      const dz = t.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        this.pos.x = t.x;
        this.pos.z = t.z;
        this.pos.y = t.y;
        this.path.shift();
        if (!this.path.length && this.onArrive) {
          const cb = this.onArrive;
          this.onArrive = null;
          cb();
        }
      } else {
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.pos.y += (t.y - this.pos.y) * Math.min(1, step / d);
        const want = Math.atan2(dx, dz);
        let dd = want - this.facing;
        while (dd > Math.PI) dd -= Math.PI * 2;
        while (dd < -Math.PI) dd += Math.PI * 2;
        this.facing += dd * Math.min(1, dt * 10);
        speed = this.speed;
      }
    }
    this.bob += dt;
    this.ch.root.position.copy(this.pos);
    this.ch.root.rotation.y = this.facing;
    this.ch.animate(dt, { speed, grounded: true, state: 'ground', stateTime: this.bob, airTime: 0 });
  }

  dispose() {
    this.ch.root.removeFromParent();
    this.ch.dispose();
  }
}
