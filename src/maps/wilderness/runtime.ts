import * as THREE from 'three';
import type { GameApi, MapContext, MapRuntime } from '../types';
import type { Interactable } from '../../props';
import { Actor, Animal, MOOD_NAMES, type Ground } from './animals';
import * as M from './models';
import { buildClouds, buildFoliage, buildWater } from './scenery';
import { RIVER_A, SX, SZ, type Terrain } from './terrain';
import type { Spots } from './structures';

export interface WildLayout {
  t: Terrain;
  spots: Spots;
  ground: Ground;
  cover: Uint8Array;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/** Uniform colours for the scripted staff. */
const KHAKI = { shirt: 0xb8a878, pants: 0x6b5a3a, hat: 0x8a7a50 };
const RANGER = { shirt: 0x5a7a4a, pants: 0x4a3a2a, hat: 0x8a6a3a };

type Ride =
  | { kind: 'jeep' }
  | { kind: 'balloon' }
  | { kind: 'barrel' }
  | { kind: 'rocket' }
  | { kind: 'ufo' }
  | { kind: 'fixed'; at: THREE.Vector3; facing: number };

interface Timer {
  at: number;
  fn: () => void;
}

const ITEM_NAMES: Record<string, string> = {
  basket: 'Picnic basket',
  honey: 'Covered in honey',
  flare: "Ranger's flare gun",
  cord60: '60 m bungee cord',
  cord300: '300 m cord spool',
  barrel: 'Empty barrel',
  steak: 'Raw steak',
  steakPants: 'Steak (in swimsuit)',
  jumpsuit: "Host's spare jumpsuit (no belt)",
  meatsuit: 'Meat suit',
  keys: 'Tour jeep keys',
  paint: 'Red paint',
  peanuts: "Baby elephant's peanuts",
  ticket: 'Balloon ticket',
  sandwich: 'Sandwich',
  foil: 'Tinfoil hat',
  rocket: 'ACME Rocket Kit',
};

/**
 * The wilderness at runtime: animals with mood meters, scripted staff who save you,
 * vehicles, and the logic for every death on the map.
 */
export class WildRuntime implements MapRuntime {
  interactables: Interactable[] = [];
  private game: GameApi;
  private scene: THREE.Scene;
  private root = new THREE.Group();
  private t: Terrain;
  private s: Spots;
  private ground: Ground;
  private cover: Uint8Array;
  private items = new Set<string>();
  private lastBody: unknown = null;
  private timers: Timer[] = [];
  private clock = 0;
  private ride: Ride | null = null;
  private invEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private carried: THREE.Object3D | null = null;
  private hat: THREE.Object3D | null = null;
  private animals: Animal[] = [];
  private actors: Actor[] = [];
  private clouds: THREE.Group;
  private waterMat: THREE.MeshLambertMaterial;
  private busy = false; // a death sequence or minigame owns the player

  // --- named things
  private bear!: Animal;
  private ranger!: Actor;
  private rangerState: 'post' | 'lunch' | 'horn' | 'flare' = 'post';
  private flareStolen = false;
  private hornT = 0;
  private bungeeGuy!: Actor;
  private bungeeHelping = false;
  private bungee: { cord: 'cord60' | 'cord300'; attached: boolean; bounces: number; deck: number } | null = null;
  private rope!: THREE.Line;
  private raftGuide!: Actor;
  private barrelRide: { path: THREE.Vector3[]; i: number; d: number; lane: number; mesh: THREE.Group; roped: boolean; falling: number } | null = null;
  private barrelMeshes: THREE.Group[] = [];
  private piranhas: THREE.Group[] = [];
  private frenzy = 0;
  private gator!: Animal;
  private gatorHost!: Actor;
  private show: { round: number; marker: number; dir: number; zone: [number, number]; phase: 'bar' | 'taunt' | 'roll'; t: number } | null = null;
  private lions: Animal[] = [];
  private lionScare = 0;
  private habituated = 0;
  private kidHonking = false;
  private guide!: Actor;
  private kid!: Actor;
  private tourists: Actor[] = [];
  private headcount = false;
  private tourJeep!: THREE.Group;
  private jeep = { pos: V(0, 0, 0), yaw: 0, speed: 0, target: false, taken: false, flying: false };
  private hippo!: Animal;
  private yawning = false;
  private pets = 0;
  private elephants: Animal[] = [];
  private mother!: Animal;
  private baby!: Animal;
  private peanutBag!: THREE.Group;
  private rhinos: Animal[] = [];
  private balloon!: ReturnType<typeof M.balloon>;
  private balloonState: { t: number; alt: number; unclipped: boolean; popped: boolean; vy: number; pilot: Actor; base: THREE.Vector3; active: boolean } | null = null;
  private vultures: Animal[] = [];
  private ufo!: ReturnType<typeof M.ufo>;
  private ufoT = -1;
  private photoUntil = -1;
  private conspiracy!: Actor;
  private camel!: Animal;
  private sink = 0;
  private roadrunner!: Animal;
  private rocket: { mesh: THREE.Group; phase: 'set' | 'fuse' | 'fly'; t: number; pos: THREE.Vector3; yaw: number } | null = null;
  private hugs = 0;
  private nukeAt = 240;
  private nukeCountdown = false;
  private inFridge = false;
  private heat = 0;
  private mirage!: THREE.Group;
  private damHits = 0;
  private damBroken = false;
  private beavers: Animal[] = [];
  private lumberjack!: Actor;
  private logGame: { t: number; want: number; next: number; balance: number; log: THREE.Mesh } | null = null;
  private skeletons: { a: Actor; t: number; dir: THREE.Vector3 }[] = [];

  constructor(private ctx: MapContext, L: WildLayout) {
    this.game = ctx.game;
    this.scene = ctx.scene;
    this.t = L.t;
    this.s = L.spots;
    this.ground = L.ground;
    this.cover = L.cover;
    this.scene.add(this.root);

    const water = buildWater(this.t);
    this.waterMat = water.mat;
    this.root.add(water.group);
    this.root.add(buildFoliage(this.t, ctx.world, this.cover));
    this.clouds = buildClouds();
    this.root.add(this.clouds);

    this.invEl = document.createElement('div');
    this.invEl.style.cssText = 'position:fixed;left:14px;bottom:14px;max-width:46vw;padding:6px 10px;border-radius:8px;background:rgba(20,16,10,.72);color:#f5e6c8;font:600 13px/1.35 system-ui,sans-serif;pointer-events:none;display:none;z-index:5';
    this.hintEl = document.createElement('div');
    this.hintEl.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);padding:8px 14px;border-radius:10px;background:rgba(20,16,10,.78);color:#fff;font:700 16px/1.4 system-ui,sans-serif;pointer-events:none;display:none;text-align:center;z-index:6';
    const ui = document.getElementById('ui') ?? document.body;
    ui.append(this.invEl, this.hintEl);

    this.buildSigns();
    this.spawnAnimals();
    this.spawnStaff();
    this.buildProps();
  }

  // ================================================================ helpers

  private get p() {
    return this.game.player.feet();
  }
  private get body() {
    return this.game.body;
  }
  private job() {
    return (this.body?.job as string | undefined) ?? '';
  }
  private near(v: THREE.Vector3, r: number) {
    const p = this.p;
    return Math.hypot(p.x - v.x, p.z - v.z) < r && Math.abs(p.y - v.y) < 6;
  }
  private after(sec: number, fn: () => void) {
    this.timers.push({ at: this.clock + sec, fn });
  }
  private give(id: string, line?: string) {
    this.items.add(id);
    this.game.sound.blip(1.2);
    this.game.toast(`GOT: ${ITEM_NAMES[id] ?? id}`.toUpperCase(), line ?? '', 2400);
    this.refreshInv();
  }
  private take(id: string) {
    this.items.delete(id);
    this.refreshInv();
  }
  private has(id: string) {
    return this.items.has(id);
  }
  private refreshInv() {
    const list = [...this.items].map((i) => ITEM_NAMES[i] ?? i);
    this.invEl.style.display = list.length ? 'block' : 'none';
    this.invEl.innerHTML = `<span style="opacity:.7">Carrying:</span> ${list.join(' · ')}`;
  }
  private hint(html: string | null) {
    this.hintEl.style.display = html ? 'block' : 'none';
    if (html) this.hintEl.innerHTML = html;
  }
  /** Normal-minded bodies refuse obviously suicidal acts. */
  private nope(line: string) {
    if (this.body?.mental === 'Normal' && this.job() !== 'Zookeeper') {
      this.game.say('Gary', line + " (This body's mental state is Normal. It has a survival instinct.)", 4200);
      this.game.sound.denied();
      return true;
    }
    return false;
  }
  private add(id: string, pos: THREE.Vector3, prompt: string, radius = 2.4) {
    const it: Interactable = { id, pos: pos.clone(), radius, prompt, enabled: true };
    this.interactables.push(it);
    return it;
  }
  private it(id: string) {
    return this.interactables.find((i) => i.id === id)!;
  }
  private rag(id: string, vel: THREE.Vector3, spin = 10, bounce = 0.45) {
    this.busy = false;
    this.ride = null;
    this.hint(null);
    this.game.kill(id, { kind: 'ragdoll', vel, spin, bounce });
  }
  private seat(at: THREE.Vector3, facing: number) {
    const pl = this.game.player;
    pl.teleport(at, facing);
    pl.lock(true);
  }
  private release(at?: THREE.Vector3) {
    this.ride = null;
    this.busy = false;
    const pl = this.game.player;
    if (at) pl.teleport(at, pl.facing);
    pl.lock(false);
  }
  private floorAt(x: number, z: number) {
    return this.ground.floor(x, z);
  }
  private place(o: THREE.Object3D, at: THREE.Vector3, rotY = 0) {
    o.position.copy(at);
    o.rotation.y = rotY;
    this.root.add(o);
    return o;
  }
  private dust(at: THREE.Vector3, n = 20, color = 0xc8a878, speed = 5) {
    this.game.particles.burst(at, n, color, speed, { life: 1, size: 0.35, gravity: 3 });
  }
  private moo(f: number, dur = 0.6) {
    this.game.sound.tone({ f, f2: f * 0.6, dur, type: 'sawtooth', vol: 0.18, vibrato: 7 });
  }
  private roar() {
    this.game.sound.noise({ dur: 1.1, vol: 0.5, freq: 300, freq2: 120, type: 'lowpass', q: 3 });
    this.game.sound.tone({ f: 110, f2: 60, dur: 1.0, type: 'sawtooth', vol: 0.2 });
  }

  // ================================================================ world setup

  private buildSigns() {
    const s = this.s;
    const sign = (lines: string[], at: THREE.Vector3, rot: number, bg?: string, fg?: string, w?: number, h?: number, post = true) => this.place(M.signBoard(lines, bg, fg, w, h, post), at, rot);
    sign(['LOST PINES', 'Wilderness Depot · Trains to the City'], s.depotSign, 0, '#2a4a2a', '#f5e6c8', 8, 1.8, false);
    sign(['RANGER STATION', 'Lost Pines National Forest'], s.rangerSign, 0, '#4a3a20', '#f5e6c8', 6, 1.6, false);
    sign(['BUS', 'Lost Pines ⇄ Smallville'], s.busSign, -Math.PI / 2, '#1a3a7a', '#ffffff', 2.2, 1.2);
    sign(['CAMPGROUND', 'Bears are NOT friends'], s.campSign, Math.PI, '#4a3a20', '#f5e6c8', 5, 1.6);
    sign(['WHISPER CREEK LUMBER', 'Log rolling champion: BIG JIM (undefeated)'], s.lumberSign, Math.PI, '#5a3a20', '#f5e6c8', 7, 1.6, false);
    sign(["CAP'N CHOMP'S GATOR SHOW", 'Volunteers wanted!'], s.gatorSign, 0, '#2a5a2a', '#ffe060', 8, 2, false);
    sign(['WHITEWATER RAFTING', 'Falls ahead. Do NOT go over the falls.'], s.raftSign, -Math.PI / 2, '#7a2a2a', '#ffffff', 5, 1.6);
    sign(['THUNDER GORGE BUNGEE', '$50 · Cords measured by hand!'], s.bungeeSign, Math.PI, '#e8b820', '#111111', 6, 1.8);
    sign(['MBALI SAFARI LODGE', 'Gift Shop · Kitchen · Balloon Tours'], s.lodgeSign, 0, '#6a3a1a', '#f5e6c8', 9, 2, false);
    sign(['MBALI AIRSTRIP', 'Flights to the City'], s.airSign, 0, '#ffffff', '#1a3a7a', 6, 1.4, false);
    sign(['HOT AIR BALLOON TOURS', '$200 · Sandwich included'], s.balloonBooth.clone().add(V(0, 0, 2)), 0, '#d83a2a', '#ffffff', 5, 1.6);
    sign(['DRY GULCH GAS & GRUB', 'Last gas for 300 miles'], s.dinerSign, 0, '#d83a2a', '#ffffff', 9, 1.8, false);
    sign(['THEY ARE WATCHING', 'Free hats. Ask inside.'], s.trailerSign, 0, '#111111', '#40ff60', 5, 1.6);
    sign(['CROP CIRCLE', 'Not a hoax. Probably.'], s.cropSign, -Math.PI / 2, '#3a2a1a', '#f5e6c8', 5, 1.6);
    sign(['DANGER: NUCLEAR TEST SITE', 'Tests at random. Do not hide in appliances.'], s.testSign, 0, '#e8b820', '#111111', 8, 2);
    sign(['CONTROL BUNKER', 'Authorized scientists only'], s.bunkerSign, 0, '#666666', '#ffffff', 5, 1.2, false);
    sign(['DEFINITELY NOT', 'QUICKSAND'], s.quicksandSign, 0, '#e8d8a0', '#5a3a1a', 4, 1.6);
    sign(['NO SWIMMING', 'PIRANHAS (they are hungry)'], s.piranhaSign, Math.PI, '#d82a2a', '#ffffff', 5, 1.6);
    sign(['ROADRUNNER XING', 'Meep meep'], s.rocketPad.clone().add(V(-4, 0, 4)), Math.PI, '#e8b820', '#111111', 3.4, 1.4);
    sign(['PRIDE ROCK LOOKOUT', 'Stay in the vehicle'], s.lionLookout.clone().add(V(0, 0, -6)), 0, '#6a3a1a', '#f5e6c8', 5, 1.6);
    sign(['WATERING HOLE', 'Do not feed the elephants'], s.waterBank.clone().add(V(4, 0, 2)), Math.PI, '#6a3a1a', '#f5e6c8', 5, 1.6);
    sign(['HIPPO CROSSING', 'Cutest animal in Africa*', '*deadliest'], s.hippoBank.clone().add(V(5, 0, 0)), Math.PI, '#6a3a1a', '#f5e6c8', 5, 2);
  }

  private spawnAnimals() {
    const g = this.ground, sc = this.scene, s = this.s;
    const add = (a: Animal) => (this.animals.push(a), a);
    // Savanna herds.
    for (let i = 0; i < 4; i++) {
      const male = i === 0;
      const l = add(new Animal(M.lion(male), { name: male ? 'Mufasa (lion)' : 'Lioness', home: { x: s.prideDen.x, z: s.prideDen.z, r: 12 }, speed: 1.2, run: 11, idle: [5, 14], seed: 900 + i }, g, sc));
      this.lions.push(l);
    }
    for (let i = 0; i < 4; i++) {
      const e = add(new Animal(M.elephant(i === 1), { name: i === 1 ? 'Baby elephant' : 'Elephant', home: { x: 492, z: 488, r: 14 }, speed: 1.0, run: 9, idle: [4, 10], seed: 300 + i }, g, sc));
      this.elephants.push(e);
    }
    this.mother = this.elephants[0];
    this.baby = this.elephants[1];
    this.mother.opts.name = 'Mama elephant';
    for (let i = 0; i < 6; i++) add(new Animal(M.giraffe(), { name: 'Giraffe', home: { x: 380, z: 470, r: 40 }, speed: 1.3, idle: [3, 9], seed: 400 + i }, g, sc));
    for (let i = 0; i < 12; i++) add(new Animal(M.zebra(), { name: 'Zebra', home: { x: 450 + (i % 2) * 60, z: 430 + (i % 3) * 40, r: 30 }, speed: 1.6, idle: [2, 8], seed: 500 + i }, g, sc));
    for (let i = 0; i < 10; i++) add(new Animal(M.gazelle(), { name: 'Gazelle', home: { x: 560, z: 460, r: 40 }, speed: 2, idle: [1, 5], seed: 600 + i }, g, sc));
    for (let i = 0; i < 4; i++) this.rhinos.push(add(new Animal(M.rhino(), { name: 'Rhino', home: { x: 432, z: 352, r: 14 }, speed: 1.1, run: 13, idle: [4, 12], seed: 700 + i }, g, sc)));
    this.hippo = add(new Animal(M.hippo(), { name: 'Hippo', home: { x: 390, z: 380, r: 5 }, speed: 0.6, habitat: 'water', float: true, idle: [6, 14], seed: 801 }, g, sc, V(390, 0, 380)));
    for (let i = 0; i < 3; i++) add(new Animal(M.hippo(), { name: 'Hippo', home: { x: 380 + i * 10, z: 375, r: 8 }, speed: 0.5, habitat: 'water', float: true, seed: 810 + i }, g, sc));
    for (let i = 0; i < 6; i++)
      this.vultures.push(add(new Animal(M.vulture(), { name: 'Vulture', home: { x: s.vultureTree.x, z: s.vultureTree.z, r: 8 + i * 3 }, speed: 6 + i, fly: { alt: 18 + i * 3, radius: 8 + i * 3 }, seed: 820 + i }, g, sc)));
    for (let i = 0; i < 6; i++) add(new Animal(M.monkey(), { name: 'Monkey', home: { x: s.baobab.x, z: s.baobab.z, r: 10 }, speed: 2.5, idle: [1, 4], seed: 840 + i }, g, sc));
    // Forest and river.
    this.bear = add(new Animal(M.bear(), { name: 'Grizzly', home: { x: s.bearCave.x, z: s.bearCave.z, r: 2 }, speed: 1.4, run: 12, idle: [8, 20], seed: 850 }, g, sc, s.bearCave.clone()));
    this.bear.scripted = true;
    this.gator = add(new Animal(M.gator(), { name: 'Big Chomp (alligator)', home: { x: s.gatorPit.x, z: s.gatorPit.z, r: 3 }, speed: 0.8, habitat: 'any', idle: [4, 9], seed: 860 }, g, sc, s.gatorPit.clone()));
    for (let i = 0; i < 5; i++) add(new Animal(M.gator(), { name: 'Alligator', home: { x: 40 + i * 6, z: 530, r: 18 }, speed: 0.7, habitat: 'any', float: true, seed: 870 + i }, g, sc));
    for (let i = 0; i < 4; i++) this.beavers.push(add(new Animal(M.beaver(), { name: 'Beaver', home: { x: s.beaverLodge.x, z: s.beaverLodge.z, r: 6 }, speed: 1.5, run: 7, habitat: 'any', idle: [2, 6], seed: 880 + i }, g, sc)));
    // Desert.
    this.camel = add(new Animal(M.camel(), { name: 'Humphrey (camel)', home: { x: s.camelPost.x, z: s.camelPost.z, r: 3 }, speed: 1.6, run: 6, idle: [3, 8], seed: 890 }, g, sc, s.camelPost.clone()));
    this.camel.scripted = true;
    for (let i = 0; i < 2; i++) add(new Animal(M.camel(), { name: 'Camel', home: { x: 300, z: 110, r: 20 }, speed: 1.3, seed: 892 + i }, g, sc));
    this.roadrunner = add(new Animal(M.roadrunner(), { name: 'Roadrunner', home: { x: 440, z: 175, r: 30 }, speed: 4, run: 30, idle: [0.5, 2], seed: 895 }, g, sc));
    // Piranhas swirl in the pool.
    for (let i = 0; i < 18; i++) {
      const f = M.piranha();
      this.root.add(f);
      this.piranhas.push(f);
    }
  }

  private spawnStaff() {
    const g = this.ground, sc = this.scene, s = this.s;
    const actor = (name: string, app: object, at: THREE.Vector3, seed: number) => {
      const a = new Actor(name, app, g, sc, at, seed);
      this.actors.push(a);
      return a;
    };
    this.ranger = actor('Ranger Rick', RANGER, this.rangerPost(), 11);
    this.bungeeGuy = actor('Bungee Brad', { shirt: 0xe8b820, pants: 0x222222, hat: 0xd83a2a }, s.bungeeShack.clone(), 12);
    this.raftGuide = actor('Rafting guide Skye', { shirt: 0xd83a2a, pants: 0x2a4a7a, hat: 0xe8b820 }, V(142, 0, 226), 13);
    this.gatorHost = actor("Cap'n Chomp", { shirt: 0x2a6a2a, pants: 0x6b5a3a, hat: 0x6b4a2a, beard: true }, s.gatorHost.clone(), 14);
    this.guide = actor('Safari guide Themba', KHAKI, s.lionLookout.clone().add(V(-3, 0, 2)), 15);
    this.kid = actor('Tour kid Bryce', { shirt: 0x3aa65a, pants: 0x3b3b3b, hat: 0xe06aa0, height: 0.7 }, s.lionLookout.clone().add(V(2, 0, 4)), 16);
    this.tourists = [0, 1].map((i) => actor('Tourist', { shirt: 0xf07a2a + i * 0x2020 }, s.lionLookout.clone().add(V(-1 + i * 3, 0, 5)), 17 + i));
    this.conspiracy = actor('Dale (conspiracy guy)', { shirt: 0x6b8e23, pants: 0x3b3b3b, hat: null, beard: true, glasses: true }, s.trailerDoor.clone().add(V(2, 0, 2)), 19);
    this.lumberjack = actor('Big Jim', { shirt: 0xc83a2a, pants: 0x2c3e66, beard: true, width: 1.4 }, s.logDock.clone().add(V(2, 0, 0)), 20);
    for (const a of this.actors) a.face(this.p);
  }

  private rangerPost() {
    return V(232, this.floorAt(232, 392), 392);
  }

  private buildProps() {
    const s = this.s;
    // Bear: basket, hive, flare gun on the post.
    this.place(M.item('basket'), s.picnic);
    this.add('basket', s.picnic, 'Steal the picnic basket');
    const hive = new THREE.Group();
    M.bx(hive, 0.8, 1.0, 0.8, M.mat(0xd8a830), 0, 0, 0);
    M.bx(hive, 0.85, 0.15, 0.85, M.mat(0x8a6a2a), 0, 0.1, 0);
    this.place(hive, s.beehive);
    this.add('honey', V(s.beehive.x, this.floorAt(s.beehive.x, s.beehive.z), s.beehive.z), 'Rub honey from the beehive all over yourself', 3.2);
    this.add('knock', s.caveMouth, 'Knock on the cave', 3.5);
    const post = this.rangerPost();
    const table = new THREE.Group();
    M.bx(table, 1.6, 0.9, 0.8, M.mat(0x8a6a3a), 0, 0.45, 0);
    M.bx(table, 0.1, 2.6, 0.1, M.mat(0x6a4a2a), 0.75, 1.3, 0.35);
    this.place(table, post.clone().add(V(1.5, 0, 0)));
    const flare = M.item('flare');
    flare.name = 'flare';
    this.place(flare, post.clone().add(V(1.5, 0.95, 0)));
    this.add('flare', post.clone().add(V(1.5, 0, 0)), 'Steal the ranger’s flare gun', 2.2);
    this.place(M.signBoard(['RANGER POST', 'Bear country'], '#4a3a20', '#f5e6c8', 3.2, 1.2), post.clone().add(V(-2, 0, 1.5)), 0);
    this.place(M.item('horn'), s.airHorn);
    this.add('airhorn', V(s.airHorn.x, this.floorAt(s.airHorn.x, s.airHorn.z), s.airHorn.z), 'Blow the campground air horn');

    // Bungee.
    const tr = M.truck();
    this.place(tr, s.cordSpool.clone().add(V(2.5, 0, 0)), 0);
    this.place(M.spool(0xd83a2a), s.cordSpool.clone().add(V(0, 0, 0)));
    this.add('bungeebuy', s.bungeeShack, 'Buy a bungee jump ($50)', 2.8);
    this.add('spool', s.cordSpool, 'Swap your cord for the 300 m spool', 2.4);
    this.rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0xf2c230 }));
    this.rope.visible = false;
    this.rope.frustumCulled = false;
    this.root.add(this.rope);

    // Barrels at the sawmill, the dock, the rafting guide.
    for (let i = 0; i < 3; i++) {
      const b = M.barrel();
      this.barrelMeshes.push(b);
      this.place(b, s.barrels.clone().add(V(i * 1.4, 0, 0)));
    }
    this.add('barrel', s.barrels.clone().add(V(1.4, 0, 0)), 'Pick up an empty barrel', 2.8);
    this.add('raftlaunch', s.raftDock, 'Climb into the barrel and push off', 3);
    // Big rocks marking the three channels above the falls.
    for (const side of [-1, 1]) {
      const r = new THREE.Group();
      M.bx(r, 2.2, 2.4, 2.2, M.mat(0x6f6a64), 0, 0.6, 0);
      this.place(r, V(153.5 + side * 3.2, 36, 251), 0.4);
    }

    // Piranha pool.
    this.add('steakpants', this.s.piranhaBank, 'Stuff the raw steak in your swimsuit', 3);
    // Lodge kitchen and gift shop.
    const steak = M.item('steak');
    this.place(steak, s.kitchen.clone().add(V(0, 1.05, -1)));
    this.add('steak', s.kitchen, 'Buy a raw steak ($15)', 2.6);
    const suit = new THREE.Group();
    M.bx(suit, 0.8, 1.6, 0.4, M.mat(0xc83a3a), 0, 0.8, 0);
    M.bx(suit, 0.3, 0.3, 0.42, M.mat(0xf2e8d8, null), 0.15, 1.1, 0);
    this.place(suit, s.giftShop.clone().add(V(-2, 0, -2)));
    this.add('meatsuit', s.giftShop, 'Buy the "Meat Suit" joke costume ($30)', 2.6);
    this.place(M.item('paint'), s.paintCan);
    this.add('paint', V(s.paintCan.x, s.paintCan.y - 1, s.paintCan.z), 'Take the can of red paint', 2.4);

    // Gator show.
    this.add('volunteer', s.gatorGate, 'Volunteer for the gator wrestling show', 2.6);
    this.add('jumpsuit', s.dressingTent, "Swap into the host's spare jumpsuit", 2.6);

    // Tour jeep at the lion lookout.
    this.jeep.pos.copy(s.lionLookout).add(V(-6, 0, 0));
    this.jeep.yaw = Math.PI / 2;
    this.tourJeep = M.jeep(false);
    this.root.add(this.tourJeep);
    this.add('keys', this.jeep.pos, 'Swipe the jeep keys', 3.2);
    this.add('kidhorn', this.kid.pos, 'Let the kid honk the jeep horn', 2.2);
    this.add('drive', this.jeep.pos, 'Drive the tour jeep', 3.4);
    this.add('painttarget', this.jeep.pos, 'Paint a big red target on the jeep', 3.4);

    // Hippo, elephants.
    this.add('pethippo', this.hippo.pos, 'Pet the hippo', 4.5);
    this.peanutBag = M.item('peanuts');
    this.root.add(this.peanutBag);
    this.add('peanuts', this.baby.pos, "Steal the baby elephant's peanuts", 2.6);

    // Balloon.
    this.balloon = M.balloon();
    this.place(this.balloon.root, s.balloon);
    this.add('balloonticket', s.balloonBooth, 'Buy a balloon ride ($200)', 2.6);
    this.add('unclip', s.balloon, 'Unclip the propane line', 2.5).enabled = false;
    this.add('sandwich', s.balloon, 'Throw your sandwich at the vultures', 2.5).enabled = false;

    // Desert.
    const hat = M.item('hat');
    this.place(hat, s.tinfoil);
    this.add('foil', V(s.tinfoil.x, s.tinfoil.y - 1, s.tinfoil.z), 'Take a free tinfoil hat', 2.6);
    this.place(M.item('camera'), s.camera, Math.PI / 2);
    this.add('camera', s.camera, "Set the camera's 30 second timer", 2.4);
    this.add('liedown', s.cropCenter, 'Lie down in the crop circle', 3);
    this.ufo = M.ufo();
    this.ufo.root.visible = false;
    this.root.add(this.ufo.root);
    this.place(M.item('crate'), s.acme);
    this.add('acme', s.acme, 'Order the ACME Rocket Kit ($20)', 2.6);
    this.add('rocketsit', s.rocketPad, 'Set up the rocket and sit on it', 3);
    this.add('fuse', s.rocketPad, 'Light the fuse', 3).enabled = false;
    // The friendly cactus.
    const fc = new THREE.Group();
    M.bx(fc, 1.0, 4.2, 1.0, M.mat(0x4a9a3a), 0, 2.1, 0);
    for (const sd of [-1, 1]) {
      M.bx(fc, 0.9, 0.6, 0.6, M.mat(0x4a9a3a), sd * 0.9, 2.0, 0);
      M.bx(fc, 0.6, 1.4, 0.6, M.mat(0x4a9a3a), sd * 1.2, 2.9, 0);
    }
    M.eyes(fc, 3.4, 0.52, 0.2, 0.16);
    M.bx(fc, 0.5, 0.1, 0.04, M.mat(0x2a1a1a, null), 0, 3.0, 0.52);
    for (let i = 0; i < 30; i++) M.bx(fc, 0.04, 0.04, 0.25, M.mat(0xf2ead8, null), (Math.random() - 0.5) * 1.1, 0.4 + Math.random() * 3.6, 0.55).rotation.y = Math.random() - 0.5;
    this.place(fc, s.friendlyCactus);
    this.add('cactus', s.friendlyCactus, 'Hug the friendly-looking cactus', 2.6);
    // Nuke.
    this.add('fridge', s.fridge, 'Hide in the fridge', 2.4);
    this.add('nukebutton', s.bunkerButton.clone().setY(s.bunkerButton.y - 1), 'Start the test countdown', 2.4);
    // The mirage oasis: a shimmering pond that's never where you are.
    this.mirage = new THREE.Group();
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.1, 16), new THREE.MeshBasicMaterial({ color: 0x5ab8e8, transparent: true, opacity: 0.6 }));
    this.mirage.add(pond);
    for (const [x, z] of [[-6, -3], [5, -5], [6, 4]]) {
      M.bx(this.mirage, 0.4, 6, 0.4, M.mat(0x8a6a3a), x, 3, z);
      M.bx(this.mirage, 4, 0.4, 4, M.mat(0x3a9a3a), x, 6.2, z);
    }
    this.mirage.visible = false;
    this.root.add(this.mirage);
    // Beaver dam, log rolling.
    this.add('logroll', s.logDock, 'Challenge Big Jim to log rolling', 3);
  }

  // ================================================================ interact

  interact(id: string) {
    const g = this.game;
    const body = this.body;
    if (!body || this.busy && !['fuse', 'unclip', 'sandwich', 'drive'].includes(id)) return;
    const s = this.s;
    switch (id) {
      // ---------------- Bear Necessities
      case 'basket':
        if (this.has('basket')) return;
        this.give('basket', 'Smells like ham sandwiches and bad decisions.');
        return;
      case 'honey':
        if (this.has('honey')) return;
        g.sound.noise({ dur: 2, vol: 0.25, freq: 400, type: 'bandpass', q: 6 });
        g.particles.burst(s.beehive, 30, 0xf2c230, 3, { life: 2, size: 0.12, gravity: -0.5 });
        g.character?.tint(0xe0b030, 0.5);
        this.give('honey', 'Sticky. The bees are furious. You smell delicious.');
        return;
      case 'knock':
        this.knockCave();
        return;
      case 'flare':
        if (this.ranger.distTo(this.rangerPost()) < 12) {
          g.say('Ranger Rick', 'Hands off the flare gun, chief. That keeps the bears honest.', 3000);
          return;
        }
        this.flareStolen = true;
        this.scene.getObjectByName('flare')!.visible = false;
        this.it('flare').enabled = false;
        this.give('flare', 'The ranger is on his lunch break. He will never know.');
        return;
      case 'airhorn':
        g.sound.horn();
        g.sound.horn();
        g.toast('HOOOONK', 'That echoed across the whole valley.', 2000);
        if (this.rangerState !== 'flare') {
          this.rangerState = 'horn';
          this.hornT = 30;
          this.ranger.goTo(s.airHorn.clone().setY(0).add(V(2, 0, 2)), 4.5, () => g.say('Ranger Rick', 'Who blew the horn? HELLO? ...Kids.', 3000));
        }
        return;
      // ---------------- Bungee
      case 'bungeebuy':
        if (this.has('cord60') || this.has('cord300')) return g.toast('ALREADY CORDED', 'Go jump off the platform in the middle of the bridge.', 2400);
        if (!g.spend(50, 'Bungee jump')) return;
        this.bungeeGuy.face(this.p);
        g.say('Bungee Brad', 'Sixty meters. I measured it myself, with my arms. Jump off the platform, mid-bridge.', 4200);
        this.give('cord60');
        return;
      case 'spool':
        if (!this.has('cord60')) return g.toast('NOT YET', "You'd need a cord of your own to swap.", 2000);
        if (!this.bungeeHelping) {
          g.say('Bungee Brad', "Whoa, that's the 300 meter spool. That's for the river cleanup crew. Put it down.", 3200);
          g.sound.denied();
          return;
        }
        this.take('cord60');
        this.give('cord300', "Brad is busy with another customer. Plenty of slack now.");
        return;
      // ---------------- Over the Falls
      case 'barrel':
        if (this.has('barrel')) return;
        this.give('barrel', 'Heavy. Smells like pickles.');
        this.carried = M.barrel();
        this.carried.scale.setScalar(0.7);
        this.root.add(this.carried);
        return;
      case 'raftlaunch':
        if (!this.has('barrel')) return g.toast('NO VESSEL', 'You need something to go over the falls in. The sawmill has barrels.', 2600);
        if (body.physical !== 'Athlete') return g.say('Gary', "These legs aren't climbing into a barrel off a wobbly dock. Need an Athlete body.", 3600);
        this.startBarrel();
        return;
      // ---------------- Piranhas
      case 'steak':
        if (this.has('steak') || this.has('steakPants')) return;
        if (['Diner Cook', 'Line Cook', 'Chef'].includes(this.job())) this.give('steak', 'Staff discount: free.');
        else if (g.spend(15, 'Raw steak')) this.give('steak', 'Rare. Very rare. Uncooked, really.');
        return;
      case 'steakpants':
        if (!this.has('steak')) return g.toast('NOTHING TO STUFF', 'A raw steak would fit nicely. The lodge kitchen sells them.', 2400);
        this.take('steak');
        this.give('steakPants', 'Cold. Wet. Bold fashion choice. Now go for a swim.');
        return;
      // ---------------- Gator show
      case 'jumpsuit':
        if (this.has('jumpsuit')) return;
        g.character?.tint(0x2a6a2a, 0.35);
        this.give('jumpsuit', 'One piece, elastic waist. No belt for anyone to grab.');
        return;
      case 'volunteer':
        this.volunteer();
        return;
      // ---------------- Lions and the jeep
      case 'meatsuit':
        if (this.has('meatsuit')) return;
        if (!g.spend(30, 'Meat suit costume')) return;
        g.character?.tint(0xc83a3a, 0.65);
        this.give('meatsuit', 'Ha ha! It looks like a giant steak. The lions would love this. Ha. Ha.');
        return;
      case 'keys':
        if (this.has('keys')) return;
        if (!this.headcount && this.guide.distTo(this.p) < 25) {
          g.say('Safari guide Themba', 'Those are my keys, friend. Back in your seat.', 2800);
          return;
        }
        this.give('keys', 'Themba is busy counting heads. Again.');
        return;
      case 'kidhorn':
        if (this.kidHonking) return;
        this.kidHonking = true;
        g.say('Tour kid Bryce', 'HONK HONK HONK HONK HONK', 2400);
        return;
      case 'painttarget':
        if (!this.has('paint')) return g.toast('NEED PAINT', 'The park garage behind the lodge has a can of red paint.', 2400);
        this.take('paint');
        this.jeep.target = true;
        this.tourJeep.getObjectByName('target')!.visible = true;
        g.sound.trickle();
        g.toast('BULLSEYE', 'A big red target on both sides of the jeep. Very visible.', 2400);
        return;
      case 'paint':
        if (this.has('paint')) return;
        this.give('paint');
        return;
      case 'drive':
        if (this.ride?.kind === 'jeep') return this.exitJeep();
        if (!this.has('keys') && this.job() !== 'Safari Guide') return g.toast('NO KEYS', "Themba keeps the keys on him. He's distracted during head counts.", 2800);
        this.ride = { kind: 'jeep' };
        this.busy = true;
        this.jeep.taken = true;
        g.say('Safari guide Themba', 'HEY! That is a TOUR vehicle!', 2400);
        return;
      // ---------------- Hippo, elephant
      case 'pethippo':
        this.petHippo();
        return;
      case 'peanuts':
        if (this.has('peanuts')) return;
        this.give('peanuts', 'The baby elephant is crying. Mama will want a word.');
        this.peanutBag.visible = false;
        this.moo(520, 1.2);
        return;
      // ---------------- Balloon
      case 'balloonticket':
        if (this.balloonState?.active) return;
        if (!g.spend(200, 'Balloon tour')) return;
        this.give('sandwich', 'Ticket includes one sandwich. The vultures are eyeing it already.');
        this.startBalloon();
        return;
      case 'unclip':
        if (!this.balloonState || this.balloonState.unclipped) return;
        this.balloonState.unclipped = true;
        g.sound.creak();
        g.toast('*click*', "The propane line is loose. The pilot's burner is just for show now.", 2600);
        return;
      case 'sandwich':
        this.throwSandwich();
        return;
      // ---------------- Desert
      case 'foil':
        if (this.has('foil')) return;
        this.conspiracy.face(this.p);
        g.say('Dale', "Take it. Take TWO. But stay away from that crop circle, they're LISTENING. They want your FILE.", 4200);
        this.give('foil');
        this.wearHat();
        return;
      case 'camera':
        this.photoUntil = this.clock + 40;
        g.sound.blip(0.8);
        g.toast('TIMER SET', 'The camera will snap a photo of the crop circle in a bit. Mortalis loves evidence.', 2800);
        return;
      case 'liedown':
        this.lieDown();
        return;
      case 'acme':
        if (this.has('rocket')) return;
        if (!g.spend(20, 'ACME Rocket Kit')) return;
        this.give('rocket', 'Some assembly required. Instructions in Latin.');
        return;
      case 'rocketsit':
        this.setupRocket();
        return;
      case 'fuse':
        this.lightFuse();
        return;
      case 'cactus':
        this.hugCactus();
        return;
      case 'fridge':
        this.hideInFridge();
        return;
      case 'nukebutton':
        if (this.job() !== 'Scientist') {
          g.say('Gary', `It wants a scientist's badge. This body is a ${this.job() || 'nobody'}.`, 3000);
          g.sound.denied();
          return;
        }
        if (this.nukeCountdown) return;
        this.nukeAt = this.clock + 45;
        g.toast('COUNTDOWN STARTED', 'T minus 45 seconds. You have time to get somewhere stupid.', 3000);
        return;
      case 'logroll':
        this.startLogRoll();
        return;
    }
  }

  // ================================================================ per-frame

  step(h: number) {
    const g = this.game;
    if (!this.ride) return;
    const r = this.ride;
    if (r.kind === 'jeep') this.stepJeep(h);
    else if (r.kind === 'fixed') this.seat(r.at, r.facing);
    else if (r.kind === 'balloon' && this.balloonState) {
      const b = this.balloon.root.position;
      this.seat(V(b.x, b.y + 0.3, b.z), g.player.facing);
    } else if (r.kind === 'barrel' && this.barrelRide) {
      const m = this.barrelRide.mesh.position;
      this.seat(V(m.x, m.y + 0.3, m.z), g.player.facing);
    } else if (r.kind === 'rocket' && this.rocket) {
      this.seat(this.rocket.pos.clone().add(V(0, 0.9, 0)), this.rocket.yaw);
    }
  }

  update(dt: number, time: number) {
    this.clock += dt;
    // Body changes (possession, death) reset what Gary is carrying.
    if (this.body !== this.lastBody) {
      this.lastBody = this.body;
      this.items.clear();
      this.refreshInv();
      this.busy = false;
      this.ride = null;
      this.sink = 0;
      this.heat = 0;
      this.inFridge = false;
      this.pets = 0;
      this.hugs = 0;
      this.bungee = null;
      this.rope.visible = false;
      this.show = null;
      this.logGame?.log.removeFromParent();
      this.logGame = null;
      this.hint(null);
      if (this.carried) this.root.remove(this.carried);
      this.carried = null;
      this.hat?.removeFromParent();
      this.hat = null;
    }
    const due = this.timers.filter((t) => t.at <= this.clock);
    this.timers = this.timers.filter((t) => t.at > this.clock);
    for (const t of due) t.fn();

    for (const a of this.animals) a.update(dt, time);
    for (const a of this.actors) a.update(dt);
    this.updateSkeletons(dt);
    for (const c of this.clouds.children) {
      c.position.x += dt * 2;
      if (c.position.x > SX + 120) c.position.x = -120;
    }
    this.waterMat.opacity = 0.74 + Math.sin(time * 1.3) * 0.04;
    if (this.carried) {
      const p = this.p;
      this.carried.position.set(p.x, p.y + 2.3, p.z);
    }

    this.updateRanger(dt);
    this.updateBungeeGuy(dt);
    this.updateBarrel(dt, time);
    this.updatePiranhas(dt, time);
    this.updateShow(dt);
    this.updateTour(dt, time);
    this.updateLions(dt);
    this.updateHippo(dt);
    this.updateElephants(dt, time);
    this.updateJeepVisual(dt);
    this.updateBalloon(dt, time);
    this.updateUfo(dt, time);
    this.updateCamel(dt);
    this.updateRocket(dt, time);
    this.updateNuke(dt);
    this.updateMirage(dt, time);
    this.updateLogRoll(dt);
    this.updateDesertActors(dt);
    if (this.ride?.kind === 'jeep') this.game.prompt('<span class="key">W/S</span> drive · <span class="key">A/D</span> steer · <span class="key">T</span> honk · <span class="key">E</span> get out');
  }

  checkHazards(h: number) {
    if (!this.body) return;
    const p = this.p;
    this.checkBungee(p);
    this.checkPiranhas(p);
    this.checkQuicksand(p, h);
    this.checkHeat(p, h);
    void h;
  }

  onLand(e: { drop: number; launchPos: THREE.Vector3; launchState: string; landState: string }) {
    const p = this.p;
    // Beaver dam: ground pound it.
    if (e.landState === 'groundpound' && !this.damBroken && this.near(this.s.beaverDam, 7)) {
      this.hitDam();
      return true;
    }
    // Bungee with the long cord: the river is the end of the line.
    if (this.bungee?.attached && this.bungee.cord === 'cord300') {
      this.bungeeSplat(p);
      return true;
    }
    return false;
  }

  dispose() {
    this.scene.remove(this.root);
    for (const a of this.animals) a.dispose(this.scene);
    for (const a of this.actors) a.dispose(this.scene);
    for (const sk of this.skeletons) sk.a.dispose(this.scene);
    this.invEl.remove();
    this.hintEl.remove();
  }

  // ================================================================ Bear Necessities

  private updateRanger(dt: number) {
    const r = this.ranger;
    const post = this.rangerPost();
    const cyc = this.clock % 120;
    if (this.rangerState === 'horn') {
      this.hornT -= dt;
      if (this.hornT <= 0) {
        this.rangerState = 'post';
        r.goTo(post, 3);
      }
      return;
    }
    if (this.rangerState === 'flare') return;
    if (cyc > 80 && this.rangerState === 'post') {
      this.rangerState = 'lunch';
      r.goTo(this.s.picnic.clone().add(V(0, 0, -2)), 3, () => {
        r.pose = 'sit';
        this.game.say('Ranger Rick', 'Lunch break. Bears know the rules.', 2000);
      });
    } else if (cyc < 80 && this.rangerState === 'lunch') {
      this.rangerState = 'post';
      r.pose = 'stand';
      r.goTo(post, 3, () => r.face(this.s.caveMouth));
    }
  }

  private rangerCanSave() {
    if (this.flareStolen) return false;
    return this.rangerState === 'post' && this.ranger.distTo(this.rangerPost()) < 6;
  }

  private knockCave() {
    const g = this.game, s = this.s;
    g.sound.tone({ f: 180, dur: 0.08, type: 'square', vol: 0.3 });
    g.sound.tone({ f: 180, dur: 0.08, type: 'square', vol: 0.3, at: 0.25 });
    if (!this.has('basket') || !this.has('honey')) {
      this.bear.raise(1);
      this.after(0.8, () => this.roar());
      g.say('Gary', this.has('basket') ? 'The bear sniffs, grunts, and goes back to sleep. Not sweet enough yet.' : "Nothing but snoring. You're not worth waking up for. Yet.", 3200);
      return;
    }
    this.busy = true;
    this.bear.mood = 3.5;
    this.after(0.5, () => this.roar());
    this.bear.goTo(s.caveMouth.x, s.caveMouth.z - 1.5, true, () => {
      if (this.rangerCanSave()) {
        this.rangerState = 'flare';
        this.ranger.goTo(s.caveMouth.clone().add(V(4, 0, 8)), 6, () => {
          this.ranger.pose = 'point';
          this.ranger.face(this.bear.pos);
          g.sound.whoosh();
          g.sound.noise({ dur: 0.5, vol: 0.5, freq: 2000, type: 'highpass' });
          g.particles.burst(this.bear.pos.clone().add(V(0, 2, 0)), 50, 0xff3020, 8, { life: 1.4, size: 0.25, gravity: 1 });
          g.say('Ranger Rick', 'FLARE! Back in your hole, Gerald! ...You. Go shower. Twice.', 3600);
          g.toast('SAVED BY A RANGER', 'Steal his flare gun on his lunch break, or send him to the air horn.', 3800);
          this.bear.mood = 0.5;
          this.bear.goTo(s.bearCave.x, s.bearCave.z, true);
          this.busy = false;
          this.after(4, () => {
            this.ranger.pose = 'stand';
            this.rangerState = 'post';
            this.ranger.goTo(this.rangerPost(), 3);
          });
        });
        return;
      }
      // Bear hug, then a long roll downhill through the campground.
      const bear = this.bear;
      bear.face(this.p);
      g.sound.scream(1.2);
      g.shake(0.6);
      const start = this.p;
      const end = s.campfire.clone();
      this.ride = { kind: 'fixed', at: start, facing: bear.yaw + Math.PI };
      const steps = 40;
      for (let i = 0; i <= steps; i++)
        this.after(0.8 + i * 0.08, () => {
          const k = i / steps;
          const x = start.x + (end.x - start.x) * k, z = start.z + (end.z - start.z) * k;
          const y = this.floorAt(x, z);
          bear.pos.set(x, y, z);
          bear.rig.root.rotation.x = k * Math.PI * 14;
          this.ride = { kind: 'fixed', at: V(x, y + 1.2, z), facing: bear.yaw };
          if (i % 4 === 0) {
            this.dust(V(x, y + 0.5, z), 10, 0x6a4a2a, 4);
            g.sound.land(0.6);
          }
        });
      this.after(0.8 + steps * 0.08 + 0.1, () => {
        bear.rig.root.rotation.x = 0;
        g.sound.crunch();
        this.rag('bear', end.clone().sub(start).setY(0).normalize().multiplyScalar(14).add(V(0, 9, 0)), 14, 0.6);
        this.after(3, () => {
          bear.mood = 0;
          bear.pos.copy(s.bearCave);
          bear.snapY();
        });
      });
    });
  }

  // ================================================================ Bungee Miscalculation

  private updateBungeeGuy(dt: number) {
    void dt;
    const b = this.bungeeGuy;
    const cyc = this.clock % 60;
    const helping = cyc > 38;
    if (helping && !this.bungeeHelping) {
      this.bungeeHelping = true;
      b.goTo(this.s.bridgeDeck.clone().add(V(0, 0, -16)), 3, () => {
        b.pose = 'point';
        this.game.sound.blip(0.6);
      });
    } else if (!helping && this.bungeeHelping) {
      this.bungeeHelping = false;
      b.pose = 'stand';
      b.goTo(this.s.bungeeShack, 3);
    }
  }

  private checkBungee(p: THREE.Vector3) {
    const s = this.s;
    const cord = this.has('cord300') ? 'cord300' : this.has('cord60') ? 'cord60' : null;
    const deck = s.bridgeDeck.y;
    if (!this.bungee && cord && Math.abs(p.z - s.bungeeJump.z) < 4 && p.x > 229.5 && p.x < 240 && p.y < deck - 1.5) {
      this.bungee = { cord, attached: true, bounces: 0, deck };
      this.rope.visible = true;
      this.game.sound.whoosh();
    }
    if (!this.bungee?.attached) return;
    const hook = s.bungeeHook;
    const pos = this.game.player.position();
    (this.rope.geometry as THREE.BufferGeometry).setFromPoints([hook, pos]);
    if (this.bungee.cord === 'cord60') {
      const end = deck - 20;
      const pl = this.game.player;
      if (pos.y < end && pl.vel.y < 0) {
        this.bungee.bounces++;
        this.game.sound.boing();
        const k = Math.max(0.25, 1 - this.bungee.bounces * 0.25);
        pl.knock(V((hook.x - pos.x) * 0.3, 26 * k, (hook.z - pos.z) * 0.3));
        if (this.bungee.bounces >= 4) {
          this.bungee = null;
          this.rope.visible = false;
          this.take('cord60');
          this.after(0.6, () => {
            pl.teleport(s.bungeeJump.clone().add(V(-3, 0.2, 0)), Math.PI);
            this.game.say('Bungee Brad', 'Woo! Sixty meters, like I said. Measured it myself!', 3000);
            this.game.toast('YOU LIVED', 'Brad measures every cord. Shame if one got swapped.', 3000);
          });
        }
      }
    }
  }

  private bungeeSplat(p: THREE.Vector3) {
    const g = this.game;
    this.rope.visible = false;
    g.sound.splat();
    g.shake(1);
    g.particles.burst(p.clone().add(V(0, 0.5, 0)), 40, 0xdff2ff, 8, { life: 1, size: 0.3 });
    this.rag('bungee', V(0, 4, 0), 6, 0.2);
    // The cord keeps coming and piles on top like spaghetti.
    for (let i = 0; i < 70; i++)
      this.after(0.6 + i * 0.04, () => {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k < 6; k++) pts.push(p.clone().add(V(Math.sin(i * 1.7 + k) * 1.4, 0.3 + i * 0.03 + k * 0.05, Math.cos(i * 2.3 + k) * 1.4)));
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf2c230 }));
        this.root.add(l);
        this.after(20, () => l.removeFromParent());
      });
    this.bungee = null;
  }

  // ================================================================ Over the Falls

  private startBarrel() {
    const g = this.game;
    this.take('barrel');
    if (this.carried) this.root.remove(this.carried);
    this.carried = null;
    const mesh = M.barrel();
    this.root.add(mesh);
    const path: THREE.Vector3[] = [V(138, 0, 188)];
    for (const n of RIVER_A.slice(4, 8)) path.push(V(n.x, n.y, n.z));
    path.push(V(156, 37, 261.5));
    this.barrelRide = { path, i: 0, d: 0, lane: 0, mesh, roped: false, falling: -1 };
    mesh.position.copy(path[0]).setY(40);
    this.ride = { kind: 'barrel' };
    this.busy = true;
    g.sound.whoosh();
    this.hint('Lean with <b>A / D</b> to pick a channel at the end of the rapids. <b>Crouch</b> to duck inside.');
    this.raftGuide.face(this.p);
  }

  private updateBarrel(dt: number, time: number) {
    const br = this.barrelRide;
    if (!br) {
      this.barrelMeshes.forEach((b, i) => (b.visible = i > 0 || !this.has('barrel')));
      return;
    }
    const g = this.game;
    const m = br.mesh;
    if (br.falling >= 0) {
      br.falling += dt;
      const k = Math.min(1, br.falling / 1.6);
      m.position.set(156.5 + k * 6, 37 - k * k * 16, 262 + k * 12);
      m.rotation.x += dt * 9;
      if (Math.floor(br.falling * 6) !== Math.floor((br.falling - dt) * 6)) g.sound.tone({ f: 90, f2: 50, dur: 0.15, type: 'sine', vol: 0.5 });
      if (k >= 1) {
        g.particles.burst(m.position.clone(), 40, 0x8a5a2a, 8, { life: 1.4, size: 0.3 });
        g.particles.burst(m.position.clone(), 40, 0xdff2ff, 6, { life: 1, size: 0.3 });
        g.sound.crunch();
        g.sound.splat();
        this.root.remove(m);
        this.barrelRide = null;
        this.busy = false;
        this.ride = null;
        this.game.player.teleport(V(m.position.x, 21, m.position.z), 0);
        this.game.kill('falls', { kind: 'pancake' });
      }
      return;
    }
    // Float down the river.
    const a = br.path[br.i], b = br.path[br.i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    br.d += dt * 7;
    if (br.d >= L) {
      br.d -= L;
      br.i++;
      if (br.i >= br.path.length - 1) {
        // The brink.
        if (br.lane === 0) {
          br.falling = 0;
          g.toast('MIDDLE CHANNEL', 'Over the falls you go!', 1600);
          this.hint(null);
          g.sound.scream(1.3);
        } else {
          g.toast('WEDGED IN THE ROCKS', 'The side channels are blocked by boulders. Only the middle goes over.', 3000);
          this.endBarrel(V(146, this.floorAt(146, 250), 250));
        }
        return;
      }
    }
    const k = br.d / L;
    const dir = V(b.x - a.x, 0, b.z - a.z).normalize();
    const side = V(dir.z, 0, -dir.x);
    if (br.i >= 2) {
      const mx = this.game.input.moveX;
      if (Math.abs(mx) > 0.5) br.lane = Math.sign(mx) * -1;
    }
    const lateral = br.lane * 3;
    const x = a.x + (b.x - a.x) * k + side.x * lateral, z = a.z + (b.z - a.z) * k + side.z * lateral;
    const wl = this.t.waterAt(x, z) || 38;
    m.position.set(x, wl - 0.6 + Math.sin(time * 5) * 0.15, z);
    m.rotation.z = Math.sin(time * 3) * 0.3;
    m.rotation.y += dt * 2;
    if (Math.random() < 0.3) g.particles.emit(m.position.clone().add(V(0, 0.6, 0)), V(0, 2, 0), 0xdff2ff, { life: 0.5, size: 0.2, gravity: 6, spread: 1 });
    // The rafting guide throws a rope as you pass.
    if (!br.roped && this.raftGuide.distTo(m.position) < 9) {
      br.roped = true;
      this.raftGuide.pose = 'point';
      this.raftGuide.face(m.position);
      g.say('Rafting guide Skye', 'GRAB THE ROPE!', 1800);
      g.sound.whoosh();
      this.after(0.6, () => {
        this.raftGuide.pose = 'stand';
        if (this.game.input.held('crouch')) {
          g.toast('*bonk*', 'The rope bounced off the barrel lid. Skye looks betrayed.', 2400);
          g.sound.tone({ f: 300, f2: 200, dur: 0.1, type: 'square', vol: 0.3 });
        } else {
          g.toast('SAVED BY THE RAFTING GUIDE', 'She hauled you to shore. Next time, crouch inside the barrel when she throws.', 3600);
          this.endBarrel(this.raftGuide.pos.clone().add(V(1, 0, 0)));
        }
      });
    }
  }

  private endBarrel(at: THREE.Vector3) {
    if (!this.barrelRide) return;
    this.root.remove(this.barrelRide.mesh);
    this.barrelRide = null;
    this.hint(null);
    this.release(V(at.x, this.floorAt(at.x, at.z), at.z));
  }

  // ================================================================ Piranha Pool Party

  private updatePiranhas(dt: number, time: number) {
    const c = this.s.piranhaPool;
    this.piranhas.forEach((f, i) => {
      const r = this.frenzy > 0 ? 1.2 + (i % 3) * 0.4 : 3 + (i % 5) * 1.1;
      const sp = this.frenzy > 0 ? 6 : 0.7;
      const a = time * sp * (i % 2 ? 1 : -1) + i;
      const center = this.frenzy > 0 ? this.p : c;
      f.position.set(center.x + Math.cos(a) * r, (this.frenzy > 0 ? center.y + 0.6 + Math.sin(time * 9 + i) * 0.5 : 17.5 - (i % 3) * 0.6), center.z + Math.sin(a) * r);
      f.rotation.y = -a;
    });
    if (this.frenzy > 0) this.frenzy -= dt;
  }

  private checkPiranhas(p: THREE.Vector3) {
    const c = this.s.piranhaPool;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    const wl = this.t.waterAt(p.x, p.z);
    if (d > 9 || !wl || p.y > wl - 0.6 || this.busy) return;
    if (!this.has('steakPants')) {
      if (this.frenzy <= 0 && Math.random() < 0.01) this.game.toast('*nibble*', "They sniff you and swim off. You're bland. Something meaty might help.", 2400);
      return;
    }
    this.busy = true;
    this.take('steakPants');
    const g = this.game;
    this.frenzy = 4;
    this.seat(p, g.player.facing);
    this.ride = { kind: 'fixed', at: p.clone(), facing: g.player.facing };
    for (let i = 0; i < 24; i++)
      this.after(i * 0.08, () => {
        g.particles.burst(p.clone().add(V(0, 1, 0)), 6, i % 2 ? 0xffffff : 0xd83a3a, 5, { life: 0.5, size: 0.2 });
        g.sound.noise({ dur: 0.08, vol: 0.4, freq: 1500 + Math.random() * 2000, type: 'bandpass', q: 3 });
        g.character?.tint(0xf2f0e6, i / 24);
      });
    this.after(2.1, () => {
      const ch = g.character;
      // The skeleton swims out to the far bank and keeps walking.
      const sk = new Actor('Skeleton', { skin: 0xf2f0e6, shirt: 0xf2f0e6, pants: 0xf2f0e6, shoes: 0xf2f0e6, hair: 0xf2f0e6, hat: null, hairStyle: 0, beard: false }, this.ground, this.scene, p.clone(), 99);
      const dir = V(1, 0, 0.3).normalize();
      this.skeletons.push({ a: sk, t: 25, dir });
      sk.goTo(p.clone().addScaledVector(dir, 80), 2.2);
      void ch;
      this.rag('piranha', V(0, -1, 0), 2, 0.1);
    });
  }

  private updateSkeletons(dt: number) {
    for (const sk of this.skeletons) sk.t -= dt;
    for (const sk of this.skeletons.filter((s) => s.t <= 0)) sk.a.dispose(this.scene);
    this.skeletons = this.skeletons.filter((s) => s.t > 0);
  }

  // ================================================================ Gator Show

  private showTime() {
    const cyc = this.clock % 150;
    return { live: cyc < 50, left: 150 - cyc };
  }

  private volunteer() {
    const g = this.game;
    const st = this.showTime();
    if (!st.live) return g.toast('NO SHOW RIGHT NOW', `Next show in ${Math.ceil(st.left)} s. Cap'n Chomp needs his nap.`, 2600);
    if (this.body?.physical !== 'Athlete') {
      g.say("Cap'n Chomp", 'Sorry partner, the insurance says athletes only. Ha! Insurance.', 3000);
      return;
    }
    this.busy = true;
    const pit = this.s.gatorPit;
    this.ride = { kind: 'fixed', at: pit.clone().add(V(0, 0, 2)), facing: Math.PI };
    this.gator.scripted = true;
    this.gator.pos.copy(pit).add(V(0, 0, -1.5));
    this.gator.face(pit.clone().add(V(0, 0, 3)));
    this.gator.snapY();
    this.show = { round: 1, marker: 0, dir: 1, zone: [0.4, 0.6], phase: 'bar', t: 0 };
    g.say("Cap'n Chomp", 'LADIES AND GENTLEMEN, A VOLUNTEER! Round one: press E when the needle hits green!', 3600);
    g.sound.cash();
  }

  private updateShow(dt: number) {
    const sh = this.show;
    if (!sh) return;
    const g = this.game;
    const sign = this.it('volunteer');
    void sign;
    sh.t += dt;
    if (sh.phase === 'bar') {
      const speed = 0.8 + sh.round * 0.5;
      sh.marker += sh.dir * dt * speed;
      if (sh.marker > 1 || sh.marker < 0) sh.dir *= -1;
      sh.marker = Math.min(1, Math.max(0, sh.marker));
      const bar = `<div style="width:300px;height:18px;background:#5a1a1a;border:2px solid #fff;position:relative;margin:6px auto">
        <div style="position:absolute;left:${sh.zone[0] * 100}%;width:${(sh.zone[1] - sh.zone[0]) * 100}%;top:0;bottom:0;background:#3ad04a"></div>
        <div style="position:absolute;left:${sh.marker * 100}%;width:4px;top:-4px;bottom:-4px;background:#fff"></div></div>`;
      this.hint(`ROUND ${sh.round} of 3: press <b>E</b> on green${bar}`);
      if (g.input.pressed('interact') && sh.t > 0.3) {
        const win = sh.marker >= sh.zone[0] && sh.marker <= sh.zone[1];
        this.gator.rig.jaw!.rotation.x = 0;
        if (!win) {
          g.sound.denied();
          g.say("Cap'n Chomp", 'OOH, the gator wins that one! Better luck next show, folks!', 3000);
          this.hint(null);
          this.show = null;
          this.release(this.s.gatorGate.clone());
          this.gator.scripted = false;
          return;
        }
        g.sound.cash();
        g.toast(`ROUND ${sh.round}: YOU WIN`, 'The crowd goes mild.', 1600);
        sh.round++;
        sh.t = 0;
        const w = 0.2 - sh.round * 0.04;
        const c = 0.2 + Math.random() * 0.6;
        sh.zone = [c - w / 2, c + w / 2];
        if (sh.round === 3) {
          sh.phase = 'taunt';
          g.say("Cap'n Chomp", 'Round three! Show the beast who is boss!', 2600);
        }
      }
      this.gator.rig.jaw!.rotation.x = -0.3 - Math.abs(Math.sin(sh.t * 4)) * 0.4;
    } else if (sh.phase === 'taunt') {
      this.hint('ROUND 3: press <b>T</b> to insult the gator. (Or <b>E</b> to bow out like a coward.)');
      if (g.input.pressed('interact')) {
        this.hint(null);
        this.show = null;
        this.release(this.s.gatorGate.clone());
        this.gator.scripted = false;
        g.toast('YOU BOWED', 'Smart. Boring, but smart.', 2000);
        return;
      }
      if (g.input.pressed('scream')) {
        g.say('Gary', 'YOUR MOTHER WAS A HANDBAG!', 2200);
        g.sound.scream(0.8);
        sh.phase = 'roll';
        sh.t = 0;
        this.hint(null);
        this.gator.raise(4);
      }
    } else if (sh.phase === 'roll') {
      // Host tries to pull you out by the belt.
      if (sh.t > 0.6 && sh.t - dt <= 0.6) {
        this.gatorHost.goTo(this.s.gatorPit.clone().add(V(1.5, 0, 3)), 6, () => this.gatorHost.pose = 'point');
        if (!this.has('jumpsuit')) {
          this.after(0.8, () => {
            g.say("Cap'n Chomp", 'Gotcha by the belt, partner! Show over, folks!', 3000);
            g.toast('SAVED BY THE BELT', "Cap'n Chomp yanked you out by your belt. No belt, no handle.", 3600);
            this.gatorHost.pose = 'stand';
            this.gatorHost.goTo(this.s.gatorHost, 3);
            this.show = null;
            this.gator.scripted = false;
            this.gator.mood = 0;
            this.release(this.s.gatorGate.clone());
          });
          return;
        }
        this.after(0.8, () => g.say("Cap'n Chomp", 'Grab his- he hasn\'t got a BELT! Who wears a jumpsuit to a GATOR SHOW?!', 3000));
      }
      if (sh.t > 1.6) {
        // Death roll: spin the gator, the player and the camera.
        const pit = this.s.gatorPit;
        this.gator.rig.root.rotation.z += dt * 14;
        this.ride = { kind: 'fixed', at: pit.clone().add(V(Math.sin(sh.t * 14) * 0.4, 0.6, 1)), facing: sh.t * 14 };
        if (Math.random() < 0.3) g.particles.burst(pit.clone().add(V(0, 1, 1)), 4, 0x6a5a3a, 5, { life: 0.5, size: 0.25 });
        g.shake(0.3);
      }
      if (sh.t > 4) {
        this.gator.rig.root.rotation.z = 0;
        this.gator.scripted = false;
        this.gator.mood = 0;
        this.show = null;
        this.gatorHost.pose = 'stand';
        this.gatorHost.goTo(this.s.gatorHost, 3);
        for (let i = 0; i < 8; i++) this.after(i * 0.15, () => g.sound.noise({ dur: 0.2, vol: 0.25, freq: 2500, type: 'bandpass', q: 1 }));
        g.toast('THE CROWD APPLAUDS', 'They think it was part of the show.', 3000);
        this.rag('gator', V(0, 12, 0), 16, 0.5);
      }
    }
  }

  // ================================================================ Safari tour, lions

  private updateTour(dt: number, time: number) {
    const look = this.s.lionLookout;
    const cyc = this.clock % 60;
    const counting = cyc > 48;
    if (counting !== this.headcount) {
      this.headcount = counting;
      if (counting) {
        this.guide.face(this.tourists[0].pos);
        this.guide.pose = 'point';
        this.game.sound.blip(0.5);
        if (this.guide.distTo(this.p) < 30) this.game.say('Safari guide Themba', 'Head count! One... two... is that a seven?', 2600);
      } else {
        this.guide.pose = 'stand';
        this.guide.face(this.s.prideRock);
      }
    }
    if (this.kidHonking) {
      this.kid.pose = 'wave';
      if (Math.floor(time / 2.5) !== Math.floor((time - dt) / 2.5) && this.kid.distTo(this.p) < 80) this.game.sound.horn();
      this.habituated = Math.min(1, this.habituated + dt / 20);
    }
    const kd = this.it('keys');
    kd.pos.copy(this.jeep.pos);
    kd.enabled = !this.has('keys') && !this.jeep.taken;
    kd.prompt = this.headcount ? 'Swipe the jeep keys (Themba is counting heads)' : 'Swipe the jeep keys';
    const kh = this.it('kidhorn');
    kh.pos.copy(this.kid.pos);
    kh.enabled = !this.kidHonking;
    void look;
  }

  private updateLions(dt: number) {
    const p = this.p;
    const s = this.s;
    this.lionScare -= dt;
    const suit = this.has('meatsuit') && !!this.body;
    const rate = this.body?.physical === 'Feeble' ? 2 : 1;
    for (const l of this.lions) {
      if (l.scripted) continue;
      const d = l.distTo(p);
      if (this.body && d < 30 && this.lionScare <= 0) l.raise(dt * (suit ? 0.9 * rate : 0.15));
      if (!suit) l.mood = Math.min(l.mood, 1.5);
    }
    if (!this.body || this.busy || !suit || this.lionScare > 0) return;
    const angry = this.lions.find((l) => l.moodLevel >= 3 && l.distTo(p) < 30);
    if (!angry) return;
    // The guide honks if he can.
    const guideOk = !this.has('keys') && !this.jeep.taken && !this.headcount && this.habituated < 1 && this.guide.distTo(p) < 70;
    if (guideOk) {
      this.game.sound.horn();
      this.after(0.3, () => this.game.sound.horn());
      this.game.say('Safari guide Themba', 'HONK! HONK! Shoo! Sir, you are dressed as a STEAK!', 3000);
      this.game.toast('SAVED BY THE SAFARI GUIDE', 'He honked the lions away. Take his keys during a head count, or let the kid get the lions used to the horn.', 4200);
      this.lionScare = 25;
      for (const l of this.lions) {
        l.mood = 0;
        l.goTo(s.prideDen.x + (Math.random() - 0.5) * 6, s.prideDen.z + 8, true);
      }
      return;
    }
    if (this.habituated >= 1 && !this.has('keys')) this.game.toast('honk honk', "Themba honks. The lions don't even look up. Bryce ruined horns forever.", 2400);
    this.lionMaul(angry);
  }

  private lionMaul(first: Animal) {
    const g = this.game;
    this.busy = true;
    const p = this.p;
    for (const l of this.lions) {
      l.scripted = true;
      l.goTo(p.x + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2, true);
    }
    void first;
    this.roar();
    this.ride = { kind: 'fixed', at: p, facing: this.game.player.facing };
    for (let i = 0; i < 30; i++)
      this.after(0.8 + i * 0.08, () => {
        g.particles.burst(p.clone().add(V(0, 1, 0)), 8, i % 3 ? 0xc8a878 : 0xc83a3a, 6, { life: 0.8, size: 0.5, gravity: 1 });
        if (i % 5 === 0) g.sound.noise({ dur: 0.15, vol: 0.5, freq: 600, type: 'bandpass', q: 2 });
        g.shake(0.25);
      });
    this.after(3.4, () => {
      g.sound.tone({ f: 90, f2: 60, dur: 0.6, type: 'sawtooth', vol: 0.4 });
      g.say('Mufasa (lion)', '*BUUURP*', 2000);
      this.rag('lions', V(Math.random() * 6 - 3, 16, Math.random() * 6 - 3), 18, 0.5);
      this.after(2.5, () => g.toast('LIONS TAKE A SELFIE', "With Themba's camera. They look great.", 3000));
      this.after(6, () => {
        for (const l of this.lions) {
          l.scripted = false;
          l.mood = 0;
          l.goTo(this.s.prideDen.x, this.s.prideDen.z);
        }
      });
    });
  }

  // ================================================================ Hippo Final Boss

  private updateHippo(dt: number) {
    void dt;
    const h = this.hippo;
    const cyc = this.clock % 12;
    const yawn = cyc > 8;
    if (!h.scripted) {
      this.yawning = yawn;
      if (h.rig.jaw) h.rig.jaw.rotation.x += ((yawn ? 0.9 : 0) - h.rig.jaw.rotation.x) * 0.15;
      if (yawn && Math.floor(cyc * 10) === 81) this.game.sound.tone({ f: 70, f2: 50, dur: 1.4, type: 'sawtooth', vol: 0.15 });
    }
    const it = this.it('pethippo');
    it.pos.copy(h.pos).setY(Math.max(h.pos.y, this.p.y));
    it.prompt = this.yawning ? `Pet the hippo while it's yawning (${this.pets}/3)` : `Pet the hippo (${this.pets}/3)`;
  }

  private petHippo() {
    const g = this.game;
    if (this.nope('"Hippos kill more people than lions, Gary." Nope.')) return;
    const p = this.p;
    if (!this.t.waterAt(p.x, p.z)) return g.toast('TOO FAR', 'Wade into the river to reach it.', 2000);
    if (!this.yawning) {
      g.toast('IT STARES AT YOU', 'Wait for a big yawn. Then pet the gums.', 2200);
      this.hippo.raise(0.4);
      return;
    }
    this.pets++;
    this.hippo.raise(1);
    g.sound.boing();
    if (this.pets < 3) {
      g.toast(`PET ${this.pets}/3`, this.pets === 1 ? 'Squishy. The hippo blinks slowly.' : "The hippo's eyes narrow.", 2000);
      return;
    }
    this.busy = true;
    const h = this.hippo;
    h.scripted = true;
    h.face(p);
    const jaw = h.rig.jaw!;
    jaw.rotation.x = 1.1;
    this.ride = { kind: 'fixed', at: p, facing: g.player.facing };
    this.after(0.6, () => {
      jaw.rotation.x = 0;
      g.sound.crunch();
      g.sound.splat();
      g.shake(1);
      g.particles.burst(p.clone().add(V(0, 1, 0)), 30, 0xdff2ff, 7, { life: 1, size: 0.3 });
      g.toast('*CHOMP*', 'The hippo smiles.', 2400);
      this.rag('hippo', V(0, 18, 0), 20, 0.6);
      this.after(4, () => {
        h.scripted = false;
        h.mood = 0;
        this.pets = 0;
      });
    });
  }

  // ================================================================ Elephant Pancake

  private updateElephants(dt: number, time: number) {
    const b = this.baby;
    this.peanutBag.position.copy(b.pos).add(V(Math.sin(b.yaw) * 1.2, 0.2, Math.cos(b.yaw) * 1.2));
    this.peanutBag.visible = !this.has('peanuts');
    if (!this.has('peanuts') && !this.mother.scripted) b.hold = 1;
    const ip = this.it('peanuts');
    ip.pos.copy(this.peanutBag.position);
    ip.enabled = !this.has('peanuts');
    if (!this.has('peanuts') || this.busy || !this.body) return;
    const p = this.p;
    const pl = this.game.player;
    const hidden = (pl.state === 'crouch' || pl.state === 'crawl') && this.cover[Math.floor(p.z) * SX + Math.floor(p.x)] === 1;
    const m = this.mother;
    if (m.sees(p, 32, 1.1) && !hidden) m.raise(dt * 1.6);
    if (m.moodLevel >= 3 && !m.scripted) {
      m.scripted = true;
      this.moo(330, 1.5);
      this.game.toast('MAMA SAW THE PEANUTS', "Safari guide Themba, from the jeep: 'Nope. I'm not getting out for this one.'", 3600);
      this.busy = true;
    }
    if (m.scripted) {
      m.goTo(p.x, p.z, true);
      if (m.distTo(p) < 2.6) {
        this.game.sound.slam();
        this.game.shake(1.5);
        this.dust(p, 30);
        this.busy = false;
        this.game.kill('elephant', { kind: 'pancake' });
        this.after(1.2, () => {
          m.stop();
          m.hold = 6;
          m.face(p);
          for (let i = 0; i < 12; i++) this.after(i * 0.4, () => m.rig.trunk && (m.rig.trunk.rotation.x = i % 2 ? 1.2 : -0.6));
          this.game.toast('USED AS A FAN', 'Mama elephant fans herself with you. It is a hot day.', 3000);
        });
        this.after(8, () => {
          m.scripted = false;
          m.mood = 0;
        });
      }
    }
    void time;
  }

  // ================================================================ Rhino Charge and the jeep

  private stepJeep(h: number) {
    const g = this.game;
    const j = this.jeep;
    if (j.flying) return;
    const inp = g.input;
    const throttle = inp.moveY;
    const steer = inp.moveX;
    j.speed += throttle * 18 * h;
    j.speed *= Math.pow(0.4, h);
    j.speed = Math.max(-6, Math.min(18, j.speed));
    j.yaw -= steer * h * 1.8 * Math.min(1, Math.abs(j.speed) / 4) * Math.sign(j.speed || 1);
    const nx = j.pos.x + Math.sin(j.yaw) * j.speed * h, nz = j.pos.z + Math.cos(j.yaw) * j.speed * h;
    const ny = this.floorAt(nx, nz);
    const water = this.t.waterAt(nx, nz);
    if (nx > 2 && nz > 2 && nx < SX - 2 && nz < SZ - 2 && Math.abs(ny - j.pos.y) < 2.2 && !(water && water - ny > 3)) {
      j.pos.set(nx, ny, nz);
    } else j.speed *= -0.3;
    this.seat(V(j.pos.x - Math.sin(j.yaw) * 0.2, j.pos.y + 1.3, j.pos.z - Math.cos(j.yaw) * 0.2), j.yaw);
    if (inp.pressed('scream')) this.honk();
  }

  private exitJeep() {
    const j = this.jeep;
    const side = V(Math.cos(j.yaw), 0, -Math.sin(j.yaw)).multiplyScalar(2.5);
    const at = j.pos.clone().add(side);
    j.speed = 0;
    this.release(V(at.x, this.floorAt(at.x, at.z) + 0.1, at.z));
  }

  private honk() {
    const g = this.game;
    const j = this.jeep;
    g.sound.horn();
    const fwd = V(Math.sin(j.yaw), 0, Math.cos(j.yaw));
    for (const r of this.rhinos) {
      const d = r.distTo(j.pos);
      if (d > 35 || r.scripted) continue;
      r.raise(1.4);
      r.face(j.pos);
      const to = j.pos.clone().sub(r.pos).setY(0).normalize();
      const sideways = Math.abs(to.dot(fwd)) < 0.45;
      const parked = Math.abs(j.speed) < 0.6;
      if (r.moodLevel >= 3) {
        if (!j.target) g.toast('THE RHINO HESITATES', "Where to aim? Something like a big red target would help.", 2600);
        else if (!parked || !sideways) g.toast('THE RHINO PAWS THE GROUND', 'It wants a nice broadside. Park sideways and hold still.', 2600);
        else return this.rhinoCharge(r);
      } else g.toast(`RHINO: ${MOOD_NAMES[r.moodLevel].toUpperCase()}`, 'Keep honking.', 1200);
    }
  }

  private rhinoCharge(r: Animal) {
    const g = this.game;
    const j = this.jeep;
    r.scripted = true;
    this.moo(140, 1);
    g.say('Gary', 'Oh. Oh no. It is coming.', 1800);
    r.goTo(j.pos.x, j.pos.z, true, () => {
      g.sound.slam();
      g.sound.crunch();
      g.shake(2);
      this.dust(j.pos, 40, 0xb0603a, 8);
      // Flip the jeep three times into the hippo river.
      j.flying = true;
      const from = j.pos.clone();
      const to = this.hippo.pos.clone();
      const dur = 2.4;
      const steps = 48;
      for (let i = 0; i <= steps; i++)
        this.after((i / steps) * dur, () => {
          const k = i / steps;
          j.pos.lerpVectors(from, to, k);
          j.pos.y = from.y + Math.sin(k * Math.PI) * 22 + (to.y - from.y) * k;
          this.tourJeep.rotation.x = k * Math.PI * 6;
          this.seat(j.pos.clone().add(V(0, 1.3, 0)), j.yaw);
        });
      this.after(dur + 0.05, () => {
        g.sound.splat();
        g.particles.burst(to.clone().add(V(0, 1, 0)), 50, 0xdff2ff, 9, { life: 1.2, size: 0.35 });
        const h = this.hippo;
        h.face(to);
        h.rig.jaw!.rotation.x = 1;
        g.toast('CHAIN REACTION', 'The hippo was waiting.', 2600);
        this.after(0.4, () => {
          h.rig.jaw!.rotation.x = 0;
          g.sound.crunch();
          this.rag('rhino', V(-6, 14, 4), 14, 0.5);
        });
        this.after(5, () => {
          j.flying = false;
          j.taken = false;
          j.target = false;
          this.tourJeep.rotation.x = 0;
          this.tourJeep.getObjectByName('target')!.visible = false;
          j.pos.copy(this.s.lionLookout).add(V(-6, 0, 0));
          j.yaw = Math.PI / 2;
          r.scripted = false;
          r.mood = 0;
        });
      });
    });
  }

  private updateJeepVisual(dt: number) {
    void dt;
    const j = this.jeep;
    if (!j.flying) j.pos.y = this.floorAt(j.pos.x, j.pos.z);
    this.tourJeep.position.copy(j.pos);
    this.tourJeep.rotation.y = j.yaw;
    const d = this.it('drive');
    d.pos.copy(j.pos);
    d.enabled = !j.flying;
    d.prompt = this.ride?.kind === 'jeep' ? 'Get out of the jeep' : 'Drive the tour jeep';
    const pt = this.it('painttarget');
    pt.pos.copy(j.pos);
    pt.enabled = this.has('paint') && !j.target && this.ride?.kind !== 'jeep';
  }

  // ================================================================ Vulture Drop

  private startBalloon() {
    const g = this.game;
    const base = this.s.balloon.clone();
    const pilot = new Actor('Pilot Pieter', KHAKI, this.ground, this.scene, base.clone(), 33);
    this.actors.push(pilot);
    this.balloonState = { t: 0, alt: 0, unclipped: false, popped: false, vy: 0, pilot, base, active: true };
    this.ride = { kind: 'balloon' };
    this.busy = true;
    g.sound.whoosh();
    g.say('Pilot Pieter', 'Welcome aboard! We drift east over the vulture tree. Do NOT feed the vultures.', 4000);
    this.hint('Hold <b>Crouch</b> to vent and drop lower. The pilot hates that.');
  }

  private updateBalloon(dt: number, time: number) {
    const bs = this.balloonState;
    const root = this.balloon.root;
    const fl = this.balloon.flame;
    if (!bs || !bs.active) {
      fl.visible = Math.sin(time * 2) > 0.95;
      this.it('unclip').enabled = false;
      this.it('sandwich').enabled = false;
      return;
    }
    const g = this.game;
    bs.t += dt;
    const vt = this.s.vultureTree;
    // Drift along a line from the pad to past the vulture tree, then back.
    const path = (k: number) => {
      const out = V(vt.x + 20, 0, vt.z - 6);
      return k < 0.5 ? bs.base.clone().lerp(out, k * 2) : out.clone().lerp(bs.base, (k - 0.5) * 2);
    };
    const k = Math.min(1, bs.t / 120);
    const at = path(k);
    const floor = this.floorAt(at.x, at.z);
    if (!bs.popped) {
      const venting = this.ride?.kind === 'balloon' && g.input.held('crouch');
      let target = bs.t < 6 ? (bs.t / 6) * 30 : 30;
      if (venting) bs.alt -= dt * 4;
      else bs.alt += (target - bs.alt) * Math.min(1, dt * 0.4);
      // Pilot fires the burner back up when it gets low.
      if (bs.alt < 13 && bs.t > 8) {
        if (!bs.unclipped) {
          fl.visible = true;
          bs.alt += dt * 8;
          if (Math.random() < 0.02) g.say('Pilot Pieter', 'Too low! Burner on! What are you doing?!', 2200);
        } else if (Math.random() < 0.01) g.say('Pilot Pieter', 'Why is the burner not- WHO UNCLIPPED THE PROPANE?', 2400);
      }
      bs.alt = Math.max(4, bs.alt);
      fl.visible = fl.visible && Math.random() < 0.8;
      target = 0;
      void target;
      root.position.set(at.x, floor + bs.alt, at.z);
      if (k >= 1) {
        bs.active = false;
        root.position.copy(bs.base);
        pilot(this);
        this.release(bs.base.clone().add(V(3, 0, 0)));
        this.hint(null);
        this.take('sandwich');
        g.toast('LANDED', 'Lovely flight. The vultures were very interested in your sandwich.', 2600);
      }
    } else {
      bs.vy -= dt * 12;
      root.position.y += bs.vy * dt;
      root.rotation.y += dt * 4;
      this.balloon.envelope.scale.multiplyScalar(Math.pow(0.3, dt));
      if (root.position.y <= floor + 0.5) {
        root.position.y = floor;
        bs.active = false;
        g.sound.crunch();
        g.shake(1.2);
        this.dust(root.position, 40, 0x9a6a3a);
        this.rag('vulture', V(3, 10, 2), 12, 0.5);
        this.after(8, () => {
          root.position.copy(bs.base);
          root.rotation.y = 0;
          this.balloon.envelope.scale.setScalar(1);
          pilot(this);
          for (const v of this.vultures) v.scripted = false;
        });
      }
      for (const v of this.vultures) {
        v.scripted = true;
        const a = time * 2 + v.opts.seed!;
        v.pos.set(root.position.x + Math.cos(a) * 5, root.position.y + 4 + Math.sin(a * 2), root.position.z + Math.sin(a) * 5);
      }
    }
    const pl = bs.pilot;
    pl.pos.copy(root.position).add(V(0.6, 0.3, 0));
    const u = this.it('unclip');
    u.pos.copy(root.position);
    u.enabled = !bs.unclipped && !bs.popped && this.ride?.kind === 'balloon';
    const sw = this.it('sandwich');
    sw.pos.copy(root.position);
    const low = bs.alt < 15 && Math.hypot(root.position.x - vt.x, root.position.z - vt.z) < 18;
    sw.enabled = low && this.has('sandwich') && !bs.popped && this.ride?.kind === 'balloon';
    function pilot(self: WildRuntime) {
      const i = self.actors.indexOf(bs!.pilot);
      if (i >= 0) self.actors.splice(i, 1);
      bs!.pilot.dispose(self.scene);
    }
  }

  private throwSandwich() {
    const bs = this.balloonState;
    if (!bs || bs.popped) return;
    const g = this.game;
    this.take('sandwich');
    g.sound.whoosh();
    g.toast('SANDWICH AWAY', 'Every vulture in Africa looks up.', 2000);
    const root = this.balloon.root;
    for (const v of this.vultures) v.scripted = true;
    for (let i = 0; i < 20; i++)
      this.after(i * 0.05, () => {
        for (const [j, v] of this.vultures.entries()) v.pos.lerp(root.position.clone().add(V(Math.cos(j) * 2, 9, Math.sin(j) * 2)), 0.25);
      });
    this.after(1.2, () => {
      bs.popped = true;
      bs.vy = 0;
      g.sound.noise({ dur: 0.4, vol: 0.7, freq: 3000, type: 'highpass' });
      g.sound.whoosh();
      g.particles.burst(root.position.clone().add(V(0, 10, 0)), 50, 0xd83a2a, 10, { life: 1.5, size: 0.4 });
      g.say('Pilot Pieter', 'NOT THE ENVELOPE!', 2000);
      this.hint(null);
    });
  }

  // ================================================================ Alien abduction

  private wearHat() {
    const ch = this.game.character;
    if (!ch) return;
    this.hat = M.item('hat');
    this.hat.position.set(0, 0.52, 0);
    ch.parts.head.mesh.add(this.hat);
  }

  private lieDown() {
    const g = this.game;
    if (!this.has('foil')) {
      g.toast('NOTHING HAPPENS', 'The field is silent. Maybe they need some kind of... signal booster.', 2600);
      return;
    }
    this.busy = true;
    const c = this.s.cropCenter;
    this.ride = { kind: 'fixed', at: c.clone(), facing: 0 };
    g.say('Dale', "NO NO NO! Get OUT of there! The hat AMPLIFIES it, you idiot!", 3200);
    this.conspiracy.goTo(c.clone().add(V(-20, 0, 6)), 5, () => (this.conspiracy.pose = 'wave'));
    this.ufoT = 0;
    this.ufo.root.visible = true;
    g.sound.tone({ f: 400, f2: 900, dur: 3, type: 'sine', vol: 0.15, vibrato: 9 });
  }

  private updateUfo(dt: number, time: number) {
    if (this.ufoT < 0) return;
    const g = this.game;
    this.ufoT += dt;
    const t = this.ufoT;
    const c = this.s.cropCenter;
    const u = this.ufo;
    u.lights.forEach((l, i) => ((l.material as THREE.MeshBasicMaterial).color.setHSL((time * 2 + i / 10) % 1, 1, 0.6)));
    u.root.rotation.y += dt * 2;
    if (t < 4) u.root.position.set(c.x, c.y + 80 - (t / 4) * 62, c.z);
    else if (t < 7.5) {
      u.beam.visible = true;
      u.beam.scale.set(1, 18, 1);
      u.beam.position.y = -9;
      const k = (t - 4) / 3.5;
      this.ride = { kind: 'fixed', at: V(c.x, c.y + k * 16, c.z), facing: t * 3 };
      if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) g.sound.tone({ f: 600 + k * 600, dur: 0.2, type: 'sine', vol: 0.12 });
    } else if (t < 9.5) {
      u.beam.visible = false;
      this.ride = { kind: 'fixed', at: V(c.x, c.y + 17, c.z), facing: 0 };
      g.character && (g.character.root.visible = false);
      if (Math.floor(t * 3) !== Math.floor((t - dt) * 3)) {
        g.sound.zap(0.2);
        g.flash('#9affc0', 120);
      }
      if (t - dt < 7.5) g.toast('*PROBING INTENSIFIES*', '', 1800);
    } else if (t < 12) {
      const k = (t - 9.5) / 2.5;
      u.root.position.y = c.y + 18 + k * 70;
      this.ride = { kind: 'fixed', at: V(c.x, c.y + 18 + k * 70, c.z), facing: 0 };
    } else {
      // Dropped from orbit.
      this.ufoT = -1;
      u.root.visible = false;
      u.beam.visible = false;
      if (g.character) g.character.root.visible = true;
      const photo = this.clock <= this.photoUntil;
      this.conspiracy.pose = 'stand';
      this.conspiracy.goTo(this.s.trailerDoor.clone().add(V(2, 0, 2)), 3);
      if (photo) {
        g.flash('#ffffff', 300);
        g.toast('*CLICK*', 'The camera got it. Witness photo on file.', 2400);
        this.rag('abduction', V(0, -10, 0), 6, 0.4);
      } else {
        g.toast('NO PHOTO, NO ALIENS', 'Mortalis files it as a regular fall. Set the camera timer first.', 3600);
        this.rag('faceplant', V(0, -10, 0), 6, 0.4);
      }
    }
  }

  private updateDesertActors(dt: number) {
    void dt;
    const c = this.conspiracy;
    if (!c.busy && c.pose !== 'wave' && c.distTo(this.p) < 10 && Math.random() < 0.003)
      this.game.say('Dale', ['The birds are drones. ALL of them.', 'Mortalis Mutual is run by lizards. I have proof. Somewhere.', 'That crop circle spells something. I can only see it from my roof.'][Math.floor(Math.random() * 3)], 3400);
  }

  // ================================================================ Quicksand

  private updateCamel(dt: number) {
    void dt;
    const cm = this.camel;
    if (cm.opts.name !== 'Humphrey (camel)' || this.sink > 0) return;
    const cyc = this.clock % 100;
    const target = cyc < 50 ? this.s.camelPost : this.s.quicksand.clone().add(V(-12, 0, 8));
    if (cm.distTo(target) > 2 && !cm.scripted) cm.goTo(target.x, target.z);
    else if (cm.distTo(target) > 2) cm.goTo(target.x, target.z);
  }

  private checkQuicksand(p: THREE.Vector3, h: number) {
    const q = this.s.quicksand;
    const inside = Math.hypot(p.x - q.x, p.z - q.z) < 6;
    if (!inside) {
      if (this.sink > 0 && !this.busy) this.sink = 0;
      return;
    }
    if (this.busy && this.sink <= 0) return;
    const g = this.game;
    if (this.sink <= 0) {
      this.busy = true;
      g.toast('THIS IS QUICKSAND', "The sign was lying. Struggling (jumping) makes it worse. Screaming might help.", 3200);
      this.sink = 0.01;
      // Humphrey the camel saves you if he's close.
      if (this.camel.distTo(q) < 30) {
        this.camel.goTo(q.x - 3, q.z + 3, true, () => {
          if (this.sink <= 0 || this.sink > 2.2) return;
          g.say('Humphrey (camel)', '*grumbling camel noise*', 1800);
          g.toast('SAVED BY A CAMEL', 'Humphrey grabbed your collar and pulled. Wait until he wanders back to the gas station.', 3800);
          this.sink = 0;
          this.busy = false;
          this.ride = null;
          this.game.player.lock(false);
          this.game.player.teleport(V(q.x - 8, this.floorAt(q.x - 8, q.z + 6) + 0.2, q.z + 6), 0);
        });
      }
    }
    const struggling = g.input.pressed('jump') || g.input.held('jump');
    this.sink += h * (struggling ? 0.9 : 0.35);
    const base = this.t.ground(q.x, q.z);
    const at = V(p.x, base - this.sink, p.z);
    this.ride = { kind: 'fixed', at, facing: g.player.facing };
    if (Math.random() < 0.2) g.particles.emit(V(p.x, base, p.z), V(0, 1.5, 0), 0xead39a, { life: 0.5, size: 0.2, gravity: 4, spread: 1 });
    if (this.sink > 2.4) {
      this.sink = 0;
      g.toast('glub', 'One hand waves goodbye.', 2000);
      this.rag('quicksand', V(0, 2, 0), 1, 0.1);
    }
  }

  // ================================================================ Roadrunner rocket

  private setupRocket() {
    const g = this.game;
    if (!this.has('rocket')) return g.toast('NO ROCKET', 'The gas station sells ACME kits. For roadrunner purposes only.', 2600);
    this.take('rocket');
    const pad = this.s.rocketPad;
    const mesh = M.rocket();
    mesh.position.copy(pad);
    mesh.rotation.y = Math.PI / 2;
    this.root.add(mesh);
    this.rocket = { mesh, phase: 'set', t: 0, pos: pad.clone(), yaw: Math.PI / 2 };
    this.ride = { kind: 'rocket' };
    this.busy = true;
    this.hint('Press <b>E</b> to light the fuse. The roadrunner comes by every so often.');
    this.it('fuse').enabled = true;
    this.it('rocketsit').enabled = false;
  }

  private lightFuse() {
    if (!this.rocket || this.rocket.phase !== 'set') return;
    this.rocket.phase = 'fuse';
    this.rocket.t = 0;
    this.it('fuse').enabled = false;
    this.hint(null);
    this.game.sound.noise({ dur: 2, vol: 0.3, freq: 5000, type: 'highpass' });
    const rr = this.roadrunner;
    rr.scripted = true;
    rr.pos.set(this.s.rocketPad.x - 30, 0, 166);
    rr.snapY();
    rr.goTo(this.s.rocketPad.x + 60, 166, true);
    this.after(1.2, () => this.game.say('Roadrunner', 'Meep meep!', 1500));
  }

  private updateRocket(dt: number, time: number) {
    const r = this.rocket;
    const fuse = this.it('fuse');
    fuse.pos.copy(this.s.rocketPad);
    if (!r) return;
    const g = this.game;
    r.t += dt;
    if (r.phase === 'fuse') {
      g.particles.emit(r.pos.clone().add(V(-1.5, 0.6, 0)), V(0, 2, 0), 0xffd040, { life: 0.3, size: 0.12, gravity: 0, spread: 1 });
      if (r.t > 2) {
        r.phase = 'fly';
        r.t = 0;
        g.sound.whoosh();
        g.sound.noise({ dur: 3, vol: 0.4, freq: 800, type: 'lowpass' });
        // The roadrunner sidesteps into the desert toward the mesa.
        this.roadrunner.goTo(530, 205, true);
      }
    } else if (r.phase === 'fly') {
      const target = V(530, 0, 214);
      const to = target.clone().sub(r.pos).setY(0);
      const want = Math.atan2(to.x, to.z);
      if (r.t > 1.3) r.yaw += Math.max(-dt * 1.4, Math.min(dt * 1.4, ((want - r.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      const sp = 34;
      r.pos.x += Math.sin(r.yaw) * sp * dt;
      r.pos.z += Math.cos(r.yaw) * sp * dt;
      r.pos.y = this.t.ground(r.pos.x, r.pos.z) + 0.5 + Math.sin(time * 20) * 0.1;
      r.mesh.position.copy(r.pos);
      r.mesh.rotation.y = r.yaw;
      for (let i = 0; i < 3; i++) g.particles.emit(r.pos.clone().add(V(-Math.sin(r.yaw) * 1.6, 0.6, -Math.cos(r.yaw) * 1.6)), V(0, 1, 0), i ? 0xffa020 : 0x888888, { life: 0.6, size: 0.4, gravity: -1, spread: 1.5 });
      const ahead = this.t.ground(r.pos.x + Math.sin(r.yaw) * 2, r.pos.z + Math.cos(r.yaw) * 2);
      if (ahead > r.pos.y + 3 || r.t > 9) {
        g.sound.slam();
        g.sound.thunder();
        g.shake(2);
        g.flash('#ffd060', 300);
        g.particles.burst(r.pos.clone().add(V(0, 1, 0)), 80, 0xff8020, 12, { life: 1.4, size: 0.5 });
        g.particles.burst(r.pos.clone().add(V(0, 1, 0)), 40, 0x333333, 6, { life: 2, size: 0.7, gravity: -2 });
        this.root.remove(r.mesh);
        this.rocket = null;
        this.it('rocketsit').enabled = true;
        this.after(1, () => g.say('Roadrunner', 'Meep meep.', 1500));
        this.after(3, () => (this.roadrunner.scripted = false));
        this.rag('rocket', V(-Math.sin(r.yaw) * 14, 16, -Math.cos(r.yaw) * 14), 16, 0.6);
      }
    }
  }

  // ================================================================ Cactus

  private hugCactus() {
    const g = this.game;
    this.hugs++;
    g.sound.tone({ f: 900, f2: 1400, dur: 0.15, type: 'square', vol: 0.2 });
    g.particles.burst(this.p.clone().add(V(0, 1.2, 0)), 12, 0xf2ead8, 3, { life: 0.4, size: 0.08, gravity: 4 });
    g.character?.kick(0.5);
    if (this.hugs === 1) g.say('Gary', 'Ow.', 1500);
    else if (this.hugs === 2) {
      g.say('Gary', 'OW! ...It looks so friendly though.', 2200);
      g.character?.tint(0xd84a4a, 0.3);
    } else {
      this.busy = true;
      g.character?.tint(0xd84a4a, 0.6);
      g.sound.scream(1.4);
      this.after(0.8, () => this.rag('cactus', V(-Math.sin(g.player.facing) * 6, 6, -Math.cos(g.player.facing) * 6), 8, 0.3));
    }
  }

  // ================================================================ Nuclear test

  private hideInFridge() {
    const g = this.game;
    if (this.inFridge) return;
    this.inFridge = true;
    this.busy = true;
    this.ride = { kind: 'fixed', at: this.s.fridge.clone().add(V(-0.5, 0, -2.5)), facing: 0 };
    g.sound.creak();
    const left = Math.max(0, this.nukeAt - this.clock);
    g.toast('YOU ARE IN A FRIDGE', left < 60 ? `It's cozy. Test in ${Math.ceil(left)} s.` : `Cozy. The next test is in ${Math.ceil(left)} s. Press E to get out.`, 3000);
    this.it('fridge').prompt = 'Get out of the fridge';
  }

  private updateNuke(dt: number) {
    void dt;
    const g = this.game;
    const left = this.nukeAt - this.clock;
    const f = this.it('fridge');
    if (this.inFridge) {
      f.enabled = true;
      if (this.game.input.pressed('interact') && left > 3 && this.ride?.kind === 'fixed') {
        // Leave the fridge (interact routes through here because busy blocks the normal path).
        this.inFridge = false;
        this.busy = false;
        this.release(this.s.fridge.clone().add(V(1, 0, 1.5)));
        f.prompt = 'Hide in the fridge';
      }
    }
    const nearSite = Math.hypot(this.p.x - 580, this.p.z - 60) < 160;
    if (left < 45 && !this.nukeCountdown) {
      this.nukeCountdown = true;
      if (nearSite) g.toast('☢ TEST COUNTDOWN', 'T minus 45 seconds. Clear the area. Or get in a fridge.', 3500);
    }
    if (this.nukeCountdown && nearSite && Math.floor(left) !== Math.floor(left + dt) && (left < 10 || Math.floor(left) % 10 === 0)) {
      g.sound.tone({ f: 880, f2: 440, dur: 0.6, type: 'sawtooth', vol: 0.15 });
      if (left < 10) g.toast(`${Math.ceil(left)}`, '', 900);
    }
    if (left <= 0) {
      this.nukeCountdown = false;
      this.nukeAt = this.clock + 240;
      this.detonate();
    }
  }

  private detonate() {
    const g = this.game;
    const tower = this.s.bombTower;
    const p = this.p;
    const d = Math.hypot(p.x - tower.x, p.z - tower.z);
    if (d > 260) return;
    g.flash('#ffffff', 1500);
    g.sound.thunder();
    g.sound.noise({ dur: 4, vol: 0.9, freq: 200, freq2: 40, type: 'lowpass' });
    g.shake(d < 120 ? 3 : 1);
    // Mushroom cloud.
    for (let i = 0; i < 60; i++)
      this.after(i * 0.05, () => {
        const y = tower.y + Math.min(i, 30) * 1.6;
        g.particles.burst(V(tower.x, y, tower.z), 6, i < 30 ? 0xff8030 : 0xb0a090, 4 + (i > 30 ? 6 : 0), { life: 3, size: 1.2, gravity: -1 });
      });
    if (!this.body || d > 120) return;
    if (this.inFridge) {
      this.inFridge = false;
      const fridge = new THREE.Group();
      M.bx(fridge, 1.6, 2.8, 1.6, M.mat(0xf2f2ee, null), 0, 1.4, 0);
      M.bx(fridge, 0.1, 0.8, 0.1, M.mat(0x888888, null), 0.6, 1.8, 0.85);
      this.place(fridge, this.s.fridge.clone().add(V(-0.5, 0, -2.5)));
      for (let i = 0; i < 60; i++)
        this.after(i * 0.05, () => {
          fridge.position.x -= 1.2;
          fridge.position.y += 2.4 - i * 0.06;
          fridge.rotation.z += 0.3;
        });
      this.after(6, () => fridge.removeFromParent());
      // The shadow left on the wall.
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.85 }));
      sh.position.copy(this.s.doomWall).add(V(0, 0, 0.12));
      this.root.add(sh);
      this.after(120, () => sh.removeFromParent());
      g.toast('THE FRIDGE DID NOT WORK', 'It said "Energy Star" on it and everything.', 3600);
      this.rag('nuke', V(-36, 30, 0), 20, 0.6);
    } else {
      g.character?.tint(0x111111, 0.9);
      this.rag('groundzero', V((p.x - tower.x) * 0.4, 25, (p.z - tower.z) * 0.4), 18, 0.5);
    }
  }

  // ================================================================ Mirage

  private checkHeat(p: THREE.Vector3, h: number) {
    const ds = this.s.duneSea;
    const inSea = Math.hypot(p.x - ds.x, p.z - ds.z) < 62;
    const g = this.game;
    if (!inSea) {
      if (this.heat > 0) {
        this.heat = Math.max(0, this.heat - h * 0.05);
        if (this.heat === 0) g.setHueShift(0);
      }
      return;
    }
    const before = this.heat;
    this.heat += h / 70;
    if (before < 0.02 && this.heat >= 0.02) g.toast('IT IS 131°F', 'The Dune Sea. No shade, no water, no turning back (you can turn back).', 3200);
    if (before < 0.5 && this.heat >= 0.5) g.say('Gary', 'Is that... an oasis? With palm trees? Out here?', 3000);
    if (before < 0.8 && this.heat >= 0.8) {
      g.toast('HEATSTROKE', "You can barely stand. You're crawling now. The oasis is RIGHT THERE.", 3200);
      if (!this.game.player.legsBroken) this.game.player.breakLegs();
    }
    g.setHueShift(this.heat > 0.4 ? Math.sin(this.clock * 2) * this.heat * 25 : 0);
    if (this.heat >= 1 && !this.busy) {
      g.setHueShift(0);
      this.game.player.healLegs();
      g.toast('SO CLOSE', 'The oasis was a mirage. It always is.', 2400);
      this.rag('mirage', V(0, 1, 0), 2, 0.1);
      this.heat = 0;
    }
  }

  private updateMirage(dt: number, time: number) {
    void dt;
    const m = this.mirage;
    if (this.heat < 0.45 || !this.body) {
      m.visible = false;
      return;
    }
    m.visible = true;
    const p = this.p;
    // Always 35 blocks ahead in the direction of the deep dunes.
    const dir = V(this.s.mirageStart.x - p.x, 0, this.s.mirageStart.z - p.z).normalize();
    m.position.set(p.x + dir.x * 35, this.t.ground(p.x + dir.x * 35, p.z + dir.z * 35) + 0.1, p.z + dir.z * 35);
    m.traverse((o) => {
      const mm = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (mm && 'opacity' in mm) {
        mm.transparent = true;
        mm.opacity = 0.45 + Math.sin(time * 4) * 0.2;
      }
    });
  }

  // ================================================================ Beaver dam

  private hitDam() {
    const g = this.game;
    this.damHits++;
    g.sound.crunch();
    g.shake(0.6);
    this.dust(this.s.beaverDam, 20, 0x5a3b26);
    for (const b of this.beavers) b.raise(1.2);
    if (this.damHits < 3) {
      g.toast(`CRACK ${this.damHits}/3`, 'The dam creaks. Somewhere, a beaver gasps.', 2000);
      return;
    }
    this.damBroken = true;
    this.busy = true;
    const p = this.p;
    g.toast('THE DAM BREAKS', 'The flood, and then... the beaver gang.', 2400);
    g.sound.noise({ dur: 3, vol: 0.8, freq: 600, type: 'lowpass' });
    for (let i = 0; i < 30; i++) this.after(i * 0.06, () => g.particles.burst(this.s.beaverDam.clone().add(V((Math.random() - 0.5) * 10, 0, 2)), 10, 0xdff2ff, 8, { life: 1, size: 0.4 }));
    for (const b of this.beavers) {
      b.scripted = true;
      b.goTo(p.x + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2, true);
    }
    this.ride = { kind: 'fixed', at: p, facing: g.player.facing };
    for (let i = 0; i < 12; i++) this.after(0.8 + i * 0.1, () => (g.sound.tone({ f: 1200, f2: 600, dur: 0.06, type: 'square', vol: 0.2 }), g.shake(0.2)));
    this.after(2.2, () => {
      this.rag('beaver', V(0, 9, 14), 14, 0.5);
      this.after(10, () => {
        this.damBroken = false;
        this.damHits = 0;
        for (const b of this.beavers) {
          b.scripted = false;
          b.mood = 0;
        }
      });
    });
  }

  // ================================================================ Log rolling

  private startLogRoll() {
    const g = this.game;
    if (this.logGame) return;
    this.busy = true;
    const pond = this.s.logPond;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 10), M.mat(0x6a4a2a));
    log.rotation.z = Math.PI / 2;
    log.position.set(pond.x, 19.4, pond.z);
    this.root.add(log);
    this.logGame = { t: 0, want: 1, next: 1, balance: 0, log };
    this.lumberjack.pos.set(pond.x + 1.6, 0, pond.z);
    this.lumberjack.snap();
    this.lumberjack.pos.y = 20;
    g.say('Big Jim', 'Nobody beats Big Jim. Keep your feet moving with the log, A and D!', 3200);
  }

  private updateLogRoll(dt: number) {
    const lg = this.logGame;
    if (!lg) return;
    const g = this.game;
    const pond = this.s.logPond;
    lg.t += dt;
    lg.next -= dt;
    if (lg.next <= 0) {
      lg.want = Math.random() < 0.5 ? -1 : 1;
      lg.next = Math.max(0.45, 1.3 - lg.t * 0.05);
    }
    const mx = g.input.moveX;
    lg.balance += (Math.sign(mx) === lg.want ? -1.2 : 1) * dt * (0.5 + lg.t * 0.04);
    lg.balance = Math.max(0, lg.balance);
    lg.log.rotation.x += lg.want * dt * 6;
    this.ride = { kind: 'fixed', at: V(pond.x - 1.2, 20.1, pond.z), facing: Math.PI / 2 };
    g.character?.kick(Math.sin(lg.t * 20) * 0.02);
    this.lumberjack.pos.y = 20;
    this.hint(`Balance! Hold <b>${lg.want < 0 ? '◀ A' : 'D ▶'}</b><div style="width:200px;height:10px;background:#333;margin:6px auto"><div style="height:10px;width:${Math.min(100, lg.balance * 100)}%;background:#e04030"></div></div>`);
    if (lg.t > 25) {
      g.toast('YOU BEAT BIG JIM', 'He fell in. He is crying. You are alive, which is the wrong outcome.', 3600);
      this.endLog();
      this.release(this.s.logDock.clone());
      return;
    }
    if (lg.balance >= 1) {
      g.sound.splat();
      g.particles.burst(V(pond.x - 1.2, 19.5, pond.z), 30, 0xdff2ff, 6, { life: 1, size: 0.3 });
      g.say('Big Jim', 'HA! And STAY DOWN!', 2000);
      this.ride = { kind: 'fixed', at: V(pond.x - 1.5, 16.5, pond.z), facing: 0 };
      for (let i = 0; i < 10; i++) this.after(0.2 + i * 0.2, () => g.particles.emit(V(pond.x - 1.5, 19.8, pond.z), V(0, 1.5, 0), 0xffffff, { life: 0.6, size: 0.15, gravity: -1 }));
      this.endLog(false);
      this.after(2.4, () => this.rag('logroll', V(0, 3, 0), 3, 0.1));
    }
  }

  private endLog(clearHint = true) {
    if (!this.logGame) return;
    this.logGame.log.removeFromParent();
    this.logGame = null;
    if (clearHint) this.hint(null);
    else this.hint(null);
    this.lumberjack.pos.copy(this.s.logDock).add(V(2, 0, 0));
    this.lumberjack.snap();
  }
}

export const WILD_UP = UP;
