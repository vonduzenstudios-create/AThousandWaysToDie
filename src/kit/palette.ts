import { vox } from './grid';

/** Named colors the kit uses. Map threads can pass any hex instead. */
export const PAL = {
  // Walls
  pink: 0xd98ca6,
  rose: 0xc77b8c,
  yellow: 0xe6c565,
  ochre: 0xd6a24e,
  peach: 0xeeb38a,
  terracotta: 0xc8714f,
  mint: 0xa3d2b6,
  sky: 0x9fc2de,
  cream: 0xece0c0,
  lavender: 0xb8a3d0,
  white: 0xf0ebe0,
  sage: 0xa9b98c,
  salmon: 0xe89a86,
  // Brick and stone
  brickRed: 0xa4503a,
  brickBrown: 0x8a4a35,
  brickPink: 0xc77a74,
  stone: 0xc9bea6,
  stoneGrey: 0x9a9a96,
  concrete: 0xb8b4aa,
  // Trim
  trimCream: 0xf3ecd9,
  trimWhite: 0xf7f4ec,
  trimStone: 0xd9ccb0,
  // Shutters and paint
  shutterGreen: 0x2f5e3b,
  shutterForest: 0x24472e,
  shutterTeal: 0x2b6a6c,
  shutterBlue: 0x35578f,
  shutterBrown: 0x6a4329,
  shutterRed: 0x8f302b,
  shutterGrey: 0x5c6670,
  // Materials
  glass: 0x1d2c3d,
  glassLight: 0x5d7f9c,
  iron: 0x23262b,
  metal: 0x8d949c,
  wood: 0x6e4a2b,
  woodDark: 0x4a2f1c,
  woodLight: 0xa77a4b,
  gold: 0xe6bb48,
  // Roofs
  tile: 0xb4553b,
  tileDark: 0x9a4430,
  tileOrange: 0xc96a43,
  slate: 0x4d5462,
  shingleBrown: 0x6b4a3a,
  shingleGrey: 0x5f6066,
  gravel: 0x85827c,
  // Plants
  leaf: 0x3f8f35,
  leafDark: 0x2c6a2a,
  leafLight: 0x5ca843,
  flowerRed: 0xe0303a,
  flowerPink: 0xf06aa8,
  flowerWhite: 0xf4f0f0,
  flowerYellow: 0xf2d040,
  flowerPurple: 0x9a5ad0,
  // Ground
  cobble: 0x5d6675,
  cobbleLight: 0x7c8594,
  cobbleDark: 0x434a57,
  grout: 0x2c3038,
  paver: 0xb9b2a4,
  asphalt: 0x3b3d43,
};

export const WALLS_EURO = [PAL.pink, PAL.rose, PAL.yellow, PAL.ochre, PAL.peach, PAL.terracotta, PAL.mint, PAL.sky, PAL.cream, PAL.lavender, PAL.salmon];
export const WALLS_HOUSE = [PAL.white, PAL.sky, PAL.mint, PAL.cream, PAL.yellow, PAL.sage, PAL.salmon, PAL.lavender];
export const SHUTTERS = [PAL.shutterGreen, PAL.shutterForest, PAL.shutterTeal, PAL.shutterBlue, PAL.shutterBrown, PAL.shutterRed, PAL.shutterGrey];
export const FLOWERS = [PAL.flowerRed, PAL.flowerPink, PAL.flowerWhite, PAL.flowerYellow, PAL.flowerPurple];
export const AWNINGS: [number, number][] = [
  [0xc8302c, 0xf2ece0],
  [0x2f7a45, 0xf2ece0],
  [0x2f5a9a, 0xf2ece0],
  [0xe0a830, 0xf2ece0],
  [0x8a2a3a, 0xe9d9b0],
  [0x1f6a6a, 0xe9d9b0],
  [0xd86a2a, 0xf4e8d0],
];
export const SIGN_BOARDS = [0x23402c, 0x5a1f24, 0x1d2c4a, 0x2a2a2e, 0x6a3a1c, 0xf0e6cc];

/** Frequently used cell values. */
export const V = {
  glass: vox(PAL.glass, { glass: true, jitter: 0.05 }),
  iron: vox(PAL.iron, { jitter: 0.04 }),
  metal: vox(PAL.metal, { jitter: 0.05 }),
  wood: vox(PAL.wood, { jitter: 0.1 }),
  woodDark: vox(PAL.woodDark, { jitter: 0.08 }),
  gold: vox(PAL.gold, { jitter: 0.04 }),
  warmBulb: vox(0xffd890, { emissive: true, jitter: 0 }),
};
