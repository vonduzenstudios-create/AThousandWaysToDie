/**
 * Anime-style cutscene art, all drawn on a 2D canvas in code. No image files.
 *
 * Everything is drawn in a virtual 1600 x 900 space. Backgrounds get the visible
 * rect (which can be wider or taller than 1600 x 900 on odd screens) so they always
 * fill the screen; characters stay inside the safe 1600 x 900 area.
 */

export const VW = 1600;
export const VH = 900;

export interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type C = CanvasRenderingContext2D;

const INK = '#15111c';

// ---------------------------------------------------------------- helpers

/** Deterministic pseudo-random from an integer seed, for stable sparkles and lines. */
export function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function ink(c: C, w = 6) {
  c.lineWidth = w;
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  c.lineCap = 'round';
}

function fillStroke(c: C, fill: string, w = 6) {
  c.fillStyle = fill;
  c.fill();
  ink(c, w);
  c.stroke();
}

function ellipse(c: C, x: number, y: number, rx: number, ry: number, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

function vgrad(c: C, v: View, stops: [number, string][]) {
  const g = c.createLinearGradient(0, v.y0, 0, v.y1);
  for (const [t, col] of stops) g.addColorStop(t, col);
  c.fillStyle = g;
  c.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
}

function star(c: C, x: number, y: number, r: number, color: string) {
  c.save();
  c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.18;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
  c.restore();
}

// ---------------------------------------------------------------- backgrounds

export type BgKind =
  | 'black'
  | 'white'
  | 'backyard'
  | 'explosion'
  | 'office'
  | 'dmv'
  | 'void'
  | 'focus-red'
  | 'focus-purple'
  | 'focus-gold'
  | 'speed-blue'
  | 'sparkle'
  | 'lake'
  | 'golf'
  | 'beach'
  | 'couch'
  | 'road'
  | 'rails'
  | 'sea'
  | 'sky';

export function drawBg(c: C, kind: BgKind, v: View, t: number) {
  switch (kind) {
    case 'black':
      c.fillStyle = '#000';
      c.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
      return;
    case 'white':
      c.fillStyle = '#fffaf2';
      c.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
      return;
    case 'backyard':
      return backyard(c, v, t);
    case 'explosion':
      vgrad(c, v, [[0, '#fff3a8'], [0.5, '#ff9a2e'], [1, '#c2251b']]);
      focusLines(c, v, t, '#fff7d0', 0.9, 90);
      burst(c, VW / 2, VH * 0.55, 330 + Math.sin(t * 20) * 20, '#fffbe8', '#ffcd3c');
      return;
    case 'office':
      return office(c, v);
    case 'dmv':
      return dmv(c, v, t);
    case 'void':
      vgrad(c, v, [[0, '#1a0f33'], [1, '#3d1f5c']]);
      floaters(c, v, t);
      return;
    case 'focus-red':
      vgrad(c, v, [[0, '#ff6b5a'], [1, '#9c1c22']]);
      focusLines(c, v, t, '#fff', 0.85, 110);
      return;
    case 'focus-purple':
      vgrad(c, v, [[0, '#4b1d7a'], [1, '#12081f']]);
      focusLines(c, v, t, '#c9a8ff', 0.6, 120);
      return;
    case 'focus-gold':
      vgrad(c, v, [[0, '#fff1b8'], [1, '#ffb347']]);
      focusLines(c, v, t, '#fff', 0.9, 100);
      return;
    case 'speed-blue':
      vgrad(c, v, [[0, '#2a6fdb'], [1, '#0d2a6b']]);
      speedLines(c, v, t, '#cfe6ff');
      return;
    case 'sparkle':
      return sparkleBg(c, v, t);
    case 'lake':
      return lake(c, v, t);
    case 'golf':
      return golf(c, v, t);
    case 'beach':
      return beach(c, v, t);
    case 'couch':
      return couch(c, v, t);
    case 'road':
      return road(c, v, t);
    case 'rails':
      return rails(c, v, t);
    case 'sea':
      return sea(c, v, t);
    case 'sky':
      return skyBg(c, v, t);
  }
}

/** Manga concentration lines toward the center. */
export function focusLines(c: C, v: View, t: number, color: string, alpha: number, count: number) {
  const cx = VW / 2;
  const cy = VH / 2;
  const R = Math.hypot(v.x1 - v.x0, v.y1 - v.y0);
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  const jitter = Math.floor(t * 14);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + hash(i + jitter * 31) * 0.05;
    const w = 0.004 + hash(i * 7 + jitter) * 0.012;
    const inner = 260 + hash(i * 13 + jitter) * 200;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * 0.75);
    c.lineTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R);
    c.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R);
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** Horizontal anime speed lines. */
export function speedLines(c: C, v: View, t: number, color: string, alpha = 0.7) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  const W = v.x1 - v.x0;
  for (let i = 0; i < 60; i++) {
    const y = v.y0 + hash(i) * (v.y1 - v.y0);
    const len = 200 + hash(i + 50) * 700;
    const speed = 1800 + hash(i + 90) * 2400;
    const x = v.x1 - (((t * speed + hash(i + 7) * W * 3) % (W + len * 2)) - len);
    const h = 1 + hash(i + 3) * 5;
    c.fillRect(x, y, len, h);
  }
  c.restore();
}

function burst(c: C, x: number, y: number, r: number, inner: string, outer: string) {
  c.save();
  c.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.6;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = outer;
  c.fill();
  ink(c, 8);
  c.stroke();
  ellipse(c, x, y, r * 0.45, r * 0.45);
  c.fillStyle = inner;
  c.fill();
  c.restore();
}

function halftone(c: C, v: View, color: string, size = 14, fromY = 0.55) {
  c.save();
  c.fillStyle = color;
  const y0 = v.y0 + (v.y1 - v.y0) * fromY;
  for (let y = y0; y < v.y1; y += size) {
    const k = (y - y0) / (v.y1 - y0);
    for (let x = v.x0 + ((y / size) % 2) * (size / 2); x < v.x1; x += size) {
      ellipse(c, x, y, size * 0.45 * k, size * 0.45 * k);
      c.fill();
    }
  }
  c.restore();
}

function floaters(c: C, v: View, t: number) {
  // Drifting DMV ticket numbers in the afterlife void.
  c.save();
  c.font = 'bold 28px "Arial Black", Impact, sans-serif';
  c.textAlign = 'center';
  for (let i = 0; i < 22; i++) {
    const x = v.x0 + hash(i) * (v.x1 - v.x0);
    const y = v.y1 - (((t * (20 + hash(i + 4) * 40) + hash(i + 9) * 1200) % 1200) - 150);
    c.globalAlpha = 0.18 + hash(i + 2) * 0.2;
    c.fillStyle = '#d9c8ff';
    c.fillText(String(4000000 + Math.floor(hash(i + 11) * 999999)), x, y);
  }
  c.restore();
}

function sparkleBg(c: C, v: View, t: number) {
  // Shoujo manga background: soft pink-gold gradient, bubbles and sparkles.
  vgrad(c, v, [[0, '#ffe3f1'], [0.5, '#ffd3e6'], [1, '#ffeec2']]);
  c.save();
  for (let i = 0; i < 26; i++) {
    const x = v.x0 + hash(i * 3) * (v.x1 - v.x0);
    const y = v.y0 + ((hash(i * 5) * (v.y1 - v.y0) - t * (12 + hash(i) * 20)) % (v.y1 - v.y0) + (v.y1 - v.y0)) % (v.y1 - v.y0);
    const r = 20 + hash(i * 7) * 70;
    c.globalAlpha = 0.35;
    ellipse(c, x, y, r, r);
    c.fillStyle = '#fff';
    c.fill();
    c.globalAlpha = 0.5;
    c.lineWidth = 3;
    c.strokeStyle = '#ffb3d1';
    c.stroke();
  }
  for (let i = 0; i < 30; i++) {
    const x = v.x0 + hash(i * 11 + 1) * (v.x1 - v.x0);
    const y = v.y0 + hash(i * 13 + 2) * (v.y1 - v.y0);
    const tw = 0.5 + 0.5 * Math.sin(t * 4 + i);
    c.globalAlpha = tw;
    star(c, x, y, 10 + hash(i) * 24, '#fff');
  }
  c.restore();
}

function skyline(c: C, v: View, baseY: number, color: string, seed: number, minH: number, maxH: number, windows?: string) {
  c.save();
  c.fillStyle = color;
  let x = v.x0 - 20;
  let i = 0;
  while (x < v.x1) {
    const w = 50 + hash(seed + i) * 90;
    const h = minH + hash(seed + i * 3) * (maxH - minH);
    c.fillRect(x, baseY - h, w, h + 4);
    if (windows) {
      c.fillStyle = windows;
      for (let wy = baseY - h + 14; wy < baseY - 10; wy += 22) {
        for (let wx = x + 8; wx < x + w - 10; wx += 16) {
          if (hash(wx * 0.37 + wy * 1.3 + seed) > 0.55) c.fillRect(wx, wy, 7, 10);
        }
      }
      c.fillStyle = color;
    }
    x += w + 4;
    i++;
  }
  c.restore();
}

function backyard(c: C, v: View, t: number) {
  vgrad(c, v, [[0, '#3b2a6b'], [0.45, '#e36d6d'], [0.7, '#ffb36b'], [1, '#ffd59a']]);
  // Sun low on the horizon.
  ellipse(c, VW * 0.78, VH * 0.6, 90, 90);
  c.fillStyle = '#fff1b0';
  c.fill();
  // Picket fence.
  const fy = VH * 0.62;
  c.fillStyle = '#f3e3d0';
  for (let x = v.x0; x < v.x1; x += 46) {
    c.beginPath();
    c.moveTo(x, v.y1);
    c.lineTo(x, fy + 20);
    c.lineTo(x + 17, fy);
    c.lineTo(x + 34, fy + 20);
    c.lineTo(x + 34, v.y1);
    c.closePath();
    c.fill();
    ink(c, 3);
    c.stroke();
  }
  c.fillRect(v.x0, fy + 60, v.x1 - v.x0, 18);
  // Lawn.
  c.fillStyle = '#4f9a3c';
  c.fillRect(v.x0, VH * 0.8, v.x1 - v.x0, v.y1 - VH * 0.8);
  // String lights.
  c.strokeStyle = '#2b2233';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(v.x0, VH * 0.18);
  c.quadraticCurveTo(VW / 2, VH * 0.34, v.x1, VH * 0.16);
  c.stroke();
  for (let i = 0; i < 18; i++) {
    const k = i / 17;
    const x = v.x0 + (v.x1 - v.x0) * k;
    const y = VH * 0.18 + Math.sin(k * Math.PI) * VH * 0.14 - k * 10;
    ellipse(c, x, y + 10, 8, 10);
    c.fillStyle = ['#ffe066', '#ff7aa2', '#7ae0ff'][i % 3];
    c.globalAlpha = 0.75 + 0.25 * Math.sin(t * 3 + i);
    c.fill();
    c.globalAlpha = 1;
  }
  // Turkey fryer on its burner, to the right.
  const px = VW * 0.8;
  const py = VH * 0.86;
  c.fillStyle = '#555';
  c.fillRect(px - 70, py - 10, 140, 14);
  for (let i = 0; i < 5; i++) {
    const fx = px - 50 + i * 25;
    const fh = 30 + Math.sin(t * 18 + i * 2) * 10;
    c.beginPath();
    c.moveTo(fx - 10, py - 8);
    c.quadraticCurveTo(fx, py - 8 - fh * 1.4, fx + 10, py - 8);
    c.fillStyle = i % 2 ? '#ffb02e' : '#ff5a2e';
    c.fill();
  }
  c.beginPath();
  c.moveTo(px - 80, py - 40);
  c.lineTo(px + 80, py - 40);
  c.lineTo(px + 70, py - 200);
  c.lineTo(px - 70, py - 200);
  c.closePath();
  fillStroke(c, '#b8c0c8');
  // Bubbling oil.
  for (let i = 0; i < 6; i++) {
    const bx = px - 55 + i * 22;
    const by = py - 205 - Math.abs(Math.sin(t * 6 + i)) * 18;
    ellipse(c, bx, by, 10, 8);
    c.fillStyle = '#e8b53a';
    c.fill();
  }
}

function office(c: C, v: View) {
  // Mortalis Mutual: cold, grey, glass.
  vgrad(c, v, [[0, '#c9d2dc'], [1, '#7d8a99']]);
  // Window with grey towers.
  const wx0 = VW * 0.08;
  const wx1 = VW * 0.92;
  c.fillStyle = '#9fb3c8';
  c.fillRect(wx0, VH * 0.06, wx1 - wx0, VH * 0.58);
  skyline(c, { x0: wx0, y0: 0, x1: wx1, y1: VH }, VH * 0.64, '#5c6878', 3, 120, 420, '#c7d6e6');
  c.strokeStyle = '#3d4552';
  c.lineWidth = 14;
  c.strokeRect(wx0, VH * 0.06, wx1 - wx0, VH * 0.58);
  for (let i = 1; i < 4; i++) {
    const x = wx0 + ((wx1 - wx0) * i) / 4;
    c.beginPath();
    c.moveTo(x, VH * 0.06);
    c.lineTo(x, VH * 0.64);
    c.stroke();
  }
  // Smug logo on the wall.
  c.fillStyle = '#2b3442';
  c.font = 'bold 44px "Arial Black", Impact, sans-serif';
  c.textAlign = 'center';
  c.fillText('MORTALIS MUTUAL', VW / 2, VH * 0.74);
  c.font = 'italic 22px Georgia, serif';
  c.fillText('"We\'re there for you. Mostly."', VW / 2, VH * 0.79);
  // Desk.
  c.fillStyle = '#3b3f47';
  c.fillRect(v.x0, VH * 0.86, v.x1 - v.x0, v.y1 - VH * 0.86);
}

function dmv(c: C, v: View, t: number) {
  // The afterlife DMV: purple-grey, a long counter, NOW SERVING sign, buzzing lights.
  vgrad(c, v, [[0, '#4a4366'], [1, '#2a2440']]);
  // Ceiling lights (one flickers).
  for (let i = 0; i < 5; i++) {
    const x = v.x0 + ((v.x1 - v.x0) * (i + 0.5)) / 5;
    const on = i !== 3 || Math.sin(t * 23) > -0.6;
    c.fillStyle = on ? '#f3f0ff' : '#777';
    c.fillRect(x - 110, v.y0, 220, 18);
    if (on) {
      c.globalAlpha = 0.12;
      c.beginPath();
      c.moveTo(x - 110, v.y0 + 18);
      c.lineTo(x + 110, v.y0 + 18);
      c.lineTo(x + 260, VH * 0.75);
      c.lineTo(x - 260, VH * 0.75);
      c.fill();
      c.globalAlpha = 1;
    }
  }
  // Sign.
  c.fillStyle = '#111';
  c.fillRect(VW * 0.62, VH * 0.12, 440, 120);
  c.strokeStyle = '#8a7fb8';
  c.lineWidth = 6;
  c.strokeRect(VW * 0.62, VH * 0.12, 440, 120);
  c.fillStyle = '#ff4b4b';
  c.font = 'bold 30px "Courier New", monospace';
  c.textAlign = 'left';
  c.fillText('NOW SERVING', VW * 0.62 + 26, VH * 0.12 + 48);
  c.font = 'bold 46px "Courier New", monospace';
  c.fillText('4,000,112', VW * 0.62 + 26, VH * 0.12 + 98);
  // Queue of ghosts in the back.
  for (let i = 0; i < 9; i++) {
    const x = v.x0 + 60 + i * 120;
    const y = VH * 0.62 + Math.sin(t * 2 + i) * 6;
    c.globalAlpha = 0.25;
    c.fillStyle = '#e6e0ff';
    c.beginPath();
    c.arc(x, y - 60, 34, Math.PI, 0);
    c.lineTo(x + 34, y + 20);
    c.lineTo(x - 34, y + 20);
    c.fill();
    c.globalAlpha = 1;
  }
  // Counter.
  c.fillStyle = '#6b5d8f';
  c.fillRect(v.x0, VH * 0.8, v.x1 - v.x0, v.y1 - VH * 0.8);
  c.fillStyle = '#857aa8';
  c.fillRect(v.x0, VH * 0.78, v.x1 - v.x0, 26);
  halftone(c, v, 'rgba(0,0,0,0.18)', 16, 0.82);
}

function lake(c: C, v: View, t: number) {
  vgrad(c, v, [[0, '#ff9a8b'], [0.35, '#ffc48b'], [0.55, '#ffe2a8'], [0.56, '#3d7cc9'], [1, '#18407a']]);
  ellipse(c, VW * 0.3, VH * 0.5, 80, 80);
  c.fillStyle = '#fff4c7';
  c.fill();
  // Pine silhouettes across the lake.
  c.fillStyle = '#3a4a6a';
  for (let i = 0; i < 40; i++) {
    const x = v.x0 + i * 46;
    const h = 40 + hash(i) * 70;
    c.beginPath();
    c.moveTo(x, VH * 0.56);
    c.lineTo(x + 20, VH * 0.56 - h);
    c.lineTo(x + 40, VH * 0.56);
    c.fill();
  }
  // Glittering water.
  for (let i = 0; i < 50; i++) {
    const x = v.x0 + hash(i * 3) * (v.x1 - v.x0);
    const y = VH * 0.6 + hash(i * 5) * (v.y1 - VH * 0.6);
    c.globalAlpha = 0.4 + 0.4 * Math.sin(t * 3 + i);
    c.fillStyle = '#fff';
    c.fillRect(x, y, 30 + hash(i) * 40, 3);
  }
  c.globalAlpha = 1;
  // Dock planks.
  c.fillStyle = '#8a5a3a';
  c.fillRect(v.x0, VH * 0.88, v.x1 - v.x0, v.y1 - VH * 0.88);
  ink(c, 3);
  for (let x = v.x0; x < v.x1; x += 90) {
    c.beginPath();
    c.moveTo(x, VH * 0.88);
    c.lineTo(x, v.y1);
    c.stroke();
  }
}

function golf(c: C, v: View, t: number) {
  vgrad(c, v, [[0, '#6cc3ff'], [0.6, '#c6ecff'], [0.61, '#6cc35a'], [1, '#2f7f2c']]);
  // Clouds.
  for (let i = 0; i < 5; i++) {
    const x = ((v.x0 + hash(i) * 2000 + t * 15) % 2000) - 200;
    const y = VH * 0.12 + hash(i + 3) * VH * 0.25;
    c.fillStyle = '#fff';
    for (let k = 0; k < 4; k++) {
      ellipse(c, x + k * 45, y + (k % 2) * 10, 50, 34);
      c.fill();
    }
  }
  // The green, flag and hole.
  ellipse(c, VW * 0.72, VH * 0.72, 330, 70);
  c.fillStyle = '#8fe07a';
  c.fill();
  ellipse(c, VW * 0.78, VH * 0.72, 22, 7);
  c.fillStyle = '#123';
  c.fill();
  c.fillStyle = '#eee';
  c.fillRect(VW * 0.78 - 3, VH * 0.42, 6, VH * 0.3);
  c.beginPath();
  const wave = Math.sin(t * 5) * 10;
  c.moveTo(VW * 0.78 + 3, VH * 0.42);
  c.quadraticCurveTo(VW * 0.78 + 50, VH * 0.44 + wave, VW * 0.78 + 100, VH * 0.46);
  c.lineTo(VW * 0.78 + 3, VH * 0.5);
  c.fillStyle = '#ff3b3b';
  c.fill();
  c.fillStyle = '#111';
  c.font = 'bold 26px "Arial Black", sans-serif';
  c.fillText('9', VW * 0.78 + 30, VH * 0.47);
}

function beach(c: C, v: View, t: number) {
  vgrad(c, v, [[0, '#ff7eb3'], [0.3, '#ffb36b'], [0.5, '#ffe08a'], [0.51, '#2fb5c9'], [0.72, '#1b7fa6'], [0.73, '#f6d79a'], [1, '#e8b96a']]);
  // Sunset.
  c.save();
  c.beginPath();
  c.rect(v.x0, v.y0, v.x1 - v.x0, VH * 0.505 - v.y0);
  c.clip();
  ellipse(c, VW * 0.5, VH * 0.5, 130, 130);
  c.fillStyle = '#fff3a8';
  c.fill();
  c.restore();
  for (let i = 0; i < 8; i++) {
    c.fillStyle = 'rgba(255,240,170,0.55)';
    c.fillRect(VW * 0.5 - 120 + hash(i) * 60, VH * 0.52 + i * 22, 240 - i * 24, 5);
  }
  // Waves.
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    for (let x = v.x0; x <= v.x1; x += 20) {
      c.lineTo(x, VH * 0.7 + i * 8 + Math.sin(x * 0.02 + t * 2 + i) * 6);
    }
    c.stroke();
  }
  // Palm tree on the left.
  palm(c, VW * 0.08, VH * 0.95, t);
}

function palm(c: C, x: number, y: number, t: number) {
  c.save();
  ink(c, 6);
  c.fillStyle = '#7a4a26';
  c.beginPath();
  c.moveTo(x - 20, y);
  c.quadraticCurveTo(x + 40, y - 300, x + 120, y - 560);
  c.lineTo(x + 150, y - 550);
  c.quadraticCurveTo(x + 80, y - 300, x + 25, y);
  c.closePath();
  c.fill();
  c.stroke();
  const tx = x + 135;
  const ty = y - 560;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55 + Math.sin(t * 1.5 + i) * 0.05;
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo(tx + Math.cos(a - 0.3) * 160, ty + Math.sin(a - 0.3) * 160, tx + Math.cos(a) * 260, ty + Math.sin(a) * 200 + 90);
    c.quadraticCurveTo(tx + Math.cos(a + 0.2) * 120, ty + Math.sin(a + 0.2) * 100, tx, ty);
    c.fillStyle = '#2e9a4a';
    c.fill();
    c.stroke();
  }
  c.restore();
}

function couch(c: C, v: View, t: number) {
  // Death's living room: wallpaper, a lamp and the glow of a TV.
  vgrad(c, v, [[0, '#4c3a5e'], [1, '#2c2138']]);
  c.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = v.x0; x < v.x1; x += 60) c.fillRect(x, v.y0, 24, v.y1 - v.y0);
  c.globalAlpha = 0.18 + 0.06 * Math.sin(t * 9);
  c.fillStyle = '#7fd4ff';
  c.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  c.globalAlpha = 1;
  c.fillStyle = '#7a2e3a';
  c.fillRect(v.x0, VH * 0.72, v.x1 - v.x0, v.y1 - VH * 0.72);
}

function road(c: C, v: View, t: number) {
  vgrad(c, v, [[0, '#ff8a5c'], [0.5, '#ffd27a'], [0.62, '#ffe7b0'], [0.63, '#6aa84f'], [1, '#3f7a2e']]);
  skyline(c, v, VH * 0.63, '#8d6a8a', 21, 60, 280, '#ffe9a8');
  c.fillStyle = '#3a3a44';
  c.fillRect(v.x0, VH * 0.74, v.x1 - v.x0, 120);
  c.fillStyle = '#ffd84a';
  const off = (t * 900) % 160;
  for (let x = v.x0 - off; x < v.x1; x += 160) c.fillRect(x, VH * 0.74 + 56, 80, 8);
}

function rails(c: C, v: View, t: number) {
  vgrad(c, v, [[0, '#1d2b5c'], [0.55, '#5a4a8a'], [0.66, '#c48ab5'], [0.67, '#2b2b36'], [1, '#1a1a22']]);
  skyline(c, v, VH * 0.67, '#151a30', 41, 120, 520, '#ffe38a');
  // Moving sleepers.
  c.fillStyle = '#5b4636';
  const off = (t * 1200) % 60;
  for (let x = v.x0 - off; x < v.x1; x += 60) c.fillRect(x, VH * 0.8, 20, 30);
  c.fillStyle = '#aab';
  c.fillRect(v.x0, VH * 0.8, v.x1 - v.x0, 6);
  c.fillRect(v.x0, VH * 0.83, v.x1 - v.x0, 6);
}

function sea(c: C, v: View, t: number) {
  vgrad(c, v, [[0, '#7ec8ff'], [0.55, '#d9f1ff'], [0.56, '#2b8fd0'], [1, '#0f4f86']]);
  for (let i = 0; i < 4; i++) {
    c.fillStyle = '#fff';
    const x = ((hash(i) * 2000 - t * 25) % 2000 + 2000) % 2000 - 200;
    for (let k = 0; k < 4; k++) {
      ellipse(c, x + k * 50, VH * 0.18 + i * 50 + (k % 2) * 10, 55, 30);
      c.fill();
    }
  }
  c.strokeStyle = 'rgba(255,255,255,0.6)';
  c.lineWidth = 4;
  for (let i = 0; i < 8; i++) {
    c.beginPath();
    for (let x = v.x0; x <= v.x1; x += 24) c.lineTo(x, VH * 0.6 + i * 40 + Math.sin(x * 0.015 + t * 3 + i) * 8);
    c.stroke();
  }
}

function skyBg(c: C, v: View, t: number) {
  vgrad(c, v, [[0, '#2b6fe0'], [0.7, '#9fd6ff'], [1, '#e8f6ff']]);
  for (let i = 0; i < 9; i++) {
    c.fillStyle = 'rgba(255,255,255,0.9)';
    const x = ((hash(i) * 2400 - t * 500 * (0.5 + hash(i + 1))) % 2400 + 2400) % 2400 - 400;
    const y = VH * 0.2 + hash(i + 5) * VH * 0.7;
    for (let k = 0; k < 4; k++) {
      ellipse(c, x + k * 60, y + (k % 2) * 12, 70, 36);
      c.fill();
    }
  }
}

// ---------------------------------------------------------------- vehicles

export type VehicleKind = 'bus' | 'train' | 'boat' | 'plane';

/** Draws a vehicle centered at (x, y), facing right. */
export function drawVehicle(c: C, kind: VehicleKind, x: number, y: number, t: number) {
  c.save();
  c.translate(x, y);
  const bob = Math.sin(t * 12) * 3;
  c.translate(0, bob);
  if (kind === 'bus') {
    c.beginPath();
    c.roundRect(-260, -150, 520, 150, 26);
    fillStroke(c, '#ffc42e', 7);
    c.fillStyle = '#8fd8ff';
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.roundRect(-230 + i * 92, -128, 74, 60, 8);
      c.fill();
      ink(c, 4);
      c.stroke();
    }
    c.fillStyle = '#222';
    c.font = 'bold 26px "Arial Black", sans-serif';
    c.textAlign = 'center';
    c.fillText('EXPRESS', 0, -30);
    wheel(c, -160, 0, t);
    wheel(c, 160, 0, t);
  } else if (kind === 'train') {
    c.beginPath();
    c.moveTo(-340, 0);
    c.lineTo(-340, -170);
    c.lineTo(250, -170);
    c.quadraticCurveTo(360, -150, 380, 0);
    c.closePath();
    fillStroke(c, '#e8edf5', 7);
    c.fillStyle = '#d6324a';
    c.fillRect(-340, -70, 700, 26);
    c.fillStyle = '#2b3550';
    for (let i = 0; i < 6; i++) c.fillRect(-310 + i * 95, -140, 70, 50);
    c.beginPath();
    c.moveTo(270, -150);
    c.quadraticCurveTo(340, -130, 352, -90);
    c.lineTo(270, -90);
    c.fill();
    wheel(c, -250, 0, t, 26);
    wheel(c, -180, 0, t, 26);
    wheel(c, 200, 0, t, 26);
    wheel(c, 270, 0, t, 26);
  } else if (kind === 'boat') {
    c.translate(0, Math.sin(t * 2) * 8 - bob);
    c.rotate(Math.sin(t * 1.6) * 0.03);
    c.beginPath();
    c.moveTo(-330, -60);
    c.lineTo(360, -60);
    c.lineTo(280, 40);
    c.lineTo(-290, 40);
    c.closePath();
    fillStroke(c, '#f2f2f2', 7);
    c.fillStyle = '#1f4f8a';
    c.fillRect(-300, 0, 590, 22);
    c.beginPath();
    c.roundRect(-170, -170, 300, 110, 10);
    fillStroke(c, '#fff', 6);
    c.fillStyle = '#2b3550';
    for (let i = 0; i < 4; i++) c.fillRect(-150 + i * 70, -150, 50, 36);
    c.beginPath();
    c.roundRect(-20, -250, 60, 80, 6);
    fillStroke(c, '#d6324a', 6);
  } else {
    // plane
    c.translate(0, -bob);
    c.rotate(-0.08);
    c.beginPath();
    c.moveTo(-200, 40);
    c.lineTo(-40, 40);
    c.lineTo(-140, 170);
    c.lineTo(-80, 170);
    c.lineTo(90, 40);
    c.closePath();
    fillStroke(c, '#c9d3e0', 6);
    c.beginPath();
    c.moveTo(-380, -10);
    c.quadraticCurveTo(-380, -60, -300, -60);
    c.lineTo(300, -60);
    c.quadraticCurveTo(400, -50, 420, 0);
    c.quadraticCurveTo(400, 50, 300, 50);
    c.lineTo(-300, 50);
    c.quadraticCurveTo(-380, 50, -380, -10);
    fillStroke(c, '#ffffff', 7);
    c.beginPath();
    c.moveTo(-320, -55);
    c.lineTo(-390, -190);
    c.lineTo(-330, -190);
    c.lineTo(-240, -55);
    c.closePath();
    fillStroke(c, '#d6324a', 6);
    c.fillStyle = '#2b3550';
    for (let i = 0; i < 9; i++) {
      ellipse(c, -230 + i * 55, -14, 12, 14);
      c.fill();
    }
    c.beginPath();
    c.moveTo(330, -40);
    c.quadraticCurveTo(380, -36, 395, -10);
    c.lineTo(330, -10);
    c.fill();
  }
  c.restore();
}

function wheel(c: C, x: number, y: number, t: number, r = 38) {
  ellipse(c, x, y, r, r);
  fillStroke(c, '#222', 5);
  c.save();
  c.translate(x, y);
  c.rotate(t * 20);
  c.fillStyle = '#bbb';
  c.fillRect(-r * 0.5, -3, r, 6);
  c.fillRect(-3, -r * 0.5, 6, r);
  c.restore();
}

// ---------------------------------------------------------------- characters

export type Who = 'death' | 'gary' | 'ghost' | 'adjuster';
export type Expr = 'neutral' | 'happy' | 'angry' | 'shock' | 'smug' | 'proud' | 'tired' | 'cry' | 'determined';
export type Outfit = 'robe' | 'fishing' | 'golf' | 'vacation' | 'sweater';
export type Prop = 'none' | 'scythe' | 'coffee' | 'rod' | 'club' | 'drink' | 'pass' | 'remote';

export interface CharOpts {
  who: Who;
  expr: Expr;
  outfit?: Outfit;
  prop?: Prop;
  /** Seconds since the shot started, for blinking and idle bob. */
  t: number;
  /** 0..1 talking mouth flap. */
  talk: number;
}

/** Draws a character bust with its feet off the bottom of the frame, centered on x = 0, y = 0 at the bottom edge. */
export function drawChar(c: C, o: CharOpts) {
  c.save();
  const bob = Math.sin(o.t * 2.2) * 4;
  c.translate(0, bob);
  if (o.who === 'death') drawDeath(c, o);
  else drawHuman(c, o);
  c.restore();
}

function blinkNow(t: number) {
  const p = t % 3.7;
  return p > 3.55;
}

function drawDeath(c: C, o: CharOpts) {
  const outfit = o.outfit ?? 'robe';
  const prop = o.prop ?? 'none';
  const hood = outfit === 'robe' || outfit === 'sweater';

  if (prop === 'scythe') scythe(c, 210, 40, -0.25);

  // Body.
  c.beginPath();
  c.moveTo(-340, 60);
  c.quadraticCurveTo(-320, -250, -150, -320);
  c.lineTo(150, -320);
  c.quadraticCurveTo(320, -250, 340, 60);
  c.closePath();
  const bodyCol = outfit === 'vacation' ? '#ff7a45' : outfit === 'golf' ? '#f5f0e6' : outfit === 'sweater' ? '#c9503f' : outfit === 'fishing' ? '#5d7a4a' : '#1d1828';
  fillStroke(c, bodyCol, 7);
  // Cel shadow on the right half.
  c.save();
  c.clip();
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(60, -400, 400, 500);
  if (outfit === 'vacation') {
    // Hawaiian flowers.
    for (let i = 0; i < 14; i++) {
      const fx = -300 + hash(i) * 600;
      const fy = -300 + hash(i + 20) * 340;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ellipse(c, fx + Math.cos(a) * 14, fy + Math.sin(a) * 14, 12, 12);
        c.fillStyle = i % 2 ? '#fff4a3' : '#ffe0f0';
        c.fill();
      }
      ellipse(c, fx, fy, 7, 7);
      c.fillStyle = '#e8425a';
      c.fill();
    }
  } else if (outfit === 'sweater') {
    c.strokeStyle = '#fff';
    c.lineWidth = 6;
    for (let y = -200; y < 60; y += 60) {
      c.beginPath();
      for (let x = -340; x <= 340; x += 30) c.lineTo(x, y + ((x / 30) % 2 === 0 ? 0 : 18));
      c.stroke();
    }
  } else if (outfit === 'fishing') {
    c.fillStyle = '#4a6438';
    c.fillRect(-120, -320, 70, 400);
    c.fillRect(50, -320, 70, 400);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = '#c7b98a';
      c.fillRect(-110 + (i % 2) * 160, -200 + Math.floor(i / 2) * 110, 50, 40);
    }
  } else if (outfit === 'golf') {
    c.fillStyle = '#2f6fb5';
    for (let x = -340; x < 340; x += 50) {
      c.save();
      c.translate(x, -120);
      c.rotate(Math.PI / 4);
      c.fillRect(-14, -14, 28, 28);
      c.restore();
    }
  }
  c.restore();
  if (outfit === 'vacation') {
    // Flower lei.
    for (let i = 0; i < 13; i++) {
      const a = Math.PI * (0.05 + (0.9 * i) / 12);
      ellipse(c, Math.cos(a) * 150, -330 + Math.sin(a) * 90, 22, 22);
      c.fillStyle = ['#ff5f8f', '#ffd23f', '#a26bff'][i % 3];
      c.fill();
      ink(c, 3);
      c.stroke();
    }
  }

  // Bony hands holding the prop.
  if (prop !== 'none' && prop !== 'scythe') handProp(c, prop, o.t);

  // Hood back.
  if (hood) {
    c.beginPath();
    c.moveTo(-210, -300);
    c.bezierCurveTo(-280, -560, -180, -780, 0, -800);
    c.bezierCurveTo(180, -780, 280, -560, 210, -300);
    c.quadraticCurveTo(0, -250, -210, -300);
    fillStroke(c, outfit === 'sweater' ? '#1d1828' : '#221c30', 7);
    ellipse(c, 0, -525, 160, 200);
    c.fillStyle = '#07060b';
    c.fill();
  }

  // Skull.
  const jawDrop = o.expr === 'shock' ? 40 : o.talk * 16;
  c.beginPath();
  c.moveTo(-70, -470);
  c.lineTo(-70, -430 + jawDrop);
  c.quadraticCurveTo(0, -395 + jawDrop, 70, -430 + jawDrop);
  c.lineTo(70, -470);
  fillStroke(c, '#efe9dc', 6);
  ellipse(c, 0, -570, 120, 125);
  fillStroke(c, '#f6f2e8', 6);
  c.save();
  ellipse(c, 0, -570, 117, 122);
  c.clip();
  ellipse(c, 70, -560, 90, 140);
  c.fillStyle = 'rgba(120,100,80,0.18)';
  c.fill();
  c.restore();
  // Teeth.
  c.fillStyle = '#fff';
  c.fillRect(-58, -478, 116, 26);
  ink(c, 4);
  c.strokeRect(-58, -478, 116, 26);
  for (let x = -38; x <= 38; x += 19) {
    c.beginPath();
    c.moveTo(x, -478);
    c.lineTo(x, -452);
    c.stroke();
  }
  if (jawDrop > 4) {
    c.fillStyle = '#07060b';
    c.fillRect(-56, -452, 112, jawDrop * 0.9);
    c.fillStyle = '#fff';
    c.fillRect(-56, -452 + jawDrop * 0.9, 112, 16);
    c.strokeRect(-56, -452 + jawDrop * 0.9, 112, 16);
  }
  // Nose.
  c.beginPath();
  c.moveTo(0, -530);
  c.lineTo(-14, -500);
  c.lineTo(14, -500);
  c.closePath();
  c.fillStyle = INK;
  c.fill();

  skullEyes(c, o);

  // Hats.
  if (outfit === 'fishing') {
    c.beginPath();
    c.moveTo(-170, -640);
    c.quadraticCurveTo(0, -600, 170, -640);
    c.lineTo(110, -700);
    c.quadraticCurveTo(0, -760, -110, -700);
    c.closePath();
    fillStroke(c, '#c7b98a', 6);
    // A lure stuck in the hat.
    ellipse(c, 80, -700, 12, 8);
    c.fillStyle = '#ff3b3b';
    c.fill();
  } else if (outfit === 'golf') {
    c.beginPath();
    c.moveTo(-125, -630);
    c.quadraticCurveTo(0, -690, 125, -630);
    c.lineTo(190, -600);
    c.quadraticCurveTo(0, -590, -125, -630);
    fillStroke(c, '#fff', 6);
    c.fillStyle = '#2f6fb5';
    c.fillRect(-120, -650, 240, 14);
  } else if (outfit === 'vacation') {
    c.beginPath();
    c.ellipse(0, -650, 230, 46, 0, 0, Math.PI * 2);
    fillStroke(c, '#f2d27a', 6);
    c.beginPath();
    c.moveTo(-110, -655);
    c.quadraticCurveTo(-100, -770, 0, -770);
    c.quadraticCurveTo(100, -770, 110, -655);
    fillStroke(c, '#f2d27a', 6);
    c.fillStyle = '#ff5f8f';
    c.fillRect(-110, -690, 220, 22);
  }

  // Anime marks.
  if (o.expr === 'angry') angerVein(c, 115, -680, 1.1);
  if (o.expr === 'tired' || o.expr === 'shock') sweatDrop(c, 140, -620, o.t);
  if (o.expr === 'proud') {
    blush(c, -78, -520);
    blush(c, 78, -520);
    star(c, 190, -700, 34 + Math.sin(o.t * 6) * 8, '#fff6b0');
    star(c, -200, -640, 22 + Math.cos(o.t * 5) * 6, '#fff6b0');
  }
}

function skullEyes(c: C, o: CharOpts) {
  const lx = -50;
  const rx = 50;
  const y = -580;
  const e = o.expr;
  if (o.outfit === 'vacation') {
    // Sunglasses with an anime glint.
    for (const x of [lx, rx]) {
      c.beginPath();
      c.roundRect(x - 46, y - 30, 92, 58, 18);
      fillStroke(c, '#111', 5);
      c.save();
      c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = 9;
      const g = ((o.t * 0.7) % 2) * 200 - 100;
      c.beginPath();
      c.moveTo(x - 40 + g, y + 30);
      c.lineTo(x + g, y - 30);
      c.stroke();
      c.restore();
    }
    c.beginPath();
    c.moveTo(lx + 46, y - 10);
    c.lineTo(rx - 46, y - 10);
    ink(c, 6);
    c.stroke();
    return;
  }
  const glow = e === 'angry' ? '#ff3b3b' : '#6ff3ff';
  const blink = blinkNow(o.t) && e !== 'shock';
  for (const x of [lx, rx]) {
    const right = x > 0;
    if (e === 'happy' || e === 'proud') {
      // Closed happy arches.
      c.beginPath();
      c.moveTo(x - 32, y + 10);
      c.quadraticCurveTo(x, y - 40, x + 32, y + 10);
      ink(c, 12);
      c.stroke();
      if (e === 'proud' && right) {
        // A single proud tear.
        ellipse(c, x + 28, y + 30 + ((o.t * 30) % 40), 8, 12);
        c.fillStyle = '#9fe6ff';
        c.fill();
      }
      continue;
    }
    c.beginPath();
    if (e === 'angry') {
      c.moveTo(x - 38, y - (right ? 30 : 4));
      c.lineTo(x + 38, y - (right ? 4 : 30));
      c.lineTo(x + 30, y + 28);
      c.lineTo(x - 30, y + 28);
      c.closePath();
    } else if (e === 'tired' || (e === 'smug' && right)) {
      c.ellipse(x, y + 4, 36, 26, 0, 0, Math.PI);
      c.closePath();
    } else if (e === 'shock') {
      c.ellipse(x, y, 42, 48, 0, 0, Math.PI * 2);
    } else {
      c.ellipse(x, y, 36, 32, 0, 0, Math.PI * 2);
    }
    c.fillStyle = '#07060b';
    c.fill();
    if (blink) continue;
    // Glowing pupil.
    c.save();
    c.shadowColor = glow;
    c.shadowBlur = 24;
    const pr = e === 'shock' ? 6 : e === 'angry' ? 13 : 11;
    ellipse(c, x + (e === 'smug' ? 6 : 0), y + (e === 'tired' || (e === 'smug' && right) ? 14 : 2), pr, pr);
    c.fillStyle = e === 'shock' ? '#fff' : glow;
    c.fill();
    c.restore();
    if (e !== 'shock') {
      ellipse(c, x - 4, y - 4, 4, 4);
      c.fillStyle = '#fff';
      c.fill();
    }
  }
  if (e === 'tired') {
    // Eye bags.
    c.strokeStyle = 'rgba(80,60,120,0.6)';
    c.lineWidth = 4;
    for (const x of [lx, rx]) {
      c.beginPath();
      c.arc(x, y + 30, 26, 0.2, Math.PI - 0.2);
      c.stroke();
    }
  }
}

function scythe(c: C, x: number, y: number, rot: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = '#4a3020';
  c.fillRect(-12, -900, 24, 960);
  ink(c, 5);
  c.strokeRect(-12, -900, 24, 960);
  c.beginPath();
  c.moveTo(0, -880);
  c.quadraticCurveTo(-200, -960, -420, -820);
  c.quadraticCurveTo(-210, -880, 0, -830);
  c.closePath();
  const g = c.createLinearGradient(-420, -900, 0, -830);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#9aa6b8');
  c.fillStyle = g;
  c.fill();
  ink(c, 6);
  c.stroke();
  c.restore();
}

function handProp(c: C, prop: Prop, t: number) {
  const hx = -150;
  const hy = -190;
  c.save();
  if (prop === 'coffee') {
    c.beginPath();
    c.roundRect(hx - 50, hy - 90, 100, 120, 10);
    fillStroke(c, '#fff', 6);
    c.fillStyle = '#5b3a8a';
    c.font = 'bold 20px "Arial Black", sans-serif';
    c.textAlign = 'center';
    c.fillText('#1', hx, hy - 30);
    c.fillText('REAPER', hx, hy - 6);
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      const sx = hx - 25 + i * 25;
      c.moveTo(sx, hy - 100);
      c.bezierCurveTo(sx + 15, hy - 130, sx - 15, hy - 150, sx + Math.sin(t * 3 + i) * 8, hy - 180);
      c.stroke();
    }
  } else if (prop === 'drink') {
    c.beginPath();
    c.moveTo(hx - 50, hy - 110);
    c.lineTo(hx + 50, hy - 110);
    c.lineTo(hx + 30, hy + 20);
    c.lineTo(hx - 30, hy + 20);
    c.closePath();
    fillStroke(c, '#ffb347', 6);
    c.fillStyle = '#ff5f8f';
    c.beginPath();
    c.arc(hx + 20, hy - 140, 34, Math.PI, 0);
    c.fill();
    c.strokeStyle = '#3bd16f';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(hx - 10, hy - 100);
    c.lineTo(hx - 40, hy - 190);
    c.stroke();
  } else if (prop === 'rod') {
    c.strokeStyle = '#5a3a20';
    c.lineWidth = 12;
    c.beginPath();
    c.moveTo(hx, hy);
    c.lineTo(hx - 420, hy - 520);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(hx - 420, hy - 520);
    c.quadraticCurveTo(hx - 520, hy - 200, hx - 480, hy + 300 + Math.sin(t * 2) * 10);
    c.stroke();
  } else if (prop === 'club') {
    c.strokeStyle = '#aab';
    c.lineWidth = 10;
    c.beginPath();
    c.moveTo(hx, hy);
    c.lineTo(hx - 120, hy - 460);
    c.stroke();
    c.beginPath();
    c.roundRect(hx - 160, hy - 500, 70, 40, 10);
    fillStroke(c, '#ccd', 5);
  } else if (prop === 'pass' || prop === 'remote') {
    c.translate(hx + 20, hy - 120);
    c.rotate(-0.2 + Math.sin(t * 3) * 0.05);
    c.beginPath();
    if (prop === 'pass') c.roundRect(-110, -70, 220, 140, 14);
    else c.roundRect(-30, -90, 60, 180, 14);
    fillStroke(c, prop === 'pass' ? '#ffd84a' : '#333', 6);
    if (prop === 'pass') {
      c.fillStyle = '#222';
      c.font = 'bold 30px "Arial Black", sans-serif';
      c.textAlign = 'center';
      c.fillText('TICKET', 0, 0);
      c.font = 'bold 18px "Arial Black", sans-serif';
      c.fillText('ADMIT ONE (1) GHOST', 0, 34);
    }
  }
  c.restore();
  // Bony fingers around the prop.
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.roundRect(hx - 54 + i * 26, hy - 30, 22, 50, 10);
    fillStroke(c, '#f6f2e8', 4);
  }
}

interface HumanLook {
  skin: string;
  hair: string;
  iris: string;
  shirt: string;
  style: 'spiky' | 'slick';
  glasses: boolean;
  ghost: boolean;
}

const LOOKS: Record<Exclude<Who, 'death'>, HumanLook> = {
  gary: { skin: '#ffd9b8', hair: '#6b3f22', iris: '#3a8a5a', shirt: '#f4f4f4', style: 'spiky', glasses: false, ghost: false },
  ghost: { skin: '#e6f4ff', hair: '#b9d8f0', iris: '#5fb8ff', shirt: '#e6f4ff', style: 'spiky', glasses: false, ghost: true },
  adjuster: { skin: '#f2cfa8', hair: '#1c1c24', iris: '#444', shirt: '#4b5260', style: 'slick', glasses: true, ghost: false },
};

function drawHuman(c: C, o: CharOpts) {
  const L = LOOKS[o.who as Exclude<Who, 'death'>];
  const e = o.expr;
  c.save();
  if (L.ghost) {
    c.globalAlpha = 0.9;
    c.shadowColor = '#9fd8ff';
    c.shadowBlur = 40;
  }
  if (L.ghost && o.prop === 'scythe') scythe(c, -230, 60, 0.25);

  // Torso.
  c.beginPath();
  if (L.ghost) {
    c.moveTo(-250, -260);
    c.quadraticCurveTo(-300, -100, -260, 0);
    for (let i = 0; i <= 8; i++) {
      const x = -260 + i * 65;
      c.lineTo(x, 20 + Math.sin(o.t * 4 + i) * 16 + (i % 2) * 30);
    }
    c.quadraticCurveTo(300, -100, 250, -260);
  } else {
    c.moveTo(-300, 60);
    c.quadraticCurveTo(-290, -230, -120, -280);
    c.lineTo(120, -280);
    c.quadraticCurveTo(290, -230, 300, 60);
  }
  c.closePath();
  fillStroke(c, L.shirt, 7);
  c.save();
  c.clip();
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.fillRect(70, -400, 400, 500);
  c.restore();
  c.shadowBlur = 0;

  if (o.who === 'gary') {
    // The apron.
    c.beginPath();
    c.moveTo(-130, -250);
    c.lineTo(130, -250);
    c.lineTo(160, 60);
    c.lineTo(-160, 60);
    c.closePath();
    fillStroke(c, '#d6324a', 6);
    c.fillStyle = '#fff';
    c.font = 'bold 34px "Arial Black", sans-serif';
    c.textAlign = 'center';
    c.fillText('KISS', 0, -150);
    c.fillText('THE', 0, -110);
    c.fillText('COOK', 0, -70);
  } else if (o.who === 'adjuster') {
    // Shirt, red tie, lapels.
    c.beginPath();
    c.moveTo(-70, -280);
    c.lineTo(0, -140);
    c.lineTo(70, -280);
    c.closePath();
    fillStroke(c, '#fff', 5);
    c.beginPath();
    c.moveTo(-18, -260);
    c.lineTo(18, -260);
    c.lineTo(28, -60);
    c.lineTo(0, -30);
    c.lineTo(-28, -60);
    c.closePath();
    fillStroke(c, '#c41e2e', 5);
    c.fillStyle = '#ffd84a';
    c.font = 'bold 18px sans-serif';
    c.textAlign = 'center';
    c.fillText('MM', -170, -160);
  }

  // Neck.
  c.fillStyle = L.skin;
  c.fillRect(-45, -340, 90, 80);
  ink(c, 5);
  c.beginPath();
  c.moveTo(-45, -340);
  c.lineTo(-45, -270);
  c.moveTo(45, -340);
  c.lineTo(45, -270);
  c.stroke();

  // Back hair.
  c.fillStyle = L.hair;
  if (L.style === 'spiky') {
    ellipse(c, 0, -580, 175, 175);
    c.fill();
  }

  // Face: anime oval with a pointed chin.
  c.beginPath();
  c.moveTo(-150, -600);
  c.bezierCurveTo(-155, -470, -110, -390, 0, -350);
  c.bezierCurveTo(110, -390, 155, -470, 150, -600);
  c.bezierCurveTo(140, -760, -140, -760, -150, -600);
  fillStroke(c, L.skin, 6);
  // Ears.
  for (const s of [-1, 1]) {
    ellipse(c, s * 150, -560, 22, 36);
    fillStroke(c, L.skin, 5);
  }

  humanEyes(c, o, L);

  // Mouth.
  const talk = o.talk;
  ink(c, 5);
  c.beginPath();
  if (e === 'happy' || e === 'proud') {
    c.moveTo(-40, -440);
    c.quadraticCurveTo(0, -390 - talk * 10, 40, -440);
    c.closePath();
    c.fillStyle = '#8a2a3a';
    c.fill();
    c.stroke();
  } else if (e === 'angry') {
    // Yelling with shark teeth.
    c.moveTo(-55, -450);
    c.lineTo(55, -450);
    c.quadraticCurveTo(40, -380 - talk * 10, 0, -380 - talk * 10);
    c.quadraticCurveTo(-40, -380 - talk * 10, -55, -450);
    c.fillStyle = '#5a1a2a';
    c.fill();
    c.stroke();
    c.fillStyle = '#fff';
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      c.moveTo(-50 + i * 18, -450);
      c.lineTo(-41 + i * 18, -432);
      c.lineTo(-32 + i * 18, -450);
    }
    c.fill();
  } else if (e === 'shock' || e === 'cry') {
    ellipse(c, 0, -420, 22 + talk * 6, 30 + talk * 8);
    c.fillStyle = '#5a1a2a';
    c.fill();
    c.stroke();
  } else if (e === 'smug' || e === 'determined') {
    c.moveTo(-35, -430);
    c.quadraticCurveTo(10, -410, 40, -445);
    c.stroke();
  } else {
    if (talk > 0.3) {
      ellipse(c, 0, -425, 20, 10 + talk * 10);
      c.fillStyle = '#5a1a2a';
      c.fill();
      c.stroke();
    } else {
      c.moveTo(-25, -425);
      c.lineTo(25, -425);
      c.stroke();
    }
  }

  // Front hair.
  c.fillStyle = L.hair;
  ink(c, 6);
  c.beginPath();
  if (L.style === 'spiky') {
    c.moveTo(-170, -560);
    const tips: [number, number][] = [
      [-200, -720], [-120, -640], [-120, -800], [-40, -660], [10, -830], [40, -660], [130, -790], [110, -640], [200, -700], [165, -560],
    ];
    for (const [x, y] of tips) c.lineTo(x, y);
    c.quadraticCurveTo(160, -760, 0, -770);
    c.quadraticCurveTo(-160, -760, -170, -560);
  } else {
    c.moveTo(-160, -580);
    c.quadraticCurveTo(-170, -760, 0, -770);
    c.quadraticCurveTo(170, -760, 160, -590);
    c.quadraticCurveTo(80, -700, -40, -670);
    c.quadraticCurveTo(-120, -660, -160, -580);
  }
  c.closePath();
  c.fill();
  c.stroke();
  // Hair shine.
  c.strokeStyle = 'rgba(255,255,255,0.45)';
  c.lineWidth = 8;
  c.beginPath();
  c.arc(-30, -690, 60, Math.PI * 1.15, Math.PI * 1.45);
  c.stroke();

  if (L.glasses) {
    for (const x of [-62, 62]) {
      c.beginPath();
      c.roundRect(x - 50, -600, 100, 64, 10);
      ink(c, 6);
      c.stroke();
      if (e === 'smug' || e === 'neutral') {
        // Opaque white anime glare.
        c.save();
        c.clip();
        c.fillStyle = 'rgba(255,255,255,0.92)';
        c.fill();
        c.strokeStyle = '#bfe3ff';
        c.lineWidth = 10;
        c.beginPath();
        c.moveTo(x - 40, -540);
        c.lineTo(x + 10, -600);
        c.stroke();
        c.restore();
      }
    }
    ink(c, 5);
    c.beginPath();
    c.moveTo(-12, -575);
    c.lineTo(12, -575);
    c.stroke();
  }

  // Anime marks.
  if (e === 'angry') angerVein(c, 120, -700, 1);
  if (e === 'shock') {
    sweatDrop(c, 160, -640, o.t);
    // Blue shock lines on the forehead.
    c.strokeStyle = 'rgba(70,90,200,0.7)';
    c.lineWidth = 5;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(-70 + i * 35, -700);
      c.lineTo(-70 + i * 35, -640);
      c.stroke();
    }
  }
  if (e === 'happy' || e === 'proud') {
    blush(c, -90, -490);
    blush(c, 90, -490);
  }
  if (e === 'cry') {
    // Waterfall tears.
    c.fillStyle = 'rgba(140,210,255,0.85)';
    for (const x of [-62, 62]) {
      c.beginPath();
      c.moveTo(x - 22, -540);
      c.lineTo(x + 22, -540);
      c.lineTo(x + 34 + Math.sin(o.t * 10) * 4, 0);
      c.lineTo(x - 34, 0);
      c.fill();
    }
  }
  if (e === 'determined') {
    star(c, -62, -575, 30 + Math.sin(o.t * 8) * 6, '#fff');
    star(c, 62, -575, 30 + Math.cos(o.t * 8) * 6, '#fff');
  }
  c.restore();
}

function humanEyes(c: C, o: CharOpts, L: HumanLook) {
  const e = o.expr;
  const y = -570;
  const blink = blinkNow(o.t + 1.3) && e !== 'shock';
  for (const s of [-1, 1]) {
    const x = s * 62;
    // Brows.
    ink(c, 9);
    c.beginPath();
    if (e === 'angry' || e === 'determined') {
      c.moveTo(x - s * 44, y - 80);
      c.lineTo(x + s * 40, y - 52);
    } else if (e === 'cry' || e === 'tired') {
      c.moveTo(x - s * 44, y - 56);
      c.lineTo(x + s * 40, y - 82);
    } else {
      c.moveTo(x - 42, y - 70);
      c.quadraticCurveTo(x, y - 90, x + 42, y - 70);
    }
    c.stroke();

    if (L.glasses && (e === 'smug' || e === 'neutral')) continue;

    if (e === 'happy' || e === 'proud' || e === 'cry' || blink) {
      ink(c, 9);
      c.beginPath();
      if (e === 'cry' || blink) {
        c.moveTo(x - 34, y);
        c.quadraticCurveTo(x, y + 14, x + 34, y);
      } else {
        c.moveTo(x - 36, y + 10);
        c.quadraticCurveTo(x, y - 34, x + 36, y + 10);
      }
      c.stroke();
      continue;
    }
    // Big anime eye: white, tall iris, pupil, two highlights and a heavy upper lash.
    const ry = e === 'smug' ? 26 : 46;
    ellipse(c, x, y, 38, ry);
    c.fillStyle = '#fff';
    c.fill();
    c.save();
    ellipse(c, x, y, 38, ry);
    c.clip();
    if (e === 'shock') {
      ellipse(c, x, y, 7, 7);
      c.fillStyle = INK;
      c.fill();
    } else {
      const g = c.createLinearGradient(0, y - 40, 0, y + 40);
      g.addColorStop(0, INK);
      g.addColorStop(0.45, L.iris);
      g.addColorStop(1, '#d9fff0');
      ellipse(c, x + s * 2, y + 6, 26, 38);
      c.fillStyle = g;
      c.fill();
      ellipse(c, x + s * 2, y + 6, 12, 18);
      c.fillStyle = INK;
      c.fill();
      ellipse(c, x - 10, y - 12, 9, 12);
      c.fillStyle = '#fff';
      c.fill();
      ellipse(c, x + 12, y + 20, 5, 5);
      c.fill();
    }
    c.restore();
    ink(c, 10);
    c.beginPath();
    c.ellipse(x, y, 40, ry + 2, 0, Math.PI * 1.08, Math.PI * 1.92);
    c.stroke();
    if (e === 'smug') {
      // Heavy lid.
      c.fillStyle = L.skin;
      c.fillRect(x - 40, y - ry - 6, 80, ry * 0.9);
      ink(c, 8);
      c.beginPath();
      c.moveTo(x - 38, y - ry * 0.1);
      c.lineTo(x + 38, y - ry * 0.1);
      c.stroke();
    }
  }
}

function angerVein(c: C, x: number, y: number, s: number) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.strokeStyle = '#ff2b3b';
  c.lineWidth = 10;
  c.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    c.save();
    c.rotate((i * Math.PI) / 2);
    c.beginPath();
    c.moveTo(8, -32);
    c.quadraticCurveTo(10, -10, 32, -8);
    c.stroke();
    c.restore();
  }
  c.restore();
}

function sweatDrop(c: C, x: number, y: number, t: number) {
  const dy = Math.min(1, (t % 2) / 0.6) * 20;
  c.beginPath();
  c.moveTo(x, y + dy - 40);
  c.quadraticCurveTo(x + 28, y + dy, x, y + dy + 14);
  c.quadraticCurveTo(x - 28, y + dy, x, y + dy - 40);
  c.fillStyle = '#bfe9ff';
  c.fill();
  ink(c, 4);
  c.stroke();
}

function blush(c: C, x: number, y: number) {
  ellipse(c, x, y, 34, 16);
  c.fillStyle = 'rgba(255,110,140,0.45)';
  c.fill();
  c.strokeStyle = 'rgba(230,60,90,0.7)';
  c.lineWidth = 3;
  for (let i = -1; i <= 1; i++) {
    c.beginPath();
    c.moveTo(x + i * 14 - 6, y + 8);
    c.lineTo(x + i * 14 + 6, y - 8);
    c.stroke();
  }
}

// ---------------------------------------------------------------- overlays

export function petals(c: C, v: View, t: number) {
  c.save();
  for (let i = 0; i < 40; i++) {
    const W = v.x1 - v.x0;
    const H = v.y1 - v.y0;
    const x = v.x0 + ((hash(i) * W + t * (40 + hash(i + 1) * 60) + Math.sin(t + i) * 30) % W);
    const y = v.y0 + ((hash(i + 2) * H + t * (60 + hash(i + 3) * 80)) % H);
    c.save();
    c.translate(x, y);
    c.rotate(t * 2 + i);
    ellipse(c, 0, 0, 12, 7);
    c.fillStyle = i % 3 ? '#ffc4dc' : '#ffe3ee';
    c.fill();
    c.restore();
  }
  c.restore();
}

export function rain(c: C, v: View, t: number) {
  c.save();
  c.strokeStyle = 'rgba(200,220,255,0.5)';
  c.lineWidth = 2;
  for (let i = 0; i < 120; i++) {
    const W = v.x1 - v.x0;
    const H = v.y1 - v.y0;
    const x = v.x0 + ((hash(i) * W - t * 300) % W + W) % W;
    const y = v.y0 + ((hash(i + 7) * H + t * 1400) % H);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - 10, y + 40);
    c.stroke();
  }
  c.restore();
}

/** Floating menacing "ゴ" glyphs, the classic anime threat aura. */
export function menace(c: C, t: number) {
  c.save();
  c.font = 'bold 110px "Arial Black", Impact, sans-serif';
  c.textAlign = 'center';
  for (let i = 0; i < 6; i++) {
    const x = i < 3 ? 160 + i * 40 : VW - 160 - (i - 3) * 40;
    const y = 200 + ((i % 3) * 210 + Math.sin(t * 3 + i) * 14);
    const s = 1 + Math.sin(t * 6 + i) * 0.06;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.rotate(-0.15);
    c.lineWidth = 10;
    c.strokeStyle = '#1a0a2a';
    c.strokeText('ゴ', 0, 0);
    c.fillStyle = '#b36bff';
    c.fillText('ゴ', 0, 0);
    c.restore();
  }
  c.restore();
}

/** Big outlined impact text (sound effects, DENIED stamps, chapter titles). */
export function impactText(c: C, text: string, x: number, y: number, size: number, fill: string, rot: number, scale: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(scale, scale);
  c.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = size * 0.16;
  c.strokeStyle = INK;
  c.strokeText(text, 0, 0);
  c.fillStyle = fill;
  c.fillText(text, 0, 0);
  c.restore();
}

export function stamp(c: C, text: string, x: number, y: number, scale: number, alpha: number) {
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.rotate(-0.2);
  c.scale(scale, scale);
  c.strokeStyle = '#d81e2a';
  c.lineWidth = 14;
  c.strokeRect(-260, -80, 520, 160);
  c.font = '900 120px Impact, "Arial Black", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#d81e2a';
  c.fillText(text, 0, 6);
  c.restore();
}

export function vignette(c: C, v: View, strength = 0.55) {
  const g = c.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, Math.hypot(v.x1 - v.x0, v.y1 - v.y0) * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  c.fillStyle = g;
  c.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
}
