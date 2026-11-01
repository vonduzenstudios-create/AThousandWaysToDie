import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { JOBS } from '../deaths';
import { RAPIER } from '../physics';
import { Ragdoll } from '../ragdoll';
import type { Character } from '../character';
import { mulberry32 } from '../util';
import { buildVoxelBody, type VoxelBody } from './build';
import { specForJob, type Age, type Expression, type PersonSpec } from './spec';

/**
 * Dev-only character sheet at /characters.html. Every job and age gets its own cell; drag in any
 * cell to orbit all of them together.
 *   ?seed=N           reroll deterministically
 *   ?view=hero        one big character (?job=Mechanic&spec={"hat":"none"} to override)
 */
const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed') ?? 7);
const view = params.get('view') ?? 'sheet';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const BG = new THREE.Color(0x2a2a2e);
scene.add(new THREE.HemisphereLight(0xeef2ff, 0x6a5e50, 3.0));
// One sun, moved to whichever cell is being drawn.
const sun = new THREE.DirectionalLight(0xfff4e6, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
const TARGET = new THREE.Vector3(0, 0.95, 0);
controls.target.copy(TARGET);
camera.position.set(1.6, 1.8, 5.2);
controls.enablePan = false;

interface Cell {
  vb: VoxelBody;
  holder: THREE.Group;
  label: string;
  spec: PersonSpec;
}
let cells: Cell[] = [];
let ragdolls: Ragdoll[] = [];
let spin = false;
let physics: RAPIER.World | null = null;
const SPACING = 12;

/** Each cell gets a floor, a light and a person, far enough apart that they never see each other. */
function addCell(spec: PersonSpec, label: string) {
  const i = cells.length;
  const holder = new THREE.Group();
  holder.position.set(i * SPACING, 0, 0);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 6), new THREE.MeshLambertMaterial({ color: 0x3a3a40 }));
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  holder.add(floor);
  const vb = buildVoxelBody(spec);
  holder.add(vb.body);
  scene.add(holder);
  cells.push({ vb, holder, label, spec });
}

function clearAll() {
  for (const r of ragdolls) r.dispose();
  ragdolls = [];
  for (const c of cells) {
    scene.remove(c.holder);
    c.vb.dispose();
  }
  cells = [];
}

function build() {
  clearAll();
  const rng = mulberry32(seed);
  if (view === 'hero') {
    const job = (params.get('job') as never) ?? 'Farmhand';
    const spec = specForJob(job, rng);
    // With no overrides, recreate the reference farmer as closely as we can.
    if (!params.get('job'))
      Object.assign(spec, { hat: 'straw', held: 'none', top: 0xe8ecf2, accent: 0x2f4f9a, bottoms: 0x2f4f9a, shoes: 0x1a1a1e, hairStyle: 'short', hair: 0x1c1410, skin: 0xf9d9bd, facial: 'none', glasses: 'none', build: 'average' });
    Object.assign(spec, JSON.parse(params.get('spec') ?? '{}'));
    addCell(spec, spec.job);
  } else {
    const jobs = [...new Set<string>([...JOBS, 'Cop', 'Construction Worker'])];
    for (const job of jobs) addCell(specForJob(job, rng), job);
    const ages: Age[] = ['child', 'teen', 'adult', 'elder'];
    for (const age of ages) addCell(specForJob('Townie', rng, age), `Townie (${age})`);
  }
  layoutLabels();
}

if (view !== 'hero') document.getElementById('hint')?.remove();
const labelBox = document.createElement('div');
document.body.appendChild(labelBox);
function grid() {
  const n = cells.length;
  const cols = n === 1 ? 1 : innerWidth > innerHeight ? 6 : 3;
  const rows = Math.ceil(n / cols);
  const top = 50;
  return { cols, rows, w: innerWidth / cols, h: (innerHeight - top) / rows, top };
}
function layoutLabels() {
  const g = grid();
  labelBox.innerHTML = '';
  cells.forEach((c, i) => {
    const d = document.createElement('div');
    d.textContent = c.label;
    Object.assign(d.style, {
      position: 'fixed', left: `${(i % g.cols) * g.w}px`, top: `${g.top + Math.floor(i / g.cols) * g.h + g.h - 26}px`,
      width: `${g.w}px`, textAlign: 'center', pointerEvents: 'none', color: '#ccc', fontWeight: '600',
    });
    labelBox.appendChild(d);
  });
}

const EXPRESSIONS: Expression[] = ['normal', 'blink', 'happy', 'shock', 'sick', 'dead'];
let exprI = 0;
function button(text: string, fn: () => void) {
  const b = document.createElement('button');
  b.textContent = text;
  b.onclick = fn;
  document.getElementById('bar')!.appendChild(b);
}
button('Reroll', () => {
  seed = Math.floor(Math.random() * 1e6);
  build();
});
button('Expression', () => {
  exprI = (exprI + 1) % EXPRESSIONS.length;
  for (const c of cells) c.vb.setExpression(EXPRESSIONS[exprI]);
});
button('Spin', () => (spin = !spin));
button('Ragdoll everyone', async () => {
  if (!physics) {
    await RAPIER.init();
    physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
  }
  for (const c of cells) {
    if (!c.vb.body.parent) continue;
    c.holder.updateMatrixWorld(true);
    physics.createCollider(RAPIER.ColliderDesc.cuboid(3, 0.5, 3).setTranslation(c.holder.position.x, -0.5, 0));
    for (const [x, z] of [[-3, 0], [3, 0], [0, -3], [0, 3]])
      physics.createCollider(RAPIER.ColliderDesc.cuboid(x ? 0.1 : 3, 3, z ? 0.1 : 3).setTranslation(c.holder.position.x + x, 1.5, z));
    // Ragdoll only reads root, parts and dispose, which a VoxelBody provides.
    const fake = { root: c.holder, parts: c.vb.parts, dispose: () => {} } as unknown as Character;
    const v = new THREE.Vector3((Math.random() - 0.5) * 3, 8 + Math.random() * 4, (Math.random() - 0.5) * 3);
    ragdolls.push(new Ragdoll(physics, scene, fake, v, 10, 0.55));
    c.vb.setExpression('dead');
  }
});

const clock = new THREE.Clock();
const offset = new THREE.Vector3();
let t = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  t += dt;
  if (physics && ragdolls.length) {
    physics.timestep = dt;
    physics.step();
    for (const r of ragdolls) r.update();
  }
  if (spin) for (const c of cells) c.vb.body.rotation.y += dt * 0.8;
  controls.update();
  offset.copy(camera.position).sub(TARGET);
  const g = grid();
  renderer.setScissor(0, 0, innerWidth, innerHeight);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.setClearColor(0x1e1e22);
  renderer.clear();
  const saved = camera.position.clone();
  cells.forEach((c, i) => {
    const x = (i % g.cols) * g.w;
    const y = innerHeight - g.top - (Math.floor(i / g.cols) + 1) * g.h;
    renderer.setViewport(x + 2, y + 2, g.w - 4, g.h - 4);
    renderer.setScissor(x + 2, y + 2, g.w - 4, g.h - 4);
    renderer.setClearColor(BG);
    renderer.clear();
    camera.aspect = (g.w - 4) / (g.h - 4);
    camera.updateProjectionMatrix();
    sun.position.copy(c.holder.position).add(new THREE.Vector3(2, 7, 7));
    sun.target.position.copy(c.holder.position);
    sun.target.updateMatrixWorld();
    const center = c.holder.position.clone().add(TARGET);
    camera.position.copy(center).add(offset);
    camera.lookAt(center);
    renderer.render(scene, camera);
  });
  camera.position.copy(saved);
  camera.lookAt(TARGET);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  layoutLabels();
});
build();
Object.assign(window, { __ready: true, __cells: () => cells });
