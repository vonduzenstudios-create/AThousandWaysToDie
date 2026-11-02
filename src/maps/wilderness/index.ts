import * as THREE from 'three';
import type { DeathDef, Job } from '../../deaths';
import type { LifeMap, LifePlace, V3 } from '../../life/types';
import { box } from '../../town';
import type { VoxelWorld } from '../../voxel';
import type { MapBuild, MapDef, NpcSpawn, TravelStop } from '../types';
import type { Ground } from './animals';
import { WildRuntime, type WildLayout } from './runtime';
import { grassCover } from './scenery';
import { buildStructures, type Spots } from './structures';
import { blockFootprints } from './kitbuild';
import { roadProfiles, trafficRoads } from './roads';
import type { CarKind } from '../../vehicles/carModel';
import { PADS, ROADS, SX, SY, SZ, Terrain, defineWildBlocks } from './terrain';

export const WILD_DEATHS: DeathDef[] = [
  { id: 'bear', name: 'Bear Necessities', category: 'Creatures', location: 'Lost Pines Campground', payout: 1800, blurb: 'Covered in honey, holding a picnic basket, knocked on a bear cave. Got the full bowling-ball hug.' },
  { id: 'bungee', name: 'Bungee Miscalculation', category: 'Gravity', location: 'Thunder Gorge Bridge', payout: 2000, blurb: 'Swapped a 60 m cord for a 300 m one. The cord arrived shortly after.' },
  { id: 'falls', name: 'Over the Falls', category: 'Water', location: 'Bridal Veil Falls', payout: 3000, blurb: 'Took the middle channel in a pickle barrel. Came out flat.' },
  { id: 'piranha', name: 'Piranha Pool Party', category: 'Creatures', location: 'Whisper Creek', payout: 1800, blurb: 'Went swimming with a raw steak in the swimsuit. The skeleton is still walking.' },
  { id: 'gator', name: 'Gator Show', category: 'Creatures', location: "Cap'n Chomp's Gator Show", payout: 2000, blurb: 'Won two rounds, insulted the gator in the third. The crowd loved it.' },
  { id: 'lions', name: 'Lion Family Reunion', category: 'Creatures', location: 'Pride Rock', payout: 3200, blurb: 'Wore the gift shop meat suit to meet the pride. They took a selfie after.' },
  { id: 'hippo', name: 'Hippo Final Boss', category: 'Creatures', location: 'Hippo Crossing', payout: 2000, blurb: 'Petted a yawning hippo three times. The hippo smiled.' },
  { id: 'elephant', name: 'Elephant Pancake', category: 'Crushing', location: 'Mbali Watering Hole', payout: 2000, blurb: "Stole a baby elephant's peanuts in front of its mother. Now a fan." },
  { id: 'rhino', name: 'Rhino Charge', category: 'Creatures', location: 'Mbali Reserve', payout: 3200, blurb: 'Painted a target on a tour jeep and honked at a rhino. Then the hippo.' },
  { id: 'vulture', name: 'Vulture Drop', category: 'Gravity', location: 'The Vulture Tree', payout: 2200, blurb: 'Unclipped the propane and fed the vultures from a hot air balloon.' },
  { id: 'abduction', name: 'Probed and Dropped', category: 'Stupidity', location: 'Dry Gulch Crop Circle', payout: 8000, blurb: 'Lay in a crop circle wearing tinfoil. Photographed, probed, dropped from orbit.' },
  { id: 'quicksand', name: 'Definitely Not Quicksand', category: 'Stupidity', location: 'The Dune Sea', payout: 900, blurb: 'The sign said it was definitely not quicksand.' },
  { id: 'rocket', name: 'Meep Meep', category: 'Fire & Explosions', location: 'Dry Gulch Highway', payout: 1800, blurb: 'Rode an ACME rocket after a roadrunner. Found the mesa instead.' },
  { id: 'cactus', name: 'Cactus Cuddle', category: 'Stupidity', location: 'Dry Gulch Highway', payout: 900, blurb: 'Hugged the friendly-looking cactus. Three times.' },
  { id: 'nuke', name: 'Not Rated for This', category: 'Fire & Explosions', location: 'Doom Town Test Site', payout: 8000, blurb: 'Hid in a fridge during a nuclear test. It did not work. Nice shadow though.' },
  { id: 'groundzero', name: 'Ground Zero', category: 'Fire & Explosions', location: 'Doom Town Test Site', payout: 3000, blurb: 'Stood around at a nuclear test. Did not even bring a fridge.' },
  { id: 'mirage', name: 'Mirage', category: 'Stupidity', location: 'The Dune Sea', payout: 900, blurb: 'Crawled for miles toward an oasis that was never there.' },
  { id: 'beaver', name: 'Beaver Revenge', category: 'Creatures', location: 'Whisper Creek Dam', payout: 1600, blurb: 'Jumped onto a beaver dam from way too high. The flood was bad. The beavers were worse.' },
  { id: 'logroll', name: 'Logrolling Champ', category: 'Sports', location: 'Whisper Creek Lumber', payout: 1000, blurb: 'Challenged Big Jim to log rolling. Big Jim is still undefeated.' },
];

/** Blocks a standing height test treats as foliage (you walk under it, not on it). */
const isFoliage = (b: number) => b === 7 || b === 28 || b === 180 || b === 191 || b === 212;

let layout: WildLayout | null = null;
let worldRef: VoxelWorld | null = null;

function floorMap(t: Terrain, world: VoxelWorld) {
  const floor = new Int16Array(SX * SZ);
  for (let z = 0; z < SZ; z++)
    for (let x = 0; x < SX; x++) {
      let y = t.h[z * SX + x];
      while (y < SY - 1) {
        const b = world.get(x, y, z);
        if (!b || isFoliage(b)) break;
        y++;
      }
      floor[z * SX + x] = y;
    }
  return floor;
}

/** Quads, dirt bikes, jeeps and pickups parked around the Wilds for the player to borrow. */
function parkedVehicles(s: Spots, g: Ground) {
  const at = (x: number, z: number, facing: number, kind: CarKind) => ({ pos: new THREE.Vector3(x, g.floor(x, z), z), facing, kind });
  return [
    // Ranger station lot: the rangers' patrol quads and a pickup.
    at(s.busStop.x - 10, s.busStop.z + 6, Math.PI / 2, 'pickup'),
    at(142, 572, 0, 'quad'),
    at(145, 572, 0, 'quad'),
    // Campground: somebody's dirt bikes and a jeep.
    at(204, 452, 0, 'jeep'),
    at(200, 449, 0.4, 'dirtbike'),
    at(198, 452, -0.3, 'dirtbike'),
    // Lumber camp.
    at(136, 466, Math.PI / 2, 'pickup'),
    // Safari lodge: tour quads by the garage.
    at(466, 578, Math.PI, 'jeep'),
    at(462, 586, Math.PI, 'quad'),
    at(465, 586, Math.PI, 'quad'),
    // Gas station: desert dirt bikes and a pickup at the pumps.
    at(300, 156, Math.PI / 2, 'pickup'),
    at(318, 158, Math.PI / 2, 'dirtbike'),
    at(321, 158, Math.PI / 2, 'quad'),
    // Dale's trailer and the test site.
    at(398, 146, 0, 'dirtbike'),
    at(524, 116, 0, 'jeep'),
  ];
}

const v3 = (p: THREE.Vector3): V3 => ({ x: p.x, y: p.y, z: p.z });

function lifeMap(t: Terrain, s: Spots, floor: Int16Array): LifeMap {
  const at = (x: number, z: number): V3 => ({ x, y: floor[Math.floor(z) * SX + Math.floor(x)], z });
  const padBox = (k: keyof typeof PADS) => ({ min: { x: PADS[k].x0 + 1, z: PADS[k].z0 + 1 }, max: { x: PADS[k].x1 - 1, z: PADS[k].z1 - 1 } });
  const places: LifePlace[] = [
    { id: 'depot', name: 'Lost Pines Depot', kind: 'transit', door: v3(s.trainStop), spots: [at(66, 603.5), at(90, 603.5), at(102, 603.5), at(80, 605)] },
    { id: 'busstop', name: 'Lost Pines Bus Stop', kind: 'transit', door: v3(s.busStop), spots: [at(152, 576), at(155, 576)] },
    { id: 'airstrip', name: 'Mbali Airstrip', kind: 'transit', door: v3(s.airport) },
    { id: 'ranger', name: 'Ranger Station', kind: 'civic', door: v3(s.rangerDoor), staffSpots: [v3(s.ranger)], spots: [at(125, 568)], jobs: ['Park Ranger'], lines: ['Stay on the trails.', 'Do not feed the bears. Or wear honey.'] },
    { id: 'campground', name: 'Lost Pines Campground', kind: 'park', door: at(196, 452), inside: padBox('campground'), spots: [at(188, 429), at(206, 427), at(192, 434), at(197, 434)] },
    { id: 'tents', name: 'the campground tents', kind: 'home', door: at(195, 425), inside: padBox('campground'), residents: 6 },
    { id: 'lumber', name: 'Whisper Creek Lumber', kind: 'work', door: at(126, 466), inside: padBox('lumber'), jobs: ['Lumberjack'], lines: ['TIMBER!', 'Big Jim has never lost a log roll.'] },
    { id: 'raft', name: 'Whitewater Rafting', kind: 'work', door: v3(s.raftHut), inside: padBox('raftdock'), jobs: ['Rafting Guide'], lines: ['Paddle left! Your other left!'] },
    { id: 'bungee', name: 'Thunder Gorge Bungee', kind: 'attraction', door: v3(s.bungeeShack), inside: padBox('bungee'), jobs: ['Bungee Operator'] },
    { id: 'gatorshow', name: "Cap'n Chomp's Gator Show", kind: 'attraction', door: at(82, 498), spots: [at(78, 490), at(84, 490), at(80, 492), at(86, 492), at(82, 494)], jobs: ['Gator Wrangler'], hours: [9, 20] },
    { id: 'lodge', name: 'Mbali Safari Lodge', kind: 'food', door: v3(s.lodgeDoor), staffSpots: [at(446, 558)], spots: [at(441, 560), at(446, 560.5), at(451, 560)], counter: v3(s.kitchen), jobs: ['Line Cook'], sells: [{ item: 'iced tea', price: 3 }, { item: 'raw steak', price: 15 }, { item: 'biltong', price: 6 }], hours: [6, 23] },
    { id: 'giftshop', name: 'Lodge Gift Shop', kind: 'shop', door: v3(s.giftShop), staffSpots: [at(428, 558)], spots: [at(426, 559.5), at(431, 560)], sells: [{ item: 'safari hat', price: 20 }, { item: 'meat suit costume', price: 30 }, { item: 'postcard', price: 2 }], jobs: ['Gift Shop Clerk'] },
    { id: 'rondavels', name: 'the lodge huts', kind: 'home', door: at(462, 554), residents: 6 },
    { id: 'safari', name: 'Mbali Game Drive', kind: 'work', door: v3(s.garage), jobs: ['Safari Guide', 'Zookeeper'], patrol: [at(470, 520), at(500, 440), at(505, 362), at(420, 352), at(380, 420), at(345, 488)] },
    { id: 'lookout', name: 'Pride Rock Lookout', kind: 'attraction', door: v3(s.lionLookout) },
    { id: 'wateringhole', name: 'the Watering Hole', kind: 'attraction', door: v3(s.waterBank) },
    { id: 'hippobank', name: 'Hippo Crossing', kind: 'attraction', door: v3(s.hippoBank) },
    { id: 'gas', name: 'Dry Gulch Gas & Grub', kind: 'food', door: v3(s.gasDoor), staffSpots: [at(318, 147)], counter: v3(s.gasDoor), spots: [at(291, 149), at(300, 149.5), at(304, 150)], jobs: ['Diner Cook', 'Gas Attendant'], sells: [{ item: 'coffee', price: 2 }, { item: 'chili dog', price: 4 }, { item: 'jerky', price: 5 }] },
    { id: 'trailer', name: "Dale's trailer", kind: 'home', door: v3(s.trailerDoor), residents: 1 },
    { id: 'cropcircle', name: 'the crop circle', kind: 'attraction', door: v3(s.camera) },
    { id: 'bunker', name: 'Test Site Control Bunker', kind: 'work', door: v3(s.bunkerDoor), inside: { min: { x: 515, z: 97 }, max: { x: 529, z: 107 } }, jobs: ['Scientist'], allowedJobs: ['Scientist'], lines: ['Next test is on schedule. Probably.'] },
    { id: 'doomtown', name: 'Doom Town', kind: 'work', door: at(570, 54), jobs: ['Scientist'] },
    { id: 'falls', name: 'Bridal Veil Falls overlook', kind: 'attraction', door: at(148, 262) },
  ];
  const ok = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return false;
    const i = Math.floor(z) * SX + Math.floor(x);
    return !t.water[i] && floor[i] <= t.h[i] + 1;
  };
  return {
    id: 'wilderness',
    name: 'the Wilds',
    nav: {
      bounds: { x0: 2, z0: 2, x1: SX - 3, z1: SZ - 3 },
      walkable: ok,
      groundAt: (x, z) => floor[Math.floor(z) * SX + Math.floor(x)],
      cost: (x, z) => (t.roadAt[Math.floor(z) * SX + Math.floor(x)] ? 0.6 : 1),
      maxStep: 1.1,
    },
    places,
    population: {
      count: 46,
      jobs: ['Tourist', 'Tourist', 'Tourist', 'Retiree', 'Teen', 'Influencer', 'Kid', 'Trucker'],
      people: [
        { job: 'Park Ranger', work: 'ranger' },
        { job: 'Park Ranger', work: 'ranger' },
        { job: 'Safari Guide', work: 'safari' },
        { job: 'Safari Guide', work: 'safari' },
        { job: 'Safari Guide', work: 'safari' },
        { job: 'Zookeeper', work: 'safari', lines: ['Hippos are the deadliest animal in Africa. After mosquitoes. And tourists.'] },
        { job: 'Line Cook', work: 'lodge' },
        { job: 'Gift Shop Clerk', work: 'giftshop' },
        { job: 'Lumberjack', work: 'lumber' },
        { job: 'Lumberjack', work: 'lumber' },
        { job: 'Rafting Guide', work: 'raft' },
        { job: 'Scientist', work: 'bunker', lines: ['Fridges? No, fridges do not help. Why does everyone ask?'] },
        { job: 'Scientist', work: 'bunker' },
        { job: 'Scientist', work: 'doomtown' },
        { job: 'Gas Attendant', work: 'gas' },
        { job: 'Diner Cook', work: 'gas' },
        { job: 'Gator Wrangler', work: 'gatorshow' },
      ],
    },
    jobProfiles: [
      { job: 'Park Ranger', style: 'patrol', shift: [7, 19], workLines: ['Leave no trace.', 'That bear has a name. It is Gerald.'], talkLines: ['Bear spray is a suggestion. A strong one.', 'The falls are lovely. Do not go over them.'] },
      { job: 'Safari Guide', style: 'patrol', shift: [6, 18], workLines: ['Keep your arms inside the vehicle.'], talkLines: ['The hippo is not cute. The hippo is a tank with teeth.', 'Never wear the meat suit outside the gift shop.'] },
      { job: 'Zookeeper', style: 'roam', shift: [7, 17], talkLines: ['I have petted a hippo exactly once. Once.'] },
      { job: 'Line Cook', style: 'station', shift: [6, 15] },
      { job: 'Gift Shop Clerk', style: 'station', shift: [8, 18], talkLines: ['The meat suit is our best seller. Nobody brings it back.'] },
      { job: 'Lumberjack', style: 'roam', shift: [6, 16], workLines: ['TIMBER!'], talkLines: ['Big Jim? Undefeated. Do not challenge him. He gets weird.'] },
      { job: 'Rafting Guide', style: 'roam', shift: [8, 18], talkLines: ['Three channels above the falls. Left and right are safe. Middle is a bad day.'] },
      { job: 'Bungee Operator', style: 'station', shift: [9, 18] },
      { job: 'Gator Wrangler', style: 'roam', shift: [9, 20], talkLines: ['Shows run all day. Athletes only. Liability.'] },
      { job: 'Scientist', style: 'roam', shift: [8, 18], workLines: ['Countdown nominal.', 'Has anyone seen my clipboard? It has the launch codes.'], talkLines: ['The button in the bunker starts a test. Badge required.', 'We test every few minutes. It is a very busy desert.'] },
      { job: 'Gas Attendant', style: 'station', shift: [6, 22], talkLines: ['Last gas for 300 miles. Also the first.'] },
      { job: 'Tourist', style: 'none', likes: ['attraction', 'food', 'shop', 'park'], talkLines: ['Have you seen the lions? I want a selfie.', 'Is that quicksand? The sign says no.'] },
      { job: 'Kid', style: 'none', likes: ['attraction', 'park'], talkLines: ['Can I honk the horn? Can I? Can I?'] },
      { job: 'Trucker', style: 'none', likes: ['food', 'transit'], talkLines: ['Saw a roadrunner outrun a rocket once. True story.'] },
    ],
    spawns: [v3(s.busStop), v3(s.trainStop), v3(s.airport)],
    smallTalk: ['Did you hear the test site siren?', 'Somebody went over the falls in a barrel again.', 'Dale says the aliens want our insurance files.', 'The bungee guy measures cords with his ARMS.'],
  };
}

export const WILDERNESS: MapDef = {
  id: 'wilderness',
  name: 'The Wilds',
  size: { x: SX, y: SY, z: SZ },
  sky: { top: 0x3a86e8, bottom: 0xf2e2c0, fogNear: 160, fogFar: 460 },
  deaths: WILD_DEATHS,
  build(world: VoxelWorld): MapBuild {
    defineWildBlocks();
    const t = new Terrain();
    t.generate();
    t.fill(world);
    const spots = buildStructures(world, t);
    const floor = floorMap(t, world);
    blockFootprints(floor, t);
    const ground: Ground = {
      floor: (x, z) => {
        const xi = Math.floor(x), zi = Math.floor(z);
        if (xi < 0 || zi < 0 || xi >= SX || zi >= SZ) return 0;
        return floor[zi * SX + xi];
      },
      water: (x, z) => t.waterAt(x, z),
    };
    const cover = grassCover(t, world);
    const roadProf = roadProfiles(t);
    layout = { t, spots, ground, cover, roads: roadProf };
    worldRef = world;
    const life = lifeMap(t, spots, floor);

    const stops: TravelStop[] = [
      { id: 'bus', kind: 'bus', name: 'Lost Pines Bus Stop', pos: spots.busStop, facing: Math.PI, lane: { from: spots.busLaneFrom, stop: spots.busLaneStop, to: spots.busLaneTo } },
      { id: 'train', kind: 'train', name: 'Lost Pines Depot', pos: spots.trainStop, facing: 0, lane: { from: spots.trainLaneFrom, stop: spots.trainLaneStop, to: spots.trainLaneTo } },
      { id: 'airport', kind: 'plane', name: 'Mbali Airstrip', pos: spots.airport, facing: 0, lane: { from: spots.planeLaneFrom, stop: spots.planeLaneStop, to: spots.planeLaneTo } },
    ];

    const roads = trafficRoads(roadProf);

    const areas = {
      campground: box(178, 0, 416, 212, 0, 450),
      ranger: box(110, 0, 548, 160, 0, 590),
      depot: box(56, 0, 596, 112, 0, 608),
      lumber: box(114, 0, 450, 140, 0, 470),
      lodge: box(420, 0, 556, 474, 0, 590),
      safari: box(380, 0, 420, 520, 0, 540),
      gas: box(282, 0, 146, 330, 0, 160),
      desert: box(300, 0, 120, 420, 0, 160),
      testsite: box(510, 0, 92, 540, 0, 114),
      bridge: box(214, 0, 314, 238, 0, 330),
    };
    const npcs: NpcSpawn[] = [
      { area: 'campground', count: 4 },
      { area: 'ranger', count: 2 },
      { area: 'depot', count: 2 },
      { area: 'lumber', count: 2, job: 'Construction Worker' as Job },
      { area: 'lodge', count: 4 },
      { area: 'safari', count: 2 },
      { area: 'gas', count: 2, job: 'Diner Cook' as Job },
      { area: 'desert', count: 2 },
      { area: 'testsite', count: 2 },
      { area: 'bridge', count: 2 },
    ];

    return {
      spawn: new THREE.Vector3(150, floor[575 * SX + 150] + 5, 570),
      groundAt: (x, z) => {
        const xi = Math.floor(x), zi = Math.floor(z);
        if (xi < 0 || zi < 0 || xi >= SX || zi >= SZ) return NaN;
        const i = zi * SX + xi;
        if (t.water[i] || floor[i] > t.h[i] + 1) return NaN;
        return floor[i];
      },
      areas,
      stops,
      roads,
      // A few trucks and jeeps, not a commute.
      traffic: { density: 0.1, maxCars: 3, speed: 9, models: ['jeep', 'jeep', 'pickup', 'pickup', 'truck'], parked: parkedVehicles(spots, ground) },
      npcs,
      life,
      setup: (ctx) => new WildRuntime(ctx, layout!),
    };
  },
};

/** For tests and tools: the last built layout. */
export const wildLayout = () => ({ layout, world: worldRef });
