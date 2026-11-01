/**
 * Every sound and note of music is synthesized here with the Web Audio API.
 * No audio files.
 */

interface ToneOpts {
  f: number;
  f2?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  at?: number;
  attack?: number;
  vibrato?: number;
  dest?: AudioNode;
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  freq?: number;
  freq2?: number;
  q?: number;
  type?: BiquadFilterType;
  at?: number;
  dest?: AudioNode;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noiseBuf!: AudioBuffer;
  musicOn = true;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private melody: (number | null)[] = [];
  private bpm = 128;
  private style: 'town' | 'ghost' = 'town';

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.22;
    this.music.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.buildMelody(7);
  }

  private get t() {
    return this.ctx!.currentTime;
  }

  tone(o: ToneOpts) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = this.t + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + o.dur);
    const g = ctx.createGain();
    const vol = o.vol ?? 0.2;
    const atk = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vibrato;
      const lg = ctx.createGain();
      lg.gain.value = o.f * 0.06;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + o.dur + 0.05);
    }
    osc.connect(g).connect(o.dest ?? this.sfx);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  noise(o: NoiseOpts) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = this.t + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, t0);
    if (o.freq2) f.frequency.exponentialRampToValueAtTime(o.freq2, t0 + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(o.dest ?? this.sfx);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.05);
  }

  // ---------- Sound effects ----------
  jump(chain = 1) {
    const b = 260 + chain * 80;
    this.tone({ f: b, f2: b * 2.2, dur: 0.14, type: 'square', vol: 0.09 });
    if (chain === 3) this.tone({ f: b * 1.5, f2: b * 3, dur: 0.2, type: 'triangle', vol: 0.1, at: 0.06 });
  }
  flip() {
    this.noise({ dur: 0.35, vol: 0.18, type: 'bandpass', freq: 500, freq2: 2500, q: 2 });
    this.tone({ f: 300, f2: 900, dur: 0.3, type: 'triangle', vol: 0.08 });
  }
  longJump() {
    this.tone({ f: 200, f2: 700, dur: 0.25, type: 'sawtooth', vol: 0.06 });
    this.noise({ dur: 0.3, vol: 0.12, type: 'bandpass', freq: 800, freq2: 2000 });
  }
  land(heavy = 0.3) {
    this.noise({ dur: 0.09, vol: 0.12 + heavy * 0.4, freq: 500 });
    this.tone({ f: 120, f2: 55, dur: 0.1, type: 'sine', vol: 0.1 + heavy * 0.3 });
  }
  wallKick() {
    this.noise({ dur: 0.06, vol: 0.3, freq: 1200, type: 'bandpass' });
    this.tone({ f: 500, f2: 1000, dur: 0.12, type: 'square', vol: 0.07 });
  }
  slam() {
    this.noise({ dur: 0.35, vol: 0.7, freq: 300, freq2: 60 });
    this.tone({ f: 90, f2: 30, dur: 0.35, type: 'sine', vol: 0.5 });
  }
  whoosh() {
    this.noise({ dur: 0.4, vol: 0.2, type: 'bandpass', freq: 400, freq2: 1800, q: 1.5 });
  }
  boing() {
    this.tone({ f: 150, f2: 600, dur: 0.35, type: 'sine', vol: 0.3, vibrato: 18 });
  }
  splat() {
    this.noise({ dur: 0.35, vol: 0.8, freq: 1400, freq2: 150 });
    this.tone({ f: 110, f2: 35, dur: 0.3, type: 'sine', vol: 0.5 });
    this.noise({ dur: 0.2, vol: 0.3, type: 'highpass', freq: 3000, at: 0.03 });
  }
  crunch() {
    for (let i = 0; i < 5; i++) this.noise({ dur: 0.05, vol: 0.4, freq: 900 + Math.random() * 1500, type: 'bandpass', q: 3, at: i * 0.035 });
  }
  zap(dur = 1.2) {
    for (let t = 0; t < dur; t += 0.04) {
      this.tone({ f: 60 + Math.random() * 200, dur: 0.05, type: 'sawtooth', vol: 0.12, at: t });
      if (Math.random() < 0.5) this.noise({ dur: 0.03, vol: 0.25, type: 'highpass', freq: 4000, at: t });
    }
  }
  gulp() {
    for (let i = 0; i < 3; i++) this.tone({ f: 340, f2: 140, dur: 0.12, type: 'sine', vol: 0.3, at: i * 0.28 });
  }
  munch() {
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.07, vol: 0.35, freq: 1800, type: 'bandpass', q: 2, at: i * 0.15 });
  }
  stamp() {
    this.noise({ dur: 0.08, vol: 0.9, freq: 400 });
    this.tone({ f: 90, f2: 45, dur: 0.12, type: 'sine', vol: 0.5 });
  }
  cash() {
    this.tone({ f: 1318, dur: 0.07, type: 'square', vol: 0.08 });
    this.tone({ f: 1975, dur: 0.5, type: 'triangle', vol: 0.12, at: 0.07 });
    this.noise({ dur: 0.15, vol: 0.15, type: 'highpass', freq: 6000, at: 0.07 });
  }
  denied() {
    this.tone({ f: 110, dur: 0.45, type: 'square', vol: 0.12 });
    this.tone({ f: 104, dur: 0.45, type: 'square', vol: 0.12 });
  }
  horn() {
    for (const f of [233, 294, 349]) this.tone({ f, dur: 1.1, type: 'sawtooth', vol: 0.06, attack: 0.05 });
  }
  creak() {
    this.tone({ f: 95, f2: 70, dur: 0.6, type: 'sawtooth', vol: 0.08, vibrato: 25 });
  }
  pull() {
    this.noise({ dur: 0.15, vol: 0.3, freq: 700, type: 'bandpass' });
    this.tone({ f: 200, f2: 120, dur: 0.15, type: 'square', vol: 0.06 });
  }
  trickle() {
    this.noise({ dur: 0.08, vol: 0.07, freq: 2500 + Math.random() * 1500, type: 'bandpass', q: 4 });
  }
  scream(pitch = 1) {
    this.tone({ f: 700 * pitch, f2: 220 * pitch, dur: 0.9, type: 'sawtooth', vol: 0.07, vibrato: 7, attack: 0.04 });
  }
  ghost() {
    this.tone({ f: 300, f2: 600, dur: 0.8, type: 'sine', vol: 0.12, vibrato: 5, attack: 0.2 });
    this.tone({ f: 450, f2: 900, dur: 0.8, type: 'sine', vol: 0.06, vibrato: 6, attack: 0.2 });
  }
  possess() {
    this.noise({ dur: 0.6, vol: 0.3, type: 'bandpass', freq: 3000, freq2: 200, q: 2 });
    this.tone({ f: 900, f2: 120, dur: 0.6, type: 'triangle', vol: 0.15 });
  }
  blip(pitch = 1) {
    this.tone({ f: (180 + Math.random() * 60) * pitch, dur: 0.05, type: 'square', vol: 0.05 });
  }
  thunder() {
    this.noise({ dur: 1.6, vol: 0.9, freq: 800, freq2: 40 });
  }

  // ---------- Music: a tiny generative chiptune sequencer ----------
  private buildMelody(seed: number) {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    this.melody = [];
    for (let i = 0; i < 64; i++) {
      if (i % 16 === 0 && i > 0 && rnd() < 0.5) {
        // repeat the first phrase for catchiness
        for (let j = 0; j < 16 && i < 64; j++, i++) this.melody.push(this.melody[j]);
        i--;
        continue;
      }
      this.melody.push(rnd() < 0.3 ? null : 72 + scale[Math.floor(rnd() * scale.length)]);
    }
  }

  setStyle(style: 'town' | 'ghost') {
    this.style = style;
    this.bpm = style === 'town' ? 128 : 84;
  }

  startMusic() {
    if (!this.ctx || this.timer !== null) return;
    this.nextTime = this.t + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.music) this.music.gain.value = this.musicOn ? 0.22 : 0;
  }

  private schedule() {
    if (!this.ctx) return;
    while (this.nextTime < this.t + 0.12) {
      this.playStep(this.step, this.nextTime - this.t);
      this.nextTime += 60 / this.bpm / 4;
      this.step++;
    }
  }

  private playStep(step: number, at: number) {
    const PROG = [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]]; // C G Am F
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = PROG[bar];
    const dest = this.music;
    const ghost = this.style === 'ghost';
    if (ghost) {
      if (s === 0) for (const n of chord) this.tone({ f: midi(n + 12), dur: 1.6, type: 'sine', vol: 0.05, at, attack: 0.3, dest, vibrato: 4 });
      if (s % 4 === 2) this.tone({ f: midi(chord[(s / 2) % 3] + 24), dur: 0.5, type: 'triangle', vol: 0.03, at, dest });
      return;
    }
    if (s % 4 === 0) this.tone({ f: 150, f2: 40, dur: 0.12, type: 'sine', vol: 0.6, at, dest });
    if (s === 4 || s === 12) this.noise({ dur: 0.12, vol: 0.25, type: 'highpass', freq: 1500, at, dest });
    if (s % 2 === 0) this.noise({ dur: 0.03, vol: 0.08, type: 'highpass', freq: 7000, at, dest });
    if (s % 2 === 0) this.tone({ f: midi(chord[0] - 12 + (s % 4 === 2 ? 12 : 0)), dur: 0.13, type: 'triangle', vol: 0.3, at, dest });
    if (s % 2 === 1) this.tone({ f: midi(chord[(s >> 1) % 3] + 12), dur: 0.06, type: 'square', vol: 0.025, at, dest });
    const m = this.melody[step % 64];
    if (m !== null && m !== undefined) this.tone({ f: midi(m), dur: 0.16, type: 'square', vol: 0.05, at, dest });
  }
}
