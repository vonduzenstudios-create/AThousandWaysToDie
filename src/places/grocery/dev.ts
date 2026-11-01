/**
 * Dev page for Smallville Grocery: open /grocery.html on the Vite dev server.
 * A flat test lot with the store stamped in, a body you control, and a tiny stand-in
 * for the game's GameApi so every grocery death can be played without the full town.
 *
 * URL params: ?rot=0..3  ?job=Butcher  ?tier=Feeble|Normal|Athlete  ?allergy=1
 * Keys: 1-7 pick a job (none, Butcher, Stocker, Cashier, Deli Clerk, Produce Manager, Store Manager),
 *       8 toggles Feeble, 9 toggles the peanut allergy, 0 respawns at the entrance.
 */
import * as THREE from 'three';
import { RAPIER } from '../../physics';
import { Sound } from '../../audio';
import { FollowCam } from '../../camera';
import { Character, randomAppearance } from '../../character';
import { randomFile, type Job, type PersonFile } from '../../deaths';
import { Input } from '../../input';
import { Particles } from '../../particles';
import { Player } from '../../player';
import { Ragdoll } from '../../ragdoll';
import { UI } from '../../ui';
import { B, VoxelWorld } from '../../voxel';
import { mulberry32 } from '../../util';
import type { DeathStyle, PlaceGame, PlaceRuntime } from '../types';
import { GROCERY, GROCERY_DEATHS } from './index';
import { PostFX, warmLighting } from '../../render/post';

const G = 4;
const params = new URLSearchParams(location.search);
const ROT = Number(params.get('rot') ?? 0);

async function boot() {
  await RAPIER.init();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3ff);
  scene.fog = new THREE.Fog(0x9fd3ff, 120, 300);
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 600);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    post?.setSize(window.innerWidth, window.innerHeight);
  });
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a5a3a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 250 });
  scene.add(sun, sun.target);
  warmLighting(scene, renderer, { sun, hemi });
  const post = new PostFX(renderer, scene, camera);

  // Test lot: grass, a road along the street side, the store in the middle.
  const S = 132;
  const world = new VoxelWorld(S, 40, S);
  world.fill(0, 0, 0, S - 1, G - 1, S - 1, B.Grass);
  const at = ROT === 0 ? { x: 26, z: 14 } : ROT === 1 ? { x: 14, z: 26 } : ROT === 2 ? { x: 26, z: 14 } : { x: 14, z: 26 };
  const store = GROCERY.build(world, { x: at.x, y: G, z: at.z, rot: ROT as 0 | 1 | 2 | 3 }, mulberry32(1));
  // Road on the street side of the lot.
  const e = store.entrance;
  for (let x = 0; x < S; x++)
    for (let z = 0; z < S; z++) {
      const l = store.frame.toLocal(new THREE.Vector3(x + 0.5, 0, z + 0.5));
      if (l.z > -12 && l.z < -2 && l.x > -20 && l.x < 100) world.set(x, G - 1, z, B.Asphalt);
    }
  const physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
  world.build(scene, physics);

  const ui = new UI();
  ui.showTitle(() => {});
  ui.titleGo?.();
  const sound = new Sound();
  const particles = new Particles(scene);
  const input = new Input(canvas);
  input.onAnyGesture = () => sound.init();
  const cam = new FollowCam(camera, physics);
  const player = new Player(physics, e);

  let character: Character | null = null;
  let body: PersonFile | null = null;
  let seq: { at: number; fn: () => void }[] = [];
  let seqT = 0;
  let time = 0;
  let mode: 'play' | 'dying' = 'play';
  let ragdoll: Ragdoll | null = null;
  const found: string[] = [];
  let balance = 5000;
  let job: Job | undefined = (params.get('job') as Job) ?? undefined;
  let feeble = params.get('tier') === 'Feeble';
  let allergy = params.get('allergy') === '1';
  const rng = mulberry32(Date.now() & 0xffff);

  const newBody = (where = e, facing = store.entranceFacing) => {
    if (character) scene.remove(character.root);
    const file = randomFile(rng, job);
    if (feeble) file.physical = 'Feeble';
    else if (params.get('tier')) file.physical = params.get('tier') as PersonFile['physical'];
    else if (file.physical === 'Feeble') file.physical = 'Normal';
    file.peanutAllergy = allergy;
    file.policy = 1;
    body = file;
    character = new Character(randomAppearance(rng));
    scene.add(character.root);
    player.setEnabled(true);
    player.teleport(where, facing);
    player.tier = file.physical;
    player.healLegs();
    player.lock(false);
    mode = 'play';
    ui.setHud({ foundCount: found.length, balance, godAnger: 0 } as never, file);
  };

  const api: PlaceGame & Record<string, unknown> = {
    get player() {
      return player;
    },
    get body() {
      return body;
    },
    get character() {
      return character;
    },
    sound,
    particles,
    kill(id: string, style: DeathStyle) {
      if (mode !== 'play' || !character || !body) return;
      const def = GROCERY_DEATHS.find((d) => d.id === id);
      mode = 'dying';
      const ch = character;
      player.setEnabled(false);
      if (style.kind === 'ragdoll') {
        ragdoll?.dispose();
        ragdoll = new Ragdoll(physics, scene, ch, style.vel, style.spin ?? 8, style.bounce ?? 0.45);
        scene.remove(ch.root);
      } else {
        ch.root.scale.set(ch.app.height * 1.7, ch.app.height * 0.08, ch.app.height * 1.7);
        ch.root.position.y = player.feet().y + 0.02;
        ragdoll = null;
        sound.splat();
      }
      character = null;
      body = null;
      if (def && !found.includes(id)) {
        found.push(id);
        balance += def.payout;
      }
      ui.toast(def?.name.toUpperCase() ?? id, `${def?.category} · ${found.length}/${GROCERY_DEATHS.length} grocery deaths`, 3000);
      (window as unknown as { dev: { lastDeath: string } }).dev.lastDeath = id;
      seq = [{ at: 4, fn: () => newBody() }];
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
    prompt: (h: string | null) => ui.prompt(h),
    input,
    get camYaw() {
      return cam.yaw;
    },
    get time() {
      return time;
    },
    get balance() {
      return balance;
    },
    spend(n: number) {
      if (balance < n) return false;
      balance -= n;
      return true;
    },
    setHueShift: (d: number) => ui.setHueShift(d),
  };

  const rt: PlaceRuntime & { debug?: unknown } = store.setup({ scene, physics, world, rng, game: api });
  newBody();

  window.addEventListener('keydown', (ev) => {
    const jobs: (Job | undefined)[] = [undefined, 'Butcher', 'Stocker', 'Cashier', 'Deli Clerk', 'Produce Manager', 'Store Manager'];
    const n = Number(ev.key);
    if (ev.key >= '1' && ev.key <= '7') {
      job = jobs[n - 1];
      newBody(player.feet(), player.facing);
      ui.toast('NEW BODY', job ?? 'random job', 1200);
    } else if (ev.key === '8') {
      feeble = !feeble;
      newBody(player.feet(), player.facing);
      ui.toast(feeble ? 'FEEBLE' : 'NOT FEEBLE', '', 1000);
    } else if (ev.key === '9') {
      allergy = !allergy;
      if (body) body.peanutAllergy = allergy;
      ui.toast(allergy ? 'PEANUT ALLERGY ON' : 'NO ALLERGY', '', 1000);
    } else if (ev.key === '0') newBody();
  });

  const latched = { jump: false, crouch: false, dive: false };
  let acc = 0;
  let last = performance.now();
  const dev = {
    api,
    store,
    rt,
    lastDeath: '',
    get mode() {
      return mode;
    },
    /** Teleport to a local store position. */
    go(x: number, y: number, z: number, facing = 0) {
      player.teleport(store.frame.toWorld(x, y, z), facing + store.frame.yaw);
    },
    local() {
      return store.frame.toLocal(player.feet());
    },
    setJob(j: Job | undefined, opts: { feeble?: boolean; allergy?: boolean } = {}) {
      job = j;
      feeble = !!opts.feeble;
      allergy = !!opts.allergy;
      newBody(player.feet(), player.facing);
    },
    press(id: string) {
      rt.interact(`groc:${id}`);
    },
    prompts() {
      return rt.interactables.filter((i) => i.enabled).map((i) => i.id + ': ' + i.prompt);
    },
    found,
    camera: cam,
  };
  (window as unknown as { dev: typeof dev }).dev = dev;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    input.poll();
    time += dt;
    seqT += dt;
    while (seq.length && seq[0].at <= seqT) seq.shift()!.fn();
    cam.zoom(input.wheel);
    const lookDX = input.mouseDX * 0.0032 + input.lookX * dt * 2.6;
    const lookDY = input.mouseDY * 0.0032 + input.lookY * dt * 2;
    if (input.pressed('jump')) latched.jump = true;
    if (input.pressed('crouch')) latched.crouch = true;
    if (input.pressed('dive')) latched.dive = true;
    acc += dt;
    const h = 1 / 60;
    let first = true;
    let steps = 0;
    while (acc >= h && steps < 5) {
      if (mode === 'play' && character)
        player.update(h, {
          moveX: input.moveX,
          moveY: input.moveY,
          camYaw: cam.yaw,
          jumpPressed: first && latched.jump,
          jumpHeld: input.held('jump'),
          crouchHeld: input.held('crouch'),
          crouchPressed: first && latched.crouch,
          divePressed: first && latched.dive,
          sprint: input.sprint,
          faceYaw: input.rmb || cam.firstPerson ? cam.forwardFacing : null,
        });
      rt.step(h);
      physics.step();
      if (mode === 'play') rt.checkHazards(h);
      acc -= h;
      if (first) Object.assign(latched, { jump: false, crouch: false, dive: false });
      first = false;
      steps++;
    }
    if (steps === 5) acc = 0;
    ragdoll?.update();
    rt.update(dt, time);
    particles.update(dt);

    if (mode === 'play' && character) {
      const feet = player.feet();
      character.root.position.copy(feet);
      character.root.rotation.y = player.facing;
      character.animate(dt, { speed: player.horizSpeed(), grounded: player.grounded, state: player.state, stateTime: player.stateTime, airTime: player.airTime });
      let best: { id: string; prompt: string } | null = null;
      let bd = Infinity;
      if (player.state !== 'locked')
        for (const it of rt.interactables ?? []) {
          if (!it.enabled) continue;
          const d = Math.hypot(it.pos.x - feet.x, it.pos.z - feet.z);
          if (d < it.radius && Math.abs(it.pos.y - feet.y) < 2.5 && d < bd) {
            bd = d;
            best = it;
          }
        }
      ui.prompt(best ? `<span class="key">E</span>${best.prompt}` : null);
      if (best && input.pressed('interact')) rt.interact(best.id);
      cam.update(dt, feet.clone().add(new THREE.Vector3(0, 1.6, 0)), lookDX, lookDY, feet.clone().add(new THREE.Vector3(0, 1.65, 0)));
      character.root.visible = !cam.firstPerson;
    } else {
      ui.prompt(null);
      const target = ragdoll ? ragdoll.position() : player.position();
      target.y += 1;
      cam.update(dt, target, lookDX + dt * 0.25, lookDY);
    }
    const focus = player.position();
    sun.position.set(focus.x + 30, focus.y + 60, focus.z + 20);
    sun.target.position.copy(focus);
    post.render();
    input.endFrame();
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:10px;left:10px">Failed to start: ${String(err)}</pre>`);
});
