import * as THREE from 'three';
import { RAPIER, G_ALL, G_PROP, G_RAGDOLL, G_WORLD, groups } from './physics';
import type { Sound } from './audio';
import type { Character } from './character';
import type { PersonFile } from './deaths';
import type { Input } from './input';
import type { Particles } from './particles';
import type { LandEvent, Player, RideHandling } from './player';
import type { Interactable } from './props';
import { G } from './town';
import { canvasTexture, noiseTexture } from './util';

/**
 * Skateboards and bicycles you find lying around town. Hop on with E for faster movement,
 * and a fresh batch of ways to die: walls, ramps, wheelies, trains, and brittle hips.
 */

export type RideKind = 'skateboard' | 'bicycle';

const HANDLING: Record<RideKind, RideHandling> = {
  skateboard: { maxSpeed: 16, accel: 10, coast: 1.6, brake: 14, turnSlow: 4.2, turnFast: 2.6, jump: 12.5 },
  bicycle: { maxSpeed: 24, accel: 8, coast: 1.1, brake: 18, turnSlow: 3.4, turnFast: 1.7, jump: 9 },
};

/** Wall impact speeds: below `bail` you just stop, between you get thrown off, above `fatal` you die. */
const CRASH: Record<RideKind, { bail: number; fatal: number }> = {
  skateboard: { bail: 8, fatal: 13 },
  bicycle: { bail: 9, fatal: 16 },
};

/** Riders land bigger drops than walkers; wheels and knees soak it up. Above this you bail. */
const RIDER_SAFE_DROP = 8.5;

/** What the rides module needs from the game. */
export interface RideHost {
  player: Player;
  input: Input;
  sound: Sound;
  particles: Particles;
  character(): Character | null;
  body(): PersonFile | null;
  /** True while the player is alive in a body and in control. */
  alive(): boolean;
  kill(id: string, style: { kind: 'ragdoll'; vel: THREE.Vector3; spin?: number; bounce?: number }): void;
  toast(title: string, body: string, ms?: number): void;
  say(who: string, line: string, ms?: number): void;
  shake(amount: number): void;
  /** Break the rider's legs after a hard bail. */
  breakLegs(): void;
  /** True if a car (moving or not) is touching this point. Optional: maps without traffic leave it out. */
  carAt?(p: THREE.Vector3): boolean;
}

export interface Ramp {
  id: string;
  name: string;
  /** Bottom edge center (feet height). */
  base: THREE.Vector3;
  /** Uphill direction (unit, horizontal). */
  dir: THREE.Vector3;
  length: number;
  height: number;
  width: number;
  /** Launch speed up = speed along the ramp x kick. */
  kick: number;
}

const lambert = (color: THREE.ColorRepresentation, map: THREE.Texture | null = noiseTexture()) => new THREE.MeshLambertMaterial({ color, map });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const DECK_ART = ['#e0302a', '#2a7de0', '#20a060', '#f2c230', '#8a3ad0'];

function deckTexture(seed: number) {
  const bg = DECK_ART[seed % DECK_ART.length];
  return canvasTexture(16, 48, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, 16, 48);
    c.fillStyle = '#ffffff';
    // A tiny skull, because skateboards.
    c.fillRect(4, 18, 8, 7);
    c.fillRect(5, 25, 6, 3);
    c.fillStyle = bg;
    c.fillRect(5, 20, 2, 2);
    c.fillRect(9, 20, 2, 2);
    c.fillStyle = '#111111';
    for (let y = 2; y < 46; y += 6) c.fillRect(1, y, 14, 1);
  });
}

/** A skateboard: deck, grip tape, trucks and four wheels. Origin on the ground, forward +z. */
function buildSkateboard(seed: number) {
  const g = new THREE.Group();
  const deck = new THREE.Group();
  const grip = lambert(0x1e1e22);
  const art = new THREE.MeshLambertMaterial({ map: deckTexture(seed) });
  const top = box(0.46, 0.06, 1.2, grip, 0, 0.21, 0);
  const bottom = box(0.46, 0.03, 1.2, art, 0, 0.165, 0);
  const noseUp = box(0.46, 0.06, 0.18, grip, 0, 0.25, 0.66);
  noseUp.rotation.x = -0.45;
  const tailUp = box(0.46, 0.06, 0.18, grip, 0, 0.25, -0.66);
  tailUp.rotation.x = 0.45;
  deck.add(top, bottom, noseUp, tailUp);
  const metal = lambert(0xb0b4bb, null);
  const wheel = lambert(0xf0e6c8);
  for (const z of [-0.38, 0.38]) {
    deck.add(box(0.34, 0.05, 0.08, metal, 0, 0.13, z));
    for (const x of [-0.19, 0.19]) deck.add(box(0.1, 0.11, 0.11, wheel, x, 0.06, z));
  }
  g.add(deck);
  return { group: g, deck, wheels: [] as THREE.Object3D[], pitch: deck };
}

const BIKE_COLORS = [0xd8342c, 0x1fa3a8, 0xf2c230, 0x3a64d8, 0x2e9a48, 0xe86aa8];

/** A blocky bicycle. Origin on the ground under the middle, forward +z. Pitches around the rear wheel for wheelies. */
function buildBicycle(seed: number) {
  const g = new THREE.Group();
  const pitch = new THREE.Group();
  pitch.position.z = -0.55; // rear contact patch
  g.add(pitch);
  const frame = new THREE.Group();
  frame.position.z = 0.55;
  pitch.add(frame);
  const paint = lambert(BIKE_COLORS[seed % BIKE_COLORS.length]);
  const black = lambert(0x1c1c20);
  const chrome = lambert(0xc8ccd2, null);
  const wheels: THREE.Object3D[] = [];
  for (const z of [-0.55, 0.55]) {
    const w = new THREE.Group();
    w.position.set(0, 0.42, z);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 4, 10), black);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    w.add(tire);
    for (let i = 0; i < 3; i++) {
      const spoke = box(0.02, 0.68, 0.03, chrome);
      spoke.rotation.x = (i * Math.PI) / 3;
      w.add(spoke);
    }
    frame.add(w);
    wheels.push(w);
  }
  // Frame tubes.
  const tube = (len: number, x: number, y: number, z: number, rx: number) => {
    const t = box(0.07, len, 0.07, paint, x, y, z);
    t.rotation.x = rx;
    frame.add(t);
  };
  tube(0.85, 0, 0.72, 0.02, Math.PI / 2 - 0.15); // top tube
  tube(0.8, 0, 0.6, 0.12, 0.85); // down tube
  tube(0.55, 0, 0.66, -0.2, -0.3); // seat tube
  tube(0.6, 0, 0.42, -0.35, Math.PI / 2 + 0.6); // chain stay
  tube(0.55, 0, 0.72, 0.5, -0.25); // fork
  frame.add(box(0.26, 0.07, 0.36, black, 0, 1.0, -0.3)); // seat
  frame.add(box(0.04, 0.3, 0.04, chrome, 0, 0.88, -0.3)); // seat post
  frame.add(box(0.04, 0.3, 0.04, chrome, 0, 0.98, 0.56)); // stem
  frame.add(box(0.62, 0.05, 0.05, chrome, 0, 1.12, 0.56)); // handlebars
  for (const x of [-0.3, 0.3]) frame.add(box(0.06, 0.06, 0.12, black, x, 1.12, 0.56)); // grips
  frame.add(box(0.12, 0.12, 0.04, chrome, 0, 0.4, 0.02)); // chainring
  if (seed % 2 === 0) {
    // Front basket.
    const wicker = lambert(0xb78a55);
    frame.add(box(0.4, 0.04, 0.3, wicker, 0, 0.96, 0.8));
    frame.add(box(0.4, 0.22, 0.03, wicker, 0, 1.06, 0.95));
    frame.add(box(0.03, 0.22, 0.3, wicker, 0.2, 1.06, 0.8));
    frame.add(box(0.03, 0.22, 0.3, wicker, -0.2, 1.06, 0.8));
  }
  return { group: g, deck: frame, wheels, pitch };
}

/** Half extents of the loose physics box for each kind. */
const LOOSE_HALF: Record<RideKind, THREE.Vector3> = {
  skateboard: new THREE.Vector3(0.23, 0.12, 0.62),
  bicycle: new THREE.Vector3(0.15, 0.55, 0.9),
};

export class Ride {
  readonly group: THREE.Group;
  /** The part that spins for a kickflip (board) or carries the frame (bike). */
  readonly deck: THREE.Object3D;
  /** Pivot for wheelies. */
  readonly pitch: THREE.Object3D;
  readonly wheels: THREE.Object3D[];
  state: 'parked' | 'ridden' | 'loose' = 'parked';
  body: RAPIER.RigidBody | null = null;
  looseT = 0;
  readonly interactable: Interactable;

  constructor(
    readonly kind: RideKind,
    readonly home: THREE.Vector3,
    readonly homeYaw: number,
    seed: number,
  ) {
    const built = kind === 'skateboard' ? buildSkateboard(seed) : buildBicycle(seed);
    this.group = built.group;
    this.deck = built.deck;
    this.pitch = built.pitch;
    this.wheels = built.wheels;
    this.interactable = {
      id: '',
      pos: new THREE.Vector3(),
      radius: 1.8,
      prompt: kind === 'skateboard' ? 'Ride the skateboard' : 'Ride the bike',
      mesh: this.group,
      enabled: true,
    };
    this.park(home, homeYaw);
  }

  park(at: THREE.Vector3, yaw: number) {
    this.state = 'parked';
    this.group.position.copy(at);
    this.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.pitch.rotation.set(0, 0, 0);
    this.deck.rotation.z = 0;
    // Bikes lie on their side until someone picks them up; boards just sit there.
    if (this.kind === 'bicycle') {
      this.group.rotateZ(1.35);
      this.group.position.y += 0.12;
    }
    this.syncInteractable();
  }

  syncInteractable() {
    this.interactable.pos.set(this.group.position.x, Math.max(G, this.group.position.y - 0.3), this.group.position.z);
    this.interactable.enabled = this.state === 'parked';
  }
}

export class Rides {
  readonly rides: Ride[] = [];
  readonly ramps: Ramp[] = [];
  riding: Ride | null = null;
  private pushPhase = 0;
  private wheelieT = 0;
  private wheelieAngle = 0;
  private wheelieWarned = false;
  private flipT = -1;
  private crashed = false;
  private rampLaunch: Ramp | null = null;
  private airFlips = 0;
  private rollT = 0;
  private grindT = 0;
  private dareToldT = 0;
  readonly interactables: Interactable[] = [];
  /** Scene objects to drop when the map unloads (physics goes with the map's world). */
  private objs: THREE.Object3D[] = [];

  constructor(
    private scene: THREE.Scene,
    private physics: RAPIER.World,
    private host: RideHost,
    spots: { kind: RideKind; pos: THREE.Vector3; yaw: number }[],
    ramps: Ramp[],
  ) {
    spots.forEach((s, i) => {
      const r = new Ride(s.kind, s.pos.clone(), s.yaw, i * 3 + 1);
      r.interactable.id = `ride:${i}`;
      this.scene.add(r.group);
      this.objs.push(r.group);
      this.rides.push(r);
      this.interactables.push(r.interactable);
    });
    for (const rp of ramps) this.buildRamp(rp);
  }

  /** The standard Smallville layout: where boards and bikes lie around, and the two ramps. */
  static smallvilleLayout() {
    const v = (x: number, z: number) => new THREE.Vector3(x, G, z);
    const spots: { kind: RideKind; pos: THREE.Vector3; yaw: number }[] = [
      { kind: 'skateboard', pos: v(266.5, 234.5), yaw: 0.4 }, // outside the diner on Main St
      { kind: 'bicycle', pos: v(320.5, 246), yaw: 0 }, // Duke's Garage sidewalk
      { kind: 'skateboard', pos: v(208.5, 124.5), yaw: Math.PI / 2 }, // park path, near the kicker
      { kind: 'bicycle', pos: v(240, 55.5), yaw: Math.PI / 2 }, // Railroad Ave by the station
      { kind: 'bicycle', pos: v(350, 44.5), yaw: Math.PI / 2 }, // start of the Dare Ramp run-up
      { kind: 'skateboard', pos: v(191, 262.5), yaw: Math.PI / 2 }, // police station walk
      { kind: 'bicycle', pos: v(75.5, 200), yaw: 0 }, // Farm Rd
      { kind: 'skateboard', pos: v(330, 30.5), yaw: Math.PI / 2 }, // by the rail line
      { kind: 'skateboard', pos: v(200, 377), yaw: Math.PI / 2 }, // school field
      { kind: 'bicycle', pos: v(380, 371), yaw: Math.PI / 2 }, // Maple St
    ];
    const ramps: Ramp[] = [
      // The Dare Ramp sits in the open field east of the station (off the roads, so traffic is clear) and launches east.
      { id: 'dare', name: 'The Dare Ramp', base: v(380, 44.5), dir: new THREE.Vector3(1, 0, 0), length: 8, height: 5, width: 5, kick: 1.0 },
      // A friendly little kicker on the park path.
      { id: 'kicker', name: 'Park Kicker', base: v(218, 124.5), dir: new THREE.Vector3(1, 0, 0), length: 3.2, height: 1.3, width: 3, kick: 0.55 },
    ];
    return { spots, ramps };
  }

  // ------------------------------------------------------------- ramps
  private buildRamp(r: Ramp) {
    this.ramps.push(r);
    const yaw = Math.atan2(r.dir.x, r.dir.z);
    const slope = Math.atan2(r.height, r.length);
    const hyp = Math.hypot(r.length, r.height);
    const grp = new THREE.Group();
    grp.position.copy(r.base);
    grp.rotation.y = yaw;
    // Wedge: a triangular prism made from a custom geometry (local +z uphill).
    const w = r.width / 2, L = r.length, H = r.height;
    const verts = [
      // left side (x = -w)
      -w, 0, 0, -w, 0, L, -w, H, L,
      // right side
      w, 0, 0, w, H, L, w, 0, L,
      // slope (two triangles)
      -w, 0, 0, -w, H, L, w, H, L,
      -w, 0, 0, w, H, L, w, 0, 0,
      // back
      -w, 0, L, w, 0, L, w, H, L,
      -w, 0, L, w, H, L, -w, H, L,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const uv: number[] = [];
    for (let i = 0; i < verts.length; i += 3) uv.push(verts[i] + verts[i + 2] * 0.5, verts[i + 1] + verts[i + 2] * 0.5);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const plank = canvasTexture(16, 16, (c) => {
      c.fillStyle = '#b78a55';
      c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#9a7040';
      for (let y = 0; y < 16; y += 4) c.fillRect(0, y, 16, 1);
      c.fillStyle = '#c99a62';
      c.fillRect(3, 1, 4, 1);
      c.fillRect(10, 9, 3, 1);
    });
    plank.wrapS = plank.wrapT = THREE.RepeatWrapping;
    const wedge = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: plank, side: THREE.DoubleSide }));
    wedge.castShadow = true;
    wedge.receiveShadow = true;
    grp.add(wedge);
    // Painted lip stripe.
    const lip = box(r.width, 0.06, 0.4, lambert(0xf2c230, null), 0, H + 0.01, L - 0.2);
    grp.add(lip);
    if (r.id === 'dare') {
      const sign = canvasTexture(
        256,
        128,
        (c) => {
          c.fillStyle = '#1b1b1f';
          c.fillRect(0, 0, 256, 128);
          c.fillStyle = '#ff3b6b';
          c.font = 'bold 54px Impact, Arial Black, sans-serif';
          c.textAlign = 'center';
          c.fillText('DARE RAMP', 128, 62);
          c.fillStyle = '#9cf04a';
          c.font = 'bold 24px Arial, sans-serif';
          c.fillText('NO CHICKENS. NO HELMETS.', 128, 102);
        },
        false,
      );
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshLambertMaterial({ map: sign, side: THREE.DoubleSide }));
      board.position.set(w + 0.05, H * 0.4, L * 0.72);
      board.rotation.y = Math.PI / 2;
      grp.add(board);
    }
    this.scene.add(grp);
    this.objs.push(grp);

    // Physics: one slanted plank for the slope plus a solid block under the back half.
    const fixed = this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const mid = r.base.clone().addScaledVector(r.dir, L / 2);
    mid.y += H / 2 - 0.12 * Math.cos(slope);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-slope, yaw, 0, 'YXZ'));
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(w, 0.12, hyp / 2)
        .setTranslation(mid.x, mid.y, mid.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setCollisionGroups(groups(G_WORLD, G_ALL)),
      fixed,
    );
    // The block stays under the slope surface (top at 0.55 H, starting at 0.6 L) so it never pokes out as a wall.
    const back = r.base.clone().addScaledVector(r.dir, L * 0.8);
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(w, H * 0.275, L * 0.2)
        .setTranslation(back.x, r.base.y + H * 0.275, back.z)
        .setRotation({ x: qy.x, y: qy.y, z: qy.z, w: qy.w })
        .setCollisionGroups(groups(G_WORLD, G_ALL)),
      fixed,
    );
  }

  // ------------------------------------------------------------- mount / dismount
  /** Handle an interactable press. Returns true if it was a ride. */
  tryInteract(id: string) {
    if (!id.startsWith('ride:')) return false;
    const r = this.rides[Number(id.slice(5))];
    if (!r || r.state !== 'parked' || !this.host.alive()) return true;
    if (this.host.player.legsBroken) {
      this.host.toast('NOT WITH THOSE LEGS', 'You need working legs to ride. Scream for help first.', 2200);
      return true;
    }
    this.mount(r);
    return true;
  }

  private mount(r: Ride) {
    const pl = this.host.player;
    this.riding = r;
    r.state = 'ridden';
    r.syncInteractable();
    r.group.quaternion.identity();
    this.crashed = false;
    this.wheelieT = 0;
    this.wheelieAngle = 0;
    this.flipT = -1;
    this.rampLaunch = null;
    pl.setRide(HANDLING[r.kind]);
    this.host.sound.tone({ f: 500, f2: 900, dur: 0.12, type: 'square', vol: 0.12 });
    const body = this.host.body();
    if (r.kind === 'skateboard' && body?.physical === 'Feeble' && performance.now() > this.dareToldT) {
      this.dareToldT = performance.now() + 20000;
      this.host.say('Death', 'A skateboard. At your age. I will get the paperwork ready.', 3200);
    } else if (this.rides.filter((x) => x.state !== 'parked').length === 1 && performance.now() > this.dareToldT) {
      this.dareToldT = performance.now() + 60000;
      this.host.toast(r.kind === 'skateboard' ? 'SKATEBOARD' : 'BICYCLE', `Steer with the camera. Space to ${r.kind === 'skateboard' ? 'ollie, G in the air to kickflip' : 'hop, hold Shift to wheelie, T for the bell'}. E to hop off.`, 4200);
    }
  }

  /** Step off and leave the ride where you stand. */
  dismount() {
    const r = this.riding;
    if (!r) return;
    const pl = this.host.player;
    this.riding = null;
    pl.setRide(null);
    this.resetPose();
    const feet = pl.feet();
    const side = new THREE.Vector3(Math.cos(pl.facing), 0, -Math.sin(pl.facing)).multiplyScalar(0.7);
    r.park(new THREE.Vector3(feet.x + side.x, Math.max(feet.y, G), feet.z + side.z), pl.facing);
    if (r.kind === 'bicycle') {
      // Stand it up properly when you get off on purpose.
      r.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.facing);
      r.group.rotateZ(0.18);
      r.group.position.y = Math.max(feet.y, G);
    }
    r.syncInteractable();
  }

  /** Throw the ride away as a physics object (crashes and deaths). */
  private throwLoose(r: Ride, vel: THREE.Vector3, spin = 8) {
    r.state = 'loose';
    r.looseT = 0;
    r.syncInteractable();
    r.group.updateMatrixWorld(true);
    const p = r.group.position.clone();
    const half = LOOSE_HALF[r.kind];
    p.y += half.y + 0.05;
    const q = r.group.quaternion;
    const rnd = () => (Math.random() - 0.5) * 2;
    const body = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinvel(vel.x, vel.y, vel.z)
        .setAngvel({ x: rnd() * spin, y: rnd() * spin, z: rnd() * spin })
        .setCcdEnabled(true),
    );
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
        .setDensity(r.kind === 'bicycle' ? 0.6 : 0.8)
        .setFriction(0.6)
        .setRestitution(0.35)
        .setCollisionGroups(groups(G_PROP, G_WORLD | G_RAGDOLL | G_PROP)),
      body,
    );
    r.body = body;
    this.pitchOffset = half.y;
  }
  private pitchOffset = 0;

  private resetPose() {
    const ch = this.host.character();
    if (!ch) return;
    ch.body.rotation.y = 0;
  }

  /** The rider is dying: fling the ride. Called by the game's kill(). */
  onKilled(vel: THREE.Vector3) {
    const r = this.riding;
    if (!r) return;
    this.riding = null;
    this.host.player.setRide(null);
    this.resetPose();
    this.throwLoose(r, vel.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 3, 0)), 10);
  }

  /** A body change or ghost mode: drop whatever we were riding. */
  onBodyChanged() {
    if (this.riding) this.dismount();
  }

  private bail(title: string, sub: string, vel: THREE.Vector3) {
    const r = this.riding;
    if (!r) return;
    this.riding = null;
    const pl = this.host.player;
    pl.setRide(null);
    this.resetPose();
    this.throwLoose(r, vel.clone().multiplyScalar(1.1).add(new THREE.Vector3(0, 4, 0)), 12);
    pl.knock(vel.clone().setY(Math.max(vel.y, 7)));
    this.host.character()?.kick(0.6);
    this.host.sound.crunch();
    this.host.sound.whoosh();
    this.host.shake(0.4);
    this.host.toast(title, sub, 2200);
  }

  // ------------------------------------------------------------- crash / land / tricks (player hooks)
  onCrash(impact: number, normal: THREE.Vector3) {
    const r = this.riding;
    if (!r || this.crashed || !this.host.alive()) return;
    const c = CRASH[r.kind];
    const pl = this.host.player;
    const fwd = new THREE.Vector3(Math.sin(pl.facing), 0, Math.cos(pl.facing));
    const feeble = this.host.body()?.physical === 'Feeble';
    if (r.kind === 'skateboard' && feeble && impact >= 5) {
      this.crashed = true;
      this.hipShatter(normal.clone().multiplyScalar(5).add(new THREE.Vector3(0, 6, 0)));
      return;
    }
    if (impact >= c.bail && this.host.carAt?.(pl.position())) {
      // Rode into a car. The car wins.
      this.crashed = true;
      this.host.sound.splat();
      this.host.shake(1.0);
      const vel = normal.clone().multiplyScalar(impact * 0.5).add(new THREE.Vector3(0, 9 + impact * 0.3, 0)).addScaledVector(fwd, impact * 0.3);
      this.host.kill('sharetheroad', { kind: 'ragdoll', vel, spin: 14, bounce: 0.6 });
      return;
    }
    if (impact >= c.fatal) {
      this.crashed = true;
      this.host.sound.splat();
      this.host.shake(1.0);
      if (r.kind === 'bicycle') {
        // The bike stops. The rider keeps going, up and over whatever that was.
        const vel = fwd.clone().multiplyScalar(impact * 0.55).add(new THREE.Vector3(0, 14, 0));
        this.host.sound.tone({ f: 1800, dur: 0.25, type: 'sine', vol: 0.15 });
        this.host.kill('handlebars', { kind: 'ragdoll', vel, spin: 16, bounce: 0.5 });
      } else {
        // The board shoots out, the rider slaps the wall and peels off it.
        const vel = normal.clone().multiplyScalar(impact * 0.35).add(new THREE.Vector3(0, 4, 0));
        this.host.kill('boardmeeting', { kind: 'ragdoll', vel, spin: 6, bounce: 0.7 });
      }
      return;
    }
    if (impact >= c.bail) {
      this.crashed = true;
      const vel = fwd.clone().multiplyScalar(-impact * 0.4).addScaledVector(normal, 3);
      this.bail('BAILED', r.kind === 'bicycle' ? 'Bike: 1. You: 0.' : 'Walls are not a trick.', vel);
    } else {
      this.host.sound.tone({ f: 160, f2: 90, dur: 0.12, type: 'square', vol: 0.12 });
    }
  }

  private hipShatter(vel: THREE.Vector3) {
    this.host.sound.crunch();
    setTimeout(() => this.host.sound.crunch(), 90);
    this.host.sound.scream(0.8);
    this.host.shake(0.7);
    this.host.kill('actyourage', { kind: 'ragdoll', vel, spin: 7, bounce: 0.3 });
  }

  onTrick() {
    const r = this.riding;
    if (!r || r.kind !== 'skateboard' || this.flipT >= 0) return;
    this.flipT = 0;
    this.host.sound.whoosh();
  }

  /** Landing while riding. Returns true when handled (the normal fall rules are skipped). */
  onLand(e: LandEvent): boolean {
    const r = this.riding;
    if (!r || !this.host.alive()) return false;
    const pl = this.host.player;
    const ch = this.host.character();
    const ramp = this.rampLaunch;
    this.rampLaunch = null;
    const flipping = this.flipT >= 0 && this.flipT < 1;
    const flipped = this.airFlips;
    this.flipT = -1;
    this.airFlips = 0;
    const tier = pl.tier;
    const fatal = tier === 'Feeble' ? 7 : tier === 'Athlete' ? 11 : 9;
    const fwd = new THREE.Vector3(Math.sin(pl.facing), 0, Math.cos(pl.facing));
    if (r.kind === 'skateboard' && tier === 'Feeble' && e.drop >= 3) {
      this.hipShatter(fwd.clone().multiplyScalar(pl.horizSpeed() * 0.6).add(new THREE.Vector3(0, 5, 0)));
      return true;
    }
    if (e.drop >= fatal) {
      if (ramp) {
        this.host.sound.splat();
        this.host.shake(1.2);
        const impact = Math.sqrt(2 * 42 * e.drop);
        const vel = pl.vel.clone().multiplyScalar(1.2).setY(impact * 0.5);
        this.host.kill('kneecap', { kind: 'ragdoll', vel, spin: 14, bounce: 0.65 });
        return true;
      }
      // An ordinary big fall: the ride goes one way, the normal fall rules handle the body.
      this.bail('BAILED', '', fwd.clone().multiplyScalar(pl.horizSpeed() * 0.5));
      return false;
    }
    if (flipping && e.drop > 0.6) {
      this.bail('BAILED', 'Finish the kickflip before you land.', fwd.clone().multiplyScalar(pl.horizSpeed() * 0.6));
      return true;
    }
    if (e.drop >= RIDER_SAFE_DROP) {
      this.bail('BAILED HARD', 'Both legs broken. Scream (T) for help.', fwd.clone().multiplyScalar(pl.horizSpeed() * 0.5));
      this.host.breakLegs();
      return true;
    }
    // Landed it.
    const heavy = Math.min(e.drop / 8, 1);
    this.host.sound.land(heavy * 0.7);
    ch?.kick(0.15 + heavy * 0.35);
    if (e.drop > 1.5) this.host.particles.burst(pl.feet(), 6, 0xcdbf9a, 3, { life: 0.4, size: 0.15, gravity: 6 });
    if (flipped > 0) {
      this.host.sound.tone({ f: 660, f2: 990, dur: 0.15, type: 'square', vol: 0.12 });
      this.host.toast(flipped > 1 ? `${flipped}x KICKFLIP` : 'KICKFLIP', ramp ? `Off ${ramp.name}. Sick.` : 'Sick.', 1400);
    } else if (ramp && e.drop > 2.5) {
      this.host.toast('SENT IT', `${ramp.name}: ${e.drop.toFixed(1)} m of air.`, 1400);
    }
    return true;
  }

  // ------------------------------------------------------------- per-step logic
  /** Fixed-step: ramp launches, wheelies, grinding sparks, rolling sound. */
  step(h: number) {
    const r = this.riding;
    if (!r || !this.host.alive()) return;
    const pl = this.host.player;
    const feet = pl.feet();
    const sp = pl.horizSpeed();

    // Rode into water: the ride sinks, the rider swims.
    if (pl.swimming) {
      this.riding = null;
      pl.setRide(null);
      this.resetPose();
      this.throwLoose(r, pl.vel.clone().multiplyScalar(0.5), 3);
      this.host.toast('GLUG', r.kind === 'bicycle' ? 'Bikes do not float.' : 'Skateboards do not float. Apparently.', 1800);
      return;
    }

    if (pl.grounded) {
      // Ramp lips.
      for (const rp of this.ramps) {
        const rel = feet.clone().sub(rp.base);
        const along = rel.dot(rp.dir);
        const across = Math.abs(rel.x * rp.dir.z - rel.z * rp.dir.x);
        if (across > rp.width / 2 + 0.2 || along < rp.length - 1.4 || along > rp.length + 0.2) continue;
        const into = pl.vel.x * rp.dir.x + pl.vel.z * rp.dir.z;
        if (into < 5 || feet.y < rp.base.y + rp.height * 0.6) continue;
        pl.launchRide(into * rp.kick);
        this.rampLaunch = rp;
        this.host.sound.whoosh();
        this.host.sound.tone({ f: 220, f2: 520, dur: 0.3, type: 'sawtooth', vol: 0.08 });
        this.host.character()?.kick(-0.4);
        break;
      }
    }

    // Wheelies (bike, hold crouch).
    if (r.kind === 'bicycle') {
      const want = pl.grounded && (this.host.input.held('crouch') || this.host.input.held('sprint')) && sp > 3;
      if (want) {
        this.wheelieT += h;
        this.wheelieAngle = Math.min(0.35 + this.wheelieT * 0.28, 1.5);
        if (this.wheelieT > 2.2 && !this.wheelieWarned) {
          this.wheelieWarned = true;
          this.host.toast('EASY...', "You're leaning way too far back.", 1200);
        }
        if (this.wheelieT > 3.4 && sp > 7) {
          this.crashed = true;
          const back = new THREE.Vector3(-Math.sin(pl.facing), 0, -Math.cos(pl.facing));
          this.host.sound.crunch();
          this.host.shake(0.8);
          this.host.kill('wheelie', { kind: 'ragdoll', vel: back.multiplyScalar(4).add(new THREE.Vector3(0, 9, 0)).addScaledVector(pl.vel, 0.6), spin: 12, bounce: 0.4 });
          return;
        }
      } else {
        this.wheelieT = 0;
        this.wheelieWarned = false;
        this.wheelieAngle = Math.max(0, this.wheelieAngle - h * 5);
      }
    }

    // Kickflip progress.
    if (this.flipT >= 0) {
      this.flipT += h / 0.38;
      if (this.flipT >= 1) {
        this.airFlips++;
        this.flipT = -1;
      }
    }

    // Grinding the rails (cosmetic sparks; the train is not cosmetic).
    const grinding = r.kind === 'skateboard' && pl.grounded && sp > 5 && Math.abs(feet.z - 148.5) < 1.6;
    if (grinding) {
      this.grindT -= h;
      for (let i = 0; i < 2; i++)
        this.host.particles.emit(feet.clone().add(new THREE.Vector3(0, 0.15, 0)), new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 2, (Math.random() - 0.5) * 4).addScaledVector(pl.vel, -0.2), 0xffd040, { life: 0.3, size: 0.07, gravity: 12 });
      if (this.grindT <= 0) {
        this.grindT = 0.06;
        this.host.sound.noise({ dur: 0.08, vol: 0.12, type: 'highpass', freq: 3500 });
      }
    }

    // Rolling noise.
    if (pl.grounded && sp > 2) {
      this.rollT -= h;
      if (this.rollT <= 0) {
        if (r.kind === 'skateboard') {
          this.rollT = 0.09;
          this.host.sound.noise({ dur: 0.1, vol: 0.03 + sp * 0.003, type: 'bandpass', freq: 220 + sp * 12, q: 1.2 });
        } else {
          this.rollT = Math.max(0.08, 1.4 / sp);
          this.host.sound.tone({ f: 3200, dur: 0.02, type: 'square', vol: 0.025 });
        }
      }
    }
  }

  /** True when this train hit should be the ride-specific death. */
  get isRiding() {
    return this.riding !== null;
  }

  /** Bike bell (T on a bike). Returns true if it rang, so the game skips the scream. */
  bell() {
    if (this.riding?.kind !== 'bicycle') return false;
    this.host.sound.tone({ f: 2350, dur: 0.35, type: 'sine', vol: 0.18 });
    this.host.sound.tone({ f: 2350, dur: 0.35, type: 'sine', vol: 0.18, at: 0.16 });
    this.host.sound.tone({ f: 4700, dur: 0.2, type: 'sine', vol: 0.05 });
    return true;
  }

  // ------------------------------------------------------------- per-frame visuals
  /** Per frame, after the character has been animated and placed at the player's feet. */
  update(dt: number) {
    const v = new THREE.Vector3();
    for (const r of this.rides) {
      if (r.state === 'loose' && r.body) {
        const t = r.body.translation();
        const q = r.body.rotation();
        r.group.position.set(t.x, t.y - this.pitchOffset, t.z);
        r.group.quaternion.set(q.x, q.y, q.z, q.w);
        r.looseT += dt;
        const lv = r.body.linvel();
        v.set(lv.x, lv.y, lv.z);
        const lost = t.y < -10;
        if (lost || (r.looseT > 2 && (r.body.isSleeping() || (v.length() < 0.3 && r.looseT > 3))) || r.looseT > 8) {
          this.physics.removeRigidBody(r.body);
          r.body = null;
          if (lost) r.park(r.home, r.homeYaw);
          else {
            r.state = 'parked';
            r.group.position.y = Math.max(r.group.position.y, G);
            r.syncInteractable();
          }
        }
      }
      // Spin wheels of bikes being ridden.
      if (r === this.riding) for (const w of r.wheels) w.rotation.x += (this.host.player.horizSpeed() / 0.42) * dt;
    }

    const r = this.riding;
    const ch = this.host.character();
    if (!r || !ch) return;
    const pl = this.host.player;
    const feet = pl.feet();
    r.group.position.copy(feet);
    r.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.facing);
    const p = ch.parts;
    const sp = pl.horizSpeed();
    const pushing = pl.grounded && (Math.abs(this.host.input.moveX) + Math.abs(this.host.input.moveY) > 0.2) && sp < pl.ride!.maxSpeed * 0.95;
    const scale = ch.app.height;

    if (r.kind === 'skateboard') {
      // Sideways stance on the deck.
      ch.body.rotation.y = Math.PI / 2;
      ch.root.position.y = feet.y + 0.24;
      // Kickflip: the deck spins under the rider's feet.
      r.deck.rotation.z = this.flipT >= 0 ? this.flipT * Math.PI * 2 : 0;
      if (this.flipT >= 0) ch.root.position.y += 0.25;
      ch.spinner.rotation.x = 0;
      ch.spinner.rotation.z = pl.grounded ? 0.08 : 0;
      p.armL.pivot.rotation.z = 1.25;
      p.armR.pivot.rotation.z = -1.25;
      p.armL.pivot.rotation.x = -0.2;
      p.armR.pivot.rotation.x = 0.2;
      if (!pl.grounded) {
        p.legL.pivot.rotation.x = -0.5;
        p.legR.pivot.rotation.x = 0.5;
      } else if (pushing) {
        // Back foot kicks along the ground.
        this.pushPhase += dt * 7;
        p.legL.pivot.rotation.x = 0.15;
        p.legR.pivot.rotation.x = 0.35 + Math.sin(this.pushPhase) * 0.5;
      } else {
        p.legL.pivot.rotation.x = 0.2;
        p.legR.pivot.rotation.x = -0.2;
      }
    } else {
      // Sitting on the saddle, pedalling.
      ch.body.rotation.y = 0;
      const tilt = this.wheelieAngle * 0.5;
      r.pitch.rotation.x = -tilt;
      const seatY = 1.04 + tilt * 0.6;
      ch.root.position.y = feet.y + seatY - 0.8 * scale;
      ch.root.position.addScaledVector(new THREE.Vector3(Math.sin(pl.facing), 0, Math.cos(pl.facing)), -0.3 + tilt * 0.2);
      this.pushPhase += dt * (2 + sp * 0.9);
      const pedal = Math.sin(this.pushPhase) * 0.45;
      p.legL.pivot.rotation.x = -0.8 + pedal;
      p.legR.pivot.rotation.x = -0.8 - pedal;
      p.armL.pivot.rotation.x = -1.25;
      p.armR.pivot.rotation.x = -1.25;
      p.armL.pivot.rotation.z = 0.08;
      p.armR.pivot.rotation.z = -0.08;
      ch.spinner.rotation.x = 0.32 - tilt;
      ch.spinner.rotation.z = 0;
    }
  }

  dispose() {
    for (const o of this.objs) this.scene.remove(o);
    this.objs = [];
    this.riding = null;
    for (const r of this.rides) r.body = null;
  }

  /** The interactables to offer right now: parked rides, or nothing while riding (E hops off). */
  activeInteractables() {
    return this.riding ? [] : this.interactables;
  }
}
