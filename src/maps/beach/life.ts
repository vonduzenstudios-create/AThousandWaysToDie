import type { JobProfile, LifeMap, LifePlace } from '../../life/types';
import type { VoxelWorld } from '../../voxel';
import { type BeachLayout, DECK, GL, SX, SZ } from './world';

const SHOP_INFO: Record<string, Partial<LifePlace>> = {
  steakhouse: { kind: 'food', jobs: ['Line Cook', 'Waiter'], hours: [11, 23], sells: [{ item: 'raw steak', price: 18 }, { item: 'surf & turf', price: 32 }], lines: ['Order up!', "Steak's still mooing, just how you like it."] },
  urgentcare: { kind: 'civic', jobs: ['Nurse', 'Doctor'], lines: ['Take a number.', 'Is that a jellyfish sting? Nobody pee on it.'] },
  motel: { kind: 'shop', jobs: ['Motel Clerk'], sells: [{ item: 'room key', price: 59 }], lines: ['Checkout is at eleven. Sharp.'] },
  hardware: { kind: 'shop', jobs: ['Clerk'], sells: [{ item: 'rope', price: 8 }, { item: 'duct tape', price: 6 }], lines: ['Aisle four.'] },
  lifeguardhq: { kind: 'work', jobs: ['Lifeguard'] },
  surfshop: { kind: 'shop', jobs: ['Surf Instructor'], hours: [8, 19], sells: [{ item: 'inner tube rental', price: 10 }, { item: 'board wax', price: 5 }], lines: ['Gnarly.', 'Tubes are ten bucks. Brochure is free. Careful, the paper is sharp.'] },
  fryshack: { kind: 'food', jobs: ['Fry Cook'], hours: [10, 22], sells: [{ item: 'jumbo fries', price: 12 }], lines: ["Don't hold those up in the air. I'm serious."] },
  scoops: { kind: 'shop', jobs: ['Ice Cream Vendor'], hours: [10, 22], sells: [{ item: 'cone', price: 4 }, { item: 'sundae', price: 7 }], lines: ['Two scoops minimum. House rules.'] },
  tikibar: { kind: 'bar', jobs: ['Bartender'], hours: [14, 2], sells: [{ item: 'mai tai', price: 11 }], lines: ['Another one?'] },
  arcade: { kind: 'attraction', jobs: ['Arcade Attendant'], hours: [11, 24], lines: ['Skee-ball machine three eats tokens.'] },
  giftshop: { kind: 'shop', jobs: ['Clerk'], sells: [{ item: 'snow globe', price: 15 }, { item: 'shell necklace', price: 9 }] },
  snackbar: { kind: 'food', jobs: ['Fry Cook'], hours: [9, 20], sells: [{ item: 'hot dog', price: 5 }, { item: 'soda', price: 3 }], lines: ['Lifeguards eat free. Union rules.'] },
  harbormaster: { kind: 'work', jobs: ['Harbor Master'] },
  subs: { kind: 'shop', jobs: ['Sub Rental Guy'], sells: [{ item: 'submarine', price: 5000 }], lines: ['No refunds. No questions. No warranty.'] },
  charters: { kind: 'shop', jobs: ['Boat Captain', 'Fisherman', 'Tour Guide'], sells: [{ item: 'charter ticket', price: 100 }, { item: 'whale tour ticket', price: 60 }], lines: ['Big ones bite after two.'] },
  ferry: { kind: 'transit', jobs: ['Deckhand'] },
  workshop: { kind: 'work', jobs: ['Mechanic'] },
  hangar: { kind: 'transit', jobs: ['Pilot'] },
};

/** NPC life data for Sandy Shores: walkable ground, places and who lives here. */
export function beachLife(world: VoxelWorld, L: BeachLayout): LifeMap {
  const water = L.water;
  const groundAt = (x: number, z: number) => world.topY(Math.floor(x), Math.floor(z));
  const walkable = (x: number, z: number) => {
    x = Math.floor(x);
    z = Math.floor(z);
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return false;
    const top = world.topY(x, z);
    if (!Number.isNaN(water[z * SX + x]) && top < 9) return false;
    // Standing space for a person.
    return !world.get(x, top, z) && !world.get(x, top + 1, z) && top >= GL - 2;
  };
  const places: LifePlace[] = [];
  for (const s of L.shops) {
    const info = SHOP_INFO[s.id] ?? { kind: 'shop' };
    places.push({ id: s.id, name: s.name, kind: info.kind ?? 'shop', door: s.door, inside: s.inside, staffSpots: [s.counter], ...info } as LifePlace);
  }
  L.houses.forEach((h, i) => places.push({ id: `cottage-${i}`, name: 'Beach Cottage', kind: 'home', door: h.door, inside: h.inside, residents: 1 + (i % 3) }));
  places.push({ id: 'beach', name: 'Sandy Shores Beach', kind: 'beach', door: { x: 340, y: GL, z: 210 }, inside: L.areas.beachWest, spots: L.towels.slice(0, 40), hours: [8, 20] });
  places.push({ id: 'beach-east', name: 'East Beach', kind: 'beach', door: { x: 480, y: GL, z: 210 }, inside: L.areas.beachEast, spots: L.towels.slice(40), hours: [8, 20] });
  places.push({ id: 'boardwalk', name: 'The Boardwalk', kind: 'park', door: { x: 330, y: DECK, z: 196 }, inside: L.areas.boardwalk, spots: L.benches });
  places.push({ id: 'pier', name: 'Sandy Shores Pier', kind: 'attraction', door: { x: 400, y: DECK, z: 212 }, inside: L.areas.pier, spots: [{ x: 397.5, y: DECK, z: 300 }, { x: 402.5, y: DECK, z: 340 }, { x: 397.5, y: DECK, z: 400 }, { x: 386, y: DECK, z: 460 }, { x: 414, y: DECK, z: 462 }] });
  places.push({ id: 'ferris', name: 'Ferris Wheel', kind: 'attraction', door: L.ferris, inside: { min: { x: 514, z: 190 }, max: { x: 536, z: 204 } } });
  places.push({ id: 'volleyball', name: 'Volleyball Court', kind: 'park', door: L.volleyball.center, inside: { min: { x: L.volleyball.x0 - 6, z: L.volleyball.z0 }, max: { x: L.volleyball.x0 - 2, z: L.volleyball.z1 } } });
  places.push({ id: 'bus', name: 'Sandy Shores Bus Stop', kind: 'transit', door: L.busStop });
  places.push({ id: 'harbor', name: 'Sandy Shores Harbor', kind: 'transit', door: { x: 690, y: GL, z: 215 }, inside: L.areas.harbor });
  places.push({ id: 'lighthouse', name: 'The Lighthouse', kind: 'attraction', door: { x: L.lighthouse.base.x, y: GL, z: L.lighthouse.base.z - 7 } });
  // The lifeguards walk the waterline between towers.
  const hq = places.find((p) => p.id === 'lifeguardhq');
  if (hq) hq.patrol = L.towers.map((t) => ({ x: t.x, y: GL, z: t.z - 9 }));

  const jobProfiles: JobProfile[] = [
    { job: 'Lifeguard', style: 'patrol', shift: [8, 19], likes: ['shop', 'food'], workLines: ['No running!', 'Stay inside the buoys!'], talkLines: ["Don't swim past the buoys. Seriously. There's stuff out there.", 'The red flag means rip current. Unless you work here.'] },
    { job: 'Surfer', style: 'none', likes: ['beach', 'bar', 'food'], talkLines: ['Duuude.', 'Waves are totally flat today, bro.', "Saw a fin out past the buoys. Probably a dolphin. Probably."] },
    { job: 'Tourist', style: 'none', likes: ['beach', 'attraction', 'shop', 'food'], talkLines: ['Where is the bathroom?', 'Is the water always this... chunky?', 'We came here from Smallville on the bus!'] },
    { job: 'Fisherman', style: 'roam', workKinds: ['attraction'], likes: ['bar'], talkLines: ['The big marlin only bites after two.', 'Never tie the line to yourself. Old Pete did that once. Once.'] },
    { job: 'Boat Captain', style: 'station', likes: ['bar'], talkLines: ['Get seasick on my boat and you swim home.'] },
    { job: 'Deckhand', style: 'roam', likes: ['bar'] },
    { job: 'Ice Cream Vendor', style: 'station' },
    { job: 'Fry Cook', style: 'station', talkLines: ['The gulls are organized. They have a leader.'] },
    { job: 'Bartender', style: 'station', nightOwl: true },
    { job: 'Surf Instructor', style: 'station' },
    { job: 'Sub Rental Guy', style: 'station', talkLines: ['Keys are on the hook. Not that you need to know that.'] },
    { job: 'Tour Guide', style: 'station', talkLines: ['Whale tours leave from the charter dock!'] },
    { job: 'Harbor Master', style: 'station' },
    { job: 'Motel Clerk', style: 'station' },
    { job: 'Arcade Attendant', style: 'station' },
    { job: 'Nurse', style: 'station' },
    { job: 'Doctor', style: 'station' },
    { job: 'Waiter', style: 'patrol' },
    { job: 'Line Cook', style: 'station' },
    { job: 'Clerk', style: 'station' },
    { job: 'Pilot', style: 'station' },
    { job: 'Mechanic', style: 'roam' },
  ];

  return {
    id: 'beach',
    name: 'Sandy Shores',
    nav: { bounds: { x0: 0, z0: 0, x1: SX - 1, z1: SZ - 1 }, walkable, groundAt, maxStep: 1.1 },
    places,
    population: {
      count: 70,
      jobs: ['Tourist', 'Tourist', 'Tourist', 'Surfer', 'Surfer', 'Retiree', 'Teen', 'Fisherman', 'Lifeguard', 'Boat Captain', 'Deckhand', 'Influencer', 'Banker', 'Dentist'],
    },
    jobProfiles,
    spawns: [L.busStop, { x: 690, y: GL, z: 215 }],
    smallTalk: [
      'Did you hear? Someone got carried off by seagulls yesterday.',
      'The cruise buffet opens every hour on the hour. People get weird about it.',
      'My kid wants to bury me in the sand again.',
      'Davy sold a sub last week. Haven\'t seen the guy since.',
      "Tide's coming in.",
    ],
  };
}
