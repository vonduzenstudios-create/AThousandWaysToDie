import * as THREE from 'three';
import { B, blockColor, type VoxelWorld } from '../../voxel';
import { cactusArms } from '../../kit/nature';
import { mulberry32, type Rng } from '../../util';
import { Biome, PADS, PRIDE_ROCK, SX, SZ, W, fbm, type Terrain } from './terrain';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Every named spot the map's props and deaths hang off. Filled in by buildStructures. */
export interface Spots {
  [k: string]: THREE.Vector3;
}

interface Ctx {
  w: VoxelWorld;
  t: Terrain;
  rng: Rng;
  spots: Spots;
}

// ---------------------------------------------------------------- building blocks

function walls(w: VoxelWorld, x0: number, y: number, z0: number, x1: number, z1: number, h: number, wall: number, corner = wall, windows: number = B.Glass) {
  for (let yy = y; yy < y + h; yy++)
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (!edge) continue;
        const isCorner = (x === x0 || x === x1) && (z === z0 || z === z1);
        const win = !isCorner && yy === y + 1 && (x + z) % 4 === 0 && windows;
        w.set(x, yy, z, isCorner ? corner : win ? windows : wall);
      }
}

function door(w: VoxelWorld, x: number, y: number, z: number, axis: 'x' | 'z', width = 2, h = 3) {
  for (let i = 0; i < width; i++) for (let yy = y; yy < y + h; yy++) w.set(axis === 'x' ? x + i : x, yy, axis === 'z' ? z + i : z, 0);
}

function gable(w: VoxelWorld, x0: number, y: number, z0: number, x1: number, z1: number, roof: number, gableWall: number) {
  const depth = z1 - z0 + 1;
  const half = Math.ceil(depth / 2);
  for (let i = 0; i <= half; i++) {
    const yy = y + i;
    w.fill(x0 - 1, yy, z0 - 1 + i, x1 + 1, yy, z0 - 1 + i, roof);
    w.fill(x0 - 1, yy, z1 + 1 - i, x1 + 1, yy, z1 + 1 - i, roof);
    if (i > 0 && z0 + i <= z1 - i) {
      w.fill(x0, yy, z0 + i, x0, yy, z1 - i, gableWall);
      w.fill(x1, yy, z0 + i, x1, yy, z1 - i, gableWall);
    }
  }
}

/** Round hut with a conical thatch roof. */
function rondavel(w: VoxelWorld, cx: number, y: number, cz: number, r: number, wall: number) {
  for (let yy = y; yy < y + 4; yy++)
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const d = Math.hypot(dx, dz);
        if (d <= r + 0.3 && d > r - 0.8) w.set(cx + dx, yy, cz + dz, yy === y + 1 && (dx + dz) % 3 === 0 ? B.Glass : wall);
      }
  for (let i = 0; i < r + 3; i++) {
    const rr = r + 1.5 - i;
    for (let dx = -r - 2; dx <= r + 2; dx++)
      for (let dz = -r - 2; dz <= r + 2; dz++) if (Math.hypot(dx, dz) <= rr) w.set(cx + dx, y + 4 + i, cz + dz, W.Thatch);
  }
  door(w, cx, y, cz + r, 'x', 2);
  w.set(cx + 1, y, cz + r, 0);
}

function pine(c: Ctx, x: number, z: number, scale = 1) {
  const { w, t, rng } = c;
  const g = t.ground(x, z);
  const h = Math.round((9 + rng() * 9) * scale);
  w.fill(x, g, z, x, g + h, z, W.Bark);
  const snow = g + h > 66;
  for (let i = 0; i < h - 2; i++) {
    const y = g + 3 + i;
    const r = Math.max(0.6, ((h - 2 - i) / (h - 2)) * (2.6 + scale) + (i % 3 === 0 ? 0.6 : 0));
    const R = Math.ceil(r);
    for (let dx = -R; dx <= R; dx++)
      for (let dz = -R; dz <= R; dz++) {
        if (dx * dx + dz * dz > r * r + 0.3) continue;
        if (w.get(x + dx, y, z + dz)) continue;
        w.set(x + dx, y, z + dz, snow && i > h - 7 && rng() < 0.5 ? W.Snow : W.Pine);
      }
  }
  w.set(x, g + h + 1, z, W.Pine);
}

// Trees, cacti and tents below are kit props (src/kit, docs/prop-kit.md): the voxel world gets
// invisible Ghost blocks in the old shape (collision, nav, deaths), the prop is what you see.

function leafyTree(c: Ctx, x: number, z: number, leaf: number = B.Leaves) {
  const { w, t, rng } = c;
  const g = t.ground(x, z);
  const h = 4 + Math.floor(rng() * 4);
  w.fill(x, g, z, x, g + h - 1, z, B.GhostWood);
  const r = 2 + Math.floor(rng() * 2);
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++)
        if (dx * dx + dy * dy * 1.6 + dz * dz <= r * r + 0.5 && !w.get(x + dx, g + h + dy, z + dz) && rng() > 0.06) w.set(x + dx, g + h + dy, z + dz, B.GhostLeaf);
  w.prop(`tree:${h}:${r}:${leaf === B.LeavesDark ? 1 : 0}`, x + 0.5, g, z + 0.5);
}

/** Flat-topped acacia, the savanna's silhouette. */
function acacia(c: Ctx, x: number, z: number) {
  const { w, t, rng } = c;
  const g = t.ground(x, z);
  const h = 5 + Math.floor(rng() * 3);
  let px = x, pz = z;
  const lean = rng() * Math.PI * 2;
  for (let i = 0; i < h; i++) {
    if (i > 2 && i % 2 === 0) {
      px += Math.round(Math.cos(lean));
      pz += Math.round(Math.sin(lean));
    }
    w.set(px, g + i, pz, B.GhostWood);
  }
  const r = 4 + Math.floor(rng() * 3);
  for (let dx = -r - 1; dx <= r + 1; dx++)
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      const d = Math.hypot(dx, dz * 1.15) + fbm((px + dx) / 3, (pz + dz) / 3, 88) * 1.2;
      if (d < r) w.set(px + dx, g + h, pz + dz, B.GhostLeaf);
      if (d < r - 2) w.set(px + dx, g + h + 1, pz + dz, B.GhostLeaf);
    }
  // A couple of branches.
  for (const s of [-1, 1]) for (let i = 1; i < 3; i++) w.set(px + s * i, g + h - 1, pz, B.GhostWood);
  w.prop(`acacia:${h}:${r}:${Math.round(Math.cos(lean))}:${Math.round(Math.sin(lean))}`, x + 0.5, g, z + 0.5);
}

function baobab(c: Ctx, x: number, z: number): THREE.Vector3 {
  const { w, t } = c;
  const g = t.ground(x, z);
  for (let y = 0; y < 14; y++) {
    const r = y < 11 ? 3.4 - y * 0.06 : 2.4;
    const R = Math.ceil(r);
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) if (dx * dx + dz * dz <= r * r) w.set(x + dx, g + y, z + dz, W.Baobab);
  }
  // Root-like crown branches.
  const top = g + 14;
  for (let a = 0; a < 7; a++) {
    const ang = (a / 7) * Math.PI * 2;
    for (let i = 0; i < 6; i++) {
      const bx = Math.round(x + Math.cos(ang) * (2 + i)), bz = Math.round(z + Math.sin(ang) * (2 + i));
      w.set(bx, top + Math.floor(i / 2), bz, W.Baobab);
      if (i > 3) for (let dy = 0; dy < 2; dy++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) w.set(bx + ox, top + 3 + dy, bz + oz, W.Acacia);
    }
  }
  return V(x + 0.5, top + 3, z + 0.5);
}

function cactus(c: Ctx, x: number, z: number) {
  const { w, t, rng } = c;
  const g = t.ground(x, z);
  const h = 4 + Math.floor(rng() * 5);
  w.fill(x, g, z, x, g + h - 1, z, B.GhostLeaf);
  const arms: Parameters<typeof cactusArms>[0] = [];
  for (const s of [-1, 1] as const) {
    if (rng() < 0.35) continue;
    const ay = g + 1 + Math.floor(rng() * (h - 3));
    const ax = rng() < 0.5;
    const ox = ax ? s : 0, oz = ax ? 0 : s;
    w.set(x + ox, ay, z + oz, B.GhostLeaf);
    const len = 2 + Math.floor(rng() * 2);
    w.fill(x + ox * 2, ay, z + oz * 2, x + ox * 2, ay + len, z + oz * 2, B.GhostLeaf);
    arms.push({ axis: ax ? 'x' : 'z', sign: s, y: ay - g, len });
  }
  w.prop(`cactus:${h}:${cactusArms(arms)}`, x + 0.5, g, z + 0.5);
}

function deadTree(c: Ctx, x: number, z: number, h = 10): THREE.Vector3 {
  const { w, t, rng } = c;
  const g = t.ground(x, z);
  w.fill(x, g, z, x, g + h, z, W.Rust);
  for (let i = 0; i < 4; i++) {
    const y = g + 4 + i * 2;
    const dx = rng() < 0.5 ? 1 : -1, dz = rng() < 0.5 ? 1 : -1;
    for (let k = 1; k < 4; k++) w.set(x + (i % 2 ? dx * k : 0), y + Math.floor(k / 2), z + (i % 2 ? 0 : dz * k), W.Rust);
  }
  return V(x + 0.5, g + h + 1, z + 0.5);
}

function cypress(c: Ctx, x: number, z: number) {
  const { w, t, rng } = c;
  const g = t.ground(x, z);
  const h = 8 + Math.floor(rng() * 6);
  w.fill(x, g - 1, z, x, g + h, z, W.Bark);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) w.fill(x + dx, g - 1, z + dz, x + dx, g + 1, z + dz, W.Bark);
  for (let y = g + 5; y <= g + h + 1; y++)
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        if (Math.abs(dx) + Math.abs(dz) <= 3 && !w.get(x + dx, y, z + dz) && rng() < 0.7) w.set(x + dx, y, z + dz, rng() < 0.2 ? W.Moss : W.Cypress);
}

function boulder(c: Ctx, x: number, z: number, r: number, blk: number = W.Rock) {
  const { w, t } = c;
  const g = t.ground(x, z);
  const R = Math.ceil(r);
  for (let dx = -R; dx <= R; dx++)
    for (let dy = -1; dy <= R; dy++)
      for (let dz = -R; dz <= R; dz++) if (dx * dx + dy * dy * 1.4 + dz * dz <= r * r + fbm(x + dx, z + dz, 3) * 2) w.set(x + dx, g + dy, z + dz, blk);
}

function termiteMound(c: Ctx, x: number, z: number) {
  const { w, t, rng } = c;
  const g = t.ground(x, z);
  const h = 3 + Math.floor(rng() * 4);
  for (let y = 0; y < h; y++) {
    const r = (1 - y / h) * 1.8;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (dx * dx + dz * dz <= r * r + 0.4) w.set(x + dx, g + y, z + dz, W.Termite);
  }
}

function logPile(w: VoxelWorld, x: number, y: number, z: number, len: number) {
  for (let layer = 0; layer < 3; layer++)
    for (let i = 0; i < 4 - layer; i++) {
      const zz = z + i * 2 + layer;
      w.fill(x, y + layer, zz, x + len, y + layer, zz, W.Bark);
      w.set(x, y + layer, zz, W.LogEnd);
      w.set(x + len, y + layer, zz, W.LogEnd);
    }
}

/** Ridge tent, 7 x 6 blocks, door on the -z end. Collision keeps the old blocky A-frame. */
function tent(w: VoxelWorld, x: number, y: number, z: number, color: number) {
  const ghost = B.GhostProp;
  for (let i = 0; i < 4; i++) {
    w.fill(x + i, y + i, z, x + i, y + i, z + 5, ghost);
    w.fill(x + 6 - i, y + i, z, x + 6 - i, y + i, z + 5, ghost);
  }
  w.fill(x + 3, y + 3, z, x + 3, y + 3, z + 5, ghost);
  for (let i = 1; i < 3; i++) w.fill(x + 3 - i + 1, y, z, x + 3 + i - 1, y + 2 - i + 1, z, ghost);
  w.set(x + 3, y, z, 0);
  w.set(x + 3, y + 1, z, 0);
  w.prop(`tentA:${blockColor(color).toString(16).padStart(6, '0')}`, x + 3.5, y, z + 3);
}

// ---------------------------------------------------------------- the places

function depot(c: Ctx) {
  const { w, t, spots } = c;
  const p = PADS.depot;
  const y = p.y!;
  // Tracks bed runs along z = 614 the whole width of the forest.
  w.fill(0, y - 1, 611, 300, y - 1, 617, B.Gravel);
  for (let x = 0; x <= 300; x++) for (let z = 611; z <= 617; z++) if (t.ground(x, z) > y) for (let yy = y; yy < t.ground(x, z) + 1; yy++) w.set(x, yy, z, 0);
  // Platform.
  w.fill(56, y, 602, 112, y, 608, B.Concrete);
  w.fill(56, y, 608, 112, y, 608, B.Yellow);
  // The station house itself is a kit building (kitbuild.ts); just a step up to the platform.
  w.fill(66, y, 601, 92, y, 601, B.Plank);
  // Water tank for steam engines.
  w.fill(100, y, 594, 100, y + 6, 594, B.Wood);
  w.fill(104, y, 594, 104, y + 6, 594, B.Wood);
  w.fill(100, y + 7, 591, 104, y + 10, 597, B.Plank);
  spots.trainStop = V(84, y, 605.5);
  spots.depotSign = V(60, y + 1, 603);
  spots.trainLaneFrom = V(-40, y, 614.5);
  spots.trainLaneStop = V(84, y, 614.5);
  spots.trainLaneTo = V(340, y, 614.5);
}

function rangerStation(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.ranger;
  const y = p.y!;
  // The station house is a kit building (kitbuild.ts). The flare gun hangs on a rack by the door.
  w.fill(125, y, 566, 126, y, 566, B.Plank);
  // Fire lookout tower behind it.
  const tx = 112, tz = 540, ty = 22;
  for (const [dx, dz] of [[0, 0], [4, 0], [0, 4], [4, 4]]) w.fill(tx + dx, y, tz + dz, tx + dx, y + ty, tz + dz, B.Wood);
  w.fill(tx - 1, y + ty, tz - 1, tx + 5, y + ty, tz + 5, B.Plank);
  walls(w, tx - 1, y + ty + 1, tz - 1, tx + 5, tz + 5, 1, B.Wood, B.Wood, 0);
  w.fill(tx - 2, y + ty + 4, tz - 2, tx + 6, y + ty + 4, tz + 6, B.RoofRed);
  for (const [dx, dz] of [[-1, -1], [5, -1], [-1, 5], [5, 5]]) w.fill(tx + dx, y + ty + 2, tz + dz, tx + dx, y + ty + 3, tz + dz, B.Wood);
  // Ladder of steps up the side.
  for (let i = 0; i < ty; i++) w.set(tx + 2, y + i, tz - 1 - (i % 2), B.Plank);
  for (let i = 0; i < ty; i++) w.set(tx + 2, y + i, tz - 1, B.Plank);
  w.set(tx + 2, y + ty + 1, tz - 1, 0);
  spots.ranger = V(127, y, 567.5);
  spots.rangerDoor = V(131.5, y, 567);
  spots.flareGun = V(125.5, y + 1, 566.5);
  spots.rangerSign = V(119, y, 569);
  spots.lookout = V(tx + 2.5, y + ty + 1, tz + 2.5);
  spots.flag = V(132.5, y + 9, 568.5);
}

function busStop(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.busstop;
  const y = p.y!;
  w.fill(150, y, 574, 158, y, 574, B.Metal);
  w.fill(150, y, 574, 150, y + 3, 574, B.Metal);
  w.fill(158, y, 574, 158, y + 3, 574, B.Metal);
  w.fill(149, y + 4, 573, 159, y + 4, 576, B.RoofGreen);
  w.fill(151, y, 575, 157, y, 575, B.Plank);
  spots.busStop = V(154, y, 578);
  spots.busSign = V(160.5, y + 3, 577.5);
  spots.busLaneFrom = V(120, y, 590);
  spots.busLaneStop = V(154, y, 581);
  spots.busLaneTo = V(210, y, 584);
}

function campground(c: Ctx) {
  const { w, spots, rng } = c;
  const p = PADS.campground;
  const y = p.y!;
  tent(w, 180, y, 418, W.TentOrange);
  tent(w, 196, y, 416, W.TentGreen);
  tent(w, 204, y, 440, W.TentOrange);
  tent(w, 180, y, 440, B.RoofBlue);
  // Fire ring.
  for (let a = 0; a < 10; a++) w.set(Math.round(194 + Math.cos(a * 0.63) * 2.2), y, Math.round(432 + Math.sin(a * 0.63) * 2.2), B.GhostProp);
  w.prop('campfire', 194.5, y, 432.5);
  // Picnic tables.
  for (const [x, z] of [[186, 430], [206, 428]]) {
    w.fill(x, y + 1, z, x + 4, y + 1, z + 1, B.GhostProp);
    w.fill(x, y, z - 1, x + 4, y, z - 1, B.GhostProp);
    w.fill(x, y, z + 2, x + 4, y, z + 2, B.GhostProp);
    w.prop('picnicTable', x + 2.5, y, z + 1);
  }
  // Outhouse.
  walls(w, 212, y, 446, 214, 448, 4, B.Wood, B.Wood, 0);
  w.fill(212, y + 4, 446, 214, y + 4, 448, B.RoofGreen);
  door(w, 213, y, 446, 'x', 1);
  // Air horn post on the far side.
  w.fill(178, y, 450, 178, y + 2, 450, B.Metal);
  void rng;
  spots.campfire = V(194.5, y, 432.5);
  spots.picnic = V(188.5, y + 2, 430.5);
  spots.airHorn = V(178.5, y + 3, 450.5);
  spots.campSign = V(195, y + 4, 412);
  spots.cooler = V(207.5, y + 2, 428.5);
}

function bearCave(c: Ctx) {
  const { w, t, spots } = c;
  // Carve a cave into the ridge's south flank, northeast of the campground.
  const cx = 250, cz = 338;
  const g = t.ground(cx, cz + 12);
  for (let dz = -14; dz <= 4; dz++)
    for (let dx = -4; dx <= 4; dx++)
      for (let dy = 0; dy <= 4; dy++) {
        const r = Math.hypot(dx / 4.5, dy / 4.2);
        if (r < 1) w.set(cx + dx, g + dy, cz + dz, 0);
      }
  for (let dz = -14; dz <= 4; dz++) for (let dx = -3; dx <= 3; dx++) w.set(cx + dx, g - 1, cz + dz, W.DarkRock);
  // Bones at the entrance.
  w.set(cx - 2, g, cz + 3, W.Bone);
  w.set(cx + 2, g, cz + 2, W.Bone);
  spots.bearCave = V(cx + 0.5, g, cz - 8);
  spots.caveMouth = V(cx + 0.5, g, cz + 6);
  // Beehive tree by the creek.
  const bx = 168, bz = 360;
  leafyTree(c, bx, bz, B.LeavesDark);
  spots.beehive = V(bx + 1.6, t.ground(bx, bz) + 3.2, bz + 0.5);
}

function lumberCamp(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.lumber;
  const y = p.y!;
  // Sawmill shed (open front).
  for (const [x, z] of [[114, 450], [126, 450], [114, 458], [126, 458]]) w.fill(x, y, z, x, y + 4, z, B.Wood);
  w.fill(113, y + 5, 449, 127, y + 5, 459, B.RoofBrown);
  w.fill(117, y, 453, 123, y, 455, B.Metal); // saw table
  logPile(w, 130, y, 452, 7);
  logPile(w, 114, y, 462, 9);
  // Log roll dock jutting into the pond.
  w.fill(108, y - 1, 448, 112, y - 1, 456, B.Plank);
  spots.barrels = V(124.5, y, 465);
  spots.sawmill = V(120, y, 454);
  spots.logDock = V(110, y, 452);
  spots.logPond = V(108, 19, 440);
  spots.lumberSign = V(120, y + 6.5, 459.5);
}

function gatorShow(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.gatorshow;
  const y = p.y!;
  // Sunken pit with water on the swamp side.
  w.fill(76, y - 3, 472, 88, y - 1, 484, 0);
  w.fill(76, y - 4, 472, 88, y - 4, 484, W.Mud);
  // Pit railing.
  for (let x = 75; x <= 89; x++) for (const z of [471, 485]) w.set(x, y, z, B.Wood);
  for (let z = 471; z <= 485; z++) for (const x of [75, 89]) w.set(x, y, z, B.Wood);
  w.set(82, y, 485, 0);
  w.set(83, y, 485, 0);
  // Bleachers.
  for (let i = 0; i < 4; i++) w.fill(74 + 0, y + i, 488 + i * 2, 90, y + i, 489 + i * 2, B.Plank);
  // Dressing tent.
  tent(w, 92, y, 472, B.RedPaint);
  spots.gatorPit = V(82.5, y - 3, 478.5);
  spots.gatorGate = V(82.5, y, 486);
  spots.gatorSign = V(82.5, y + 6, 470.4);
  spots.dressingTent = V(95.5, y, 471);
  spots.gatorHost = V(84.5, y, 486.5);
}

function rapidsDock(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.raftdock;
  const y = p.y!;
  walls(w, 118, y, 182, 126, 190, 4, B.Wood, W.LogEnd);
  door(w, 126, y, 185, 'z', 2);
  gable(w, 118, y + 4, 182, 126, 190, B.RoofRed, B.Wood);
  // Dock to the water (river is just east).
  w.fill(128, y - 1, 186, 136, y - 1, 189, B.Plank);
  spots.raftDock = V(134.5, y, 187.5);
  spots.raftHut = V(122, y, 194);
  spots.raftSign = V(127, y + 5, 192);
}

function bungeeBridge(c: Ctx) {
  const { w, spots } = c;
  const s = PADS.bungee, n = PADS.bungeeN;
  const ys = s.y!, yn = n.y!;
  const deck = Math.max(ys, yn);
  // Bridge deck from z=272 to z=318 at x 222..228.
  for (let z = 266; z <= 320; z++) {
    w.fill(222, deck - 1, z, 228, deck - 1, z, B.Plank);
    if (z % 6 === 0) {
      w.fill(222, deck, z, 222, deck + 1, z, B.Wood);
      w.fill(228, deck, z, 228, deck + 1, z, B.Wood);
    }
  }
  // Rope rails (thin wood line).
  w.fill(222, deck + 1, 266, 222, deck + 1, 320, B.Wood);
  w.fill(228, deck + 1, 266, 228, deck + 1, 320, B.Wood);
  // Fill any gap between deck ends and the pads.
  for (const [z0, z1, yy] of [[314, 320, ys], [266, 272, yn]] as const) for (let z = z0; z <= z1; z++) for (let yv = yy; yv < deck; yv++) w.fill(222, yv - 1, z, 228, yv - 1, z, B.Gravel);
  // Bungee platform sticking out the east side in the middle.
  w.fill(229, deck - 1, 292, 233, deck - 1, 296, B.Plank);
  w.fill(233, deck, 292, 233, deck, 296, B.Metal);
  w.set(233, deck, 294, 0);
  w.fill(231, deck, 292, 231, deck + 5, 292, B.Metal);
  w.fill(231, deck + 5, 292, 234, deck + 5, 292, B.Metal);
  // Bungee shack on the south end.
  walls(w, 230, ys, 320, 236, 326, 4, W.Hazard, B.Dark);
  door(w, 230, ys, 322, 'z', 2);
  w.fill(229, ys + 4, 319, 237, ys + 4, 327, B.Dark);
  // Porta-potty.
  walls(w, 216, ys, 324, 218, 326, 4, B.RoofBlue, B.RoofBlue, 0);
  w.fill(216, ys + 4, 324, 218, ys + 4, 326, B.White);
  door(w, 217, ys, 324, 'x', 1);
  spots.bridgeMid = V(225.5, deck, 294.5);
  spots.bungeeJump = V(232, deck, 294.5);
  spots.bungeeHook = V(233.5, deck + 5, 292.5);
  spots.bungeeShack = V(233, ys, 318.5);
  spots.cordSpool = V(238.5, ys, 316.5);
  spots.pottyDoor = V(217.5, ys, 322.5);
  spots.bungeeSign = V(225.5, ys + 4, 321);
  spots.bridgeDeck = V(225.5, deck, 300);
}

function lodge(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.lodge;
  const y = p.y!;
  // The gift shop and the lodge kitchen are kit buildings (kitbuild.ts). Each has a walk-up
  // counter out front under its awning.
  w.fill(427, y, 557, 429, y, 557, B.Plank);
  w.fill(445, y, 557, 447, y, 557, B.Metal);
  rondavel(w, 462, y, 548, 4, W.Adobe);
  rondavel(w, 464, y, 566, 4, W.Adobe);
  rondavel(w, 428, y, 574, 4, W.Adobe);
  // Park garage (open shed) with the paint.
  for (const [x, z] of [[444, 570], [458, 570], [444, 584], [458, 584]]) w.fill(x, y, z, x, y + 4, z, B.Wood);
  w.fill(443, y + 5, 569, 459, y + 5, 585, B.Metal);
  w.fill(445, y, 582, 448, y, 583, B.Plank);
  spots.giftShop = V(428.5, y, 559);
  spots.kitchen = V(446.5, y, 559);
  spots.lodgeDoor = V(445.5, y, 558);
  spots.lodgeSign = V(438.5, y, 565);
  spots.paintCan = V(446.5, y + 1, 582.5);
  spots.garage = V(451, y, 577);
  spots.jeepHome = V(451.5, y, 577);
}

function balloonPad(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.balloon;
  const y = p.y!;
  for (let a = 0; a < 24; a++) w.set(Math.round(491 + Math.cos(a / 3.8) * 7), y - 1, Math.round(531 + Math.sin(a / 3.8) * 7), B.White);
  w.fill(484, y, 540, 488, y + 1, 541, B.Plank); // ticket booth counter
  spots.balloon = V(491.5, y, 531.5);
  spots.balloonBooth = V(486.5, y, 543);
}

function airstrip(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.airstrip;
  const y = p.y!;
  for (let x = 300; x < 606; x += 8) w.fill(x, y - 1, 611, x + 3, y - 1, 612, B.White);
  for (let z = 602; z <= 622; z += 3) {
    w.set(296, y - 1, z, B.White);
    w.set(604, y - 1, z, B.White);
  }
  const h = PADS.hangar;
  const hy = h.y!;
  walls(w, 302, hy, 584, 328, 598, 8, B.Metal, B.Dark, 0);
  for (let x = 306; x <= 324; x++) for (let yy = hy; yy < hy + 6; yy++) w.set(x, yy, 598, 0);
  for (let i = 0; i < 4; i++) w.fill(301, hy + 8 + i, 584 + i * 2, 329, hy + 8 + i, 598 - i * 2, B.Metal);
  // Windsock pole and tiny terminal.
  w.fill(340, y, 598, 340, y + 6, 598, B.Metal);
  // The terminal is a kit building (kitbuild.ts).
  spots.airport = V(349, hy, 600);
  spots.planeLaneFrom = V(620, y, 612);
  spots.planeLaneStop = V(360, y, 612);
  spots.planeLaneTo = V(250, y, 612);
  spots.windsock = V(340.5, y + 6, 598.5);
  spots.airSign = V(362, hy, 599);
}

function overlook(c: Ctx) {
  const { spots } = c;
  const p = PADS.overlook;
  spots.overlook = V(502, p.y!, 348);
  spots.lionLookout = V(546, c.t.ground(546, 376), 376);
}

function prideRock(c: Ctx) {
  const { w, t, spots } = c;
  const { x: cx, z: cz } = PRIDE_ROCK;
  const g = t.ground(cx, cz);
  // A tilted slab of rock with a jutting ledge pointing west.
  for (let dx = -16; dx <= 14; dx++)
    for (let dz = -10; dz <= 10; dz++) {
      const along = (dx + 16) / 30;
      const top = Math.round(g + 2 + along * 14 + fbm((cx + dx) / 5, (cz + dz) / 5, 4) * 1.5);
      const width = 10 - along * 3;
      if (Math.abs(dz) > width + fbm(dx, dz, 5) * 2) continue;
      for (let y = g - 1; y <= top; y++) w.set(cx + dx, y, cz + dz, y === top ? W.DryGrass : (y + dx) % 4 === 0 ? W.DarkRock : W.Rock);
    }
  const ledgeY = g + 16;
  w.fill(cx - 24, ledgeY - 1, cz - 3, cx - 14, ledgeY, cz + 3, W.Rock);
  for (let dx = -24; dx <= -14; dx++) w.fill(cx + dx, ledgeY - 3 - Math.floor((-14 - dx) / 4), cz - 2, cx + dx, ledgeY - 2, cz + 2, W.DarkRock);
  spots.prideRock = V(cx + 0.5, g, cz + 14);
  spots.prideLedge = V(cx - 20, ledgeY + 1, cz + 0.5);
  spots.prideDen = V(cx - 4, g + 1, cz + 16);
}

function gasStation(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.gas;
  const y = p.y!;
  // The diner is a kit building (kitbuild.ts).
  // Canopy over the pumps.
  for (const x of [312, 324]) for (const z of [140, 154]) w.fill(x, y, z, x, y + 5, z, B.White);
  w.fill(310, y + 6, 138, 326, y + 6, 156, B.White);
  w.fill(310, y + 6, 138, 326, y + 6, 138, B.RedPaint);
  for (const x of [316, 320]) w.fill(x, y, 146, x, y + 2, 147, B.RedPaint);
  // Tall sign pole.
  w.fill(330, y, 140, 330, y + 14, 140, B.Metal);
  // Camel hitching post.
  w.fill(284, y, 152, 284, y + 1, 152, B.Wood);
  spots.gasDoor = V(296.5, y, 148.5);
  spots.gasSign = V(330.5, y + 15, 140.5);
  spots.acme = V(304.5, y, 151.5);
  spots.camelPost = V(284.5, y, 154);
  spots.dinerSign = V(282, y, 150);
}

function trailer(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.trailer;
  const y = p.y!;
  // Rounded silver trailer.
  for (let x = 396; x <= 410; x++)
    for (let dz = 0; dz <= 6; dz++)
      for (let dy = 0; dy <= 5; dy++) {
        const r = Math.hypot((dz - 3) / 3.5, (dy - 1.5) / 4.2);
        const shell = r < 1 && r > 0.72;
        const end = (x === 396 || x === 410) && r < 1;
        if (shell || end) w.set(x, y + dy, 128 + dz, W.Foil);
      }
  door(w, 402, y, 134, 'x', 1);
  w.set(402, y, 134, 0);
  // Satellite dishes and an antenna farm.
  w.fill(414, y, 126, 414, y + 8, 126, B.Metal);
  w.fill(412, y + 8, 124, 416, y + 9, 128, W.Foil);
  w.fill(392, y, 140, 392, y + 11, 140, B.Metal);
  for (let i = 0; i < 4; i++) w.fill(390, y + 6 + i * 1.5, 140, 394, y + 6 + i * 1.5, 140, B.Metal);
  // Hand painted warning boards.
  spots.trailerDoor = V(402.5, y, 136);
  spots.tinfoil = V(406.5, y + 1, 138.5);
  spots.trailerSign = V(404, y + 3, 145);
}

/** Wheat field with a crop circle that spells INSURE ME from the sky. */
function cropCircle(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.cropcircle;
  const y = p.y!;
  // Wheat stalks (one block tall) everywhere except the design.
  const FONT: Record<string, string[]> = {
    I: ['111', '010', '010', '010', '111'],
    N: ['1001', '1101', '1011', '1001', '1001'],
    S: ['111', '100', '111', '001', '111'],
    U: ['101', '101', '101', '101', '111'],
    R: ['110', '101', '110', '101', '101'],
    E: ['111', '100', '110', '100', '111'],
    M: ['10001', '11011', '10101', '10001', '10001'],
    ' ': ['0', '0', '0', '0', '0'],
  };
  const text = 'INSURE ME';
  const scale = 2;
  const cols: string[] = [];
  for (const ch of text) {
    const g = FONT[ch];
    for (let cx = 0; cx < g[0].length; cx++) cols.push(g.map((r) => r[cx]).join(''));
    cols.push('00000');
  }
  const tw = cols.length * scale;
  const tx0 = Math.round((p.x0 + p.x1) / 2 - tw / 2), tz0 = p.z0 + 8;
  const flat = new Set<string>();
  cols.forEach((col, ci) => {
    for (let r = 0; r < 5; r++)
      if (col[r] === '1') for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) flat.add(`${tx0 + ci * scale + a},${tz0 + r * scale + b}`);
  });
  // Rings below the text.
  const rcx = (p.x0 + p.x1) / 2, rcz = p.z0 + 44;
  for (let z = p.z0; z <= p.z1; z++)
    for (let x = p.x0; x <= p.x1; x++) {
      const d = Math.hypot(x - rcx, z - rcz);
      const ring = (d < 13 && d > 11) || d < 5 || (d < 21 && d > 19.5) || (Math.abs(x - rcx) < 1.2 && d < 20);
      if (flat.has(`${x},${z}`) || ring) w.set(x, y - 1, z, W.Wheat2);
      else w.set(x, y, z, W.Wheat);
    }
  spots.cropCenter = V(rcx, y, rcz);
  spots.camera = V(p.x0 - 4, y, rcz);
  spots.cropSign = V(p.x0 - 3, y + 2, p.z1 + 3);
}

function testSite(c: Ctx) {
  const { w, spots } = c;
  const p = PADS.doomtown;
  const y = p.y!;
  // Two Doom Town houses with mannequins (posts) and a fridge in the kitchen.
  // The houses are kit buildings (kitbuild.ts). The fridge was put out on the front lawn.
  w.fill(564, y, 50, 565, y + 2, 50, B.White);
  // Picket fence, a car-shaped lump, a bomb tower in the middle of nowhere.
  for (let x = 560; x <= 576; x += 2) w.set(x, y, 52, B.White);
  const tx = 600, tz = 34;
  for (const [dx, dz] of [[0, 0], [4, 0], [0, 4], [4, 4]]) w.fill(tx + dx, y, tz + dz, tx + dx, y + 18, tz + dz, B.Metal);
  for (let yy = y + 4; yy < y + 18; yy += 5) {
    w.fill(tx, yy, tz, tx + 4, yy, tz, B.Metal);
    w.fill(tx, yy, tz + 4, tx + 4, yy, tz + 4, B.Metal);
  }
  w.fill(tx - 1, y + 18, tz - 1, tx + 5, y + 21, tz + 5, W.Steel);
  // Warning fence around the site.
  for (let x = 552; x <= 616; x += 3) {
    w.fill(x, y, 26, x, y + 1, 26, W.Hazard);
    w.fill(x, y, 88, x, y + 1, 88, W.Hazard);
  }
  for (let z = 26; z <= 88; z += 3) w.fill(552, y, z, 552, y + 1, z, W.Hazard);
  spots.fridge = V(565, y, 51.5);
  spots.doomWall = V(562.8, y + 1.5, 49.05);
  spots.bombTower = V(602.5, y + 22, 36.5);
  spots.testSign = V(556, y + 3, 90);
  // Control bunker.
  const b = PADS.bunker;
  const by = b.y!;
  walls(w, 514, by, 96, 530, 108, 4, B.Concrete, B.Concrete, 0);
  w.fill(513, by + 4, 95, 531, by + 5, 109, B.Concrete);
  for (let x = 517; x < 528; x++) w.set(x, by + 2, 96, B.Glass);
  door(w, 521, by, 108, 'x', 2);
  w.fill(518, by, 98, 526, by, 98, B.Metal);
  spots.bunkerButton = V(522, by + 1, 99);
  spots.bunkerDoor = V(522, by, 110);
  spots.bunkerSign = V(522, by + 6.5, 109.6);
}

function hippoCrossing(c: Ctx) {
  const { spots, t } = c;
  spots.hippoPool = V(390, 20, 380);
  spots.hippoBank = V(392, t.ground(392, 398), 398);
  spots.wateringHole = V(482, 21, 470);
  spots.waterBank = V(482, t.ground(482, 490), 490);
}

function piranhaPool(c: Ctx) {
  const { spots, t } = c;
  spots.piranhaPool = V(160, 19, 478);
  spots.piranhaBank = V(160, t.ground(160, 492), 492);
  spots.piranhaSign = V(158, t.ground(158, 491) + 2, 491);
}

function beaverDam(c: Ctx) {
  const { w, spots } = c;
  // Sticks across the creek at the step at z ~ 399.
  for (let x = 134; x <= 146; x++)
    for (let dz = 0; dz <= 1; dz++) for (let y = 18; y <= 22; y++) if (!w.get(x, y, 399 + dz) || y >= 20) if (y <= 21) w.set(x, y, 399 + dz, W.Bark);
  for (let x = 135; x <= 145; x += 2) w.set(x, 22, 399, W.LogEnd);
  spots.beaverDam = V(140.5, 22, 399.5);
  spots.beaverLodge = V(150, 21, 388);
  w.fill(148, 20, 386, 152, 23, 390, W.Bark);
  w.fill(149, 24, 387, 151, 24, 389, W.Bark);
}

function oasisMirage(c: Ctx) {
  const { spots, t } = c;
  spots.oasis = V(268, 22, 120);
  // Palms by the real oasis.
  for (const [x, z] of [[258, 112], [278, 114], [262, 130], [276, 128]]) {
    const g = t.ground(x, z);
    c.w.fill(x, g, z, x, g + 7, z, B.Wood);
    for (const [dx, dz] of [[1, 0], [2, 0], [-1, 0], [-2, 0], [0, 1], [0, 2], [0, -1], [0, -2], [3, 0], [-3, 0], [0, 3], [0, -3]]) c.w.set(x + dx, g + 7 - (Math.abs(dx) + Math.abs(dz) > 2 ? 1 : 0), z + dz, B.Leaves);
  }
  spots.mirageStart = V(430, 0, 30);
  spots.duneSea = V(380, t.ground(380, 70), 70);
  spots.quicksand = V(338, t.ground(338, 96), 96);
  spots.quicksandSign = V(332, t.ground(332, 104) + 2, 104);
  spots.roadrunnerRoad = V(470, t.ground(470, 166), 166);
  spots.rocketPad = V(456, t.ground(456, 170), 170.5);
  spots.mesaWall = V(520, 30, 220);
  spots.friendlyCactus = V(350, t.ground(350, 178), 178);
}

// ---------------------------------------------------------------- vegetation

function scatter(c: Ctx) {
  const { t, rng } = c;
  const free = (x: number, z: number, r: number) => {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, zz = z + dz;
        if (!t.inside(xx, zz)) return false;
        if (t.claimed[t.idx(xx, zz)]) return false;
      }
    return true;
  };
  const cell = (step: number, fn: (x: number, z: number) => void) => {
    for (let z = 4; z < SZ - 4; z += step) for (let x = 4; x < SX - 4; x += step) fn(x + Math.floor(rng() * step), z + Math.floor(rng() * step));
  };
  cell(6, (x, z) => {
    if (x >= SX - 4 || z >= SZ - 4) return;
    const b = t.biomeAt(x, z);
    if (b === Biome.Forest || b === Biome.Mountain) {
      if (t.slope(x, z) > 2 || t.ground(x, z) > 72) return;
      const dens = 0.5 + fbm(x / 40, z / 40, 51) * 0.5;
      if (rng() > dens) return;
      if (!free(x, z, 2)) return;
      if (b === Biome.Forest && rng() < 0.12) leafyTree(c, x, z, rng() < 0.5 ? B.Leaves : B.LeavesDark);
      else pine(c, x, z, b === Biome.Mountain ? 0.8 : 1);
    } else if (b === Biome.Ridge) {
      if (rng() < 0.12 && t.slope(x, z) <= 1 && free(x, z, 2)) pine(c, x, z, 0.8);
    } else if (b === Biome.Swamp) {
      if (rng() < 0.35 && free(x, z, 1)) cypress(c, x, z);
    }
  });
  cell(20, (x, z) => {
    const b = t.biomeAt(x, z);
    if (b === Biome.Savanna) {
      const r = rng();
      if (r < 0.32 && free(x, z, 4) && t.slope(x, z) <= 1) acacia(c, x, z);
      else if (r < 0.5 && free(x, z, 2)) termiteMound(c, x, z);
      else if (r < 0.6 && free(x, z, 2)) boulder(c, x, z, 1.5 + rng() * 1.5);
    }
  });
  cell(13, (x, z) => {
    const b = t.biomeAt(x, z);
    if (b !== Biome.Desert || t.ground(x, z) > 30) return;
    const r = rng();
    if (r < 0.3 && free(x, z, 2)) cactus(c, x, z);
    else if (r < 0.36 && free(x, z, 2)) boulder(c, x, z, 1 + rng() * 2, W.SandA);
    else if (r < 0.38 && free(x, z, 1)) c.w.set(x, t.ground(x, z), z, W.Bone);
  });
}

export function buildStructures(world: VoxelWorld, t: Terrain): Spots {
  const c: Ctx = { w: world, t, rng: mulberry32(4242), spots: {} };
  depot(c);
  rangerStation(c);
  busStop(c);
  campground(c);
  bearCave(c);
  lumberCamp(c);
  gatorShow(c);
  rapidsDock(c);
  bungeeBridge(c);
  lodge(c);
  balloonPad(c);
  airstrip(c);
  overlook(c);
  prideRock(c);
  gasStation(c);
  trailer(c);
  cropCircle(c);
  testSite(c);
  hippoCrossing(c);
  piranhaPool(c);
  beaverDam(c);
  oasisMirage(c);
  // Hero trees.
  c.spots.baobab = baobab(c, 340, 470);
  c.spots.baobabBase = V(340.5, t.ground(344, 476), 476);
  c.spots.vultureTree = deadTree(c, 590, 520, 13);
  c.spots.vultureBase = V(590.5, t.ground(590, 524), 524);
  c.spots.cactusFriend = c.spots.friendlyCactus;
  scatter(c);
  return c.spots;
}
