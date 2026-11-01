import { VoxelGrid, mixHex, shade, speckle } from './grid';
import type { PersonSpec } from './spec';

/** Part sizes in voxels, worked out by dims() in build.ts. */
export interface Dims {
  head: readonly [number, number, number];
  torso: readonly [number, number, number];
  arm: readonly [number, number, number];
  leg: readonly [number, number, number];
  /** Rows of neck drawn above the torso box. */
  neck: number;
  scale: number;
}

const BLACK = 0x17151a;
const WHITE = 0xf4f4f2;
const GOLD = 0xe8b830;
const SILVER = 0xc8ccd4;
const DENIM = new Set([0x2f4f9a, 0x2a4585, 0x355ba8, 0x4a6a9a, 0x1e2a4a]);

/** Outfits whose sleeves run to the wrist. */
const LONG_SLEEVES = new Set(['coveralls', 'tracksuit', 'jacket', 'sweaterVest', 'suit', 'loudSuit', 'hoodie', 'labCoat', 'cook', 'clergy', 'cardigan', 'firefighter', 'gown', 'robe', 'bandUniform']);
/** Outfits with sleeves rolled to the elbow. */
const ROLLED = new Set(['plaid', 'vest', 'apron', 'construction']);
/** Outfits tucked into a belt. */
const TUCKED = new Set(['polo', 'police', 'vest', 'plaid', 'overalls', 'construction', 'mail', 'clergy', 'sweaterVest', 'apron', 'bandUniform']);

/** Neckline helper: rows from the top of the torso that show skin in a V. */
function vNeck(g: VoxelGrid, W: number, H: number, F: number, depth: number, skin: number) {
  const cx = W / 2;
  for (let i = 0; i < depth; i++) g.paint(cx - 1 - Math.floor((depth - i) / 2), H - 1 - i, F, cx + Math.floor((depth - i) / 2), H - 1 - i, F, skin);
}

export function paintTorso(g: VoxelGrid, s: PersonSpec, d: Dims) {
  const [W, H, D] = d.torso;
  const F = D - 1;
  const cx = W / 2; // middle pair is cx-1, cx
  const top = s.top, acc = s.accent;
  const dkTop = shade(top, 0.8);
  const skin = s.skin;
  const o = s.outfit;
  const pants = o === 'overalls' ? acc : s.bottoms;

  // Body shape.
  g.box(0, 0, 0, W - 1, H - 1, F, top);
  for (let y = 0; y < H; y++)
    for (const x of [0, W - 1])
      for (const z of [0, F]) g.set(x, y, z, null);
  g.clear(0, H - 1, 0, W - 1, H - 1, 0);
  if (s.build === 'buff') {
    // V taper: narrower at the waist.
    g.clear(0, 0, 0, 0, 7, F);
    g.clear(W - 1, 0, 0, W - 1, 7, F);
  }
  // Neck.
  g.box(cx - 3, H, 2, cx + 2, H - 1 + d.neck, D - 3, skin);
  g.box(cx - 3, H, D - 3, cx + 2, H, D - 3, shade(skin, 0.9));

  // Hips: trousers above the legs, a belt for tucked outfits.
  const tucked = TUCKED.has(o);
  const longTop = o === 'labCoat' || o === 'firefighter' || o === 'suit' || o === 'loudSuit' || o === 'gown' || o === 'robe' || o === 'cook';
  if (!longTop) {
    g.paint(0, 0, 0, W - 1, tucked ? 3 : 1, F, pants);
    if (tucked) {
      const belt = o === 'police' ? BLACK : o === 'overalls' ? pants : 0x3a2418;
      g.paint(0, 3, 0, W - 1, 3, F, belt);
      if (o !== 'overalls') g.box(cx - 1, 3, F + 1, cx, 3, F + 1, o === 'police' ? GOLD : 0xc8b070);
    } else g.paint(0, 2, 0, W - 1, 2, F, shade(top, 0.88)); // untucked hem
    g.paint(cx - 1, 0, F, cx - 1, 1, F, shade(pants, 0.85)); // fly seam
  }

  switch (o) {
    case 'overalls': {
      // Bib with gold buttons and straps over the shoulders.
      g.paint(3, 3, F, W - 4, H - 6, F, acc);
      g.box(4, 6, F + 1, W - 5, 9, F + 1, shade(acc, 0.9)); // bib pocket
      g.paint(3, H - 6, F, 4, H - 1, F, acc);
      g.paint(W - 5, H - 6, F, W - 4, H - 1, F, acc);
      g.paint(3, H - 1, 0, 4, H - 1, F, acc);
      g.paint(W - 5, H - 1, 0, W - 4, H - 1, F, acc);
      g.paint(3, 4, 0, 4, H - 1, 0, acc);
      g.paint(W - 5, 4, 0, W - 4, H - 1, 0, acc);
      g.paint(0, 3, 0, W - 1, 4, F, acc);
      g.box(3, H - 6, F + 1, 3, H - 6, F + 1, GOLD);
      g.box(W - 4, H - 6, F + 1, W - 4, H - 6, F + 1, GOLD);
      break;
    }
    case 'coveralls':
      g.paint(0, 0, 0, W - 1, H - 1, F, top);
      g.paint(cx - 1, 1, F, cx - 1, H - 2, F, SILVER); // zipper
      g.box(W - 6, H - 6, F + 1, W - 3, H - 5, F + 1, WHITE); // name patch
      g.set(W - 5, H - 6, F + 1, 0x3a5aa0);
      g.box(2, H - 8, F, 5, H - 5, F, dkTop); // pocket
      g.paint(0, 4, 0, W - 1, 4, F, dkTop); // waist seam
      g.paint(0, 0, 0, W - 1, 1, F, top);
      vNeck(g, W, H, F, 2, skin);
      break;
    case 'mail':
      g.box(2, H - 7, F + 1, 4, H - 5, F + 1, dkTop);
      g.set(W - 4, H - 4, F + 1, 0x2a3a6a); // patch
      // Satchel strap from the left shoulder to the right hip, and the bag.
      for (let y = 4; y < H; y++) {
        const x = Math.round(((y - 4) / (H - 5)) * (W - 3)) + 1;
        g.box(x, y, F + 1, x + 1, y, F + 1, acc);
        g.set(x, y, 0, acc);
      }
      g.box(-3, 1, 1, -1, 7, F - 1, acc);
      g.box(-3, 7, 1, -1, 7, F - 1, shade(acc, 0.8));
      g.box(-4, 4, 3, -4, 5, 5, GOLD);
      vNeck(g, W, H, F, 3, skin);
      break;
    case 'cardigan':
      // Open cardigan over a shirt; buttons down one side.
      g.paint(cx - 2, 2, F, cx + 1, H - 1, F, acc);
      vNeck(g, W, H, F, 3, skin);
      for (let y = 4; y < H - 3; y += 3) g.set(cx - 3, y, F, shade(top, 1.3));
      g.box(1, 3, F + 1, 4, 6, F + 1, shade(top, 0.9));
      g.box(W - 5, 3, F + 1, W - 2, 6, F + 1, shade(top, 0.9));
      g.paint(0, 2, 0, W - 1, 2, F, shade(top, 0.85));
      break;
    case 'hawaiian': {
      const flower = speckle(s.seed + 11, [top, top, top, top, acc, shade(acc, 0.8), 0xf2f2f2]);
      g.paint(0, 2, 0, W - 1, H - 1, F, flower);
      vNeck(g, W, H, F, 4, skin);
      g.box(cx - 4, H - 2, F + 1, cx - 3, H - 1, F + 1, top); // open collar
      g.box(cx + 2, H - 2, F + 1, cx + 3, H - 1, F + 1, top);
      break;
    }
    case 'suit':
    case 'loudSuit':
    case 'bandUniform': {
      const band = o === 'bandUniform';
      const cloth = o === 'loudSuit' ? (x: number, y: number) => ((x >> 1) + (y >> 1)) % 2 ? top : shade(top, 0.86) : top;
      g.paint(0, 0, 0, W - 1, H - 1, F, cloth);
      if (band) {
        // Marching jacket: frogging cords across the chest and a gold collar.
        for (let y = H - 4; y > 6; y -= 2) g.paint(cx - 4, y, F, cx + 3, y, F, GOLD);
        g.paint(cx - 1, 2, F, cx, H - 1, F, shade(top, 1.15));
        g.paint(0, H - 1, 0, W - 1, H - 1, F, GOLD);
        g.paint(0, 3, 0, W - 1, 4, F, WHITE);
        g.box(cx - 1, 3, F + 1, cx, 4, F + 1, GOLD);
        break;
      }
      // Shirt and tie in a V, lapels stepping out.
      for (let i = 0; i < 9; i++) {
        const w = Math.max(0, 3 - Math.floor(i / 3));
        g.paint(cx - 1 - w, H - 1 - i, F, cx + w, H - 1 - i, F, WHITE);
      }
      g.paint(cx - 1, H - 9, F, cx, H - 2, F, acc);
      g.box(cx - 1, H - 2, F + 1, cx, H - 2, F + 1, acc); // knot
      for (let i = 0; i < 7; i++) {
        g.set(cx - 3 - Math.floor(i / 3), H - 2 - i, F + 1, shade(top, 0.82));
        g.set(cx + 2 + Math.floor(i / 3), H - 2 - i, F + 1, shade(top, 0.82));
      }
      g.box(W - 4, H - 6, F + 1, W - 3, H - 6, F + 1, WHITE); // pocket square
      g.box(cx - 1, 6, F, cx - 1, 6, F, shade(top, 0.6));
      g.box(cx - 1, 3, F, cx - 1, 3, F, shade(top, 0.6));
      g.box(1, 4, F + 1, 4, 4, F + 1, shade(top, 0.8)); // pocket flaps
      g.box(W - 5, 4, F + 1, W - 2, 4, F + 1, shade(top, 0.8));
      // Jacket hem past the hips, split at the front.
      hemRing(g, W, F, 1, 4, 0, (x) => (x === cx - 1 || x === cx ? null : top), false, true);
      break;
    }
    case 'hoodie':
      g.paint(0, 0, 0, W - 1, 2, F, shade(top, 0.85)); // waistband
      g.box(3, 3, F + 1, W - 4, 8, F + 1, (x, y) => ((x === 3 || x === W - 4) && y === 8 ? null : shade(top, 0.92))); // pouch
      g.box(cx - 2, H - 7, F + 1, cx - 2, H - 2, F + 1, acc); // drawstrings
      g.box(cx + 1, H - 7, F + 1, cx + 1, H - 2, F + 1, acc);
      g.box(1, H - 4, -1, W - 2, H + 1, 1, (x, y, z) => (g.has(x, y, z) && z >= 0 ? null : z === 1 && y > H - 1 ? null : shade(top, 0.88))); // hood
      g.box(2, H - 1, F - 1, W - 3, H, F, (x) => (x >= cx - 3 && x <= cx + 2 ? null : shade(top, 0.9)));
      g.box(0, 0, 0, W - 1, 1, F, (x, y, z) => (g.has(x, y, z) ? (s.age === 'teen' ? shade(top, 0.85) : shade(top, 0.85)) : null));
      break;
    case 'labCoat':
    case 'firefighter': {
      const ff = o === 'firefighter';
      g.paint(0, 0, 0, W - 1, H - 1, F, top);
      if (ff) {
        for (const y of [3, H - 8]) g.paint(0, y, 0, W - 1, y + 1, F, (_x, yy) => (yy === y ? acc : SILVER));
        g.paint(cx - 1, 0, F, cx, H - 1, F, BLACK);
        for (let y = 2; y < H - 2; y += 3) g.box(cx - 2, y, F + 1, cx + 1, y, F + 1, SILVER);
        g.box(cx - 2, H - 1, F - 1, cx + 1, H, F, shade(top, 0.8));
        hemRing(g, W, F, 1, 8, 0, (_x, y) => (y === -6 ? acc : y === -5 ? SILVER : top), false, true);
      } else {
        // Shirt and tie showing, lapels, pockets and a pen.
        for (let i = 0; i < 8; i++) g.paint(cx - 2, H - 1 - i, F, cx + 1, H - 1 - i, F, i < 2 || i > 5 ? shade(acc, 1.6) : WHITE);
        g.paint(cx - 1, H - 8, F, cx, H - 2, F, acc);
        g.box(cx - 3, H - 8, F + 1, cx - 3, H - 1, F + 1, shade(top, 0.9));
        g.box(cx + 2, H - 8, F + 1, cx + 2, H - 1, F + 1, shade(top, 0.9));
        g.box(1, 3, F + 1, 4, 6, F + 1, shade(top, 0.93));
        g.box(W - 5, H - 8, F + 1, W - 2, H - 6, F + 1, shade(top, 0.93));
        g.box(W - 4, H - 6, F + 2, W - 4, H - 4, F + 2, 0x2a4ab0);
        g.box(cx - 2, 6, F, cx - 2, 6, F, shade(top, 0.75));
        hemRing(g, W, F, 1, 9, 0, (x) => (x === cx - 1 || x === cx ? null : top), false, true);
      }
      break;
    }
    case 'cook':
      // Double-breasted chef's jacket: two button columns and a high collar.
      g.paint(0, 0, 0, W - 1, H - 1, F, WHITE);
      for (let y = 4; y < H - 3; y += 3) {
        g.set(cx - 3, y, F + 1, 0x2a2a30);
        g.set(cx + 2, y, F + 1, 0x2a2a30);
      }
      g.paint(cx - 4, 2, F, cx - 4, H - 2, F, shade(WHITE, 0.9));
      g.box(cx - 3, H - 1, F - 1, cx + 2, H, F, shade(WHITE, 0.92));
      hemRing(g, W, F, 1, 3, 0, () => WHITE, false, false);
      break;
    case 'clergy':
      g.paint(cx - 1, H - 1, F, cx, H - 2, F, WHITE);
      g.box(cx - 3, H - 1, F - 1, cx + 2, H, F, (x) => (x === cx - 1 || x === cx ? WHITE : shade(top, 0.9)));
      for (let y = 5; y < H - 3; y += 3) g.set(cx - 1, y, F, shade(top, 1.5));
      break;
    case 'hiVis':
    case 'construction': {
      const vest = acc;
      const stripe = 0xd8dce0;
      g.paint(0, 2, 0, W - 1, H - 1, F, vest);
      g.paint(cx - 1, 2, F, cx, H - 1, F, top);
      vNeck(g, W, H, F, 4, top);
      for (const y of [5, H - 6]) g.paint(0, y, 0, W - 1, y, F, (x) => (x === cx - 1 || x === cx ? null : stripe));
      g.paint(0, H - 1, 0, 2, H - 1, F, vest);
      g.paint(W - 3, H - 1, 0, W - 1, H - 1, F, vest);
      if (o === 'construction') {
        // Tool belt with a hammer loop and pouches.
        g.paint(0, 2, 0, W - 1, 3, F, 0x8a5a2a);
        g.box(-1, 0, 2, -1, 3, F - 2, 0x7a4a1a);
        g.box(W, 0, 2, W, 3, F - 2, 0x7a4a1a);
        g.box(W, -2, 4, W, -1, 5, 0x6a6a70);
      }
      vNeck(g, W, H, F, 2, skin);
      break;
    }
    case 'police':
    case 'tank':
    case 'polo':
    case 'graphicTee':
    case 'stripes':
    case 'casual':
    case 'trendy':
    case 'plaid':
    case 'vest':
    case 'apron':
    case 'scrubs':
    case 'swim':
    case 'tracksuit':
    case 'jacket':
    case 'sweaterVest':
    case 'dress':
    case 'gown':
    case 'robe':
      paintTops(g, s, W, H, F, cx);
      break;
  }

  // Lower body coverings that hang from the hips.
  if (s.lower === 'skirt' && o !== 'gown' && o !== 'robe') hemRing(g, W, F, 1, 7, 1, (x, y) => (y === -7 ? shade(s.bottoms, 0.85) : (x + 99) % 3 === 0 ? shade(s.bottoms, 0.93) : s.bottoms), true, false);
  if (s.lower === 'skirt' && o !== 'gown' && o !== 'robe' && o !== 'dress') g.paint(0, 0, 0, W - 1, 3, F, s.bottoms);
  if (s.lower === 'gown' || o === 'gown' || o === 'robe') {
    const cloth = o === 'robe' ? top : o === 'dress' ? top : top;
    const L = (d.leg[1] - 3);
    g.paint(0, 0, 0, W - 1, 3, F, cloth);
    hemRing(g, W, F, 1, L, o === 'robe' ? 9 : 7, (x, y, z) => {
      const a = Math.atan2(z - F / 2, x - (W - 1) / 2);
      const pleat = Math.floor((a + Math.PI) * 4.5) % 2 === 0;
      return y === -L && o === 'gown' ? GOLD : pleat ? shade(cloth, 0.88) : cloth;
    }, true, false);
  }

  // Worn extras.
  const ex = s.extras;
  if (ex.includes('suspenders')) {
    const c = s.accent === s.top ? 0x5a3a22 : 0x3a2418;
    for (const x of [3, W - 4]) {
      g.paint(x, 3, F, x, H - 1, F, c);
      g.paint(x, H - 1, 0, x, H - 1, F, c);
      g.paint(x, 3, 0, x, H - 1, 0, c);
    }
  }
  if (ex.includes('chain')) for (let i = 0; i < 6; i++) g.set(cx - 3 + i, H - 3 - (i > 0 && i < 5 ? 1 : 0) - (i === 2 || i === 3 ? 1 : 0), F + 1, GOLD);
  if (ex.includes('necklace')) {
    for (let i = 0; i < 6; i++) g.set(cx - 3 + i, H - 2 - (i > 0 && i < 5 ? 1 : 0) - (i === 2 || i === 3 ? 1 : 0), F + 1, 0xf2f2f2);
    g.set(cx - 1, H - 5, F + 1, 0x4ac0d0);
  }
  if (ex.includes('scarf')) {
    g.box(cx - 4, H, 1, cx + 3, H + 1, D - 2, (x, y, z) => (g.has(x, y, z) ? null : acc));
    g.box(cx + 1, H - 6, F + 1, cx + 2, H - 1, F + 1, (_x, y) => (y === H - 6 ? shade(acc, 0.8) : acc));
  }
  if (ex.includes('bandana')) {
    // Neckerchief: a triangle hanging over the chest, knotted behind.
    const c = s.hat === 'cowboy' && s.accent !== s.top ? s.accent : 0xb82a22;
    g.box(cx - 4, H, 1, cx + 3, H, D - 2, (x, y, z) => (g.has(x, y, z) && z < D - 3 ? null : c));
    for (let i = 0; i < 5; i++) g.box(cx - 4 + i, H - 1 - i, F + 1, cx + 3 - i, H - 1 - i, F + 1, i === 4 ? shade(c, 0.8) : c);
    g.box(cx - 1, H - 1, 0, cx, H, 0, shade(c, 0.85));
  }
  if (ex.includes('bowtie')) {
    g.box(cx - 3, H - 2, F + 1, cx + 2, H - 1, F + 1, (x) => (x === cx - 1 || x === cx ? shade(acc, 0.8) : acc));
  }
  if (ex.includes('backpack')) {
    g.box(2, 4, -4, W - 3, H - 3, -1, (x, y, z) => (z === -4 && y < 8 && y > 4 && x > 3 && x < W - 4 ? shade(acc, 0.85) : acc));
    g.box(3, H - 2, -1, 4, H - 1, -1, shade(acc, 0.7));
    g.box(W - 5, H - 2, -1, W - 4, H - 1, -1, shade(acc, 0.7));
    g.paint(3, H - 1, 0, 4, H - 1, F, shade(acc, 0.7));
    g.paint(W - 5, H - 1, 0, W - 4, H - 1, F, shade(acc, 0.7));
    g.paint(3, H - 8, F, 4, H - 1, F, shade(acc, 0.7));
    g.paint(W - 5, H - 8, F, W - 4, H - 1, F, shade(acc, 0.7));
  }
  if (ex.includes('fannypack')) {
    g.box(cx - 3, 1, F + 1, cx + 2, 4, F + 2, (_x, y) => (y === 4 ? shade(acc, 0.8) : acc));
    g.paint(0, 3, 0, W - 1, 3, F, BLACK);
  }
}

/**
 * A skirt, coat tail or gown: a shell hanging from the hips, `from`..`to` rows below the torso,
 * flaring out by one voxel every `flare` rows (0 = straight). `openFront` leaves a slit.
 */
function hemRing(
  g: VoxelGrid, W: number, F: number, from: number, to: number, flare: number,
  p: (x: number, y: number, z: number) => number | null, solidTop: boolean, openFront: boolean,
) {
  for (let i = from; i <= to; i++) {
    const y = -i;
    const e = flare ? Math.floor((i - 1) / flare) + (solidTop ? 0 : 0) : 0;
    const x0 = -e, x1 = W - 1 + e, z0 = -e, z1 = F + e;
    g.box(x0, y, z0, x1, y, z1, (x, yy, z) => {
      const onRing = x === x0 || x === x1 || z === z0 || z === z1;
      if (!onRing) return null;
      if ((x === x0 || x === x1) && (z === z0 || z === z1) && e === 0) return null;
      if (openFront && z === z1 && x >= W / 2 - 1 && x <= W / 2) return null;
      return p(x, yy, z);
    });
  }
}

/** Shirts and dresses that share the usual tee-shirt cut. */
function paintTops(g: VoxelGrid, s: PersonSpec, W: number, H: number, F: number, cx: number) {
  const top = s.top, acc = s.accent, skin = s.skin, o = s.outfit;
  const dkTop = shade(top, 0.8);
  switch (o) {
    case 'police': {
      // Short-sleeve uniform shirt: dark tie, badge, pocket flaps, epaulettes, duty belt.
      g.paint(cx - 1, 5, F, cx, H - 2, F, shade(top, 0.55));
      g.box(cx - 1, H - 2, F + 1, cx, H - 2, F + 1, shade(top, 0.5));
      g.box(cx - 3, H - 1, F - 1, cx + 2, H, F, (x) => (x === cx - 1 || x === cx ? null : shade(top, 0.9)));
      // Badge: a little star on the left chest.
      const bx = W - 5, by = H - 6;
      g.box(bx - 1, by - 1, F + 1, bx + 1, by + 1, F + 1, (x, y) => (y === by + 1 && x === bx ? shade(acc, 0.8) : acc));
      g.set(bx, by - 2, F + 1, acc);
      g.set(bx - 1, by + 2, F + 1, acc);
      g.set(bx + 1, by + 2, F + 1, acc);
      g.box(1, H - 6, F + 1, 4, H - 6, F + 1, dkTop); // pocket flap
      g.box(1, H - 9, F, 4, H - 7, F, shade(top, 0.92));
      g.paint(0, H - 1, 1, 2, H - 1, F - 1, dkTop); // epaulettes
      g.paint(W - 3, H - 1, 1, W - 1, H - 1, F - 1, dkTop);
      g.box(-1, 0, 3, -1, 4, 6, BLACK); // holster
      g.box(W, 1, 3, W, 3, 5, BLACK); // cuffs pouch
      g.box(W - 2, H - 4, F + 1, W - 2, H - 2, F + 1, 0x2a2a2a); // radio
      break;
    }
    case 'tank':
      g.paint(0, H - 1, 0, W - 1, H - 1, F, skin);
      g.paint(0, H - 5, 0, 2, H - 2, F, skin);
      g.paint(W - 3, H - 5, 0, W - 1, H - 2, F, skin);
      vNeck(g, W, H, F, 4, skin);
      g.paint(0, 2, 0, W - 1, 2, F, shade(top, 0.9));
      break;
    case 'polo':
      vNeck(g, W, H, F, 3, skin);
      g.box(cx - 4, H - 2, F + 1, cx - 2, H - 1, F + 1, (_x, y) => (y === H - 1 ? shade(top, 0.9) : top)); // collar points
      g.box(cx + 1, H - 2, F + 1, cx + 3, H - 1, F + 1, (_x, y) => (y === H - 1 ? shade(top, 0.9) : top));
      g.set(cx - 1, H - 5, F, WHITE);
      g.box(W - 5, H - 6, F + 1, W - 4, H - 5, F + 1, acc); // logo
      break;
    case 'graphicTee': {
      g.paint(cx - 3, H - 1, F, cx + 2, H - 1, F, shade(top, 0.85));
      const art = s.seed % 4;
      const ox = cx - 3, oy = H - 11;
      const pat = [
        ['..#..', '.###.', '#####', '.###.', '.#.#.'], // star
        ['.#.#.', '#####', '#####', '.###.', '..#..'], // heart
        ['.###.', '#.#.#', '#####', '.#.#.', '.....'], // skull
        ['#####', '#...#', '#.#.#', '#...#', '#####'], // box logo
      ][art];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (pat[4 - y][x] === '#') g.set(ox + x + 1, oy + y, F, acc);
      break;
    }
    case 'stripes':
      g.paint(0, 2, 0, W - 1, H - 2, F, (_x, y) => ((y >> 1) % 2 ? acc : top));
      g.paint(cx - 3, H - 1, F, cx + 2, H - 1, F, skin);
      break;
    case 'casual':
      g.paint(cx - 3, H - 1, F, cx + 2, H - 1, F, skin);
      g.paint(cx - 2, H - 2, F, cx + 1, H - 2, F, skin);
      g.paint(cx - 4, H - 1, F, cx + 3, H - 1, F, (x) => (x === cx - 4 || x === cx + 3 ? shade(top, 0.85) : null));
      break;
    case 'trendy':
      // Cropped top with a jacket worn off the shoulders.
      g.paint(0, 4, 0, W - 1, 5, F, skin);
      g.paint(1, 6, F, 3, H - 1, F, acc);
      g.paint(W - 4, 6, F, W - 2, H - 1, F, acc);
      vNeck(g, W, H, F, 2, skin);
      break;
    case 'plaid': {
      // Buffalo check: alternating blocks of the shirt color and a darker one, with stitch lines.
      const dark = mixHex(top, 0x1a1010, 0.55);
      const mid = mixHex(top, 0x1a1010, 0.28);
      const check = (x: number, y: number, z: number) => {
        const a = ((x + z) >> 1) % 2, b = (y >> 1) % 2;
        return a && b ? dark : a || b ? mid : top;
      };
      g.paint(0, 4, 0, W - 1, H - 1, F, check);
      vNeck(g, W, H, F, 4, skin);
      g.box(cx - 4, H - 2, F + 1, cx - 3, H - 1, F + 1, dark);
      g.box(cx + 2, H - 2, F + 1, cx + 3, H - 1, F + 1, dark);
      for (let y = 5; y < H - 4; y += 3) g.set(cx, y, F, shade(top, 1.3));
      g.box(2, H - 8, F + 1, 4, H - 6, F + 1, mid);
      g.box(W - 5, H - 8, F + 1, W - 3, H - 6, F + 1, mid);
      break;
    }
    case 'vest': {
      // Shirt with an open waistcoat: buttons, pockets and pointed tips.
      const v = acc;
      g.paint(0, 3, 0, W - 1, H - 1, F, (x, _y, z) => (z !== F || x < cx - 2 || x > cx + 1 ? v : null));
      g.paint(0, H - 1, 0, W - 1, H - 1, F, (x) => (x < 3 || x > W - 4 ? top : null));
      for (let y = 6; y < H - 4; y += 3) g.box(cx - 3, y, F + 1, cx - 3, y, F + 1, GOLD);
      g.box(cx - 2, 4, F, cx - 2, 5, F, v);
      g.box(cx + 1, 4, F, cx + 1, 5, F, v);
      g.box(cx - 3, 3, F + 1, cx - 2, 3, F + 1, shade(v, 0.8)); // tips over the belt
      g.box(cx + 1, 3, F + 1, cx + 2, 3, F + 1, shade(v, 0.8));
      g.box(1, 7, F + 1, 4, 7, F + 1, shade(v, 0.75));
      g.box(W - 5, 7, F + 1, W - 2, 7, F + 1, shade(v, 0.75));
      vNeck(g, W, H, F, 3, skin);
      break;
    }
    case 'apron': {
      // Work shirt with a long canvas apron: bib, neck strap, pocket, and a flap to the knees.
      const a = acc === top ? 0x7a6a5a : acc;
      const ad = shade(a, 0.85);
      vNeck(g, W, H, F, 3, skin);
      g.box(2, 0, F + 1, W - 3, H - 5, F + 1, (x, y) => (y > H - 9 && (x < 4 || x > W - 5) ? null : a));
      g.box(cx - 2, 5, F + 2, cx + 2, 9, F + 2, (x, y) => (y === 9 ? ad : x === cx ? ad : a)); // pocket
      g.box(4, H - 5, F + 1, 4, H - 1, F + 1, ad);
      g.box(W - 5, H - 5, F + 1, W - 5, H - 1, F + 1, ad);
      g.paint(4, H - 1, 0, 4, H - 1, F, ad);
      g.paint(W - 5, H - 1, 0, W - 5, H - 1, F, ad);
      g.paint(0, 6, 0, W - 1, 6, 1, ad); // waist tie
      g.box(cx - 1, 3, -1, cx, 7, -1, ad);
      g.box(2, -12, F + 1, W - 3, -1, F + 1, (x, y) => (y === -12 && (x === 2 || x === W - 3) ? null : y === -12 ? ad : a));
      break;
    }
    case 'scrubs':
      // V-neck scrub top over matching trousers, chest pocket, untucked.
      vNeck(g, W, H, F, 5, skin);
      g.paint(cx - 1, H - 6, F, cx, H - 6, F, WHITE);
      g.box(W - 6, H - 10, F + 1, W - 3, H - 7, F + 1, shade(top, 0.88));
      g.box(1, 3, F + 1, 4, 6, F + 1, shade(top, 0.88));
      g.paint(0, 0, 0, W - 1, 2, F, shade(top, 0.92));
      g.paint(0, 0, 0, W - 1, 1, F, s.bottoms);
      break;
    case 'swim':
      g.paint(0, 4, 0, W - 1, H - 1, F, skin);
      g.paint(cx - 1, H - 9, F, cx, H - 6, F, shade(skin, 0.92)); // sternum shadow
      g.paint(2, H - 6, F, W - 3, H - 6, F, (x) => (x === cx - 1 || x === cx ? null : shade(skin, 0.94)));
      for (const y of [6, 9, 12]) if (y < H - 7) g.paint(cx - 3, y, F, cx + 2, y, F, (x) => (x === cx - 1 || x === cx ? null : shade(skin, 0.95)));
      g.paint(0, 0, 0, W - 1, 3, F, s.bottoms);
      g.paint(0, 3, 0, W - 1, 3, F, shade(s.bottoms, 0.8));
      break;
    case 'tracksuit':
      g.paint(cx - 1, 2, F, cx - 1, H - 1, F, SILVER);
      g.paint(0, 2, 0, 0, H - 1, F, acc);
      g.paint(W - 1, 2, 0, W - 1, H - 1, F, acc);
      g.box(cx - 3, H - 1, F - 1, cx + 2, H, F, shade(top, 0.9));
      g.paint(0, 0, 0, W - 1, 2, F, shade(top, 0.85));
      break;
    case 'jacket':
      g.paint(cx - 2, 2, F, cx + 1, H - 1, F, acc);
      vNeck(g, W, H, F, 2, skin);
      g.box(cx - 3, 2, F + 1, cx - 3, H - 2, F + 1, shade(top, 0.85));
      g.box(cx + 2, 2, F + 1, cx + 2, H - 2, F + 1, shade(top, 0.85));
      g.box(cx - 4, H - 2, F + 1, cx - 3, H - 1, F + 1, shade(top, 0.8));
      g.box(cx + 2, H - 2, F + 1, cx + 3, H - 1, F + 1, shade(top, 0.8));
      g.box(1, 4, F + 1, 3, 4, F + 1, shade(top, 0.75));
      g.box(W - 4, 4, F + 1, W - 2, 4, F + 1, shade(top, 0.75));
      g.paint(0, 0, 0, W - 1, 2, F, shade(top, 0.82));
      break;
    case 'sweaterVest': {
      g.paint(0, 2, 0, W - 1, H - 1, F, (x, y) => ((x + y) % 6 === 0 || (x - y + 60) % 6 === 0 ? shade(top, 1.2) : top));
      g.paint(0, H - 3, 0, 1, H - 1, F, acc);
      g.paint(W - 2, H - 3, 0, W - 1, H - 1, F, acc);
      vNeck(g, W, H, F, 5, acc);
      g.paint(cx - 1, H - 6, F, cx, H - 2, F, s.seed % 2 ? 0x8a2a2a : 0x2a3a6a); // tie
      g.paint(0, 2, 0, W - 1, 3, F, shade(top, 0.85));
      break;
    }
    case 'dress':
      g.paint(0, 0, 0, W - 1, H - 1, F, top);
      g.paint(0, 5, 0, W - 1, 5, F, acc); // sash
      g.box(cx - 1, 5, F + 1, cx, 5, F + 1, shade(acc, 0.8));
      vNeck(g, W, H, F, 3, skin);
      break;
    case 'gown': {
      g.paint(0, 0, 0, W - 1, H - 1, F, top);
      g.paint(0, H - 4, 0, W - 1, H - 1, F, (x, y, z) => (z === F && x >= 2 && x <= W - 3 && y >= H - 3 ? skin : null));
      g.paint(0, H - 4, 0, W - 1, H - 4, F, GOLD); // gold neckline
      g.paint(2, H - 3, F, 2, H - 1, F, GOLD);
      g.paint(W - 3, H - 3, F, W - 3, H - 1, F, GOLD);
      g.box(cx - 1, H - 6, F + 1, cx, H - 5, F + 1, (x, y) => (y === H - 5 ? GOLD : x === cx - 1 ? s.accent : GOLD)); // pendant
      g.paint(0, 4, 0, W - 1, 4, F, shade(top, 0.82));
      g.box(cx - 1, 4, F + 1, cx, 4, F + 1, GOLD);
      g.paint(0, H - 1, 0, 2, H - 1, F, (x) => (x < 2 ? skin : null));
      // Puffed shoulders.
      for (const x of [-1, W]) g.box(x, H - 4, 1, x, H - 1, F - 1, shade(top, 0.95));
      break;
    }
    case 'robe': {
      // Wrapped robe: the collar crosses over the chest, with a wide sash.
      const edge = shade(top, 0.88);
      g.paint(0, 0, 0, W - 1, H - 1, F, top);
      for (let i = 0; i < 9; i++) {
        g.set(cx - 3 + Math.floor(i / 2), H - 1 - i, F, edge);
        g.set(cx + 2 - Math.floor(i / 3), H - 1 - i, F, edge);
      }
      vNeck(g, W, H, F, 4, skin);
      g.paint(0, 3, 0, W - 1, 6, F, acc);
      g.box(cx - 2, 3, F + 1, cx + 1, 6, F + 1, shade(acc, 0.85));
      g.box(cx + 1, -2, F + 1, cx + 2, 2, F + 1, acc);
      break;
    }
  }
}

export function paintArm(g: VoxelGrid, s: PersonSpec, d: Dims, side: number) {
  const [W, H, D] = d.arm;
  const inner = side > 0 ? 0 : W - 1;
  const outer = side > 0 ? W - 1 : 0;
  const outX = side > 0 ? W : -1;
  const skin = s.skin;
  g.box(0, 0, 0, W - 1, H - 1, D - 1, skin);
  // Bevel the arm's back corners so it reads round.
  g.clear(outer, 0, 0, outer, H - 1, 0);

  const o = s.outfit;
  let sleeve = o === 'cook' ? WHITE : o === 'swim' ? null : s.top;
  if (o === 'hiVis' && s.age !== 'elder') sleeve = s.top;
  if (o === 'gown') sleeve = s.top;
  let cuffY = H; // lowest sleeve row
  if (o === 'tank' || o === 'swim') sleeve = null;
  else if (LONG_SLEEVES.has(o) || s.age === 'elder') cuffY = 6;
  else if (ROLLED.has(o)) cuffY = 12;
  else cuffY = H - 9;
  if (o === 'gown' && s.lower === 'gown') cuffY = H - 7;
  if (sleeve !== null) {
    const plaid = o === 'plaid';
    const dark = mixHex(sleeve, 0x1a1010, 0.55), mid = mixHex(sleeve, 0x1a1010, 0.28);
    const paint = plaid
      ? (x: number, y: number, z: number) => {
          const a = ((x + z) >> 1) % 2, b = (y >> 1) % 2;
          return a && b ? dark : a || b ? mid : sleeve!;
        }
      : o === 'loudSuit'
        ? (x: number, y: number) => (((x >> 1) + (y >> 1)) % 2 ? sleeve! : shade(sleeve!, 0.86))
        : o === 'hawaiian'
          ? speckle(s.seed + 11, [sleeve, sleeve, sleeve, sleeve, s.accent, 0xf2f2f2])
          : sleeve;
    g.paint(0, cuffY, 0, W - 1, H - 1, D - 1, paint);
    const cuffC = o === 'suit' || o === 'loudSuit' ? WHITE : o === 'bandUniform' ? GOLD : ROLLED.has(o) ? shade(sleeve, 1.12) : shade(sleeve, 0.86);
    // Cuff steps out on the outer side, front and back (not the inner side, which touches the body).
    const cy0 = cuffY, cy1 = cuffY + (ROLLED.has(o) ? 1 : 0);
    g.box(outX, cy0, 0, outX, cy1, D - 1, cuffC);
    g.box(0, cy0, -1, W - 1, cy1, -1, cuffC);
    g.box(0, cy0, D, W - 1, cy1, D, cuffC);
    g.paint(0, cy0, 0, W - 1, cy1, D - 1, cuffC);
    if (o === 'tracksuit') g.paint(outer, cuffY, 0, outer, H - 1, D - 1, s.accent);
    if (o === 'firefighter') g.paint(0, cuffY + 4, 0, W - 1, cuffY + 5, D - 1, (_x, y) => (y === cuffY + 4 ? s.accent : SILVER));
    if (o === 'gown') g.box(outX, H - 4, 0, outX, H - 1, D - 1, shade(sleeve, 0.95));
    if (o === 'police' || o === 'bandUniform') g.box(outX, H - 6, 1, outX, H - 4, D - 2, o === 'police' ? shade(sleeve, 0.7) : GOLD); // shoulder patch
  } else if (o === 'tank') {
    g.paint(0, H - 2, 0, W - 1, H - 1, D - 1, (x) => (x === inner ? s.top : null));
  }
  // Elbow crease on bare forearms.
  if (sleeve === null || cuffY > 12) g.paint(0, 13, 0, W - 1, 13, D - 1, (x, _y, z) => (z === 0 && x !== inner ? shade(skin, 0.93) : null));
  if (s.extras.includes('bracelets') || o === 'robe') g.paint(0, 7, 0, W - 1, 7, D - 1, o === 'robe' ? shade(s.top, 0.9) : SILVER);

  // Hand: a chunky fist, a voxel deeper front and back, with a thumb wrapped across the front.
  const glove = s.extras.includes('gloves') ? (s.outfit === 'scrubs' ? 0x6ab0e0 : s.outfit === 'police' || s.job === 'EMT' ? 0x2a2a30 : 0x4a2a1a) : null;
  const hand = glove ?? shade(skin, 0.98);
  g.box(0, 0, -1, W - 1, 5, D, hand);
  g.clear(outer, 0, -1, outer, 0, -1);
  g.clear(outer, 0, D, outer, 0, D);
  g.paint(0, 0, D, W - 1, 3, D, (x, y) => ((x + (side > 0 ? 0 : 1)) % 2 && y > 0 ? shade(hand, 0.88) : null)); // finger lines
  g.paint(0, 4, D, W - 1, 4, D, shade(hand, 0.94)); // knuckles
  g.box(inner, 2, D + 1, inner + (side > 0 ? 1 : -1), 3, D + 1, shade(hand, 1.03)); // thumb
  if (glove) g.box(0, 6, -1, W - 1, 7, D, shade(glove, 0.85));
  if (side > 0 && s.extras.includes('watch')) {
    g.box(0, 6, -1, W - 1, 6, D, 0x2a2a30);
    g.box(outX, 6, 1, outX, 6, 2, 0xd8e0e8);
  }
}

export function paintLeg(g: VoxelGrid, s: PersonSpec, d: Dims, side: number) {
  const [W, H, D] = d.leg;
  const outer = side > 0 ? W - 1 : 0;
  const outX = side > 0 ? W : -1;
  const o = s.outfit;
  // Under a gown the legs wear the gown's cloth, so a stride reads as the skirt moving.
  const pants = s.lower === 'gown' ? s.top : o === 'overalls' ? s.accent : s.bottoms;
  const denim = DENIM.has(pants) || (s.outfit !== 'scrubs' && (pants & 0xff) > 0x80 && ((pants >> 16) & 0xff) < 0x50 && ((pants >> 8) & 0xff) < 0x70 && (pants & 0xff) < 0xb0);
  const cloth = denim ? speckle(s.seed + 21, [pants, pants, pants, shade(pants, 1.08), shade(pants, 0.93)]) : pants;
  g.box(0, 0, 0, W - 1, H - 1, D - 1, cloth);
  g.clear(outer, 0, 0, outer, H - 1, 0);
  g.paint(outer, 6, 0, outer, H - 1, D - 1, (_x, y, z) => (z === Math.floor(D / 2) && y % 2 ? shade(pants, 0.9) : null)); // side seam
  g.paint(0, Math.floor(H * 0.45), D - 1, W - 1, Math.floor(H * 0.45), D - 1, (x) => (x % 3 === 1 ? shade(pants, 0.88) : null)); // knee crease

  const bare = s.lower === 'shorts' || s.lower === 'skirt' || o === 'swim';
  if (bare) {
    const hemY = o === 'swim' ? H - 7 : s.lower === 'skirt' ? H - 7 : H - 11;
    g.paint(0, 0, 0, W - 1, hemY - 1, D - 1, s.skin);
    if (s.lower === 'shorts' || o === 'swim') {
      g.box(outX, hemY, 0, outX, hemY, D - 1, shade(pants, 0.85));
      g.box(0, hemY, D, W - 1, hemY, D, shade(pants, 0.85));
      g.paint(0, hemY, 0, W - 1, hemY, D - 1, shade(pants, 0.85));
    }
    if (s.lower === 'skirt') g.paint(0, hemY, 0, W - 1, H - 1, D - 1, s.bottoms);
    g.paint(0, Math.floor(H * 0.45), D - 1, W - 1, Math.floor(H * 0.45), D - 1, shade(s.skin, 0.95)); // knee
    if (s.shoeStyle !== 'sandals') g.paint(0, 4, 0, W - 1, 6, D - 1, WHITE); // socks
  } else if (s.lower === 'gown') {
    g.paint(0, 4, 0, W - 1, 4, D - 1, o === 'gown' ? GOLD : shade(pants, 0.85));
  } else {
    g.paint(0, 4, 0, W - 1, 4, D - 1, shade(pants, 0.86)); // hem
    if (o === 'overalls') g.paint(0, 4, 0, W - 1, 5, D - 1, shade(pants, 1.35));
  }
  if (o === 'firefighter') for (const y of [8, 9]) g.paint(0, y, 0, W - 1, y, D - 1, y === 8 ? s.accent : SILVER);

  // Shoes: four rows plus a toe that sticks forward, and a darker sole.
  const sh = s.shoes;
  const sole = shade(sh, sh < 0x404040 ? 1.9 : 0.6);
  const toe = (h: number, c: number | ((x: number, y: number, z: number) => number | null)) => g.box(0, 0, D, W - 1, h, D + 2, (x, y, z) => (z === D + 2 && y === h ? null : (x === 0 || x === W - 1) && z === D + 2 ? null : typeof c === 'number' ? c : c(x, y, z)));
  switch (s.shoeStyle) {
    case 'sneakers':
      g.paint(0, 0, 0, W - 1, 3, D - 1, sh);
      toe(2, sh);
      g.box(0, 0, -1, W - 1, 0, D + 2, (x, _y, z) => ((x === 0 || x === W - 1) && (z === -1 || z === D + 2) ? null : WHITE));
      g.paint(0, 0, 0, W - 1, 0, D + 2, WHITE);
      g.paint(outer, 1, 1, outer, 2, D - 1, (_x, y, z) => (y === 2 - (z % 2) ? WHITE : null)); // stripe
      g.paint(1, 2, D, W - 2, 2, D + 1, (x) => (x % 2 ? WHITE : null)); // laces
      break;
    case 'boots':
      g.paint(0, 0, 0, W - 1, 9, D - 1, sh);
      toe(2, sh);
      g.box(outX, 8, 0, outX, 9, D - 1, shade(sh, 0.85)); // cuff
      g.box(0, 8, -1, W - 1, 9, -1, shade(sh, 0.85));
      g.box(0, 8, D, W - 1, 9, D, shade(sh, 0.85));
      g.box(0, 0, -1, W - 1, 0, D + 2, (x, _y, z) => ((x === 0 || x === W - 1) && (z === -1 || z === D + 2) ? null : shade(sh, 0.55)));
      g.paint(0, 0, 0, W - 1, 0, D + 2, shade(sh, 0.55));
      g.box(0, 1, -1, W - 1, 1, -1, shade(sh, 0.6)); // heel
      break;
    case 'sandals': {
      const strap = s.outfit === 'scrubs' ? sh : 0x7a5232;
      g.paint(0, 0, 0, W - 1, 3, D - 1, s.skin);
      toe(1, s.skin);
      g.box(0, 0, -1, W - 1, 0, D + 2, strap === sh ? shade(sh, 0.8) : 0x5a3a22);
      g.paint(0, 0, 0, W - 1, 0, D + 2, strap === sh ? shade(sh, 0.8) : 0x5a3a22);
      if (s.outfit === 'scrubs') g.box(0, 1, 0, W - 1, 3, D + 2, (x, y, z) => (y === 3 && z > D ? null : (x + z) % 3 === 0 ? shade(sh, 1.1) : sh)); // clogs
      else g.paint(0, 1, D, W - 1, 1, D, strap);
      break;
    }
    default:
      g.paint(0, 0, 0, W - 1, 3, D - 1, sh);
      toe(2, sh);
      g.box(0, 0, -1, W - 1, 0, D + 2, (x, _y, z) => ((x === 0 || x === W - 1) && (z === -1 || z === D + 2) ? null : sole));
      g.paint(0, 0, 0, W - 1, 0, D + 2, sole);
      g.paint(1, 2, D, W - 2, 2, D, shade(sh, 1.25)); // toe shine
  }
}

// ---------------------------------------------------------------------------------------------
// Held items, in right-arm coordinates. The fist is rows 0-5; a handle at (hx, hz) runs through it.
// ---------------------------------------------------------------------------------------------

export function paintHeld(g: VoxelGrid, s: PersonSpec, d: Dims): boolean {
  const [W, , D] = d.arm;
  const hx = Math.floor(W / 2), hz = Math.floor(D / 2);
  const fz = D + 2; // just in front of the fist
  const wood = speckle(s.seed + 2, [0x8a5a2a, 0x7a4a22, 0x9a6a32]);
  const metal = 0xb8c0c8;
  const shaft = (y0: number, y1: number, p: number | ((x: number, y: number, z: number) => number)) => g.box(hx, y0, hz, hx, y1, hz, p);
  switch (s.held) {
    case 'pitchfork':
      shaft(-26, 30, wood);
      g.box(hx - 4, 31, hz, hx + 4, 31, hz, metal);
      for (const x of [-4, 0, 4]) g.box(hx + x, 32, hz, hx + x, 40, hz, metal);
      return true;
    case 'wrench':
      g.box(hx, 2, 2, hx, 3, D + 12, metal);
      g.box(hx - 1, 0, D + 13, hx + 1, 5, D + 14, metal);
      g.clear(hx - 1, 2, D + 14, hx + 1, 3, D + 14);
      return true;
    case 'parcel':
      g.box(hx - 4, -8, fz - 1, hx + 4, 3, fz + 9, 0xc8945a);
      g.box(hx, -8, fz - 1, hx, 3, fz + 9, 0xe8d8b0);
      g.box(hx - 4, 3, fz + 4, hx + 4, 3, fz + 4, 0xe8d8b0);
      g.box(hx - 3, -3, fz + 10, hx - 1, -1, fz + 10, 0xf2f2f2); // label
      return true;
    case 'cane':
      shaft(-22, 6, wood);
      g.box(hx, 7, hz, hx, 7, hz + 4, wood);
      g.box(hx, 5, hz + 5, hx, 6, hz + 5, wood);
      return true;
    case 'briefcase':
      g.box(hx, -2, hz - 1, hx, -1, hz + 1, 0x2a2a2a);
      g.box(hx - 1, -12, hz - 7, hx + 1, -3, hz + 7, 0x5a3a22);
      g.box(hx - 1, -4, hz - 7, hx + 1, -3, hz + 7, 0x4a2a16);
      g.box(hx + 2, -6, hz - 4, hx + 2, -5, hz - 3, GOLD);
      g.box(hx + 2, -6, hz + 3, hx + 2, -5, hz + 4, GOLD);
      return true;
    case 'phone':
      g.box(hx - 2, 1, fz, hx + 2, 8, fz, 0x2a2a30);
      g.box(hx - 1, 2, fz + 1, hx + 1, 7, fz + 1, (x, y) => (y === 7 && x === hx ? 0xffffff : 0x6ac0f0));
      return true;
    case 'spatula':
      shaft(-8, 6, 0x2a2a2a);
      g.box(hx - 3, -17, hz, hx + 3, -9, hz, metal);
      return true;
    case 'stopSign': {
      shaft(-14, 26, 0xc8c8c8);
      const cy = 36;
      g.box(hx - 8, cy - 8, hz + 1, hx + 8, cy + 8, hz + 1, (x, y) => {
        const dx = Math.abs(x - hx), dy = Math.abs(y - cy);
        if (dx + dy > 11) return null;
        if (dx + dy >= 10) return WHITE;
        if (dy <= 1 && dx <= 5 && (dx % 2 === 0 || dy === 0)) return WHITE;
        return 0xd02a2a;
      });
      return true;
    }
    case 'book':
      g.box(hx - 4, -4, fz, hx + 4, 6, fz + 2, 0x1e1e24);
      g.box(hx - 3, -3, fz + 3, hx + 3, 5, fz + 3, 0x2a2a34);
      g.box(hx - 4, -4, fz + 1, hx - 4, 6, fz + 1, 0xe8e0c8);
      g.box(hx, -1, fz + 3, hx, 3, fz + 3, GOLD);
      g.box(hx - 1, 2, fz + 3, hx + 1, 2, fz + 3, GOLD);
      return true;
    case 'clipboard':
      g.box(hx - 5, -6, fz, hx + 5, 8, fz, 0x8a5a2a);
      g.box(hx - 4, -5, fz + 1, hx + 4, 6, fz + 1, (_x, y) => (y % 2 === 0 && y < 4 ? 0x9aa0b0 : 0xf2f2f2));
      g.box(hx - 2, 7, fz + 1, hx + 2, 8, fz + 1, metal);
      return true;
    case 'donut':
      g.box(hx - 4, 1, fz, hx + 4, 2, fz + 8, (x, y, z) => {
        const dx = x - hx, dz = z - fz - 4;
        const r = dx * dx + dz * dz;
        if (r > 18 || r < 3) return null;
        return y === 2 ? ((x + z) % 3 === 0 ? 0x6ad0f0 : (x * z) % 4 === 1 ? 0xf2e040 : 0xf06aa8) : 0xc8904a;
      });
      return true;
    case 'hammer':
      shaft(-14, 6, wood);
      g.box(hx - 1, -19, hz - 4, hx + 1, -15, hz + 3, 0x6a6a70);
      g.box(hx - 1, -18, hz + 4, hx + 1, -16, hz + 5, 0x6a6a70);
      return true;
    case 'cleaver':
      shaft(-5, 6, 0x2a2a2a);
      g.box(hx, -16, hz - 1, hx, -6, hz + 8, (_x, y, z) => (z === hz + 8 || y === -16 ? 0xe8ecf0 : metal));
      g.set(hx, -8, hz + 6, 0x4a4a50);
      return true;
    case 'axe':
      shaft(-24, 8, wood);
      g.box(hx, -26, hz + 1, hx, -18, hz + 6, (_x, y, z) => (z === hz + 6 ? 0xe8ecf0 : y === -18 || y === -26 ? 0x7a7a80 : 0xc82a1a));
      g.box(hx, -24, hz - 4, hx, -20, hz - 1, 0x6a6a70);
      return true;
    case 'mop':
      shaft(-26, 22, 0x3a7ac0);
      g.box(hx - 4, -30, hz - 3, hx + 4, -27, hz + 3, (x, y, z) => ((x + z) % 2 && y === -30 ? null : (x + z) % 3 === 0 ? 0xc8c0a8 : 0xe8e0c8));
      return true;
    case 'toothbrush':
      shaft(-3, 22, 0x5ab0f0);
      g.box(hx, 18, hz + 1, hx, 22, hz + 2, WHITE);
      return true;
  }
  return false;
}
