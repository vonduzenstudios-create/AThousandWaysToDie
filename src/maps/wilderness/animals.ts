import * as THREE from 'three';
import { Character, randomAppearance, type Appearance } from '../../character';
import { canvasTexture, mulberry32, type Rng } from '../../util';
import type { Rig } from './models';

export type Mood = 0 | 1 | 2 | 3;
export const MOOD_NAMES = ['calm', 'curious', 'annoyed', 'FURIOUS'] as const;

export interface Ground {
  /** Standing height at a column. */
  floor(x: number, z: number): number;
  /** Water surface level at a column (0 = dry). */
  water(x: number, z: number): number;
}

const moodTex: THREE.Texture[] = [];
function moodIcon(m: number) {
  if (!moodTex[m]) {
    const txt = ['', '?', '!', '!!'][m];
    const col = ['#fff', '#ffe060', '#ff9a30', '#ff3020'][m];
    moodTex[m] = canvasTexture(
      64,
      64,
      (c) => {
        c.fillStyle = 'rgba(0,0,0,0)';
        c.clearRect(0, 0, 64, 64);
        c.font = 'bold 54px Arial Black, Impact, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.lineWidth = 8;
        c.strokeStyle = '#000';
        c.strokeText(txt, 32, 34);
        c.fillStyle = col;
        c.fillText(txt, 32, 34);
      },
      false,
    );
  }
  return moodTex[m];
}

export interface AnimalOpts {
  name: string;
  home: { x: number; z: number; r: number };
  speed: number;
  run?: number;
  /** 'land' avoids water, 'water' stays in it, 'any' goes anywhere. */
  habitat?: 'land' | 'water' | 'any';
  /** Flying animals circle at this height above the ground. */
  fly?: { alt: number; radius: number };
  /** Seconds idle between wanders. */
  idle?: [number, number];
  /** Mood falls by this much per second. */
  calmRate?: number;
  /** Bob in the water instead of standing on the bed. */
  float?: boolean;
  seed?: number;
}

/** A wild animal: wanders its home range, has a mood meter, and can be scripted by deaths. */
export class Animal {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  mood = 0;
  /** While set, the animal ignores its AI and the death logic drives it. */
  scripted = false;
  /** Freeze in place (eating, sleeping, yawning). */
  hold = 0;
  speedNow = 0;
  private target = new THREE.Vector3();
  private moving = false;
  private running = false;
  private idleT = 0;
  private phase = 0;
  private flyAng = 0;
  private icon: THREE.Sprite;
  private rng: Rng;
  onArrive: (() => void) | null = null;

  constructor(readonly rig: Rig, readonly opts: AnimalOpts, private ground: Ground, scene: THREE.Scene, start?: THREE.Vector3) {
    this.rng = mulberry32(opts.seed ?? Math.floor(Math.random() * 1e9));
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moodIcon(1), transparent: true, depthTest: false }));
    this.icon.scale.setScalar(1.1);
    this.icon.visible = false;
    this.icon.renderOrder = 10;
    scene.add(rig.root, this.icon);
    if (start) this.pos.copy(start);
    else this.pos.copy(this.randomPoint() ?? new THREE.Vector3(opts.home.x, 0, opts.home.z));
    this.flyAng = this.rng() * Math.PI * 2;
    this.yaw = this.rng() * Math.PI * 2;
    this.snapY();
    this.idleT = this.rng() * 3;
  }

  get name() {
    return this.opts.name;
  }

  get moodLevel(): Mood {
    return Math.min(3, Math.floor(this.mood)) as Mood;
  }

  raise(by: number) {
    this.mood = Math.min(3.99, this.mood + by);
  }

  private ok(x: number, z: number) {
    const w = this.ground.water(x, z);
    const h = this.opts.habitat ?? 'land';
    if (h === 'land' && w) return false;
    if (h === 'water' && !w) return false;
    return true;
  }

  private randomPoint() {
    const { x, z, r } = this.opts.home;
    for (let i = 0; i < 16; i++) {
      const a = this.rng() * Math.PI * 2, d = Math.sqrt(this.rng()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.ok(px, pz)) return new THREE.Vector3(px, 0, pz);
    }
    return null;
  }

  groundY(x: number, z: number) {
    const f = this.ground.floor(x, z);
    if (this.opts.float) {
      const w = this.ground.water(x, z);
      if (w) return Math.max(f, w - 1.2);
    }
    return f;
  }

  snapY() {
    if (this.opts.fly) return;
    this.pos.y = this.groundY(this.pos.x, this.pos.z);
  }

  /** Walk (or run) somewhere. Used by scripts too. */
  goTo(x: number, z: number, run = false, onArrive: (() => void) | null = null) {
    this.target.set(x, 0, z);
    this.moving = true;
    this.running = run;
    this.onArrive = onArrive;
  }

  stop() {
    this.moving = false;
    this.onArrive = null;
  }

  face(x: number | { x: number; z: number }, z = 0) {
    if (typeof x !== 'number') {
      z = x.z;
      x = x.x;
    }
    this.yaw = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  distTo(p: THREE.Vector3) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  /** Is a point inside this animal's view cone (and range)? */
  sees(p: THREE.Vector3, range: number, cone = 1.2) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d < 2) return true;
    let a = Math.atan2(dx, dz) - this.yaw;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return Math.abs(a) < cone;
  }

  update(dt: number, time: number) {
    const o = this.opts;
    this.mood = Math.max(0, this.mood - dt * (o.calmRate ?? 0.06));
    if (o.fly && !this.scripted) {
      this.flyAng += dt * (o.speed / o.fly.radius);
      const tx = o.home.x + Math.cos(this.flyAng) * o.fly.radius;
      const tz = o.home.z + Math.sin(this.flyAng) * o.fly.radius;
      const ty = this.ground.floor(o.home.x, o.home.z) + o.fly.alt + Math.sin(this.flyAng * 2) * 2;
      this.yaw = Math.atan2(tx - this.pos.x, tz - this.pos.z);
      this.pos.set(tx, ty, tz);
      this.rig.root.rotation.z = 0.35;
    } else if (this.hold > 0) {
      this.hold -= dt;
      this.speedNow = 0;
    } else if (this.moving) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const sp = this.running ? o.run ?? o.speed * 2.5 : o.speed;
      if (d < 0.4) {
        this.moving = false;
        this.speedNow = 0;
        this.idleT = (o.idle?.[0] ?? 2) + this.rng() * ((o.idle?.[1] ?? 7) - (o.idle?.[0] ?? 2));
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.();
      } else {
        const step = Math.min(d, sp * dt);
        const nx = this.pos.x + (dx / d) * step, nz = this.pos.z + (dz / d) * step;
        const blocked = !this.scripted && !this.ok(nx, nz);
        if (blocked) {
          this.moving = false;
          this.idleT = 1;
        } else {
          this.pos.x = nx;
          this.pos.z = nz;
          let want = Math.atan2(dx, dz) - this.yaw;
          while (want > Math.PI) want -= Math.PI * 2;
          while (want < -Math.PI) want += Math.PI * 2;
          this.yaw += want * Math.min(1, dt * 6);
          this.speedNow = sp;
        }
      }
      this.snapY();
    } else if (!this.scripted) {
      this.speedNow = 0;
      this.idleT -= dt;
      if (this.idleT <= 0) {
        const p = this.randomPoint();
        if (p) this.goTo(p.x, p.z, false);
        else this.idleT = 2;
      }
    } else this.speedNow = 0;
    this.animate(dt, time);
  }

  private animate(dt: number, time: number) {
    const r = this.rig;
    r.root.position.copy(this.pos);
    r.root.rotation.y = this.yaw;
    const moving = this.speedNow > 0.05;
    this.phase += dt * (3 + this.speedNow * 2.2);
    const amp = moving ? Math.min(0.9, 0.35 + this.speedNow * 0.08) : 0;
    r.legs.forEach((l, i) => {
      const s = i === 0 || i === 3 ? 1 : -1;
      l.rotation.x += (Math.sin(this.phase) * amp * s - l.rotation.x) * Math.min(1, dt * 12);
    });
    if (r.tail) r.tail.rotation.y = Math.sin(time * 3 + this.pos.x) * 0.4;
    if (r.wings) {
      const flap = Math.sin(time * (this.opts.fly ? 3 : 10)) * 0.5;
      r.wings[0].rotation.z = flap;
      r.wings[1].rotation.z = -flap;
    }
    if (r.trunk) r.trunk.rotation.x = Math.sin(time * 1.3 + this.pos.z) * 0.25;
    if (!moving && r.head && !this.opts.fly && !this.scripted) r.head.rotation.y = Math.sin(time * 0.7 + this.pos.x) * 0.3;
    // Mood icon.
    const m = this.moodLevel;
    this.icon.visible = m > 0;
    if (m > 0) {
      (this.icon.material as THREE.SpriteMaterial).map = moodIcon(m);
      const s = this.rig.root.scale.y;
      this.icon.position.set(this.pos.x, this.pos.y + (r.top + 1.2) * s + Math.sin(time * 6) * 0.1, this.pos.z);
    }
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.rig.root, this.icon);
  }
}

/** A scripted person (rangers, guides, show hosts). Not possessable: they are part of the scenery's machinery. */
export class Actor {
  readonly ch: Character;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  private target: THREE.Vector3 | null = null;
  private speed = 2.4;
  private onArrive: (() => void) | null = null;
  pose: 'stand' | 'wave' | 'point' | 'sit' = 'stand';
  private t = 0;

  constructor(readonly name: string, app: Partial<Appearance>, private ground: Ground, scene: THREE.Scene, at: THREE.Vector3, seed = 1) {
    const base = randomAppearance(mulberry32(seed));
    this.ch = new Character({ ...base, ...app });
    this.pos.copy(at);
    scene.add(this.ch.root);
    this.snap();
  }

  snap() {
    this.pos.y = this.ground.floor(this.pos.x, this.pos.z);
  }

  goTo(p: THREE.Vector3, speed = 2.4, onArrive: (() => void) | null = null) {
    this.target = p.clone();
    this.speed = speed;
    this.onArrive = onArrive;
  }

  get busy() {
    return this.target !== null;
  }

  face(p: THREE.Vector3) {
    this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  distTo(p: THREE.Vector3) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  update(dt: number) {
    this.t += dt;
    let speed = 0;
    if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        this.target = null;
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.();
      } else {
        const st = Math.min(d, this.speed * dt);
        this.pos.x += (dx / d) * st;
        this.pos.z += (dz / d) * st;
        this.yaw = Math.atan2(dx, dz);
        speed = this.speed;
        this.snap();
      }
    }
    this.ch.root.position.copy(this.pos);
    this.ch.root.rotation.y = this.yaw;
    this.ch.animate(dt, { speed, grounded: true, state: 'ground', stateTime: 0, airTime: 0 });
    const arm = this.ch.parts.armR.pivot;
    if (this.pose === 'wave') arm.rotation.x = -2.6 + Math.sin(this.t * 10) * 0.4;
    else if (this.pose === 'point') arm.rotation.x = -1.5;
    if (this.pose === 'sit') {
      this.ch.parts.legL.pivot.rotation.x = -1.4;
      this.ch.parts.legR.pivot.rotation.x = -1.4;
      this.ch.root.position.y -= 0.6;
    }
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.ch.root);
    this.ch.dispose();
  }
}
