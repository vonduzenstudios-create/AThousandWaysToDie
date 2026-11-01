import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ZOO } from './index';
import { walkCycle, type Rig } from './rig';

/**
 * Dev-only animal sheet at /animals.html: every animal in the game on one stage.
 *   ?only=bear,lion   just those
 *   ?walk=1           play the walk cycle
 *   ?bg=5a8de8        background color
 */
const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(parseInt(params.get('bg') ?? '5a8de8', 16));
scene.add(new THREE.HemisphereLight(0xeef2ff, 0x5a6a90, 2.6));
const sun = new THREE.DirectionalLight(0xfff4e6, 2.2);
sun.position.set(-8, 20, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 80 });
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x6a9cf0 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const only = params.get('only')?.split(',');
const entries = Object.entries(ZOO).filter(([k]) => !only || only.includes(k));
const rigs: { rig: Rig | null; obj: THREE.Object3D }[] = [];
const cols = Math.ceil(Math.sqrt(entries.length * 1.6));
let x = 0, z = 0, rowDepth = 0, col = 0;
const rowW: number[] = [];
for (const [name, make] of entries) {
  const made = make();
  const obj = 'root' in made ? made.root : made;
  const rig = 'root' in made ? made : null;
  const box = new THREE.Box3().setFromObject(obj);
  if (!rig && box.min.y < 0) obj.position.y -= box.min.y;
  const w = box.max.x - box.min.x + 1.2, d = box.max.z - box.min.z + 1.2;
  obj.position.set(x + w / 2, obj.position.y, z);
  obj.rotation.y = Number(params.get('yaw') ?? 0.5);
  obj.name = name;
  scene.add(obj);
  rigs.push({ rig, obj });
  x += w;
  rowDepth = Math.max(rowDepth, d);
  if (++col >= cols) {
    rowW.push(x);
    col = 0;
    x = 0;
    z -= rowDepth;
    rowDepth = 0;
  }
}
rowW.push(x);
const maxW = Math.max(...rowW);
for (const r of rigs) r.obj.position.x -= maxW / 2;

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 500);
const controls = new OrbitControls(camera, renderer.domElement);
const span = Math.max(maxW, -z + 4);
controls.target.set(0, 1, z / 2);
camera.position.set(0, span * 0.75, z / 2 + span * 1.25);
if (rigs.length === 1) {
  // Frame a single animal from a 3/4 front view, like the reference renders.
  const b = new THREE.Box3().setFromObject(rigs[0].obj);
  const c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3()).length();
  controls.target.copy(c);
  camera.position.set(c.x + sz * 0.35, c.y + sz * 0.45, c.z + sz * 1.6);
}
if (params.get('cam')) {
  const [cx, cy, cz, tx, ty, tz] = params.get('cam')!.split(',').map(Number);
  camera.position.set(cx, cy, cz);
  controls.target.set(tx, ty, tz);
}
controls.update();
(window as unknown as { zoo: typeof rigs }).zoo = rigs;

let phase = 0;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  phase += dt * 6;
  if (params.get('walk')) for (const r of rigs) if (r.rig) walkCycle(r.rig, phase, 0.6);
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
