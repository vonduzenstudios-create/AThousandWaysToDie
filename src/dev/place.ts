/**
 * Dev-only preview for a single place (open /place.html?map=airport).
 * Implements just enough of GameApi to walk around a MapDef, pick a body's job and
 * health, and trigger its deaths. The real game loads maps through its own loader.
 */
import * as THREE from 'three';
import { RAPIER } from '../physics';
import { Sound } from '../audio';
import { FollowCam } from '../camera';
import { Character } from '../character';
import { DEATH_BY_ID, JOBS, randomFile, type DeathDef, type PersonFile } from '../deaths';
import { Input } from '../input';
import { Particles } from '../particles';
import { Player } from '../player';
import { Ragdoll } from '../ragdoll';
import { UI } from '../ui';
import { VoxelWorld } from '../voxel';
import { mulberry32 } from '../util';
import type { DeathStyle, GameApi, MapDef, MapRuntime } from '../maps/types';
import { airportMap } from '../places/airport';
import { CITY_MAP } from '../maps/city';
import { BEACH } from '../maps/beach';

const MAPS: Record<string, MapDef> = { airport: airportMap, city: CITY_MAP, beach: BEACH };

async function boot() {
  await RAPIER.init();
  const params = new URLSearchParams(location.search);
  const def = MAPS[params.get('map') ?? 'airport'] ?? airportMap;
  const extraDeaths: Record<string, DeathDef> = Object.fromEntries((def.deaths ?? []).map((d) => [d.id, d]));

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3ff);
  scene.fog = new THREE.Fog(0x9fd3ff, 120, 420);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 900);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a5a3a, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 260 });
  scene.add(sun, sun.target);

  const physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const world = new VoxelWorld(def.size.x, def.size.y, def.size.z);
  const rng = mulberry32(1234);
  const build = def.build(world, rng);
  world.build(scene, physics);

  const ui = new UI();
  document.head.insertAdjacentHTML('beforeend', '<style>.title{display:none!important}</style>');
  let camOverride: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  const sound = new Sound();
  ui.blip = () => sound.blip(0.6);
  const particles = new Particles(scene);
  const input = new Input(canvas);
  input.onAnyGesture = () => sound.init();
  const cam = new FollowCam(camera, physics);
  const player = new Player(physics, build.spawn);
  const ragdolls: Ragdoll[] = [];
  let character: Character | null = null;
  let body: PersonFile | null = null;
  let mode: 'play' | 'dying' = 'play';
  let balance = 5000;
  let time = 0;
  let timeScale = 1;
  let seq: { at: number; fn: () => void }[] = [];
  let seqT = 0;
  let promptHtml: string | null = null;
  let hue = 0;
  const found = new Set<string>();

  const spawnBody = (jobName: string, physical: PersonFile['physical'], at?: THREE.Vector3) => {
    const file = randomFile(mulberry32(Math.floor(Math.random() * 1e9)), jobName as PersonFile['job']);
    file.job = jobName as PersonFile['job'];
    file.physical = physical;
    if (character) scene.remove(character.root);
    character = Character.fromFile(file);
    body = file;
    scene.add(character.root);
    player.setEnabled(true);
    player.teleport(at ?? player.feet(), player.facing);
    player.tier = file.physical;
    player.healLegs();
    player.lock(false);
    mode = 'play';
    timeScale = 1;
    ui.setHueShift(0);
    ui.toast(file.name.toUpperCase(), `${file.age} · ${file.job} · ${file.physical}`, 1800);
  };

  const api: GameApi = {
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
      const def = extraDeaths[id] ?? DEATH_BY_ID[id];
      mode = 'dying';
      timeScale = 0.4;
      player.setEnabled(false);
      const ch = character;
      if (style.kind === 'pancake' || style.kind === 'cube') {
        ch.root.scale.set(1.7, 0.08, 1.7);
        ch.root.position.y = player.feet().y + 0.02;
        sound.splat();
      } else {
        const rd = new Ragdoll(physics, scene, ch, style.vel, style.spin ?? 8, style.bounce ?? 0.45);
        scene.remove(ch.root);
        ragdolls.push(rd);
        if (ragdolls.length > 6) ragdolls.shift()!.dispose();
      }
      character = null;
      const first = !found.has(id);
      found.add(id);
      (window as unknown as { lastDeath: string }).lastDeath = id;
      setTimeout(() => {
        timeScale = 1;
        ui.setHueShift(0);
        ui.toast(def ? `${first ? 'NEW: ' : ''}${def.name}` : id, def ? `${def.blurb} · $${def.payout}` : 'unknown death id', 4000);
        sound.cash();
      }, 1400);
      setTimeout(() => {
        if (mode === 'dying') respawn();
      }, 5000);
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
      return balance;
    },
    spend(amount, label) {
      if (balance < amount) {
        ui.toast("CAN'T AFFORD IT", `${label} costs $${amount}.`, 1800);
        return false;
      }
      balance -= amount;
      return true;
    },
    setHueShift(deg) {
      hue = deg;
      ui.setHueShift(deg);
    },
  };

  const rt: MapRuntime = build.setup?.({ scene, physics, world, rng, game: api }) ?? { dispose() {} };
  player.hooks = {
    onJump: (_k, chain) => sound.jump(chain),
    onLand: (e) => {
      if (mode !== 'play') return;
      if (rt.onLand?.({ drop: e.drop, launchPos: e.launchPos, launchState: e.launchState, landState: e.landState })) return;
      sound.land(Math.min(e.drop / 12, 1));
      const fatal = player.tier === 'Feeble' ? 7 : player.tier === 'Athlete' ? 11 : 9;
      if (e.drop >= fatal) api.kill('faceplant', { kind: 'ragdoll', vel: player.vel.clone().setY(8), spin: 10, bounce: 0.5 });
    },
  };

  // ---- Dev panel: pick job and health, teleport to spots.
  const jobs = params.get('job') ?? 'Pilot';
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:8px;right:8px;z-index:50;background:#000a;color:#fff;font:12px sans-serif;padding:8px;border-radius:6px;display:flex;flex-direction:column;gap:4px;max-width:220px';
  panel.innerHTML = `<b>${def.name} preview</b>
    <select id="dj">${[...JOBS].map((j) => `<option ${j === jobs ? 'selected' : ''}>${j}</option>`).join('')}</select>
    <select id="dp"><option>Feeble</option><option selected>Normal</option><option>Athlete</option></select>
    <button id="db">New body here</button>
    <select id="dt"><option value="">Teleport...</option>${Object.keys(build.areas)
      .map((k) => `<option>${k}</option>`)
      .join('')}</select>
    <div id="dinfo"></div>`;
  document.body.appendChild(panel);
  const $ = (id: string) => panel.querySelector('#' + id) as HTMLSelectElement;
  const respawn = () => spawnBody($('dj').value, $('dp').value as PersonFile['physical']);
  $('db').onclick = () => respawn();
  $('dt').onchange = () => {
    const a = build.areas[$('dt').value];
    if (a) {
      const c = a.min.clone().add(a.max).multiplyScalar(0.5);
      c.y = a.min.y + 0.5;
      player.teleport(c);
    }
    $('dt').value = '';
  };
  (window as unknown as { dev: unknown }).dev = {
    api,
    player,
    rt,
    spawnBody,
    get mode() {
      return mode;
    },
    found,
    build,
    world,
    def,
    THREE,
    camObj: cam,
    /** Park the camera somewhere for screenshots (null to release). */
    cam(pos: number[] | null, look?: number[]) {
      camOverride = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...(look ?? [0, 0, 0])) } : null;
    },
  };

  spawnBody(jobs, (params.get('physical') as PersonFile['physical']) ?? 'Normal', build.spawn);
  ui.hideHelp?.();

  let last = performance.now();
  let acc = 0;
  const latched = { jump: false, crouch: false, dive: false };
  const frame = () => {
    requestAnimationFrame(frame);
    const now = performance.now();
    const realDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    input.poll();
    const dt = realDt * timeScale;
    time += dt;
    // Sequences.
    if (seq.length) {
      seqT += realDt;
      while (seq.length && seq[0].at <= seqT) seq.shift()!.fn();
    }
    if (input.pressed('jump')) latched.jump = true;
    if (input.pressed('crouch')) latched.crouch = true;
    if (input.pressed('dive')) latched.dive = true;
    acc += dt;
    const h = 1 / 60;
    let steps = 0;
    while (acc >= h && steps < 5) {
      if (mode === 'play' && character)
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
          faceYaw: input.rmb ? cam.forwardFacing : null,
        });
      // Same order as src/places/types.ts documents: after the player moves, before physics.
      rt.step?.(h);
      physics.step();
      if (mode === 'play') {
        rt.checkHazards?.(h);
        const p = player.position();
        if (p.y < -20) api.kill('faceplant', { kind: 'ragdoll', vel: player.vel.clone(), spin: 4 });
      }
      if (steps === 0) Object.assign(latched, { jump: false, crouch: false, dive: false });
      acc -= h;
      steps++;
    }
    if (steps === 5) acc = 0;
    for (const r of ragdolls) r.update();
    particles.update(dt);
    rt.update?.(dt, time);
    promptHtml = null;

    const look = (input.mouseDX || 0) * 0.0032 + input.lookX * realDt * 2.6;
    const lookY = (input.mouseDY || 0) * 0.0032 + input.lookY * realDt * 2;
    cam.zoom(input.wheel);
    if (mode === 'play' && character) {
      const feet = player.feet();
      character.root.position.copy(feet);
      character.root.rotation.y = player.facing;
      character.animate(realDt, { speed: player.horizSpeed(), grounded: player.grounded, state: player.state, stateTime: player.stateTime, airTime: player.airTime });
      // Interactables (closest in range).
      let best: { id: string; prompt: string } | null = null;
      let bd = Infinity;
      for (const it of rt.interactables ?? []) {
        if (!it.enabled) continue;
        const d = Math.hypot(it.pos.x - feet.x, it.pos.z - feet.z);
        if (d < it.radius && Math.abs(it.pos.y - feet.y) < 2.5 && d < bd) {
          bd = d;
          best = it;
        }
      }
      if (best) {
        ui.prompt(`<span class="key">E</span>${best.prompt}`);
        if (input.pressed('interact') && player.state !== 'locked') rt.interact?.(best.id);
      } else ui.prompt(promptHtml);
      cam.update(realDt, feet.clone().add(new THREE.Vector3(0, 1.6, 0)), look, lookY, feet.clone().add(new THREE.Vector3(0, 1.65, 0)));
    } else {
      const t = ragdolls.length ? ragdolls[ragdolls.length - 1].position() : player.position();
      cam.update(realDt, t.add(new THREE.Vector3(0, 1, 0)), look + realDt * 0.25, lookY);
    }
    if (camOverride) {
      camera.position.copy(camOverride.pos);
      camera.lookAt(camOverride.look);
    }
    const focus = player.position();
    sun.position.set(focus.x + 30, focus.y + 70, focus.z + 20);
    sun.target.position.copy(focus);
    const dinfo = panel.querySelector('#dinfo') as HTMLElement;
    dinfo.textContent = `$${balance.toFixed(2)} · ${body?.job ?? '-'} · found ${found.size}/${def.deaths?.length ?? 0} · ${mode} · hue ${hue}`;
    renderer.render(scene, camera);
    input.endFrame();
  };
  frame();
  void Character;
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:10px;left:10px">Failed to start: ${String(e)}</pre>`);
});
