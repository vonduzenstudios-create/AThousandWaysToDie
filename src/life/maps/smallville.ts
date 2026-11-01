import { G, box, type TownInfo } from '../../town';
import { B } from '../../voxel';
import { voxelNav } from '../nav';
import type { LifeMap, LifePlace, V3 } from '../types';

const v = (x: number, z: number): V3 => ({ x, y: G, z });

/**
 * Smallville as the life system sees it. The town layout (src/town.ts) lists its own
 * places in the LifePlace shape, so this only adds who lives here and what they gossip about.
 */
export function smallvilleLife(town: TownInfo): LifeMap {
  const places: LifePlace[] = [...town.places.map((p) => ({ ...p })), ...town.grocery.lifePlaces];
  // A couple of outdoor jobs that work the streets rather than a building.
  places.push(
    { id: 'crossing', name: 'the Main Street crossing', kind: 'civic', door: v(244.5, 245.5), staffSpots: [v(244.5, 245.5)], jobs: ['Crossing Guard'] },
    { id: 'farm', name: 'Hoffman Farm', kind: 'work', door: v(64, 200), inside: box(14, G, 156, 140, G, 232), jobs: ['Farmhand'], hours: [5, 20] },
  );
  return {
    id: 'smallville',
    name: 'Smallville',
    nav: voxelNav(town.world, { maxFloor: G, maxStep: 0.5, avoid: [B.Hay, B.Water, B.Corn, B.Grain, B.Rubber] }),
    places,
    population: {
      jobs: ['Retiree', 'Teen', 'Retiree', 'Influencer', 'Teen', 'Insurance Salesman', 'Banker', 'Dentist', 'Retiree', 'Teen', 'Influencer'],
      people: [
        { job: 'Diner Cook', work: 'diner', shift: [6, 15] },
        { job: 'Diner Cook', work: 'diner', shift: [13, 22] },
        { job: 'Waitress', work: 'diner' },
        { job: 'Mechanic', work: 'garage', name: 'Duke Puckett' },
        { job: 'Cop', work: 'police' },
        { job: 'Cop', work: 'police' },
        { job: 'Cop', work: 'police' },
        { job: 'Farmhand', work: 'farm' },
        { job: 'Farmhand', work: 'farm' },
        { job: 'Farmhand', work: 'barn' },
        { job: 'Farmhand', work: 'pasture' },
        { job: 'Construction Worker', work: 'construction' },
        { job: 'Construction Worker', work: 'construction' },
        { job: 'Crossing Guard', work: 'crossing' },
        { job: 'Mail Carrier', work: 'post-office' },
        { job: 'Pastor', work: 'church', name: 'Pastor Dale' },
        { job: 'Cashier', work: 'grocery' },
        { job: 'Cashier', work: 'grocery' },
        { job: 'Deli Clerk', work: 'grocery' },
        { job: 'Store Manager', work: 'grocery' },
        { job: 'Produce Manager', work: 'grocery' },
        { job: 'Butcher', work: 'grocery-backroom' },
        { job: 'Stocker', work: 'grocery-backroom' },
        { job: 'Cashier', work: 'gas-station' },
        { job: 'Cashier', work: 'hardware' },
        { job: 'Cashier', work: 'fireworks', name: 'Uncle Boomer' },
        { job: 'Librarian', work: 'library' },
        { job: 'Clerk', work: 'dmv' },
        { job: 'Teacher', work: 'school' },
        { job: 'Nurse', work: 'hospital' },
        { job: 'Doctor', work: 'hospital' },
        { job: 'Car Salesman', work: 'car-lot', name: 'Honest Al' },
        { job: 'Bartender', work: 'bar' },
        { job: 'Firefighter', work: 'fire-station' },
        { job: 'Baker', work: 'bakery' },
        { job: 'Conductor', work: 'train-station' },
        { job: 'Gravedigger', work: 'cemetery' },
        { job: 'Insurance Salesman', lines: ["I sell Mortalis policies. I don't have one, obviously."] },
      ],
      count: 70,
    },
    jobProfiles: town.grocery.jobProfiles,
    spawns: town.transit.map((s) => s.pos),
    smallTalk: [
      'Hoffman says the fence is on again. Do NOT pee on it.',
      'Gary kept antifreeze in his garage on Maple. Who does that?',
      'The express never slows down at the station. Never.',
      "Kids keep climbing that big oak. Somebody's gonna fall.",
      'The water tower has been empty for years. Nobody fixed it.',
      "Don't go near the goose pond. I'm serious.",
      'The quarry gate is locked, but people still find a way.',
      'Movers on Elm Street have had that piano up there all week.',
      'DMV line is down to eleven years. Progress.',
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
  silo: 'jumped into the grain silo',
  mule: 'tickled the mule from behind',
  bull: 'got launched by the Hoffman bull',
  geese: 'got mauled by the park geese',
  trampoline: 'bounced off a trampoline into the next life',
  shallowend: 'dove off the water tower into a kiddie pool',
  quarry: 'fell into the quarry',
  drowned: 'drowned',
  piano: 'got a piano dropped on them',
  tubeman: 'climbed into the tube man at the car lot',
  dmv: 'died waiting in line at the DMV',
  bookshelf: 'got crushed by library shelves',
  dryer: 'went through the big dryer at the laundromat',
  finale: 'sat on the Grand Finale',
  hotdog: 'choked on hot dogs at the church BBQ',
  pump: 'smoked a cigar at the gas pump',
  sushi: 'ate the gas station sushi',
  nailgun: 'played with the nail gun at the hardware store',
  bell: 'rang the church bell from the inside',
  bathtub: 'took a bath with a toaster',
  forktoast: 'stuck a fork in the toaster',
};

export function deathGossip(id: string, name: string) {
  return DEATH_GOSSIP[id] ?? `died. "${name}", they're calling it`;
}
