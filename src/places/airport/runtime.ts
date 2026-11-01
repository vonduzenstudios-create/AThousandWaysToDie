import * as THREE from 'three';
import type { Interactable } from '../../props';
import type { Job } from '../../deaths';
import type { GameApi, MapContext, MapRuntime } from '../../maps/types';
import { mulberry32 } from '../../util';
import { Frame, dbox, inD, type DBox } from './frame';
import { buildAirportSkin } from './skin';
import {
  BELT,
  BRIDGE_END,
  CAROUSELS,
  CAROUSEL_R,
  DEICE,
  DUTY_FREE,
  FENCE_GAP,
  FENCE_Z,
  GATES,
  HANGAR,
  LANES,
  LOUNGE,
  RUNWAY,
  SEC_Z,
  STAFF_DOORS,
  TERM,
  TOWER,
  TSA_OFFICE,
  UP,
  WALKWAY,
  planeSpot,
} from './layout';
import {
  Actor,
  Airliner,
  Door,
  SUITCASE_COLORS,
  airlinerMesh,
  beltTexture,
  boxMesh,
  deicerMesh,
  lambert,
  propPlaneMesh,
  signMesh,
  suitcaseMesh,
  teddyMesh,
  tugMesh,
  type Waypoint,
} from './props';

export const AIRPORT_JOBS = ['Pilot', 'Flight Attendant', 'TSA Agent', 'Baggage Handler', 'Ground Crew', 'Air Traffic Controller'] as const;
const STAFF: readonly string[] = AIRPORT_JOBS;
const RAMP: readonly string[] = ['Baggage Handler', 'Ground Crew', 'Pilot'];
const CREW: readonly string[] = ['Pilot', 'Flight Attendant', 'Ground Crew'];

const RIGHT = Math.PI / 2; // design heading +x

/** Per-body state: resets whenever Gary changes bodies. */
interface BodyState {
  pass: boolean;
  lounge: boolean;
  backpack: boolean;
  tsaTries: number;
  scans: number;
  perfume: number;
  drinks: number;
  gulps: number;
  beltYanks: number;
}

const freshBody = (): BodyState => ({ pass: false, lounge: false, backpack: false, tsaTries: 0, scans: 0, perfume: 0, drinks: 0, gulps: 0, beltYanks: 0 });

export function setupAirport(ctx: MapContext, origin: THREE.Vector3): MapRuntime {
  const { scene, physics, game } = ctx;
  const f = new Frame(ctx.world, origin);
  const added: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T) => {
    scene.add(o);
    added.push(o);
    return o;
  };
  const W = (x: number, y: number, z: number) => f.p(x, y, z);
  const job = () => game.body?.job as string | undefined;
  const isJob = (list: readonly string[]) => !!job() && list.includes(job()!);

  let bodyRef: unknown = null;
  let bs = freshBody();
  const syncBody = () => {
    if (game.body !== bodyRef) {
      bodyRef = game.body;
      bs = freshBody();
    }
  };
  const alive = () => !!game.body && !!game.character && game.player.state !== 'locked';

  // ---------------------------------------------------------------- doors
  const doors: Door[] = [];
  const door = (
    id: string,
    x: number,
    y: number,
    z: number,
    spanX: boolean,
    w: number,
    h: number,
    color: number,
    allowed: () => boolean,
    lockedLine: string,
    label?: string,
  ) => {
    const d = new Door(scene, physics, f, `airport:door-${id}`, new THREE.Vector3(x, y, z), spanX, w, h, color, allowed, lockedLine, label);
    doors.push(d);
    return d;
  };
  door('bagW', STAFF_DOORS.bagW.x + 1, 0, SEC_Z + 0.5, true, 2, 3, 0x9aa3ad, () => isJob(['Baggage Handler', 'Ground Crew']), 'Baggage handlers only. Your badge just beeps sadly.', 'STAFF ONLY');
  door('bagE', STAFF_DOORS.bagE.x + 1, 0, SEC_Z + 0.5, true, 2, 3, 0x9aa3ad, () => isJob(['Baggage Handler', 'Ground Crew']), 'Baggage handlers only. Your badge just beeps sadly.', 'STAFF ONLY');
  door('apronW', STAFF_DOORS.apronW.x + 1, 0, TERM.z1 + 0.5, true, 2, 3, 0xe0b030, () => isJob(RAMP), 'Ramp access. Ground crew, baggage and pilots only.', 'RAMP');
  door('apronE', STAFF_DOORS.apronE.x + 1, 0, TERM.z1 + 0.5, true, 2, 3, 0xe0b030, () => isJob(RAMP), 'Ramp access. Ground crew, baggage and pilots only.', 'RAMP');
  door('tsaoffice', TSA_OFFICE.doorX + 1, 0, TSA_OFFICE.z0 - 0.5, true, 2, 3, 0x3a6fd8, () => isJob(['TSA Agent']), 'TSA personnel only. There is a sticker that says "WE SEE YOU".', 'TSA');
  door('tower', TOWER.x0 + 4, 0, TOWER.z0 + 0.5, true, 2, 3, 0x9aa3ad, () => isJob(['Air Traffic Controller']), 'Air traffic control only. The keypad wants a code you do not have.', 'ATC');
  door('lounge', LOUNGE.x0 - 0.5, UP, LOUNGE.doorZ + 1, false, 2, 3, 0x6b4330, () => bs.lounge || isJob(['Pilot', 'Flight Attendant']), 'Sky Lounge members only. Day passes at the desk.', 'SKY LOUNGE');
  for (const g of GATES)
    door(`gate${g.id}`, g.x + 2, UP, TERM.z1 + 0.5, true, 4, 3, 0x3b5fa8, () => bs.pass || isJob(CREW), 'You need a boarding pass to board. Kiosks are downstairs in the main hall.', `GATE ${g.id}`);
  // TSA lanes: invisible gates that open for ticketed passengers and staff.
  const lanes = LANES.map((lx) => door(`lane${lx}`, lx + 1.5, 0, SEC_Z + 0.5, true, 3, 4, 0x3a6fd8, () => bs.pass || isJob(STAFF) || job() === 'Cop', ''));
  for (const l of lanes) {
    (l.mesh.material as THREE.MeshLambertMaterial).transparent = true;
    (l.mesh.material as THREE.MeshLambertMaterial).opacity = 0;
  }

  // ---------------------------------------------------------------- set dressing
  const signs: [string[], number, number, number, number, number, number, string, string][] = [
    [['CHECK-IN', 'Last Call Airlines'], 81, 6.5, 37.8, 24, 2, 0, '#c8302a', '#ffffff'],
    [['SECURITY', 'Boarding pass and ID ready'], 140, 7.2, SEC_Z - 0.3, 22, 2.2, 0, '#2a2a2e', '#ffd23a'],
    [['BAGGAGE CLAIM'], 228, 7.2, SEC_Z - 0.3, 22, 2.2, 0, '#2a2a2e', '#ffd23a'],
    [['DUTY FREE'], 60, UP + 4.5, DUTY_FREE.z0 + 0.6, 14, 2, 0, '#e06aa0', '#ffffff'],
    [['SKY LOUNGE', 'Members and day passes'], LOUNGE.x0 - 1.6, UP + 4.5, LOUNGE.doorZ + 1, 8, 2, RIGHT, '#6b4330', '#ffd23a'],
    [["FREEFALL FRANK'S", 'Skydiving · Self-serve today'], 12, 4, HANGAR.z0 + 7.5, 10, 2.2, 0, '#6b8e23', '#ffffff'],
    [['LOST & FOUND'], HANGAR.x1 - 5, 4.6, HANGAR.z0 + 2.6, 6, 1, 0, '#2a2a2e', '#ffffff'],
    [['RAMP · AUTHORIZED PERSONNEL ONLY'], 20, 3, FENCE_Z - 0.6, 14, 1.2, 0, '#e0302a', '#ffffff'],
  ];
  for (const [lines, x, y, z, w, h, rot, bg, fg] of signs) {
    const s = add(signMesh(lines, w, h, bg, fg));
    s.position.copy(W(x, y, z));
    s.rotation.y = f.heading(rot) + Math.PI;
  }
  for (const g of GATES) {
    const s = add(signMesh([`GATE ${g.id}`, g.id === 'A1' ? 'Flight 404 · Nowhere' : g.id === 'A3' ? 'Flight 9 · Paris' : 'Flight 22 · Safari'], 6, 2, '#2a2a2e', '#ffd23a'));
    s.position.copy(W(g.x + 2, UP + 4.4, TERM.z1 - 1.2));
    s.rotation.y = f.heading(0) + Math.PI;
  }
  // Wind sock on the tower.
  const sock = add(boxMesh(0.6, 0.6, 3, lambert(0xf07a2a)));
  sock.position.copy(W((TOWER.x0 + TOWER.x1) / 2, TOWER.cabY + 8, (TOWER.z0 + TOWER.z1) / 2));
  const mast = add(boxMesh(0.2, 4, 0.2, lambert(0x9aa3ad)));
  mast.position.copy(W((TOWER.x0 + TOWER.x1) / 2, TOWER.cabY + 7, (TOWER.z0 + TOWER.z1) / 2 + 1.5));
  // High-detail exterior (building kit): curtain wall, rooftop sign, tower, hangar. Visual only.
  const skin = buildAirportSkin(f, scene);
  const radar = skin.radar;

  // Moving belts (textures scroll).
  const belts: { tex: THREE.Texture; speed: number }[] = [];
  const beltPlane = (x0: number, x1: number, z0: number, z1: number, y: number, alongX: boolean, speed: number) => {
    const tex = beltTexture();
    const len = alongX ? x1 - x0 : z1 - z0;
    tex.repeat.set(1, len / 1.5);
    const m = add(new THREE.Mesh(new THREE.PlaneGeometry(alongX ? z1 - z0 : x1 - x0, len), new THREE.MeshLambertMaterial({ map: tex })));
    m.rotation.x = -Math.PI / 2;
    if (alongX) m.rotation.z = Math.PI / 2;
    m.position.copy(W((x0 + x1) / 2, y + 0.02, (z0 + z1) / 2));
    m.receiveShadow = true;
    belts.push({ tex, speed });
  };
  beltPlane(BELT.x0, BELT.x1 + 1, BELT.z0, BELT.z1 + 1, 1, false, 2.5);
  beltPlane(WALKWAY.x0, WALKWAY.x1 + 1, WALKWAY.east.z0, WALKWAY.east.z1 + 1, UP, true, 3);
  beltPlane(WALKWAY.x0, WALKWAY.x1 + 1, WALKWAY.west.z0, WALKWAY.west.z1 + 1, UP, true, -3);

  // Carousels: a spinning ring of suitcases.
  const carousels = CAROUSELS.map((c, ci) => {
    const g = add(new THREE.Group());
    g.position.copy(W(c.x + 0.5, 1, c.z + 0.5));
    const ring = new THREE.Mesh(new THREE.RingGeometry(CAROUSEL_R.inner, CAROUSEL_R.outer, 32), new THREE.MeshLambertMaterial({ color: 0x3a3a40, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    g.add(ring);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = suitcaseMesh(SUITCASE_COLORS[(i + ci * 3) % SUITCASE_COLORS.length]);
      const r = (CAROUSEL_R.inner + CAROUSEL_R.outer) / 2;
      s.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      s.rotation.y = -a;
      g.add(s);
    }
    return { g, c, rideT: 0, offT: 0 };
  });
  const OMEGA = 0.45;

  // Massage chairs.
  for (let i = 0; i < 4; i++) {
    const chair = add(new THREE.Group());
    const red = lambert(0x8a1a1a);
    const seat = boxMesh(1.6, 0.8, 1.4, red);
    seat.position.y = 1.4;
    const back = boxMesh(1.6, 2, 0.5, red);
    back.position.set(0, 2.4, 0.6);
    chair.add(seat, back);
    chair.position.copy(W(168 + i * 3.5, 0, 28.8));
    chair.rotation.y = f.heading(0);
  }

  // Queue stanchions in front of security.
  for (let x = 118; x <= 160; x += 3)
    for (const z of [34, 30]) {
      const post = add(boxMesh(0.2, 1.1, 0.2, lambert(0xd8d8d0)));
      post.position.copy(W(x, 0.55, z));
    }

  // Ground-floor parked planes and their stuff.
  const aircraft = () => airlinerMesh();
  const parked: Airliner[] = [];
  const f404 = new Airliner(scene, physics, f, aircraft(), planeSpot(GATES[0].x).x, planeSpot(GATES[0].x).z, RIGHT);
  const a2 = new Airliner(scene, physics, f, airlinerMesh('LAST CALL AIRLINES', '#3b5fa8', 0x3b5fa8), planeSpot(GATES[1].x).x, planeSpot(GATES[1].x).z, RIGHT);
  const a3 = new Airliner(scene, physics, f, airlinerMesh('LAST CALL AIRLINES', '#3aa65a', 0x3aa65a), planeSpot(GATES[2].x).x, planeSpot(GATES[2].x).z, RIGHT);
  const a4 = new Airliner(scene, physics, f, aircraft(), planeSpot(GATES[3].x).x, planeSpot(GATES[3].x).z, RIGHT);
  const f22 = new Airliner(scene, physics, f, airlinerMesh('LAST CALL AIRLINES', '#8a4ad8', 0x8a4ad8), -400, RUNWAY.cz, RIGHT);
  f22.group.visible = false;
  f22.setCollision(false);
  parked.push(f404, a2, a3, a4, f22);

  const deicer = add(deicerMesh());
  deicer.position.copy(W(229, 0, 113));
  deicer.rotation.y = f.heading(RIGHT) - Math.PI / 2;
  const nozzle = deicer.getObjectByName('nozzle')!;

  const jumpPlane = add(propPlaneMesh());
  jumpPlane.position.copy(W(30, 0, 104));
  jumpPlane.rotation.y = f.heading(0) - Math.PI / 2;
  const prop = jumpPlane.getObjectByName('prop')!;

  const tug = add(tugMesh());
  const tugPath = [
    [80, 120],
    [270, 120],
    [270, 76],
    [80, 76],
  ];
  let tugT = 0;
  const tugLen = (270 - 80) * 2 + (120 - 76) * 2;
  const tugPos = new THREE.Vector3();
  let tugHeading = RIGHT;
  const tugAt = (s: number) => {
    s = ((s % tugLen) + tugLen) % tugLen;
    for (let i = 0; i < 4; i++) {
      const a = tugPath[i], b = tugPath[(i + 1) % 4];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (s <= len) {
        const t = s / len;
        tugPos.set(a[0] + (b[0] - a[0]) * t, 0, a[1] + (b[1] - a[1]) * t);
        tugHeading = Math.atan2(b[0] - a[0], b[1] - a[1]);
        return;
      }
      s -= len;
    }
  };

  // People at their posts.
  const arng = mulberry32(4242);
  const actors: Actor[] = [];
  const actor = (role: ConstructorParameters<typeof Actor>[2], x: number, y: number, z: number, h: number) => {
    const a = new Actor(scene, Math.floor(arng() * 1e6), role, W(x, y, z), f.heading(h));
    actors.push(a);
    return a;
  };
  for (const lx of LANES) actor('tsa', lx - 2, 0, SEC_Z - 2, 0);
  for (const x of [58, 70, 92, 104]) actor('agent', x, 0, 38.6, Math.PI);
  const beltAgent = actor('agent', 84, 0, 38.6, Math.PI);
  const perfumeLady = actor('perfume', DUTY_FREE.x0 + 9, UP, DUTY_FREE.z0 + 2.6, Math.PI);
  actor('bartender', LOUNGE.x0 + 8, UP, LOUNGE.z1 - 2, Math.PI);
  const gateAgent = actor('agent', GATES[0].x + 6.5, UP, 65.5, Math.PI);
  actor('agent', LOUNGE.x0 - 4, UP, LOUNGE.doorZ - 3, RIGHT);
  actor('frank', HANGAR.x0 + 6, 0, HANGAR.z0 + 3.5, 0);
  actor('ground', 50, 0, 108, RIGHT + 0.6);
  actor('ground', 210, 0, 100, -RIGHT);
  for (const a of actors) added.push(a.ch.root);

  // ---------------------------------------------------------------- interactables
  const its: Interactable[] = [];
  const it = (id: string, x: number, y: number, z: number, radius: number, prompt: string, enabled = true) => {
    const o: Interactable = { id: `airport:${id}`, pos: W(x, y, z), radius, prompt, enabled };
    its.push(o);
    return o;
  };
  for (const kx of [56, 64, 72]) it(`kiosk${kx}`, kx + 1, 0, 26, 2.2, 'Print a boarding pass ($40)');
  const massageIt = it('massage', 173, 0, 27, 6, 'Sit in a massage chair (50 quarters)');
  it('perfume', DUTY_FREE.x0 + 9, UP, DUTY_FREE.z0 + 0.5, 3.5, 'Try a perfume sample');
  it('loungedesk', LOUNGE.x0 - 4, UP, LOUNGE.doorZ - 1.5, 2.6, 'Buy a Sky Lounge day pass ($200)');
  it('bar', LOUNGE.x0 + 8, UP, LOUNGE.z1 - 4.5, 3, 'Order a drink');
  it('gatedesk', GATES[0].x + 6.5, UP, 62.5, 2.6, 'Ask about Flight 404');
  const cockpitIt = it('cockpit', GATES[2].x + 1.5, UP, BRIDGE_END - 0.5, 2.6, 'Open the cockpit door');
  it('elevatorUp', TOWER.x0 + 3.5, 0, TOWER.z0 + 3.5, 2.2, 'Take the elevator up');
  it('elevatorDown', TOWER.x0 + 3.5, TOWER.cabY + 1, TOWER.z1 + 2.5, 2.2, 'Take the elevator down');
  it('console', TOWER.x0 + 3.5, TOWER.cabY + 1, TOWER.z0 + 3.4, 2.4, 'Radio Flight 22');
  it('confiscated', TSA_OFFICE.x0 + 3, 0, TSA_OFFICE.z1 - 3.5, 2.6, 'Drink from the confiscated liquids bin');
  it('lostfound', HANGAR.x1 - 5, 0, HANGAR.z0 + 3.8, 2.6, 'Take a backpack from Lost & Found');
  it('jumpplane', 30, 0, 100, 5, 'Board the jump plane');
  it('frank', HANGAR.x0 + 6, 0, HANGAR.z0 + 7.5, 2.6, 'Talk to Frank');
  const doorIts = doors
    .filter((d) => d.lockedLine)
    .map((d) => ({ d, it: it(d.id.replace('airport:', ''), d.at.x - (d.id.includes('lounge') ? 1.2 : 0), d.at.y, d.at.z + (d.id.includes('lounge') ? 0 : -1.2), 2.2, 'Try the door') }));
  // The lounge door is approached from -x, the gates and staff doors from -z; good enough for a radius check.

  // ---------------------------------------------------------------- scripted flights
  const s404 = planeSpot(GATES[0].x);
  const route404 = (): Waypoint[] => [
    { x: s404.x, y: 0, z: s404.z, speed: 0.1, hold: 40, tag: 'boarding' },
    { x: 30, y: 0, z: s404.z, speed: 3, reverse: true, tag: 'pushback' },
    { x: 30, y: 0, z: RUNWAY.cz, speed: 8, tag: 'taxi' },
    // Holds east of the runway 0 numbers so its blast doesn't cover Flight 22's touchdown spot.
    { x: 110, y: 0, z: RUNWAY.cz, speed: 6, hold: 7, tag: 'taxi' },
    { x: 240, y: 0, z: RUNWAY.cz, speed: 4, speedEnd: 46, tag: 'roll' },
    { x: 320, y: 32, z: RUNWAY.cz, speed: 46, tag: 'climb' },
    { x: 560, y: 80, z: RUNWAY.cz + 40, speed: 50, tag: 'climb' },
  ];
  let f404Away = 0;
  f404.fly(route404());

  let f22Active = false;
  const route22 = (): Waypoint[] => [
    { x: -480, y: 62, z: RUNWAY.cz, speed: 13, tag: 'approach' },
    { x: 30, y: 0, z: RUNWAY.cz, speed: 13, tag: 'approach' },
    { x: 200, y: 0, z: RUNWAY.cz, speed: 13, speedEnd: 1, hold: 12, tag: 'rollout' },
  ];

  let pilot: { phase: 'taxi' | 'warn' | 'pulled' | 'crashed'; t: number } | null = null;
  const s3 = planeSpot(GATES[2].x);
  const routePilot = (): Waypoint[] => [
    { x: 160, y: 0, z: s3.z, speed: 5, reverse: true, tag: 'pushback' },
    { x: 160, y: 0, z: RUNWAY.cz, speed: 12, tag: 'taxi' },
    { x: 250, y: 0, z: RUNWAY.cz, speed: 12, speedEnd: 40, tag: 'roll' },
    { x: 312, y: 12, z: RUNWAY.cz, speed: 40, tag: 'climb' },
  ];
  const routePullUp = (): Waypoint[] => [
    { x: 360, y: 60, z: RUNWAY.cz, speed: 42, tag: 'climb' },
    { x: 560, y: 90, z: RUNWAY.cz - 60, speed: 50, tag: 'climb' },
  ];

  // Skydiving.
  let freefall: { bear: THREE.Group | null; t: number } | null = null;

  // Hazard timers.
  let deiceT = 0;
  let trespassT = 0;
  let trespassWarned = false;
  let walkAgainstT = 0;
  let beltStandT = 0;
  const scannerIn = LANES.map(() => false);
  let tsaCool = 0;
  let deathLock = false;

  const lockAndRun = (steps: { at: number; fn: () => void }[]) => {
    deathLock = true;
    game.player.lock(true);
    game.runSeq(steps);
  };
  const kill = (id: string, style: Parameters<GameApi['kill']>[1]) => {
    game.kill(id, style);
  };
  const v3 = (x: number, y: number, z: number) => f.dir(x, y, z);

  const feetD = () => f.toDesign(game.player.feet());

  // ---------------------------------------------------------------- interact
  const interact = (id: string) => {
    syncBody();
    const ch = game.character;
    if (!ch || !game.body) return;
    const s = game.sound;
    const key = id.replace('airport:', '');
    if (key.startsWith('kiosk')) {
      if (bs.pass) return game.toast('Already ticketed', 'You have a boarding pass. Security is that way.', 1800);
      if (game.spend(40, 'Boarding pass')) {
        bs.pass = true;
        s.cash();
        game.toast('BOARDING PASS', `${game.body.name} · Flight 404 · Seat 38E (middle)`, 2600);
      }
      return;
    }
    const dd = doorIts.find((x) => x.it.id === id);
    if (dd) {
      dd.d.tries++;
      s.denied();
      game.toast('LOCKED', dd.d.lockedLine, 2200);
      if (dd.d.tries === 4) game.say('Death', "It's a staff door. You need the right job, genius. Read their file before you jump in.", 4200);
      return;
    }
    switch (key) {
      case 'massage': {
        if (!game.spend(12.5, 'Massage chair')) return;
        s.cash();
        massageIt.enabled = false;
        {
          const fd = feetD();
          const i = Math.max(0, Math.min(3, Math.round((fd.x - 168) / 3.5)));
          game.player.teleport(W(168 + i * 3.5, 1.85, 28.6), f.heading(Math.PI));
        }
        game.say('Massage chair', 'INTENSITY: MAXIMUM. ENJOY YOUR SHIATSU.', 2400);
        lockAndRun([
          ...Array.from({ length: 26 }, (_, i) => ({
            at: 0.2 + i * 0.11,
            fn: () => {
              ch.kick(i % 2 ? 0.5 : -0.5);
              game.shake(0.1 + i * 0.02);
              s.tone({ f: 50 + i * 6, dur: 0.1, type: 'sawtooth', vol: 0.15 });
            },
          })),
          { at: 3.3, fn: () => s.boing() },
          { at: 3.35, fn: () => kill('air-massage', { kind: 'ragdoll', vel: v3(0, 22, 4), spin: 16, bounce: 0.6 }) },
          { at: 6, fn: () => (massageIt.enabled = true) },
        ]);
        return;
      }
      case 'perfume': {
        bs.perfume++;
        s.noise({ dur: 0.3, vol: 0.3, freq: 5000, type: 'highpass' });
        game.particles.burst(game.player.position().add(new THREE.Vector3(0, 0.6, 0)), 14, 0x9adf6a, 2, { life: 2.4, size: 0.35, gravity: -0.3 });
        ch.tint(0x9adf6a, Math.min(bs.perfume / 7, 0.8));
        const lines = ['Ooh, that one suits you.', 'Just one more, hon?', 'This one is called Regret.', 'Try the ten-year oud!', 'You smell like a department store fire. Love it.'];
        if (bs.perfume < 7) {
          game.say('Perfume lady', lines[(bs.perfume - 1) % lines.length], 2200);
          if (bs.perfume >= 4) game.toast('THE CLOUD GROWS', `${bs.perfume} samples. People are leaving the concourse.`, 1600);
          return;
        }
        game.say('Perfume lady', 'Oh no. Not again.', 2400);
        lockAndRun([
          ...Array.from({ length: 6 }, (_, i) => ({ at: i * 0.3, fn: () => (s.noise({ dur: 0.15, vol: 0.4, freq: 900, type: 'bandpass', q: 3 }), ch.kick(0.4)) })),
          { at: 2, fn: () => kill('air-perfume', { kind: 'ragdoll', vel: v3(0, 4, -2), spin: 3, bounce: 0.2 }) },
        ]);
        return;
      }
      case 'loungedesk':
        if (bs.lounge || isJob(['Pilot', 'Flight Attendant'])) return game.toast('Welcome in', 'Your access is already on file.', 1600);
        if (game.spend(200, 'Sky Lounge day pass')) {
          bs.lounge = true;
          s.cash();
          game.toast('SKY LOUNGE DAY PASS', 'Unlimited complimentary beverages. We mean it.', 2400);
        }
        return;
      case 'bar': {
        bs.drinks++;
        s.gulp();
        game.setHueShift(bs.drinks * 28);
        const lines = ['On the house.', 'Another? Sure.', 'You sure, pal?', "I'm legally required to keep pouring.", 'Your flight is boarding, you know.', 'This is the good stuff.', 'Last one. Really.'];
        if (bs.drinks < 8) {
          game.say('Bartender', lines[(bs.drinks - 1) % lines.length], 2000);
          if (bs.drinks >= 5) game.toast('THE ROOM IS SPINNING', `${bs.drinks} complimentary beverages.`, 1600);
          return;
        }
        game.say('Bartender', 'And THAT is how you get your money out of a day pass.', 3000);
        lockAndRun([
          { at: 0.6, fn: () => ch.kick(0.8) },
          { at: 1.4, fn: () => kill('air-openbar', { kind: 'ragdoll', vel: v3(3, 2, 0), spin: 4, bounce: 0.3 }) },
        ]);
        return;
      }
      case 'gatedesk': {
        if (f404.tag === 'boarding') return game.say('Gate agent', 'Flight 404 to Nowhere is boarding now. Boarding group 9, please wait.', 3000);
        if (game.body.physical !== 'Feeble') return game.say('Gate agent', 'Flight 404 just left. The next one is in nine hours. Here, a $5 food voucher.', 3600);
        game.say('Gate agent', 'Flight 404 just left. The next one is in nine hours.', 2500);
        lockAndRun([
          { at: 1.6, fn: () => game.say(game.body?.name ?? 'You', 'NINE HOURS?!', 1800) },
          ...Array.from({ length: 10 }, (_, i) => ({
            at: 2 + i * 0.12,
            fn: () => {
              ch.tint(0xe0302a, i / 12);
              ch.kick(i % 2 ? 0.5 : -0.5);
              game.shake(0.2);
            },
          })),
          { at: 3.3, fn: () => s.thunder() },
          { at: 3.4, fn: () => kill('air-missedflight', { kind: 'ragdoll', vel: v3(0, 3, -3), spin: 2, bounce: 0.2 }) },
        ]);
        return;
      }
      case 'cockpit': {
        if (job() !== 'Pilot') {
          s.denied();
          return game.toast('COCKPIT', 'The door is reinforced and you are not a pilot. The flight attendant is staring at you.', 2400);
        }
        if (!a3.done || pilot) return;
        startPilot();
        return;
      }
      case 'elevatorUp':
        s.blip(0.8);
        game.flash('#000000', 400);
        game.player.teleport(W(TOWER.x0 + 3.5, TOWER.cabY + 1, TOWER.z1 + 2), 0);
        return;
      case 'elevatorDown':
        s.blip(0.6);
        game.flash('#000000', 400);
        game.player.teleport(W(TOWER.x0 + 3.5, 0, TOWER.z0 + 2), f.heading(Math.PI));
        return;
      case 'console': {
        if (job() !== 'Air Traffic Controller') return game.toast('RADAR', 'Lots of green blips. You have no idea what any of them mean.', 2200);
        if (f22Active) return game.say('Flight 22', 'Already on approach, tower. Runway zero, like you said.', 2600);
        f22Active = true;
        f22.group.visible = true;
        f22.setCollision(false);
        f22.park(-480, RUNWAY.cz, RIGHT);
        f22.pos.y = 62;
        f22.fly(route22());
        game.say('You', 'Flight 22, you are cleared to land on runway... zero.', 3000);
        game.runSeq([{ at: 3.2, fn: () => game.say('Flight 22', 'Runway zero? Uh. Roger, tower. Cleared to land runway zero.', 3500) }]);
        game.toast('FLIGHT 22 INBOUND', 'Touchdown in about 40 seconds. Runway zero is the far west end.', 3500);
        return;
      }
      case 'confiscated': {
        bs.gulps++;
        s.gulp();
        const what = ['shampoo', 'a "water" that is vodka', 'contact lens solution', 'somebody\'s soup', 'hot sauce'];
        ch.tint(0x8ad0ff, bs.gulps / 6);
        if (bs.gulps < 5) return game.toast('GULP', `That was ${what[bs.gulps - 1]}. 3.4 ounces exactly.`, 1800);
        lockAndRun([
          { at: 0.4, fn: () => game.particles.burst(game.player.position().add(new THREE.Vector3(0, 0.8, 0)), 30, 0xffffff, 3, { life: 1.6, size: 0.3, gravity: -1 }) },
          { at: 0.5, fn: () => game.say('Death', 'Bubbles. Out of every hole. Classy.', 2500) },
          { at: 1.6, fn: () => kill('air-confiscated', { kind: 'ragdoll', vel: v3(0, 5, 2), spin: 6, bounce: 0.3 }) },
        ]);
        return;
      }
      case 'lostfound':
        if (bs.backpack) return game.toast('Lost & Found', 'You already took a backpack. Greedy.', 1600);
        bs.backpack = true;
        s.pull();
        game.toast('BACKPACK', 'A heavy-ish backpack with straps and a pull cord. Definitely a parachute.', 2600);
        return;
      case 'frank':
        return game.say('Frank (on lunch)', "Jumps are self-serve today. Plane's right there. Bring your own chute, I'm not your mom.", 3600);
      case 'jumpplane':
        if (!bs.backpack) return game.say('Pilot', 'No chute, no jump. Even I have rules.', 2400);
        startSkydive();
        return;
    }
  };

  const startPilot = () => {
    pilot = { phase: 'taxi', t: 0 };
    game.player.setEnabled(false);
    game.player.lock(true);
    a3.setCollision(false);
    a3.fly(routePilot());
    cockpitIt.enabled = false;
    game.sound.horn();
    game.say('Copilot', "Captain? We don't have clearance. Captain!", 3000);
  };

  const endPilot = () => {
    pilot = null;
    game.player.setEnabled(true);
    a3.setCollision(true);
    a3.park(s3.x, s3.z, RIGHT);
    cockpitIt.enabled = true;
  };

  const startSkydive = () => {
    game.flash('#ffffff', 900);
    game.sound.whoosh();
    game.player.teleport(W(150, 190, 110), f.heading(RIGHT));
    freefall = { bear: null, t: 0 };
    game.toast('12,500 FEET', 'Jump! Press E to pull the ripcord.', 3000);
  };

  // ---------------------------------------------------------------- per-frame
  const update = (dt: number, time: number) => {
    syncBody();
    for (const d of doors) d.update();
    for (const x of doorIts) x.it.enabled = !x.d.open;
    for (const b of belts) b.tex.offset.y -= (b.speed * dt) / 1.5;
    for (const c of carousels) c.g.rotation.y += OMEGA * dt;
    for (const a of actors) a.update(dt, a === perfumeLady ? 0.2 : 0);
    prop.rotation.x += dt * (freefall ? 30 : 2);
    sock.rotation.y = Math.sin(time * 0.3) * 0.6;
    radar.rotation.y += dt * 1.5;
    // De-icing spray.
    nozzle.getWorldPosition(tmp);
    if (Math.random() < 0.8) {
      const d = f.dir(-1.5 + Math.random(), -2, -3 - Math.random() * 3);
      game.particles.emit(tmp, d.multiplyScalar(2.2), 0xff8a1a, { life: 1.2, size: 0.35, gravity: 6, spread: 0.6 });
    }
    // Jet blast smoke and heat shimmer during spool and roll.
    for (const p of [f404, a3]) {
      if (p.tag === 'roll' || (p === f404 && p.tag === 'taxi' && p.speed < 0.6)) {
        for (const side of [-6.5, 6.5]) {
          const e = f.p(...(p.offset(-6, 6.4, side).toArray() as [number, number, number]));
          const back = f.dir(-Math.sin(p.heading), 0, -Math.cos(p.heading)).multiplyScalar(30);
          game.particles.emit(e, back, 0xdddddd, { life: 0.5, size: 0.5, gravity: 0, spread: 1.5 });
        }
      }
    }
    // Pilot camera follows the plane by carrying the body along.
    if (pilot && pilot.phase !== 'crashed') {
      const seat = a3.offset(17, 8.2, 0);
      game.player.teleport(W(seat.x, seat.y, seat.z), f.heading(a3.heading));
      game.player.lock(true);
    }
    // Tug.
    tugT += dt * 7;
    tugAt(tugT);
    tug.position.copy(W(tugPos.x, 0, tugPos.z));
    tug.rotation.y = f.heading(tugHeading) - Math.PI / 2;
    // Freefall prompt.
    if (freefall && !freefall.bear && game.body) {
      game.prompt('<span class="key">E</span>Pull the ripcord');
      if (game.input.pressed('interact')) {
        const bear = add(teddyMesh());
        bear.scale.setScalar(1.3);
        freefall.bear = bear;
        game.sound.boing();
        game.say('Death', "That's a teddy bear. You jumped with a teddy bear.", 3500);
      }
    }
    if (freefall?.bear) {
      freefall.bear.position.copy(game.player.position()).add(new THREE.Vector3(0, 3 + Math.sin(time * 6) * 0.3, 0));
      freefall.bear.rotation.y += dt * 4;
    }
  };
  const tmp = new THREE.Vector3();

  // ---------------------------------------------------------------- fixed step
  const step = (h: number) => {
    syncBody();
    for (const p of parked) p.step(h);
    // Flight 404 cycle.
    if (f404.done) {
      if (f404Away === 0) {
        f404.group.visible = false;
        f404.setCollision(false);
        f404Away = 25;
      } else {
        f404Away -= h;
        if (f404Away <= 0) {
          f404Away = 0;
          f404.park(s404.x, s404.z, RIGHT);
          f404.setCollision(true);
          f404.fly(route404());
        }
      }
    }
    if (f22Active && f22.done) {
      f22Active = false;
      f22.group.visible = false;
      f22.park(-480, RUNWAY.cz, RIGHT);
      f22.group.visible = false;
    }
    // Pilot flight.
    if (pilot) {
      pilot.t += h;
      if (pilot.phase === 'taxi' && a3.pos.x > 215) {
        pilot.phase = 'warn';
        pilot.t = 0;
        game.say('Cockpit', 'TERRAIN. TERRAIN. PULL UP. PULL UP.', 3000);
        game.prompt('<span class="key">Space</span>Pull up');
      }
      if (pilot.phase === 'warn') {
        if (Math.floor(pilot.t * 4) !== Math.floor((pilot.t - h) * 4)) game.sound.tone({ f: 880, dur: 0.12, type: 'square', vol: 0.25 });
        if (game.input.pressed('jump')) {
          pilot.phase = 'pulled';
          a3.fly(routePullUp());
          game.say('Copilot', 'You pulled up! You absolute coward. I love you.', 3000);
        } else if (a3.done) {
          pilot.phase = 'crashed';
          crashPilot();
        }
      }
      if (pilot.phase === 'pulled' && a3.done) {
        game.flash('#000000', 800);
        endPilot();
        game.player.teleport(W(GATES[2].x + 1.5, UP, BRIDGE_END - 2), f.heading(Math.PI));
        game.toast('LANDED', 'You circled and landed. Nobody died. Mortalis is disappointed.', 3000);
      }
    }
    // Moving walkways and belts carry the player.
    if (!game.body || !game.character) return;
    const d = feetD();
    if (game.player.grounded || game.player.state === 'locked') {
      let carry: THREE.Vector3 | null = null;
      if (d.y > UP - 0.3 && d.y < UP + 0.6 && d.x >= WALKWAY.x0 && d.x <= WALKWAY.x1 + 1) {
        if (d.z >= WALKWAY.east.z0 && d.z <= WALKWAY.east.z1 + 1) carry = new THREE.Vector3(3, 0, 0);
        if (d.z >= WALKWAY.west.z0 && d.z <= WALKWAY.west.z1 + 1) carry = new THREE.Vector3(-3, 0, 0);
      }
      if (inD(d, dbox(BELT.x0, 0.7, BELT.z0, BELT.x1 + 1, 1.8, BELT.z1 + 1))) carry = new THREE.Vector3(0, 0, 2.5);
      for (const c of carousels) {
        const dx = d.x - (c.c.x + 0.5), dz = d.z - (c.c.z + 0.5);
        const r = Math.hypot(dx, dz);
        if (r > CAROUSEL_R.inner && r < CAROUSEL_R.outer && d.y > 0.7 && d.y < 1.8) {
          // Matches the suitcase ring's +y rotation in world space (design z is mirrored).
          carry = new THREE.Vector3(-dz * OMEGA, 0, dx * OMEGA);
        }
      }
      if (carry && !deathLock) {
        const w = f.dir(carry.x, 0, carry.z).multiplyScalar(h);
        // Shift both the current pose and the pending kinematic target, so the carry works
        // whether the loop calls step() before or after player.update().
        const body = game.player.body;
        const t = body.translation();
        const nt = body.nextTranslation();
        body.setTranslation({ x: t.x + w.x, y: t.y, z: t.z + w.z }, true);
        body.setNextKinematicTranslation({ x: nt.x + w.x, y: nt.y, z: nt.z + w.z });
      }
    }
    if (freefall && game.player.vel.y < (freefall.bear ? -20 : -30)) game.player.vel.y = freefall.bear ? -20 : -30;
  };

  // ---------------------------------------------------------------- hazards
  const checkHazards = (h: number) => {
    syncBody();
    if (!game.body || !game.character) return;
    if (game.player.state === 'locked') return;
    deathLock = false;
    const d = feetD();
    const p = game.player;
    const s = game.sound;
    const ch = game.character;
    tsaCool -= h;

    // Bag belt: lie flat (crouch) or the check-in agent yanks you off.
    if (inD(d, dbox(BELT.x0, 0.7, BELT.z0, BELT.x1 + 1, 2, BELT.z1 + 1))) {
      const flat = p.state === 'crouch' || p.state === 'crawl' || job() === 'Baggage Handler';
      beltStandT = flat ? 0 : beltStandT + h;
      if (!flat && d.z < SEC_Z - 0.5 && beltStandT > 0.9) {
        beltStandT = 0;
        bs.beltYanks++;
        game.say('Check-in agent', bs.beltYanks < 3 ? 'Sir. SIR. You cannot check yourself in.' : 'Again?! Bags lie FLAT, sir. You are not a bag.', 2600);
        s.whoosh();
        p.teleport(W(BELT.x0 + 1, 0, 33), f.heading(Math.PI));
        p.knock(f.dir(0, 6, -6));
        return;
      }
      if (d.z > BELT.z1 - 1.5) {
        lockAndRun([
          ...Array.from({ length: 10 }, (_, i) => ({ at: i * 0.1, fn: () => (s.noise({ dur: 0.1, vol: 0.5, freq: 300 + i * 80, type: 'bandpass', q: 1 }), game.shake(0.4)) })),
          {
            at: 1,
            fn: () => {
              const at = W(BELT.x0 + 1, 6.5, BELT.z1 + 2);
              for (let i = 0; i < 6; i++) game.particles.burst(at, 6, SUITCASE_COLORS[i], 9, { life: 1.6, size: 0.45 });
              kill('air-bagbelt', { kind: 'ragdoll', vel: v3(0, 18, 6), spin: 14, bounce: 0.5 });
            },
          },
        ]);
        game.say('Sorter', 'BAG TAG UNREADABLE. ROUTING TO: ALL DESTINATIONS.', 2500);
        return;
      }
    }

    // Carousel ride.
    for (const c of carousels) {
      const r = Math.hypot(d.x - (c.c.x + 0.5), d.z - (c.c.z + 0.5));
      const on = r > CAROUSEL_R.inner && r < CAROUSEL_R.outer && d.y > 0.7 && d.y < 2;
      if (on) {
        c.rideT += h;
        c.offT = 0;
        if (Math.floor(c.rideT) === 7 && Math.floor(c.rideT - h) === 6) game.toast('LAP TWO', 'People are taking photos of you.', 1500);
        if (c.rideT > 13) {
          c.rideT = 0;
          game.say('Speaker', 'Baggage from Flight 22 is now arriving on carousel two. All of it.', 3000);
          const top = W(c.c.x, 7, SEC_Z - 2);
          const cases: THREE.Group[] = [];
          lockAndRun([
            ...Array.from({ length: 16 }, (_, i) => ({
              at: i * 0.09,
              fn: () => {
                const sc = add(suitcaseMesh(SUITCASE_COLORS[i % SUITCASE_COLORS.length]));
                sc.scale.setScalar(1.6);
                sc.position.copy(top).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, 0));
                cases.push(sc);
                s.tone({ f: 200 - i * 6, dur: 0.06, type: 'square', vol: 0.15 });
              },
            })),
            { at: 1.6, fn: () => kill('air-carousel', { kind: 'pancake' }) },
          ]);
          // Animate the avalanche falling onto the player.
          const target = game.player.feet();
          let k = 0;
          const fall = () => {
            k++;
            cases.forEach((sc, i) => sc.position.lerp(target.clone().add(new THREE.Vector3((i % 4) * 0.5 - 1, Math.floor(i / 4) * 0.8, ((i * 7) % 3) * 0.5 - 0.5)), 0.12));
            if (k < 120) requestAnimationFrame(fall);
          };
          requestAnimationFrame(fall);
          setTimeout(() => cases.forEach((sc) => scene.remove(sc)), 15000);
          return;
        }
      } else {
        c.offT += h;
        if (c.offT > 3) c.rideT = 0;
      }
    }

    // Moving walkway: sprint against it long enough and it eats you.
    const onEast = d.y > UP - 0.3 && d.y < UP + 0.8 && d.x > WALKWAY.x0 && d.x < WALKWAY.x1 + 1 && d.z >= WALKWAY.east.z0 && d.z <= WALKWAY.east.z1 + 1;
    const onWest = d.y > UP - 0.3 && d.y < UP + 0.8 && d.x > WALKWAY.x0 && d.x < WALKWAY.x1 + 1 && d.z >= WALKWAY.west.z0 && d.z <= WALKWAY.west.z1 + 1;
    if (onEast || onWest) {
      const vd = f.toDesign(p.position().add(p.vel)).sub(f.toDesign(p.position()));
      const against = onEast ? vd.x < -5 : vd.x > 5;
      walkAgainstT = against ? walkAgainstT + h : Math.max(0, walkAgainstT - h * 2);
      if (walkAgainstT > 3) {
        walkAgainstT = 0;
        s.scream(1.3);
        game.toast('TRIPPED', 'Wrong way, wrong speed, wrong everything.', 1800);
        const endX = onEast ? WALKWAY.x1 + 0.5 : WALKWAY.x0 + 0.5;
        const z = d.z;
        const startX = d.x;
        lockAndRun([
          ...Array.from({ length: 20 }, (_, i) => ({
            at: i * 0.07,
            fn: () => {
              p.teleport(W(startX + (endX - startX) * ((i + 1) / 20), UP, z), f.heading(onEast ? -RIGHT : RIGHT));
              p.lock(true);
              ch.kick(0.3);
            },
          })),
          {
            at: 1.5,
            fn: () => {
              s.crunch();
              game.shake(0.8);
              kill('air-walkway', { kind: 'pancake' });
            },
          },
        ]);
        return;
      }
    } else walkAgainstT = 0;

    // TSA: no pass, no entry. Keep trying and get the full experience.
    LANES.forEach((lx, i) => {
      const lane = lanes[i];
      if (!lane.open && tsaCool <= 0 && inD(d, dbox(lx - 0.2, -0.5, SEC_Z - 2.2, lx + 3.2, 2, SEC_Z + 0.1))) {
        tsaCool = 1.5;
        bs.tsaTries++;
        const lines = ['Boarding pass and ID, please. No? Back of the line.', 'Sir. Boarding pass. Kiosks are RIGHT there.', 'Final warning. One more time and you get the glove.'];
        if (bs.tsaTries <= 3) {
          game.say('TSA', lines[bs.tsaTries - 1], 2600);
          s.denied();
          p.teleport(W(lx + 1.5, 0, 33), f.heading(Math.PI));
          p.knock(f.dir(0, 5, -7));
          game.toast('TURNED AWAY', `No boarding pass. (${bs.tsaTries}/3)`, 1600);
        } else {
          game.say('TSA', 'Arms out. Feet apart. This will take as long as it takes.', 3000);
          lockAndRun([
            ...Array.from({ length: 20 }, (_, i) => ({
              at: 0.4 + i * 0.13,
              fn: () => {
                s.tone({ f: 300 + (i % 3) * 40, dur: 0.05, type: 'square', vol: 0.15 });
                ch.kick(i % 2 ? 0.3 : -0.3);
                if (i === 8) game.toast('HOUR 4', 'The pat-down continues.', 1200);
                if (i === 15) game.toast('HOUR 9', 'They found a Tic Tac.', 1200);
              },
            })),
            { at: 3.3, fn: () => kill('air-patdown', { kind: 'ragdoll', vel: v3(0, 3, -4), spin: 3, bounce: 0.3 }) },
          ]);
        }
      }
      // Body scanner counts.
      const inScan = inD(d, dbox(lx, -0.5, SEC_Z + 1, lx + 3, 3, SEC_Z + 4));
      if (inScan && !scannerIn[i]) {
        bs.scans++;
        s.tone({ f: 600, f2: 1200, dur: 0.3, type: 'sine', vol: 0.2 });
        ch.tint(0x9cff6a, Math.min(bs.scans / 15, 0.9));
        const lines: Record<number, string> = { 3: 'Again? Okay...', 6: 'Sir, you can go now. You are scanned.', 9: 'Is he... glowing?', 12: 'I can see your skeleton without the machine.' };
        if (lines[bs.scans]) game.say('TSA', lines[bs.scans], 2400);
        if (bs.scans >= 15) {
          lockAndRun([
            { at: 0.2, fn: () => (game.flash('#9cff6a', 900), s.zap(1)) },
            { at: 1.2, fn: () => kill('air-scanner', { kind: 'ragdoll', vel: v3(0, 6, 3), spin: 5, bounce: 0.4 }) },
          ]);
        }
      }
      scannerIn[i] = inScan;
    });

    // De-icer spray.
    if (inD(d, DEICE)) {
      deiceT += h;
      ch.tint(0xff8a1a, Math.min(deiceT / 2.5, 0.85));
      if (deiceT > 2.5) {
        deiceT = 0;
        s.splat();
        kill('air-deicer', { kind: 'ragdoll', vel: v3(-3, 5, 0), spin: 4, bounce: 0.3 });
        return;
      }
    } else if (deiceT > 0) deiceT = Math.max(0, deiceT - h);

    // Jet blast behind Flight 404 (spooling at the threshold or rolling slowly).
    for (const pl of [f404]) {
      const spool = pl.tag === 'taxi' && pl.speed < 0.6 && Math.abs(pl.pos.z - RUNWAY.cz) < 1 && pl.pos.x > 105;
      const roll = pl.tag === 'roll' && pl.speed < 30;
      if (!spool && !roll) continue;
      const l = pl.local(d);
      if (l.along < -14 && l.along > -70 && Math.abs(l.side) < 16 && l.up < 8) {
        s.whoosh();
        game.shake(1.2);
        const back = f.dir(-Math.sin(pl.heading), 0, -Math.cos(pl.heading)).multiplyScalar(55);
        back.y = 26;
        kill('air-jetblast', { kind: 'ragdoll', vel: back, spin: 20, bounce: 0.6 });
        return;
      }
    }

    // Flight 22 lands on whatever is on runway zero.
    if (f22Active && f22.pos.y < 2.5 && f22.speed > 2) {
      const l = f22.local(d);
      const body = Math.abs(l.along) < 21 && Math.abs(l.side) < 3;
      const wing = Math.abs(l.along + 2.5) < 4 && Math.abs(l.side) < 17;
      if ((body || wing) && l.up < 8) {
        s.splat();
        game.shake(1.5);
        kill('air-runway0', { kind: 'pancake' });
        game.runSeq([{ at: 2.5, fn: () => game.say('Flight 22', 'Tower said runway zero. I was told to.', 3500) }]);
        return;
      }
    }

    // Baggage tug.
    const tl = Math.hypot(d.x - tugPos.x, d.z - tugPos.z);
    if (tl < 2 && d.y < 2) {
      s.horn();
      const v = f.dir(Math.sin(tugHeading) * 20, 9, Math.cos(tugHeading) * 20);
      kill('air-tug', { kind: 'ragdoll', vel: v, spin: 12, bounce: 0.6 });
      return;
    }

    // Trespassing on the ramp without a staff job.
    const onRamp = d.z > FENCE_Z && d.y < 6 && !inD(d, dbox(HANGAR.x0, -1, HANGAR.z0, HANGAR.x1 + 1, 30, HANGAR.z1 + 1)) && !inD(d, dbox(FENCE_GAP.x0 - 1, -1, FENCE_Z, FENCE_GAP.x1 + 2, 6, HANGAR.z0 + 1));
    if (onRamp && !isJob(STAFF)) {
      trespassT += h;
      if (!trespassWarned && trespassT > 0.8) {
        trespassWarned = true;
        game.say('Ground crew', "HEY! You can't be out here! Security's on the way!", 3000);
        game.toast('TRESPASSING', 'Airport police arrive in 30 seconds.', 2400);
      }
      if (trespassT > 30) {
        trespassT = 0;
        trespassWarned = false;
        game.say('Airport police', 'Okay, tourist. Back to the curb.', 2600);
        game.flash('#000000', 600);
        p.teleport(W(160, 0, 10), f.heading(Math.PI));
      }
    } else if (!onRamp) {
      trespassT = 0;
      trespassWarned = false;
    }
  };

  const crashPilot = () => {
    const at = a3.offset(10, 9, 0);
    const wAt = W(at.x, at.y, at.z);
    game.sound.thunder();
    game.sound.noise({ dur: 1.8, vol: 0.8, freq: 200, type: 'lowpass' });
    game.shake(2);
    game.flash('#ffb040', 900);
    for (let i = 0; i < 5; i++) game.particles.burst(wAt, 40, [0xff6a1a, 0xffd23a, 0x333333, 0xdddddd, 0xff3a1a][i], 18, { life: 2.5, size: 0.8, gravity: 2 });
    a3.group.visible = false;
    game.player.setEnabled(true);
    game.player.teleport(f.p(at.x - 6, at.y, at.z));
    game.player.lock(true);
    kill('air-terrain', { kind: 'ragdoll', vel: v3(-30, 26, 8), spin: 22, bounce: 0.6 });
    game.runSeq([
      { at: 2, fn: () => game.say('Copilot (parachuting)', 'Everybody out! The passengers are fine! Mostly!', 3500) },
      {
        at: 14,
        fn: () => {
          pilot = null;
          a3.setCollision(true);
          a3.park(s3.x, s3.z, RIGHT);
          cockpitIt.enabled = true;
        },
      },
    ]);
  };

  // Landing from the jet bridge end, or from the sky with a teddy bear.
  const onLand: MapRuntime['onLand'] = (e) => {
    if (!game.body) return false;
    if (freefall) {
      const bear = freefall.bear;
      freefall = null;
      game.prompt(null);
      game.sound.splat();
      game.shake(1.4);
      kill('air-teddychute', { kind: 'pancake' });
      if (bear) {
        game.runSeq([{ at: 0.4, fn: () => bear.position.copy(game.player.feet().add(new THREE.Vector3(0.8, 0.2, 0))) }]);
        setTimeout(() => scene.remove(bear), 20000);
      } else game.runSeq([{ at: 2, fn: () => game.say('Death', 'You didn\'t even pull it. The bear would have been funnier.', 3000) }]);
      return true;
    }
    const lp = f.toDesign(e.launchPos);
    const fromBridge = lp.y > 6.5 && lp.z > TERM.z1 && lp.z < BRIDGE_END + 3 && GATES.some((g) => lp.x > g.x - 1.5 && lp.x < g.x + 5);
    if (fromBridge && e.drop > 3) {
      game.sound.splat();
      kill('air-jetbridge', { kind: 'ragdoll', vel: game.player.vel.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 5, 0)), spin: 8, bounce: 0.5 });
      game.runSeq([{ at: 2, fn: () => game.say('Gate agent', 'Flight 404 has departed. Please step away from the door.', 3000) }]);
      return true;
    }
    return false;
  };

  const runtime: MapRuntime & { debug: unknown } = {
    // Handles for tests and the dev preview.
    debug: { f404, f22, a3, doors, get bs() { return bs; }, frame: f, skin: skin.stats },
    interactables: its,
    interact,
    update,
    step,
    checkHazards,
    onLand,
    dispose() {
      for (const o of added) scene.remove(o);
      skin.dispose();
      for (const d of doors) d.dispose(scene, physics);
      for (const p of parked) p.dispose(physics);
      for (const a of actors) a.ch.dispose();
    },
  };
  return runtime;
}

/** NPC spawns that make the airport jobs available to possess. Area keys match placeAirport's areas. */
export const AIRPORT_NPCS: { area: string; job?: Job; count?: number }[] = [
  { area: 'airport:checkin', count: 5 },
  { area: 'airport:checkin', job: 'Pilot' as Job },
  { area: 'airport:checkin', job: 'Flight Attendant' as Job },
  { area: 'airport:checkin', job: 'TSA Agent' as Job, count: 2 },
  { area: 'airport:claim', count: 3 },
  { area: 'airport:claim', job: 'Baggage Handler' as Job },
  { area: 'airport:curb', job: 'Air Traffic Controller' as Job },
  { area: 'airport:curb', count: 2 },
  { area: 'airport:apron', job: 'Ground Crew' as Job, count: 2 },
  { area: 'airport:apron', job: 'Baggage Handler' as Job },
];
