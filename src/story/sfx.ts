/**
 * Cutscene sound: voice blips per speaker, anime stings and a soft music bed.
 * All synthesized with Web Audio. Shares the game's AudioContext when it has one.
 */

export type Sting =
  | 'impact'
  | 'whoosh'
  | 'sparkle'
  | 'dun'
  | 'boom'
  | 'ding'
  | 'stamp'
  | 'sploosh'
  | 'honk'
  | 'whistle'
  | 'foghorn'
  | 'jet'
  | 'thwack'
  | 'title';

export type Bed = 'none' | 'comedy' | 'tension' | 'warm' | 'triumph';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export const VOICES: Record<string, { f: number; type: OscillatorType; spread: number }> = {
  Death: { f: 95, type: 'sawtooth', spread: 25 },
  Gary: { f: 230, type: 'square', spread: 60 },
  'Mortalis Mutual': { f: 340, type: 'square', spread: 30 },
};

export class StorySfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bed: Bed = 'none';
  private bedTimer: number | null = null;
  private bedStep = 0;
  private bedNext = 0;

  constructor(private getCtx: () => AudioContext | null) {}

  private ensure() {
    if (this.ctx) return this.ctx;
    let ctx = this.getCtx();
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    this.out.connect(ctx.destination);
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.18;
    this.bedGain.connect(this.out);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  private tone(f: number, dur: number, type: OscillatorType, vol: number, at = 0, f2?: number, dest?: AudioNode, attack = 0.005) {
    const ctx = this.ensure();
    if (!ctx || !this.out) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(dur: number, vol: number, freq: number, freq2: number, type: BiquadFilterType = 'lowpass', at = 0, q = 1) {
    const ctx = this.ensure();
    if (!ctx || !this.out || !this.noise) return;
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  /** One gibberish voice blip for a speaker. */
  blip(who: string) {
    const v = VOICES[who] ?? { f: 260, type: 'triangle' as OscillatorType, spread: 50 };
    this.tone(v.f + Math.random() * v.spread, 0.06, v.type, who === 'Death' ? 0.07 : 0.045);
  }

  sting(s: Sting) {
    switch (s) {
      case 'impact':
        this.tone(160, 0.5, 'sine', 0.7, 0, 40);
        this.hiss(0.4, 0.5, 3000, 200);
        break;
      case 'whoosh':
        this.hiss(0.5, 0.35, 400, 4000, 'bandpass', 0, 2);
        break;
      case 'sparkle':
        [84, 88, 91, 96, 100].forEach((n, i) => this.tone(midi(n), 0.5, 'triangle', 0.08, i * 0.06));
        break;
      case 'dun':
        this.tone(midi(38), 0.9, 'sawtooth', 0.18, 0);
        this.tone(midi(37), 1.4, 'sawtooth', 0.2, 0.45);
        this.tone(midi(25), 1.6, 'sine', 0.4, 0.45);
        break;
      case 'boom':
        this.tone(90, 1.4, 'sine', 0.9, 0, 25);
        this.hiss(1.8, 0.9, 1200, 60);
        break;
      case 'ding':
        this.tone(midi(88), 1.2, 'sine', 0.2);
        this.tone(midi(84), 1.4, 'sine', 0.15, 0.25);
        break;
      case 'stamp':
        this.tone(120, 0.18, 'square', 0.4, 0, 50);
        this.hiss(0.15, 0.6, 2000, 300);
        break;
      case 'sploosh':
        this.hiss(0.8, 0.5, 600, 3000, 'bandpass', 0, 1.5);
        this.tone(300, 0.4, 'sine', 0.2, 0.05, 900);
        break;
      case 'honk':
        this.tone(330, 0.35, 'square', 0.12);
        this.tone(415, 0.35, 'square', 0.1);
        this.tone(330, 0.5, 'square', 0.12, 0.45);
        this.tone(415, 0.5, 'square', 0.1, 0.45);
        break;
      case 'whistle':
        this.tone(midi(79), 1.2, 'triangle', 0.15, 0, undefined, undefined, 0.05);
        this.tone(midi(83), 1.2, 'triangle', 0.12, 0, undefined, undefined, 0.05);
        break;
      case 'foghorn':
        this.tone(70, 2.2, 'sawtooth', 0.22, 0, undefined, undefined, 0.2);
        this.tone(105, 2.2, 'sawtooth', 0.12, 0, undefined, undefined, 0.2);
        break;
      case 'jet':
        this.hiss(3, 0.5, 300, 3000, 'bandpass', 0, 0.8);
        break;
      case 'thwack':
        this.tone(900, 0.08, 'square', 0.2, 0, 300);
        this.hiss(0.1, 0.5, 5000, 1000, 'highpass');
        break;
      case 'title':
        [60, 64, 67, 72].forEach((n, i) => this.tone(midi(n), 1.6 - i * 0.2, 'sawtooth', 0.07, i * 0.09));
        this.tone(midi(36), 2, 'sine', 0.4, 0.3);
        this.hiss(1.2, 0.3, 8000, 2000, 'highpass', 0.3);
        break;
    }
  }

  setBed(bed: Bed) {
    if (bed === this.bed) return;
    this.bed = bed;
    if (bed === 'none') {
      if (this.bedTimer !== null) clearInterval(this.bedTimer);
      this.bedTimer = null;
      return;
    }
    const ctx = this.ensure();
    if (!ctx) return;
    if (this.bedTimer === null) {
      this.bedNext = ctx.currentTime + 0.1;
      this.bedStep = 0;
      this.bedTimer = window.setInterval(() => this.scheduleBed(), 30);
    }
  }

  stop() {
    this.setBed('none');
  }

  private scheduleBed() {
    const ctx = this.ctx;
    if (!ctx || !this.bedGain) return;
    const bpm = this.bed === 'warm' ? 76 : this.bed === 'tension' ? 92 : this.bed === 'triumph' ? 132 : 116;
    while (this.bedNext < ctx.currentTime + 0.15) {
      this.playBed(this.bedStep, this.bedNext - ctx.currentTime);
      this.bedNext += 60 / bpm / 4;
      this.bedStep++;
    }
  }

  private playBed(step: number, at: number) {
    const d = this.bedGain!;
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    if (this.bed === 'warm') {
      // Gentle "emotional anime" piano: I V vi IV arpeggios over a soft pad.
      const PROG = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
      const ch = PROG[bar];
      if (s === 0) for (const n of ch) this.tone(midi(n - 12), 2.6, 'sine', 0.25, at, undefined, d, 0.4);
      if (s % 2 === 0) {
        const n = ch[(s / 2) % 3] + 12 + (s >= 8 ? 12 : 0);
        this.tone(midi(n), 0.9, 'triangle', 0.22, at, undefined, d);
      }
    } else if (this.bed === 'tension') {
      const root = [38, 38, 39, 37][bar];
      if (s % 4 === 0) this.tone(midi(root), 0.5, 'sawtooth', 0.3, at, undefined, d);
      if (s % 2 === 1) this.tone(midi(root + 24 + (s % 8 === 3 ? 1 : 0)), 0.12, 'square', 0.1, at, undefined, d);
    } else if (this.bed === 'comedy') {
      // Bouncy bassoon-ish walk.
      const walk = [48, 52, 55, 57, 55, 52, 50, 47];
      if (s % 2 === 0) this.tone(midi(walk[(s / 2 + bar * 2) % 8]), 0.18, 'triangle', 0.45, at, undefined, d);
      if (s % 4 === 2) this.tone(midi(72 + [0, 4, 7, 4][bar]), 0.1, 'square', 0.08, at, undefined, d);
    } else if (this.bed === 'triumph') {
      const PROG = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]];
      const ch = PROG[bar];
      if (s % 4 === 0) this.tone(midi(ch[0] - 24), 0.3, 'triangle', 0.5, at, undefined, d);
      if (s % 2 === 0) this.tone(midi(ch[(s / 2) % 3] + 12), 0.14, 'square', 0.1, at, undefined, d);
    }
  }
}
