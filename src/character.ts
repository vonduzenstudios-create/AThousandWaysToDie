import * as THREE from 'three';
import { buildVoxelBody, type VoxelBody } from './chars/build';
import { specFromFile } from './chars/spec';
import type { Expression } from './chars/spec';
import { canvasTexture, hexToCss, noiseTexture, pick, randRange, shadeHex, type Rng } from './util';

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

function faceTexture(app: Appearance) {
  return canvasTexture(8, 8, (c) => {
    c.fillStyle = hexToCss(app.skin);
    c.fillRect(0, 0, 8, 8);
    // brows
    c.fillStyle = hexToCss(app.hair);
    c.fillRect(1, 2, 2, 1);
    c.fillRect(5, 2, 2, 1);
    // eyes
    c.fillStyle = '#ffffff';
    c.fillRect(1, 3, 2, 1);
    c.fillRect(5, 3, 2, 1);
    c.fillStyle = '#1a1a2a';
    c.fillRect(2, 3, 1, 1);
    c.fillRect(5, 3, 1, 1);
    // nose
    c.fillStyle = hexToCss(shadeHex(app.skin, 0.82));
    c.fillRect(3, 4, 2, 1);
    // mouth
    c.fillStyle = '#5a1e1e';
    if (app.mouth === 0) c.fillRect(2, 6, 4, 1);
    else if (app.mouth === 1) {
      c.fillRect(2, 5, 1, 1);
      c.fillRect(3, 6, 2, 1);
      c.fillRect(5, 5, 1, 1);
    } else if (app.mouth === 2) c.fillRect(3, 5, 2, 2);
    else {
      c.fillRect(2, 6, 4, 1);
      c.fillStyle = '#ffffff';
      c.fillRect(3, 6, 1, 1);
    }
    if (app.beard) {
      c.fillStyle = hexToCss(app.hair);
      c.fillRect(0, 5, 1, 3);
      c.fillRect(7, 5, 1, 3);
      c.fillRect(1, 7, 6, 1);
      c.fillRect(1, 6, 1, 1);
      c.fillRect(6, 6, 1, 1);
    }
    if (app.glasses) {
      c.fillStyle = '#111111';
      c.fillRect(0, 3, 1, 1);
      c.fillRect(3, 3, 2, 1);
      c.fillRect(7, 3, 1, 1);
      c.strokeStyle = '#111111';
      c.lineWidth = 1;
      c.strokeRect(0.5, 2.5, 3, 2);
      c.strokeRect(4.5, 2.5, 3, 2);
    }
  });
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
  /** Hip height: the spinner pivots here for flips and dives. */
  readonly hip: number = 0.9;
  /** Uniform scale of root at rest (pancake/cube deaths scale relative to it). */
  readonly baseScale: number = 1;
  /** The detailed voxel model from src/chars, when built from a person's file. */
  readonly voxel: VoxelBody | null = null;

  /** Build a person whose look matches their scythe-vision file (job, age, health). */
  static fromFile(file: { job: string; age: number; physical?: string; mental?: string; name?: string }, seed?: number) {
    const vb = buildVoxelBody(specFromFile(file, seed));
    return new Character(null, vb);
  }

  readonly app: Appearance;

  constructor(app: Appearance | null, vb?: VoxelBody) {
    if (vb) {
      // Stand-in appearance so older code that reads app.height (head position etc.) still works.
      this.app = { ...randomAppearance(Math.random), height: vb.headTop / 1.96 };
      this.voxel = vb;
      this.parts = vb.parts as Record<PartName, Part>;
      this.mats.push(vb.material);
      this.body.add(vb.body);
      this.hip = vb.headTop * 0.46;
      this.body.position.y = -this.hip;
      this.spinner.position.y = this.hip;
      this.spinner.add(this.body);
      this.root.add(this.spinner);
      return;
    }
    app ??= randomAppearance(Math.random);
    this.app = app;
    this.baseScale = app.height;
    const noise = noiseTexture();
    const mat = (c: number) => {
      const m = new THREE.MeshLambertMaterial({ color: c, map: noise });
      this.mats.push(m);
      return m;
    };
    const w = app.width;
    const skin = mat(app.skin);
    const shirt = mat(app.shirt);
    const pants = mat(app.pants);
    const hairM = mat(app.hair);
    const face = new THREE.MeshLambertMaterial({ map: faceTexture(app) });
    this.mats.push(face);

    const add = (name: PartName, size: [number, number, number], pivotAt: [number, number, number], offset: [number, number, number], material: THREE.Material | THREE.Material[]) => {
      const pivot = new THREE.Group();
      pivot.position.set(...pivotAt);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...offset);
      mesh.castShadow = true;
      pivot.add(mesh);
      this.body.add(pivot);
      this.parts[name] = { pivot, mesh, size: new THREE.Vector3(...size) };
      return mesh;
    };

    const legW = 0.26 * Math.min(w, 1.2);
    add('legL', [legW, 0.8, 0.3], [0.16 * w, 0.8, 0], [0, -0.4, 0], pants);
    add('legR', [legW, 0.8, 0.3], [-0.16 * w, 0.8, 0], [0, -0.4, 0], pants);
    const torso = add('torso', [0.6 * w, 0.64, 0.34 * Math.max(1, w * 0.85)], [0, 0.8, 0], [0, 0.32, 0], shirt);
    const head = add('head', [0.52, 0.52, 0.52], [0, 1.44, 0], [0, 0.26, 0], [skin, skin, hairM, skin, face, skin]);
    add('armL', [0.2, 0.62, 0.22], [0.3 * w + 0.11, 1.38, 0], [0, -0.28, 0], shirt);
    add('armR', [0.2, 0.62, 0.22], [-(0.3 * w + 0.11), 1.38, 0], [0, -0.28, 0], shirt);

    // Hands and shoes.
    for (const n of ['armL', 'armR'] as PartName[]) {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.22), skin);
      hand.position.y = -0.36;
      this.parts[n].mesh.add(hand);
    }
    const shoeM = mat(app.shoes);
    for (const n of ['legL', 'legR'] as PartName[]) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(legW + 0.04, 0.14, 0.38), shoeM);
      shoe.position.set(0, -0.35, 0.04);
      this.parts[n].mesh.add(shoe);
    }
    // Belt line.
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.6 * w + 0.02, 0.06, 0.36 * Math.max(1, w * 0.85)), mat(0x2a1a10));
    belt.position.y = -0.3;
    torso.add(belt);

    // Hair styles.
    const hs = app.hairStyle;
    if (hs === 1 || hs === 4) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.56), hairM);
      top.position.y = 0.3;
      head.add(top);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.56, hs === 4 ? 0.62 : 0.3, 0.1), hairM);
      back.position.set(0, hs === 4 ? -0.04 : 0.12, -0.28);
      head.add(back);
    } else if (hs === 2) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.5), hairM);
      top.position.y = 0.42;
      head.add(top);
    } else if (hs === 3) {
      const mo = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.56), hairM);
      mo.position.y = 0.38;
      head.add(mo);
    }
    if (app.hat !== null) {
      const hm = mat(app.hat);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.2, 0.58), hm);
      crown.position.y = 0.36;
      head.add(crown);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.3), hm);
      brim.position.set(0, 0.28, 0.4);
      head.add(brim);
    }

    this.body.position.y = -0.9;
    this.spinner.position.y = 0.9;
    this.spinner.add(this.body);
    this.root.add(this.spinner);
    this.root.scale.setScalar(app.height);
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

    let legL = 0, legR = 0, armL = 0, armR = 0, armSpread = 0;
    let pitch = 0, roll = 0, spinnerY = 0.9, crouch = 1;
    const hipK = this.hip / 0.9;

    if (s.grounded && (st === 'ground' || st === 'locked')) {
      legL = swing;
      legR = -swing;
      armL = -swing * 0.8;
      armR = swing * 0.8;
    } else if (st === 'crawl') {
      pitch = 1.45;
      spinnerY = 0.3;
      const c = Math.sin(this.phase * 0.6) * 0.6 * Math.min(s.speed / 1.5, 1);
      armL = -2.6 + c;
      armR = -2.6 - c;
      legL = -c * 0.5;
      legR = c * 0.5;
    } else if (st === 'crouch') {
      crouch = 0.72;
      legL = swing * 0.5;
      legR = -swing * 0.5;
    } else if (st === 'slide' || st === 'bellyslide') {
      pitch = st === 'slide' ? -1.2 : 1.45;
      spinnerY = 0.35;
      armL = armR = -2.8;
    } else if (st === 'dive') {
      pitch = 1.3;
      armL = armR = -2.9;
      legL = legR = 0.2;
    } else if (st === 'longjump') {
      pitch = 0.5;
      armL = armR = -2.6;
      legL = 0.6;
      legR = -0.6;
    } else if (st === 'gpFreeze' || st === 'groundpound') {
      legL = legR = -1.4;
      armL = armR = -1.2;
      crouch = 0.8;
    } else if (st === 'wallkick') {
      armL = armR = -2.5;
      armSpread = 0.5;
    } else {
      // generic air: arms up, legs tucked
      armL = armR = -2.7;
      armSpread = 0.3;
      legL = 0.5;
      legR = -0.3;
    }

    if (s.ko) {
      pitch = -1.5;
      spinnerY = 0.3;
      armL = armR = -2.9;
      armSpread = 0.6;
      legL = legR = 0;
    }

    let punchArm: 'armL' | 'armR' | null = null;
    if (this.punchT > 0) {
      this.punchT -= dt;
      punchArm = this.punchLeft ? 'armL' : 'armR';
      if (this.punchLeft) armL = -1.6;
      else armR = -1.6;
      roll = 0;
    }

    // Flip spins replace the pose pitch.
    const flipDur = 0.75;
    if (st === 'backflip') this.spin = -Math.min(s.airTime / flipDur, 1) * Math.PI * 2;
    else if (st === 'triple') this.spin = Math.min(s.airTime / flipDur, 1) * Math.PI * 2;
    else if (st === 'gpFreeze') this.spin = Math.min(s.stateTime / 0.28, 1) * Math.PI * 2;
    else this.spin = 0;

    const k = Math.min(1, dt * 14);
    p.legL.pivot.rotation.x += (legL - p.legL.pivot.rotation.x) * k;
    p.legR.pivot.rotation.x += (legR - p.legR.pivot.rotation.x) * k;
    p.armL.pivot.rotation.x += (armL - p.armL.pivot.rotation.x) * k;
    p.armR.pivot.rotation.x += (armR - p.armR.pivot.rotation.x) * k;
    p.armL.pivot.rotation.z += (armSpread - p.armL.pivot.rotation.z) * k;
    p.armR.pivot.rotation.z += (-armSpread - p.armR.pivot.rotation.z) * k;
    if (punchArm) p[punchArm].pivot.rotation.x = punchArm === 'armL' ? armL : armR;

    if (st === 'sideflip') {
      roll = Math.min(s.airTime / flipDur, 1) * Math.PI * 2;
      this.spinner.rotation.z = roll;
    } else this.spinner.rotation.z += (0 - this.spinner.rotation.z) * k;

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
    if (this.voxel) {
      this.voxel.dispose();
      return;
    }
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of this.mats) {
      if (m.map && m.map !== noiseTexture()) m.map.dispose();
      m.dispose();
    }
  }
}
