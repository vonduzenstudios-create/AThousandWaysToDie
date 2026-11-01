import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { StreetKit, PAL } from './index';
import { PostFX, warmLighting, pickQuality, saveQuality, type Quality } from '../render/post';

/**
 * Showcase street for the building kit (open /buildings.html on the dev server).
 * window.dev exposes the kit, stats and camera presets for headless screenshots.
 */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const skyCol = new THREE.Color(0xa8d4f5);
scene.background = skyCol;
scene.fog = new THREE.Fog(0xcfe0ee, 90, 240);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a5a3a, 1.2);
const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 300 });
sun.position.set(48 + 60, 90, 60 + 30);
sun.target.position.set(48, 0, 60);
scene.add(hemi, sun, sun.target);
warmLighting(scene, renderer, { sun, hemi });

// Ground.
const ground = new THREE.Mesh(new THREE.BoxGeometry(400, 1, 400), new THREE.MeshStandardMaterial({ color: 0x6f9a4a, roughness: 1 }));
ground.position.set(48, -0.5, 60);
ground.receiveShadow = true;
scene.add(ground);

const kit = new StreetKit({ parent: scene });
const t0 = performance.now();

// A street running north-south with rows of buildings either side and one closing the view.
const Y = 0;
kit.street({ x0: 42, z0: -2, x1: 54, z1: 124, y: Y, kind: 'cobble', along: 'x' });
kit.street({ x0: 40, z0: -2, x1: 42, z1: 124, y: Y, kind: 'sidewalk', curb: ['e'] });
kit.street({ x0: 54, z0: -2, x1: 56, z1: 124, y: Y, kind: 'sidewalk', curb: ['w'] });
kit.street({ x0: 24, z0: 124, x1: 72, z1: 150, y: Y, kind: 'plaza' });
kit.street({ x0: 56, z0: 40, x1: 72, z1: 60, y: Y, kind: 'pavers' });

kit.row({ x: 28, z: 0, y: Y, face: 'e', length: 124, depth: 12, seed: 7, floors: [3, 5], signs: ['CAFE', 'BAKERY', 'FLOWERS', 'BOOKS', 'GELATO', 'WINE'] });
kit.row({ x: 56, z: 0, y: Y, face: 'w', length: 40, depth: 12, seed: 21, floors: [3, 5], signs: ['PHARMACY', 'CHEESE', 'TABAC'] });
kit.row({ x: 56, z: 60, y: Y, face: 'w', length: 64, depth: 12, seed: 33, floors: [2, 5], signs: ['BISTRO', 'HATS', 'TOYS', 'FISH'] });
kit.building({ x: 34, z: -14, y: Y, face: 's', w: 28, d: 12, floors: 4, seed: 99, wall: PAL.pink, ground: 'shop', sign: 'CASA DI SOLE', awning: [0xc8302c, 0xf2ece0], balconies: 1, flowerBoxes: 0.9, ivy: 0.7, roof: 'flat' });

// Other presets for map threads to see.
kit.building({ x: 80, z: 10, y: Y, face: 'w', w: 14, d: 12, floors: 2, seed: 4, preset: 'house' });
kit.building({ x: 80, z: 28, y: Y, face: 'w', w: 12, d: 10, floors: 1, seed: 5, preset: 'house' });
kit.building({ x: 80, z: 44, y: Y, face: 'w', w: 16, d: 12, floors: 3, seed: 6, preset: 'mainstreet', sign: 'HARDWARE' });
kit.building({ x: 80, z: 64, y: Y, face: 'w', w: 20, d: 16, floors: 6, seed: 8, preset: 'modern' });

// Props along the sidewalks and in the little square.
for (let z = 6; z < 120; z += 12) {
  kit.prop('lamp', 41, Y, z);
  kit.prop('lamp', 55, Y, z + 6, Math.PI);
}
for (let z = 10; z < 118; z += 9) {
  if (z % 2) kit.prop('planter', 41, Y, z + 3);
  else kit.prop('bollard', 42.4, Y, z + 3);
}
for (const [x, z] of [[59, 44], [64, 46], [68, 43], [60, 52], [66, 54]]) kit.prop('umbrellaTable', x, Y, z, Math.random());
for (const [x, z] of [[46, 116], [50, 112], [44, 104]]) kit.prop('cafeTable', x, Y, z, 0.3);
kit.prop('pottedTree', 57, Y, 41);
kit.prop('pottedTree', 57, Y, 59);
kit.prop('pottedTree', 71, Y, 41);
kit.prop('bench', 64, Y, 58.5, Math.PI);
kit.prop('crates', 54.5, Y, 30, -Math.PI / 2);
kit.prop('barrel', 54.6, Y, 33);
kit.prop('bin', 41.2, Y, 50);
kit.prop('hydrant', 54.8, Y, 70);
kit.prop('newsStand', 41.4, Y, 80, Math.PI / 2);
kit.prop('mailbox', 41.3, Y, 92, Math.PI / 2);
kit.prop('signPost', 55, Y, 100, Math.PI / 2);
for (let z = 16; z < 120; z += 18) kit.bunting(new THREE.Vector3(40, 9.5, z), new THREE.Vector3(56, 9.5, z + 4));
for (let i = 0; i < 6; i++) kit.prop('flowerPot', 36 + i * 4, Y, -1.2);
kit.finish();
const buildMs = performance.now() - t0;
let meshedMs = 0;

// Camera, controls, post.
const controls = new OrbitControls(camera, renderer.domElement);
const presets: Record<string, [number[], number[]]> = {
  street: [[48, 3.2, 70], [48, 6, 0]],
  plaza: [[71, 3.2, 37], [52, 3, 54]],
  aerial: [[110, 70, 150], [48, 0, 50]],
  houses: [[66, 4, 20], [80, 3, 30]],
  facade: [[48, 6, 14], [48, 7, -10]],
};
function view(name: string) {
  const [p, t] = presets[name];
  camera.position.set(p[0], p[1], p[2]);
  controls.target.set(t[0], t[1], t[2]);
  controls.update();
}
view('street');

let quality: Quality = pickQuality();
const post = new PostFX(renderer, scene, camera, quality);

const hud = document.getElementById('hud')!;
function drawHud() {
  const st = kit.stats();
  hud.innerHTML =
    `<b>Building kit</b> · ${st.buildings} buildings · ${(st.fullDetailTris / 1000).toFixed(0)}k tris (full detail) · ${st.propInstances} props · laid out in ${buildMs.toFixed(0)} ms, meshed by ${meshedMs ? meshedMs.toFixed(0) + ' ms' : '…'}<br>` +
    ['low', 'medium', 'high'].map((q) => `<button data-q="${q}" class="${q === quality ? 'on' : ''}">${q}</button>`).join('') +
    ' · ' +
    Object.keys(presets).map((v) => `<button data-v="${v}">${v}</button>`).join('') +
    `<br><span id="fps"></span>`;
  hud.querySelectorAll<HTMLButtonElement>('button[data-q]').forEach((b) =>
    b.addEventListener('click', () => {
      quality = b.dataset.q as Quality;
      saveQuality(quality);
      post.setQuality(quality);
      drawHud();
    }),
  );
  hud.querySelectorAll<HTMLButtonElement>('button[data-v]').forEach((b) => b.addEventListener('click', () => view(b.dataset.v!)));
}
drawHud();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
});

// ?still=1 renders only on request (headless screenshots on software GL).
const still = new URLSearchParams(location.search).has('still');
let frames = 0, last = performance.now();
if (!still) renderer.setAnimationLoop(() => {
  controls.update();
  post.render();
  frames++;
  const now = performance.now();
  if (now - last > 1000) {
    const el = document.getElementById('fps');
    if (el) el.textContent = `${frames} fps · ${renderer.info.render.calls} draw calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris drawn`;
    frames = 0;
    last = now;
  }
});

(window as unknown as { dev: unknown }).dev = {
  kit,
  view,
  render: () => {
    controls.update();
    post.render();
  },
  stats: () => ({ ...kit.stats(), buildMs: Math.round(buildMs), meshedMs: Math.round(meshedMs), calls: renderer.info.render.calls, drawnTris: renderer.info.render.triangles }),
  setQuality: (q: Quality) => {
    quality = q;
    post.setQuality(q);
    drawHud();
  },
  ready: false,
};
kit.ready().then(() => {
  meshedMs = performance.now() - t0;
  (window as unknown as { dev: { ready: boolean } }).dev.ready = true;
  drawHud();
});
