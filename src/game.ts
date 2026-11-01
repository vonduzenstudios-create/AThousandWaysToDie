import * as THREE from 'three';
import { RAPIER } from './physics';
import { Sound } from './audio';
import { FollowCam } from './camera';
import { Atms, withdraw } from './economy';
import { SkillBar, hasPassive, type SkillHost } from './skills';
import { Combat } from './combat';
import { Character } from './character';
import {
  ADJUSTER_NOTES,
  DEATH_BY_ID,
  DENIAL_REASONS,
  Ledger,
  UNINSURED_LINES,
  isDeserving,
  registerMapDeaths,
  type PersonFile,
} from './deaths';
import { Input } from './input';
import { Npc } from './npc';
import type { GameApi, MapRuntime } from './maps/types';
import { HOSPITAL_DEATHS, setupHospital } from './places/hospital';
import { LifeSystem } from './life';
import { deathGossip, smallvilleLife } from './life/maps/smallville';
import { Particles } from './particles';
import { Player, PLAYER_CENTER, type LandEvent } from './player';
import { Props } from './props';
import { Ragdoll } from './ragdoll';
import { Rides } from './rides';
import { G, SIZE, buildTown, inBox, type TownInfo } from './town';
import { HOMETOWN_DEATHS, Hometown } from './hometown';
import { GROCERY } from './places/grocery';
import type { PlaceRuntime } from './places/types';
import { PostFX, warmLighting } from './render/post';
import { StreetKit } from './kit';
import { UI } from './ui';
import { mulberry32, pick, turnToward, type Rng } from './util';
import { Minimap, type Blip } from './minimap';
import { Traffic, type Obstacle } from './vehicles/traffic';
import { Car, sit } from './vehicles/car';
import { DOOR_OUT, HALF, RIDE } from './vehicles/carModel';
import { carSfx, EngineSound } from './vehicles/carSound';
import { smallvillePois, smallvilleTraffic } from './vehicles/smallville';
import { StoryDirector } from './story/director';
import { arrest, commit } from './maps/institutions/common';
import { TitleMenu, type DevMap } from './titlemenu';
import { loadOptions, saveOptions, type Options } from './options';

type Mode = 'title' | 'play' | 'dying' | 'claim' | 'ghost' | 'possessing';

type DeathStyle =
  | { kind: 'ragdoll'; vel: THREE.Vector3; spin?: number; bounce?: number }
  | { kind: 'pancake' }
  | { kind: 'cube'; at?: THREE.Vector3; color?: number };

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
  private town: TownInfo;
  private props: Props;
  private particles: Particles;
  private player: Player;
  private character: Character | null = null;
  private body: PersonFile | null = null;
  private life!: LifeSystem;
  /** Townsfolk bodies (owned by the life system). */
  private get npcs(): Npc[] {
    return this.life.npcs;
  }
  private ragdolls: Ragdoll[] = [];
  private pancakes: THREE.Object3D[] = [];
  private activeRagdoll: Ragdoll | null = null;
  private mode: Mode = 'title';
  private sun: THREE.DirectionalLight;
  /** Post-processing (bloom, grade, AO by quality). Render through this, not the renderer. */
  private post!: PostFX;
  private lastT = performance.now();
  private helpShown = false;
  private latched = { jump: false, crouch: false, dive: false };
  /** The yaw WASD moves relative to. Frozen while left mouse orbits the camera, so looking around doesn't steer. */
  private moveYaw = 0;
  private title: TitleMenu | null = null;
  readonly options: Options = loadOptions();
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
  /** Places stamped into the map (the hospital annex for now): their runtime hooks. */
  private places: MapRuntime[] = [];
  private start0 = new THREE.Vector3();
  private ghost: THREE.Group;
  private ghostPos = new THREE.Vector3();
  private ghostTarget: Npc | null = null;
  private peeTime = 0;
  private peeSoundT = 0;
  /** Times (ms) of recent screams that turned out to be about nothing. Three in a minute gets you committed. */
  private falseAlarms: number[] = [];
  private pendingDeath: { id: string; victim: PersonFile; startPos: THREE.Vector3 } | null = null;
  private crosshair: HTMLElement;
  private hornCooldown = 0;
  private hometown: Hometown;
  private grocery!: PlaceRuntime;
  private atms!: Atms;
  private rides!: Rides;
  private skillBar = new SkillBar();
  private combat!: Combat;
  private skillHost!: SkillHost;
  /** Effect timers (real seconds) from skills. */
  private slowmoT = 0;
  private slowmoScale = 1;
  private hueT = 0;
  private numbT = 0;
  private trainHold = 0;
  private payoutMul = 1;
  private payoutWhy = '';
  private withdrawn = 0;
  private beam: THREE.Mesh | null = null;
  private beamT = 0;
  // Vehicles and the radar.
  private traffic: Traffic;
  private minimap: Minimap;
  private pois: Blip[];
  /** The car Gary is driving, if any. */
  driving: Car | null = null;
  private engine: EngineSound;
  private carIn = { throttle: 0, steer: 0, handbrake: false };
  private carPrevVel = new THREE.Vector3();
  private obstacles: Obstacle[] = [];
  private shoutT = 0;
  private burning: { car: Car; t: number }[] = [];
  private drivenOnce = false;
  /** Anime story cutscenes. The game loop pauses while one plays. */
  readonly story = new StoryDirector(() => this.sound.ctx);

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
      this.post?.setSize(window.innerWidth, window.innerHeight);
    });

    // Sky dome and lighting.
    const skyColor = new THREE.Color(0x9fd3ff);
    this.scene.fog = new THREE.Fog(skyColor, 110, 320);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(0x3d7fe0) }, bottom: { value: new THREE.Color(0xcfeaff) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.2,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
      }),
    );
    sky.renderOrder = -1;
    this.scene.add(sky);
    (sky as THREE.Mesh).onBeforeRender = () => sky.position.copy(this.camera.position);
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a5a3a, 1.4);
    this.scene.add(hemi);
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
    // Shared render upgrades (src/render/post.ts): warm sun, sky reflections, bloom and grading.
    warmLighting(this.scene, this.renderer, { sun: this.sun, hemi });
    this.post = new PostFX(this.renderer, this.scene, this.camera);

    // Physics and world.
    this.physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
    // City General Hospital is stamped into Smallville's E3 lot. ?place=hospital starts the ghost at its door.
    const devPlace = new URLSearchParams(location.search).get('place');
    this.town = buildTown();
    const hospital = this.town.hospital;
    this.start0 = this.town.spawn.clone().setY(G + 4);
    if (devPlace === 'hospital') this.start0 = hospital.entrance.clone().add(new THREE.Vector3(0, 4, -8));
    this.town.world.build(this.scene, this.physics);
    // Detailed exterior-only buildings from the building kit (docs/building-kit.md).
    const kit = new StreetKit({ parent: this.scene, physics: this.physics });
    for (const b of this.town.kitBuildings) kit.building(b);
    kit.finish();
    this.props = new Props(this.scene, this.physics, this.town);
    this.atms = new Atms(this.scene, this.physics, this.town.world, this.town.areas.downtown, this.props.interactables);
    this.combat = this.makeCombat();
    this.skillHost = this.makeSkillHost();
    this.ui.onSkillClick = (i) => this.useSkill(i);
    this.particles = new Particles(this.scene);
    registerMapDeaths(HOMETOWN_DEATHS, 'smallville');
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const game = this;
    this.hometown = new Hometown(this.scene, this.physics, this.town, {
      get player() {
        return game.player;
      },
      get body() {
        return game.body;
      },
      get character() {
        return game.character;
      },
      sound: this.sound,
      particles: this.particles,
      kill: (id, style) => this.kill(id, style),
      runSeq: (steps) => this.runSeq(steps),
      toast: (t, b, ms) => this.ui.toast(t, b, ms),
      say: (who, line, ms) => this.ui.say(who, line, ms),
      shake: (a) => this.cam.shake(a),
    });
    this.props.interactables.push(...this.hometown.interactables);
    this.traffic = new Traffic(this.scene, this.physics, smallvilleTraffic(this.town));
    this.traffic.onHonk = (car, tag) => this.onHonk(car, tag);
    this.traffic.onShoo = (car, tag) => {
      // The honked-at townsperson hops out of the lane.
      const n = this.npcs[Number(tag?.split(':')[1])];
      if (!n) return;
      const r = car.toWorld(new THREE.Vector3(-1, 0, 0)).sub(car.pos).setY(0).normalize();
      const lat = r.dot(n.pos.clone().sub(car.pos));
      const side = lat >= 0 ? 1 : -1;
      n.pos.addScaledVector(r, side * 3 - lat);
      n.character.kick(0.6);
    };
    this.minimap = new Minimap(document.getElementById('ui')!);
    this.minimap.setWorld(this.town.world, 'Smallville', G);
    this.minimap.setVisible(false);
    this.pois = smallvillePois(this.town);
    this.engine = new EngineSound(this.sound);

    this.input = new Input(canvas);
    this.input.onAnyGesture = () => this.sound.init();
    // The grocery store is its own place stamp with its own deaths and runtime.
    registerMapDeaths(GROCERY.deaths, 'smallville');
    this.grocery = this.town.grocery.setup({
      scene: this.scene,
      physics: this.physics,
      world: this.town.world,
      rng: mulberry32(4242),
      game: {
        get player() {
          return game.player;
        },
        get body() {
          return game.body;
        },
        get character() {
          return game.character;
        },
        sound: this.sound,
        particles: this.particles,
        input: this.input,
        kill: (id, style) => this.kill(id, style),
        runSeq: (steps) => this.runSeq(steps),
        toast: (t, b, ms) => this.ui.toast(t, b, ms),
        say: (who, line, ms) => this.ui.say(who, line, ms),
        shake: (a) => this.cam.shake(a),
        flash: (c, ms) => this.ui.flash(c, ms),
      },
    });
    this.props.interactables.push(...this.grocery.interactables);
    this.cam = new FollowCam(this.camera, this.physics);
    this.player = new Player(this.physics, this.town.spawn);
    this.player.setEnabled(false);
    this.wirePlayerHooks();
    this.rides = this.makeRides();

    this.ghost = this.makeGhost();
    this.scene.add(this.ghost);
    this.ghost.visible = false;

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair hidden';
    document.getElementById('ui')!.appendChild(this.crosshair);

    this.spawnInitialNpcs();
    {
      registerMapDeaths(HOSPITAL_DEATHS, 'smallville');
      this.places.push(setupHospital({ scene: this.scene, physics: this.physics, world: this.town.world, rng: this.rng, game: this.api() }, hospital));
    }
    this.ui.blip = () => this.sound.blip(0.6);
    this.ui.setHud(this.ledger, null);

    // Title camera.
    this.ghostPos.set(this.town.spawn.x, G + 14, this.town.spawn.z + 6);
    this.cam.yaw = 0.6;
    this.cam.pitch = 0.45;
    this.cam.dist = 26;
    this.cam.autoOrbit = 0.08;
    this.cam.snap(this.town.spawn.clone().setY(G + 6));

    this.story.onPause = (p) => this.sound.duck(p);
    this.title = new TitleMenu(document.getElementById('ui')!, {
      hasSave: () => this.ledger.foundCount > 0 || this.ledger.total > 0 || this.story.hasSeen('opening'),
      newGame: () => {
        this.eraseProgress();
        this.start('new');
      },
      continueGame: () => this.start('continue'),
      devMaps: () => this.devMaps(),
      devStart: (id) => this.start('dev', id),
      options: this.options,
      optionsChanged: () => this.applyOptions(),
      eraseSave: () => this.eraseProgress(),
      blip: () => {
        this.sound.init();
        this.sound.blip(0.8);
      },
    });
    this.applyOptions();
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

  /** The slice of the game that maps and places drive (src/maps/types.ts). */
  private api(): GameApi {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this;
    return {
      get player() { return g.player; },
      get body() { return g.body; },
      get character() { return g.character; },
      get sound() { return g.sound; },
      get particles() { return g.particles; },
      kill: (id, style) => g.kill(id, style),
      runSeq: (steps) => g.runSeq(steps),
      toast: (t, b, ms) => g.ui.toast(t, b, ms),
      say: (who, line, ms) => g.ui.say(who, line, ms),
      shake: (a) => g.cam.shake(a),
      flash: (c, ms) => g.ui.flash(c, ms),
      prompt: (html) => g.ui.prompt(html),
      get input() { return g.input; },
      get camYaw() { return g.cam.yaw; },
      get time() { return g.time; },
      get balance() { return g.ledger.balance; },
      spend: (amount, label) => {
        if (g.ledger.balance < amount) {
          g.ui.toast("CAN'T AFFORD IT", `${label} costs $${amount}.`, 2000);
          return false;
        }
        g.ledger.balance -= amount;
        g.ledger.save();
        g.ui.setHud(g.ledger, g.body);
        return true;
      },
      setHueShift: (deg) => g.ui.setHueShift(deg),
    };
  }

  /** Bodies scythe vision can target: townsfolk plus people the places post (hospital staff). */
  private get targetable(): Npc[] {
    return this.places.length ? [...this.npcs, ...this.places.flatMap((pl) => pl.npcs ?? [])] : this.npcs;
  }

  private spawnInitialNpcs() {
    this.life = new LifeSystem(this.scene, smallvilleLife(this.town), {
      seed: 500 + (Date.now() % 1000),
      blip: () => this.sound.blip(0.6),
    });
    this.life.populate();
    // Guarantee a few marks for the demo's deaths.
    const byJob = (job: string) => this.npcs.filter((n) => n.file.job === job);
    const cook = byJob('Diner Cook')[0];
    if (cook) {
      cook.file.peanutAllergy = true;
      cook.file.quirk = 'Has a peanut allergy. Like, a bad one.';
    }
    const due = this.npcs[2];
    if (due) due.file.daysLeft = 2; // always at least one fair mark nearby
    const worker = byJob('Construction Worker')[0];
    if (worker) {
      worker.file.physical = 'Athlete'; // someone who can do the water tower long jump
      worker.file.age = 27;
      worker.file.daysLeft = 12;
    }
    const old = byJob('Retiree')[0];
    if (old) old.file.physical = 'Feeble';
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
      onRideCrash: (impact, normal) => this.rides.onCrash(impact, normal),
      onRideTrick: () => this.rides.onTrick(),
    };
  }

  private makeRides() {
    const { spots, ramps } = Rides.smallvilleLayout();
    return new Rides(
      this.scene,
      this.physics,
      {
        player: this.player,
        input: this.input,
        sound: this.sound,
        particles: this.particles,
        character: () => this.character,
        body: () => this.body,
        alive: () => this.mode === 'play' && !!this.body,
        kill: (id, style) => this.kill(id, style),
        toast: (t, b, ms) => this.ui.toast(t, b, ms),
        say: (who, line, ms) => this.ui.say(who, line, ms),
        shake: (a) => this.cam.shake(a),
        breakLegs: () => {
          this.player.breakLegs();
          this.sound.scream(1.2);
        },
        carAt: (p) => this.traffic.hitTest(p, 0.9, 0) !== null,
      },
      spots,
      ramps,
    );
  }

  /** Maps Dev Mode can jump to. The map loader extends this list. */
  devMaps(): DevMap[] {
    return [{ id: 'smallville', name: 'Smallville', note: 'Hometown' }];
  }

  /** Dev Mode: load a map by id. Smallville is already loaded; the map loader overrides this. */
  protected loadDevMap(_id: string) {}

  private applyOptions() {
    this.sound.setVolumes(this.options.music, this.options.sfx);
    saveOptions(this.options);
  }

  private eraseProgress() {
    this.ledger.reset();
    this.story.forget();
    this.ui.setHud(this.ledger, null);
  }

  private start(how: 'new' | 'continue' | 'dev' = 'continue', mapId = 'smallville') {
    this.title?.close();
    this.sound.init();
    this.applyOptions();
    this.sound.startMusic();
    this.input.requestLock();
    this.cam.autoOrbit = 0;
    const go = () => this.enterGhost(this.start0.clone(), true);
    if (how === 'dev') {
      this.loadDevMap(mapId);
      go();
      return;
    }
    if (how === 'new') {
      void this.story.opening(true).then(go);
      return;
    }
    // ?cutscene=<id> replays one scene (e.g. opening, smallville:25) for testing.
    const forced = new URLSearchParams(location.search).get('cutscene');
    if (forced) void this.story.replay(forced).then(go);
    else if (this.story.hasSeen('opening')) go();
    else void this.story.opening().then(go);
  }

  // ---------------------------------------------------------------- bodies
  private setBody(file: PersonFile, ch: Character, at: THREE.Vector3, facing: number) {
    this.rides.onBodyChanged();
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
    this.props.setBarnOpen(file.job === 'Farmhand');
    this.hometown.onBody(file);
    this.barnTries = 0;
    this.stationVisits = 0;
    this.skillBar.setBody(file);
    this.combat.setBody(file);
    this.withdrawn = 0;
    this.payoutMul = 1;
    this.payoutWhy = '';
    this.player.boostT = 0;
    this.player.floatT = 0;
    this.ui.setSkills(this.skillBar, this.input.padConnected);
    this.ui.setHud(this.ledger, file);
    for (const pl of this.places) pl.onBody?.(file);
  }

  private enterGhost(at: THREE.Vector3, first = false) {
    this.rides.onBodyChanged();
    this.mode = 'ghost';
    this.ghostPos.copy(at);
    this.ghost.visible = true;
    this.player.setEnabled(false);
    this.body = null;
    this.character = null;
    this.skillBar.setBody(null);
    this.combat.setBody(null);
    this.ui.setSkills(null);
    this.ui.setHealth(null);
    for (const pl of this.places) pl.onBody?.(null);
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
          this.life.take(n);
          this.scene.remove(n.character.root);
          const facing = n.character.root.rotation.y;
          this.setBody(n.file, n.character, n.pos.clone(), facing);
          this.sound.setStyle('town');
          this.mode = 'play';
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
    if (this.driving) this.leaveCar();
    const def = DEATH_BY_ID[id];
    this.mode = 'dying';
    this.peeTime = 0;
    this.ui.prompt(null);
    this.ui.setHueShift(0);
    const victim = this.body;
    const ch = this.character;
    this.rides.onKilled(style.kind === 'ragdoll' ? style.vel : this.player.vel);
    ch.setExpression('dead');
    this.player.setEnabled(false);
    this.pendingDeath = { id, victim, startPos: this.player.position() };
    this.timeScale = 0.35;
    this.slowmoT = 0;
    this.hueT = 0;
    this.combat.releaseAll();
    this.ui.setHealth(null);

    if (style.kind === 'cube') {
      ch.root.scale.set(ch.baseScale * 1.1, ch.baseScale * 0.45, ch.baseScale * 1.1);
      ch.spinner.rotation.set(0, 0, 0);
      ch.tint(style.color ?? 0xe3c25a, 0.7);
      ch.root.rotation.set(0, ch.root.rotation.y, 0);
      if (style.at) ch.root.position.copy(style.at);
      else ch.root.position.copy(this.town.baler).add(new THREE.Vector3(-1.6, 0, 0));
      this.pancakes.push(ch.root);
      if (this.pancakes.length > 4) this.scene.remove(this.pancakes.shift()!);
      this.sound.stamp();
      this.particles.burst(ch.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 40, style.color ?? 0xe3c25a, 6, { life: 1.4, size: 0.18 });
      this.activeRagdoll = null;
    } else if (style.kind === 'pancake') {
      ch.root.scale.set(ch.baseScale * 1.7, ch.baseScale * 0.08, ch.baseScale * 1.7);
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
    this.life.closeTalk();
    this.life.event({ kind: 'death', at: this.player.position(), victim, what: deathGossip(id, def.name), where: def.location });
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
      total = Math.round((def.payout + bonus) * mult * this.payoutMul);
      note = pick(this.rng, ADJUSTER_NOTES);
      if (this.payoutMul > 1) note += ` (${this.payoutWhy}: paid x${this.payoutMul}.)`;
    }
    const isNew = !already;
    this.ledger.claimNo++;
    if (isNew) this.ledger.found[id] = { count: 1, payout: total, first: Date.now() };
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

  private afterClaim() {
    this.input.requestLock();
    this.ui.setHud(this.ledger, null);
    const at = this.activeRagdoll ? this.activeRagdoll.position() : this.pendingDeath?.startPos ?? this.town.spawn.clone();
    at.x = Math.min(Math.max(at.x, 4), this.town.world.sx - 4);
    at.z = Math.min(Math.max(at.z, 4), this.town.world.sz - 4);
    at.y = Math.max(at.y, G) + 3;
    this.pendingDeath = null;
    this.enterGhost(at);
    this.story.checkLedger(this.ledger.found);
    if (Math.random() < 0.5) setTimeout(() => this.ui.say('Death', pick(this.rng, DEATH_QUIPS), 3000), 3800);
  }

  // ---------------------------------------------------------------- triggers
  private onLand(e: LandEvent) {
    const ch = this.character;
    if (!ch) return;
    if (this.mode === 'play' && !this.rides.isRiding && this.hometown.onLand(e)) return;
    if (this.rides.isRiding && this.rides.onLand(e)) return;
    const heavy = Math.min(e.drop / 12, 1);
    if (this.mode === 'play' && this.places.some((pl) => pl.onLand?.(e))) return;
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
    // Heights are measured from the top of the arc. A triple jump or backflip peaks at about 5.3,
    // so ordinary platforming (even off a small ledge) never breaks legs; only real drops do.
    let [breakH, fatalH] = this.player.tier === 'Feeble' ? [6, 9] : this.player.tier === 'Athlete' ? [9, 13] : [7.5, 11];
    if (this.body && hasPassive(this.body, 'hardhat')) fatalH += 2;
    if (this.numbT > 0) {
      breakH += 3;
      fatalH += 3;
    }
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
      if (inBox(e.launchPos, this.town.treeZone)) id = 'treehouse';
      else if (inBox(e.launchPos, this.town.towerZone) && e.launchState === 'longjump') id = 'watertower';
      id = this.hometown.fallDeathId(e, this.player.feet()) ?? id;
      this.sound.splat();
      this.cam.shake(0.8);
      this.kill(id, { kind: 'ragdoll', vel: v, spin: 12, bounce: 0.6 });
      if (id === 'faceplant' && inBox(e.launchPos, this.town.towerZone))
        setTimeout(() => this.ui.say('Death', 'From the water tower and THAT is what you went with? Try a long jump next time.', 4000), 1800);
    }
  }

  private nearestInteractable() {
    const p = this.player.feet();
    let best: { id: string; prompt: string } | null = null;
    let bd = Infinity;
    for (const it of [...this.props.interactables, ...this.rides.activeInteractables(), ...this.places.flatMap((pl) => pl.interactables ?? [])]) {
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
    if (this.hometown.interact(id)) return;
    if (id.startsWith('groc:')) {
      this.grocery.interact(id);
      return;
    }
    if (this.rides.tryInteract(id)) return;
    for (const pl of this.places) if (pl.interactables?.some((it) => it.id === id)) return pl.interact?.(id);
    if (id.startsWith('atm:')) {
      const r = withdraw(this.body, this.withdrawn);
      this.ui.toast(r.title, r.sub, 3200);
      if (r.ok) {
        this.withdrawn += r.amount;
        this.addMoney(r.amount);
        this.sound.cash();
        const it = this.props.interactables.find((x) => x.id === id);
        if (it) this.particles.burst(it.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 14, 0x55d16a, 3, { life: 0.9, size: 0.16 });
        if (this.rng() < 0.25) setTimeout(() => this.ui.say('Death', "You know you can't take it with you. Oh wait. You literally can.", 3200), 600);
      } else this.sound.denied();
      return;
    }
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
      if (this.props.bale.release()) {
        this.props.leverPulled = 3;
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

  // ---------------------------------------------------------------- money, skills, fighting
  private addMoney(n: number) {
    this.ledger.balance += n;
    this.ledger.total += n;
    this.ledger.save();
    this.ui.setHud(this.ledger, this.body);
  }

  private useSkill(i: number) {
    if (this.mode !== 'play' || !this.body || this.player.state === 'locked') return;
    this.skillBar.selected = i;
    const r = this.skillBar.use(i, this.skillHost, performance.now());
    this.ui.pulseSkill(i, r.ok);
    if (!r.ok && r.reason) {
      this.ui.toast(this.skillBar.slots[i]?.skill?.name ?? 'Locked', r.reason, 1600);
      this.sound.denied();
    }
  }

  private updateEffects(realDt: number) {
    if (this.slowmoT > 0) {
      this.slowmoT -= realDt;
      if (this.mode === 'play') this.timeScale = this.slowmoT > 0 ? this.slowmoScale : 1;
    }
    if (this.hueT > 0) {
      this.hueT -= realDt;
      if (this.mode === 'play') this.ui.setHueShift(this.hueT > 0 ? (this.time * 120) % 360 : 0);
    }
    this.numbT -= realDt;
    this.trainHold -= realDt;
    if (this.beam) {
      this.beamT -= realDt;
      const m = this.beam.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, Math.min(0.45, this.beamT * 0.4)) * (0.8 + Math.sin(this.time * 8) * 0.2);
      if (this.beamT <= 0) {
        this.scene.remove(this.beam);
        this.beam.geometry.dispose();
        m.dispose();
        this.beam = null;
      }
    }
  }

  private revealNearestHazard(seconds: number) {
    const p = this.player.feet();
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    const cands = this.props.interactables.filter((it) => it.enabled && !it.id.startsWith('atm')).map((it) => it.pos);
    const t = this.town;
    const center = (b: { min: THREE.Vector3; max: THREE.Vector3 }) => b.min.clone().add(b.max).multiplyScalar(0.5);
    cands.push(center(t.treeZone), center(t.towerZone), new THREE.Vector3(p.x, G, t.trackZ + 0.5));
    for (const c of cands) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 2.5 && d < bd) {
        bd = d;
        best = c;
      }
    }
    if (!best) return false;
    if (this.beam) this.scene.remove(this.beam);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 80, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9a7cff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.position.set(best.x, G + 40, best.z);
    this.scene.add(this.beam);
    this.beamT = seconds;
    return true;
  }

  private makeSkillHost(): SkillHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this;
    return {
      get body() {
        return g.body!;
      },
      get player() {
        return g.player;
      },
      feet: () => this.player.feet(),
      toast: (a, b, ms) => this.ui.toast(a, b, ms),
      say: (who, line, ms) => this.ui.say(who, line, ms),
      addMoney: (n) => this.addMoney(n),
      burst: (pos, n, color, speed, opts) => this.particles.burst(pos, n, color, speed, opts),
      sfx: (name) => {
        if (name === 'scream') this.sound.scream(1.1);
        else this.sound[name]();
      },
      slowmo: (sec, scale) => {
        this.slowmoT = sec;
        this.slowmoScale = scale;
        this.timeScale = scale;
      },
      hueTrip: (sec) => (this.hueT = sec),
      gather: (n, radius, onArrive) => {
        const p = this.player.feet();
        const near = this.npcs
          .filter((x) => !x.helping && !x.controlled && !x.away && x.pos.distanceTo(p) < radius)
          .sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))
          .slice(0, n);
        let first = true;
        for (const x of near)
          x.summon(this.player.feet(), () => {
            if (first && this.mode === 'play') onArrive(x.file.name);
            first = false;
          });
        return near.length;
      },
      nearbyCount: (r) => this.npcs.filter((x) => x.pos.distanceTo(this.player.feet()) < r).length,
      pauseTrain: (sec) => {
        if (!this.props.train.moving) return false;
        this.trainHold = sec;
        this.sound.horn();
        return true;
      },
      revealNearestHazard: (sec) => this.revealNearestHazard(sec),
      numb: (sec) => (this.numbT = sec),
      payoutBonus: (mult, why) => {
        this.payoutMul = Math.max(this.payoutMul, mult);
        this.payoutWhy = why;
      },
      heal: (hp) => this.combat.heal(hp),
      godAnger: (d) => {
        this.ledger.godAnger = Math.max(0, this.ledger.godAnger + d);
        this.ledger.save();
        this.ui.setHud(this.ledger, this.body);
      },
      godAngerLevel: () => this.ledger.godAnger,
      trigger: (id) => this.interact(id),
    };
  }

  private makeCombat() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this;
    return new Combat({
      npcs: () => this.life.visibleNpcs(),
      get player() {
        return g.player;
      },
      character: () => this.character,
      body: () => this.body,
      playing: () => this.mode === 'play' && !!this.body,
      hit: (kind) => {
        if (kind === 'whiff') this.sound.whoosh();
        else if (kind === 'punch') {
          this.sound.noise({ dur: 0.09, vol: 0.7, freq: 500, type: 'lowpass', q: 1 });
          this.sound.tone({ f: 140, f2: 60, dur: 0.1, type: 'square', vol: 0.25 });
        } else if (kind === 'hurt') {
          this.sound.noise({ dur: 0.12, vol: 0.8, freq: 350, type: 'lowpass', q: 1 });
          this.sound.tone({ f: 220, f2: 90, dur: 0.15, type: 'sawtooth', vol: 0.2 });
        } else {
          this.sound.tone({ f: 900, f2: 300, dur: 0.5, type: 'triangle', vol: 0.3 });
          this.sound.crunch();
        }
      },
      shake: (a) => this.cam.shake(a),
      burst: (pos, n, color, speed, opts) => this.particles.burst(pos, n, color, speed, opts),
      say: (who, line, ms) => this.ui.say(who, line, ms),
      hurtFlash: () => this.ui.flash('#ff2020', 260),
      died: (by) => {
        const frail = by.file.physical === 'Feeble' || by.file.job === 'Retiree';
        const away = this.player.feet().sub(by.pos).setY(0).normalize();
        this.kill(frail ? 'grandma' : 'brawl', { kind: 'ragdoll', vel: new THREE.Vector3(away.x * 10, 9, away.z * 10), spin: 12, bounce: 0.5 });
        if (frail) setTimeout(() => this.ui.say('Death', `Beaten to death by ${by.file.name}, age ${by.file.age}. I'm putting this one on the fridge.`, 4000), 1500);
      },
    });
  }

  private scream() {
    if (!this.character || performance.now() < this.screamCooldown) return;
    this.screamCooldown = performance.now() + 1500;
    this.sound.scream(1.1 + Math.random() * 0.3);
    this.character.kick(-0.3);
    const p = this.player.feet();
    const near = this.npcs
      .filter((n) => !n.helping && !n.away && !n.controlled && n.pos.distanceTo(p) < 28)
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
          // Screaming at people for no reason: twice is weird, three times in a minute gets you committed
          // (or arrested, if the person who came running is a cop).
          const now = performance.now();
          this.falseAlarms = this.falseAlarms.filter((t) => now - t < 60000);
          this.falseAlarms.push(now);
          const strikes = this.falseAlarms.length;
          if (strikes >= 3) {
            this.falseAlarms = [];
            if (n.file.job === 'Cop') {
              this.ui.say(n.file.name, "Third time. That's disturbing the peace, pal.", 2600);
              arrest(this.api(), 'Disturbing the peace (screaming at nothing, three times)');
            } else {
              this.ui.say(n.file.name, "Okay, I'm calling someone. Not the cops. The OTHER someone.", 2600);
              setTimeout(() => this.mode === 'play' && commit(this.api(), 'Screamed at strangers three times for no reason'), 1800);
            }
          } else if (strikes === 2) {
            this.ui.say(n.file.name, "Again? Do that one more time and I'm calling somebody.", 2600);
          } else {
            this.ui.say(n.file.name, pick(this.rng, ["What? What happened? ...You look fine.", 'Was that you screaming? Weirdo.']), 2600);
          }
        }
      });
  }

  private nearFence(p: THREE.Vector3) {
    const f = this.town.fence;
    const m = 1.4;
    const insideOuter = p.x > f.x0 - m && p.x < f.x1 + 1 + m && p.z > f.z0 - m && p.z < f.z1 + 1 + m;
    const insideInner = p.x > f.x0 + m && p.x < f.x1 + 1 - m && p.z > f.z0 + m && p.z < f.z1 + 1 - m;
    return insideOuter && !insideInner;
  }

  private checkHazards(dt: number) {
    if (this.mode !== 'play' || !this.character) return;
    const p = this.player.position();
    const hit = this.traffic.hitTest(p, 0.8, 4); // the capsule gets shoved ahead of the bumper, so reach a little past it
    if (hit) {
      this.sound.splat();
      carSfx.horn(this.sound);
      this.cam.shake(1.2);
      const sp = hit.vel.length();
      this.kill(this.rides.isRiding ? 'sharetheroad' : 'roadkill', { kind: 'ragdoll', vel: hit.vel.clone().multiplyScalar(1.4).add(new THREE.Vector3(0, 8 + sp * 0.6, 0)), spin: 16, bounce: 0.65 });
      return;
    }
    if (p.y < -12) {
      this.kill('edge', { kind: 'ragdoll', vel: this.player.vel.clone(), spin: 5 });
      return;
    }
    for (const pl of this.places) {
      pl.checkHazards?.(dt);
      if (this.mode !== 'play') return;
    }
    const inStation = inBox(p, this.town.station.interior);
    if (inStation && !this.wasInStation && this.body?.job !== 'Cop' && this.player.state !== 'locked') this.ejectFromStation();
    this.wasInStation = inStation;
    const tr = this.props.train;
    if (tr.moving) {
      if (tr.contains(p)) {
        this.sound.splat();
        this.sound.horn();
        this.cam.shake(1.5);
        const side = p.z < tr.z ? -1 : 1;
        this.kill(this.rides.isRiding ? 'grindrail' : 'train', { kind: 'ragdoll', vel: new THREE.Vector3(tr.speed * 1.4, 16, side * 6), spin: 18, bounce: 0.5 });
        return;
      }
      this.hornCooldown -= dt;
      if (Math.abs(p.z - tr.z) < 25 && p.x - tr.x > 0 && p.x - tr.x < 70 && this.hornCooldown <= 0) {
        this.sound.horn();
        this.hornCooldown = 3;
      }
    }
    const bale = this.props.bale;
    if (bale.state === 'falling' && bale.velocityY < -4) {
      const bp = bale.position();
      if (Math.abs(bp.x - p.x) < 1.5 && Math.abs(bp.z - p.z) < 1.5 && bp.y - 1 < p.y + 1.1 && bp.y > p.y - 0.8) {
        this.kill('pancake', { kind: 'pancake' });
        return;
      }
    }
    // Peeing.
    if (this.input.held('pee') && this.player.grounded && (this.player.state === 'ground' || this.player.state === 'locked')) {
      this.peeTime += dt;
      if (this.peeTime >= 0.4 && this.peeTime - dt < 0.4) {
        this.life.event({ kind: 'pee', at: this.player.feet(), radius: 12 });
        // Peeing in front of a cop is a crime. Cops peeing in front of cops is professional courtesy.
        const p = this.player.feet();
        const cop = this.body?.job !== 'Cop' && this.npcs.find((n) => n.file.job === 'Cop' && !n.away && !n.controlled && n.pos.distanceTo(p) < 14);
        if (cop) {
          this.ui.say(cop.file.name, 'Whoa, WHOA. Zip it up. You are under arrest.', 2600);
          this.peeTime = 0;
          arrest(this.api(), 'Indecent exposure in front of an officer');
        }
      }
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

  // ---------------------------------------------------------------- vehicles
  /** Where the action is: the player, their car, the ghost or the death cam. */
  private focusPos() {
    if (this.driving) return this.driving.pos.clone();
    if (this.mode === 'play') return this.player.position();
    if ((this.mode === 'dying' || this.mode === 'claim') && this.activeRagdoll) return this.activeRagdoll.position();
    return this.ghostPos.clone();
  }

  /** People and trains that traffic brakes for, gathered once per frame. */
  private buildObstacles() {
    const o = this.obstacles;
    o.length = 0;
    this.npcs.forEach((n, i) => {
      if (!n.away) o.push({ pos: n.pos, person: true, tag: `npc:${i}` });
    });
    if (this.mode === 'play' && !this.driving && this.character) o.push({ pos: this.player.feet(), person: true, tag: 'player' });
    const tr = this.props.train;
    // The train and where it will be in the next couple of seconds, like a crossing gate.
    if (tr.moving) for (let dx = -20; dx <= 80; dx += 3) o.push({ pos: new THREE.Vector3(tr.x + dx, G, tr.z) });
  }

  private readCarInput() {
    const inp = this.input;
    const busy = this.ui.ledgerOpen || this.player.state === 'locked';
    let thr = inp.moveY;
    if (inp.held('dive')) thr += 1; // RT
    if (inp.held('crouch')) thr -= 1; // LT / Shift
    this.carIn.throttle = busy ? 0 : Math.max(-1, Math.min(1, thr));
    this.carIn.steer = busy ? 0 : inp.moveX;
    this.carIn.handbrake = !busy && inp.held('jump');
  }

  private carToSteal() {
    return this.traffic.nearest(this.player.feet(), 4.4, (c) => c.mode !== 'driven' && !c.burnt);
  }

  private static readonly YANK_LINES = [
    'MY CAR! I just got it detailed!',
    "Hey! HEY! That's a lease!",
    'Not again. That is the third time this week.',
    'Ow. My everything.',
    'At least take the parking tickets too!',
    "I'm calling my insurance! ...Oh no. It's Mortalis.",
  ];

  /** Yank the driver out (if any) and take the wheel. */
  private hijack(car: Car) {
    const ch = this.character;
    if (!ch) return;
    this.ui.prompt(null);
    this.player.lock(true);
    const moving = car.velocity().length() > 2;
    if (!car.vc) car.makeDynamic('wreck', new THREE.Vector3());
    else car.mode = 'wreck';
    if (car.upsideDown) car.flipUpright();
    car.body.setLinvel({ x: 0, y: car.body.linvel().y, z: 0 }, true);
    car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    car.readBack();
    const door = car.toWorld(DOOR_OUT);
    door.y = Math.max(door.y, this.player.feet().y - 0.5);
    this.player.teleport(door, car.facing - Math.PI / 2);
    if (moving) carSfx.screech(this.sound);
    car.openDoor(true);
    carSfx.door(this.sound);
    const hadDriver = !!car.driver;
    this.runSeq([
      {
        at: 0.3,
        fn: () => {
          if (!car.driver) return;
          const side = car.toWorld(new THREE.Vector3(1, 0, 0)).sub(car.pos).setY(0).normalize();
          this.ejectDriver(car, side.multiplyScalar(11).add(car.forward().multiplyScalar(2)).add(new THREE.Vector3(0, 8, 0)));
          this.sound.whoosh();
          this.cam.shake(0.3);
          setTimeout(() => this.ui.say('Driver', pick(this.rng, Game.YANK_LINES), 2600), 500);
        },
      },
      { at: hadDriver ? 0.8 : 0.35, fn: () => this.enterCar(car) },
    ]);
  }

  private enterCar(car: Car) {
    const ch = this.character;
    if (!ch || this.mode !== 'play') return;
    this.player.lock(false);
    this.player.setEnabled(false);
    this.driving = car;
    car.mode = 'driven';
    car.airborne = false;
    car.openDoor(false);
    carSfx.door(this.sound);
    car.model.root.add(ch.root);
    sit(ch);
    this.carPrevVel.copy(car.velocity());
    this.cam.yaw = car.facing + Math.PI;
    if (!this.drivenOnce) {
      this.drivenOnce = true;
      this.ui.toast('NICE CAR', 'W / S drive · A / D steer · Space handbrake · T horn · E get out', 4200);
    }
  }

  /** Step out normally, or bail out if the car is going fast. */
  private exitCar() {
    const car = this.driving;
    const ch = this.character;
    if (!car || !ch) return;
    const vel = car.velocity();
    const fast = vel.length() > 13;
    this.leaveCar();
    car.openDoor(true);
    carSfx.door(this.sound);
    setTimeout(() => car.openDoor(false), 900);
    if (fast) {
      ch.root.position.copy(car.toWorld(new THREE.Vector3(HALF.x + 0.9, -0.4, 0)));
      const side = car.toWorld(new THREE.Vector3(1, 0, 0)).sub(car.pos).setY(0).normalize();
      this.ui.say('Death', pick(this.rng, ['Like in the movies! Except not at all.', 'You were supposed to tuck.']), 2600);
      this.kill('bailout', { kind: 'ragdoll', vel: vel.multiplyScalar(0.95).add(side.multiplyScalar(5)).add(new THREE.Vector3(0, 4, 0)), spin: 10, bounce: 0.55 });
      return;
    }
    const out = car.upsideDown ? car.pos.clone().add(new THREE.Vector3(0, 2, 0)) : car.toWorld(DOOR_OUT);
    this.player.setEnabled(true);
    this.player.teleport(out, car.facing + Math.PI / 2);
  }

  /** Take Gary's body out of the car (for getting out, or dying). The car is left as an empty wreck. */
  private leaveCar() {
    const car = this.driving;
    if (!car) return;
    this.driving = null;
    car.mode = 'wreck';
    car.braking = false;
    const ch = this.character;
    if (ch) {
      this.scene.attach(ch.root);
      ch.root.rotation.set(0, car.facing, 0);
      ch.root.scale.setScalar(ch.app.height);
    }
  }

  private updateDrivingFrame(dt: number, lookDX: number, lookDY: number) {
    const car = this.driving!;
    const inp = this.input;
    if (inp.pressed('interact') && this.player.state !== 'locked') {
      this.exitCar();
      return;
    }
    if (inp.pressed('scream')) {
      carSfx.horn(this.sound, 1.4);
      for (const n of this.npcs) if (n.pos.distanceTo(car.pos) < 14) n.character.kick(0.5);
    }
    this.ui.prompt(car.upsideDown && Math.abs(car.speed) < 2 ? '<span class="key">E</span>Climb out of the wreck' : null);
    // Chase camera swings in behind the car unless you're orbiting it.
    const behind = car.facing + Math.PI;
    if (!inp.lmb && !inp.rmb && Math.abs(inp.lookX) < 0.05) {
      const rate = 0.5 + Math.min(Math.abs(car.speed), 24) * 0.12;
      this.cam.yaw = turnToward(this.cam.yaw, behind, dt * rate);
    }
    this.cam.minDist = 8;
    this.cam.update(dt, car.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), lookDX, lookDY);
    if (this.character) this.character.root.visible = true;
    this.engine.set(true, car.speed, this.carIn.throttle);
    // Handbrake turns squeal.
    if (this.carIn.handbrake && Math.abs(car.speed) > 9 && car.wheelsOnGround > 2) {
      car.screechT -= dt;
      if (car.screechT <= 0) {
        car.screechT = 0.6;
        carSfx.screech(this.sound);
      }
      this.particles.emit(car.toWorld(new THREE.Vector3(0, -RIDE + 0.2, -2.2)), new THREE.Vector3(0, 1.5, 0), 0xd8d8d8, { life: 0.8, size: 0.5, gravity: -1, spread: 1 });
    }
  }

  /** Car on car, car on train and car on pedestrian. Runs after each physics step. */
  private carCollisions() {
    const tr = this.props.train;
    const focus = this.focusPos();
    for (const car of this.traffic.cars) {
      if (car === this.driving) continue;
      if (tr.moving && tr.contains(car.ground(), 1.4) && car.velocity().x < tr.speed * 0.8) {
        const side = car.pos.z < tr.z ? -1 : 1;
        const v = new THREE.Vector3(tr.speed * 1.3, 13, side * 7);
        this.ejectDriver(car, v.clone().add(new THREE.Vector3(0, 6, side * 4)));
        if (!car.vc) car.makeDynamic('wreck', v);
        else car.body.setLinvel(v, true);
        car.mode = 'wreck';
        car.body.setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 8 }, true);
        if (car.pos.distanceTo(focus) < 70) {
          carSfx.crash(this.sound, 1.6);
          this.cam.shake(0.4);
        }
      }
    }
    // People in the way.
    for (const n of this.npcs.slice()) {
      if (n.away || n.controlled) continue;
      const hit = this.traffic.hitTest(n.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), 0.2, 4);
      if (hit) this.ragdollNpc(n, hit.vel, hit.car === this.driving);
    }
    // Ramming traffic knocks it out of its lane.
    const d = this.driving;
    if (d) {
      for (const o of this.traffic.cars) {
        if (o === d || (o.mode !== 'traffic' && o.mode !== 'parked')) continue;
        if (o.pos.distanceTo(d.pos) > 8) continue;
        let touching = false;
        this.physics.contactPair(d.collider, o.collider, (m) => {
          if (m.numContacts() > 0) touching = true;
        });
        if (!touching) continue;
        const rel = d.velocity().sub(o.velocity()).length();
        if (rel < 6) continue;
        o.makeDynamic('wreck', o.velocity().add(this.carPrevVel.clone().multiplyScalar(0.7)).add(new THREE.Vector3(0, 2, 0)));
        o.body.setAngvel({ x: 0, y: (Math.random() - 0.5) * rel * 0.2, z: 0 }, true);
        carSfx.crash(this.sound, Math.min(2, rel / 14));
        this.cam.shake(Math.min(1, rel / 25));
        if (o.driver && Math.random() < 0.5) setTimeout(() => this.ui.say('Driver', pick(this.rng, ['LEARN TO DRIVE!', 'My neck! My back!', "That's coming out of your insurance!"]), 2200), 400);
      }
    }
  }

  /** Death checks while driving. */
  private carHazards() {
    const car = this.driving;
    if (!car || this.mode !== 'play') return;
    const v = car.velocity();
    const dv = v.distanceTo(this.carPrevVel);
    const prevSpeed = this.carPrevVel.length();
    this.carPrevVel.copy(v);
    const tr = this.props.train;
    if (tr.moving && tr.contains(car.ground(), 1.8)) {
      const side = car.pos.z < tr.z ? -1 : 1;
      this.carDeath('traincar', new THREE.Vector3(tr.speed * 1.5, 20, side * 9), true);
      this.sound.horn();
      return;
    }
    if (car.pos.y < -14) {
      this.carDeath('cliff', v.clone().add(new THREE.Vector3(0, 4, 0)), false);
      return;
    }
    if (car.wheelsOnGround === 0) {
      if (!car.airborne) {
        car.airborne = true;
        car.airPeakY = car.pos.y;
      } else car.airPeakY = Math.max(car.airPeakY, car.pos.y);
    }
    const drop = car.airPeakY - car.pos.y;
    const landed = car.airborne && (car.wheelsOnGround > 0 || dv > 10);
    if (landed) {
      car.airborne = false;
      if (drop > 8) {
        this.carDeath('cliff', v.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 14, 0)), true);
        return;
      }
      if (drop > 1.5) {
        this.sound.land(Math.min(1, drop / 6));
        this.cam.shake(Math.min(0.6, drop / 8));
      }
    }
    if (dv > 12 && !car.airborne) {
      if (dv > 22 && prevSpeed > 20) {
        const fwd = car.forward().setY(0).normalize();
        this.carDeath('windshield', fwd.multiplyScalar(prevSpeed * 0.9).add(new THREE.Vector3(0, 7, 0)), false, true);
        return;
      }
      carSfx.crash(this.sound, Math.min(1.5, dv / 15));
      this.cam.shake(Math.min(0.8, dv / 25));
      this.character?.kick(0.5);
    }
  }

  /** Kill Gary in his car: fling him out (through the windshield, if it comes to that). */
  private carDeath(id: string, vel: THREE.Vector3, explode: boolean, throughWindshield = false) {
    const car = this.driving;
    const ch = this.character;
    if (!car || !ch) return;
    this.leaveCar();
    const at = throughWindshield ? new THREE.Vector3(0, 0.45, HALF.z + 0.9) : new THREE.Vector3(0, 1.6, 0);
    ch.root.position.copy(car.toWorld(at));
    if (throughWindshield) {
      carSfx.crash(this.sound, 2);
      this.particles.burst(car.toWorld(new THREE.Vector3(0, 0.8, HALF.z - 0.6)), 30, 0xbfe6ff, 7, { life: 0.9, size: 0.15 });
    }
    if (explode) this.explode(car);
    this.cam.shake(1.2);
    this.sound.scream(1.3);
    this.kill(id, { kind: 'ragdoll', vel, spin: 14, bounce: 0.6 });
  }

  private explode(car: Car) {
    carSfx.boom(this.sound);
    const c = car.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
    this.particles.burst(c, 70, 0xff8a1a, 12, { life: 1.1, size: 0.45, gravity: 2 });
    this.particles.burst(c, 40, 0xffe24a, 8, { life: 0.7, size: 0.3, gravity: 0 });
    this.particles.burst(c, 30, 0x2a2a2a, 5, { life: 2.2, size: 0.7, gravity: -2 });
    this.ui.flash('#ffb060', 250);
    this.ejectDriver(car, new THREE.Vector3(0, 16, 0));
    if (!car.vc) car.makeDynamic('wreck', new THREE.Vector3());
    car.mode = 'wreck';
    const m = car.body.mass();
    car.body.applyImpulse({ x: 0, y: m * 9, z: 0 }, true);
    car.body.applyTorqueImpulse({ x: m * (Math.random() - 0.5) * 6, y: 0, z: m * (Math.random() - 0.5) * 6 }, true);
    car.burnt = true;
    car.model.paintMat.color.multiplyScalar(0.22);
    this.burning.push({ car, t: 14 });
  }

  private updateBurning(dt: number) {
    for (const b of this.burning) {
      b.t -= dt;
      if (Math.random() < dt * 30) {
        const p = b.car.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 3));
        this.particles.emit(p, new THREE.Vector3(0, 3, 0), Math.random() < 0.4 ? 0xff7a1a : 0x333333, { life: 1.4, size: 0.6, gravity: -2, spread: 0.8 });
      }
    }
    this.burning = this.burning.filter((b) => b.t > 0 && this.traffic.cars.includes(b.car));
  }

  /** Throw an NPC driver out of their car as a ragdoll. */
  private ejectDriver(car: Car, vel: THREE.Vector3) {
    const drv = car.unseat();
    if (!drv) return;
    drv.root.position.copy(car.toWorld(new THREE.Vector3(HALF.x + 0.8, -0.3, 0)));
    drv.root.rotation.set(0, car.facing, 0);
    const rd = new Ragdoll(this.physics, this.scene, drv, vel, 15, 0.6);
    this.scene.remove(drv.root);
    this.pushRagdoll(rd);
    this.sound.scream(1.2 + Math.random() * 0.4);
  }

  /** A townsperson gets hit by a car. Taking someone who wasn't due still counts against you. */
  private ragdollNpc(n: Npc, vel: THREE.Vector3, byPlayer: boolean) {
    if (!this.npcs.includes(n)) return;
    this.life.take(n);
    this.life.event({ kind: 'death', at: n.pos.clone(), victim: n.file, what: byPlayer ? 'got run over by a maniac in a stolen car' : 'got hit by a car', where: 'the road' });
    if (this.ghostTarget === n) {
      this.ghostTarget = null;
      this.ui.showFile(null);
    }
    const sp = vel.length();
    const rd = new Ragdoll(this.physics, this.scene, n.character, vel.clone().multiplyScalar(1.3).add(new THREE.Vector3(0, 6 + sp * 0.5, 0)), 14, 0.6);
    this.scene.remove(n.character.root);
    this.pushRagdoll(rd);
    if (n.pos.distanceTo(this.focusPos()) < 60) {
      this.sound.splat();
      this.sound.scream(1 + Math.random() * 0.5);
    }
    if (!byPlayer) return;
    if (isDeserving(n.file)) {
      this.ui.say('Death', pick(this.rng, ['Oh, they were due anyway. Saved me a trip.', 'Efficient. I hate that I respect it.']), 3000);
    } else {
      this.ledger.godAnger++;
      this.ledger.save();
      this.ui.setHud(this.ledger, this.body);
      this.sound.thunder();
      this.ui.toast('THE TIMELINE TREMBLES', `${n.file.name} wasn't due yet. God saw that.`, 2600);
    }
  }

  private pushRagdoll(rd: Ragdoll) {
    this.ragdolls.push(rd);
    while (this.ragdolls.length > 8) {
      const i = this.ragdolls.findIndex((r) => r !== this.activeRagdoll);
      this.ragdolls.splice(i, 1)[0].dispose();
    }
  }

  private onHonk(car: Car, tag: string | undefined) {
    const d = car.pos.distanceTo(this.focusPos());
    if (d > 50) return;
    carSfx.horn(this.sound, Math.max(0.2, 1 - d / 50));
    if (tag === 'player' && this.mode === 'play' && performance.now() > this.shoutT && d < 25) {
      this.shoutT = performance.now() + 7000;
      this.ui.say('Driver', pick(this.rng, ['Get out of the road!', 'MOVE, genius!', 'Are you trying to die? ...Oh. Carry on.', 'I have a meeting!', 'Sidewalk! It is RIGHT THERE!']), 2400);
    }
  }

  private drawMinimap(dt: number) {
    if (this.mode === 'title') {
      this.minimap.setVisible(false);
      return;
    }
    this.minimap.setVisible(true);
    const ghost = this.mode === 'ghost' || this.mode === 'possessing';
    const c = this.focusPos();
    const facing = this.driving ? this.driving.facing : this.mode === 'play' ? this.player.facing : this.cam.forwardFacing;
    const blips: Blip[] = [...this.pois];
    for (const car of this.traffic.cars) {
      if (car === this.driving) continue;
      const color = car.burnt ? '#ff7a2a' : car.mode === 'traffic' ? '#e8e8e8' : car.mode === 'parked' ? '#8fd0ff' : '#7a7a7a';
      blips.push({ x: car.pos.x, z: car.pos.z, kind: 'car', facing: car.facing, color });
    }
    // Scythe vision shows souls on the radar: green if they're due, red if they aren't.
    if (ghost) for (const n of this.npcs) if (!n.away) blips.push({ x: n.pos.x, z: n.pos.z, kind: 'person', color: isDeserving(n.file) ? '#7dff7a' : '#ff6a5a' });
    const zoom = this.driving ? Math.max(1.0, 2.2 - Math.abs(this.driving.speed) * 0.035) : ghost ? 1.7 : 2.2;
    this.minimap.draw(c.x, c.z, this.cam.yaw, facing, blips, zoom, dt);
    this.minimap.setSpeed(this.driving ? Math.abs(this.driving.speed) * 2.237 : null);
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
    // A story cutscene covers the screen: freeze the game underneath it.
    if (this.story.active) return;
    const inp = this.input;

    if (this.mode === 'title' && this.title?.open) {
      if (inp.pressed('menuUp')) this.title.nav('up');
      if (inp.pressed('menuDown')) this.title.nav('down');
      if (inp.pressed('menuLeft')) this.title.nav('left');
      if (inp.pressed('menuRight')) this.title.nav('right');
      if (inp.pressed('confirm')) this.title.nav('confirm');
      if (inp.pressed('back')) this.title.nav('back');
    } else if (inp.pressed('music')) this.sound.toggleMusic();
    if (inp.pressed('help')) this.ui.toggleHelp();
    if (inp.pressed('ledger') && this.mode !== 'title') this.ui.toggleLedger(this.ledger);
    if (this.mode === 'claim' && inp.pressed('confirm')) this.ui.pendingClaim?.();
    this.ui.setPadMode(inp.padConnected);

    const mouseSens = 0.0032 * this.options.sens;
    if (this.mode === 'play' || this.mode === 'ghost') this.cam.zoom(inp.wheel);
    this.cam.minDist = this.mode === 'dying' || this.mode === 'claim' ? 6 : 0;
    // Right mouse (or first person) makes the character face where the camera looks.
    const steer = inp.rmb || this.cam.firstPerson;
    if (!(inp.lmb && !inp.rmb && !this.cam.firstPerson)) this.moveYaw = this.cam.yaw;
    const lookDX = inp.mouseDX * mouseSens + inp.lookX * realDt * 2.6;
    const lookDY = (inp.mouseDY * mouseSens + inp.lookY * realDt * 2) * (this.options.invertY ? -1 : 1);

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
    const focus0 = this.focusPos();
    this.buildObstacles();
    if (this.driving && this.mode === 'play') this.readCarInput();
    while (this.acc >= h && steps < 5) {
      if (this.mode === 'play' || this.mode === 'dying') {
        if (this.mode === 'play' && this.character && this.driving) {
          this.driving.drive(this.carIn.throttle, this.carIn.steer, this.carIn.handbrake);
        } else if (this.mode === 'play' && this.character) {
          const peeing = (inp.held('pee') && this.player.grounded) || this.life.isTalking;
          this.player.update(h, {
            moveX: peeing || this.ui.ledgerOpen ? 0 : inp.moveX,
            moveY: peeing || this.ui.ledgerOpen ? 0 : inp.moveY,
            camYaw: this.moveYaw,
            jumpPressed: first && this.latched.jump && !this.life.isTalking,
            jumpHeld: inp.held('jump'),
            crouchHeld: inp.held('crouch'),
            crouchPressed: first && this.latched.crouch,
            divePressed: first && this.latched.dive,
            sprint: inp.sprint,
            faceYaw: steer ? this.cam.forwardFacing : null,
          });
        }
      }
      if (this.trainHold <= 0) this.props.train.update(h);
      this.props.bale.update(h);
      this.hometown.step(h);
      this.grocery.step(h);
      for (const pl of this.places) pl.step?.(h);
      this.traffic.step(h, this.obstacles, focus0);
      this.physics.step();
      this.traffic.afterStep();
      this.carCollisions();
      if (this.driving) this.player.body.setTranslation(this.driving.ground().add(new THREE.Vector3(0, PLAYER_CENTER, 0)), true);
      if (this.mode === 'play') {
        if (this.driving) this.carHazards();
        else {
          this.rides.step(h);
          this.checkHazards(h);
          if (this.mode === 'play' && this.character) this.hometown.checkHazards(h);
          if (this.mode === 'play' && this.character) this.grocery.checkHazards(h);
        }
      }
      this.acc -= h;
      if (first) this.latched = { jump: false, crouch: false, dive: false };
      first = false;
      steps++;
    }
    if (steps === 5) this.acc = 0;

    for (const r of this.ragdolls) r.update();
    this.life.update(dt, {
      camera: this.camera,
      player: this.mode === 'play' && this.body ? { pos: this.player.feet(), file: this.body } : null,
      menu: { up: inp.pressed('up'), down: inp.pressed('down'), confirm: inp.pressed('confirm'), back: inp.pressed('crouch') },
    });
    this.combat.update(dt);
    this.updateEffects(realDt);
    this.traffic.update(dt, this.focusPos());
    this.updateBurning(dt);
    this.props.update(dt, this.time);
    this.hometown.update(dt, this.time);
    this.grocery.update(dt, this.time);
    for (const pl of this.places) pl.update?.(dt, this.time);
    this.particles.update(dt);

    // Train smoke.
    if (this.props.train.moving) {
      this.props.train.smokeTimer -= dt;
      if (this.props.train.smokeTimer <= 0) {
        this.props.train.smokeTimer = 0.08;
        this.particles.emit(this.props.train.smokePos(), new THREE.Vector3(-4, 4, 0), 0xdddddd, { life: 1.6, size: 0.6, gravity: -1, spread: 1 });
      }
    }

    // Mode-specific per-frame logic and camera.
    if (this.mode === 'play' && this.character && this.driving) {
      this.updateDrivingFrame(realDt, lookDX, lookDY);
    } else if (this.mode === 'play' && this.character) {
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
      this.rides.update(realDt);
      const riding = this.rides.isRiding;
      const free = this.player.state !== 'locked' && !this.life.isTalking;
      const it = free && !riding ? this.nearestInteractable() : null;
      const car = free && !riding && !it ? this.carToSteal() : null;
      const who = free && !riding && !it && !car && this.player.grounded ? this.life.talkable(feet) : null;
      this.ui.prompt(
        it ? `<span class="key">E</span>${it.prompt}`
        : car ? `<span class="key">E</span>${car.mode === 'traffic' ? 'Hijack car' : 'Get in'}`
        : who ? `<span class="key">E</span>Talk to ${who.file.name.split(' ')[0]}`
        : riding && free ? '<span class="key">E</span>Hop off' : null,
      );
      if (inp.pressed('interact')) {
        if (riding && free) this.rides.dismount();
        else if (it) this.interact(it.id);
        else if (car) this.hijack(car);
        else if (who && this.body) this.life.talkTo(who, this.body, feet);
      }
      if (inp.pressed('scream') && this.player.state !== 'locked' && !this.rides.bell()) this.scream();
      if (inp.pressed('punch') && !this.ui.ledgerOpen) this.combat.punch();
      (['skill1', 'skill2', 'skill3', 'skill4', 'skill5'] as const).forEach((b, i) => {
        if (inp.pressed(b)) this.useSkill(i);
      });
      if (inp.pressed('up')) this.skillBar.selected = (this.skillBar.selected + 4) % 5;
      if (inp.pressed('down')) this.skillBar.selected = (this.skillBar.selected + 1) % 5;
      if (inp.pressed('skillUse')) this.useSkill(this.skillBar.selected);
      this.ui.setSkills(this.skillBar, inp.padConnected);
      this.ui.updateSkills(this.skillBar, performance.now(), inp.padConnected);
      this.ui.setHealth(this.combat.hp, this.combat.maxHp);
      const eyeH = this.player.state === 'crawl' ? 0.6 : this.player.state === 'crouch' ? 1.1 : 1.65;
      this.cam.update(realDt, feet.clone().add(new THREE.Vector3(0, 1.6, 0)), lookDX, lookDY, feet.clone().add(new THREE.Vector3(0, eyeH, 0)));
      ch.root.visible = !this.cam.firstPerson;
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
      this.cam.update(realDt, this.town.spawn.clone().setY(G + 6), 0, 0);
    }

    if (this.mode !== 'play') this.rides.update(realDt);

    // Sun follows the action for crisp shadows.
    const focus = this.mode === 'play' ? this.player.position() : this.mode === 'ghost' ? this.ghostPos : this.activeRagdoll?.position() ?? this.ghostPos;
    this.sun.position.set(focus.x + 30, focus.y + 60, focus.z + 20);
    this.sun.target.position.copy(focus);
    this.drawMinimap(realDt);

    if (!this.driving) this.engine.set(false, 0, 0);
    this.post.render();
    this.input.endFrame();
  }

  private updateGhost(dt: number, lookDX: number, lookDY: number) {
    const inp = this.input;
    const yaw = this.moveYaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const sp = 14;
    let vy = 0;
    if (inp.held('jump') || inp.held('up')) vy += 1;
    if (inp.held('crouch') || inp.held('down')) vy -= 1;
    this.ghostPos.x += (fx * inp.moveY + rx * inp.moveX) * sp * dt;
    this.ghostPos.z += (fz * inp.moveY + rz * inp.moveX) * sp * dt;
    this.ghostPos.y += vy * sp * 0.7 * dt;
    this.ghostPos.x = Math.min(Math.max(this.ghostPos.x, 2), SIZE - 2);
    this.ghostPos.z = Math.min(Math.max(this.ghostPos.z, 2), SIZE - 2);
    this.ghostPos.y = Math.min(Math.max(this.ghostPos.y, G + 0.5), G + 60);
    const gEye = this.ghostPos.clone().add(new THREE.Vector3(0, 1, 0));
    this.cam.update(dt, gEye, lookDX, lookDY, gEye);

    // Scythe vision: whoever is closest to the center of the screen.
    const camPos = this.camera.position;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    let best: Npc | null = null;
    let bestScore = Infinity;
    for (const n of this.targetable) {
      if (n.away) continue;
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
