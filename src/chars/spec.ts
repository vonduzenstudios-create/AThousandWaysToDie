import { sexOfName, type Job, type Sex } from '../deaths';
import { mulberry32, pick, type Rng } from '../util';

export type Age = 'child' | 'teen' | 'adult' | 'elder';
export type Build = 'slim' | 'average' | 'heavy' | 'buff';
export type Stature = 'short' | 'normal' | 'tall';
export type HairStyle =
  | 'bald' | 'ring' | 'short' | 'spiky' | 'slick' | 'long' | 'bun' | 'pony' | 'mohawk' | 'curly'
  | 'afro' | 'bob' | 'pigtails' | 'buzz' | 'combover' | 'braids' | 'topknot';
export type Facial = 'none' | 'mustache' | 'beard' | 'stubble' | 'goatee' | 'handlebar' | 'chinstrap' | 'soulPatch';
export type Eyes = 'tall' | 'dot' | 'wide' | 'sleepy' | 'small' | 'lashes' | 'angry';
export type Brows = 'none' | 'thin' | 'thick' | 'angry' | 'worried' | 'uni';
export type Mouth = 'none' | 'smile' | 'flat' | 'frown' | 'teeth' | 'open' | 'smirk';
/** Things on the skin of the face. */
export type Mark = 'freckles' | 'blush' | 'mole' | 'eyebags' | 'scar' | 'bandage' | 'eyepatch';
/** Small worn items. */
export type Extra = 'earrings' | 'headphones' | 'flower' | 'chain' | 'necklace' | 'scarf' | 'bowtie' | 'backpack' | 'fannypack' | 'watch'
  | 'mask' | 'gloves' | 'suspenders' | 'bracelets' | 'bandana';
export type ShoeStyle = 'shoes' | 'sneakers' | 'boots' | 'sandals';
export type Glasses = 'none' | 'round' | 'sun';
export type Hat = 'none' | 'straw' | 'cap' | 'capBack' | 'chef' | 'beanie' | 'flatcap' | 'headMirror' | 'visor' | 'police' | 'hardhat'
  | 'cowboy' | 'tophat' | 'bucket' | 'beret' | 'party' | 'bow' | 'bandana' | 'surgical' | 'fireHelmet' | 'tiara' | 'shako';
/** What covers the legs. 'gown' is floor length and hides the legs (dresses, robes). */
export type Lower = 'pants' | 'shorts' | 'skirt' | 'gown';
export type Held = 'none' | 'pitchfork' | 'wrench' | 'parcel' | 'cane' | 'briefcase' | 'phone' | 'spatula' | 'stopSign' | 'book' | 'toothbrush' | 'donut' | 'hammer'
  | 'cleaver' | 'mop' | 'clipboard' | 'axe';
export type Expression = 'normal' | 'blink' | 'happy' | 'shock' | 'dead' | 'sick';

/** Which torso/limb paint job to use. Several jobs share a few, and townies get 'casual'. */
export type Outfit =
  | 'overalls'
  | 'coveralls'
  | 'mail'
  | 'cardigan'
  | 'hawaiian'
  | 'suit'
  | 'loudSuit'
  | 'hoodie'
  | 'labCoat'
  | 'cook'
  | 'clergy'
  | 'hiVis'
  | 'trendy'
  | 'police'
  | 'construction'
  | 'tank'
  | 'polo'
  | 'sweaterVest'
  | 'tracksuit'
  | 'jacket'
  | 'dress'
  | 'graphicTee'
  | 'plaid'
  | 'stripes'
  | 'vest'
  | 'apron'
  | 'scrubs'
  | 'gown'
  | 'robe'
  | 'firefighter'
  | 'swim'
  | 'bandUniform'
  | 'casual';

/** Everything needed to build one townsperson. Plain data, so it can be saved or sent around. */
export interface PersonSpec {
  seed: number;
  job: JobName;
  age: Age;
  build: Build;
  stature: Stature;
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  facial: Facial;
  eyes: Eyes;
  brows: Brows;
  mouth: Mouth;
  marks: Mark[];
  extras: Extra[];
  glasses: Glasses;
  hat: Hat;
  hatColor: number;
  outfit: Outfit;
  /** Main top color (shirt, jacket, coat). */
  top: number;
  /** Secondary color (overall bib, tie, vest, apron...). */
  accent: number;
  bottoms: number;
  shoes: number;
  shoeStyle: ShoeStyle;
  lower: Lower;
  held: Held;
  expression: Expression;
  /** Iris color. Optional so older saved specs still build. */
  eyeColor?: number;
  /** Body and styling to match the person's name. Optional so older saved specs still build. */
  sex?: Sex;
}

export const SKINS = [0xf9d9bd, 0xf2c4a0, 0xe0a97e, 0xc58a5c, 0x9c6640, 0x74472b, 0x553220];
export const SKINS_RARE = [0xfbe4d4, 0x8a5a3a, 0x3e2418, 0xd8b090];
export const HAIR = [0x1c1410, 0x3b2416, 0x6a4122, 0x9a6a35, 0xd8b65e, 0xb54a26, 0x2a2a30, 0xe8d8a0, 0x7a2a1a];
export const DYED_HAIR = [0xf06aa8, 0x3a8af0, 0x3ac07a, 0x9a5af0, 0xf0f0f0, 0x2ad0d0, 0xf07a2a];
export const GREY_HAIR = [0xd8d8d8, 0xbdbdbd, 0xeeeeee, 0x9a9a9a];
const BRIGHT = [0xd8443a, 0x3a6fd8, 0x3aa65a, 0xe0b030, 0x8a4ad8, 0xf07a2a, 0x2ab0b0, 0xe06aa0, 0x6b8e23];
const SHIRTS = [0xe8ecf2, 0xd8e4f0, 0xf2e8d0, 0xc8d8c0, 0xe0c8c8, 0x9ab0d0];
const DENIM = [0x2f4f9a, 0x2a4585, 0x355ba8];
const DARK = [0x2a2a30, 0x1e2433, 0x3a3030, 0x2e3a2e];
const SHOES = [0x1a1a1e, 0x4a3020, 0x5a3a24, 0x222228];

const GOLD_C = 0xe8b830;
export const EYE_COLORS = [0x3a2414, 0x3a2414, 0x2a1a10, 0x4a3a20, 0x3a5a8a, 0x4a7aa8, 0x3a6a4a, 0x5a5a6a];

/** Jobs this builder knows a look for. Unknown jobs (new ones added to JOBS) fall back to a townie. */
export type JobName = Job | 'Cop' | 'Construction Worker' | 'Townie';

/** The look each job starts from. The rng fills in hair, skin, and small variations. */
const JOB_LOOKS: Partial<Record<JobName, (r: Rng) => Partial<PersonSpec>>> = {
  Farmhand: (r) => ({
    outfit: 'overalls', hat: r() < 0.8 ? 'straw' : 'cap', hatColor: 0xc23a2a,
    top: pick(r, [0xe8ecf2, 0xd8e4f0, 0xc84a3a, 0xe8d8b0]), accent: pick(r, DENIM), bottoms: pick(r, DENIM),
    shoes: pick(r, [0x1a1a1e, 0x5a3a24]), held: r() < 0.5 ? 'pitchfork' : 'none',
  }),
  Mechanic: (r) => ({
    outfit: 'coveralls', hat: r() < 0.6 ? 'capBack' : 'none', hatColor: pick(r, [0xc23a2a, 0x2a2a30, 0x2a5ac2]),
    top: pick(r, [0x50607a, 0x3d4a5e, 0x6a6a5a, 0x2f4f7a]), accent: 0xf2f2f2, held: r() < 0.6 ? 'wrench' : 'none',
    shoes: 0x1a1a1e, facial: r() < 0.4 ? 'stubble' : 'none',
  }),
  'Mail Carrier': (r) => ({
    outfit: 'mail', hat: r() < 0.7 ? 'cap' : 'none', hatColor: 0x2a3a6a, top: 0x9cc0e8, accent: 0x7a5232,
    bottoms: 0x2a3a6a, lower: r() < 0.6 ? 'shorts' : 'pants', shoes: 0x1a1a1e, held: r() < 0.5 ? 'parcel' : 'none',
  }),
  Retiree: (r) => ({
    outfit: r() < 0.5 ? 'cardigan' : 'hawaiian', hat: r() < 0.35 ? 'flatcap' : 'none', hatColor: 0x6a5a48,
    top: pick(r, [0x8a5a6a, 0x6a7a5a, 0xc0a070, 0x5a7aa0, 0x2ab0b0, 0xe07040]), accent: pick(r, SHIRTS),
    bottoms: pick(r, [0xb8a888, 0x6a6a6a, 0x8a7a5a]), glasses: r() < 0.7 ? 'round' : 'none',
    held: r() < 0.55 ? 'cane' : 'none', age: 'elder', lower: r() < 0.2 ? 'shorts' : 'pants',
  }),
  Banker: (r) => ({
    outfit: 'suit', top: pick(r, DARK), accent: pick(r, [0xb02a2a, 0x2a4ab0, 0x2a8a4a, 0xc0a030]),
    bottoms: 0, hairStyle: pick(r, ['slick', 'short', 'bun'] as const), held: r() < 0.6 ? 'briefcase' : 'none', shoes: 0x1a1a1e,
  }),
  Teen: (r) => ({
    outfit: 'hoodie', age: 'teen', hat: r() < 0.4 ? 'beanie' : 'none', hatColor: pick(r, BRIGHT),
    top: pick(r, [...BRIGHT, 0x3a3a3a, 0x8a8a8a]), accent: 0xf2f2f2, bottoms: pick(r, [...DENIM, 0x2a2a2a]),
    shoes: pick(r, [0xf2f2f2, 0xd83a2a, 0x2a2a2a]), held: r() < 0.6 ? 'phone' : 'none',
    hairStyle: pick(r, ['spiky', 'mohawk', 'long', 'short', 'pony', 'curly'] as const),
  }),
  Dentist: (r) => ({
    outfit: 'labCoat', hat: r() < 0.6 ? 'headMirror' : 'none', top: 0xf4f6f8, accent: pick(r, [0x6ab0d0, 0x8ac0a0, 0xc0a0d0]),
    bottoms: pick(r, [0x4a7a9a, 0x3a3a48]), glasses: r() < 0.4 ? 'round' : 'none', held: r() < 0.5 ? 'toothbrush' : 'none',
  }),
  'Diner Cook': (r) => ({
    outfit: 'cook', hat: r() < 0.7 ? 'chef' : 'none', top: 0xf4f4f0, accent: 0xe8e4dc, bottoms: pick(r, [0x2a2a30, 0x5a5a60]),
    build: r() < 0.5 ? 'heavy' : 'average', facial: r() < 0.4 ? 'mustache' : 'none', held: r() < 0.6 ? 'spatula' : 'none',
  }),
  'Insurance Salesman': (r) => ({
    outfit: 'loudSuit', top: pick(r, [0xa8823a, 0x8a6a3a, 0x7a8a4a, 0x9a5a3a]), accent: pick(r, BRIGHT),
    bottoms: 0, hairStyle: pick(r, ['slick', 'ring', 'short'] as const), facial: r() < 0.5 ? 'mustache' : 'none',
    held: r() < 0.7 ? 'briefcase' : 'none', shoes: 0x4a3020,
  }),
  Pastor: (r) => ({
    outfit: 'clergy', top: 0x1e1e24, accent: 0xf8f8f8, bottoms: 0x1e1e24, held: r() < 0.6 ? 'book' : 'none',
    glasses: r() < 0.4 ? 'round' : 'none', shoes: 0x1a1a1e,
  }),
  'Crossing Guard': (r) => ({
    outfit: 'hiVis', hat: r() < 0.6 ? 'cap' : 'none', hatColor: 0xff7a1a, top: pick(r, SHIRTS), accent: pick(r, [0xd8f02a, 0xff7a1a]),
    bottoms: pick(r, [0x2a3a5a, 0x3a3a3a]), held: r() < 0.8 ? 'stopSign' : 'none',
    age: r() < 0.5 ? 'elder' : 'adult',
  }),
  Influencer: (r) => ({
    outfit: 'trendy', glasses: r() < 0.7 ? 'sun' : 'none', hat: r() < 0.25 ? 'visor' : 'none', hatColor: 0xf2f2f2,
    top: pick(r, [0xf06aa8, 0xb07af0, 0x2ad0c0, 0xf2e040]), accent: 0xf2f2f2, bottoms: pick(r, [0xf2f2f2, 0x2a2a2a, 0xe0c0e0]),
    lower: pick(r, ['pants', 'shorts', 'skirt'] as const), shoes: pick(r, [0xf2f2f2, 0xf06aa8]), held: 'phone',
    hairStyle: pick(r, ['long', 'bun', 'pony', 'slick', 'curly'] as const),
  }),
  Cop: (r) => ({
    outfit: 'police', hat: r() < 0.8 ? 'police' : 'none', hatColor: 0x1e2a4a, top: pick(r, [0x2a3a6a, 0x24304e]), accent: GOLD_C,
    bottoms: 0x1e2a4a, shoes: 0x111114, glasses: r() < 0.35 ? 'sun' : 'none', facial: r() < 0.45 ? 'mustache' : 'none',
    held: r() < 0.5 ? 'donut' : 'none', build: pick(r, ['average', 'heavy', 'heavy'] as const),
  }),
  'Construction Worker': (r) => ({
    outfit: 'construction', hat: 'hardhat', hatColor: pick(r, [0xf2c230, 0xf2c230, 0xf07a2a, 0xf2f2f2]), top: pick(r, [0xe8ecf2, 0x8a8a8a, 0x6a8ab0]),
    accent: pick(r, [0xff7a1a, 0xd8f02a]), bottoms: pick(r, DENIM), shoes: 0x8a5a2a, held: r() < 0.6 ? 'hammer' : 'none',
    build: pick(r, ['average', 'heavy'] as const), facial: r() < 0.4 ? pick(r, ['stubble', 'beard'] as const) : 'none',
  }),
  // Airport staff (src/places/airport).
  Pilot: (r) => ({
    outfit: 'suit', hat: 'police', hatColor: 0x1e2a4a, top: 0x1e2a4a, accent: GOLD_C, bottoms: 0x1e2a4a, shoes: 0x111114,
    glasses: r() < 0.5 ? 'sun' : 'none', held: r() < 0.4 ? 'briefcase' : 'none', hairStyle: pick(r, ['slick', 'short', 'buzz'] as const),
  }),
  'Flight Attendant': (r) => ({
    outfit: 'suit', top: pick(r, [0xb02a2a, 0x2a4ab0]), accent: 0xf2f2f2, bottoms: pick(r, [0xb02a2a, 0x1e2a4a]),
    lower: r() < 0.5 ? 'skirt' : 'pants', hairStyle: pick(r, ['bun', 'bun', 'slick', 'bob'] as const), extras: ['scarf'], shoes: 0x111114,
  }),
  'TSA Agent': (r) => ({
    outfit: 'police', hat: 'none', top: pick(r, [0x4a6a9a, 0x5a7aa8]), accent: 0xc8c8d0, bottoms: 0x1e1e2a, shoes: 0x111114,
    build: pick(r, ['average', 'heavy', 'heavy'] as const), held: 'none', glasses: r() < 0.3 ? 'round' : 'none',
  }),
  'Baggage Handler': (r) => ({
    outfit: 'hiVis', hat: r() < 0.5 ? 'capBack' : 'none', hatColor: 0x2a2a30, top: pick(r, [0x3a3a3a, 0x2a3a5a]), accent: 0xff7a1a,
    bottoms: pick(r, DENIM), shoes: 0x8a5a2a, extras: ['headphones'], build: pick(r, ['average', 'buff', 'heavy'] as const),
  }),
  'Ground Crew': (r) => ({
    outfit: 'hiVis', hat: 'cap', hatColor: 0xff7a1a, top: pick(r, [0xe8ecf2, 0x8a8a8a]), accent: 0xd8f02a,
    bottoms: 0x3a3a3a, shoes: 0x1a1a1e, glasses: r() < 0.4 ? 'sun' : 'none',
  }),
  'Air Traffic Controller': (r) => ({
    outfit: pick(r, ['polo', 'sweaterVest'] as const), top: pick(r, [0x5a7aa0, 0x6a6a5a, 0x8a5a6a]), accent: pick(r, SHIRTS),
    bottoms: pick(r, [0x3a3a48, 0x6a6a6a]), extras: ['headphones'], glasses: r() < 0.6 ? 'round' : 'none', marks: ['eyebags'],
  }),
  // Prison and asylum (src/maps/institutions).
  Inmate: (r) => ({
    outfit: 'coveralls', hat: 'none', top: 0xf07a2a, accent: 0xf2f2f2, bottoms: 0xf07a2a, shoes: 0xf2f2f2, shoeStyle: 'sneakers',
    held: r() < 0.15 ? 'toothbrush' : 'none', marks: r() < 0.3 ? ['scar'] : [], facial: r() < 0.5 ? pick(r, ['stubble', 'goatee', 'beard'] as const) : 'none',
  }),
  'Prison Guard': (r) => ({
    outfit: 'police', hat: r() < 0.7 ? 'police' : 'none', hatColor: 0x2a2a30, top: 0x5a6a8a, accent: GOLD_C, bottoms: 0x1e2430,
    shoes: 0x111114, glasses: r() < 0.3 ? 'sun' : 'none', facial: r() < 0.4 ? 'mustache' : 'none', build: pick(r, ['average', 'heavy', 'buff'] as const),
  }),
  Warden: (r) => ({
    outfit: 'suit', top: 0x55575e, accent: 0xb02a2a, bottoms: 0, glasses: 'round', hairStyle: pick(r, ['ring', 'combover', 'slick'] as const),
    held: 'book', shoes: 0x2a1a10, facial: r() < 0.5 ? 'mustache' : 'none',
  }),
  Patient: (r) => ({
    outfit: 'casual', hat: 'none', top: 0xbcd8ec, accent: 0xbcd8ec, bottoms: 0xbcd8ec, shoes: 0xd8d8d8, shoeStyle: 'sandals',
    held: 'none', extras: [], hairStyle: pick(r, ['afro', 'long', 'spiky', 'curly', 'bald', 'mohawk', 'bun'] as const),
  }),
  Orderly: (r) => ({
    outfit: 'casual', hat: 'none', top: 0xf4f4f4, accent: 0xf4f4f4, bottoms: 0xf4f4f4, shoes: 0xf4f4f4, shoeStyle: 'sneakers',
    build: pick(r, ['buff', 'heavy'] as const), held: 'none',
  }),
  Nurse: (r) => ({
    outfit: 'casual', hat: 'none', top: 0x8fd0c0, accent: 0x8fd0c0, bottoms: 0x8fd0c0, shoes: 0xf4f4f4, shoeStyle: 'sneakers',
    held: r() < 0.4 ? 'book' : 'none', glasses: r() < 0.3 ? 'round' : 'none',
  }),
  Psychiatrist: (r) => ({
    outfit: 'labCoat', top: 0xf4f6f8, accent: 0x6a8ab0, bottoms: pick(r, [0x5a4a3a, 0x3a3a48]), glasses: 'round', held: 'book',
    facial: r() < 0.5 ? pick(r, ['beard', 'goatee'] as const) : 'none',
  }),
  // Smallville Grocery (src/places/grocery).
  Butcher: (r) => ({
    outfit: 'apron', top: pick(r, [0xf2f2f0, 0xe8e4dc]), accent: pick(r, [0x7a6a5a, 0x8a7a68, 0xf2f2f0]), bottoms: pick(r, [0x3a3a40, 0x4a4038]),
    shoes: 0x3a2418, shoeStyle: 'boots', facial: r() < 0.7 ? pick(r, ['handlebar', 'mustache', 'beard'] as const) : 'none',
    hairStyle: pick(r, ['bald', 'ring', 'buzz', 'short'] as const), build: pick(r, ['heavy', 'buff', 'average'] as const),
    extras: r() < 0.6 ? ['gloves'] : [], held: r() < 0.5 ? 'cleaver' : 'none', brows: 'thick',
  }),
  Stocker: (r) => ({
    outfit: 'polo', top: 0x2a7a4a, accent: 0xf2f2f2, bottoms: pick(r, [...DENIM, 0x6b5a3a]), hat: r() < 0.4 ? 'capBack' : 'none', hatColor: 0x2a7a4a,
    held: r() < 0.4 ? 'parcel' : 'none', shoeStyle: 'sneakers', age: r() < 0.5 ? 'teen' : 'adult',
  }),
  Cashier: (r) => ({
    outfit: 'vest', top: pick(r, SHIRTS), accent: 0x2a7a4a, bottoms: pick(r, [0x3a3a40, 0x2a2a30]), extras: r() < 0.4 ? ['earrings'] : [],
    hairStyle: pick(r, ['pony', 'bun', 'bob', 'short', 'curly', 'long'] as const),
  }),
  'Deli Clerk': (r) => ({
    outfit: 'apron', top: pick(r, [0x2a7a4a, 0xf2f2f0]), accent: 0xf2f2f0, bottoms: pick(r, [0x3a3a40, 0x2a2a30]), hat: r() < 0.6 ? 'cap' : 'none', hatColor: 0xf2f2f0,
    extras: r() < 0.5 ? ['gloves'] : [],
  }),
  'Produce Manager': (r) => ({
    outfit: 'apron', top: pick(r, [0xc84a3a, 0xe8d8b0, 0x6a8a4a]), accent: 0x2a7a4a, bottoms: pick(r, DENIM), hat: r() < 0.4 ? 'straw' : 'none',
    facial: r() < 0.5 ? pick(r, ['beard', 'mustache'] as const) : 'none', extras: r() < 0.4 ? ['suspenders'] : [],
  }),
  'Store Manager': (r) => ({
    outfit: r() < 0.5 ? 'sweaterVest' : 'polo', top: pick(r, [0x2a7a4a, 0x3a5a8a]), accent: pick(r, SHIRTS), bottoms: pick(r, [0x6b5a3a, 0x3a3a48]),
    glasses: r() < 0.5 ? 'round' : 'none', held: r() < 0.6 ? 'clipboard' : 'none', hairStyle: pick(r, ['combover', 'slick', 'short', 'bob'] as const),
  }),
  // City General Hospital (src/places/hospital).
  Doctor: (r) => ({
    outfit: 'labCoat', top: 0xf4f6f8, accent: pick(r, [0x3a6ab0, 0x8a3a4a, 0x3a8a6a]), bottoms: pick(r, [0x3a3a48, 0x5a5a68, 0x2a4a6a]),
    glasses: r() < 0.4 ? 'round' : 'none', held: r() < 0.4 ? 'clipboard' : 'none', extras: r() < 0.3 ? ['watch'] : [],
  }),
  Surgeon: (r) => ({
    outfit: 'scrubs', top: pick(r, [0x1e3a7a, 0x2a4a8a, 0x2a7a7a]), accent: 0x5ab0e0, bottoms: 0, hat: 'surgical', hatColor: pick(r, [0x1e3a7a, 0x5ab0e0]),
    extras: ['mask', ...(r() < 0.5 ? (['gloves'] as Extra[]) : [])], shoes: pick(r, [0x5ab0e0, 0xf2f2f2]), shoeStyle: 'sandals', brows: 'thick',
  }),
  EMT: (r) => ({
    outfit: 'police', top: pick(r, [0x2a3a5a, 0x1e2a3a]), accent: 0xd8dce0, bottoms: 0x1e2a3a, hat: r() < 0.3 ? 'cap' : 'none', hatColor: 0x1e2a3a,
    shoes: 0x111114, shoeStyle: 'boots', extras: ['gloves'],
  }),
  Firefighter: (r) => ({
    outfit: 'firefighter', top: pick(r, [0xc8a050, 0x2a2a2a]), accent: 0xe8e040, bottoms: 0, hat: 'fireHelmet', hatColor: pick(r, [0xc82a1a, 0xf2c230, 0x2a2a2a]),
    shoes: 0x111114, shoeStyle: 'boots', facial: r() < 0.5 ? pick(r, ['mustache', 'stubble'] as const) : 'none', held: r() < 0.4 ? 'axe' : 'none',
    build: pick(r, ['buff', 'average'] as const),
  }),
  Janitor: (r) => ({
    outfit: 'coveralls', top: pick(r, [0x5a6a7a, 0x6a6a5a, 0x3a5a7a]), accent: 0xf2f2f2, hat: r() < 0.4 ? 'cap' : 'none', hatColor: 0x3a3a40,
    held: r() < 0.6 ? 'mop' : 'none', shoes: 0x2a2a2a, age: r() < 0.4 ? 'elder' : 'adult',
  }),
  'Security Guard': (r) => ({
    outfit: 'police', top: pick(r, [0xe8ecf2, 0x3a3a40]), accent: 0xc0c0c8, bottoms: 0x1e1e24, hat: r() < 0.5 ? 'police' : 'none', hatColor: 0x1e1e24,
    shoes: 0x111114, build: pick(r, ['heavy', 'buff', 'average'] as const), glasses: r() < 0.3 ? 'sun' : 'none',
  }),
  Visitor: (r) => ({ outfit: pick(r, ['casual', 'jacket', 'cardigan', 'polo'] as const), held: r() < 0.3 ? 'book' : 'none' }),
};


/** A random but job-appropriate townsperson. Pass `age` to force one (for the age variants). */
const TOWNIE_OUTFITS: Outfit[] = ['casual', 'casual', 'tank', 'polo', 'sweaterVest', 'tracksuit', 'jacket', 'dress', 'graphicTee', 'plaid', 'plaid', 'stripes', 'hawaiian', 'hoodie', 'cardigan', 'vest', 'vest', 'gown', 'robe', 'swim'];
const TOWNIE_HATS: Hat[] = ['cap', 'capBack', 'beanie', 'cowboy', 'cowboy', 'bucket', 'beret', 'bandana', 'visor', 'flatcap', 'bow', 'tophat', 'party'];
const ALL_HAIR: HairStyle[] = ['short', 'short', 'spiky', 'slick', 'long', 'bun', 'pony', 'mohawk', 'curly', 'afro', 'bob', 'pigtails', 'buzz', 'braids', 'topknot', 'bald'];
const EYES: Eyes[] = ['tall', 'tall', 'tall', 'dot', 'wide', 'sleepy', 'small', 'lashes', 'angry'];
const BROWS: Brows[] = ['thin', 'thin', 'thin', 'thick', 'thick', 'thick', 'angry', 'worried', 'uni'];
const MOUTHS: Mouth[] = ['none', 'none', 'none', 'none', 'smile', 'smile', 'flat', 'frown', 'teeth', 'open', 'smirk'];

/** Pick each item independently with its own chance. */
function some<T>(r: Rng, table: [T, number][]): T[] {
  return table.filter(([, p]) => r() < p).map(([t]) => t);
}

/** A random but job-appropriate townsperson. Pass `age`, `build` or `sex` to force them. */
export function specForJob(job: JobName | string, rng: Rng, age?: Age, build?: Build, sex?: Sex): PersonSpec {
  const r = rng;
  const isTownie = !JOB_LOOKS[job as JobName];
  const base: PersonSpec = {
    seed: Math.floor(r() * 1e9),
    job: job as JobName,
    age: 'adult',
    build: pick(r, ['slim', 'average', 'average', 'heavy', 'buff'] as const),
    stature: pick(r, ['short', 'normal', 'normal', 'tall'] as const),
    skin: r() < 0.15 ? pick(r, SKINS_RARE) : pick(r, SKINS),
    hair: r() < 0.08 ? pick(r, DYED_HAIR) : pick(r, HAIR),
    hairStyle: pick(r, ALL_HAIR),
    facial: r() < 0.3 ? pick(r, ['mustache', 'beard', 'stubble', 'goatee', 'handlebar', 'chinstrap', 'soulPatch'] as const) : 'none',
    eyes: pick(r, EYES),
    brows: pick(r, BROWS),
    mouth: pick(r, MOUTHS),
    marks: some(r, [['freckles', 0.15], ['blush', 0.1], ['mole', 0.08], ['eyebags', 0.08], ['scar', 0.04], ['bandage', 0.04], ['eyepatch', 0.015]]),
    extras: some(r, [['earrings', 0.15], ['watch', 0.2], ['chain', 0.06], ['necklace', 0.07], ['scarf', 0.06], ['bowtie', 0.04], ['backpack', 0.07], ['fannypack', 0.05], ['headphones', 0.05], ['flower', 0.04]]),
    glasses: r() < 0.15 ? 'round' : r() < 0.05 ? 'sun' : 'none',
    hat: isTownie && r() < 0.35 ? pick(r, TOWNIE_HATS) : 'none',
    hatColor: pick(r, [...BRIGHT, ...DARK, 0x8a6a4a, 0xf2f2f2]),
    outfit: isTownie ? pick(r, TOWNIE_OUTFITS) : 'casual',
    top: pick(r, [...BRIGHT, ...SHIRTS, ...DARK]),
    accent: pick(r, [...BRIGHT, 0xf2f2f2, 0x2a2a30]),
    bottoms: pick(r, [...DENIM, 0x6b5a3a, 0x3b3b3b, 0x8a8a6a, 0xb8a888, 0x5a2a2a]),
    shoes: pick(r, [...SHOES, ...BRIGHT, 0xf2f2f2]),
    shoeStyle: pick(r, ['shoes', 'shoes', 'sneakers', 'sneakers', 'boots', 'sandals'] as const),
    lower: r() < 0.15 ? 'shorts' : r() < 0.12 ? 'skirt' : 'pants',
    held: 'none',
    expression: 'normal',
    eyeColor: pick(r, EYE_COLORS),
  };
  if (base.outfit === 'dress') base.lower = r() < 0.6 ? 'skirt' : 'gown';
  if (base.outfit === 'gown' || base.outfit === 'robe') base.lower = 'gown';
  if (base.outfit === 'gown') {
    base.hairStyle = pick(r, ['long', 'bun', 'bob', 'braids', 'curly'] as const);
    if (r() < 0.4) base.hat = 'tiara';
    base.facial = 'none';
  }
  if (base.outfit === 'robe') {
    base.top = pick(r, [0xf2f0ea, 0xe8e0d0, 0x8a3a2a, 0x3a3a48]);
    base.accent = pick(r, [0x3a2018, 0x2a2a30, 0xc8a040]);
    base.shoeStyle = 'sandals';
  }
  if (base.outfit === 'swim') {
    base.lower = 'shorts';
    base.shoeStyle = 'sandals';
    base.hat = r() < 0.3 ? 'bucket' : 'none';
    base.extras = base.extras.filter((e) => e === 'watch' || e === 'necklace' || e === 'chain');
  }
  if (base.outfit === 'vest' && r() < 0.5) base.extras.push('bandana');
  if (base.outfit === 'plaid' && r() < 0.4) base.extras.push('suspenders');
  if (base.accent === base.top) base.accent = 0xf2f2f2;
  if (base.hair === 0) base.hair = 0x1c1410;
  const look = JOB_LOOKS[job as JobName]?.(r) ?? {};
  const spec: PersonSpec = { ...base, ...look };
  if (spec.bottoms === 0) spec.bottoms = spec.top; // matching suit trousers
  // Uniforms come with trousers unless the job says otherwise.
  if (!isTownie && look.lower === undefined && spec.outfit !== 'dress') spec.lower = 'pants';
  if (spec.lower === 'gown' && spec.outfit !== 'gown' && spec.outfit !== 'robe' && spec.outfit !== 'dress') spec.lower = 'pants';
  if (look.shoes === undefined && spec.shoeStyle === 'sneakers' && !isTownie) spec.shoeStyle = 'shoes';
  // Hats and hair that fight each other.
  if (spec.hat !== 'none' && ['afro', 'mohawk', 'pigtails', 'topknot', 'bun'].includes(spec.hairStyle) && spec.hat !== 'bow' && spec.hat !== 'headMirror')
    spec.hairStyle = pick(r, ['short', 'long', 'curly', 'bob'] as const);
  // Uniformed jobs don't wear backpacks, fanny packs or bow ties to work.
  if (!['Townie', 'Teen', 'Influencer', 'Retiree', 'Mail Carrier'].includes(spec.job))
    spec.extras = spec.extras.filter((e) => e !== 'backpack' && e !== 'fannypack' && e !== 'bowtie');
  if (spec.extras.includes('headphones') && spec.hat !== 'none') spec.extras = spec.extras.filter((e) => e !== 'headphones');
  if (age) spec.age = age;
  if (build) spec.build = build;
  if (spec.age === 'elder') {
    spec.hair = pick(r, GREY_HAIR);
    if (r() < 0.5) spec.hairStyle = pick(r, ['ring', 'bald', 'short', 'bun', 'combover', 'buzz'] as const);
    if (spec.brows === 'none' || spec.brows === 'thin') spec.brows = 'thick';
    if (spec.build === 'buff' && r() < 0.7) spec.build = 'average';
    if (r() < 0.4 && !spec.marks.includes('eyebags')) spec.marks.push('eyebags');
  }
  if (spec.age === 'child') {
    spec.facial = 'none';
    spec.build = r() < 0.3 ? 'heavy' : 'slim';
    if (spec.held === 'briefcase' || spec.held === 'cane') spec.held = 'none';
    spec.extras = spec.extras.filter((e) => e !== 'chain' && e !== 'bowtie' && e !== 'watch');
    if (spec.mouth === 'none' && r() < 0.5) spec.mouth = 'smile';
  }
  if (spec.age === 'teen') {
    if (spec.facial !== 'none' && spec.facial !== 'stubble') spec.facial = 'none';
    if (r() < 0.25) spec.hair = pick(r, DYED_HAIR);
    if (r() < 0.5) spec.shoeStyle = 'sneakers';
  }
  if (spec.hairStyle === 'pigtails' || spec.hairStyle === 'braids') if (spec.facial === 'beard') spec.facial = 'none';
  spec.sex = sex ?? (r() < 0.5 ? 'm' : 'f');
  return fitSex(spec, r);
}

/**
 * Make the styling agree with the person's sex (and so with their name): no beards or gowns on
 * one side, longer hair, lashes and dresses more often on the other. Job uniforms stay as they are.
 */
export function fitSex(spec: PersonSpec, r: Rng): PersonSpec {
  const child = spec.age === 'child';
  if (spec.sex === 'm') {
    if (spec.eyes === 'lashes') spec.eyes = 'tall';
    if (spec.outfit === 'dress' || spec.outfit === 'gown') spec.outfit = pick(r, ['casual', 'polo', 'vest', 'jacket'] as const);
    if (spec.lower === 'skirt' || (spec.lower === 'gown' && spec.outfit !== 'robe')) spec.lower = 'pants';
    if (spec.hat === 'tiara' || spec.hat === 'bow') spec.hat = 'none';
    if (['pigtails', 'braids', 'bun', 'bob'].includes(spec.hairStyle)) spec.hairStyle = pick(r, ['short', 'spiky', 'slick', 'curly', 'buzz'] as const);
    if (spec.extras.includes('earrings') && r() < 0.6) spec.extras = spec.extras.filter((e) => e !== 'earrings');
    if (spec.extras.includes('flower')) spec.extras = spec.extras.filter((e) => e !== 'flower');
  } else {
    spec.facial = 'none';
    if (['bald', 'ring', 'combover', 'buzz', 'mohawk'].includes(spec.hairStyle) || (r() < (child ? 0.5 : 0.85) && ['short', 'spiky', 'slick'].includes(spec.hairStyle)))
      spec.hairStyle = spec.age === 'elder' ? pick(r, ['bun', 'bob', 'curly', 'short'] as const) : pick(r, ['long', 'bob', 'pony', 'bun', 'curly', 'braids'] as const);
    if (!child && spec.eyes !== 'sleepy' && r() < 0.85) spec.eyes = 'lashes';
    if (spec.brows === 'thick' || spec.brows === 'uni') spec.brows = 'thin';
    if (!child && spec.job === 'Townie' && spec.outfit === 'casual' && r() < 0.25) {
      spec.outfit = 'dress';
      spec.lower = r() < 0.6 ? 'skirt' : 'gown';
    }
    if (!child && r() < 0.2 && !spec.extras.includes('earrings')) spec.extras.push('earrings');
  }
  return spec;
}

/** Apply a victim's mental and physical stats to how they look. */
export function applyStats(spec: PersonSpec, physical?: string, mental?: string) {
  if (physical === 'Athlete' && spec.age !== 'child') spec.build = spec.age === 'elder' ? 'average' : 'buff';
  if (physical === 'Feeble') {
    spec.build = spec.build === 'heavy' ? 'heavy' : 'slim';
    if (spec.age !== 'child' && !spec.marks.includes('eyebags')) spec.marks.push('eyebags');
  }
  if (mental === 'Depressed') {
    spec.mouth = 'frown';
    spec.brows = 'worried';
    if (!spec.marks.includes('eyebags')) spec.marks.push('eyebags');
    if (spec.eyes === 'wide' || spec.eyes === 'angry') spec.eyes = 'tall';
  }
  if (mental === 'Medicated') {
    spec.eyes = 'sleepy';
    spec.mouth = 'smile';
    spec.brows = spec.brows === 'angry' ? 'thin' : spec.brows;
  }
  return spec;
}

/** Bucket a real age into the four body types. */
export function ageGroup(years: number): Age {
  return years < 13 ? 'child' : years < 20 ? 'teen' : years < 65 ? 'adult' : 'elder';
}

/**
 * Build a spec from a victim's scythe-vision file, so how someone looks matches what their file
 * says. `physical` (Feeble / Normal / Athlete) and
 * `mental` (Depressed / Normal / Medicated) show on the body and face.
 */
export function specFromFile(file: { job: string; age: number; physical?: string; mental?: string; name?: string; sex?: Sex }, seed?: number): PersonSpec {
  let h = seed ?? 0;
  for (const ch of (file.name ?? '') + file.job + file.age) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  const rng = mulberry32(h);
  const sex = (file as { sex?: Sex }).sex ?? sexOfName(file.name ?? '');
  return applyStats(specForJob(file.job, rng, ageGroup(file.age), undefined, sex), file.physical, file.mental);
}

/** The handful of fields an older Appearance carries (see character.ts). */
interface AppearanceLike {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
  hairStyle: number;
  hat: number | null;
  glasses: boolean;
  beard: boolean;
  width: number;
  mouth: number;
}

/**
 * Translate an old box-person Appearance into a full spec, keeping its colors, so scripted actors
 * (lifeguards, drivers, statues...) look like everyone else. Details the Appearance doesn't say
 * are picked from a seed made of its colors, so the same Appearance always builds the same person.
 */
export function specFromAppearance(a: AppearanceLike): PersonSpec {
  let h = 7;
  for (const v of [a.skin, a.hair, a.shirt, a.pants, a.shoes, a.hairStyle, a.hat ?? 1, a.mouth, Math.round(a.width * 100)]) h = (Math.imul(h, 31) + v) | 0;
  const rng = mulberry32(h);
  const spec = specForJob('Townie', rng, 'adult', undefined, a.beard ? 'm' : undefined);
  spec.skin = a.skin;
  spec.hair = a.hair;
  spec.top = a.shirt;
  spec.bottoms = a.pants;
  spec.shoes = a.shoes;
  spec.hairStyle = (['bald', 'short', 'spiky', 'mohawk', 'long'] as const)[a.hairStyle] ?? 'short';
  spec.hat = a.hat === null ? 'none' : 'cap';
  spec.hatColor = a.hat ?? spec.hatColor;
  spec.glasses = a.glasses ? 'round' : 'none';
  spec.facial = a.beard ? 'beard' : spec.facial === 'beard' ? (spec.sex === 'm' ? 'stubble' : 'none') : spec.facial;
  spec.mouth = (['flat', 'smile', 'open', 'teeth'] as const)[a.mouth] ?? 'none';
  spec.build = a.width < 1 ? 'slim' : a.width < 1.25 ? 'average' : 'heavy';
  // A plain tee in the shirt color reads closest to the old box people.
  if (!['casual', 'polo', 'tank', 'hoodie', 'jacket', 'plaid', 'stripes', 'graphicTee', 'vest'].includes(spec.outfit)) spec.outfit = 'casual';
  if (spec.accent === spec.top) spec.accent = 0xf2f2f2;
  spec.lower = 'pants';
  spec.held = 'none';
  return spec;
}
