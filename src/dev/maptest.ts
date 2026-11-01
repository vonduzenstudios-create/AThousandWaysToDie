import * as THREE from 'three';
import { RAPIER } from '../physics';
import { Sound } from '../audio';
import { FollowCam } from '../camera';
import { Character } from '../character';
import { Ledger, randomFile, type Job, type PersonFile } from '../deaths';
import { Input } from '../input';
import { LifeSystem } from '../life';
import type { LifeMap } from '../life/types';
import { Particles } from '../particles';
import { Player, type LandEvent } from '../player';
import { Ragdoll } from '../ragdoll';
import { UI } from '../ui';
import { mulberry32 } from '../util';
import { VoxelWorld } from '../voxel';
import { asylum } from '../maps/institutions/asylum';
import { prison } from '../maps/institutions/prison';
import type { DeathStyle, GameApi, MapDef, MapRuntime } from '../maps/types';
import type { InstitutionApi } from '../maps/institutions/common';

/**
 * Standalone playground for one MapDef, for building and testing maps before they are wired into
 * the main game's map loader. Open /maptest.html?map=prison&job=Inmate (dev server only).
 *
 * J cycles the body's job. Dying respawns a fresh body with the same job after the claim toast.
 * window.harness exposes the API for headless tests.
 */

const MAPS: Record<string, { def: MapDef; jobs: Job[] }> = {
  prison: { def: prison, jobs: ['Inmate', 'Prison Guard', 'Warden', 'Visitor'] },
  asylum: { def: asylum, jobs: ['Patient', 'Orderly', 'Nurse', 'Psychiatrist', 'Visitor'] },
};

async function boot() {
  await RAPIER.init();
  const q = new URLSearchParams(location.search);
  const entry = MAPS[q.get('map') ?? 'prison'] ?? MAPS.prison;
  const def = entry.def;
  let jobIdx = Math.max(0, entry.jobs.indexOf((q.get('job') ?? entry.jobs[0]) as Job));

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 600);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  const sky = def.sky ?? { top: 0x3d7fe0, bottom: 0xcfeaff };
  scene.background = new THREE.Color(sky.bottom);
  scene.fog = new THREE.Fog(sky.bottom, sky.fogNear ?? 90, sky.fogFar ?? 260);
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a5a3a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  const physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const world = new VoxelWorld(def.size.x, def.size.y, def.size.z);
  const rng = mulberry32(1234);
  const build = def.build(world, rng);
  world.build(scene, physics);

  const ui = new UI();
  ui.showTitle(() => {});
  ui.titleGo?.();
  const sound = new Sound();
  const ledger = new Ledger();
  const particles = new Particles(scene);
  const input = new Input(canvas);
  input.onAnyGesture = () => sound.init();
  const cam = new FollowCam(camera, physics);
  const at = q.get('at')?.split(',').map(Number);
  const start = at && at.length === 3 ? new THREE.Vector3(at[0], at[1], at[2]) : (build.stops[0]?.pos.clone() ?? build.spawn.clone());
  const player = new Player(physics, start);

  let file: PersonFile = randomFile(rng, entry.jobs[jobIdx]);
  let character: Character | null = null;
  let mode: 'play' | 'dying' = 'play';
  const ragdolls: Ragdoll[] = [];
  const deaths: string[] = [];
  let seq: { at: number; fn: () => void }[] = [];
  let seqT = 0;
  let time = 0;
  let timeScale = 1;
  let promptHtml: string | null = null;

  const spawnBody = (pos: THREE.Vector3, facing = 0) => {
    if (character) scene.remove(character.root);
    character = Character.fromFile(file, Math.floor(Math.random() * 1e9));
    scene.add(character.root);
    player.setEnabled(true);
    player.teleport(pos, facing);
    player.tier = file.physical;
    player.healLegs();
    player.lock(false);
    ui.setHud(ledger, file);
    mode = 'play';
  };

  const api: InstitutionApi = {
    get player() {
      return player;
    },
    get body() {
      return mode === 'play' ? file : null;
    },
    get character() {
      return character;
    },
    sound,
    particles,
    kill(id: string, style: DeathStyle) {
      if (mode !== 'play' || !character) return;
      mode = 'dying';
      deaths.push(id);
      const def = def_(id);
      ui.toast(def?.name.toUpperCase() ?? id, def?.category ?? '', 2600);
      timeScale = 0.35;
      const ch = character;
      character = null;
      player.setEnabled(false);
      if (style.kind === 'ragdoll') {
        scene.remove(ch.root);
        ragdolls.push(new Ragdoll(physics, scene, ch, style.vel, style.spin ?? 8, style.bounce ?? 0.45));
        if (ragdolls.length > 5) ragdolls.shift()!.dispose();
      } else {
        ch.root.scale.set(1.7, 0.08, 1.7);
        ch.root.position.copy(player.feet());
      }
      sound.splat();
      seq = [
        { at: 1.4, fn: () => (timeScale = 1) },
        {
          at: 3.4,
          fn: () => {
            if (style.kind !== 'ragdoll') scene.remove(ch.root);
            file = randomFile(rng, entry.jobs[jobIdx]);
            spawnBody(start);
          },
        },
      ];
      seqT = 0;
    },
    runSeq(steps) {
      seq = steps.slice().sort((a, b) => a.at - b.at);
      seqT = 0;
    },
    toast: (t, b, ms) => ui.toast(t, b, ms),
    say: (w, l, ms) => ui.say(w, l, ms),
    shake: (a) => cam.shake(a),
    flash: (c, ms) => ui.flash(c, ms),
    prompt: (html) => (promptHtml = html),
    get input() {
      return input;
    },
    get camYaw() {
      return cam.yaw;
    },
    get time() {
      return time;
    },
    get balance() {
      return ledger.balance;
    },
    spend(amount: number, label: string) {
      if (ledger.balance < amount) {
        ui.toast("CAN'T AFFORD IT", label, 1800);
        return false;
      }
      ledger.balance -= amount;
      return true;
    },
    setHueShift: (d) => ui.setHueShift(d),
    refreshHud: () => ui.setHud(ledger, file),
  };
  const def_ = (id: string) => def.deaths?.find((d) => d.id === id);

  const runtime: MapRuntime = build.setup?.({ scene, physics, world, rng, game: api }) ?? { dispose() {} };

  const lifeMap = build.life as LifeMap | undefined;
  const life = lifeMap ? new LifeSystem(scene, lifeMap, {}) : null;
  life?.populate();

  player.hooks = {
    onLand: (e: LandEvent) => {
      if (mode !== 'play' || !character) return;
      sound.land(Math.min(e.drop / 12, 1));
      if (runtime.onLand?.(e)) return;
      if (e.drop >= 9) api.kill('faceplant', { kind: 'ragdoll', vel: player.vel.clone().setY(8), spin: 12 });
    },
    onJump: (_k, chain) => sound.jump(chain),
  };

  spawnBody(start, build.stops[0]?.facing ?? 0);
  cam.yaw = (build.stops[0]?.facing ?? 0) + Math.PI;
  cam.dist = 9;

  // J: next job.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyJ' || mode !== 'play') return;
    jobIdx = (jobIdx + 1) % entry.jobs.length;
    file.job = entry.jobs[jobIdx];
    const p = player.feet();
    file = { ...randomFile(rng, entry.jobs[jobIdx]) };
    spawnBody(p, player.facing);
    ui.toast('NEW BODY', `${file.name}, ${file.job}`, 1500);
  });

  let acc = 0;
  let last = performance.now();
  const latched = { jump: false, crouch: false, dive: false };
  const frame = () => {
    const now = performance.now();
    const realDt = Math.min((now - last) / 1000, 0.1);
    last = now;
    input.poll();
    const dt = realDt * timeScale;
    time += dt;
    seqT += realDt;
    while (seq.length && seq[0].at <= seqT) seq.shift()!.fn();

    if (input.pressed('jump')) latched.jump = true;
    if (input.pressed('crouch')) latched.crouch = true;
    if (input.pressed('dive')) latched.dive = true;
    acc += dt;
    const h = 1 / 60;
    let steps = 0;
    while (acc >= h && steps < 5) {
      if (mode === 'play' && character) {
        player.update(h, {
          moveX: input.moveX,
          moveY: input.moveY,
          camYaw: cam.yaw,
          jumpPressed: steps === 0 && latched.jump,
          jumpHeld: input.held('jump'),
          crouchHeld: input.held('crouch'),
          crouchPressed: steps === 0 && latched.crouch,
          divePressed: steps === 0 && latched.dive,
          sprint: input.sprint,
          faceYaw: input.rmb || cam.firstPerson ? cam.forwardFacing : null,
        });
      }
      runtime.step?.(h);
      physics.step();
      if (mode === 'play' && character) runtime.checkHazards?.(h);
      if (steps === 0) Object.assign(latched, { jump: false, crouch: false, dive: false });
      acc -= h;
      steps++;
    }
    if (steps === 5) acc = 0;

    for (const r of ragdolls) r.update();
    particles.update(dt);
    runtime.update?.(dt, time);
    life?.update(dt, { camera, player: mode === 'play' ? { pos: player.feet(), file } : null });

    const lookDX = input.mouseDX * 0.0032 + input.lookX * realDt * 2.6;
    const lookDY = input.mouseDY * 0.0032 + input.lookY * realDt * 2;
    cam.zoom(input.wheel);
    if (mode === 'play' && character) {
      const ch = character;
      const feet = player.feet();
      ch.root.position.copy(feet);
      ch.root.rotation.y = player.facing;
      ch.animate(realDt, { speed: player.horizSpeed(), grounded: player.grounded, state: player.state, stateTime: player.stateTime, airTime: player.airTime });
      // Interactables.
      let best = null as null | { id: string; prompt: string };
      let bd = Infinity;
      if (player.state !== 'locked')
        for (const it of runtime.interactables ?? []) {
          if (!it.enabled) continue;
          const d = Math.hypot(it.pos.x - feet.x, it.pos.z - feet.z);
          if (d < it.radius && Math.abs(it.pos.y - feet.y) < 2.5 && d < bd) (bd = d), (best = it);
        }
      ui.prompt(best ? `<span class="key">E</span>${best.prompt}` : promptHtml);
      if (best && input.pressed('interact')) runtime.interact?.(best.id);
      cam.update(realDt, feet.clone().add(new THREE.Vector3(0, 1.6, 0)), lookDX, lookDY, feet.clone().add(new THREE.Vector3(0, 1.65, 0)));
      ch.root.visible = !cam.firstPerson;
    } else {
      ui.prompt(null);
      const tgt = ragdolls.length ? ragdolls[ragdolls.length - 1].position() : player.position();
      cam.update(realDt, tgt.add(new THREE.Vector3(0, 1, 0)), lookDX + realDt * 0.25, lookDY);
    }
    const focus = player.position();
    sun.position.set(focus.x + 30, focus.y + 60, focus.z + 20);
    sun.target.position.copy(focus);
    renderer.render(scene, camera);
    input.endFrame();
  };
  renderer.setAnimationLoop(frame);

  (window as unknown as { harness: unknown }).harness = {
    api,
    runtime,
    player,
    cam,
    deaths,
    life,
    get mode() {
      return mode;
    },
    get file() {
      return file;
    },
    teleport: (x: number, y: number, z: number, facing = 0) => player.teleport(new THREE.Vector3(x, y, z), facing),
    setJob: (job: Job) => {
      file = randomFile(rng, job);
      spawnBody(player.feet(), player.facing);
    },
    interact: (id: string) => runtime.interact?.(id),
  };
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:10px;left:10px">Failed to start: ${String(e)}</pre>`);
});
