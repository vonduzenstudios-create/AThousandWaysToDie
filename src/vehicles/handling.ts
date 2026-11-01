import type { CarKind } from './carModel';

/**
 * How each kind of car drives. Speeds are m/s (1 m/s = 2.237 mph), accelerations m/s².
 * The engine pushes with mass * accel at launch and fades to nothing at top speed, so
 * changing `accel` or `top` keeps working whatever the car weighs.
 */
export interface Handling {
  /** Name on the dashboard. */
  name: string;
  mass: number;
  /** Launch acceleration. */
  accel: number;
  /** Top speed. */
  top: number;
  reverse: number;
  /** Braking deceleration. */
  brake: number;
  /** Steering lock at a standstill (radians), and the speed at which it has halved. */
  steer: number;
  steerFade: number;
  /** How fast the wheel turns toward the input (per 60 Hz step, 0..1). */
  steerRate: number;
  /** Tire grip (friction slip) front and rear. Lower rear grip means a tail-happy car. */
  grip: number;
  rearGrip: number;
  drive: 'fwd' | 'rwd' | 'awd';
  /** Suspension: spring, damping, rest length and travel (m). */
  stiffness: number;
  compression: number;
  relaxation: number;
  rest: number;
  travel: number;
  /** Center of mass below the body origin (m). Higher numbers resist rolling over. */
  comDrop: number;
  /** Extra grip-giving push down at top speed, as a fraction of the car's weight. */
  downforce: number;
  /** Gearbox and engine note. */
  gears: number;
  idleHz: number;
  revHz: number;
  /** Traffic cruising speed multiplier. */
  cruise: number;
  /** Hill strength: share of a slope's pull the engine cancels out (0..1). Off-roaders near 1. */
  climb: number;
  /** Two-wheelers: how hard the bike holds itself upright (0 = not a bike). */
  balance: number;
}

const base: Omit<Handling, 'name'> = {
  mass: 1500,
  accel: 7.5,
  top: 40,
  reverse: 10,
  brake: 11,
  steer: 0.6,
  steerFade: 26,
  steerRate: 0.2,
  grip: 2.6,
  rearGrip: 2.4,
  drive: 'fwd',
  stiffness: 38,
  compression: 2.4,
  relaxation: 2.8,
  rest: 0.45,
  travel: 0.4,
  comDrop: 0.35,
  downforce: 0.15,
  gears: 5,
  idleHz: 44,
  revHz: 58,
  cruise: 1,
  balance: 0,
  climb: 0.55,
};

export const HANDLING: Record<CarKind, Handling> = {
  /** The everyday car: nothing special, nothing scary. ~90 mph. */
  sedan: { ...base, name: 'Meridian Sedan' },
  /** Light and nimble, slow on the straights. ~80 mph. */
  hatch: { ...base, name: 'Pipsqueak Hatch', mass: 1100, accel: 7, top: 36, steer: 0.68, steerFade: 24, steerRate: 0.26, grip: 2.7, rearGrip: 2.5, stiffness: 40, rest: 0.42, idleHz: 52, revHz: 66 },
  /** A sedan with a heavier foot. ~92 mph. */
  taxi: { ...base, name: 'Checker Cab', mass: 1550, accel: 8, top: 41, cruise: 1.12 },
  /** Fast, stiff and twitchy. Grips hard, then lets go all at once. ~140 mph. */
  sport: {
    ...base,
    name: 'Vortex GT',
    mass: 1300,
    accel: 12.5,
    top: 62,
    brake: 16,
    steer: 0.5,
    steerFade: 42,
    steerRate: 0.34,
    grip: 3.5,
    rearGrip: 3.2,
    drive: 'rwd',
    stiffness: 60,
    compression: 3,
    relaxation: 3.6,
    rest: 0.25,
    travel: 0.2,
    comDrop: 0.45,
    downforce: 0.9,
    gears: 6,
    idleHz: 60,
    revHz: 95,
    cruise: 1.15,
  },
  /** Huge engine, loose rear end: stamp on it and it smokes and swings wide. ~125 mph. */
  muscle: {
    ...base,
    name: 'Brute 440',
    mass: 1650,
    accel: 11,
    top: 56,
    brake: 10,
    steer: 0.55,
    steerFade: 24,
    steerRate: 0.18,
    grip: 2.5,
    rearGrip: 1.55,
    drive: 'rwd',
    stiffness: 34,
    rest: 0.4,
    comDrop: 0.3,
    downforce: 0.2,
    gears: 4,
    idleHz: 34,
    revHz: 62,
    cruise: 1.1,
  },
  /** Four-wheel drive, soft long-travel springs: wallows on tarmac, eats dirt and curbs. ~83 mph. */
  jeep: {
    ...base,
    name: 'Ridgeback 4x4',
    climb: 0.95,
    mass: 1900,
    accel: 6.8,
    top: 37,
    brake: 10,
    steer: 0.62,
    steerFade: 22,
    steerRate: 0.2,
    grip: 3.1,
    rearGrip: 3.1,
    drive: 'awd',
    stiffness: 22,
    compression: 1.8,
    relaxation: 2.2,
    rest: 0.65,
    travel: 0.6,
    comDrop: 0.25,
    downforce: 0,
    gears: 5,
    idleHz: 38,
    revHz: 50,
  },
  /** Slow, top-heavy and leans in corners. Take it easy or take a tumble. ~74 mph. */
  van: {
    ...base,
    name: 'Wanderer Van',
    mass: 2400,
    accel: 5,
    top: 33,
    brake: 8.5,
    steer: 0.52,
    steerFade: 18,
    steerRate: 0.13,
    grip: 2.3,
    rearGrip: 2.2,
    drive: 'rwd',
    stiffness: 28,
    compression: 2.1,
    relaxation: 2.4,
    comDrop: -0.15,
    downforce: 0,
    gears: 4,
    idleHz: 40,
    revHz: 46,
    cruise: 0.92,
  },
  /** Torquey and a little light in the tail when the bed is empty. ~95 mph. */
  pickup: {
    ...base,
    name: 'Workhorse Pickup',
    climb: 0.85,
    mass: 2100,
    accel: 7.2,
    top: 42,
    brake: 10,
    steer: 0.55,
    steerFade: 22,
    steerRate: 0.18,
    grip: 2.6,
    rearGrip: 2.0,
    drive: 'rwd',
    stiffness: 32,
    rest: 0.5,
    travel: 0.45,
    comDrop: 0.2,
    gears: 5,
    idleHz: 36,
    revHz: 52,
  },
  /** Small, light, four-wheel drive and soft: climbs steep dirt that would stop a car. ~67 mph. */
  quad: {
    ...base,
    name: 'Mudlark ATV',
    climb: 1,
    mass: 420,
    accel: 9,
    top: 30,
    reverse: 7,
    brake: 10,
    steer: 0.6,
    steerFade: 18,
    steerRate: 0.24,
    grip: 3.3,
    rearGrip: 3.3,
    drive: 'awd',
    stiffness: 24,
    compression: 1.8,
    relaxation: 2.2,
    rest: 0.4,
    travel: 0.4,
    comDrop: 0.2,
    downforce: 0,
    gears: 5,
    idleHz: 55,
    revHz: 80,
  },
  /** Light, quick and leans into corners. Holds itself up while you ride it; drop it and it falls over. ~90 mph. */
  dirtbike: {
    ...base,
    name: 'Scrambler 250',
    climb: 0.9,
    mass: 260,
    accel: 9.5,
    top: 40,
    reverse: 4,
    brake: 10,
    steer: 0.5,
    steerFade: 12,
    steerRate: 0.24,
    grip: 2.9,
    rearGrip: 2.7,
    drive: 'rwd',
    stiffness: 30,
    compression: 2,
    relaxation: 2.4,
    rest: 0.35,
    travel: 0.35,
    comDrop: 0.55,
    downforce: 0,
    gears: 5,
    idleHz: 70,
    revHz: 120,
    balance: 150,
  },
  /** Seven and a half tonnes. Gets going eventually, stops reluctantly, wins every argument. ~58 mph. */
  truck: {
    ...base,
    name: 'Goliath Dumper',
    climb: 0.75,
    mass: 7500,
    accel: 3.2,
    top: 26,
    reverse: 6,
    brake: 7,
    steer: 0.5,
    steerFade: 16,
    steerRate: 0.1,
    grip: 2.6,
    rearGrip: 2.6,
    drive: 'rwd',
    stiffness: 45,
    compression: 3,
    relaxation: 3.5,
    rest: 0.5,
    travel: 0.4,
    comDrop: 0.6,
    downforce: 0,
    gears: 6,
    idleHz: 26,
    revHz: 30,
    cruise: 0.8,
  },
};

/** Fake gearbox shared by the engine note, the tach and the shift kick. */
export function gearbox(h: Handling, speed: number) {
  const sp = Math.abs(speed);
  // Lower gears are shorter: gear k tops out at top * (k / gears)^0.75.
  let gear = 1;
  let lo = 0;
  let hi = h.top * Math.pow(1 / h.gears, 0.75);
  while (sp > hi && gear < h.gears) {
    gear++;
    lo = hi;
    hi = h.top * Math.pow(gear / h.gears, 0.75);
  }
  const t = Math.max(0, Math.min(1, (sp - lo) / Math.max(1e-3, hi - lo)));
  const rpm = gear === 1 ? 0.18 + 0.82 * t : 0.45 + 0.55 * t;
  return { gear, rpm };
}
