import * as THREE from 'three';
import { RAPIER } from '../src/physics';
import { VoxelWorld } from '../src/voxel';
import { mulberry32 } from '../src/util';
import { CITY_MAP } from '../src/maps/city';
import { Player } from '../src/player';
import { Particles } from '../src/particles';
import { Sound } from '../src/audio';
import { Character, randomAppearance } from '../src/character';
import { randomFile } from '../src/deaths';
import { LifeSystem } from '../src/life';

async function main() {
  await RAPIER.init();
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3ff);
  scene.fog = new THREE.Fog(0x9fd3ff, 200, 700);
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a5a3a, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.0);
  sun.position.set(100, 200, 60);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 1500);
  const physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const t0 = performance.now();
  const { x, y, z } = CITY_MAP.size;
  const world = new VoxelWorld(x, y, z);
  const build = CITY_MAP.build(world, mulberry32(1));
  const t1 = performance.now();
  world.build(scene, physics);
  const t2 = performance.now();
  const player = new Player(physics, build.spawn);
  const particles = new Particles(scene);
  const sound = new Sound();
  const kills: string[] = [];
  const log: string[] = [];
  let seq: { at: number; fn: () => void }[] = [];
  let seqT = 0;
  const held = new Set<string>();
  const api: any = {
    player, body: null, character: null, sound, particles,
    kill: (id: string) => { if (!api.body) return; kills.push(id); log.push('KILL ' + id); api.body = null; api.character = null; },
    runSeq: (s: any[]) => { seq = s.slice().sort((a, b) => a.at - b.at); seqT = 0; },
    toast: (a: string, b: string) => log.push('toast ' + a + ': ' + b), say: (a: string, b: string) => log.push('say ' + a + ': ' + b), shake: () => {}, flash: () => {}, prompt: () => {},
    input: { held: (b: string) => held.has(b), pressed: () => false }, camYaw: 0, time: 0, balance: 1000, spend: (n: number) => { api.balance -= n; return true; }, setHueShift: () => {},
  };
  const rng = mulberry32(5);
  (window as any).possess = (job?: string, tier?: string) => {
    const f = randomFile(rng, job as any);
    if (job) (f as any).job = job;
    const ch = new Character(randomAppearance(rng));
    scene.add(ch.root);
    api.body = f; api.character = ch;
    player.tier = (tier ?? 'Normal') as any;
    player.lock(false);
    return f.name;
  };
  (window as any).tp = (x: number, y: number, z: number) => player.teleport(new THREE.Vector3(x, y, z), 0);
  (window as any).feet = () => { const f = player.feet(); return [f.x, f.y, f.z].map((v) => +v.toFixed(2)); };
  (window as any).kills = kills;
  (window as any).log = log;
  (window as any).held = held;
  (window as any).api = api;
  (window as any).near = () => (rt.interactables ?? []).filter((i: any) => i.enabled && Math.hypot(i.pos.x - player.feet().x, i.pos.z - player.feet().z) < i.radius && Math.abs(i.pos.y - player.feet().y) < 2.5).map((i: any) => i.id);
  (window as any).E = (id: string) => rt.interact?.(id);
  (window as any).move = { x: 0, y: 0, jump: false };
  const rt = build.setup!({ scene, physics, world, rng: mulberry32(2), game: api });
  // Place every streamed kit building now unless ?stream is given.
  if (!new URLSearchParams(location.search).has('stream')) (globalThis as any).cityScenery?.kit.flush();
  (window as any).kit = (globalThis as any).cityScenery?.kit;
  let life: LifeSystem | null = null;
  if (new URLSearchParams(location.search).has('life')) {
    const tl = performance.now();
    life = new LifeSystem(scene, build.life as any, {});
    life.populate();
    (window as any).lifeMs = performance.now() - tl;
    (window as any).life = life;
  }
  const t3 = performance.now();
  (window as any).timing = { build: t1 - t0, mesh: t2 - t1, setup: t3 - t2 };
  (window as any).cam = camera;
  (window as any).rt = rt;
  let t = 0;
  const view = new URLSearchParams(location.search);
  const cx = +(view.get('x') ?? 250), cy = +(view.get('y') ?? 160), cz = +(view.get('z') ?? 700);
  const lx = +(view.get('lx') ?? 250), ly = +(view.get('ly') ?? 0), lz = +(view.get('lz') ?? 300);
  camera.position.set(cx, cy, cz);
  camera.lookAt(lx, ly, lz);
  let gameT = 0;
  const tick = () => {
    const h = 1 / 60;
    gameT += h;
    api.time = gameT;
    seqT += h;
    while (seq.length && seq[0].at <= seqT) seq.shift()!.fn();
    rt.update?.(h, gameT);
    life?.update(h, { camera });
    const mv = (window as any).move;
    if (api.body) player.update(h, { moveX: mv.x, moveY: mv.y, camYaw: 0, jumpPressed: mv.jump, jumpHeld: held.has('jump'), crouchHeld: false, crouchPressed: false, divePressed: false });
    mv.jump = false;
    rt.step?.(h);
    physics.step();
    if (api.body) {
      rt.checkHazards?.(h);
      if (api.character) api.character.root.position.copy(player.feet());
    }
  };
  (window as any).run = (sec: number) => { for (let i = 0; i < sec * 60; i++) tick(); };
  const frame = () => {
    if (!(window as any).paused) tick();
    if ((window as any).follow && api.body) { const f = player.feet(); camera.position.set(f.x + 8, f.y + 6, f.z + 10); camera.lookAt(f); }
    renderer.render(scene, camera);
    (document.getElementById('info') as HTMLElement).textContent = JSON.stringify((window as any).timing) + ' calls ' + renderer.info.render.calls + ' tris ' + renderer.info.render.triangles;
    requestAnimationFrame(frame);
  };
  frame();
  player.hooks = { onLand: (e) => { log.push('land ' + e.drop.toFixed(1)); rt.onLand?.(e as any); } };
  (window as any).ready = true;
}
main().catch((e) => { document.body.innerHTML = '<pre style="color:red">' + e.stack + '</pre>'; (window as any).err = String(e.stack); });
