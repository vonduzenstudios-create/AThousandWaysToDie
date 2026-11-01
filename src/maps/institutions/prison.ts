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
  siren,
  slab,
  stairs,
  takePendingIntake,
  person,
  v3,
  walls,
  whistle,
  windows,
  type AccessZone,
  type InstitutionApi,
  type Gate,
} from './common';
import { prisonLife } from './life';

/**
 * Blackrock Penitentiary. A walled prison with a public lobby and visiting room, a two-tier cell
 * block, the yard with Big Tony's weight pile, an electric fence and a guard tower, the cafeteria,
 * laundry, showers, death row and solitary.
 *
 * Who can go where:
 *  - Anyone: outside, the lobby, the visitor side of the visiting room.
 *  - Inmates and staff: everything inside the walls.
 *  - Guards and the Warden only: intake, the Warden's office, the no-man's land and tower, death row, solitary.
 * Visitors who wander in get walked back out twice. The third time they get booked.
 * Inmates who wander into staff areas go to solitary. The third time the guards get creative.
 */

const STAFF = ['Prison Guard', 'Warden'];
const isStaff = (job: string) => STAFF.includes(job);

export const PRISON_DEATHS: DeathDef[] = [
  { id: 'prison-slop', name: 'Mystery Slop', category: 'Food & Drink', location: 'Blackrock Cafeteria', payout: 1800, blurb: 'Ate the slop. Then went back for seconds. Nobody goes back for seconds.' },
  { id: 'prison-press', name: 'Permanent Press', category: 'Machines', location: 'Blackrock Laundry', payout: 2600, blurb: 'Climbed into the industrial laundry press. Came out a neatly folded shirt.' },
  { id: 'prison-dumbbell', name: "Big Tony's Dumbbell", category: 'Stupidity', location: 'Blackrock Yard', payout: 2400, blurb: 'Took Big Tony\'s dumbbell. Big Tony took it back. Hard.' },
  { id: 'prison-bench', name: 'Out-Benched', category: 'Sports', location: 'Blackrock Yard', payout: 1500, blurb: "Challenged Big Tony to a bench-off in a body that can't lift a fork." },
  { id: 'prison-fence', name: 'Hair-Raising Escape', category: 'Electricity', location: 'Blackrock Yard', payout: 2800, blurb: 'Climbed the electric fence during yard time. Afro hair, smoking shoes.' },
  { id: 'prison-soap', name: 'Drop the Soap', category: 'Gravity', location: 'Blackrock Showers', payout: 2000, blurb: 'Slipped on the soap and curled across the whole shower block into the wall.' },
  { id: 'prison-snitch', name: 'Snitches Get Stitches', category: 'Stupidity', location: 'Blackrock Cell Block A', payout: 3000, blurb: 'Snitched on Cell 4, loudly. The toothbrush still had toothpaste on it.' },
  { id: 'prison-riot', name: 'Riot Act', category: 'Stupidity', location: 'Blackrock Cafeteria', payout: 4000, blurb: 'Threw a tray at the Warden mid-speech. The whole cafeteria joined in.' },
  { id: 'prison-tattoo', name: 'MOMM', category: 'Stupidity', location: 'Blackrock Cell Block A', payout: 1700, blurb: 'Got a guitar-string tattoo that says MOMM. The infection spelled it right.' },
  { id: 'prison-tunnel', name: 'Spoon Tunnel Cave-In', category: 'Crushing', location: 'Under Blackrock', payout: 3200, blurb: 'Dug for 40 days with a spoon, then tapped the ceiling to see if it was solid.' },
  { id: 'prison-escape', name: 'Spotlighted', category: 'Stupidity', location: 'Outside Blackrock', payout: 3500, blurb: 'Tunneled out after 40 days and popped up right under the spotlight.' },
  { id: 'prison-solitary', name: 'The Wall Talks Back', category: 'Stupidity', location: 'Blackrock Solitary', payout: 2200, blurb: 'Talked to the solitary wall until it answered. It was not encouraging.' },
  { id: 'prison-tower', name: 'Wrong Uniform', category: 'Stupidity', location: 'Blackrock Guard Tower', payout: 3800, blurb: 'A tower guard put on an inmate jumpsuit and waved. His coworkers did their jobs.' },
  { id: 'prison-chair', name: "Took Someone's Appointment", category: 'Electricity', location: 'Blackrock Death Row', payout: 5000, blurb: "Sat in the chair on death row. Nobody checked the paperwork." },
  { id: 'prison-shakedown', name: 'Excessive Force', category: 'Stupidity', location: 'Blackrock Penitentiary', payout: 2000, blurb: 'Kept wandering into guard-only areas. The guards got creative.' },
];

// ------------------------------------------------------------------ layout

const SX = 192, SY = 40, SZ = 192;
/** Outer wall ring (inclusive, 2 thick). */
const WALL = { x0: 20, z0: 12, x1: 171, z1: 163, h: 10 };
/** Electric fence line between the yard and the no-man's land. */
const FENCE_Z = 26.5;
const FENCE_GATE: [number, number] = [148, 151];
/** Gary's cell after booking: west lower tier, cell 8. */
const MY_CELL = box(31, G - 0.5, 107, 37, G + 3, 111);
const MY_CELL_SPOT = v3(34.5, G, 109);
const SHU_CELL = box(161, G - 0.5, 123, 168, G + 4, 128);
const SHU_SPOT = v3(164.5, G, 125.5);
const LOBBY_SPOT = v3(96.5, G, 158);
const LOBBY_FACING = 0;
const SHOWERS = box(121, G - 0.5, 101, 140, G + 4, 118);

const cellZ = (k: number) => 72 + 5 * k; // first interior row of cell k (4 rows deep)

function buildPrison(w: VoxelWorld, rng: Rng) {
  ground(w, B.Grass, rng, 0.01);

  // Road, parking lot, and the walk up to the front door.
  slab(w, 0, 171, SX - 1, 176, 3, B.Asphalt);
  for (let x = 0; x < SX; x++) if (x % 6 < 3) w.set(x, 3, 173, B.Yellow);
  slab(w, 0, 169, SX - 1, 170, 3, B.Sidewalk);
  slab(w, 92, 164, 100, 168, 3, B.Sidewalk);
  slab(w, 114, 164, 160, 168, 3, B.Asphalt);
  for (let x = 116; x < 160; x += 4) slab(w, x, 164, x, 167, 3, B.White);

  // Inside the walls: gravel yard, concrete plaza and walkways.
  slab(w, WALL.x0 + 2, WALL.z0 + 2, WALL.x1 - 2, WALL.z1 - 2, 3, B.Gravel);
  slab(w, 22, 121, 169, 139, 3, B.Concrete);
  slab(w, 87, 66, 95, 139, 3, B.Concrete);
  slab(w, 100, 36, 124, 56, 3, B.Asphalt); // basketball court
  for (let x = 100; x <= 124; x++) (w.set(x, 3, 36, B.White), w.set(x, 3, 56, B.White), w.set(x, 3, 46, B.White));
  slab(w, 58, 32, 78, 46, 3, B.Concrete); // weight pile pad

  // Outer wall.
  for (let t = 0; t < 2; t++) walls(w, WALL.x0 + t, WALL.z0 + t, WALL.x1 - t, WALL.z1 - t, G, WALL.h, B.PrisonGrey);
  walls(w, WALL.x0, WALL.z0, WALL.x1, WALL.z1, G + WALL.h, 1, B.Dark);

  // ---- Admin building: lobby, visiting room, intake, Warden's office upstairs.
  walls(w, 80, 140, 112, 163, G, 12, B.PrisonGrey);
  slab(w, 81, 141, 111, 161, 3, B.AsylumLino);
  slab(w, 81, 141, 111, 161, G + 6, B.OfficeCarpet); // office floor (stand at G+7)
  slab(w, 80, 140, 112, 163, G + 12, B.Dark); // roof
  cut(w, 94, G, 162, 97, G + 3, 163); // front door through the outer wall
  w.fill(81, G, 152, 111, G + 5, 152, B.PrisonGrey); // lobby | visiting + intake
  cut(w, 86, G, 152, 87, G + 2, 152); // to the visiting room
  cut(w, 104, G, 152, 105, G + 2, 152); // sally port into intake
  w.fill(100, G, 141, 100, G + 5, 151, B.PrisonGrey); // visiting | intake
  w.fill(81, G, 146, 99, G, 146, B.Wood); // visiting counter
  w.fill(81, G + 1, 146, 99, G + 5, 146, B.Glass); // the glass
  for (let x = 84; x < 99; x += 4) w.set(x, G + 1, 146, B.PrisonGrey); // booth dividers
  cut(w, 90, G, 140, 91, G + 2, 140); // inmate side of visiting -> prison
  cut(w, 105, G, 140, 106, G + 2, 140); // intake -> prison
  stairs(w, 109, 150, 0, -1, G, 7, 3, B.Concrete); // intake up to the office
  cut(w, 109, G + 6, 145, 111, G + 6, 150);
  windows(w, 81, 163, 111, 163, G + 9, 3);
  windows(w, 81, 140, 111, 140, G + 9, 3);
  w.fill(90, G + 7, 156, 102, G + 7, 157, B.Wood); // Warden's desk
  w.fill(95, G + 7, 159, 97, G + 9, 159, B.RedPaint); // big chair

  // ---- Cell Block A: two tiers of cells on both sides, walkways, stairs, guard desk.
  walls(w, 30, 70, 86, 120, G, 12, B.PrisonGrey);
  slab(w, 31, 71, 85, 119, 3, B.CellFloor);
  slab(w, 30, 70, 86, 120, G + 12, B.Dark);
  cut(w, 48, G + 12, 76, 68, G + 12, 114); // skylight
  cut(w, 56, G, 70, 59, G + 3, 70);
  cut(w, 56, G, 120, 59, G + 3, 120);
  windows(w, 30, 71, 30, 119, G + 10, 3);
  windows(w, 86, 71, 86, 119, G + 10, 3);
  for (const east of [false, true]) {
    const X = (x: number) => (east ? 116 - x : x);
    const xs = (a: number, b: number) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))] as const;
    const [c0, c1] = xs(31, 36);
    const [k0, k1] = xs(31, 39);
    w.fill(k0, G + 4, 71, k1, G + 4, 116, B.Concrete); // lower ceiling = upper walkway
    w.fill(c0, G + 9, 71, c1, G + 9, 116, B.Concrete); // upper ceiling
    for (let k = 0; k <= 9; k++) {
      const z = 71 + 5 * k;
      w.fill(c0, G, z, c1, G + 3, z, B.PrisonGrey);
      w.fill(c0, G + 5, z, c1, G + 8, z, B.PrisonGrey);
    }
    // Railing on the walkway edge, with a gap where the stairs land.
    for (let z = 71; z <= 116; z++) if (z < 105 || z > 107) w.set(X(39), G + 5, z, B.Metal);
    const [r0, r1] = xs(37, 39);
    w.fill(r0, G + 5, 71, r1, G + 5, 71, B.Metal);
    w.fill(r0, G + 5, 116, r1, G + 5, 116, B.Metal);
    stairs(w, Math.min(X(40), X(42)), 110, 0, -1, G, 5, 3, B.Metal);
  }
  w.fill(55, G, 95, 61, G, 96, B.Wood); // guard desk
  for (const [x, z] of [[46, 80], [64, 80], [46, 88], [64, 88]]) w.fill(x, G, z, x + 4, G, z + 1, B.Metal); // steel tables

  // Gary's cell has a tunnel waiting under it (the floor is covered by a prop until it's dug).
  cut(w, 32, 3, 108, 33, 3, 109);
  cut(w, 9, 1, 108, 33, 2, 109);
  cut(w, 9, 1, 108, 12, 3, 109);
  stairs(w, 11, 108, -1, 0, 1, 3, 2, B.Dirt);

  // ---- Cafeteria.
  walls(w, 96, 72, 140, 96, G, 6, B.PrisonGrey);
  slab(w, 97, 73, 139, 95, 3, B.AsylumLino);
  slab(w, 96, 72, 140, 96, G + 6, B.Dark);
  cut(w, 134, G, 72, 137, G + 3, 72);
  cut(w, 96, G, 82, 96, G + 3, 85);
  windows(w, 97, 96, 139, 96, G + 3, 4);
  w.fill(100, G, 74, 128, G, 75, B.Metal); // serving line
  for (const z of [80, 86, 91]) for (const x of [100, 108, 116, 124]) w.fill(x, G, z, x + 4, G, z + 1, B.Wood);
  w.fill(135, G, 84, 136, G, 85, B.Wood); // Warden's podium

  // ---- Laundry.
  walls(w, 96, 100, 116, 118, G, 6, B.PrisonGrey);
  slab(w, 97, 101, 115, 117, 3, B.Concrete);
  slab(w, 96, 100, 116, 118, G + 6, B.Dark);
  cut(w, 104, G, 118, 106, G + 3, 118);
  cut(w, 96, G, 108, 96, G + 3, 110);
  w.fill(100, G, 103, 103, G, 106, B.Metal); // press bed
  for (let z = 102; z <= 115; z += 3) w.fill(113, G, z, 115, G + 1, z + 1, B.White); // washers

  // ---- Showers.
  walls(w, 120, 100, 140, 118, G, 6, B.ShowerTile);
  slab(w, 121, 101, 139, 117, 3, B.ShowerTile);
  slab(w, 120, 100, 140, 118, G + 6, B.Dark);
  cut(w, 128, G, 118, 130, G + 3, 118);
  cut(w, 120, G, 108, 120, G + 3, 110);

  // ---- Death row and the execution chamber.
  walls(w, 146, 70, 168, 118, G, 8, B.PrisonGrey);
  slab(w, 147, 71, 167, 117, 3, B.CellFloor);
  slab(w, 146, 70, 168, 118, G + 8, B.Dark);
  cut(w, 146, G, 92, 146, G + 3, 94);
  w.fill(147, G, 99, 167, G + 7, 99, B.PrisonGrey);
  cut(w, 154, G, 99, 156, G + 2, 99);
  for (const z of [71, 76, 81, 86, 91]) w.fill(162, G, z, 167, G + 3, z, B.PrisonGrey);
  w.fill(156, G, 110, 158, G, 110, B.Metal); // the chair: seat
  w.fill(156, G, 111, 158, G + 2, 111, B.Metal); // back
  w.fill(147, G, 115, 167, G + 1, 115, B.Wood); // witness bench

  // ---- Solitary (SHU).
  walls(w, 146, 122, 168, 138, G, 7, B.PrisonGrey);
  slab(w, 147, 123, 167, 137, 3, B.CellFloor);
  slab(w, 146, 122, 168, 138, G + 7, B.Dark);
  cut(w, 146, G, 129, 146, G + 3, 130);
  w.fill(160, G, 123, 160, G + 6, 137, B.PrisonGrey);
  w.fill(161, G, 128, 167, G + 6, 128, B.PrisonGrey);
  w.fill(161, G, 133, 167, G + 6, 133, B.PrisonGrey);
  for (const z of [125, 130, 135]) cut(w, 160, G, z, 160, G + 2, z + 1);

  // ---- Guard tower in the no-man's land, NE corner.
  for (const [x, z] of [[157, 15], [165, 15], [157, 23], [165, 23]]) {
    w.fill(x, G, z, x, G + 11, z, B.Metal);
    w.fill(x, G + 13, z, x, G + 15, z, B.Metal);
  }
  slab(w, 157, 15, 165, 23, G + 12, B.Plank);
  for (let x = 157; x <= 165; x++)
    for (let z = 15; z <= 23; z++) {
      const edge = x === 157 || x === 165 || z === 15 || z === 23;
      if (edge && !(x === 157 && (z === 16 || z === 17))) w.set(x, G + 13, z, B.Metal);
    }
  slab(w, 156, 14, 166, 24, G + 16, B.RoofRed);
  stairs(w, 144, 16, 1, 0, G, 13, 2, B.Metal);

  // ---- Trees outside, a spotlight pole at the west wall.
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rng() * SX), z = Math.floor(rng() * 165);
    const nearWall = x > WALL.x0 - 6 && x < WALL.x1 + 6 && z > WALL.z0 - 6;
    const nearTunnel = x < 16 && Math.abs(z - 108) < 6;
    if (!nearWall && !nearTunnel) treeAt(w, rng, x, z);
  }
  w.fill(8, G, 102, 8, G + 9, 102, B.Metal);
}

function treeAt(w: VoxelWorld, rng: Rng, x: number, z: number) {
  if (x < 3 || z < 3 || x > SX - 4 || z > SZ - 4) return;
  const h = 4 + Math.floor(rng() * 3);
  w.fill(x, G, z, x, G + h - 1, z, B.Wood);
  for (let dx = -2; dx <= 2; dx++)
    for (let dy = 0; dy <= 2; dy++)
      for (let dz = -2; dz <= 2; dz++) if (dx * dx + dz * dz + dy * dy < 6 && rng() > 0.1) w.set(x + dx, G + h + dy - 1, z + dz, B.LeavesDark);
}

// ------------------------------------------------------------------ runtime

function prisonZones(): AccessZone[] {
  return [
    { id: 'office', name: "the Warden's office", boxes: [box(81, G + 6, 141, 111, G + 12, 162)], allow: isStaff },
    { id: 'nomans', name: "the no-man's land", boxes: [box(22, G - 1, 14, 169, G + 20, 26.2)], allow: isStaff },
    { id: 'deathrow', name: 'death row', boxes: [box(146.5, G - 1, 70, 168, G + 8, 118)], allow: isStaff },
    { id: 'shu', name: 'the solitary wing', boxes: [box(146.5, G - 1, 122, 159.9, G + 8, 138)], allow: isStaff },
    { id: 'intake', name: 'intake', boxes: [box(100.5, G - 1, 140.5, 111.5, G + 5.9, 151.5)], allow: isStaff },
    {
      id: 'lobby',
      name: 'the lobby',
      boxes: [box(80.5, G - 1, 146.5, 99.5, G + 5.9, 151.5), box(80.5, G - 1, 152.5, 111.5, G + 5.9, 161.9)],
      allow: (job) => job !== 'Inmate',
    },
    {
      id: 'secure',
      name: 'the prison',
      boxes: [box(22, G - 4, 14, 169, G + 20, 139.9), box(80.5, G - 1, 140.5, 99.5, G + 5.9, 145.9)],
      allow: (job) => job === 'Inmate' || isStaff(job),
    },
  ];
}

class PrisonRuntime implements MapRuntime {
  private kit: PropKit;
  private game: GameApi;
  private rng = mulberry32(4471);
  private access = new AccessControl(prisonZones());
  private visitorStrikes = new Strikes();
  private inmateStrikes = new Strikes();
  private actors: Actor[] = [];
  private mob: Actor[] = [];
  private tony: Actor;
  private shivs: Actor;
  private inkwell: Actor;
  private warden: Actor;
  private fenceGate: Gate;
  private shuDoor: Gate;
  private tunnelCover: Gate;
  private pressHead: THREE.Mesh;
  private dumbbell: THREE.Mesh;
  private benchBar: THREE.Mesh;
  private soap: THREE.Mesh;
  private spot: THREE.Mesh;
  private lastBody: unknown = null;
  private slops = 0;
  private wallTalks = 0;
  private solitaryT = 0;
  private dug = false;
  private busy = false;
  private speechT = 6;
  private fenceWarnT = 0;
  readonly interactables;

  constructor(private ctx: MapContext) {
    this.game = ctx.game;
    const kit = (this.kit = new PropKit(ctx));
    this.interactables = kit.interactables;
    const rng = this.rng;

    // Cell bars on both tiers and both sides. Lower and upper tiers, 9 cells each.
    for (const fixed of [37, 80])
      for (const y0 of [G, G + 5]) {
        const doors: [number, number][] = [];
        for (let k = 0; k < 9; k++) doors.push([cellZ(k) + 1.3, cellZ(k) + 2.7]);
        kit.bars('z', fixed, 71, 116, y0, 4, doors);
      }
    for (let k = 0; k < 9; k++) {
      kit.sign([`${k + 1}`], v3(37.06, G + 3.4, cellZ(k) + 2), Math.PI / 2, '#2a2e36', '#f2c230', 0.6, 0.5);
      kit.sign([`${k + 10}`], v3(79.94, G + 3.4, cellZ(k) + 2), -Math.PI / 2, '#2a2e36', '#f2c230', 0.6, 0.5);
    }
    // Death row bars (locked) and the visiting room phones.
    kit.bars('z', 162, 71, 91, G, 4);
    for (let x = 82; x < 99; x += 4) {
      kit.box([0.2, 0.5, 0.15], v3(x + 0.5, G + 1.6, 146.6), 0x1a1a1a);
      kit.box([0.2, 0.5, 0.15], v3(x + 0.5, G + 1.6, 145.4), 0x1a1a1a);
    }

    // Electric fence: posts, glowing wires, one collider with a guard gate.
    const wireMat = kit.mat(0xc8d0d8, { emissive: 0x334455 });
    for (let x = 22; x <= 169; x += 4) kit.box([0.25, 5, 0.25], v3(x + 0.5, G + 2.5, FENCE_Z), 0x5a5f68);
    for (let i = 0; i < 6; i++) kit.box([147, 0.06, 0.06], v3(22 + 147 / 2, G + 0.6 + i * 0.85, FENCE_Z), wireMat);
    kit.solid(v3(22, G, FENCE_Z - 0.1), v3(FENCE_GATE[0], G + 5, FENCE_Z + 0.1));
    kit.solid(v3(FENCE_GATE[1], G, FENCE_Z - 0.1), v3(169, G + 5, FENCE_Z + 0.1));
    this.fenceGate = kit.gate(v3(FENCE_GATE[0], G, FENCE_Z - 0.1), v3(FENCE_GATE[1], G + 4, FENCE_Z + 0.1), { barred: true });
    kit.sign(['DANGER', '10,000 VOLTS. NO CLIMBING.'], v3(60, G + 3.5, FENCE_Z + 0.2), 0, '#f2c230', '#1a1a1a', 4, 1.4);
    kit.sign(['STAFF ONLY'], v3(149.5, G + 4.6, FENCE_Z + 0.2), 0, '#b02a2a', '#ffffff', 2.4, 0.7);

    // Doors and gates.
    this.shuDoor = kit.gate(v3(159.9, G, 125), v3(160.6, G + 3, 127), { color: 0x3a3c42 });
    kit.gate(v3(159.9, G, 130), v3(160.6, G + 3, 132), { color: 0x3a3c42 });
    kit.gate(v3(159.9, G, 135), v3(160.6, G + 3, 137), { color: 0x3a3c42 });
    this.tunnelCover = kit.gate(v3(32, G - 1, 108), v3(34, G, 110), { color: 0x5d6168 });
    kit.box([0.05, 1.4, 1.0], v3(31.03, G + 1.6, 109), kit.mat(0xe0a0c0)); // the poster (hides nothing, honest)

    // Signs.
    kit.sign(['BLACKROCK PENITENTIARY', 'VISITORS WELCOME. MOSTLY.'], v3(96, G + 7, 164.05), 0, '#2a2e36', '#f2c230', 14, 2.6);
    kit.sign(['VISITING ROOM'], v3(86.5, G + 3.6, 152.55), 0, '#2a2e36', '#ffffff', 3, 0.7);
    kit.sign(['NO ENTRY', 'INMATES AND STAFF ONLY'], v3(104.5, G + 3.6, 152.55), 0, '#b02a2a', '#ffffff', 3.4, 1);
    kit.sign(['CELL BLOCK A'], v3(57.5, G + 5.5, 120.6), 0, '#2a2e36', '#ffffff', 5, 1);
    kit.sign(['CAFETERIA'], v3(95.4, G + 4.6, 83.5), -Math.PI / 2, '#2a2e36', '#ffffff', 4, 1);
    kit.sign(['LAUNDRY'], v3(105, G + 4.6, 118.6), 0, '#2a2e36', '#ffffff', 3, 0.8);
    kit.sign(['SHOWERS'], v3(129, G + 4.6, 118.6), 0, '#2a2e36', '#ffffff', 3, 0.8);
    kit.sign(['DEATH ROW', 'AUTHORIZED STAFF ONLY'], v3(145.4, G + 5, 93), -Math.PI / 2, '#b02a2a', '#ffffff', 4, 1.2);
    kit.sign(['SOLITARY'], v3(145.4, G + 4.6, 129.5), -Math.PI / 2, '#2a2e36', '#ffffff', 3, 0.8);
    kit.sign(['DAYS WITHOUT A RIOT: 0'], v3(118, G + 4.5, 72.6), 0, '#ffffff', '#b02a2a', 6, 0.8);

    // Bus shelter.
    kit.block(v3(90, G, 168.6), v3(92, G + 3, 168.9), 0x6a7480);
    kit.box([4, 0.2, 2], v3(91, G + 3.1, 168), 0x3b5fa8);
    kit.sign(['BUS', 'VISITOR SHUTTLE'], v3(89.9, G + 2.4, 168), -Math.PI / 2, '#3b5fa8', '#ffffff', 1.6, 1.0);

    // Shower heads, the soap, the press head, the slop pot, the electric chair straps.
    for (let x = 123; x <= 137; x += 3) kit.box([0.3, 0.3, 0.5], v3(x + 0.5, G + 3.2, 101.3), 0x9aa3ad);
    this.soap = kit.box([0.35, 0.18, 0.22], v3(130.5, G + 0.09, 108.5), kit.mat(0xf6f0ff, { emissive: 0x222233 }));
    this.pressHead = kit.box([4.2, 1, 4.2], v3(102, G + 5, 105), 0x9aa3ad);
    kit.box([0.3, 4, 0.3], v3(99.7, G + 3, 102.7), 0x5a5f68);
    kit.box([0.3, 4, 0.3], v3(104.3, G + 3, 107.3), 0x5a5f68);
    const pot = kit.box([1.2, 0.8, 1.2], v3(110.5, G + 1.4, 74.6), 0x7a7f86);
    kit.box([1.0, 0.1, 1.0], v3(110.5, G + 1.81, 74.6), kit.mat(0x8a9a3a, { emissive: 0x1a2a00 })).userData.slop = pot;
    kit.box([0.15, 0.6, 1.6], v3(157.5, G + 1.7, 110.4), 0x2a1a10);
    kit.box([1.4, 0.4, 0.4], v3(157.5, G + 3.3, 110.6), 0x5a5f68); // the helmet

    // Weight pile.
    kit.block(v3(63, G, 37), v3(66, G + 0.6, 38.4), 0x3a2a20);
    this.benchBar = kit.box([2.6, 0.12, 0.12], v3(64.5, G + 1.7, 37.7), 0x8a8f96);
    for (const dx of [-1.15, 1.15]) {
      const plate = kit.box([0.15, 0.7, 0.7], v3(dx, 0, 0), 0x1a1a1a, this.benchBar);
      plate.castShadow = true;
    }
    kit.block(v3(70.6, G, 35.6), v3(73.4, G + 0.8, 36.4), 0x5a5f68);
    this.dumbbell = kit.box([0.9, 0.18, 0.18], v3(72, G + 1.0, 36), 0x8a8f96);
    for (const dx of [-0.4, 0.4]) kit.box([0.12, 0.42, 0.42], v3(dx, 0, 0), 0x1a1a1a, this.dumbbell);

    // Spotlight on the west pole (aimed at the tunnel exit).
    this.spot = new THREE.Mesh(
      new THREE.ConeGeometry(3.5, 10, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.spot.position.set(9.5, G + 5, 106);
    kit.root.add(this.spot);
    kit.box([1, 0.8, 1], v3(8.5, G + 10, 102.5), 0x2a2a2a);

    // Scripted people.
    const root = kit.root;
    this.tony = new Actor(root, person('Inmate', 101, { build: 'buff', stature: 'tall', hairStyle: 'bald', facial: 'beard', skin: 0x9c6640, brows: 'angry', held: 'none' }), v3(68.5, G, 40), Math.PI, 'Big Tony');
    this.tony.ch.root.scale.multiplyScalar(1.3);
    this.shivs = new Actor(root, person('Inmate', 102, { build: 'slim', hairStyle: 'buzz', eyes: 'angry', held: 'toothbrush', marks: ['scar'] }), v3(33.5, G, cellZ(4) + 2), Math.PI / 2, 'Shivs');
    this.inkwell = new Actor(root, person('Inmate', 103, { glasses: 'round', hairStyle: 'long', marks: ['scar'], held: 'none' }), v3(83.5, G, cellZ(2) + 2), -Math.PI / 2, 'Inkwell');
    this.warden = new Actor(root, person('Warden', 104, { age: 'elder', mouth: 'frown' }), v3(137.6, G, 84.9), -Math.PI / 2, 'Warden Pruitt');
    this.warden.bob = 1; // on the podium
    this.actors.push(this.tony, this.shivs, this.inkwell, this.warden);

    // Things to press E on.
    kit.interact('slop', v3(110.5, G, 76.6), 'Get a tray of slop', 1.6);
    kit.interact('tray', v3(130, G, 84.5), 'Throw your tray at the Warden', 4);
    kit.interact('press', v3(101.5, G, 108), 'Climb into the laundry press', 1.8);
    kit.interact('soap', v3(130.5, G, 108.5), 'Drop the soap', 1.6);
    kit.interact('dumbbell', v3(72, G, 37.6), "Take Big Tony's dumbbell", 1.6);
    kit.interact('bench', v3(64.5, G, 39.4), "Bench press Big Tony's bar", 1.6);
    kit.interact('snitch', v3(58, G, 97.6), 'Snitch on Cell 4 (loudly)', 2);
    kit.interact('tattoo', v3(81.2, G, cellZ(2) + 2), 'Get a prison tattoo from Inkwell', 1.6);
    kit.interact('dig', v3(33, G, 109), 'Dig an escape tunnel with a spoon', 1.8);
    kit.interact('ceiling', v3(22, 1, 109), 'Tap the tunnel ceiling to check it', 2.2);
    kit.interact('wall', v3(166.5, G, 125.5), 'Talk to the wall', 2.2);
    kit.interact('chair', v3(157.5, G, 108.6), "Sit in the chair (take someone's appointment)", 1.8);
    kit.interact('tower', v3(161, G + 13, 19), 'Put on the spare inmate jumpsuit and wave', 3.5);
  }

  // ---------------------------------------------------------------- helpers
  private get job() {
    return this.game.body?.job ?? '';
  }

  private refreshHud() {
    (this.game as InstitutionApi).refreshHud?.();
  }

  private toLobby() {
    const p = this.game.player;
    p.lock(true);
    this.game.runSeq([
      {
        at: 0.6,
        fn: () => {
          p.lock(false);
          p.teleport(LOBBY_SPOT, LOBBY_FACING);
          p.knock(v3(0, 6, 8));
          this.game.sound.whoosh();
          this.access.reset();
        },
      },
    ]);
  }

  /** Book the current body as an inmate and drop them in their cell. */
  private book(charge: string) {
    const game = this.game;
    const body = game.body;
    const ch = game.character;
    if (!body || !ch) return;
    this.busy = true;
    game.player.lock(true);
    game.runSeq([
      { at: 0.2, fn: () => (game.flash('#ffffff', 300), game.sound.stamp()) },
      { at: 0.6, fn: () => (game.flash('#ffffff', 300), game.sound.stamp()) },
      {
        at: 1.0,
        fn: () => {
          body.job = 'Inmate';
          dress(ch, 'Inmate');
          this.refreshHud();
          game.toast('BOOKED', `Charge: ${charge}. Inmate #${4000 + Math.floor(this.rng() * 5999)}.`, 3000);
        },
      },
      {
        at: 2.4,
        fn: () => {
          game.player.teleport(MY_CELL_SPOT, Math.PI / 2);
          game.player.lock(false);
          this.access.reset();
          this.access.pass = 2;
          this.busy = false;
          game.say('Death', "Cell 8. Welcome to Blackrock. Lots of ways to go in here. Read the room.", 4500);
        },
      },
    ]);
  }

  private toSolitary(reason: string) {
    const game = this.game;
    this.busy = true;
    game.player.lock(true);
    whistle(game);
    game.say('Guard', reason, 2600);
    game.runSeq([
      { at: 0.5, fn: () => (game.shake(0.5), game.sound.slam(), game.character?.kick(0.7)) },
      {
        at: 1.6,
        fn: () => {
          this.shuDoor.setOpen(false);
          game.player.teleport(SHU_SPOT, -Math.PI / 2);
          game.player.lock(false);
          game.sound.slam();
          this.access.reset();
          this.solitaryT = 45;
          this.wallTalks = 0;
          this.busy = false;
          game.toast('SOLITARY', `45 seconds in the hole. Strike ${this.inmateStrikes.n} of 3.`, 2800);
        },
      },
    ]);
  }

  private shakedown() {
    const game = this.game;
    const ch = game.character;
    if (!ch) return;
    this.busy = true;
    game.player.lock(true);
    whistle(game);
    game.say('Guard', 'Third time? Oh, buddy. Get the batons.', 2500);
    game.runSeq([
      ...Array.from({ length: 14 }, (_, i) => ({
        at: 0.4 + i * 0.12,
        fn: () => {
          game.sound.noise({ dur: 0.08, vol: 0.6, freq: 700 + Math.random() * 600, type: 'bandpass', q: 2 });
          ch.kick(i % 2 ? 0.6 : -0.4);
          ch.tint(0x6a3a7a, i / 22);
          game.shake(0.3);
          game.particles.burst(game.player.position().add(v3(0, 0.6, 0)), 4, 0xffffff, 4, { life: 0.3, size: 0.12, gravity: 0 });
        },
      })),
      { at: 2.2, fn: () => game.kill('prison-shakedown', { kind: 'ragdoll', vel: v3(0, 9, 7), spin: 10, bounce: 0.4 }) },
    ]);
  }

  private trespass(z: AccessZone) {
    const job = this.job;
    const game = this.game;
    if (job === 'Inmate') {
      const n = this.inmateStrikes.hit();
      if (n >= 3) return this.shakedown();
      return this.toSolitary(z.id === 'lobby' || z.id === 'intake' ? 'Nice try. The exit is for people who pay taxes.' : `Inmates don't go in ${z.name}. Hands where I can see them!`);
    }
    // Visitors and anyone else.
    const n = this.visitorStrikes.hit();
    if (n < 3) {
      game.say('Guard', n === 1 ? 'Whoa, whoa. Visitors stay in the lobby, sir.' : 'I said the LOBBY. Last warning.', 2600);
      game.sound.denied();
      game.toast('ESCORTED OUT', `Only inmates and staff past the lobby. (${n}/3)`, 2200);
      this.toLobby();
      return;
    }
    game.say('Guard', 'You want in that bad? Fine. Welcome to Blackrock.', 3000);
    this.book('Trespassing, three times, on purpose');
  }

  // ---------------------------------------------------------------- per-frame
  update(dt: number) {
    const game = this.game;
    for (const a of this.actors) a.update(dt);
    for (const a of this.mob) a.update(dt);

    // New body: forget strikes and counters.
    if (game.body !== this.lastBody) {
      this.lastBody = game.body;
      this.visitorStrikes.reset();
      this.inmateStrikes.reset();
      this.slops = 0;
      this.wallTalks = 0;
      this.access.reset();
    }

    // Arrived in the back of a paddy wagon.
    if (game.body && !this.busy) {
      const intake = takePendingIntake('arrest');
      if (intake) this.book(intake.reason);
    }

    const job = this.job;
    this.fenceGate.setOpen(isStaff(job));
    const it = (id: string) => this.interactables.find((i) => i.id === id)!;
    const p = game.player.feet();
    it('dig').enabled = !this.dug && inBox(p, MY_CELL);
    it('ceiling').enabled = this.dug;
    it('wall').enabled = inBox(p, SHU_CELL);
    it('tray').enabled = job === 'Inmate';
    it('tower').enabled = job === 'Prison Guard';

    if (this.solitaryT > 0 && game.body) {
      this.solitaryT -= dt;
      if (this.solitaryT <= 0) {
        this.shuDoor.setOpen(true);
        this.access.pass = 25;
        game.sound.creak();
        game.toast('RELEASED', 'Back to general population. Walk, don\'t run.', 2200);
      }
    }

    // The Warden gives speeches to an empty room.
    this.speechT -= dt;
    if (this.speechT <= 0) {
      this.speechT = 18 + this.rng() * 10;
      const near = game.body && game.player.feet().distanceTo(this.warden.pos) < 26;
      if (near)
        game.say(
          'Warden Pruitt',
          pick(this.rng, [
            'Blackrock is a family. A family with very high walls.',
            'Rehabilitation starts with the soul. And ends with the laundry.',
            'Somebody keeps stealing the pudding. I will find you.',
            'Remember: the fence is electric. That is not a metaphor.',
          ]),
          3800,
        );
    }

    this.soap.rotation.y += dt * 0.5;
    this.spot.rotation.z = Math.sin(game.time * 0.6) * 0.3;
    this.spot.rotation.x = 0.4;
  }

  checkHazards(h: number) {
    const game = this.game;
    if (!game.body || this.busy || game.player.state === 'locked') return;
    const p = game.player.feet();
    const job = this.job;

    // Electric fence: anyone who touches it outside the gate.
    const onGate = this.fenceGate.open && p.x > FENCE_GATE[0] - 0.2 && p.x < FENCE_GATE[1] + 0.2;
    if (Math.abs(p.z - FENCE_Z) < 0.9 && p.x > 22 && p.x < 169 && p.y < G + 6 && !onGate) return this.fenceZap();
    this.fenceWarnT -= h;
    if (Math.abs(p.z - FENCE_Z) < 4 && p.x > 22 && p.x < 169 && !isStaff(job) && this.fenceWarnT <= 0) {
      this.fenceWarnT = 8;
      game.say('Tower Loudspeaker', 'STEP AWAY FROM THE FENCE.', 2200);
      game.sound.tone({ f: 300, dur: 0.3, type: 'square', vol: 0.05 });
    }

    // Out past the walls as an inmate: escape attempt.
    const outside = p.x < WALL.x0 - 0.5 || p.x > WALL.x1 + 1.5 || p.z < WALL.z0 - 0.5 || p.z > WALL.z1 + 1.5;
    if (job === 'Inmate' && outside && p.y > G - 0.6) return this.escape();

    const bad = this.access.check(game.player.position(), job, h);
    if (bad) this.trespass(bad);
  }

  // ---------------------------------------------------------------- deaths
  private fenceZap() {
    const game = this.game;
    const ch = game.character!;
    this.busy = true;
    game.player.lock(true);
    game.sound.zap(1.5);
    const head = ch.parts.head.pivot;
    game.runSeq([
      ...Array.from({ length: 16 }, (_, i) => ({
        at: i * 0.08,
        fn: () => {
          ch.flash(i % 2 === 0);
          game.flash(i % 2 ? '#ffffff' : '#9ad8ff', 70);
          head.scale.set(1 + i * 0.04, 1 + i * 0.07, 1 + i * 0.04);
          game.particles.burst(game.player.position(), 3, 0x9ad8ff, 6, { life: 0.3, size: 0.1, gravity: 0 });
        },
      })),
      { at: 1.3, fn: () => (ch.flash(false), ch.tint(0x111111, 0.8)) },
      { at: 1.35, fn: () => game.particles.burst(game.player.feet(), 20, 0x777777, 2, { life: 1.5, size: 0.3, gravity: -2 }) },
      {
        at: 1.4,
        fn: () => {
          const away = game.player.feet().z > FENCE_Z ? 1 : -1;
          this.busy = false;
          game.kill('prison-fence', { kind: 'ragdoll', vel: v3(0, 12, away * 9), spin: 10 });
        },
      },
    ]);
  }

  private escape() {
    const game = this.game;
    this.busy = true;
    game.player.lock(true);
    siren(game, 4);
    (this.spot.material as THREE.MeshBasicMaterial).opacity = 0.35;
    this.spot.position.copy(game.player.feet()).add(v3(0, 5, 0));
    game.flash('#fff6c0', 400);
    game.say('Tower Loudspeaker', 'FORTY DAYS. WE WATCHED YOU DIG FOR FORTY DAYS. FREEZE.', 3000);
    game.runSeq([
      ...Array.from({ length: 12 }, (_, i) => ({
        at: 1.6 + i * 0.1,
        fn: () => {
          game.sound.noise({ dur: 0.06, vol: 0.5, freq: 1500, type: 'bandpass', q: 3 });
          game.character?.kick(i % 2 ? 0.5 : -0.5);
          game.particles.burst(game.player.position(), 4, 0xd8c08a, 5, { life: 0.4, size: 0.15 });
        },
      })),
      {
        at: 3,
        fn: () => {
          this.busy = false;
          game.kill('prison-escape', { kind: 'ragdoll', vel: v3(-10, 10, 0), spin: 12 });
        },
      },
      { at: 6, fn: () => ((this.spot.material as THREE.MeshBasicMaterial).opacity = 0) },
    ]);
  }

  interact(id: string) {
    const game = this.game;
    const ch = game.character;
    const body = game.body;
    if (!ch || !body || this.busy) return;
    const job = body.job;
    const lock = () => game.player.lock(true);

    if (id === 'slop') {
      this.slops++;
      game.sound.munch();
      if (this.slops === 1) {
        game.toast('MYSTERY SLOP', "It moved. It was... fine? Nobody goes back for seconds.", 2600);
        return;
      }
      lock();
      this.busy = true;
      game.runSeq([
        { at: 0.2, fn: () => game.say('Lunch Lady', 'Seconds? Nobody has ever asked for seconds.', 2400) },
        { at: 0.6, fn: () => game.sound.gulp() },
        ...Array.from({ length: 16 }, (_, i) => ({ at: 1 + i * 0.1, fn: () => (ch.tint(0x8a9a3a, i / 16), ch.kick(i % 2 ? 0.3 : -0.3)) })),
        { at: 2.8, fn: () => ((this.busy = false), game.kill('prison-slop', { kind: 'ragdoll', vel: v3(0, 3, 0), spin: 3, bounce: 0.2 })) },
      ]);
      return;
    }

    if (id === 'tray') {
      if (job !== 'Inmate') return game.toast('NO TRAY', "Only inmates get trays. You'd need to be an inmate for this.", 2400);
      return this.riot();
    }

    if (id === 'press') {
      lock();
      this.busy = true;
      game.player.teleport(v3(101.5, G + 1, 104.5), 0);
      lock();
      game.sound.creak();
      const head = this.pressHead;
      game.runSeq([
        { at: 0.4, fn: () => game.toast('*KA-CHUNK*', 'The press is warming up. It smells like starch.', 1500) },
        ...Array.from({ length: 10 }, (_, i) => ({ at: 1 + i * 0.06, fn: () => (head.position.y = G + 5 - (i + 1) * 0.33) })),
        { at: 1.7, fn: () => (game.sound.slam(), game.shake(1), game.particles.burst(v3(101.5, G + 1.5, 104.5), 30, 0xffffff, 6, { life: 1, size: 0.25, gravity: -1 })) },
        {
          at: 1.8,
          fn: () => {
            this.busy = false;
            ch.tint(0xf07a2a, 0.3);
            game.kill('prison-press', { kind: 'pancake' });
          },
        },
        ...Array.from({ length: 10 }, (_, i) => ({ at: 4 + i * 0.1, fn: () => (head.position.y = G + 1.7 + (i + 1) * 0.33) })),
      ]);
      return;
    }

    if (id === 'soap') return this.soapSlide();

    if (id === 'dumbbell') {
      lock();
      this.busy = true;
      const hand = ch.parts.armR.mesh;
      hand.add(this.dumbbell);
      this.dumbbell.position.set(0, -0.45, 0.1);
      const tony = this.tony;
      game.runSeq([
        { at: 0.3, fn: () => (tony.lookAt(game.player.feet()), game.say('Big Tony', 'Hey. HEY. That is MY dumbbell.', 2400)) },
        { at: 1.2, fn: () => whistle(game) },
        { at: 1.4, fn: () => game.say('Guard', '*whistle* Break it up! ...Eh, never mind.', 2000) },
        { at: 1.5, fn: () => tony.goTo(game.player.feet(), 7) },
        { at: 2.3, fn: () => (tony.ch.punch(), game.sound.slam(), game.shake(1.2)) },
        {
          at: 2.4,
          fn: () => {
            this.busy = false;
            const dir = game.player.feet().sub(tony.pos).setY(0).normalize();
            game.kill('prison-dumbbell', { kind: 'ragdoll', vel: dir.multiplyScalar(22).add(v3(0, 14, 0)), spin: 14, bounce: 0.6 });
          },
        },
        {
          at: 6,
          fn: () => {
            this.kit.root.add(this.dumbbell);
            this.dumbbell.position.set(72, G + 1, 36);
            tony.goTo(v3(68.5, G, 40), 2, () => (tony.facing = Math.PI));
          },
        },
      ]);
      return;
    }

    if (id === 'bench') {
      if (body.physical !== 'Feeble') {
        game.sound.flip();
        game.say('Big Tony', pick(this.rng, ['Three reps. Cute.', 'Not bad. For a noodle.', 'You call that a bench? My grandma benches that.']), 2600);
        game.toast('BENCHED IT', 'This body is too strong to get crushed. A Feeble one might not be.', 3000);
        return;
      }
      lock();
      this.busy = true;
      game.player.teleport(v3(64.5, G + 0.6, 37.7), 0);
      lock();
      const bar = this.benchBar;
      game.runSeq([
        { at: 0.3, fn: () => game.say('Big Tony', 'Go on, old timer. I spot for nobody.', 2200) },
        { at: 1.0, fn: () => (bar.position.y = G + 2.4, game.sound.creak()) },
        { at: 1.6, fn: () => (bar.position.y = G + 2.0) },
        { at: 2.0, fn: () => (bar.position.y = G + 1.2, game.sound.crunch(), game.shake(0.6)) },
        { at: 2.2, fn: () => ((this.busy = false), game.kill('prison-bench', { kind: 'pancake' })) },
        { at: 5, fn: () => (bar.position.y = G + 1.7) },
      ]);
      return;
    }

    if (id === 'snitch') {
      if (job !== 'Inmate') return game.toast('NOTHING TO SNITCH', 'Only an inmate would know what Cell 4 is up to.', 2400);
      lock();
      this.busy = true;
      const shivs = this.shivs;
      const home = shivs.pos.clone();
      game.runSeq([
        { at: 0.2, fn: () => game.say(body.name, 'OFFICER! CELL 4 HAS A SHANK! IT WAS ME WHO TOLD YOU!', 2600) },
        { at: 2.6, fn: () => game.say('Guard', 'Thanks for the tip. I\'ll be sure to tell everyone it was you.', 2400) },
        { at: 3.2, fn: () => shivs.goTo(game.player.feet().add(v3(-1, 0, 0)), 4.5, () => shivs.lookAt(game.player.feet())) },
        { at: 4.0, fn: () => game.say('Shivs', "Brushed my teeth with it this morning. Minty.", 2000) },
        ...Array.from({ length: 8 }, (_, i) => ({
          at: 6.2 + i * 0.14,
          fn: () => {
            shivs.ch.punch();
            ch.kick(0.4);
            ch.tint(0xd02a2a, i / 14);
            game.sound.crunch();
            game.particles.burst(game.player.position(), 3, 0xffffff, 3, { life: 0.3, size: 0.08 });
          },
        })),
        { at: 7.5, fn: () => ((this.busy = false), game.kill('prison-snitch', { kind: 'ragdoll', vel: v3(4, 6, 0), spin: 6, bounce: 0.3 })) },
        { at: 11, fn: () => shivs.goTo(home, 3) },
      ]);
      return;
    }

    if (id === 'tattoo') {
      if (job !== 'Inmate') return game.toast('INMATES ONLY', "Inkwell doesn't do outside work.", 2200);
      lock();
      this.busy = true;
      game.runSeq([
        { at: 0.2, fn: () => game.say('Inkwell', 'Guitar string, a pen, and a dream. What we writing?', 2400) },
        { at: 1.8, fn: () => game.say(body.name, 'Full back piece. Says MOM.', 1800) },
        ...Array.from({ length: 12 }, (_, i) => ({ at: 2.2 + i * 0.12, fn: () => game.sound.tone({ f: 180, dur: 0.1, type: 'sawtooth', vol: 0.05, vibrato: 50 }) })),
        { at: 4, fn: () => game.toast('M O M M', 'Inkwell: "There\'s a silent M."', 2400) },
        ...Array.from({ length: 16 }, (_, i) => ({ at: 5 + i * 0.12, fn: () => (ch.tint(0x6aaa3a, i / 18), ch.kick(i % 2 ? 0.2 : -0.2)) })),
        { at: 7, fn: () => ((this.busy = false), game.kill('prison-tattoo', { kind: 'ragdoll', vel: v3(0, 4, 0), spin: 4, bounce: 0.2 })) },
      ]);
      return;
    }

    if (id === 'dig') {
      if (job !== 'Inmate') return game.toast('NOT YOUR CELL', 'Only an inmate has forty days to spare.', 2200);
      lock();
      this.busy = true;
      const days = [1, 7, 13, 22, 31, 40];
      game.runSeq([
        ...days.map((d, i) => ({
          at: 0.3 + i * 0.55,
          fn: () => {
            game.flash('#000000', 400);
            game.sound.crunch();
            game.toast(`DAY ${d}`, i === days.length - 1 ? 'The spoon is a nub. The tunnel is done.' : 'scrape scrape scrape', 600);
          },
        })),
        {
          at: 3.8,
          fn: () => {
            this.dug = true;
            this.busy = false;
            this.tunnelCover.setOpen(true);
            game.player.lock(false);
            game.say('Death', 'Forty days for a hole. Down you go. West is out.', 3500);
          },
        },
      ]);
      return;
    }

    if (id === 'ceiling') {
      lock();
      this.busy = true;
      game.runSeq([
        { at: 0.2, fn: () => (game.sound.tone({ f: 200, dur: 0.08, type: 'square', vol: 0.1 }), ch.kick(0.2)) },
        { at: 0.6, fn: () => (game.sound.tone({ f: 200, dur: 0.08, type: 'square', vol: 0.1 }), ch.kick(0.2)) },
        { at: 1.1, fn: () => game.toast('*crrrk*', 'Seems solid.', 1200) },
        { at: 1.8, fn: () => (game.sound.thunder(), game.shake(1.5), game.particles.burst(game.player.position().add(v3(0, 1, 0)), 40, 0x8a5a35, 4, { life: 1.5, size: 0.3 })) },
        { at: 2.1, fn: () => ((this.busy = false), game.kill('prison-tunnel', { kind: 'pancake' })) },
      ]);
      return;
    }

    if (id === 'wall') {
      this.wallTalks++;
      const n = this.wallTalks;
      const lines: [string, string][] = [
        [body.name, 'Hello?'],
        ['The Wall', '...yes?'],
        ['The Wall', "You know your cellmate's cousin's barber thinks you're a loser. Everybody does, actually."],
        ['The Wall', 'Have you considered... just not?'],
      ];
      if (n <= lines.length) {
        game.say(...lines[n - 1], 3200);
        game.sound.ghost();
        if (n === 3 && body.mental !== 'Depressed') {
          body.mental = 'Depressed';
          this.refreshHud();
          game.toast('MENTAL HEALTH: DEPRESSED', 'Three days in the hole will do that.', 2600);
        }
        return;
      }
      lock();
      this.busy = true;
      game.runSeq([
        { at: 0.2, fn: () => game.say('The Wall', "It's me. It's Death. I'm the wall. Hi.", 2400) },
        ...Array.from({ length: 10 }, (_, i) => ({ at: 1 + i * 0.12, fn: () => ch.tint(0x5a6a8a, i / 12) })),
        { at: 2.6, fn: () => ((this.busy = false), game.kill('prison-solitary', { kind: 'ragdoll', vel: v3(0, 1, 0), spin: 2, bounce: 0.1 })) },
      ]);
      return;
    }

    if (id === 'chair') {
      lock();
      this.busy = true;
      game.player.teleport(v3(157.5, G + 1, 110.2), Math.PI);
      lock();
      game.runSeq([
        { at: 0.4, fn: () => game.say('Warden Pruitt', "Paperwork says the 3 o'clock is... huh. Close enough.", 2600) },
        { at: 2.4, fn: () => (game.sound.zap(2), game.flash('#ffffff', 200)) },
        ...Array.from({ length: 20 }, (_, i) => ({
          at: 2.5 + i * 0.08,
          fn: () => {
            ch.flash(i % 2 === 0);
            ch.kick(i % 2 ? 0.5 : -0.5);
            game.particles.burst(game.player.position(), 3, 0x9ad8ff, 6, { life: 0.3, size: 0.1, gravity: 0 });
          },
        })),
        { at: 4.2, fn: () => (ch.flash(false), ch.tint(0x111111, 0.8)) },
        { at: 4.3, fn: () => ((this.busy = false), game.kill('prison-chair', { kind: 'ragdoll', vel: v3(0, 7, 3), spin: 6, bounce: 0.3 })) },
      ]);
      return;
    }

    if (id === 'tower') {
      lock();
      this.busy = true;
      game.runSeq([
        { at: 0.3, fn: () => (game.flash('#f07a2a', 200), dress(ch, 'Inmate')) },
        { at: 0.6, fn: () => game.say(body.name, '*waves at the yard*', 1600) },
        { at: 1.4, fn: () => (siren(game, 3), game.say('Loudspeaker', 'INMATE ON TOWER ONE! INMATE ON TOWER ONE!', 2400)) },
        { at: 2.6, fn: () => game.say(body.name, "No wait, it's me, Dave from accounting!", 1600) },
        ...Array.from({ length: 12 }, (_, i) => ({
          at: 3.4 + i * 0.1,
          fn: () => {
            game.sound.noise({ dur: 0.06, vol: 0.5, freq: 1500, type: 'bandpass', q: 3 });
            ch.kick(i % 2 ? 0.5 : -0.5);
            game.particles.burst(game.player.position(), 4, 0xd8c08a, 5, { life: 0.4, size: 0.15 });
          },
        })),
        { at: 4.7, fn: () => ((this.busy = false), game.kill('prison-tower', { kind: 'ragdoll', vel: v3(-4, 10, 14), spin: 12, bounce: 0.5 })) },
      ]);
      return;
    }
  }

  private soapSlide() {
    const game = this.game;
    const ch = game.character!;
    game.player.lock(true);
    this.busy = true;
    const p = game.player.feet();
    const f = game.player.facing;
    const dir = v3(Math.sin(f), 0, Math.cos(f));
    // Slide along the dominant facing axis to the shower wall.
    const alongX = Math.abs(dir.x) >= Math.abs(dir.z);
    const end = p.clone();
    if (alongX) end.x = dir.x > 0 ? SHOWERS.max.x - 0.6 : SHOWERS.min.x + 0.6;
    else end.z = dir.z > 0 ? SHOWERS.max.z - 0.6 : SHOWERS.min.z + 0.6;
    const start = p.clone();
    const n = 18;
    game.runSeq([
      { at: 0.1, fn: () => (this.soap.position.set(p.x + dir.x * 0.6, G + 0.09, p.z + dir.z * 0.6), game.sound.blip(0.6)) },
      { at: 0.4, fn: () => game.say(game.body!.name, 'Oops. Let me just bend down and...', 1500) },
      { at: 1.4, fn: () => (game.sound.boing(), ch.spinner.rotation.x = -1.3) },
      ...Array.from({ length: n }, (_, i) => ({
        at: 1.5 + i * 0.05,
        fn: () => {
          const t = (i + 1) / n;
          game.player.teleport(start.clone().lerp(end, t), f);
          game.player.lock(true);
          ch.spinner.rotation.y += 0.6;
          game.particles.burst(game.player.feet().add(v3(0, 0.2, 0)), 2, 0xffffff, 2, { life: 0.5, size: 0.15, gravity: 0 });
        },
      })),
      { at: 1.5 + n * 0.05, fn: () => (game.sound.splat(), game.shake(1)) },
      {
        at: 1.55 + n * 0.05,
        fn: () => {
          this.busy = false;
          ch.spinner.rotation.set(0, 0, 0);
          this.soap.position.set(130.5, G + 0.09, 108.5);
          game.kill('prison-soap', { kind: 'ragdoll', vel: dir.clone().multiplyScalar(-8).add(v3(0, 6, 0)), spin: 16, bounce: 0.7 });
        },
      },
    ]);
  }

  private riot() {
    const game = this.game;
    game.player.lock(true);
    this.busy = true;
    const tray = this.kit.box([0.8, 0.08, 0.5], game.player.position().add(v3(0, 0.5, 0)), 0x9aa3ad);
    const from = tray.position.clone();
    const to = this.warden.pos.clone().add(v3(0, 2.6, 0));
    const spawnMob = () => {
      for (let i = 0; i < 9; i++) {
        const a = new Actor(this.kit.root, person('Inmate', Math.floor(this.rng() * 1e9)), v3(100 + this.rng() * 30, G, 78 + this.rng() * 16), 0, 'Inmate');
        this.mob.push(a);
        const target = game.player.feet().add(v3(Math.cos(i) * 0.9, 0, Math.sin(i) * 0.9));
        a.goTo(target, 5 + this.rng() * 2);
      }
    };
    game.runSeq([
      ...Array.from({ length: 10 }, (_, i) => ({ at: i * 0.04, fn: () => (tray.position.lerpVectors(from, to, (i + 1) / 10), (tray.rotation.y += 0.8)) })),
      { at: 0.45, fn: () => (game.sound.slam(), this.warden.ch.kick(0.8), this.kit.root.remove(tray)) },
      { at: 0.7, fn: () => game.say('Warden Pruitt', "...Who threw that. WHO THREW THAT.", 2000) },
      { at: 2.2, fn: () => (game.say('Everyone', 'RIOT! RIOT! RIOT!', 2200), siren(game, 4), spawnMob()) },
      ...Array.from({ length: 16 }, (_, i) => ({
        at: 5 + i * 0.1,
        fn: () => {
          const m = this.mob[i % this.mob.length];
          m?.ch.punch();
          game.character?.kick(i % 2 ? 0.5 : -0.5);
          game.sound.noise({ dur: 0.07, vol: 0.5, freq: 600 + Math.random() * 800, type: 'bandpass', q: 2 });
          game.particles.burst(game.player.position().add(v3(0, 0.8, 0)), 5, 0xffffff, 6, { life: 0.4, size: 0.15 });
          game.shake(0.4);
        },
      })),
      { at: 6.8, fn: () => ((this.busy = false), game.kill('prison-riot', { kind: 'ragdoll', vel: v3(0, 26, 0), spin: 20, bounce: 0.6 })) },
      {
        at: 14,
        fn: () => {
          for (const m of this.mob) m.dispose();
          this.mob = [];
        },
      },
    ]);
  }

  dispose() {
    for (const a of [...this.actors, ...this.mob]) a.dispose();
    this.kit.dispose();
  }
}

export const prison: MapDef = {
  id: 'prison',
  name: 'Blackrock Penitentiary',
  size: { x: SX, y: SY, z: SZ },
  sky: { top: 0x4a5a78, bottom: 0xb8c4d0, fogNear: 90, fogFar: 260 },
  deaths: PRISON_DEATHS,
  build(world: VoxelWorld, rng: Rng): MapBuild {
    buildPrison(world, rng);
    return {
      spawn: v3(96, G + 6, 150),
      groundAt: groundFloor(world),
      life: prisonLife(world),
      areas: {
        yard: box(30, G, 30, 140, G, 64),
        block: box(43, G, 74, 73, G, 116),
        cafeteria: box(98, G, 77, 133, G, 94),
        laundry: box(98, G, 108, 112, G, 116),
        plaza: box(24, G, 122, 140, G, 138),
        lobby: box(82, G, 154, 110, G, 160),
        deathrow: box(148, G, 72, 160, G, 97),
        outside: box(60, G, 165, 140, G, 169),
      },
      stops: [
        {
          id: 'visitor',
          kind: 'bus',
          name: 'Blackrock Visitor Shuttle',
          pos: v3(96.5, G, 168),
          facing: Math.PI,
          lane: { from: v3(0, G, 172.5), stop: v3(96, G, 172.5), to: v3(SX - 1, G, 172.5) },
        },
        {
          id: 'intake',
          kind: 'bus',
          name: 'Blackrock Intake',
          pos: v3(101.5, G, 168),
          facing: Math.PI,
          lane: { from: v3(0, G, 172.5), stop: v3(101, G, 172.5), to: v3(SX - 1, G, 172.5) },
        },
      ],
      roads: [{ points: [v3(0, G, 173.5), v3(SX - 1, G, 173.5)], width: 6 }],
      npcs: [
        { area: 'yard', job: 'Inmate', count: 7 },
        { area: 'yard', job: 'Prison Guard', count: 2 },
        { area: 'block', job: 'Inmate', count: 4 },
        { area: 'block', job: 'Prison Guard', count: 1 },
        { area: 'cafeteria', job: 'Inmate', count: 3 },
        { area: 'cafeteria', job: 'Prison Guard', count: 1 },
        { area: 'laundry', job: 'Inmate', count: 2 },
        { area: 'plaza', job: 'Prison Guard', count: 1 },
        { area: 'plaza', job: 'Inmate', count: 2 },
        { area: 'lobby', job: 'Visitor', count: 3 },
        { area: 'lobby', job: 'Prison Guard', count: 1 },
        { area: 'deathrow', job: 'Prison Guard', count: 1 },
      ],
      setup: (ctx) => new PrisonRuntime(ctx),
    };
  },
};
