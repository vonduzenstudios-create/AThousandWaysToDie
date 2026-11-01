/**
 * 3x5 pixel font for voxel shop signs. Each glyph is 5 rows of 3 bits, top row first,
 * most significant bit on the left.
 */
const GLYPHS: Record<string, number[]> = {
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b011, 0b100, 0b101, 0b101, 0b011],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  J: [0b001, 0b001, 0b001, 0b101, 0b010],
  K: [0b101, 0b101, 0b110, 0b101, 0b101],
  L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101],
  N: [0b110, 0b101, 0b101, 0b101, 0b101],
  O: [0b010, 0b101, 0b101, 0b101, 0b010],
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  Q: [0b010, 0b101, 0b101, 0b110, 0b011],
  R: [0b110, 0b101, 0b110, 0b101, 0b101],
  S: [0b011, 0b100, 0b010, 0b001, 0b110],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b111],
  V: [0b101, 0b101, 0b101, 0b101, 0b010],
  W: [0b101, 0b101, 0b111, 0b111, 0b101],
  X: [0b101, 0b101, 0b010, 0b101, 0b101],
  Y: [0b101, 0b101, 0b010, 0b010, 0b010],
  Z: [0b111, 0b001, 0b010, 0b100, 0b111],
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b110, 0b001, 0b010, 0b100, 0b111],
  '3': [0b110, 0b001, 0b010, 0b001, 0b110],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b110, 0b001, 0b110],
  '6': [0b011, 0b100, 0b110, 0b101, 0b010],
  '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b010, 0b101, 0b010, 0b101, 0b010],
  '9': [0b010, 0b101, 0b011, 0b001, 0b110],
  ' ': [0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0b010],
  ',': [0, 0, 0, 0b010, 0b100],
  '!': [0b010, 0b010, 0b010, 0, 0b010],
  '?': [0b110, 0b001, 0b010, 0, 0b010],
  "'": [0b010, 0b010, 0, 0, 0],
  '-': [0, 0, 0b111, 0, 0],
  '&': [0b010, 0b101, 0b010, 0b101, 0b011],
  '$': [0b011, 0b110, 0b010, 0b011, 0b110],
  '+': [0, 0b010, 0b111, 0b010, 0],
  '/': [0b001, 0b001, 0b010, 0b100, 0b100],
  ':': [0, 0b010, 0, 0b010, 0],
  '#': [0b101, 0b111, 0b101, 0b111, 0b101],
};

export const GLYPH_W = 3;
export const GLYPH_H = 5;

/** Width in pixels of a string with one pixel of spacing between glyphs. */
export const textWidth = (s: string) => Math.max(0, s.length * (GLYPH_W + 1) - 1);

/** Call plot(px, py) for each lit pixel; py = 0 is the bottom row. */
export function rasterText(s: string, plot: (px: number, py: number) => void) {
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const g = GLYPHS[up[i]] ?? GLYPHS['?'];
    for (let row = 0; row < GLYPH_H; row++)
      for (let col = 0; col < GLYPH_W; col++)
        if ((g[row] >> (GLYPH_W - 1 - col)) & 1) plot(i * (GLYPH_W + 1) + col, GLYPH_H - 1 - row);
  }
}
