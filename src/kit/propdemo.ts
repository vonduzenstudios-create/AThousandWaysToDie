import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { StreetKit, propModel, triCount, meshGrid, cactusArms, type PropKind } from './index';
import { PostFX, warmLighting, pickQuality } from '../render/post';

/**
 * Showcase for the prop kit (open /props.html on the dev server). Every family in a row with a
 * label, plus the triangle count of each model. ?still=1 renders on request (window.dev.render).
 * ?only=tentA:d9c8a0 shows one prop up close.
 */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8d4f5);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600);
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a5a3a, 1.2);
const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 });
sun.position.set(60, 80, 70);
sun.target.position.set(30, 0, 10);
scene.add(hemi, sun, sun.target);
warmLighting(scene, renderer, { sun, hemi });
const ground = new THREE.Mesh(new THREE.BoxGeometry(400, 1, 400), new THREE.MeshStandardMaterial({ color: 0x7c9a5a, roughness: 1 }));
ground.position.set(30, -0.5, 10);
ground.receiveShadow = true;
scene.add(ground);

const ROWS: PropKind[][] = [
  ['tentA:d9c8a0', 'tentA:e0703a', 'tentA:4a8a5a', 'campfire', 'picnicTable', 'beachUmbrella:e8423a', 'beachUmbrella:2a8ae0'],
  ['tree:4:2:0', 'tree:6:3:0', 'tree:5:2:1', 'tree:7:4:1', 'pine:8', 'pine:11', 'palm:10:1', 'palm:12:-1'],
  ['acacia:6:5:1:0', `cactus:6:${cactusArms([{ axis: 'x', sign: 1, y: 2, len: 2 }, { axis: 'x', sign: -1, y: 3, len: 3 }])}`, 'cactus:5:-', 'bush:1.5', 'bush:2.5'],
  ['fence:picket:1', 'fence:rail:2', 'fence:iron:2', 'fence:chain:2', 'fence:hedge:1', 'fence:barrier:2'],
];
const params = new URLSearchParams(location.search);
const only = params.get('only') as PropKind | null;
const kit = new StreetKit({ parent: scene, propLod: 0 });
const info: string[] = [];
const rows = only ? [[only]] : ROWS;
rows.forEach((row, ri) => {
  let x = 0;
  for (const k of row) {
    const m = propModel(k);
    const w = (m.grid.sx * m.size) as number;
    const isFence = k.startsWith('fence');
    if (isFence) for (let i = 0; i < 5; i++) kit.prop(k, x + i + 0.5, 0, ri * 16);
    else kit.prop(k, x + w / 2, 0, ri * 16);
    info.push(`${k}: ${(triCount(meshGrid(m.grid, { origin: m.origin, size: m.size })) / 1000).toFixed(1)}k tris`);
    x += (isFence ? 5 : w) + 2;
  }
});
kit.finish();

const controls = new OrbitControls(camera, renderer.domElement);
const views: Record<string, [number[], number[]]> = {
  all: [[30, 38, 80], [30, 2, 22]],
  camp: [[22, 9, 18], [22, 2, 0]],
  trees: [[28, 12, 42], [28, 5, 16]],
  wild: [[16, 9, 52], [16, 3, 32]],
  fences: [[16, 4, 60], [16, 1, 48]],
  only: [[5, 5, 10], [0, 1.6, 0]],
};
function view(name: string) {
  const [p, t] = views[name];
  camera.position.set(p[0], p[1], p[2]);
  controls.target.set(t[0], t[1], t[2]);
  controls.update();
}
if (only) {
  const m = propModel(only);
  const w = m.grid.sx * m.size, h = m.grid.sy * m.size;
  views.only = [[w / 2 + w * 0.9, h * 0.8, w * 1.1 + 2], [w / 2, h * 0.35, 0]];
}
view(params.get('view') ?? (only ? 'only' : 'all'));
const post = new PostFX(renderer, scene, camera, pickQuality());
if (params.has('still')) document.getElementById('hud')!.style.display = 'none';
document.getElementById('hud')!.innerHTML = '<b>Prop kit</b><br>' + Object.keys(views).map((v) => `<button data-v="${v}">${v}</button>`).join('') + '<br>' + info.join('<br>');
document.querySelectorAll<HTMLButtonElement>('button[data-v]').forEach((b) => b.addEventListener('click', () => view(b.dataset.v!)));
const still = params.has('still');
if (!still) renderer.setAnimationLoop(() => {
  controls.update();
  post.render();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
});
(window as unknown as { dev: unknown }).dev = { kit, view, info, render: () => (controls.update(), post.render()), ready: true };
