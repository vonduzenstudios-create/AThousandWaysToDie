import type { Sound } from '../audio';
import type { Handling } from './handling';

/** Car sounds, all synthesized. */
export const carSfx = {
  horn(s: Sound, vol = 1) {
    s.tone({ f: 392, dur: 0.32, type: 'square', vol: 0.07 * vol });
    s.tone({ f: 494, dur: 0.32, type: 'square', vol: 0.06 * vol });
  },
  screech(s: Sound) {
    s.noise({ dur: 0.7, vol: 0.25, freq: 2600, freq2: 1800, type: 'bandpass', q: 9 });
    s.tone({ f: 1900, f2: 1500, dur: 0.6, type: 'sawtooth', vol: 0.02 });
  },
  crash(s: Sound, k = 1) {
    s.noise({ dur: 0.5 * k, vol: 0.5, freq: 900, freq2: 200, type: 'lowpass', q: 1 });
    s.noise({ dur: 0.25, vol: 0.3, freq: 3500, type: 'highpass', q: 1, at: 0.03 }); // glass
    s.tone({ f: 90, f2: 40, dur: 0.3, type: 'sine', vol: 0.4 });
  },
  boom(s: Sound) {
    s.noise({ dur: 1.4, vol: 0.8, freq: 600, freq2: 60, type: 'lowpass', q: 0.7 });
    s.tone({ f: 70, f2: 25, dur: 1.0, type: 'sine', vol: 0.6 });
  },
  door(s: Sound) {
    s.tone({ f: 160, f2: 90, dur: 0.12, type: 'square', vol: 0.12 });
    s.noise({ dur: 0.1, vol: 0.2, freq: 800, type: 'bandpass', q: 2 });
  },
};

/** A looping engine drone whose pitch follows the car's speed. */
export class EngineSound {
  private osc: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  constructor(private sound: Sound) {}

  /** `rpm` is 0..1 from the car's gearbox; `h` gives each model its own voice. */
  set(on: boolean, speed: number, throttle: number, rpm?: number, h?: Handling) {
    const ctx = this.sound.ctx;
    if (!ctx) return;
    if (!this.osc) {
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 500;
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.osc = ctx.createOscillator();
      this.osc.type = 'sawtooth';
      this.osc2 = ctx.createOscillator();
      this.osc2.type = 'square';
      this.osc.connect(filt);
      this.osc2.connect(filt);
      filt.connect(this.gain);
      this.gain.connect(ctx.destination);
      this.osc.start();
      this.osc2.start();
    }
    let f: number;
    if (rpm !== undefined && h) f = h.idleHz + rpm * h.revHz * 1.6 + Math.abs(throttle) * 5;
    else {
      // Fake gears: pitch climbs, drops, climbs again.
      const sp = Math.abs(speed);
      const gear = Math.min(3, Math.floor(sp / 11));
      const inGear = (sp - gear * 11) / 11;
      f = 42 + inGear * 55 + gear * 8 + throttle * 6;
    }
    const t = ctx.currentTime;
    this.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2!.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.gain!.gain.setTargetAtTime(on ? 0.035 + Math.abs(throttle) * 0.03 : 0, t, 0.08);
  }
}
