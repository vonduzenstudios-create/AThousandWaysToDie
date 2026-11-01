import * as THREE from 'three';
import type { PartName } from '../character';
import { VOXEL, VoxelGrid, mixHex, shade, speckle } from './grid';
import type { Expression, PersonSpec } from './spec';

/** Same shape as Character's parts, so ragdoll.ts can use them unchanged. */
export interface VoxelPart {
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  /** Size of the collision box in world units (details like hat brims and shoe toes stick out of it). */
  size: THREE.Vector3;
}

export interface VoxelBody {
  /** Group with feet at y = 0, facing +z. Holds one pivot per part. */
  body: THREE.Group;
  parts: Record<PartName, VoxelPart>;
  /** Hats, glasses, held items. Children of part meshes; pop them off for comedy. */
  accessories: THREE.Mesh[];
  /** One shared material per person, so tint/flash affect just this person. White, multiplied by vertex colors. */
  material: THREE.MeshLambertMaterial;
  /** Height of the top of the head (without hat), in world units. */
  headTop: number;
  /** Swap the face (eyes etc.) by rebuilding just the head mesh. */
  setExpression(e: Expression): void;
  dispose(): void;
}

/** Part sizes in voxels. The head stays the same size at every age, which is what makes kids read as kids. */
export function dims(s: PersonSpec) {
  const torsoW = s.build === 'slim' ? 6 : s.build === 'heavy' || s.build === 'buff' ? 10 : 8;
  const torsoD = s.build === 'heavy' ? 7 : s.build === 'slim' ? 5 : 6;
  const age = s.age;
  // Stature stretches or squashes the body under the same big head.
  const st = age === 'child' ? 0 : s.stature === 'tall' ? 1 : s.stature === 'short' ? -1 : 0;
  const torsoH = (age === 'child' ? 5 : age === 'teen' ? 7 : 8) + st;
  const legH = (age === 'child' ? 4 : age === 'teen' ? 5 : 6) + st;
  const armH = (age === 'child' ? 5 : age === 'teen' ? 6 : 7) + st;
  const legW = s.build === 'heavy' || s.build === 'buff' ? 5 : s.build === 'slim' ? 3 : 4;
  return {
    head: [12, 11, 11] as const,
    torso: [torsoW, torsoH, torsoD] as const,
    arm: [s.build === 'buff' ? 4 : 3, armH, 4] as const,
    leg: [legW, legH, 5] as const,
    scale: age === 'child' ? 0.8 : age === 'elder' ? 0.97 : 1,
  };
}
type Dims = ReturnType<typeof dims>;

const BLACK = 0x15151a;
const WHITE = 0xf4f4f4;
const GOLD = 0xe8b830;

// ---------------------------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------------------------

function paintHead(g: VoxelGrid, s: PersonSpec, expr: Expression) {
  const [W, H, D] = [12, 11, 11];
  const F = D - 1; // front layer
  const skin = expr === 'sick' ? mixHex(s.skin, 0x6ac040, 0.45) : s.skin;
  g.box(0, 0, 0, W - 1, H - 1, D - 1, skin);
  // Round the jaw a little.
  g.clear(0, 0, F, 0, 0, F);
  g.clear(W - 1, 0, F, W - 1, 0, F);
  g.clear(0, 0, 0, 0, 0, 0);
  g.clear(W - 1, 0, 0, W - 1, 0, 0);
  // Ears.
  const ear = shade(skin, 0.92);
  g.box(-1, 3, 4, -1, 5, 5, ear);
  g.box(W, 3, 4, W, 5, 5, ear);

  paintHair(g, s);

  // Skin marks.
  const marks = s.marks;
  if (s.age === 'child' || marks.includes('blush')) {
    const blush = mixHex(skin, 0xff6a6a, 0.35);
    g.set(2, 2, F, blush);
    g.set(9, 2, F, blush);
  }
  if (marks.includes('freckles')) {
    const fr = mixHex(skin, 0x8a4a22, 0.45);
    for (const [x, y] of [[2, 3], [4, 3], [3, 2], [7, 3], [9, 3], [8, 2]]) g.set(x, y, F, fr);
  }
  if (marks.includes('mole')) g.set(8, 2, F, mixHex(skin, 0x3a2010, 0.7));
  if (marks.includes('eyebags') || expr === 'sick') {
    const bag = mixHex(skin, 0x5a3a6a, 0.3);
    g.box(3, 3, F, 4, 3, F, bag);
    g.box(7, 3, F, 8, 3, F, bag);
  }
  if (marks.includes('scar')) for (let i = 0; i < 4; i++) g.set(10 - i, 3 + i, F, mixHex(skin, 0xc04a4a, 0.4));

  paintFacialHair(g, s, skin, F);
  paintFace(g, s, F, expr);

  if (marks.includes('bandage')) {
    g.box(2, 8, F, 5, 8, F, 0xf0e0c8);
    g.set(3, 8, F, 0xd8c0a0);
    g.set(4, 8, F, 0xd8c0a0);
  }
  if (marks.includes('eyepatch')) {
    g.box(7, 3, F, 9, 6, F, 0x15151a);
    g.box(10, 6, F, 11, 6, F, 0x15151a);
    g.box(2, 7, F, 6, 7, F, 0x15151a);
    g.box(0, 7, 6, 0, 7, F, 0x15151a);
    g.box(W - 1, 6, 6, W - 1, 6, F, 0x15151a);
  }
}

function paintFacialHair(g: VoxelGrid, s: PersonSpec, skin: number, F: number) {
  const W = 12;
  const c = s.hair;
  switch (s.facial) {
    case 'mustache':
      g.box(3, 2, F, 8, 2, F, c);
      break;
    case 'handlebar':
      g.box(3, 2, F, 8, 2, F, c);
      g.set(2, 2, F, c);
      g.set(9, 2, F, c);
      g.set(1, 3, F, c);
      g.set(10, 3, F, c);
      break;
    case 'beard':
      g.box(1, 0, F, 10, 2, F, c);
      g.box(0, 0, 5, 0, 4, F, c);
      g.box(W - 1, 0, 5, W - 1, 4, F, c);
      g.box(2, -1, 3, 9, -1, F, c);
      g.box(3, 0, F + 1, 8, 1, F + 1, c);
      g.set(5, 1, F, skin); // mouth gap
      g.set(6, 1, F, skin);
      break;
    case 'goatee':
      g.box(4, 2, F, 7, 2, F, c);
      g.box(4, 0, F, 7, 0, F, c);
      g.box(5, -1, F - 1, 6, -1, F, c);
      break;
    case 'soulPatch':
      g.box(5, 0, F, 6, 0, F, c);
      break;
    case 'chinstrap':
      g.box(0, 0, 6, 0, 5, F, c);
      g.box(W - 1, 0, 6, W - 1, 5, F, c);
      g.box(1, 0, F, 10, 0, F, c);
      g.box(2, -1, 5, 9, -1, F, c);
      break;
    case 'stubble':
      g.paint(1, 0, F, 10, 2, F, (x, y) => ((x + y) % 2 ? mixHex(skin, c, 0.35) : skin));
      break;
  }
}

function paintFace(g: VoxelGrid, s: PersonSpec, F: number, expr: Expression) {
  const MOUTH = 0x5a1e1e;
  const browC = s.hairStyle === 'bald' || s.hairStyle === 'buzz' ? shade(s.hair === 0 ? 0x2a2a2a : s.hair, 0.8) : s.hair;
  // Expressions override the person's resting eyes and mouth.
  const eyes = expr === 'normal' ? s.eyes : null;
  const mouth = expr === 'normal' ? s.mouth : null;

  const eye = (x0: number, left: boolean) => {
    const inner = left ? x0 + 1 : x0;
    const outer = left ? x0 : x0 + 1;
    // Brows.
    const brows = expr === 'normal' ? s.brows : expr === 'shock' ? 'thin' : expr === 'sick' ? 'worried' : 'none';
    const b8 = expr === 'shock' ? 8 : 7;
    switch (brows) {
      case 'thin':
        g.box(x0, b8, F, x0 + 1, b8, F, browC);
        break;
      case 'thick':
        g.box(left ? x0 - 1 : x0, 7, F, left ? x0 + 1 : x0 + 2, 7, F, browC);
        g.box(x0, 8, F, x0 + 1, 8, F, browC);
        break;
      case 'angry':
        g.set(outer, 8, F, browC);
        g.set(inner, 7, F, browC);
        g.set(left ? x0 + 2 : x0 - 1, 7, F, browC);
        break;
      case 'worried':
        g.set(outer, 7, F, browC);
        g.set(inner, 8, F, browC);
        break;
      case 'uni':
        g.box(2, 7, F, 9, 7, F, browC);
        break;
    }
    switch (expr) {
      case 'blink':
        g.box(x0, 4, F, x0 + 1, 4, F, BLACK);
        return;
      case 'happy': // ^ ^
        g.set(x0, 5, F, BLACK);
        g.set(x0 + 1, 5, F, BLACK);
        g.set(x0 - 1, 4, F, BLACK);
        g.set(x0 + 2, 4, F, BLACK);
        return;
      case 'dead': // X X
        for (let i = 0; i < 3; i++) {
          g.set(x0 - 1 + i, 3 + i, F, BLACK);
          g.set(x0 + 1 - i, 3 + i, F, BLACK);
        }
        return;
      case 'shock':
        g.box(x0, 3, F, x0 + 1, 6, F, WHITE);
        g.box(x0, 4, F, x0 + 1, 5, F, BLACK);
        return;
      case 'sick':
        g.box(x0, 4, F, x0 + 1, 4, F, BLACK);
        g.box(x0, 5, F, x0 + 1, 5, F, 0x3a5a2a);
        return;
    }
    switch (eyes) {
      case 'dot':
        g.box(x0, 4, F, x0 + 1, 5, F, BLACK);
        break;
      case 'wide':
        g.box(x0, 4, F, x0 + 1, 6, F, WHITE);
        g.box(inner, 4, F, inner, 5, F, BLACK);
        break;
      case 'sleepy':
        g.box(x0, 4, F, x0 + 1, 4, F, BLACK);
        g.box(x0, 5, F, x0 + 1, 5, F, shade(s.skin, 0.8));
        break;
      case 'small':
        g.box(inner, 4, F, inner, 5, F, BLACK);
        break;
      case 'lashes':
        g.box(x0, 4, F, x0 + 1, 6, F, BLACK);
        g.set(left ? x0 - 1 : x0 + 2, 6, F, BLACK);
        g.set(left ? x0 - 1 : x0 + 2, 7, F, BLACK);
        break;
      case 'angry':
        g.box(x0, 4, F, x0 + 1, 6, F, BLACK);
        g.set(inner, 6, F, s.skin);
        break;
      default: // tall, like the reference
        g.box(x0, 4, F, x0 + 1, 6, F, BLACK);
    }
  };
  eye(3, true);
  eye(7, false);

  // Mouths.
  if (expr === 'shock') g.box(5, 1, F, 6, 2, F, MOUTH);
  if (expr === 'happy') {
    g.box(4, 1, F, 7, 1, F, MOUTH);
    g.set(3, 2, F, MOUTH);
    g.set(8, 2, F, MOUTH);
  }
  if (expr === 'dead') g.box(4, 1, F, 7, 1, F, MOUTH);
  if (expr === 'sick') g.box(4, 1, F, 7, 1, F, 0x3a5a2a);
  if (s.facial === 'beard' && mouth !== 'open' && mouth !== 'teeth') return;
  switch (mouth) {
    case 'smile':
      g.box(4, 1, F, 7, 1, F, MOUTH);
      g.set(3, 2, F, MOUTH);
      g.set(8, 2, F, MOUTH);
      break;
    case 'flat':
      g.box(4, 1, F, 7, 1, F, MOUTH);
      break;
    case 'frown':
      g.box(4, 2, F, 7, 2, F, MOUTH);
      g.set(3, 1, F, MOUTH);
      g.set(8, 1, F, MOUTH);
      break;
    case 'teeth':
      g.box(4, 1, F, 7, 2, F, MOUTH);
      g.box(5, 1, F, 6, 1, F, WHITE);
      break;
    case 'open':
      g.box(5, 1, F, 6, 2, F, MOUTH);
      break;
    case 'smirk':
      g.box(5, 1, F, 7, 1, F, MOUTH);
      g.set(8, 2, F, MOUTH);
      break;
  }
}

function paintHair(g: VoxelGrid, s: PersonSpec) {
  const c = s.hair;
  const W = 12, H = 11, D = 11, F = D - 1;
  const st = s.hairStyle;
  if (st === 'bald') return;
  if (st === 'ring' || st === 'combover') {
    g.paint(0, 4, 0, W - 1, 7, 6, c);
    g.paint(0, 4, 0, W - 1, 8, 0, c);
    // A few brave strands dragged across the top.
    if (st === 'combover') for (let z = 1; z < D; z += 2) g.box(0, H, z, W - 3, H, z, c);
    return;
  }
  if (st === 'buzz') {
    const fuzz = mixHex(s.skin, c, 0.55);
    g.paint(0, H - 1, 0, W - 1, H - 1, D - 1, fuzz);
    g.paint(0, 4, 0, W - 1, H - 1, 1, fuzz);
    g.paint(0, 6, 0, 0, H - 1, 7, fuzz);
    g.paint(W - 1, 6, 0, W - 1, H - 1, 7, fuzz);
    return;
  }
  // Every other style starts from a short cut: top, back, temples and sideburns.
  const cap = st === 'slick' ? shade(c, 1.15) : c;
  g.paint(0, H - 2, 0, W - 1, H - 1, D - 1, cap);
  g.paint(0, 3, 0, W - 1, H - 1, 1, c);
  g.paint(0, 6, 0, 0, H - 1, 8, c);
  g.paint(W - 1, 6, 0, W - 1, H - 1, 8, c);
  g.paint(0, 5, 7, 0, 8, 8, c); // sideburns
  g.paint(W - 1, 5, 7, W - 1, 8, 8, c);
  g.paint(0, H - 3, F, 2, H - 3, F, c); // temples
  g.paint(W - 3, H - 3, F, W - 1, H - 3, F, c);
  if (st === 'slick') g.paint(0, H - 2, F, 7, H - 2, F, c);

  if (st === 'spiky') {
    for (let x = 0; x < W; x += 2) for (let z = 1; z < D; z += 3) g.box(x, H, z + (x % 4 ? 1 : 0), x + 1, H, z + (x % 4 ? 1 : 0), c);
    g.box(1, H, F - 1, W - 2, H, F, c);
    g.box(3, H - 3, F + 1, 8, H - 2, F + 1, c); // spiky fringe
    g.box(4, H - 4, F + 1, 5, H - 4, F + 1, c);
  }
  if (st === 'curly') {
    // A puffy outer shell with a few bumps, leaving the face open.
    g.box(-1, H - 4, -1, W, H, D, (x, y, z) => {
      if (g.has(x, y, z)) return null;
      if (z >= F - 2 && y < H - 1 && x >= 0 && x < W) return null;
      if (z > F - 1 && y < H - 1) return null;
      const edgeX = x === -1 || x === W, edgeZ = z === -1 || z === D;
      if (edgeX && edgeZ) return null;
      if ((edgeX || edgeZ) && y === H && (x + z) % 2) return null;
      return shade(c, (x * 3 + y + z * 5) % 7 === 0 ? 0.85 : 1);
    });
    g.box(1, H + 1, 1, W - 2, H + 1, D - 2, (x, _y, z) => ((x + z) % 3 === 0 ? null : c));
  }
  if (st === 'long') {
    g.box(-1, 0, -1, W, H - 2, 3, (x, y, z) => (x >= 0 && x < W && z >= 0 ? (g.has(x, y, z) ? c : c) : c));
    g.box(-1, 2, 0, -1, H - 1, 7, c);
    g.box(W, 2, 0, W, H - 1, 7, c);
    g.box(0, H, 0, W - 1, H, F, c);
    g.box(0, H - 2, F + 1, 6, H - 1, F + 1, c); // side-swept fringe
    g.clear(-1, 3, 4, -1, 5, 5); // let the ears poke through
    g.clear(W, 3, 4, W, 5, 5);
    g.set(-1, 3, 4, shade(s.skin, 0.92));
    g.set(W, 3, 4, shade(s.skin, 0.92));
  }
  if (st === 'bun') g.box(4, H, 2, 7, H + 2, 5, c);
  if (st === 'topknot') {
    g.box(5, H, 4, 6, H, 6, shade(c, 0.8));
    g.box(4, H + 1, 4, 7, H + 2, 6, c);
  }
  if (st === 'afro') {
    // Big round cloud behind and above the face.
    const cx = 5.5, cy = H - 1.5, cz = 4;
    g.box(-3, 3, -3, W + 2, H + 4, F - 1, (x, y, z) => {
      if (g.has(x, y, z)) return null;
      const d = ((x - cx) / 8.4) ** 2 + ((y - cy) / 6.2) ** 2 + ((z - cz) / 7.6) ** 2;
      if (d > 1) return null;
      if (z >= F - 2 && y < H - 1 && x >= 0 && x < W) return null;
      return shade(c, (x * 5 + y * 3 + z) % 6 === 0 ? 0.85 : 1);
    });
    g.box(0, H - 2, F + 1, W - 1, H, F + 1, c); // hairline in front
    g.clear(-1, 3, 4, -1, 5, 5);
    g.clear(W, 3, 4, W, 5, 5);
  }
  if (st === 'bob') {
    g.box(-1, 2, 0, -1, H - 1, 8, c);
    g.box(W, 2, 0, W, H - 1, 8, c);
    g.box(0, 2, -1, W - 1, H - 1, -1, c);
    g.box(-1, H, -1, W, H, D - 1, c);
    g.box(0, H - 2, F + 1, W - 1, H - 1, F + 1, c); // straight bangs
    g.box(-1, 2, 0, W, 2, 8, shade(c, 0.85));
  }
  if (st === 'pigtails') {
    for (const x of [-3, W + 1]) {
      g.box(x, 3, 3, x + 1, 7, 5, c);
      g.box(x, 8, 3, x + 1, 8, 5, 0xe0406a); // hair ties
      g.box(x, 2, 4, x + 1, 2, 4, c);
    }
    g.box(-2, 7, 3, -1, 8, 5, c);
    g.box(W, 7, 3, W + 1, 8, 5, c);
  }
  if (st === 'braids') {
    g.box(0, 2, -1, W - 1, H - 1, -1, c);
    for (const x0 of [2, 8])
      g.box(x0, -6, -2, x0 + 1, 2, -2, (_x, y) => (y === -6 ? 0xe0406a : y % 2 ? c : shade(c, 0.82)));
  }
  if (st === 'pony') {
    g.box(5, 7, -1, 6, 9, -1, shade(c, 0.85));
    g.box(5, 2, -2, 6, 8, -2, c);
  }
  if (st === 'mohawk') {
    g.paint(0, H - 2, 0, 3, H - 1, D - 1, shade(s.skin, 0.95));
    g.paint(8, H - 2, 0, W - 1, H - 1, D - 1, shade(s.skin, 0.95));
    g.paint(0, 6, 0, 0, H - 1, 8, s.skin);
    g.paint(W - 1, 6, 0, W - 1, H - 1, 8, s.skin);
    g.box(5, H, 0, 6, H + 2, F, c);
  }
}

/** Hats and glasses get their own grids in head coordinates, so they can fly off separately. */
function paintHat(g: VoxelGrid, s: PersonSpec) {
  const W = 12, H = 11, D = 11;
  const hc = s.hatColor;
  switch (s.hat) {
    case 'straw': {
      const straw = speckle(s.seed, [0xd8a640, 0xc08a2c, 0xe8c060, 0xa87420], [3, 3, 2, 1]);
      const brimEdge = speckle(s.seed + 1, [0x8a5a1c, 0x9a6a24, 0x7a4a14]);
      // Brim sits at the forehead and is wider than the head; outer ring is darker.
      g.box(-4, H - 3, -4, W + 3, H - 3, D + 3, (x, _y, z) => {
        const edge = x === -4 || x === W + 3 || z === -4 || z === D + 3;
        const corner = (x <= -3 || x >= W + 2) && (z <= -3 || z >= D + 2);
        if (corner) return null;
        return edge ? brimEdge(x, 0, z) : straw(x, 0, z);
      });
      g.box(-1, H - 2, -1, W, H + 1, D, straw);
      g.box(-1, H - 2, -1, W, H - 2, D, 0x3f8a2a); // green band like the reference
      g.box(0, H + 2, 0, W - 1, H + 2, D - 1, straw);
      g.box(2, H + 3, 2, W - 3, H + 3, D - 3, straw);
      // A few stray straws.
      g.set(W + 4, H - 3, 3, 0xe8c060);
      g.set(-5, H - 3, 7, 0xe8c060);
      break;
    }
    case 'cap':
    case 'capBack': {
      g.box(-1, H - 2, -1, W, H, D, hc);
      g.box(0, H + 1, 0, W - 1, H + 1, D - 1, hc);
      const back = s.hat === 'capBack';
      const z0 = back ? -5 : D + 1, z1 = back ? -2 : D + 4;
      g.box(1, H - 2, z0, W - 2, H - 2, z1, shade(hc, 0.8));
      g.box(5, H, back ? -1 : D, 6, H, back ? -1 : D, WHITE); // logo
      break;
    }
    case 'chef':
      g.box(-1, H - 2, -1, W, H - 1, D, WHITE);
      g.box(0, H, 0, W - 1, H + 4, D - 1, 0xfafafa);
      g.box(-1, H + 5, -1, W, H + 6, D, (x, _y, z) => ((x === -1 || x === W) && (z === -1 || z === D) ? null : 0xfafafa));
      g.box(1, H + 7, 1, W - 2, H + 7, D - 2, 0xfafafa);
      break;
    case 'beanie':
      g.box(-1, H - 3, -1, W, H + 1, D, (_x, y) => (y === H - 3 ? shade(hc, 0.75) : (y + _x) % 2 ? hc : shade(hc, 0.9)));
      g.box(0, H + 2, 0, W - 1, H + 2, D - 1, hc);
      g.box(5, H + 3, 4, 6, H + 4, 6, WHITE);
      break;
    case 'flatcap':
      g.box(-1, H - 2, -1, W, H, D, hc);
      g.box(0, H - 2, D + 1, W - 1, H - 1, D + 2, shade(hc, 0.85));
      break;
    case 'visor':
      g.box(-1, H - 3, -1, W, H - 2, D, hc);
      g.box(1, H - 3, D + 1, W - 2, H - 3, D + 4, hc);
      break;
    case 'police':
      g.box(-1, H - 2, -1, W, H - 1, D, shade(hc, 0.7)); // band
      g.box(-2, H, -2, W + 1, H + 1, D + 1, (x, _y, z) => ((x === -2 || x === W + 1) && (z === -2 || z === D + 1) ? null : hc));
      g.box(1, H - 2, D + 1, W - 2, H - 2, D + 3, 0x111114); // shiny visor
      g.box(5, H - 1, D + 1, 6, H, D + 1, GOLD); // badge
      break;
    case 'hardhat':
      g.box(-2, H - 3, -2, W + 1, H - 3, D + 2, (x, _y, z) => ((x === -2 || x === W + 1) && (z === -2 || z === D + 2) ? null : shade(hc, 0.92)));
      g.box(-1, H - 2, -1, W, H, D, hc);
      g.box(0, H + 1, 0, W - 1, H + 1, D - 1, hc);
      g.box(1, H + 2, 1, W - 2, H + 2, D - 2, hc);
      g.box(5, H + 1, -1, 6, H + 3, D, shade(hc, 1.1)); // ridge
      break;
    case 'cowboy': {
      const dk = shade(hc, 0.75);
      g.box(-4, H - 3, -3, W + 3, H - 3, D + 2, (x, _y, z) => ((x <= -3 || x >= W + 2) && (z <= -2 || z >= D + 1) ? null : hc));
      g.box(-4, H - 2, -3, -4, H - 2, D + 2, hc); // brim curls up at the sides
      g.box(W + 3, H - 2, -3, W + 3, H - 2, D + 2, hc);
      g.box(0, H - 2, 0, W - 1, H + 2, D - 1, hc);
      g.box(0, H - 2, 0, W - 1, H - 2, D - 1, dk); // band
      g.clear(4, H + 2, 2, 7, H + 2, D - 3); // crease
      g.box(4, H + 1, 2, 7, H + 1, D - 3, dk);
      break;
    }
    case 'tophat':
      g.box(-2, H - 2, -2, W + 1, H - 2, D + 1, hc);
      g.box(1, H - 1, 1, W - 2, H + 6, D - 2, hc);
      g.box(1, H - 1, 1, W - 2, H, D - 2, 0xa02a2a);
      break;
    case 'bucket':
      g.box(-2, H - 3, -2, W + 1, H - 3, D + 1, shade(hc, 0.9));
      g.box(-1, H - 2, -1, W, H + 1, D, hc);
      g.box(0, H + 2, 0, W - 1, H + 2, D - 1, hc);
      break;
    case 'beret':
      g.box(-1, H - 1, -1, W, H, D, hc);
      g.box(-2, H, 2, -2, H, D - 2, hc); // slouches to one side
      g.box(6, H + 1, 5, 6, H + 1, 5, shade(hc, 0.8));
      break;
    case 'party':
      for (let i = 0; i < 7; i++) {
        const r = 4 - Math.floor(i * 0.6);
        g.box(6 - r, H + i - 1, 5 - r, 5 + r, H + i - 1, 5 + r, i % 2 ? hc : 0xf2e040);
      }
      g.box(5, H + 6, 4, 6, H + 7, 5, 0xf2f2f2);
      break;
    case 'bow':
      g.box(7, H, 6, 11, H + 2, 7, hc);
      g.clear(8, H + 2, 6, 8, H + 2, 7);
      g.clear(10, H + 2, 6, 10, H + 2, 7);
      g.box(9, H, 6, 9, H + 2, 7, shade(hc, 0.75));
      break;
    case 'bandana':
      g.box(-1, H - 3, -1, W, H, D, (x, y, z) => (y === H && (x < 0 || x >= W || z < 0 || z >= D) ? null : (x + z) % 4 === 0 && y > H - 3 ? WHITE : hc));
      g.box(5, H - 4, -2, 6, H - 3, -3, hc); // knot tails
      break;
    case 'headMirror':
      g.box(-1, H - 3, 0, -1, H - 3, D, 0x2a2a30);
      g.box(W, H - 3, 0, W, H - 3, D, 0x2a2a30);
      g.box(0, H - 3, -1, W - 1, H - 3, -1, 0x2a2a30);
      g.box(0, H - 3, D, W - 1, H - 3, D, 0x2a2a30);
      g.box(4, H - 4, D + 1, 7, H - 1, D + 1, (x, y) => ((x === 4 || x === 7) && (y === H - 4 || y === H - 1) ? null : 0xd8e0e8));
      g.box(5, H - 3, D + 1, 6, H - 2, D + 1, 0xffffff);
      break;
  }
}

/** Jewelry and gadgets worn on the head, in head coordinates. */
function paintHeadExtras(g: VoxelGrid, s: PersonSpec) {
  const W = 12, H = 11;
  if (s.extras.includes('earrings')) {
    g.set(-1, 2, 4, GOLD);
    g.set(W, 2, 4, GOLD);
  }
  if (s.extras.includes('headphones')) {
    const c = 0x2a2a30;
    g.box(-1, H, 4, W, H, 5, c);
    g.box(-1, H - 3, 4, -1, H - 1, 5, c);
    g.box(W, H - 3, 4, W, H - 1, 5, c);
    g.box(-2, 3, 3, -2, 6, 6, s.accent);
    g.box(W + 1, 3, 3, W + 1, 6, 6, s.accent);
  }
  if (s.extras.includes('flower')) {
    g.box(W, H - 2, 7, W, H - 1, 8, 0xf06aa8);
    g.set(W + 1, H - 2, 7, 0xf2d040);
    g.set(W, H, 7, 0xf06aa8);
    g.set(W, H - 3, 8, 0xf06aa8);
  }
}

function paintGlasses(g: VoxelGrid, s: PersonSpec) {
  const z = 11;
  if (s.glasses === 'round') {
    // Colored frames with open inner edges, so the eyes still read through them.
    const fc = [0x9a3a2a, 0xc8a040, 0x3a6ac0, 0x6a4a8a][s.seed % 4];
    // Half-rim: a brow bar, outer edges and a bridge. Lighter than full frames at this resolution.
    g.box(2, 7, z, 9, 7, z, fc);
    g.box(2, 5, z, 2, 6, z, fc);
    g.box(9, 5, z, 9, 6, z, fc);
    g.box(5, 6, z, 6, 6, z, fc);
    g.box(3, 3, z, 4, 3, z, fc);
    g.box(7, 3, z, 8, 3, z, fc);
    g.box(-1, 6, 6, -1, 6, 10, fc); // arms back to the ears
    g.box(12, 6, 6, 12, 6, 10, fc);
    g.set(-1, 6, 11, fc);
    g.set(12, 6, 11, fc);
  } else if (s.glasses === 'sun') {
    g.box(1, 4, z, 10, 6, z, (x, y) => (x === 5 || x === 6 ? (y === 6 ? BLACK : null) : y === 6 ? BLACK : 0x24242c));
    g.set(3, 5, z, 0x5a6a8a); // glint
    g.set(8, 5, z, 0x5a6a8a);
  }
}

// ---------------------------------------------------------------------------------------------
// Torso
// ---------------------------------------------------------------------------------------------

function paintTorso(g: VoxelGrid, s: PersonSpec, d: Dims) {
  const [W, H, D] = d.torso;
  const F = D - 1;
  const top = s.top, acc = s.accent;
  g.box(0, 0, 0, W - 1, H - 1, D - 1, top);
  // Neck shadow at the top.
  g.paint(W / 2 - 2, H - 1, 1, W / 2 + 1, H - 1, D - 2, shade(s.skin, 0.8));
  const cx = W / 2; // columns cx-1 and cx are the middle pair

  // Waistline: the bottom row is the pants.
  if (s.lower !== 'skirt') g.paint(0, 0, 0, W - 1, 0, D - 1, s.bottoms);
  else {
    g.paint(0, 0, 0, W - 1, 1, D - 1, s.bottoms);
    g.box(-1, 0, -1, W, 0, D, s.bottoms); // flared skirt
  }

  switch (s.outfit) {
    case 'overalls': {
      // Bib and straps over a shirt, like the reference farmer.
      g.paint(0, 0, 0, W - 1, 2, D - 1, acc);
      g.paint(1, 3, F, W - 2, H - 3, F, acc);
      g.paint(1, H - 2, F, 2, H - 1, F, acc);
      g.paint(W - 3, H - 2, F, W - 2, H - 1, F, acc);
      g.paint(1, H - 1, 0, 2, H - 1, F, acc);
      g.paint(W - 3, H - 1, 0, W - 2, H - 1, F, acc);
      g.paint(1, 3, 0, 2, H - 1, 0, acc);
      g.paint(W - 3, 3, 0, W - 2, H - 1, 0, acc);
      g.set(2, H - 3, F, GOLD);
      g.set(W - 3, H - 3, F, GOLD);
      // Pocket outline.
      const dk = shade(acc, 0.55);
      g.paint(cx - 2, 2, F, cx + 1, 2, F, dk);
      g.paint(cx - 2, 3, F, cx - 2, 4, F, dk);
      g.paint(cx + 1, 3, F, cx + 1, 4, F, dk);
      g.paint(cx - 1, 4, F, cx, 4, F, dk);
      g.paint(cx - 1, H - 1, F, cx, H - 1, F, shade(top, 1.05)); // collar
      break;
    }
    case 'coveralls': {
      g.paint(cx - 1, 0, F, cx - 1, H - 2, F, shade(top, 0.75)); // zipper
      g.paint(cx - 3 < 1 ? 1 : cx - 3, H - 3, F, cx - 2, H - 3, F, acc); // name patch
      g.paint(cx - 3 < 1 ? 1 : cx - 3, H - 3, F, cx - 3 < 1 ? 1 : cx - 3, H - 3, F, 0xc23a2a);
      g.paint(0, 1, 0, W - 1, 1, D - 1, shade(top, 0.8)); // belt
      // Grease smudges.
      const grease = speckle(s.seed + 9, [0x1e1e22, -1], [1, 14]);
      g.paint(0, 0, 0, W - 1, H - 2, D - 1, (x, y, z) => {
        const c = grease(x, y, z);
        return c === -1 ? null : c;
      });
      g.paint(cx - 2, H - 1, F, cx + 1, H - 1, F, shade(top, 1.15)); // collar
      break;
    }
    case 'mail': {
      // Satchel strap from left shoulder to right hip, front and back.
      const strap = acc;
      for (let y = 0; y < H; y++) {
        const x = Math.round(W - 2 - ((H - 1 - y) * (W - 3)) / (H - 1));
        g.paint(x, y, F, x + 1, y, F, strap);
        g.paint(W - 1 - x - 1, y, 0, W - 1 - x, y, 0, strap);
      }
      g.paint(W - 2, H - 1, 0, W - 1, H - 1, F, strap);
      g.box(-2, 0, 1, -1, 3, D - 2, acc); // the bag on the right hip
      g.box(-2, 2, 1, -2, 3, D - 2, shade(acc, 0.8));
      g.set(-2, 1, D / 2, GOLD);
      g.paint(W - 3, H - 3, F, W - 3, H - 3, F, 0xc23a2a); // patch
      g.paint(W - 2, H - 3, F, W - 2, H - 3, F, WHITE);
      break;
    }
    case 'cardigan': {
      g.paint(cx - 1, 1, F, cx, H - 1, F, acc);
      for (let y = 2; y < H - 1; y += 2) g.set(cx - 2, y, F, 0xf2e8d0);
      g.paint(0, 1, 0, W - 1, 1, D - 1, shade(top, 0.85));
      break;
    }
    case 'hawaiian': {
      const flowers = speckle(s.seed + 3, [top, 0xf2f2f2, 0xf0d040, shade(top, 0.75)], [6, 1.2, 1, 1.5]);
      g.paint(0, 1, 0, W - 1, H - 1, D - 1, flowers);
      g.paint(cx - 1, H - 2, F, cx, H - 1, F, s.skin); // open collar
      break;
    }
    case 'suit':
    case 'loudSuit': {
      g.paint(cx - 1, 2, F, cx, H - 1, F, WHITE);
      g.paint(cx - 2, H - 1, F, cx - 2, H - 1, F, WHITE);
      g.paint(cx + 1, H - 1, F, cx + 1, H - 1, F, WHITE);
      const tie = s.outfit === 'loudSuit' ? speckle(s.seed + 5, [acc, 0xf0d040, 0xf2f2f2]) : acc;
      g.paint(cx - 1, 1, F, cx - 1, H - 2, F, tie);
      if (s.outfit === 'loudSuit') g.paint(cx, 1, F, cx, H - 2, F, tie);
      g.paint(cx - 2, 2, F, cx - 2, H - 2, F, shade(top, 0.8)); // lapels
      g.paint(cx + 1, 2, F, cx + 1, H - 2, F, shade(top, 0.8));
      g.set(1, H - 3, F, s.outfit === 'loudSuit' ? WHITE : acc); // pocket square / name tag
      if (s.outfit === 'loudSuit') g.set(2, H - 3, F, WHITE);
      g.set(cx - 2, 1, F, GOLD);
      break;
    }
    case 'hoodie': {
      const dk = shade(top, 0.82);
      g.paint(2, 1, F, W - 3, 2, F, dk); // pouch pocket
      g.paint(cx - 2, H - 1, F, cx - 2, H - 3, F, acc); // drawstrings
      g.paint(cx + 1, H - 1, F, cx + 1, H - 3, F, acc);
      g.box(1, H - 2, -1, W - 2, H, -1, dk); // hood bunched behind the neck
      g.box(2, H, 0, W - 3, H, 0, dk);
      g.paint(cx - 1, 3, F, cx, 4, F, acc); // logo
      break;
    }
    case 'labCoat': {
      g.paint(cx - 1, 2, F, cx, H - 1, F, acc); // scrubs underneath
      g.paint(cx - 2, 2, F, cx - 2, H - 1, F, 0xdde2e8);
      g.paint(cx + 1, 2, F, cx + 1, H - 1, F, 0xdde2e8);
      g.paint(cx + 2, H - 3, F, cx + 3 > W - 1 ? W - 1 : cx + 3, H - 3, F, 0xdde2e8); // chest pocket
      g.set(cx + 2, H - 2, F, 0x2a4ab0); // pen
      g.box(-1, 0, 0, W, 0, D - 1, top); // coat hangs past the waist
      g.box(0, 0, -1, W - 1, 0, -1, top);
      break;
    }
    case 'cook': {
      g.box(1, 0, D, W - 2, H - 3, D, (x, y) => (y === H - 3 && (x === 1 || x === W - 2) ? null : acc)); // apron
      g.set(3, 2, D, 0xc84a2a); // ketchup
      g.set(W - 4, 4, D, 0xd8a030); // mustard
      g.set(4, 4, D, 0x8a6a4a);
      g.paint(cx - 3, H - 2, F, cx - 3, H - 2, F, 0x6a6a6a);
      g.paint(cx + 2, H - 2, F, cx + 2, H - 2, F, 0x6a6a6a);
      g.box(cx - 1, H - 2, D, cx, H - 2, D, acc); // neck strap
      g.paint(cx - 2, H - 1, F, cx + 1, H - 1, F, shade(top, 0.92));
      break;
    }
    case 'clergy':
      g.paint(cx - 1, H - 1, F, cx, H - 1, F, acc);
      g.paint(cx - 1, H - 2, F, cx, H - 2, F, acc);
      g.paint(0, H - 1, 1, W - 1, H - 1, D - 2, shade(top, 1.4));
      g.paint(cx - 1, H - 1, 1, cx, H - 1, D - 2, acc);
      break;
    case 'hiVis': {
      // Vest over a shirt with two reflective stripes, open down the middle.
      g.paint(0, 1, 0, W - 1, H - 2, D - 1, acc);
      g.paint(0, H - 1, 0, 2, H - 1, D - 1, acc);
      g.paint(W - 3, H - 1, 0, W - 1, H - 1, D - 1, acc);
      g.paint(cx - 1, 1, F, cx, H - 1, F, top);
      g.paint(0, 2, 0, W - 1, 2, D - 1, 0xd8dce0);
      g.paint(0, H - 3, 0, W - 1, H - 3, D - 1, 0xd8dce0);
      g.paint(cx - 1, 1, F, cx, H - 1, F, top);
      break;
    }
    case 'police': {
      g.paint(W - 3, H - 3, F, W - 3, H - 3, F, GOLD); // badge
      g.paint(1, H - 3, F, 2, H - 4, F, shade(top, 0.8)); // pocket
      g.paint(0, 1, 0, W - 1, 1, D - 1, 0x111114); // duty belt
      g.paint(cx - 1, 1, F, cx, 1, F, 0xc0c0c8);
      g.box(-1, 1, 2, -1, 2, 3, 0x111114); // holster on the right hip
      g.box(W, H - 2, 2, W, H - 1, 3, 0x2a2a2a); // radio on the shoulder
      g.paint(cx - 1, 2, F, cx - 1, H - 2, F, shade(top, 0.85)); // button line
      g.paint(cx - 1, H - 1, F, cx, H - 1, F, shade(top, 1.25));
      break;
    }
    case 'construction': {
      g.paint(0, 2, 0, W - 1, H - 2, D - 1, acc);
      g.paint(0, H - 1, 0, 1, H - 1, D - 1, acc);
      g.paint(W - 2, H - 1, 0, W - 1, H - 1, D - 1, acc);
      g.paint(cx - 1, 2, F, cx, H - 1, F, top);
      g.paint(0, 4, 0, W - 1, 4, D - 1, 0xd8dce0);
      g.paint(cx - 1, 2, F, cx, H - 1, F, top);
      g.paint(0, 1, 0, W - 1, 1, D - 1, 0x7a4a22); // tool belt
      g.box(W, 0, 2, W, 2, 4, 0x6a3a1a); // pouch
      g.box(W, 0, 3, W, -2, 3, 0x9aa3ad); // tape measure / tool handle
      break;
    }
    case 'trendy':
      g.paint(cx - 2, 2, F, cx + 1, 4, F, (x, y) => ((y === 4 && (x === cx - 2 || x === cx + 1)) || y === 3 || (y === 2 && (x === cx - 1 || x === cx)) ? acc : null));
      g.paint(0, 1, 0, W - 1, 1, D - 1, s.lower === 'skirt' ? s.bottoms : shade(top, 0.85));
      break;
    case 'tank':
      g.paint(0, H - 1, 0, 1, H - 1, D - 1, s.skin);
      g.paint(W - 2, H - 1, 0, W - 1, H - 1, D - 1, s.skin);
      g.paint(cx - 2, H - 2, F, cx + 1, H - 1, F, s.skin);
      g.paint(0, H - 3, 0, 0, H - 2, D - 1, s.skin); // armholes
      g.paint(W - 1, H - 3, 0, W - 1, H - 2, D - 1, s.skin);
      break;
    case 'polo':
      g.paint(cx - 3, H - 1, F, cx + 2, H - 1, F, shade(top, 1.15)); // collar
      g.paint(cx - 1, H - 3, F, cx - 1, H - 2, F, WHITE); // buttons
      g.paint(W - 3, H - 3, F, W - 3, H - 3, F, acc); // logo
      break;
    case 'sweaterVest': {
      const argyle = (x: number, y: number) => ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0 ? shade(acc, 0.8) : acc);
      g.paint(0, 1, 0, W - 1, H - 2, D - 1, (x, y) => argyle(x, y));
      g.paint(cx - 1, H - 3, F, cx, H - 1, F, top);
      g.paint(cx - 2, H - 1, F, cx + 1, H - 1, F, top);
      break;
    }
    case 'tracksuit':
      g.paint(0, 0, 0, W - 1, H - 1, D - 1, top);
      g.paint(0, 0, 0, 0, H - 1, D - 1, WHITE); // side stripes
      g.paint(W - 1, 0, 0, W - 1, H - 1, D - 1, WHITE);
      g.paint(cx - 1, 0, F, cx - 1, H - 1, F, 0xd0d0d8); // zipper
      g.paint(cx - 2, H - 1, F, cx + 1, H - 1, F, shade(top, 0.85));
      break;
    case 'jacket':
      // Open jacket over a tee.
      g.paint(cx - 2, 1, F, cx + 1, H - 1, F, acc);
      g.paint(cx - 3, 2, F, cx - 3, H - 1, F, shade(top, 0.8));
      g.paint(cx + 2, 2, F, cx + 2, H - 1, F, shade(top, 0.8));
      g.paint(1, 2, F, 1, 3, F, shade(top, 0.7)); // pocket flaps
      g.paint(W - 2, 2, F, W - 2, 3, F, shade(top, 0.7));
      break;
    case 'dress':
      g.paint(0, 0, 0, W - 1, H - 1, D - 1, top);
      g.box(-1, 0, -1, W, 1, D, (x, y, z) => (g.has(x, y, z) ? null : y === 0 ? shade(top, 0.85) : top));
      g.paint(0, 2, 0, W - 1, 2, D - 1, acc); // waist sash
      g.paint(cx - 1, H - 1, F, cx, H - 1, F, s.skin);
      break;
    case 'graphicTee': {
      // A random 4x4 pixel logo on the chest.
      const bits = s.seed >>> 3;
      for (let i = 0; i < 8; i++) {
        if (!((bits >> i) & 1)) continue;
        const x = i % 2, y = (i >> 1) & 3;
        g.paint(cx - 2 + x, 2 + y, F, cx - 2 + x, 2 + y, F, acc);
        g.paint(cx + 1 - x, 2 + y, F, cx + 1 - x, 2 + y, F, acc);
      }
      g.paint(cx - 1, H - 1, F, cx, H - 1, F, s.skin);
      break;
    }
    case 'plaid':
      g.paint(0, 1, 0, W - 1, H - 1, D - 1, (x, y) => ((x >> 1) % 2 === 0 && y % 3 === 0 ? shade(top, 0.55) : (x >> 1) % 2 === 0 || y % 3 === 0 ? shade(top, 0.75) : top));
      g.paint(cx - 1, H - 1, F, cx, H - 1, F, shade(top, 0.6));
      break;
    case 'stripes':
      g.paint(0, 1, 0, W - 1, H - 1, D - 1, (_x, y) => (y % 2 ? acc : top));
      g.paint(cx - 1, H - 1, F, cx, H - 1, F, s.skin);
      break;
    case 'casual':
      g.paint(cx - 1, H - 1, F, cx, H - 1, F, s.skin);
      break;
  }

  // Body shape.
  if (s.build === 'buff') {
    g.box(-1, H - 3, 1, -1, H - 1, D - 2, (x, y, z) => g.get(0, y, z));
    g.box(W, H - 3, 1, W, H - 1, D - 2, (x, y, z) => g.get(W - 1, y, z));
  }
  if (s.build === 'heavy' && s.outfit !== 'cook') g.box(1, 1, D, W - 2, H - 4, D, (x, y) => g.get(x, y, F));

  // Worn extras.
  const ex = s.extras;
  if (ex.includes('chain')) {
    for (let x = cx - 2; x <= cx + 1; x++) g.paint(x, x < cx ? H - 1 - (x - (cx - 2)) : H - 1 - (cx + 1 - x), F, x, x < cx ? H - 1 - (x - (cx - 2)) : H - 1 - (cx + 1 - x), F, GOLD);
    g.paint(cx - 1, H - 3, F, cx, H - 4, F, GOLD);
  }
  if (ex.includes('necklace')) g.paint(cx - 2, H - 2, F, cx + 1, H - 2, F, (x) => (x % 2 ? 0xf8f4ec : 0xe0dcd4));
  if (ex.includes('scarf')) {
    const sc = s.accent === s.top ? shade(s.top, 0.7) : s.accent;
    g.paint(0, H - 1, 0, W - 1, H - 1, D - 1, sc);
    g.box(-1, H - 2, 0, -1, H - 1, D - 1, sc);
    g.box(W, H - 2, 0, W, H - 1, D - 1, sc);
    g.box(0, H - 2, -1, W - 1, H - 1, -1, sc);
    g.box(0, H - 2, D, W - 1, H - 1, D, sc);
    g.box(1, H - 5, D, 2, H - 3, D, (_x, y) => (y === H - 5 ? shade(sc, 0.8) : sc));
  }
  if (ex.includes('bowtie') && !['suit', 'loudSuit', 'clergy'].includes(s.outfit)) {
    const bt = s.outfit === 'casual' ? 0xc02a2a : s.accent;
    g.box(cx - 2, H - 2, D, cx + 1, H - 2, D, bt);
    g.set(cx - 2, H - 1, D, bt);
    g.set(cx + 1, H - 1, D, bt);
    g.box(cx - 1, H - 2, D + 1, cx, H - 2, D + 1, shade(bt, 0.75));
  }
  if (ex.includes('backpack')) {
    const bp = s.accent === s.top ? 0x3a6ac0 : s.accent;
    g.box(1, 1, -2, W - 2, H - 2, -1, bp);
    g.box(2, 2, -3, W - 3, 4, -3, shade(bp, 0.8)); // pocket
    g.paint(1, 1, F, 1, H - 1, F, shade(bp, 0.7)); // straps
    g.paint(W - 2, 1, F, W - 2, H - 1, F, shade(bp, 0.7));
    g.paint(1, H - 1, 0, 1, H - 1, D - 1, shade(bp, 0.7));
    g.paint(W - 2, H - 1, 0, W - 2, H - 1, D - 1, shade(bp, 0.7));
  }
  if (ex.includes('fannypack')) {
    g.paint(0, 1, 0, W - 1, 1, D - 1, 0x2a2a30);
    g.box(cx - 2, 0, D, cx + 1, 1, D, 0xd8402a);
    g.set(cx, 1, D + 1, 0xd0d0d8);
  }
}

// ---------------------------------------------------------------------------------------------
// Limbs
// ---------------------------------------------------------------------------------------------

/** side = +1 for the left arm (+x), -1 for the right arm. */
function paintArm(g: VoxelGrid, s: PersonSpec, d: Dims, side: number) {
  const [W, H, D] = d.arm;
  const out = side > 0 ? W : -1; // column just outside the arm
  g.box(0, 0, 0, W - 1, H - 1, D - 1, s.skin);
  const sleeveColor =
    s.outfit === 'hiVis' || s.outfit === 'construction' ? s.top : s.outfit === 'overalls' ? s.top : s.outfit === 'cook' ? WHITE : s.top;
  if (s.outfit === 'tank') {
    g.paint(0, 2, 0, W - 1, 2, D - 1, shade(s.skin, 0.96));
    g.paint(0, 0, 0, W - 1, 1, D - 1, shade(s.skin, 0.96));
    g.box(side > 0 ? 0 : W - 1, 0, D, side > 0 ? 0 : W - 1, 1, D, s.skin);
    if (side > 0 && s.extras.includes('watch')) g.paint(0, 2, 0, W - 1, 2, D - 1, 0x2a2a30);
    return;
  }
  const long = ['coveralls', 'police', 'tracksuit', 'jacket', 'sweaterVest', 'plaid', 'suit', 'loudSuit', 'hoodie', 'labCoat', 'cook', 'clergy', 'cardigan'].includes(s.outfit) || s.age === 'elder';
  if (long) {
    g.paint(0, 2, 0, W - 1, H - 1, D - 1, sleeveColor);
    g.box(0, 2, -1, W - 1, 2, D, shade(sleeveColor, 0.88)); // cuff
    g.box(out, 2, 0, out, 2, D - 1, shade(sleeveColor, 0.88));
    if (s.outfit === 'suit' || s.outfit === 'loudSuit') g.paint(0, 2, 0, W - 1, 2, D - 1, WHITE);
  } else {
    // Short sleeve that steps out one voxel from the arm, like the reference.
    const sh = Math.min(3, H - 3);
    g.paint(0, H - sh, 0, W - 1, H - 1, D - 1, sleeveColor);
    g.box(out, H - sh, 0, out, H - 1, D - 1, sleeveColor);
    g.box(out, H - sh, 0, out, H - sh, D - 1, shade(sleeveColor, 0.9));
  }
  // Hand: slightly darker so it reads separate from the forearm.
  g.paint(0, 0, 0, W - 1, 1, D - 1, shade(s.skin, 0.96));
  g.box(side > 0 ? 0 : W - 1, 0, D, side > 0 ? 0 : W - 1, 1, D, s.skin); // thumb
  if (side > 0 && s.extras.includes('watch')) {
    g.paint(0, 2, 0, W - 1, 2, D - 1, 0x2a2a30);
    g.set(out, 2, 1, 0x2a2a30);
    g.set(out, 2, 2, 0xd8e0e8);
  }
}

function paintLeg(g: VoxelGrid, s: PersonSpec, d: Dims) {
  const [W, H, D] = d.leg;
  const pants = s.outfit === 'overalls' ? s.accent : s.bottoms;
  g.box(0, 0, 0, W - 1, H - 1, D - 1, pants);
  if (s.lower === 'shorts' || s.lower === 'skirt') {
    g.paint(0, 0, 0, W - 1, H - 3, D - 1, s.skin);
    if (s.lower === 'skirt') g.paint(0, H - 2, 0, W - 1, H - 1, D - 1, s.bottoms);
    g.paint(0, 2, 0, W - 1, 2, D - 1, WHITE); // socks
  }
  if (s.outfit === 'overalls') g.paint(0, 2, 0, W - 1, 2, D - 1, shade(pants, 1.35)); // rolled cuff
  // Shoes: two rows plus a toe that pokes forward.
  const sole = shade(s.shoes, s.shoes < 0x404040 ? 1.8 : 0.6);
  switch (s.shoeStyle) {
    case 'sneakers':
      g.paint(0, 0, 0, W - 1, 1, D - 1, s.shoes);
      g.box(0, 0, D, W - 1, 1, D, s.shoes);
      g.box(0, 0, -1, W - 1, 0, D, WHITE);
      g.paint(0, 0, 0, W - 1, 0, D, WHITE);
      g.set(0, 1, D, WHITE);
      g.set(W - 1, 1, 2, WHITE); // swoosh-ish stripe
      g.set(0, 1, 2, WHITE);
      break;
    case 'boots':
      g.paint(0, 0, 0, W - 1, 3, D - 1, s.shoes);
      g.box(0, 0, D, W - 1, 1, D, s.shoes);
      g.box(0, 0, -1, W - 1, 0, D, shade(s.shoes, 0.55));
      g.paint(0, 3, 0, W - 1, 3, D - 1, shade(s.shoes, 0.8));
      break;
    case 'sandals':
      g.paint(0, 0, 0, W - 1, 1, D - 1, s.skin);
      g.box(0, 0, D, W - 1, 0, D, s.skin);
      g.box(0, 0, -1, W - 1, 0, D, 0x7a5232);
      g.paint(0, 0, 0, W - 1, 0, D, 0x7a5232);
      g.paint(0, 1, D - 2, W - 1, 1, D - 2, 0x7a5232);
      break;
    default:
      g.paint(0, 0, 0, W - 1, 1, D - 1, s.shoes);
      g.box(0, 0, D, W - 1, 1, D, s.shoes);
      g.box(0, 0, -1, W - 1, 0, D, sole);
      g.paint(0, 0, 0, W - 1, 0, D, sole);
  }
}

// ---------------------------------------------------------------------------------------------
// Held items, in right-arm coordinates (hand is rows 0-1, front is z = 3)
// ---------------------------------------------------------------------------------------------

function paintHeld(g: VoxelGrid, s: PersonSpec): boolean {
  const wood = speckle(s.seed + 2, [0x8a5a2a, 0x7a4a22, 0x9a6a32]);
  const metal = 0xb8c0c8;
  const fz = 4; // just in front of the fist
  switch (s.held) {
    case 'pitchfork':
      g.box(1, -9, fz, 1, 12, fz, wood);
      g.box(-1, 13, fz, 3, 13, fz, metal);
      for (const x of [-1, 1, 3]) g.box(x, 14, fz, x, 17, fz, metal);
      return true;
    case 'wrench':
      g.box(1, 0, fz, 1, 0, fz + 6, metal);
      g.box(0, -1, fz + 7, 2, 1, fz + 7, metal);
      g.box(0, -1, fz + 8, 0, 1, fz + 8, metal);
      g.box(2, -1, fz + 8, 2, 1, fz + 8, metal);
      return true;
    case 'parcel':
      g.box(-1, -3, fz, 3, 1, fz + 4, 0xc8945a);
      g.box(1, -3, fz, 1, 1, fz + 4, 0xe8d8b0); // tape
      g.box(-1, 1, fz + 2, 3, 1, fz + 2, 0xe8d8b0);
      return true;
    case 'cane':
      g.box(1, -9, fz, 1, 1, fz, wood);
      g.box(1, 2, fz, 1, 2, fz + 2, wood);
      g.box(1, 1, fz + 2, 1, 1, fz + 2, wood);
      return true;
    case 'briefcase':
      g.box(1, -1, fz - 2, 1, -1, fz - 1, 0x2a2a2a);
      g.box(0, -6, fz - 4, 2, -2, fz + 1, 0x5a3a22);
      g.box(0, -2, fz - 4, 2, -2, fz + 1, 0x4a2a16);
      g.set(1, -3, fz + 2, GOLD);
      g.set(1, -3, fz - 5, GOLD);
      return true;
    case 'phone':
      g.box(0, 0, fz, 2, 3, fz, 0x2a2a30);
      g.box(0, 1, fz + 1, 2, 3, fz + 1, (x, y) => (y === 3 && x === 1 ? 0xffffff : 0x6ac0f0));
      return true;
    case 'spatula':
      g.box(1, -4, fz, 1, 1, fz, 0x2a2a2a);
      g.box(-1, -8, fz, 3, -5, fz, metal);
      return true;
    case 'stopSign': {
      g.box(1, -6, fz, 1, 12, fz, 0xc8c8c8);
      const cx = 1, cy = 16;
      g.box(cx - 3, cy - 3, fz + 1, cx + 3, cy + 3, fz + 1, (x, y) => {
        const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
        if (dx + dy > 4) return null;
        if (dy === 0 && dx <= 2) return WHITE;
        return dx + dy === 4 ? WHITE : 0xd02a2a;
      });
      return true;
    }
    case 'book':
      g.box(-1, -2, fz, 3, 2, fz + 1, 0x1e1e24);
      g.box(-1, -2, fz + 2, 3, 2, fz + 2, 0xe8e0c8);
      g.box(1, -1, fz + 2, 1, 1, fz + 2, GOLD);
      g.set(0, 0, fz + 2, GOLD);
      g.set(2, 0, fz + 2, GOLD);
      return true;
    case 'donut':
      g.box(-1, 0, fz, 3, 0, fz + 4, (x, _y, z) => {
        const dx = x - 1, dz = z - fz - 2;
        if (Math.abs(dx) + Math.abs(dz) > 3 || (dx === 0 && dz === 0)) return null;
        return 0xc8904a;
      });
      g.box(-1, 1, fz, 3, 1, fz + 4, (x, _y, z) => {
        const dx = x - 1, dz = z - fz - 2;
        if (Math.abs(dx) + Math.abs(dz) > 2 || (dx === 0 && dz === 0)) return null;
        return (x + z) % 3 === 0 ? 0x6ad0f0 : 0xf06aa8; // frosting and sprinkles
      });
      return true;
    case 'hammer':
      g.box(1, -6, fz, 1, 1, fz, wood);
      g.box(-1, -8, fz, 3, -7, fz, 0x6a6a70);
      return true;
    case 'toothbrush':
      g.box(1, -1, fz, 1, 9, fz, 0x5ab0f0);
      g.box(1, 7, fz + 1, 1, 9, fz + 1, WHITE);
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------------------------

/**
 * Build a chunky chibi voxel person. Every part is its own mesh on its own pivot, laid out exactly
 * like Character's box parts: legs hang from the hips, arms from the shoulders, the head sits on
 * the neck, and each part's mesh is centered on its collision box so ragdolls can use it directly.
 */
export function buildVoxelBody(s: PersonSpec): VoxelBody {
  const d = dims(s);
  const V = VOXEL * d.scale;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xffffff });
  const body = new THREE.Group();
  const parts = {} as Record<PartName, VoxelPart>;
  const accessories: THREE.Mesh[] = [];
  const [tW, tH, tD] = d.torso;
  const [lW, lH] = d.leg;
  const [aW, aH] = d.arm;
  const [hW, hH, hD] = d.head;

  const mesh = (g: VoxelGrid, origin: [number, number, number]) => {
    const m = new THREE.Mesh(g.toGeometry(origin, V), material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const add = (name: PartName, g: VoxelGrid, sz: readonly [number, number, number], pivotAt: [number, number, number], centerFromPivot: [number, number, number]) => {
    const pivot = new THREE.Group();
    pivot.position.set(pivotAt[0] * V, pivotAt[1] * V, pivotAt[2] * V);
    const m = mesh(g, [sz[0] / 2, sz[1] / 2, sz[2] / 2]);
    m.position.set(centerFromPivot[0] * V, centerFromPivot[1] * V, centerFromPivot[2] * V);
    pivot.add(m);
    body.add(pivot);
    parts[name] = { pivot, mesh: m, size: new THREE.Vector3(sz[0] * V, sz[1] * V, sz[2] * V) };
    return m;
  };
  const attach = (to: THREE.Mesh, g: VoxelGrid, sz: readonly [number, number, number]) => {
    if (!g.size) return;
    const m = mesh(g, [sz[0] / 2, sz[1] / 2, sz[2] / 2]);
    m.castShadow = false; // a brim shadow over the whole face looks muddy at this scale
    to.add(m);
    accessories.push(m);
  };

  // Legs.
  const legX = lW / 2 + 0.5;
  for (const [name, side] of [['legL', 1], ['legR', -1]] as const) {
    const g = new VoxelGrid(0.07, s.seed + (side > 0 ? 1 : 2));
    paintLeg(g, s, d);
    add(name, g, d.leg, [side * legX, lH, 0], [0, -lH / 2, 0]);
  }

  // Torso.
  const tg = new VoxelGrid(0.06, s.seed + 3);
  paintTorso(tg, s, d);
  add('torso', tg, d.torso, [0, lH, 0], [0, tH / 2, 0]);

  // Head, with hat and glasses as separate meshes in the same coordinates.
  const neckY = lH + tH;
  const headGrid = (e: Expression) => {
    const g = new VoxelGrid(0.06, s.seed + 4);
    paintHead(g, s, e);
    return g;
  };
  const head = add('head', headGrid(s.expression), d.head, [0, neckY, 0], [0, hH / 2, 0]);
  const hat = new VoxelGrid(0.1, s.seed + 5);
  paintHat(hat, s);
  attach(head, hat, d.head);
  const glasses = new VoxelGrid(0.02, s.seed + 6);
  paintGlasses(glasses, s);
  paintHeadExtras(glasses, s);
  attach(head, glasses, d.head);

  // Arms hang from the shoulders, tucked just under the top of the torso.
  const armX = tW / 2 + aW / 2;
  for (const [name, side] of [['armL', 1], ['armR', -1]] as const) {
    const g = new VoxelGrid(0.06, s.seed + (side > 0 ? 7 : 8));
    paintArm(g, s, d, side);
    const m = add(name, g, d.arm, [side * armX, neckY - 0.5, 0], [0, -aH / 2 + 0.5, 0]);
    if (side < 0) {
      const held = new VoxelGrid(0.05, s.seed + 9);
      if (paintHeld(held, s)) attach(m, held, d.arm);
    }
  }

  const headMesh = parts.head.mesh;
  return {
    body,
    parts,
    accessories,
    material,
    headTop: (neckY + hH) * V,
    setExpression(e: Expression) {
      s.expression = e;
      headMesh.geometry.dispose();
      headMesh.geometry = headGrid(e).toGeometry([hW / 2, hH / 2, hD / 2], V);
    },
    dispose() {
      body.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const p of Object.values(parts)) p.mesh.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      material.dispose();
    },
  };
}
