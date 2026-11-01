import { G, box, type TownInfo } from '../../town';
import { B } from '../../voxel';
import { voxelNav } from '../nav';
import type { LifeMap, LifePlace, V3 } from '../types';

const v = (x: number, z: number): V3 => ({ x, y: G, z });

/** Homes in buildTown(): [x0, z0, door side]. Each house is 10 x 9. */
const HOUSES: [number, number, 'n' | 'e' | 'w'][] = [
  [62, 8, 'e'],
  [62, 56, 'e'],
  [90, 8, 'w'],
  [90, 58, 'w'],
  [18, 88, 'n'],
  [34, 88, 'n'],
  [140, 60, 'w'],
];

const SURNAMES = ['Pruitt', 'Kowalski', 'McGee', 'Dinkel', 'Snodgrass', 'Plunkett', 'Wiggins'];

function homes(): LifePlace[] {
  return HOUSES.map(([x0, z0, side], i) => {
    const x1 = x0 + 9, z1 = z0 + 8;
    const cx = Math.floor((x0 + x1) / 2), cz = Math.floor((z0 + z1) / 2);
    const door = side === 'e' ? v(x1 + 1.5, cz + 1) : side === 'w' ? v(x0 - 0.5, cz + 1) : v(cx + 1, z0 - 0.5);
    return {
      id: `house${i + 1}`,
      name: `the ${SURNAMES[i]} place`,
      kind: 'home',
      door,
      inside: box(x0 + 1, G, z0 + 1, x1 - 1, G, z1 - 1),
      residents: i === 6 ? 1 : 2 + (i % 2),
    };
  });
}

/**
 * Smallville as the life system sees it, built from the town the game already makes.
 * When the town is rebuilt bigger, this is the file to update (or replace with the
 * town's own `pois`).
 */
export function smallvilleLife(town: TownInfo): LifeMap {
  const a = town.areas;
  const places: LifePlace[] = [
    ...homes(),
    {
      id: 'diner',
      name: 'Smallville Diner',
      kind: 'food',
      door: v(86.5, 95.5),
      inside: box(89, G, 91, 99, G, 101),
      counter: v(95, 94.6),
      staffSpots: [v(93.5, 99), v(96.5, 99.5)],
      spots: [v(90.5, 92.5), v(90.5, 99.5), v(98.5, 92.5), v(98.5, 100.5), v(93, 92.5), v(96, 92.5)],
      jobs: ['Diner Cook'],
      hours: [6, 22],
      sells: [
        { item: 'coffee', price: 2 },
        { item: 'slice of pie', price: 4 },
        { item: 'peanut butter cookie', price: 1 },
        { item: 'meatloaf', price: 9 },
        { item: 'grilled cheese', price: 6 },
      ],
      lines: ['Order up!', 'Pie is fresh today. Fresh-ish.', 'Cookies are peanut butter, FYI.'],
      capacity: 9,
    },
    {
      id: 'garage',
      name: "Duke's Garage",
      kind: 'shop',
      door: v(68, 97.5),
      inside: box(59, G, 93, 65, G, 100),
      counter: v(62, 98),
      staffSpots: [v(56, 99.5)],
      jobs: ['Mechanic'],
      hours: [8, 18],
      sells: [
        { item: 'air freshener', price: 3 },
        { item: 'blinker fluid', price: 12 },
        { item: 'oil change', price: 49 },
        { item: 'jug of "sports drink"', price: 5 },
      ],
      lines: ["That'll buff right out.", 'Cash only. Card machine got antifreeze in it.'],
    },
    {
      id: 'station',
      name: 'Smallville Police Station',
      kind: 'civic',
      door: v(62, 66.5),
      inside: box(48, G, 62, 58.5, G, 70.5),
      staffSpots: [v(50.5, 64.6), v(55, 69)],
      jobs: ['Cop'],
      allowedJobs: ['Cop'],
      patrol: [v(74, 66), v(74.5, 86), v(86, 86), v(86, 74), v(74.5, 74), v(62, 66.5)],
    },
    {
      id: 'farm',
      name: 'Hoffman Farm',
      kind: 'work',
      door: v(124, 110),
      inside: box(102, G, 86, 126, G, 134),
      jobs: ['Farmhand'],
      hours: [5, 20],
    },
    {
      id: 'barn',
      name: 'Hoffman Barn',
      kind: 'work',
      door: v(137, 110),
      inside: box(130, G, 98, 144, G, 106),
      jobs: ['Farmhand'],
      allowedJobs: ['Farmhand'],
    },
    {
      id: 'tower',
      name: 'Water Tower Job Site',
      kind: 'work',
      door: v(100, 50),
      inside: box(96, G, 26, 139, G, 58),
      jobs: ['Construction Worker'],
      hours: [6, 18],
    },
    {
      id: 'lot',
      name: 'Construction Lot',
      kind: 'work',
      door: v(132, 72),
      inside: box(a.construction.min.x, G, a.construction.min.z, a.construction.max.x, G, a.construction.max.z),
      jobs: ['Construction Worker'],
      hours: [6, 18],
    },
    {
      id: 'crossing',
      name: 'Main Street crossing',
      kind: 'civic',
      door: v(75.5, 75.5),
      staffSpots: [v(75.6, 75.6)],
      jobs: ['Crossing Guard'],
    },
    {
      id: 'mail',
      name: 'the mail route',
      kind: 'civic',
      door: v(86, 74),
      jobs: ['Mail Carrier'],
    },
    {
      id: 'park',
      name: 'Smallville Park',
      kind: 'park',
      door: v(40.5, 72),
      inside: box(18, G, 18, 62, G, 57),
      spots: [v(39.5, 45), v(41.5, 52), v(25, 40.5), v(55, 40.5), v(48, 33)],
    },
    {
      id: 'oak',
      name: 'the Big Oak',
      kind: 'attraction',
      door: v(37, 37),
      inside: box(23, G, 23, 38, G, 38),
    },
    {
      id: 'watertower',
      name: 'the water tower',
      kind: 'attraction',
      door: v(90, 46),
      inside: box(86, G, 40, 98, G, 52),
    },
    {
      id: 'woods',
      name: 'Whisper Woods',
      kind: 'park',
      door: v(30, 104),
      inside: box(8, G, 108, 50, G, 140),
    },
    {
      id: 'tracks',
      name: 'the rail crossing',
      kind: 'attraction',
      door: v(80, 144),
      inside: box(70, G, 140, 90, G, 144),
    },
  ];
  return {
    id: 'smallville',
    name: 'Smallville',
    nav: voxelNav(town.world, { maxFloor: G, maxStep: 0.5, avoid: [B.Hay] }),
    places,
    population: {
      jobs: ['Retiree', 'Teen', 'Retiree', 'Influencer', 'Teen', 'Insurance Salesman', 'Banker', 'Dentist', 'Pastor'],
      people: [
        { job: 'Diner Cook', work: 'diner', shift: [6, 15] },
        { job: 'Diner Cook', work: 'diner', shift: [13, 22] },
        { job: 'Mechanic', work: 'garage', name: 'Duke Puckett' },
        { job: 'Cop', work: 'station' },
        { job: 'Cop', work: 'station' },
        { job: 'Farmhand', work: 'farm' },
        { job: 'Farmhand', work: 'farm' },
        { job: 'Farmhand', work: 'barn' },
        { job: 'Construction Worker', work: 'tower' },
        { job: 'Construction Worker', work: 'lot' },
        { job: 'Crossing Guard', work: 'crossing' },
        { job: 'Mail Carrier', work: 'mail' },
        { job: 'Insurance Salesman', lines: ["I sell Mortalis policies. I don't have one, obviously."] },
        { job: 'Retiree' },
        { job: 'Retiree' },
        { job: 'Teen' },
        { job: 'Teen' },
        { job: 'Influencer' },
      ],
      count: 24,
    },
    spawns: [v(75.5, 3), v(3, 75.5), v(156, 84.5)],
    smallTalk: [
      'Hoffman says the fence is on again. Do NOT pee on it.',
      "Duke keeps antifreeze in a juice jug. Who does that?",
      'The 4:15 train never slows down for the crossing.',
      'Kids keep climbing that big oak. Somebody\'s gonna fall.',
      'The water tower has been empty for years. Nobody fixed it.',
    ],
  };
}

/** How townsfolk describe each death when they gossip about it. */
const DEATH_GOSSIP: Record<string, string> = {
  treehouse: 'fell out of the big oak',
  antifreeze: "drank Duke's antifreeze",
  shocking: 'peed on the electric fence',
  pancake: 'got flattened by a hay bale',
  watertower: 'long-jumped off the water tower',
  fungus: 'ate a mushroom in the woods',
  train: 'got hit by the train',
  faceplant: 'fell on their face from way up high',
  edge: 'walked off the edge of the world',
  beatdown: 'got beaten up by the cops',
  taser: 'tased themselves to death',
  baled: 'climbed into the hay baler',
  peanut: 'ate a peanut butter cookie. With the allergy',
};

export function deathGossip(id: string, name: string) {
  return DEATH_GOSSIP[id] ?? `died. "${name}", they're calling it`;
}
