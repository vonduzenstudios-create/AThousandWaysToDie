import { mulberry32, pick, randRange, type Rng } from './util';

export const CATEGORIES = [
  'Gravity',
  'Food & Drink',
  'Allergies',
  'Creatures',
  'Crushing',
  'Fire & Explosions',
  'Electricity',
  'Water',
  'Vehicles',
  'Machines',
  'Sports',
  'Stupidity',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface DeathDef {
  id: string;
  name: string;
  category: Category;
  location: string;
  payout: number;
  blurb: string;
}

/** Deaths available in this build. The ledger reserves 1,000 slots overall. */
export const DEATHS: DeathDef[] = [
  { id: 'treehouse', name: 'Treehouse Tumble', category: 'Gravity', location: 'Smallville Park', payout: 800, blurb: 'Fell out of the big oak. The treehouse is fine.' },
  { id: 'antifreeze', name: 'Antifreeze Cocktail', category: 'Food & Drink', location: "Duke's Garage", payout: 1200, blurb: 'It looked like a sports drink. It was not.' },
  { id: 'shocking', name: 'Shocking Behavior', category: 'Electricity', location: 'Hoffman Farm', payout: 1500, blurb: 'Relieved himself on an electric fence.' },
  { id: 'pancake', name: 'Pancake Mode', category: 'Crushing', location: 'Hoffman Farm', payout: 1800, blurb: 'Flattened by a 900 lb hay bale. Now fits under doors.' },
  { id: 'watertower', name: 'Water Tower Dive', category: 'Gravity', location: 'Smallville Water Tower', payout: 2500, blurb: 'A perfect long jump. Zero water in the landing zone.' },
  { id: 'fungus', name: 'Forest Fungus', category: 'Food & Drink', location: 'Whisper Woods', payout: 900, blurb: 'Ate the spotted mushroom. Saw colors. Then saw nothing.' },
  { id: 'train', name: 'Last Train Home', category: 'Vehicles', location: 'Smallville Rail Crossing', payout: 3000, blurb: 'The train had the right of way. It always does.' },
  { id: 'faceplant', name: 'Faceplant', category: 'Gravity', location: 'Anywhere', payout: 300, blurb: 'Fell from a height with absolutely no style.' },
  { id: 'edge', name: 'Edge of the World', category: 'Stupidity', location: 'The Edge of Town', payout: 1000, blurb: 'Walked off the edge of the map. Bold.' },
  { id: 'beatdown', name: 'Resisting Arrest', category: 'Stupidity', location: 'Smallville Police Station', payout: 2200, blurb: 'Kept walking into the police station. The police had opinions.' },
  { id: 'taser', name: "Don't Tase Me, Bro", category: 'Electricity', location: 'Smallville Police Station', payout: 1600, blurb: 'A cop tested the department taser on himself. Thirty-one times.' },
  { id: 'baled', name: 'Baled', category: 'Machines', location: 'Hoffman Barn', payout: 2000, blurb: 'Climbed into the hay baler. Came out as a neat, tidy cube.' },
  { id: 'brawl', name: 'Picked the Wrong Fight', category: 'Stupidity', location: 'Anywhere in Smallville', payout: 1300, blurb: 'Punched a stranger. The stranger punched back. A lot.' },
  { id: 'grandma', name: 'Beaten by a Senior', category: 'Stupidity', location: 'Anywhere in Smallville', payout: 2600, blurb: 'Started a fist fight with someone frail. Lost. Badly.' },
  { id: 'peanut', name: 'Peanut Panic', category: 'Allergies', location: 'Smallville Diner', payout: 1400, blurb: 'Ate a peanut butter cookie in a body with a deadly peanut allergy.' },
  { id: 'roadkill', name: 'Jaywalker', category: 'Vehicles', location: 'Any Road', payout: 1100, blurb: 'Stepped into traffic. The driver was texting. Everyone was texting.' },
  { id: 'cliff', name: 'Cliffhanger', category: 'Vehicles', location: 'Any Cliff, In Any Car', payout: 3500, blurb: 'Floored it off a cliff in a stolen car. Stuck the landing, in a way.' },
  { id: 'windshield', name: 'No Seatbelt', category: 'Vehicles', location: 'Any Wall, At Speed', payout: 2400, blurb: 'Hit a wall at highway speed and left through the windshield.' },
  { id: 'bailout', name: 'Tuck and Roll', category: 'Vehicles', location: 'Any Moving Car', payout: 1700, blurb: 'Jumped out of a moving car like in the movies. Did not tuck. Did not roll.' },
  { id: 'traincar', name: 'Beat the Train', category: 'Vehicles', location: 'Smallville Rail Crossing', payout: 3800, blurb: 'Tried to beat the train across the tracks in a stolen car. Lost by a lot.' },
  // Skateboards and bikes (src/rides.ts).
  { id: 'handlebars', name: 'Over the Handlebars', category: 'Vehicles', location: 'Anywhere with a wall', payout: 1400, blurb: 'Rode a bike into a wall at full speed. The bike stopped. The rider did not.' },
  { id: 'boardmeeting', name: 'Board Meeting', category: 'Sports', location: 'Anywhere with a wall', payout: 1200, blurb: 'Skated face-first into a wall. The wall called the meeting.' },
  { id: 'kneecap', name: 'Evel Kneecap', category: 'Sports', location: 'The Dare Ramp', payout: 2800, blurb: 'Hit the Dare Ramp at full speed and cleared everything, including the landing.' },
  { id: 'grindrail', name: 'Grind Rail', category: 'Vehicles', location: 'Smallville Rail Crossing', payout: 2600, blurb: 'Tried to grind the train tracks. The train was already grinding them.' },
  { id: 'actyourage', name: 'Act Your Age', category: 'Sports', location: 'Anywhere', payout: 1800, blurb: 'Hopped on a skateboard with hips made of drywall.' },
  { id: 'sharetheroad', name: 'Share the Road', category: 'Vehicles', location: 'Any Road, On Two Wheels', payout: 1600, blurb: 'Rode a bike or a board into a car, or a car into them. The bike lane was a suggestion.' },
  { id: 'wheelie', name: 'Wheelie Bad Idea', category: 'Stupidity', location: 'Anywhere', payout: 1500, blurb: 'Held a wheelie way too long. Gravity held it longer.' },
];

export const DEATH_BY_ID: Record<string, DeathDef> = Object.fromEntries(DEATHS.map((d) => [d.id, d]));

/** Which map each death lives on, by death id. Anything not listed is in Smallville. */
export const DEATH_MAP: Record<string, string> = {};

export function mapOfDeath(id: string) {
  return DEATH_MAP[id] ?? 'smallville';
}

/** Add a map's deaths to the ledger (ids must be globally unique) and remember which map they're on. */
export function registerMapDeaths(defs: DeathDef[], mapId = 'smallville') {
  for (const d of defs) {
    DEATH_MAP[d.id] = mapId;
    if (DEATH_BY_ID[d.id]) continue;
    DEATHS.push(d);
    DEATH_BY_ID[d.id] = d;
  }
}
export const TOTAL_SLOTS = 1000;

export const DENIAL_REASONS = [
  "We've already paid for this one. Twice is a pattern.",
  'Claim matches a previous claim. Our AI is suspicious.',
  'Cause of death classified as "repeat behavior". Not covered.',
  'Policy section 47(b): no encores.',
  'The adjuster has seen this before and was bored.',
];

export const UNINSURED_LINES = [
  'No active policy. Mortalis thanks you for the free entertainment.',
  'Deceased was uninsured. Nothing to pay. Have a nice afterlife.',
];

export const ADJUSTER_NOTES = [
  'Approved, reluctantly.',
  'Approved. The adjuster sighed audibly.',
  'Approved. We are looking into this.',
  'Approved. Legal has been notified.',
  'Approved. Please stop.',
];

// ---------- People and their files (seen through scythe vision) ----------

const FIRST = ['Linda', 'Gary', 'Doug', 'Brenda', 'Kevin', 'Tammy', 'Earl', 'Darlene', 'Chad', 'Bev', 'Randy', 'Peggy', 'Duane', 'Crystal', 'Walt', 'Rhonda', 'Skip', 'Marge', 'Travis', 'Deb', 'Lyle', 'Shonda', 'Hank', 'Trish'];
const LAST = ['Pruitt', 'Hoffman', 'Kowalski', 'Butts', 'McGee', 'Dinkel', 'Ferguson', 'Snodgrass', 'Plunkett', 'Wiggins', 'Sauerkraut', 'Bumgarner', 'Weatherby', 'Puckett', 'Hornswoggle', 'Fudge'];

export const JOBS = ['Farmhand', 'Mechanic', 'Mail Carrier', 'Retiree', 'Banker', 'Teen', 'Dentist', 'Diner Cook', 'Insurance Salesman', 'Pastor', 'Crossing Guard', 'Influencer', 'Cop', 'Construction Worker'] as const;
export type Physical = 'Feeble' | 'Normal' | 'Athlete';
export type Mental = 'Depressed' | 'Normal' | 'Medicated';

export const PHYSICAL_INFO: Record<Physical, string> = {
  Feeble: 'half speed, basic jump only',
  Normal: 'double jump, flips, dive',
  Athlete: 'triple jump, long jump',
};
export type Job = (typeof JOBS)[number];

const BORING_CAUSES = [
  'choking on a vitamin',
  'falling asleep in a hot tub',
  'extreme boredom',
  'a regular staircase',
  'a vending machine disagreement',
  'tripping over a cat',
  'too much cheese, over many years',
  'a paper cut, somehow',
  'reading the terms and conditions',
  'old age, very slowly',
  'a ceiling fan',
  'an aggressive goose',
];

const QUIRKS = [
  'Secretly hates dogs.',
  'Has never once used a turn signal.',
  'Owes the library $412.',
  'Thinks birds are government drones.',
  'Re-gifted every present since 1998.',
  'Microwaves fish at work.',
  'Claps when the plane lands.',
  'Replies-all to everything.',
  'Has a tattoo of their own name.',
  'Cried at a car commercial this morning.',
  'Talks during movies.',
  'Has a peanut allergy. Like, a bad one.',
  'Keeps a "lucky" cursed coin.',
  'Is 40% Mountain Dew by volume.',
];

export interface Wallet {
  cash: number;
  /** Junk found alongside the cash, for flavor. */
  junk: string;
  bank: string;
  last4: string;
  pin: string;
  /** Checking balance. Negative means overdrawn. */
  balance: number;
}

const BANKS = ['First Bank of Smallville', 'Mortalis Credit Union', 'Bank of Mattress', 'Piggly Savings & Loan', 'Cash4Gold Federal'];
const WALLET_JUNK = [
  'a Blockbuster card',
  'a condom from 2009',
  'six expired coupons for ham',
  'a photo of someone else\'s kids',
  'a lottery ticket (loser)',
  'a punch card one punch from a free sub',
  'a fortune that says "No."',
  'a tooth. Not theirs.',
  'a business card for a psychic',
  'a folded note that says "you looked"',
  'a Chuck E. Cheese token',
  'a receipt for 40 lbs of glitter',
];

function randomWallet(rng: Rng, job: string, age: number, netWorth: number): Wallet {
  let cash = Math.floor(Math.pow(rng(), 2.2) * 300);
  if (job === 'Teen') cash = Math.floor(rng() * 25);
  if (age >= 66) cash += Math.floor(rng() * 120); // they carry cash. Lots of it.
  let balance = Math.floor(Math.max(-900, netWorth * (0.01 + rng() * 0.04)));
  if (job === 'Teen') balance = Math.floor(rng() * 60);
  if (job === 'Banker') balance = Math.max(balance, 8000);
  if (rng() < 0.12) balance = -Math.floor(randRange(rng, 20, 600));
  const pin = rng() < 0.3 ? pick(rng, ['1234', '0000', '6969', '1111', '4321']) : String(Math.floor(rng() * 10000)).padStart(4, '0');
  return {
    cash,
    junk: pick(rng, WALLET_JUNK),
    bank: pick(rng, BANKS),
    last4: String(Math.floor(rng() * 10000)).padStart(4, '0'),
    pin,
    balance,
  };
}

export interface PersonFile {
  name: string;
  age: number;
  job: Job;
  daysLeft: number; // scheduled time of death from now
  cause: string;
  policy: number; // 0 = uninsured
  netWorth: number;
  afterlife: 'Heaven' | 'Hell' | 'Undecided (leaning Hell)' | 'Undecided (leaning Heaven)';
  quirk: string;
  peanutAllergy: boolean;
  physical: Physical;
  mental: Mental;
  wallet: Wallet;
}

const ATHLETIC_JOBS: readonly string[] = ['Cop', 'Construction Worker', 'Farmhand', 'Teen', 'Mail Carrier'];

export function physicalFor(rng: Rng, age: number, job: string): Physical {
  if (age >= 72) return rng() < 0.9 ? 'Feeble' : 'Normal';
  if (age >= 58) return rng() < 0.45 ? 'Feeble' : 'Normal';
  if (age < 45 && ATHLETIC_JOBS.includes(job)) return rng() < 0.75 ? 'Athlete' : 'Normal';
  if (age < 35) return rng() < 0.25 ? 'Athlete' : 'Normal';
  return rng() < 0.08 ? 'Feeble' : 'Normal';
}

export function randomFile(rng: Rng, job?: Job): PersonFile {
  const quirk = pick(rng, QUIRKS);
  const chosenJob = job ?? pick(rng, JOBS);
  let age = Math.floor(randRange(rng, 16, 92));
  if (chosenJob === 'Teen') age = Math.floor(randRange(rng, 14, 19));
  if (chosenJob === 'Retiree') age = Math.floor(randRange(rng, 66, 95));
  if (chosenJob === 'Cop' || chosenJob === 'Construction Worker') age = Math.floor(randRange(rng, 21, 56));
  const netWorth = Math.floor(Math.pow(rng(), 3) * 2_000_000) - 20000;
  const roll = rng();
  const daysLeft = roll < 0.45 ? Math.floor(randRange(rng, 0, 30)) : roll < 0.7 ? Math.floor(randRange(rng, 30, 900)) : Math.floor(randRange(rng, 3000, 20000));
  return {
    name: `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
    age,
    job: chosenJob,
    daysLeft,
    cause: pick(rng, BORING_CAUSES),
    policy: rng() < 0.18 ? 0 : pick(rng, [0.5, 1, 1, 1.5, 2, 3]),
    netWorth,
    afterlife: pick(rng, ['Heaven', 'Hell', 'Undecided (leaning Hell)', 'Undecided (leaning Heaven)'] as const),
    quirk,
    peanutAllergy: quirk.includes('peanut') || rng() < 0.15,
    physical: physicalFor(rng, age, chosenJob),
    mental: pick(rng, ['Depressed', 'Normal', 'Normal', 'Medicated'] as const),
    wallet: randomWallet(rng, chosenJob, age, netWorth),
  };
}

/** Fair game: their time is nearly up or they're headed downstairs anyway. */
export function isDeserving(f: PersonFile) {
  return f.daysLeft < 365 || f.afterlife === 'Hell' || f.afterlife === 'Undecided (leaning Hell)';
}

export function timeLeftLabel(days: number) {
  if (days < 1) return 'TODAY';
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}

// ---------- Save data ----------

export interface Found {
  count: number;
  payout: number;
  first: number;
}

const SAVE_KEY = 'death-benefits-save-v1';

export class Ledger {
  found: Record<string, Found> = {};
  balance = 0;
  total = 0;
  claimNo = 4170;
  godAnger = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) Object.assign(this, JSON.parse(raw));
    } catch {
      /* fresh save */
    }
  }

  get foundCount() {
    return Object.keys(this.found).length;
  }

  save() {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ found: this.found, balance: this.balance, total: this.total, claimNo: this.claimNo, godAnger: this.godAnger }),
      );
    } catch {
      /* storage blocked: progress lasts this session only */
    }
  }

  reset() {
    this.found = {};
    this.balance = 0;
    this.total = 0;
    this.godAnger = 0;
    this.save();
  }
}

export const seededRng = (seed: number) => mulberry32(seed);
