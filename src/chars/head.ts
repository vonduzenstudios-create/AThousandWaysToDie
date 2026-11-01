import { VoxelGrid, mixHex, shade, speckle } from './grid';
import type { Expression, PersonSpec } from './spec';

/**
 * Head, face, hair, hats and glasses, painted in head coordinates.
 *
 * The head box is HW x HH x HD voxels. +x is the person's left, +y up, +z forward, and the face is
 * the z = F layer. Rows, bottom to top: chin 0-2, mouth 3, mustache 4, nose 5-6, eyes 8-9 (10 for
 * wide eyes), brows 11-12, forehead 13-15. Hair adds one layer outside the box (y = 16, x = -1 and
 * HW, z = -1); hats sit on y = 13 and up, over the forehead.
 */
export const HW = 16, HH = 16, HD = 14;
const F = HD - 1;

const BLACK = 0x17151a;
const WHITE = 0xf6f4f0;
const GOLD = 0xe8b830;
const MOUTH = 0x6a2a24;

// Eye columns (outer..inner) for the person's right (-x side) and left (+x side) eye.
const EYE_R = [3, 4, 5];
const EYE_L = [12, 11, 10];

export function paintHead(g: VoxelGrid, s: PersonSpec, expr: Expression) {
  const skin = expr === 'sick' ? mixHex(s.skin, 0x6ac040, 0.45) : expr === 'dead' ? mixHex(s.skin, 0x9aa0b0, 0.25) : s.skin;
  const W = HW, H = HH;
  g.box(0, 0, 0, W - 1, H - 1, F, skin);
  // Round the skull: bevel the four vertical edges and the top edges.
  for (let y = 0; y < H; y++)
    for (const x of [0, W - 1])
      for (const z of [0, F]) g.set(x, y, z, null);
  for (let x = 0; x < W; x++) {
    g.set(x, H - 1, 0, null);
    g.set(x, H - 1, F, null);
  }
  for (let z = 0; z <= F; z++) {
    g.set(0, H - 1, z, null);
    g.set(W - 1, H - 1, z, null);
  }
  // Jaw tapers toward the chin.
  g.clear(0, 0, 0, 1, 1, F);
  g.clear(W - 2, 0, 0, W - 1, 1, F);
  g.clear(0, 2, 0, 0, 2, F);
  g.clear(W - 1, 2, 0, W - 1, 2, F);
  g.clear(2, 0, 0, W - 3, 0, 3); // back of the jaw meets the neck
  // Cheek and jaw shading so the face reads in flat light.
  const jaw = shade(skin, 0.94);
  g.paint(1, 0, F, W - 2, 1, F, (x) => (x <= 2 || x >= W - 3 ? jaw : null));
  // Ears: three deep, four tall, with a darker inner bowl.
  const ear = shade(skin, 0.95);
  for (const [x, inner] of [[-1, -1], [W, W]] as const) {
    g.box(x, 6, 6, x, 9, 8, ear);
    g.set(inner, 7, 7, shade(skin, 0.78));
    g.set(inner, 8, 7, shade(skin, 0.84));
  }
  // Nose: a two-wide bump with a bridge.
  const nose = shade(skin, 1.03);
  g.box(7, 5, F + 1, 8, 6, F + 1, nose);
  g.box(7, 7, F + 1, 8, 7, F + 1, (x) => (x === 7 ? shade(skin, 0.97) : null));
  g.set(7, 5, F, shade(skin, 0.86)); // nostril shadow
  g.set(8, 5, F, shade(skin, 0.86));

  paintHair(g, s, skin);
  paintMarks(g, s, skin, expr);
  paintFacialHair(g, s, skin);
  paintFace(g, s, skin, expr);
  if (s.extras.includes('mask')) paintMask(g, s);
  if (s.marks.includes('bandage')) {
    g.box(3, 13, F, 8, 14, F, 0xf0e4cc);
    g.box(3, 13, F + 1, 8, 13, F + 1, (x) => (x % 2 ? 0xe0d0b4 : null));
  }
  if (s.marks.includes('eyepatch')) {
    g.box(10, 7, F + 1, 13, 10, F + 1, BLACK);
    g.box(1, 11, F + 1, 9, 11, F + 1, BLACK);
    g.box(14, 10, F, 14, 10, F, BLACK);
    g.box(-1, 11, 4, -1, 11, F - 1, BLACK);
    g.box(W, 10, 4, W, 10, F - 1, BLACK);
  }
}

function paintMarks(g: VoxelGrid, s: PersonSpec, skin: number, expr: Expression) {
  const m = s.marks;
  if (s.age === 'child' || m.includes('blush') || expr === 'happy') {
    const blush = mixHex(skin, 0xff6a6a, 0.3);
    g.box(2, 5, F, 3, 6, F, blush);
    g.box(12, 5, F, 13, 6, F, blush);
  }
  if (m.includes('freckles')) {
    const fr = mixHex(skin, 0x8a4a22, 0.4);
    for (const [x, y] of [[2, 6], [4, 6], [3, 5], [5, 5], [10, 6], [12, 6], [11, 5], [13, 5], [6, 7], [9, 7]]) g.set(x, y, F, fr);
  }
  if (m.includes('mole')) g.set(11, 4, F, mixHex(skin, 0x3a2010, 0.7));
  if (m.includes('eyebags') || expr === 'sick') {
    const bag = mixHex(skin, 0x5a3a6a, 0.28);
    g.box(3, 7, F, 5, 7, F, bag);
    g.box(10, 7, F, 12, 7, F, bag);
  }
  if (m.includes('scar')) for (let i = 0; i < 6; i++) g.set(13 - i, 5 + i, i === 2 || i === 3 ? F : F, mixHex(skin, 0xb84a4a, 0.4));
  // Older faces get a few lines.
  if (s.age === 'elder') {
    const line = shade(skin, 0.86);
    g.box(5, 14, F, 10, 14, F, (x) => (x % 2 ? line : null));
    g.set(2, 9, F, line);
    g.set(13, 9, F, line);
    g.set(5, 4, F, line);
    g.set(10, 4, F, line);
  }
}

function paintFacialHair(g: VoxelGrid, s: PersonSpec, skin: number) {
  const c = s.hair;
  const dk = shade(c, 0.82);
  const W = HW;
  const stache = (wide: number) => {
    g.box(7 - wide, 4, F, 8 + wide, 4, F, c);
    g.box(6 - (wide > 2 ? 1 : 0), 4, F + 1, 9 + (wide > 2 ? 1 : 0), 4, F + 1, c);
    g.set(7 - wide, 3, F, c);
    g.set(8 + wide, 3, F, c);
  };
  switch (s.facial) {
    case 'mustache':
      stache(2);
      g.set(7, 3, F, MOUTH);
      break;
    case 'handlebar':
      // A big push-broom with curled tips, thick enough to stick out from the face.
      g.box(4, 3, F, 11, 4, F, c);
      g.box(5, 3, F + 1, 10, 4, F + 1, c);
      g.box(6, 4, F + 2, 9, 4, F + 2, dk);
      g.box(3, 4, F, 3, 5, F, c);
      g.box(12, 4, F, 12, 5, F, c);
      g.set(2, 6, F, c);
      g.set(13, 6, F, c);
      g.box(7, 5, F + 1, 8, 5, F + 1, shade(s.skin, 1.03)); // keep the nose tip clear
      break;
    case 'beard': {
      // Full beard: wraps the jaw from ear to ear, sticks out in front and hangs below the chin.
      g.paint(0, 0, 6, W - 1, 4, F, (x, y, z) => (z < F && x > 0 && x < W - 1 ? null : y === 3 && x >= 6 && x <= 9 && z === F ? null : c));
      g.paint(0, 5, 6, 0, 8, 10, c); // sideburns
      g.paint(W - 1, 5, 6, W - 1, 8, 10, c);
      g.paint(1, 5, F, 2, 5, F, c);
      g.paint(13, 5, F, 14, 5, F, c);
      g.box(2, 0, F + 1, 13, 2, F + 1, (x, y) => ((x + y) % 5 === 0 ? dk : c));
      g.box(3, -2, 6, 12, -1, F + 1, (x, y, z) => (y === -2 && (x < 5 || x > 10 || z < 9) ? null : (x + z) % 4 === 0 ? dk : c));
      g.box(5, -3, 10, 10, -3, F + 1, (x) => (x === 5 || x === 10 ? null : c));
      g.box(5, 4, F + 1, 10, 4, F + 1, c);
      g.box(7, 3, F, 8, 3, F, MOUTH);
      break;
    }
    case 'goatee':
      stache(1);
      g.box(6, 0, F, 9, 2, F, c);
      g.box(7, -1, F - 2, 8, -1, F, c);
      g.box(6, 0, F + 1, 9, 1, F + 1, dk);
      g.set(7, 3, F, MOUTH);
      g.set(8, 3, F, MOUTH);
      break;
    case 'soulPatch':
      g.box(7, 1, F, 8, 2, F, c);
      break;
    case 'chinstrap':
      g.paint(0, 0, 7, 0, 8, F, c);
      g.paint(W - 1, 0, 7, W - 1, 8, F, c);
      g.paint(1, 0, F, W - 2, 1, F, c);
      g.box(3, -1, 6, 12, -1, F, c);
      break;
    case 'stubble':
      g.paint(1, 0, F, W - 2, 4, F, (x, y) => (y === 4 && (x < 5 || x > 10) ? null : (x * 3 + y * 5) % 4 ? mixHex(skin, c, 0.42) : mixHex(skin, c, 0.25)));
      g.paint(0, 0, 8, 0, 6, F, (_x, y, z) => ((y + z) % 3 ? mixHex(skin, c, 0.35) : null));
      g.paint(W - 1, 0, 8, W - 1, 6, F, (_x, y, z) => ((y + z) % 3 ? mixHex(skin, c, 0.35) : null));
      break;
  }
}

function paintFace(g: VoxelGrid, s: PersonSpec, skin: number, expr: Expression) {
  const hairDark = s.hair === 0 ? 0x2a2a2a : s.hair;
  const browC = ['bald', 'buzz'].includes(s.hairStyle) || s.age === 'elder' ? shade(hairDark, 0.8) : shade(hairDark, 0.9);
  const iris = s.eyeColor ?? 0x3a2414;
  const eyesK = expr === 'normal' ? s.eyes : null;
  const mouthK = expr === 'normal' ? s.mouth : null;
  const brows = expr === 'normal' ? (s.brows === 'none' ? 'thin' : s.brows) : expr === 'shock' ? 'raised' : expr === 'sick' ? 'worried' : expr === 'dead' ? 'none' : 'thin';
  const lid = shade(skin, 0.84);

  const eye = (cols: number[]) => {
    const [o, m, i] = cols;
    const lo = Math.min(o, i), hi = Math.max(o, i);
    // Brows.
    switch (brows) {
      case 'thin':
        g.box(lo, 11, F, hi, 11, F, browC);
        g.set(o + (o < i ? -1 : 1), 11, F, browC);
        break;
      case 'raised':
        g.box(lo, 12, F, hi, 12, F, browC);
        break;
      case 'thick':
        g.box(lo - 1, 11, F, hi + 1, 11, F, browC);
        g.box(lo, 12, F, hi, 12, F, browC);
        g.box(lo, 11, F + 1, hi, 11, F + 1, browC);
        break;
      case 'angry':
        g.set(o + (o < i ? -1 : 1), 12, F, browC);
        g.set(o, 12, F, browC);
        g.set(m, 11, F, browC);
        g.set(i, 11, F, browC);
        g.set(i + (i < o ? -1 : 1), 10, F, browC);
        g.box(lo, 11, F + 1, hi, 11, F + 1, browC);
        break;
      case 'worried':
        g.set(o, 11, F, browC);
        g.set(m, 11, F, browC);
        g.set(i, 12, F, browC);
        g.set(o + (o < i ? -1 : 1), 10, F, browC);
        break;
      case 'uni':
        g.box(2, 11, F, 13, 12, F, (x, y) => (y === 12 && (x === 2 || x === 13) ? null : browC));
        g.box(3, 11, F + 1, 12, 11, F + 1, browC);
        break;
    }
    switch (expr) {
      case 'blink':
        g.box(lo, 8, F, hi, 8, F, BLACK);
        return;
      case 'happy':
        g.box(lo, 9, F, hi, 9, F, BLACK);
        g.set(lo - 1, 8, F, BLACK);
        g.set(hi + 1, 8, F, BLACK);
        return;
      case 'dead':
        for (let k = -1; k <= 1; k++) {
          g.set(m + k, 9 + k, F, BLACK);
          g.set(m + k, 9 - k, F, BLACK);
        }
        return;
      case 'shock':
        g.box(lo, 7, F, hi, 10, F, WHITE);
        g.set(m, 8, F, BLACK);
        g.set(m, 9, F, BLACK);
        return;
      case 'sick':
        g.box(lo, 8, F, hi, 8, F, WHITE);
        g.set(i, 8, F, 0x3a5a2a);
        g.box(lo, 9, F, hi, 9, F, lid);
        return;
    }
    switch (eyesK) {
      case 'dot':
        g.box(m, 8, F, i, 9, F, BLACK);
        break;
      case 'wide':
        g.box(lo, 8, F, hi, 10, F, WHITE);
        g.set(i, 8, F, iris);
        g.set(i, 9, F, BLACK);
        g.set(m, 9, F, iris);
        break;
      case 'sleepy':
        g.box(lo, 8, F, hi, 8, F, WHITE);
        g.set(i, 8, F, BLACK);
        g.box(lo, 9, F, hi, 9, F, lid);
        break;
      case 'small':
        g.set(o, 8, F, WHITE);
        g.set(m, 8, F, BLACK);
        g.set(m, 9, F, BLACK);
        break;
      case 'lashes':
        g.box(lo, 8, F, hi, 9, F, WHITE);
        g.set(i, 8, F, iris);
        g.set(i, 9, F, BLACK);
        g.box(lo, 10, F, hi, 10, F, BLACK);
        g.set(o + (o < i ? -1 : 1), 10, F, BLACK);
        g.set(o + (o < i ? -1 : 1), 11, F, BLACK);
        break;
      case 'angry':
        g.box(lo, 8, F, hi, 9, F, WHITE);
        g.set(i, 8, F, BLACK);
        g.set(i, 9, F, lid);
        g.set(m, 9, F, lid);
        break;
      default: // 'tall': white with a dark pupil on the inner side, like the references
        g.box(lo, 8, F, hi, 9, F, WHITE);
        g.set(i, 8, F, BLACK);
        g.set(i, 9, F, iris);
        g.set(o, 8, F, shade(WHITE, 0.9));
    }
  };
  eye(EYE_R);
  eye(EYE_L);

  // Mouths sit on row 3 (corners on 2 or 4). Beards cover the area, except open mouths.
  const bearded = s.facial === 'beard' || s.facial === 'handlebar';
  if (expr === 'shock' || expr === 'sick') {
    g.box(7, 1, F, 8, 3, F, expr === 'sick' ? 0x4a6a2a : MOUTH);
    if (expr === 'shock') g.set(7, 3, F, WHITE);
    return;
  }
  if (expr === 'happy') {
    g.box(6, 2, F, 9, 2, F, MOUTH);
    g.box(6, 3, F, 9, 3, F, WHITE);
    g.set(5, 3, F, MOUTH);
    g.set(10, 3, F, MOUTH);
    return;
  }
  if (expr === 'dead') {
    g.box(6, 3, F, 9, 3, F, MOUTH);
    g.set(9, 2, F, 0xd85a7a); // tongue
    g.set(9, 1, F + 1, 0xd85a7a);
    return;
  }
  if (bearded && mouthK !== 'open' && mouthK !== 'teeth') return;
  const lip = s.sex === 'f' && s.age !== 'child' ? mixHex(skin, 0xb8404a, 0.5) : shade(skin, 0.8);
  switch (mouthK) {
    case 'smile':
      g.box(6, 2, F, 9, 2, F, MOUTH);
      g.set(5, 3, F, MOUTH);
      g.set(10, 3, F, MOUTH);
      break;
    case 'flat':
      g.box(6, 3, F, 9, 3, F, MOUTH);
      break;
    case 'frown':
      g.box(6, 3, F, 9, 3, F, MOUTH);
      g.set(5, 2, F, MOUTH);
      g.set(10, 2, F, MOUTH);
      break;
    case 'teeth':
      g.box(5, 2, F, 10, 3, F, MOUTH);
      g.box(6, 3, F, 9, 3, F, WHITE);
      break;
    case 'open':
      g.box(7, 1, F, 8, 3, F, MOUTH);
      break;
    case 'smirk':
      g.box(7, 3, F, 9, 3, F, MOUTH);
      g.set(10, 4, F, MOUTH);
      break;
    default:
      // A quiet lip line, like the references.
      g.box(6, 3, F, 9, 3, F, lip);
      g.box(7, 2, F, 8, 2, F, s.sex === 'f' && s.age !== 'child' ? mixHex(skin, 0xb8404a, 0.3) : shade(skin, 0.92));
  }
}

function paintMask(g: VoxelGrid, s: PersonSpec) {
  const c = s.accent === s.top ? 0x5ab0e0 : s.accent;
  const pleat = shade(c, 0.85);
  g.box(1, 0, F + 1, 14, 6, F + 1, (_x, y) => (y === 2 || y === 4 ? pleat : c));
  g.box(5, 3, F + 2, 10, 6, F + 2, c); // over the nose
  g.box(5, 0, F + 2, 10, 1, F + 2, pleat);
  g.box(0, 2, 8, 0, 5, F, c);
  g.box(HW - 1, 2, 8, HW - 1, 5, F, c);
  g.box(-1, 5, 4, -1, 5, 9, 0xf2f2f2); // straps behind the ears
  g.box(HW, 5, 4, HW, 5, 9, 0xf2f2f2);
}

// ---------------------------------------------------------------------------------------------
// Hair
// ---------------------------------------------------------------------------------------------

function paintHair(g: VoxelGrid, s: PersonSpec, skin: number) {
  const c = s.hair;
  const dk = shade(c, 0.82);
  const lt = shade(c, 1.12);
  const W = HW, H = HH;
  const st = s.hairStyle;
  // Streaky hair color: a few darker and lighter strands so big areas don't go flat.
  const strand = (x: number, y: number, z: number) => {
    const k = (x * 7 + z * 3 + (y >> 1) * 5) % 11;
    return k === 0 ? dk : k === 5 ? lt : c;
  };
  if (st === 'bald') {
    g.set(6, H - 1, 9, shade(skin, 1.08)); // shine
    g.set(7, H - 1, 9, shade(skin, 1.08));
    return;
  }
  if (st === 'ring' || st === 'combover') {
    g.paint(0, 6, 0, W - 1, 12, 7, (x, y, z) => (x === 0 || x === W - 1 || z === 0 ? strand(x, y, z) : null));
    g.box(-1, 9, 0, -1, 12, 5, strand);
    g.box(W, 9, 0, W, 12, 5, strand);
    g.box(1, 7, -1, W - 2, 12, -1, strand);
    if (st === 'combover') for (let z = 1; z < F; z += 2) g.box(1, H, z, W - 4, H, z, c);
    return;
  }
  if (st === 'buzz') {
    const fuzz = (x: number, y: number, z: number) => ((x + y + z) % 3 ? mixHex(skin, c, 0.6) : mixHex(skin, c, 0.45));
    g.paint(0, H - 2, 0, W - 1, H - 1, F, fuzz);
    g.paint(0, 6, 0, W - 1, H - 1, 1, fuzz);
    g.paint(0, 10, 0, 0, H - 1, 9, fuzz);
    g.paint(W - 1, 10, 0, W - 1, H - 1, 9, fuzz);
    g.paint(1, 14, F, W - 2, 14, F, fuzz);
    return;
  }
  if (st === 'mohawk') {
    g.box(6, H - 1, 0, 9, H + 3, F, (x, y, z) => (y > H + 1 && (z < 2 || z > F - 2) ? null : y === H + 3 && (z + x) % 2 ? null : strand(x, y, z)));
    g.box(6, 6, -1, 9, H - 1, -1, strand);
    return;
  }

  // Every other style starts from a short cut: a cap of hair on the scalp plus one layer outside.
  const bangs = st === 'bob' || st === 'curly' || st === 'afro';
  g.paint(0, 14, 0, W - 1, H - 1, F, strand); // scalp
  g.paint(0, 5, 0, W - 1, H - 1, 1, strand); // back of the head
  g.paint(0, 10, 0, 0, H - 1, 9, strand); // sides above the ears
  g.paint(W - 1, 10, 0, W - 1, H - 1, 9, strand);
  g.paint(0, 6, 8, 0, 9, 10, strand); // sideburns in front of the ears
  g.paint(W - 1, 6, 8, W - 1, 9, 10, strand);
  // Outer layer: top, back, sides.
  g.box(0, H, 0, W - 1, H, F, (x, y, z) => ((x === 0 || x === W - 1) && (z === 0 || z === F) ? null : strand(x, y, z)));
  g.box(1, 6, -1, W - 2, H - 1, -1, strand);
  g.box(-1, 10, 0, -1, H - 1, 7, strand);
  g.box(W, 10, 0, W, H - 1, 7, strand);
  // Hairline: a little fringe over the forehead.
  if (st === 'slick') {
    g.box(1, H - 1, F, W - 2, H, F + 1, (x, y, z) => (z === F + 1 && y === H - 1 ? null : x === 5 ? dk : lt)); // side part
    g.paint(1, 14, F, W - 2, 14, F, (x) => (x < 5 ? lt : null));
  } else if (!bangs) {
    g.box(1, 14, F + 1, W - 2, H, F + 1, (x, y) => (y === 14 && (x % 3 === 0 || x > 11) ? null : y === H && (x < 2 || x > W - 3) ? null : strand(x, y, F)));
    g.paint(1, 13, F, 4, 13, F, (x) => (x <= 2 ? c : null));
    g.paint(11, 13, F, W - 2, 13, F, (x) => (x >= 13 ? c : null));
  }

  switch (st) {
    case 'spiky':
      for (let x = 0; x < W; x += 3)
        for (let z = 1; z < F; z += 3) {
          const h = 1 + ((x + z) % 3);
          g.box(x, H + 1, z, x + 1, H + h, z + 1, (xx, y, zz) => (y === H + h && (xx + zz) % 2 ? null : strand(xx, y, zz)));
        }
      g.box(2, H + 1, F - 1, W - 3, H + 2, F + 1, (x, y) => (y === H + 2 && x % 2 ? null : c));
      g.box(4, 12, F + 2, 6, 14, F + 2, (_x, y) => (y === 12 ? null : c));
      break;
    case 'curly': {
      g.box(-2, 8, -2, W + 1, H + 2, F + 1, (x, y, z) => {
        if (g.has(x, y, z)) return null;
        if (z >= 8 && y < 14 && x >= 0 && x < W) return null; // keep the face open
        if (z > F && y < 13) return null;
        const ex = x < 0 || x >= W, ez = z < 0 || z > F;
        if (ex && ez && (x === -2 || x === W + 1 || z === -2 || z === F + 1)) return null;
        if (y === H + 2 && (ex || ez || (x * 5 + z * 3) % 4 === 0)) return null;
        if ((x === -2 || x === W + 1) && (y + z) % 3 === 0) return null;
        return (x * 3 + y * 5 + z * 7) % 6 === 0 ? dk : (x + y * 2 + z) % 7 === 0 ? lt : c;
      });
      break;
    }
    case 'afro': {
      const cx = (W - 1) / 2, cy = H - 1, cz = 5;
      g.box(-5, 4, -5, W + 4, H + 7, F + 1, (x, y, z) => {
        if (g.has(x, y, z)) return null;
        const d = ((x - cx) / 11.5) ** 2 + ((y - cy) / 8.5) ** 2 + ((z - cz) / 10.5) ** 2;
        if (d > 1) return null;
        if (z >= 8 && y < 14 && x >= 0 && x < W) return null;
        if (z > F && y < 14) return null;
        return (x * 5 + y * 3 + z) % 6 === 0 ? dk : (x + y + z * 3) % 9 === 0 ? lt : c;
      });
      g.clear(-1, 6, 6, -1, 9, 8);
      g.clear(W, 6, 6, W, 9, 8);
      break;
    }
    case 'long':
      // Hangs to the shoulders behind, with strands down in front of the ears.
      g.box(-1, -6, -2, W, H - 1, 1, (x, y, z) => (g.has(x, y, z) && z >= 0 ? null : y < -4 && (x + z) % 3 === 0 ? null : strand(x, y, z)));
      g.box(-1, 0, 2, -1, H - 1, 10, (x, y, z) => (y >= 6 && y <= 9 && z >= 6 && z <= 8 ? null : strand(x, y, z)));
      g.box(W, 0, 2, W, H - 1, 10, (x, y, z) => (y >= 6 && y <= 9 && z >= 6 && z <= 8 ? null : strand(x, y, z)));
      g.box(-2, -3, 0, -2, H - 2, 6, strand);
      g.box(W + 1, -3, 0, W + 1, H - 2, 6, strand);
      g.box(0, H, 0, W - 1, H + 1, F, (x, y, z) => (y === H + 1 && (x < 2 || x > W - 3 || z > F - 2) ? null : g.has(x, y, z) ? null : strand(x, y, z)));
      g.box(1, 13, F + 1, 7, 15, F + 1, (x, y) => (y === 13 && x > 4 ? null : c)); // side-swept fringe
      break;
    case 'bun':
      g.box(5, H + 1, 2, 10, H + 4, 7, (x, y, z) => ((x === 5 || x === 10) && (z === 2 || z === 7) ? null : (y === H + 4 && (x === 5 || x === 10 || z === 2 || z === 7)) ? null : strand(x, y, z)));
      g.box(5, H + 1, 8, 10, H + 1, 8, 0xd84a6a);
      break;
    case 'topknot':
      g.box(6, H + 1, 5, 9, H + 1, 8, shade(c, 0.75));
      g.box(5, H + 2, 4, 10, H + 4, 9, (x, y, z) => ((x === 5 || x === 10) && (z === 4 || z === 9) ? null : strand(x, y, z)));
      break;
    case 'bob':
      g.box(-1, 2, -1, W, H - 1, 9, (x, y, z) => {
        if (g.has(x, y, z) && x >= 0 && x < W && z >= 0) return null;
        if (x >= 0 && x < W && z >= 0) return null;
        return y === 2 ? dk : strand(x, y, z);
      });
      g.box(-1, H, -1, W, H, 9, (x, y, z) => (g.has(x, y, z) ? null : c));
      g.box(1, 12, F + 1, W - 2, H, F + 1, (x, y) => (y === 12 && x % 2 ? null : strand(x, y, F))); // straight bangs
      break;
    case 'pigtails':
      for (const [x0, x1] of [[-4, -2], [W + 1, W + 3]] as const) {
        g.box(x0, 2, 4, x1, 10, 6, (x, y, z) => (y === 2 && (x === x0 || x === x1) ? null : strand(x, y, z)));
        g.box(x0, 11, 4, x1, 11, 6, 0xe0406a);
      }
      g.box(-2, 11, 4, -1, 12, 6, c);
      g.box(W, 11, 4, W + 1, 12, 6, c);
      break;
    case 'braids':
      g.box(0, 2, -2, W - 1, H - 1, -2, strand);
      for (const x0 of [3, 11])
        g.box(x0, -10, -3, x0 + 2, 3, -3, (x, y) => (y === -10 ? 0xe0406a : (y + x) % 3 === 0 ? dk : c));
      break;
    case 'pony':
      g.box(6, 9, -2, 9, 12, -2, shade(c, 0.85));
      g.box(6, 10, -3, 9, 11, -3, 0xd84a6a);
      g.box(6, -2, -3, 9, 9, -3, (x, y, z) => (y < 0 && (x === 6 || x === 9) ? null : strand(x, y, z)));
      g.box(7, -5, -3, 8, -3, -3, strand);
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// Hats, glasses and head extras (their own grids, so they can fly off)
// ---------------------------------------------------------------------------------------------

/** A ring of brim at row y, from radius in (inclusive) to out around the head, with clipped corners. */
function brim(g: VoxelGrid, y: number, out: number, p: (x: number, z: number, edge: boolean) => number | null, front = out, back = out) {
  const x0 = -out, x1 = HW - 1 + out, z0 = -back, z1 = F + front;
  g.box(x0, y, z0, x1, y, z1, (x, _y, z) => {
    const cx = x < 0 ? -x : x > HW - 1 ? x - (HW - 1) : 0;
    const cz = z < 0 ? -z : z > F ? z - F : 0;
    const r = cz && cx ? Math.max(cx, cz) + Math.min(cx, cz) / 2 : Math.max(cx, cz);
    const lim = z > F ? front : z < 0 ? back : out;
    if (r > lim + 0.01 && !(cx === 0 || cz === 0)) return null;
    const edge = x === x0 || x === x1 || z === z0 || z === z1 || r >= lim - 0.5;
    return p(x, z, edge);
  });
}

export function paintHat(g: VoxelGrid, s: PersonSpec) {
  const W = HW, H = HH;
  const hc = s.hatColor;
  const dk = shade(hc, 0.78);
  const crown = (y0: number, y1: number, p: number | ((x: number, y: number, z: number) => number | null), inset = 0) =>
    g.box(-1 + inset, y0, -1 + inset, W - inset, y1, F + 1 - inset, (x, y, z) => {
      const ex = x === -1 + inset || x === W - inset, ez = z === -1 + inset || z === F + 1 - inset;
      if (ex && ez) return null;
      return typeof p === 'number' ? p : p(x, y, z);
    });
  switch (s.hat) {
    case 'straw': {
      const straw = speckle(s.seed, [0xd8a640, 0xc08a2c, 0xe8c060, 0xa87420], [3, 3, 2, 1]);
      const edge = speckle(s.seed + 1, [0x8a5a1c, 0x9a6a24, 0x7a4a14]);
      brim(g, 13, 6, (x, z, e) => (e ? edge(x, 0, z) : straw(x, 13, z)));
      crown(14, 19, straw);
      crown(14, 15, 0x3f8a2a);
      crown(20, 20, straw, 1);
      break;
    }
    case 'cowboy': {
      // Wide brim curled up at the sides, pinched crown, contrasting band.
      const lum = ((hc >> 16) & 255) + ((hc >> 8) & 255) + (hc & 255);
      const band = lum < 200 ? 0xb02a2a : 0x3a2418;
      brim(g, 13, 7, (x, _z, e) => (e ? dk : hc), 5, 5);
      for (const x of [-7, -6, W + 5, W + 6]) g.box(x, 14, -3, x, x === -7 || x === W + 6 ? 16 : 15, F + 3, (_x, _y, z) => (z === -3 || z === F + 3 ? null : dk));
      g.box(-1, 14, -1, W, 20, F + 1, (x, y, z) => {
        const ex = x === -1 || x === W, ez = z === -1 || z === F + 1;
        if (ex && ez) return null;
        if (y >= 18 && (ex || ez)) return null;
        if (y === 20 && (x <= 0 || x >= W - 1 || z <= 0 || z >= F)) return null;
        if (y === 20 && (x === 7 || x === 8)) return null; // the crease
        return y <= 15 ? band : hc;
      });
      break;
    }
    case 'cap':
    case 'capBack': {
      crown(13, 17, (x, y, z) => (y === 17 && (x === -1 || x === W || z === -1 || z === F + 1) ? null : hc));
      crown(18, 18, hc, 2);
      g.box(7, 19, 6, 8, 19, 7, dk); // button
      const back = s.hat === 'capBack';
      const z0 = back ? -6 : F + 2, z1 = back ? -2 : F + 6;
      g.box(1, 13, z0, W - 2, 13, z1, (x, _y, z) => ((x === 1 || x === W - 2) && (z === z0 || z === z1) ? null : dk));
      if (!back) g.box(6, 14, F + 2, 9, 16, F + 2, (x, y) => (y === 15 && x > 6 && x < 9 ? hc : 0xf2f2f2)); // logo
      break;
    }
    case 'chef':
      crown(12, 14, 0xffffff);
      g.box(-1, 15, -1, W, 21, F + 1, (x, y, z) => {
        const ex = x === -1 || x === W, ez = z === -1 || z === F + 1;
        if (ex && ez) return null;
        if (y < 18 && (ex || ez)) return null;
        if (y === 21 && (ex || ez || (x + z) % 5 === 0)) return null;
        return (x + y) % 4 === 0 ? 0xebebeb : 0xfafafa;
      });
      break;
    case 'beanie':
      crown(12, 18, (x, y) => (y <= 13 ? dk : x % 2 ? hc : shade(hc, 0.92)));
      crown(19, 19, hc, 2);
      g.box(6, 20, 5, 9, 22, 8, 0xf2f2f2);
      break;
    case 'flatcap':
      crown(13, 16, (x, y, z) => (y === 16 && z < 2 ? null : (x + z) % 4 === 0 ? dk : hc));
      crown(17, 17, hc, 2);
      g.box(0, 13, F + 2, W - 1, 14, F + 4, (x, y, z) => ((x === 0 || x === W - 1) && z === F + 4 ? null : y === 14 && z === F + 4 ? null : dk));
      break;
    case 'headMirror':
      crown(13, 13, 0x2a2a30);
      g.box(5, 13, F + 2, 10, 18, F + 2, (x, y) => ((x === 5 || x === 10) && (y === 13 || y === 18) ? null : x === 5 || x === 10 || y === 13 || y === 18 ? 0x9aa0a8 : 0xdde4ea));
      g.box(7, 15, F + 3, 8, 16, F + 3, 0x3a3a40);
      break;
    case 'visor':
      crown(13, 14, hc);
      g.box(1, 13, F + 2, W - 2, 13, F + 6, (x, _y, z) => ((x === 1 || x === W - 2) && z === F + 6 ? null : dk));
      break;
    case 'police':
    case 'shako': {
      const tall = s.hat === 'shako';
      crown(13, 14, tall ? GOLD : BLACK);
      const top = tall ? 25 : 18;
      g.box(-2, 15, -2, W + 1, top, F + 2, (x, y, z) => {
        const ex = x === -2 || x === W + 1, ez = z === -2 || z === F + 2;
        if (ex && ez) return null;
        if (!tall && y < 17 && (ex || ez)) return null;
        if (tall && (ex || ez)) return null;
        return tall && y === top ? GOLD : tall && y === 23 ? 0x8a1a1a : hc;
      });
      g.box(1, 13, F + 2, W - 2, 13, F + 4, BLACK); // bill
      g.box(7, 15, F + (tall ? 2 : 3), 8, 18, F + (tall ? 2 : 3), GOLD); // badge
      g.box(6, 16, F + (tall ? 2 : 3), 9, 17, F + (tall ? 2 : 3), GOLD);
      if (tall) {
        g.box(7, top + 1, F - 2, 8, top + 5, F - 1, 0xf2f2f2); // plume
        g.box(7, top + 6, F - 2, 7, top + 6, F - 2, 0xf2f2f2);
      }
      break;
    }
    case 'hardhat':
      brim(g, 13, 2, (_x, _z, e) => (e ? dk : hc), 4, 2);
      g.box(-1, 14, -1, W, 20, F + 1, (x, y, z) => {
        const ex = x === -1 || x === W, ez = z === -1 || z === F + 1;
        const r = (y - 14) / 6;
        if (ex && ez) return null;
        if (r > 0.6 && (ex || ez)) return null;
        if (r > 0.9 && (x <= 0 || x >= W - 1 || z <= 0 || z >= F)) return null;
        return x === 7 || x === 8 ? shade(hc, 1.1) : hc; // ridge
      });
      break;
    case 'fireHelmet':
      brim(g, 13, 2, (_x, z, e) => (e ? dk : hc), 3, 6);
      g.box(-2, 12, -6, W + 1, 12, -3, (x) => (x < 0 || x >= W ? null : dk)); // long tail at the back
      g.box(-1, 14, -1, W, 21, F + 1, (x, y, z) => {
        const ex = x === -1 || x === W, ez = z === -1 || z === F + 1;
        if (ex && ez) return null;
        if (y > 18 && (ex || ez)) return null;
        if (y === 21 && (x <= 1 || x >= W - 2 || z <= 1 || z >= F - 1)) return null;
        return x === 7 || x === 8 ? shade(hc, 1.12) : hc;
      });
      g.box(5, 15, F + 2, 10, 19, F + 2, (x, y) => ((x === 5 || x === 10) && (y === 15 || y === 19) ? null : x === 5 || x === 10 || y === 15 || y === 19 ? GOLD : 0x2a2a30)); // shield
      break;
    case 'tophat':
      brim(g, 13, 3, (_x, _z, e) => (e ? dk : hc));
      g.box(0, 14, 0, W - 1, 26, F, (x, y, z) => ((x === 0 || x === W - 1) && (z === 0 || z === F) ? null : y <= 15 ? (s.accent === hc ? 0x8a1a1a : s.accent) : hc));
      break;
    case 'bucket':
      crown(14, 19, (x, y, z) => (y === 19 && (x === -1 || x === W || z === -1 || z === F + 1) ? null : (x + z) % 5 === 0 ? dk : hc));
      for (const [y, o] of [[13, 2], [12, 3]] as const) brim(g, y, o, (_x, _z, e) => (e && y === 12 ? dk : hc));
      g.clear(-1, 13, -1, W, 13, F + 1);
      brim(g, 13, 2, () => hc);
      g.clear(0, 12, 0, W - 1, 13, F);
      break;
    case 'beret':
      g.box(-2, 15, -2, W + 1, 17, F + 1, (x, y, z) => {
        const ex = x <= -1 || x >= W, ez = z <= -1 || z >= F + 1;
        if ((x === -2 || x === W + 1) && (z === -2 || z === F + 1)) return null;
        if (y === 15 && (ex || ez)) return null;
        if (y === 17 && (x === -2 || x === W + 1 || z === -2 || z === F + 1)) return null;
        return x > 9 && y === 17 ? dk : hc;
      });
      g.box(-2, 14, -2, 3, 14, F + 1, hc); // slouches to one side
      g.box(8, 18, 6, 8, 19, 6, dk);
      break;
    case 'party': {
      const cols = [hc, 0xf2d040, 0x3ac0e0];
      for (let y = 0; y < 12; y++) {
        const r = Math.max(0, 5 - Math.floor(y / 2.2));
        g.box(7 - r, 16 + y, 6 - r, 8 + r, 16 + y, 7 + r, cols[Math.floor(y / 3) % 3]);
      }
      g.box(6, 28, 5, 9, 29, 8, 0xf2f2f2);
      g.box(-1, 7, 8, -1, 15, 8, 0xe8e8e8); // elastic
      break;
    }
    case 'bow':
      g.box(10, 16, 6, 15, 19, 9, hc);
      g.box(12, 17, 10, 13, 18, 10, dk);
      g.clear(12, 16, 6, 13, 16, 9);
      g.clear(12, 19, 6, 13, 19, 9);
      break;
    case 'bandana':
      crown(13, 16, (x, y, z) => ((x * 3 + z + y) % 7 === 0 ? 0xf2f2f2 : hc));
      crown(17, 17, hc, 2);
      g.box(6, 11, -3, 9, 15, -2, (x, y) => (y < 13 && (x === 6 || x === 9) ? null : dk)); // knot and tails
      break;
    case 'surgical':
      crown(13, 18, (x, y, z) => ((x * 5 + y * 3 + z) % 9 === 0 ? dk : y === 13 ? dk : hc));
      g.box(1, 19, 1, W - 2, 19, F - 1, hc);
      g.box(-1, 10, -1, W, 12, -1, hc);
      g.box(6, 9, -2, 9, 12, -2, dk); // ties
      break;
    case 'tiara':
      g.box(2, 15, F - 1, W - 3, 15, F - 1, GOLD);
      g.box(1, 15, 3, 1, 15, F - 2, GOLD);
      g.box(W - 2, 15, 3, W - 2, 15, F - 2, GOLD);
      for (const x of [3, 5, 10, 12]) g.set(x, 16, F - 1, GOLD);
      g.box(6, 16, F - 1, 9, 17, F - 1, GOLD);
      g.box(7, 18, F - 1, 8, 18, F - 1, GOLD);
      g.box(7, 16, F, 8, 17, F, s.accent === GOLD ? 0x2a8a4a : s.accent);
      break;
  }
}

export function paintGlasses(g: VoxelGrid, s: PersonSpec) {
  const z = F + 1;
  if (s.glasses === 'round') {
    const fc = [0x7a3a2a, 0xc8a040, 0x2a2a30, 0x6a4a8a][s.seed % 4];
    for (const x0 of [2, 9]) {
      g.box(x0, 7, z, x0 + 4, 10, z, (x, y) => (x === x0 || x === x0 + 4 || y === 7 || y === 10 ? ((x === x0 || x === x0 + 4) && (y === 7 || y === 10) ? null : fc) : null));
    }
    g.box(7, 9, z, 8, 9, z, fc);
    g.box(-1, 9, 4, -1, 9, F, fc);
    g.box(HW, 9, 4, HW, 9, F, fc);
    g.set(1, 9, z, fc);
    g.set(14, 9, z, fc);
  } else if (s.glasses === 'sun') {
    const lens = 0x1e2028;
    g.box(1, 8, z, 14, 10, z, (x, y) => (x === 7 || x === 8 ? (y === 10 ? BLACK : null) : y === 7 ? null : (x === 1 || x === 14) && y === 8 ? null : lens));
    g.set(3, 10, z, 0x6a7a9a);
    g.set(10, 10, z, 0x6a7a9a);
    g.box(-1, 10, 4, -1, 10, F, BLACK);
    g.box(HW, 10, 4, HW, 10, F, BLACK);
    g.set(0, 10, z, BLACK);
    g.set(15, 10, z, BLACK);
  }
}

export function paintHeadExtras(g: VoxelGrid, s: PersonSpec) {
  const W = HW, H = HH;
  if (s.extras.includes('earrings')) {
    g.box(-2, 4, 7, -2, 5, 7, GOLD);
    g.box(W + 1, 4, 7, W + 1, 5, 7, GOLD);
  }
  if (s.extras.includes('headphones')) {
    const c = 0x2a2a30;
    g.box(-1, H + 1, 5, W, H + 1, 7, (x) => (x === -1 || x === W ? null : c));
    g.box(-2, 11, 5, -2, H, 7, c);
    g.box(W + 1, 11, 5, W + 1, H, 7, c);
    g.box(-3, 5, 4, -2, 10, 9, (x, y) => (x === -3 && y > 6 && y < 9 ? s.accent : c));
    g.box(W + 1, 5, 4, W + 2, 10, 9, (x, y) => (x === W + 2 && y > 6 && y < 9 ? s.accent : c));
  }
  if (s.extras.includes('flower')) {
    const p = 0xf06aa8;
    g.box(W + 1, 11, 8, W + 1, 13, 10, (_x, y, z) => (y === 12 && z === 9 ? 0xf2d040 : (y === 11 || y === 13) && (z === 8 || z === 10) ? null : p));
  }
}
