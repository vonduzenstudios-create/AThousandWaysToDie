import * as THREE from 'three';
import type { PersonFile } from './deaths';
import type { Player } from './player';
import { money, pick } from './util';

/** What a skill may poke at. Game builds one of these; skills never import Game. */
export interface SkillHost {
  body: PersonFile;
  player: Player;
  feet(): THREE.Vector3;
  toast(title: string, sub?: string, ms?: number): void;
  say(who: string, line: string, ms?: number): void;
  addMoney(n: number): void;
  burst(pos: THREE.Vector3, n: number, color: number, speed?: number, opts?: { life?: number; size?: number; gravity?: number }): void;
  sfx(name: 'cash' | 'denied' | 'gulp' | 'munch' | 'whoosh' | 'boing' | 'zap' | 'thunder' | 'scream' | 'crunch'): void;
  /** Real-time seconds of slow motion. */
  slowmo(seconds: number, scale: number): void;
  hueTrip(seconds: number): void;
  /** Ask up to n nearby townsfolk to walk over. Returns how many came. */
  gather(n: number, radius: number, onArrive: (name: string) => void): number;
  nearbyCount(radius: number): number;
  pauseTrain(seconds: number): boolean;
  /** A hint about a death on this map that this body could do, in the body's voice. Null if none. */
  intrusiveThought(): string | null;
  /** Seconds of raised fall thresholds (painkillers). */
  numb(seconds: number): void;
  /** Multiplies the next claim's payout. */
  payoutBonus(mult: number, why: string): void;
  heal(hp: number): void;
  godAnger(delta: number): void;
  godAngerLevel(): number;
}

export type SkillSource = 'Anyone' | 'Job' | 'Body' | 'Mind' | 'Soul';

export interface Skill {
  id: string;
  name: string;
  icon: string;
  desc: string;
  source: SkillSource;
  /** Seconds. */
  cooldown: number;
  /** Usable once per body. */
  once?: boolean;
  /** Passive skills are always on and can't be pressed. */
  passive?: boolean;
  /** Returns false if it fizzled (no cooldown spent). */
  use?(h: SkillHost): boolean | void;
}

export interface SkillSlot {
  skill: Skill | null;
  /** Shown on an empty slot: what would unlock it. */
  locked: string;
}

const S = (s: Skill) => s;

// ---------- Anyone ----------
const WALLET = S({
  id: 'wallet',
  name: 'Rifle Wallet',
  icon: '👛',
  desc: "Take whatever cash is in your own pockets. It's not stealing if you're them.",
  source: 'Anyone',
  cooldown: 1,
  use(h) {
    const w = h.body.wallet;
    if (w.cash <= 0) {
      h.toast('WALLET EMPTY', `Just ${w.junk} and a ${w.bank} card. Find an ATM.`, 2400);
      h.sfx('denied');
      return false;
    }
    const c = w.cash;
    w.cash = 0;
    h.addMoney(c);
    h.sfx('cash');
    h.burst(h.feet().add(new THREE.Vector3(0, 1.2, 0)), 10, 0x55d16a, 3, { life: 0.8, size: 0.14 });
    h.toast(`+${money(c)} POCKETED`, `Also found ${w.junk}. Card: ${w.bank} ****${w.last4}.`, 3000);
  },
});

// ---------- Job ----------
// Every job is a key: it opens an area, or a way to die that nobody else can reach.
// No job skill kills you by itself. The passive's text tells you where to go.
const access = (id: string, name: string, icon: string, desc: string): Skill => ({ id, name, icon, desc: `Passive. ${desc}`, source: 'Job', cooldown: 0, passive: true });

const HOSPITAL_BADGE = (desc: string) => access('hospital', 'Staff Badge', '🏥', `City General past the lobby is yours. ${desc}`);
const GROCERY_BADGE = (desc: string) => access('grocery', 'Staff Only', '🛒', `The grocery store's back room, deli and seafood counter are yours. ${desc}`);
const AIRPORT_BADGE = (desc: string) => access('airport', 'Airside Badge', '🛂', `Your badge opens the airport's staff doors. ${desc}`);

const JOB_SKILLS: Record<string, Skill> = {
  // Smallville.
  Farmhand: access('barnkey', 'Barn Key', '🗝️', 'The barn, the hay hoist, the baler and the bull pen gate are yours.'),
  Cop: access('badge', 'Badge', '🚓', "The police station (and its department taser) is yours, and airport security waves you through."),
  Pastor: access('belltower', 'Bell Tower Key', '🔔', 'The church bell tower door opens for you.'),
  Mechanic: access('shopkeys', 'Shop Keys', '🔧', "Duke's Garage car lift answers to you."),
  Banker: access('vaultcode', 'Vault Code', '🏦', 'You know the combination to the bank vault on Main Street.'),
  'Diner Cook': access('kitchen', 'Kitchen Access', '🍳', "The diner's kitchen and its deep fryer are yours. Safari lodge steaks are free, too."),
  Dentist: access('rxpad', 'Prescription Pad', '💊', 'The pharmacist fills anything you write. Anything.'),
  'Mail Carrier': access('mailroom', 'Back of the Post Office', '📮', 'You can go behind the post office counter, where the overnight crates are.'),
  Teen: access('gymclass', 'Gym Class', '🏐', "You're allowed in the school gym. Dodgeball is in session."),
  'Crossing Guard': access('crossingkey', 'Crossing Key', '🚸', 'You have the key to the railroad crossing arm by the tracks.'),
  Retiree: access('plot', 'Pre-Paid Plot', '🪦', 'You already paid for a plot at Smallville Cemetery. The open grave is yours.'),
  'Insurance Salesman': access('preneed', 'Pre-Need Sales', '⚰️', "You sell burial plans. The cemetery's sales office and its display coffin are open to you."),
  Influencer: access('lounge', 'Blue Check', '✔️', "The airport's Sky Lounge (and its open bar) lets you in for free."),
  // The city.
  'Construction Worker': access('sitebadge', 'Site Badge', '⛑️', 'The city tower site crane and wrecking ball answer to you.'),
  Foreman: access('sitebadge', 'Site Badge', '⛑️', 'The city tower site crane and wrecking ball answer to you.'),
  // City General Hospital.
  Doctor: HOSPITAL_BADGE('The defibrillator, the morgue and the MRI are fair game, and you can write prescriptions at the Smallville pharmacy.'),
  Surgeon: HOSPITAL_BADGE('Only you can operate. Even on yourself.'),
  Nurse: HOSPITAL_BADGE('The defibrillator, the nitrous and the morgue drawers are yours. At Pinecrest, so is every ward and the night med cart.'),
  EMT: HOSPITAL_BADGE('You have the keys to the air ambulance on the roof.'),
  Firefighter: HOSPITAL_BADGE('Your fire key opens the elevator doors, wherever the elevator is.'),
  Janitor: HOSPITAL_BADGE('Mop the morgue, ride the laundry chute.'),
  'Security Guard': HOSPITAL_BADGE('Nobody sedates their own guard.'),
  Patient: access('patient', 'Patient Wristband', '🩺', "Hospital: you have a bed on the ward, an IV, and a chart you could swap. Asylum: the whole ward is yours."),
  // Smallville Grocery.
  Butcher: GROCERY_BADGE('The walk-in freezer and the slicer are yours.'),
  'Deli Clerk': GROCERY_BADGE('The deli slicer is yours.'),
  Stocker: GROCERY_BADGE('The forklift keys are on your belt.'),
  Cashier: GROCERY_BADGE('You can page a price check to clear the floor.'),
  'Produce Manager': GROCERY_BADGE('The misters are your misters.'),
  'Store Manager': GROCERY_BADGE('All of it. You are the manager.'),
  // Airport.
  Pilot: AIRPORT_BADGE('The ramp, the lounge and the cockpit. Yes, the cockpit.'),
  'Flight Attendant': AIRPORT_BADGE('The Sky Lounge and every gate.'),
  'TSA Agent': AIRPORT_BADGE('The TSA office and the confiscated liquids bin.'),
  'Baggage Handler': AIRPORT_BADGE('The bag room and the ramp. The belt goes all the way into the sorter.'),
  'Ground Crew': AIRPORT_BADGE('The ramp: jet engines, de-icers and tugs.'),
  'Air Traffic Controller': AIRPORT_BADGE('The tower. You decide which runway planes land on.'),
  // Blackrock and Pinecrest.
  Inmate: access('inmate', 'Yard Time', '⛓️', 'The cell block, the yard, the showers and the laundry. Big Tony is also here.'),
  'Prison Guard': access('guard', 'Guard Keys', '🔑', "Death row, solitary, the guard tower and the no-man's land."),
  Warden: access('guard', 'Master Keys', '🔑', 'Every door in Blackrock, including death row.'),
  Orderly: access('ward', 'Ward Keys', '🗝️', 'Every ward at Pinecrest, including the electroshock room.'),
  Psychiatrist: access('ward', 'Ward Keys', '🗝️', "Every ward at Pinecrest, and your office's old lobotomy kit."),
};

// ---------- Body (physical health) ----------
const BODY_SKILLS: Record<string, Skill> = {
  Feeble: S({
    id: 'back',
    name: 'Throw Out Back',
    icon: '🦴',
    desc: 'Bend over to tie a shoe. Both legs stop working.',
    source: 'Body',
    cooldown: 10,
    use(h) {
      if (h.player.legsBroken) return false;
      h.player.breakLegs();
      h.sfx('crunch');
      h.sfx('scream');
      h.toast('*CRACK*', "You're crawling now. Scream (T) or embrace it.", 2600);
    },
  }),
  Athlete: S({
    id: 'adrenaline',
    name: 'Adrenaline',
    icon: '💪',
    desc: 'Time slows for 4 seconds. Line up that jump.',
    source: 'Body',
    cooldown: 15,
    use(h) {
      h.slowmo(4, 0.4);
      h.sfx('whoosh');
      h.toast('FOCUS', 'Everything slows down.', 1400);
    },
  }),
};

// ---------- Mind (mental health) ----------
const MIND_SKILLS: Record<string, Skill> = {
  Depressed: S({
    id: 'intrusive',
    name: 'Intrusive Thoughts',
    icon: '🌧️',
    desc: "Your brain offers a suggestion: a way to die somewhere on this map that this body could actually pull off.",
    source: 'Mind',
    cooldown: 10,
    use(h) {
      const line = h.intrusiveThought();
      if (!line) {
        h.say(h.body.name.split(' ')[0], 'Nothing. Even my brain has run out of ideas here.', 2400);
        return false;
      }
      h.say(`${h.body.name.split(' ')[0]} (thinking)`, line, 5200);
    },
  }),
  Medicated: S({
    id: 'pill',
    name: 'Pop a Pill',
    icon: '💊',
    desc: 'Heals 30 HP, fixes legs, and you feel no pain for 20 seconds (falls hurt less).',
    source: 'Mind',
    cooldown: 25,
    use(h) {
      h.heal(30);
      h.player.healLegs();
      h.numb(20);
      h.sfx('gulp');
      h.toast('NUMB', 'Take two and jump off something.', 2000);
    },
  }),
};

// ---------- Soul (afterlife) ----------
const PRAY = S({
  id: 'pray',
  name: 'Pray',
  icon: '🙏',
  desc: "Once per body. Apologize to God. Calms His anger by one notch.",
  source: 'Soul',
  cooldown: 0,
  once: true,
  use(h) {
    if (h.godAngerLevel() <= 0) {
      h.say('God', "I wasn't mad at you. ...Yet.", 2600);
      return false;
    }
    h.godAnger(-1);
    h.sfx('thunder');
    h.say('God', pick(Math.random, ['Fine. FINE. But I am watching.', 'Apology accepted. Mostly.', 'You get one. That was it.']), 3000);
  },
});
const FART = S({
  id: 'hellfart',
  name: 'Hellfire Fart',
  icon: '🔥',
  desc: 'A blast from below launches you skyward. Smells like brimstone.',
  source: 'Soul',
  cooldown: 8,
  use(h) {
    const v = h.player.vel;
    v.y = Math.max(v.y, 19);
    h.player.knock(new THREE.Vector3(v.x, v.y, v.z));
    const p = h.feet();
    h.burst(p, 24, 0xff6a1a, 6, { life: 0.7, size: 0.3, gravity: -2 });
    h.burst(p, 10, 0x5a4a3a, 3, { life: 1.4, size: 0.5, gravity: -1 });
    h.sfx('boing');
    h.sfx('thunder');
  },
});
const SOUL_SKILLS: Record<string, Skill> = {
  Heaven: PRAY,
  'Undecided (leaning Heaven)': PRAY,
  Hell: FART,
  'Undecided (leaning Hell)': FART,
};

/** The five skills this body brings, in bar order: 1 wallet, 2 job, 3 body, 4 mind, 5 soul. */
export function skillsFor(f: PersonFile): SkillSlot[] {
  return [
    { skill: WALLET, locked: '' },
    { skill: JOB_SKILLS[f.job] ?? null, locked: 'Some jobs come with a key to somewhere' },
    { skill: BODY_SKILLS[f.physical] ?? null, locked: 'Needs an Athlete or a Feeble body' },
    { skill: MIND_SKILLS[f.mental] ?? null, locked: 'Needs a Depressed or Medicated mind' },
    { skill: SOUL_SKILLS[f.afterlife] ?? null, locked: 'Needs a soul bound for Heaven or Hell' },
  ];
}

export function hasPassive(f: PersonFile, id: string) {
  return skillsFor(f).some((s) => s.skill?.id === id);
}

/** Per-body cooldown and once-only tracking. Times are performance.now() ms. */
export class SkillBar {
  slots: SkillSlot[] = [];
  readyAt: number[] = [0, 0, 0, 0, 0];
  used: boolean[] = [false, false, false, false, false];
  selected = 0;

  setBody(f: PersonFile | null) {
    this.slots = f ? skillsFor(f) : [];
    this.readyAt = [0, 0, 0, 0, 0];
    this.used = [false, false, false, false, false];
  }

  /** Returns a reason string if it can't be used. */
  blocked(i: number, now: number): string | null {
    const s = this.slots[i]?.skill;
    if (!s) return this.slots[i]?.locked ?? 'Empty';
    if (s.passive) return 'Passive: always on';
    if (s.once && this.used[i]) return 'Already used in this body';
    if (now < this.readyAt[i]) return `Cooling down (${Math.ceil((this.readyAt[i] - now) / 1000)}s)`;
    return null;
  }

  use(i: number, h: SkillHost, now: number): { ok: boolean; reason?: string } {
    const why = this.blocked(i, now);
    if (why) return { ok: false, reason: why };
    const s = this.slots[i].skill!;
    const r = s.use?.(h);
    if (r === false) {
      this.readyAt[i] = now + 600;
      return { ok: false };
    }
    if (s.once) this.used[i] = true;
    this.readyAt[i] = now + s.cooldown * 1000;
    return { ok: true };
  }

  /** 0..1 cooldown remaining, for the UI sweep. */
  cooldownFrac(i: number, now: number) {
    const s = this.slots[i]?.skill;
    if (!s || s.passive || !s.cooldown) return 0;
    return Math.max(0, Math.min(1, (this.readyAt[i] - now) / (s.cooldown * 1000)));
  }
}
