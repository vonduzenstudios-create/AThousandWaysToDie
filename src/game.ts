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
import { G, SIZE, buildTown, inBox, type TownInfo } from './town';
import { UI } from './ui';
import { mulberry32, pick, type Rng } from './util';

type Mode = 'title' | 'play' | 'dying' | 'claim' | 'ghost' | 'possessing';

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
  private town: TownInfo;
  private props: Props;
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
  private atms!: Atms;
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

    // Physics and world.
    this.physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
    this.town = buildTown();
    this.town.world.build(this.scene, this.physics);
    this.props = new Props(this.scene, this.physics, this.town);
    this.atms = new Atms(this.scene, this.physics, this.town.world, this.town.areas.downtown, this.props.interactables);
    this.combat = this.makeCombat();
    this.skillHost = this.makeSkillHost();
    this.ui.onSkillClick = (i) => this.useSkill(i);
    this.particles = new Particles(this.scene);

    this.input = new Input(canvas);
    this.input.onAnyGesture = () => this.sound.init();
    this.cam = new FollowCam(this.camera, this.physics);
    this.player = new Player(this.physics, this.town.spawn);
    this.player.setEnabled(false);
    this.wirePlayerHooks();

    this.ghost = this.makeGhost();
    this.scene.add(this.ghost);
    this.ghost.visible = false;

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair hidden';
    document.getElementById('ui')!.appendChild(this.crosshair);

    this.spawnInitialNpcs();
    this.ui.blip = () => this.sound.blip(0.6);
    this.ui.setHud(this.ledger, null);

    // Title camera.
    this.ghostPos.set(this.town.spawn.x, G + 14, this.town.spawn.z + 6);
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
      const n = new Npc(this.scene, this.town.world, a[area], mulberry32(500 + i * 77 + (Date.now() % 1000)), job);
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

  private spawnRandomNpc() {
    const keys = Object.keys(this.town.areas);
    const key = pick(this.rng, keys);
    const area = this.town.areas[key];
    this.npcs.push(new Npc(this.scene, this.town.world, area, mulberry32(Math.floor(this.rng() * 1e9)), key === 'station' ? 'Cop' : undefined));
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
    this.props.setBarnOpen(file.job === 'Farmhand');
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
  }

  private enterGhost(at: THREE.Vector3, first = false) {
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
    this.slowmoT = 0;
    this.hueT = 0;
    this.combat.releaseAll();
    this.ui.setHealth(null);

    if (style.kind === 'cube') {
      ch.root.scale.set(ch.app.height * 1.1, ch.app.height * 0.45, ch.app.height * 1.1);
      ch.spinner.rotation.set(0, 0, 0);
      ch.tint(0xe3c25a, 0.7);
      ch.root.position.copy(this.town.baler).add(new THREE.Vector3(-1.6, 0, 0));
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
    at.x = Math.min(Math.max(at.x, 4), SIZE - 4);
    at.z = Math.min(Math.max(at.z, 4), SIZE - 4);
    at.y = Math.max(at.y, G) + 3;
    this.pendingDeath = null;
    this.enterGhost(at);
    if (Math.random() < 0.5) setTimeout(() => this.ui.say('Death', pick(this.rng, DEATH_QUIPS), 3000), 3800);
  }

  // ---------------------------------------------------------------- triggers
  private onLand(e: LandEvent) {
    const ch = this.character;
    if (!ch) return;
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
    let [breakH, fatalH] = this.player.tier === 'Feeble' ? [3.5, 7] : this.player.tier === 'Athlete' ? [6, 11] : [5, 9];
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
    for (const it of this.props.interactables) {
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
          .filter((x) => !x.helping && !x.controlled && x.pos.distanceTo(p) < radius)
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
      npcs: () => this.npcs,
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
      .filter((n) => !n.helping && !n.controlled && n.pos.distanceTo(p) < 28)
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
        this.kill('train', { kind: 'ragdoll', vel: new THREE.Vector3(tr.speed * 1.4, 16, side * 6), spin: 18, bounce: 0.5 });
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
            moveX: peeing || this.ui.ledgerOpen ? 0 : inp.moveX,
            moveY: peeing || this.ui.ledgerOpen ? 0 : inp.moveY,
            camYaw: this.cam.yaw,
            jumpPressed: first && this.latched.jump,
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
    this.combat.update(dt);
    this.updateEffects(realDt);
    this.props.update(dt, this.time);
    this.particles.update(dt);

    // Train smoke.
    if (this.props.train.moving) {
      this.props.train.smokeTimer -= dt;
      if (this.props.train.smokeTimer <= 0) {
        this.props.train.smokeTimer = 0.08;
        this.particles.emit(this.props.train.smokePos(), new THREE.Vector3(-4, 4, 0), 0xdddddd, { life: 1.6, size: 0.6, gravity: -1, spread: 1 });
      }
    }

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
      const it = this.player.state !== 'locked' ? this.nearestInteractable() : null;
      this.ui.prompt(it ? `<span class="key">E</span>${it.prompt}` : null);
      if (it && inp.pressed('interact')) this.interact(it.id);
      if (inp.pressed('scream') && this.player.state !== 'locked') this.scream();
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
      this.cam.update(realDt, new THREE.Vector3(90, G + 6, 80), 0, 0);
    }

    // Sun follows the action for crisp shadows.
    const focus = this.mode === 'play' ? this.player.position() : this.mode === 'ghost' ? this.ghostPos : this.activeRagdoll?.position() ?? this.ghostPos;
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
    this.ghostPos.x = Math.min(Math.max(this.ghostPos.x, 2), SIZE - 2);
    this.ghostPos.z = Math.min(Math.max(this.ghostPos.z, 2), SIZE - 2);
    this.ghostPos.y = Math.min(Math.max(this.ghostPos.y, G + 0.5), 50);
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
