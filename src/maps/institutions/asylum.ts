import * as THREE from 'three';
import type { DeathDef } from '../../deaths';
import { B, type VoxelWorld } from '../../voxel';
import { mulberry32, pick, type Rng } from '../../util';
import type { GameApi, MapBuild, MapContext, MapDef, MapRuntime } from '../types';
import {
  AccessControl,
  Actor,
  G,
  PropKit,
  Strikes,
  box,
  cut,
  dress,
  ground,
  groundFloor,
  inBox,
  rainbow,
  slab,
  stairs,
  straitjacket,
  takePendingIntake,
  tree,
  person,
  suit,
  v3,
  walls,
  windows,
  type AccessZone,
  type InstitutionApi,
  type Gate,
} from './common';
import { asylumLife } from './life';

/**
 * Pinecrest Asylum. A walled hospital in the pines with a public lobby, a ward built around an
 * open courtyard (group therapy, cafeteria, rec room, pool, art therapy, nurses' station), and an
 * upstairs with patient dorms, padded cells, the electroshock room and the head psychiatrist's
 * office. A locked hatch leads to the roof. A ladder in the garden leads over the wall to the woods.
 *
 * Who can go where:
 *  - Anyone: outside, the front lawn, the lobby.
 *  - Patients and staff (Orderly, Nurse, Psychiatrist): the ward, the garden, upstairs.
 *  - Nurses' station: staff. Electroshock room: Nurse or Psychiatrist. The office: Psychiatrist.
 * Visitors who wander in are walked back to the lobby twice, then admitted.
 * Patients who wander into staff areas get a straitjacket and a padded cell. Third time, a sedative. A big one.
 */

const STAFF = ['Orderly', 'Nurse', 'Psychiatrist'];
const isStaff = (job: string) => STAFF.includes(job);

export const ASYLUM_DEATHS: DeathDef[] = [
  { id: 'asylum-padded', name: 'Sound Barrier', category: 'Sports', location: 'Pinecrest Padded Cell', payout: 3600, blurb: 'Ping-ponged off the padded walls until breaking the sound barrier.' },
  { id: 'asylum-napoleon', name: 'Waterloo', category: 'Stupidity', location: 'Pinecrest Rec Room', payout: 2600, blurb: 'Beat Napoleon at chess. He declared war. He had a cannon.' },
  { id: 'asylum-pudding', name: 'Last Pudding Cup', category: 'Food & Drink', location: 'Pinecrest Cafeteria', payout: 1600, blurb: 'Took the last chocolate pudding cup. The ward had opinions.' },
  { id: 'asylum-ect', name: 'Turned It Up to 11', category: 'Electricity', location: 'Pinecrest Electroshock Room', payout: 3400, blurb: 'Sat in the therapy chair and cranked the dial past the numbers.' },
  { id: 'asylum-imaginary', name: 'Imaginary Friend', category: 'Gravity', location: 'Pinecrest Roof', payout: 3000, blurb: 'Followed the voice only this body could hear up to the roof. The voice could fly.' },
  { id: 'asylum-swim', name: 'Burrito Float', category: 'Water', location: 'Pinecrest Pool', payout: 2800, blurb: 'Went for a swim in a straitjacket. Floated like a burrito, then sank like one.' },
  { id: 'asylum-medcart', name: 'Med Cart Buffet', category: 'Food & Drink', location: "Pinecrest Nurses' Station", payout: 2400, blurb: 'Ate every cup on the night med cart. Medicated bodies lasted longer.' },
  { id: 'asylum-trustfall', name: 'Trust Fall, No Catchers', category: 'Gravity', location: 'Pinecrest Group Therapy', payout: 1400, blurb: 'Volunteered for the trust fall from the top of the bookshelf. Group did not catch.' },
  { id: 'asylum-paint', name: 'Taste the Rainbow', category: 'Food & Drink', location: 'Pinecrest Art Therapy', payout: 1800, blurb: 'Ate the finger paints one color at a time. Died rainbow.' },
  { id: 'asylum-lobotomy', name: 'Self-Serve Lobotomy', category: 'Stupidity', location: "Pinecrest Psychiatrist's Office", payout: 4200, blurb: 'Found the 1950s lobotomy kit in the desk and gave it a go.' },
  { id: 'asylum-bear', name: 'Unbearable', category: 'Creatures', location: 'Pinecrest Woods', payout: 3000, blurb: 'Escaped over the wall into the woods and met a bear. The bear was Gerald from Ward B.' },
  { id: 'asylum-sedated', name: 'Heavy Sedation', category: 'Stupidity', location: 'Pinecrest Asylum', payout: 2000, blurb: 'Kept wandering into staff areas. The nurse brought the horse tranquilizer.' },
];

// ------------------------------------------------------------------ layout

const SX = 192, SY = 40, SZ = 192;
const WALL = { x0: 30, z0: 40, x1: 161, z1: 170, h: 8 };
const F2 = G + 7; // upstairs floor height
const COURT = { x0: 80, z0: 96, x1: 112, z1: 124 };
const PADDED = box(119, F2 - 0.5, 126, 141, F2 + 5, 136);
const PADDED_SPOT = v3(130, F2, 131);
const POOL = box(122, 0, 75, 138, G, 93);
const SHELF_TOP = box(51, G + 3.5, 74, 57.5, G + 9, 82);
/** The floor around the bookshelf, where a trust fall lands. */
const SHELF_FOOT = box(47, G - 1, 70, 61.5, G + 1.5, 86);
const LOBBY_SPOT = v3(96.5, G, 140);
const DORM_SPOT = v3(62, F2, 80);
const PAINTS: [string, number][] = [
  ['red', 0xe0302a],
  ['orange', 0xf07a2a],
  ['yellow', 0xf2c230],
  ['green', 0x3aa65a],
  ['blue', 0x3a6fd8],
  ['purple', 0x8a4ad8],
];

function buildAsylum(w: VoxelWorld, rng: Rng) {
  ground(w, B.Grass, rng, 0.02);

  // Road and the drive up to the gate.
  slab(w, 0, 180, SX - 1, 185, 3, B.Asphalt);
  for (let x = 0; x < SX; x++) if (x % 6 < 3) w.set(x, 3, 182, B.Yellow);
  slab(w, 0, 178, SX - 1, 179, 3, B.Sidewalk);
  slab(w, 93, 151, 98, 177, 3, B.Sidewalk);

  // Grounds wall with a gate in the south side.
  for (let t = 0; t < 2; t++) walls(w, WALL.x0 + t, WALL.z0 + t, WALL.x1 - t, WALL.z1 - t, G, WALL.h, B.Brick);
  cut(w, 92, G, WALL.z1 - 1, 99, G + 5, WALL.z1);
  w.fill(91, G, WALL.z1 - 1, 91, G + 9, WALL.z1, B.Stone);
  w.fill(100, G, WALL.z1 - 1, 100, G + 9, WALL.z1, B.Stone);

  // Garden north of the building, and the gardener's ladder over the wall (both sides).
  for (let x = 40; x < 150; x += 6) for (let z = 46; z < 66; z += 5) if (rng() < 0.5) w.fill(x, 3, z, x + 2, 3, z + 1, B.Flower);
  stairs(w, 60, 49, 0, -1, G, 8, 2, B.Wood);
  stairs(w, 60, 32, 0, 1, G, 8, 2, B.Wood);

  // ---- Main building shell.
  walls(w, 50, 70, 142, 150, G, 14, B.AsylumWall);
  slab(w, 51, 71, 141, 149, 3, B.Linoleum);
  slab(w, 51, 71, 141, 149, G + 6, B.Linoleum); // upstairs floor
  slab(w, 50, 70, 142, 150, G + 13, B.RoofGreen); // roof
  walls(w, 50, 70, 142, 150, G + 14, 1, B.AsylumWall); // parapet
  // Courtyard: open to the sky through both floors, grass, a tree and benches.
  cut(w, COURT.x0, G + 6, COURT.z0, COURT.x1, G + 13, COURT.z1);
  slab(w, COURT.x0, COURT.z0, COURT.x1, COURT.z1, 3, B.Grass);
  slab(w, 94, COURT.z0, 98, COURT.z1, 3, B.Gravel);
  tree(w, rng, 86, 102);
  tree(w, rng, 106, 118);
  w.fill(88, G, 112, 91, G, 112, B.Wood);
  w.fill(101, G, 106, 104, G, 106, B.Wood);
  // Colonnade pillars around the courtyard.
  for (let x = COURT.x0 - 1; x <= COURT.x1 + 1; x += 4) {
    w.fill(x, G, COURT.z0 - 1, x, G + 5, COURT.z0 - 1, B.White);
    w.fill(x, G, COURT.z1 + 1, x, G + 5, COURT.z1 + 1, B.White);
  }
  for (let z = COURT.z0 - 1; z <= COURT.z1 + 1; z += 4) {
    w.fill(COURT.x0 - 1, G, z, COURT.x0 - 1, G + 5, z, B.White);
    w.fill(COURT.x1 + 1, G, z, COURT.x1 + 1, G + 5, z, B.White);
  }
  // Upstairs railing around the courtyard opening.
  for (let x = COURT.x0 - 1; x <= COURT.x1 + 1; x++) (w.set(x, F2, COURT.z0 - 1, B.Metal), w.set(x, F2, COURT.z1 + 1, B.Metal));
  for (let z = COURT.z0 - 1; z <= COURT.z1 + 1; z++) (w.set(COURT.x0 - 1, F2, z, B.Metal), w.set(COURT.x1 + 1, F2, z, B.Metal));

  // Front door, back door to the garden, windows.
  cut(w, 94, G, 150, 97, G + 3, 150);
  cut(w, 95, G, 70, 96, G + 2, 70);
  for (const y of [G + 2, G + 9]) {
    windows(w, 51, 70, 141, 70, y, 4);
    windows(w, 51, 150, 141, 150, y, 4);
    windows(w, 50, 71, 50, 149, y, 4);
    windows(w, 142, 71, 142, 149, y, 4);
  }

  // ---- Ground floor.
  // Wing walls (both floors) and the room dividers.
  w.fill(75, G, 71, 75, G + 12, 149, B.AsylumWall);
  w.fill(117, G, 71, 117, G + 12, 149, B.AsylumWall);
  for (const z of [97, 124]) {
    w.fill(51, G, z, 74, G + 12, z, B.AsylumWall);
    w.fill(118, G, z, 141, G + 12, z, B.AsylumWall);
  }
  for (const z of [83, 110, 126]) {
    cut(w, 75, G, z, 75, G + 2, z + 1);
    cut(w, 117, G, z, 117, G + 2, z + 1);
  }
  // Lobby box with the ward door.
  w.fill(79, G, 129, 113, G + 5, 129, B.AsylumWall);
  w.fill(79, G, 129, 79, G + 5, 149, B.AsylumWall);
  w.fill(113, G, 129, 113, G + 5, 149, B.AsylumWall);
  cut(w, 95, G, 129, 96, G + 2, 129);
  slab(w, 80, 130, 112, 149, 3, B.Carpet);
  w.fill(86, G, 137, 92, G, 138, B.Wood); // reception desk
  for (const x of [100, 104, 108]) w.fill(x, G, 145, x + 2, G, 145, B.WallBlue); // waiting chairs
  // Stairs up from the north hall.
  stairs(w, 82, 90, 0, -1, G, 7, 3, B.Linoleum);
  cut(w, 82, G + 6, 85, 84, G + 6, 90);

  // Group therapy: a circle of chairs and a tall bookshelf you can climb by the stacked chairs.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    w.set(Math.round(64 + Math.cos(a) * 5), G, Math.round(85 + Math.sin(a) * 5), B.WallBlue);
  }
  w.fill(52, G, 75, 53, G + 3, 81, B.Wood); // top at G+4, two blocks under the ceiling
  stairs(w, 56, 78, -1, 0, G, 3, 1, B.WallBlue);
  // Cafeteria tables and the fridge.
  for (const z of [104, 112, 118]) for (const x of [58, 66]) w.fill(x, G, z, x + 4, G, z + 1, B.Wood);
  w.fill(52, G, 99, 53, G + 2, 101, B.White);
  // Rec room: chess table, TV, couch.
  w.fill(60, G, 136, 61, G, 137, B.Wood);
  w.fill(52, G, 128, 52, G + 2, 132, B.Dark);
  w.fill(57, G, 128, 58, G, 133, B.Carpet);
  // Pool: a basin with steps in the corner.
  cut(w, POOL.min.x, 1, POOL.min.z, POOL.max.x, 3, POOL.max.z);
  slab(w, POOL.min.x, POOL.min.z, POOL.max.x, POOL.max.z, 0, B.PoolTile);
  slab(w, 118, 71, 141, 74, 3, B.Tile);
  slab(w, 118, 94, 141, 96, 3, B.Tile);
  slab(w, 118, 75, 121, 93, 3, B.Tile);
  slab(w, 139, 75, 141, 93, 3, B.Tile);
  stairs(w, 122, 92, 0, -1, 1, 3, 2, B.PoolTile);
  // Art therapy table, nurses' counter.
  w.fill(125, G, 108, 134, G, 110, B.Wood);
  w.fill(120, G, 131, 128, G, 131, B.White);

  // ---- Upstairs.
  // Patient dorms in the west wing.
  for (const z of [90, 110, 130]) w.fill(51, F2, z, 74, G + 12, z, B.AsylumWall);
  for (const z of [80, 100, 120, 140]) cut(w, 75, F2, z, 75, F2 + 2, z + 1);
  for (const [z0, z1] of [[72, 89], [91, 109], [111, 129], [131, 148]])
    for (let z = z0 + 1; z < z1; z += 4) w.fill(52, F2, z, 54, F2, z + 1, B.White); // beds
  // East wing: office, electroshock room, two padded cells.
  for (const z of [83, 110]) cut(w, 117, F2, z, 117, F2 + 2, z + 1);
  w.fill(126, F2, 80, 134, F2, 82, B.Wood); // psychiatrist's desk
  w.fill(139, F2, 74, 140, F2 + 3, 92, B.Wood); // file cabinets
  w.fill(129, F2, 110, 131, F2, 110, B.Metal); // ECT chair seat
  w.fill(129, F2, 111, 131, F2 + 2, 111, B.Metal); // back
  w.fill(134, F2, 108, 135, F2 + 1, 108, B.Dark); // the dial box
  for (const [z0, z1] of [[125, 136], [138, 149]]) {
    walls(w, 118, z0, 141, z1, F2, 6, B.Padding);
    slab(w, 119, z0 + 1, 140, z1 - 1, G + 6, B.Padding);
    slab(w, 119, z0 + 1, 140, z1 - 1, G + 12, B.Padding);
  }
  cut(w, 117, F2, 130, 118, F2 + 2, 131);
  cut(w, 117, F2, 143, 118, F2 + 2, 144);
  // Roof stairs behind a hatch.
  stairs(w, 108, 90, 0, -1, F2, 7, 3, B.Metal);
  cut(w, 108, G + 13, 85, 110, G + 13, 90);

  // ---- Woods north of the wall, trees around.
  for (let i = 0; i < 70; i++) {
    const x = 4 + Math.floor(rng() * (SX - 8)), z = 4 + Math.floor(rng() * 32);
    if (Math.abs(x - 61) < 4 && z > 26) continue;
    tree(w, rng, x, z);
  }
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(rng() * SX), z = 40 + Math.floor(rng() * 136);
    const inside = x > WALL.x0 - 4 && x < WALL.x1 + 4 && z < WALL.z1 + 4;
    if (!inside && x > 3 && x < SX - 4) tree(w, rng, x, z);
  }
}

// ------------------------------------------------------------------ runtime

function asylumZones(): AccessZone[] {
  return [
    { id: 'office', name: "the psychiatrist's office", boxes: [box(117.5, F2 - 1, 71, 141, F2 + 6, 96.5)], allow: (j) => j === 'Psychiatrist' },
    { id: 'ect', name: 'the electroshock room', boxes: [box(117.5, F2 - 1, 97.5, 141, F2 + 6, 123.5)], allow: (j) => j === 'Psychiatrist' || j === 'Nurse' },
    { id: 'nurses', name: "the nurses' station", boxes: [box(117.5, G - 1, 124.5, 141, G + 5.9, 149)], allow: isStaff },
    { id: 'lobby', name: 'the lobby', boxes: [box(79.5, G - 1, 129.5, 112.5, G + 5.9, 149.9)], allow: (j) => j !== 'Patient' },
    { id: 'front', name: 'the front lawn', boxes: [box(0, G - 1, 150.5, SX, G + 30, SZ)], allow: (j) => j !== 'Patient' },
    {
      id: 'ward',
      name: 'the ward',
      boxes: [box(50, G - 4, 70, 142, G + 30, 150), box(WALL.x0 + 2, G - 1, WALL.z0 + 2, WALL.x1 - 2, G + 30, 69.9)],
      allow: (j) => j === 'Patient' || isStaff(j),
    },
  ];
}

class AsylumRuntime implements MapRuntime {
  private kit: PropKit;
  private game: GameApi;
  private rng = mulberry32(9172);
  private access = new AccessControl(asylumZones());
  private visitorStrikes = new Strikes();
  private patientStrikes = new Strikes();
  private actors: Actor[] = [];
  private mob: Actor[] = [];
  private napoleon: Actor;
  private bruce: Actor;
  private bear: Actor;
  private bearHead: THREE.Object3D;
  private friend: THREE.Group;
  private hatch: Gate;
  private paddedDoor: Gate;
  private cannon: THREE.Group;
  private paintPots: THREE.Mesh[] = [];
  private water: THREE.Mesh;
  private lastBody: unknown = null;
  private busy = false;
  /** game.time when the body last stood on the bookshelf (the wall slide down it fires many tiny landings). */
  private shelfAt = -99;
  private jacketUndo: (() => void) | null = null;
  private jacketT = 0;
  private paddedT = 0;
  private paints = 0;
  private cups = 0;
  private underwaterT = 0;
  private friendActive = false;
  private escaped = false;
  /** Ping-pong state in the padded cell. */
  private pong: { v: THREE.Vector3; hits: number } | null = null;
  private bearPatrol = 0;
  private lineT = 8;
  readonly interactables;

  constructor(private ctx: MapContext) {
    this.game = ctx.game;
    const kit = (this.kit = new PropKit(ctx));
    this.interactables = kit.interactables;
    const rng = this.rng;

    // Pool water.
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(POOL.max.x - POOL.min.x + 1, POOL.max.z - POOL.min.z + 1),
      new THREE.MeshLambertMaterial({ color: 0x4ab8f0, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set((POOL.min.x + POOL.max.x + 1) / 2, G - 0.45, (POOL.min.z + POOL.max.z + 1) / 2);
    kit.root.add(this.water);

    // Hatch to the roof, padded cell door (the second cell is always locked).
    this.hatch = kit.gate(v3(108, G + 12.8, 84.5), v3(111, G + 13.2, 91), { color: 0x5a5f68 });
    this.paddedDoor = kit.gate(v3(117, F2, 130), v3(119, F2 + 3, 132), { color: 0xf1ead2, open: true });
    kit.gate(v3(117, F2, 143), v3(119, F2 + 3, 145), { color: 0xf1ead2 });
    // Ward door is a plain doorway; an orderly stands by it.

    // Signs.
    kit.sign(['PINECREST ASYLUM', 'A CALM PLACE FOR CALM PEOPLE'], v3(96, G + 9, 150.6), 0, '#3f7d4a', '#f5f0e0', 14, 2.4);
    kit.sign(['PINECREST'], v3(95.5, G + 7, WALL.z1 + 1.1), 0, '#3f7d4a', '#ffffff', 8, 1.4);
    kit.sign(['WARD', 'PATIENTS AND STAFF ONLY'], v3(95.5, G + 3.6, 129.6), 0, '#b02a2a', '#ffffff', 3.4, 1);
    kit.sign(['GROUP THERAPY'], v3(75.6, G + 3.6, 83.5), Math.PI / 2, '#3f7d4a', '#ffffff', 3.6, 0.7);
    kit.sign(['CAFETERIA'], v3(75.6, G + 3.6, 110.5), Math.PI / 2, '#3f7d4a', '#ffffff', 3, 0.7);
    kit.sign(['REC ROOM'], v3(75.6, G + 3.6, 126.5), Math.PI / 2, '#3f7d4a', '#ffffff', 3, 0.7);
    kit.sign(['POOL', 'NO RUNNING. NO JACKETS.'], v3(116.4, G + 3.6, 83.5), -Math.PI / 2, '#2a6ab0', '#ffffff', 3, 0.9);
    kit.sign(['ART THERAPY'], v3(116.4, G + 3.6, 110.5), -Math.PI / 2, '#3f7d4a', '#ffffff', 3.4, 0.7);
    kit.sign(["NURSES' STATION", 'STAFF ONLY'], v3(116.4, G + 3.6, 126.5), -Math.PI / 2, '#b02a2a', '#ffffff', 3.6, 0.9);
    kit.sign(['DR. FUDGE', 'HEAD OF PSYCHIATRY'], v3(116.4, F2 + 3.6, 83.5), -Math.PI / 2, '#2a2a2a', '#f2c230', 3.4, 0.9);
    kit.sign(['THERAPY ROOM B', 'DO NOT TOUCH THE DIAL'], v3(116.4, F2 + 3.6, 110.5), -Math.PI / 2, '#b02a2a', '#ffffff', 3.6, 0.9);
    kit.sign(['QUIET ROOM'], v3(116.4, F2 + 3.6, 130.5), -Math.PI / 2, '#f1ead2', '#555555', 2.6, 0.6);
    kit.sign(['ROOF ACCESS', 'LOCKED. FOREVER.'], v3(109.5, F2 + 4.5, 91.4), 0, '#b02a2a', '#ffffff', 3, 0.9);
    kit.sign(['DO NOT CLIMB', 'THE GARDENER IS WATCHING'], v3(64, G + 2, 49.5), 0, '#ffffff', '#b02a2a', 3, 0.9);

    // Bus shelter.
    kit.block(v3(89, G, 177.6), v3(91, G + 3, 177.9), 0x6a7480);
    kit.box([4, 0.2, 2], v3(90, G + 3.1, 177), 0x3f7d4a);

    // Fridge pudding, med cart, paint pots, the lobotomy kit, the dial, the toy cannon.
    kit.box([0.4, 0.3, 0.4], v3(54.3, G + 1.2, 100), kit.mat(0x6a3a1a));
    kit.box([1.2, 1.0, 0.8], v3(131, G + 0.5, 138.5), 0xdfe8ec);
    for (let i = 0; i < 9; i++) kit.box([0.12, 0.14, 0.12], v3(130.6 + (i % 3) * 0.3, G + 1.1, 138.3 + Math.floor(i / 3) * 0.25), 0xffffff);
    PAINTS.forEach(([, c], i) => this.paintPots.push(kit.box([0.4, 0.35, 0.4], v3(126.5 + i * 1.3, G + 1.2, 109), kit.mat(c))));
    kit.box([0.9, 0.3, 0.5], v3(130, F2 + 1.15, 81), 0x3a2a1a);
    kit.box([0.08, 0.6, 0.08], v3(134.5, F2 + 2.3, 107.8), 0xd02a2a);
    this.cannon = new THREE.Group();
    const barrel = kit.box([0.5, 0.5, 1.6], v3(0, 0.5, 0), 0x2a2a2a, this.cannon);
    barrel.rotation.x = -0.2;
    for (const dx of [-0.35, 0.35]) kit.box([0.15, 0.6, 0.6], v3(dx, 0.3, -0.2), 0x6a3a1a, this.cannon);
    this.cannon.position.set(64.5, G, 137);
    this.cannon.visible = false;
    kit.root.add(this.cannon);

    // The imaginary friend: only bodies whose minds aren't Normal can see it.
    this.friend = new THREE.Group();
    const glow = kit.mat(0xcab8ff, { emissive: 0x6a4ac8, transparent: true, opacity: 0.75 });
    kit.box([0.7, 0.9, 0.5], v3(0, 0.6, 0), glow, this.friend);
    kit.box([0.6, 0.55, 0.55], v3(0, 1.35, 0), glow, this.friend);
    for (const dx of [-0.13, 0.13]) kit.box([0.1, 0.16, 0.04], v3(dx, 1.4, 0.28), new THREE.MeshBasicMaterial({ color: 0x111122 }), this.friend);
    this.friend.position.set(96.5, G + 0.5, 110);
    kit.root.add(this.friend);

    // Scripted people.
    const root = kit.root;
    this.napoleon = new Actor(root, person('Patient', 201, { stature: 'short', hairStyle: 'short', facial: 'none', brows: 'angry', mouth: 'flat', top: 0x2a3a8a, accent: 0xf2f2f2, bottoms: 0xf2f2f2 }), v3(62.6, G, 136.5), -Math.PI / 2, 'Napoleon');
    const nh = this.napoleon.ch.parts.head.size;
    const bicorne = kit.box([nh.x * 1.5, nh.y * 0.4, nh.z * 0.35], v3(0, nh.y * 0.6, 0), 0x1a1a2a, this.napoleon.ch.parts.head.mesh);
    bicorne.rotation.y = Math.PI / 2;
    this.bruce = new Actor(root, person('Orderly', 202, { build: 'buff', hairStyle: 'buzz', mouth: 'smile' }), v3(97.6, G, 127.4), Math.PI, 'Orderly Bruce');
    // The bear. Definitely a bear. (Gerald from Ward B, in a bear suit, since 2009.)
    const fur = 0x5a3a20;
    this.bear = new Actor(root, person('Patient', 203, { build: 'heavy', stature: 'tall', hairStyle: 'curly', facial: 'beard', held: 'none' }), v3(70, G, 20), 0, 'Bear');
    this.bear.ch.root.scale.multiplyScalar(1.5);
    suit(this.bear.ch, fur, fur);
    const head = this.bear.ch.parts.head;
    this.bearHead = new THREE.Group();
    const hs = head.size;
    kit.box([hs.x + 0.12, hs.y + 0.08, hs.z + 0.12], v3(0, 0.02, 0), fur, this.bearHead);
    for (const dx of [-0.3, 0.3]) kit.box([hs.x * 0.25, hs.y * 0.25, 0.15], v3(dx * hs.x, hs.y * 0.58, 0), fur, this.bearHead);
    kit.box([hs.x * 0.4, hs.y * 0.28, 0.25], v3(0, -hs.y * 0.15, hs.z / 2 + 0.1), 0x8a6a4a, this.bearHead);
    kit.box([hs.x * 0.14, hs.y * 0.1, 0.06], v3(0, -hs.y * 0.08, hs.z / 2 + 0.24), 0x111111, this.bearHead);
    for (const dx of [-0.2, 0.2]) kit.box([0.08, 0.1, 0.04], v3(dx * hs.x, hs.y * 0.12, hs.z / 2 + 0.07), 0x111111, this.bearHead);
    head.mesh.add(this.bearHead);
    this.actors.push(this.napoleon, this.bruce, this.bear);

    // Things to press E on.
    kit.interact('chess', v3(59.2, G, 136.8), 'Play chess against Napoleon', 1.8);
    kit.interact('pudding', v3(54.8, G, 100), 'Take the last pudding cup', 1.8);
    kit.interact('paint', v3(129.5, G, 111.6), 'Eat the red finger paint', 2);
    kit.interact('medcart', v3(131, G, 140), 'Eat a cup from the med cart', 1.8);
    kit.interact('ect', v3(130, F2, 108.6), 'Sit in the chair and crank the dial to 11', 1.8);
    kit.interact('lobotomy', v3(130, F2, 83.4), 'Open the 1950s lobotomy kit', 1.8);
    kit.interact('friend', v3(96.5, G, 110), 'Listen to the voice', 2.2);
    kit.interact('jacket', v3(97.6, G, 126), 'Ask Orderly Bruce for a straitjacket', 2);
  }

  // ---------------------------------------------------------------- helpers
  private get job() {
    return this.game.body?.job ?? '';
  }

  private takeOffJacket() {
    this.jacketUndo?.();
    this.jacketUndo = null;
    this.jacketT = 0;
  }

  private putOnJacket(seconds: number) {
    const ch = this.game.character;
    if (!ch) return;
    this.takeOffJacket();
    this.jacketUndo = straitjacket(ch);
    this.jacketT = seconds;
  }

  /** Admit the current body as a patient: gown, meds, a bed upstairs. */
  private admit(reason: string) {
    const game = this.game;
    const body = game.body;
    const ch = game.character;
    if (!body || !ch) return;
    this.busy = true;
    game.player.lock(true);
    game.runSeq([
      { at: 0.3, fn: () => game.say('Nurse', 'Just a little pinch. There we go. Welcome to Pinecrest, sweetie.', 2800) },
      {
        at: 1.4,
        fn: () => {
          body.job = 'Patient';
          body.mental = 'Medicated';
          dress(ch, 'Patient');
          (game as InstitutionApi).refreshHud?.();
          game.flash('#ffffff', 400);
          game.toast('ADMITTED', `${reason}. Mental health: Medicated.`, 3000);
        },
      },
      {
        at: 3,
        fn: () => {
          game.player.teleport(DORM_SPOT, Math.PI / 2);
          game.player.lock(false);
          this.access.reset();
          this.access.pass = 2;
          this.busy = false;
          game.say('Death', "Pinecrest. Padded walls, a pool, a bear in the woods. Go nuts. Literally.", 4500);
        },
      },
    ]);
  }

  private toLobby(line: string) {
    const game = this.game;
    this.busy = true;
    game.player.lock(true);
    game.say('Orderly', line, 2600);
    game.sound.denied();
    game.runSeq([
      {
        at: 0.8,
        fn: () => {
          game.player.lock(false);
          game.player.teleport(LOBBY_SPOT, 0);
          game.player.knock(v3(0, 5, 6));
          game.sound.whoosh();
          this.access.reset();
          this.busy = false;
        },
      },
    ]);
  }

  private toPaddedCell(line: string) {
    const game = this.game;
    this.busy = true;
    game.player.lock(true);
    game.say('Orderly', line, 2600);
    game.runSeq([
      { at: 0.6, fn: () => (game.shake(0.4), game.sound.slam(), this.putOnJacket(75)) },
      {
        at: 1.8,
        fn: () => {
          game.player.teleport(PADDED_SPOT, -Math.PI / 2);
          this.paddedDoor.setOpen(false);
          this.paddedT = 40;
          game.player.lock(false);
          game.sound.slam();
          this.access.reset();
          this.busy = false;
          game.toast('QUIET ROOM', `Straitjacket on, 40 seconds in the padded cell. Strike ${this.patientStrikes.n} of 3.`, 3000);
        },
      },
    ]);
  }

  private sedate() {
    const game = this.game;
    const ch = game.character!;
    this.busy = true;
    game.player.lock(true);
    game.say('Nurse', "Third time, sweetie. I brought the big one. It's for horses.", 2800);
    game.runSeq([
      { at: 1.2, fn: () => (game.sound.tone({ f: 900, f2: 300, dur: 0.4, type: 'sine', vol: 0.1 }), ch.kick(0.4)) },
      ...Array.from({ length: 24 }, (_, i) => ({
        at: 1.6 + i * 0.08,
        fn: () => {
          game.setHueShift(i * 12);
          ch.spinner.rotation.z = Math.sin(i * 0.6) * (i / 30);
        },
      })),
      { at: 3.6, fn: () => game.setHueShift(0) },
      { at: 3.7, fn: () => ((this.busy = false), game.kill('asylum-sedated', { kind: 'ragdoll', vel: v3(0, 1, 2), spin: 2, bounce: 0.1 })) },
    ]);
  }

  private trespass(z: AccessZone) {
    const job = this.job;
    if (job === 'Patient') {
      const n = this.patientStrikes.hit();
      if (n >= 3) return this.sedate();
      return this.toPaddedCell(z.id === 'lobby' || z.id === 'front' ? 'Going somewhere? Not without a discharge form.' : `Patients don't go in ${z.name}. Let's get you somewhere quiet.`);
    }
    if (isStaff(job)) {
      // Staff in a more senior staff room: just shooed out.
      this.game.toast('NOT YOUR OFFICE', `${z.name[0].toUpperCase()}${z.name.slice(1)} is for the ${z.id === 'office' ? 'Psychiatrist' : 'nurses and the Psychiatrist'}.`, 2400);
      this.game.player.knock(v3(-8, 4, 0));
      this.access.reset();
      return;
    }
    const n = this.visitorStrikes.hit();
    if (n < 3) {
      this.game.toast('WALKED BACK OUT', `Only patients and staff past the lobby. (${n}/3)`, 2200);
      return this.toLobby(n === 1 ? 'Visiting hours are in the lobby, friend.' : 'Back to the lobby. I will not ask a third time.');
    }
    this.game.say('Orderly', "You seem... agitated. You know what? Let's get you a room.", 2800);
    this.admit('Kept trying to get into an asylum');
  }

  // ---------------------------------------------------------------- per-frame
  update(dt: number) {
    const game = this.game;
    for (const a of this.actors) a.update(dt);
    for (const a of this.mob) a.update(dt);

    if (game.body !== this.lastBody) {
      this.lastBody = game.body;
      this.visitorStrikes.reset();
      this.patientStrikes.reset();
      this.paints = 0;
      this.cups = 0;
      this.underwaterT = 0;
      this.friendActive = false;
      this.escaped = false;
      this.pong = null;
      this.hatch.setOpen(false);
      this.jacketUndo = null; // the old body kept its jacket
      this.jacketT = 0;
      this.access.reset();
    }

    if (game.body && !this.busy) {
      const intake = takePendingIntake('commit');
      if (intake) this.admit(intake.reason);
    }

    const job = this.job;
    const mental = game.body?.mental ?? 'Normal';
    const it = (id: string) => this.interactables.find((i) => i.id === id)!;
    const canSeeFriend = !!game.body && mental !== 'Normal';
    this.friend.visible = canSeeFriend || this.friendActive;
    it('friend').enabled = canSeeFriend && !this.friendActive;
    it('jacket').enabled = job === 'Patient' && !this.jacketUndo;
    const paint = PAINTS[Math.min(this.paints, PAINTS.length - 1)][0];
    it('paint').prompt = `Eat the ${paint} finger paint`;
    this.paintPots.forEach((p, i) => (p.visible = i >= this.paints));

    // Friend bobs and sparkles.
    this.friend.position.y += Math.sin(game.time * 2) * 0.003;
    this.friend.rotation.y += dt * 0.8;
    if (this.friend.visible && Math.random() < 0.3) game.particles.emit(this.friend.position.clone().add(v3(0, 1, 0)), v3(0, 1, 0), 0xcab8ff, { life: 0.8, size: 0.08, gravity: -1, spread: 0.6 });

    if (this.jacketT > 0) {
      this.jacketT -= dt;
      if (this.jacketT <= 0) {
        this.takeOffJacket();
        game.toast('JACKET OFF', 'Orderly Bruce unbuckled you. Behave.', 1800);
      }
    }
    if (this.paddedT > 0) {
      this.paddedT -= dt;
      if (this.paddedT <= 0) {
        this.paddedDoor.setOpen(true);
        this.access.pass = 25;
        game.sound.creak();
      }
    }

    // The bear wanders the woods.
    if (!this.bear.moving && !this.busy) {
      this.bearPatrol = (this.bearPatrol + 1) % 4;
      const pts = [v3(70, G, 20), v3(110, G, 14), v3(130, G, 26), v3(80, G, 30)];
      this.bear.goTo(pts[this.bearPatrol], 1.6);
    }

    // Napoleon and Bruce mutter.
    this.lineT -= dt;
    if (this.lineT <= 0 && game.body) {
      this.lineT = 14 + this.rng() * 10;
      const p = game.player.feet();
      if (p.distanceTo(this.napoleon.pos) < 12)
        game.say('Napoleon', pick(this.rng, ['Chess? Chess. Unless you are a coward. Or British.', 'I am of AVERAGE height for the period.', 'Josephine never visits.']), 3200);
      else if (p.distanceTo(this.bruce.pos) < 10)
        game.say('Orderly Bruce', pick(this.rng, ['Need a jacket? I got jackets.', 'Nobody goes in the nurses station. Nobody.', 'The bear is not real. Stop asking about the bear.']), 3200);
    }
  }

  step(h: number) {
    if (this.game.body && inBox(this.game.player.position(), SHELF_TOP) && this.game.player.vel.y > -1) this.shelfAt = this.game.time;
    // Padded cell ping-pong runs on the fixed step so the speed-up is the same at any frame rate.
    const pong = this.pong;
    const game = this.game;
    if (!pong || !game.character) return;
    const p = game.player.feet().addScaledVector(pong.v, h);
    let hit = false;
    const lo = PADDED.min, hi = PADDED.max;
    if (p.x < lo.x + 0.5 || p.x > hi.x - 0.5) (pong.v.x *= -1, (p.x = Math.min(Math.max(p.x, lo.x + 0.5), hi.x - 0.5)), (hit = true));
    if (p.z < lo.z + 0.5 || p.z > hi.z - 0.5) (pong.v.z *= -1, (p.z = Math.min(Math.max(p.z, lo.z + 0.5), hi.z - 0.5)), (hit = true));
    p.y = F2 + 0.6 + Math.abs(Math.sin(game.time * 9)) * 1.4;
    game.player.teleport(p, Math.atan2(pong.v.x, pong.v.z));
    game.player.lock(true);
    game.character.spinner.rotation.x += h * pong.v.length() * 0.5;
    if (!hit) return;
    pong.hits++;
    pong.v.multiplyScalar(1.28);
    // A little chaos so it doesn't settle into a straight line.
    pong.v.applyAxisAngle(v3(0, 1, 0), (Math.random() - 0.5) * 0.5);
    game.sound.boing();
    game.character.kick(0.6);
    game.shake(Math.min(0.2 + pong.hits * 0.08, 1));
    const speed = pong.v.length();
    if (speed > 70) {
      this.pong = null;
      game.character.spinner.rotation.set(0, 0, 0);
      game.sound.thunder();
      game.flash('#ffffff', 500);
      game.shake(2);
      game.particles.burst(game.player.position(), 50, 0xffffff, 14, { life: 0.8, size: 0.25, gravity: 0 });
      game.toast('KA-BOOM', 'Mach 1. In a padded room.', 1800);
      this.busy = false;
      game.kill('asylum-padded', { kind: 'ragdoll', vel: pong.v.clone().multiplyScalar(0.6).setY(14), spin: 25, bounce: 0.9 });
    }
  }

  checkHazards(h: number) {
    const game = this.game;
    if (!game.body || this.busy) return;
    const p = game.player.feet();
    const job = this.job;

    // Padded cell: hit a wall at speed and start bouncing.
    if (!this.pong && inBox(p, PADDED) && game.player.state !== 'locked') {
      const v = game.player.vel;
      const speed = Math.hypot(v.x, v.z);
      const nearWall = p.x < PADDED.min.x + 0.9 || p.x > PADDED.max.x - 0.9 || p.z < PADDED.min.z + 0.9 || p.z > PADDED.max.z - 0.9;
      if (nearWall && speed > 6) {
        this.busy = true;
        this.pong = { v: v3(-v.x, 0, -v.z).normalize().multiplyScalar(Math.max(speed, 10)).applyAxisAngle(v3(0, 1, 0), 0.4), hits: 0 };
        game.player.lock(true);
        game.sound.boing();
        game.toast('BOING', 'The walls are VERY bouncy.', 1200);
        return;
      }
    }

    // Straitjacket + deep end.
    if (this.jacketUndo && inBox(p, POOL) && p.y < G - 1.5) {
      this.underwaterT += h;
      if (this.underwaterT > 0.4 && this.underwaterT - h <= 0.4) (game.sound.gulp(), game.toast('blub', 'Arms: unavailable.', 1200));
      if (this.underwaterT > 2) return this.drown();
    } else this.underwaterT = 0;

    // Over the wall into the woods as a patient.
    if (job === 'Patient' && !this.escaped && p.z < WALL.z0 - 1) {
      this.escaped = true;
      game.toast('ESCAPED!', 'Free! Free in the dark, dark woods.', 2200);
      game.say('Death', 'Escaped from an asylum into a forest. Very original. Watch for bears.', 3500);
    }
    if (p.z < WALL.z0 - 1 && p.distanceTo(this.bear.pos) < 7) return this.bearAttack();

    const bad = this.access.check(game.player.position(), job, h);
    if (bad) this.trespass(bad);
  }

  onLand(e: { drop: number; launchPos: THREE.Vector3; launchState: string; landState: string }) {
    const game = this.game;
    if (!game.body || this.busy) return false;
    const fromShelf = (e.drop >= 2.5 && inBox(e.launchPos, SHELF_TOP)) || (game.time - this.shelfAt < 1.5 && inBox(game.player.position(), SHELF_FOOT));
    if (fromShelf) {
      this.busy = true;
      game.player.lock(true);
      game.sound.splat();
      game.say('Everyone in group', 'We trusted you. ...Wait, no, you trusted us. Our bad.', 2600);
      this.busy = false;
      game.kill('asylum-trustfall', { kind: 'ragdoll', vel: v3(0, 4, 0), spin: 6, bounce: 0.4 });
      return true;
    }
    if (this.friendActive && e.launchPos.y > G + 12 && e.drop >= 6) {
      this.friendActive = false;
      game.say('The Voice', 'Huh. I thought you could fly too. My bad!', 2600);
      game.sound.splat();
      game.kill('asylum-imaginary', { kind: 'ragdoll', vel: game.player.vel.clone().setY(8), spin: 12, bounce: 0.6 });
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- deaths
  private drown() {
    const game = this.game;
    this.busy = true;
    game.player.lock(true);
    game.runSeq([
      ...Array.from({ length: 8 }, (_, i) => ({ at: i * 0.15, fn: () => game.particles.burst(game.player.position().add(v3(0, 1.2, 0)), 3, 0xdff6ff, 2, { life: 0.8, size: 0.12, gravity: -4 }) })),
      { at: 1.3, fn: () => game.say('Orderly Bruce', 'Hey, is that guy floating like a burrito? ...Oh. Oh no.', 2400) },
      { at: 1.5, fn: () => ((this.busy = false), game.kill('asylum-swim', { kind: 'ragdoll', vel: v3(0, 2, 0), spin: 1, bounce: 0.1 })) },
    ]);
  }

  private bearAttack() {
    const game = this.game;
    const bear = this.bear;
    this.busy = true;
    game.player.lock(true);
    bear.stop();
    game.sound.tone({ f: 110, f2: 70, dur: 0.9, type: 'sawtooth', vol: 0.2, vibrato: 12 });
    game.shake(0.6);
    game.runSeq([
      { at: 0.1, fn: () => bear.goTo(game.player.feet(), 9) },
      ...Array.from({ length: 10 }, (_, i) => ({
        at: 0.9 + i * 0.13,
        fn: () => {
          bear.ch.punch();
          game.character?.kick(i % 2 ? 0.6 : -0.6);
          game.sound.crunch();
          game.particles.burst(game.player.position(), 4, 0x5a3a20, 5, { life: 0.5, size: 0.15 });
        },
      })),
      {
        at: 2.3,
        fn: () => {
          this.busy = false;
          const dir = game.player.feet().sub(bear.pos).setY(0).normalize();
          game.kill('asylum-bear', { kind: 'ragdoll', vel: dir.multiplyScalar(14).setY(11), spin: 12, bounce: 0.5 });
        },
      },
      { at: 3.6, fn: () => ((this.bearHead.visible = false), game.sound.blip(0.5)) },
      { at: 3.7, fn: () => game.say('The Bear', "...Don't tell Bruce. I've been out here since 2009. It's Gerald. From Ward B.", 3800) },
      { at: 9, fn: () => (this.bearHead.visible = true) },
    ]);
  }

  interact(id: string) {
    const game = this.game;
    const ch = game.character;
    const body = game.body;
    if (!ch || !body || this.busy) return;
    if (this.jacketUndo && id !== 'jacket') {
      game.toast('NO HANDS', "You're in a straitjacket. Your arms are hugging you.", 2000);
      return;
    }
    const lock = () => game.player.lock(true);

    if (id === 'jacket') {
      game.say('Orderly Bruce', 'You... want one? Sure, buddy. Arms out. Pool closes at nine.', 2800);
      this.putOnJacket(120);
      game.sound.pull();
      return;
    }

    if (id === 'chess') {
      lock();
      this.busy = true;
      const nap = this.napoleon;
      game.runSeq([
        { at: 0.2, fn: () => game.say('Napoleon', 'White moves first. I am white. I am always white.', 2400) },
        ...Array.from({ length: 6 }, (_, i) => ({ at: 1.5 + i * 0.4, fn: () => game.sound.tone({ f: 500 + i * 40, dur: 0.05, type: 'square', vol: 0.06 }) })),
        { at: 4, fn: () => game.say(body.name, 'Checkmate?', 1500) },
        { at: 5.4, fn: () => (nap.ch.kick(0.8), game.say('Napoleon', 'ZIS. MEANS. WAAAR!', 2400), game.shake(0.6)) },
        {
          at: 6.4,
          fn: () => {
            this.cannon.visible = true;
            this.cannon.lookAt(game.player.position());
            game.sound.creak();
          },
        },
        { at: 7.6, fn: () => game.say('Napoleon', 'FEU!', 1200) },
        {
          at: 8,
          fn: () => {
            game.sound.thunder();
            game.flash('#ffd080', 200);
            game.particles.burst(this.cannon.position.clone().add(v3(0, 0.6, 0)), 30, 0x888888, 6, { life: 1.2, size: 0.4, gravity: -1 });
            this.busy = false;
            const dir = game.player.feet().sub(this.cannon.position).setY(0).normalize();
            game.kill('asylum-napoleon', { kind: 'ragdoll', vel: dir.multiplyScalar(30).setY(10), spin: 18, bounce: 0.7 });
          },
        },
        { at: 12, fn: () => (this.cannon.visible = false) },
      ]);
      return;
    }

    if (id === 'pudding') {
      lock();
      this.busy = true;
      game.runSeq([
        { at: 0.2, fn: () => (game.sound.munch(), game.toast('LAST PUDDING CUP', 'Chocolate. The good one.', 1600)) },
        { at: 1.2, fn: () => game.say('Everyone', '...', 1500) },
        { at: 2.4, fn: () => game.say('Everyone', 'HE TOOK THE PUDDING.', 2000) },
        {
          at: 2.8,
          fn: () => {
            for (let i = 0; i < 8; i++) {
              const a = new Actor(this.kit.root, person('Patient', Math.floor(this.rng() * 1e9)), v3(58 + this.rng() * 14, G, 104 + this.rng() * 16), 0, 'Patient');
              this.mob.push(a);
              a.goTo(game.player.feet().add(v3(Math.cos(i) * 0.9, 0, Math.sin(i) * 0.9)), 5 + this.rng() * 2);
            }
          },
        },
        ...Array.from({ length: 14 }, (_, i) => ({
          at: 5 + i * 0.1,
          fn: () => {
            this.mob[i % this.mob.length]?.ch.punch();
            ch.kick(i % 2 ? 0.5 : -0.5);
            game.sound.noise({ dur: 0.07, vol: 0.5, freq: 700 + Math.random() * 800, type: 'bandpass', q: 2 });
            game.particles.burst(game.player.position(), 4, 0x6a3a1a, 5, { life: 0.4, size: 0.14 });
          },
        })),
        { at: 6.6, fn: () => ((this.busy = false), game.kill('asylum-pudding', { kind: 'ragdoll', vel: v3(0, 20, 0), spin: 18, bounce: 0.6 })) },
        { at: 13, fn: () => (this.mob.forEach((m) => m.dispose()), (this.mob = [])) },
      ]);
      return;
    }

    if (id === 'paint') {
      const [name, color] = PAINTS[this.paints];
      this.paints++;
      game.sound.munch();
      ch.tint(color, 0.35);
      if (this.paints < PAINTS.length) {
        game.toast(`ATE THE ${name.toUpperCase()}`, pick(this.rng, ['Tastes like crayons. Expensive crayons.', 'Non-toxic, says the label. Liar.', 'Bit chalky.']), 1600);
        return;
      }
      lock();
      this.busy = true;
      game.runSeq([
        ...Array.from({ length: 24 }, (_, i) => ({
          at: 0.3 + i * 0.08,
          fn: () => {
            ch.tint(rainbow(i), 0.7);
            game.particles.burst(game.player.position(), 3, rainbow(i), 4, { life: 0.5, size: 0.12 });
          },
        })),
        { at: 2.4, fn: () => game.say('Art Teacher', 'Oh, honey. Those were the REAL ones.', 2000) },
        { at: 2.6, fn: () => ((this.busy = false), game.kill('asylum-paint', { kind: 'ragdoll', vel: v3(0, 5, 0), spin: 6, bounce: 0.3 })) },
      ]);
      return;
    }

    if (id === 'medcart') {
      const need = body.mental === 'Medicated' ? 8 : body.mental === 'Depressed' ? 3 : 5;
      this.cups++;
      game.sound.gulp();
      game.setHueShift(this.cups * 25);
      ch.kick(0.3);
      if (this.cups < need) {
        game.toast(`CUP ${this.cups}`, body.mental === 'Medicated' && this.cups < 4 ? 'This body barely notices. It has a tolerance.' : 'The room is getting kind of wobbly.', 1600);
        setTimeout(() => game.setHueShift(0), 800);
        return;
      }
      lock();
      this.busy = true;
      game.runSeq([
        ...Array.from({ length: 20 }, (_, i) => ({ at: 0.2 + i * 0.08, fn: () => (game.setHueShift(i * 18), (ch.spinner.rotation.z = Math.sin(i * 0.7) * 0.5)) })),
        { at: 2, fn: () => (game.setHueShift(0), (ch.spinner.rotation.z = 0)) },
        { at: 2.1, fn: () => ((this.busy = false), game.kill('asylum-medcart', { kind: 'ragdoll', vel: v3(0, 2, 2), spin: 3, bounce: 0.2 })) },
      ]);
      return;
    }

    if (id === 'ect') {
      lock();
      this.busy = true;
      game.player.teleport(v3(130.5, F2 + 1, 110.2), Math.PI);
      lock();
      game.runSeq([
        { at: 0.3, fn: () => game.toast('THE DIAL', '1... 4... 7... 10...', 1400) },
        { at: 1.6, fn: () => game.toast('ELEVEN', "It doesn't go to eleven. You made it go to eleven.", 1600) },
        { at: 2, fn: () => game.sound.zap(2.2) },
        ...Array.from({ length: 22 }, (_, i) => ({
          at: 2 + i * 0.08,
          fn: () => {
            ch.flash(i % 2 === 0);
            ch.kick(i % 2 ? 0.6 : -0.6);
            ch.parts.head.pivot.scale.setScalar(1 + i * 0.02);
            game.flash(i % 2 ? '#ffffff' : '#9ad8ff', 60);
            game.particles.burst(game.player.position(), 3, 0x9ad8ff, 6, { life: 0.3, size: 0.1, gravity: 0 });
          },
        })),
        { at: 3.9, fn: () => (ch.flash(false), ch.tint(0x111111, 0.75)) },
        { at: 4, fn: () => ((this.busy = false), game.kill('asylum-ect', { kind: 'ragdoll', vel: v3(0, 10, 4), spin: 10, bounce: 0.4 })) },
      ]);
      return;
    }

    if (id === 'lobotomy') {
      lock();
      this.busy = true;
      const nap = this.napoleon;
      const home = nap.pos.clone();
      game.runSeq([
        { at: 0.2, fn: () => game.toast('LOBOTOMY KIT, 1952', 'One ice pick. One mallet. One very old instruction card.', 2400) },
        { at: 2, fn: () => game.say(body.name, 'Step one: insert pick above the eye. Easy enough.', 2200) },
        {
          at: 3.4,
          fn: () => {
            nap.place(game.player.feet().add(v3(1.2, 0, 0)));
            nap.lookAt(game.player.feet());
            game.say('Napoleon', 'STOP! I was a surgeon in ze army. Allow me.', 2400);
          },
        },
        ...Array.from({ length: 3 }, (_, i) => ({ at: 5.6 + i * 0.4, fn: () => (nap.ch.punch(), game.sound.tone({ f: 900, dur: 0.06, type: 'square', vol: 0.12 }), ch.kick(0.4)) })),
        { at: 7, fn: () => (ch.parts.head.pivot.scale.set(1.3, 0.7, 1.3), game.toast('...', 'Duhhh.', 1200)) },
        { at: 8.2, fn: () => ((this.busy = false), game.kill('asylum-lobotomy', { kind: 'ragdoll', vel: v3(0, 4, 0), spin: 5, bounce: 0.3 })) },
        { at: 11, fn: () => nap.place(home, -Math.PI / 2) },
      ]);
      return;
    }

    if (id === 'friend') {
      this.friendActive = true;
      this.hatch.setOpen(true);
      game.sound.ghost();
      game.say('The Voice', "Psst. Hey. Only YOU can hear me. I unlocked the roof. Come up! Upstairs, north hall. It's fun up here.", 4500);
      const f = this.friend;
      const from = f.position.clone();
      const to = v3(96.5, G + 14.5, 96.2);
      game.runSeq(Array.from({ length: 40 }, (_, i) => ({ at: 1 + i * 0.05, fn: () => f.position.lerpVectors(from, to, (i + 1) / 40) })));
      return;
    }
  }

  dispose() {
    for (const a of [...this.actors, ...this.mob]) a.dispose();
    this.kit.dispose();
  }
}

export const asylum: MapDef = {
  id: 'asylum',
  name: 'Pinecrest Asylum',
  size: { x: SX, y: SY, z: SZ },
  sky: { top: 0x5a6a88, bottom: 0xd0d8e0, fogNear: 70, fogFar: 230 },
  deaths: ASYLUM_DEATHS,
  build(world: VoxelWorld, rng: Rng): MapBuild {
    buildAsylum(world, rng);
    return {
      spawn: v3(96, G + 6, 140),
      groundAt: groundFloor(world),
      life: asylumLife(world),
      areas: {
        courtyard: box(81, G, 97, 111, G, 123),
        rec: box(52, G, 126, 73, G, 148),
        cafeteria: box(52, G, 99, 73, G, 122),
        group: box(58, G, 72, 73, G, 95),
        art: box(119, G, 99, 140, G, 122),
        nurses: box(119, G, 133, 140, G, 148),
        hall: box(86, G, 72, 115, G, 90),
        lobby: box(81, G, 131, 111, G, 148),
        garden: box(34, G, 44, 157, G, 68),
        front: box(80, G, 152, 112, G, 166),
      },
      stops: [
        {
          id: 'gate',
          kind: 'bus',
          name: 'Pinecrest Gate',
          pos: v3(96.5, G, 177),
          facing: Math.PI,
          lane: { from: v3(0, G, 181.5), stop: v3(96, G, 181.5), to: v3(SX - 1, G, 181.5) },
        },
        {
          id: 'intake',
          kind: 'bus',
          name: 'Pinecrest Admissions',
          pos: v3(101.5, G, 177),
          facing: Math.PI,
          lane: { from: v3(0, G, 181.5), stop: v3(101, G, 181.5), to: v3(SX - 1, G, 181.5) },
        },
      ],
      roads: [{ points: [v3(0, G, 182.5), v3(SX - 1, G, 182.5)], width: 6 }],
      npcs: [
        { area: 'courtyard', job: 'Patient', count: 6 },
        { area: 'courtyard', job: 'Orderly', count: 1 },
        { area: 'rec', job: 'Patient', count: 3 },
        { area: 'cafeteria', job: 'Patient', count: 3 },
        { area: 'group', job: 'Patient', count: 3 },
        { area: 'art', job: 'Patient', count: 2 },
        { area: 'nurses', job: 'Nurse', count: 2 },
        { area: 'hall', job: 'Psychiatrist', count: 1 },
        { area: 'hall', job: 'Orderly', count: 2 },
        { area: 'lobby', job: 'Visitor', count: 2 },
        { area: 'lobby', job: 'Orderly', count: 1 },
        { area: 'garden', job: 'Patient', count: 2 },
        { area: 'front', job: 'Visitor', count: 1 },
      ],
      setup: (ctx) => new AsylumRuntime(ctx),
    };
  },
};
