import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from '../../physics';
import { Character } from '../../character';
import { buildVoxelBody } from '../../chars/build';
import { specForJob, type PersonSpec } from '../../chars/spec';
import type { Box } from '../../town';
import type { Interactable } from '../../props';
import { B, type VoxelWorld } from '../../voxel';
import { canvasTexture, mulberry32, noiseTexture, type Rng } from '../../util';
import type { GameApi, MapContext, TravelKind } from '../types';

/**
 * Shared kit for the prison and the asylum: voxel building helpers, props, simple scripted
 * actors, uniforms, staff-only zones, and the two ways in that don't need a ticket:
 * getting arrested and getting committed.
 */

/** Ground surface height on both maps. */
export const G = 4;

export const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({
  min: new THREE.Vector3(x0, y0, z0),
  max: new THREE.Vector3(x1, y1, z1),
});

export const inBox = (p: THREE.Vector3, b: Box) =>
  p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ voxels

/** Stone, dirt, and a top layer of `top` over the whole map. */
export function ground(w: VoxelWorld, top: number, rng: Rng, flowers = 0) {
  for (let x = 0; x < w.sx; x++)
    for (let z = 0; z < w.sz; z++) {
      w.set(x, 0, z, B.Stone);
      w.set(x, 1, z, B.Dirt);
      w.set(x, 2, z, B.Dirt);
      w.set(x, 3, z, flowers && rng() < flowers ? B.Flower : top);
    }
}

/** A rectangle of floor at the block row y (stand on y + 1). */
export const slab = (w: VoxelWorld, x0: number, z0: number, x1: number, z1: number, y: number, b: number) => w.fill(x0, y, z0, x1, y, z1, b);

/** The four walls of an inclusive rectangle, from y0 up h blocks. */
export function walls(w: VoxelWorld, x0: number, z0: number, x1: number, z1: number, y0: number, h: number, b: number) {
  w.fill(x0, y0, z0, x1, y0 + h - 1, z0, b);
  w.fill(x0, y0, z1, x1, y0 + h - 1, z1, b);
  w.fill(x0, y0, z0, x0, y0 + h - 1, z1, b);
  w.fill(x1, y0, z0, x1, y0 + h - 1, z1, b);
}

/** Cut an opening (inclusive box) out of whatever is there. */
export const cut = (w: VoxelWorld, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => w.fill(x0, y0, z0, x1, y1, z1, B.Air);

/**
 * Stairs climbing one block per step. Step i is at (x0 + i*dx, z0 + i*dz) and its top is y0 + i + 1.
 * `wide` extends each step sideways (perpendicular to the climb).
 */
export function stairs(w: VoxelWorld, x0: number, z0: number, dx: number, dz: number, y0: number, steps: number, wide: number, b: number) {
  for (let i = 0; i < steps; i++) {
    const x = x0 + i * dx;
    const z = z0 + i * dz;
    for (let k = 0; k < wide; k++) {
      const sx = dz !== 0 ? x + k : x;
      const sz = dx !== 0 ? z + k : z;
      w.fill(sx, y0, sz, sx, y0 + i, sz, b);
    }
  }
}

/** Windows: replace every other block of a wall row with glass. */
export function windows(w: VoxelWorld, x0: number, z0: number, x1: number, z1: number, y: number, every = 3) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) if ((x + z) % every === 0 && w.get(x, y, z)) w.set(x, y, z, B.Glass);
}

export function tree(w: VoxelWorld, rng: Rng, x: number, z: number, y0 = G) {
  const h = 5 + Math.floor(rng() * 4);
  w.fill(x, y0, z, x, y0 + h - 1, z, B.Wood);
  const r = 2 + Math.floor(rng() * 2);
  const cy = y0 + h;
  const leaf = rng() < 0.5 ? B.Leaves : B.LeavesDark;
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r + 1; dy++)
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dy * dy * 1.2 + dz * dz > r * r + 0.8) continue;
        if (w.get(x + dx, cy + dy, z + dz) === 0 && rng() > 0.06) w.set(x + dx, cy + dy, z + dz, leaf);
      }
}

/** NPCs walk on the ground floor wherever there is floor under them and two blocks of headroom. */
export const groundFloor = (w: VoxelWorld) => (x: number, z: number) => {
  const fx = Math.floor(x), fz = Math.floor(z);
  return w.get(fx, G, fz) === 0 && w.get(fx, G + 1, fz) === 0 && w.get(fx, G - 1, fz) !== 0 ? G : NaN;
};

// ------------------------------------------------------------------ props

const lambert = (color: THREE.ColorRepresentation, opts: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, map: noiseTexture(), ...opts });

export interface Gate {
  mesh: THREE.Object3D;
  collider: RAPIER.Collider;
  /** Open = no collider, mesh hidden (or slid). */
  setOpen(open: boolean): void;
  open: boolean;
}

/** Owns every mesh and collider a map adds, so dispose() can take them all back out. */
export class PropKit {
  readonly root = new THREE.Group();
  private colliders: RAPIER.Collider[] = [];
  private body: RAPIER.RigidBody;
  readonly interactables: Interactable[] = [];
  private textures: THREE.Texture[] = [];

  constructor(private ctx: MapContext) {
    ctx.scene.add(this.root);
    this.body = ctx.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  mat(color: number, opts: THREE.MeshLambertMaterialParameters = {}) {
    return lambert(color, opts);
  }

  /** A box mesh centered at pos. */
  box(size: [number, number, number], pos: THREE.Vector3, color: number | THREE.Material, parent: THREE.Object3D = this.root) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), typeof color === 'number' ? lambert(color) : color);
    m.position.copy(pos);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** A static world collider (axis-aligned box from min to max corner). */
  solid(min: THREE.Vector3, max: THREE.Vector3) {
    const half = max.clone().sub(min).multiplyScalar(0.5);
    const c = min.clone().add(half);
    const cd = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(c.x, c.y, c.z)
      .setFriction(0.9)
      .setCollisionGroups(groups(G_WORLD, G_ALL));
    const col = this.ctx.physics.createCollider(cd, this.body);
    this.colliders.push(col);
    return col;
  }

  /** A solid box you can see. */
  block(min: THREE.Vector3, max: THREE.Vector3, color: number | THREE.Material) {
    const size = max.clone().sub(min);
    const mesh = this.box([size.x, size.y, size.z], min.clone().add(size.clone().multiplyScalar(0.5)), color);
    const collider = this.solid(min, max);
    return { mesh, collider };
  }

  /**
   * Prison bars along an axis-aligned line at floor y0, h tall. `doors` are [from, to] ranges along
   * the line that stay open. Bars are thin meshes with one collider per solid run.
   */
  bars(axis: 'x' | 'z', fixed: number, from: number, to: number, y0: number, h: number, doors: [number, number][] = [], color = 0x5a5f68) {
    const m = lambert(color);
    const geo = new THREE.BoxGeometry(0.1, h, 0.1);
    const open = (t: number) => doors.some(([a, b]) => t >= a && t <= b);
    let runStart: number | null = null;
    const flush = (end: number) => {
      if (runStart === null) return;
      const a = runStart, b = end;
      if (axis === 'x') this.solid(v3(a, y0, fixed - 0.08), v3(b, y0 + h, fixed + 0.08));
      else this.solid(v3(fixed - 0.08, y0, a), v3(fixed + 0.08, y0 + h, b));
      runStart = null;
    };
    for (let t = from; t <= to + 1e-6; t += 0.34) {
      if (open(t)) {
        flush(t - 0.17);
        continue;
      }
      if (runStart === null) runStart = Math.max(from, t - 0.17);
      const bar = new THREE.Mesh(geo, m);
      bar.castShadow = true;
      bar.position.set(axis === 'x' ? t : fixed, y0 + h / 2, axis === 'x' ? fixed : t);
      this.root.add(bar);
    }
    flush(to);
    // Top and bottom rails.
    const len = to - from;
    for (const y of [y0 + 0.05, y0 + h - 0.05]) {
      const rail = this.box(axis === 'x' ? [len, 0.1, 0.12] : [0.12, 0.1, len], axis === 'x' ? v3(from + len / 2, y, fixed) : v3(fixed, y, from + len / 2), m);
      rail.castShadow = false;
    }
  }

  /** A door or gate that blocks when closed. Bars look; `solidColor` makes it a plain door. */
  gate(min: THREE.Vector3, max: THREE.Vector3, opts: { color?: number; barred?: boolean; open?: boolean } = {}): Gate {
    const size = max.clone().sub(min);
    const g = new THREE.Group();
    const center = min.clone().add(size.clone().multiplyScalar(0.5));
    g.position.copy(center);
    const color = opts.color ?? 0x5a5f68;
    if (opts.barred) {
      const along = size.x > size.z ? 'x' : 'z';
      const len = along === 'x' ? size.x : size.z;
      const m = lambert(color);
      for (let t = -len / 2 + 0.17; t < len / 2; t += 0.34) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, size.y, 0.1), m);
        bar.position.set(along === 'x' ? t : 0, 0, along === 'x' ? 0 : t);
        g.add(bar);
      }
      for (const y of [-size.y / 2 + 0.1, size.y / 2 - 0.1, 0]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len : 0.12, 0.12, along === 'x' ? 0.12 : len), m);
        r.position.y = y;
        g.add(r);
      }
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), lambert(color));
      m.castShadow = true;
      g.add(m);
    }
    this.root.add(g);
    const collider = this.solid(min, max);
    const gate: Gate = {
      mesh: g,
      collider,
      open: false,
      setOpen(open: boolean) {
        gate.open = open;
        collider.setEnabled(!open);
        g.visible = !open;
      },
    };
    gate.setOpen(!!opts.open);
    return gate;
  }

  /** A flat painted sign facing +z rotated by rotY. */
  sign(lines: string[], pos: THREE.Vector3, rotY: number, bg: string, fg: string, w = 4, h = 1.2) {
    const tex = canvasTexture(
      Math.round(w * 64),
      Math.round(h * 64),
      (c) => {
        const W = c.canvas.width, H = c.canvas.height;
        c.fillStyle = bg;
        c.fillRect(0, 0, W, H);
        c.strokeStyle = fg;
        c.lineWidth = 6;
        c.strokeRect(5, 5, W - 10, H - 10);
        c.fillStyle = fg;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        lines.forEach((line, i) => {
          const size = i === 0 ? Math.min(H * 0.42, (W / Math.max(line.length, 4)) * 1.5) : H * 0.2;
          c.font = `bold ${Math.round(size)}px Arial Black, Impact, sans-serif`;
          c.fillText(line, W / 2, lines.length === 1 ? H / 2 : (H / (lines.length + 0.6)) * (i + 0.8));
        });
      },
      false,
    );
    this.textures.push(tex);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
    m.position.copy(pos);
    m.rotation.y = rotY;
    this.root.add(m);
    return m;
  }

  /** Register an E-press spot. */
  interact(id: string, pos: THREE.Vector3, prompt: string, radius = 1.8, mesh?: THREE.Object3D) {
    const it: Interactable = { id, pos, radius, prompt, enabled: true, mesh };
    this.interactables.push(it);
    return it;
  }

  dispose() {
    this.ctx.scene.remove(this.root);
    for (const c of this.colliders) this.ctx.physics.removeCollider(c, false);
    this.ctx.physics.removeRigidBody(this.body);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    for (const t of this.textures) t.dispose();
  }
}

// ------------------------------------------------------------------ uniforms

/** What each institution job wears. Shirt, pants, and an optional cap. */
export const UNIFORMS: Record<string, { shirt: number; pants: number; hat?: number | null; shoes?: number }> = {
  Inmate: { shirt: 0xf07a2a, pants: 0xf07a2a, hat: null, shoes: 0xeeeeee },
  'Prison Guard': { shirt: 0x34486e, pants: 0x1e2430, hat: 0x1e2a44, shoes: 0x222222 },
  Warden: { shirt: 0x55575e, pants: 0x3a3c42, hat: null, shoes: 0x2a1a10 },
  Patient: { shirt: 0xbcd8ec, pants: 0xbcd8ec, hat: null, shoes: 0xd8d8d8 },
  Orderly: { shirt: 0xf4f4f4, pants: 0xf4f4f4, hat: null, shoes: 0xf4f4f4 },
  Nurse: { shirt: 0x8fd0c0, pants: 0x8fd0c0, hat: 0xffffff, shoes: 0xffffff },
  Psychiatrist: { shirt: 0xf0f0f0, pants: 0x5a4a3a, hat: null, shoes: 0x2a1a10 },
};

/** A scripted person in the detailed voxel style, dressed for `job`, with spec overrides. */
export function person(job: string, seed: number, over: Partial<PersonSpec> = {}): Character {
  const spec = { ...specForJob(job, mulberry32(seed)), ...over };
  return new Character(null, buildVoxelBody(spec));
}

/**
 * Put a live character in a uniform (when Gary gets booked or admitted). Slips a colored shell
 * over the torso, arms and legs, so it works on any body without rebuilding it.
 */
export function dress(ch: Character, job: string) {
  const u = UNIFORMS[job];
  if (u) suit(ch, u.shirt, u.pants);
}

/** Cover the torso and arms in `shirt` and the legs in `pants` (uniforms, bear suits). */
export function suit(ch: Character, shirt: number, pants: number) {
  const u = { shirt, pants };
  for (const name of ['torso', 'armL', 'armR', 'legL', 'legR'] as const) {
    const part = ch.parts[name];
    const old = part.mesh.children.find((c) => c.userData.uniform);
    if (old) part.mesh.remove(old);
    const s = part.size;
    const limb = name !== 'torso';
    const h = limb ? s.y * 0.82 : s.y + 0.02;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(s.x + 0.05, h, s.z + 0.05), lambert(name.startsWith('leg') ? u.pants : u.shirt));
    shell.position.y = (s.y - h) / 2; // limbs: cover the top, leave hands and shoes showing
    shell.castShadow = true;
    shell.userData.uniform = true;
    part.mesh.add(shell);
  }
}

/** A white canvas wrap over the torso and arms, and arms hidden. Returns an undo function. */
export function straitjacket(ch: Character): () => void {
  const torso = ch.parts.torso;
  const s = torso.size;
  const jacket = new THREE.Group();
  const m = lambert(0xf2efe2);
  const wrap = new THREE.Mesh(new THREE.BoxGeometry(s.x + 0.32, s.y + 0.04, s.z + 0.16), m);
  wrap.castShadow = true;
  jacket.add(wrap);
  // Crossed sleeves and the buckles.
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(s.x + 0.34, 0.14, 0.12), m);
  sleeve.position.set(0, 0.06, s.z / 2 + 0.1);
  jacket.add(sleeve);
  for (const dx of [-0.15, 0.15]) {
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), lambert(0x8a7a40));
    buckle.position.set(dx, -0.12, s.z / 2 + 0.1);
    jacket.add(buckle);
  }
  torso.mesh.add(jacket);
  ch.parts.armL.mesh.visible = false;
  ch.parts.armR.mesh.visible = false;
  return () => {
    torso.mesh.remove(jacket);
    ch.parts.armL.mesh.visible = true;
    ch.parts.armR.mesh.visible = true;
  };
}

// ------------------------------------------------------------------ actors

/**
 * A scripted person who is not a possessable townsperson: Big Tony, the Warden, Napoleon, the bear.
 * Walks in straight lines and says things.
 */
export class Actor {
  readonly ch: Character;
  readonly pos: THREE.Vector3;
  facing: number;
  private target: THREE.Vector3 | null = null;
  private speed = 3;
  private onArrive: (() => void) | null = null;
  /** Extra animation state, e.g. 'locked' to stand stiff. */
  state = 'ground';
  bob = 0;

  constructor(private root: THREE.Object3D, ch: Character, pos: THREE.Vector3, facing = 0, readonly name = '') {
    this.ch = ch;
    this.pos = pos.clone();
    this.facing = facing;
    root.add(this.ch.root);
    this.sync();
  }

  goTo(p: THREE.Vector3, speed = 3, onArrive?: () => void) {
    this.target = p.clone();
    this.target.y = this.pos.y;
    this.speed = speed;
    this.onArrive = onArrive ?? null;
  }

  stop() {
    this.target = null;
    this.onArrive = null;
  }

  get moving() {
    return this.target !== null;
  }

  lookAt(p: THREE.Vector3) {
    this.facing = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  place(p: THREE.Vector3, facing = this.facing) {
    this.pos.copy(p);
    this.facing = facing;
    this.stop();
    this.sync();
  }

  update(dt: number) {
    let speed = 0;
    if (this.target) {
      const to = this.target.clone().sub(this.pos);
      to.y = 0;
      const d = to.length();
      if (d < 0.15) {
        this.target = null;
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.();
      } else {
        speed = this.speed;
        to.normalize();
        this.pos.addScaledVector(to, Math.min(d, speed * dt));
        this.facing = Math.atan2(to.x, to.z);
      }
    }
    this.sync();
    this.ch.animate(dt, { speed, grounded: true, state: this.state, stateTime: 0, airTime: 0 });
  }

  private sync() {
    this.ch.root.position.copy(this.pos);
    this.ch.root.position.y += this.bob;
    this.ch.root.rotation.y = this.facing;
  }

  dispose() {
    this.root.remove(this.ch.root);
    this.ch.dispose();
  }
}

// ------------------------------------------------------------------ access

export interface AccessZone {
  id: string;
  /** Shown when someone without access walks in. */
  name: string;
  boxes: Box[];
  /** Jobs allowed in. */
  allow: (job: string) => boolean;
}

/**
 * Tracks which restricted zone the player is standing in and reports the moment they walk
 * into one their job doesn't allow. Zones listed first win when they overlap.
 */
export class AccessControl {
  private current: string | null = null;
  /** Seconds of free passage (being escorted, just released from solitary). */
  pass = 0;

  constructor(readonly zones: AccessZone[]) {}

  zoneAt(p: THREE.Vector3) {
    for (const z of this.zones) if (z.boxes.some((b) => inBox(p, b))) return z;
    return null;
  }

  /** Returns the zone just entered illegally, or null. */
  check(p: THREE.Vector3, job: string, dt: number): AccessZone | null {
    if (this.pass > 0) this.pass -= dt;
    const z = this.zoneAt(p);
    const id = z?.id ?? null;
    const entered = id !== this.current;
    this.current = id;
    if (!z || !entered || this.pass > 0) return null;
    return z.allow(job) ? null : z;
  }

  reset() {
    this.current = null;
  }
}

// ------------------------------------------------------------------ getting in

export type IntakeKind = 'arrest' | 'commit';
export interface Intake {
  kind: IntakeKind;
  reason: string;
}

let pendingIntake: Intake | null = null;

/** The prison or asylum reads this once on arrival to run booking or admission. */
export function takePendingIntake(kind: IntakeKind): Intake | null {
  if (!pendingIntake || pendingIntake.kind !== kind) return null;
  const p = pendingIntake;
  pendingIntake = null;
  return p;
}

/** GameApi extras that come with the map loader (travelTo) and HUD refresh. Optional so this works before and after. */
export type InstitutionApi = GameApi & {
  travelTo?: (stopKey: string, opts?: { line?: string; title?: string }) => void;
  refreshHud?: () => void;
};

function haul(game: GameApi, stopKey: string, title: string, line: string) {
  const g = game as InstitutionApi;
  if (typeof g.travelTo !== 'function') return false;
  g.travelTo(stopKey, { title, line });
  return true;
}

/**
 * Arrest the body Gary is in and ship it to the prison in a paddy wagon. Call from any map.
 * The prison books them (orange jumpsuit, job becomes Inmate) and drops them in a cell.
 */
export function arrest(game: GameApi, reason: string) {
  if (!game.body) return;
  pendingIntake = { kind: 'arrest', reason };
  game.player.lock(true);
  game.sound.horn();
  game.flash('#3a5aff', 250);
  game.toast('YOU\'RE UNDER ARREST', reason, 2600);
  game.runSeq([
    { at: 0.35, fn: () => game.flash('#ff2a2a', 250) },
    { at: 0.7, fn: () => game.flash('#3a5aff', 250) },
    {
      at: 2.2,
      fn: () => {
        if (!haul(game, 'prison:intake', 'Blackrock Penitentiary', 'County paddy wagon. No seatbelts.')) {
          pendingIntake = null;
          game.player.lock(false);
          game.toast('THE PADDY WAGON IS FULL', 'The prison is not open yet. Consider yourself warned.', 2600);
        }
      },
    },
  ]);
}

/** Have the body committed. Men in white coats, a van, and a bed at the asylum. */
export function commit(game: GameApi, reason: string) {
  if (!game.body) return;
  pendingIntake = { kind: 'commit', reason };
  game.player.lock(true);
  game.say('Orderly', 'Easy now. Nobody wants to hurt you. Arms out, please.', 2600);
  game.toast('INVOLUNTARY HOLD', reason, 2600);
  game.runSeq([
    {
      at: 2.4,
      fn: () => {
        if (!haul(game, 'asylum:intake', 'Pinecrest Asylum', 'Unmarked white van. Very comfy straps.')) {
          pendingIntake = null;
          game.player.lock(false);
          game.toast('NO BEDS AVAILABLE', 'Pinecrest is full today. Try being crazier tomorrow.', 2600);
        }
      },
    },
  ]);
}

/**
 * Shared trespass logic. Strike 1 and 2: walked back out. Strike 3: you get what you wanted.
 */
export class Strikes {
  n = 0;
  hit() {
    return ++this.n;
  }
  reset() {
    this.n = 0;
  }
}

/** A short siren / whistle helpers on top of the game's synth. */
export function whistle(game: GameApi) {
  game.sound.tone({ f: 2400, f2: 2600, dur: 0.18, type: 'square', vol: 0.06, vibrato: 30 });
  setTimeout(() => game.sound.tone({ f: 2600, f2: 2300, dur: 0.5, type: 'square', vol: 0.06, vibrato: 40 }), 200);
}

export function siren(game: GameApi, times = 3) {
  for (let i = 0; i < times; i++) setTimeout(() => game.sound.tone({ f: 600, f2: 1100, dur: 0.45, type: 'sawtooth', vol: 0.05 }), i * 500);
}

/** Tint a character through a list of colors, one step per call. */
export function rainbow(i: number) {
  return new THREE.Color().setHSL((i * 0.13) % 1, 0.9, 0.55);
}
