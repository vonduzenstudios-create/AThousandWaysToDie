/** Dev preview of the skydive models (open /dev/sky.html). window.dev.cam(pos, look) for screenshots. */
import * as THREE from 'three';
import { Character } from '../src/character';
import { jumpPlaneModel, canopyModel, laundryModel, rigModel, teddyModel, cloudModel, pilotChuteModel, CANOPY_RENTAL, CANOPY_RESERVE } from '../src/places/airport/skymodels';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc4f0);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a5a3a, 1.5));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
sun.position.set(20, 40, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x9a9a92 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const plane = jumpPlaneModel();
scene.add(plane.root);
const jumper = (pose: string, x: number, z: number, rig: 'rental' | 'bargain' | 'teddy') => {
  const ch = Character.fromFile({ job: 'Accountant', age: 34 }, 7 + x);
  ch.root.position.set(x, 0, z);
  ch.spinner.add(rigModel(rig));
  scene.add(ch.root);
  return { ch, pose };
};
const people = [jumper('freefall', -6, 16, 'rental'), jumper('canopy', 2, 16, 'rental'), jumper('canopy', 10, 16, 'bargain'), jumper('ground', 16, 16, 'teddy')];
people[0].ch.root.position.y = 1.5;
const c1 = canopyModel(CANOPY_RENTAL);
c1.position.copy(people[1].ch.root.position);
scene.add(c1);
const c2 = laundryModel();
c2.position.copy(people[2].ch.root.position);
scene.add(c2);
const c3 = canopyModel(CANOPY_RESERVE);
c3.position.set(-14, 0, 16);
scene.add(c3);
const pc = pilotChuteModel();
pc.position.set(-6, 6, 16);
scene.add(pc);
const ted = teddyModel();
ted.position.set(22, 0.85, 16);
scene.add(ted);
const cl = cloudModel(3);
cl.position.set(0, 0, -40);
scene.add(cl);

let camPos = new THREE.Vector3(-14, 9, 22), look = new THREE.Vector3(0, 2, 0);
(window as any).dev = { cam(p: number[], l: number[]) { camPos = new THREE.Vector3(...p); look = new THREE.Vector3(...l); }, plane, scene };
const loop = () => {
  requestAnimationFrame(loop);
  for (const p of people) p.ch.animate(1 / 60, { speed: 0, grounded: p.pose === 'ground', state: p.pose === 'ground' ? 'ground' : 'fall', stateTime: 1, airTime: 1, pose: p.pose === 'ground' ? null : (p.pose as 'freefall') });
  plane.prop.rotation.x += 0.05;
  camera.position.copy(camPos);
  camera.lookAt(look);
  renderer.render(scene, camera);
};
loop();
