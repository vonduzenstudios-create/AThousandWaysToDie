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
  /** Point a light pillar at the nearest thing that might kill you. Returns false if none. */
  revealNearestHazard(seconds: number): boolean;
  /** Seconds of raised fall thresholds (painkillers). */
  numb(seconds: number): void;
  /** Multiplies the next claim's payout. */
  payoutBonus(mult: number, why: string): void;
  heal(hp: number): void;
  godAnger(delta: number): void;
  godAngerLevel(): number;
  /** Run an existing interactable's death or action by id (e.g. 'taser'). */
  trigger(id: string): void;
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
const JOB_SKILLS: Record<string, Skill> = {
  Farmhand: S({ id: 'barnkey', name: 'Barn Key', icon: '🗝️', desc: 'Passive. The barn and the hay hoist are yours.', source: 'Job', cooldown: 0, passive: true }),
  Cop: S({
    id: 'tase',
    name: 'Tase Self',
    icon: '⚡',
    desc: 'Field-test the department taser. On yourself. For science.',
    source: 'Job',
    cooldown: 5,
    use(h) {
      h.trigger('taser');
    },
  }),
  'Construction Worker': S({ id: 'hardhat', name: 'Hard Hat', icon: '⛑️', desc: 'Passive. Survives falls 2m higher. Protects the head. Only the head.', source: 'Job', cooldown: 0, passive: true }),
  Mechanic: S({
    id: 'coolant',
    name: 'Chug Coolant',
    icon: '🧪',
    desc: 'Run twice as fast for 5 seconds. Tastes blue.',
    source: 'Job',
    cooldown: 14,
    use(h) {
      h.player.boostMul = 2;
      h.player.boostT = 5;
      h.sfx('gulp');
      h.toast('VROOM', 'Your kidneys have filed a complaint.', 1800);
    },
  }),
  'Mail Carrier': S({
    id: 'dogsprint',
    name: 'Dog Sprint',
    icon: '🐕',
    desc: 'Years of being chased. 1.7x speed for 6 seconds.',
    source: 'Job',
    cooldown: 12,
    use(h) {
      h.player.boostMul = 1.7;
      h.player.boostT = 6;
      h.sfx('whoosh');
      h.toast('WOOF?', 'Old instincts kick in.', 1500);
    },
  }),
  Retiree: S({
    id: 'manager',
    name: 'Ask For Manager',
    icon: '🧓',
    desc: 'Summon up to 3 nearby people to come hear your complaint.',
    source: 'Job',
    cooldown: 15,
    use(h) {
      const n = h.gather(3, 40, (name) => h.say(name, pick(Math.random, ['Yes sir, what seems to be the problem?', "Ma'am, this is a sidewalk.", 'I am not the manager of outside.']), 2600));
      if (!n) {
        h.toast('NO ONE CAME', 'Not even the manager of nothing.', 1800);
        return false;
      }
      h.toast('EXCUSE ME!', `${n} ${n === 1 ? 'person is' : 'people are'} coming over.`, 1800);
    },
  }),
  Banker: S({
    id: 'insider',
    name: 'Insider Trading',
    icon: '📈',
    desc: 'Once per body. Make a phone call. Make money.',
    source: 'Job',
    cooldown: 0,
    once: true,
    use(h) {
      const amt = Math.max(300, Math.min(4000, Math.round(h.body.netWorth * 0.002)));
      h.addMoney(amt);
      h.sfx('cash');
      h.toast(`+${money(amt)}`, 'Totally legal. Probably. Delete your texts.', 2600);
    },
  }),
  Teen: S({
    id: 'vape',
    name: 'Vape Cloud',
    icon: '💨',
    desc: 'Blow a massive cloud. Smells like Blue Razz and poor choices.',
    source: 'Job',
    cooldown: 4,
    use(h) {
      const p = h.feet().add(new THREE.Vector3(0, 1.6, 0));
      for (let i = 0; i < 4; i++) h.burst(p, 10, 0xd8e8ff, 2.5, { life: 2.2, size: 0.5, gravity: -0.6 });
      h.sfx('whoosh');
      if (Math.random() < 0.3) h.say('Death', "You're going to die of something, kid. Just not that. Not fast enough.", 3000);
    },
  }),
  Dentist: S({
    id: 'gas',
    name: 'Laughing Gas',
    icon: '😂',
    desc: 'Huff the good stuff. 5 seconds of slow motion and colors.',
    source: 'Job',
    cooldown: 18,
    use(h) {
      h.slowmo(5, 0.45);
      h.hueTrip(5);
      h.toast('HEHEHEHE', 'Everything is hilarious and slow.', 2000);
    },
  }),
  'Diner Cook': S({
    id: 'meal',
    name: 'Family Meal',
    icon: '🍔',
    desc: 'Eat the leftovers. Heals 50 HP and fixes broken legs, somehow.',
    source: 'Job',
    cooldown: 20,
    use(h) {
      h.heal(50);
      h.player.healLegs();
      h.sfx('munch');
      h.toast('MMMF', "Grease is a bone. Doctors hate this.", 2000);
    },
  }),
  'Insurance Salesman': S({
    id: 'fineprint',
    name: 'Fine Print',
    icon: '📜',
    desc: 'Once per body. Read your own policy. Next claim pays 1.5x.',
    source: 'Job',
    cooldown: 0,
    once: true,
    use(h) {
      h.payoutBonus(1.5, 'Fine Print');
      h.toast('LOOPHOLE FOUND', 'Section 14(b): "acts of stupidity" pay time and a half.', 2800);
    },
  }),
  Pastor: S({
    id: 'plate',
    name: 'Pass the Plate',
    icon: '🍽️',
    desc: 'Everyone nearby tithes. Heaven takes Venmo now.',
    source: 'Job',
    cooldown: 25,
    use(h) {
      const n = h.nearbyCount(18);
      if (!n) {
        h.toast('EMPTY PEWS', 'Nobody close enough to guilt.', 1800);
        return false;
      }
      const amt = n * (10 + Math.floor(Math.random() * 40));
      h.addMoney(amt);
      h.sfx('cash');
      h.toast(`+${money(amt)} TITHED`, `${n} ${n === 1 ? 'sinner' : 'sinners'} paid up.`, 2200);
    },
  }),
  'Crossing Guard': S({
    id: 'stop',
    name: 'STOP',
    icon: '🛑',
    desc: 'Hold up the sign. Even trains obey. For 8 seconds.',
    source: 'Job',
    cooldown: 20,
    use(h) {
      const ok = h.pauseTrain(8);
      h.toast('STOP!', ok ? 'The train screeches to a halt. Respect the vest.' : 'Nothing to stop. You wave the sign anyway.', 2200);
    },
  }),
  Influencer: S({
    id: 'live',
    name: 'Go Live',
    icon: '📱',
    desc: 'Once per body. Start a stream: people gather and your next claim pays 1.5x (monetized).',
    source: 'Job',
    cooldown: 0,
    once: true,
    use(h) {
      h.payoutBonus(1.5, 'Monetized');
      const n = h.gather(3, 45, (name) => h.say(name, pick(Math.random, ['Omg are you streaming?? Do something crazy!', 'Hi chat!', 'Is this a prank? Is this a prank?']), 2400));
      h.toast('🔴 LIVE', `${n * 113 + 7} viewers. Give them a death to remember.`, 2600);
    },
  }),
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
    id: 'morbid',
    name: 'Morbid Curiosity',
    icon: '🌧️',
    desc: 'Your intrusive thoughts point at the nearest way to die.',
    source: 'Mind',
    cooldown: 12,
    use(h) {
      if (!h.revealNearestHazard(7)) {
        h.toast('NOTHING', "Even your brain can't find anything out here.", 1800);
        return false;
      }
      h.say('Death', pick(Math.random, ['Over there. Not that I care.', 'Your brain has a suggestion.', "There. I'm not saying do it. I'm saying it's there."]), 2600);
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
    { skill: JOB_SKILLS[f.job] ?? null, locked: 'Some jobs come with a skill' },
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
