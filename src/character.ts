import * as THREE from 'three';
import { buildVoxelBody, type VoxelBody } from './chars/build';
import { specFromAppearance, specFromFile } from './chars/spec';
import type { Expression } from './chars/spec';
import { pick, randRange, type Rng } from './util';

export type PartName = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR';
export const PART_NAMES: PartName[] = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];

export interface Appearance {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
  hairStyle: number; // 0 bald, 1 short, 2 tall, 3 mohawk, 4 long
  hat: number | null;
  glasses: boolean;
  beard: boolean;
  width: number;
  height: number;
  mouth: number;
}

const SKINS = [0xf6d3b3, 0xe8b88f, 0xd09a6a, 0xa86e45, 0x7a4a2c, 0x5a3520, 0xf0c8a0];
const HAIRS = [0x1d1612, 0x4a2d1a, 0x8a5a2b, 0xd8b45a, 0xb8462a, 0xcfcfcf, 0x6b6b6b, 0x2b2b6b];
const CLOTHES = [0xd8443a, 0x3a6fd8, 0x3aa65a, 0xe0b030, 0x8a4ad8, 0xf07a2a, 0x2a2a2a, 0xeeeeee, 0x2ab0b0, 0xe06aa0, 0x6b8e23, 0x8b5a2b];
const PANTS = [0x2c3e66, 0x3b3b3b, 0x6b5a3a, 0x1e1e2a, 0x556b2f, 0x8a8a8a];

export function randomAppearance(rng: Rng): Appearance {
  return {
    skin: pick(rng, SKINS),
    hair: pick(rng, HAIRS),
    shirt: pick(rng, CLOTHES),
    pants: pick(rng, PANTS),
    shoes: pick(rng, [0x222222, 0x5a3a20, 0xeeeeee, 0x8a1a1a]),
    hairStyle: Math.floor(rng() * 5),
    hat: rng() < 0.25 ? pick(rng, CLOTHES) : null,
    glasses: rng() < 0.3,
    beard: rng() < 0.25,
    width: randRange(rng, 0.85, 1.45),
    height: randRange(rng, 0.9, 1.05),
    mouth: Math.floor(rng() * 4),
  };
}

interface Part {
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  size: THREE.Vector3;
}

export interface AnimState {
  speed: number;
  grounded: boolean;
  state: string;
  stateTime: number;
  airTime: number;
  /** Knocked out flat on their back. */
  ko?: boolean;
  /** Scripted poses: seated on a bench, belly-to-earth free fall, hanging under a canopy. */
  pose?: 'sit' | 'freefall' | 'canopy' | null;
}

/** A voxel-style person built entirely from boxes and generated textures. */
export class Character {
  readonly root = new THREE.Group();
  readonly spinner = new THREE.Group();
  readonly body = new THREE.Group();
  readonly parts = {} as Record<PartName, Part>;
  readonly mats: THREE.MeshLambertMaterial[] = [];
  private phase = 0;
  private squash = 0;
  private squashVel = 0;
  private spin = 0;
  /** Seconds left in a punch swing, and which arm throws it. */
  private punchT = 0;
  private punchLeft = false;
  tintColor = new THREE.Color(1, 1, 1);
  /** Hip height: the spinner pivots here for poses (crawling, knocked out). */
  readonly hip: number = 0.9;
  /** Uniform scale of root at rest (pancake/cube deaths scale relative to it). */
  readonly baseScale: number = 1;
  /** The detailed voxel model from src/chars, when built from a person's file. */
  readonly voxel: VoxelBody | null = null;

  /** Build a person whose look matches their scythe-vision file (job, age, health). */
  static fromFile(file: { job: string; age: number; physical?: string; mental?: string; name?: string; sex?: 'm' | 'f' }, seed?: number) {
    const vb = buildVoxelBody(specFromFile(file, seed));
    return new Character(null, vb);
  }

  readonly app: Appearance;

  /**
   * Every person is a detailed voxel body. Pass a VoxelBody built from a PersonSpec, or an older
   * Appearance (colors, hair, hat...), which is translated into a spec so scripted actors, drivers
   * and statues get the same look as everyone else.
   */
  constructor(app: Appearance | null, vb?: VoxelBody) {
    if (vb) {
      // Stand-in appearance so older code that reads app.height (head position etc.) still works.
      this.app = { ...randomAppearance(Math.random), height: 1 };
    } else {
      app ??= randomAppearance(Math.random);
      this.app = app;
      vb = buildVoxelBody(specFromAppearance(app));
      this.baseScale = app.height;
    }
    this.voxel = vb;
    this.parts = vb.parts as Record<PartName, Part>;
    this.mats.push(vb.material);
    this.body.add(vb.body);
    this.hip = vb.hip;
    this.body.position.y = -this.hip;
    this.spinner.position.y = this.hip;
    this.spinner.add(this.body);
    this.root.add(this.spinner);
    this.root.scale.setScalar(this.baseScale);
  }

  /** Set knee and elbow bends directly (seated drivers, scripted poses). */
  bend(kneeL: number, kneeR = kneeL, elbowL = -0.25, elbowR = elbowL) {
    const j = this.voxel?.joints;
    if (!j) return;
    j.kneeL.rotation.x = kneeL;
    j.kneeR.rotation.x = kneeR;
    j.elbowL.rotation.x = elbowL;
    j.elbowR.rotation.x = elbowR;
  }

  /** Change the face (only on the detailed models). */
  setExpression(e: Expression) {
    this.voxel?.setExpression(e);
  }

  /** Bounce the character with squash and stretch (positive = squash). */
  kick(amount: number) {
    this.squashVel += amount * 20;
  }

  /** Multiply all materials toward a color (for green poison, charring, etc). */
  tint(color: THREE.ColorRepresentation, amount: number) {
    const c = new THREE.Color(color);
    for (const m of this.mats) {
      if (!m.userData.base) m.userData.base = m.color.clone();
      m.color.copy(m.userData.base as THREE.Color).lerp(c, amount);
    }
  }

  /** Throw a punch (arm snaps forward, alternating arms). */
  punch() {
    this.punchT = 0.22;
    this.punchLeft = !this.punchLeft;
  }

  flash(on: boolean) {
    for (const m of this.mats) m.emissive.setHex(on ? 0xffffff : 0x000000);
  }

  animate(dt: number, s: AnimState) {
    const p = this.parts;
    const st = s.state;
    const runAmt = Math.min(s.speed / 9, 1);
    this.phase += dt * (4 + s.speed * 1.1);
    const swing = Math.sin(this.phase) * 1.0 * runAmt;

    let legL = 0, legR = 0, armL = 0, armR = 0, armSpread = 0.09;
    // Knees fold the shin back, elbows bring the forearm forward (negative).
    let kneeL = 0.04, kneeR = 0.04, elbowL = -0.22, elbowR = -0.22;
    let pitch = 0, roll = 0, spinnerY = 0.9, crouch = 1;
    const hipK = this.hip / 0.9;

    if (s.grounded && (st === 'ground' || st === 'locked')) {
      legL = swing;
      legR = -swing;
      armL = -swing * 0.8;
      armR = swing * 0.8;
      // The leg swinging forward lifts its foot; running pumps bent arms.
      const c = Math.cos(this.phase);
      kneeL += Math.max(0, -c) * 1.25 * runAmt + 0.12 * runAmt;
      kneeR += Math.max(0, c) * 1.25 * runAmt + 0.12 * runAmt;
      elbowL = elbowR = -0.22 - 1.0 * runAmt * runAmt;
    } else if (st === 'swim') {
      // Front crawl with a flutter kick.
      pitch = s.speed > 0.8 ? 1.15 : 0.25;
      const c = this.phase * 0.55;
      armL = -1.6 + Math.sin(c) * 1.5;
      armR = -1.6 - Math.sin(c) * 1.5;
      armSpread = s.speed > 0.8 ? 0 : 0.7;
      legL = Math.sin(this.phase * 1.4) * 0.35;
      legR = -legL;
      kneeL = Math.max(0, legL) * 0.8;
      kneeR = Math.max(0, legR) * 0.8;
      elbowL = -0.4 - Math.max(0, Math.sin(c)) * 0.8;
      elbowR = -0.4 - Math.max(0, -Math.sin(c)) * 0.8;
    } else if (st === 'tube') {
      // Sitting in an inner tube, paddling with both hands.
      pitch = -0.35;
      legL = legR = -1.3;
      const c = Math.sin(this.phase * 0.7) * 0.5 * Math.min(1, s.speed / 3);
      armL = -0.6 + c;
      armR = -0.6 - c;
      armSpread = 0.6;
      spinnerY = 0.75;
      kneeL = kneeR = 1.3;
      elbowL = elbowR = -0.7;
    } else if (st === 'crawl') {
      pitch = 1.45;
      spinnerY = 0.3;
      const c = Math.sin(this.phase * 0.6) * 0.6 * Math.min(s.speed / 1.5, 1);
      armL = -2.6 + c;
      armR = -2.6 - c;
      legL = -c * 0.5;
      legR = c * 0.5;
      kneeL = kneeR = 1.2;
      elbowL = elbowR = -0.3;
    } else if (st === 'crouch') {
      legL = swing * 0.5 - 0.5;
      legR = -swing * 0.5 - 0.5;
      kneeL = kneeR = 1.0;
      crouch = 0.85;
      elbowL = elbowR = -0.6;
    } else if (st === 'hang') {
      // Both hands up on the ledge, legs dangling.
      armL = armR = -3.0;
      armSpread = 0.15;
      elbowL = elbowR = -0.15;
      legL = 0.1;
      legR = -0.1;
      kneeL = kneeR = 0.25;
    } else if (st === 'climb') {
      // Hauling up: arms push down, one knee comes up over the lip.
      const t = Math.min(1, s.stateTime / 0.5);
      armL = armR = -3.0 + t * 2.2;
      elbowL = elbowR = -1.2 * Math.sin(t * Math.PI);
      legL = -1.3 * Math.sin(t * Math.PI);
      kneeL = 1.6 * Math.sin(t * Math.PI);
      legR = 0.3;
      kneeR = 0.4;
    } else {
      // generic air: arms up, legs tucked
      armL = armR = -2.7;
      armSpread = 0.3;
      legL = 0.5;
      legR = -0.3;
      kneeL = 0.9;
      kneeR = 0.5;
      elbowL = elbowR = -0.35;
    }

    if (s.pose === 'sit') {
      legL = legR = -1.5;
      kneeL = kneeR = 1.5;
      armL = armR = -0.35;
      armSpread = 0.12;
      elbowL = elbowR = -0.9;
      spinnerY = 0.52;
    } else if (s.pose === 'freefall') {
      // Belly to earth: arched, arms out and bent up, knees bent.
      pitch = 1.5;
      const wob = Math.sin(this.phase * 0.9) * 0.08;
      armL = -1.5 + wob;
      armR = -1.5 - wob;
      armSpread = 1.25;
      elbowL = elbowR = -0.9;
      legL = 0.35 - wob;
      legR = 0.35 + wob;
      kneeL = kneeR = 1.1;
    } else if (s.pose === 'canopy') {
      // Hands up on the toggles, legs dangling.
      armL = armR = -2.75;
      armSpread = 0.4;
      elbowL = elbowR = -0.3;
      const sw = Math.sin(this.phase * 0.5) * 0.12;
      legL = 0.1 + sw;
      legR = -0.05 - sw;
      kneeL = kneeR = 0.25;
    }

    if (s.ko) {
      pitch = -1.5;
      spinnerY = 0.3;
      armL = armR = -2.9;
      armSpread = 0.6;
      legL = legR = 0;
      kneeL = 0.3;
      kneeR = 0.05;
      elbowL = elbowR = -0.4;
    }

    let punchArm: 'armL' | 'armR' | null = null;
    if (this.punchT > 0) {
      this.punchT -= dt;
      punchArm = this.punchLeft ? 'armL' : 'armR';
      if (this.punchLeft) {
        armL = -1.6;
        elbowL = -0.05;
      } else {
        armR = -1.6;
        elbowR = -0.05;
      }
      roll = 0;
    }

    this.spin = 0;

    const k = Math.min(1, dt * 14);
    p.legL.pivot.rotation.x += (legL - p.legL.pivot.rotation.x) * k;
    p.legR.pivot.rotation.x += (legR - p.legR.pivot.rotation.x) * k;
    p.armL.pivot.rotation.x += (armL - p.armL.pivot.rotation.x) * k;
    p.armR.pivot.rotation.x += (armR - p.armR.pivot.rotation.x) * k;
    p.armL.pivot.rotation.z += (armSpread - p.armL.pivot.rotation.z) * k;
    p.armR.pivot.rotation.z += (-armSpread - p.armR.pivot.rotation.z) * k;
    if (punchArm) p[punchArm].pivot.rotation.x = punchArm === 'armL' ? armL : armR;
    const j = this.voxel?.joints;
    if (j) {
      j.kneeL.rotation.x += (kneeL - j.kneeL.rotation.x) * k;
      j.kneeR.rotation.x += (kneeR - j.kneeR.rotation.x) * k;
      j.elbowL.rotation.x += (elbowL - j.elbowL.rotation.x) * k;
      j.elbowR.rotation.x += (elbowR - j.elbowR.rotation.x) * k;
    }

    this.spinner.rotation.z += (0 - this.spinner.rotation.z) * k;

    if (this.spin !== 0) this.spinner.rotation.x = this.spin;
    else this.spinner.rotation.x += (pitch - this.spinner.rotation.x) * k;
    this.spinner.position.y += (spinnerY * hipK - this.spinner.position.y) * k;

    // Squash spring.
    this.squashVel += (-this.squash * 220 - this.squashVel * 14) * dt;
    this.squash += this.squashVel * dt;
    const sq = Math.max(-0.5, Math.min(0.6, this.squash));
    this.body.scale.set(1 + sq * 0.5, (1 - sq) * crouch, 1 + sq * 0.5);
  }

  dispose() {
    this.voxel?.dispose();
  }
}
