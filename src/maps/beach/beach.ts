import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from '../../physics';
import type { Interactable } from '../../props';
import type { PersonFile } from '../../deaths';
import type { GameApi, MapContext, MapRuntime } from '../types';
import { Actor } from './actor';
import * as M from './models';
import { Sea } from './water';
import { BeachTown } from './town';
import { BUOY_Z, DECK, GL, PIER_END, SEA, SX, SZ, type BeachLayout, shoreZ } from './world';

type V = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const flat = (a: V, b: V) => Math.hypot(a.x - b.x, a.z - b.z);
const inBox2 = (p: V, b: { min: V; max: V }) => p.x >= b.min.x && p.x <= b.max.x && p.z >= b.min.z && p.z <= b.max.z;

interface Spot extends Interactable {
  /** Show the prompt only when this returns true. */
  when?: () => boolean;
  /** Recompute the prompt text each frame. */
  label?: () => string;
  /** Follow a moving thing. */
  follow?: () => V;
}

type Busy = null | 'tow' | 'buried' | 'gulls' | 'parasail' | 'marlin' | 'anchor' | 'whale' | 'belly' | 'sub' | 'shark' | 'nap' | 'trample' | 'volley';

const CREW = ['Captain', 'Boat Captain', 'Deckhand', 'Fisherman', 'Sailor', 'Harbor Master'];
const TIDE_PERIOD = 600; // seconds per tide cycle (the design doc's 10-minute clock)
const HOUR_SECONDS = 45; // one in-game hour

/**
 * Everything alive on the beach map: the sea, tide and clock, scripted people, props,
 * and the fifteen death puzzles with their savers.
 */
export class BeachRuntime implements MapRuntime {
  readonly interactables: Spot[] = [];
  private g: GameApi;
  private scene: THREE.Scene;
  private root = new THREE.Group();
  private sea: Sea;
  private town: BeachTown;
  private hud: HTMLElement;
  private timers: { t: number; fn: () => void }[] = [];
  private lastBody: PersonFile | null = null;
  private busy: Busy = null;
  private items = new Set<string>();
  private bleeding = false;
  private fogBase: { color: THREE.Color; near: number; far: number } | null = null;

  // Clock and weather.
  private clock = 0;
  private windy = false;
  private windTimer = 20;
  private tide = SEA;

  // Props.
  private tube = M.innerTube();
  private ferris: THREE.Group;
  private flags: THREE.Group[] = [];
  private weatherFlag: THREE.Group;
  private windSign = new M.LiveSign(3, 1.2, '#0a3a6a', '#ffffff');
  private buffetSign = new M.LiveSign(5, 1.6, '#1d2b4f', '#ffd84a');
  private gulls: { m: THREE.Group; a: number; r: number; h: number; s: number; c: V }[] = [];
  private fins: { m: THREE.Group; c: V; a: number; r: number; s: number }[] = [];
  private crabs: { m: THREE.Group; p: V; t: number }[] = [];
  private jelly: { m: THREE.Group; base: V; ph: number }[] = [];
  private reefFish: { m: THREE.Group; c: V; a: number; r: number; s: number; y: number }[] = [];
  private puffers: { m: THREE.Group; home: V; pos: V; size: number; pokes: number; ph: number }[] = [];
  private bodies: RAPIER.RigidBody[] = [];

  // Lifeguards. Chet works tower 300 and owns the jet ski.
  private guards: Actor[] = [];
  private chet: Actor;
  private chetState: 'tower' | 'snack' | 'chase' | 'tow' | 'return' | 'search' = 'tower';
  private chetTimer = 0;
  private ski = M.jetSki();
  private skiPos = new THREE.Vector3();
  private skiHome = new THREE.Vector3();
  private skiCap: V | null = null;
  private reefWait = 0;
  private capThrown = false;

  // Shark Week.
  private splashT = 0;
  private lastSplash = -9;
  private smallShark = M.shark(0.7);
  private bigShark = M.shark(3.2);

  // Buried / sandcastle.
  private kids: Actor[] = [];
  private buriedAt: V | null = null;
  private mound = new THREE.Group();
  private castle = new THREE.Group();
  private castleH = 0;
  private castleCool = 0;

  // Gulls.
  private friesMesh = M.friesBucket();
  private flock: { m: THREE.Group; off: V; ph: number }[] = [];
  private holdT = 0;

  // Parasail.
  private psBoat = M.boat('parasail');
  private chute = M.parachute();
  private boatGuy: Actor;
  private psT = 0;
  private chews = 0;
  private psPos = new THREE.Vector3();
  private psFree = false;
  private psSpin = 0;

  // Charter (marlin).
  private charter = M.boat('charter');
  private charterPos = v(180, SEA, 560);
  private captain: Actor;
  private seasick = 0;
  private lastSide = 0;
  private rocks = 0;
  private tied = false;
  private casting = false;
  private marlin = M.marlin();
  private boatRoll = 0;

  // Anchor.
  private anchorMesh = M.anchor();
  private chained = false;
  private chest = M.treasureChest();
  private cart = M.shoppingCart();

  // Whale.
  private whale = M.whale();
  private whaleA = 0;
  private whalePos = new THREE.Vector3();
  private whaleMouth = 0;
  private tour = M.boat('tour');
  private tourPos = v(300, SEA, 548);
  private guide: Actor;
  private ringCut = false;
  private ring = M.lifeRing();
  private krillT = 0;
  private krill = new THREE.Vector3();

  // Sub.
  private sub = M.submarine();
  private davy: Actor;
  private davyOut = false;
  private davyTimer = 40;
  private ownsSub = false;
  private governorOff = false;
  private subPos = new THREE.Vector3();
  private subPhase: 'drive' | 'dive' | 'crush' = 'drive';
  private subT = 0;

  // Volleyball.
  private vbPlayers: Actor[] = [];
  private ball = M.volleyball();
  private ballFrom = new THREE.Vector3();
  private ballTo = new THREE.Vector3();
  private ballT = 0;
  private ballHolder = 0;
  private joined = false;
  private taunts = 0;
  private spikeAt = false;

  // Coconut Conk.
  private shakes = new Map<number, number>();
  private nuts: { m: THREE.Group; vy: number; ground: number; shadow: THREE.Mesh; at: V }[] = [];

  // Cruise buffet.
  private passengers: Actor[] = [];
  private buffetClock = 45;
  private stampede = 0;

  constructor(private ctx: MapContext, private L: BeachLayout) {
    this.g = ctx.game;
    this.scene = ctx.scene;
    this.scene.add(this.root);
    const g = this.g;

    // Water, tide and fog.
    this.town = new BeachTown(this.root, ctx.physics, L);
    this.sea = new Sea(ctx.world);
    this.root.add(this.sea.group);
    g.player.waterAt = () => this.tide;

    this.hud = document.createElement('div');
    this.hud.style.cssText =
      'position:absolute;top:14px;right:16px;text-align:right;font-size:14px;line-height:1.45;text-shadow:0 2px 0 #000,0 0 6px #000;max-width:340px;';
    document.getElementById('ui')?.appendChild(this.hud);

    // Shop signs.
    for (const s of L.shops) {
      const m = M.signBoard(s.sign.lines, Math.min(10, (s.inside.max.x - s.inside.min.x) * 0.8), 1.6, s.sign.bg, s.sign.fg);
      m.position.copy(s.sign.pos);
      m.rotation.y = s.sign.rotY;
      this.root.add(m);
    }
    const sign = (lines: string[], p: V, rotY: number, bg: string, fg: string, w = 4, h = 1.6) => {
      const m = M.signBoard(lines, w, h, bg, fg);
      m.position.copy(p);
      m.rotation.y = rotY;
      this.root.add(m);
      const post = M.cube(0.15, p.y - GL + 0.2, 0.15, 0xdddddd, p.x, GL + (p.y - GL) / 2 - 0.9, p.z, this.root);
      post.position.y = (p.y - h / 2 + Math.floor(p.y - 3)) / 2;
      return m;
    };
    sign(['SANDY SHORES', 'pop. 2,140 · sharks: several'], v(30, GL + 4, 150), Math.PI / 2, '#0a6a8a', '#ffffff', 6, 2);
    sign(['NO SWIMMING', 'PAST THE BUOYS'], v(392, DECK + 2.5, 300), 0, '#ffffff', '#e8302a');
    sign(['RIP CURRENT', 'RED FLAG = STAY OUT'], v(172, GL + 2.5, shoreZ(172) - 14), 0, '#e8302a', '#ffffff');
    sign(['JELLYFISH', 'ADVISORY'], v(420, DECK + 2.5, PIER_END - 13), Math.PI, '#ff8ad8', '#111111');
    sign(['HIGH DIVE', 'belly flops prohibited'], v(L.divingBoard.x + 2.5, DECK + 2.5, PIER_END - 14), Math.PI, '#ffffff', '#1c4fa0');
    sign(['PARASAIL $40', 'ask the boat guy'], v(388, DECK + 2.5, PIER_END - 13), Math.PI, '#e8423a', '#ffffff');
    sign(['BUS STOP'], v(L.busStop.x - 4, GL + 3.2, L.busStop.z - 1.4), 0, '#0a6a8a', '#ffffff', 2.4, 1);
    sign(['WHALE TOURS · CHARTERS', 'tickets inside'], v(L.harbor.tourDock.x, GL + 2.5, 234), 0, '#0a3a6a', '#ffffff');
    sign(['TENDER TO THE', 'MAJESTIC MORTALIS'], v(L.harbor.tenderDock.x, GL + 2.5, 236), 0, '#1d2b4f', '#ffd84a');
    sign(['ANCHOR WINCH', 'CREW ONLY'], v(L.harbor.anchorWinch.x - 3, GL + 2.5, 303), 0, '#ffd84a', '#111111');
    sign(['SUB DOCK'], v(L.harbor.subDock.x + 3, GL + 2.5, 286), 0, '#ffe46a', '#111111', 2.4, 1);
    sign(['SEAPLANE'], v(L.harbor.seaplaneDock.x, GL + 2.5, 240), 0, '#dddddd', '#c02020', 2.6, 1);

    // Ferris wheel.
    this.ferris = M.ferrisWheel();
    this.ferris.position.copy(L.ferris);
    this.root.add(this.ferris);

    // Payphone.
    const phone = M.payphone();
    phone.position.copy(L.payphone).setY(DECK - 0.5);
    phone.rotation.y = 0;
    this.root.add(phone);

    // Buoy line.
    for (let x = 150; x < 606; x += 8) {
      if (x > 380 && x < 425) continue;
      const b = M.buoy();
      b.position.set(x, SEA, BUOY_Z);
      b.userData.ph = x * 0.3;
      this.root.add(b);
      this.flags.push(b as THREE.Group);
    }
    // Red flags at the rip.
    for (const x of [152, 194]) {
      const f = M.flag(0xe8302a);
      f.position.set(x, ctx.world.topY(x, shoreZ(x) - 12), shoreZ(x) - 12);
      this.root.add(f);
      this.flags.push(f);
    }
    // Weather flag on the pier end and its sign.
    this.weatherFlag = M.flag(0xf2c230);
    this.weatherFlag.position.set(392, DECK, PIER_END - 2);
    this.root.add(this.weatherFlag);
    this.windSign.mesh.position.set(396, DECK + 2, PIER_END - 13.4);
    this.windSign.mesh.rotation.y = Math.PI;
    this.root.add(this.windSign.mesh);

    // Ambient gulls, fins, crabs, jellyfish, reef fish.
    const rng = ctx.rng;
    for (let i = 0; i < 26; i++) {
      const m = M.gull();
      this.root.add(m);
      this.gulls.push({ m, a: rng() * 6.28, r: 8 + rng() * 25, h: 18 + rng() * 14, s: (0.3 + rng() * 0.5) * (rng() < 0.5 ? -1 : 1), c: v(160 + rng() * 440, 0, 200 + rng() * 120) });
    }
    for (let i = 0; i < 5; i++) {
      const m = M.shark(1);
      this.root.add(m);
      this.fins.push({ m, c: v(180 + rng() * 400, 0, BUOY_Z + 50 + rng() * 80), a: rng() * 6.28, r: 10 + rng() * 15, s: 0.15 + rng() * 0.1 });
    }
    for (let i = 0; i < 14; i++) {
      const m = M.crab();
      const x = 150 + rng() * 450;
      const p = v(x, 0, shoreZ(x) - 10 - rng() * 30);
      p.y = ctx.world.topY(p.x, p.z);
      m.position.copy(p);
      this.root.add(m);
      this.crabs.push({ m, p, t: rng() * 10 });
    }
    for (let i = 0; i < 40; i++) {
      const m = M.jellyfish();
      const b = L.bloom;
      const base = v(b.min.x + rng() * (b.max.x - b.min.x), SEA - 0.6 - rng() * 2.5, b.min.z + rng() * (b.max.z - b.min.z));
      this.root.add(m);
      this.jelly.push({ m, base, ph: rng() * 6 });
    }
    const fishCols = [0xff7a2a, 0x2ab0ff, 0xffe02a, 0xff4ab0, 0x7aff5a];
    for (let i = 0; i < 40; i++) {
      const m = M.fish(fishCols[i % fishCols.length]);
      this.root.add(m);
      this.reefFish.push({ m, c: v(220 + rng() * 60, 0, 450 + rng() * 60), a: rng() * 6.28, r: 2 + rng() * 6, s: 0.6 + rng(), y: 6.5 + rng() * 1.2 });
    }
    for (let i = 0; i < 5; i++) {
      const m = M.pufferfish();
      const home = v(225 + rng() * 50, 7.1, 460 + rng() * 40);
      m.position.copy(home);
      this.root.add(m);
      const p = { m, home, pos: home.clone(), size: 1, pokes: 0, ph: rng() * 6 };
      this.puffers.push(p);
      this.spot({ id: `puffer${i}`, pos: p.pos, radius: 2.6, prompt: 'Poke the pufferfish', follow: () => p.pos, when: () => this.g.player.swimming });
    }

    // ---------------------------------------------------------------- Coconut Conk
    L.palms.forEach((c, i) => {
      const trunk = v(c.x, ctx.world.topY(c.x, c.z), c.z);
      // The trunk base: walk down the palm to find where it meets the sand.
      for (let y = Math.floor(c.y); y > 0; y--) if (ctx.world.get(Math.floor(c.x), y, Math.floor(c.z)) === 0) { trunk.y = y; break; }
      const base = v(c.x, 0, c.z);
      base.y = ctx.world.topY(c.x + 1.5, c.z);
      this.spot({ id: `palm${i}`, pos: v(c.x, base.y, c.z), radius: 3.2, prompt: 'Shake the palm tree', when: () => !this.busy && !this.g.player.swimming });
    });

    // ---------------------------------------------------------------- lifeguards
    const tw = L.towers;
    tw.forEach((t, i) => {
      const a = new Actor(this.root, i === 1 ? 'Chet' : 'Lifeguard', 900 + i, { shirt: 0xe8302a, pants: 0xe8302a, hat: null });
      a.place(t.clone(), 0);
      a.pose = 'sit';
      this.guards.push(a);
    });
    this.chet = this.guards[1];
    this.skiHome.set(tw[1].x + 4, this.tide, shoreZ(tw[1].x) + 6);
    this.skiPos.copy(this.skiHome);
    this.root.add(this.ski);

    // ---------------------------------------------------------------- Shark Week
    this.smallShark.visible = false;
    this.bigShark.visible = false;
    this.root.add(this.smallShark, this.bigShark);
    this.tube.visible = false;
    this.root.add(this.tube);
    const surf = L.shops.find((s) => s.id === 'surfshop')!;
    this.spot({ id: 'tube', pos: surf.counter, radius: 3, prompt: 'Rent an inner tube ($10)', when: () => !this.items.has('tube') });
    this.spot({ id: 'brochure', pos: surf.counter.clone().add(v(3, 0, 0)), radius: 2.2, prompt: 'Read a surf shop brochure', when: () => !this.bleeding });
    this.spot({ id: 'valvecap', pos: v(0, 0, 0), radius: 4, prompt: "Throw the tube's valve cap", follow: () => this.g.player.feet(), when: () => this.items.has('tube') && !this.capThrown && this.chetState === 'chase' && flat(this.skiPos, this.g.player.feet()) < 25 });
    this.spot({ id: 'payphone', pos: L.payphone, radius: 2.2, prompt: 'Call in a fake lunch order for the lifeguards', when: () => this.chetState === 'tower' });

    // ---------------------------------------------------------------- Buried Alive and the sandcastle
    for (let i = 0; i < 3; i++) {
      const k = new Actor(this.root, 'Kid', 700 + i, { hat: i === 0 ? 0xf6d23a : null }, 0.62);
      const a = (i / 3) * Math.PI * 2;
      k.place(L.sandcastle.clone().add(v(Math.cos(a) * 3.6, 0, Math.sin(a) * 3.6)), a + Math.PI);
      this.kids.push(k);
    }
    this.root.add(this.mound, this.castle);
    this.spot({ id: 'bury', pos: L.sandcastle, radius: 8, prompt: 'Lie down and ask the kids to bury you', when: () => !this.busy && !this.g.player.swimming });
    this.spot({ id: 'dig', pos: v(0, 0, 0), radius: 3, prompt: 'Wiggle out of the sand', follow: () => this.buriedAt ?? v(0, -99, 0), when: () => this.busy === 'buried' });
    this.spot({ id: 'build', pos: L.sandcastle, radius: 6, prompt: '', label: () => `Help the kids build the sandcastle (${this.castleH} / 5 m)`, when: () => !this.busy && this.castleH < 5 && this.castleCool <= 0 });
    this.spot({ id: 'nap', pos: L.sandcastle, radius: 6, prompt: 'Take a nap inside the sandcastle', when: () => !this.busy && this.castleH >= 5 });

    // ---------------------------------------------------------------- Seagull Airlift
    const fry = L.shops.find((s) => s.id === 'fryshack')!;
    this.spot({ id: 'fries', pos: fry.counter, radius: 3, prompt: 'Buy a jumbo bucket of fries ($12)', when: () => !this.items.has('fries') });
    this.spot({ id: 'holdfries', pos: v(0, 0, 0), radius: 3, prompt: 'Hold the fries over your head', follow: () => this.g.player.feet(), when: () => this.items.has('fries') && !this.busy && inBox2(this.g.player.feet(), L.areas.pier) });

    // ---------------------------------------------------------------- Parasail
    this.root.add(this.psBoat, this.chute);
    this.chute.visible = false;
    this.boatGuy = new Actor(this.root, 'Boat Guy', 333, { shirt: 0xf6d23a });
    this.psBoat.position.set(386, SEA - 0.4, PIER_END + 4);
    this.psBoat.rotation.y = Math.PI / 2;
    this.spot({ id: 'parasail', pos: v(388, DECK, PIER_END - 10), radius: 3, prompt: 'Ride the parasail ($40)', when: () => !this.busy });
    this.spot({ id: 'chew', pos: v(0, 0, 0), radius: 99, prompt: '', label: () => `Chew through the tow rope (${this.chews} / 12)`, follow: () => this.g.player.feet(), when: () => this.busy === 'parasail' && !this.psFree && this.psT > 9 });

    // ---------------------------------------------------------------- Marlin charter
    this.charter.position.copy(this.charterPos);
    this.root.add(this.charter, this.marlin);
    this.marlin.visible = false;
    this.boatCollider(this.charterPos, 2.2, 6, 1.06);
    this.captain = new Actor(this.root, 'Captain Hal', 444, { shirt: 0xffffff, hat: 0x1d2b4f, beard: true });
    this.captain.place(this.charterPos.clone().add(v(0, 1.06, 1)), Math.PI);
    const tackle = M.tackleBox();
    tackle.position.copy(this.charterPos).add(v(1.2, 1.06, -3));
    this.root.add(tackle);
    const charters = L.shops.find((s) => s.id === 'charters')!;
    this.spot({ id: 'charter', pos: charters.counter, radius: 3, prompt: 'Charter a fishing boat ($100, free for fishermen)' });
    this.spot({ id: 'tour', pos: charters.counter.clone().add(v(3, 0, 0)), radius: 2.4, prompt: 'Buy a whale-watching tour ($60)' });
    this.spot({ id: 'rope', pos: tackle.position.clone().setY(this.charterPos.y + 1.06), radius: 2, prompt: 'Take the rope from the tackle box', when: () => !this.items.has('rope') });
    this.spot({ id: 'tie', pos: this.charterPos.clone().add(v(0, 1.06, -4.5)), radius: 2.5, prompt: 'Tie the fishing line around your waist', when: () => this.items.has('rope') && !this.tied });
    this.spot({ id: 'cast', pos: this.charterPos.clone().add(v(0, 1.06, -4.5)), radius: 2.5, prompt: 'Cast the line', when: () => !this.casting });
    this.spot({ id: 'charterback', pos: this.charterPos.clone().add(v(0, 1.06, 2.5)), radius: 2, prompt: 'Head back to the harbor' });

    // ---------------------------------------------------------------- Anchor
    this.anchorMesh.position.copy(L.harbor.anchorDrop).add(v(0, 2, 0));
    this.root.add(this.anchorMesh);
    this.chest.position.set(L.harbor.anchorDrop.x + 1.5, ctx.world.topY(L.harbor.anchorDrop.x + 1, L.harbor.anchorDrop.z + 4), L.harbor.anchorDrop.z + 4);
    this.cart.position.set(L.harbor.anchorDrop.x - 1.5, ctx.world.topY(L.harbor.anchorDrop.x - 2, L.harbor.anchorDrop.z + 3), L.harbor.anchorDrop.z + 3);
    this.cart.rotation.z = 0.5;
    this.root.add(this.chest, this.cart);
    this.spot({ id: 'chain', pos: L.harbor.anchorDrop, radius: 2.4, prompt: 'Wrap the anchor chain around your foot', when: () => !this.chained && !this.busy });
    this.spot({ id: 'winch', pos: L.harbor.anchorWinch, radius: 2.4, prompt: 'Release the anchor', when: () => !this.busy });

    // ---------------------------------------------------------------- Whale tour
    this.root.add(this.whale, this.tour, this.ring);
    this.ring.visible = false;
    this.tour.position.copy(this.tourPos);
    this.boatCollider(this.tourPos, 2.2, 6, 1.06);
    this.guide = new Actor(this.root, 'Tour Guide Tina', 555, { shirt: 0x2a8ae0, hat: 0xffffff });
    this.guide.place(this.tourPos.clone().add(v(0, 1.06, 2)), Math.PI);
    const kn = M.knife();
    kn.position.copy(this.tourPos).add(v(-1.4, 1.3, -3));
    const bk = M.bucket();
    bk.position.copy(this.tourPos).add(v(1.4, 1.3, -3.5));
    const rr = M.lifeRing();
    rr.position.copy(this.tourPos).add(v(2.25, 2, 0));
    rr.rotation.y = Math.PI / 2;
    this.root.add(kn, bk, rr);
    this.spot({ id: 'knife', pos: kn.position.clone().setY(this.tourPos.y + 1.06), radius: 2, prompt: 'Take the bait knife', when: () => !this.items.has('knife') });
    this.spot({ id: 'bucket', pos: bk.position.clone().setY(this.tourPos.y + 1.06), radius: 2, prompt: 'Take the krill bucket', when: () => !this.items.has('bucket') });
    this.spot({ id: 'cutring', pos: rr.position.clone().setY(this.tourPos.y + 1.06), radius: 2.4, prompt: 'Cut the life ring rope', when: () => this.items.has('knife') && !this.ringCut });
    this.spot({ id: 'tourback', pos: this.tourPos.clone().add(v(0, 1.06, 3)), radius: 2, prompt: 'Head back to the harbor' });

    // ---------------------------------------------------------------- Sub
    this.root.add(this.sub);
    this.sub.position.copy(L.harbor.subDock).add(v(4, -1.4, 6));
    this.subPos.copy(this.sub.position);
    const subs = L.shops.find((s) => s.id === 'subs')!;
    this.davy = new Actor(this.root, 'Davy', 666, { shirt: 0x6b8e23, beard: true, hat: 0x222222 });
    this.davy.place(subs.counter.clone().add(v(0, 0, -1.5)), 0);
    const keysPos = subs.counter.clone().add(v(3.5, 0, -2.5));
    const keyMesh = M.keys();
    keyMesh.position.copy(keysPos).add(v(0, 1.6, 0));
    this.root.add(keyMesh);
    const ws = M.screwdriver();
    ws.position.copy(L.harbor.workshop).add(v(0, 1.1, 0));
    this.root.add(ws);
    this.spot({ id: 'buysub', pos: subs.counter, radius: 3, prompt: 'Buy the submarine ($5,000)', when: () => !this.ownsSub && !this.items.has('subkeys') });
    this.spot({ id: 'subkeys', pos: keysPos, radius: 2, prompt: 'Take the sub keys off the hook', when: () => !this.ownsSub && !this.items.has('subkeys') });
    this.spot({ id: 'screwdriver', pos: L.harbor.workshop, radius: 2.5, prompt: 'Take a screwdriver', when: () => !this.items.has('screwdriver') });
    this.spot({ id: 'boardsub', pos: L.harbor.subDock, radius: 3, prompt: 'Climb into the submarine', when: () => !this.busy });
    this.spot({ id: 'governor', pos: v(0, 0, 0), radius: 99, prompt: 'Unscrew the safety governor', follow: () => this.g.player.feet(), when: () => this.busy === 'sub' && this.subPhase === 'dive' && this.items.has('screwdriver') && !this.governorOff });
    this.spot({ id: 'surface', pos: v(0, 0, 0), radius: 99, prompt: 'Surface and return to the dock', follow: () => this.g.player.feet(), when: () => this.busy === 'sub' && this.subPhase === 'dive' && this.subPos.y > SEA - 4 });

    // ---------------------------------------------------------------- Volleyball
    const vb = L.volleyball;
    const spots = [v(vb.center.x - 4, GL, vb.netZ + 5), v(vb.center.x + 4, GL, vb.netZ + 7), v(vb.center.x - 4, GL, vb.netZ - 6), v(vb.center.x + 4, GL, vb.netZ - 5)];
    const names = ['Brock (pro)', 'Kyle', 'Steve', 'Dana'];
    spots.forEach((p, i) => {
      const a = new Actor(this.root, names[i], 1200 + i, { shirt: i < 2 ? 0x111111 : 0xf6d23a, width: i === 0 ? 1.35 : 1.0, height: i === 0 ? 1.05 : 0.98 });
      a.place(p, i < 2 ? Math.PI : 0);
      a.userHome = p.clone();
      this.vbPlayers.push(a);
    });
    this.root.add(this.ball);
    this.ballFrom.copy(spots[0]).setY(GL + 2);
    this.ballTo.copy(spots[2]).setY(GL + 2);
    this.spot({ id: 'joinvb', pos: vb.center.clone().add(v(0, 0, -8)), radius: 4, prompt: 'Join the volleyball game', when: () => !this.joined });
    this.spot({ id: 'taunt', pos: vb.center.clone().add(v(0, 0, -5)), radius: 9, prompt: '', label: () => `Taunt the pro (${this.taunts} / 3)`, when: () => this.joined && !this.spikeAt && this.busy !== 'volley' });

    // ---------------------------------------------------------------- Cruise
    const cr = L.cruise;
    this.buffetSign.mesh.position.set(cr.buffet.x - 1.5, cr.lido + 3.2, cr.buffet.z);
    this.buffetSign.mesh.rotation.y = Math.PI / 2;
    this.root.add(this.buffetSign.mesh);
    for (let i = 0; i < cr.queue.length; i++) {
      const a = new Actor(this.root, 'Passenger', 1500 + i, { shirt: [0xff7fb0, 0xffffff, 0x5ad0ff, 0xf6d23a][i % 4], width: 1.1 + (i % 3) * 0.15 });
      a.place(cr.queue[i].clone(), -Math.PI / 2);
      this.passengers.push(a);
    }
    for (let x = cr.buffet.x - 2; x < cr.buffet.x + 1; x++) {
      for (let k = -5; k <= 5; k += 2) M.cube(0.5, 0.3, 0.5, [0xe8a040, 0xf2d020, 0xe05a3a, 0x8ae05a][(k + 5) % 4], cr.buffet.x - 3.5, cr.lido + 1.15, cr.buffet.z + k, this.root);
    }
    this.spot({ id: 'tender', pos: L.harbor.tenderDock, radius: 3, prompt: 'Take the tender to the cruise ship ($25)' });
    this.spot({ id: 'tenderback', pos: cr.arrive, radius: 3, prompt: 'Take the tender back to the harbor' });
  }

  // ---------------------------------------------------------------- helpers
  private spot(s: Omit<Spot, 'enabled'> & { enabled?: boolean }) {
    const sp = { enabled: true, ...s } as Spot;
    this.interactables.push(sp);
    return sp;
  }

  private boatCollider(at: V, hx: number, hz: number, top: number) {
    const body = this.ctx.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(at.x, at.y + top - 0.7, at.z));
    this.ctx.physics.createCollider(RAPIER.ColliderDesc.cuboid(hx, 0.7, hz).setCollisionGroups(groups(G_WORLD, G_ALL)), body);
    // Low rails so you don't fall off the side by accident.
    for (const s of [-1, 1]) this.ctx.physics.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 0.4, hz).setTranslation(s * hx, 1.1, 0).setCollisionGroups(groups(G_WORLD, G_ALL)), body);
    this.bodies.push(body);
  }

  private later(sec: number, fn: () => void) {
    this.timers.push({ t: sec, fn });
  }

  private get hour() {
    return (10 + this.clock / HOUR_SECONDS) % 24;
  }

  private clockLabel() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${((h + 11) % 12) + 1}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  private job() {
    return this.g.body?.job ?? '';
  }

  private isCrew() {
    return CREW.some((c) => this.job().includes(c));
  }

  private isLifeguard() {
    return this.job().includes('Lifeguard');
  }

  private feet() {
    return this.g.player.feet();
  }

  private pastBuoys(p = this.feet()) {
    return p.z > BUOY_Z && p.x > 140 && p.x < 612;
  }

  private inRip(p = this.feet()) {
    return inBox2(p, this.L.ripZone);
  }

  private inReef(p: V) {
    const dx = (p.x - 250) / 52, dz = (p.z - 480) / 42;
    return dx * dx + dz * dz < 1;
  }

  /** Tower lifeguard can see a point: in range, seaward of his tower, and he's in it. */
  private guardSees(p: V) {
    return this.guards.some((gd, i) => {
      if (gd === this.chet && this.chetState !== 'tower') return false;
      const t = this.L.towers[i];
      return flat(t, p) < 60 && p.z > t.z - 1;
    });
  }

  private resetBody() {
    const p = this.g.player;
    p.carry = null;
    p.floaty = false;
    p.swimMul = 1;
    p.current.set(0, 0, 0);
    this.items.clear();
    this.bleeding = false;
    this.busy = null;
    this.tied = false;
    this.casting = false;
    this.chained = false;
    this.joined = false;
    this.taunts = 0;
    this.spikeAt = false;
    this.capThrown = false;
    this.splashT = 0;
    this.holdT = 0;
    this.buriedAt = null;
    this.mound.clear();
    this.friesMesh.removeFromParent();
    for (const f of this.flock) this.root.remove(f.m);
    this.flock = [];
    this.chute.visible = false;
    this.ring.visible = false;
    this.smallShark.visible = false;
    this.bigShark.visible = false;
    this.marlin.visible = false;
    this.sub.scale.setScalar(1);
    this.sub.position.copy(this.L.harbor.subDock).add(v(4, -1.4, 6));
    this.subPos.copy(this.sub.position);
    this.governorOff = false;
    this.restoreFog();
    if (this.joined) this.vbPlayers[2].place(this.vbPlayers[2].userHome!, 0);
    this.timers = [];
  }

  private restoreFog() {
    const f = this.scene.fog as THREE.Fog | null;
    if (f && this.fogBase) {
      f.color.copy(this.fogBase.color);
      f.near = this.fogBase.near;
      f.far = this.fogBase.far;
    }
  }

  private die(id: string, vel: V, spin = 8, bounce = 0.45) {
    const p = this.g.player;
    p.carry = null;
    p.floaty = false;
    this.tube.visible = false;
    const ch = this.g.character;
    if (ch) ch.root.scale.setScalar(ch.app.height);
    this.busy = null;
    this.g.kill(id, { kind: 'ragdoll', vel, spin, bounce });
  }

  // ---------------------------------------------------------------- interact
  interact(id: string) {
    const g = this.g;
    const p = this.feet();
    const L = this.L;
    if (id.startsWith('puffer')) return this.poke(this.puffers[Number(id.slice(6))]);
    if (id.startsWith('palm')) return this.shake(Number(id.slice(4)));
    switch (id) {
      case 'tube':
        if (!g.spend(10, 'Inner tube rental')) return;
        this.items.add('tube');
        g.sound.cash();
        g.toast('INNER TUBE', 'It goes on in the water. Paddle with WASD.', 2200);
        return;
      case 'brochure':
        g.sound.noise({ dur: 0.15, vol: 0.4, freq: 3000, type: 'highpass' });
        this.bleeding = true;
        g.toast('OW. PAPERCUT.', 'You are now, technically, bleeding.', 2400);
        g.flash('#ff2020', 200);
        return;
      case 'valvecap':
        this.capThrown = true;
        this.skiCap = p.clone().add(v((Math.random() - 0.5) * 30, 0, -12 - Math.random() * 10));
        this.chetState = 'search';
        this.chetTimer = 15;
        g.say('Chet', 'Wait, is that my valve cap? Nobody move!', 2600);
        g.sound.whoosh();
        return;
      case 'payphone': {
        g.sound.tone({ f: 440, dur: 0.15, type: 'sine', vol: 0.15 });
        g.sound.tone({ f: 480, dur: 0.15, type: 'sine', vol: 0.15, at: 0.2 });
        g.say('You', '"Hi, Snack Attack? Lunch order for the lifeguards. Yeah, all of them. Extra onions."', 3200);
        this.later(3, () => {
          this.chetState = 'snack';
          this.chetTimer = 120;
          this.chet.pose = 'walk';
          const snack = L.shops.find((s) => s.id === 'snackbar')!;
          this.chet.goto(snack.door.clone(), 5);
          g.say('Chet', 'Free food? Cover for me, Rick.', 2400);
        });
        return;
      }
      case 'bury': {
        const body = g.body!;
        if (body.age < 18) {
          g.say('Kid', "We don't bury kids. That's weird.", 2400);
          return;
        }
        const t = this.ctx.world.topY(p.x, p.z);
        if (Number.isNaN(this.tide) || t < SEA - 1) return;
        this.busy = 'buried';
        this.buriedAt = v(p.x, t - 1.35, p.z);
        g.player.lock(true);
        const at = this.buriedAt.clone();
        g.player.carry = () => at;
        this.mound.clear();
        const m = M.cube(1.8, 0.5, 2.6, 0xd6bf80, p.x, t + 0.15, p.z + 0.6, this.mound);
        m.castShadow = false;
        this.kids.forEach((k, i) => {
          k.goto(p.clone().add(v(Math.cos(i * 2) * 1.4, 0, Math.sin(i * 2) * 1.4)), 3);
          k.pose = 'cheer';
        });
        g.sound.munch();
        g.toast('BURIED', 'The kids did a great job. Only your head sticks out.', 2600);
        this.later(4, () => this.kids.forEach((k, i) => (k.pose = 'stand', k.goto(L.sandcastle.clone().add(v(Math.cos(i * 2.1) * 3.6, 0, Math.sin(i * 2.1) * 3.6)), 2))));
        return;
      }
      case 'dig':
        this.unbury();
        g.toast('FREE', 'You wiggle out. Sand everywhere. Everywhere.', 1800);
        return;
      case 'build': {
        this.castleH++;
        this.castleCool = 1.6;
        g.sound.munch();
        this.kids.forEach((k) => (k.pose = 'cheer'));
        this.later(1.2, () => this.kids.forEach((k) => (k.pose = 'stand')));
        this.rebuildCastle();
        if (this.castleH === 5) g.toast('A FIVE-METER SANDCASTLE', 'It has a door. It has a bedroom. It is not structurally sound.', 3000);
        return;
      }
      case 'nap':
        return this.nap();
      case 'fries':
        if (!g.spend(12, 'Jumbo fries')) return;
        this.items.add('fries');
        g.sound.cash();
        g.toast('JUMBO FRIES', 'Somewhere, a gull opens one eye.', 2200);
        return;
      case 'holdfries':
        return this.startGulls();
      case 'parasail':
        if (!g.spend(40, 'Parasail ride')) return;
        return this.startParasail();
      case 'chew':
        this.chews++;
        g.sound.crunch();
        g.character?.kick(0.3);
        if (this.chews >= 12) this.snapRope();
        return;
      case 'charter': {
        const fisher = this.isCrew();
        if (!fisher && !g.spend(100, 'Fishing charter')) return;
        g.toast('REEL DEAL CHARTERS', fisher ? 'Crew rides free.' : 'Captain Hal takes you out.', 2000);
        this.items.delete('rope');
        this.tied = false;
        g.player.teleport(this.charterPos.clone().add(v(0, 1.2, 0)), Math.PI);
        return;
      }
      case 'rope':
        this.items.add('rope');
        g.toast('ROPE', 'A good strong rope. For tying things.', 1600);
        return;
      case 'tie':
        if (this.seasick > 0) {
          this.tied = true;
          g.toast('TIED ON', 'The line is around your waist. The captain is busy throwing up.', 2400);
        } else {
          g.say('Captain Hal', "What are you doing? Untie that. Nobody ties themselves to my line.", 2800);
          g.sound.denied();
        }
        return;
      case 'cast':
        return this.cast();
      case 'charterback':
        g.player.teleport(L.harbor.charterDock.clone().add(v(0, 0.2, -4)), Math.PI);
        return;
      case 'chain':
        this.chained = true;
        g.sound.creak();
        g.toast('CHAINED', 'The anchor chain is wrapped around your ankle. Snug.', 2200);
        return;
      case 'winch':
        if (!this.isCrew()) {
          g.say('You', 'The winch has a padlock. CREW ONLY. These hands have never tied a knot.', 2800);
          g.sound.denied();
          return;
        }
        return this.dropAnchor();
      case 'tour':
        if (!g.spend(60, 'Whale tour')) return;
        this.ringCut = false;
        g.toast('WHALE WATCHING', 'Tour Guide Tina welcomes you aboard. Please stay on the boat.', 2600);
        g.player.teleport(this.tourPos.clone().add(v(0, 1.2, 0)), Math.PI);
        return;
      case 'knife':
        this.items.add('knife');
        g.toast('BAIT KNIFE', 'Sharp. Smells like squid.', 1600);
        return;
      case 'bucket':
        this.items.add('bucket');
        g.toast('KRILL BUCKET', 'A bucket of tiny shrimp. Whales love these.', 1800);
        return;
      case 'cutring':
        this.ringCut = true;
        g.sound.noise({ dur: 0.1, vol: 0.4, freq: 2000, type: 'bandpass' });
        g.toast('SNIP', 'The life ring is no longer attached to anything.', 1800);
        return;
      case 'tourback':
        g.player.teleport(L.harbor.tourDock.clone().add(v(0, 0.2, -4)), Math.PI);
        return;
      case 'buysub': {
        const rich = (g.body?.netWorth ?? 0) >= 1_000_000;
        if (rich) {
          this.ownsSub = true;
          g.sound.cash();
          g.say('Davy', 'Cash? From your own wallet? Pleasure doing business, rich guy.', 2600);
          return;
        }
        if (!g.spend(5000, 'Discount submarine')) return;
        this.ownsSub = true;
        g.say('Davy', 'Sold. No refunds. No questions. Keys are in it.', 2400);
        return;
      }
      case 'subkeys':
        if (!this.davyOut) {
          g.say('Davy', "Hey! Those don't belong to you, pal.", 2200);
          g.sound.denied();
          return;
        }
        this.items.add('subkeys');
        g.sound.pull();
        g.toast('SUB KEYS', 'Davy is out back smoking. He will never know.', 2200);
        return;
      case 'screwdriver':
        this.items.add('screwdriver');
        g.toast('SCREWDRIVER', 'Flathead. Fits most safety devices.', 1800);
        return;
      case 'boardsub':
        if (!this.ownsSub && !this.items.has('subkeys')) {
          g.say('You', "It's locked. It needs keys. Or money. Preferably someone else's.", 2600);
          g.sound.denied();
          return;
        }
        return this.startSub();
      case 'governor':
        this.governorOff = true;
        g.sound.crunch();
        g.toast('GOVERNOR REMOVED', 'The red line on the depth gauge is now more of a suggestion.', 2600);
        return;
      case 'surface':
        this.endSub();
        return;
      case 'joinvb':
        this.joined = true;
        this.taunts = 0;
        this.vbPlayers[2].goto(this.vbPlayers[2].userHome!.clone().add(v(-14, 0, 0)), 3);
        g.player.teleport(this.vbPlayers[2].userHome!.clone().add(v(0, 0.2, 0)), 0);
        g.say('Brock', "Fresh meat! Don't cry when I spike it, bro.", 2600);
        return;
      case 'taunt': {
        this.taunts++;
        const lines = ['"Nice shorts, Brock. Did your mom pick those?"', '"I\'ve seen better spikes on a hedgehog."', '"You serve like a retiree."'];
        g.say('You', lines[Math.min(2, this.taunts - 1)], 2400);
        this.spikeAt = true;
        this.later(2.4, () => g.say('Brock', ['Oh, it is ON.', "You're gonna regret that.", 'THAT. IS. IT.'][Math.min(2, this.taunts - 1)], 2000));
        return;
      }
      case 'tender':
        if (!g.spend(25, 'Cruise tender')) return;
        g.toast('THE MAJESTIC MORTALIS', 'All-you-can-eat buffet on the lido deck. Opens every 90 seconds.', 3000);
        g.player.teleport(L.cruise.arrive.clone().add(v(0, 0.2, 0)), -Math.PI / 2);
        return;
      case 'tenderback':
        g.player.teleport(L.harbor.tenderDock.clone().add(v(0, 0.2, -4)), Math.PI);
        return;
    }
  }

  // ---------------------------------------------------------------- puzzles
  private unbury() {
    this.busy = null;
    this.buriedAt = null;
    this.mound.clear();
    this.g.player.carry = null;
    this.g.player.lock(false);
    const p = this.feet();
    this.g.player.teleport(p.setY(this.ctx.world.topY(p.x, p.z) + 0.2));
  }

  private rebuildCastle() {
    this.castle.clear();
    const c = this.L.sandcastle;
    for (let i = 0; i < this.castleH; i++) {
      const s = 4.2 - i * 0.55;
      M.cube(s, 1, s, 0xd6bf80, c.x, c.y + 0.5 + i, c.z, this.castle);
    }
    if (this.castleH >= 5) {
      M.cube(1.2, 1.6, 0.1, 0x5a4a2e, c.x, c.y + 0.8, c.z + 2.12, this.castle);
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) M.cube(0.8, 1.5, 0.8, 0xd6bf80, c.x + dx, c.y + 5.6, c.z + dz, this.castle);
    }
  }

  private nap() {
    const g = this.g;
    const c = this.L.sandcastle;
    g.player.teleport(c.clone().add(v(0, 0.1, 0)));
    g.player.lock(true);
    this.busy = 'nap';
    g.toast('Zzz', 'A nice cool nap in the shade of five meters of wet sand.', 2400);
    const seen = this.chetState === 'tower';
    this.later(2.5, () => {
      if (this.busy !== 'nap') return;
      if (seen) {
        g.say('Chet', 'HEY! Out of the sandcastle! That thing is a death trap!', 2800);
        this.later(1.5, () => {
          g.player.lock(false);
          g.player.knock(v(0, 6, 8));
          this.busy = null;
        });
        return;
      }
      g.sound.creak();
      g.shake(0.5);
      this.later(1.2, () => {
        g.sound.slam();
        g.sound.splat();
        g.shake(1.2);
        g.particles.burst(c.clone().add(v(0, 1.5, 0)), 60, 0xd6bf80, 8, { life: 1.4, size: 0.3 });
        this.castleH = 0;
        this.castle.clear();
        this.busy = null;
        g.kill('sandcastle', { kind: 'pancake' });
      });
    });
  }

  private startGulls() {
    const g = this.g;
    const ch = g.character;
    if (!ch) return;
    this.busy = 'gulls';
    this.holdT = 0;
    g.player.lock(true);
    ch.parts.head.pivot.add(this.friesMesh);
    this.friesMesh.position.set(0, 1.2, 0);
    g.toast('FRIES UP', "Here, birdies. Here, birdies.", 2000);
  }

  private liftOff() {
    const g = this.g;
    const L = this.L;
    const marks = [
      { name: 'the Ferris wheel', p: L.ferris.clone().add(v(0, 26, 0)) },
      { name: 'the lighthouse', p: L.lighthouse.top.clone().add(v(0, 4, 0)) },
      { name: 'a cruise ship', p: v(500, L.cruise.lido + 2, (L.cruise.z0 + L.cruise.z1) / 2) },
      { name: 'the harbor master', p: v(635, GL + 8, 195) },
      { name: 'Big Al\'s Surf & Turf', p: v(260, GL + 7, 135) },
    ];
    const feeble = g.body?.physical === 'Feeble';
    const start = this.feet();
    const sorted = marks.slice().sort((a, b) => flat(b.p, start) - flat(a.p, start));
    const mark = feeble ? sorted[0] : sorted[Math.floor(Math.random() * sorted.length)];
    g.toast('LIFTOFF', `Thirty gulls and one ${g.body?.job ?? 'person'}. Destination: ${mark.name}.`, 3000);
    g.sound.scream(1.3);
    const dur = 7;
    let t = 0;
    const over = mark.p.clone();
    g.player.carry = () => {
      t += 1 / 60;
      const k = Math.min(1, t / dur);
      const pos = start.clone().lerp(over, k);
      pos.y = start.y + Math.sin(Math.min(1, t / 2) * Math.PI * 0.5) * (mark.p.y + 18 - start.y) + Math.sin(t * 6) * 0.3;
      if (k >= 1) {
        // Drop.
        this.later(0, () => {
          g.player.carry = null;
          this.friesMesh.removeFromParent();
          g.player.lock(false);
          g.player.knock(v(0, -2, 0));
          this.items.delete('fries');
          this.busy = 'gulls';
          (this as unknown as { gullDrop: string }).gullDrop = mark.name;
          for (const f of this.flock) f.off.y += 30;
          this.later(4, () => {
            for (const f of this.flock) this.root.remove(f.m);
            this.flock = [];
          });
        });
      }
      return pos;
    };
  }

  private startParasail() {
    const g = this.g;
    this.busy = 'parasail';
    this.psT = 0;
    this.chews = 0;
    this.psFree = false;
    this.chute.visible = true;
    g.player.lock(true);
    this.boatGuy.place(this.psBoat.position.clone().add(v(0, 1.1, 0)), Math.PI);
    g.say('Boat Guy', 'Sit back, relax, and absolutely do not chew on anything.', 2800);
    g.player.carry = () => this.psPos;
  }

  private snapRope() {
    const g = this.g;
    if (!this.windy) {
      g.say('Boat Guy', 'HEY! Quit chewing! Reeling you in, buddy!', 2600);
      g.sound.denied();
      this.psT = 100; // reel-in phase
      return;
    }
    g.say('Boat Guy', "The winch is jammed! It's the wind! Don't do it! ...He did it.", 3000);
    g.sound.noise({ dur: 0.2, vol: 0.6, freq: 1200, type: 'bandpass' });
    this.psFree = true;
    this.psSpin = 0;
  }

  private cast() {
    const g = this.g;
    this.casting = true;
    g.sound.whoosh();
    if (this.hour < 14) {
      this.later(2, () => {
        g.toast('NOTHING', 'Not a nibble. The big ones feed in the afternoon.', 2400);
        this.casting = false;
      });
      return;
    }
    this.later(3, () => {
      if (!this.g.body) return;
      g.sound.creak();
      g.shake(0.6);
      this.marlin.visible = true;
      this.marlin.position.copy(this.charterPos).add(v(0, 0.5, -22));
      this.marlin.rotation.set(-0.6, Math.PI, 0);
      this.later(1.2, () => (this.marlin.visible = false));
      g.toast('FISH ON!', 'A giant marlin leaps off the stern!', 2000);
      if (!this.tied) {
        this.later(1.5, () => {
          g.toast('SNAP', 'It broke the line. It was the size of a canoe.', 2200);
          this.casting = false;
        });
        return;
      }
      if (this.seasick <= 0) {
        this.later(1, () => {
          g.say('Captain Hal', 'Not on my boat!', 2000);
          g.sound.noise({ dur: 0.1, vol: 0.5, freq: 2500, type: 'bandpass' });
          this.tied = false;
          this.casting = false;
        });
        return;
      }
      // Water-skiing on your face, then the jump.
      this.busy = 'marlin';
      g.player.lock(true);
      g.sound.scream(1.1);
      let t = 0;
      const start = this.charterPos.clone().add(v(0, 0, -6));
      g.player.carry = () => {
        t += 1 / 60;
        const p = start.clone().add(v(Math.sin(t * 1.3) * 14, 0, -t * 14));
        p.y = this.tide - 0.4 + Math.abs(Math.sin(t * 9)) * 0.6;
        this.marlin.visible = true;
        this.marlin.position.copy(p).add(v(0, 0.2, -8));
        this.marlin.rotation.set(0, Math.PI, 0);
        if (Math.random() < 0.5) g.particles.emit(p, v(0, 3, 4), 0xffffff, { life: 0.6, size: 0.25, gravity: 10, spread: 3 });
        if (t > 4.5 && this.busy === 'marlin') {
          this.busy = null;
          this.later(0, () => {
            this.marlin.position.y += 6;
            this.marlin.rotation.x = -0.8;
            g.sound.splat();
            this.die('marlin', v(Math.sin(t * 1.3) * 6, 24, -18), 12, 0.5);
            this.later(1.5, () => (this.marlin.visible = false));
          });
        }
        return p;
      };
    });
  }

  private dropAnchor() {
    const g = this.g;
    const L = this.L;
    const drop = L.harbor.anchorDrop;
    g.sound.creak();
    g.sound.noise({ dur: 1.2, vol: 0.5, freq: 600, freq2: 200 });
    let t = 0;
    const bed = this.ctx.world.topY(drop.x, drop.z + 2);
    if (!this.chained) {
      this.anchorMesh.position.copy(drop).add(v(0, 0, 2));
      const fall = () => {
        this.anchorMesh.position.y -= 0.3;
        if (this.anchorMesh.position.y > bed + 1) this.later(0.016, fall);
        else this.later(5, () => this.anchorMesh.position.copy(drop).add(v(0, 2, 0)));
      };
      fall();
      g.toast('SPLOOSH', 'The anchor drops. Alone.', 1600);
      return;
    }
    this.busy = 'anchor';
    g.player.lock(true);
    g.sound.scream(1.0);
    g.toast('ANCHORS AWAY', 'Your foot goes first. The rest of you follows.', 2400);
    const from = drop.clone().add(v(0, 0, 2));
    g.player.carry = () => {
      t += 1 / 60;
      const y = Math.max(bed - 0.6, from.y - t * t * 8);
      const p = v(from.x, y, from.z);
      this.anchorMesh.position.copy(p).add(v(0, -1.6, 0));
      if (Math.random() < 0.3) g.particles.emit(p.clone().add(v(0, 1.5, 0)), v(0, 3, 0), 0xddeeff, { life: 1, size: 0.12, gravity: -2, spread: 0.6 });
      if (y <= bed - 0.6 && this.busy === 'anchor') {
        this.busy = null;
        g.sound.land(1);
        g.particles.burst(p, 30, 0x5a4a2e, 3, { life: 1.5, size: 0.3, gravity: 2 });
        this.later(0.6, () => {
          const lid = this.chest.getObjectByName('lid');
          if (lid) lid.rotation.x = -1.6;
          g.sound.cash();
          g.toast('TREASURE!', "It's... a Mortalis Mutual brochure. \"Have you thought about life insurance?\"", 3200);
        });
        this.later(3.4, () => {
          this.die('anchor', v(0, 1, 0), 2, 0.1);
          this.later(6, () => {
            const lid = this.chest.getObjectByName('lid');
            if (lid) lid.rotation.x = 0;
            this.anchorMesh.position.copy(drop).add(v(0, 2, 0));
          });
        });
      }
      return p;
    };
  }

  private startSub() {
    const g = this.g;
    this.busy = 'sub';
    this.subPhase = 'drive';
    this.subT = 0;
    g.player.lock(true);
    const ch = g.character;
    if (ch) ch.root.scale.setScalar(0.001);
    if (this.scene.fog instanceof THREE.Fog) this.fogBase = { color: this.scene.fog.color.clone(), near: this.scene.fog.near, far: this.scene.fog.far };
    g.toast("DAVY'S DISCOUNT SUB", 'Heading for the trench. Space rises, Shift dives.', 3000);
    this.subPos.copy(this.sub.position);
    g.player.carry = () => this.subPos.clone().add(v(0, 0.5, 0));
  }

  private endSub() {
    const g = this.g;
    this.busy = null;
    this.restoreFog();
    g.player.carry = null;
    g.player.lock(false);
    const ch = g.character;
    if (ch) ch.root.scale.setScalar(ch.app.height);
    this.sub.position.copy(this.L.harbor.subDock).add(v(4, -1.4, 6));
    this.subPos.copy(this.sub.position);
    g.player.teleport(this.L.harbor.subDock.clone().add(v(0, 0.2, 0)), Math.PI);
  }

  private shake(i: number) {
    const g = this.g;
    const n = (this.shakes.get(i) ?? 0) + 1;
    this.shakes.set(i, n);
    g.sound.noise({ dur: 0.5, vol: 0.35, freq: 1800, type: 'bandpass', q: 0.8 });
    g.character?.kick(0.35);
    g.shake(0.15);
    const c = this.L.palms[i];
    for (let k = 0; k < 6; k++) g.particles.emit(c.clone().add(v((Math.random() - 0.5) * 6, 1, (Math.random() - 0.5) * 6)), v(0, -1, 0), 0x4caa3a, { life: 1.2, size: 0.15, gravity: 3 });
    if (n < 3) {
      g.toast(n === 1 ? '*rustle*' : '*RUSTLE*', n === 1 ? '' : 'Something up there is loose.', 1000);
      return;
    }
    this.shakes.set(i, 0);
    // The third shake knocks one loose. It drops straight down from the crown.
    const at = c.clone().add(v(Math.random() < 0.5 ? 1 : -1, 0, 0));
    let ground = Math.floor(c.y) - 2;
    while (ground > 0 && !this.ctx.world.get(Math.floor(at.x), ground - 1, Math.floor(at.z))) ground--;
    const m = M.coconut();
    m.position.copy(at);
    this.root.add(m);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(at.x, ground + 0.03, at.z);
    this.root.add(shadow);
    this.nuts.push({ m, vy: 0, ground, shadow, at });
    g.toast('*CRACK*', '', 800);
  }

  private updateNuts(dt: number) {
    const g = this.g;
    for (const n of this.nuts.slice()) {
      if (n.vy === 0 && !n.m.userData.wait) n.m.userData.wait = 0.9;
      if (n.m.userData.wait > 0) {
        n.m.userData.wait -= dt;
        n.m.rotation.z = Math.sin(performance.now() * 0.05) * 0.2;
        if (n.m.userData.wait <= 0) n.vy = -0.01;
        continue;
      }
      n.vy -= 30 * dt;
      n.m.position.y += n.vy * dt;
      const head = this.feet().add(v(0, 1.75, 0));
      if (g.body && !this.busy && flat(head, n.m.position) < 0.75 && Math.abs(head.y - n.m.position.y) < 0.6) {
        g.sound.tone({ f: 900, f2: 300, dur: 0.25, type: 'square', vol: 0.2 });
        g.sound.boing();
        this.busy = 'shark';
        g.player.lock(true);
        g.toast('BONK', 'Stars circle overhead.', 1800);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          g.particles.emit(head.clone().add(v(Math.cos(a) * 0.6, 0.4, Math.sin(a) * 0.6)), v(-Math.sin(a), 0, Math.cos(a)), 0xffe46a, { life: 1.4, size: 0.12, gravity: 0 });
        }
        const ch = g.character;
        let t = 0;
        const timber = () => {
          t += 1 / 30;
          if (ch) ch.spinner.rotation.x = -Math.min(1.4, t * t * 2);
          if (t < 0.9) return this.later(1 / 30, timber);
          // A crab takes the hat.
          const crab = this.crabs[1];
          if (crab) crab.p.set(head.x + 2, crab.p.y, head.z);
          this.die('coconut', v(0, 1, 0), 1, 0.2);
        };
        this.later(0.6, timber);
        n.vy = 4;
        n.m.position.y = head.y + 0.2;
        continue;
      }
      if (n.m.position.y <= n.ground + 0.25) {
        n.m.position.y = n.ground + 0.25;
        g.sound.land(0.3);
        this.nuts.splice(this.nuts.indexOf(n), 1);
        this.root.remove(n.shadow);
        this.later(8, () => this.root.remove(n.m));
      }
    }
  }

  private poke(pf: (typeof this.puffers)[number]) {
    const g = this.g;
    if (!pf || this.busy) return;
    pf.pokes++;
    pf.size = 1 + pf.pokes * pf.pokes * 0.35;
    g.sound.boing();
    const lines = ['Puff.', 'PUFF.', 'It looks annoyed.', 'It is the size of a beach ball.', 'It is the size of a dog.', 'It is the size of a jet ski.', 'IT IS THE SIZE OF A HATCHBACK.'];
    g.toast(lines[Math.min(lines.length - 1, pf.pokes - 1)], '', 1400);
    if (pf.pokes >= 7) {
      this.busy = 'shark';
      g.player.lock(true);
      (pf.m.getObjectByName('spikes') as THREE.Object3D).visible = true;
      this.later(0.8, () => {
        g.sound.slam();
        g.sound.splat();
        g.shake(1);
        g.particles.burst(pf.pos, 50, 0xffffff, 10, { life: 1, size: 0.12, gravity: 4 });
        const away = this.feet().sub(pf.pos).normalize().multiplyScalar(14);
        away.y = 14;
        this.die('puffer', away, 10, 0.5);
        this.later(2, () => {
          pf.pokes = 0;
          pf.size = 1;
          (pf.m.getObjectByName('spikes') as THREE.Object3D).visible = false;
        });
      });
    }
  }

  // ---------------------------------------------------------------- hooks from the game
  onLand(e: { drop: number; launchPos: THREE.Vector3; launchState: string; landState: string }) {
    const self = this as unknown as { gullDrop?: string };
    if (self.gullDrop) {
      const name = self.gullDrop;
      self.gullDrop = undefined;
      this.busy = null;
      this.g.sound.splat();
      this.g.shake(1);
      this.g.toast('DROPPED', `Delivered to ${name}.`, 2200);
      this.die('gulls', this.g.player.vel.clone().setY(8), 12, 0.6);
      return true;
    }
    // Rocking the charter boat: jump side to side.
    const p = this.feet();
    if (flat(p, this.charterPos) < 6 && Math.abs(p.y - (this.charterPos.y + 1.06)) < 1) {
      const side = Math.sign(p.x - this.charterPos.x);
      if (side !== 0 && side !== this.lastSide) {
        this.rocks++;
        this.boatRoll = side * 0.18;
        this.g.sound.creak();
        if (this.rocks >= 6 && this.seasick <= 0) {
          this.seasick = 50;
          this.g.say('Captain Hal', 'Oh no. Oh no no no. *hurk*', 2400);
        }
      }
      this.lastSide = side;
    }
    return false;
  }

  private onSplash(e: { drop: number; speed: number; state: string }) {
    const g = this.g;
    const p = this.feet();
    this.splashFx(p, Math.min(1, e.speed / 20));
    const self = this as unknown as { gullDrop?: string };
    if (self.gullDrop) {
      this.onLand({ drop: e.drop, launchPos: p, launchState: 'fall', landState: 'fall' });
      return;
    }
    if (inBox2(p, this.L.bloom) && e.drop > 6) {
      g.sound.zap(0.6);
      g.flash('#ff8ad8', 400);
      g.toast('BLOOP', 'Forty jellyfish, one belly.', 1600);
      this.later(0.5, () => this.die('jellyfish', v(0, 6, 0), 4, 0.2));
      return;
    }
    if (e.drop > 32) {
      g.sound.splat();
      g.shake(1);
      this.die('bellyflop', v(0, 10, 0), 10, 0.4);
      return;
    }
    // Splashing in the tube past the buoys rings the dinner bell.
    if (this.g.player.floaty && this.pastBuoys(p)) {
      if (this.g.time - this.lastSplash > 2.5) this.splashT = 0;
      else this.splashT += this.g.time - this.lastSplash;
      this.lastSplash = this.g.time;
    }
  }

  private onDrown() {
    if (this.busy === 'buried' || !this.g.body) return;
    const rip = this.inRip();
    this.g.sound.gulp();
    this.die(rip ? 'rip' : 'drowned', v(0, 1, 0), 2, 0.1);
  }

  private splashFx(p: V, k: number) {
    for (let i = 0; i < 10 + k * 30; i++)
      this.g.particles.emit(v(p.x, this.tide, p.z), v((Math.random() - 0.5) * 6 * (0.5 + k), 3 + Math.random() * 7 * (0.4 + k), (Math.random() - 0.5) * 6 * (0.5 + k)), 0xe8f8ff, { life: 0.9, size: 0.18, gravity: 18 });
    this.g.sound.noise({ dur: 0.3 + k * 0.4, vol: 0.2 + k * 0.5, freq: 900, freq2: 300 });
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, time: number) {
    const g = this.g;
    if (!this.fogBase && this.scene.fog instanceof THREE.Fog)
      this.fogBase = { color: this.scene.fog.color.clone(), near: this.scene.fog.near, far: this.scene.fog.far };
    if (g.body !== this.lastBody) {
      this.resetBody();
      this.lastBody = g.body;
      const p = g.player;
      p.hooks.onSplash = (e) => this.onSplash(e);
      p.hooks.onDrown = () => this.onDrown();
    }
    // Timers (real seconds).
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.fn();

    this.clock += dt;
    this.tide = SEA + 0.9 * Math.sin((this.clock / TIDE_PERIOD) * Math.PI * 2 - Math.PI / 2);
    this.windTimer -= dt;
    if (this.windTimer <= 0) {
      this.windTimer = 35 + Math.random() * 25;
      this.windy = Math.random() < 0.45;
    }

    const storm = 0;
    let dark = 0;
    if (this.busy === 'sub') dark = Math.min(0.85, (SEA - this.subPos.y) / 60);
    this.sea.update(time, this.tide, storm, dark);

    this.updateProps(dt, time);
    this.updateLifeguards(dt);
    this.updateKids(dt);
    this.updateNuts(dt);
    this.updateVolleyball(dt);
    this.updateBuffet(dt);
    this.updateWhale(dt, time);
    this.updateDavy(dt);
    this.updateActivities(dt, time);
    this.updateSpots();
    this.updateHud();
  }

  private updateSpots() {
    for (const s of this.interactables) {
      s.enabled = !!this.g.body && (s.when ? s.when() : true);
      if (s.follow) s.pos.copy(s.follow());
      if (s.label) s.prompt = s.label();
    }
  }

  private updateHud() {
    const g = this.g;
    const tideRising = Math.cos((this.clock / TIDE_PERIOD) * Math.PI * 2 - Math.PI / 2) > 0;
    const phase = ((this.clock / TIDE_PERIOD) % 1 + 1) % 1;
    const toHigh = ((0.5 - phase + 1) % 1) * TIDE_PERIOD;
    const mm = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    const lines = [
      `<b>Sandy Shores</b> · ${this.clockLabel()}`,
      `Tide ${tideRising ? 'rising' : 'falling'} · high in ${mm(toHigh)}`,
      `Wind: ${this.windy ? '<span style="color:#ffd84a">WINDY</span>' : 'calm'}`,
    ];
    if (this.items.size) lines.push(`Carrying: ${[...this.items].join(', ')}`);
    if (this.bleeding) lines.push('<span style="color:#ff6a6a">Bleeding (papercut)</span>');
    const p = g.player;
    if (g.body && p.submerged) lines.push(`Air <span style="display:inline-block;width:120px;height:9px;border:1px solid #fff;vertical-align:middle"><span style="display:block;height:100%;width:${Math.round(p.breath * 100)}%;background:${p.breath < 0.3 ? '#ff4a4a' : '#8ad8ff'}"></span></span>`);
    if (this.busy === 'sub') {
      const depth = Math.max(0, Math.round((SEA - this.subPos.y) * 4));
      lines.push(`<span style="font-size:22px;color:${depth > 300 ? '#ff4a4a' : '#ffd84a'}">DEPTH ${depth} m</span> / red line 300 m${this.governorOff ? '' : ' (governor on)'}`);
    }
    if (this.splashT > 0 && p.floaty) lines.push(`Dinner bell: ${Math.min(10, Math.floor(this.splashT))} / 10`);
    if (this.chetState === 'snack') lines.push('Chet is at the snack bar');
    const html = lines.join('<br>');
    if (this.hud.innerHTML !== html) this.hud.innerHTML = html;
    this.hud.style.display = g.body || true ? 'block' : 'none';
  }

  private updateProps(dt: number, time: number) {
    const wheel = this.ferris.getObjectByName('wheel');
    if (wheel) {
      wheel.rotation.z += dt * 0.12;
      for (const c of wheel.userData.cars as THREE.Object3D[]) c.rotation.z = -wheel.rotation.z;
    }
    for (const f of this.flags) {
      if (f.userData.ph !== undefined) {
        f.position.y = this.tide + Math.sin(time * 1.5 + f.userData.ph) * 0.15;
        continue;
      }
      const cloth = f.getObjectByName('cloth');
      if (cloth) cloth.rotation.y = Math.sin(time * 6) * 0.3;
    }
    const wc = this.weatherFlag.getObjectByName('cloth');
    if (wc) {
      wc.rotation.y = Math.sin(time * (this.windy ? 14 : 2)) * (this.windy ? 0.5 : 0.15);
      wc.rotation.z = this.windy ? 0 : -1.1;
    }
    this.windSign.set(['WIND', this.windy ? 'WINDY · WINCH ACTING UP' : 'CALM']);
    for (const gl of this.gulls) {
      gl.a += gl.s * dt;
      gl.m.position.set(gl.c.x + Math.cos(gl.a) * gl.r, gl.h + Math.sin(time + gl.r) * 1.5, gl.c.z + Math.sin(gl.a) * gl.r);
      gl.m.rotation.y = gl.a + (gl.s > 0 ? 0 : Math.PI);
      const fl = Math.sin(time * 10 + gl.r) * 0.5;
      const wl = gl.m.getObjectByName('wl'), wr = gl.m.getObjectByName('wr');
      if (wl) wl.rotation.z = fl;
      if (wr) wr.rotation.z = -fl;
    }
    for (const f of this.fins) {
      f.a += f.s * dt;
      f.m.position.set(f.c.x + Math.cos(f.a) * f.r, this.tide - 0.85, f.c.z + Math.sin(f.a) * f.r);
      f.m.rotation.y = -f.a;
    }
    for (const c of this.crabs) {
      c.t += dt;
      c.m.position.x = c.p.x + Math.sin(c.t * 0.7) * 2;
      c.m.position.y = this.ctx.world.topY(c.m.position.x, c.p.z);
    }
    for (const j of this.jelly) {
      j.m.position.set(j.base.x + Math.sin(time * 0.3 + j.ph) * 1.5, j.base.y + (this.tide - SEA) + Math.sin(time * 1.6 + j.ph) * 0.3, j.base.z);
      j.m.scale.y = 1 + Math.sin(time * 3 + j.ph) * 0.2;
    }
    for (const f of this.reefFish) {
      f.a += f.s * dt;
      f.m.position.set(f.c.x + Math.cos(f.a) * f.r, f.y, f.c.z + Math.sin(f.a) * f.r);
      f.m.rotation.y = -f.a;
    }
    for (const pf of this.puffers) {
      pf.ph += dt;
      if (pf.pokes > 0 && Math.random() < dt / 12) pf.pokes--, (pf.size = 1 + pf.pokes * pf.pokes * 0.35);
      pf.pos.set(pf.home.x + Math.sin(pf.ph * 0.4) * 3, pf.home.y + Math.sin(pf.ph) * 0.2, pf.home.z + Math.cos(pf.ph * 0.3) * 3);
      pf.m.position.copy(pf.pos).add(v(0, (pf.size - 1) * 0.3, 0));
      const s = pf.m.scale.x + (pf.size - pf.m.scale.x) * Math.min(1, dt * 6);
      pf.m.scale.setScalar(s);
      pf.m.rotation.y = pf.ph * 0.4;
    }
    // Charter boat bobbing and rocking.
    this.boatRoll *= Math.exp(-dt * 1.2);
    this.charter.position.y = this.tide - SEA + this.charterPos.y + Math.sin(time * 1.2) * 0.05;
    this.charter.rotation.z = this.boatRoll * Math.sin(time * 4) + Math.sin(time) * 0.02;
    this.tour.position.y = this.tide - SEA + this.tourPos.y + Math.sin(time * 1.1) * 0.05;
    if (this.seasick > 0) {
      this.seasick -= dt;
      this.captain.place(this.charterPos.clone().add(v(2, 1.06, 0)), Math.PI / 2);
      this.captain.pose = 'lean';
      if (Math.random() < dt * 2) this.g.particles.emit(this.captain.pos.clone().add(v(0.8, 1.2, 0)), v(2, 0, 0), 0x9ac040, { life: 0.8, size: 0.15, gravity: 12, spread: 1 });
    } else {
      this.captain.place(this.charterPos.clone().add(v(0, 1.06, 1)), Math.PI);
      this.captain.pose = 'stand';
      if (this.rocks > 0 && Math.random() < dt / 8) this.rocks--;
    }
    this.captain.update(dt);
    this.guide.update(dt);
    this.boatGuy.update(dt);
    // Tube follows the player in the water.
    const p = this.g.player;
    p.floaty = this.items.has('tube');
    this.tube.visible = this.items.has('tube') && p.swimming && !!this.g.body;
    if (this.tube.visible) this.tube.position.copy(p.feet()).add(v(0, 0.55, 0));
    // Rip current.
    p.current.set(0, 0, 0);
    if (p.swimming && this.inRip()) {
      const f = this.feet();
      p.current.z = 3.2;
      if (f.z > 335 && this.isLifeguard()) p.current.y = -7;
    }
  }

  private updateLifeguards(dt: number) {
    const g = this.g;
    const p = this.feet();
    const L = this.L;
    for (const gd of this.guards) if (gd !== this.chet) gd.update(dt);
    const towerP = L.towers[1];
    const wantRescue =
      !!g.body &&
      g.player.swimming &&
      (this.pastBuoys(p) || this.inRip(p)) &&
      !this.isLifeguard() &&
      this.busy !== 'whale' &&
      this.busy !== 'belly' &&
      flat(p, this.tourPos) > 12 &&
      flat(p, this.charterPos) > 12;
    const skiSpeed = 9.5;
    const moveSki = (to: V, speed: number) => {
      const d = flat(this.skiPos, to);
      if (d < 0.2) return true;
      const dir = v(to.x - this.skiPos.x, 0, to.z - this.skiPos.z).normalize();
      const next = this.skiPos.clone().addScaledVector(dir, Math.min(d, speed * dt));
      if (this.inReef(next)) return false; // the reef tears up jet skis
      this.skiPos.copy(next);
      this.ski.rotation.y = Math.atan2(dir.x, dir.z);
      if (Math.random() < 0.6) g.particles.emit(this.skiPos.clone().setY(this.tide), v(-dir.x * 3, 2, -dir.z * 3), 0xffffff, { life: 0.5, size: 0.2, gravity: 10, spread: 1.5 });
      return d < 0.3;
    };
    switch (this.chetState) {
      case 'tower':
        this.chet.place(towerP.clone(), 0);
        this.chet.pose = 'sit';
        if (wantRescue) {
          this.chetState = 'chase';
          this.reefWait = 0;
          g.say('Chet', this.inRip(p) ? "Rip current! Hang on, I'm coming!" : 'HEY! PAST THE BUOYS! Get back here!', 2400);
          g.sound.tone({ f: 2400, dur: 0.6, type: 'square', vol: 0.06 });
        }
        break;
      case 'snack':
        this.chetTimer -= dt;
        if (this.chetTimer <= 0) {
          this.chetState = 'return';
          this.chet.goto(towerP.clone(), 4);
          this.chet.pose = 'walk';
        }
        break;
      case 'chase': {
        if (!wantRescue && this.busy !== 'tow') {
          this.chetState = 'return';
          break;
        }
        const reached = flat(this.skiPos, p) < 2.4;
        const moved = moveSki(p, skiSpeed);
        if (!moved && !reached && this.inReef(p)) {
          this.reefWait += dt;
          if (this.reefWait > 12) {
            g.say('Chet', "Fine! Stay on the reef! I'm not wrecking another jet ski!", 2600);
            this.chetState = 'return';
          }
        }
        if (reached && !this.busy) {
          this.chetState = 'tow';
          this.busy = 'tow';
          g.player.lock(true);
          g.player.carry = () => this.skiPos.clone().add(v(0, 0.3, -1.2)).setY(this.tide - 0.6);
          g.say('Chet', 'Gotcha! Back to shore, champ.', 2000);
        }
        break;
      }
      case 'tow': {
        const shore = v(this.skiPos.x, 0, shoreZ(this.skiPos.x) + 3);
        if (moveSki(shore, skiSpeed) || flat(this.skiPos, shore) < 0.5) {
          this.busy = null;
          g.player.carry = null;
          g.player.lock(false);
          g.player.teleport(v(shore.x, this.ctx.world.topY(shore.x, shore.z - 14) + 0.2, shore.z - 14), Math.PI);
          g.say('Chet', 'Stay inside the buoys. I mean it.', 2400);
          this.chetState = 'return';
        }
        break;
      }
      case 'search':
        this.chetTimer -= dt;
        if (this.skiCap) moveSki(this.skiCap.clone().add(v(Math.sin(this.chetTimer * 2) * 3, 0, Math.cos(this.chetTimer * 2) * 3)), 5);
        if (this.chetTimer <= 0) {
          g.say('Chet', "Can't find it. Whatever.", 1800);
          this.chetState = wantRescue ? 'chase' : 'return';
        }
        break;
      case 'return': {
        // Jet ski home first, then Chet climbs back into his tower.
        const home = moveSki(this.skiHome, skiSpeed) || flat(this.skiPos, this.skiHome) < 0.5;
        if (this.chet.arrived && flat(this.chet.pos, towerP) > 1) this.chet.goto(towerP.clone(), 4);
        if (home && flat(this.chet.pos, towerP) < 1) this.chetState = 'tower';
        if (wantRescue && home) this.chetState = 'tower';
        break;
      }
    }
    // Chet rides the ski while it's out.
    const riding = this.chetState === 'chase' || this.chetState === 'tow' || this.chetState === 'search' || (this.chetState === 'return' && flat(this.skiPos, this.skiHome) > 1);
    this.skiPos.y = this.tide - 0.25;
    this.ski.position.copy(this.skiPos);
    if (riding) {
      this.chet.place(this.skiPos.clone().add(v(0, 0.6, 0)), this.ski.rotation.y);
      this.chet.pose = 'sit';
    } else if (this.chetState === 'return' && this.chet.arrived && flat(this.chet.pos, towerP) > 1) {
      this.chet.place(v(this.skiHome.x, this.ctx.world.topY(this.skiHome.x, this.skiHome.z - 8), this.skiHome.z - 8), Math.PI);
    }
    if (this.chet.target) this.chet.pose = 'walk';
    this.chet.update(dt);
  }

  private updateKids(dt: number) {
    for (const k of this.kids) k.update(dt);
    if (this.castleCool > 0) this.castleCool -= dt;
  }

  private updateVolleyball(dt: number) {
    const pl = this.vbPlayers;
    for (const a of pl) a.update(dt);
    const vb = this.L.volleyball;
    this.ballT += dt / 1.3;
    if (this.ballT >= 1) {
      this.ballT = 0;
      this.ballFrom.copy(this.ballTo);
      // Brock spikes at the player if taunted and the player is on court.
      const p = this.feet();
      const onCourt = this.joined && p.x > vb.x0 - 2 && p.x < vb.x1 + 2 && p.z < vb.netZ && p.z > vb.z0 - 4;
      if (this.ballHolder === 0 && this.spikeAt && onCourt && this.g.body) {
        this.spikeAt = false;
        this.spike();
        return;
      }
      const order = [0, 2, 1, 3];
      this.ballHolder = order[(order.indexOf(this.ballHolder) + 1) % 4];
      if (this.joined && this.ballHolder === 2) this.ballHolder = 3;
      this.ballTo.copy(pl[this.ballHolder].pos).setY(GL + 2);
    }
    if (this.busy === 'volley') return;
    const t = this.ballT;
    this.ball.position.lerpVectors(this.ballFrom, this.ballTo, t);
    this.ball.position.y += Math.sin(t * Math.PI) * 5;
    this.ball.rotation.x += dt * 8;
  }

  private spike() {
    const g = this.g;
    const brock = this.vbPlayers[0];
    brock.pose = 'cheer';
    this.busy = 'volley';
    g.sound.whoosh();
    const from = brock.pos.clone().setY(GL + 3.5);
    let t = 0;
    const step = () => {
      t += 1 / 30;
      const target = this.feet().add(v(0, 1.6, 0));
      this.ball.position.lerpVectors(from, target, Math.min(1, t * 2.2));
      if (t * 2.2 < 1) return this.later(1 / 30, step);
      brock.pose = 'stand';
      g.sound.slam();
      g.shake(0.7);
      const dir = target.clone().sub(from).setY(0).normalize();
      if (this.taunts >= 3) {
        g.toast('SPIKED', '140 mph. Right in the face.', 2000);
        this.busy = null;
        this.die('volleyball', dir.multiplyScalar(22).setY(12), 14, 0.6);
        this.joined = false;
      } else {
        this.busy = null;
        g.player.knock(dir.multiplyScalar(9).setY(7));
        g.toast('BONK', ['Right in the face. Still alive. Keep talking.', 'That one loosened a tooth. He is getting angrier.'][this.taunts - 1] ?? '', 2200);
      }
      this.ballFrom.copy(this.ball.position);
      this.ballTo.copy(brock.pos).setY(GL + 2);
      this.ballT = 0;
      this.ballHolder = 0;
    };
    step();
  }

  private updateBuffet(dt: number) {
    const g = this.g;
    const cr = this.L.cruise;
    this.buffetClock -= dt;
    const pas = this.passengers;
    if (this.stampede > 0) {
      this.stampede -= dt;
      const p = this.feet();
      for (const a of pas) {
        if (a.target === null && this.stampede > 3) a.goto(cr.buffet.clone().add(v(Math.random() * 1.5, 0, (Math.random() - 0.5) * 6)), 9);
        if (g.body && this.busy !== 'trample' && flat(a.pos, p) < 1.1 && Math.abs(p.y - cr.lido) < 1.5 && a.target) {
          this.busy = 'trample';
          g.sound.scream(1.2);
          for (let i = 0; i < 8; i++) this.later(i * 0.1, () => (g.sound.land(0.8), g.shake(0.4)));
          this.later(0.9, () => {
            this.busy = null;
            g.kill('buffet', { kind: 'pancake' });
          });
        }
      }
      if (this.stampede <= 0) pas.forEach((a, i) => a.goto(cr.queue[i].clone(), 2));
    } else if (this.buffetClock <= 0) {
      this.buffetClock = 90;
      // Standing between the line and the buffet when it opens is the whole puzzle.
      const p = this.feet();
      if (g.body && !this.busy && p.x > cr.buffet.x && p.x < cr.queue[0].x && Math.abs(p.z - cr.buffet.z) < 4 && Math.abs(p.y - cr.lido) < 1.5) {
        this.busy = 'trample';
        g.sound.scream(1.2);
        for (let i = 0; i < 8; i++) this.later(0.3 + i * 0.1, () => (g.sound.land(0.8), g.shake(0.4)));
        this.later(1.2, () => {
          this.busy = null;
          g.kill('buffet', { kind: 'pancake' });
        });
      }
      this.stampede = 10;
      g.sound.tone({ f: 880, dur: 0.4, type: 'triangle', vol: 0.12 });
      g.sound.tone({ f: 660, dur: 0.6, type: 'triangle', vol: 0.12, at: 0.4 });
      if (flat(this.feet(), cr.buffet) < 70 && g.body) g.toast('THE BUFFET IS OPEN', '', 1600);
      pas.forEach((a) => a.goto(cr.buffet.clone().add(v(Math.random() * 1.5, 0, (Math.random() - 0.5) * 6)), 9));
    }
    for (const a of pas) {
      if (!a.target && this.stampede <= 0) a.facing = -Math.PI / 2;
      a.update(dt);
    }
    const s = Math.max(0, Math.ceil(this.buffetClock));
    this.buffetSign.set(this.stampede > 0 ? ['BUFFET', 'OPEN!'] : ['BUFFET OPENS IN', `0:${s.toString().padStart(2, '0')}`]);
  }

  private updateWhale(dt: number, time: number) {
    const g = this.g;
    const c = v(300, 0, 600);
    const R = 34;
    if (this.busy !== 'whale') this.whaleA += dt * 0.05;
    this.whalePos.set(c.x + Math.cos(this.whaleA) * R, this.tide - 2.2 + Math.sin(time * 0.4) * 0.4, c.z + Math.sin(this.whaleA) * R);
    this.whale.position.copy(this.whalePos);
    this.whale.rotation.y = -this.whaleA + Math.PI; // swim tangent
    const tail = this.whale.getObjectByName('tail');
    if (tail) tail.rotation.x = Math.sin(time * 1.2) * 0.25;
    const jaw = this.whale.getObjectByName('jaw');
    if (jaw) jaw.rotation.x += (this.whaleMouth - jaw.rotation.x) * Math.min(1, dt * 3);
    // Spout now and then.
    if (Math.random() < dt / 9) for (let i = 0; i < 40; i++) g.particles.emit(this.whale.localToWorld(v(0, 3, 3)), v((Math.random() - 0.5) * 2, 10 + Math.random() * 6, (Math.random() - 0.5) * 2), 0xe8f8ff, { life: 1.4, size: 0.25, gravity: 9 });
    // Krill swarm ahead of the mouth.
    this.krill.copy(this.whale.localToWorld(v(0, 0.5, 16)));
    this.krill.y = this.tide - 1.2;
    for (let i = 0; i < 2; i++) g.particles.emit(this.krill.clone().add(v((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 6)), v(0, 0.2, 0), 0xff9aa0, { life: 1.2, size: 0.1, gravity: 0 });

    const p = this.feet();
    const pl = g.player;
    // Tour guide throws the life ring when you go overboard.
    if (g.body && pl.swimming && flat(p, this.tourPos) < 14 && !this.ringCut && !this.busy) {
      this.busy = 'tow';
      g.say('Tour Guide Tina', 'Passenger overboard! Grab the ring! GRAB THE RING!', 2600);
      this.ring.visible = true;
      let t = 0;
      const from = this.tourPos.clone().add(v(0, 2, 0));
      pl.lock(true);
      pl.carry = () => {
        t += 1 / 60;
        const k = Math.min(1, t / 1.6);
        const at = from.clone().lerp(p, k < 0.5 ? k * 2 : 2 - k * 2);
        this.ring.position.copy(at);
        if (k >= 1) {
          this.later(0, () => {
            pl.carry = null;
            pl.lock(false);
            this.ring.visible = false;
            this.busy = null;
            pl.teleport(this.tourPos.clone().add(v(0, 1.2, 0)), Math.PI);
            g.say('Tour Guide Tina', 'Please remain on the boat. The whale is not a ride.', 2400);
          });
        }
        return k < 0.5 ? p : at.clone().add(v(0, -0.6, 0));
      };
      return;
    }
    // Chasing krill with the bucket opens the mouth.
    if (g.body && pl.swimming && this.items.has('bucket') && !this.busy && flat(p, this.krill) < 9) {
      this.krillT += dt;
      this.whaleMouth = Math.min(0.9, this.krillT * 0.25);
      if (this.krillT > 3.5) this.swallow();
    } else {
      this.krillT = Math.max(0, this.krillT - dt);
      if (this.busy !== 'whale') this.whaleMouth = 0;
    }
  }

  private swallow() {
    const g = this.g;
    this.busy = 'whale';
    this.whaleMouth = 1.1;
    g.sound.noise({ dur: 1.4, vol: 0.8, freq: 300, freq2: 60 });
    g.player.lock(true);
    const start = this.feet();
    let t = 0;
    g.player.carry = () => {
      t += 1 / 60;
      const mouth = this.whale.localToWorld(v(0, -0.5, 8));
      if (t > 1.2 && this.busy === 'whale') {
        this.busy = 'belly';
        this.later(0, () => this.enterBelly());
      }
      return start.clone().lerp(mouth, Math.min(1, t / 1.0));
    };
  }

  private enterBelly() {
    const g = this.g;
    g.flash('#000000', 900);
    g.player.carry = null;
    g.player.lock(false);
    this.whaleMouth = 0;
    g.player.teleport(this.L.belly.clone().add(v(0, 0.2, 0)), Math.PI);
    g.toast('INSIDE THE WHALE', 'A junk pile of everything it ever swallowed. It smells like a thousand years of fish.', 3600);
    this.later(9, () => {
      if (this.busy !== 'belly' || !g.body) return;
      g.say('You', 'Why is it rumbling? Why is everything going up?', 2000);
      g.shake(1);
      g.sound.noise({ dur: 2, vol: 0.6, freq: 200, freq2: 900 });
    });
    this.later(11.5, () => {
      if (this.busy !== 'belly' || !g.body) return;
      const hole = this.whale.localToWorld(v(0, 3.2, 3));
      g.player.teleport(hole, 0);
      for (let i = 0; i < 80; i++) g.particles.emit(hole, v((Math.random() - 0.5) * 3, 18 + Math.random() * 12, (Math.random() - 0.5) * 3), 0xe8f8ff, { life: 2, size: 0.3, gravity: 9 });
      g.sound.noise({ dur: 1, vol: 0.9, freq: 1500, freq2: 300 });
      this.die('whale', v(0, 42, 0), 6, 0.5);
    });
  }

  private updateDavy(dt: number) {
    const subs = this.L.shops.find((s) => s.id === 'subs')!;
    this.davyTimer -= dt;
    if (this.davyTimer <= 0) {
      this.davyOut = !this.davyOut;
      this.davyTimer = this.davyOut ? 22 : 55;
      this.davy.goto(this.davyOut ? subs.door.clone().add(v(-5, 0, 2)) : subs.counter.clone().add(v(0, 0, -1.5)), 2);
    }
    if (this.davyOut && this.davy.arrived && Math.random() < dt) this.g.particles.emit(this.davy.pos.clone().add(v(0, 1.9, 0.3)), v(0, 1, 0), 0xcccccc, { life: 1.5, size: 0.15, gravity: -1, spread: 0.3 });
    this.davy.update(dt);
  }

  private updateActivities(dt: number, time: number) {
    const g = this.g;
    const pl = g.player;
    const L = this.L;

    // Buried: the tide decides.
    if (this.busy === 'buried' && this.buriedAt && g.body) {
      const head = this.buriedAt.y + 1.55;
      const near = this.tide > head - 0.6;
      if (near && this.guardSees(this.buriedAt)) {
        const gd = this.guards.find((x, i) => flat(this.L.towers[i], this.buriedAt!) < 60)!;
        g.say(gd.name, "Not on my beach! Who buried this idiot below the tide line?", 2800);
        this.unbury();
        g.toast('DUG OUT', 'The lifeguard on his sweep spotted you.', 2000);
      } else if (this.tide > head - 0.1) {
        this.busy = null;
        g.toast('glub', 'A crab walks across your face. A bubble pops.', 2200);
        const crab = this.crabs[0];
        crab.m.position.copy(this.buriedAt).add(v(0, 1.6, 0));
        g.sound.gulp();
        this.later(2, () => {
          this.buriedAt = null;
          this.mound.clear();
          this.die('buried', v(0, 1, 0), 1, 0.1);
        });
      }
    }

    // Gulls gather while the fries are up.
    if (this.busy === 'gulls' && pl.carry === null && !(this as unknown as { gullDrop?: string }).gullDrop && g.body) {
      this.holdT += dt;
      const want = Math.min(30, Math.floor(this.holdT * 2.5));
      while (this.flock.length < want) {
        const m = M.gull();
        this.root.add(m);
        const a = Math.random() * 6.28;
        this.flock.push({ m, off: v(Math.cos(a) * (1 + Math.random() * 3), 2.6 + Math.random() * 2.5, Math.sin(a) * (1 + Math.random() * 3)), ph: Math.random() * 6 });
        if (this.flock.length % 5 === 0) g.sound.tone({ f: 1400 + Math.random() * 400, f2: 900, dur: 0.25, type: 'square', vol: 0.05 });
      }
      if (this.flock.length >= 30) {
        this.busy = 'gulls';
        this.liftOff();
      }
    }
    if (this.flock.length) {
      const c = this.feet();
      for (const f of this.flock) {
        f.ph += dt * 4;
        f.m.position.copy(c).add(f.off).add(v(Math.cos(f.ph) * 0.6, Math.sin(f.ph * 1.7) * 0.3, Math.sin(f.ph) * 0.6));
        f.m.rotation.y = f.ph;
        const fl = Math.sin(time * 18 + f.ph) * 0.7;
        const wl = f.m.getObjectByName('wl'), wr = f.m.getObjectByName('wr');
        if (wl) wl.rotation.z = fl;
        if (wr) wr.rotation.z = -fl;
      }
    }

    // Parasail ride.
    this.updateParasail(dt, time);

    // Sub.
    if (this.busy === 'sub' && g.body) this.updateSub(dt);

    // Shark Week: ring the dinner bell.
    if (g.body && pl.floaty && this.pastBuoys() && this.splashT >= 10 && !this.busy) {
      this.splashT = 0;
      this.sharkAttack();
    }
    if (g.time - this.lastSplash > 2.5) this.splashT = 0;
  }

  private sharkAttack() {
    const g = this.g;
    const pl = g.player;
    const p = this.feet();
    this.busy = 'shark';
    const sm = this.smallShark;
    sm.visible = true;
    let t = 0;
    const startA = Math.random() * 6.28;
    g.sound.tone({ f: 82, dur: 0.5, type: 'sawtooth', vol: 0.2 });
    g.sound.tone({ f: 87, dur: 0.5, type: 'sawtooth', vol: 0.2, at: 0.6 });
    g.sound.tone({ f: 82, dur: 0.3, type: 'sawtooth', vol: 0.2, at: 1.1 });
    g.sound.tone({ f: 87, dur: 0.3, type: 'sawtooth', vol: 0.2, at: 1.5 });
    const circle = () => {
      t += 1 / 30;
      const here = this.feet();
      const r = Math.max(1.4, 18 - t * 4);
      const a = startA + t * 1.6;
      sm.position.set(here.x + Math.cos(a) * r, this.tide - 0.5, here.z + Math.sin(a) * r);
      sm.rotation.y = -a;
      if (!this.bleeding && t > 4) {
        sm.visible = false;
        this.busy = null;
        g.say('Death', 'It sniffed you and left. No blood in the water, no dinner.', 3000);
        return;
      }
      if (t < 5) return this.later(1 / 30, circle);
      // Nibble.
      pl.lock(true);
      g.toast('nibble nibble', 'A very small shark is eating your foot. It tickles.', 2200);
      for (let i = 0; i < 10; i++) this.later(i * 0.2, () => (g.character?.kick(0.3), g.sound.munch()));
      this.later(2.4, () => {
        const big = this.bigShark;
        big.visible = true;
        big.position.copy(here).setY(this.tide - 9);
        big.rotation.set(-1.2, Math.random() * 6, 0);
        let u = 0;
        const rise = () => {
          u += 1 / 30;
          big.position.y = this.tide - 9 + Math.min(1, u / 0.8) * 10;
          if (u < 0.8) return this.later(1 / 30, rise);
          g.sound.splat();
          g.sound.slam();
          g.shake(1.5);
          this.splashFx(here, 1);
          sm.visible = false;
          g.toast('CHOMP', 'Inside the big shark, you and the small shark stare at each other.', 3200);
          this.die('shark', v(0, 16, 0), 10, 0.4);
          this.later(1.8, () => (big.visible = false));
        };
        rise();
      });
    };
    circle();
    void p;
  }

  private updateParasail(dt: number, time: number) {
    const g = this.g;
    const L = this.L;
    const boatHome = v(386, SEA - 0.4, PIER_END + 4);
    if (this.busy !== 'parasail') {
      // Boat waits at the pier.
      this.psBoat.position.lerp(boatHome, Math.min(1, dt));
      this.psBoat.position.y = this.tide - 0.4;
      this.chute.visible = false;
      this.boatGuy.place(this.psBoat.position.clone().add(v(0, 1.1, 0)), Math.PI / 2);
      return;
    }
    this.psT += dt;
    // Boat loop out to sea and back.
    const bt = this.psT < 100 ? this.psT : 0;
    const boat = v(386 - Math.sin(bt * 0.08) * 120, this.tide - 0.4, PIER_END + 10 + (1 - Math.cos(bt * 0.08)) * 70);
    if (this.psT < 100) this.psBoat.position.copy(boat);
    const dir = v(-Math.cos(bt * 0.08) * 120 * 0.08, 0, Math.sin(bt * 0.08) * 70 * 0.08).normalize();
    this.psBoat.rotation.y = Math.atan2(dir.x, dir.z);
    this.boatGuy.place(this.psBoat.position.clone().add(v(0, 1.1, 0)), this.psBoat.rotation.y + Math.PI);
    if (!this.psFree) {
      if (this.psT >= 100) {
        // Reeled back in: come down at the pier.
        const k = Math.min(1, (this.psT - 100) / 4);
        this.psPos.lerpVectors(this.psPos, L.pierEnd.clone().add(v(-6, 0.2, 0)), k);
        if (k >= 1) {
          this.busy = null;
          g.player.carry = null;
          g.player.lock(false);
          g.player.teleport(L.pierEnd.clone().add(v(-6, 0.2, 0)), Math.PI);
          g.say('Boat Guy', 'Ride over. No refunds for biters.', 2000);
        }
      } else {
        const h = Math.min(30, this.psT * 3.5);
        this.psPos.copy(this.psBoat.position).addScaledVector(dir, -18).add(v(0, h + 1, 0));
      }
    } else {
      // Free flight: drift with the wind, steer with the stick, sink slowly.
      const yaw = g.camYaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const mx = g.input.moveX, my = g.input.moveY;
      this.psPos.x += (fx * my + rx * mx) * 6 * dt + 1.5 * dt;
      this.psPos.z += (fz * my + rz * mx) * 6 * dt + 0.8 * dt;
      const lh = L.lighthouse.top;
      if (this.psSpin > 0) {
        this.psSpin += dt;
        const a = this.psSpin * 4;
        this.psPos.set(lh.x + Math.cos(a) * 3.5, lh.y + 1.5, lh.z + Math.sin(a) * 3.5);
        if (this.psSpin > 3.2) {
          this.chute.visible = false;
          g.sound.scream(1.3);
          this.die('parasail', v(Math.cos(a) * 12, 6, Math.sin(a) * 12), 10, 0.5);
          this.psSpin = 0;
          this.psFree = false;
          return;
        }
      } else {
        this.psPos.y -= 1.1 * dt;
        if (flat(this.psPos, lh) < 6 && Math.abs(this.psPos.y - lh.y) < 5) {
          this.psSpin = 0.001;
          g.sound.creak();
          g.toast('SNAGGED', 'The chute catches on the lighthouse. The beam starts turning.', 2400);
        }
      }
      const ground = this.ctx.world.topY(this.psPos.x, this.psPos.z);
      if (this.psPos.y <= Math.max(this.tide - 0.5, ground) && this.psSpin === 0) {
        this.busy = null;
        g.player.carry = null;
        g.player.lock(false);
        this.chute.visible = false;
        g.player.teleport(this.psPos.clone().add(v(0, 0.3, 0)));
        g.toast('TOUCHDOWN', 'A gentle landing. How disappointing.', 2000);
        return;
      }
    }
    this.chute.visible = true;
    this.chute.position.copy(this.psPos).add(v(0, 5.6, 0));
    this.chute.rotation.y = this.psBoat.rotation.y + Math.PI / 2;
    void time;
  }

  private updateSub(dt: number) {
    const g = this.g;
    const L = this.L;
    const tr = L.harbor.trench;
    const center = v((tr.min.x + tr.max.x) / 2, this.tide - 1, (tr.min.z + tr.max.z) / 2);
    this.subT += dt;
    if (this.subPhase === 'drive') {
      const d = flat(this.subPos, center);
      const dir = center.clone().sub(this.subPos).setY(0).normalize();
      // Route: out past the dock end, then to the trench.
      const way = this.subPos.z < 330 ? v(this.subPos.x + 0.001, 0, this.subPos.z + 1).sub(this.subPos).setY(0).normalize() : dir;
      this.subPos.addScaledVector(way, Math.min(d, 14 * dt));
      this.subPos.y = this.tide - 1;
      this.sub.rotation.y = Math.atan2(way.x, way.z);
      if (d < 1) {
        this.subPhase = 'dive';
        g.toast('THE TRENCH', 'Shift to dive, Space to rise. The red line is 300 m.', 2600);
      }
    } else if (this.subPhase === 'dive') {
      const inp = g.input;
      let vy = 0;
      if (inp.held('crouch')) vy -= 6;
      if (inp.held('jump')) vy += 6;
      this.subPos.y = Math.min(this.tide - 1, this.subPos.y + vy * dt);
      const depth = (SEA - this.subPos.y) * 4;
      if (depth > 300 && !this.governorOff) {
        this.subPos.y = SEA - 75;
        if (Math.random() < dt * 0.8) g.toast('GOVERNOR ENGAGED', 'Max depth 300 m. Davy installed exactly one safety feature.', 2000);
      }
      if (depth > 200 && Math.random() < dt * 0.5) g.sound.creak();
      if (depth > 330) {
        this.subPhase = 'crush';
        this.subT = 0;
        g.sound.creak();
        g.sound.noise({ dur: 1.6, vol: 0.8, freq: 200, freq2: 60 });
        g.toast('CRRREEEAK', 'That noise is the hull. The hull is making that noise.', 2000);
      }
      // Darkness.
      const f = this.scene.fog;
      if (f instanceof THREE.Fog && this.fogBase) {
        const k = Math.min(1, depth / 250);
        f.color.copy(this.fogBase.color).lerp(new THREE.Color(0x02060c), k);
        f.near = THREE.MathUtils.lerp(this.fogBase.near, 2, k);
        f.far = THREE.MathUtils.lerp(this.fogBase.far, 30, k);
      }
    } else {
      const k = Math.min(1, this.subT / 1.4);
      this.sub.scale.set(1 - k * 0.85, 1 - k * 0.85, 1 - k * 0.9);
      g.shake(0.3);
      if (k >= 1 && this.busy === 'sub') {
        g.sound.crunch();
        g.sound.splat();
        this.die('toodeep', v(0, 2, 0), 4, 0.2);
        this.later(4, () => {
          this.restoreFog();
          this.sub.scale.setScalar(1);
          this.sub.position.copy(L.harbor.subDock).add(v(4, -1.4, 6));
          this.subPos.copy(this.sub.position);
        });
      }
    }
    this.sub.position.copy(this.subPos);
    const prop = this.sub.getObjectByName('prop');
    if (prop) prop.rotation.z += dt * 20;
    if (Math.random() < 0.3) g.particles.emit(this.subPos.clone().add(v(0, 1, 0)), v(0, 2, 0), 0xddeeff, { life: 1.2, size: 0.12, gravity: -2, spread: 0.6 });
  }

  /** Fixed-step hazard checks. */
  checkHazards() {
    const g = this.g;
    const p = this.feet();
    // Falling off the world.
    if (p.y < -30 && this.busy !== 'sub') g.kill('drowned', { kind: 'ragdoll', vel: v(0, 0, 0) });
    // Stinging jellyfish for casual swimmers in the bloom.
    if (g.player.swimming && inBox2(p, this.L.bloom) && Math.random() < 0.02 && !this.busy) {
      g.sound.zap(0.2);
      g.flash('#ff8ad8', 150);
      g.toast('OW', 'Jellyfish. They sting. Coming in from higher up might be worse.', 1600);
    }
    void SX;
    void SZ;
  }

  dispose() {
    this.restoreFog();
    const p = this.g.player;
    p.waterAt = null;
    p.carry = null;
    p.floaty = false;
    p.current.set(0, 0, 0);
    p.hooks.onSplash = undefined;
    p.hooks.onDrown = undefined;
    this.hud.remove();
    for (const a of [...this.guards, ...this.kids, ...this.vbPlayers, ...this.passengers, this.captain, this.guide, this.davy, this.boatGuy]) a.dispose();
    this.sea.dispose();
    this.town.dispose();
    this.scene.remove(this.root);
    for (const b of this.bodies) {
      try {
        this.ctx.physics.removeRigidBody(b);
      } catch {
        /* world already freed */
      }
    }
  }
}

declare module './actor' {
  interface Actor {
    userHome?: THREE.Vector3;
  }
}
