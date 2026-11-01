import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from './physics';
import type { Sound } from './audio';
import type { Character } from './character';
import type { DeathDef, PersonFile } from './deaths';
import type { Particles } from './particles';
import type { Player } from './player';
import type { Interactable } from './props';
import { G, inBox, type TownInfo } from './town';
import { B } from './voxel';

/**
 * Smallville's extra deaths: everything in the expanded town beyond the original 13.
 *
 * Shaped like the map runtime from src/maps/types.ts (interactables, interact, step, update,
 * checkHazards, onLand, dispose) so it can move into the Smallville MapDef unchanged.
 */

export type DeathStyle =
  | { kind: 'ragdoll'; vel: THREE.Vector3; spin?: number; bounce?: number }
  | { kind: 'pancake' }
  | { kind: 'cube' };

/** The slice of the game this module drives (same shape as GameApi in src/maps/types.ts). */
export interface HometownApi {
  readonly player: Player;
  readonly body: PersonFile | null;
  readonly character: Character | null;
  readonly sound: Sound;
  readonly particles: Particles;
  kill(id: string, style: DeathStyle): void;
  runSeq(steps: { at: number; fn: () => void }[]): void;
  toast(title: string, body: string, ms?: number): void;
  say(who: string, line: string, ms?: number): void;
  shake(amount: number): void;
}

export const HOMETOWN_DEATHS: DeathDef[] = [
  { id: 'silo', name: 'Grain Expectations', category: 'Stupidity', location: 'Hoffman Silo', payout: 2000, blurb: 'Jumped into a silo full of grain. The grain won.' },
  { id: 'mule', name: 'Kicked by a Mule', category: 'Creatures', location: 'Hoffman Farm', payout: 1400, blurb: 'Tickled a mule from behind with a feather. Landed two zip codes away.' },
  { id: 'bull', name: 'Bull Launch', category: 'Creatures', location: 'Hoffman Bull Pen', payout: 2600, blurb: 'Wore a red tablecloth and insulted a bull three times. Achieved low orbit.' },
  { id: 'geese', name: 'Goose Mauling', category: 'Creatures', location: 'Smallville Park', payout: 900, blurb: 'Stole bread from a goose nest. The geese have a group chat.' },
  { id: 'trampoline', name: 'Trampoline Launch', category: 'Gravity', location: 'Maple St Backyards', payout: 1000, blurb: 'Kept bouncing until the trampoline sent them somewhere else.' },
  { id: 'shallowend', name: 'Shallow End', category: 'Gravity', location: 'Tower Rd Backyard', payout: 2800, blurb: 'Long-jumped off the water tower into a 30 cm kiddie pool. Nailed it, technically.' },
  { id: 'quarry', name: 'Rock Bottom', category: 'Gravity', location: 'Smallville Quarry', payout: 1100, blurb: 'Found the bottom of the quarry the fast way.' },
  { id: 'drowned', name: 'Sleeps With the Fishes', category: 'Water', location: 'Any water in Smallville', payout: 700, blurb: 'Forgot how to swim. Also never knew.' },
  { id: 'piano', name: 'Piano Recital', category: 'Crushing', location: 'Elm Street Apartments', payout: 2200, blurb: 'Told the movers "a little to the left" and stood on the X. Final note: C flat.' },
  { id: 'dmv', name: 'Died in Line', category: 'Stupidity', location: 'Smallville DMV', payout: 800, blurb: 'Took number 9,412. They were serving number 4.' },
  { id: 'bookshelf', name: 'Overdue', category: 'Crushing', location: 'Smallville Public Library', payout: 1300, blurb: 'Climbed the shelves for a 30-year-overdue book. The shelves were also overdue.' },
  { id: 'dryer', name: 'Spin Cycle', category: 'Machines', location: 'Suds City Laundromat', payout: 1100, blurb: 'Climbed into the industrial dryer. Came out fluffy, folded and dead.' },
  { id: 'finale', name: 'Grand Finale', category: 'Fire & Explosions', location: "Uncle Boomer's Fireworks", payout: 4000, blurb: 'Lit the biggest rocket in the shop and sat on it. Beautiful, briefly.' },
  { id: 'hotdog', name: 'Hot Dog Contest', category: 'Food & Drink', location: 'Church BBQ', payout: 900, blurb: 'Ate eight hot dogs at the church BBQ. The ninth was already inside.' },
  { id: 'pump', name: 'Gas Pump Fireball', category: 'Fire & Explosions', location: 'Gas-N-Grub', payout: 3500, blurb: 'Smoked a cigar while pumping gas. Visible from the next county.' },
  { id: 'sushi', name: 'Gas Station Sushi', category: 'Food & Drink', location: 'Gas-N-Grub', payout: 700, blurb: 'Best before 2019. It was not best.' },
  { id: 'nailgun', name: 'Nail Gun Demo', category: 'Machines', location: "Handy Hank's Hardware", payout: 1600, blurb: 'Tested the nail gun on the demo display. The demo display was them.' },
  { id: 'bell', name: 'For Whom the Bell Tolls', category: 'Crushing', location: 'First Church Bell Tower', payout: 2400, blurb: 'Rang the church bell from inside it. Twelve times. It rang back.' },
  { id: 'bathtub', name: 'Bathtub Toaster', category: 'Electricity', location: '12 Maple St', payout: 2600, blurb: 'Chained three extension cords through the house to take a bath with a toaster.' },
  { id: 'forktoast', name: "Forkin' Toast", category: 'Electricity', location: '12 Maple St', payout: 600, blurb: 'Got the stuck toast out with a fork. The toast is fine.' },
  // Job perks: each of these needs a body with the right job (see JOB_SKILLS in skills.ts).
  { id: 'carlift', name: 'Oil Change', category: 'Crushing', location: "Duke's Garage", payout: 2200, blurb: 'A mechanic lay under the car and hit "down" on the lift. Now he is the oil change.' },
  { id: 'vault', name: 'Safe Deposit', category: 'Stupidity', location: 'First Bank of Smallville', payout: 2600, blurb: 'Locked himself in the vault to count it all. Ran out of air at $1.2 million.' },
  { id: 'fryer', name: 'Extra Crispy', category: 'Fire & Explosions', location: 'Smallville Diner', payout: 1800, blurb: 'Fished the spatula out of the deep fryer by hand. Then the rest of him went in after it.' },
  { id: 'pharmacy', name: 'Prescription for Everything', category: 'Food & Drink', location: 'Rx Pharmacy', payout: 2000, blurb: 'Wrote himself a prescription for one of everything. Took them all with a Mountain Dew.' },
  { id: 'mailself', name: 'Return to Sender', category: 'Machines', location: 'Post Office', payout: 2400, blurb: 'Mailed himself overnight in a crate marked FRAGILE. It was not handled as fragile.' },
  { id: 'dodgeball', name: 'Varsity Dodgeball', category: 'Sports', location: 'School Gym', payout: 1500, blurb: 'Joined gym class dodgeball. The varsity team aimed for the head. Forty-seven times.' },
  { id: 'crossingarm', name: 'Gate Crasher', category: 'Gravity', location: 'Smallville Rail Crossing', payout: 2300, blurb: "Sat on the railroad crossing arm and hit 'raise'. The arm is spring-loaded. Was." },
  { id: 'plot', name: 'Try Before You Die', category: 'Stupidity', location: 'Smallville Cemetery', payout: 1700, blurb: 'Lay down in the pre-paid plot to try it out. The gravedigger was paid by the hour.' },
  { id: 'coffin', name: 'Display Model', category: 'Stupidity', location: 'Smallville Cemetery', payout: 1900, blurb: 'Climbed into the display coffin to show a customer how roomy it is. It locks from the outside.' },
];

/**
 * Where the job-perk deaths are. The coordinates come from the buildings in town.ts
 * (Duke's Garage lift, bank vault, diner fryer, pharmacy counter, post office counter,
 * cemetery sales office); the gym, crossing and open grave reuse town spots.
 */
const PERK_AT = {
  carlift: new THREE.Vector3(324.5, G, 264),
  vault: new THREE.Vector3(336.5, G, 210.8),
  fryer: new THREE.Vector3(262.5, G, 211.6),
  pharmacy: new THREE.Vector3(303.5, G, 211.6),
  mailself: new THREE.Vector3(376, G, 166.4),
  coffin: new THREE.Vector3(300, G, 491),
};

/** Which jobs open each perk death, and what everyone else is told. */
const PERKS: Record<string, { jobs: string[]; title: string; no: string }> = {
  carlift: { jobs: ['Mechanic'], title: 'LOCKED OUT', no: "The lift controls need Duke's key. Only a Mechanic carries one." },
  vault: { jobs: ['Banker'], title: 'ACCESS DENIED', no: 'The vault wants a combination. Only a Banker would know it.' },
  fryer: { jobs: ['Diner Cook'], title: 'KITCHEN STAFF ONLY', no: 'The cook throws a ladle at you. The fryer belongs to the Diner Cook.' },
  pharmacy: { jobs: ['Dentist', 'Doctor', 'Surgeon'], title: 'PRESCRIPTION REQUIRED', no: '"And who is your doctor?" Only a Dentist or a Doctor can write the scrip.' },
  mailself: { jobs: ['Mail Carrier'], title: 'EMPLOYEES ONLY', no: 'Behind the counter is for the Mail Carrier. The clerk is very firm about it.' },
  dodgeball: { jobs: ['Teen'], title: "YOU'RE NOT A STUDENT", no: 'A grown-up wandering into a school gym ends up on a list. This needs a Teen.' },
  crossingarm: { jobs: ['Crossing Guard'], title: 'LOCKED', no: 'The crossing arm control box takes a key. The Crossing Guard has it.' },
  plot: { jobs: ['Retiree'], title: 'RESERVED', no: 'This plot is pre-paid. By a Retiree, judging by the laminated order form.' },
  coffin: { jobs: ['Insurance Salesman'], title: 'BY APPOINTMENT ONLY', no: 'The pre-need sales office. Only the Insurance Salesman has the key.' },
};

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function bullMesh() {
  const g = new THREE.Group();
  g.add(box(2.6, 1.4, 1.3, 0x3a2418, 0, 1.3, 0));
  g.add(box(0.9, 0.9, 0.9, 0x3a2418, 1.6, 1.6, 0));
  g.add(box(0.5, 0.4, 0.7, 0xc89a80, 2.1, 1.4, 0));
  g.add(box(0.15, 0.15, 1.6, 0xf2eee0, 1.6, 2.1, 0));
  for (const [x, z] of [[-1, -0.45], [-1, 0.45], [0.9, -0.45], [0.9, 0.45]]) g.add(box(0.35, 0.9, 0.35, 0x2a1810, x, 0.45, z));
  return g;
}

function muleMesh() {
  const g = new THREE.Group();
  g.add(box(2.2, 1.1, 1, 0x8a7060, 0, 1.4, 0));
  g.add(box(0.7, 1.2, 0.6, 0x8a7060, 1.2, 2.1, 0));
  g.add(box(0.8, 0.5, 0.5, 0x6a5040, 1.6, 2.5, 0));
  g.add(box(0.15, 0.6, 0.15, 0x6a5040, 1.3, 3.0, -0.15));
  g.add(box(0.15, 0.6, 0.15, 0x6a5040, 1.3, 3.0, 0.15));
  const legs = new THREE.Group();
  for (const [x, z] of [[-0.8, -0.3], [-0.8, 0.3], [0.8, -0.3], [0.8, 0.3]]) legs.add(box(0.25, 0.9, 0.25, 0x5a4030, x, 0.45, z));
  g.add(legs);
  const hind = new THREE.Group();
  hind.name = 'hind';
  hind.position.set(-0.8, 0.9, 0);
  g.add(hind);
  return g;
}

function gooseMesh() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.45, 0.4, 0xf4f2ea, 0, 0.45, 0));
  g.add(box(0.15, 0.55, 0.15, 0xf4f2ea, 0.3, 0.85, 0));
  g.add(box(0.22, 0.2, 0.2, 0xf4f2ea, 0.38, 1.12, 0));
  g.add(box(0.22, 0.08, 0.1, 0xf08a24, 0.55, 1.1, 0));
  g.add(box(0.08, 0.25, 0.08, 0xf08a24, 0, 0.12, -0.1));
  g.add(box(0.08, 0.25, 0.08, 0xf08a24, 0, 0.12, 0.1));
  return g;
}

interface Goose {
  mesh: THREE.Group;
  home: THREE.Vector3;
  speed: number;
}

/** Runtime for the expanded town's deaths and animated props. */
export class Hometown {
  readonly interactables: Interactable[] = [];
  private objects: THREE.Object3D[] = [];
  private gates: { collider: RAPIER.Collider; mesh: THREE.Mesh; open: (f: PersonFile) => boolean }[] = [];
  private fixedBody: RAPIER.RigidBody;
  // World state that survives body swaps (hand-offs).
  private cords = new Set<string>();
  // Per-body state.
  private hasCigar = false;
  private hasCape = false;
  private taunts = 0;
  private hotdogs = 0;
  private drownT = 0;
  // Animals and props.
  private bull: THREE.Group;
  private bullPos: THREE.Vector3;
  private bullTarget: THREE.Vector3;
  private bullCharge = 0;
  private mule: THREE.Group;
  private geese: Goose[] = [];
  private geeseAngry = 0;
  private piano: THREE.Group;
  private pianoState: 'hanging' | 'creaking' | 'falling' | 'down' = 'hanging';
  private pianoT = 0;
  private pianoVy = 0;
  private bell: THREE.Group;
  private bellSwing = 0;
  private crossArm: THREE.Group;
  private time = 0;

  constructor(private scene: THREE.Scene, private physics: RAPIER.World, private town: TownInfo, private api: HometownApi) {
    const s = town.spots;
    this.fixedBody = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    // ---- Farm animals.
    this.bullPos = s.bull.clone();
    this.bullTarget = s.bull.clone();
    this.bull = bullMesh();
    this.add(this.bull);
    this.mule = muleMesh();
    this.mule.position.copy(s.mule);
    this.add(this.mule);
    this.add(this.prop(box(0.3, 0.02, 0.3, 0xe0302a), s.tablecloth, 'tablecloth', 'Take a red tablecloth', 2.2));
    this.interactables.push({ id: 'mule', pos: s.mule.clone(), radius: 3.2, prompt: 'Tickle the mule with a feather', enabled: true });
    this.interactables.push({ id: 'bull', pos: s.bull.clone(), radius: 7, prompt: 'Taunt the bull', enabled: false });
    // Bull pen gate: only farmhands have the key (anyone athletic can hop the fence).
    this.gate(new THREE.Vector3(s.bullGate.x - 1.5, G + 1, s.bullGate.z), new THREE.Vector3(0.2, 1, 2), 0x8a5a35, (f) => f.job === 'Farmhand');

    // ---- Geese at the park pond.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const home = new THREE.Vector3(s.pond.x + Math.cos(a) * 19, G, s.pond.z + Math.sin(a) * 14);
      const m = gooseMesh();
      m.position.copy(home);
      this.add(m);
      this.geese.push({ mesh: m, home, speed: 10.5 + Math.random() * 2 });
    }
    const bread = new THREE.Group();
    bread.add(box(0.5, 0.3, 0.3, 0xd9a050));
    this.add(this.prop(bread, s.gooseNest, 'goosenest', 'Steal bread from the goose nest', 2.4));

    // ---- Downtown and civic deaths.
    this.interactables.push({ id: 'dmv', pos: s.dmv.clone(), radius: 2.4, prompt: 'Take a number (#9,412)', enabled: true });
    this.interactables.push({ id: 'bookshelf', pos: s.bookshelf.clone(), radius: 3, prompt: 'Climb the shelves for the overdue book', enabled: true });
    this.interactables.push({ id: 'dryer', pos: s.dryer.clone(), radius: 2.4, prompt: 'Climb into the industrial dryer', enabled: true });

    const rocket = new THREE.Group();
    rocket.add(box(0.8, 2.6, 0.8, 0xd02a2a, 0, 1.3, 0));
    rocket.add(box(0.9, 0.5, 0.9, 0xf2c230, 0, 2.8, 0));
    rocket.add(box(0.1, 0.5, 0.1, 0x333333, 0.3, 0.25, 0.45));
    this.add(this.prop(rocket, s.finale, 'finale', 'Light the Grand Finale and sit on it', 2.6));

    const dogs = new THREE.Group();
    for (let i = 0; i < 5; i++) dogs.add(box(0.5, 0.15, 0.15, 0xc0503a, (i - 2) * 0.6, 0.08, 0));
    this.add(this.prop(dogs, s.hotdogs, 'hotdog', 'Eat a hot dog', 2.4));

    this.interactables.push({ id: 'pump', pos: s.pump.clone(), radius: 2, prompt: 'Pump some gas', enabled: true });
    this.interactables.push({ id: 'pump2', pos: s.pump2.clone(), radius: 2, prompt: 'Pump some gas', enabled: true });
    this.add(this.prop(box(0.35, 0.12, 0.2, 0x7a4a2a), s.cigars, 'cigar', 'Buy a cigar ($6)', 1.8));
    this.add(this.prop(box(0.5, 0.15, 0.3, 0xf2e6c8), s.sushi, 'sushi', 'Eat the sushi (best before 2019)', 1.8));
    const gun = new THREE.Group();
    gun.add(box(0.6, 0.25, 0.18, 0xe0a020), box(0.15, 0.3, 0.15, 0x333333, -0.15, -0.2, 0));
    this.add(this.prop(gun, s.nailgun, 'nailgun', 'Test the nail gun on the demo display', 2.2));

    // ---- Piano over the apartment sidewalk.
    this.piano = new THREE.Group();
    this.piano.add(box(2.4, 1.6, 1.2, 0x141418, 0, 0.8, 0));
    this.piano.add(box(2.2, 0.15, 0.4, 0xf2f2f2, 0, 1.0, 0.75));
    for (const x of [-1, 1]) this.piano.add(box(0.2, 0.6, 0.2, 0x141418, x, -0.3, 0));
    const rope = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3, 0.06), lambert(0xd8c8a0));
    rope.position.y = 3;
    rope.name = 'rope';
    this.piano.add(rope);
    this.piano.position.copy(s.pianoHang);
    this.add(this.piano);
    this.interactables.push({ id: 'movers', pos: s.movers.clone(), radius: 3, prompt: 'Yell "a little to the left!" to the movers', enabled: true });

    // ---- Bell tower: the door is locked unless you're the pastor.
    this.bell = new THREE.Group();
    const bellBody = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 2, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xc9a227, side: THREE.DoubleSide }));
    bellBody.position.y = -1;
    this.bell.add(bellBody);
    this.bell.position.copy(s.bell).setY(s.bell.y + 3.6);
    this.add(this.bell);
    this.gate(s.bellDoor.clone().setY(G + 1.5).setZ(s.bellDoor.z + 1.5), new THREE.Vector3(1, 1.5, 0.2), 0x6e4a2b, (f) => f.job === 'Pastor');
    this.interactables.push({ id: 'bell', pos: s.bell.clone(), radius: 2.2, prompt: 'Ring the bell (from the inside)', enabled: true });

    // ---- 12 Maple St: three extension cords, the toaster and the tub.
    const cordSpots: [string, THREE.Vector3][] = [
      ['cord-garage', s.mapleGarageShelf.clone().setY(G + 1).setX(s.mapleGarageShelf.x - 1)],
      ['cord-shed', s.shedCord.clone()],
      ['cord-lights', s.christmasLights.clone()],
    ];
    for (const [id, p] of cordSpots) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 12), lambert(id === 'cord-lights' ? 0x2f9a35 : 0xe8a020));
      coil.rotation.x = Math.PI / 2;
      const g = new THREE.Group();
      g.add(coil);
      this.add(this.prop(g, p, id, id === 'cord-lights' ? "Steal the neighbor's Christmas lights" : 'Take the extension cord', 2));
    }
    const toaster = new THREE.Group();
    toaster.add(box(0.5, 0.35, 0.3, 0xc0c4ca, 0, 0.18, 0));
    toaster.add(box(0.3, 0.1, 0.05, 0xd9a050, 0, 0.4, 0));
    this.add(this.prop(toaster, s.toaster, 'toaster', 'Get the stuck toast out with a fork', 2));
    this.interactables.push({ id: 'tub', pos: s.bathtub.clone(), radius: 2.2, prompt: 'Take a nice bath with the toaster', enabled: true });

    // ---- Job perks: one death per job that only that job can reach.
    const perk = (id: string, pos: THREE.Vector3, prompt: string, radius = 2.4) => this.interactables.push({ id, pos, radius, prompt, enabled: true });
    perk('carlift', PERK_AT.carlift, 'Lie under the car and lower the lift', 3);
    perk('vault', PERK_AT.vault, 'Step into the vault and pull the door shut', 2.8);
    perk('fryer', PERK_AT.fryer, 'Fish the dropped spatula out of the fryer', 2.2);
    perk('pharmacy', PERK_AT.pharmacy, 'Write yourself a prescription for everything');
    perk('mailself', PERK_AT.mailself, 'Hop the counter and mail yourself overnight');
    perk('dodgeball', s.dodgeball.clone(), 'Join the dodgeball game', 3);
    perk('plot', s.openGrave.clone().setY(G).setZ(s.openGrave.z - 2.5), 'Lie down in your pre-paid plot to try it out', 2.6);
    const coffin = new THREE.Group();
    coffin.add(box(0.9, 0.6, 2.2, 0x5a3418, 0, 0.3, 0), box(0.95, 0.12, 2.25, 0x7a4a24, 0, 0.66, 0));
    this.add(this.prop(coffin, PERK_AT.coffin, 'coffin', 'Climb into the display coffin', 3));
    // The railroad crossing gets an arm (just the visible bit; trains still don't care).
    this.crossArm = new THREE.Group();
    for (let i = 0; i < 6; i++) this.crossArm.add(box(1, 0.25, 0.25, i % 2 ? 0xf2f2f2 : 0xd02a2a, -0.5 - i, 0, 0));
    this.crossArm.position.copy(town.crossing).setY(G + 1.1);
    this.add(this.crossArm);
    perk('crossingarm', town.crossing.clone().setY(G), "Sit on the crossing arm and hit 'raise'", 3);
  }

  private add(o: THREE.Object3D) {
    this.scene.add(o);
    this.objects.push(o);
  }

  private prop(mesh: THREE.Object3D, at: THREE.Vector3, id: string, prompt: string, radius: number) {
    mesh.position.copy(at);
    this.interactables.push({ id, pos: at.clone().setY(Math.floor(at.y) === G ? G : at.y - 1), radius, prompt, mesh, enabled: true });
    return mesh;
  }

  /** A solid door/gate that opens only for certain bodies. */
  private gate(center: THREE.Vector3, half: THREE.Vector3, color: number, open: (f: PersonFile) => boolean) {
    const mesh = box(half.x * 2, half.y * 2, half.z * 2, color);
    mesh.position.copy(center);
    this.add(mesh);
    const collider = this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(center.x, center.y, center.z).setCollisionGroups(groups(G_WORLD, G_ALL)),
      this.fixedBody,
    );
    this.gates.push({ collider, mesh, open });
  }

  /** Called whenever Gary takes a new body. */
  onBody(f: PersonFile) {
    for (const g of this.gates) {
      const o = g.open(f);
      g.collider.setEnabled(!o);
      g.mesh.visible = !o;
    }
    this.hasCigar = false;
    this.hasCape = false;
    this.taunts = 0;
    this.hotdogs = 0;
    this.drownT = 0;
  }

  // ------------------------------------------------------------------ interactions

  /** Returns true if the id belonged to this module. */
  interact(id: string): boolean {
    const api = this.api;
    const ch = api.character;
    const body = api.body;
    if (!ch || !body) return false;
    const p = api.player;
    const known = this.interactables.some((it) => it.id === id);
    if (!known) return false;

    const ragdoll = (vel: THREE.Vector3, spin = 10, bounce = 0.5): DeathStyle => ({ kind: 'ragdoll', vel, spin, bounce });
    const pos = () => p.position();

    switch (id) {
      case 'tablecloth':
        this.hasCape = true;
        api.sound.pull();
        api.toast('TORO!', 'You tie the red tablecloth on like a cape.', 2200);
        ch.tint(0xe0302a, 0.25);
        return true;
      case 'mule': {
        const behind = p.feet().x < this.mule.position.x - 0.8;
        if (!behind) {
          api.sound.tone({ f: 300, f2: 180, dur: 0.5, type: 'sawtooth', vol: 0.2 });
          api.toast('HEE-HAW', 'The mule stares right at you, unimpressed.', 2000);
          return true;
        }
        p.lock(true);
        api.runSeq([
          { at: 0.2, fn: () => api.toast('*tickle tickle*', 'The mule goes very still.', 1400) },
          { at: 1.2, fn: () => (this.mule.rotation.z = -0.5) },
          {
            at: 1.35,
            fn: () => {
              api.sound.slam();
              api.sound.boing();
              api.shake(1.2);
              this.mule.rotation.z = 0;
              api.particles.burst(pos(), 20, 0xbfae8a, 7, { life: 0.6, size: 0.25 });
              api.kill('mule', ragdoll(new THREE.Vector3(-32, 22, (Math.random() - 0.5) * 8), 16, 0.6));
            },
          },
        ]);
        return true;
      }
      case 'bull': {
        this.taunts++;
        api.sound.tone({ f: 520, f2: 260, dur: 0.25, type: 'square', vol: 0.18 });
        ch.kick(0.4);
        if (!this.hasCape) {
          api.toast('"HEY, COW!"', 'The bull yawns.', 1500);
          return true;
        }
        if (this.taunts < 3) {
          api.toast(this.taunts === 1 ? '"YOUR MOTHER WAS A HAMBURGER!"' : '"NICE HORNS, LOSER!"', `The bull paws the dirt. (${this.taunts}/3)`, 1800);
          api.sound.noise({ dur: 0.4, vol: 0.4, freq: 300 });
          return true;
        }
        api.toast('"OLÉ!"', 'Uh oh.', 1500);
        this.bullCharge = 4;
        return true;
      }
      case 'goosenest':
        api.sound.munch();
        api.toast('FREE BREAD', 'Somewhere, a goose saw that.', 1800);
        this.geeseAngry = 12;
        for (const g of this.geese) g.speed = 10.5 + Math.random() * 2.5;
        api.sound.tone({ f: 700, f2: 500, dur: 0.3, type: 'sawtooth', vol: 0.25 });
        return true;
      case 'dmv': {
        p.lock(true);
        const head = ch.parts.head.pivot;
        api.runSeq([
          { at: 0.3, fn: () => api.toast('NOW SERVING', 'Number 4.', 1800) },
          { at: 2.2, fn: () => (api.toast('3 WEEKS LATER', 'Now serving number 5.', 1800), ch.tint(0x9a9a9a, 0.2)) },
          { at: 4.2, fn: () => (api.toast('11 YEARS LATER', 'Now serving number 6.', 1800), ch.tint(0x9a9a9a, 0.5), head.scale.setScalar(0.9)) },
          { at: 6.2, fn: () => (api.toast('47 YEARS LATER', '"Number 9,412?" ...hello?', 1800), ch.tint(0xd8d8d0, 0.8), head.scale.setScalar(0.8)) },
          { at: 7.4, fn: () => api.kill('dmv', ragdoll(new THREE.Vector3(0, 1, 1.5), 2, 0.2)) },
        ]);
        return true;
      }
      case 'bookshelf':
        p.lock(true);
        api.sound.creak();
        api.runSeq([
          { at: 0.2, fn: () => api.toast('*creeeak*', 'The shelf leans. The next one leans too.', 1600) },
          ...Array.from({ length: 6 }, (_, i) => ({
            at: 0.8 + i * 0.22,
            fn: () => {
              api.sound.slam();
              api.shake(0.4);
              api.particles.burst(pos().add(new THREE.Vector3((i - 3) * 2, 2, 0)), 14, [0xc03030, 0x3060c0, 0x30a050, 0xe0b020][i % 4], 6, { life: 1, size: 0.25 });
            },
          })),
          { at: 2.3, fn: () => api.kill('bookshelf', { kind: 'pancake' }) },
        ]);
        return true;
      case 'dryer':
        p.lock(true);
        api.runSeq([
          { at: 0.3, fn: () => api.toast('*clink clink*', 'Someone put in quarters.', 1500) },
          ...Array.from({ length: 20 }, (_, i) => ({
            at: 0.6 + i * 0.08,
            fn: () => {
              p.facing += 1.1;
              ch.kick(i % 2 ? 0.5 : -0.5);
              api.sound.noise({ dur: 0.1, vol: 0.3, freq: 200 + i * 30 });
              api.particles.emit(pos(), new THREE.Vector3(0, 2, 0), 0xffffff, { life: 0.6, size: 0.15, gravity: -2, spread: 2 });
            },
          })),
          { at: 2.4, fn: () => api.kill('dryer', ragdoll(new THREE.Vector3(0, 7, -12), 22, 0.5)) },
        ]);
        return true;
      case 'finale': {
        p.lock(true);
        const base = this.town.spots.finale.clone();
        api.runSeq([
          { at: 0.1, fn: () => api.toast('*tssssss*', 'The fuse is very short.', 1200) },
          ...Array.from({ length: 12 }, (_, i) => ({ at: 0.2 + i * 0.1, fn: () => api.particles.burst(base.clone().setY(G + 0.5), 4, 0xffd23a, 3, { life: 0.4, size: 0.1 }) })),
          {
            at: 1.5,
            fn: () => {
              api.sound.longJump();
              api.sound.whoosh();
              api.shake(1);
              for (let k = 0; k < 40; k++) api.particles.emit(base.clone().setY(G + 1 + k), new THREE.Vector3(0, -3, 0), k % 2 ? 0xff8a2a : 0xdddddd, { life: 1.2, size: 0.5, gravity: -1, spread: 2 });
              api.kill('finale', ragdoll(new THREE.Vector3(0, 46, 0), 6, 0.4));
            },
          },
          ...[0, 1, 2].map((k) => ({
            at: 2.6 + k * 0.25,
            fn: () => {
              const at = base.clone().setY(G + 30 + k * 2);
              api.sound.slam();
              api.particles.burst(at, 70, [0xff3a3a, 0x3ad0ff, 0xffe03a][k], 16, { life: 1.6, size: 0.3, gravity: 3 });
            },
          })),
        ]);
        return true;
      }
      case 'hotdog':
        this.hotdogs++;
        api.sound.munch();
        ch.kick(0.2);
        if (this.hotdogs < 8) {
          api.toast(`HOT DOG #${this.hotdogs}`, this.hotdogs < 4 ? 'Tastes like Sunday.' : this.hotdogs < 7 ? 'The pastor is watching you.' : 'One more. You can do it.', 1300);
          return true;
        }
        p.lock(true);
        api.runSeq([
          { at: 0.3, fn: () => api.toast('*hrrk*', 'That one went down the wrong pipe.', 1500) },
          ...Array.from({ length: 16 }, (_, i) => ({ at: 0.5 + i * 0.1, fn: () => (ch.tint(0x4060ff, i / 20), ch.kick(i % 2 ? 0.4 : -0.4)) })),
          { at: 2.3, fn: () => api.kill('hotdog', ragdoll(new THREE.Vector3(0, 3, 0), 3, 0.2)) },
        ]);
        return true;
      case 'cigar':
        this.hasCigar = true;
        api.sound.cash();
        api.toast('ONE CIGAR', 'You light it right there. Classy.', 2000);
        return true;
      case 'pump':
      case 'pump2':
        if (!this.hasCigar) {
          api.sound.trickle();
          api.toast('*glug glug glug*', "That'll be $84.20.", 1800);
          return true;
        }
        p.lock(true);
        api.runSeq([
          { at: 0.2, fn: () => api.toast('*glug glug*', 'A little ash falls off the cigar.', 1400) },
          {
            at: 1.2,
            fn: () => {
              const at = pos();
              api.sound.slam();
              api.sound.thunder();
              api.shake(2);
              api.particles.burst(at, 120, 0xff7a1a, 18, { life: 1.4, size: 0.5, gravity: -2 });
              api.particles.burst(at, 60, 0x333333, 10, { life: 2.2, size: 0.7, gravity: -3 });
              ch.tint(0x111111, 0.9);
              api.kill('pump', ragdoll(new THREE.Vector3((Math.random() - 0.5) * 14, 34, (Math.random() - 0.5) * 14), 18, 0.5));
            },
          },
        ]);
        return true;
      case 'sushi':
        p.lock(true);
        api.sound.munch();
        api.runSeq([
          { at: 0.6, fn: () => api.toast('HMM', 'Crunchy. Sushi should not be crunchy.', 1600) },
          ...Array.from({ length: 16 }, (_, i) => ({ at: 1 + i * 0.1, fn: () => ch.tint(0x7aa02a, i / 18) })),
          { at: 2.8, fn: () => api.kill('sushi', ragdoll(new THREE.Vector3(0, 2, 0), 3, 0.2)) },
        ]);
        return true;
      case 'nailgun':
        p.lock(true);
        api.runSeq([
          ...Array.from({ length: 14 }, (_, i) => ({
            at: 0.2 + i * 0.09,
            fn: () => {
              api.sound.tone({ f: 1400, f2: 300, dur: 0.06, type: 'square', vol: 0.15 });
              ch.kick(i % 2 ? 0.35 : -0.35);
              api.particles.burst(pos().add(new THREE.Vector3(0, 0.5, 0)), 3, 0xb0b4bb, 6, { life: 0.3, size: 0.06, gravity: 0 });
            },
          })),
          { at: 1.6, fn: () => api.kill('nailgun', ragdoll(new THREE.Vector3(-4, 5, 0), 6, 0.3)) },
        ]);
        return true;
      case 'movers':
        if (this.pianoState !== 'hanging') {
          api.toast('MOVERS', '"We\'re WORKING on it, pal!"', 1600);
          return true;
        }
        api.say('Movers', '"A little to the left? Sure, buddy. Hey Gus, LEFT!"', 2600);
        this.pianoState = 'creaking';
        this.pianoT = 3.5;
        api.sound.creak();
        return true;
      case 'bell':
        if (!inBox(p.position(), this.town.zones.belfry)) return true;
        p.lock(true);
        api.runSeq([
          ...Array.from({ length: 12 }, (_, i) => ({
            at: 0.2 + i * 0.45,
            fn: () => {
              this.bellSwing = 1;
              api.sound.tone({ f: 196, dur: 1.4, type: 'sine', vol: 0.5 });
              api.sound.tone({ f: 392, dur: 0.9, type: 'triangle', vol: 0.2 });
              api.shake(0.3 + i * 0.08);
              ch.kick(0.3 + i * 0.05);
              if (i < 11) api.toast(`BONG ${i + 1}`, '', 400);
            },
          })),
          { at: 5.4, fn: () => api.kill('bell', ragdoll(new THREE.Vector3(14, 20, 6), 14, 0.6)) },
        ]);
        return true;
      case 'cord-garage':
      case 'cord-shed':
      case 'cord-lights': {
        this.cords.add(id);
        api.sound.pull();
        const it = this.interactables.find((x) => x.id === id);
        if (it) {
          it.enabled = false;
          if (it.mesh) it.mesh.visible = false;
        }
        api.toast('EXTENSION CORD', `${this.cords.size} of 3. The bathroom is far from the kitchen.`, 2000);
        return true;
      }
      case 'tub':
        if (this.cords.size < 3) {
          api.toast('TOO SHORT', "The toaster's cord doesn't reach the tub. Not even close.", 2200);
          api.sound.denied();
          return true;
        }
        p.lock(true);
        api.runSeq([
          { at: 0.3, fn: () => api.toast('AAAH', 'Nice and warm. Now, the toaster...', 1600) },
          { at: 1.6, fn: () => api.sound.zap(1.6) },
          ...Array.from({ length: 16 }, (_, i) => ({ at: 1.6 + i * 0.08, fn: () => (ch.flash(i % 2 === 0), api.particles.burst(pos(), 3, 0x9ad8ff, 5, { life: 0.3, size: 0.1, gravity: 0 })) })),
          { at: 3, fn: () => (ch.flash(false), ch.tint(0x222222, 0.6), api.kill('bathtub', ragdoll(new THREE.Vector3(0, 8, 0), 9, 0.4))) },
        ]);
        return true;
      case 'toaster':
        p.lock(true);
        api.sound.zap(1);
        api.runSeq([
          ...Array.from({ length: 10 }, (_, i) => ({ at: i * 0.08, fn: () => ch.flash(i % 2 === 0) })),
          { at: 0.9, fn: () => (ch.flash(false), ch.tint(0x222222, 0.5), api.kill('forktoast', ragdoll(new THREE.Vector3(-6, 5, 0), 6, 0.3))) },
        ]);
        return true;
    }
    const perk = PERKS[id];
    if (perk) {
      if (!perk.jobs.includes(body.job)) {
        api.sound.denied();
        api.toast(perk.title, perk.no, 3000);
        return true;
      }
      p.lock(true);
      this.perkDeath(id, ragdoll, pos);
      return true;
    }
    return false;
  }

  /** The job-perk deaths. The body has already been checked for the right job. */
  private perkDeath(id: string, ragdoll: (vel: THREE.Vector3, spin?: number, bounce?: number) => DeathStyle, pos: () => THREE.Vector3) {
    const api = this.api;
    const ch = api.character!;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    switch (id) {
      case 'carlift':
        api.runSeq([
          { at: 0.2, fn: () => (api.toast('*hssssss*', 'The lift comes down slowly. Then not slowly.', 1800), api.sound.creak()) },
          { at: 1.0, fn: () => api.sound.creak() },
          { at: 1.6, fn: () => (api.sound.slam(), api.shake(1.2), api.particles.burst(pos(), 30, 0x2a2a2a, 6, { life: 0.8, size: 0.2 })) },
          { at: 1.7, fn: () => api.kill('carlift', { kind: 'pancake' }) },
        ]);
        return;
      case 'vault':
        api.runSeq([
          { at: 0.2, fn: () => (api.sound.slam(), api.shake(0.5), api.toast('*CLUNK*', 'The vault door seals. You start counting.', 1800)) },
          { at: 1.8, fn: () => (api.sound.cash(), api.toast('$400,000...', 'The air is getting a little thin.', 1600)) },
          { at: 3.2, fn: () => (api.sound.cash(), ch.tint(0x4060ff, 0.4), api.toast('$1,200,000...', 'Worth it.', 1500)) },
          { at: 4.2, fn: () => api.kill('vault', ragdoll(V(0, 2, 0), 2, 0.2)) },
        ]);
        return;
      case 'fryer':
        api.runSeq([
          ...Array.from({ length: 14 }, (_, i) => ({
            at: 0.2 + i * 0.1,
            fn: () => {
              api.sound.noise({ dur: 0.12, vol: 0.4, freq: 3000 + i * 100, type: 'highpass' });
              ch.tint(0xc08030, i / 18);
              ch.kick(i % 2 ? 0.4 : -0.4);
              api.particles.emit(pos().add(V(0, 1, 0)), V(0, 3, 0), 0xf2e6c8, { life: 0.5, size: 0.12, gravity: -2, spread: 1 });
            },
          })),
          { at: 1.8, fn: () => api.toast('GOLDEN BROWN', 'Nobody orders the special anymore.', 1600) },
          { at: 2.2, fn: () => api.kill('fryer', ragdoll(V(0, 4, 3), 4, 0.3)) },
        ]);
        return;
      case 'pharmacy':
        api.sound.gulp();
        api.runSeq([
          { at: 0.3, fn: () => api.toast('TAKE TWO OF EVERYTHING', 'With food. Is Mountain Dew food?', 1800) },
          ...Array.from({ length: 24 }, (_, i) => ({ at: 0.6 + i * 0.09, fn: () => (ch.tint([0xff6ad5, 0x6affc8, 0xfff06a][i % 3], 0.2 + i / 40), ch.kick(i % 2 ? 0.3 : -0.3)) })),
          { at: 2.9, fn: () => api.kill('pharmacy', ragdoll(V(0, 3, 0), 6, 0.3)) },
        ]);
        return;
      case 'mailself':
        api.runSeq([
          { at: 0.2, fn: () => (api.sound.pull(), api.toast('PRIORITY OVERNIGHT', 'You tape yourself into a crate marked FRAGILE.', 1800)) },
          ...[0, 1, 2, 3].map((k) => ({ at: 1.2 + k * 0.35, fn: () => (api.sound.slam(), api.shake(0.5 + k * 0.2), ch.kick(0.5)) })),
          { at: 2.4, fn: () => api.toast('RETURN TO SENDER', 'Insufficient postage.', 1500) },
          { at: 2.6, fn: () => api.kill('mailself', ragdoll(V(-18, 14, 6), 16, 0.5)) },
        ]);
        return;
      case 'dodgeball':
        api.say('Coach', 'NEW KID! Varsity, you know what to do.', 2400);
        api.runSeq([
          ...Array.from({ length: 16 }, (_, i) => ({
            at: 0.9 + i * 0.13,
            fn: () => {
              api.sound.boing();
              ch.kick(i % 2 ? 0.6 : -0.6);
              api.particles.burst(pos().add(V(0, 1.4, 0)), 5, 0xd02a2a, 5, { life: 0.3, size: 0.18, gravity: 4 });
            },
          })),
          { at: 3.1, fn: () => api.kill('dodgeball', ragdoll(V(6, 7, 0), 10, 0.5)) },
        ]);
        return;
      case 'crossingarm':
        api.runSeq([
          { at: 0.2, fn: () => api.toast('*ding ding ding*', "You sit on the arm and turn the key to 'raise'.", 1600) },
          ...Array.from({ length: 6 }, (_, i) => ({ at: 1.2 + i * 0.03, fn: () => (this.crossArm.rotation.z = -((i + 1) / 6) * 1.4) })),
          { at: 1.25, fn: () => (api.sound.boing(), api.sound.whoosh(), api.shake(0.8)) },
          { at: 1.3, fn: () => api.kill('crossingarm', ragdoll(V(-22, 30, 4), 14, 0.5)) },
          { at: 6, fn: () => (this.crossArm.rotation.z = 0) },
        ]);
        return;
      case 'plot':
        api.runSeq([
          { at: 0.3, fn: () => api.toast('COMFY', 'Good drainage. Nice view of the sky.', 1800) },
          ...Array.from({ length: 10 }, (_, i) => ({
            at: 1.6 + i * 0.22,
            fn: () => {
              api.sound.noise({ dur: 0.15, vol: 0.4, freq: 250 });
              api.particles.burst(pos().add(V(0, 2, 0)), 12, 0x5a4030, 4, { life: 0.7, size: 0.25, gravity: 9 });
              ch.tint(0x5a4030, i / 12);
            },
          })),
          { at: 1.8, fn: () => api.say('Gravedigger', "Somebody's in the 2 o'clock already? Great, I'm early.", 2600) },
          { at: 4, fn: () => api.kill('plot', ragdoll(V(0, 0.5, 0), 1, 0.1)) },
        ]);
        return;
      case 'coffin':
        api.runSeq([
          { at: 0.2, fn: () => api.toast('VERY ROOMY', 'Satin lining. Memory foam. Lid on a soft close.', 1800) },
          { at: 1.4, fn: () => (api.sound.slam(), api.toast('*click*', 'It locks from the outside. Display model. No air holes.', 2200)) },
          { at: 3.4, fn: () => ch.tint(0x4060ff, 0.5) },
          { at: 4, fn: () => api.kill('coffin', ragdoll(V(0, 1, 0), 1, 0.1)) },
        ]);
        return;
    }
  }

  // ------------------------------------------------------------------ falls

  /** A special name for a fatal fall, or null to use the default. */
  fallDeathId(e: { launchPos: THREE.Vector3; launchState: string }, feet: THREE.Vector3): string | null {
    const z = this.town.zones;
    if (inBox(feet, z.kiddiePool) && inBox(e.launchPos, this.town.towerZone)) return 'shallowend';
    const t = z.trampoline;
    if (e.launchPos.x >= t.min.x && e.launchPos.x <= t.max.x && e.launchPos.z >= t.min.z && e.launchPos.z <= t.max.z && e.launchPos.y < G + 3) return 'trampoline';
    if (inBox(feet, z.quarry) && feet.y < G - 2) return 'quarry';
    return null;
  }

  /** Landing hook. Returns true if handled (trampoline bounce). */
  onLand(e: { drop: number; landState: string }): boolean {
    const f = this.api.player.feet();
    if (!inBox(f, this.town.zones.trampoline)) return false;
    const v = Math.min(Math.sqrt(2 * 42 * Math.max(e.drop, 1)) * 1.12 + 4, 52);
    this.api.player.knock(new THREE.Vector3(this.api.player.vel.x * 0.5, v, this.api.player.vel.z * 0.5));
    this.api.sound.boing();
    this.api.character?.kick(0.5);
    return true;
  }

  // ------------------------------------------------------------------ per step

  checkHazards(h: number) {
    const api = this.api;
    const p = api.player.position();
    const feet = api.player.feet();
    const z = this.town.zones;
    // Silo: drop into the grain and it swallows you.
    if (inBox(p, z.silo)) {
      api.sound.noise({ dur: 1.2, vol: 0.5, freq: 500 });
      api.particles.burst(p.clone().setY(z.silo.max.y), 50, 0xd9b85a, 6, { life: 1.2, size: 0.2 });
      api.toast('*glorp*', 'The grain is like quicksand. Quicksand made of breakfast.', 2000);
      api.kill('silo', { kind: 'ragdoll', vel: new THREE.Vector3(0, -2, 0), spin: 2, bounce: 0 });
      return;
    }
    // Drowning: head under water for too long.
    const w = this.town.world;
    const head = w.get(Math.floor(p.x), Math.floor(p.y + 0.6), Math.floor(p.z));
    if (head === B.Water) {
      this.drownT += h;
      if (this.drownT > 1.5 && this.drownT - h <= 1.5) api.toast('blub blub', 'This body cannot swim.', 1500);
      if (Math.random() < 0.2) api.particles.emit(p.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, 3, 0), 0xcdeefa, { life: 0.6, size: 0.12, gravity: -2, spread: 0.5 });
      if (this.drownT > 5) {
        this.drownT = 0;
        api.kill('drowned', { kind: 'ragdoll', vel: new THREE.Vector3(0, 1, 0), spin: 1, bounce: 0.1 });
        return;
      }
    } else this.drownT = Math.max(0, this.drownT - h * 2);
    // Bull charge contact.
    if (this.bullCharge > 0 && this.bullPos.distanceTo(feet.clone().setY(G)) < 2) {
      const dir = feet.clone().sub(this.bullPos).setY(0).normalize();
      this.bullCharge = 0;
      api.sound.slam();
      api.sound.boing();
      api.shake(1.6);
      api.kill('bull', { kind: 'ragdoll', vel: dir.multiplyScalar(36).add(new THREE.Vector3(0, 30, 0)), spin: 20, bounce: 0.6 });
      return;
    }
    // Geese.
    if (this.geeseAngry > 0) {
      for (const g of this.geese) {
        if (g.mesh.position.distanceTo(feet) < 1.1) {
          this.geeseAngry = 0;
          const ch = api.character;
          api.player.lock(true);
          api.runSeq([
            ...Array.from({ length: 14 }, (_, i) => ({
              at: i * 0.1,
              fn: () => {
                api.sound.tone({ f: 600 + Math.random() * 300, f2: 400, dur: 0.12, type: 'sawtooth', vol: 0.2 });
                ch?.kick(i % 2 ? 0.5 : -0.5);
                api.particles.burst(api.player.position(), 4, 0xffffff, 5, { life: 0.5, size: 0.12, gravity: 6 });
              },
            })),
            { at: 1.5, fn: () => api.kill('geese', { kind: 'ragdoll', vel: new THREE.Vector3(0, 4, 0), spin: 6, bounce: 0.3 }) },
          ]);
          return;
        }
      }
    }
    // Piano.
    if (this.pianoState === 'falling') {
      const pp = this.piano.position;
      if (Math.abs(pp.x - feet.x) < 1.5 && Math.abs(pp.z - feet.z) < 1.1 && pp.y < feet.y + 2 && pp.y > feet.y - 0.5) {
        api.sound.slam();
        api.sound.tone({ f: 130, dur: 1.5, type: 'triangle', vol: 0.4 });
        api.shake(1.4);
        api.kill('piano', { kind: 'pancake' });
      }
    }
  }

  /** Fixed-step animation of moving hazards. */
  step(h: number) {
    // Piano.
    if (this.pianoState === 'creaking') {
      this.pianoT -= h;
      this.piano.rotation.z = Math.sin(this.pianoT * 9) * 0.04;
      if (Math.random() < 0.02) this.api.sound.creak();
      if (this.pianoT <= 0) {
        this.pianoState = 'falling';
        this.pianoVy = 0;
        this.piano.getObjectByName('rope')!.visible = false;
        this.api.sound.tone({ f: 900, f2: 200, dur: 0.3, type: 'square', vol: 0.15 });
      }
    } else if (this.pianoState === 'falling') {
      this.pianoVy -= 30 * h;
      this.piano.position.y += this.pianoVy * h;
      if (this.piano.position.y <= G + 0.3) {
        this.piano.position.y = G + 0.3;
        this.pianoState = 'down';
        this.pianoT = 8;
        this.api.sound.slam();
        this.api.sound.tone({ f: 98, dur: 2, type: 'triangle', vol: 0.4 });
        this.api.particles.burst(this.piano.position.clone(), 40, 0x141418, 8, { life: 1.2, size: 0.25 });
        this.api.particles.burst(this.piano.position.clone(), 20, 0xf2f2f2, 8, { life: 1.2, size: 0.15 });
      }
    } else if (this.pianoState === 'down') {
      this.pianoT -= h;
      if (this.pianoT <= 0) {
        this.pianoState = 'hanging';
        this.piano.position.copy(this.town.spots.pianoHang);
        this.piano.rotation.z = 0;
        this.piano.getObjectByName('rope')!.visible = true;
      }
    }
    // Bull.
    const pen = this.town.zones.bullPen;
    const feet = this.api.player.feet();
    const inPen = this.api.body !== null && inBox(feet, pen);
    const bullIt = this.interactables.find((i) => i.id === 'bull')!;
    bullIt.enabled = inPen && this.bullCharge <= 0;
    bullIt.pos.copy(this.bullPos);
    if (this.bullCharge > 0 && inPen) {
      this.bullCharge -= h;
      this.bullTarget.copy(feet).setY(G);
      this.moveBull(17, h);
      if (Math.random() < 0.3) this.api.particles.emit(this.bullPos.clone(), new THREE.Vector3(0, 2, 0), 0x8a6a4a, { life: 0.5, size: 0.3, spread: 2 });
    } else {
      if (this.bullCharge > 0) this.bullCharge = 0;
      if (this.bullPos.distanceTo(this.bullTarget) < 0.5 || Math.random() < 0.002)
        this.bullTarget.set(pen.min.x + 3 + Math.random() * (pen.max.x - pen.min.x - 6), G, pen.min.z + 3 + Math.random() * (pen.max.z - pen.min.z - 6));
      this.moveBull(1.4, h);
    }
    // Geese.
    if (this.geeseAngry > 0) {
      this.geeseAngry -= h;
      const far = feet.distanceTo(this.town.spots.pond) > 80;
      if (far || this.api.body === null) this.geeseAngry = Math.min(this.geeseAngry, 0);
    }
    for (const g of this.geese) {
      const target = this.geeseAngry > 0 && this.api.body ? feet : g.home;
      const to = target.clone().sub(g.mesh.position).setY(0);
      const d = to.length();
      const sp = this.geeseAngry > 0 ? g.speed : 2;
      if (d > 0.2) {
        to.normalize();
        g.mesh.position.addScaledVector(to, Math.min(d, sp * h));
        g.mesh.rotation.y = Math.atan2(-to.z, to.x);
      }
      g.mesh.position.y = G + Math.abs(Math.sin(this.time * (this.geeseAngry > 0 ? 18 : 3) + g.speed)) * 0.15;
    }
  }

  private moveBull(speed: number, h: number) {
    const to = this.bullTarget.clone().sub(this.bullPos).setY(0);
    const d = to.length();
    if (d < 0.05) return;
    to.normalize();
    const pen = this.town.zones.bullPen;
    this.bullPos.addScaledVector(to, Math.min(d, speed * h));
    this.bullPos.x = Math.min(Math.max(this.bullPos.x, pen.min.x + 1.5), pen.max.x - 1.5);
    this.bullPos.z = Math.min(Math.max(this.bullPos.z, pen.min.z + 1.5), pen.max.z - 1.5);
    this.bull.position.copy(this.bullPos);
    this.bull.rotation.y = Math.atan2(-to.z, to.x);
  }

  /** Per-frame cosmetic animation. */
  update(dt: number, time: number) {
    this.time = time;
    // Bell swing.
    if (this.bellSwing > 0) this.bellSwing = Math.max(0, this.bellSwing - dt * 0.8);
    this.bell.rotation.z = Math.sin(time * 6) * 0.4 * this.bellSwing;
    // Mule tail flick.
    this.mule.rotation.y = Math.sin(time * 0.3) * 0.05;
    if (this.bullCharge <= 0) this.bull.position.y = 0;
  }

  dispose() {
    for (const o of this.objects) this.scene.remove(o);
    for (const g of this.gates) this.physics.removeCollider(g.collider, false);
    this.physics.removeRigidBody(this.fixedBody);
  }
}
