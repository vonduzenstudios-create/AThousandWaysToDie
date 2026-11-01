import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { JOBS, randomFile } from '../deaths';
import { RAPIER } from '../physics';
import { Ragdoll } from '../ragdoll';
import type { Character } from '../character';
import { mulberry32 } from '../util';
import { buildVoxelBody, type VoxelBody } from './build';
import { specForJob, specFromFile, type Age, type Expression, type PersonSpec } from './spec';

/**
 * Dev-only character sheet at /characters.html. Every job and age gets its own cell; drag in any
 * cell to orbit all of them together.
 *   ?seed=N           reroll deterministically
 *   ?view=hero        one big character (?job=Mechanic&spec={"hat":"none"} to override)
 */
const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed') ?? 7);
let view = params.get('view') ?? (location.hash === '#hero' ? 'hero' : location.hash === '#crowd' ? 'crowd' : 'sheet');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const BG = new THREE.Color(params.get('bg') ? parseInt(params.get('bg')!, 16) : 0x2a2a2e);
scene.add(new THREE.HemisphereLight(0xeef2ff, 0x6a5e50, 3.0));
// One sun, moved to whichever cell is being drawn.
const sun = new THREE.DirectionalLight(0xfff4e6, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
const face = params.get('cam') === 'face';
const TARGET = new THREE.Vector3(0, face ? 1.55 : 0.95, 0);
controls.target.copy(TARGET);
if (face) camera.position.set(0.5, 1.7, 1.9);
else camera.position.set(1.6, 1.8, 5.2);
controls.enablePan = false;

const GOLD_HEX = 0xe8b830;
const VARIANTS: Record<string, string[]> = {
  hair: ['bald', 'ring', 'short', 'spiky', 'slick', 'long', 'bun', 'pony', 'mohawk', 'curly', 'afro', 'bob', 'pigtails', 'buzz', 'combover', 'braids', 'topknot'],
  hats: ['straw', 'cap', 'capBack', 'chef', 'beanie', 'flatcap', 'headMirror', 'visor', 'police', 'hardhat', 'cowboy', 'tophat', 'bucket', 'beret', 'party', 'bow', 'bandana', 'surgical', 'fireHelmet', 'tiara', 'shako'],
  faces: ['none', 'mustache', 'beard', 'stubble', 'goatee', 'handlebar', 'chinstrap', 'soulPatch'],
  outfits: ['overalls', 'coveralls', 'mail', 'cardigan', 'hawaiian', 'suit', 'loudSuit', 'hoodie', 'labCoat', 'cook', 'clergy', 'hiVis', 'trendy', 'police', 'construction', 'tank', 'polo', 'sweaterVest', 'tracksuit', 'jacket', 'dress', 'graphicTee', 'plaid', 'stripes', 'vest', 'apron', 'scrubs', 'gown', 'robe', 'firefighter', 'swim', 'bandUniform', 'casual'],
};
const SHOWCASE: [string, string, Partial<PersonSpec>][] = [
  ['Townie', 'Rancher', { sex: 'm', outfit: 'vest', top: 0xc8ccbc, accent: 0x6a3a22, bottoms: 0x4a6a9a, hat: 'cowboy', hatColor: 0x2a2a26, extras: ['bandana'], shoes: 0x6a3a22, shoeStyle: 'boots', hairStyle: 'short', hair: 0x8a6a3a, facial: 'stubble', skin: 0xf2c4a0, build: 'average', lower: 'pants', eyes: 'tall', brows: 'thin', mouth: 'none', eyeColor: 0x4a3a8a, age: 'adult' }],
  ['Townie', 'Drum major', { sex: 'm', outfit: 'bandUniform', top: 0xb82a2a, accent: GOLD_HEX, bottoms: 0xf2f2f2, hat: 'shako', hatColor: 0x1a1a1e, shoes: 0x1a1a1e, shoeStyle: 'boots', hairStyle: 'short', hair: 0x3b2416, facial: 'handlebar', skin: 0xf9d9bd, build: 'slim', lower: 'pants', eyes: 'tall', brows: 'thick', mouth: 'smile', age: 'adult' }],
  ['Banker', 'Banker', { sex: 'm', outfit: 'suit', top: 0x22242c, accent: 0xa82a2a, bottoms: 0x22242c, hairStyle: 'slick', hair: 0x1c1410, facial: 'goatee', skin: 0xe0a97e, build: 'average', lower: 'pants', held: 'briefcase', eyes: 'tall', brows: 'thick', mouth: 'none', age: 'adult', hat: 'none' }],
  ['Townie', 'Beach regular', { sex: 'm', outfit: 'swim', bottoms: 0x2a8ac0, hairStyle: 'bald', hair: 0x6a4122, skin: 0xf2c4a0, build: 'slim', lower: 'shorts', shoeStyle: 'sandals', extras: ['bracelets'], eyes: 'small', brows: 'thin', mouth: 'none', age: 'elder', hat: 'none', facial: 'none' }],
  ['Townie', 'Yoga teacher', { sex: 'f', outfit: 'robe', top: 0xf2f0ea, accent: 0x4a1a14, hairStyle: 'long', hair: 0x1c1410, skin: 0xf2d0b0, build: 'slim', lower: 'gown', shoeStyle: 'sandals', eyes: 'tall', brows: 'thick', mouth: 'none', age: 'adult', hat: 'none', facial: 'none' }],
  ['Townie', 'Lumberjack', { sex: 'm', outfit: 'plaid', top: 0xa82a22, accent: 0xf2f2f2, bottoms: 0x1e2a4a, extras: ['suspenders'], hairStyle: 'short', hair: 0x5a2a16, facial: 'beard', skin: 0xf2c4a0, build: 'buff', lower: 'pants', shoes: 0x2a1a10, shoeStyle: 'boots', eyes: 'tall', brows: 'thick', mouth: 'none', age: 'adult', hat: 'none', held: 'axe' }],
  ['Butcher', 'Butcher', { sex: 'm', outfit: 'apron', top: 0xf4f4f0, accent: 0x7a6a5a, bottoms: 0x3a3a40, extras: ['gloves'], hairStyle: 'bald', hair: 0x17151a, facial: 'handlebar', skin: 0xf2c4a0, build: 'heavy', lower: 'pants', shoes: 0x3a2418, shoeStyle: 'shoes', eyes: 'tall', brows: 'thick', mouth: 'none', age: 'adult', hat: 'none' }],
  ['Cop', 'Cop', { sex: 'm', outfit: 'police', top: 0x3aa8e0, accent: GOLD_HEX, bottoms: 0x17151a, hat: 'police', hatColor: 0x17151a, hairStyle: 'short', hair: 0x2a1a10, facial: 'mustache', skin: 0xf2c4a0, build: 'average', lower: 'pants', shoes: 0x4a2a16, shoeStyle: 'shoes', eyes: 'tall', brows: 'thick', mouth: 'none', age: 'adult' }],
  ['Townie', 'Gala guest', { sex: 'f', outfit: 'gown', top: 0x2a8a3a, accent: 0x1a5a2a, hairStyle: 'long', hair: 0xe0b040, hat: 'tiara', skin: 0xf9d9bd, build: 'slim', lower: 'gown', eyes: 'lashes', brows: 'thin', mouth: 'none', eyeColor: 0x3a8ac0, age: 'adult', facial: 'none', extras: ['bracelets'] }],
  ['Surgeon', 'Surgeon', { sex: 'm', outfit: 'scrubs', top: 0x1e3a8a, accent: 0x3a9ad8, bottoms: 0x1e3a8a, hat: 'surgical', hatColor: 0x1e3a8a, extras: ['mask'], shoes: 0x3aa8e0, shoeStyle: 'sandals', hairStyle: 'short', hair: 0x2a1a10, skin: 0xf2c4a0, build: 'average', lower: 'pants', eyes: 'tall', brows: 'thick', age: 'adult', facial: 'none' }],
];
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
  if (params.get('pose') === 'walk') {
    // Mid-stride, like a frame of the in-game walk.
    const p = vb.parts, j = vb.joints;
    p.legL.pivot.rotation.x = -0.45;
    p.legR.pivot.rotation.x = 0.4;
    j.kneeL.rotation.x = 0.25;
    j.kneeR.rotation.x = 0.85;
    p.armL.pivot.rotation.x = 0.4;
    p.armR.pivot.rotation.x = -0.45;
    p.armL.pivot.rotation.z = 0.1;
    p.armR.pivot.rotation.z = -0.1;
    j.elbowL.rotation.x = -0.3;
    j.elbowR.rotation.x = -0.75;
    vb.body.rotation.y = 0.5;
  } else {
    vb.parts.armL.pivot.rotation.z = 0.09;
    vb.parts.armR.pivot.rotation.z = -0.09;
    vb.joints.elbowL.rotation.x = vb.joints.elbowR.rotation.x = -0.22;
  }
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
      Object.assign(spec, { hat: 'straw', held: 'none', top: 0xe8ecf2, accent: 0x2f4f9a, bottoms: 0x2f4f9a, shoes: 0x1a1a1e, hairStyle: 'short', hair: 0x1c1410, skin: 0xf9d9bd, facial: 'none', glasses: 'none', build: 'average', stature: 'normal', eyes: 'tall', brows: 'none', mouth: 'none', marks: [], extras: [], shoeStyle: 'shoes' });
    Object.assign(spec, JSON.parse(params.get('spec') ?? '{}'));
    addCell(spec, spec.job);
  } else if (view === 'showcase') {
    // Original townsfolk that show off the detail level: one of each kind of outfit layer.
    for (const [job, label, over] of SHOWCASE) {
      const spec = specForJob(job, mulberry32(seed + label.length * 101));
      Object.assign(spec, { marks: [], extras: [], glasses: 'none', held: 'none', expression: 'normal', stature: 'normal' }, over);
      addCell(spec, label);
    }
  } else if (view === 'hair' || view === 'hats' || view === 'faces' || view === 'outfits') {
    // Every option of one kind on the same person, for checking the art.
    const key = { hair: 'hairStyle', hats: 'hat', faces: 'facial', outfits: 'outfit' }[view] as keyof PersonSpec;
    const values = VARIANTS[view];
    for (const v of values) {
      const spec = specForJob('Townie', mulberry32(seed));
      Object.assign(spec, { hat: 'none', hairStyle: 'short', facial: 'none', glasses: 'none', held: 'none', marks: [], extras: [], age: 'adult', build: 'average', stature: 'normal', lower: 'pants' });
      Object.assign(spec, { [key]: v });
      if (v === 'gown' || v === 'robe') spec.lower = 'gown';
      if (v === 'swim') spec.lower = 'shorts';
      addCell(spec, String(v));
    }
  } else if (view === 'crowd') {
    // Random victims, built from the same kind of file the game rolls, stats and all.
    const jobs = [...JOBS, 'Townie', 'Townie', 'Townie', 'Townie'];
    for (let i = 0; i < 36; i++) {
      let job = jobs[Math.floor(rng() * jobs.length)];
      const age = job === 'Teen' ? 14 + Math.floor(rng() * 5) : job === 'Retiree' ? 66 + Math.floor(rng() * 25) : job === 'Townie' ? 6 + Math.floor(rng() * 86) : 22 + Math.floor(rng() * 45);
      if (age < 13) job = 'Townie';
      const physical = age > 70 ? 'Feeble' : rng() < 0.25 ? 'Athlete' : rng() < 0.1 ? 'Feeble' : 'Normal';
      const mental = rng() < 0.2 ? 'Depressed' : rng() < 0.2 ? 'Medicated' : 'Normal';
      const file = randomFile(rng, job as never);
      const spec = specFromFile({ ...file, job, age, physical, mental }, Math.floor(rng() * 1e9));
      const stat = [physical, mental].filter((x) => x !== 'Normal').join(', ');
      addCell(spec, `${file.name.split(' ')[0]}, ${job}, ${age}${stat ? ' · ' + stat : ''}`);
    }
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
  const cols = n === 1 ? 1 : n === 10 && innerWidth > innerHeight ? 5 : innerWidth > innerHeight ? (n > 20 ? 9 : 6) : n > 20 ? 4 : 3;
  const rows = Math.ceil(n / cols);
  const bar = document.getElementById('bar');
  const top = bar ? bar.getBoundingClientRect().bottom + 8 : 50;
  return { cols, rows, w: innerWidth / cols, h: (innerHeight - top) / rows, top };
}
function layoutLabels() {
  const g = grid();
  labelBox.innerHTML = '';
  const n = cells.length;
  cells.forEach((c, i) => {
    const d = document.createElement('div');
    d.textContent = c.label;
    Object.assign(d.style, {
      position: 'fixed', left: `${(i % g.cols) * g.w}px`, top: `${g.top + Math.floor(i / g.cols) * g.h + g.h - 26}px`,
      width: `${g.w}px`, textAlign: 'center', pointerEvents: 'none', color: '#ccc', fontWeight: '600', fontSize: n > 20 ? '11px' : '14px',
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
button('Jobs', () => {
  view = 'sheet';
  build();
});
button('Crowd', () => {
  view = 'crowd';
  build();
});
button('Showcase', () => {
  view = 'showcase';
  build();
});
button('Close-up', () => {
  view = 'hero';
  build();
});
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
