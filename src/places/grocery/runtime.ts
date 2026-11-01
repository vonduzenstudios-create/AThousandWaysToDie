import * as THREE from 'three';
import { RAPIER, G_PROP, G_RAGDOLL, G_WORLD, groups } from '../../physics';
import type { Interactable } from '../../props';
import type { PersonFile } from '../../deaths';
import type { Character } from '../../character';
import { canvasTexture, mulberry32, pick, type Rng } from '../../util';
import { Actor } from '../actor';
import { inRect, type DeathStyle, type Frame, type PlaceContext, type PlaceRuntime } from '../types';
import { BACK_WALL_Z, CEIL, F, LOT_TOP, SAUCES, SPOT, lotY } from './layout';
import {
  DISGUISES,
  at,
  banana,
  box,
  cart,
  chicken,
  disguiseMesh,
  forklift,
  freezerDoors,
  lights,
  lobster,
  mat,
  metalBasket,
  sauceBottle,
  sign,
  slicer,
  stockShelves,
  truck,
  watermelon,
} from './props';

/** Jobs that work at the store and can use the staff-only rooms. */
export const STORE_JOBS = ['Butcher', 'Stocker', 'Cashier', 'Deli Clerk', 'Produce Manager', 'Store Manager'];

const UNIFORM = { shirt: 0x2f8a4a, hat: null, pants: 0x2c3e66 };

interface Spot {
  id: string;
  /** Local position (feet height of whoever presses E). */
  pos: THREE.Vector3;
  radius: number;
  /** Prompt text, or null when unavailable right now. */
  prompt: () => string | null;
  act: () => void;
}

interface Dyn {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Everything that happens inside Smallville Grocery: staff, gated rooms, props that move,
 * and the store's deaths. All gameplay positions are in local store coordinates.
 */
export function setupGrocery(ctx: PlaceContext, f: Frame): PlaceRuntime {
  const { scene, physics, game } = ctx;
  const rng: Rng = mulberry32(Math.floor(ctx.rng() * 1e9));
  const root = f.group();
  scene.add(root);
  const extras: THREE.Object3D[] = []; // world-space meshes (physics props, slices)
  const bodies: RAPIER.RigidBody[] = [];
  const spots: Spot[] = [];
  const interactables: Interactable[] = [];
  const actors: Actor[] = [];
  const fx = (lx: number, ly: number, lz: number) => f.toWorld(lx, ly, lz);

  // ------------------------------------------------------------ helpers
  const lp = () => f.toLocal(game.player.feet());
  const alive = () => !!game.body && !!game.character;
  const job = () => game.body?.job ?? '';
  const isStaff = () => STORE_JOBS.includes(job());
  const kill = (id: string, style: DeathStyle) => {
    busy = false;
    game.kill(id, style);
  };
  const ragdoll = (lx: number, ly: number, lz: number, spin = 10, bounce = 0.45): DeathStyle => ({
    kind: 'ragdoll',
    vel: f.dir(lx, ly, lz),
    spin,
    bounce,
  });
  /** Hold the player at a local feet position (for rides). Call every fixed step. */
  const pin = (p: THREE.Vector3, facingLocal?: number) => {
    const w = fx(p.x, p.y, p.z);
    const pl = game.player;
    const t = { x: w.x, y: w.y + 0.9 + 0.05, z: w.z };
    pl.body.setTranslation(t, true);
    pl.body.setNextKinematicTranslation(t);
    pl.vel.set(0, 0, 0);
    pl.grounded = true;
    if (facingLocal !== undefined) pl.facing = facingLocal + f.yaw;
  };
  const lock = (on: boolean) => game.player.lock(on);
  const spot = (id: string, pos: THREE.Vector3, radius: number, prompt: () => string | null, act: () => void) => {
    spots.push({ id, pos, radius, prompt, act });
    const it: Interactable = { id: `groc:${id}`, pos: f.w3(pos), radius, prompt: '', enabled: false };
    interactables.push(it);
  };
  const actor = (name: string, x: number, z: number, facing: number, look: Record<string, unknown> = {}, y = F) => {
    const a = new Actor(name, rng, V(x, y, z), facing, look);
    root.add(a.root);
    actors.push(a);
    return a;
  };
  const sayA = (a: Actor, line: string, ms = 2600) => game.say(a.name, line, ms);
  const near = (a: Actor, p: THREE.Vector3, r: number) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < r;
  const beep = (fr = 880) => game.sound.tone({ f: fr, dur: 0.12, type: 'square', vol: 0.18 });
  const paVoice = (line: string) => {
    game.sound.tone({ f: 660, dur: 0.15, type: 'sine', vol: 0.25 });
    game.sound.tone({ f: 880, dur: 0.2, type: 'sine', vol: 0.25, at: 0.15 });
    game.toast('STORE PA', line, 2600);
  };

  // Per-body state (reset when Gary changes bodies).
  let lastBody: PersonFile | null = null;
  let busy = false; // a scripted ride or sequence owns the player
  let holding: 'basket' | 'banana' | 'detergent' | null = null;
  let heldMesh: THREE.Object3D | null = null;
  let disguise = -1;
  let disguiseObj: THREE.Object3D | null = null;
  let samples = 0;
  let samplesThisFace = 0;
  let scanErrors = 0;
  let sauceNext = 0;
  let gateTries = 0;
  let wasIn: Record<string, boolean> = {};
  let hintedPuddle = false;

  const resetBody = () => {
    busy = false;
    holding = null;
    heldMesh = null;
    disguise = -1;
    disguiseObj = null;
    samples = samplesThisFace = scanErrors = sauceNext = 0;
    gateTries = 0;
    wasIn = {};
    hintedPuddle = false;
    attendant.goHome();
    freezing = 0;
  };
  const hold = (what: typeof holding, mesh: THREE.Object3D | null) => {
    const ch = game.character;
    if (heldMesh) heldMesh.removeFromParent();
    holding = what;
    heldMesh = mesh;
    if (ch && mesh) {
      mesh.position.set(0, -0.5, 0.15);
      ch.parts.armR.mesh.add(mesh);
    }
  };

  // ------------------------------------------------------------ dressing
  root.add(stockShelves());
  root.add(freezerDoors());
  root.add(lights());
  const facade = sign(['SMALLVILLE GROCERY', 'Fresh since 1962 · Open 7 to 10'], 28, 3.2, '#c8201a', '#fff4d0');
  at(facade, 40, F + 9.3, 45.85, Math.PI);
  root.add(facade);
  const deptSign = (text: string, x: number, z: number, ry: number, bg = '#1f6b3a', w = 6) => {
    const s = sign([text], w, 1.1, bg, '#ffffff');
    at(s, x, CEIL - 1.8, z, ry);
    root.add(s);
  };
  deptSign('PRODUCE', 12, 58, Math.PI);
  deptSign('BULK FOODS', 12, 82.2, Math.PI);
  deptSign('SEAFOOD', 70, 57.5, Math.PI, '#2a6ab0');
  deptSign('DELI', 70, 67, Math.PI, '#b0402a');
  deptSign('ROTISSERIE', 72.5, 83, Math.PI, '#c8862a');
  deptSign('CUSTOMER SERVICE', 69, 47.5, Math.PI, '#2a4a8a', 9);
  deptSign('CHECKOUT', 21, 47.5, Math.PI, '#2a4a8a');
  deptSign('SELF CHECKOUT', 56, 47.5, Math.PI, '#2a4a8a', 8);
  for (const d of [SPOT.staffDoorStock, SPOT.staffDoorMeat]) {
    const s = sign(['EMPLOYEES ONLY'], 3.6, 0.7, '#c8201a', '#ffffff');
    at(s, (d.x0 + d.x1 + 1) / 2, F + 4.6, BACK_WALL_Z - 0.05, Math.PI);
    root.add(s);
    for (const side of [-1, 1]) {
      const half = box((d.x1 - d.x0 + 1) / 2 - 0.05, 2.6, 0.08, 0x9aa3ad);
      at(half, (d.x0 + d.x1 + 1) / 2 + side * ((d.x1 - d.x0 + 1) / 4), F + 1.5, BACK_WALL_Z + 0.5);
      const win = box(0.4, 0.4, 0.1, 0x1a1a2a, false);
      win.position.set(0, 0.6, 0);
      half.add(win);
      root.add(half);
    }
  }
  // Checkout lane details: belts, registers, candy racks, lane lights.
  for (const [i, x] of [12, 18, 24, 30].entries()) {
    const belt = box(1.05, 0.06, 4, 0x1a1a1a, false);
    at(belt, x + 0.5, F + 1.03, 53.5);
    root.add(belt);
    const reg = box(0.6, 0.5, 0.5, 0x2a2a2e);
    at(reg, x + 1.5, F + 1.3, 50.6);
    root.add(reg);
    const lane = sign([`${i + 1}`], 0.7, 0.7, '#ffffff', '#2a4a8a');
    at(lane, x + 1.5, F + 3.2, 50.6, Math.PI);
    root.add(lane);
    const pole = box(0.08, 1.6, 0.08, 0x888888, false);
    at(pole, x + 1.5, F + 2.2, 50.6);
    root.add(pole);
    const candy = box(0.4, 1.2, 1.6, 0xe0302a);
    at(candy, x - 0.3, F + 0.6, 49);
    root.add(candy);
  }
  // Self-checkout kiosks.
  for (const s of SPOT.selfCheckout) {
    const k = box(0.9, 1.1, 0.6, 0x2a2a2e);
    at(k, s.x, F + 1.55, 53.2);
    root.add(k);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshBasicMaterial({ color: 0x4ac0f0 }));
    at(screen, s.x, F + 1.8, 52.89, Math.PI);
    root.add(screen);
    const bag = box(0.7, 0.05, 0.6, 0xd0d0d0, false);
    at(bag, s.x + 0.9, F + 1.05, 53.2);
    root.add(bag);
  }
  // Cart corral inside the doors.
  for (let k = 0; k < 5; k++) root.add(at(cart(), 46 + k * 0.25, F, 47.8, Math.PI / 2));
  // Customer service bell and PA.
  root.add(at(box(0.3, 0.6, 0.2, 0x2a2a2e), 66, F + 1.3, 51.5));
  // Produce: piles on the tables and lettuce on the wet rack.
  const produceMat = new THREE.MeshLambertMaterial({ map: canvasTexture(4, 4, (c) => ((c.fillStyle = '#ddd'), c.fillRect(0, 0, 4, 4))) });
  {
    const items: [number, number, number, number, number][] = [];
    const pr = mulberry32(31);
    const tables: [number, number, number][] = [
      [12, 66, 0xf2d040],
      [12, 72, 0xe0302a],
      [12, 78, 0xf08a20],
      [17, 66, 0x6a3a8a],
      [17, 72, 0x9ac040],
      [17, 78, 0xc8a070],
    ];
    for (const [tx, tz, c] of tables)
      for (let i = 0; i < 40; i++) items.push([tx + 0.2 + pr() * 2.6, F + 1.12 + pr() * 0.25, tz + 0.2 + pr() * 3.6, 0.28, c]);
    for (let z = SPOT.misters.z0; z <= SPOT.misters.z1 + 0.6; z += 0.45)
      for (let x = 3.2; x < 5.8; x += 0.5) items.push([x, F + 1.18, z, 0.42, pr() < 0.5 ? 0x4aa83a : 0x7ac85a]);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), produceMat, items.length);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    items.forEach(([x, y, z, s, c], i) => {
      inst.setMatrixAt(i, m4.makeScale(s, s * 0.8, s).setPosition(x, y, z));
      inst.setColorAt(i, col.setHex(c));
    });
    root.add(inst);
  }
  // Mister pipe over the wet rack.
  const pipe = box(0.12, 0.12, SPOT.misters.z1 - SPOT.misters.z0 + 1, 0x9aa3ad, false);
  at(pipe, 4, F + 3.8, (SPOT.misters.z0 + SPOT.misters.z1 + 1) / 2);
  root.add(pipe);
  // Gummy bears on top of the pit.
  {
    const g = SPOT.gummyBin;
    const pr = mulberry32(55);
    const n = 260;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.28, 0.16), new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.92 }), n);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      q.setFromEuler(new THREE.Euler(pr() * 3, pr() * 3, pr() * 3));
      m4.compose(V(g.x0 + pr() * 4, F + 1.55 + pr() * 0.3, g.z0 + pr() * 4), q, V(1, 1, 1));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, col.setHex(pick(pr, [0xe0302a, 0xf2d040, 0x4ac040, 0xf08a20, 0xf2f2f2])));
    }
    root.add(inst);
    const s = sign(['GUMMY BEARS', '$4.99/lb · NO CLIMBING'], 3, 1, '#f2d040', '#c8201a');
    at(s, 10, F + 3, 83.2, Math.PI);
    root.add(s);
  }
  // Bulk bin lids.
  for (let x = 4; x <= 20; x += 4) {
    if (x >= SPOT.gummyBin.x0 - 1 && x <= SPOT.gummyBin.x1 + 1) continue;
    const lid = box(3, 0.1, 3, 0xb8dcf0, false);
    at(lid, x + 1.5, F + 1.05, 85.5);
    root.add(lid);
  }
  // Lobster tank glass and seafood ice.
  const tankGlass = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 4), new THREE.MeshLambertMaterial({ color: 0x7ac8f0, transparent: true, opacity: 0.35 }));
  at(tankGlass, 68.5, F + 1.8, 61);
  root.add(tankGlass);
  const ice = box(0.9, 0.2, 7.5, 0xeef8ff, false);
  at(ice, 65.5, F + 1.1, 61.8);
  root.add(ice);
  // Deli case glass and meats.
  const deliGlass = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 12.6), new THREE.MeshLambertMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.35 }));
  at(deliGlass, 65.5, F + 1.5, 74.5);
  root.add(deliGlass);
  for (let z = 68.5; z < 81; z += 0.9) root.add(at(box(0.5, 0.3, 0.6, pick(rng, [0xe07a7a, 0xf0c0a0, 0xc84a3a, 0xf2e2b0])), 65.5, F + 1.18, z));
  // Rotisserie case.
  const rotGlass = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 3), new THREE.MeshLambertMaterial({ color: 0xffd090, emissive: 0x6a3000, transparent: true, opacity: 0.35 }));
  at(rotGlass, 73, F + 2.1, 85.5);
  root.add(rotGlass);
  const chickens: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const c = chicken();
    at(c, 71 + (i % 3) * 2, F + 1.6 + Math.floor(i / 3) * 0.9, 85.5);
    chickens.push(c);
    root.add(c);
  }
  // Stockroom boxes on the racks.
  for (const rz of [96, 99])
    for (let x = 5; x <= 52; x += 1.5)
      for (const ly of [0, 3, 6]) if (rng() < 0.75) root.add(at(box(1.2, 1, 0.9, pick(rng, [0xb78a55, 0xc8a070, 0xa07040])), x + 0.5, F + ly + (ly ? 0.55 : 0.5), rz + 0.5));
  const safety = sign(['DAYS WITHOUT AN ACCIDENT', '0'], 3.4, 1.8, '#f2d040', '#1a1a1a');
  at(safety, 14, F + 3, BACK_WALL_Z + 0.55);
  root.add(safety);

  // ------------------------------------------------------------ automatic doors
  const doorPanels = [-1, 1].map((s) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 0.1), new THREE.MeshLambertMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.45 }));
    at(p, 40 + s * 1.5, F + 2.5, 46.5);
    root.add(p);
    return { mesh: p, side: s, open: 0 };
  });

  // ------------------------------------------------------------ staff
  const manager = actor('Store Manager Dale', 69, 49.6, 0, { ...UNIFORM, shirt: 0xeeeeee, glasses: true });
  const stockBoy = actor('Stock Boy Tyler', 11.5, 50.5, -Math.PI / 2, { ...UNIFORM });
  const produceMgr = actor('Produce Manager Gus', 17, 62, -Math.PI / 2, { ...UNIFORM, beard: true, hat: 0x2f8a4a });
  const sampleLady = actor('Sample Lady Doris', 47, 51.2, Math.PI, { ...UNIFORM, shirt: 0xf07a2a, hairStyle: 4, hair: 0xcfcfcf });
  const attendant = actor('Self-Checkout Kid', 63.5, 55, Math.PI, { ...UNIFORM, height: 0.92 });
  const seafoodGuy = actor('Seafood Sal', 68, 64.5, -Math.PI / 2, { ...UNIFORM, shirt: 0x2a6ab0, hat: 0xffffff });
  const deliLady = actor('Deli Donna', 70, 74, -Math.PI / 2, { ...UNIFORM, shirt: 0xffffff, hat: 0xffffff });
  const butcherBob = actor('Butcher Bob', 66, 96.5, 0, { ...UNIFORM, shirt: 0xffffff, width: 1.4 });
  const couponLady = actor('Coupon Carol', 57.5, 72, 0, { shirt: 0x8a4ad8, hairStyle: 2, hair: 0xb8462a, glasses: true });
  const emt = actor('Off-Duty EMT Rick', 22.5, 58, Math.PI / 2, { shirt: 0x2a3a6a, hat: 0x2a3a6a });
  const cartKid = actor('Cart Kid Brayden', 10, 22, Math.PI / 2, { shirt: 0xf2d040, height: 0.9 }, lotY(22));
  const cashiers = [actor('Cashier Pam', 13.6, 50.6, Math.PI / 2, UNIFORM), actor('Cashier Luis', 25.6, 50.6, Math.PI / 2, UNIFORM)];
  void cashiers;
  // Coupon Carol's binder.
  couponLady.ch.parts.armL.mesh.add(at(box(0.1, 0.5, 0.4, 0x2a2a8a, false), 0, -0.4, 0.1));
  // Shoppers loop around the store.
  const loops: THREE.Vector3[][] = [
    [V(22, F, 57.5), V(63, F, 57.5), V(63, F, 87.5), V(22, F, 87.5)],
    [V(28, F, 58), V(28, F, 86.5), V(34, F, 87.5), V(34, F, 58)],
    [V(40, F, 58), V(40, F, 87.5), V(46, F, 87.5), V(46, F, 59.5)],
  ];
  const shoppers = loops.map((lp0, i) => {
    const a = actor(pick(rng, ['Shopper Linda', 'Shopper Earl', 'Shopper Bev', 'Shopper Hank']), lp0[0].x, lp0[0].z, 0);
    a.speed = 1.6 + i * 0.3;
    if (i === 0) root.add(Object.assign(cart(), { name: 'shopperCart' }));
    return { a, loop: lp0, k: 0 };
  });
  const shopperCart = root.getObjectByName('shopperCart')!;
  const emtLoop = [V(22.5, F, 58), V(62.5, F, 58), V(62.5, F, 88), V(22.5, F, 88)];
  let emtK = 0;
  let emtMode: 'loop' | 'save' = 'loop';
  const kidLoop = [V(10, 0, 22), V(70, 0, 22), V(70, 0, 8), V(10, 0, 8)].map((p) => ((p.y = lotY(p.z)), p));
  let kidK = 0;
  const couponLoop = [V(57.5, F, 64), V(57.5, F, 82)];
  let couponK = 0;
  let couponChase = false;

  // ------------------------------------------------------------ staff-only rooms
  const zones = [
    { id: 'backroom', x0: 3, z0: BACK_WALL_Z + 0.6, x1: 76.5, z1: 100.5, out: () => (lp().x < 50 ? V(31.5, F, 88) : V(67, F, 88.4)), by: manager },
    { id: 'deli', x0: 65.6, z0: 67.6, x1: 76.9, z1: 80.9, out: () => V(63.5, F, 74), by: deliLady },
    { id: 'seafood', x0: 65.6, z0: 62.6, x1: 70.5, z1: 66.4, out: () => V(63.5, F, 64), by: seafoodGuy },
  ];
  const GATE_LINES = [
    "Whoa, whoa. Employees only back here, buddy.",
    "Sir. That door says EMPLOYEES ONLY. Can you read?",
    "I'm not telling you again. Customers stay on the floor.",
  ];
  const eject = (z: (typeof zones)[number]) => {
    gateTries++;
    sayA(z.by, z.id === 'deli' ? 'Hon, you gotta take a number like everybody else. Out from behind my counter.' : GATE_LINES[Math.min(gateTries, 3) - 1], 2600);
    game.sound.denied();
    const out = z.out();
    game.player.teleport(f.w3(out), f.yaw + Math.PI);
    game.player.knock(f.dir(0, 5, -6));
    game.toast('STAFF ONLY', 'Possess someone who works here: Butcher, Stocker, Cashier, Deli Clerk, Produce Manager or Store Manager.', 3000);
    if (gateTries > 3) setTimeout(() => game.say('Death', "It's a grocery store back room. You need to WORK there. Find someone in a green apron and quit fuckin' around.", 4500), 2600);
  };

  // ------------------------------------------------------------ 1. can pyramid
  const CAN_ROWS = 12;
  const canGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.6, 10);
  const canTex = canvasTexture(32, 16, (c) => {
    c.fillStyle = '#c8302a';
    c.fillRect(0, 0, 32, 16);
    c.fillStyle = '#f2f2f2';
    c.fillRect(0, 5, 32, 6);
    c.fillStyle = '#c8302a';
    c.fillRect(10, 7, 12, 2);
  });
  const canMat = new THREE.MeshLambertMaterial({ map: canTex });
  const canHome: THREE.Vector3[] = [];
  for (let r = 0; r < CAN_ROWS; r++)
    for (let i = 0; i < CAN_ROWS - r; i++) canHome.push(V(SPOT.cansBase.x - (CAN_ROWS - r) * 0.25 + 0.25 + i * 0.5, F + 0.3 + r * 0.6, SPOT.cansBase.z));
  const canMeshes = canHome.map((p) => {
    const m = new THREE.Mesh(canGeo, canMat);
    m.castShadow = true;
    m.position.copy(p);
    root.add(m);
    return m;
  });
  let cans: Dyn[] = [];
  let cansDown = 0;
  const cansSign = sign(['SOUP-ER SALE!', '10 for $10 · DO NOT TOUCH'], 3, 1.2, '#f2d040', '#c8201a');
  at(cansSign, SPOT.cansBase.x, F + 8.2, SPOT.cansBase.z - 0.3, Math.PI);
  root.add(cansSign);
  const dropDyn = (list: Dyn[], meshesBack: () => void) => {
    for (const d of list) {
      physics.removeRigidBody(d.body);
      d.mesh.removeFromParent();
    }
    meshesBack();
  };
  spot('cans', V(SPOT.cansBase.x, F, SPOT.cansBase.z - 1.2), 2, () => (cansDown > 0 ? null : 'Pull out the bottom can'), () => {
    if (!stockBoy.away && near(stockBoy, lp(), 9)) {
      sayA(stockBoy, 'WHOA whoa whoa. I got it, I got it. Do you know how long that took me?', 3000);
      game.toast('BLOCKED', 'Tyler guards that pyramid with his life. Get him to go somewhere else.', 2600);
      return;
    }
    cansDown = 22;
    game.sound.pull();
    // Swap the static meshes for physics cans.
    canMeshes.forEach((m, i) => {
      m.visible = false;
      const w = fx(canHome[i].x, canHome[i].y, canHome[i].z);
      const b = physics.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(w.x, w.y, w.z)
          .setLinvel(...(f.dir((rng() - 0.5) * 2, 0, -1 - rng() * 2).toArray() as [number, number, number])),
      );
      physics.createCollider(RAPIER.ColliderDesc.cylinder(0.3, 0.24).setDensity(2).setRestitution(0.3).setCollisionGroups(groups(G_PROP, G_WORLD | G_PROP | G_RAGDOLL)), b);
      const mesh = new THREE.Mesh(canGeo, canMat);
      mesh.castShadow = true;
      scene.add(mesh);
      cans.push({ body: b, mesh });
    });
    game.sound.creak();
    game.runSeq([
      { at: 0.4, fn: () => game.shake(0.4) },
      {
        at: 0.9,
        fn: () => {
          const p = lp();
          if (alive() && Math.hypot(p.x - SPOT.cansBase.x, p.z - SPOT.cansBase.z) < 4.2) {
            game.sound.crunch();
            kill('groc-cans', { kind: 'pancake' });
          } else if (alive()) game.say('Death', 'You pulled it and then STEPPED AWAY? You have to be under it. That is the whole point.', 3500);
        },
      },
    ]);
  });

  // ------------------------------------------------------------ PA / payphone: sends the stock boy on a price check
  const priceCheck = () => {
    if (stockBoy.away) {
      game.toast('BUSY', 'Tyler is already off doing a price check.', 1800);
      return;
    }
    paVoice('"Tyler, price check on aisle 2. Tyler to aisle 2, please."');
    setTimeout(() => sayA(stockBoy, 'Ugh. Coming.', 1600), 800);
    stockBoy.errand([V(11.5, F, 57), V(34, F, 58), V(34, F, 80)], 25);
  };
  spot('payphone', V(SPOT.payphone.x, F, 44.9), 1.4, () => 'Call the store and ask for a price check', priceCheck);
  spot('pa', V(66, F, 50.3), 1.2, () => (isStaff() ? 'Page a price check on aisle 2' : null), priceCheck);
  {
    const ph = box(0.6, 1.2, 0.3, 0x2a4a8a);
    at(ph, SPOT.payphone.x, F + 1.6, 45.75);
    root.add(ph);
    const s = sign(['PHONE'], 0.6, 0.25, '#2a4a8a', '#ffffff');
    at(s, SPOT.payphone.x, F + 2.4, 45.58, Math.PI);
    root.add(s);
  }

  // ------------------------------------------------------------ 2. free samples
  {
    const table = box(1.6, 0.9, 0.8, 0xffffff);
    at(table, SPOT.sampleTable.x, F + 0.45, SPOT.sampleTable.z);
    root.add(table);
    const tray = box(1, 0.08, 0.5, 0xd8d8dc, false);
    at(tray, SPOT.sampleTable.x, F + 0.95, SPOT.sampleTable.z);
    root.add(tray);
    for (let i = 0; i < 12; i++) root.add(at(box(0.12, 0.03, 0.12, 0xe05a1a, false), SPOT.sampleTable.x - 0.4 + (i % 6) * 0.16, F + 1.01, SPOT.sampleTable.z - 0.1 + Math.floor(i / 6) * 0.2));
    const s = sign(['NEW! SPICY CHIP', 'FREE SAMPLE · ONE PER CUSTOMER'], 1.8, 0.7, '#e05a1a', '#ffffff');
    at(s, SPOT.sampleTable.x, F + 0.6, SPOT.sampleTable.z - 0.42, Math.PI);
    root.add(s);
  }
  const SAMPLE_GOAL = 40;
  const PER_FACE = 8;
  spot('samples', V(SPOT.sampleTable.x, F, SPOT.sampleTable.z - 1), 1.3, () => `Eat a free sample (${samples}/${SAMPLE_GOAL})`, () => {
    if (samplesThisFace >= PER_FACE) {
      sayA(sampleLady, pick(rng, ["ONE per customer. I've been counting, sweetie.", 'I know that face. I never forget a face.', 'Nope. You again. Shoo.']), 2600);
      if (disguise < DISGUISES.length - 1) game.toast('CUT OFF', 'Doris remembers faces. The Halloween clearance rack has disguises.', 2600);
      return;
    }
    samples++;
    samplesThisFace++;
    game.sound.munch();
    const ch = game.character;
    ch?.kick(0.15);
    ch?.tint(0xff4a2a, Math.min(samples / SAMPLE_GOAL, 1) * 0.6);
    if (samples === 20) game.toast('Spicy', 'Your face is going numb. That is probably fine.', 2000);
    if (samples === 32) game.toast('VERY spicy', 'You can hear colors.', 2000);
    if (samples >= SAMPLE_GOAL) {
      lock(true);
      busy = true;
      game.runSeq([
        { at: 0.3, fn: () => sayA(sampleLady, 'Oh my god. Is he... is he OK?', 2000) },
        ...Array.from({ length: 10 }, (_, i) => ({
          at: 0.4 + i * 0.12,
          fn: () => game.particles.burst(game.player.position().add(V(0, 0.9, 0)), 6, i % 2 ? 0xff7a1a : 0xffd040, 5, { life: 0.5, size: 0.2, gravity: -2 }),
        })),
        { at: 1.8, fn: () => kill('groc-samples', ragdoll(0, 9, -3, 12)) },
      ]);
    } else if (samplesThisFace === PER_FACE) sayA(sampleLady, "That's plenty for you, mister.", 2000);
  });
  // Halloween clearance rack with disguises.
  {
    const rack = box(2.4, 1.8, 0.5, 0xf08a20);
    at(rack, SPOT.disguiseRack.x, F + 0.9, SPOT.disguiseRack.z + 0.6);
    root.add(rack);
    const s = sign(['HALLOWEEN CLEARANCE', '90% OFF · DISGUISES'], 2.6, 0.8, '#1a1a1a', '#f08a20');
    at(s, SPOT.disguiseRack.x, F + 2.4, SPOT.disguiseRack.z + 0.3, Math.PI);
    root.add(s);
    for (let i = 0; i < 5; i++) {
      const d = disguiseMesh(i);
      d.scale.setScalar(0.4);
      at(d, SPOT.disguiseRack.x - 0.9 + i * 0.45, F + 1.4, SPOT.disguiseRack.z + 0.3);
      root.add(d);
    }
  }
  spot('disguise', V(SPOT.disguiseRack.x, F, SPOT.disguiseRack.z - 0.5), 1.4, () => (disguise < DISGUISES.length - 1 ? `Put on a ${DISGUISES[disguise + 1]}` : null), () => {
    const ch = game.character;
    if (!ch) return;
    disguise++;
    samplesThisFace = 0;
    disguiseObj?.removeFromParent();
    disguiseObj = disguiseMesh(disguise);
    disguiseObj.scale.setScalar(0.6);
    ch.parts.head.mesh.add(disguiseObj);
    game.sound.boing();
    game.toast('DISGUISED', `A ${DISGUISES[disguise]}. Nobody will ever know.`, 1800);
  });

  // ------------------------------------------------------------ 3 & 4. cart derby and the cart train
  const corralCart = cart();
  root.add(at(corralCart, SPOT.corral.x, lotY(SPOT.corral.z), SPOT.corral.z, Math.PI));
  {
    const rail = box(0.1, 1, 5, 0x9aa3ad);
    for (const dx of [-0.8, 0.8]) root.add(at(rail.clone(), SPOT.corral.x + dx, lotY(SPOT.corral.z) + 0.5, SPOT.corral.z));
    const s = sign(['CART RETURN', 'Carts are not toys'], 2.2, 1, '#2a4a8a', '#ffffff');
    at(s, SPOT.corral.x, lotY(SPOT.corral.z) + 2.4, SPOT.corral.z + 2.5, Math.PI);
    root.add(s);
  }
  const LOOSE = [
    [8, 10], [20, 30], [30, 14], [44, 28], [52, 8], [14, 22], [74, 18], [36, 36],
  ];
  const loose = LOOSE.map(([x, z], i) => {
    const c = cart();
    at(c, x, lotY(z), z, rng() * 6);
    root.add(c);
    return { c, home: V(x, lotY(z), z), inTrain: false, i };
  });
  const trainSlot = (k: number) => V(SPOT.corral.x - 2 - k * 1.3, lotY(41), 41);
  let trainCount = 0;
  loose.forEach((L) =>
    spot(`cart${L.i}`, L.home.clone(), 1.6, () => (L.inTrain || ride ? null : `Round up this cart (${trainCount}/8 in the train)`), () => {
      L.inTrain = true;
      const slot = trainSlot(trainCount++);
      L.c.position.copy(slot);
      L.c.rotation.y = Math.PI;
      game.sound.creak();
      if (trainCount === 8) game.toast('CART TRAIN READY', 'Every cart in the lot, nested and waiting at the corral.', 2600);
      else game.toast('CART TRAIN', `${trainCount} of 8 carts rounded up.`, 1400);
    }),
  );
  let ride: { x: number; z: number; h: number; v: number; train: boolean; trail: THREE.Vector3[] } | null = null;
  const truckMesh = truck();
  truckMesh.visible = false;
  root.add(truckMesh);
  let truckRun = -1;
  spot('corral', V(SPOT.corral.x, lotY(SPOT.corral.z), SPOT.corral.z - 1.5), 1.8, () => (ride ? null : trainCount === 8 ? 'Ride the cart train (9 carts!)' : 'Ride a shopping cart down the hill'), () => {
    if (near(cartKid, V(SPOT.corral.x, 0, SPOT.corral.z), 10)) {
      sayA(cartKid, "Yo! Carts aren't toys, man. My manager will literally kill me.", 2800);
      game.toast('BLOCKED', 'Brayden wrangles the carts. Wait until he is on the far side of the lot.', 2400);
      return;
    }
    busy = true;
    lock(true);
    ride = { x: SPOT.corral.x, z: SPOT.corral.z - 1, h: Math.PI, v: trainCount === 8 ? 5 : 4, train: trainCount === 8, trail: [] };
    game.sound.whoosh();
    game.toast(ride.train ? 'ALL ABOARD' : 'WHEEE', 'Steer with A / D. Hit the bottom going fast.', 2200);
  });
  const endRide = (crash: boolean) => {
    if (!ride) return;
    const r = ride;
    ride = null;
    if (crash) {
      truckMesh.visible = true;
      truckRun = 0;
      truckMesh.position.set(r.x - 14, 0, -7);
      game.sound.horn();
      game.shake(1.2);
      game.sound.splat();
      kill(r.train ? 'groc-carttrain' : 'groc-cartderby', ragdoll(r.train ? 38 : 28, r.train ? 24 : 18, -4, 16, 0.6));
    } else {
      busy = false;
      lock(false);
      game.toast('TOO SLOW', 'The cart rolls to a gentle stop at the curb. Go faster.', 2400);
    }
    // Carts go back after a while.
    setTimeout(() => {
      corralCart.position.set(SPOT.corral.x, lotY(SPOT.corral.z), SPOT.corral.z);
      corralCart.rotation.set(0, Math.PI, 0);
      if (r.train) {
        trainCount = 0;
        for (const L of loose) {
          L.inTrain = false;
          L.c.position.copy(L.home);
          L.c.rotation.set(0, rng() * 6, 0);
        }
      }
    }, 9000);
  };
  const stepRide = (h: number) => {
    if (!ride) return;
    if (!alive()) {
      ride = null;
      return;
    }
    const r = ride;
    const steer = game.input.moveX;
    r.h -= steer * 1.4 * h;
    const down = Math.max(0, -Math.cos(r.h));
    r.v = Math.min(r.v + (5.7 * (r.train ? 1.6 : 1) * down - 0.5) * h, 34);
    r.x += Math.sin(r.h) * r.v * h;
    r.z += Math.cos(r.h) * r.v * h;
    if (r.x < 2.5 || r.x > 77.5) {
      r.x = Math.max(2.5, Math.min(77.5, r.x));
      r.h = -r.h;
      r.v *= 0.7;
      game.sound.slam();
      game.shake(0.3);
    }
    if (r.z > LOT_TOP - 1) {
      r.z = LOT_TOP - 1;
      r.h = Math.PI;
    }
    const y = lotY(r.z);
    corralCart.position.set(r.x, y, r.z);
    corralCart.rotation.set(0, r.h, 0);
    pin(V(r.x - Math.sin(r.h) * 0.2, y + 0.65, r.z - Math.cos(r.h) * 0.2), r.h);
    r.trail.unshift(V(r.x, y, r.z));
    if (r.trail.length > 400) r.trail.pop();
    if (r.train) {
      let k = 0;
      for (const L of loose) {
        if (!L.inTrain) continue;
        k++;
        const idx = Math.min(r.trail.length - 1, Math.round((k * 1.25) / Math.max(r.v * h, 0.01)));
        const p = r.trail[idx];
        L.c.position.copy(p);
        L.c.rotation.y = r.h;
      }
    }
    if (r.z < 0.8) endRide(r.v > 11);
  };

  // ------------------------------------------------------------ 5. peanuts
  {
    const bin = box(2.6, 1, 0.9, 0x8a5a35);
    at(bin, SPOT.peanuts.x, F + 0.5, 88.4);
    root.add(bin);
    const nuts = box(2.4, 0.1, 0.7, 0xd8b45a, false);
    at(nuts, SPOT.peanuts.x, F + 1.02, 88.4);
    root.add(nuts);
    const s = sign(['BULK PEANUTS', 'Fresh roasted · Try one!'], 2.4, 0.8, '#8a5a35', '#fff4d0');
    at(s, SPOT.peanuts.x, F + 1.8, 88.85, Math.PI);
    root.add(s);
  }
  spot('peanuts', V(SPOT.peanuts.x, F, 87.4), 1.5, () => 'Eat a handful of peanuts', () => {
    const ch = game.character;
    const b = game.body;
    if (!ch || !b) return;
    game.sound.munch();
    if (!b.peanutAllergy) {
      game.toast('Crunchy', `${b.name} is not allergic to peanuts. Check people's files for allergies.`, 2400);
      return;
    }
    busy = true;
    lock(true);
    const head = ch.parts.head.pivot;
    const swell = Array.from({ length: 16 }, (_, i) => ({
      at: 0.6 + i * 0.1,
      fn: () => {
        ch.tint(0xff4a4a, i / 24);
        head.scale.set(1 + i * 0.05, 1 + i * 0.04, 1 + i * 0.05);
      },
    }));
    const emtNear = Math.hypot(emt.pos.x - lp().x, emt.pos.z - lp().z) < 16;
    if (emtNear) {
      emtMode = 'save';
      emt.speed = 7;
      const target = lp();
      emt.walk([V(target.x + 0.8, F, target.z)], () => {
        sayA(emt, 'Hold still! EpiPen! ...You are welcome. Maybe stop eating peanuts.', 3200);
        ch.tint(0xffffff, 0);
        head.scale.set(1, 1, 1);
        game.sound.cash();
        busy = false;
        lock(false);
        game.toast('SAVED', 'An off-duty EMT jabbed you with an EpiPen. Eat them where he cannot see you.', 3000);
        setTimeout(() => {
          emtMode = 'loop';
          emt.speed = 2.2;
        }, 3000);
      });
      game.runSeq([...swell.slice(0, 6), { at: 0.3, fn: () => sayA(emt, "Oh no. Is that an allergic reaction? I'm an EMT!", 2000) }]);
      return;
    }
    game.runSeq([
      ...swell,
      { at: 1.2, fn: () => game.toast('uh oh', 'Your throat is closing. No EpiPen in sight.', 1500) },
      { at: 2.6, fn: () => kill('groc-peanuts', ragdoll(0, 2, 0, 4, 0.3)) },
    ]);
  });

  // ------------------------------------------------------------ 6. walk-in freezer
  const fz = SPOT.freezer;
  const doorPivot = new THREE.Group();
  doorPivot.position.set(fz.x0 - 0.5, F, 96);
  const doorMesh = box(0.25, 3.9, 2, 0xd8dde6);
  doorMesh.position.set(0, 1.95, 1);
  doorPivot.add(doorMesh);
  const handle = box(0.12, 0.12, 0.5, 0x333333, false);
  handle.position.set(-0.2, 1.9, 1.6);
  doorPivot.add(handle);
  root.add(doorPivot);
  const clipboard = sign(['FREEZER LOG', 'Checked every 45 sec', '- Bob'], 0.7, 0.9, '#ffffff', '#1a1a1a');
  at(clipboard, fz.x0 - 1.6, F + 2, 95.4, -Math.PI / 2);
  root.add(clipboard);
  // A collider for the door while it is shut.
  const doorWorld = f.toWorld(fz.x0 - 0.5, F + 2, 97);
  const he = f.dir(0.15, 2, 1);
  const doorBody = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(doorWorld.x, doorWorld.y, doorWorld.z));
  const doorCol = physics.createCollider(RAPIER.ColliderDesc.cuboid(Math.abs(he.x), Math.abs(he.y), Math.abs(he.z)).setCollisionGroups(groups(G_WORLD, 0xffff)), doorBody);
  bodies.push(doorBody);
  let doorClosed = false;
  let doorAngle = -Math.PI / 2;
  const setDoor = (closed: boolean) => {
    doorClosed = closed;
    doorCol.setEnabled(closed);
    game.sound.slam();
  };
  setDoor(false);
  let freezing = 0;
  let checkT = 45;
  let bobChecking = false;
  const inFreezer = (p: THREE.Vector3) => inRect(p, fz.x0, fz.z0, fz.x1 + 1, fz.z1 + 1) && p.y < F + 4;
  spot('freezerDoorIn', V(fz.x0 + 0.6, F, 97), 1.3, () => (inFreezer(lp()) ? (doorClosed ? 'Push the door open' : 'Pull the freezer door shut') : null), () => {
    if (doorClosed) {
      setDoor(false);
      freezing = 0;
      return;
    }
    if (job() !== 'Butcher') {
      game.toast("BOB'S FREEZER", 'Only a Butcher would shut himself in the meat freezer. Allegedly.', 2400);
      return;
    }
    setDoor(true);
    game.toast('Click.', 'The door is shut. It is very, very cold in here.', 2200);
  });
  spot('freezerDoorOut', V(fz.x0 - 1.6, F, 97), 1.2, () => (inFreezer(lp()) ? null : 'Read the freezer log'), () => {
    game.toast('FREEZER LOG', `Bob checks the freezer every 45 seconds. Next check in ${Math.ceil(checkT)}s. Freezing solid takes about 18s.`, 3600);
  });
  const freezerStep = (h: number) => {
    // Bob's checks.
    checkT -= h;
    if (checkT <= 0 && !bobChecking) {
      checkT = 45;
      if (doorClosed) {
        bobChecking = true;
        butcherBob.walk([V(67.5, F, 96.5), V(fz.x0 - 1.4, F, 97)], () => {
          setDoor(false);
          if (inFreezer(lp()) && alive()) {
            sayA(butcherBob, 'Dude. Why are you in my freezer? Get out of there before you turn into a popsicle.', 3200);
            freezing = 0;
            game.character?.tint(0xffffff, 0);
          }
          butcherBob.goHome(() => (bobChecking = false));
        });
      }
    }
    const p = lp();
    if (doorClosed && alive() && inFreezer(p)) {
      const before = freezing;
      freezing += h;
      game.character?.tint(0xa8dcff, Math.min(freezing / 18, 1) * 0.85);
      if (before < 6 && freezing >= 6) game.toast('Brrr', "You can't feel your toes.", 1600);
      if (before < 12 && freezing >= 12) game.toast('BRRRRR', 'You are mostly ice now. Bob checks in soon.', 1600);
      if (Math.floor(freezing * 2) !== Math.floor(before * 2)) game.particles.burst(game.player.position().add(V(0, 1, 0)), 3, 0xffffff, 1.5, { life: 0.8, size: 0.12, gravity: -1 });
      if (freezing >= 18) {
        freezing = 0;
        busy = true;
        lock(true);
        game.runSeq([
          { at: 0.1, fn: () => game.toast('FROZEN SOLID', 'Bob is going to be so mad.', 1600) },
          {
            at: 1.2,
            fn: () => {
              setDoor(false);
              pin(V(fz.x0 + 0.8, F + 0.2, 97));
              kill('groc-freezer', ragdoll(-16, 1.5, 0, 0.5, 0.05));
            },
          },
        ]);
      }
    } else if (freezing > 0 && !doorClosed) freezing = 0;
  };

  // ------------------------------------------------------------ 7. deli slicer
  const sl = slicer();
  at(sl.group, SPOT.slicer.x, F + 1, SPOT.slicer.z, -Math.PI / 2);
  root.add(sl.group);
  // Back counter top for the slicer.
  root.add(at(box(2, 0.1, 13, 0xd8d8dc, false), 75.5, F + 1, 74.5));
  {
    const disp = box(0.4, 0.6, 0.3, 0xc8201a);
    at(disp, SPOT.ticket.x, F + 1.3, SPOT.ticket.z);
    root.add(disp);
    const s = sign(['NOW SERVING', '12'], 1.2, 0.8, '#1a1a1a', '#ff3a2a');
    at(s, 70, F + 4, 67.1, Math.PI);
    root.add(s);
  }
  let paperThin = false;
  let slices: { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; t: number }[] = [];
  spot('ticket', V(SPOT.ticket.x - 0.6, F, SPOT.ticket.z), 1.2, () => 'Take a number', () => {
    const n = 80 + Math.floor(rng() * 19);
    game.sound.blip();
    game.toast(`YOU ARE #${n}`, 'Now serving: 12. Deli Donna does not hurry for anyone.', 2400);
  });
  spot('slicer', V(SPOT.slicer.x - 1.2, F, SPOT.slicer.z), 1.4, () => (paperThin ? 'Lean in to check if the blade is clean' : 'Set the slicer to PAPER THIN'), () => {
    if (job() !== 'Butcher' && job() !== 'Deli Clerk') {
      game.toast('NOT YOUR SLICER', 'Only Deli Clerks and Butchers know how to work this thing.', 2400);
      return;
    }
    const ch = game.character;
    if (!ch) return;
    if (!paperThin) {
      paperThin = true;
      sl.dial.rotation.z = -2.6;
      game.sound.creak();
      game.toast('PAPER THIN', 'The blade spins up to a terrifying whine.', 2000);
      return;
    }
    busy = true;
    lock(true);
    const app = ch.app;
    game.runSeq([
      { at: 0.1, fn: () => game.toast('Hmm', 'Is that a smudge? Let me get a closer look...', 1500) },
      ...Array.from({ length: 6 }, (_, i) => ({ at: 0.9 + i * 0.08, fn: () => game.sound.noise({ dur: 0.1, vol: 0.4, freq: 3000 + i * 300, type: 'bandpass', q: 3 }) })),
      {
        at: 1.4,
        fn: () => {
          const c = game.character;
          if (!c) return;
          kill('groc-slicer', { kind: 'pancake' });
          c.root.visible = false;
          const colors = [app.hair, app.skin, app.skin, app.shirt, app.shirt, app.shirt, app.pants, app.pants, app.pants, app.shoes];
          const base = fx(SPOT.slicer.x, F + 1.8, SPOT.slicer.z);
          colors.forEach((col, i) => {
            for (let k = 0; k < 2; k++) {
              const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.025, 0.5), mat(col));
              m.castShadow = true;
              m.position.copy(base).add(V(0, 0.8 - i * 0.12, 0));
              scene.add(m);
              slices.push({ m, v: V((rng() - 0.5) * 3, 2 + rng() * 3, (rng() - 0.5) * 3), spin: V(rng() * 4, rng() * 4, rng() * 4), t: 0 });
            }
          });
          paperThin = false;
          sl.dial.rotation.z = 0;
        },
      },
    ]);
  });
  const updateSlices = (dt: number) => {
    for (const s of slices) {
      s.t += dt;
      const floorY = f.oy + F + 0.02;
      if (s.m.position.y > floorY) {
        s.v.y = Math.max(s.v.y - 6 * dt, -1.2); // flutter down slowly
        s.m.position.addScaledVector(s.v, dt);
        s.m.position.x += Math.sin(s.t * 5 + s.spin.x) * dt * 1.2;
        s.m.rotation.x = Math.sin(s.t * 4 + s.spin.y) * 0.6;
        s.m.rotation.z = Math.cos(s.t * 3 + s.spin.z) * 0.6;
        s.v.x *= 0.98;
        s.v.z *= 0.98;
      } else {
        s.m.position.y = floorY;
        s.m.rotation.x = s.m.rotation.z = 0;
      }
    }
    if (slices.length > 60) {
      const old = slices.splice(0, slices.length - 60);
      for (const s of old) s.m.removeFromParent();
    }
  };

  // ------------------------------------------------------------ 8. produce misters
  let mistT = 8;
  let misting = 0;
  let signKicked = false;
  let signKickT = 0;
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.6, 16), new THREE.MeshLambertMaterial({ color: 0x6ab0e0, transparent: true, opacity: 0.55 }));
  puddle.rotation.x = -Math.PI / 2;
  at(puddle, SPOT.puddle.x, F + 0.02, SPOT.puddle.z);
  puddle.rotation.x = -Math.PI / 2;
  root.add(puddle);
  const cord = box(SPOT.puddle.x - 3, 0.06, 0.06, 0xf08a20, false);
  at(cord, (3 + SPOT.puddle.x) / 2, F + 0.04, SPOT.puddle.z);
  root.add(cord);
  const wetSign = new THREE.Group();
  {
    const tex = canvasTexture(64, 96, (c) => {
      c.fillStyle = '#f2d040';
      c.fillRect(0, 0, 64, 96);
      c.fillStyle = '#1a1a1a';
      c.font = 'bold 13px Arial';
      c.textAlign = 'center';
      c.fillText('CAUTION', 32, 22);
      c.fillText('WET', 32, 60);
      c.fillText('FLOOR', 32, 76);
      c.beginPath();
      c.arc(32, 38, 7, 0, Math.PI * 2);
      c.fill();
    }, false);
    const m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1), m);
      p.position.set(0, 0.5, s * 0.17);
      p.rotation.x = s * 0.3;
      wetSign.add(p);
    }
  }
  at(wetSign, SPOT.puddle.x, F, SPOT.puddle.z);
  root.add(wetSign);
  const wetSignHome = wetSign.position.clone();
  spot('wetsign', V(SPOT.puddle.x + 0.4, F, SPOT.puddle.z - 1.6), 1.4, () => (signKicked ? null : 'Kick the wet floor sign'), () => {
    signKicked = true;
    signKickT = 0;
    game.sound.boing();
    game.toast('KICKED', 'It skids all the way down the produce aisle. Tyler will be furious.', 2000);
  });
  const basketStack = new THREE.Group();
  for (let k = 0; k < 5; k++) basketStack.add(at(metalBasket(), 0, 0.15 + k * 0.12, 0));
  at(basketStack, SPOT.basketStack.x, F, SPOT.basketStack.z);
  root.add(basketStack);
  spot('basket', V(SPOT.basketStack.x, F, SPOT.basketStack.z - 0.6), 1.3, () => (holding === 'basket' ? null : 'Grab a metal basket'), () => {
    hold('basket', metalBasket());
    game.sound.creak();
    game.toast('METAL BASKET', 'Very conductive. Just saying.', 1600);
  });
  const inPuddle = (p: THREE.Vector3) => Math.hypot(p.x - SPOT.puddle.x, p.z - SPOT.puddle.z) < 1.5 && p.y < F + 0.5;
  const mistStep = (h: number) => {
    mistT -= h;
    if (mistT <= 0 && misting <= 0) {
      misting = 5;
      mistT = 18;
      game.sound.noise({ dur: 1.5, vol: 0.12, freq: 5000, type: 'highpass' });
      game.sound.thunder();
    }
    if (misting > 0) {
      misting -= h;
      for (let k = 0; k < 2; k++) {
        const z = SPOT.misters.z0 + rng() * (SPOT.misters.z1 - SPOT.misters.z0);
        game.particles.emit(fx(4, F + 3.7, z), f.dir(0.6 + rng(), -1, 0), 0xcfeeff, { life: 0.9, size: 0.1, gravity: 6, spread: 0.6 });
      }
    }
  };
  let puddleShoveT = 0;
  const mistHazard = () => {
    const p = lp();
    if (!inPuddle(p)) return;
    if (!signKicked) {
      if (puddleShoveT <= 0) {
        puddleShoveT = 3;
        game.player.knock(f.dir(1.5, 3, -2));
        game.toast('WET FLOOR', 'There is a sign. You respect the sign.', 1600);
      }
      return;
    }
    if (misting <= 0) return;
    if (holding !== 'basket') {
      if (!hintedPuddle) {
        hintedPuddle = true;
        game.toast('Bzzt', 'Your feet tingle. Something metal in your hand would really complete the circuit.', 2600);
      }
      return;
    }
    busy = true;
    lock(true);
    game.sound.zap();
    game.flash('#e8f4ff', 400);
    produceMat.emissive.setHex(0xffffaa);
    setTimeout(() => produceMat.emissive.setHex(0x000000), 1600);
    game.particles.burst(game.player.position().add(V(0, 1, 0)), 40, 0xfff6a0, 9, { life: 0.6, size: 0.12, gravity: 0 });
    game.character?.flash(true);
    game.runSeq([
      { at: 0.25, fn: () => game.character?.flash(false) },
      { at: 0.4, fn: () => game.character?.flash(true) },
      { at: 0.6, fn: () => kill('groc-misters', ragdoll(0, 13, 0, 14)) },
    ]);
  };

  // ------------------------------------------------------------ 9. watermelon tower
  const melonHome: THREE.Vector3[] = [];
  for (let lv = 0; lv < 4; lv++) {
    const n = 4 - lv;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) melonHome.push(V(SPOT.melons.x - (n - 1) * 0.5 + i, F + 0.45 + lv * 0.8, SPOT.melons.z - (n - 1) * 0.5 + j));
  }
  const melonMeshes = melonHome.map((p) => {
    const m = watermelon();
    m.position.copy(p);
    root.add(m);
    return m;
  });
  let melons: Dyn[] = [];
  let melonsDown = 0;
  {
    const s = sign(['WATERMELONS', '$3 each · Take from the TOP'], 2.6, 0.9, '#2f8a3a', '#ffffff');
    at(s, SPOT.melons.x, F + 4.2, SPOT.melons.z - 0.5, Math.PI);
    root.add(s);
  }
  spot('melons', V(SPOT.melons.x, F, SPOT.melons.z - 2.6), 1.6, () => (melonsDown > 0 ? null : 'Pull out a bottom watermelon'), () => {
    if (!produceMgr.away && near(produceMgr, lp(), 10)) {
      sayA(produceMgr, 'BACK. OFF. That is a DISPLAY. Take one from the top like a civilized person.', 3000);
      game.toast('BLOCKED', 'Gus guards the melons like a dragon. Give him a mess to clean up somewhere else.', 2600);
      return;
    }
    melonsDown = 25;
    game.sound.pull();
    melonMeshes.forEach((m, i) => {
      m.visible = false;
      const w = fx(melonHome[i].x, melonHome[i].y, melonHome[i].z);
      const b = physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(w.x, w.y, w.z).setLinearDamping(0.1));
      physics.createCollider(RAPIER.ColliderDesc.ball(0.45).setDensity(1.5).setRestitution(0.35).setFriction(0.4).setCollisionGroups(groups(G_PROP, G_WORLD | G_PROP | G_RAGDOLL)), b);
      const mesh = watermelon();
      scene.add(mesh);
      melons.push({ body: b, mesh });
    });
    game.toast('uh oh', 'RUN.', 1200);
  });
  const melonStep = () => {
    if (!melons.length || melonsDown < 18 || !alive()) return;
    const pp = game.player.position();
    for (const m of melons) {
      const t = m.body.translation();
      const to = V(pp.x - t.x, 0, pp.z - t.z);
      const d = to.length();
      if (d < 30) m.body.applyImpulse(to.normalize().multiplyScalar(0.08), true);
      const v = m.body.linvel();
      const sp = Math.hypot(v.x, v.z);
      if (Math.hypot(pp.x - t.x, pp.y - t.y, pp.z - t.z) < 1.25 && sp > 2.5 && !busy) {
        game.sound.splat();
        game.particles.burst(V(t.x, t.y, t.z), 30, 0xe0302a, 6, { life: 0.8, size: 0.15 });
        kill('groc-melons', { kind: 'ragdoll', vel: V(v.x * 1.6, 7, v.z * 1.6), spin: 12, bounce: 0.5 });
        return;
      }
    }
  };
  // Pickle jar in aisle 6: knock it over and Gus runs to clean it.
  const pickles = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 10), new THREE.MeshLambertMaterial({ color: 0x6a9a3a, transparent: true, opacity: 0.85 }));
  at(pickles, SPOT.pickles.x, F + 2.8, SPOT.pickles.z);
  root.add(pickles);
  let picklesDown = 0;
  const picklePuddle = new THREE.Mesh(new THREE.CircleGeometry(1, 12), new THREE.MeshLambertMaterial({ color: 0x9ac040, transparent: true, opacity: 0.7 }));
  picklePuddle.rotation.x = -Math.PI / 2;
  at(picklePuddle, SPOT.pickles.x + 1.4, F + 0.03, SPOT.pickles.z);
  picklePuddle.rotation.x = -Math.PI / 2;
  picklePuddle.visible = false;
  root.add(picklePuddle);
  spot('pickles', V(SPOT.pickles.x + 1.5, F, SPOT.pickles.z), 1.3, () => (picklesDown > 0 ? null : 'Knock the giant pickle jar off the shelf'), () => {
    picklesDown = 35;
    pickles.visible = false;
    picklePuddle.visible = true;
    game.sound.crunch();
    game.particles.burst(fx(SPOT.pickles.x + 1.4, F + 0.3, SPOT.pickles.z), 20, 0x9ac040, 4, { life: 0.7, size: 0.15 });
    setTimeout(() => {
      paVoice('"Cleanup on aisle 6. Gus, cleanup on aisle 6."');
      if (!produceMgr.away) {
        sayA(produceMgr, 'Pickles?! Again?! Nobody touch my melons.', 2200);
        produceMgr.errand([V(22, F, 59), V(58.5, F, 59), V(58.5, F, SPOT.pickles.z - 0.5)], 22, () => {});
      }
    }, 700);
  });

  // ------------------------------------------------------------ 10. lobsters
  const lobsters = Array.from({ length: 6 }, (_, i) => {
    const m = lobster();
    const home = V(67 + (i % 3) * 1.1, F + 1.15, 60 + Math.floor(i / 3) * 1.6);
    m.position.copy(home);
    m.rotation.y = rng() * 6;
    root.add(m);
    return { m, home, free: false, cd: 0, speed: 3.8 + rng() * 1.4 };
  });
  let lobstersFree = 0;
  let pinches = 0;
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe0c040));
  at(bell, SPOT.seafoodBell.x + 0.2, F + 1.2, SPOT.seafoodBell.z);
  root.add(bell);
  spot('bell', V(SPOT.seafoodBell.x - 0.6, F, SPOT.seafoodBell.z), 1.1, () => 'Ring the bell for service', () => {
    game.sound.tone({ f: 2200, dur: 0.4, type: 'sine', vol: 0.3 });
    if (seafoodGuy.away) return;
    sayA(seafoodGuy, "Be right with ya, gotta grab more ice from the back. Don't touch the tank.", 2800);
    seafoodGuy.errand([V(65.5, F, 66.3), V(63.5, F, 66.3), V(63.5, F, 88.3), V(67, F, 88.3), V(67, F, 93.5)], 22);
  });
  spot('lobsters', V(64.2, F, 61), 1.4, () => (lobstersFree ? null : 'Free the lobsters'), () => {
    if (!seafoodGuy.away && near(seafoodGuy, V(68, F, 62), 5)) {
      sayA(seafoodGuy, 'Hands off the tank, pal. Those are $29.99 a pound.', 2600);
      game.toast('BLOCKED', 'Sal is watching the tank. Ring his bell and he might wander off.', 2400);
      return;
    }
    lobstersFree = 40;
    pinches = 0;
    lobsters.forEach((l, i) => {
      l.free = true;
      l.m.position.set(63.6 - (i % 2), F, 59.5 + i * 0.7);
    });
    game.sound.boing();
    game.toast('FREEDOM', 'The lobsters look at you. Then at each other. Then at you again.', 2600);
    setTimeout(() => game.say('Lobster Union Local 6', 'WHAT DO WE WANT? REVENGE! WHEN DO WE WANT IT? NOW!', 3200), 1200);
  });
  const lobsterUpdate = (dt: number) => {
    if (!lobstersFree) return;
    const p = lp();
    for (const l of lobsters) {
      if (!l.free) continue;
      l.cd -= dt;
      const dx = p.x - l.m.position.x;
      const dz = p.z - l.m.position.z;
      const d = Math.hypot(dx, dz);
      if (alive() && !busy && d < 40) {
        if (d > 0.7) {
          l.m.position.x += (dx / d) * l.speed * dt;
          l.m.position.z += (dz / d) * l.speed * dt;
          l.m.position.y = p.y < F - 0.5 ? l.m.position.y : F;
          l.m.rotation.y = Math.atan2(dx, dz);
        } else if (l.cd <= 0 && Math.abs(p.y - l.m.position.y) < 1.2) {
          l.cd = 0.6;
          pinches++;
          game.sound.crunch();
          game.character?.kick(0.4);
          game.character?.tint(0xff6a6a, Math.min(pinches / 10, 0.6));
          game.toast('PINCH', `${pinches}/8`, 500);
          if (pinches >= 8) {
            kill('groc-lobsters', ragdoll(0, 6, 0, 10));
            setTimeout(() => game.say('Lobster Union Local 6', 'This is just the beginning. See you at the harbor.', 3200), 1500);
          }
        }
      }
      // claws snap
      l.m.children.forEach((c) => {
        if (c.name === 'claw') c.rotation.y = Math.sin(performance.now() / 90) * 0.4;
      });
    }
  };

  // ------------------------------------------------------------ 11. self-checkout
  let attendantComing = false;
  spot('bananas', V(SPOT.bananas.x, F, SPOT.bananas.z - 0.8), 1.4, () => (holding === 'banana' ? null : 'Take one banana'), () => {
    hold('banana', banana());
    game.sound.blip();
  });
  SPOT.selfCheckout.forEach((k, i) =>
    spot(`scan${i}`, V(k.x, F, k.z), 1.2, () => (attendantComing ? 'Wave him off' : `Scan the banana${scanErrors ? ` (errors: ${scanErrors})` : ''}`), () => {
      if (attendantComing) {
        attendantComing = false;
        sayA(attendant, 'Okay okay, jeez. Just trying to help.', 1800);
        attendant.goHome();
        return;
      }
      if (holding !== 'banana') {
        game.toast('NOTHING TO SCAN', 'You need something to buy. Bananas are in produce.', 2000);
        return;
      }
      scanErrors++;
      beep(scanErrors % 2 ? 880 : 660);
      game.toast('UNEXPECTED ITEM', `"Unexpected item in the bagging area." (${scanErrors})`, 1100);
      game.character?.tint(0xff2a2a, Math.min(scanErrors / 40, 0.5));
      if (scanErrors === 8 || scanErrors === 16) {
        attendantComing = true;
        sayA(attendant, 'Need some help over there?', 1600);
        attendant.speed = 1.4;
        attendant.walk([V(k.x + 1, F, 51)], () => {
          if (!attendantComing) return;
          attendantComing = false;
          scanErrors = 0;
          game.character?.tint(0xffffff, 0);
          sayA(attendant, 'There. You just gotta put it in the bag, man. Have a nice day.', 2400);
          setTimeout(() => attendant.goHome(), 1500);
        });
      }
      if (scanErrors >= 25) {
        if (game.body?.physical !== 'Feeble') {
          scanErrors = 0;
          game.toast('RAGE QUIT', 'You throw the banana. Your healthy heart can take this. A frail one could not.', 3000);
          hold(null, null);
          return;
        }
        busy = true;
        lock(true);
        game.runSeq([
          { at: 0.2, fn: () => game.toast('UNEXPECTED ITEM', '"Unexpected item in the bagging ar—" *clutches chest*', 1800) },
          ...Array.from({ length: 6 }, (_, j) => ({ at: 0.4 + j * 0.15, fn: () => game.character?.kick(j % 2 ? 0.5 : -0.3) })),
          { at: 1.6, fn: () => kill('groc-selfcheckout', ragdoll(0, 2, 1.5, 3, 0.2)) },
          { at: 2.5, fn: () => game.toast('SELF-CHECKOUT', '"Thank you for shopping at Smallville Grocery!"', 2400) },
        ]);
      }
    }),
  );

  // ------------------------------------------------------------ 12. forklift
  const fl = forklift();
  at(fl.group, SPOT.forklift.x, F, SPOT.forklift.z - 1.6);
  root.add(fl.group);
  let lift: { t: number; sneezed: boolean } | null = null;
  spot('forklift', V(SPOT.forklift.x + 1.3, F, SPOT.forklift.z - 1), 1.6, () => (lift ? null : 'Ride the forks up to the top shelf'), () => {
    if (job() !== 'Stocker') {
      game.toast('NOT CERTIFIED', 'Only Stockers are forklift certified. Possess one.', 2400);
      return;
    }
    busy = true;
    lock(true);
    lift = { t: 0, sneezed: false };
    game.sound.creak();
    game.toast('GOING UP', 'The safety manager would hate this.', 1800);
  });
  const liftStep = (h: number) => {
    if (!lift) return;
    if (!alive()) {
      lift = null;
      return;
    }
    lift.t += h;
    const y = Math.min(lift.t / 5, 1) * 7.6;
    fl.forks.position.y = 0.2 + y;
    pin(V(SPOT.forklift.x, F + 0.5 + y, SPOT.forklift.z), Math.PI);
    if (lift.t > 5.4 && !lift.sneezed) {
      lift.sneezed = true;
      game.toast('Ah...', 'Ahh... It is SO dusty up here...', 1500);
      game.runSeq([
        { at: 1.4, fn: () => game.toast('ACHOO!', '', 1200) },
        {
          at: 1.5,
          fn: () => {
            game.sound.noise({ dur: 0.3, vol: 0.5, freq: 1500, type: 'bandpass', q: 1 });
            lift = null;
            kill('groc-forklift', ragdoll(0, 4, -5, 12, 0.5));
            setTimeout(() => (fl.forks.position.y = 0.2), 8000);
          },
        },
      ]);
    }
  };

  // ------------------------------------------------------------ 13. gummy quicksand
  let sink: { depth: number } | null = null;
  const inGummy = (p: THREE.Vector3) => inRect(p, SPOT.gummyBin.x0, SPOT.gummyBin.z0, SPOT.gummyBin.x1 + 1, SPOT.gummyBin.z1 + 1) && p.y < F + 1.6;
  const gummyStep = (h: number) => {
    const p = lp();
    if (!sink) {
      if (alive() && !busy && inGummy(p)) {
        sink = { depth: 0 };
        busy = true;
        lock(true);
        game.toast('SINKING', 'Bulk candy works exactly like quicksand. Wiggle (jump) to sink faster.', 2600);
        game.sound.gulp();
      }
      return;
    }
    if (!alive()) {
      sink = null;
      return;
    }
    const wiggle = game.input.pressed('jump');
    sink.depth += h / 6 + (wiggle ? 0.06 : 0);
    if (wiggle) game.character?.kick(0.3);
    const cx = (SPOT.gummyBin.x0 + SPOT.gummyBin.x1 + 1) / 2;
    const cz = (SPOT.gummyBin.z0 + SPOT.gummyBin.z1 + 1) / 2;
    pin(V(cx, F + 1.3 - sink.depth * 5, cz));
    if (sink.depth >= 1) {
      sink = null;
      game.particles.burst(fx(cx, F + 1.7, cz), 30, 0xe0302a, 4, { life: 0.8, size: 0.15 });
      kill('groc-gummies', ragdoll(0, 1, 0, 2, 0.1));
    }
  };

  // ------------------------------------------------------------ 14. hot sauce challenge
  {
    const table = box(4, 0.9, 0.8, 0x1a1a1a);
    at(table, SPOT.hotSauce.x, F + 0.45, SPOT.hotSauce.z);
    root.add(table);
    const s = sign(['HOT SAUCE CHALLENGE', 'Mildest to wildest · Winners get a T-shirt'], 4, 1, '#c8201a', '#f2d040');
    at(s, SPOT.hotSauce.x, F + 2.3, SPOT.hotSauce.z + 0.3, Math.PI);
    root.add(s);
  }
  const order = [0, 1, 2, 3, 4, 5];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.forEach((sauce, slot) => {
    const x = SPOT.hotSauce.x - 1.75 + slot * 0.7;
    root.add(at(sauceBottle(sauce), x, F + 0.9, SPOT.hotSauce.z));
    spot(`sauce${sauce}`, V(x, F, SPOT.hotSauce.z - 0.9), 0.5, () => `Chug ${SAUCES[sauce].name}`, () => {
      const ch = game.character;
      if (!ch) return;
      game.sound.gulp();
      if (sauce !== sauceNext) {
        sauceNext = 0;
        ch.tint(0xffffff, 0);
        game.toast('OUT OF ORDER', 'Your mouth is on fire, but the challenge says mildest to wildest. Count the peppers. Start over.', 3000);
        return;
      }
      sauceNext++;
      ch.tint(0xff2a1a, sauceNext / 9);
      ch.kick(0.3);
      game.particles.burst(game.player.position().add(V(0, 1.2, 0)), 4 + sauceNext * 3, 0xff7a1a, 3, { life: 0.4, size: 0.12, gravity: -2 });
      if (sauceNext < 6) {
        game.toast(SAUCES[sauce].name.toUpperCase(), ['Tangy.', 'Spicy.', 'Okay, that one hurt.', 'Seeing through time.', 'Your ancestors are crying.'][sauceNext - 1], 1500);
        return;
      }
      busy = true;
      lock(true);
      game.toast('LIQUID REGRET', 'You breathe fire. The sprinklers notice.', 2000);
      const breath = Array.from({ length: 14 }, (_, i) => ({
        at: 0.2 + i * 0.07,
        fn: () => {
          const fw = new THREE.Vector3(Math.sin(game.player.facing), 0, Math.cos(game.player.facing));
          for (let k = 0; k < 6; k++) game.particles.emit(game.player.position().add(V(0, 1.3, 0)).addScaledVector(fw, 0.4), fw.clone().multiplyScalar(9).add(V(0, 1, 0)), k % 2 ? 0xff5a1a : 0xffd040, { life: 0.5, size: 0.25, gravity: -3, spread: 2 });
          game.sound.noise({ dur: 0.1, vol: 0.2, freq: 400, type: 'lowpass' });
        },
      }));
      const sprinkle = Array.from({ length: 18 }, (_, i) => ({
        at: 1 + i * 0.08,
        fn: () => {
          const pl = lp();
          for (let k = 0; k < 10; k++) game.particles.emit(fx(pl.x + (rng() - 0.5) * 14, CEIL - 0.3, pl.z + (rng() - 0.5) * 14), V(0, -6, 0), 0x9ad0ff, { life: 1.4, size: 0.08, gravity: 8, spread: 1 });
        },
      }));
      game.runSeq([
        ...breath,
        ...sprinkle,
        { at: 2.2, fn: () => kill('groc-hotsauce', ragdoll(0, 30, 0, 22, 0.4)) },
      ]);
    });
  });

  // ------------------------------------------------------------ 15. coupon lady
  const detergent = box(0.4, 0.7, 0.5, 0xf07ab0);
  at(detergent, SPOT.detergent.x, F + 1.65, SPOT.detergent.z);
  root.add(detergent);
  {
    const s = sign(['LAST ONE!', '2-FOR-1 SUDZ'], 1, 0.5, '#f2d040', '#c8201a');
    at(s, SPOT.detergent.x + 0.05, F + 2.4, SPOT.detergent.z, Math.PI / 2);
    root.add(s);
  }
  let detergentTaken = false;
  spot('detergent', V(SPOT.detergent.x + 1.2, F, SPOT.detergent.z), 1.3, () => (detergentTaken ? null : 'Take the last 2-for-1 detergent'), () => {
    detergentTaken = true;
    detergent.visible = false;
    hold('detergent', box(0.3, 0.5, 0.35, 0xf07ab0));
    couponChase = true;
    couponLady.speed = 8;
    sayA(couponLady, 'That. Is. MINE. I have a COUPON for that.', 2400);
    game.sound.denied();
  });
  const couponUpdate = () => {
    if (!couponChase) return;
    const p = lp();
    if (!alive() || p.z < 46.5 || holding !== 'detergent') {
      couponChase = false;
      couponLady.speed = 1.2;
      if (alive() && p.z < 46.5) sayA(couponLady, 'This is not over. I know where you shop.', 2400);
      couponLady.goHome();
      setTimeout(() => {
        detergentTaken = false;
        detergent.visible = true;
      }, 6000);
      return;
    }
    if (Math.hypot(couponLady.pos.x - p.x, couponLady.pos.z - p.z) < 1.3 && !busy) {
      couponChase = false;
      game.sound.slam();
      game.shake(0.8);
      sayA(couponLady, 'HI-YAH!', 1500);
      couponLady.ch.kick(-0.6);
      const dir = V(p.x - couponLady.pos.x, 0, p.z - couponLady.pos.z).normalize();
      kill('groc-coupon', ragdoll(dir.x * 24, 11, dir.z * 24, 14, 0.5));
      setTimeout(() => {
        couponLady.speed = 1.2;
        couponLady.goHome();
        detergentTaken = false;
        detergent.visible = true;
      }, 4000);
    } else couponLady.walk([V(p.x, F, p.z)]);
  };

  // ------------------------------------------------------------ 16. rotisserie
  let roast: { t: number } | null = null;
  spot('rotisserie', V(SPOT.rotisserie.x, F, 83.4), 1.6, () => (roast ? null : 'Climb into the warmer to warm up'), () => {
    busy = true;
    lock(true);
    roast = { t: 0 };
    game.sound.creak();
    game.toast('Ahhh', 'So warm. So cozy. Smells like chicken.', 2000);
  });
  const roastStep = (h: number) => {
    if (!roast) return;
    if (!alive()) {
      roast = null;
      return;
    }
    roast.t += h;
    pin(V(SPOT.rotisserie.x, F + 1.05, 85.5), Math.PI);
    game.character?.tint(0xc8862a, Math.min(roast.t / 6, 1) * 0.9);
    if (Math.floor(roast.t * 4) !== Math.floor((roast.t - h) * 4)) game.particles.emit(fx(SPOT.rotisserie.x + (rng() - 0.5) * 3, F + 3, 85.5), V(0, 1.5, 0), 0xffffff, { life: 1, size: 0.2, gravity: -1, spread: 0.4 });
    if (roast.t > 4 && roast.t - h <= 4) game.toast('Golden', 'You are starting to smell delicious.', 1600);
    if (roast.t >= 7) {
      roast = null;
      kill('groc-rotisserie', ragdoll(0, 4, -7, 6, 0.3));
      setTimeout(() => game.say('Customer', 'Excuse me, is that one fresh?', 2400), 1800);
    }
  };

  // ------------------------------------------------------------ runtime
  const resetTimers = (dt: number) => {
    if (cansDown > 0) {
      cansDown -= dt;
      if (cansDown <= 0) {
        dropDyn(cans, () => canMeshes.forEach((m) => (m.visible = true)));
        cans = [];
        cansDown = 0;
      }
    }
    if (melonsDown > 0) {
      melonsDown -= dt;
      if (melonsDown <= 0) {
        dropDyn(melons, () => melonMeshes.forEach((m) => (m.visible = true)));
        melons = [];
        melonsDown = 0;
      }
    }
    if (picklesDown > 0) {
      picklesDown -= dt;
      if (picklesDown <= 0) {
        picklesDown = 0;
        pickles.visible = true;
        picklePuddle.visible = false;
      }
    }
    if (lobstersFree > 0) {
      lobstersFree -= dt;
      if (lobstersFree <= 0) {
        lobstersFree = 0;
        lobsters.forEach((l) => {
          l.free = false;
          l.m.position.copy(l.home);
        });
      }
    }
    if (signKicked) {
      signKickT += dt;
      if (signKickT < 1.2) {
        wetSign.position.z += dt * 9 * (1.2 - signKickT);
        wetSign.rotation.y += dt * 8;
      } else if (signKickT > 40) {
        signKicked = false;
        wetSign.position.copy(wetSignHome);
        wetSign.rotation.set(0, 0, 0);
      }
    }
    if (puddleShoveT > 0) puddleShoveT -= dt;
  };

  const syncDyn = (list: Dyn[]) => {
    for (const d of list) {
      const t = d.body.translation();
      const r = d.body.rotation();
      d.mesh.position.set(t.x, t.y, t.z);
      d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  };

  const routeActors = () => {
    // Shoppers loop.
    for (const s of shoppers)
      if (!s.a.moving) {
        s.k = (s.k + 1) % s.loop.length;
        s.a.walk([s.loop[s.k]]);
      }
    if (emtMode === 'loop' && !emt.moving) {
      emtK = (emtK + 1) % emtLoop.length;
      emt.speed = 2.2;
      emt.walk([emtLoop[emtK]]);
    }
    if (!cartKid.moving) {
      kidK = (kidK + 1) % kidLoop.length;
      cartKid.speed = 2.4;
      cartKid.walk([kidLoop[kidK]]);
    }
    if (!couponChase && !couponLady.moving && !busy) {
      couponK = (couponK + 1) % couponLoop.length;
      couponLady.speed = 1.2;
      couponLady.walk([couponLoop[couponK]]);
    }
  };

  const runtime: PlaceRuntime = {
    interactables,
    interact(id: string) {
      if (!id.startsWith('groc:') || !alive() || busy) return;
      const s = spots.find((sp) => `groc:${sp.id}` === id);
      if (s && s.prompt()) s.act();
    },
    update(dt: number, time: number) {
      if (game.body !== lastBody) {
        lastBody = game.body;
        resetBody();
      }
      // Prompts.
      const p = alive() ? lp() : null;
      spots.forEach((s, i) => {
        const it = interactables[i];
        const text = alive() && !busy ? s.prompt() : null;
        it.enabled = !!text;
        it.prompt = text ?? '';
        // Ride/lot spots follow the lot slope; keep their world y current.
        if (p && s.pos.z < LOT_TOP) it.pos.y = f.oy + s.pos.y;
      });
      routeActors();
      for (const a of actors) a.update(dt);
      shopperCart.position.copy(shoppers[0].a.pos).add(V(Math.sin(shoppers[0].a.facing) * 1.2, 0, Math.cos(shoppers[0].a.facing) * 1.2));
      shopperCart.rotation.y = shoppers[0].a.facing;
      // Automatic doors open for anyone nearby.
      const dc = V(40, F, 46.5);
      const someone = (p && Math.hypot(p.x - dc.x, p.z - dc.z) < 4.5) || actors.some((a) => Math.hypot(a.pos.x - dc.x, a.pos.z - dc.z) < 4.5);
      for (const d of doorPanels) {
        d.open += ((someone ? 1 : 0) - d.open) * Math.min(1, dt * 5);
        d.mesh.position.x = 40 + d.side * (1.5 + d.open * 2.6);
      }
      // Freezer door swing.
      doorAngle += ((doorClosed ? 0 : -Math.PI / 2) - doorAngle) * Math.min(1, dt * 8);
      doorPivot.rotation.y = doorAngle;
      // Slicer blade and chickens spin.
      sl.blade.rotation.x += dt * (paperThin ? 40 : 8);
      for (const c of chickens) c.rotation.z += dt * 1.5;
      if (truckRun >= 0) {
        truckRun += dt;
        truckMesh.position.x += dt * 45;
        if (truckRun > 3) {
          truckRun = -1;
          truckMesh.visible = false;
        }
      }
      syncDyn(cans);
      syncDyn(melons);
      lobsterUpdate(dt);
      couponUpdate();
      updateSlices(dt);
      resetTimers(dt);
      void time;
    },
    step(h: number) {
      stepRide(h);
      liftStep(h);
      roastStep(h);
      mistStep(h);
      freezerStep(h);
    },
    checkHazards(h: number) {
      if (!alive()) return;
      gummyStep(h);
      melonStep();
      if (!busy) mistHazard();
      // Staff-only rooms.
      const p = lp();
      for (const z of zones) {
        const inside = inRect(p, z.x0, z.z0, z.x1, z.z1) && p.y > F - 1 && p.y < CEIL;
        if (inside && !wasIn[z.id] && !isStaff() && !busy && game.player.state !== 'locked') eject(z);
        wasIn[z.id] = inside;
      }
    },
    dispose() {
      for (const a of actors) a.dispose();
      dropDyn(cans, () => {});
      dropDyn(melons, () => {});
      for (const b of bodies) physics.removeRigidBody(b);
      for (const s of slices) s.m.removeFromParent();
      for (const e of extras) e.removeFromParent();
      root.removeFromParent();
    },
  };
  // For the dev page and headless tests.
  Object.assign(runtime, { debug: { actors, emt, freezerCheckIn: () => checkT, cartKid } });
  return runtime;
}
