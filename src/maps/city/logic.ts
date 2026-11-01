import * as THREE from 'three';
import { Character, randomAppearance, type Appearance } from '../../character';
import type { Interactable } from '../../props';
import { PLAYER_CENTER } from '../../player';
import { mulberry32, pick, type Rng } from '../../util';
import type { MapContext, MapRuntime } from '../types';
import type { CityLayout } from './build';
import { BoxBatch, Scenery, signMesh } from './mesh';
import { buildScenery } from './scenery';
import { AVES, G, MORTALIS, PARK, PIERS, RAIL, RAIL_PLATFORM, SITE, STREETS, SUBWAY, TUNNEL_FLOOR, WATER, blockRect } from './layout';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const STATUE_KEY = 'cestlavie-statues-v1';

/** A set-piece person (sax player, mob boss, foreman...). Not possessable; just scenery that acts. */
class Actor {
  readonly ch: Character;
  readonly pos: THREE.Vector3;
  facing: number;
  target: THREE.Vector3 | null = null;
  speed = 3;
  visible = true;
  lying = false;
  sitting = false;
  onArrive: (() => void) | null = null;
  constructor(
    private sc: Scenery,
    app: Appearance,
    pos: THREE.Vector3,
    facing = 0,
  ) {
    this.ch = new Character(app);
    this.pos = pos.clone();
    this.facing = facing;
    sc.add(this.ch.root);
  }
  walkTo(p: THREE.Vector3, speed = 3, onArrive?: () => void) {
    this.target = p.clone();
    this.speed = speed;
    this.onArrive = onArrive ?? null;
  }
  face(p: THREE.Vector3) {
    this.facing = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }
  update(dt: number) {
    let sp = 0;
    if (this.target) {
      const d = this.target.clone().sub(this.pos);
      d.y = 0;
      const len = d.length();
      if (len < 0.2) {
        this.target = null;
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.();
      } else {
        d.normalize();
        this.pos.addScaledVector(d, Math.min(len, this.speed * dt));
        this.facing = Math.atan2(d.x, d.z);
        sp = this.speed;
      }
    }
    this.ch.root.visible = this.visible;
    this.ch.root.position.copy(this.pos);
    if (this.sitting) this.ch.root.position.y -= 0.45;
    this.ch.root.rotation.set(this.lying ? -Math.PI / 2 : 0, this.facing, 0, 'YXZ');
    if (this.lying) this.ch.root.position.y += 0.3;
    this.ch.animate(dt, { speed: sp, grounded: true, state: 'ground', stateTime: 0, airTime: 0 });
  }
}

function look(rng: Rng, o: Partial<Appearance>): Appearance {
  return { ...randomAppearance(rng), ...o };
}

/** A train that runs along one axis with a kinematic collider. */
class Train {
  readonly group = new THREE.Group();
  readonly body;
  s: number;
  speed = 0;
  private wait: number;
  private dwell = 0;
  horn = false;
  constructor(
    sc: Scenery,
    readonly axis: 'x' | 'z',
    readonly lane: number,
    readonly y: number,
    readonly from: number,
    readonly to: number,
    readonly len: number,
    readonly cruise: number,
    private gap: number,
    colors: { body: number; stripe: number; window: number },
    readonly stopAt: number | null = null,
  ) {
    const b = new BoxBatch();
    const cars = Math.round(len / 14);
    for (let i = 0; i < cars; i++) {
      const cx = -len / 2 + 7 + i * 14;
      b.box(cx, 2.1, 0, 13.4, 3.2, 3, colors.body);
      b.box(cx, 1.3, 0, 13.42, 0.4, 3.02, colors.stripe);
      for (let wx = -5; wx <= 5; wx += 2.5) b.box(cx + wx, 2.6, 0, 1.6, 1, 3.04, colors.window);
      b.box(cx, 3.8, 0, 13, 0.3, 2.6, 0x8a8f96);
      for (const wx of [-5, 5]) for (const wz of [-1.1, 1.1]) b.box(cx + wx, 0.4, wz, 1, 0.8, 0.3, 0x111111);
    }
    b.box(len / 2 - 0.2, 2.6, 0, 0.3, 1.2, 2.2, 0xffffaa); // headlight panel
    const mesh = b.build();
    this.group.add(mesh);
    if (axis === 'z') this.group.rotation.y = -Math.PI / 2;
    sc.add(this.group);
    this.s = from;
    this.wait = gap * 0.4;
    const hx = axis === 'x' ? len / 2 : 1.5, hz = axis === 'x' ? 1.5 : len / 2;
    this.body = sc.mover(axis === 'x' ? from : lane, y + 2, axis === 'x' ? lane : from, hx, 2, hz);
    this.place();
  }
  private place() {
    const x = this.axis === 'x' ? this.s : this.lane, z = this.axis === 'x' ? this.lane : this.s;
    this.group.position.set(x, this.y, z);
    this.body.setNextKinematicTranslation({ x, y: this.y + 2, z });
  }
  get moving() {
    return this.speed > 3;
  }
  get front() {
    return this.s + Math.sign(this.to - this.from) * (this.len / 2);
  }
  step(h: number) {
    this.horn = false;
    const dir = Math.sign(this.to - this.from);
    if (this.wait > 0) {
      this.wait -= h;
      this.s = this.from - dir * this.len;
      this.speed = 0;
      if (this.wait <= 0) this.horn = true;
    } else if (this.dwell > 0) {
      this.dwell -= h;
      this.speed = 0;
      if (this.dwell <= 0) this.horn = true;
    } else {
      // Brake into the station, then pull away.
      let target = this.cruise;
      if (this.stopAt !== null) {
        const toStop = (this.stopAt - this.s) * dir;
        if (toStop > 0 && toStop < 40) target = Math.max(2, this.cruise * (toStop / 40));
        if (toStop > 0 && toStop < 0.6) {
          this.dwell = 6;
          this.s = this.stopAt;
        }
      }
      this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), 14 * h);
      if (this.dwell <= 0) this.s += dir * this.speed * h;
      if ((this.s - this.to) * dir > this.len) this.wait = this.gap;
    }
    this.place();
  }
  /** Is a feet position inside the train's volume (padded)? */
  contains(p: THREE.Vector3, pad = 0.5) {
    const along = this.axis === 'x' ? p.x : p.z;
    const across = this.axis === 'x' ? p.z : p.x;
    return Math.abs(along - this.s) < this.len / 2 + pad && Math.abs(across - this.lane) < 1.5 + pad && p.y > this.y - 1 && p.y < this.y + 4.2;
  }
}

/**
 * Props, set-piece people and the city's death puzzles. Everything the player changes
 * (a tipped sax player, a swinging crane, a spiked coffee) stays changed for the next body.
 */
export function setupCity(ctx: MapContext, L: CityLayout): MapRuntime {
  const { game } = ctx;
  const sc = new Scenery(ctx.scene, ctx.physics);
  const scenery = buildScenery(sc, L);
  const rng = mulberry32(2026);
  const actors: Actor[] = [];
  const actor = (o: Partial<Appearance>, pos: THREE.Vector3, facing = 0) => {
    const a = new Actor(sc, look(rng, o), pos, facing);
    actors.push(a);
    return a;
  };
  const items: Interactable[] = [];
  const item = (id: string, pos: THREE.Vector3, prompt: string, radius = 2.2, enabled = true) => {
    const it: Interactable = { id, pos, radius, prompt, enabled };
    items.push(it);
    return it;
  };
  const feet = () => game.player.feet();
  const alive = () => !!game.body && !!game.character;
  const job = () => game.body?.job as string | undefined;
  const sound = game.sound;
  let time = 0;

  // Per-body state resets whenever Gary jumps into someone new.
  let lastBody: unknown = null;
  const bodyState = { jacket: false, hotdogs: 0, scissors: false, phoneDropped: false, shoes: false, doorOpen: false, savedTier: null as null | string };
  // Gary's own knowledge survives bodies.
  let passwordKnown = false;

  // Player pinning (riding a rope, sitting in a potty) and carrying (standing on a moving thing).
  let pin: THREE.Vector3 | null = null;
  const carry = new THREE.Vector3();
  const applyPin = () => {
    if (!pin) return;
    game.player.body.setNextKinematicTranslation({ x: pin.x, y: pin.y + PLAYER_CENTER, z: pin.z });
    game.player.vel.set(0, 0, 0);
  };
  const ragdoll = (id: string, vel: THREE.Vector3, spin = 8, bounce = 0.45) => {
    pin = null;
    game.kill(id, { kind: 'ragdoll', vel, spin, bounce });
  };
  const burst = (p: THREE.Vector3, n: number, color: number, speed = 5, life = 0.8, size = 0.2, gravity = 10) => game.particles.burst(p, n, color, speed, { life, size, gravity });

  // ================================================================ trains
  const commuter = new Train(sc, 'z', RAIL.live + 0.5, G, RAIL.z0 - 30, RAIL.z1 + 40, 56, 30, 28, { body: 0x8a8f96, stripe: 0x1a3a8a, window: 0x223344 });
  const subway = new Train(sc, 'x', SUBWAY.trainZ + 0.5, TUNNEL_FLOOR, 40, 490, 56, 24, 22, { body: 0xb8bcc4, stripe: 0xd02a2a, window: 0x223344 }, 171);
  let hornCd = 0;

  // Rail yard samaritans: they sprint off the platform to tackle anyone on the live track.
  const P = RAIL_PLATFORM;
  const sams = [
    { a: actor({ shirt: 0x3a9a4a, hat: 0xffffff }, V(37, G + 1, 330), -Math.PI / 2), home: V(37, G + 1, 330), down: 0, cd: 0 },
    { a: actor({ shirt: 0xe0b030 }, V(37, G + 1, 362), -Math.PI / 2), home: V(37, G + 1, 362), down: 0, cd: 0 },
  ];
  const DODGES = ['dive', 'longjump', 'groundpound', 'gpFreeze', 'backflip', 'sideflip', 'slide', 'bellyslide', 'wallkick', 'triple'];
  const onLiveTrack = (p: THREE.Vector3) => Math.abs(p.x - (RAIL.live + 0.5)) < 2.4 && p.z > RAIL.z0 && p.z < RAIL.z1 && p.y < G + 2;

  // ================================================================ manhole worker
  const holeA = L.manholes[0];
  const worker = actor({ shirt: 0xf07a2a, hat: 0xf2c230, pants: 0x2c3e66 }, V(holeA.x + 3.5, G, holeA.z - 2.5), -Math.PI / 2);
  const cones = new BoxBatch();
  for (const m of L.manholes)
    for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) {
      cones.box(m.x + dx, G + 0.45, m.z + dz, 0.5, 0.9, 0.5, 0xf07a2a);
      cones.box(m.x + dx, G + 0.55, m.z + dz, 0.54, 0.15, 0.54, 0xffffff);
    }
  sc.add(cones.build());
  let heyCd = 0;
  let heyWarned = false;

  // ================================================================ subway sax and the third rail
  const saxHome = V(178.5, TUNNEL_FLOOR + 1, SUBWAY.platZ0 + 3);
  const sax = actor({ shirt: 0x8a4ad8, hat: 0x222222, glasses: true }, saxHome, Math.PI);
  const saxHorn = new BoxBatch().box(0.35, 1.0, 0.35, 0.18, 0.7, 0.18, 0xd8b45a).build();
  sax.ch.root.add(saxHorn);
  let saxAwayUntil = -1;
  let pullCd = 0;
  const tipIt = item('city:tip', saxHome.clone(), 'Tip the sax player $20', 2.4);
  const phonePos = V(186.5, TUNNEL_FLOOR + 1, SUBWAY.platZ0 + 0.6);
  item('city:dropphone', phonePos.clone(), 'Check your phone right at the platform edge', 2);
  const phoneMesh = sc.add(new BoxBatch().box(0, 0.05, 0, 0.35, 0.08, 0.6, 0x111111).box(0, 0.1, 0, 0.3, 0.02, 0.5, 0x6ab0ff).build());
  phoneMesh.visible = false;
  const phoneRest = V(186.5, TUNNEL_FLOOR, SUBWAY.liveRailZ + 0.9);
  const reachIt = item('city:reach', phoneRest.clone(), 'Reach for your phone (it is right by that rail)', 1.8, false);

  // ================================================================ Mortalis window washer rig
  const M = MORTALIS;
  const rigX = 302.5, rigZ = M.z0 - 2.5;
  const rigBottom = G + 0.3, rigTop = G + 128;
  const rigBody = sc.mover(rigX, rigBottom, rigZ, 3, 0.15, 0.8);
  const rig = new THREE.Group();
  {
    const b = new BoxBatch();
    b.box(0, 0, 0, 6, 0.3, 1.6, 0x9aa3ad);
    b.box(0, 1.1, -0.75, 6, 0.12, 0.1, 0xf2c230);
    b.box(0, 1.1, 0.75, 6, 0.12, 0.1, 0xf2c230);
    for (const x of [-2.9, 2.9]) for (const z of [-0.75, 0.75]) b.box(x, 0.55, z, 0.12, 1.1, 0.12, 0xf2c230);
    b.box(-2.3, 0.6, 0.3, 0.6, 0.9, 0.6, 0x5a6a7a); // winch motors
    b.box(2.3, 0.6, 0.3, 0.6, 0.9, 0.6, 0x5a6a7a);
    rig.add(b.build());
  }
  sc.add(rig);
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const cables = [-2.3, 2.3].map((x) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.08), cableMat);
    sc.add(c);
    return { mesh: c, x, cut: false };
  });
  // Davit arm on the tower roof the cables hang from.
  sc.add(new BoxBatch().box(rigX, rigTop + 18, M.z0 + 0.5, 8, 0.6, 7, 0x5a606a).build());
  const lenny = actor({ shirt: 0x2ab0b0, hat: 0x2a6ab0, pants: 0x3b3b3b }, V(rigX + 1.2, rigBottom + 0.15, rigZ), Math.PI);
  const squeegee = new BoxBatch().box(-0.35, 1.0, 0.35, 0.08, 0.9, 0.08, 0x333333).box(-0.35, 1.5, 0.35, 0.6, 0.12, 0.12, 0x2a2a2a).build();
  lenny.ch.root.add(squeegee);
  let rigY = rigBottom;
  let rigState: 'down' | 'up' | 'top' | 'lowering' | 'falling' | 'wrecked' = 'down';
  let rigT = 10;
  let rigTilt = 0;
  let rigVy = 0;
  let lennyAwayUntil = -1;
  const scissorsIt = item('city:scissors', V(300.5, G, M.z1 - 3), 'Take the big office scissors', 2);
  const squeegeeIt = item('city:squeegee', V(rigX, rigY, rigZ), "Toss Lenny's squeegee off the edge", 3, false);
  const cut1It = item('city:cable1', V(rigX - 2.3, rigY, rigZ), 'Cut the left cable', 1.8, false);
  const cut2It = item('city:cable2', V(rigX + 2.3, rigY, rigZ), 'Cut the right cable', 1.8, false);
  const onRig = () => {
    const f = feet();
    return Math.abs(f.x - rigX) < 3.1 && Math.abs(f.z - rigZ) < 1 && f.y > rigY - 0.6 && f.y < rigY + 1.2;
  };

  // ================================================================ Little Italy and the mob
  const busStop = V(AVES[1] + 6.5, G, STREETS[3] + 30.5);
  const delivery = actor({ shirt: 0xd8443a, hat: 0xd8443a }, busStop.clone().add(V(0.5, 0, 2)), -Math.PI / 2);
  item('city:eavesdrop', delivery.pos.clone(), 'Eavesdrop on the delivery guy', 2.6);
  const r14 = blockRect(1, 4);
  const pz = { x0: r14.x0, z0: r14.z0, x1: r14.x0 + 17, z1: r14.z0 + 14 };
  const pzDoor = V(pz.x0 + 9, G, pz.z0 - 1.5);
  const doorman = actor({ shirt: 0x222222, pants: 0x222222, width: 1.45, glasses: true }, V(pz.x0 + 9, G, pz.z0 + 1.2), Math.PI);
  const doorBlock = sc.solid(pz.x0 + 9, G + 1.5, pz.z0 + 0.5, 1.2, 1.5, 0.5);
  const passIt = item('city:password', pzDoor.clone(), 'Talk to the doorman', 2.4);
  const jacketIt = item('city:jacket', V(pz.x0 + 2.5, G, pz.z0 + 2), "Put on the jacket from the coat rack (it says VINNIE)", 1.8);
  {
    const rack = new BoxBatch().box(pz.x0 + 2.5, G + 1, pz.z0 + 1.5, 0.15, 2, 0.15, 0x4a2d1a).box(pz.x0 + 2.5, G + 1.4, pz.z0 + 1.5, 0.9, 1.1, 0.35, 0x5a3a20).build();
    sc.add(rack);
  }
  const backDoor = V(pz.x0 + 3.5, G, pz.z0 + 8.2);
  const fbi = actor({ shirt: 0x8a7a5a, pants: 0x6b5a3a, hat: 0x6b5a3a, glasses: true }, backDoor.clone(), Math.PI);
  const fbiBlock = sc.solid(pz.x0 + 3.5, G + 1.5, pz.z0 + 9.5, 1.2, 1.5, 0.5);
  let fbiAwayUntil = -1;
  item('city:marinara', V(pz.x0 + 5.5, G, pz.z0 + 6.5), 'Spill marinara on the guy in the trench coat', 2.2);
  const backRoom = { x0: pz.x0 + 1, x1: pz.x1 - 1, z0: pz.z0 + 10, z1: pz.z1 - 1 };
  const tony = actor({ shirt: 0xeeeeee, pants: 0x1e1e2a, width: 1.45, hair: 0x1d1612, hairStyle: 1 }, V(pz.x0 + 11.5, G, pz.z0 + 12.6), Math.PI);
  tony.sitting = true;
  const goons = [
    actor({ shirt: 0x222222, pants: 0x222222, width: 1.3, glasses: true }, V(pz.x0 + 9, G, pz.z0 + 12), Math.PI * 0.8),
    actor({ shirt: 0x222222, pants: 0x222222, width: 1.3 }, V(pz.x0 + 14, G, pz.z0 + 12), -Math.PI * 0.8),
  ];
  const goonHome = goons.map((g) => g.pos.clone());
  const insultIt = item('city:insult', V(pz.x0 + 11.5, G, pz.z0 + 11), "Insult Big Tony's mother", 2.2);
  let mobBusy = false;
  const pierEnd = V((PIERS.mob.x0 + PIERS.mob.x1) / 2 + 0.5, G, PIERS.mob.z1 - 14);
  const shoeMeshes: THREE.Object3D[] = [];
  // Harbor patrol boat circles past Pier 13 every two minutes.
  const boat = new THREE.Group();
  {
    const b = new BoxBatch();
    b.box(0, 0.6, 0, 3, 1.2, 8, 0xffffff);
    b.box(0, 0.65, 0, 3.05, 0.3, 8.05, 0x1a3a8a);
    b.box(0, 1.8, -0.6, 2.2, 1.4, 2.6, 0xdddddd);
    b.box(0, 2.7, -0.6, 0.6, 0.4, 0.6, 0xff3030);
    boat.add(b.build());
    const lbl = signMesh(['HARBOR PATROL'], 5, 0.8, '#1a3a8a', '#ffffff', { double: true });
    lbl.position.set(1.6, 1.4, 0);
    lbl.rotation.y = Math.PI / 2;
    boat.add(lbl);
  }
  sc.add(boat);
  const boatPos = () => {
    const a = (time / 120) * Math.PI * 2;
    return V(150 + Math.cos(a) * 80, WATER, 600 + Math.sin(a) * 30);
  };

  // ================================================================ construction site
  const S = SITE;
  const pivot = V(424.5, G + 26, 369.5);
  const ropeL = 22;
  let swinging = false;
  let swingT = 0;
  let swingAngle = 0;
  let prevBall = V(pivot.x, pivot.y - ropeL, pivot.z);
  const ballR = 1.3;
  const ball = sc.add(new THREE.Mesh(new THREE.IcosahedronGeometry(ballR, 1), new THREE.MeshLambertMaterial({ color: 0x2a2a2e, flatShading: true })));
  ball.castShadow = true;
  const ballBody = sc.mover(pivot.x, pivot.y - ropeL, pivot.z, ballR * 0.85, ballR * 0.85, ballR * 0.85);
  const chain = sc.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 0.15), new THREE.MeshLambertMaterial({ color: 0x444444 })));
  {
    // Crawler crane: tracks, cab and a lattice boom up to the pivot.
    const b = new BoxBatch();
    b.box(414, G + 0.8, 369.5, 6, 1.6, 9, 0x2a2a2a);
    b.box(414, G + 3, 369.5, 4.5, 3, 5, 0xf2c230);
    b.box(415.5, G + 3.4, 367.2, 1.4, 1.6, 0.1, 0x9ac8e8);
    const len = Math.hypot(pivot.x - 414, pivot.y - (G + 4));
    const ang = Math.atan2(pivot.y - (G + 4), pivot.x - 414);
    const boom = new BoxBatch().box(len / 2, 0, 0, len, 0.8, 0.8, 0xf2c230).build();
    boom.position.set(414, G + 4, 369.5);
    boom.rotation.z = ang;
    sc.add(boom);
    sc.add(b.build());
    sc.solid(414, G + 2, 369.5, 3, 2, 4.5);
  }
  const craneIt = item('city:crane', V(414.5, G, 364.5), 'Climb in the crane cab and start the wrecking ball', 2.4);
  const foremanHome = V(418.5, G, 352.5);
  const foreman = actor({ shirt: 0xeeeeee, hat: 0xeeeeee, pants: 0x2c3e66, width: 1.35 }, foremanHome, Math.PI / 2);
  let foremanAwayUntil = -1;
  let stopCd = 0;
  // Food truck outside the gate.
  {
    const b = new BoxBatch();
    b.box(404, G + 1.6, 342, 3, 2.6, 7, 0xeeeeee);
    b.box(404, G + 1.2, 342, 3.05, 0.4, 7.05, 0xd8443a);
    b.box(402.4, G + 2, 342, 0.1, 1.2, 3.4, 0x222222);
    for (const z of [339.5, 344.5]) for (const x of [402.6, 405.4]) b.box(x, G + 0.4, z, 0.4, 0.8, 0.8, 0x111111);
    sc.add(b.build());
    sc.solid(404, G + 1.5, 342, 1.5, 1.5, 3.5);
    const s = signMesh(['CAFFEINE & REGRET', 'food truck'], 5, 1.2, '#d8443a', '#ffffff', { double: true });
    s.position.set(402.3, G + 3.4, 342);
    s.rotation.y = Math.PI / 2;
    sc.add(s);
  }
  item('city:coffee', V(400.5, G, 342.5), "Spike the foreman's coffee with something from the truck", 2.4);
  // Cement mixer truck with a turning drum.
  const drum = new THREE.Group();
  {
    const b = new BoxBatch();
    b.box(424, G + 1.2, 382, 3, 1.4, 10, 0x3a3f48);
    b.box(424, G + 2.4, 378.2, 3, 2.4, 2.6, 0xeeeeee);
    for (const z of [378, 382, 385.5]) for (const x of [422.4, 425.6]) b.box(x, G + 0.5, z, 0.4, 1, 1, 0x111111);
    b.box(424, G + 3.4, 386.6, 1.2, 0.3, 1.6, 0x8a8f96); // chute lip platform
    b.box(425.8, G + 1.8, 386.6, 0.2, 3.6, 0.2, 0x8a8f96); // ladder rails (too far apart to climb: decoration)
    sc.add(b.build());
    const d = new BoxBatch();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      d.box(Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0, 1.1, 1.1, 6, i % 2 ? 0xf07a2a : 0xeeeeee);
    }
    const dm = d.build();
    drum.add(dm);
    drum.position.set(424, G + 3.4, 383);
    sc.add(drum);
    sc.solid(424, G + 2, 382, 1.5, 2, 5);
    sc.solid(424, G + 3.2, 386.6, 0.6, 0.2, 0.8);
  }
  item('city:mixer', V(424, G + 3.4, 386.6), 'Lean over and look into the turning drum', 1.6);
  // Porta potty under a tower crane.
  const pottyHome = V(442.5, G, 352.5);
  const potty = new THREE.Group();
  {
    const b = new BoxBatch();
    b.box(0, 1.3, 0, 1.8, 2.6, 1.8, 0x2a6ab0);
    b.box(0, 2.7, 0, 1.9, 0.2, 1.9, 0xeeeeee);
    b.box(0, 1.3, -0.92, 1.2, 2.2, 0.05, 0x1f4f88);
    potty.add(b.build());
    const s = signMesh(['JOHNNY ON THE SPOT'], 1.6, 0.5, '#ffffff', '#2a6ab0');
    s.position.set(0, 2.1, -0.95);
    s.rotation.y = Math.PI;
    potty.add(s);
    potty.position.copy(pottyHome);
    sc.add(potty);
  }
  const pottyCol = sc.solid(pottyHome.x, G + 1.3, pottyHome.z, 0.9, 1.3, 0.9);
  const hook = sc.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), cableMat));
  {
    const b = new BoxBatch();
    b.box(446.5, G + 22, 352.5, 1.6, 44, 1.6, 0xf2c230); // mast
    b.box(440, G + 44.5, 352.5, 22, 1.2, 1.2, 0xf2c230); // jib
    b.box(452, G + 44.5, 352.5, 6, 1.6, 1.6, 0x8a8f96); // counterweight
    b.box(446.5, G + 46, 352.5, 2.4, 2, 2.4, 0xf2c230); // cab
    sc.add(b.build());
    sc.solid(446.5, G + 22, 352.5, 0.8, 22, 0.8);
  }
  let pottyState: 'idle' | 'lifting' | 'falling' | 'smashed' = 'idle';
  let pottyT = 0;
  let pottyVy = 0;
  const pottyIt = item('city:potty', V(pottyHome.x, G, pottyHome.z - 1.6), 'Use the porta potty', 1.8);
  // The lunch beam at the top of the steel skeleton.
  const beamEnd = V(449.5, G + 30, 327.5);
  item('city:beam', beamEnd.clone(), 'Sit down and eat lunch on the beam', 2);
  {
    const s = signMesh(['OVERBUDGET TOWER', 'Coming 2019'], 8, 2, '#f2c230', '#111111', { double: true });
    s.position.set(S.x0 - 0.2, G + 4, 360);
    s.rotation.y = -Math.PI / 2;
    sc.add(s);
  }

  // ================================================================ the parade balloon
  const paradeX = AVES[4];
  const paradeZ0 = STREETS[0] + 6, paradeZ1 = STREETS[6] - 6;
  let balloonZ = paradeZ0 + 40;
  let balloonDir = 1;
  const balloon = new THREE.Group();
  {
    // Biscuit the inflatable dog.
    const b = new BoxBatch();
    b.box(0, 0, 0, 7, 6, 10, 0xd8b45a); // body
    b.box(0, 3.5, 5.5, 6, 6, 6, 0xd8b45a); // head
    b.box(0, 2.6, 8.8, 3, 2.4, 1.6, 0xf2e2b0); // snout
    b.box(0, 3.4, 9.7, 1.2, 0.9, 0.4, 0x222222); // nose
    for (const x of [-1.6, 1.6]) b.box(x, 5, 8.55, 0.9, 1.1, 0.2, 0x111111); // eyes
    for (const x of [-3.4, 3.4]) b.box(x, 5.5, 4.5, 1, 3.5, 2.4, 0x8a5a2b); // ears
    for (const x of [-2.4, 2.4]) for (const z of [-3.5, 3.5]) b.box(x, -4, z, 1.8, 3, 1.8, 0xd8b45a);
    b.box(0, 1.5, -6, 1.2, 1.2, 3, 0xd8b45a); // tail
    b.box(0, 0.2, 2.8, 7.1, 1.2, 1.4, 0xd02a2a); // collar
    balloon.add(b.build());
    sc.add(balloon);
  }
  const balloonY = G + 24;
  const handlers = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ a: actor({ shirt: 0xd02a2a, hat: 0xffffff }, V(paradeX + sx * 3, G, balloonZ + sz * 4)), ox: sx * 3, oz: sz * 4 })));
  const ropeMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
  const ropes = handlers.map(() => sc.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.06), ropeMat)));
  const loose = sc.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.08), ropeMat));
  const ropeIt = item('city:rope', V(paradeX, G, balloonZ - 6), 'Grab the loose balloon rope', 2.2);
  let balloonState: 'parade' | 'free' | 'popped' = 'parade';
  let freeT = 0;
  const balloonPos = V(paradeX + 0.5, balloonY, balloonZ);
  const spire = V(MORTALIS.x0 + (MORTALIS.x1 + 1 - MORTALIS.x0) / 2, G + 13 + 180 + 4 + 34, MORTALIS.z0 + (MORTALIS.z1 + 1 - MORTALIS.z0) / 2);
  let gustAt: number[] = [];
  let holding = false;

  // ================================================================ the pigeon lady
  const parkBench = L.benches.find((b) => b.pos.z < PARK.z0 + 10 && b.pos.x > PARK.x0 + 30) ?? L.benches[0];
  const lady = actor({ shirt: 0x8a8a8a, pants: 0x6b5a3a, hair: 0xcfcfcf, hairStyle: 2, hat: 0x8a4ad8, height: 0.92 }, parkBench.pos.clone().add(V(-0.5, 0, 0)), 0);
  lady.sitting = true;
  const crumbs = sc.add(new BoxBatch().box(0, 0.25, 0, 0.5, 0.5, 0.35, 0xd8c8a0).build());
  crumbs.position.copy(parkBench.pos).add(V(0.7, G - parkBench.pos.y + 0.6, 0));
  const pigeonGeo = new BoxBatch().box(0, 0.18, 0, 0.22, 0.25, 0.4, 0x8a8f96).box(0, 0.36, 0.18, 0.16, 0.16, 0.16, 0x5a6a7a).box(0, 0.36, 0.28, 0.06, 0.04, 0.1, 0xe0a020).build();
  const pigeons = Array.from({ length: 30 }, (_, i) => {
    const m = pigeonGeo.clone();
    const a = (i / 30) * Math.PI * 2;
    const home = parkBench.pos.clone().add(V(Math.cos(a) * (1.5 + (i % 4)), 0, 1.5 + Math.abs(Math.sin(a)) * 3));
    m.position.copy(home);
    sc.add(m);
    return { m, home, ph: Math.random() * 6 };
  });
  let swarm = 0; // 0 idle, >0 seconds into the swarm
  const crumbIt = item('city:crumbs', crumbs.position.clone().setY(G), "Steal the pigeon lady's breadcrumbs", 2);

  // ================================================================ hot dog cart
  const cartPos = V(PARK.x1 - 18.5, G, PARK.z1 + 3.5);
  {
    const b = new BoxBatch();
    b.box(cartPos.x, G + 0.9, cartPos.z, 3, 1.2, 1.6, 0xd0d4da);
    b.box(cartPos.x, G + 2.7, cartPos.z, 3.4, 0.1, 2, 0xd02a2a);
    b.box(cartPos.x - 1.6, G + 1.8, cartPos.z, 0.08, 1.8, 0.08, 0x888888);
    b.box(cartPos.x + 1.6, G + 1.8, cartPos.z, 0.08, 1.8, 0.08, 0x888888);
    for (const x of [-1, 1]) b.box(cartPos.x + x, G + 0.3, cartPos.z + 0.85, 0.6, 0.6, 0.1, 0x222222);
    sc.add(b.build());
    sc.solid(cartPos.x, G + 0.9, cartPos.z, 1.5, 0.9, 0.8);
    const s = signMesh(['HOT DOGS', '$3 · NO QUESTIONS'], 3.2, 0.9, '#f2c230', '#d02a2a', { double: true });
    s.position.set(cartPos.x, G + 3.3, cartPos.z);
    sc.add(s);
  }
  const vendor = actor({ shirt: 0xeeeeee, hat: 0xeeeeee, beard: true, width: 1.4 }, cartPos.clone().add(V(0, 0, -1.6)), 0);
  const dogIt = item('city:hotdog', cartPos.clone().add(V(0, 0, 1.9)), 'Buy a hot dog ($3)', 2);

  // ================================================================ statue on the plinth (from past cement deaths)
  let statue: Character | null = null;
  const showStatue = (app: Appearance) => {
    if (statue) sc.scene.remove(statue.root);
    statue = new Character(app);
    statue.tint(0x9a9a92, 0.92);
    statue.root.position.copy(L.statuePlinth);
    statue.root.rotation.y = Math.PI;
    statue.parts.armR.pivot.rotation.x = -2.6;
    sc.add(statue.root);
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STATUE_KEY) ?? '[]') as { map: string; app: Appearance }[];
    const mine = saved.filter((s) => s.map === 'city');
    if (mine.length) showStatue(mine[mine.length - 1].app);
  } catch {
    /* no statues yet */
  }
  const plaque = signMesh(['IN MEMORY OF', 'SOMEONE WHO FELL IN'], 2.4, 0.8, '#3a3f48', '#e8d8a0');
  plaque.position.set(L.statuePlinth.x, G + 1, L.statuePlinth.z - 1.55);
  plaque.rotation.y = Math.PI;
  sc.add(plaque);

  // ================================================================ helpers for sequences
  const sayIf = (who: string, line: string, ms = 3000) => game.say(who, line, ms);
  const strobe = (n: number, color = '#ffffff') => {
    for (let i = 0; i < n; i++) setTimeout(() => game.flash(i % 2 ? '#000000' : color, 70), i * 90);
  };
  const gunfire = () => {
    for (let i = 0; i < 14; i++) {
      sound.noise({ dur: 0.05, vol: 0.5, freq: 1800, type: 'highpass', at: i * 0.07 });
      sound.tone({ f: 90, f2: 40, dur: 0.06, type: 'square', vol: 0.25, at: i * 0.07 });
    }
  };

  // ================================================================ interact
  const interact = (id: string) => {
    if (!alive()) return;
    const ch = game.character!;
    const me = game.body!;
    const p = feet();
    switch (id) {
      case 'city:tip': {
        if (time < saxAwayUntil) return;
        if (!game.spend(20, 'Tip for the sax player')) return;
        sound.cash();
        sayIf('Sax player', "Twenty bucks? Lunch is on you, friend. Don't touch nothin'.", 3200);
        saxAwayUntil = time + 150;
        sax.walkTo(V(SUBWAY.stairX0 + 9, TUNNEL_FLOOR + 1, SUBWAY.platZ0 + 3), 3, () => (sax.visible = false));
        return;
      }
      case 'city:dropphone': {
        if (bodyState.phoneDropped) return;
        bodyState.phoneDropped = true;
        sound.tone({ f: 900, f2: 300, dur: 0.3, type: 'triangle', vol: 0.2 });
        phoneMesh.visible = true;
        phoneMesh.position.copy(phonePos).add(V(0, 0.8, 0));
        game.toast('OOPS', 'Your phone slipped out of your hand and onto the tracks.', 2600);
        reachIt.enabled = true;
        return;
      }
      case 'city:reach': {
        game.player.lock(true);
        sound.zap(1.8);
        game.runSeq([
          ...Array.from({ length: 18 }, (_, i) => ({
            at: i * 0.08,
            fn: () => {
              ch.flash(i % 2 === 0);
              ch.kick(i % 2 ? 0.5 : -0.5);
              game.flash(i % 2 ? '#000000' : '#bfe6ff', 70);
              burst(p.clone().add(V(0, 0.5, 0)), 4, 0x9ad8ff, 6, 0.3, 0.1, 0);
              if (i === 9 && time > saxAwayUntil) sound.tone({ f: 1568, dur: 0.6, type: 'sawtooth', vol: 0.18 });
            },
          })),
          { at: 1.5, fn: () => (ch.flash(false), ch.tint(0x111111, 0.7)) },
          { at: 1.6, fn: () => ragdoll('city-thirdrail', V(0, 7, -2), 10, 0.4) },
        ]);
        return;
      }
      case 'city:scissors':
        bodyState.scissors = true;
        sound.pull();
        game.toast('SCISSORS', 'Big, sharp, and property of Mortalis Mutual.', 2200);
        return;
      case 'city:squeegee':
        if (time < lennyAwayUntil) return;
        sound.whoosh();
        sayIf('Lenny', "HEY! That's my good squeegee! Don't move, I'm going down the stairs to get it!", 3500);
        lennyAwayUntil = time + 120;
        lenny.visible = false;
        return;
      case 'city:cable1': {
        if (!bodyState.scissors) {
          game.toast('NEED SOMETHING SHARP', 'These cables laugh at fingernails. Mortalis keeps scissors in the lobby.', 3000);
          return;
        }
        cables[0].cut = true;
        sound.crunch();
        sound.creak();
        rigTilt = 0.28;
        game.shake(0.6);
        if (time > lennyAwayUntil) {
          game.player.lock(true);
          sayIf('Lenny', 'WHOA whoa WHOA, buddy! Not on my watch!', 2600);
          game.runSeq([
            {
              at: 1.2,
              fn: () => {
                game.player.lock(false);
                game.player.teleport(V(rigX, G + 13 + 120 + 0.6, M.z0 + 8), 0);
                game.toast('GRABBED', 'Lenny hauled you onto the roof. Get him away from the rig first.', 3200);
                cables[0].cut = false;
                rigTilt = 0;
              },
            },
          ]);
        } else game.toast('*twang*', 'One cable left. The rig is hanging at an angle that is frankly rude.', 2600);
        return;
      }
      case 'city:cable2': {
        if (!bodyState.scissors) return;
        cables[1].cut = true;
        sound.crunch();
        rigState = 'falling';
        rigVy = 0;
        game.player.lock(true);
        game.runSeq([
          { at: 0.25, fn: () => (sound.scream(1.2), game.toast('WINDOW WASHER', 'The board of directors watched the whole thing.', 2400)) },
          { at: 0.6, fn: () => ragdoll('city-windowwasher', V(0, -4, -3), 6, 0.5) },
        ]);
        return;
      }
      case 'city:eavesdrop':
        sound.blip(0.8);
        sayIf('Delivery guy', "...yeah, yeah. Tell Tony 'the cannoli is fresh'. Same as every week. Capisce?", 4200);
        passwordKnown = true;
        return;
      case 'city:password': {
        if (bodyState.doorOpen) return;
        if (!passwordKnown) {
          sound.denied();
          sayIf('Doorman', "Password. ...No? Then we're closed. For you, we're always closed.", 3200);
          return;
        }
        sayIf(me.name, 'The cannoli is fresh.', 1600);
        setTimeout(() => sayIf('Doorman', "...Go on in. Don't touch the back room.", 2600), 1500);
        bodyState.doorOpen = true;
        doorBlock.setEnabled(false);
        doorman.walkTo(V(pz.x0 + 12, G, pz.z0 + 1.5), 2, () => (doorman.facing = Math.PI));
        return;
      }
      case 'city:jacket':
        bodyState.jacket = true;
        ch.tint(0x5a3a20, 0.35);
        sound.whoosh();
        game.toast("VINNIE'S JACKET", "Fits great. Smells like a guy who talks to the FBI.", 2600);
        return;
      case 'city:marinara':
        if (time < fbiAwayUntil) return;
        sound.splat();
        burst(fbi.pos.clone().add(V(0, 1.2, 0)), 30, 0xb02a2a, 4, 0.8, 0.15, 10);
        sayIf('Man in trench coat', "Oh come ON. This is a rental. ...I'll be back.", 2800);
        fbiAwayUntil = time + 180;
        fbi.walkTo(pzDoor.clone().add(V(0, 0, -6)), 3, () => (fbi.visible = false));
        fbiBlock.setEnabled(false);
        return;
      case 'city:insult':
        if (mobBusy) return;
        if (bodyState.jacket) return mobHit();
        return sleepWithFishes();
      case 'city:crane':
        if (job() !== 'Construction Worker' && job() !== 'Foreman') {
          sound.denied();
          game.toast('UNION MEMBERS ONLY', "You'd need to be a Construction Worker to touch that crane.", 3000);
          return;
        }
        swinging = !swinging;
        sound.pull();
        game.toast(swinging ? 'WRECKING BALL: ON' : 'WRECKING BALL: OFF', swinging ? 'It keeps swinging after you leave. Nobody here checks.' : 'The ball settles.', 2600);
        return;
      case 'city:coffee':
        if (time < foremanAwayUntil) return;
        sound.gulp();
        sayIf('Foreman', '*sip* ...ahh, good coffee. ...Uh oh. UH OH. Where is the porta potty?!', 3600);
        foremanAwayUntil = time + 150;
        foreman.walkTo(pottyHome.clone().add(V(0, 0, -1.5)), 6, () => (foreman.visible = false));
        return;
      case 'city:mixer': {
        game.player.lock(true);
        sound.splat();
        game.runSeq([
          { at: 0.1, fn: () => game.toast('*SPLORP*', 'You fell into the drum. It is turning. You are turning.', 2400) },
          ...Array.from({ length: 16 }, (_, i) => ({
            at: 0.3 + i * 0.12,
            fn: () => {
              ch.tint(0x9a9a92, (i + 1) / 16);
              ch.root.rotation.z += 0.6;
              sound.crunch();
            },
          })),
          {
            at: 2.4,
            fn: () => {
              ch.root.rotation.z = 0;
              try {
                const saved = JSON.parse(localStorage.getItem(STATUE_KEY) ?? '[]') as { map: string; app: Appearance; name: string }[];
                saved.push({ map: 'city', app: ch.app, name: me.name });
                // Smallville's park reads this list too: the statue turns up there with a plaque.
                saved.push({ map: 'smallville', app: ch.app, name: me.name });
                localStorage.setItem(STATUE_KEY, JSON.stringify(saved.slice(-8)));
              } catch {
                /* storage blocked */
              }
              showStatue(ch.app);
              ragdoll('city-statue', V(0, 6, 4), 3, 0.15);
            },
          },
        ]);
        return;
      }
      case 'city:potty': {
        if (pottyState !== 'idle') return;
        pottyState = 'lifting';
        pottyT = 0;
        pin = V(pottyHome.x, G, pottyHome.z);
        pottyCol.setEnabled(false);
        game.player.lock(true);
        ch.root.visible = false;
        sound.creak();
        game.toast('OCCUPIED', 'Ahh, privacy. ...Why is the floor moving?', 2600);
        return;
      }
      case 'city:beam': {
        game.player.lock(true);
        sound.munch();
        game.runSeq([
          { at: 0.3, fn: () => game.toast('LUNCH BREAK', 'Pastrami on rye, 30 floors up. Extra pepper.', 2000) },
          { at: 1.6, fn: () => sayIf(me.name, 'Ah... ahh...', 1200) },
          { at: 2.6, fn: () => sayIf(me.name, 'AHHH-CHOO!', 1200) },
          { at: 2.8, fn: () => (sound.whoosh(), ragdoll('city-beam', V(4, 3, (Math.random() - 0.5) * 3), 9)) },
        ]);
        return;
      }
      case 'city:rope': {
        if (balloonState !== 'parade') return;
        balloonState = 'free';
        freeT = 0;
        holding = true;
        pin = feet();
        game.player.lock(true);
        gustAt = [4, 9];
        sayIf('Parade handler', "He's got the rope! CUT IT LOOSE before it drags all of us!", 3000);
        sound.creak();
        for (const h of handlers) h.a.walkTo(h.a.pos.clone().add(V(Math.sign(h.ox) * 6, 0, 0)), 4);
        return;
      }
      case 'city:crumbs': {
        if (swarm > 0) return;
        swarm = 0.01;
        game.player.lock(true);
        sayIf('Pigeon lady', 'MY CRUMBS! Babies... GET HIM!', 2600);
        sound.scream(1.6);
        return;
      }
      case 'city:hotdog': {
        if (!game.spend(3, 'Hot dog')) return;
        bodyState.hotdogs++;
        sound.munch();
        const n = bodyState.hotdogs;
        const lines = [
          '',
          'Tastes like chicken. Or pork. Or pigeon.',
          'That one had a bone in it. Hot dogs do not have bones.',
          'Your stomach makes a noise like the subway.',
          'You can taste colors now.',
          'The vendor is looking at you with respect and fear.',
        ];
        if (n < 6) {
          game.toast(`HOT DOG #${n}`, lines[n], 2200);
          ch.kick(0.4);
          if (n >= 4) ch.tint(0x8acf5a, (n - 3) * 0.2);
          if (n === 5) sayIf('Vendor', "Nobody's ever finished the cart. Nobody.", 2600);
          return;
        }
        game.player.lock(true);
        const torso = ch.parts.torso.pivot;
        game.runSeq([
          ...Array.from({ length: 20 }, (_, i) => ({
            at: 0.2 + i * 0.07,
            fn: () => {
              torso.scale.set(1 + i * 0.06, 1 + i * 0.03, 1 + i * 0.06);
              ch.kick(0.3);
            },
          })),
          { at: 1.7, fn: () => (sound.splat(), game.shake(0.8), burst(feet().add(V(0, 1, 0)), 40, 0xc0603a, 9, 1.2, 0.22)) },
          { at: 1.75, fn: () => ragdoll('city-hotdog', V(0, 10, 0), 12, 0.5) },
        ]);
        return;
      }
    }
  };

  const mobHit = () => {
    mobBusy = true;
    const ch = game.character!;
    game.player.lock(true);
    for (const g of goons) g.face(feet());
    sayIf('Big Tony', 'Vinnie...? VINNIE, YOU RAT!', 2000);
    game.runSeq([
      { at: 1.2, fn: () => gunfire() },
      ...Array.from({ length: 12 }, (_, i) => ({
        at: 1.2 + i * 0.08,
        fn: () => {
          ch.kick(i % 2 ? 0.6 : -0.6);
          game.flash(i % 2 ? '#ffe9a0' : '#000000', 60);
          burst(feet().add(V(0, 1.2, 0)), 4, 0xffffff, 6, 0.3, 0.1, 0);
        },
      })),
      { at: 2.3, fn: () => ragdoll('city-mobhit', V(0, 5, -9), 9, 0.4) },
      { at: 2.6, fn: () => sayIf('Big Tony', "...That wasn't Vinnie. Somebody get a mop.", 3000) },
      { at: 6, fn: () => (mobBusy = false) },
    ]);
  };

  const sleepWithFishes = () => {
    mobBusy = true;
    const ch = game.character!;
    const me = game.body!;
    game.player.lock(true);
    sayIf(me.name, "Hey Tony. Your mother's lasagna? Store bought.", 2400);
    game.runSeq([
      { at: 2.2, fn: () => sayIf('Big Tony', '...Take him for a ride. The long one.', 2600) },
      { at: 4.6, fn: () => game.flash('#000000', 900) },
      {
        at: 5,
        fn: () => {
          // Off to Pier 13 in the van.
          game.player.teleport(pierEnd, Math.PI);
          goons[0].pos.copy(pierEnd).add(V(-1.6, 0, -2));
          goons[1].pos.copy(pierEnd).add(V(1.6, 0, -2));
          for (const g of goons) g.face(pierEnd);
          // Cement shoes.
          for (const leg of [ch.parts.legL, ch.parts.legR]) {
            const shoe = new BoxBatch().box(0, -0.75, 0.05, 0.55, 0.45, 0.7, 0x9a9a92).build();
            leg.pivot.add(shoe);
            shoeMeshes.push(shoe);
          }
          bodyState.shoes = true;
          bodyState.savedTier = game.player.tier;
          game.player.tier = 'Feeble';
          sound.stamp();
          game.toast('CEMENT SHOES', 'Very heavy. Very fashionable. Watch for the harbor patrol.', 3600);
        },
      },
      {
        at: 6.6,
        fn: () => {
          game.player.lock(false);
          sayIf('Goon', 'Walk. Off the end. Nice and slow.', 2800);
        },
      },
      { at: 12, fn: () => (mobBusy = false) },
    ]);
  };

  const removeShoes = () => {
    for (const s of shoeMeshes) s.parent?.remove(s);
    shoeMeshes.length = 0;
    if (bodyState.shoes && bodyState.savedTier) game.player.tier = bodyState.savedTier as typeof game.player.tier;
    bodyState.shoes = false;
    for (let i = 0; i < goons.length; i++) goons[i].pos.copy(goonHome[i]);
  };

  const resetBody = () => {
    removeShoes();
    bodyState.jacket = false;
    bodyState.hotdogs = 0;
    bodyState.scissors = false;
    bodyState.phoneDropped = false;
    bodyState.doorOpen = false;
    bodyState.savedTier = null;
    phoneMesh.visible = false;
    reachIt.enabled = false;
    doorBlock.setEnabled(true);
    doorman.pos.set(pz.x0 + 9, G, pz.z0 + 1.2);
    doorman.target = null;
    doorman.facing = Math.PI;
    pin = null;
    holding = false;
    heyWarned = false;
    // Set pieces that grab the player let go of the new body.
    if (swarm > 0) swarm = Math.max(swarm, 11.9);
  };

  // ================================================================ per-frame updates
  const update = (dt: number, t: number) => {
    time = t;
    if (game.body !== lastBody) {
      lastBody = game.body;
      resetBody();
    }
    scenery.tick(dt, t);

    // Steam from manholes and vents.
    if (Math.random() < dt * 10) {
      const s = pick(Math.random, L.steam);
      game.particles.emit(s.clone().add(V(0, 0.2, 0)), V(0, 2.5, 0), 0xdddddd, { life: 1.8, size: 0.5, gravity: -0.6, spread: 0.6 });
    }

    // Returning helpers.
    if (!sax.visible && time > saxAwayUntil) {
      sax.visible = true;
      sax.pos.copy(saxHome);
    }
    if (!lenny.visible && time > lennyAwayUntil) lenny.visible = true;
    if (!fbi.visible && time > fbiAwayUntil) {
      fbi.visible = true;
      fbi.pos.copy(backDoor);
      fbiBlock.setEnabled(true);
    }
    if (!foreman.visible && time > foremanAwayUntil) {
      foreman.visible = true;
      foreman.pos.copy(foremanHome);
    }
    tipIt.enabled = sax.visible;

    // Sax player sways; doorman and Tony idle.
    sax.ch.root.rotation.z = Math.sin(t * 3) * 0.08;

    // Window washer rig.
    const rigPrev = rigY;
    if (rigState === 'down') {
      rigT -= dt;
      if (rigT <= 0) rigState = 'up';
    } else if (rigState === 'up') {
      rigY = Math.min(rigTop, rigY + 4 * dt);
      if (rigY >= rigTop) (rigState = 'top'), (rigT = 40);
    } else if (rigState === 'top') {
      rigT -= dt;
      if (rigT <= 0 && !cables[0].cut) rigState = 'lowering';
    } else if (rigState === 'lowering') {
      rigY = Math.max(rigBottom, rigY - 4 * dt);
      if (rigY <= rigBottom) (rigState = 'down'), (rigT = 15);
    } else if (rigState === 'falling') {
      rigVy -= 30 * dt;
      rigY = Math.max(rigBottom, rigY + rigVy * dt);
      rigTilt += dt * 2;
      if (rigY <= rigBottom) {
        rigState = 'wrecked';
        rigT = 25;
        sound.crunch();
        burst(V(rigX, G + 0.5, rigZ), 40, 0x9aa3ad, 8);
      }
    } else if (rigState === 'wrecked') {
      rigT -= dt;
      if (rigT <= 0) {
        rigState = 'down';
        rigT = 10;
        rigTilt = 0;
        cables[0].cut = cables[1].cut = false;
        rigY = rigBottom;
      }
    }
    rigBody.setNextKinematicTranslation({ x: rigX, y: rigY, z: rigZ });
    rig.position.set(rigX, rigY, rigZ);
    rig.rotation.z = Math.min(rigTilt, 1.2);
    for (const c of cables) {
      const top = rigTop + 18;
      const len = c.cut ? 4 : top - rigY;
      c.mesh.scale.y = Math.max(0.1, len);
      c.mesh.position.set(rigX + c.x, c.cut ? top - 2 : rigY + len / 2, rigZ);
    }
    if (lenny.visible) {
      lenny.pos.set(rigX + 1.2, rigY + 0.15, rigZ);
      lenny.facing = Math.PI;
    }
    const atTop = rigState === 'top' || (rigState === 'up' && rigY > rigTop - 4);
    const riding = alive() && onRig();
    squeegeeIt.enabled = riding && lenny.visible;
    cut1It.enabled = riding && atTop && !cables[0].cut;
    cut2It.enabled = riding && atTop && cables[0].cut && !cables[1].cut;
    for (const it of [squeegeeIt, cut1It, cut2It]) it.pos.y = rigY + 0.15;
    if (riding && rigState !== 'falling') carry.y += rigY - rigPrev;

    // Wrecking ball pendulum.
    if (swinging) swingT += dt;
    const targetAmp = swinging ? 0.62 : 0;
    swingAngle += ((targetAmp * Math.sin(swingT * 0.7)) - swingAngle) * Math.min(1, dt * (swinging ? 6 : 1.2));
    const bpos = V(pivot.x + Math.sin(swingAngle) * ropeL, pivot.y - Math.cos(swingAngle) * ropeL, pivot.z);
    ball.position.copy(bpos);
    ballBody.setNextKinematicTranslation({ x: bpos.x, y: bpos.y, z: bpos.z });
    chain.scale.y = ropeL;
    chain.position.copy(pivot).lerp(bpos, 0.5);
    chain.rotation.z = swingAngle;
    const ballDelta = bpos.clone().sub(prevBall);
    // Impact with the half-demolished wall.
    const hitWall = bpos.x + ballR > 430 && prevBall.x + ballR <= 430;
    prevBall = bpos;
    if (hitWall) {
      sound.crunch();
      game.shake(0.3);
      burst(V(430, bpos.y, bpos.z), 18, 0xa8513b, 7);
    }
    if (alive()) {
      const f = feet();
      const onBall = Math.hypot(f.x - bpos.x, f.z - bpos.z) < ballR + 0.3 && f.y > bpos.y + ballR * 0.5 && f.y < bpos.y + ballR + 0.9;
      if (onBall) {
        carry.add(ballDelta);
        // The rider reaches the wall a moment before the ball does.
        if (ballDelta.x > 0 && bpos.x + ballR > 428.4) {
          sound.crunch();
          game.shake(1);
          burst(V(430, bpos.y + 1, bpos.z), 40, 0xa8513b, 9);
          ragdoll('city-wreckingball', V(18, 9, (Math.random() - 0.5) * 6), 14, 0.5);
        }
      }
      // The foreman yells STOP if he sees anyone near the swinging ball.
      if (swinging && time > foremanAwayUntil && f.distanceTo(bpos) < 7 && time > stopCd) {
        stopCd = time + 4;
        swinging = false;
        sayIf('Foreman', 'STOP! STOP THE CRANE! Are you out of your mind?!', 3000);
        sound.denied();
      }
    }
    craneIt.prompt = swinging ? 'Stop the wrecking ball' : 'Climb in the crane cab and start the wrecking ball';

    // Porta potty lift.
    if (pottyState === 'lifting') {
      pottyT += dt;
      const y = G + Math.min(40, Math.max(0, pottyT - 2.5) * 7);
      potty.position.set(pottyHome.x + Math.sin(pottyT * 1.8) * Math.min(1.5, pottyT * 0.3), y, pottyHome.z);
      potty.rotation.z = Math.sin(pottyT * 2.3) * 0.12;
      if (pin) pin.copy(potty.position);
      if (pottyT > 2.5 && pottyT - dt <= 2.5) game.toast('*CLUNK*', 'Something hooked onto the roof.', 1800);
      if (pottyT > 9) {
        pottyState = 'falling';
        pottyVy = 0;
        sound.creak();
        sayIf('Crane operator', "Oops. Wrong button.", 1800);
      }
    } else if (pottyState === 'falling') {
      pottyVy -= 34 * dt;
      potty.position.y += pottyVy * dt;
      if (pin) pin.copy(potty.position);
      if (pin && potty.position.y < G + 18 && game.character) {
        game.character.root.visible = true;
        ragdoll('city-potty', V(0, pottyVy * 0.6, 0), 10, 0.6);
      }
      if (potty.position.y <= G) {
        potty.position.y = G;
        potty.rotation.z = 1.4;
        pottyState = 'smashed';
        pottyT = 0;
        sound.splat();
        game.shake(0.6);
        burst(potty.position.clone().add(V(0, 1, 0)), 40, 0x2a6ab0, 9);
        burst(potty.position.clone().add(V(0, 1, 0)), 25, 0x6a5a2a, 6);
      }
    } else if (pottyState === 'smashed') {
      pottyT += dt;
      if (pottyT > 25) {
        pottyState = 'idle';
        potty.position.copy(pottyHome);
        potty.rotation.set(0, 0, 0);
        pottyCol.setEnabled(true);
      }
    }
    hook.visible = pottyState === 'lifting';
    if (hook.visible) {
      const top = G + 44;
      const len = Math.max(0.5, top - (potty.position.y + 2.8));
      hook.scale.y = len;
      hook.position.set(potty.position.x, potty.position.y + 2.8 + len / 2, potty.position.z);
    }
    pottyIt.enabled = pottyState === 'idle';

    // Parade balloon.
    if (balloonState === 'parade') {
      balloonZ += balloonDir * 2.2 * dt;
      if (balloonZ > paradeZ1) balloonDir = -1;
      if (balloonZ < paradeZ0) balloonDir = 1;
      balloonPos.set(paradeX + 0.5, balloonY + Math.sin(t * 0.8) * 0.6, balloonZ);
      balloon.rotation.y = balloonDir > 0 ? 0 : Math.PI;
      handlers.forEach((h) => {
        if (!h.a.target) {
          h.a.pos.set(paradeX + h.ox, G, balloonZ + h.oz);
          h.a.facing = balloonDir > 0 ? 0 : Math.PI;
        }
      });
    } else if (balloonState === 'free') {
      freeT += dt;
      // Up and away, drifting toward the Mortalis spire.
      const to = spire.clone().sub(balloonPos);
      const horiz = V(to.x, 0, to.z);
      if (horiz.length() > 1 && balloonPos.y > 175) balloonPos.addScaledVector(horiz.normalize(), Math.min(horiz.length(), 10 * dt));
      balloonPos.y = Math.min(spire.y + 2, balloonPos.y + 11 * dt);
      if (holding && alive()) {
        const tier = game.player.tier;
        // Gusts: hold Jump to hang on.
        if (gustAt.length && freeT > gustAt[0]) {
          gustAt.shift();
          game.toast('GUST!', 'Hold JUMP to hang on!', 1400);
          sound.whoosh();
          const startT = freeT;
          const check = () => {
            if (!holding) return;
            if (!game.input.held('jump') || tier === 'Feeble') letGo('Your grip gave out in the gust.');
            else if (freeT - startT < 1.2) requestAnimationFrame(check);
          };
          setTimeout(check, 350);
        }
        if (tier === 'Normal' && freeT > 10) letGo("These arms aren't built for this. You let go. Only an Athlete could hang on.");
        if (tier === 'Feeble' && freeT > 2) letGo('Those old hands let go right away.');
        if (holding && balloonPos.distanceTo(spire) < 8) {
          balloonState = 'popped';
          freeT = 0;
          sound.splat();
          sound.boing();
          game.shake(1);
          burst(balloonPos.clone(), 80, 0xd8b45a, 14, 1.5, 0.4, 6);
          for (const c of [0xff4040, 0x40c0ff, 0xffe040, 0x40ff80]) burst(balloonPos.clone(), 30, c, 10, 2.5, 0.2, 4);
          ragdoll('city-balloon', V(0, 2, 3), 6, 0.5);
          holding = false;
        }
      }
      if (freeT > 40) balloonState = 'popped';
    } else {
      freeT += dt;
      if (freeT > 25) {
        balloonState = 'parade';
        balloonZ = paradeZ0 + 10;
        balloonDir = 1;
        balloonPos.set(paradeX + 0.5, balloonY, balloonZ);
        for (const h of handlers) h.a.target = null;
      }
    }
    balloon.visible = balloonState !== 'popped';
    balloon.position.copy(balloonPos);
    const ropeBottom = holding && pin ? pin.clone().add(V(0, 2.2, 0)) : V(balloonPos.x, G + 2.2, balloonPos.z - balloonDir * 6);
    const ropeTop = V(balloonPos.x, balloonPos.y - 5, balloonPos.z - balloonDir * 4);
    const lseg = ropeTop.distanceTo(ropeBottom);
    loose.visible = balloon.visible;
    loose.scale.y = lseg;
    loose.position.copy(ropeTop).lerp(ropeBottom, 0.5);
    loose.lookAt(ropeTop);
    loose.rotateX(Math.PI / 2);
    handlers.forEach((h, i) => {
      const r = ropes[i];
      const tethered = balloonState === 'parade' && !h.a.target;
      r.visible = tethered;
      if (!tethered) return;
      const a = h.a.pos.clone().add(V(0, 1.6, 0)), b = V(balloonPos.x + h.ox * 0.6, balloonPos.y - 4, balloonPos.z + h.oz * 0.6);
      r.scale.y = a.distanceTo(b);
      r.position.copy(a).lerp(b, 0.5);
      r.lookAt(b);
      r.rotateX(Math.PI / 2);
    });
    ropeIt.pos.copy(ropeBottom).setY(G);
    ropeIt.enabled = balloonState === 'parade';
    if (holding && pin) pin.copy(ropeBottom).add(V(0, -2.2, 0));
    if (holding && pin && balloonState === 'free') pin.set(ropeTop.x, Math.max(G, balloonPos.y - 9), ropeTop.z);

    // Pigeons.
    if (swarm > 0) {
      swarm += dt;
      const c = feet().add(V(0, 1, 0));
      pigeons.forEach((pg, i) => {
        const a = t * 6 + i;
        const r = 1.2 + (i % 5) * 0.25;
        const target = c.clone().add(V(Math.cos(a) * r, Math.sin(t * 9 + i) * 0.8 + (i % 3) * 0.4, Math.sin(a) * r));
        pg.m.position.lerp(target, Math.min(1, dt * 5));
        pg.m.rotation.y = -a;
      });
      if (swarm > 1.2 && alive()) {
        pin ??= feet();
        pin.y += dt * 4.5;
        if (Math.random() < dt * 6) sound.noise({ dur: 0.1, vol: 0.3, freq: 3000, type: 'bandpass', q: 3 });
      }
      if (swarm > 4.6 && pin) ragdoll('city-pigeons', V((Math.random() - 0.5) * 6, 2, (Math.random() - 0.5) * 6), 10);
      if (swarm > 12) {
        swarm = 0;
        for (const pg of pigeons) pg.m.position.copy(pg.home);
      }
    } else {
      for (const pg of pigeons) {
        pg.ph += dt * 3;
        pg.m.position.y = pg.home.y + Math.max(0, Math.sin(pg.ph)) * 0.05;
        pg.m.rotation.x = Math.sin(pg.ph * 2) > 0.7 ? 0.5 : 0;
      }
    }
    crumbIt.enabled = swarm === 0;

    // Hot dog prompt counts up.
    dogIt.prompt = bodyState.hotdogs >= 5 ? 'Buy one more hot dog ($3). The last one.' : `Buy a hot dog ($3)${bodyState.hotdogs ? ` · ${bodyState.hotdogs} eaten` : ''}`;
    insultIt.prompt = bodyState.jacket ? 'Say hi to Big Tony' : "Insult Big Tony's mother";
    passIt.prompt = passwordKnown ? 'Tell the doorman the password' : 'Talk to the doorman';
    jacketIt.enabled = !bodyState.jacket;
    scissorsIt.enabled = !bodyState.scissors;

    // Harbor patrol boat.
    boat.position.copy(boatPos());
    boat.rotation.y = -(time / 120) * Math.PI * 2;

    // Drum spins.
    drum.rotation.z += dt * 1.5;

    for (const ac of actors) ac.update(dt);
  };

  const letGo = (why: string) => {
    if (!holding) return;
    holding = false;
    pin = null;
    game.player.lock(false);
    game.toast('LET GO', why, 2600);
  };

  // ================================================================ fixed-step logic
  const step = (h: number) => {
    subway.step(h);
    commuter.step(h);
    if (carry.lengthSq() > 0 && alive() && !pin) {
      const n = game.player.body.nextTranslation();
      game.player.body.setNextKinematicTranslation({ x: n.x + carry.x, y: n.y + carry.y, z: n.z + carry.z });
    }
    carry.set(0, 0, 0);
    applyPin();
  };

  const checkHazards = (h: number) => {
    applyPin();
    if (!alive()) return;
    const f = feet();
    const st = game.player.state;

    // Trains.
    hornCd -= h;
    for (const [tr, id] of [[subway, 'city-subway'], [commuter, 'city-railyard']] as const) {
      if (tr.horn && f.distanceTo(V(tr.axis === 'x' ? tr.s : tr.lane, f.y, tr.axis === 'x' ? tr.lane : tr.s)) < 140) sound.horn();
      if (tr.moving && tr.contains(f)) {
        sound.splat();
        sound.horn();
        game.shake(1.5);
        const dir = Math.sign(tr.to - tr.from);
        const vel = tr.axis === 'x' ? V(dir * tr.speed * 1.4, 12, (f.z < tr.lane ? -1 : 1) * 5) : V((f.x < tr.lane ? -1 : 1) * 5, 14, dir * tr.speed * 1.4);
        ragdoll(id, vel, 18, 0.5);
        return;
      }
    }
    // Commuter horn when someone's on the live track ahead.
    if (onLiveTrack(f) && commuter.moving && hornCd <= 0 && (f.z - commuter.front) > 0 && f.z - commuter.front < 90) {
      sound.horn();
      hornCd = 2.5;
    }

    // Rail yard samaritans.
    const danger = onLiveTrack(f) && (commuter.moving ? f.z > commuter.s && f.z - commuter.front < 160 : true);
    for (const s of sams) {
      if (s.down > 0) {
        s.down -= h;
        s.a.lying = s.down > 0;
        if (s.down <= 0) s.a.walkTo(s.home, 3);
        continue;
      }
      s.cd -= h;
      if (danger && s.cd <= 0) {
        s.a.walkTo(f, 9.5);
        const d = Math.hypot(s.a.pos.x - f.x, s.a.pos.z - f.z);
        if (d < 1.3) {
          if (DODGES.includes(st)) {
            s.down = 8;
            s.a.target = null;
            sound.boing();
            game.toast('JUKED!', 'The good samaritan ate gravel.', 1500);
          } else {
            s.cd = 2;
            s.a.walkTo(s.home, 4);
            sound.slam();
            game.player.knock(V(7, 6, 0));
            sayIf('Good samaritan', pick(Math.random, ['Not today, pal!', 'GET OFF THE TRACKS!', "I've got you! You're safe!"]), 1800);
          }
        }
      } else if (!danger && !s.a.target && s.a.pos.distanceTo(s.home) > 0.5) s.a.walkTo(s.home, 3);
    }

    // Manhole worker: grabs you unless you are glued to your phone.
    heyCd -= h;
    const texting = game.input.held('up');
    if (texting) game.prompt('<span class="key">R</span>Texting... (eyes on the phone)');
    const dHole = Math.hypot(f.x - holeA.x, f.z - holeA.z);
    if (dHole < 4.5 && f.y > G - 0.5) {
      if (!heyWarned) {
        heyWarned = true;
        sayIf('Construction worker', 'HEY!', 1200);
        worker.face(f);
      }
      if (!texting && dHole < 2.7 && heyCd <= 0) {
        heyCd = 1.2;
        const away = V(f.x - holeA.x, 0, f.z - holeA.z).normalize().multiplyScalar(8);
        game.player.knock(away.setY(5));
        sayIf('Construction worker', "HEY! Watch the hole, pal! You blind?", 2200);
      }
    } else if (dHole > 7) heyWarned = false;

    // Third rail: the sax player hauls you back up unless he's at lunch.
    pullCd -= h;
    const inStationBed = f.x > SUBWAY.stationX0 && f.x < SUBWAY.stationX1 && f.z < SUBWAY.platZ0 && f.z > SUBWAY.bedZ0 && f.y < TUNNEL_FLOOR + 0.6;
    if (inStationBed && sax.visible && pullCd <= 0 && st !== 'locked') {
      pullCd = 2;
      game.player.teleport(V(f.x, TUNNEL_FLOOR + 1, SUBWAY.platZ0 + 2), 0);
      sayIf('Sax player', 'Whoa! Careful, friend. ...That rescue was a five dollar value, by the way.', 3000);
    } else if (f.y < TUNNEL_FLOOR + 0.6 && Math.abs(f.z - SUBWAY.liveRailZ) < 0.7 && f.x > 60 && st !== 'locked') {
      sound.zap(1.2);
      strobe(10, '#bfe6ff');
      game.character!.tint(0x111111, 0.7);
      ragdoll('city-thirdrail', V(0, 8, 2), 10);
      return;
    }

    // Cement shoes at the harbor.
    if (bodyState.shoes && f.y < WATER - 0.3) {
      const b = boatPos();
      if (b.distanceTo(V(f.x, WATER, f.z)) < 45) {
        game.player.teleport(pierEnd, Math.PI);
        removeShoes();
        sayIf('Harbor Patrol', 'HARBOR PATROL! Sir, you cannot swim in those shoes. We fished you out. Again.', 3600);
        game.toast('RESCUED', 'Wait for the patrol boat to pass before you take the plunge.', 3200);
        return;
      }
      sound.splat();
      ragdoll('city-fishes', V(0, -3, 0), 2, 0.05);
      removeShoes();
      setTimeout(() => sayIf('Big Tony', '*slurps spaghetti* ...Mm. Fresh.', 2600), 2500);
      return;
    }
  };

  const onLand = (e: { drop: number; launchPos: THREE.Vector3; launchState: string; landState: string }) => {
    if (!alive()) return false;
    const f = feet();
    for (const m of L.manholes) {
      if (Math.hypot(f.x - m.x, f.z - m.z) < 5 && f.y < G - 4) {
        sound.splat();
        game.shake(0.6);
        burst(f.clone().add(V(0, 0.3, 0)), 30, 0x5a6a3a, 6);
        ragdoll('city-manhole', V(0, 4, 0), 6, 0.3);
        setTimeout(() => game.toast('A RAT TOOK YOUR PHONE', 'It is already texting your ex.', 2600), 1500);
        return true;
      }
    }
    void e;
    return false;
  };

  return {
    interactables: items,
    interact,
    update,
    step,
    checkHazards,
    onLand,
    dispose() {
      for (const a of actors) a.ch.dispose();
      if (statue) statue.dispose();
      sc.dispose();
    },
  };
}
