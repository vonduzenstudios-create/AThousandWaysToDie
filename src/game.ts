import * as THREE from 'three';
import { RAPIER } from './physics';
import { Sound } from './audio';
import { FollowCam } from './camera';
import { Character } from './character';
import {
  ADJUSTER_NOTES,
  DEATH_BY_ID,
  DENIAL_REASONS,
  JOBS,
  Ledger,
  UNINSURED_LINES,
  isDeserving,
  type PersonFile,
} from './deaths';
import { Input } from './input';
import { Npc } from './npc';
import { Particles } from './particles';
import { Player, PLAYER_CENTER, type LandEvent } from './player';
import { Props } from './props';
import { Ragdoll } from './ragdoll';
import { G, inBox, type TownInfo } from './town';
import { ChunkStreamer, VoxelWorld } from './voxel';
import { MAP_BY_ID } from './maps';
import { routesFrom } from './maps/routes';
import type { SmallvilleBuild } from './maps/smallville';
import type { GameApi, MapBuild, MapDef, MapRuntime, NpcSpawn, TravelKind, TravelStop } from './maps/types';
import { TicketUI, type TicketOption } from './travel/ticket';
import { Transit, type Service } from './travel/transit';
import { checkUnlocks, isOpen, lockReason } from './travel/progress';
import { UI } from './ui';
import { mulberry32, pick, type Rng } from './util';

type Mode = 'title' | 'play' | 'dying' | 'claim' | 'ghost' | 'possessing' | 'travel';

/** A trip in progress: riding out, black-out while the next map loads, riding in. */
interface Trip {
  phase: 'boarding' | 'departing' | 'black' | 'arriving';
  svc: Service | null;
  to: string;
  kind: TravelKind;
  minutes: number;
  fromName: string;
  t: number;
  special: null | 'exitrow' | 'wheelwell' | 'express';
  line?: string;
  title?: string;
}

const TRIP_LINES: Record<TravelKind, string[]> = {
  bus: ['The guy next to you ate a whole onion. Raw.', 'Someone played music out loud the entire way.', 'The driver missed your stop twice, on purpose.'],
  train: ['A conductor punched your ticket with real hatred.', 'The quiet car was not quiet.', 'You were delayed by "a person on the tracks". Rookie.'],
  plane: ['Middle seat. Both armrests taken.', 'The in-flight movie was about a plane crash.', 'Turbulence. The pilot said "whoops" over the intercom.'],
  boat: ['Seasick the whole way. So was the captain.', 'A seagull stole your sandwich at sea.', 'The lifeboats looked decorative.'],
};

type DeathStyle =
  | { kind: 'ragdoll'; vel: THREE.Vector3; spin?: number; bounce?: number }
  | { kind: 'pancake' }
  | { kind: 'cube' };

interface Step {
  at: number;
  fn: () => void;
}

const DEATH_QUIPS = [
  'Hm. Sloppy, but it counts.',
  "That's one way to do it.",
  'I would have done it faster. Just saying.',
  "Paperwork's on my desk. Get the next one.",
  'Do you know how many forms that was?',
];

const POSSESS_LINES = [
  'Pick someone already. I have a lunch break.',
  "Look at their file first. That's what the scythe is for.",
  "Try not to take anyone who isn't due. The Big Guy notices.",
];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private physics: RAPIER.World;
  private input: Input;
  private cam: FollowCam;
  private ui = new UI();
  private sound = new Sound();
  private ledger = new Ledger();
  /** Smallville's original set pieces. Null on every other map. */
  private town: TownInfo | null = null;
  private props: Props | null = null;
  private mapDef!: MapDef;
  private mapBuild!: MapBuild;
  private world!: VoxelWorld;
  private streamer: ChunkStreamer | null = null;
  private runtime: MapRuntime | null = null;
  private transit: Transit | null = null;
  private mapObjects: THREE.Object3D[] = [];
  private mapGround = G;
  private skyMat!: THREE.ShaderMaterial;
  private tickets = new TicketUI();
  private ticket: { stopId: string; to: string; kind: TravelKind; minutes: number } | null = null;
  private trip: Trip | null = null;
  private pendingFall: string | null = null;
  private menuY = 0;
  private api: GameApi;
  private particles: Particles;
  private player: Player;
  private character: Character | null = null;
  private body: PersonFile | null = null;
  private npcs: Npc[] = [];
  private ragdolls: Ragdoll[] = [];
  private pancakes: THREE.Object3D[] = [];
  private activeRagdoll: Ragdoll | null = null;
  private mode: Mode = 'title';
  private sun: THREE.DirectionalLight;
  private lastT = performance.now();
  private helpShown = false;
  private latched = { jump: false, crouch: false, dive: false };
  private barnTries = 0;
  private stationVisits = 0;
  private deniedToastT = 0;
  private wasInStation = false;
  private screamCooldown = 0;
  private acc = 0;
  private time = 0;
  private timeScale = 1;
  private seq: Step[] = [];
  private seqT = 0;
  private rng: Rng = mulberry32(Date.now() & 0xffff);
  private ghost: THREE.Group;
  private ghostPos = new THREE.Vector3();
  private ghostTarget: Npc | null = null;
  private peeTime = 0;
  private peeSoundT = 0;
  private pendingDeath: { id: string; victim: PersonFile; startPos: THREE.Vector3 } | null = null;
  private crosshair: HTMLElement;
  private hornCooldown = 0;
  private npcRespawnT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 600);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Sky dome and lighting.
    const skyColor = new THREE.Color(0x9fd3ff);
    this.scene.fog = new THREE.Fog(skyColor, 90, 260);
    this.skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(0x3d7fe0) }, bottom: { value: new THREE.Color(0xcfeaff) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.2,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), this.skyMat);
    sky.renderOrder = -1;
    this.scene.add(sky);
    (sky as THREE.Mesh).onBeforeRender = () => sky.position.copy(this.camera.position);
    this.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a5a3a, 1.4));
    this.sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);

    // Physics (each map gets a fresh world in loadMap) and the persistent actors.
    this.physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
    this.particles = new Particles(this.scene);

    this.input = new Input(canvas);
    this.input.onAnyGesture = () => this.sound.init();
    this.cam = new FollowCam(this.camera, this.physics);
    this.player = new Player(this.physics, new THREE.Vector3(87, G, 88));
    this.player.setEnabled(false);
    this.wirePlayerHooks();

    this.ghost = this.makeGhost();
    this.scene.add(this.ghost);
    this.ghost.visible = false;
    this.api = this.makeApi();

    this.loadMap('smallville');

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair hidden';
    document.getElementById('ui')!.appendChild(this.crosshair);

    this.ui.blip = () => this.sound.blip(0.6);
    this.ui.setHud(this.ledger, null);

    // Title camera.
    this.ghostPos.set(this.mapBuild.spawn.x, G + 14, this.mapBuild.spawn.z + 6);
    this.cam.yaw = 0.6;
    this.cam.pitch = 0.45;
    this.cam.dist = 26;
    this.cam.autoOrbit = 0.08;
    this.cam.snap(new THREE.Vector3(90, G + 6, 80));

    this.ui.showTitle(() => this.start());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- setup
  private makeGhost() {
    const g = new THREE.Group();
    const sheet = new THREE.MeshLambertMaterial({ color: 0xf2f0ff, emissive: 0x6655aa, transparent: true, opacity: 0.8 });
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.8), sheet);
    bodyM.position.y = 0.2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.75), sheet);
    head.position.y = 1.1;
    g.add(bodyM, head);
    for (let i = 0; i < 4; i++) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), sheet);
      tail.position.set(-0.3 + i * 0.2, -0.55 - (i % 2) * 0.12, 0);
      g.add(tail);
    }
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x111122 });
    for (const x of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.05), eyeM);
      eye.position.set(x, 1.15, 0.39);
      g.add(eye);
    }
    // The scythe.
    const scythe = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), new THREE.MeshLambertMaterial({ color: 0x4a3020 }));
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.06), new THREE.MeshLambertMaterial({ color: 0xd8dde6, emissive: 0x333344 }));
    blade.position.set(0.55, 1.25, 0);
    blade.rotation.z = -0.25;
    scythe.add(pole, blade);
    scythe.position.set(0.65, 0.4, 0.1);
    scythe.rotation.z = 0.15;
    g.add(scythe);
    return g;
  }

  private spawnInitialNpcs() {
    if (!this.town) return this.spawnMapNpcs();
    const a = this.town.areas;
    const plan: [keyof typeof a, (typeof JOBS)[number] | undefined][] = [
      ['downtown', undefined],
      ['downtown', 'Diner Cook'],
      ['downtown', undefined],
      ['park', undefined],
      ['park', 'Retiree'],
      ['farm', 'Farmhand'],
      ['farm', 'Farmhand'],
      ['woods', undefined],
      ['tower', 'Construction Worker'],
      ['garage', 'Mechanic'],
      ['downtown', undefined],
      ['station', 'Cop'],
      ['station', 'Cop'],
      ['construction', 'Construction Worker'],
    ];
    plan.forEach(([area, job], i) => {
      const n = new Npc(this.scene, this.world, a[area], mulberry32(500 + i * 77 + (Date.now() % 1000)), job);
      if (i === 1) {
        n.file.peanutAllergy = true;
        n.file.quirk = 'Has a peanut allergy. Like, a bad one.';
      }
      if (i === 2) n.file.daysLeft = 2; // always at least one fair mark nearby
      if (i === 8) {
        n.file.physical = 'Athlete'; // someone who can do the water tower long jump
        n.file.age = 27;
        n.file.daysLeft = 12;
      }
      if (i === 4) n.file.physical = 'Feeble';
      this.npcs.push(n);
    });
  }

  /** Townspeople for maps without a hand-written cast. */
  private spawnMapNpcs() {
    const b = this.mapBuild;
    const plan: NpcSpawn[] = b.npcs ?? Object.keys(b.areas).map((area) => ({ area, count: 2 }));
    for (const s of plan)
      for (let i = 0; i < (s.count ?? 1) && this.npcs.length < 24; i++) {
        const area = b.areas[s.area];
        if (area) this.npcs.push(new Npc(this.scene, this.world, area, mulberry32(Math.floor(this.rng() * 1e9)), s.job, this.mapGround));
      }
  }

  private spawnRandomNpc() {
    const areas = this.mapBuild.areas;
    const keys = Object.keys(areas);
    if (!keys.length) return;
    const key = pick(this.rng, keys);
    this.npcs.push(new Npc(this.scene, this.world, areas[key], mulberry32(Math.floor(this.rng() * 1e9)), this.town && key === 'station' ? 'Cop' : undefined, this.mapGround));
  }

  private wirePlayerHooks() {
    this.player.hooks = {
      onJump: (kind, chain) => {
        if (kind === 'backflip' || kind === 'sideflip' || kind === 'triple') this.sound.flip();
        if (kind === 'longjump') this.sound.longJump();
        this.sound.jump(kind === 'triple' ? 3 : chain);
        this.character?.kick(-0.25);
      },
      onLand: (e) => this.onLand(e),
      onWallKick: () => {
        this.sound.wallKick();
        this.particles.burst(this.player.position(), 8, 0xdddddd, 3, { life: 0.4, size: 0.2, gravity: 4 });
      },
      onDenied: (move) => {
        if (performance.now() < this.deniedToastT) return;
        this.deniedToastT = performance.now() + 4000;
        this.ui.toast('TOO WEAK', `This body can't do a ${move}. Physical health: ${this.player.tier}.`, 2400);
      },
      onGroundPound: () => this.sound.whoosh(),
      onDive: () => this.sound.whoosh(),
    };
  }

  private start() {
    this.sound.init();
    this.sound.startMusic();
    this.input.requestLock();
    this.cam.autoOrbit = 0;
    this.enterGhost(new THREE.Vector3(80.5, G + 4, 86), true);
  }

  // ---------------------------------------------------------------- bodies
  private setBody(file: PersonFile, ch: Character, at: THREE.Vector3, facing: number) {
    if (this.character) {
      this.scene.remove(this.character.root);
    }
    this.character = ch;
    this.body = file;
    this.scene.add(ch.root);
    this.player.setEnabled(true);
    this.player.teleport(at, facing);
    this.player.tier = file.physical;
    this.player.healLegs();
    this.player.lock(false);
    this.props?.setBarnOpen(file.job === 'Farmhand');
    this.barnTries = 0;
    this.stationVisits = 0;
    this.ui.setHud(this.ledger, file);
  }

  private enterGhost(at: THREE.Vector3, first = false) {
    this.mode = 'ghost';
    this.ghostPos.copy(at);
    this.ghost.visible = true;
    this.player.setEnabled(false);
    this.body = null;
    this.character = null;
    if (first) this.cam.dist = 8;
    this.cam.autoOrbit = 0;
    this.sound.setStyle('ghost');
    this.sound.ghost();
    this.ui.setHud(this.ledger, null);
    this.ui.setBanner('GHOST MODE · Look at someone to read their file · <b>E</b> / <b>Y</b> to possess');
    this.crosshair.classList.remove('hidden');
    if (first) {
      this.ui.say('Death', '"Fine. You do it then." Look at people with the scythe. Their file tells you everything. Pick one and jump in.', 6000);
    } else {
      this.ui.say('Death', pick(this.rng, POSSESS_LINES), 3500);
    }
  }

  private possess(n: Npc) {
    this.mode = 'possessing';
    this.ui.showFile(null);
    this.ui.setBanner(null);
    this.crosshair.classList.add('hidden');
    this.sound.possess();
    const from = this.ghostPos.clone();
    const to = n.pos.clone().add(new THREE.Vector3(0, 1, 0));
    const fair = isDeserving(n.file);
    this.runSeq([
      ...Array.from({ length: 12 }, (_, i) => ({
        at: i * 0.04,
        fn: () => {
          this.ghostPos.lerpVectors(from, to, (i + 1) / 12);
          this.ghost.scale.setScalar(1 - (i / 12) * 0.8);
        },
      })),
      {
        at: 0.5,
        fn: () => {
          this.ghost.visible = false;
          this.ghost.scale.setScalar(1);
          this.ui.flash('#c9b8ff', 400);
          const idx = this.npcs.indexOf(n);
          if (idx >= 0) this.npcs.splice(idx, 1);
          this.scene.remove(n.character.root);
          const facing = n.character.root.rotation.y;
          this.setBody(n.file, n.character, n.pos.clone(), facing);
          this.sound.setStyle('town');
          this.mode = 'play';
          this.npcRespawnT = 4;
          if (!this.helpShown) {
            this.helpShown = true;
            this.ui.toggleHelp();
            setTimeout(() => this.ui.hideHelp(), 30000);
          }
          if (!fair) {
            this.ledger.godAnger++;
            this.ledger.save();
            this.ui.setHud(this.ledger, this.body);
            this.sound.thunder();
            this.ui.flash('#ffffff', 700);
            this.ui.toast('THE TIMELINE TREMBLES', `${n.file.name} wasn't due for ${Math.round(n.file.daysLeft / 365)} years. God is watching.`, 3500);
          } else {
            this.ui.toast(n.file.name.toUpperCase(), `${n.file.age} · ${n.file.job}. Make it count.`, 2200);
          }
        },
      },
    ]);
  }

  // ---------------------------------------------------------------- death
  private kill(id: string, style: DeathStyle) {
    if (this.mode !== 'play' || !this.character || !this.body) return;
    this.pendingFall = null;
    this.ticket = null;
    this.tickets.close();
    const def = DEATH_BY_ID[id];
    this.mode = 'dying';
    this.peeTime = 0;
    this.ui.prompt(null);
    this.ui.setHueShift(0);
    const victim = this.body;
    const ch = this.character;
    this.player.setEnabled(false);
    this.pendingDeath = { id, victim, startPos: this.player.position() };
    this.timeScale = 0.35;

    if (style.kind === 'cube') {
      ch.root.scale.set(ch.app.height * 1.1, ch.app.height * 0.45, ch.app.height * 1.1);
      ch.spinner.rotation.set(0, 0, 0);
      ch.tint(0xe3c25a, 0.7);
      ch.root.position.copy(this.town?.baler ?? this.player.feet()).add(new THREE.Vector3(-1.6, 0, 0));
      this.pancakes.push(ch.root);
      if (this.pancakes.length > 4) this.scene.remove(this.pancakes.shift()!);
      this.sound.stamp();
      this.particles.burst(ch.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 40, 0xe3c25a, 6, { life: 1.4, size: 0.18 });
      this.activeRagdoll = null;
    } else if (style.kind === 'pancake') {
      ch.root.scale.set(ch.app.height * 1.7, ch.app.height * 0.08, ch.app.height * 1.7);
      ch.root.position.y = this.player.feet().y + 0.02;
      ch.spinner.rotation.set(0, 0, 0);
      this.pancakes.push(ch.root);
      if (this.pancakes.length > 4) this.scene.remove(this.pancakes.shift()!);
      this.sound.splat();
      this.sound.boing();
      this.cam.shake(1.2);
      this.particles.burst(this.player.feet().add(new THREE.Vector3(0, 0.3, 0)), 30, 0xe3c25a, 8, { life: 1.2, size: 0.2 });
      this.activeRagdoll = null;
    } else {
      const rd = new Ragdoll(this.physics, this.scene, ch, style.vel, style.spin ?? 8, style.bounce ?? 0.45);
      this.scene.remove(ch.root);
      this.ragdolls.push(rd);
      this.activeRagdoll = rd;
      if (this.ragdolls.length > 6) this.ragdolls.shift()!.dispose();
    }
    this.character = null;
    this.ui.toast(def.name.toUpperCase(), def.category, 2600);
    this.runSeq([
      { at: 1.4, fn: () => (this.timeScale = 1) },
      { at: 3.4, fn: () => this.fileClaim() },
    ]);
  }

  private fileClaim() {
    if (!this.pendingDeath) return;
    const { id, victim } = this.pendingDeath;
    const def = DEATH_BY_ID[id];
    const already = this.ledger.found[id];
    const mult = victim.policy;
    let bonus = 0;
    if (this.activeRagdoll) {
      const d = this.activeRagdoll.position().distanceTo(this.pendingDeath.startPos);
      bonus = Math.round(Math.min(d, 120) * 12);
    }
    let approved = true;
    let total = 0;
    let note: string;
    if (already) {
      approved = false;
      note = pick(this.rng, DENIAL_REASONS);
    } else if (!mult) {
      note = pick(this.rng, UNINSURED_LINES);
    } else {
      total = Math.round((def.payout + bonus) * mult);
      note = pick(this.rng, ADJUSTER_NOTES);
    }
    const isNew = !already;
    this.ledger.claimNo++;
    if (isNew) this.ledger.found[id] = { count: 1, payout: total, first: Date.now(), map: this.mapDef.id };
    else already.count++;
    this.ledger.balance += total;
    this.ledger.total += total;
    this.ledger.save();
    this.ui.setHud(this.ledger, victim);
    this.mode = 'claim';
    document.exitPointerLock?.();
    this.ui.showClaim(
      {
        claimNo: this.ledger.claimNo,
        deathName: def.name,
        category: def.category,
        blurb: def.blurb,
        victim: `${victim.name}, ${victim.age}`,
        isNew,
        approved,
        base: def.payout,
        bonus,
        multiplier: mult,
        total,
        note,
      },
      () => this.afterClaim(),
    );
    setTimeout(() => {
      this.sound.stamp();
      if (approved && total > 0) setTimeout(() => this.sound.cash(), 200);
      else this.sound.denied();
    }, 550);
  }

  /** Death's milestone line when a new route opens. The cutscene thread listens to onUnlock too. */
  private announceUnlocks() {
    for (const e of checkUnlocks(this.ledger)) {
      const kinds = [...new Set(e.routes.map((r) => r.kind))];
      const what = kinds.map((k) => ({ bus: 'the bus', train: 'the train', boat: 'the boats', plane: 'the airport' })[k]).join(' and ');
      setTimeout(() => {
        this.ui.toast('NEW ROUTES OPEN', `${e.deaths} deaths. Death has unlocked ${what}.`, 4200);
      }, 900);
    }
  }

  private afterClaim() {
    this.announceUnlocks();
    this.input.requestLock();
    this.ui.setHud(this.ledger, null);
    const at = this.activeRagdoll ? this.activeRagdoll.position() : this.pendingDeath?.startPos ?? this.mapBuild.spawn.clone();
    at.x = Math.min(Math.max(at.x, 4), this.world.sx - 4);
    at.z = Math.min(Math.max(at.z, 4), this.world.sz - 4);
    at.y = Math.max(at.y, G) + 3;
    this.pendingDeath = null;
    this.enterGhost(at);
    if (Math.random() < 0.5) setTimeout(() => this.ui.say('Death', pick(this.rng, DEATH_QUIPS), 3000), 3800);
  }

  // ---------------------------------------------------------------- triggers
  private onLand(e: LandEvent) {
    const ch = this.character;
    if (!ch) return;
    if (this.mode === 'play' && this.runtime?.onLand?.(e)) return;
    const heavy = Math.min(e.drop / 12, 1);
    if (e.landState === 'groundpound') {
      this.sound.slam();
      this.cam.shake(0.6);
      ch.kick(0.6);
      this.particles.burst(this.player.feet(), 20, 0xbfae8a, 7, { life: 0.6, size: 0.25 });
    } else {
      this.sound.land(heavy);
      ch.kick(0.15 + heavy * 0.4);
      if (e.drop > 3) this.particles.burst(this.player.feet(), 8, 0xcdbf9a, 3, { life: 0.5, size: 0.2, gravity: 6 });
    }
    const [breakH, fatalH] = this.player.tier === 'Feeble' ? [3.5, 7] : this.player.tier === 'Athlete' ? [6, 11] : [5, 9];
    if (e.drop >= breakH && e.drop < fatalH && this.mode === 'play' && !this.player.legsBroken && e.landState !== 'groundpound') {
      this.player.breakLegs();
      this.sound.crunch();
      this.sound.scream(1.2);
      this.cam.shake(0.5);
      this.ui.toast('BOTH LEGS BROKEN', 'Crawl to your doom, or press T (LB) to scream for help.', 3800);
      return;
    }
    if (e.drop >= fatalH && this.mode === 'play') {
      const impact = Math.sqrt(2 * 42 * e.drop);
      const v = this.player.vel.clone().multiplyScalar(1.3);
      v.y = impact * 0.45;
      let id = 'faceplant';
      const town = this.town;
      if (this.pendingFall) id = this.pendingFall;
      else if (town && inBox(e.launchPos, town.treeZone)) id = 'treehouse';
      else if (town && inBox(e.launchPos, town.towerZone) && e.launchState === 'longjump') id = 'watertower';
      this.sound.splat();
      this.cam.shake(0.8);
      this.kill(id, { kind: 'ragdoll', vel: v, spin: 12, bounce: 0.6 });
      if (id === 'faceplant' && town && inBox(e.launchPos, town.towerZone))
        setTimeout(() => this.ui.say('Death', 'From the water tower and THAT is what you went with? Try a long jump next time.', 4000), 1800);
    }
  }

  private nearestInteractable() {
    const p = this.player.feet();
    let best: { id: string; prompt: string } | null = null;
    let bd = Infinity;
    for (const it of [...(this.props?.interactables ?? []), ...(this.runtime?.interactables ?? []), ...this.travelInteractables()]) {
      if (!it.enabled) continue;
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (d < it.radius && Math.abs(it.pos.y - p.y) < 2.5 && d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  private interact(id: string) {
    const ch = this.character;
    if (!ch || !this.body) return;
    if (id.startsWith('travel:')) return this.openTickets(id.slice(7));
    if (id.startsWith('wheelwell:')) return this.stowAway(id.slice(10));
    if (this.runtime?.interactables?.some((it) => it.id === id)) return this.runtime.interact?.(id);
    const pr = this.props;
    if (!pr) return;
    if (id === 'barndoor') {
      if (this.body.job === 'Farmhand') {
        this.ui.toast('Door is open', "You're the farmer. Walk right in.", 1600);
        return;
      }
      this.barnTries++;
      this.sound.denied();
      if (this.barnTries > 3) this.ui.say('Death', "That's a barn. You need to be a farmer to get in there. Quit fuckin' around.", 4000);
      else this.ui.toast('LOCKED', "I don't have the key for this.", 1800);
      return;
    }
    if (id === 'taser' && this.body.job !== 'Cop') {
      this.ui.toast('NOT YOURS', 'Only a cop would be dumb enough to touch that.', 2000);
      return;
    }
    if (id === 'lever') {
      if (this.body.job !== 'Farmhand') {
        this.ui.toast('STAFF ONLY', 'Only farm staff can work the hoist. Find a Farmhand with scythe vision.', 3200);
        this.sound.denied();
        return;
      }
      if (pr.bale.release()) {
        pr.leverPulled = 3;
        this.sound.pull();
        this.sound.creak();
        setTimeout(() => this.sound.creak(), 800);
        setTimeout(() => this.sound.creak(), 1500);
        this.ui.toast('*creeeak*', 'That rope does not look great.', 1800);
      }
      return;
    }
    this.player.lock(true);
    if (id === 'taser') {
      this.sound.zap(1.6);
      this.runSeq([
        ...Array.from({ length: 16 }, (_, i) => ({
          at: i * 0.09,
          fn: () => {
            ch.flash(i % 2 === 0);
            ch.kick(i % 2 ? 0.5 : -0.5);
            this.particles.burst(this.player.position(), 3, 0x9ad8ff, 5, { life: 0.3, size: 0.1, gravity: 0 });
          },
        })),
        { at: 1.5, fn: () => (ch.flash(false), ch.tint(0x222222, 0.6)) },
        { at: 1.6, fn: () => this.kill('taser', { kind: 'ragdoll', vel: new THREE.Vector3(0, 6, 0), spin: 9, bounce: 0.4 }) },
      ]);
      return;
    }
    if (id === 'baler') {
      this.sound.creak();
      this.runSeq([
        { at: 0.2, fn: () => this.ui.toast('*clunk*', 'The baler roars to life.', 1500) },
        ...Array.from({ length: 12 }, (_, i) => ({ at: 0.4 + i * 0.1, fn: () => (this.sound.crunch(), ch.kick(0.3)) })),
        { at: 1.7, fn: () => this.kill('baled', { kind: 'cube' }) },
      ]);
      return;
    }
    if (id === 'jug') {
      this.sound.gulp();
      this.runSeq([
        { at: 0.6, fn: () => this.ui.toast('Refreshing!', 'Tastes kind of sweet, actually.', 1500) },
        ...Array.from({ length: 20 }, (_, i) => ({ at: 1 + i * 0.08, fn: () => ch.tint(0x40ff40, i / 20) })),
        { at: 1.2, fn: () => ch.kick(0.4) },
        { at: 2.0, fn: () => ch.kick(-0.4) },
        { at: 2.6, fn: () => this.kill('antifreeze', { kind: 'ragdoll', vel: new THREE.Vector3(0, 3, 0), spin: 3, bounce: 0.2 }) },
      ]);
    } else if (id === 'mushroom') {
      this.sound.munch();
      const head = ch.parts.head.pivot;
      this.runSeq([
        ...Array.from({ length: 30 }, (_, i) => ({
          at: 0.6 + i * 0.07,
          fn: () => {
            this.ui.setHueShift((i * 24) % 360);
            head.scale.setScalar(1 + i * 0.05);
            ch.root.rotation.y += 0.5;
          },
        })),
        { at: 2.8, fn: () => this.kill('fungus', { kind: 'ragdoll', vel: new THREE.Vector3(0, 9, 0), spin: 14, bounce: 0.5 }) },
      ]);
    } else if (id === 'cookie') {
      this.sound.munch();
      if (!this.body.peanutAllergy) {
        this.runSeq([
          { at: 0.7, fn: () => this.ui.toast('DELICIOUS', "This body isn't allergic. Scythe vision shows who is.", 2600) },
          { at: 0.9, fn: () => this.player.lock(false) },
        ]);
        return;
      }
      const head = ch.parts.head.pivot;
      this.runSeq([
        ...Array.from({ length: 20 }, (_, i) => ({
          at: 0.7 + i * 0.08,
          fn: () => {
            ch.tint(0xff4a4a, i / 30);
            head.scale.set(1 + i * 0.05, 1 + i * 0.04, 1 + i * 0.05);
          },
        })),
        { at: 1.2, fn: () => this.ui.toast('uh oh', 'Was that... peanut butter?', 1500) },
        { at: 2.6, fn: () => this.kill('peanut', { kind: 'ragdoll', vel: new THREE.Vector3(0, 2, 0), spin: 4, bounce: 0.3 }) },
      ]);
    }
  }

  private ejectFromStation() {
    if (!this.town) return;
    this.stationVisits++;
    const out = this.town.station.outside;
    const lines = ['Sir, this is a police station.', 'Out. Now.', 'Last warning, pal. I mean it.'];
    if (this.stationVisits <= 3) {
      this.player.lock(true);
      this.ui.say('Officer', lines[this.stationVisits - 1], 2500);
      this.sound.denied();
      this.runSeq([
        {
          at: 0.5,
          fn: () => {
            this.player.lock(false);
            this.player.teleport(out, Math.PI / 2);
            this.player.knock(new THREE.Vector3(10, 7, 0));
            this.sound.whoosh();
            this.ui.toast('THROWN OUT', `Only cops get in. (${this.stationVisits}/3)`, 1800);
          },
        },
      ]);
      return;
    }
    // They warned you.
    const ch = this.character;
    if (!ch) return;
    this.player.lock(true);
    this.ui.say('Officer', "That's it. STOP RESISTING!", 2500);
    this.runSeq([
      ...Array.from({ length: 14 }, (_, i) => ({
        at: 0.3 + i * 0.12,
        fn: () => {
          this.sound.noise({ dur: 0.08, vol: 0.6, freq: 600 + Math.random() * 600, type: 'bandpass', q: 2 });
          this.sound.tone({ f: 120, f2: 60, dur: 0.08, type: 'sine', vol: 0.3 });
          ch.kick(i % 2 ? 0.6 : -0.4);
          ch.tint(0x6a3a7a, i / 20);
          this.cam.shake(0.3);
          this.particles.burst(this.player.position().add(new THREE.Vector3(0, 0.6, 0)), 4, 0xffffff, 4, { life: 0.3, size: 0.12, gravity: 0 });
        },
      })),
      { at: 2.1, fn: () => this.kill('beatdown', { kind: 'ragdoll', vel: new THREE.Vector3(9, 8, 0), spin: 10, bounce: 0.4 }) },
    ]);
  }

  private scream() {
    if (!this.character || performance.now() < this.screamCooldown) return;
    this.screamCooldown = performance.now() + 1500;
    this.sound.scream(1.1 + Math.random() * 0.3);
    this.character.kick(-0.3);
    const p = this.player.feet();
    const near = this.npcs
      .filter((n) => !n.helping && n.pos.distanceTo(p) < 28)
      .sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))
      .slice(0, 2);
    if (!near.length) {
      if (this.player.legsBroken) this.ui.say('Death', 'Nobody can hear you out here. Crawl somewhere busier.', 3000);
      else this.ui.toast('AAAAAAAH', 'Nobody heard you.', 1400);
      return;
    }
    this.ui.toast('AAAAAAAH', `${near.length === 1 ? 'Someone is' : 'People are'} coming.`, 1600);
    let handled = false;
    for (const n of near)
      n.summon(p, () => {
        if (handled || this.mode !== 'play' || !this.body) return;
        handled = true;
        if (this.player.legsBroken) {
          this.ui.say(n.file.name, "Oh god, your legs! I called 911, hang on!", 3000);
          setTimeout(() => {
            if (this.mode !== 'play' || !this.player.legsBroken) return;
            this.ui.flash('#ffffff', 600);
            this.player.healLegs();
            this.sound.cash();
            this.ui.toast('PATCHED UP', 'The paramedics put casts on both legs. Somehow you can run.', 2600);
          }, 3500);
        } else {
          this.ui.say(n.file.name, pick(this.rng, ["What? What happened? ...You look fine.", 'Was that you screaming? Weirdo.', "I'm calling the cops if you do that again."]), 2600);
        }
      });
  }

  private nearFence(p: THREE.Vector3) {
    if (!this.town) return false;
    const f = this.town.fence;
    const m = 1.4;
    const insideOuter = p.x > f.x0 - m && p.x < f.x1 + 1 + m && p.z > f.z0 - m && p.z < f.z1 + 1 + m;
    const insideInner = p.x > f.x0 + m && p.x < f.x1 + 1 - m && p.z > f.z0 + m && p.z < f.z1 + 1 - m;
    return insideOuter && !insideInner;
  }

  private checkHazards(dt: number) {
    if (this.mode !== 'play' || !this.character) return;
    const p = this.player.position();
    if (p.y < -12) {
      this.kill('edge', { kind: 'ragdoll', vel: this.player.vel.clone(), spin: 5 });
      return;
    }
    if (this.checkTransit(p)) return;
    this.runtime?.checkHazards?.(dt);
    if (this.mode !== 'play') return;
    const inStation = !!this.town && inBox(p, this.town.station.interior);
    if (inStation && !this.wasInStation && this.body?.job !== 'Cop' && this.player.state !== 'locked') this.ejectFromStation();
    this.wasInStation = inStation;
    const tr = this.props?.train;
    if (tr && tr.moving) {
      if (tr.contains(p)) {
        this.sound.splat();
        this.sound.horn();
        this.cam.shake(1.5);
        const side = p.z < tr.z ? -1 : 1;
        this.kill('train', { kind: 'ragdoll', vel: new THREE.Vector3(tr.speed * 1.4, 16, side * 6), spin: 18, bounce: 0.5 });
        return;
      }
      this.hornCooldown -= dt;
      if (Math.abs(p.z - tr.z) < 25 && p.x - tr.x > 0 && p.x - tr.x < 70 && this.hornCooldown <= 0) {
        this.sound.horn();
        this.hornCooldown = 3;
      }
    }
    const bale = this.props?.bale;
    if (bale && bale.state === 'falling' && bale.velocityY < -4) {
      const bp = bale.position();
      if (Math.abs(bp.x - p.x) < 1.5 && Math.abs(bp.z - p.z) < 1.5 && bp.y - 1 < p.y + 1.1 && bp.y > p.y - 0.8) {
        this.kill('pancake', { kind: 'pancake' });
        return;
      }
    }
    // Peeing.
    if (this.input.held('pee') && this.player.grounded && (this.player.state === 'ground' || this.player.state === 'locked')) {
      this.peeTime += dt;
      const fd = new THREE.Vector3(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
      const origin = this.player.feet().add(new THREE.Vector3(0, 0.75, 0)).addScaledVector(fd, 0.3);
      for (let i = 0; i < 2; i++)
        this.particles.emit(origin, fd.clone().multiplyScalar(3.5).add(new THREE.Vector3(0, 2.2, 0)), 0xf5e050, { life: 0.8, size: 0.08, gravity: 14, spread: 0.3 });
      this.peeSoundT -= dt;
      if (this.peeSoundT <= 0) {
        this.sound.trickle();
        this.peeSoundT = 0.07;
      }
      const target = this.player.feet().addScaledVector(fd, 1.4);
      if (this.nearFence(target) && this.peeTime > 0.5) {
        this.peeTime = 0;
        const ch = this.character;
        this.player.lock(true);
        this.sound.zap(1.4);
        this.cam.shake(0.5);
        this.mode = 'dying';
        this.runSeq([
          ...Array.from({ length: 14 }, (_, i) => ({
            at: i * 0.08,
            fn: () => {
              ch.flash(i % 2 === 0);
              this.ui.flash(i % 2 ? '#ffffff' : '#ffe040', 80);
              this.particles.burst(this.player.position(), 3, 0xfff27a, 6, { life: 0.3, size: 0.1, gravity: 0 });
            },
          })),
          {
            at: 1.15,
            fn: () => {
              ch.flash(false);
              ch.tint(0x111111, 0.85);
              this.mode = 'play';
              this.kill('shocking', { kind: 'ragdoll', vel: fd.clone().multiplyScalar(-9).add(new THREE.Vector3(0, 14, 0)), spin: 10 });
            },
          },
        ]);
      }
    } else this.peeTime = 0;
  }

  // ---------------------------------------------------------------- maps
  /** What maps get to drive. */
  private makeApi(): GameApi {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this;
    return {
      get player() {
        return g.player;
      },
      get body() {
        return g.body;
      },
      get character() {
        return g.character;
      },
      get sound() {
        return g.sound;
      },
      get particles() {
        return g.particles;
      },
      get input() {
        return g.input;
      },
      get camYaw() {
        return g.cam.yaw;
      },
      get time() {
        return g.time;
      },
      get balance() {
        return g.ledger.balance;
      },
      get mapId() {
        return g.mapDef.id;
      },
      kill: (id, style) => g.kill(id, style),
      runSeq: (steps) => g.runSeq(steps),
      toast: (t, b, ms) => g.ui.toast(t, b, ms),
      say: (who, line, ms) => g.ui.say(who, line, ms),
      shake: (a) => g.cam.shake(a),
      flash: (c, ms) => g.ui.flash(c, ms),
      prompt: (html) => g.ui.prompt(html),
      setHueShift: (d) => g.ui.setHueShift(d),
      spend: (amount, label) => {
        if (g.ledger.balance < amount) {
          g.ui.toast("CAN'T AFFORD IT", `${label} costs $${amount}. Go die for money.`, 2200);
          g.sound.denied();
          return false;
        }
        g.ledger.balance -= amount;
        g.ledger.save();
        g.ui.setHud(g.ledger, g.body);
        g.sound.cash();
        return true;
      },
      travelTo: (stopKey, opts) => g.travelTo(stopKey, opts),
    };
  }

  /**
   * Unload the current map and load another. Each map gets a fresh physics world; the player,
   * ghost, camera and the body Gary is wearing carry over.
   */
  private loadMap(id: string, focus?: THREE.Vector3) {
    const def = MAP_BY_ID[id] ?? MAP_BY_ID.smallville;
    // Unload.
    this.runtime?.dispose();
    this.runtime = null;
    this.transit?.dispose();
    this.transit = null;
    for (const n of this.npcs) n.remove(this.scene);
    this.npcs = [];
    this.ghostTarget = null;
    for (const r of this.ragdolls) r.dispose();
    this.ragdolls = [];
    this.activeRagdoll = null;
    for (const p of this.pancakes) this.scene.remove(p);
    this.pancakes = [];
    this.streamer?.dispose();
    this.streamer = null;
    for (const o of this.mapObjects) this.scene.remove(o);
    this.mapObjects = [];
    this.town = null;
    this.props = null;
    const old = this.physics;
    this.physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
    this.cam.physics = this.physics;
    old.free();

    // Load.
    const before = new Set(this.scene.children);
    this.mapDef = def;
    this.world = new VoxelWorld(def.size.x, def.size.y, def.size.z);
    let seed = 0;
    for (const c of def.id) seed = (seed * 31 + c.charCodeAt(0)) | 0;
    const rng = mulberry32(seed);
    const t0 = performance.now();
    this.mapBuild = def.build(this.world, rng);
    const b = this.mapBuild;
    const at = focus ?? b.spawn;
    this.mapGround = b.groundAt ? b.groundAt(b.spawn.x, b.spawn.z) : this.world.topY(b.spawn.x, b.spawn.z);
    if (!Number.isFinite(this.mapGround)) this.mapGround = G;
    this.player.rebind(this.physics, at);
    this.player.setEnabled(this.mode === 'play');
    const fogFar = def.sky?.fogFar ?? 260;
    this.streamer = new ChunkStreamer(this.world, this.scene, this.physics, { radius: fogFar + 16 });
    this.streamer.buildNear(at, 80);
    if (def.id === 'smallville') {
      this.town = (b as SmallvilleBuild).town;
      this.props = new Props(this.scene, this.physics, this.town);
      this.props.setBarnOpen(this.body?.job === 'Farmhand');
    }
    this.runtime = b.setup?.({ scene: this.scene, physics: this.physics, world: this.world, rng, game: this.api }) ?? null;
    if (def.waterLevel !== undefined) {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(def.size.x + 1200, def.size.z + 1200),
        new THREE.MeshLambertMaterial({ color: 0x2a7fd0, transparent: true, opacity: 0.78 }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(def.size.x / 2, def.waterLevel, def.size.z / 2);
      water.receiveShadow = true;
      this.scene.add(water);
    }
    this.transit = new Transit(def.id, b.stops, this.scene, this.physics, rng, def.waterLevel);
    // Look.
    const top = def.sky?.top ?? 0x3d7fe0, bottom = def.sky?.bottom ?? 0xcfeaff;
    this.skyMat.uniforms.top.value.setHex(top);
    this.skyMat.uniforms.bottom.value.setHex(bottom);
    this.scene.fog = new THREE.Fog(bottom === 0xcfeaff ? 0x9fd3ff : bottom, def.sky?.fogNear ?? 90, fogFar);
    this.spawnInitialNpcs();
    this.mapObjects = this.scene.children.filter((o) => !before.has(o) && o !== this.character?.root);
    console.info(`[map] ${def.id} loaded in ${Math.round(performance.now() - t0)} ms, ${this.streamer.loaded} sections`);
  }

  private stopKey(stopId: string) {
    return `${this.mapDef.id}:${stopId}`;
  }

  private stopNear(p: THREE.Vector3): TravelStop | null {
    for (const s of this.mapBuild.stops) {
      const inside = s.board ? inBox(p.clone().setY(Math.min(Math.max(p.y, s.board.min.y), s.board.max.y)), s.board) : false;
      if (inside || Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 3.2) if (Math.abs(s.pos.y - p.y) < 3) return s;
    }
    return null;
  }

  /** Ticket prompts at stops, plus the plane's wheel well while it's parked. */
  private travelInteractables() {
    const out: { id: string; pos: THREE.Vector3; radius: number; prompt: string; enabled: boolean }[] = [];
    for (const s of this.mapBuild.stops) {
      if (this.ticket?.stopId === s.id) continue;
      out.push({ id: `travel:${s.id}`, pos: s.pos, radius: 3.2, prompt: `Buy a ${s.kind === 'plane' ? 'plane' : s.kind === 'boat' ? 'ferry' : s.kind} ticket`, enabled: true });
    }
    for (const svc of this.transit?.services.values() ?? []) {
      if (svc.kind !== 'plane' || svc.phase !== 'dwell') continue;
      const gear = new THREE.Vector3(-1, 0, 1.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), svc.yaw).add(svc.pos);
      out.push({ id: `wheelwell:${svc.stop.id}`, pos: gear, radius: 2.4, prompt: 'Climb into the landing gear bay', enabled: true });
    }
    return out;
  }

  private ticketPrompt() {
    if (!this.ticket) return null;
    const svc = this.transit?.get(this.ticket.stopId);
    if (!svc) return null;
    if (svc.phase === 'dwell') return 'Ticket in hand. <b>Walk to the door</b> to board.';
    return `Ticket in hand. Wait at <b>${svc.stop.name}</b>.`;
  }

  private routeOptions(stop: TravelStop): TicketOption[] {
    return routesFrom(this.stopKey(stop.id), (to) => !!MAP_BY_ID[to.split(':')[0]]).map((r) => {
      const [mapId, stopId] = r.to.split(':');
      const m = MAP_BY_ID[mapId];
      return {
        to: r.to,
        mapName: m.name,
        stopName: stopId,
        kind: r.kind,
        fare: r.fare,
        minutes: r.minutes,
        locked: isOpen(this.ledger, r) ? null : lockReason(this.ledger, r),
        affordable: this.ledger.balance >= r.fare,
      };
    });
  }

  private openTickets(stopId: string) {
    const stop = this.mapBuild.stops.find((s) => s.id === stopId);
    if (!stop) return;
    document.exitPointerLock?.();
    this.sound.blip(1.2);
    this.menuY = 0;
    this.tickets.show(stop.name, stop.kind, this.ledger.balance, this.routeOptions(stop), (o) => this.buyTicket(stop, o), () => this.input.requestLock());
  }

  private menuInput() {
    const inp = this.input;
    const y = inp.moveY > 0.5 ? 1 : inp.moveY < -0.5 ? -1 : 0;
    if (y !== this.menuY && y !== 0) this.tickets.move(-y);
    this.menuY = y;
    if (inp.pressed('up')) this.tickets.move(-1);
    if (inp.pressed('down')) this.tickets.move(1);
    if (inp.pressed('interact') || inp.pressed('confirm')) {
      if (!this.tickets.confirm()) this.sound.denied();
    } else if (inp.pressed('crouch')) this.tickets.close();
  }

  private buyTicket(stop: TravelStop, o: TicketOption) {
    this.input.requestLock();
    this.ledger.balance -= o.fare;
    this.ledger.save();
    this.ui.setHud(this.ledger, this.body);
    this.sound.cash();
    this.ticket = { stopId: stop.id, to: o.to, kind: o.kind, minutes: o.minutes };
    const svc = this.transit?.get(stop.id);
    svc?.call();
    const what = { bus: 'bus', train: 'train', plane: 'flight', boat: 'ferry' }[o.kind];
    this.ui.toast('TICKET BOUGHT', `${o.mapName}, $${o.fare}. ${svc?.phase === 'dwell' ? `The ${what} is boarding now!` : `Your ${what} is on its way.`}`, 2600);
  }

  /** Hide in a parked plane's gear bay: free trip, frozen arrival. */
  private stowAway(stopId: string) {
    const svc = this.transit?.get(stopId);
    if (!svc || svc.phase !== 'dwell') return;
    const routes = routesFrom(this.stopKey(stopId), (to) => !!MAP_BY_ID[to.split(':')[0]]).filter((r) => r.kind === 'plane' && isOpen(this.ledger, r));
    if (!routes.length) {
      this.ui.toast('NOWHERE TO GO', 'No flights you can reach from here yet.', 2400);
      return;
    }
    const r = pick(this.rng, routes);
    this.ui.say('Death', "The landing gear bay. Not heated, not pressurized. Bold choice.", 3000);
    this.board(svc, { to: r.to, kind: 'plane', minutes: r.minutes }, 'wheelwell');
  }

  /** Climb aboard a docked vehicle and ride out. */
  private board(svc: Service, t: { to: string; kind: TravelKind; minutes: number }, special: Trip['special'] = null) {
    if (!this.character) return;
    this.tickets.close();
    this.ui.prompt(null);
    this.ticket = null;
    this.mode = 'travel';
    this.player.setEnabled(false);
    this.character.root.visible = false;
    svc.hold = Math.max(svc.hold, Math.max(0, 2.5 - (svc.dur - svc.t)));
    this.trip = { phase: 'boarding', svc, to: t.to, kind: t.kind, minutes: t.minutes, fromName: this.mapDef.name, t: 0, special };
    this.sound.blip(1.6);
    if (svc.kind === 'bus' || svc.kind === 'train') this.sound.horn();
  }

  /** Send the player somewhere without a ticket (arrests, set pieces). */
  private travelTo(stopKey: string, opts: { line?: string; title?: string } = {}) {
    if (this.mode !== 'play' || !this.character) return;
    const mapId = stopKey.split(':')[0];
    if (!MAP_BY_ID[mapId]) return;
    this.ticket = null;
    this.tickets.close();
    this.mode = 'travel';
    this.player.setEnabled(false);
    this.character.root.visible = false;
    this.trip = { phase: 'black', svc: null, to: stopKey, kind: 'bus', minutes: 0, fromName: this.mapDef.name, t: 0, special: null, line: opts.line, title: opts.title };
    this.tickets.fade(true, 600);
  }

  /** Moving vehicles: getting hit, getting stuck to the express, boarding with a ticket. */
  private checkTransit(p: THREE.Vector3) {
    const tr = this.transit;
    if (!tr) return false;
    const hit = tr.hit(p);
    if (hit) {
      const v = hit.vel.clone();
      this.sound.splat();
      this.cam.shake(1.4);
      if (hit.kind === 'bus') this.sound.horn();
      if (hit.kind === 'train') {
        const out = routesFrom(this.stopKey(hit.stop.id), (to) => !!MAP_BY_ID[to.split(':')[0]]).find((r) => r.kind === 'train');
        if (out && this.character) {
          // Stuck to the front of the express; peel off at the next station.
          this.sound.horn();
          this.ui.toast('SPLAT', 'You are now a hood ornament.', 2200);
          this.character.tint(0xff9a9a, 0.3);
          if (hit.phase !== 'departing') hit.hold = 0;
          this.board(hit, { to: out.to, kind: 'train', minutes: out.minutes }, 'express');
          this.character.root.visible = true;
          return true;
        }
        this.kill('express', { kind: 'ragdoll', vel: v.multiplyScalar(1.4).add(new THREE.Vector3(0, 14, 0)), spin: 16, bounce: 0.5 });
        return true;
      }
      const id = hit.kind === 'bus' ? 'bus' : hit.kind === 'plane' ? 'runway' : 'ferry';
      this.kill(id, { kind: 'ragdoll', vel: v.multiplyScalar(1.5).add(new THREE.Vector3(0, hit.kind === 'boat' ? 6 : 13, 0)), spin: 14, bounce: 0.55 });
      return true;
    }
    // Board when the vehicle is docked and we're at its door.
    if (this.ticket && this.player.state !== 'locked') {
      const svc = tr.get(this.ticket.stopId);
      if (svc && svc.phase === 'dwell' && svc.door().distanceTo(this.player.feet()) < 4.5) {
        this.board(svc, this.ticket);
        return true;
      }
    }
    return false;
  }

  private tripLine(kind: TravelKind) {
    return pick(this.rng, TRIP_LINES[kind]);
  }

  /** Real-time trip sequencing. */
  private updateTrip(dt: number) {
    const trip = this.trip;
    if (!trip) return;
    trip.t += dt;
    const ch = this.character;
    const svc = trip.svc;
    const stuck = () => {
      if (!ch || !svc) return;
      const front = new THREE.Vector3(svc.model.half.x + 0.25, 0.9, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), svc.yaw).add(svc.pos);
      ch.root.position.copy(front);
      const dir = new THREE.Vector3(Math.cos(svc.yaw), 0, -Math.sin(svc.yaw));
      ch.root.rotation.y = Math.atan2(-dir.x, -dir.z);
      ch.root.scale.set(1, 1, 0.45);
      ch.root.visible = true;
    };
    if (trip.phase === 'boarding' || trip.phase === 'departing') {
      if (trip.special === 'express') stuck();
      if (svc && svc.phase === 'departing') trip.phase = 'departing';
      // Exit Row: the emergency door, at altitude.
      const flying = svc && svc.kind === 'plane' && svc.phase === 'departing' && svc.pos.y > svc.at.y + 6 && !trip.special;
      this.ui.prompt(flying ? '<span class="key">E</span>Open the emergency exit door' : null);
      if (flying && this.input.pressed('interact')) {
        if (this.body?.physical === 'Feeble') {
          this.ui.toast('TOO WEAK', "You can't budge the handle. Physical health: Feeble.", 2200);
        } else {
          trip.special = 'exitrow';
          this.sound.whoosh();
          this.ui.flash('#ffffff', 400);
          this.ui.toast('WHOOSH', 'Well, you got some air.', 1800);
          trip.phase = 'black';
          trip.t = 0;
          this.tickets.fade(true, 300);
          return;
        }
      }
      const leaveAt = svc?.kind === 'plane' ? svc.dur * 0.97 : Math.min(svc ? svc.dur * 0.7 : 0, 6);
      if (trip.phase === 'departing' && svc && (svc.t > leaveAt || svc.phase === 'idle')) {
        trip.phase = 'black';
        trip.t = 0;
        this.ui.prompt(null);
        this.tickets.fade(true, 700);
      }
      return;
    }
    if (trip.phase === 'black') {
      if (trip.t < 0.8) return;
      if (trip.t < 10) {
        // Load once, then hold the card a moment.
        trip.t = 10;
        const [mapId, stopId] = trip.to.split(':');
        const toDef = MAP_BY_ID[mapId];
        this.tickets.card(
          TicketUI.tripCard(trip.kind, trip.fromName, toDef.name, toDef.name, trip.minutes, trip.line ?? (trip.special === 'wheelwell' ? 'It is very, very cold in here.' : trip.special === 'exitrow' ? 'Free falling.' : this.tripLine(trip.kind))),
        );
        // Let the card paint before the (blocking) map build.
        setTimeout(() => this.arrive(mapId, stopId), 60);
      }
      return;
    }
    if (trip.phase === 'arriving') {
      if (trip.special === 'express') stuck();
      if (!svc) return;
      // Wheel well: the gear drops on approach and so do you.
      if (trip.special === 'wheelwell' && svc.phase === 'arriving' && svc.t > svc.dur * 0.55 && ch) {
        const drop = svc.pos.clone().add(new THREE.Vector3(0, 0.5, 0));
        this.mode = 'play';
        this.trip = null;
        this.player.teleport(drop, this.player.facing);
        ch.root.position.copy(drop);
        ch.root.visible = true;
        ch.tint(0xbfe8ff, 0.75);
        this.particles.burst(drop, 30, 0xdff4ff, 6, { life: 1.2, size: 0.18 });
        this.ui.toast('THE GEAR IS DOWN', 'So are you. Frozen solid.', 2200);
        this.kill('wheelwell', { kind: 'ragdoll', vel: svc.vel.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, -6, 0)), spin: 4, bounce: 0.15 });
        return;
      }
      if (svc.phase === 'dwell') this.stepOff(svc);
    }
  }

  /** Called while the screen is black: build the destination and start the ride in. */
  private arrive(mapId: string, stopId: string) {
    const trip = this.trip;
    if (!trip) return;
    const def = MAP_BY_ID[mapId];
    const probeStops = () => this.mapBuild.stops.find((s) => s.id === stopId) ?? null;
    this.loadMap(def.id, undefined);
    const stop = probeStops();
    const svc = stop ? this.transit?.get(stop.id) ?? null : null;
    if (stop) this.streamer?.buildNear(stop.pos, 96);
    setTimeout(() => {
      this.tickets.card(null);
      this.tickets.fade(false, 900);
    }, 1400);
    if (trip.special === 'exitrow' && this.character) {
      // Out the door at altitude, over the destination.
      const p = (stop?.pos ?? this.mapBuild.spawn).clone().add(new THREE.Vector3((this.rng() - 0.5) * 30, 95, (this.rng() - 0.5) * 30));
      this.trip = null;
      this.mode = 'play';
      this.player.setEnabled(true);
      this.player.teleport(p, this.player.facing);
      this.character.root.visible = true;
      this.pendingFall = 'exitrow';
      return;
    }
    if (!svc) {
      // Nowhere to dock: just appear at the stop (or the map's spawn).
      this.trip = null;
      this.finishArrival(stop?.pos ?? this.mapBuild.spawn, stop?.facing ?? 0, stop?.name ?? def.name);
      return;
    }
    svc.arriveNow();
    trip.svc = svc;
    trip.phase = 'arriving';
  }

  private stepOff(svc: Service) {
    const trip = this.trip;
    this.trip = null;
    if (trip?.special === 'express' && this.character) {
      // Peel off onto the platform.
      const ch = this.character;
      ch.root.scale.set(1, 1, 1);
      this.mode = 'play';
      this.player.teleport(ch.root.position.clone(), ch.root.rotation.y);
      this.ui.toast('*schlorp*', `${svc.stop.name}. Your stop.`, 2000);
      this.kill('express', { kind: 'ragdoll', vel: new THREE.Vector3(Math.sin(svc.stop.facing) * 3, 1, Math.cos(svc.stop.facing) * 3), spin: 3, bounce: 0.2 });
      return;
    }
    svc.hold = 2;
    this.finishArrival(svc.stop.pos, svc.stop.facing, svc.stop.name);
  }

  private finishArrival(pos: THREE.Vector3, facing: number, name: string) {
    this.mode = 'play';
    this.player.setEnabled(true);
    this.player.teleport(pos, facing);
    this.player.lock(false);
    if (this.character) {
      this.character.root.visible = true;
      this.character.root.position.copy(pos);
    }
    this.cam.yaw = facing + Math.PI;
    this.ui.toast(this.mapDef.name.toUpperCase(), name, 2600);
    this.ui.setHud(this.ledger, this.body);
  }

  // ---------------------------------------------------------------- sequencing
  private runSeq(steps: Step[]) {
    this.seqT = 0;
    this.seq = steps.slice().sort((a, b) => a.at - b.at);
  }

  private updateSeq(dt: number) {
    if (!this.seq.length) return;
    this.seqT += dt;
    while (this.seq.length && this.seq[0].at <= this.seqT) this.seq.shift()!.fn();
  }

  // ---------------------------------------------------------------- loop
  private frame() {
    const now = performance.now();
    const realDt = Math.min((now - this.lastT) / 1000, 0.1);
    this.lastT = now;
    this.input.poll();
    const inp = this.input;

    if (inp.pressed('music')) this.sound.toggleMusic();
    if (inp.pressed('help')) this.ui.toggleHelp();
    if (inp.pressed('ledger') && this.mode !== 'title') this.ui.toggleLedger(this.ledger);
    if (this.mode === 'claim' && inp.pressed('confirm')) this.ui.pendingClaim?.();
    if (this.mode === 'title' && inp.pressed('confirm')) this.ui.titleGo?.();
    this.ui.setPadMode(inp.padConnected);

    const mouseSens = 0.0032;
    if (this.mode === 'play' || this.mode === 'ghost') this.cam.zoom(inp.wheel);
    this.cam.minDist = this.mode === 'dying' || this.mode === 'claim' ? 6 : 0;
    // Right mouse (or first person) makes the character face where the camera looks.
    const steer = inp.rmb || this.cam.firstPerson;
    const lookDX = inp.mouseDX * mouseSens + inp.lookX * realDt * 2.6;
    const lookDY = inp.mouseDY * mouseSens + inp.lookY * realDt * 2;

    const dt = realDt * this.timeScale;
    this.time += dt;
    this.updateSeq(realDt);

    // Fixed-step physics + player.
    this.acc += dt;
    const h = 1 / 60;
    // Latch button presses until a physics step consumes them, so a press on a
    // frame with no fixed step (common on 120/144 Hz screens) is never lost.
    if (inp.pressed('jump')) this.latched.jump = true;
    if (inp.pressed('crouch')) this.latched.crouch = true;
    if (inp.pressed('dive')) this.latched.dive = true;
    let first = true;
    let steps = 0;
    while (this.acc >= h && steps < 5) {
      if (this.mode === 'play' || this.mode === 'dying') {
        if (this.mode === 'play' && this.character) {
          const peeing = inp.held('pee') && this.player.grounded;
          this.player.update(h, {
            moveX: peeing || this.ui.ledgerOpen || this.tickets.open ? 0 : inp.moveX,
            moveY: peeing || this.ui.ledgerOpen || this.tickets.open ? 0 : inp.moveY,
            camYaw: this.cam.yaw,
            jumpPressed: first && this.latched.jump && !this.tickets.open,
            jumpHeld: inp.held('jump'),
            crouchHeld: inp.held('crouch'),
            crouchPressed: first && this.latched.crouch,
            divePressed: first && this.latched.dive,
            sprint: inp.sprint,
            faceYaw: steer ? this.cam.forwardFacing : null,
          });
        }
      }
      this.props?.train.update(h);
      this.props?.bale.update(h);
      this.transit?.step(h);
      this.runtime?.step?.(h);
      this.physics.step();
      if (this.mode === 'play') this.checkHazards(h);
      this.acc -= h;
      if (first) this.latched = { jump: false, crouch: false, dive: false };
      first = false;
      steps++;
    }
    if (steps === 5) this.acc = 0;

    for (const r of this.ragdolls) r.update();
    for (const n of this.npcs) n.update(dt);
    this.props?.update(dt, this.time);
    this.runtime?.update?.(dt, this.time);
    this.particles.update(dt);

    // Train smoke.
    const train = this.props?.train;
    if (train?.moving) {
      train.smokeTimer -= dt;
      if (train.smokeTimer <= 0) {
        train.smokeTimer = 0.08;
        this.particles.emit(train.smokePos(), new THREE.Vector3(-4, 4, 0), 0xdddddd, { life: 1.6, size: 0.6, gravity: -1, spread: 1 });
      }
    }
    this.updateTrip(realDt);

    // Keep the town populated.
    if (this.npcRespawnT > 0) {
      this.npcRespawnT -= dt;
      if (this.npcRespawnT <= 0 && this.npcs.length < 14) this.spawnRandomNpc();
    }

    // Mode-specific per-frame logic and camera.
    if (this.mode === 'play' && this.character) {
      const ch = this.character;
      const feet = this.player.feet();
      ch.root.position.copy(feet);
      ch.root.rotation.y = this.player.facing;
      ch.animate(realDt, {
        speed: this.player.horizSpeed(),
        grounded: this.player.grounded,
        state: this.player.state,
        stateTime: this.player.stateTime,
        airTime: this.player.airTime,
      });
      if (this.tickets.open) {
        this.ui.prompt(null);
        this.menuInput();
      } else {
        const it = this.player.state !== 'locked' ? this.nearestInteractable() : null;
        this.ui.prompt(it ? `<span class="key">E</span>${it.prompt}` : this.ticketPrompt());
        if (it && inp.pressed('interact')) this.interact(it.id);
      }
      if (inp.pressed('scream') && this.player.state !== 'locked') this.scream();
      const eyeH = this.player.state === 'crawl' ? 0.6 : this.player.state === 'crouch' ? 1.1 : 1.65;
      this.cam.update(realDt, feet.clone().add(new THREE.Vector3(0, 1.6, 0)), lookDX, lookDY, feet.clone().add(new THREE.Vector3(0, eyeH, 0)));
      ch.root.visible = !this.cam.firstPerson;
    } else if (this.mode === 'travel') {
      const svc = this.trip?.svc;
      const target = svc ? svc.pos.clone().add(new THREE.Vector3(0, svc.model.half.y * 2 + 1, 0)) : this.player.position();
      this.cam.minDist = 18;
      this.cam.update(realDt, target, lookDX + realDt * 0.15, lookDY);
    } else if (this.mode === 'dying' || this.mode === 'claim') {
      const target = this.activeRagdoll ? this.activeRagdoll.position() : this.player.position();
      if (target.y < -20) target.y = -20;
      target.y += 1;
      this.cam.pitch += (0.55 - this.cam.pitch) * Math.min(1, realDt * 2);
      if (this.character) this.character.root.visible = true;
      this.cam.update(realDt, target, lookDX + realDt * 0.25, lookDY);
    } else if (this.mode === 'ghost' || this.mode === 'possessing') {
      if (this.mode === 'ghost') this.updateGhost(realDt, lookDX, lookDY);
      else this.cam.update(realDt, this.ghostPos.clone().add(new THREE.Vector3(0, 1, 0)), lookDX, lookDY);
      this.ghost.position.copy(this.ghostPos);
      this.ghost.visible = this.mode === 'possessing' || !this.cam.firstPerson;
      this.ghost.position.y += Math.sin(this.time * 3) * 0.15;
      this.ghost.rotation.y = this.cam.yaw + Math.PI;
    } else {
      this.cam.update(realDt, new THREE.Vector3(90, G + 6, 80), 0, 0);
    }

    // Sun follows the action for crisp shadows; the world streams in around it.
    const focus =
      this.mode === 'play'
        ? this.player.position()
        : this.mode === 'ghost'
          ? this.ghostPos
          : this.mode === 'travel' && this.trip?.svc
            ? this.trip.svc.pos.clone()
            : this.activeRagdoll?.position() ?? this.ghostPos;
    this.streamer?.update(focus, 5);
    this.sun.position.set(focus.x + 30, focus.y + 60, focus.z + 20);
    this.sun.target.position.copy(focus);

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  private updateGhost(dt: number, lookDX: number, lookDY: number) {
    const inp = this.input;
    const yaw = this.cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const sp = 14;
    let vy = 0;
    if (inp.held('jump') || inp.held('up')) vy += 1;
    if (inp.held('crouch') || inp.held('down')) vy -= 1;
    this.ghostPos.x += (fx * inp.moveY + rx * inp.moveX) * sp * dt;
    this.ghostPos.z += (fz * inp.moveY + rz * inp.moveX) * sp * dt;
    this.ghostPos.y += vy * sp * 0.7 * dt;
    this.ghostPos.x = Math.min(Math.max(this.ghostPos.x, 2), this.world.sx - 2);
    this.ghostPos.z = Math.min(Math.max(this.ghostPos.z, 2), this.world.sz - 2);
    this.ghostPos.y = Math.min(Math.max(this.ghostPos.y, this.mapGround + 0.5), this.world.sy + 10);
    const gEye = this.ghostPos.clone().add(new THREE.Vector3(0, 1, 0));
    this.cam.update(dt, gEye, lookDX, lookDY, gEye);

    // Scythe vision: whoever is closest to the center of the screen.
    const camPos = this.camera.position;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    let best: Npc | null = null;
    let bestScore = Infinity;
    for (const n of this.npcs) {
      const to = n.pos.clone().add(new THREE.Vector3(0, 1, 0)).sub(camPos);
      const d = to.length();
      if (d > 45) continue;
      const ang = to.normalize().angleTo(dir);
      const near = n.pos.distanceTo(this.ghostPos) < 4;
      if (ang > 0.2 && !near) continue;
      const score = near ? -1 : ang * 10 + d * 0.02;
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (best !== this.ghostTarget) {
      this.ghostTarget?.character.mats.forEach((m) => m.emissive.setHex(0));
      this.ghostTarget = best;
      best?.character.mats.forEach((m) => m.emissive.setHex(0x3a2a66));
      this.ui.showFile(best ? best.file : null);
      if (best) this.sound.blip(1.4);
    }
    if (best && inp.pressed('interact')) {
      best.character.mats.forEach((m) => m.emissive.setHex(0));
      this.ghostTarget = null;
      this.possess(best);
    }
  }
}

export const PLAYER_FEET_OFFSET = PLAYER_CENTER;
