import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PostFX, warmLighting, pickQuality } from '../render/post';
import { mulberry32 } from '../util';
import { buildCar, carSpec, CAR_KINDS, type CarKind } from './carModel';
import { HANDLING } from './handling';

/**
 * Showroom for the voxel cars (open /cars.html on the dev server). ?still=1 renders on request
 * for headless screenshots; window.dev.view(kind | 'all') frames the camera.
 */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8d4f5);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 400);
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a5a3a, 1.2);
const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 150 });
sun.position.set(30, 50, 25);
scene.add(hemi, sun, sun.target);
warmLighting(scene, renderer, { sun, hemi });

const ground = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 200), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 1 }));
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

const rng = mulberry32(7);
const spots = new Map<CarKind, THREE.Vector3>();
CAR_KINDS.forEach((kind, i) => {
  const m = buildCar(rng, kind);
  const s = carSpec(kind);
  const x = (i - (CAR_KINDS.length - 1) / 2) * 6.5;
  m.root.position.set(x, s.ride, 0);
  m.root.rotation.y = 0.5;
  m.root.traverse((o) => (o.castShadow = o.castShadow));
  scene.add(m.root);
  // Wheels resting on the road.
  m.wheelSteer.forEach((w, j) => {
    w.position.y = -s.ride + s.wheelR;
    if (j < 2) w.rotation.y = -0.25;
  });
  spots.set(kind, new THREE.Vector3(x, s.half.y, 0));
});

const controls = new OrbitControls(camera, renderer.domElement);
function view(k: CarKind | 'all' | 'front', ang = 0.72) {
  if (k === 'all') {
    camera.position.set(0, 16, 46);
    controls.target.set(0, 1, 0);
  } else if (k === 'front') {
    camera.position.set(-6, 4, 26);
    controls.target.set(0, 1, 0);
  } else {
    const p = spots.get(k)!;
    const s = carSpec(k);
    const d = 4 + s.half.z * 1.6;
    camera.position.set(p.x + Math.sin(ang + 0.5) * d * 1.13, p.y + d * 0.45, p.z + Math.cos(ang + 0.5) * d * 1.13);
    controls.target.copy(p);
  }
  controls.update();
}
view('all');
const post = new PostFX(renderer, scene, camera, pickQuality());

const hud = document.getElementById('hud')!;
hud.innerHTML =
  '<b>Car showroom</b> · every model is drawn in code<br>' +
  ['all', ...CAR_KINDS].map((k) => `<button data-k="${k}">${k === 'all' ? 'all' : HANDLING[k as CarKind].name}</button>`).join('');
hud.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => view(b.dataset.k as CarKind)));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
});
const still = new URLSearchParams(location.search).has('still');
if (!still) renderer.setAnimationLoop(() => post.render());
(window as unknown as { dev: unknown }).dev = { view, render: () => post.render(), camera, controls };
