import {
  VH,
  VW,
  drawBg,
  drawChar,
  drawVehicle,
  focusLines,
  impactText,
  menace,
  petals,
  rain,
  speedLines,
  stamp,
  vignette,
  type BgKind,
  type Expr,
  type Outfit,
  type Prop,
  type VehicleKind,
  type View,
  type Who,
} from './art';
import { StorySfx, type Bed, type Sting } from './sfx';

export interface CharSlot {
  who: Who;
  expr: Expr;
  /** Horizontal center in the 1600-wide frame. */
  x: number;
  outfit?: Outfit;
  prop?: Prop;
  flip?: boolean;
  scale?: number;
  /** How the character arrives in this shot. Default: no entrance. */
  enter?: 'left' | 'right' | 'pop' | 'rise';
}

export type Fx = 'shake' | 'bigshake' | 'flash' | 'petals' | 'rain' | 'menace' | 'speed' | 'focus' | 'vignette';

export interface Shot {
  bg: BgKind;
  chars?: CharSlot[];
  /** Speaker name shown on the dialogue box. */
  who?: string;
  line?: string;
  /** Narration box at the top of the frame. */
  caption?: string;
  /** Seconds before auto-advancing once any line has finished typing. Shots without a line default to 1.6 s. */
  hold?: number;
  fx?: Fx[];
  sting?: Sting;
  /** Change the music bed. */
  bed?: Bed;
  /** Camera push-in: scale from zoom[0] to zoom[1] over the shot, centered on focus. */
  zoom?: [number, number];
  focus?: [number, number];
  big?: { text: string; color?: string; size?: number; x?: number; y?: number; rot?: number };
  stamp?: string;
  title?: { text: string; sub?: string };
  vehicle?: { kind: VehicleKind; y?: number };
}

export interface Scene {
  id: string;
  shots: Shot[];
}

const SPEAKER_TO_WHO: Record<string, Who[]> = {
  Death: ['death'],
  Gary: ['gary', 'ghost'],
  'Mortalis Mutual': ['adjuster'],
};

const TYPE_CPS = 42;

/**
 * Plays a Scene as a full-screen anime-style cutscene over the game.
 * Advance with click / Space / Enter / E / gamepad A. Esc or Start twice skips.
 */
export class CutscenePlayer {
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private c: CanvasRenderingContext2D;
  private box: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private nextEl: HTMLDivElement;
  private skipEl: HTMLDivElement;
  private scene: Scene | null = null;
  private idx = 0;
  private shotT = 0;
  private sceneT = 0;
  private typed = 0;
  private lineDoneT = -1;
  private lastBlip = 0;
  private prevBg: BgKind | null = null;
  private wipeT = 1;
  private skipArmedT = -10;
  private padPrev: boolean[] = [];
  private raf = 0;
  private lastNow = 0;
  private resolve: (() => void) | null = null;
  private endT = -1;

  constructor(private sfx: StorySfx) {
    this.root = document.createElement('div');
    this.root.className = 'cutscene hidden';
    this.root.innerHTML = `
      <canvas></canvas>
      <div class="cs-box hidden"><div class="cs-name"></div><div class="cs-text"></div><div class="cs-next">▼</div></div>
      <div class="cs-skip">Esc / Start: skip</div>`;
    this.canvas = this.root.querySelector('canvas')!;
    this.c = this.canvas.getContext('2d')!;
    this.box = this.root.querySelector('.cs-box')!;
    this.nameEl = this.root.querySelector('.cs-name')!;
    this.textEl = this.root.querySelector('.cs-text')!;
    this.nextEl = this.root.querySelector('.cs-next')!;
    this.skipEl = this.root.querySelector('.cs-skip')!;
    document.body.appendChild(this.root);
    this.root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if ((e.target as HTMLElement).classList.contains('cs-skip')) this.skip(true);
      else this.advance();
    });
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('resize', () => this.resize());
  }

  get playing() {
    return this.scene !== null;
  }

  play(scene: Scene): Promise<void> {
    if (this.scene) this.finish();
    this.scene = scene;
    this.idx = 0;
    this.sceneT = 0;
    this.prevBg = null;
    this.endT = -1;
    this.root.classList.remove('hidden');
    this.resize();
    this.startShot();
    this.lastNow = performance.now();
    this.padPrev = this.padButtons();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.tick());
    return new Promise((r) => (this.resolve = r));
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
  }

  private get shot(): Shot {
    return this.scene!.shots[this.idx];
  }

  private startShot() {
    const s = this.shot;
    this.shotT = 0;
    this.typed = 0;
    this.lineDoneT = s.line ? -1 : 0;
    this.wipeT = this.prevBg !== null && this.prevBg !== s.bg ? 0 : 1;
    this.prevBg = s.bg;
    if (s.bed) this.sfx.setBed(s.bed);
    if (s.sting) this.sfx.sting(s.sting);
    if (s.line) {
      this.box.classList.remove('hidden');
      this.nameEl.textContent = s.who ?? '';
      this.nameEl.className = `cs-name who-${(s.who ?? 'none').toLowerCase().replace(/[^a-z]/g, '')}`;
      this.nameEl.classList.toggle('hidden', !s.who);
      this.textEl.textContent = '';
      this.nextEl.classList.add('hidden');
    } else {
      this.box.classList.add('hidden');
    }
  }

  private advance() {
    if (!this.scene || this.endT >= 0) return;
    const s = this.shot;
    if (s.line && this.typed < s.line.length) {
      this.typed = s.line.length;
      this.textEl.textContent = s.line;
      this.lineDoneT = this.shotT;
      this.nextEl.classList.remove('hidden');
      return;
    }
    if (this.shotT < 0.15) return; // swallow double presses
    this.next();
  }

  private next() {
    if (!this.scene) return;
    if (this.idx + 1 >= this.scene.shots.length) {
      this.endT = 0;
      this.box.classList.add('hidden');
      return;
    }
    this.idx++;
    this.startShot();
  }

  private skip(now = false) {
    if (!this.scene) return;
    if (now || this.sceneT - this.skipArmedT < 2.5) {
      this.endT = 0;
      this.box.classList.add('hidden');
      return;
    }
    this.skipArmedT = this.sceneT;
    this.skipEl.textContent = 'Press again to skip';
    this.skipEl.classList.add('armed');
  }

  private onKey(e: KeyboardEvent) {
    if (!this.scene) return;
    // The cutscene owns the keyboard while it plays.
    e.stopPropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') this.skip();
    else if (['Space', 'Enter', 'KeyE', 'NumpadEnter'].includes(e.code)) {
      e.preventDefault();
      this.advance();
    }
  }

  private padButtons(): boolean[] {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const out: boolean[] = [];
    for (const p of pads) {
      if (!p) continue;
      p.buttons.forEach((b, i) => (out[i] = out[i] || b.pressed));
    }
    return out;
  }

  private pollPad() {
    const now = this.padButtons();
    const edge = (i: number) => now[i] && !this.padPrev[i];
    if (edge(0) || edge(1)) this.advance();
    if (edge(9) || edge(8)) this.skip();
    this.padPrev = now;
  }

  private finish() {
    cancelAnimationFrame(this.raf);
    this.scene = null;
    this.root.classList.add('hidden');
    this.box.classList.add('hidden');
    this.skipEl.textContent = 'Esc / Start: skip';
    this.skipEl.classList.remove('armed');
    this.sfx.stop();
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  private tick() {
    if (!this.scene) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.shotT += dt;
    this.sceneT += dt;
    this.wipeT = Math.min(1, this.wipeT + dt / 0.35);
    this.pollPad();
    if (this.sceneT - this.skipArmedT > 2.5 && this.skipEl.classList.contains('armed')) {
      this.skipEl.textContent = 'Esc / Start: skip';
      this.skipEl.classList.remove('armed');
    }

    const s = this.shot;
    // Typewriter with voice blips.
    if (s.line && this.typed < s.line.length && this.endT < 0) {
      const delay = s.big || s.stamp ? 0.25 : 0.12;
      if (this.shotT > delay) {
        const before = Math.floor(this.typed);
        this.typed = Math.min(s.line.length, this.typed + dt * TYPE_CPS);
        const after = Math.floor(this.typed);
        if (after !== before) {
          this.textEl.textContent = s.line.slice(0, after);
          if (this.sceneT - this.lastBlip > 0.07 && /\w/.test(s.line[after - 1] ?? '')) {
            this.sfx.blip(s.who ?? '');
            this.lastBlip = this.sceneT;
          }
        }
        if (this.typed >= s.line.length) {
          this.lineDoneT = this.shotT;
          this.nextEl.classList.remove('hidden');
        }
      }
    }
    // Auto-advance for timed shots.
    const hold = s.hold ?? (s.line ? Infinity : 1.6);
    if (this.endT < 0 && this.lineDoneT >= 0 && this.shotT - this.lineDoneT > hold) this.next();

    this.draw();

    if (this.endT >= 0) {
      this.endT += dt;
      if (this.endT > 0.45) {
        this.finish();
        return;
      }
    }
    this.raf = requestAnimationFrame(() => this.tick());
  }

  private draw() {
    const c = this.c;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = this.shot;
    const t = this.shotT;
    const scale = Math.min(W / VW, H / VH);
    const ox = (W - VW * scale) / 2;
    // On tall (portrait) screens, sit the frame low so characters stand behind the dialogue box.
    const oy = (H - VH * scale) * 0.82;
    const view: View = { x0: -ox / scale, y0: -oy / scale, x1: VW + ox / scale, y1: VH + oy / scale };

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);

    // Camera: shake + push-in.
    const fx = new Set(s.fx ?? []);
    let shake = 0;
    if (fx.has('shake')) shake = Math.max(0, 1 - t / 0.6) * 14;
    if (fx.has('bigshake')) shake = Math.max(0, 1 - t / 1.2) * 34;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    let z = 1;
    if (s.zoom) {
      const k = 1 - Math.pow(1 - Math.min(1, t / 2.2), 3);
      z = s.zoom[0] + (s.zoom[1] - s.zoom[0]) * k;
    }
    const [fcx, fcy] = s.focus ?? [VW / 2, VH / 2];
    c.setTransform(scale, 0, 0, scale, ox, oy);
    c.translate(sx, sy);
    c.translate(fcx, fcy);
    c.scale(z, z);
    c.translate(-fcx, -fcy);
    // Grow the view so backgrounds still fill the screen while zoomed or shaken.
    const pad = 60;
    const zv: View = {
      x0: fcx + (view.x0 - fcx) / z - pad,
      y0: fcy + (view.y0 - fcy) / z - pad,
      x1: fcx + (view.x1 - fcx) / z + pad,
      y1: fcy + (view.y1 - fcy) / z + pad,
    };

    drawBg(c, s.bg, zv, this.sceneT);
    if (fx.has('focus')) focusLines(c, zv, this.sceneT, '#fff', 0.75, 100);
    if (fx.has('speed')) speedLines(c, zv, this.sceneT, '#fff', 0.55);

    if (s.vehicle) {
      const k = Math.min(1, t / 3);
      const x = -500 + (VW + 1000) * (0.15 + k * 0.85);
      drawVehicle(c, s.vehicle.kind, x, s.vehicle.y ?? VH * 0.8, this.sceneT);
    }

    // Characters.
    const speakers = SPEAKER_TO_WHO[s.who ?? ''] ?? [];
    for (const ch of s.chars ?? []) {
      c.save();
      let x = ch.x;
      // Close-ups (scale > 1) sit lower so heads stay clear of the letterbox.
      let y = VH + 40 + Math.max(0, (ch.scale ?? 1) - 1) * 650;
      let alpha = 1;
      let pop = 1;
      const e = Math.min(1, t / 0.35);
      const ease = 1 - Math.pow(1 - e, 3);
      if (ch.enter === 'left') x = -500 + (ch.x + 500) * ease;
      if (ch.enter === 'right') x = VW + 500 - (VW + 500 - ch.x) * ease;
      if (ch.enter === 'rise') y += 500 * (1 - ease);
      if (ch.enter === 'pop') pop = 0.6 + 0.4 * ease + Math.sin(e * Math.PI) * 0.12;
      if (ch.enter === 'left' || ch.enter === 'right' || ch.enter === 'pop') alpha = ease;
      const speaking = speakers.includes(ch.who);
      const dim = s.who && !speaking && (s.chars?.length ?? 0) > 1;
      c.globalAlpha = alpha;
      // Non-speakers dim a little so focus stays on whoever is talking.
      if (dim) c.filter = 'brightness(0.68) saturate(0.8)';
      c.translate(x, y);
      const sc = (ch.scale ?? 1) * pop;
      c.scale(ch.flip ? -sc : sc, sc);
      const talk = speaking && this.typed < (s.line?.length ?? 0) ? Math.abs(Math.sin(this.sceneT * 18)) : 0;
      drawChar(c, { who: ch.who, expr: ch.expr, outfit: ch.outfit, prop: ch.prop, t: this.sceneT + ch.x * 0.01, talk });
      c.restore();
    }

    if (fx.has('menace')) menace(c, this.sceneT);
    if (fx.has('petals')) petals(c, zv, this.sceneT);
    if (fx.has('rain')) rain(c, zv, this.sceneT);

    if (s.big) {
      const pop = t < 0.25 ? 2.2 - (t / 0.25) * 1.2 : 1 + Math.sin(t * 9) * 0.03;
      impactText(c, s.big.text, s.big.x ?? VW / 2, s.big.y ?? VH * 0.3, s.big.size ?? 170, s.big.color ?? '#ffd84a', s.big.rot ?? -0.08, pop);
    }
    if (s.stamp) {
      const k = Math.min(1, Math.max(0, (t - 0.15) / 0.18));
      if (k > 0) stamp(c, s.stamp, VW * 0.7, VH * 0.35, 2.4 - k * 1.4, k);
    }
    if (s.title) {
      const k = Math.min(1, t / 0.8);
      c.save();
      c.globalAlpha = k;
      // A red brush stroke behind the title.
      c.fillStyle = '#d6324a';
      c.beginPath();
      c.moveTo(VW * 0.12, VH * 0.46);
      c.quadraticCurveTo(VW * 0.5, VH * 0.36, VW * (0.12 + 0.76 * k), VH * 0.42);
      c.lineTo(VW * (0.1 + 0.78 * k), VH * 0.58);
      c.quadraticCurveTo(VW * 0.5, VH * 0.64, VW * 0.1, VH * 0.56);
      c.fill();
      impactText(c, s.title.text, VW / 2, VH * 0.49, 150, '#fff', -0.03, 1 + (1 - k) * 0.3);
      if (s.title.sub) {
        c.font = 'italic bold 38px Georgia, serif';
        c.textAlign = 'center';
        c.fillStyle = '#fff';
        c.fillText(s.title.sub, VW / 2, VH * 0.72);
      }
      c.restore();
    }
    if (s.caption) {
      c.save();
      const k = Math.min(1, t / 0.3);
      c.globalAlpha = k;
      c.font = 'bold 34px "Trebuchet MS", Verdana, sans-serif';
      const w = Math.min(VW - 120, c.measureText(s.caption).width + 70);
      c.fillStyle = '#fffaf0';
      c.fillRect(VW / 2 - w / 2, 70, w, 70);
      c.lineWidth = 5;
      c.strokeStyle = '#15111c';
      c.strokeRect(VW / 2 - w / 2, 70, w, 70);
      c.fillStyle = '#15111c';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(s.caption, VW / 2, 106, VW - 160);
      c.restore();
    }
    if (fx.has('vignette')) vignette(c, zv);

    // Screen space: letterbox bars, flash, wipe, fade-out.
    c.setTransform(1, 0, 0, 1, 0, 0);
    const barH = H * 0.075 * Math.min(1, this.sceneT / 0.4);
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, barH);
    c.fillRect(0, H - barH, W, barH);
    if (fx.has('flash') && t < 0.35) {
      c.fillStyle = `rgba(255,255,255,${1 - t / 0.35})`;
      c.fillRect(0, 0, W, H);
    }
    if (this.wipeT < 1) {
      // Diagonal manga-panel wipe.
      const k = this.wipeT;
      c.fillStyle = '#000';
      c.beginPath();
      c.moveTo(W * k * 1.4, 0);
      c.lineTo(W * 1.4, 0);
      c.lineTo(W * 1.4, H);
      c.lineTo(W * k * 1.4 - W * 0.4, H);
      c.closePath();
      c.fill();
    }
    if (this.sceneT < 0.3) {
      c.fillStyle = `rgba(0,0,0,${1 - this.sceneT / 0.3})`;
      c.fillRect(0, 0, W, H);
    }
    if (this.endT >= 0) {
      c.fillStyle = `rgba(0,0,0,${Math.min(1, this.endT / 0.4)})`;
      c.fillRect(0, 0, W, H);
    }
  }
}
