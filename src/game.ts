import * as THREE from 'three';
import { RAPIER, QUERY_WORLD } from './physics';
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
  mapOfDeath,
  type PersonFile,
} from './deaths';
import { Input } from './input';
import { Npc } from './npc';
import { LifeSystem, type LifeMap } from './life';
import { autoLifeMap } from './travel/autolife';
import { setupHospital } from './places/hospital';
import { composeRuntimes } from './maps/compose';
import { deathGossip, smallvilleLife } from './life/maps/smallville';
import { Particles } from './particles';
import { Player, PLAYER_CENTER, type LandEvent } from './player';
import { Props } from './props';
import { Ragdoll } from './ragdoll';
import { G, inBox, type TownInfo } from './town';
import { ChunkStreamer, VoxelWorld } from './voxel';
import { MAPS, MAP_BY_ID } from './maps';
import { routesFrom } from './maps/routes';
import type { SmallvilleBuild } from './maps/smallville';
import type { GameApi, MapBuild, MapDef, MapRuntime, TravelKind, TravelStop } from './maps/types';
import { TicketUI, type TicketOption } from './travel/ticket';
import { Transit, onArrive, onDepart, type Service } from './travel/transit';
import { checkUnlocks, isOpen, lockReason, onUnlock } from './travel/progress';
import { Rides } from './rides';
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
import { MapScreen, type Waypoint } from './mapscreen/mapscreen';
import { Gps } from './mapscreen/gps';
import type { Road } from './vehicles/roads';
import { placeDeaths, poisFromPlaces, type MapPoi } from './mapscreen/pois';

type Mode = 'title' | 'play' | 'dying' | 'claim' | 'ghost' | 'inspect' | 'possessing' | 'travel';

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
  private start0 = new THREE.Vector3();
  private ghost: THREE.Group;
  private ghostPos = new THREE.Vector3();
  private ghostTarget: Npc | null = null;
  /** Death's flight pitch; like moveYaw, left-click looking leaves it alone. */
  private movePitch = 0.32;
  /** Zoomed in on someone with the scythe menu open (world frozen). */
  private inspect: { npc: Npc; sel: number; t: number; fromPos: THREE.Vector3; fromQuat: THREE.Quaternion; toPos: THREE.Vector3; toQuat: THREE.Quaternion } | null = null;
  /** Possess fly-in from the inspect view: camera pans from `fromPos` into the body. */
  private possessCam: { fromPos: THREE.Vector3; quat: THREE.Quaternion; toPos: THREE.Vector3; t: number } | null = null;
  /** Eases the camera from a held pose back to wherever the normal camera wants to be. */
  private camBlend: { pos: THREE.Vector3; quat: THREE.Quaternion; t: number; dur: number } | null = null;
  /** Current world saturation (eased; Death sees the world washed out). */
  private sat = 1.1;
  private inspectHead = new THREE.Vector3();
  private peeTime = 0;
  private peeSoundT = 0;
  /** Times (ms) of recent screams that turned out to be about nothing. Three in a minute gets you committed. */
  private falseAlarms: number[] = [];
  private pendingDeath: { id: string; victim: PersonFile; startPos: THREE.Vector3 } | null = null;
  private crosshair: HTMLElement;
  private hornCooldown = 0;
  private hometown: Hometown | null = null;
  private grocery: PlaceRuntime | null = null;
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
  private traffic!: Traffic;
  private minimap: Minimap;
  /** Full-screen map (N / right stick click / click the radar) and the GPS waypoint it sets. */
  private mapScreen: MapScreen;
  private gps!: Gps;
  private mapPois: MapPoi[] = [];
  private waypoint: Waypoint | null = null;
  private route: { x: number; z: number }[] | null = null;
  private routeAt = { x: NaN, z: NaN, t: 0 };
  private beacon: THREE.Mesh;
  private pois: Blip[] = [];
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

    // Physics (each map gets a fresh world in loadMap) and the persistent actors.
    this.physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
    this.combat = this.makeCombat();
    this.skillHost = this.makeSkillHost();
    this.ui.onSkillClick = (i) => this.useSkill(i);
    this.particles = new Particles(this.scene);
    registerMapDeaths(HOMETOWN_DEATHS, 'smallville');
    registerMapDeaths(GROCERY.deaths, 'smallville');
    this.minimap = new Minimap(document.getElementById('ui')!);
    this.minimap.setVisible(false);
    this.mapScreen = new MapScreen(document.getElementById('ui')!, this.minimap.tiles);
    this.mapScreen.onWaypoint = (wp) => this.setWaypoint(wp);
    this.minimap.onClick = () => {
      if (this.mode !== 'title' && !this.story.active) this.mapScreen.show(this.mapView());
    };
    // A tall purple light marks the waypoint in the world.
    const beamGeo = new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true);
    beamGeo.translate(0, 30, 0);
    this.beacon = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xc45cff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.beacon.visible = false;
    this.beacon.renderOrder = 5;
    this.scene.add(this.beacon);
    this.engine = new EngineSound(this.sound);

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
    this.cam.snap(this.mapBuild.spawn.clone().setY(G + 6));

    this.story.onPause = (p) => this.sound.duck(p);
    // Death's milestone scenes play when 25 unique deaths open a route.
    onUnlock((e) => this.story.unlock(e));
    // Townsfolk ride the scheduled buses, trains, ferries and planes.
    onArrive((e) => this.life?.vehicleArrived(e.stopId, e.door));
    onDepart((e) => this.life?.vehicleDeparted(e.stopId));
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

  /** Bodies scythe vision can target: townsfolk plus people the places post (hospital staff). */
  private get targetable(): Npc[] {
    const extra = this.runtime?.npcs;
    return extra?.length ? [...this.npcs, ...extra] : this.npcs;
  }

  private spawnInitialNpcs() {
    if (!this.life) return;
    this.life.populate();
    if (!this.town) return;
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

  private makeRides(smallville: boolean) {
    const { spots, ramps } = smallville ? Rides.smallvilleLayout() : { spots: [], ramps: [] };
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

  /** Maps Dev Mode can jump to: every registered map, plus test places. */
  devMaps(): DevMap[] {
    return [
      ...MAPS.map((m) => ({ id: m.id, name: m.name, note: m.id === 'smallville' ? 'Hometown' : 'Map' })),
      { id: 'place:hospital', name: 'City General Hospital', note: 'Test place (in Smallville)' },
    ];
  }

  /** Dev Mode: load a map by id (or a test place inside one). */
  protected loadDevMap(id: string) {
    if (id === 'place:hospital') {
      if (this.mapDef.id !== 'smallville') this.loadMap('smallville');
      if (this.town) this.start0 = this.town.hospital.entrance.clone().add(new THREE.Vector3(0, 4, -8));
      return;
    }
    if (MAP_BY_ID[id] && id !== this.mapDef.id) this.loadMap(id);
  }

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
    this.props?.setBarnOpen(file.job === 'Farmhand');
    this.hometown?.onBody(file);
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
    this.runtime?.onBody?.(file);
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
    this.runtime?.onBody?.(null);
    if (first) this.cam.dist = 8;
    this.cam.autoOrbit = 0;
    this.sound.setStyle('ghost');
    this.sound.ghost();
    this.ui.setHud(this.ledger, null);
    this.ui.setBanner('GHOST MODE · Look at someone, <b>E</b> / <b>Y</b> to read their file · Right click or both buttons to fly where you look');
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
    this.ui.showScythe(null);
    document.getElementById('ui')?.classList.remove('inspecting');
    if (this.inspect) {
      const head = this.inspectHead.clone();
      this.possessCam = { fromPos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), toPos: head, t: 0 };
      // Come out the other side looking the same way we flew in.
      const d = this.camera.position.clone().sub(head);
      this.cam.yaw = Math.atan2(d.x, d.z);
      this.inspect = null;
    }
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
          n.character.mats.forEach((m) => m.emissive.setHex(0));
          if (this.possessCam) {
            this.camBlend = { pos: this.possessCam.toPos.clone(), quat: this.possessCam.quat.clone(), t: 0, dur: 0.7 };
            this.possessCam = null;
          }
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
      else ch.root.position.copy(this.town?.baler ?? this.player.feet()).add(new THREE.Vector3(-1.6, 0, 0));
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
    if (this.mode === 'play' && !this.rides.isRiding && this.hometown?.onLand(e)) return;
    if (this.rides.isRiding && this.rides.onLand(e)) return;
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
      const town = this.town;
      if (this.pendingFall) id = this.pendingFall;
      else if (town && inBox(e.launchPos, town.treeZone)) id = 'treehouse';
      else if (town && inBox(e.launchPos, town.towerZone) && e.launchState === 'longjump') id = 'watertower';
      id = this.hometown?.fallDeathId(e, this.player.feet()) ?? id;
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
    for (const it of [...(this.props?.interactables ?? []), ...this.rides.activeInteractables(), ...(this.runtime?.interactables ?? []), ...this.travelInteractables()]) {
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
    if (this.hometown?.interact(id)) return;
    if (id.startsWith('groc:')) {
      this.grocery?.interact(id);
      return;
    }
    if (this.rides.tryInteract(id)) return;
    if (id.startsWith('travel:')) return this.openTickets(id.slice(7));
    if (id.startsWith('wheelwell:')) return this.stowAway(id.slice(10));
    if (this.runtime?.interactables?.some((it) => it.id === id)) return this.runtime.interact?.(id);
    if (id.startsWith('atm:')) {
      const r = withdraw(this.body, this.withdrawn);
      this.ui.toast(r.title, r.sub, 3200);
      if (r.ok) {
        this.withdrawn += r.amount;
        this.addMoney(r.amount);
        this.sound.cash();
        const it = this.props?.interactables.find((x) => x.id === id);
        if (it) this.particles.burst(it.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 14, 0x55d16a, 3, { life: 0.9, size: 0.16 });
        if (this.rng() < 0.25) setTimeout(() => this.ui.say('Death', "You know you can't take it with you. Oh wait. You literally can.", 3200), 600);
      } else this.sound.denied();
      return;
    }
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
    const cands = [...(this.props?.interactables ?? []), ...(this.runtime?.interactables ?? [])].filter((it) => it.enabled && !it.id.startsWith('atm')).map((it) => it.pos);
    const t = this.town;
    const center = (b: { min: THREE.Vector3; max: THREE.Vector3 }) => b.min.clone().add(b.max).multiplyScalar(0.5);
    if (t) cands.push(center(t.treeZone), center(t.towerZone), new THREE.Vector3(p.x, G, t.trackZ + 0.5));
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
        if (!this.props?.train.moving) return false;
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
              arrest(this.api, 'Disturbing the peace (screaming at nothing, three times)');
            } else {
              this.ui.say(n.file.name, "Okay, I'm calling someone. Not the cops. The OTHER someone.", 2600);
              setTimeout(() => this.mode === 'play' && commit(this.api, 'Screamed at strangers three times for no reason'), 1800);
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
    const hit = this.traffic.hitTest(p, 0.8, 4); // the capsule gets shoved ahead of the bumper, so reach a little past it
    if (hit) {
      this.sound.splat();
      carSfx.horn(this.sound);
      this.cam.shake(1.2);
      const sp = hit.vel.length();
      this.kill(this.rides.isRiding ? 'sharetheroad' : 'roadkill', { kind: 'ragdoll', vel: hit.vel.clone().multiplyScalar(1.4).add(new THREE.Vector3(0, 8 + sp * 0.6, 0)), spin: 16, bounce: 0.65 });
      return;
    }
    if (p.y < -12 && !this.player.carry) {
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
        this.kill(this.rides.isRiding ? 'grindrail' : 'train', { kind: 'ragdoll', vel: new THREE.Vector3(tr.speed * 1.4, 16, side * 6), spin: 18, bounce: 0.5 });
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
      if (this.peeTime >= 0.4 && this.peeTime - dt < 0.4) {
        this.life.event({ kind: 'pee', at: this.player.feet(), radius: 12 });
        // Peeing in front of a cop is a crime. Cops peeing in front of cops is professional courtesy.
        const p = this.player.feet();
        const cop = this.body?.job !== 'Cop' && this.npcs.find((n) => n.file.job === 'Cop' && !n.away && !n.controlled && n.pos.distanceTo(p) < 14);
        if (cop) {
          this.ui.say(cop.file.name, 'Whoa, WHOA. Zip it up. You are under arrest.', 2600);
          this.peeTime = 0;
          arrest(this.api, 'Indecent exposure in front of an officer');
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
    if (this.driving) this.leaveCar();
    this.life?.dispose();
    this.traffic?.dispose();
    this.rides?.dispose();
    this.burning = [];
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
    this.rides = this.makeRides(id === 'smallville');
    this.player.setEnabled(this.mode === 'play');
    const fogFar = def.sky?.fogFar ?? 260;
    this.streamer = new ChunkStreamer(this.world, this.scene, this.physics, { radius: fogFar + 16 });
    this.streamer.buildNear(at, 80);
    if (def.id === 'smallville') {
      this.town = (b as SmallvilleBuild).town;
      this.props = new Props(this.scene, this.physics, this.town);
      this.props.setBarnOpen(this.body?.job === 'Farmhand');
      this.atms = new Atms(this.scene, this.physics, this.world, this.town.areas.downtown, this.props.interactables);
      const town = this.town;
      // Detailed exterior-only buildings from the building kit (docs/building-kit.md).
      const kit = new StreetKit({ parent: this.scene, physics: this.physics });
      for (const kb of town.kitBuildings) kit.building(kb);
      kit.finish();
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const game = this;
      this.hometown = new Hometown(this.scene, this.physics, town, {
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
      // The grocery store is its own place stamp with its own deaths and runtime.
      this.grocery = town.grocery.setup({
        scene: this.scene,
        physics: this.physics,
        world: this.world,
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
      // ?place=hospital starts the ghost at the door of the hospital stamped into the E3 lot.
      this.start0 = town.spawn.clone().setY(G + 4);
      if (new URLSearchParams(location.search).get('place') === 'hospital') this.start0 = town.hospital.entrance.clone().add(new THREE.Vector3(0, 4, -8));
    } else {
      this.hometown = null;
      this.grocery = null;
      this.start0 = b.spawn.clone().setY(this.mapGround + 4);
    }
    // Townsfolk, traffic and the radar for this map.
    const lifeMap = this.town ? smallvilleLife(this.town) : ((b.life as LifeMap | undefined) ?? autoLifeMap(def, b, this.world, this.mapGround));
    this.life = new LifeSystem(this.scene, lifeMap, {
      seed: 500 + (Date.now() % 1000),
      blip: () => this.sound.blip(0.6),
      maxPopulation: this.town ? undefined : 120,
    });
    this.traffic = new Traffic(this.scene, this.physics, this.town ? smallvilleTraffic(this.town) : { roads: b.roads ?? [], parked: [] });
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
    this.minimap.setWorld(this.world, def.name, this.mapGround);
    this.pois = this.town ? smallvillePois(this.town) : [];
    const ctx = { scene: this.scene, physics: this.physics, world: this.world, rng, game: this.api };
    const own = b.setup?.(ctx) ?? null;
    this.runtime = this.town ? composeRuntimes([own, setupHospital(ctx, this.town.hospital, { name: 'Smallville General Hospital' })]) : own;
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
    this.setupMapScreen(this.town ? smallvilleTraffic(this.town).roads : (b.roads ?? []));
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
      if (!routesFrom(this.stopKey(s.id), (to) => !!MAP_BY_ID[to.split(':')[0]]).length) continue; // e.g. prison intake
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
      if (svc && svc.phase === 'dwell' && (svc.door().distanceTo(this.player.feet()) < 4.5 || svc.stop.pos.distanceTo(this.player.feet()) < 4.5)) {
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
    const tr = this.props?.train;
    // The train and where it will be in the next couple of seconds, like a crossing gate.
    if (tr?.moving) for (let dx = -20; dx <= 80; dx += 3) o.push({ pos: new THREE.Vector3(tr.x + dx, G, tr.z) });
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
    const tr = this.props?.train ?? null;
    const focus = this.focusPos();
    for (const car of this.traffic.cars) {
      if (car === this.driving) continue;
      if (tr && tr.moving && tr.contains(car.ground(), 1.4) && car.velocity().x < tr.speed * 0.8) {
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
    const tr = this.props?.train;
    if (tr?.moving && tr.contains(car.ground(), 1.8)) {
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

  // ---------------------------------------------------------------- full map + GPS
  /** Points of interest, death spots and GPS roads for the full-screen map, for whichever map just loaded. */
  private setupMapScreen(roads: Road[]) {
    const b = this.mapBuild, t = this.town;
    const places = this.life.places;
    const deaths = Object.values(DEATH_BY_ID).filter((d) => mapOfDeath(d.id) === this.mapDef.id);
    // Homes stay off the map, except the story's 12 Maple St and homes where someone can die.
    const homeDeath = new Set(deaths.map((d) => d.location.toLowerCase()));
    const keepHomes = places.filter((p) => p.tags?.includes('maple12') || homeDeath.has(p.name.toLowerCase())).map((p) => p.id);
    const pois = poisFromPlaces(places, b.stops, keepHomes);
    pois.push(...(b.pois ?? []));
    for (const r of this.rides.ramps) pois.push({ id: `ramp:${r.id}`, x: r.base.x, z: r.base.z, name: r.name, kind: 'ride' });
    for (const it of this.props?.interactables ?? []) if (it.id.startsWith('atm:')) pois.push({ id: it.id, x: it.pos.x, z: it.pos.z, name: 'ATM', kind: 'atm' });
    const mid = (bx: { min: THREE.Vector3; max: THREE.Vector3 }) => ({ x: (bx.min.x + bx.max.x) / 2, z: (bx.min.z + bx.max.z) / 2 });
    const spots: Record<string, { x: number; z: number } | string> = { ...(b.deathSpots ?? {}) };
    if (t)
      Object.assign(spots, {
        'Smallville Rail Crossing': t.crossing,
        'Hoffman Silo': mid(t.zones.silo),
        'Hoffman Bull Pen': t.spots.bull,
        'Maple St Backyards': mid(t.zones.trampoline),
        'Tower Rd Backyard': mid(t.zones.kiddiePool),
        'Smallville DMV': 'dmv',
        'First Church Bell Tower': 'church',
        'Smallville Police Station': 'police',
        'The Dare Ramp': 'ramp:dare',
      });
    const missed = placeDeaths(pois, deaths, spots);
    if (missed.length) console.debug(`[map] ${this.mapDef.id} deaths with no spot:`, missed.map((d) => `${d.id} @ ${d.location}`));
    this.mapPois = pois;
    this.mapScreen.setMap(this.mapDef.name, pois);
    this.gps = new Gps(roads);
    this.setWaypoint(null);
  }

  private mapView() {
    const c = this.focusPos();
    const facing = this.driving ? this.driving.facing : this.mode === 'play' ? this.player.facing : this.cam.forwardFacing;
    return { player: { x: c.x, z: c.z, facing }, waypoint: this.waypoint, route: this.route, found: (id: string) => !!this.ledger.found[id] };
  }

  private setWaypoint(wp: Waypoint | null) {
    this.waypoint = wp;
    this.routeAt.x = NaN;
    this.route = null;
    if (wp) {
      this.sound.blip(1.2);
      const ground = this.world.topY(Math.floor(wp.x), Math.floor(wp.z));
      this.beacon.position.set(wp.x, ground, wp.z);
    }
    this.beacon.visible = !!wp;
    this.updateRoute(0);
  }

  /** Re-route when the player has moved a bit; clear the waypoint on arrival. */
  private updateRoute(dt: number) {
    const wp = this.waypoint;
    if (!wp) {
      this.minimap.setWaypoint(null, null);
      return;
    }
    const c = this.focusPos();
    const left = Math.hypot(wp.x - c.x, wp.z - c.z);
    if (left < 6 && this.mode !== 'title') {
      this.ui.toast('You have arrived', wp.name ?? 'Waypoint reached', 2200);
      this.setWaypoint(null);
      return;
    }
    this.routeAt.t -= dt;
    if (Number.isNaN(this.routeAt.x) || (this.routeAt.t <= 0 && Math.hypot(c.x - this.routeAt.x, c.z - this.routeAt.z) > 2)) {
      this.route = this.gps.route({ x: c.x, z: c.z }, wp);
      this.routeAt = { x: c.x, z: c.z, t: 0.4 };
    } else if (this.route) this.route[0] = { x: c.x, z: c.z };
    this.minimap.setWaypoint(wp, this.route, this.route ? Gps.length(this.route) : left);
    // The beacon pulses gently and fades out up close.
    const m = this.beacon.material as THREE.MeshBasicMaterial;
    m.opacity = Math.min(1, left / 40) * (0.28 + Math.sin(performance.now() / 300) * 0.08);
  }

  private drawMinimap(dt: number) {
    if (this.mode === 'title') {
      this.minimap.setVisible(false);
      return;
    }
    this.minimap.setVisible(true);
    const ghost = this.mode === 'ghost' || this.mode === 'possessing' || this.mode === 'inspect';
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

    // The full map pauses the game while it is open.
    if (this.mapScreen.open || (inp.pressed('map') && this.mode !== 'title')) {
      if (!this.mapScreen.open) {
        this.mapScreen.show(this.mapView());
      } else this.mapScreen.update(inp, realDt, this.mapView());
      this.minimap.setVisible(!this.mapScreen.open && this.mode !== 'title');
      this.updateRoute(0);
      this.post.render();
      this.input.endFrame();
      return;
    }

    if (this.mode === 'title' && this.title?.open) {
      if (inp.pressed('menuUp')) this.title.nav('up');
      if (inp.pressed('menuDown')) this.title.nav('down');
      if (inp.pressed('menuLeft')) this.title.nav('left');
      if (inp.pressed('menuRight')) this.title.nav('right');
      if (inp.pressed('confirm')) this.title.nav('confirm');
      if (inp.pressed('back')) this.title.nav('back');
    } else if (inp.pressed('music')) this.sound.toggleMusic();
    if (inp.pressed('help')) this.ui.toggleHelp();
    if (inp.pressed('ledger') && this.mode !== 'title') this.ui.toggleLedger(this.ledger, this.mapDef, MAPS);
    if (this.mode === 'claim' && inp.pressed('confirm')) this.ui.pendingClaim?.();
    this.ui.setPadMode(inp.padConnected);

    const mouseSens = 0.0032 * this.options.sens;
    if (this.mode === 'play' || this.mode === 'ghost') this.cam.zoom(inp.wheel);
    // Death can look (and fly) much further up and down than a body can.
    this.cam.minPitch = this.mode === 'ghost' ? -1.2 : -0.2;
    this.cam.maxPitch = this.mode === 'ghost' ? 1.4 : 1.25;
    if (this.mode !== 'ghost' && this.cam.pitch < -0.2 && !this.cam.firstPerson) this.cam.pitch = -0.2;
    this.cam.minDist = this.mode === 'dying' || this.mode === 'claim' ? 6 : 0;
    // Right mouse (or first person) makes the character face where the camera looks.
    const steer = inp.rmb || this.cam.firstPerson;
    if (!(inp.lmb && !inp.rmb && !this.cam.firstPerson)) {
      this.moveYaw = this.cam.yaw;
      this.movePitch = this.cam.pitch;
    }
    const lookDX = inp.mouseDX * mouseSens + inp.lookX * realDt * 2.6;
    const lookDY = (inp.mouseDY * mouseSens + inp.lookY * realDt * 2) * (this.options.invertY ? -1 : 1);

    // Scythe vision freezes the world.
    const dt = this.mode === 'inspect' ? 0 : realDt * this.timeScale;
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
            moveX: peeing || this.ui.ledgerOpen || this.tickets.open ? 0 : inp.moveX,
            moveY: peeing || this.ui.ledgerOpen || this.tickets.open ? 0 : inp.moveY,
            camYaw: this.moveYaw,
            jumpPressed: first && this.latched.jump && !this.life.isTalking && !this.tickets.open,
            jumpHeld: inp.held('jump'),
            crouchHeld: inp.held('crouch'),
            crouchPressed: first && this.latched.crouch,
            divePressed: first && this.latched.dive,
            sprint: inp.sprint,
            faceYaw: steer ? this.cam.forwardFacing : null,
          });
        }
      }
      if (this.trainHold <= 0) this.props?.train.update(h);
      this.props?.bale.update(h);
      this.transit?.step(h);
      this.runtime?.step?.(h);
      this.hometown?.step(h);
      this.grocery?.step(h);
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
          if (this.mode === 'play' && this.character) this.hometown?.checkHazards(h);
          if (this.mode === 'play' && this.character) this.grocery?.checkHazards(h);
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
    this.props?.update(dt, this.time);
    this.runtime?.update?.(dt, this.time);
    this.hometown?.update(dt, this.time);
    this.grocery?.update(dt, this.time);
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
      const free = this.player.state !== 'locked' && !this.life.isTalking && !this.tickets.open;
      if (this.tickets.open) this.menuInput();
      const it = free && !riding ? this.nearestInteractable() : null;
      const car = free && !riding && !it ? this.carToSteal() : null;
      const who = free && !riding && !it && !car && this.player.grounded ? this.life.talkable(feet) : null;
      this.ui.prompt(
        it ? `<span class="key">E</span>${it.prompt}`
        : car ? `<span class="key">E</span>${car.mode === 'traffic' ? 'Hijack car' : 'Get in'}`
        : who ? `<span class="key">E</span>Talk to ${who.file.name.split(' ')[0]}`
        : riding && free ? '<span class="key">E</span>Hop off' : this.tickets.open ? null : this.ticketPrompt(),
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
    } else if (this.mode === 'ghost' || this.mode === 'possessing' || this.mode === 'inspect') {
      if (this.mode === 'ghost') this.updateGhost(realDt, lookDX, lookDY);
      else if (this.mode === 'inspect') this.updateInspect(realDt);
      else if (this.possessCam) {
        const pc = this.possessCam;
        pc.t = Math.min(1, pc.t + realDt / 0.5);
        const e = pc.t * pc.t * (3 - 2 * pc.t);
        this.camera.position.lerpVectors(pc.fromPos, pc.toPos, e);
        this.camera.quaternion.copy(pc.quat);
      } else this.cam.update(realDt, this.ghostPos.clone().add(new THREE.Vector3(0, 1, 0)), lookDX, lookDY);
      this.ghost.position.copy(this.ghostPos);
      this.ghost.visible = this.mode === 'possessing' ? !this.possessCam : !this.cam.firstPerson;
      this.ghost.position.y += Math.sin(this.time * 3) * 0.15;
      if (this.mode === 'ghost') this.ghost.rotation.y = this.moveYaw + Math.PI;
    } else {
      this.cam.update(realDt, this.mapBuild.spawn.clone().setY(this.mapGround + 6), 0, 0);
    }

    if (this.mode !== 'play') this.rides.update(realDt);

    // Sun follows the action for crisp shadows; the world streams in around it.
    const focus =
      this.mode === 'play'
        ? this.player.position()
        : this.mode === 'ghost' || this.mode === 'inspect'
          ? this.ghostPos
          : this.mode === 'travel' && this.trip?.svc
            ? this.trip.svc.pos.clone()
            : this.activeRagdoll?.position() ?? this.ghostPos;
    this.streamer?.update(focus, 5);
    this.sun.position.set(focus.x + 30, focus.y + 60, focus.z + 20);
    this.sun.target.position.copy(focus);
    this.updateRoute(realDt);
    this.drawMinimap(realDt);

    if (this.camBlend) {
      const b = this.camBlend;
      b.t = Math.min(1, b.t + realDt / b.dur);
      const e = b.t * b.t * (3 - 2 * b.t);
      this.camera.position.lerpVectors(b.pos, this.camera.position, e);
      this.camera.quaternion.slerpQuaternions(b.quat, this.camera.quaternion.clone(), e);
      if (b.t >= 1) this.camBlend = null;
    }
    this.updateSaturation(realDt);

    if (!this.driving) this.engine.set(false, 0, 0);
    this.post.render();
    this.input.endFrame();
  }

  private updateGhost(dt: number, lookDX: number, lookDY: number) {
    const inp = this.input;
    const yaw = this.moveYaw;
    // Fly where the camera points. The resting third-person view (looking a little down
    // at Death) flies level; tilt further up or down to climb or dive.
    const fp = this.cam.firstPerson;
    let p = fp ? this.movePitch : this.movePitch - 0.32;
    const dead = fp ? 0.06 : 0.12;
    p = Math.abs(p) < dead ? 0 : p - Math.sign(p) * dead;
    const cp = Math.cos(p);
    const fx = -Math.sin(yaw) * cp, fz = -Math.cos(yaw) * cp, fy = -Math.sin(p);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const sp = inp.sprint ? 26 : 14;
    let vy = 0;
    if (inp.held('jump') || inp.held('up')) vy += 1;
    if (inp.held('crouch') || inp.held('down')) vy -= 1;
    this.ghostPos.x += (fx * inp.moveY + rx * inp.moveX) * sp * dt;
    this.ghostPos.z += (fz * inp.moveY + rz * inp.moveX) * sp * dt;
    this.ghostPos.y += (fy * inp.moveY * sp + vy * sp * 0.7) * dt;
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
      if (best) this.sound.blip(1.4);
    }
    // Highlight only (the file opens on E). A soft pulse so it reads against the grey world.
    if (best) {
      const k = 0.75 + Math.sin(performance.now() * 0.006) * 0.25;
      const c = new THREE.Color(0x5a3fb0).multiplyScalar(k);
      best.character.mats.forEach((m) => m.emissive.copy(c));
    }
    if (best && inp.pressed('interact')) this.enterInspect(best);
  }

  /** E on a highlighted person: freeze the world, zoom in, open the scythe menu. */
  private enterInspect(n: Npc) {
    this.mode = 'inspect';
    this.ui.setBanner(null);
    document.getElementById('ui')?.classList.add('inspecting');
    this.crosshair.classList.add('hidden');
    this.sound.blip(0.8);
    // Frame their face: characters come in many sizes, so measure the model.
    const box = new THREE.Box3().setFromObject(n.character.root);
    const tall = Math.max(0.6, box.max.y - n.pos.y);
    const head = n.pos.clone().add(new THREE.Vector3(0, tall * 0.82, 0));
    // Approach from where we're looking, so there's open space between us.
    const dist = 1.2 + tall * 0.9;
    const ours = this.camera.position.clone().sub(head).setY(0);
    if (ours.lengthSq() < 0.01) ours.set(0, 0, 1);
    ours.normalize();
    // Prefer to see their face (in front of them, leaning toward our side), unless a wall is in the way.
    const ry = n.character.root.rotation.y;
    const front = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    let away = front.clone().addScaledVector(ours, 0.6).normalize();
    const clear = (d: THREE.Vector3) => {
      const ray = new RAPIER.Ray(head, d);
      const hit = this.physics.castRay(ray, dist + 0.4, true, undefined, QUERY_WORLD);
      return !hit;
    };
    if (!clear(away)) away = clear(front) ? front : ours;
    const toPos = head.clone().addScaledVector(away, dist).add(new THREE.Vector3(0, tall * 0.08, 0));
    // Look a little to their right (our left) so they stand right of the menu.
    const side = new THREE.Vector3(away.z, 0, -away.x); // camera's right
    const look = head.clone().addScaledVector(side, -0.35 * dist).add(new THREE.Vector3(0, -tall * 0.12, 0));
    const m = new THREE.Matrix4().lookAt(toPos, look, new THREE.Vector3(0, 1, 0));
    const toQuat = new THREE.Quaternion().setFromRotationMatrix(m);
    this.inspectHead.copy(head);
    this.inspect = { npc: n, sel: 0, t: 0, fromPos: this.camera.position.clone(), fromQuat: this.camera.quaternion.clone(), toPos, toQuat };
    this.renderScythe();
  }

  private renderScythe() {
    const ins = this.inspect;
    if (!ins) return this.ui.showScythe(null);
    this.ui.showScythe(
      ins.npc.file,
      ins.sel,
      {
        possess: () => this.inspectChoose(0),
        pass: () => this.inspectChoose(1),
        hover: (i) => {
          if (this.inspect && this.inspect.sel !== i) {
            this.inspect.sel = i;
            this.renderScythe();
          }
        },
      },
      this.input.padConnected,
    );
  }

  private inspectChoose(i: number) {
    const ins = this.inspect;
    if (!ins || this.mode !== 'inspect') return;
    this.sound.blip(i === 0 ? 1.6 : 0.9);
    if (i === 0) {
      ins.npc.character.mats.forEach((m) => m.emissive.setHex(0));
      this.ghostTarget = null;
      this.possess(ins.npc);
      return;
    }
    // Pass: zoom back out to Death's view.
    this.ui.showScythe(null);
    document.getElementById('ui')?.classList.remove('inspecting');
    this.camBlend = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), t: 0, dur: 0.6 };
    this.inspect = null;
    this.mode = 'ghost';
    this.ui.setBanner('GHOST MODE · Look at someone, <b>E</b> / <b>Y</b> to read their file · Right click or both buttons to fly where you look');
    this.crosshair.classList.remove('hidden');
  }

  private updateInspect(dt: number) {
    const ins = this.inspect;
    if (!ins) return;
    ins.t = Math.min(1, ins.t + dt / 0.55);
    const e = 1 - Math.pow(1 - ins.t, 3);
    this.camera.position.lerpVectors(ins.fromPos, ins.toPos, e);
    this.camera.quaternion.slerpQuaternions(ins.fromQuat, ins.toQuat, e);
    const k = 0.75 + Math.sin(performance.now() * 0.006) * 0.25;
    const c = new THREE.Color(0x5a3fb0).multiplyScalar(k);
    ins.npc.character.mats.forEach((m) => m.emissive.copy(c));
    const inp = this.input;
    if (inp.pressed('menuUp') || inp.pressed('menuDown') || inp.pressed('menuLeft') || inp.pressed('menuRight')) {
      ins.sel = 1 - ins.sel;
      this.sound.blip(1.2);
      this.renderScythe();
    }
    if (inp.pressed('back') || inp.pressed('pee')) this.inspectChoose(1);
    else if (inp.pressed('confirm') && ins.t > 0.3) this.inspectChoose(ins.sel);
  }

  /** Death sees the world washed out; color floods back as you possess someone. */
  private updateSaturation(dt: number) {
    const want = this.mode === 'ghost' || this.mode === 'inspect' ? 0.12 : 1.1;
    this.sat += (want - this.sat) * (1 - Math.exp(-dt * (want > this.sat ? 3.5 : 2.5)));
    if (Math.abs(want - this.sat) < 0.002) this.sat = want;
    this.post.grade.uniforms.saturation.value = this.sat;
    const css = this.post.graded || this.sat >= 1.09 ? '' : `saturate(${(this.sat / 1.1).toFixed(3)})`;
    const el = this.renderer.domElement;
    if (el.style.filter !== css) el.style.filter = css;
  }
}

export const PLAYER_FEET_OFFSET = PLAYER_CENTER;
