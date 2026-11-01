import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from '../../physics';
import { sexOfName, type Job, type PersonFile } from '../../deaths';
import type { Interactable } from '../../props';
import type { MapContext, MapRuntime } from '../../maps/types';
import { Npc } from '../../npc';
import type { NavGrid } from '../../life/nav';
import { canvasTexture, mulberry32, noiseTexture } from '../../util';
import { FLOOR_H, FLOOR_NAMES, ROOF, type Box3, type HospitalInfo } from './layout';
import { buildHospitalFacade } from './facade';
import { ambulanceModel, heliModel } from './models';
import { StreetKit, propModel, type PropKind } from '../../kit';

/** Jobs that get past the lobby. */
export const HOSPITAL_STAFF: readonly string[] = ['Doctor', 'Surgeon', 'Nurse', 'EMT', 'Firefighter', 'Janitor', 'Security Guard'];
/** Jobs that can use medical equipment. */
export const MEDICAL: readonly string[] = ['Doctor', 'Surgeon', 'Nurse', 'EMT'];
/** Jobs allowed in the operating rooms. */
export const SURGICAL: readonly string[] = ['Surgeon', 'Doctor'];

const ID = (s: string) => `hospital:${s}`;

const inBox = (p: THREE.Vector3, b: Box3) =>
  p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;

const mat = (color: THREE.ColorRepresentation, emissive = 0) => new THREE.MeshLambertMaterial({ color, map: noiseTexture(), emissive });
const basic = (color: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({ color });

function bx(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function signTex(lines: string[], bg: string, fg: string, w = 512, h = 128) {
  return canvasTexture(
    w,
    h,
    (c) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      lines.forEach((line, i) => {
        const size = i === 0 ? Math.floor(h / (lines.length + 0.6)) : Math.floor(h / (lines.length + 1.6));
        c.font = `bold ${size}px Arial Black, Impact, sans-serif`;
        c.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1), w - 20);
      });
    },
    false,
  );
}

/** A person posted at a fixed spot (a nurse at her station, a patient in bed) or walking a beat. */
interface Post {
  job?: Job;
  at: THREE.Vector3;
  facing: number;
  pose?: 'stand' | 'lie';
  patrol?: THREE.Vector3[];
  file?: (f: PersonFile) => void;
  npc: Npc | null;
  respawnT: number;
  idx: number;
  pause: number;
}

/** Posted people never path-find, so their bodies get a nav grid that says no to everything. */
const NO_NAV = { groundAt: () => 0, walkable: () => false, nearest: (p: { x: number; z: number }) => p } as unknown as NavGrid;

type Zone = 'outside' | 'public' | 'staff' | 'ward' | 'preop' | 'or';

export interface HospitalOptions {
  /** Shown on the facade and in toasts. */
  name?: string;
}

/**
 * Props, people, access rules and deaths for the hospital stamped by buildHospital.
 * Returns a MapRuntime; merge it into the map's own runtime.
 */
export function setupHospital(ctx: MapContext, info: HospitalInfo, opts: HospitalOptions = {}): MapRuntime {
  const { scene, physics, game } = ctx;
  const name = opts.name ?? 'City General Hospital';
  const { C, P, zones } = info;
  const Yf = (f: number) => f * FLOOR_H;
  const root = new THREE.Group();
  root.name = 'hospital';
  scene.add(root);
  const fixed = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const colliders: RAPIER.Collider[] = [];
  /** Solid box collider (centre, half extents). */
  const solid = (c: THREE.Vector3, hx: number, hy: number, hz: number) => {
    const col = physics.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(c.x, c.y, c.z).setCollisionGroups(groups(G_WORLD, G_ALL)),
      fixed,
    );
    colliders.push(col);
    return col;
  };
  // Invisible ramps (about 38°) over each stair flight: the character controller's autostep is
  // unreliable on long runs of 1-block steps, so the steps are for looks and the ramps carry you.
  for (let f = 0; f < 4; f++) {
    const ramp = (cx: number, cy: number, cz: number, hz: number, ang: number) => {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang);
      colliders.push(
        physics.createCollider(
          RAPIER.ColliderDesc.cuboid(1.5, 0.05, hz).setTranslation(cx, cy, cz).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setCollisionGroups(groups(G_WORLD, G_ALL)),
          fixed,
        ),
      );
    };
    const o = info.origin;
    const y = o.y + Yf(f);
    const aA = Math.atan2(4, 5), aB = Math.atan2(3, 4);
    ramp(o.x + 2.5, y + 2 + 0.06, o.z + 39.5, 3.2, -aA); // lane A: z 37 -> 42, up 4
    ramp(o.x + 6.5, y + 5.5 + 0.06, o.z + 43, 2.5, aB); // lane B: z 45 -> 41, up 3
  }
  const add = <T extends THREE.Object3D>(o: T, at?: THREE.Vector3) => {
    if (at) o.position.add(at);
    root.add(o);
    return o;
  };

  // ------------------------------------------------------------ materials
  const M = {
    white: mat(0xf2f2ee),
    sheet: mat(0xdfe9f2),
    blue: mat(0x5b8fd0),
    steel: mat(0xb8c0c8),
    dark: mat(0x2c2f36),
    red: mat(0xd8312b),
    green: mat(0x3e9a6a),
    yellow: mat(0xf2c230),
    wood: mat(0x8a5a35),
    screen: new THREE.MeshBasicMaterial({ color: 0x0b2a14 }),
    light: basic(0xfffbe8),
    glass: new THREE.MeshLambertMaterial({ color: 0xa8dcf0, transparent: true, opacity: 0.55 }),
    frost: new THREE.MeshLambertMaterial({ color: 0xcfefff, transparent: true, opacity: 0.85, emissive: 0x204060 }),
  };

  // ------------------------------------------------------------ signs
  const sign = (lines: string[], at: THREE.Vector3, w: number, h: number, rotY = Math.PI, bg = '#1f5fbf', fg = '#ffffff') => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTex(lines, bg, fg, 512, Math.round((512 * h) / w)) }));
    m.position.copy(at);
    m.rotation.y = rotY;
    root.add(m);
    return m;
  };
  // The name, red cross, canopy and EMERGENCY sign are part of the detailed facade.
  const facade = buildHospitalFacade(info, root, physics, name);
  // Street furniture out front, from the kit (colliders added here so dispose() removes them).
  {
    const kit = new StreetKit({ parent: root, physics: null, sync: true, lod: false });
    const o = info.origin;
    kit.street({ x0: o.x - 1, z0: o.z - 3, x1: o.x + 65, z1: o.z, y: o.y, kind: 'plaza' });
    const prop = (kind: PropKind, lx: number, lz: number, rot = 0) => {
      const at = P(lx, 0, lz);
      kit.prop(kind, at.x, at.y, at.z, rot, { collide: false });
      const h = propModel(kind).half;
      if (h) solid(new THREE.Vector3(at.x, at.y + h[1], at.z), Math.max(h[0], h[2]), h[1], Math.max(h[0], h[2]));
    };
    for (const lx of [4, 10, 16, 48, 54, 60]) prop('planter', lx, -1.4);
    for (const lx of [7, 13, 51, 57]) prop('bench', lx, -1.2, Math.PI);
    for (const lx of [20.5, 43.5]) prop('lamp', lx, -2.2);
    for (const lx of [24, 26, 38, 40]) prop('bollard', lx, -2.4);
    prop('bin', 45.5, -1.4);
    prop('pottedTree', 1.2, -1.6);
    prop('pottedTree', 62.8, -1.6);
    kit.finish();
  }
  sign(['STAFF ONLY', 'Badge required past this point'], P(32, 4.6, 18.94), 6, 1.4, Math.PI, '#c8231c', '#ffffff');
  sign(['WAITING ROOM'], P(11, 4.2, 0.95), 6, 0.9, 0);
  sign(['CAFETERIA', 'Today: mystery loaf'], P(53, 4.2, 0.95), 7, 1.3, 0, '#2f7a4a');
  sign(['MORGUE', 'Please keep drawers closed'], P(31.9, 4.4, 35.06), 5, 1.2, Math.PI, '#333840');
  sign(['LAUNDRY'], P(20.9, 4.4, 35.06), 3, 0.8, Math.PI, '#333840');
  sign(['TRAUMA'], P(42.94, 4.4, 24), 4, 0.9, -Math.PI / 2, '#c8231c');
  sign(['STAFF LOUNGE'], P(50.9, 4.4, 35.06), 4, 0.8, Math.PI, '#333840');
  for (let f = 0; f < 4; f++) {
    const y = Yf(f);
    sign([`FLOOR ${f + 1}`, FLOOR_NAMES[f].split(' · ')[1]], P(16.5, y + 4.4, 34.94), 3.6, 1.3, Math.PI);
    sign(['STAIRS'], P(4.5, y + 5.2, 34.94), 3, 0.6, Math.PI, '#2f7a4a');
  }
  sign(['PRE-OP'], P(11.5, Yf(2) + 4.6, 28.94 - 1), 3, 0.8, Math.PI);
  sign(['OR 1'], P(32, Yf(2) + 4.6, 28.94 - 1), 2.4, 0.8, Math.PI, '#2f7a4a');
  sign(['OR 2', 'Heart transplant: H. Fudge'], P(53, Yf(2) + 4.6, 28.94 - 1), 4, 1.2, Math.PI, '#2f7a4a');
  sign(['ANESTHESIA', 'Gas storage'], P(25, Yf(2) + 4.4, 35.06), 4, 1.1, Math.PI, '#333840');
  sign(['MRI', 'THE MAGNET IS ALWAYS ON'], P(34.5, Yf(3) + 4.5, 27.94), 6, 1.4, Math.PI, '#f2c230', '#1a1a1a');
  sign(['MRI CONTROL'], P(18, Yf(3) + 4.5, 27.94), 3.6, 0.8, Math.PI);
  sign(['X-RAY'], P(7, Yf(3) + 4.5, 27.94), 2.4, 0.8, Math.PI);
  sign(["DOCTORS' LOUNGE"], P(54, Yf(3) + 4.5, 27.94), 4.4, 0.8, Math.PI);
  sign(['LAUNDRY CHUTE', 'Linens only. NOT A SLIDE.'], P(17, Yf(3) + 4.3, 35.06 - 0.12), 3.4, 1.0, Math.PI, '#f2c230', '#1a1a1a');

  // Ceiling light panels on every floor (cheap emissive boxes).
  {
    const geo = new THREE.BoxGeometry(2.4, 0.08, 0.9);
    const spots: THREE.Vector3[] = [];
    for (let f = 0; f < 4; f++) {
      const y = Yf(f) + 5.96;
      for (let lx = 6; lx < 62; lx += 8) spots.push(P(lx, y, 32));
      for (let lx = 6; lx < 62; lx += 10) for (const lz of [8, 20]) spots.push(P(lx, y, lz));
    }
    const inst = new THREE.InstancedMesh(geo, M.light, spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach((p, i) => inst.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
    root.add(inst);
  }
  // A soft light that follows the player around inside (the slabs block the sun).
  const indoor = new THREE.PointLight(0xfff4e0, 0, 26, 1.2);
  root.add(indoor);
  const indoorHemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 0);
  root.add(indoorHemi);

  // ------------------------------------------------------------ doors
  /** Sliding door in an opening: two panels that slide apart along x. */
  class SlideDoor {
    readonly col: RAPIER.Collider;
    readonly l: THREE.Mesh;
    readonly r: THREE.Mesh;
    open = 0;
    want = false;
    constructor(readonly c: THREE.Vector3, readonly w: number, readonly h: number, m: THREE.Material) {
      this.l = add(bx(w / 2, h, 0.2, m, c.x - w / 4, c.y, c.z));
      this.r = add(bx(w / 2, h, 0.2, m, c.x + w / 4, c.y, c.z));
      this.col = solid(c, w / 2, h / 2, 0.3);
    }
    update(dt: number) {
      this.open += ((this.want ? 1 : 0) - this.open) * Math.min(1, dt * 7);
      this.l.position.x = this.c.x - this.w / 4 - this.open * (this.w / 2 - 0.1);
      this.r.position.x = this.c.x + this.w / 4 + this.open * (this.w / 2 - 0.1);
      this.col.setEnabled(this.open < 0.6);
    }
  }
  const front = new SlideDoor(P(32, 2, 0.5), 8, 4, M.glass);
  const badge = new SlideDoor(P(32, 2, 19.5), 4, 4, M.glass);
  const elevDoors = [0, 1, 2, 3].map((f) => new SlideDoor(P(12, Yf(f) + 2, 35.5), 2, 4, M.steel));
  const elevOpenT = [0, 0, 0, 0];
  const badgeReader = add(bx(0.3, 0.5, 0.15, M.dark), P(29.6, 1.6, 18.85));
  const readerLed = add(bx(0.12, 0.12, 0.05, basic(0xff3030)), P(29.6, 1.75, 18.76));
  void badgeReader;

  // Laundry chute hatch.
  const hatch = add(bx(2, 2, 0.12, M.steel), P(17, Yf(3) + 2, 35.98));
  const hatchCol = solid(P(17, Yf(3) + 2, 36.5), 1, 1, 0.5);

  // ------------------------------------------------------------ furniture
  // Lobby.
  const vending = new THREE.Group();
  {
    const body = bx(1.5, 2.6, 1.2, M.red, 0, 1.3, 0);
    const glass = bx(1.0, 1.6, 0.05, M.glass, 0.75, 1.6, 0);
    glass.rotation.y = Math.PI / 2;
    const slot = bx(0.06, 0.3, 0.9, M.dark, 0.76, 0.4, 0);
    vending.add(body, glass, slot);
    for (let i = 0; i < 12; i++) vending.add(bx(0.1, 0.18, 0.18, mat([0xf2c230, 0x3e9a6a, 0x5b8fd0, 0xff8a30][i % 4]), 0.6, 1.0 + Math.floor(i / 3) * 0.38, -0.3 + (i % 3) * 0.3));
    vending.position.copy(P(1.8, 0, 15));
    root.add(vending);
  }
  const vendingCol = solid(P(1.8, 1.3, 15), 0.75, 1.3, 0.6);
  // Fire alarm on the lobby side of the staff wall.
  add(bx(0.5, 0.7, 0.2, M.red), P(24.5, 1.5, 18.85));
  add(bx(0.3, 0.12, 0.08, M.white), P(24.5, 1.45, 18.72));
  // Cafeteria counter items.
  const coffeePot = add(bx(0.35, 0.5, 0.35, M.dark), P(50, 2.25, 15.5));
  add(bx(0.6, 0.15, 0.6, M.steel), P(58, 2.08, 15.5)); // tray of mystery loaf
  // Lounge coffee.
  const coffeePot2 = add(bx(0.35, 0.5, 0.35, M.dark), P(55, 2.25, 44.5));

  // Beds: ER bays, ward and pre-op.
  const bed = (at: THREE.Vector3, rotY = 0, len = 3.6, sheet: THREE.Material = M.sheet) => {
    const g = new THREE.Group();
    g.add(bx(1.6, 0.5, len, M.steel, 0, 0.35, 0));
    g.add(bx(1.5, 0.25, len - 0.1, sheet, 0, 0.72, 0));
    g.add(bx(1.0, 0.2, 0.5, M.white, 0, 0.92, -len / 2 + 0.4));
    for (const sx of [-0.7, 0.7]) for (const sz of [-len / 2 + 0.2, len / 2 - 0.2]) g.add(bx(0.1, 0.4, 0.1, M.dark, sx, 0.1, sz));
    g.position.copy(at);
    g.rotation.y = rotY;
    root.add(g);
    solid(at.clone().add(new THREE.Vector3(0, 0.42, 0)), rotY ? len / 2 : 0.8, 0.42, rotY ? 0.8 : len / 2);
    return g;
  };
  for (let lx = 2; lx < 40; lx += 8) {
    bed(P(lx + 3, 0, 23.5));
    // curtain
    const cur = add(bx(0.06, 4, 5.6, mat(0x8fc6e8)), P(lx + 6.6, 2.4, 23.6));
    cur.castShadow = false;
  }
  bed(P(52.5, 0, 24), 0, 3.4, M.white); // trauma bed
  // Ward beds with monitors and IV stands.
  const monitorScreens: THREE.Mesh[] = [];
  const ivStands: THREE.Group[] = [];
  const ivHome: THREE.Vector3[] = [];
  const makeIv = () => {
    const g = new THREE.Group();
    g.add(bx(0.08, 2.2, 0.08, M.steel, 0, 1.1, 0));
    g.add(bx(0.7, 0.06, 0.06, M.steel, 0, 2.2, 0));
    g.add(bx(0.3, 0.45, 0.12, new THREE.MeshLambertMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.8 }), 0.25, 1.95, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.add(bx(0.4, 0.06, 0.06, M.steel, Math.cos(a) * 0.2, 0.08, Math.sin(a) * 0.2)).rotation.y = -a;
    }
    return g;
  };
  for (const b of info.beds) {
    bed(new THREE.Vector3(b.at.x, b.at.y - 0.85, b.at.z + 0.3));
    const mon = new THREE.Group();
    mon.add(bx(0.12, 1.4, 0.12, M.steel, 0, 0.7, 0));
    mon.add(bx(0.7, 0.55, 0.3, M.dark, 0, 1.6, 0));
    const scr = bx(0.6, 0.42, 0.02, M.screen, 0, 1.6, 0.16);
    mon.add(scr);
    monitorScreens.push(scr);
    mon.position.copy(b.monitor);
    root.add(mon);
    const iv = makeIv();
    iv.position.copy(b.iv);
    root.add(iv);
    ivStands.push(iv);
    ivHome.push(b.iv.clone());
  }
  // Nurses' station computer.
  add(bx(0.8, 0.6, 0.1, M.dark), P(31, Yf(1) + 2.3, 33.6));
  // Pre-op gurneys and Mr. Fudge's chart.
  bed(P(6.5, Yf(2), 14.5), 0, 3.4);
  bed(P(15.5, Yf(2), 14.5), 0, 3.4);
  const chart = add(bx(0.5, 0.65, 0.05, M.white), P(15.5, Yf(2) + 1.3, 16.45));
  const chartStain = add(bx(0.3, 0.3, 0.02, mat(0x5a3a1a)), P(15.5, Yf(2) + 1.3, 16.49));
  chartStain.visible = false;
  // Operating rooms.
  const orTable = (cx: number) => {
    const y = Yf(2);
    add(bx(1.4, 0.9, 3.2, M.steel), P(cx, y + 0.45, 14.5));
    add(bx(1.3, 0.15, 3.1, mat(0x3e9a6a)), P(cx, y + 0.97, 14.5));
    add(bx(0.15, 1.5, 0.15, M.steel), P(cx, y + 5.2, 14.5));
    const lamp = add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 12), M.white), P(cx, y + 4.3, 14.5));
    void lamp;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 12), basic(0xfffde0)), P(cx, y + 4.08, 14.5));
    solid(P(cx, y + 0.5, 14.5), 0.7, 0.5, 1.6);
    // instrument tray
    add(bx(1.0, 0.08, 0.6, M.steel), P(cx + 1.6, y + 1.2, 13.5));
    add(bx(0.06, 1.2, 0.06, M.steel), P(cx + 1.6, y + 0.6, 13.5));
  };
  orTable(32);
  orTable(53);
  // The mirror in OR 1, for self-surgery.
  add(bx(1.6, 2.2, 0.08, new THREE.MeshLambertMaterial({ color: 0xdff4ff, emissive: 0x335566 })), P(32, Yf(2) + 3, 1.1));
  // Anesthesia tanks.
  const tanks: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const t = add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.8, 10), i % 2 ? M.blue : mat(0x2a5aa0)), P(22.5 + i * 1.6, Yf(2) + 0.9, 45.3));
    t.castShadow = true;
    tanks.push(t);
  }
  sign(['N₂O'], P(25.5, Yf(2) + 2.4, 45.95 - 1.2), 1.4, 0.5, Math.PI, '#5b8fd0');
  // Defibrillator cart in the trauma room.
  const defib = new THREE.Group();
  defib.add(bx(1.0, 1.0, 0.7, M.red, 0, 0.5, 0));
  defib.add(bx(0.8, 0.35, 0.6, M.yellow, 0, 1.18, 0));
  const paddles = [bx(0.2, 0.12, 0.3, M.dark, -0.25, 1.4, 0), bx(0.2, 0.12, 0.3, M.dark, 0.25, 1.4, 0)];
  defib.add(...paddles);
  defib.position.copy(P(55.5, 0, 21.5));
  root.add(defib);
  // Morgue drawers.
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      add(bx(2.4, 1.4, 0.08, M.steel), P(26.5 + i * 3.6, 0.9 + j * 1.6, 45.95));
      add(bx(0.6, 0.12, 0.1, M.dark), P(26.5 + i * 3.6, 0.9 + j * 1.6, 45.85));
    }
  const tray = add(bx(2.2, 0.15, 2.4, M.steel), P(33.7, 0.95, 44.7));
  solid(P(33.7, 0.5, 44.7), 1.1, 0.5, 1.2);
  const drawerFront = add(bx(2.6, 1.6, 0.12, M.steel), P(33.7, 1.6, 43.4));
  drawerFront.visible = false;
  // Laundry: bin at the chute bottom and the press.
  add(bx(2, 0.8, 2, mat(0x5b8fd0)), P(17, 0.4, 38));
  const press = new THREE.Group();
  press.add(bx(3, 1, 3, M.steel, 0, 0.5, 0));
  const plate = bx(2.8, 0.4, 2.8, M.dark, 0, 2.6, 0);
  press.add(plate);
  for (const sx of [-1.4, 1.4]) press.add(bx(0.3, 3.4, 0.3, M.steel, sx, 1.7, 0));
  press.position.copy(P(20.5, 0, 43.5));
  root.add(press);
  solid(P(20.5, 0.5, 43.5), 1.5, 0.5, 1.5);
  // Laundry carts and a big wrench.
  add(bx(1.6, 1.0, 1.0, mat(0xdfe9f2)), P(12, 0.5, 45));
  const wrench = add(bx(0.9, 0.12, 0.2, M.steel), P(12, 1.08, 45));
  // Reception keys, cafeteria pan, ward bedpan: metal for the MRI.
  const keys = add(bx(0.3, 0.06, 0.2, mat(0xe8c040)), P(30.5, 2.03, 12.5));
  const pan = new THREE.Group();
  pan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.1, 12), M.dark));
  pan.add(bx(0.5, 0.06, 0.08, M.dark, 0.55, 0, 0));
  pan.position.copy(P(60, 2.05, 15.5));
  root.add(pan);
  const bedpan = add(bx(0.5, 0.15, 0.35, M.steel), P(26.5, Yf(1) + 0.08, 12));
  // MRI scanner (bore along z).
  const mri = new THREE.Group();
  {
    const shell = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.85, 10, 24), M.white);
    shell.position.set(0, 2.2, 0);
    const back = bx(5.6, 4.6, 2.4, M.white, 0, 2.3, -0.4);
    back.geometry.translate(0, 0, 0);
    mri.add(shell);
    // A boxy housing around the ring, leaving the bore open.
    mri.add(bx(1.3, 4.6, 2.4, M.white, -2.15, 2.3, 0), bx(1.3, 4.6, 2.4, M.white, 2.15, 2.3, 0), bx(5.6, 1.0, 2.4, M.white, 0, 4.1, 0), bx(5.6, 0.8, 2.4, M.white, 0, 0.4, 0));
    mri.add(bx(5.7, 0.25, 2.45, M.blue, 0, 3.3, 0));
    mri.add(bx(1.2, 0.35, 6, M.white, 0, 0.95, 4)); // bed
    mri.add(bx(1.0, 0.1, 5.6, M.sheet, 0, 1.18, 4));
  }
  mri.position.copy(P(34.5, Yf(3), 10));
  root.add(mri);
  solid(P(34.5, Yf(3) + 0.55, 14), 0.6, 0.55, 3);
  // X-ray machine and lounge sofa.
  add(bx(1.6, 0.9, 3.0, M.white), P(6.5, Yf(3) + 0.45, 14));
  add(bx(0.6, 0.6, 0.6, M.dark), P(6.5, Yf(3) + 4.2, 14));
  add(bx(4, 0.8, 1.2, mat(0x7a4a8a)), P(55, Yf(3) + 0.4, 3));
  // Helicopter on the roof (nose toward +x).
  // Air ambulance and ambulance: detail-voxel models (models.ts).
  const heli = new THREE.Group();
  const { body: heliBody, rotor, tailRotor } = heliModel();
  heli.add(heliBody);
  rotor.position.set(0, 3.1, 0);
  heli.add(rotor);
  tailRotor.position.set(-6.7, 2.4, 0.2);
  heli.add(tailRotor);
  heli.position.copy(P(40, ROOF, 20));
  root.add(heli);
  solid(P(40, ROOF + 1.4, 20), 2.1, 1.0, 1.1);
  solid(P(40, ROOF + 0.15, 20), 2.5, 0.15, 1.3);
  const rotorY = info.origin.y + ROOF + 3.1;
  // Ambulance parked out front.
  const amb = new THREE.Group();
  amb.add(ambulanceModel());
  amb.position.copy(P(46, 0, -6));
  amb.rotation.y = Math.PI / 2;
  root.add(amb);
  solid(P(46, 1.4, -6), 3.4, 1.4, 1.2);

  // ------------------------------------------------------------ people
  const people: Post[] = [];
  const bodies: Npc[] = [];
  const post = (job: Job | undefined, at: THREE.Vector3, facing = 0, extra: Partial<Post> = {}) =>
    people.push({ job, at, facing, npc: null, respawnT: 0, idx: 0, pause: 0, ...extra });
  let seed = Math.floor(ctx.rng() * 1e9);
  const spawnPost = (pp: Post) => {
    // File edits (names, ages) go in before the body is built so the look matches them.
    const n = new Npc(scene, NO_NAV, mulberry32(seed++), {
      job: pp.job,
      edit: (f) => {
        const name = f.name;
        pp.file?.(f);
        if (f.name.split(' ')[0] !== name.split(' ')[0]) f.sex = sexOfName(f.name);
      },
    });
    n.controlled = true;
    n.pos.copy(pp.at);
    n.facing = pp.facing;
    pp.npc = n;
    pp.idx = 0;
    bodies.push(n);
  };
  /** Walk beats, lie in bed, and notice when Gary has taken someone (their root leaves the scene). */
  const updatePeople = (dt: number) => {
    for (const pp of people) {
      const n = pp.npc;
      if (!n) {
        if ((pp.respawnT -= dt) <= 0) spawnPost(pp);
        continue;
      }
      if (!n.character.root.parent || game.character === n.character) {
        bodies.splice(bodies.indexOf(n), 1);
        pp.npc = null;
        pp.respawnT = 40;
        continue;
      }
      let speed = 0;
      if (pp.patrol?.length) {
        const goal = pp.patrol[pp.idx % pp.patrol.length];
        const dx = goal.x - n.pos.x, dz = goal.z - n.pos.z;
        const d = Math.hypot(dx, dz);
        if (pp.pause > 0) pp.pause -= dt;
        else if (d < 0.2) {
          pp.idx++;
          pp.pause = 1.5 + Math.random() * 3;
        } else {
          speed = n.speed;
          const st = Math.min(d, speed * dt);
          n.pos.x += (dx / d) * st;
          n.pos.z += (dz / d) * st;
          n.pos.y = goal.y;
          let dd = Math.atan2(dx, dz) - n.facing;
          while (dd > Math.PI) dd -= Math.PI * 2;
          while (dd < -Math.PI) dd += Math.PI * 2;
          n.facing += dd * Math.min(1, dt * 6);
        }
      }
      n.update(dt);
      n.character.animate(dt, { speed, grounded: true, state: 'ground', stateTime: 0, airTime: 0 });
      if (pp.pose === 'lie') {
        n.character.spinner.rotation.x = -Math.PI / 2;
        n.character.spinner.position.y = 0.25;
      }
    }
  };
  // F1
  post('Security Guard', C(28, 0, 17.6), Math.PI);
  post('Nurse', C(31, 0, 14.6), Math.PI, { file: (f) => (f.name = f.name.split(' ')[0] + ' (Reception)') });
  post('Doctor', C(6, 0, 24.6), 0, { patrol: [C(6, 0, 27.5), C(36, 0, 27.5)] });
  post('EMT', C(48, 0, 25), -Math.PI / 2);
  post('Janitor', C(20, 0, 31), 0, { patrol: [C(10, 0, 31), C(60, 0, 31)] });
  post(undefined, C(10, 0, 7.6), Math.PI);
  post(undefined, C(15, 0, 3.6), 0.5);
  post('Diner Cook', C(55, 0, 17.6), Math.PI, { file: (f) => (f.quirk = 'Invented the mystery loaf. Will not say what is in it.') });
  // F2: nurses and patients in their beds.
  const y1 = Yf(1);
  post('Nurse', C(31, y1, 32), 0);
  post('Nurse', C(8, y1, 31), 0, { patrol: [C(8, y1, 31), C(58, y1, 31)] });
  const ailments = ['a stubbed toe', 'observation', 'swallowed a LEGO', 'too much cheese', 'hiccups (day 9)', 'tests', 'a weird rash'];
  info.beds.forEach((b, i) => {
    if (i % 2 === 1 && i !== 5) return;
    post('Patient', b.at.clone(), 0, {
      pose: 'lie',
      file: (f) => {
        f.daysLeft = Math.min(f.daysLeft, 3 + i * 4);
        f.quirk = `Admitted for ${ailments[i % ailments.length]}.`;
      },
    });
  });
  // F3
  const y2 = Yf(2);
  post('Surgeon', C(31, y2, 21), 0, { patrol: [C(31, y2, 21), C(31, y2, 31.5), C(20, y2, 31.5)] });
  post('Nurse', C(10, y2, 20), Math.PI);
  post('Surgeon', C(55, y2, 20), Math.PI, { file: (f) => (f.quirk = 'Has done 400 heart transplants. Reads every chart twice.') });
  post('Patient', P(15.5, y2 + 0.85, 14.8), 0, {
    pose: 'lie',
    file: (f) => {
      f.name = 'Herb Fudge';
      f.age = 71;
      f.daysLeft = 0;
      f.quirk = 'Waiting for a heart transplant. Chart is clipped to the gurney.';
    },
  });
  // F4
  const y3 = Yf(3);
  post('Doctor', C(18, y3, 13), Math.PI / 2, { file: (f) => (f.quirk = 'Radiologist. Has asked "any metal on you?" 40,000 times.') });
  post('Doctor', C(55, y3, 5), Math.PI);
  post('Janitor', C(20, y3, 31), 0, { patrol: [C(22, y3, 31), C(60, y3, 31)] });
  // Roof
  post('EMT', C(48, ROOF, 27), Math.PI, { file: (f) => (f.quirk = 'Flight medic. Swears the rotor is "basically harmless".') });
  post('Firefighter', C(40, 0, -6), Math.PI / 2, { file: (f) => (f.quirk = 'Carries the elevator fire key. Visiting a friend upstairs.') });

  // ------------------------------------------------------------ interactables
  const its: Interactable[] = [];
  const it = (id: string, pos: THREE.Vector3, prompt: string, radius = 1.6) => {
    const x: Interactable = { id: ID(id), pos, radius, prompt, enabled: true };
    its.push(x);
    return x;
  };
  const iStaffDoor = it('staffdoor', C(31.5, 0, 17.6), 'Barge through the staff door', 2.2);
  const iAlarm = it('alarm', P(24.5, 0, 17.8), 'Pull the fire alarm', 1.4);
  const iVending = it('vending', P(3.4, 0, 15), 'Shake the vending machine', 1.6);
  const iKeys = it('keys', P(30.5, 0, 11), 'Pocket the receptionist\'s keys', 1.5);
  const iPan = it('pan', P(60, 0, 14), 'Take the frying pan', 1.5);
  const iCoffee = it('coffee', P(50, 0, 14), 'Grab a hot coffee', 1.5);
  const iCoffee2 = it('coffee2', P(55, 0, 43), 'Grab a hot coffee', 1.5);
  const iWrench = it('wrench', P(12, 0, 43.6), 'Take the big wrench', 1.5);
  const iBedpan = it('bedpan', P(26.5, Yf(1), 12), 'Take the bedpan', 1.4);
  const iDefib = it('defib', P(55.5, 0, 22.9), 'Use the defibrillator', 1.6);
  const iDrawer = it('drawer', P(33.7, 0, 42.8), 'Climb into a morgue drawer', 1.6);
  const iChute = it('chute', P(17, Yf(3), 34.8), 'Climb into the laundry chute', 1.6);
  const iNitrous = it('nitrous', P(25.5, Yf(2), 43.6), 'Huff the nitrous', 1.8);
  const iOr1 = it('or1', P(32, Yf(2), 17), 'Perform surgery on yourself', 1.8);
  const iChart = it('chart', P(15.5, Yf(2), 17.4), "Read Mr. Fudge's chart", 1.5);
  const iGurney = it('gurney', P(6.5, Yf(2), 17), 'Lie down on the empty gurney', 1.6);
  const iMri = it('mri', P(34.5, Yf(3), 18.5), 'Lie down for an MRI scan', 1.8);
  const iHeli = it('heli', P(43, ROOF, 22), 'Start the air ambulance', 2.2);
  const iMonitor = it('monitor', new THREE.Vector3(), 'Unplug your heart monitor', 1.4);
  const iIv = it('iv', new THREE.Vector3(), 'Grab your IV stand', 1.4);
  const elevIts: { up: Interactable; down: Interactable; key: Interactable; f: number }[] = [];
  for (let f = 0; f < 4; f++) {
    elevIts.push({
      f,
      up: it(`elev-up-${f}`, P(10, Yf(f), 33.6), 'Elevator ▲', 1.1),
      down: it(`elev-down-${f}`, P(14, Yf(f), 33.6), 'Elevator ▼', 1.1),
      key: it(`firekey-${f}`, P(12, Yf(f), 34.2), 'Fire key: force the elevator doors open', 0.9),
    });
  }
  const pickups: Record<string, { it: Interactable; mesh: THREE.Object3D; label: string; metal: boolean }> = {
    keys: { it: iKeys, mesh: keys, label: 'a ring of keys', metal: true },
    pan: { it: iPan, mesh: pan, label: 'a frying pan', metal: true },
    wrench: { it: iWrench, mesh: wrench, label: 'a big wrench', metal: true },
    bedpan: { it: iBedpan, mesh: bedpan, label: 'a steel bedpan', metal: true },
  };

  // ------------------------------------------------------------ state
  let body: PersonFile | null = null;
  let job = '';
  let warnings = 0;
  let busy = false;
  let alarmT = 0;
  let alarmBell = 0;
  let deniedT = 0;
  let ejectT = 0;
  const held = new Set<string>();
  let coffee = false;
  let vendingShakes = 0;
  let vendingFall = 0; // 0..1 tipping animation
  let vendingResetT = 0;
  let huffs = 0;
  let chartSpilled = false;
  let chartSwapped = false;
  let heliSpin = 0;
  let heliRpm = 0;
  let heliCycle = 25;
  let lastBodyRef: PersonFile | null = null;
  // Patient puzzle.
  let bedIdx = -1;
  let monitorPlugged = true;
  let ivHeld = false;
  let flatlineT = 0;
  let roundsT = 40;
  let roundsWarned = false;
  let beepT = 0;
  let tetherT = 0;

  const staff = () => HOSPITAL_STAFF.includes(job);
  const medical = () => MEDICAL.includes(job);
  const feet = () => game.player.feet();
  const say = (who: string, line: string, ms = 2800) => game.say(who, line, ms);

  function resetBody(file: PersonFile | null) {
    body = file;
    lastBodyRef = file;
    job = file?.job ?? '';
    warnings = 0;
    held.clear();
    coffee = false;
    huffs = 0;
    busy = false;
    ivHeld = false;
    monitorPlugged = true;
    flatlineT = 0;
    roundsT = 40;
    roundsWarned = false;
    for (const k of Object.keys(pickups)) pickups[k].mesh.visible = true;
    // Put every IV stand back and every monitor on.
    ivStands.forEach((s, i) => s.position.copy(ivHome[i]));
    monitorScreens.forEach((s) => ((s.material as THREE.MeshBasicMaterial) = M.screen));
    bedIdx = -1;
    if (file?.job === 'Patient') {
      const p = feet();
      let bd = 3;
      info.beds.forEach((b, i) => {
        const d = Math.hypot(b.at.x - p.x, b.at.z - p.z) + Math.abs(b.at.y - p.y);
        if (d < bd) {
          bd = d;
          bedIdx = i;
        }
      });
      if (bedIdx >= 0) {
        const b = info.beds[bedIdx];
        iMonitor.pos.copy(b.monitor).add(new THREE.Vector3(-0.6, 0, 0.8));
        iIv.pos.copy(b.iv).add(new THREE.Vector3(0, 0, 0.6));
        setTimeout(() => {
          if (body === file) say('Nurse', "Don't you go wandering off, hon. That monitor tells me everything.", 3500);
        }, 1200);
      }
    }
  }

  function zoneOf(p: THREE.Vector3): Zone {
    if (!inBox(p, zones.building)) return 'outside';
    const f = info.floorAt(p.y);
    if (inBox(p, zones.stairwell) || inBox(p, zones.shaft)) return 'staff';
    if (f === 0) return inBox(p, zones.lobby) ? 'public' : 'staff';
    if (f === 1) return 'ward';
    if (f === 2) {
      // Patients may use the corridor to get from the elevator to pre-op.
      if (inBox(p, zones.preop) || (p.z < info.origin.z + 35 && p.x > info.origin.x + 8)) return 'preop';
      if (inBox(p, zones.or1) || inBox(p, zones.or2)) return 'or';
    }
    return 'staff';
  }

  function allowed(z: Zone) {
    if (z === 'outside' || z === 'public') return true;
    if (alarmT > 0) return true;
    if (z === 'or') return SURGICAL.includes(job);
    if (z === 'ward' || z === 'preop') return staff() || job === 'Patient';
    return staff();
  }

  function backToBed(line: string) {
    if (bedIdx < 0) return;
    const b = info.beds[bedIdx];
    busy = true;
    game.player.lock(true);
    say('Nurse', line, 2600);
    game.runSeq([
      {
        at: 0.8,
        fn: () => {
          game.flash('#ffffff', 300);
          game.player.teleport(b.at.clone().add(new THREE.Vector3(0, 0.1, 0)), 0);
          game.player.lock(false);
          monitorPlugged = true;
          ivHeld = false;
          ivStands[bedIdx].position.copy(ivHome[bedIdx]);
          (monitorScreens[bedIdx].material as THREE.Material) = M.screen;
          flatlineT = 0;
          busy = false;
        },
      },
    ]);
  }

  function codeGrey() {
    const ch = game.character;
    if (!ch) return;
    busy = true;
    game.player.lock(true);
    say('Security', "That's it. CODE GREY! Get the big syringe!", 2600);
    const syringe = new THREE.Group();
    syringe.add(bx(0.35, 0.35, 2.2, M.glass, 0, 0, 0), bx(0.06, 0.06, 0.9, M.steel, 0, 0, 1.5), bx(0.5, 0.5, 0.1, M.white, 0, 0, -1.15));
    root.add(syringe);
    const start = feet().add(new THREE.Vector3(-4, 1.2, -1));
    game.runSeq([
      ...Array.from({ length: 10 }, (_, i) => ({
        at: 0.2 + i * 0.06,
        fn: () => {
          const t = (i + 1) / 10;
          syringe.position.lerpVectors(start, feet().add(new THREE.Vector3(-0.6, 1.1, 0)), t);
          syringe.lookAt(feet().add(new THREE.Vector3(0, 1.0, 0)));
        },
      })),
      { at: 0.9, fn: () => (game.sound.tone({ f: 900, f2: 200, dur: 0.4, type: 'square', vol: 0.3 }), ch.kick(0.6)) },
      ...Array.from({ length: 16 }, (_, i) => ({
        at: 1.0 + i * 0.1,
        fn: () => {
          ch.tint(0x9a9aa8, i / 18);
          game.player.facing += Math.sin(i) * 0.3;
          ch.kick(i % 2 ? 0.25 : -0.15);
        },
      })),
      { at: 2.0, fn: () => say('Gary', 'Whoa. The floor is so... soft...', 2000) },
      {
        at: 2.8,
        fn: () => {
          root.remove(syringe);
          busy = false;
          game.kill('hospital-codegrey', { kind: 'ragdoll', vel: new THREE.Vector3(0, 1.5, 3), spin: 2, bounce: 0.15 });
        },
      },
    ]);
  }

  function eject(z: Zone) {
    if (busy || ejectT > 0) return;
    ejectT = 1.2;
    if (job === 'Patient' && bedIdx >= 0) {
      backToBed(z === 'or' ? 'Sweetie, you can\'t be in the OR. Back to bed.' : 'Where do you think you\'re going? Back to bed.');
      return;
    }
    if (z === 'or') {
      game.player.lock(true);
      say('Surgeon', 'Out! This is a sterile field! Doctors only!', 2400);
      game.sound.denied();
      game.runSeq([
        {
          at: 0.5,
          fn: () => {
            game.player.lock(false);
            const p = feet();
            game.player.teleport(new THREE.Vector3(p.x, info.floorY(2), info.origin.z + 31.5), 0);
          },
        },
      ]);
      return;
    }
    warnings++;
    if (warnings > 3) {
      codeGrey();
      return;
    }
    const lines = ['Sir. Visitors stay in the lobby.', 'Staff only back there. Last warning, buddy.', 'One more time and I call a Code Grey.'];
    game.player.lock(true);
    say('Security', lines[warnings - 1], 2600);
    game.sound.denied();
    game.runSeq([
      {
        at: 0.5,
        fn: () => {
          game.player.lock(false);
          game.player.teleport(info.lobbyDrop, Math.PI);
          game.player.knock(new THREE.Vector3(0, 6, -9));
          game.sound.whoosh();
          game.toast('ESCORTED OUT', `Only doctors, nurses, EMTs and firefighters get past the lobby. (${warnings}/3)`, 2400);
        },
      },
    ]);
  }

  function denied(title: string, body: string) {
    if (performance.now() < deniedT) return;
    deniedT = performance.now() + 2200;
    game.sound.denied();
    game.toast(title, body, 2200);
  }

  function rideElevator(from: number, dir: number) {
    const to = from + dir;
    if (to < 0 || to > 3) return denied('NO FLOOR', dir > 0 ? 'Floor 4 is the top. The roof is up the stairs.' : 'This is the ground floor.');
    if (job === 'Patient' && (to < 1 || to > 2)) {
      say('Nurse', 'Patients stay on the ward, hon. Pre-op is the only field trip.', 2600);
      return denied('NOT FOR PATIENTS', 'Patients can only ride between the ward and pre-op.');
    }
    busy = true;
    game.player.lock(true);
    game.sound.tone({ f: 880, dur: 0.15, type: 'sine', vol: 0.25 });
    elevDoors[from].want = true;
    game.runSeq([
      { at: 0.6, fn: () => (game.flash('#000000', 500), (elevDoors[from].want = false)) },
      {
        at: 0.9,
        fn: () => {
          game.player.teleport(P(12, Yf(to), 33.4), Math.PI);
          elevDoors[to].want = true;
          elevOpenT[to] = 1.2;
          game.sound.tone({ f: 660, dur: 0.18, type: 'sine', vol: 0.25 });
          game.sound.tone({ f: 990, dur: 0.25, type: 'sine', vol: 0.2, at: 0.18 });
          game.toast(`FLOOR ${to + 1}`, FLOOR_NAMES[to].split(' · ')[1], 1600);
        },
      },
      { at: 1.2, fn: () => (game.player.lock(false), (busy = false)) },
    ]);
  }

  function pullAlarm() {
    if (alarmT > 0) return denied('ALREADY RINGING', 'Everyone is already panicking.');
    alarmT = 30;
    alarmBell = 0;
    game.toast('FIRE ALARM', 'Staff are evacuating. Nobody is checking badges for 30 seconds.', 3200);
    say('Security', 'Is that the alarm? Everybody out! Badges off! GO GO GO!', 2600);
  }

  const kill = (id: string, style: Parameters<typeof game.kill>[1]) => {
    busy = false;
    game.kill(id, style);
  };

  // ------------------------------------------------------------ deaths
  function shakeVending() {
    if (vendingFall > 0) return;
    vendingShakes++;
    game.sound.noise({ dur: 0.18, vol: 0.5, freq: 300, type: 'lowpass' });
    game.shake(0.2 + vendingShakes * 0.1);
    game.character?.kick(0.4);
    const lines = ['Your chips are stuck on the coil.', 'Still stuck. Shake harder.', 'It is rocking now. That is progress.'];
    if (vendingShakes <= 3) {
      game.toast('*CLUNK*', lines[vendingShakes - 1], 1600);
      vending.rotation.z = 0.06 * vendingShakes;
      setTimeout(() => (vending.rotation.z = 0.02 * vendingShakes), 180);
      return;
    }
    // It's coming down.
    busy = true;
    game.player.lock(true);
    game.player.facing = -Math.PI / 2;
    vendingFall = 0.001;
    say('Gary', 'Oh no. Oh no no no.', 1400);
    game.runSeq([
      { at: 0.55, fn: () => (game.sound.crunch(), game.shake(1.2), vendingCol.setEnabled(false)) },
      { at: 0.6, fn: () => kill('hospital-vending', { kind: 'pancake' }) },
      { at: 1.4, fn: () => game.particles.burst(feet().add(new THREE.Vector3(0, 0.3, 0)), 24, 0xf2c230, 6, { life: 1.2, size: 0.15 }) },
    ]);
    vendingResetT = 9;
  }

  function useDefib() {
    const ch = game.character;
    if (!ch) return;
    if (!medical()) return denied('NOT TRAINED', "You don't know how to use this. Which is exactly why you'd die using it, but no.");
    busy = true;
    game.player.lock(true);
    const shocks = [0.4, 1.5, 2.6];
    game.runSeq([
      { at: 0.1, fn: () => say(body?.name.split(' ')[0] ?? 'You', "Let's just make sure it works. On myself. Charging!", 1800) },
      ...shocks.flatMap((t, n) => [
        { at: t, fn: () => (game.sound.tone({ f: 300, f2: 1800, dur: 0.6, type: 'sawtooth', vol: 0.12 }), say('You', n === 2 ? 'CLEAR!!!' : 'Clear!', 600)) },
        ...Array.from({ length: 6 }, (_, i) => ({
          at: t + 0.6 + i * 0.05,
          fn: () => {
            ch.flash(i % 2 === 0);
            game.flash(i % 2 ? '#ffffff' : '#9ad8ff', 60);
            ch.kick(n === 2 ? 0.9 : 0.5);
            game.particles.burst(game.player.position(), 4, 0x9ad8ff, 6, { life: 0.3, size: 0.1, gravity: 0 });
          },
        })),
        { at: t + 0.62, fn: () => (game.sound.zap(0.5), game.shake(0.3 + n * 0.3)) },
      ]),
      { at: 3.5, fn: () => (ch.flash(false), ch.tint(0x333333, 0.5)) },
      { at: 3.6, fn: () => kill('hospital-defib', { kind: 'ragdoll', vel: new THREE.Vector3(-6, 12, 0), spin: 11, bounce: 0.5 }) },
    ]);
  }

  function morgueNap() {
    const ch = game.character;
    if (!ch) return;
    busy = true;
    game.player.lock(true);
    game.player.teleport(P(33.7, 1.05, 44.6), Math.PI);
    game.runSeq([
      { at: 0.2, fn: () => say('You', "It's quiet in here. And cool. Just five minutes.", 2000) },
      {
        at: 1.2,
        fn: () => {
          drawerFront.visible = true;
          game.sound.noise({ dur: 0.3, vol: 0.5, freq: 200, type: 'lowpass' });
          game.sound.tone({ f: 120, dur: 0.15, type: 'square', vol: 0.3, at: 0.25 });
          game.toast('*CLICK*', 'The drawer latches from the outside. Of course it does.', 2200);
        },
      },
      ...Array.from({ length: 12 }, (_, i) => ({
        at: 1.6 + i * 0.25,
        fn: () => {
          ch.tint(0x9fdcff, (i + 1) / 12);
          game.sound.noise({ dur: 0.2, vol: 0.12, freq: 3000, type: 'highpass' });
          if (i === 5) say('You', 'hello? ...hellooo? (teeth chattering)', 1800);
        },
      })),
      {
        at: 4.8,
        fn: () => {
          drawerFront.visible = false;
          game.particles.burst(P(33.7, 1.6, 43.5), 30, 0xe8f8ff, 3, { life: 1.4, size: 0.3, gravity: -1 });
          kill('hospital-morgue', { kind: 'ragdoll', vel: new THREE.Vector3(0, 2, -7), spin: 1.5, bounce: 0.1 });
        },
      },
    ]);
  }

  function intoChute() {
    busy = true;
    game.player.lock(true);
    hatch.rotation.x = -1.2;
    hatchCol.setEnabled(false);
    game.sound.creak();
    game.runSeq([
      {
        at: 0.35,
        fn: () => {
          game.player.lock(false);
          busy = false;
          game.player.teleport(P(17, Yf(3) + 1.2, 38), 0);
          game.sound.whoosh();
          game.toast('WHEEEE', 'This is a laundry chute. It goes down. All four floors.', 1800);
        },
      },
      { at: 1.6, fn: () => ((hatch.rotation.x = 0), hatchCol.setEnabled(true)) },
    ]);
  }

  function pressDeath() {
    busy = true;
    game.sound.boing();
    game.runSeq([
      { at: 0.05, fn: () => game.toast('*FWUMP*', 'A soft landing in the linen bin. Then the conveyor starts.', 1800) },
      ...Array.from({ length: 8 }, (_, i) => ({
        at: 0.6 + i * 0.12,
        fn: () => {
          plate.position.y = 2.6 - (i % 2) * 1.4;
          game.sound.crunch();
          game.shake(0.3);
        },
      })),
      {
        at: 1.7,
        fn: () => {
          plate.position.y = 2.6;
          kill('hospital-laundry', { kind: 'cube', at: P(20.5, 1.0, 43.5), color: 0xf4f6ff });
        },
      },
    ]);
  }

  function huff() {
    const ch = game.character;
    if (!ch) return;
    huffs++;
    game.sound.noise({ dur: 0.6, vol: 0.3, freq: 2400, type: 'bandpass', q: 0.8 });
    for (let i = 0; i < 4; i++) game.sound.tone({ f: 500 + huffs * 120 + i * 60, f2: 700 + huffs * 140, dur: 0.12, type: 'triangle', vol: 0.15, at: 0.55 + i * 0.13 });
    ch.parts.head.pivot.scale.setScalar(1 + huffs * 0.15);
    ch.kick(-0.4);
    game.particles.burst(game.player.position().add(new THREE.Vector3(0, 0.8, 0)), 8, 0xcfe8ff, 2, { life: 0.8, size: 0.2, gravity: -2 });
    const lines = ['hehe', 'hehehehe', 'HAHAHAHA why is the floor so far away', 'I can taste colors. Blue tastes like a Tuesday.'];
    if (huffs < 5) {
      game.toast(`HUFF ${huffs}/5`, lines[huffs - 1], 1500);
      if (huffs >= 3) game.setHueShift(huffs * 40);
      return;
    }
    busy = true;
    game.player.lock(true);
    const base = feet();
    game.runSeq([
      ...Array.from({ length: 24 }, (_, i) => ({
        at: 0.1 + i * 0.1,
        fn: () => {
          const s = 1 + i * 0.05;
          ch.body.scale.set(s, s, s);
          ch.parts.head.pivot.scale.setScalar(1.75 + i * 0.06);
          game.player.teleport(base.clone().add(new THREE.Vector3(0, Math.min(i * 0.16, 2.6), 0)), game.player.facing + 0.25);
          game.setHueShift((i * 30) % 360);
          if (i % 3 === 0) game.sound.tone({ f: 700 + i * 30, dur: 0.1, type: 'triangle', vol: 0.12 });
        },
      })),
      {
        at: 2.6,
        fn: () => {
          game.sound.noise({ dur: 0.25, vol: 0.9, freq: 1200, type: 'bandpass' });
          game.flash('#ffffff', 200);
          game.setHueShift(0);
          game.particles.burst(game.player.position(), 40, 0xcfe8ff, 9, { life: 1, size: 0.25 });
          ch.body.scale.set(1, 1, 1);
          kill('hospital-nitrous', { kind: 'ragdoll', vel: new THREE.Vector3((Math.random() - 0.5) * 16, 10, (Math.random() - 0.5) * 16), spin: 18, bounce: 0.7 });
        },
      },
    ]);
  }

  /** Lie a body down (root pitched back), feet at `at`, head toward -z. */
  function lieDown(at: THREE.Vector3) {
    const ch = game.character;
    game.player.teleport(at, 0);
    if (ch) ch.root.rotation.x = -Math.PI / 2;
  }
  function standUp() {
    const ch = game.character;
    if (ch) ch.root.rotation.x = 0;
  }

  function selfSurgery() {
    const ch = game.character;
    if (!ch) return;
    if (job !== 'Surgeon') return denied('WRONG SPECIALTY', job === 'Doctor' ? "You're a dermatologist. You do moles. This is a spleen." : 'You need a Surgeon for this.');
    busy = true;
    game.player.lock(true);
    lieDown(P(32, Yf(2) + 1.05, 16));
    const grades = ['D-', 'F+', 'C (for creativity)', 'D'];
    game.runSeq([
      { at: 0.2, fn: () => say('You', 'Mirror? Check. Scalpel? Check. Anesthesia? ...Eh.', 2200) },
      { at: 1.4, fn: () => say('Death', "Oh, I'm grading this.", 1600) },
      ...Array.from({ length: 10 }, (_, i) => ({
        at: 2.0 + i * 0.18,
        fn: () => {
          ch.kick(i % 2 ? 0.5 : -0.3);
          game.sound.tone({ f: 1400 + Math.random() * 400, dur: 0.05, type: 'square', vol: 0.08 });
          if (i % 3 === 0) game.sound.scream(1.3);
        },
      })),
      { at: 4.0, fn: () => game.toast('STITCHES: ' + grades[Math.floor(Math.random() * grades.length)], 'Death is not impressed with your knots.', 2200) },
      { at: 4.6, fn: () => (standUp(), kill('hospital-selfsurgery', { kind: 'ragdoll', vel: new THREE.Vector3(0, 4, 3), spin: 4, bounce: 0.3 })) },
    ]);
  }

  function readChart() {
    if (!chartSpilled && coffee) {
      chartSpilled = true;
      coffee = false;
      chartStain.visible = true;
      game.sound.noise({ dur: 0.3, vol: 0.3, freq: 800, type: 'lowpass' });
      game.toast('OOPS', 'Coffee all over Mr. Fudge\'s chart. The name is unreadable now.', 2400);
      return;
    }
    if (!chartSwapped) {
      if (job !== 'Patient') return game.toast('HERB FUDGE, 71', 'Heart transplant, OR 2, today. Donor heart: "experimental".', 2600);
      chartSwapped = true;
      game.sound.blip(1.2);
      game.toast('CHARTS SWAPPED', chartSpilled ? 'Your chart is now on his gurney. His is on yours. Nobody can read the name.' : 'Swapped. His name is still readable, though.', 2800);
      return;
    }
    game.toast('ALREADY SWAPPED', 'Now go lie on the empty gurney.', 1600);
  }

  function lieOnGurney() {
    const ch = game.character;
    if (!ch) return;
    if (job !== 'Patient') return denied('PATIENTS ONLY', 'That gurney is for patients going into surgery.');
    busy = true;
    game.player.lock(true);
    lieDown(P(6.5, Yf(2) + 1.05, 16));
    const ok = chartSwapped && chartSpilled;
    if (!chartSwapped) {
      game.runSeq([
        { at: 0.6, fn: () => say('Surgeon', "You're not on my schedule today. Back to the ward.", 2400) },
        { at: 2.4, fn: () => (standUp(), (busy = false), backToBed('Up you get. Back to bed, hon.')) },
      ]);
      return;
    }
    if (!ok) {
      game.runSeq([
        { at: 0.6, fn: () => say('Surgeon', 'Fudge, Herb. Seventy-one. Heart.', 2000) },
        { at: 2.4, fn: () => say('Surgeon', "...Wait. You're not seventy-one. I read every chart twice. Nice try.", 2800) },
        { at: 5.0, fn: () => (standUp(), (busy = false), (chartSwapped = false), backToBed('Back to bed with you.')) },
      ]);
      return;
    }
    game.runSeq([
      { at: 0.6, fn: () => say('Surgeon', "Fudge... the name's smudged. Coffee. Whatever, you're on the gurney. Let's roll.", 2600) },
      { at: 2.0, fn: () => (game.flash('#000000', 600), lieDown(P(53, Yf(2) + 1.05, 16))) },
      { at: 2.8, fn: () => say('Surgeon', 'Heart transplant. Scalpel. Donor heart, please.', 2000) },
      ...Array.from({ length: 8 }, (_, i) => ({ at: 3.4 + i * 0.2, fn: () => (ch.kick(0.3), game.sound.tone({ f: 1500, dur: 0.04, type: 'square', vol: 0.06 })) })),
      { at: 5.0, fn: () => (game.sound.tone({ f: 180, f2: 120, dur: 0.3, type: 'sawtooth', vol: 0.25 }), say('Nurse', 'Doctor... is the new heart oinking?', 2000)) },
      { at: 6.4, fn: () => (game.sound.tone({ f: 1000, dur: 1.4, type: 'sine', vol: 0.2 }), say('Surgeon', 'That is... not Mr. Fudge.', 1600)) },
      { at: 7.2, fn: () => (standUp(), (chartSwapped = chartSpilled = false), (chartStain.visible = false), kill('hospital-wrongsurgery', { kind: 'ragdoll', vel: new THREE.Vector3(0, 3, 4), spin: 3, bounce: 0.2 })) },
    ]);
  }

  function mriScan() {
    const ch = game.character;
    if (!ch) return;
    busy = true;
    game.player.lock(true);
    const metal = [...held].filter((k) => pickups[k].metal);
    const start = P(34.5, Yf(3) + 1.25, 19);
    const inBore = P(34.5, Yf(3) + 1.25, 11.5);
    lieDown(start);
    const steps: { at: number; fn: () => void }[] = [
      { at: 0.3, fn: () => say('Radiologist', 'Any metal on you? Keys, coins, pans, anything?', 2200) },
      { at: 2.0, fn: () => say('You', metal.length ? 'Nope! (clank)' : 'Nope!', 1400) },
      ...Array.from({ length: 10 }, (_, i) => ({ at: 2.6 + i * 0.1, fn: () => lieDown(start.clone().lerp(inBore, (i + 1) / 10)) })),
      { at: 3.6, fn: () => game.sound.tone({ f: 60, dur: 2.5, type: 'square', vol: 0.15 }) },
    ];
    // Items fly out of pockets into the magnet.
    metal.forEach((k, i) => {
      const fly = pickups[k].mesh.clone();
      fly.visible = false;
      root.add(fly);
      steps.push(
        { at: 3.8 + i * 0.25, fn: () => ((fly.visible = true), fly.position.copy(feet().add(new THREE.Vector3(0, 0.5, 0))), game.toast('*CLANG*', `${pickups[k].label} rips out of your pocket.`, 1200)) },
        { at: 3.95 + i * 0.25, fn: () => (fly.position.copy(P(34.5 + (i - 1) * 0.6, Yf(3) + 3.6, 10)), game.sound.tone({ f: 1600, f2: 900, dur: 0.15, type: 'square', vol: 0.2 }), game.shake(0.3)) },
        { at: 9, fn: () => root.remove(fly) },
      );
    });
    if (metal.length < 3) {
      steps.push(
        { at: 4.8, fn: () => say('Radiologist', metal.length ? 'Was that a... never mind. Scan looks fine. Annoyingly fine.' : 'Clean scan. Perfectly healthy. Go away.', 2600) },
        {
          at: 6.2,
          fn: () => {
            standUp();
            game.player.teleport(P(34.5, Yf(3), 23), Math.PI);
            game.player.lock(false);
            busy = false;
            for (const k of metal) held.delete(k);
            if (metal.length) setTimeout(() => metal.forEach((k) => (pickups[k].mesh.visible = true)), 4000);
            if (metal.length) game.toast('NOT ENOUGH METAL', `The magnet ate ${metal.length === 1 ? 'it' : 'them'}, and you're fine. Bring more next time.`, 2600);
          },
        },
      );
    } else {
      steps.push(
        { at: 4.9, fn: () => say('Radiologist', 'Why is the machine making that noise. Why is HE making that noise.', 2200) },
        ...Array.from({ length: 22 }, (_, i) => ({
          at: 5.0 + i * 0.08,
          fn: () => {
            lieDown(inBore.clone().add(new THREE.Vector3(0, 2.0, 0)));
            if (ch) ch.root.rotation.z = i * 0.6;
            ch.kick(0.4);
            game.shake(0.4);
            if (i % 4 === 0) game.sound.tone({ f: 200 + i * 40, dur: 0.08, type: 'square', vol: 0.15 });
          },
        })),
        {
          at: 6.9,
          fn: () => {
            standUp();
            if (ch) ch.root.rotation.z = 0;
            game.flash('#ffffff', 300);
            kill('hospital-mri', { kind: 'ragdoll', vel: new THREE.Vector3(0, 6, 24), spin: 22, bounce: 0.6 });
          },
        },
      );
    }
    game.runSeq(steps);
  }

  function rotorDeath() {
    game.sound.crunch();
    game.sound.splat();
    game.shake(1.4);
    game.particles.burst(game.player.position().add(new THREE.Vector3(0, 1, 0)), 30, 0x6a4a2a, 10, { life: 0.8, size: 0.12 });
    const a = Math.random() * Math.PI * 2;
    kill('hospital-rotor', { kind: 'ragdoll', vel: new THREE.Vector3(Math.cos(a) * 26, 14, Math.sin(a) * 26), spin: 30, bounce: 0.6 });
  }

  function unplugDeath() {
    busy = true;
    game.player.lock(true);
    const iv = ivStands[bedIdx];
    game.toast('*SNAG*', 'Your foot catches the IV cord at the top of the stairs.', 1600);
    game.sound.scream(1.4);
    const from = iv.position.clone();
    game.runSeq([
      ...Array.from({ length: 30 }, (_, i) => ({
        at: 0.25 + i * 0.07,
        fn: () => {
          // The IV stand cartwheels down after you like a loyal dog.
          const t = (i + 1) / 30;
          iv.position.copy(from).add(new THREE.Vector3(Math.sin(t * 9) * 0.6, -t * 7 + Math.abs(Math.sin(t * 14)) * 1.2, t * 6));
          iv.rotation.x = t * 14;
          if (i % 5 === 0) game.sound.noise({ dur: 0.08, vol: 0.4, freq: 2000, type: 'bandpass' });
        },
      })),
      { at: 0.3, fn: () => kill('hospital-unplug', { kind: 'ragdoll', vel: new THREE.Vector3(0, 7, 11), spin: 16, bounce: 0.55 }) },
    ]);
  }

  // ------------------------------------------------------------ patient puzzle tick
  function patientTick(h: number, p: THREE.Vector3) {
    if (bedIdx < 0 || busy) return;
    const b = info.beds[bedIdx];
    const d = Math.hypot(p.x - b.at.x, p.z - b.at.z) + Math.max(0, Math.abs(p.y - b.at.y) - 1);
    const scr = monitorScreens[bedIdx];
    // IV stand follows when held.
    const iv = ivStands[bedIdx];
    if (ivHeld) {
      const fd = new THREE.Vector3(Math.sin(game.player.facing), 0, Math.cos(game.player.facing));
      const want = p.clone().addScaledVector(fd, -0.9).add(new THREE.Vector3(0.5, 0, 0));
      iv.position.lerp(want, Math.min(1, h * 10));
    } else if (d > 3.2 && info.floorAt(p.y) === 1) {
      tetherT -= h;
      if (tetherT <= 0) {
        tetherT = 1.2;
        const back = b.at.clone().sub(p).setY(0).normalize().multiplyScalar(9);
        game.player.knock(back.setY(3));
        game.character?.kick(0.5);
        denied('OW', 'The IV is still in your arm. Bring the stand with you.');
      }
    }
    // Heart monitor.
    beepT -= h;
    if (monitorPlugged && d > 2.4) {
      flatlineT += h;
      (scr.material as THREE.Material) = flatlineT % 0.4 < 0.2 ? M.red : M.screen;
      if (flatlineT > 0 && flatlineT - h <= 0) {
        game.sound.tone({ f: 1000, dur: 2.5, type: 'sine', vol: 0.15 });
        game.toast('BEEEEEEEEP', 'You pulled the monitor leads. It thinks you flatlined.', 2000);
      }
      if (flatlineT > 2.2 && alarmT <= 0) {
        flatlineT = 0;
        backToBed('CODE BLUE! ...oh. You\'re just up and walking. Back to bed, mister.');
      }
    } else if (monitorPlugged && beepT <= 0) {
      beepT = 0.9;
      if (d < 6) game.sound.tone({ f: 1000, dur: 0.06, type: 'sine', vol: 0.05 });
      flatlineT = 0;
    }
    // Nurse rounds.
    if (alarmT > 0) return;
    roundsT -= h;
    if (roundsT < 10 && !roundsWarned) {
      roundsWarned = true;
      game.toast('NURSE ROUNDS IN 10s', 'Be in bed with your monitor plugged in, or else.', 2200);
    }
    if (roundsT <= 0) {
      roundsT = 40;
      roundsWarned = false;
      if (info.floorAt(p.y) === 1 && (!monitorPlugged || d > 2.4 || ivHeld)) backToBed('Rounds! ...Why is your monitor unplugged? Nice try, mister.');
      else if (info.floorAt(p.y) === 1) say('Nurse', 'Rounds. Vitals look good. Sleep tight.', 2000);
    }
  }

  // ------------------------------------------------------------ runtime
  for (const pp of people) spawnPost(pp);
  let wasInside = false;
  const runtime: MapRuntime = {
    interactables: its,
    npcs: bodies,
    onBody(file) {
      resetBody(file);
    },
    interact(id) {
      if (!id.startsWith('hospital:') || busy) return;
      const k = id.slice(9);
      if (k === 'staffdoor') {
        if (staff()) return game.toast('BADGE OK', 'The door slides open for you.', 1200);
        game.sound.denied();
        eject('staff');
        return;
      }
      if (k === 'alarm') return pullAlarm();
      if (k === 'vending') return shakeVending();
      if (k in pickups) {
        const pk = pickups[k];
        if (!pk.mesh.visible) return;
        pk.mesh.visible = false;
        held.add(k);
        game.sound.blip(1.1);
        const n = [...held].filter((x) => pickups[x].metal).length;
        return game.toast('POCKETED', `You now have ${pk.label}. Metal in your pockets: ${n}.`, 1800);
      }
      if (k === 'coffee' || k === 'coffee2') {
        if (coffee) return game.toast('HANDS FULL', "You're already holding a coffee.", 1200);
        coffee = true;
        game.sound.gulp();
        return game.toast('HOT COFFEE', 'Scalding. Good for spilling on things.', 1600);
      }
      if (k === 'defib') return useDefib();
      if (k === 'drawer') return morgueNap();
      if (k === 'chute') return intoChute();
      if (k === 'nitrous') return huff();
      if (k === 'or1') return selfSurgery();
      if (k === 'chart') return readChart();
      if (k === 'gurney') return lieOnGurney();
      if (k === 'mri') return mriScan();
      if (k === 'heli') {
        if (job !== 'EMT') return denied('NOT A PILOT', 'Only the flight medic (an EMT) has the keys.');
        heliSpin = 30;
        game.toast('ROTOR STARTING', 'The blades are spinning up. Do NOT stand on the helicopter.', 2400);
        return;
      }
      if (k === 'monitor') {
        if (!monitorPlugged) return;
        monitorPlugged = false;
        flatlineT = 0;
        (monitorScreens[bedIdx].material as THREE.Material) = M.dark;
        game.sound.tone({ f: 400, f2: 80, dur: 0.4, type: 'sine', vol: 0.15 });
        return game.toast('UNPLUGGED', 'Silence. Now the nurses only know where you are when they do rounds.', 2400);
      }
      if (k === 'iv') {
        if (ivHeld) return;
        ivHeld = true;
        game.sound.creak();
        return game.toast('IV STAND', 'It follows you around on squeaky wheels. Mind the cord.', 2000);
      }
      const em = k.match(/^elev-(up|down)-(\d)$/);
      if (em) return rideElevator(Number(em[2]), em[1] === 'up' ? 1 : -1);
      const fk = k.match(/^firekey-(\d)$/);
      if (fk) {
        const f = Number(fk[1]);
        elevDoors[f].want = true;
        elevOpenT[f] = 12;
        game.sound.creak();
        game.toast('FIRE SERVICE MODE', f === 0 ? 'The doors open. The car is upstairs. The shaft is right there.' : "The doors open. The car is on another floor. That's a long way down.", 2600);
      }
    },
    checkHazards(h) {
      if (game.body !== lastBodyRef) resetBody(game.body);
      if (!game.body || busy) return;
      const p = feet();
      const z = zoneOf(p);
      ejectT = Math.max(0, ejectT - h);
      // Unplug Yourself: reach the stairs with your IV in tow.
      if (job === 'Patient' && ivHeld && bedIdx >= 0 && inBox(p, zones.stairwell)) return unplugDeath();
      if (job === 'Patient') patientTick(h, p);
      if (busy) return;
      // Rotor.
      if (heliRpm > 0.5) {
        const hc = heli.position;
        const r = Math.hypot(p.x - hc.x, p.z - hc.z);
        if (r < 5.8 && p.y + 1.9 > rotorY - 0.15 && p.y < rotorY + 0.4) return rotorDeath();
      }
      if (!allowed(z)) eject(z);
    },
    onLand(e) {
      if (!game.body) return false;
      if (inBox(e.launchPos, zones.chute) && e.drop > 4) {
        pressDeath();
        return true;
      }
      if (inBox(e.launchPos, zones.shaft) && e.drop > 5) {
        game.sound.splat();
        game.shake(1);
        kill('hospital-shaft', { kind: 'ragdoll', vel: new THREE.Vector3(0, 9, 0), spin: 8, bounce: 0.7 });
        return true;
      }
      return false;
    },
    update(dt, time) {
      updatePeople(dt);
      const p = game.body ? feet() : null;
      // Doors.
      const near = (c: THREE.Vector3, r: number) => p !== null && Math.abs(p.y - (c.y - 2)) < 3 && Math.hypot(p.x - c.x, p.z - c.z) < r;
      front.want = near(front.c, 5);
      badge.want = alarmT > 0 || (staff() && near(badge.c, 3.5));
      (readerLed.material as THREE.MeshBasicMaterial).color.setHex(badge.want ? 0x30ff60 : 0xff3030);
      if (p && !staff() && alarmT <= 0 && near(badge.c, 2.4)) denied('ACCESS DENIED', 'Staff only past the lobby. Doctors, nurses, EMTs and firefighters.');
      for (let f = 0; f < 4; f++) {
        elevOpenT[f] -= dt;
        if (elevOpenT[f] <= 0) elevDoors[f].want = false;
        elevDoors[f].update(dt);
      }
      front.update(dt);
      badge.update(dt);
      // Who can use what right now.
      const isFire = job === 'Firefighter';
      for (const e of elevIts) {
        e.key.enabled = isFire;
        e.up.enabled = e.down.enabled = !isFire || !near(e.key.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0.9);
      }
      iStaffDoor.enabled = !staff() && alarmT <= 0;
      iMonitor.enabled = job === 'Patient' && bedIdx >= 0 && monitorPlugged;
      iIv.enabled = job === 'Patient' && bedIdx >= 0 && !ivHeld;
      iChart.prompt = coffee && !chartSpilled ? "Spill coffee on Mr. Fudge's chart" : job === 'Patient' && !chartSwapped ? "Swap your chart with Mr. Fudge's" : "Read Mr. Fudge's chart";
      iHeli.enabled = job === 'EMT' && heliSpin <= 0;
      iDefib.enabled = iDrawer.enabled = iChute.enabled = iNitrous.enabled = !busy;
      iNitrous.prompt = huffs ? `Huff the nitrous again (${huffs}/5)` : 'Huff the nitrous';
      iCoffee.enabled = iCoffee2.enabled = !coffee;
      iOr1.enabled = SURGICAL.includes(job);
      iGurney.enabled = iMri.enabled = !busy;
      iVending.enabled = vendingFall === 0;
      iAlarm.enabled = alarmT <= 0;
      for (const k of Object.keys(pickups)) pickups[k].it.enabled = pickups[k].mesh.visible;
      // Vending machine tipping over onto the player.
      if (vendingFall > 0 && vendingFall < 1) {
        vendingFall = Math.min(1, vendingFall + dt * 2.2);
        vending.rotation.z = -(vendingFall * vendingFall) * (Math.PI / 2);
      }
      if (vendingResetT > 0) {
        vendingResetT -= dt;
        if (vendingResetT <= 0) {
          vendingFall = 0;
          vendingShakes = 0;
          vending.rotation.z = 0;
          vendingCol.setEnabled(true);
        }
      }
      // Fire alarm.
      if (alarmT > 0) {
        alarmT -= dt;
        alarmBell -= dt;
        if (alarmBell <= 0) {
          alarmBell = 0.5;
          game.sound.tone({ f: 1250, dur: 0.22, type: 'square', vol: 0.08 });
          game.sound.tone({ f: 950, dur: 0.22, type: 'square', vol: 0.08, at: 0.25 });
          if (p && inBox(p, zones.building)) game.flash('rgba(255,40,40,0.25)', 180);
        }
        if (alarmT <= 0) game.toast('ALL CLEAR', 'False alarm. Security is checking badges again.', 2200);
      }
      // Helicopter: warms up on its own every so often.
      heliCycle -= dt;
      if (heliCycle <= 0) {
        heliCycle = 50;
        heliSpin = Math.max(heliSpin, 14);
      }
      if (heliSpin > 0) heliSpin -= dt;
      heliRpm += ((heliSpin > 0 ? 1 : 0) - heliRpm) * Math.min(1, dt * (heliSpin > 0 ? 0.6 : 0.3));
      rotor.rotation.y += heliRpm * dt * 28;
      tailRotor.rotation.x += heliRpm * dt * 40;
      if (heliRpm > 0.3 && p && Math.hypot(p.x - heli.position.x, p.z - heli.position.z) < 25 && Math.floor(time * 12) % 2 === 0 && Math.random() < 0.3)
        game.sound.noise({ dur: 0.06, vol: 0.1 * heliRpm, freq: 120, type: 'lowpass' });
      // Morgue tray and chart wobble for life.
      tray.position.y = 0.95;
      chart.rotation.z = Math.sin(time * 2) * 0.03;
      void coffeePot;
      void coffeePot2;
      void tanks;
      void paddles;
      // Interior light.
      const inside = p ? inBox(p, zones.building) : false;
      if (inside) indoor.position.copy(p!).add(new THREE.Vector3(0, 3.6, 0));
      if (inside !== wasInside) {
        wasInside = inside;
        indoor.intensity = inside ? 11 : 0;
        indoorHemi.intensity = inside ? 0.45 : 0;
      }
    },
    dispose() {
      scene.remove(root);
      for (const n of bodies) n.remove(scene);
      for (const c of colliders) physics.removeCollider(c, false);
      for (const c of facade.colliders) physics.removeCollider(c, false);
      physics.removeRigidBody(fixed);
    },
  };
  return runtime;
}
