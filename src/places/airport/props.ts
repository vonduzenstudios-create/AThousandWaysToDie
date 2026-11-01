import * as THREE from 'three';
import { RAPIER, G_ALL, G_PROP, groups } from '../../physics';
import { canvasTexture, noiseTexture, turnToward } from '../../util';
import { Character } from '../../character';
import type { Frame } from './frame';

export const lambert = (color: THREE.ColorRepresentation, map: THREE.Texture | null = noiseTexture()) =>
  new THREE.MeshLambertMaterial({ color, map });

export function boxMesh(w: number, h: number, d: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A flat sign: big first line, smaller lines after. */
export function signMesh(lines: string[], w: number, h: number, bg: string, fg: string, px = 64) {
  const W = Math.round(w * px), H = Math.round(h * px);
  const tex = canvasTexture(
    W,
    H,
    (c) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);
      c.fillStyle = fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      lines.forEach((line, i) => {
        const size = i === 0 ? H / (lines.length + 0.6) : H / (lines.length + 1.8);
        c.font = `bold ${Math.round(size)}px Arial Black, Impact, sans-serif`;
        c.fillText(line, W / 2, (H / (lines.length + 1)) * (i + 1), W - 10);
      });
    },
    false,
  );
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  return m;
}

/** Scrolling stripes for belts and walkways. */
export function beltTexture(rubber = '#26262a', stripe = '#3b3b42') {
  const tex = canvasTexture(16, 16, (c) => {
    c.fillStyle = rubber;
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = stripe;
    for (let i = 0; i < 16; i += 4) c.fillRect(0, i, 16, 2);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ------------------------------------------------------------------ people at posts

/** Which job's look each post wears. */
const POSTS = {
  tsa: 'TSA Agent',
  agent: 'Flight Attendant',
  ground: 'Ground Crew',
  pilot: 'Pilot',
  perfume: 'Influencer',
  bartender: 'Diner Cook',
  frank: 'Construction Worker',
} as const;

/** A non-possessable person who stands at their post (TSA lane, desk, bar). */
export class Actor {
  readonly ch: Character;
  constructor(scene: THREE.Scene, seed: number, role: keyof typeof POSTS, pos: THREE.Vector3, facing: number) {
    this.ch = Character.fromFile({ job: POSTS[role], age: 30 + (seed % 30) }, seed);
    this.ch.root.position.copy(pos);
    this.ch.root.rotation.y = facing;
    scene.add(this.ch.root);
  }
  update(dt: number, busy = 0) {
    this.ch.animate(dt, { speed: busy, grounded: true, state: 'ground', stateTime: 0, airTime: 0 });
  }
  dispose(scene: THREE.Scene) {
    scene.remove(this.ch.root);
    this.ch.dispose();
  }
}

// ------------------------------------------------------------------ doors

/** A staff door: a solid panel while locked, gone while open. Lives in design space. */
export class Door {
  readonly mesh: THREE.Mesh;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  open = false;
  tries = 0;
  constructor(
    scene: THREE.Scene,
    physics: RAPIER.World,
    f: Frame,
    readonly id: string,
    /** Design-space center of the doorway, at floor height. */
    readonly at: THREE.Vector3,
    /** Panel spans x (true) or z (false). */
    spanX: boolean,
    w: number,
    h: number,
    color: number,
    readonly allowed: () => boolean,
    readonly lockedLine: string,
    label?: string,
  ) {
    const c = f.p(at.x, at.y + h / 2, at.z);
    this.mesh = boxMesh(spanX ? w : 0.35, h, spanX ? 0.35 : w, lambert(color));
    this.mesh.position.copy(c);
    if (label) {
      const s = signMesh([label], Math.min(w, 2.4), 0.5, '#ffd23a', '#202020');
      s.position.set(0, h / 2 - 0.5, 0);
      if (spanX) s.position.z = 0.19;
      else {
        s.rotation.y = Math.PI / 2;
        s.position.x = 0.19;
      }
      this.mesh.add(s);
      const s2 = s.clone();
      if (spanX) s2.position.z = -0.19;
      else s2.position.x = -0.19;
      this.mesh.add(s2);
    }
    scene.add(this.mesh);
    this.body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, c.y, c.z));
    this.collider = physics.createCollider(
      RAPIER.ColliderDesc.cuboid(spanX ? w / 2 : 0.25, h / 2, spanX ? 0.25 : w / 2).setCollisionGroups(groups(G_PROP, G_ALL)),
      this.body,
    );
  }

  update() {
    const open = this.allowed();
    if (open !== this.open) {
      this.open = open;
      this.collider.setEnabled(!open);
      this.mesh.visible = !open;
    }
  }

  dispose(scene: THREE.Scene, physics: RAPIER.World) {
    scene.remove(this.mesh);
    physics.removeRigidBody(this.body);
  }
}

// ------------------------------------------------------------------ planes

export interface Waypoint {
  x: number;
  y: number;
  z: number;
  /** Speed at the start of this leg (units/s). */
  speed: number;
  /** Speed at the end of this leg (defaults to speed). */
  speedEnd?: number;
  /** Move tail first (pushback). */
  reverse?: boolean;
  /** Seconds to sit still on arrival. */
  hold?: number;
  /** Name for this leg so game logic can react ('spool', 'roll', 'climb'). */
  tag?: string;
}

function windowStrip(livery: string, stripe: string) {
  return canvasTexture(
    512,
    64,
    (c) => {
      c.fillStyle = '#f2f2ee';
      c.fillRect(0, 0, 512, 64);
      c.fillStyle = stripe;
      c.fillRect(0, 44, 512, 10);
      c.fillStyle = '#26303a';
      for (let x = 70; x < 470; x += 11) c.fillRect(x, 18, 6, 9);
      c.fillRect(30, 12, 12, 34); // door
      c.fillStyle = stripe;
      c.font = 'bold 15px Arial Black, Impact, sans-serif';
      c.textAlign = 'center';
      c.fillText(livery, 270, 41);
    },
    false,
  );
}

/**
 * A big chunky airliner. Local frame: nose toward +x, origin on the ground under the fuselage center.
 * Cabin floor is at y = 8 so it lines up with the jet bridges.
 */
export function airlinerMesh(livery = 'LAST CALL AIRLINES', stripe = '#c8302a', tail = 0xc8302a) {
  const g = new THREE.Group();
  const white = lambert(0xf0f0ea);
  const grey = lambert(0x9aa3ad);
  const dark = lambert(0x2a2a2e);
  const tailM = lambert(tail);
  const tex = windowStrip(livery, stripe);
  const sideMat = new THREE.MeshLambertMaterial({ map: tex });
  const sideMatFlip = new THREE.MeshLambertMaterial({ map: tex.clone() });
  sideMatFlip.map!.wrapS = THREE.RepeatWrapping;
  sideMatFlip.map!.repeat.x = -1;
  sideMatFlip.map!.needsUpdate = true;
  // Box UVs: +x, -x, +y, -y, +z, -z faces.
  const fus = new THREE.Mesh(new THREE.BoxGeometry(32, 4.6, 4.6), [white, white, white, grey, sideMat, sideMatFlip]);
  fus.position.set(0, 9.6, 0);
  fus.castShadow = true;
  g.add(fus);
  // Nose: stepped boxes, cockpit windows.
  const n1 = boxMesh(3, 4, 4, white);
  n1.position.set(17.5, 9.5, 0);
  const n2 = boxMesh(2, 3, 3, white);
  n2.position.set(20, 9.2, 0);
  const n3 = boxMesh(1.2, 1.8, 1.8, grey);
  n3.position.set(21.4, 9, 0);
  const cock = boxMesh(1.6, 0.7, 3.2, dark);
  cock.position.set(19.2, 10.7, 0);
  g.add(n1, n2, n3, cock);
  // Tail cone and fin.
  const t1 = boxMesh(4, 3.6, 3.6, white);
  t1.position.set(-18, 10.1, 0);
  const t2 = boxMesh(3, 2.4, 2.4, white);
  t2.position.set(-21.2, 10.7, 0);
  const fin = boxMesh(6, 7, 0.5, tailM);
  fin.position.set(-19.5, 15, 0);
  fin.rotation.z = -0.25;
  const hstab = boxMesh(3.5, 0.4, 12, white);
  hstab.position.set(-20.5, 11, 0);
  g.add(t1, t2, fin, hstab);
  // Wings with a little sweep, and engines.
  for (const s of [1, -1]) {
    const wing = boxMesh(7, 0.5, 15, white);
    wing.position.set(-2.5, 7.7, s * 9.6);
    wing.rotation.y = s * 0.28;
    const tip = boxMesh(1.4, 1.6, 0.4, tailM);
    tip.position.set(-5.5, 8.6, s * 17);
    g.add(wing, tip);
    for (const ez of [6.5, 12]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 4.6, 10), grey);
      eng.rotation.z = Math.PI / 2;
      eng.position.set(1 - ez * 0.28, 6.4, s * ez);
      eng.castShadow = true;
      const intake = new THREE.Mesh(new THREE.CircleGeometry(1.05, 10), dark);
      intake.rotation.y = Math.PI / 2;
      intake.position.set(3.35 - ez * 0.28, 6.4, s * ez);
      g.add(eng, intake);
    }
  }
  // Landing gear.
  const wheelGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.7, 10);
  const strut = (x: number, z: number) => {
    const st = boxMesh(0.4, 6.4, 0.4, grey);
    st.position.set(x, 4, z);
    g.add(st);
    for (const dz of [-0.45, 0.45]) {
      const wh = new THREE.Mesh(wheelGeo, dark);
      wh.rotation.x = Math.PI / 2;
      wh.position.set(x, 0.8, z + dz);
      g.add(wh);
    }
  };
  strut(15, 0);
  strut(-3, 3);
  strut(-3, -3);
  return g;
}

/**
 * An airliner with physics and a scripted route through design space.
 * Holds at the end of the route until restarted.
 */
export class Airliner {
  readonly group: THREE.Group;
  readonly body: RAPIER.RigidBody;
  /** Design-space position and heading (heading 0 = +z, PI/2 = +x). */
  readonly pos = new THREE.Vector3();
  heading = Math.PI / 2;
  pitch = 0;
  speed = 0;
  private route: Waypoint[] = [];
  private leg = 0;
  private legStart = new THREE.Vector3();
  private holdT = 0;
  tag = 'parked';
  done = true;
  private colliders: RAPIER.Collider[] = [];

  constructor(
    private scene: THREE.Scene,
    physics: RAPIER.World,
    private f: Frame,
    mesh: THREE.Group,
    x: number,
    z: number,
    heading = Math.PI / 2,
  ) {
    this.group = mesh;
    this.pos.set(x, 0, z);
    this.heading = heading;
    scene.add(mesh);
    this.body = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const cd = (hx: number, hy: number, hz: number, x: number, y: number, z: number) =>
      physics.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(groups(G_PROP, G_ALL)).setFriction(0.8),
        this.body,
      );
    this.colliders.push(cd(19, 2.3, 2.3, 0, 9.6, 0), cd(3.5, 0.3, 17, -2.5, 7.7, 0), cd(0.5, 3.2, 0.5, 15, 3.2, 0));
    this.sync(true);
  }

  setCollision(on: boolean) {
    for (const c of this.colliders) c.setEnabled(on);
  }

  /** Teleport and park. */
  park(x: number, z: number, heading: number) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.pitch = 0;
    this.speed = 0;
    this.route = [];
    this.done = true;
    this.tag = 'parked';
    this.group.visible = true;
    this.sync(true);
  }

  fly(route: Waypoint[]) {
    this.route = route;
    this.leg = 0;
    this.holdT = 0;
    this.done = false;
    this.legStart.copy(this.pos);
    this.tag = route[0]?.tag ?? 'taxi';
  }

  /** Design-space point in the plane's own frame (x forward, z right-ish). */
  local(p: THREE.Vector3) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    return { along: dx * fx + dz * fz, side: dx * fz - dz * fx, up: p.y - this.pos.y };
  }

  /** Design-space point at a local offset (along the nose, up, to the side). */
  offset(along: number, up: number, side: number, out = new THREE.Vector3()) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    return out.set(this.pos.x + fx * along + fz * side, this.pos.y + up, this.pos.z + fz * along - fx * side);
  }

  step(h: number) {
    if (!this.done) {
      const wp = this.route[this.leg];
      if (this.holdT > 0) {
        this.holdT -= h;
        this.speed = 0;
        if (this.holdT <= 0) this.nextLeg();
      } else {
        const total = this.legStart.distanceTo(new THREE.Vector3(wp.x, wp.y, wp.z)) || 1;
        const to = new THREE.Vector3(wp.x - this.pos.x, wp.y - this.pos.y, wp.z - this.pos.z);
        const left = to.length();
        const t = 1 - left / total;
        this.speed = wp.speed + ((wp.speedEnd ?? wp.speed) - wp.speed) * Math.max(0, Math.min(1, t));
        const stepLen = Math.max(0.5, this.speed) * h;
        if (left <= stepLen) {
          this.pos.set(wp.x, wp.y, wp.z);
          if (wp.hold) this.holdT = wp.hold;
          else this.nextLeg();
        } else {
          to.multiplyScalar(stepLen / left);
          this.pos.add(to);
          const flat = Math.hypot(to.x, to.z);
          if (flat > 1e-4) {
            let want = Math.atan2(to.x, to.z);
            if (wp.reverse) want += Math.PI;
            this.heading = turnToward(this.heading, want, 1.4 * h);
          }
          const wantPitch = flat > 1e-4 ? Math.atan2(to.y, flat) : 0;
          this.pitch += (wantPitch - this.pitch) * Math.min(1, h * 2);
        }
      }
    }
    this.sync(false);
  }

  private nextLeg() {
    this.leg++;
    this.legStart.copy(this.pos);
    if (this.leg >= this.route.length) {
      this.done = true;
      this.tag = 'done';
      this.speed = 0;
    } else this.tag = this.route[this.leg].tag ?? 'taxi';
  }

  sync(teleport: boolean) {
    const w = this.f.p(this.pos.x, this.pos.y, this.pos.z);
    const yaw = this.f.heading(this.heading) - Math.PI / 2; // mesh nose is +x local
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, this.pitch, 'YXZ'));
    this.group.position.copy(w);
    this.group.quaternion.copy(q);
    if (teleport) {
      this.body.setTranslation(w, true);
      this.body.setRotation(q, true);
    }
    this.body.setNextKinematicTranslation(w);
    this.body.setNextKinematicRotation(q);
  }

  dispose(physics: RAPIER.World) {
    this.scene.remove(this.group);
    physics.removeRigidBody(this.body);
  }
}

/** Orange de-icing truck with a cherry-picker boom. Local: cab toward +x. */
export function deicerMesh() {
  const g = new THREE.Group();
  const orange = lambert(0xf07a2a);
  const dark = lambert(0x2a2a2e);
  const bed = boxMesh(7, 2.4, 2.8, orange);
  bed.position.set(0, 1.9, 0);
  const cab = boxMesh(2.2, 2.2, 2.8, lambert(0xeeeeee));
  cab.position.set(4.6, 1.8, 0);
  const win = boxMesh(0.2, 0.9, 2.4, dark);
  win.position.set(5.75, 2.3, 0);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5, 10), lambert(0xd8d8d0));
  tank.rotation.z = Math.PI / 2;
  tank.position.set(-0.5, 3.6, 0);
  const boom = boxMesh(0.5, 0.5, 9, lambert(0xe0b030));
  boom.position.set(-2, 6.2, -3.6);
  boom.rotation.x = 0.55;
  const bucket = boxMesh(1.4, 1.2, 1.4, orange);
  bucket.position.set(-2, 8.4, -7.6);
  bucket.name = 'nozzle';
  g.add(bed, cab, win, tank, boom, bucket);
  for (const x of [-2.5, 3.5])
    for (const z of [-1.4, 1.4]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 10), dark);
      wh.rotation.x = Math.PI / 2;
      wh.position.set(x, 0.7, z);
      g.add(wh);
    }
  return g;
}

/** Baggage tug pulling carts. Local +x forward. */
export function tugMesh() {
  const g = new THREE.Group();
  const tug = boxMesh(2.4, 1.2, 1.6, lambert(0xe0b030));
  tug.position.set(0, 0.9, 0);
  g.add(tug);
  for (let i = 1; i <= 3; i++) {
    const cart = boxMesh(2.2, 0.4, 1.6, lambert(0x9aa3ad));
    cart.position.set(-i * 2.8, 0.6, 0);
    const bags = boxMesh(1.8, 0.8, 1.2, lambert([0x3a6fd8, 0xd8443a, 0x3aa65a][i - 1]));
    bags.position.set(-i * 2.8, 1.2, 0);
    g.add(cart, bags);
  }
  return g;
}

export const SUITCASE_COLORS = [0x3a6fd8, 0xd8443a, 0x3aa65a, 0xe0b030, 0x8a4ad8, 0x2a2a2a, 0xf07a2a, 0xe06aa0];

export function suitcaseMesh(color: number) {
  const g = new THREE.Group();
  const b = boxMesh(1.1, 0.75, 0.45, lambert(color));
  b.position.y = 0.38;
  const handle = boxMesh(0.4, 0.12, 0.1, lambert(0x222222, null));
  handle.position.y = 0.82;
  g.add(b, handle);
  return g;
}

