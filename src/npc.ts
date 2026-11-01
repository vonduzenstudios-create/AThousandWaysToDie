import * as THREE from 'three';
import { Character, type Appearance } from './character';
import { randomFile, type Job, type PersonFile } from './deaths';
import type { NavGrid, PathPt } from './life/nav';
import type { Rng } from './util';

/** What an NPC is doing with their body this frame. The life system's brain sets it. */
export type Pose = 'stand' | 'walk' | 'run' | 'sit' | 'talk' | 'cheer' | 'cower';

/**
 * A townsperson's body: position, facing, walking along a path, and animation.
 * The decisions (where to go, who to talk to) live in src/life/resident.ts.
 *
 * Other systems can take the body over for a moment: set `controlled = true` (or
 * call `override()`), move `pos` / `facing` yourself, then `release()`. While
 * controlled, update() only keeps the mesh in sync and the life brain waits.
 */
export class Npc {
  readonly character: Character;
  readonly file: PersonFile;
  readonly app: Appearance;
  readonly pos = new THREE.Vector3();
  facing = 0;
  /** Walking speed in voxels per second. */
  speed: number;
  pose: Pose = 'stand';
  /** True while another system (combat, a death script) drives this body. */
  controlled = false;
  hp = 100;
  maxHp = 100;
  /** Hidden while inside a building, asleep, or away on a trip. */
  away = false;
  /** Set by the life system: the person's brain. */
  brain: { onReleased?(): void } | null = null;

  private path: PathPt[] = [];
  private faceTarget: number | null = null;
  private runMode = false;
  private bob = 0;
  private sitAmount = 0;
  private stuckT = 0;
  private lastDist = Infinity;
  /** Called when the current path finishes (or fails). */
  private onArrive: ((ok: boolean) => void) | null = null;
  /** Gentle push from neighbours so crowds don't stack. */
  readonly push = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private nav: NavGrid,
    rng: Rng,
    opts: {
      job?: string;
      file?: PersonFile;
      at?: { x: number; z: number };
      /** Edit the file (name, age...) before the body is built from it, so the look matches. */
      edit?: (f: PersonFile) => void;
    } = {},
  ) {
    this.file = opts.file ?? randomFile(rng, opts.job as Job | undefined);
    if (opts.job) this.file.job = opts.job as Job;
    opts.edit?.(this.file);
    this.character = Character.fromFile(this.file, Math.floor(rng() * 1e9));
    this.app = this.character.app;
    const feeble = this.file.physical === 'Feeble';
    this.speed = (feeble ? 1.1 : 1.7) + rng() * (feeble ? 0.5 : 1.1);
    if (opts.at) {
      this.pos.set(opts.at.x, nav.groundAt(opts.at.x, opts.at.z), opts.at.z);
    }
    this.facing = rng() * Math.PI * 2;
    scene.add(this.character.root);
  }

  // ------------------------------------------------------------ locomotion

  get moving() {
    return this.path.length > 0;
  }

  get destination(): PathPt | null {
    return this.path.length ? this.path[this.path.length - 1] : null;
  }

  /**
   * Walk to a point. Returns false if there's no way there (the callback also
   * fires with false). `run` makes them hurry.
   */
  walkTo(target: { x: number; z: number }, onArrive?: (ok: boolean) => void, run = false): boolean {
    const p = this.nav.find(this.pos, target);
    this.runMode = run;
    this.faceTarget = null;
    this.stuckT = 0;
    this.lastDist = Infinity;
    if (!p) {
      this.path = [];
      this.onArrive = null;
      onArrive?.(false);
      return false;
    }
    this.path = p;
    this.onArrive = onArrive ?? null;
    return true;
  }

  stop() {
    this.path = [];
    this.onArrive = null;
  }

  /** Turn to face a point (and keep facing it while standing). */
  lookAt(p: { x: number; z: number } | null) {
    this.faceTarget = p ? Math.atan2(p.x - this.pos.x, p.z - this.pos.z) : null;
  }

  /** Put the body somewhere instantly (spawning, stepping off a bus). */
  place(p: { x: number; z: number }, facing = this.facing) {
    this.pos.set(p.x, this.nav.groundAt(p.x, p.z), p.z);
    this.facing = facing;
    this.stop();
  }

  // ------------------------------------------------------------ external control

  /** Take over the body: pin it to a position/facing and pose. Call release() when done. */
  override(pos: { x: number; y?: number; z: number }, facing = this.facing, pose: Pose = 'stand') {
    this.controlled = true;
    this.pos.set(pos.x, pos.y ?? this.nav.groundAt(pos.x, pos.z), pos.z);
    this.facing = facing;
    this.pose = pose;
    this.stop();
  }

  /** Give the body back to the life system, which re-plans from where it now stands. */
  release() {
    if (!this.controlled) return;
    this.controlled = false;
    this.pose = 'stand';
    this.brain?.onReleased?.();
  }

  // ------------------------------------------------------------ legacy helpers used by game.ts

  private helpCb: (() => void) | null = null;

  /** Run toward someone screaming for help. */
  summon(target: THREE.Vector3, onArrive: () => void) {
    this.helpCb = onArrive;
    const t = this.nav.nearest(target, 6) ?? target;
    this.walkTo(
      { x: t.x + (Math.random() - 0.5) * 2, z: t.z + (Math.random() - 0.5) * 2 },
      () => {
        const cb = this.helpCb;
        this.helpCb = null;
        this.lookAt(target);
        cb?.();
      },
      true,
    );
  }

  get helping() {
    return this.helpCb !== null;
  }

  headPos() {
    return this.pos.clone().add(new THREE.Vector3(0, 2.2 * this.app.height, 0));
  }

  // ------------------------------------------------------------ per frame

  /**
   * Move along the path and animate. `lod` > 1 means far from the camera: skip
   * the animation work.
   */
  update(dt: number, lod = 1) {
    const root = this.character.root;
    root.visible = !this.away;
    if (this.controlled) {
      root.position.copy(this.pos);
      root.rotation.y = this.facing;
      return;
    }
    let speed = 0;
    if (this.path.length) {
      const next = this.path[0];
      const dx = next.x - this.pos.x, dz = next.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const sp = this.speed * (this.runMode ? 2.3 : 1);
      if (d < 0.15) {
        this.path.shift();
        if (!this.path.length) {
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.(true);
        }
      } else {
        const stepLen = Math.min(d, sp * dt);
        this.pos.x += (dx / d) * stepLen;
        this.pos.z += (dz / d) * stepLen;
        speed = sp;
        this.turn(Math.atan2(dx, dz), dt * 8);
        // Unstick if blocked forever (shouldn't happen, but crowds are crowds).
        const total = Math.hypot(this.path[this.path.length - 1].x - this.pos.x, this.path[this.path.length - 1].z - this.pos.z);
        if (total < this.lastDist - 0.05) {
          this.lastDist = total;
          this.stuckT = 0;
        } else if ((this.stuckT += dt) > 4) {
          const end = this.path[this.path.length - 1];
          const cb = this.onArrive;
          this.place(end);
          cb?.(true);
        }
      }
    } else if (this.faceTarget !== null) {
      this.turn(this.faceTarget, dt * 5);
    }
    // Separation push (only when walkable).
    if (this.push.lengthSq() > 0) {
      const nx = this.pos.x + this.push.x * dt, nz = this.pos.z + this.push.z * dt;
      if (this.nav.walkable(nx, nz)) {
        this.pos.x = nx;
        this.pos.z = nz;
      }
      this.push.set(0, 0, 0);
    }
    // Follow the ground smoothly.
    const gy = this.nav.groundAt(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);

    if (!root.visible) return;
    root.position.copy(this.pos);
    root.rotation.y = this.facing;
    if (lod > 1) return;
    this.animate(dt, speed);
  }

  private turn(want: number, maxStep: number) {
    let d = want - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += Math.abs(d) < maxStep ? d : Math.sign(d) * maxStep;
  }

  private animate(dt: number, speed: number) {
    const ch = this.character;
    const p = ch.parts;
    const sitting = this.pose === 'sit' && speed === 0;
    this.sitAmount += ((sitting ? 1 : 0) - this.sitAmount) * Math.min(1, dt * 6);
    ch.animate(dt, { speed: sitting ? 0 : speed, grounded: true, state: 'ground', stateTime: 0, airTime: 0 });
    this.bob += dt;
    if (this.sitAmount > 0.01) {
      const s = this.sitAmount;
      p.legL.pivot.rotation.x = -1.45 * s;
      p.legR.pivot.rotation.x = -1.45 * s;
      ch.spinner.position.y = 0.9 - 0.5 * s;
    }
    p.head.pivot.rotation.x *= 0.9;
    if (speed > 0) return;
    if (this.pose === 'talk') {
      // Hand-waving while talking.
      p.armR.pivot.rotation.x = -0.6 + Math.sin(this.bob * 7) * 0.35;
      p.armR.pivot.rotation.z = 0.15;
      p.head.pivot.rotation.x = Math.sin(this.bob * 5) * 0.06;
    } else if (this.pose === 'cheer') {
      p.armL.pivot.rotation.x = Math.PI * 0.9 + Math.sin(this.bob * 12) * 0.2;
      p.armR.pivot.rotation.x = Math.PI * 0.9 - Math.sin(this.bob * 12) * 0.2;
    } else if (this.pose === 'cower') {
      p.armL.pivot.rotation.x = -2.4;
      p.armR.pivot.rotation.x = -2.4;
      p.head.pivot.rotation.x = 0.35;
    }
  }

  remove(scene: THREE.Scene) {
    scene.remove(this.character.root);
    this.character.dispose();
  }
}
