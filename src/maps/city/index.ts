import * as THREE from 'three';
import { box } from '../../town';
import { B, type VoxelWorld } from '../../voxel';
import type { LifeMap, LifePlace, JobProfile } from '../../life/types';
import type { MapBuild, MapDef, TravelStop } from '../types';
import { buildCity, standHeight, type CityLayout } from './build';
import { CITY_DEATHS } from './deaths';
import { setupCity } from './logic';
import { HOSPITAL_DEATHS, setupHospital } from '../../places/hospital';
import { composeRuntimes } from '../compose';
import {
  AIRPORT_LOT,
  AIRPORT_ROAD_Z,
  AVES,
  AVE_HALF,
  CITY_NAME,
  G,
  GRID,
  ITALY,
  LAND,
  MORTALIS,
  PARK,
  PIERS,
  RAIL,
  RAIL_PLATFORM,
  SITE,
  STREETS,
  ST_HALF,
  SUBWAY,
  SX,
  SY,
  SZ,
  WATER,
} from './layout';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** City jobs on top of the base game's, with how they spend their day. */
const JOB_PROFILES: JobProfile[] = [
  { job: 'Mobster', style: 'roam', shift: [11, 23], workKinds: ['food', 'bar'], likes: ['bar', 'food'], workLines: ['Nice neighborhood. Be a shame if...', "I didn't see nothin'."], talkLines: ["You're not from around here, are ya?", 'Fuhgeddaboudit.', 'Tony says hi. Tony never says hi.'] },
  { job: 'Cabbie', style: 'patrol', shift: [6, 22], likes: ['food', 'bar'], talkLines: ["Meter's running, pal.", 'I been driving this city 30 years. Never once used a blinker.'] },
  { job: 'Window Washer', style: 'roam', shift: [8, 16], workKinds: ['work'], talkLines: ['Best view in the city. Worst lunch breaks.', 'Never look down. Rule one.'] },
  { job: 'Hot Dog Vendor', style: 'station', shift: [9, 20], workKinds: ['food'], talkLines: ["Don't ask what's in 'em.", 'Same cart, same spot, since 1974. Never moved it once.'] },
  { job: 'Subway Performer', style: 'station', shift: [10, 22], workKinds: ['transit'], talkLines: ['Tips appreciated. Requests not.', 'I know four songs. This is the fifth.'] },
  { job: 'Stockbroker', style: 'station', shift: [7, 19], workKinds: ['work'], likes: ['bar', 'food'], talkLines: ['Buy high, sell low. Wait, other way.', "I'm on a call. I'm always on a call."] },
  { job: 'Office Worker', style: 'station', shift: [9, 17], workKinds: ['work'], likes: ['food', 'park'], talkLines: ['Is it Friday? It feels like a Wednesday.', 'My cubicle has a window. It faces another cubicle.'] },
  { job: 'Security Guard', style: 'station', shift: [8, 20], workKinds: ['work', 'civic'], talkLines: ['Badge, please. ...That is a library card.'] },
  { job: 'Tourist', style: 'none', likes: ['attraction', 'park', 'food', 'shop'], talkLines: ['Which way to the big green lady?', 'Is this Times Square? It looks smaller on TV.', 'Can you take our picture?'] },
  { job: 'Dock Worker', style: 'roam', shift: [6, 15], workKinds: ['work'], likes: ['bar'], talkLines: ['Mind the forklift.', "Don't go near Pier 13. Just don't."] },
  { job: 'Construction Worker', style: 'roam', shift: [7, 17], workKinds: ['work'], likes: ['food'], talkLines: ["Hard hat area, buddy.", 'Union break in five.'] },
  { job: 'Foreman', style: 'roam', shift: [7, 17], workKinds: ['work'], talkLines: ['Who left the crane running?!'] },
  { job: 'Clerk', style: 'station', shift: [8, 20], workKinds: ['shop'], talkLines: ['We got it in the back. Probably.', "Cash only. The card machine's been 'broken' since 2009."] },
  { job: 'Line Cook', style: 'station', shift: [6, 22], workKinds: ['food'], talkLines: ['Order up!', "Don't come back here, health code."] },
  { job: 'Pizza Chef', style: 'station', shift: [10, 24], workKinds: ['food'], talkLines: ['You want a slice or a problem?'] },
  { job: 'Bartender', style: 'station', shift: [16, 4], nightOwl: true, workKinds: ['bar'], talkLines: ["What'll it be?", 'Last call was an hour ago.'] },
  { job: 'Ticket Clerk', style: 'station', shift: [6, 23], workKinds: ['transit'], talkLines: ['Next window, please.'] },
  { job: 'Conductor', style: 'station', shift: [5, 23], workKinds: ['transit'], talkLines: ['All aboooard!', 'Stand clear of the closing doors.'] },
  { job: 'Insurance Salesman', style: 'station', shift: [9, 17], workKinds: ['work'], talkLines: ['Have you heard about our Platinum Exclusions plan?', 'Mortalis Mutual: we are there for you. Terms apply.'] },
  { job: 'Claims Adjuster', style: 'patrol', shift: [9, 17], talkLines: ['I deny claims for a living. I love my job.', "Accident? Looks staged to me."] },
];

const CITY_JOBS = ['Office Worker', 'Office Worker', 'Stockbroker', 'Tourist', 'Tourist', 'Cabbie', 'Mobster', 'Clerk', 'Line Cook', 'Construction Worker', 'Dock Worker', 'Security Guard', 'Insurance Salesman', 'Window Washer', 'Retiree', 'Teen', 'Cop', 'Mail Carrier', 'Influencer', 'Banker', 'Dentist'];

const SMALL_TALK = [
  'Rent went up again. I live in a closet. A nice closet.',
  'They found a guy in the harbor in cement shoes. Again.',
  'Somebody fell in the manhole by the deli. Third time this week.',
  'The parade balloon got loose last year. They found it in New Jersey.',
  'Mortalis Mutual denied my claim for my claim being denied.',
  'The subway was only 40 minutes late today. A miracle.',
  "Don't eat at the hot dog cart. Or do. I'm not your mother.",
];

/** Road centerlines for traffic: every avenue and street, split at the closures. */
function roads(): NonNullable<MapBuild['roads']> {
  const out: NonNullable<MapBuild['roads']> = [];
  const y = G;
  const zA = AIRPORT_ROAD_Z;
  // Avenues run from the airport road to the waterfront street.
  for (const ax of AVES) {
    const x = ax;
    const pts: THREE.Vector3[] = [V(x, y, zA)];
    for (const sz of STREETS) pts.push(V(x, y, sz));
    // Avenues 270 and 402 are interrupted by the park and the hospital superblock.
    if (ax === AVES[3]) {
      out.push({ points: [V(x, y, zA), V(x, y, STREETS[0]), V(x, y, STREETS[1])], width: AVE_HALF * 2 });
      out.push({ points: [V(x, y, STREETS[3]), V(x, y, STREETS[4]), V(x, y, STREETS[5]), V(x, y, STREETS[6])], width: AVE_HALF * 2 });
    } else if (ax === AVES[5]) {
      out.push({ points: pts.slice(0, 6), width: AVE_HALF * 2 });
    } else out.push({ points: pts, width: AVE_HALF * 2 });
  }
  for (const sz of STREETS) {
    const pts = [V(AVES[0], y, sz), ...AVES.slice(1).map((ax) => V(ax, y, sz))];
    if (sz === STREETS[2]) {
      // Closed through the park and the construction site.
      out.push({ points: pts.slice(0, 3), width: ST_HALF * 2 });
      out.push({ points: pts.slice(4, 6), width: ST_HALF * 2 });
    } else if (sz === STREETS[5]) {
      out.push({ points: pts.slice(0, 5), width: ST_HALF * 2 });
    } else out.push({ points: pts, width: ST_HALF * 2 });
  }
  out.push({ points: [V(LAND.x0 + 4, y, zA), ...AVES.map((ax) => V(ax, y, zA)), V(LAND.x1 - 4, y, zA)], width: ST_HALF * 2 });
  return out;
}

function lifeMap(w: VoxelWorld, L: CityLayout): LifeMap {
  const places: LifePlace[] = L.places.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    door: p.door,
    inside: p.inside ? { min: { x: p.inside.x0, z: p.inside.z0 }, max: { x: p.inside.x1, z: p.inside.z1 } } : undefined,
    spots: p.spots,
    staffSpots: p.staffSpots,
    jobs: p.jobs,
    hours: p.hours,
    sells: p.sells,
    allowedJobs: p.allowedJobs,
    lines: p.lines,
    residents: p.residents,
  }));
  places.push(
    { id: 'hotdog-cart', name: 'Hot Dog Cart', kind: 'food', door: V(PARK.x1 - 18.5, G, PARK.z1 + 6), sells: [{ item: 'hot dog', price: 3 }], jobs: ['Hot Dog Vendor'], staffSpots: [V(PARK.x1 - 18.5, G, PARK.z1 + 1.9)] },
    { id: 'rail-platform', name: 'Grand Centralish Platform', kind: 'transit', door: V(RAIL_PLATFORM.x1 + 2, G, SUBWAY.z + 0.5), spots: [V(36.5, G + 1, 330), V(36.5, G + 1, 350), V(36.5, G + 1, 370)] },
    { id: 'bus-stop', name: 'Avenue B Bus Stop', kind: 'transit', door: V(AVES[1] + 6.5, G, STREETS[3] + 30.5) },
    { id: 'mortalis-plaza', name: 'Mortalis Plaza', kind: 'attraction', door: V(MORTALIS.x0 + 24, G, MORTALIS.z0 - 2) },
    { id: 'times-squared', name: 'Times Squared', kind: 'attraction', door: V(AVES[4] + 7, G, STREETS[1] + 7) },
  );
  const cost = (x: number, z: number) => {
    const b = w.get(Math.floor(x), G - 1, Math.floor(z));
    if (b === B.Asphalt) return 5;
    if (b === B.White) return 0.9; // crosswalks
    if (b === B.Sidewalk || b === B.Plank) return 0.7;
    if (b === B.Gravel) return x < RAIL.x1 + 2 ? 8 : 0.8;
    if (b === B.Grass || b === B.Flower) return 1.6;
    return 1;
  };
  return {
    id: 'city',
    name: CITY_NAME,
    nav: {
      bounds: { x0: LAND.x0 + 1, z0: AIRPORT_ROAD_Z - 8, x1: LAND.x1 - 1, z1: PIERS.mob.z1 },
      walkable: (x, z) => !Number.isNaN(standHeight(w, x, z, L.blocked)),
      groundAt: (x, z) => {
        const h = standHeight(w, x, z);
        return Number.isNaN(h) ? G : h;
      },
      cost,
    },
    places,
    population: {
      count: 140,
      jobs: CITY_JOBS,
      people: [
        { job: 'Window Washer', work: L.places.find((p) => p.name === 'Mortalis Mutual')?.id, name: 'Lenny Squeegee' },
        { job: 'Hot Dog Vendor', work: 'hotdog-cart', name: 'Sal Frankfurter' },
        { job: 'Subway Performer', work: 'subway', name: 'Smooth Eddie' },
        { job: 'Mobster', work: L.places.find((p) => p.name === "Don Calzone's Pizzeria")?.id, name: 'Vinnie the Rat' },
        { job: 'Foreman', work: 'site', name: 'Big Moe' },
      ],
    },
    jobProfiles: JOB_PROFILES,
    smallTalk: SMALL_TALK,
  };
}

export const CITY_MAP: MapDef = {
  id: 'city',
  name: CITY_NAME,
  size: { x: SX, y: SY, z: SZ },
  sky: { top: 0x4a7fd0, bottom: 0xd8e6f2, fogNear: 160, fogFar: 520 },
  waterLevel: WATER,
  deaths: [...CITY_DEATHS, ...HOSPITAL_DEATHS],
  build(world, rng) {
    const L = buildCity(world, rng);
    const stops: TravelStop[] = [
      {
        id: 'bus',
        kind: 'bus',
        name: 'Avenue B Bus Stop',
        pos: V(AVES[1] + 6.5, G, STREETS[3] + 30.5),
        facing: -Math.PI / 2,
        lane: { from: V(AVES[1] + 2.5, G, STREETS[2]), stop: V(AVES[1] + 2.5, G, STREETS[3] + 30.5), to: V(AVES[1] + 2.5, G, STREETS[5]) },
      },
      {
        id: 'train',
        kind: 'train',
        name: 'Grand Centralish Station',
        pos: V(RAIL_PLATFORM.x0 + 0.5, G + 1, 347.5),
        facing: -Math.PI / 2,
        board: box(RAIL_PLATFORM.x0, G, RAIL_PLATFORM.z0, RAIL_PLATFORM.x1 + 1, G + 3, RAIL_PLATFORM.z1),
        // Travel trains pull in on track 42, the platform's east side. Track 31 (west side) is
        // the rail yard's commuter line, the one the Rush Hour death uses.
        lane: { from: V(RAIL.tracks[2] + 0.5, G, RAIL.z0), stop: V(RAIL.tracks[2] + 0.5, G, 347.5), to: V(RAIL.tracks[2] + 0.5, G, RAIL.z1) },
      },
      {
        id: 'harbor',
        kind: 'boat',
        name: 'Big Apple Ferry Terminal',
        pos: V((PIERS.ferry.x0 + PIERS.ferry.x1) / 2 + 0.5, G, PIERS.ferry.z1 - 2),
        facing: 0,
        lane: { from: V(140, WATER, 625), stop: V(PIERS.ferry.x1 + 5, WATER, PIERS.ferry.z1 - 6), to: V(330, WATER, 625) },
      },
      {
        // Placeholder until the airport module lands at AIRPORT_LOT.
        id: 'airport',
        kind: 'plane',
        name: 'Fuhgeddaboudit International',
        pos: V(AIRPORT_LOT.x + 160.5, G, AIRPORT_LOT.z + AIRPORT_LOT.sz - 34),
        facing: Math.PI,
        lane: { from: V(AIRPORT_LOT.x + 300, G, AIRPORT_LOT.z + 40), stop: V(AIRPORT_LOT.x + 160, G, AIRPORT_LOT.z + 60), to: V(AIRPORT_LOT.x + 20, G, AIRPORT_LOT.z + 40) },
      },
    ];
    const areas = {
      midtown: box(GRID.x0 + 70, G, STREETS[0], GRID.x1 - 70, G, STREETS[3]),
      park: box(PARK.x0 + 4, G, PARK.z0 + 4, PARK.x1 - 4, G, PARK.z1 - 4),
      littleitaly: box(ITALY.x0, G, ITALY.z0 - 6, ITALY.x1, G, ITALY.z1),
      harbor: box(LAND.x0 + 4, G, STREETS[6] + 8, LAND.x1 - 4, G, LAND.z1 - 2),
      site: box(SITE.x0 + 2, G, SITE.z0 + 2, SITE.x1 - 2, G, SITE.z1 - 2),
      mortalis: box(MORTALIS.x0, G, MORTALIS.z0 - 6, MORTALIS.x1, G, MORTALIS.z0 - 1),
      uptown: box(GRID.x0, G, STREETS[3], GRID.x1, G, STREETS[6]),
      railyard: box(RAIL_PLATFORM.x0, G + 1, RAIL_PLATFORM.z0, RAIL_PLATFORM.x1, G + 1, RAIL_PLATFORM.z1),
      ...L.hospital?.areas,
    };
    return {
      spawn: V(PARK.x0 + 58, G + 3, PARK.z1 + 6),
      groundAt: (x, z) => standHeight(world, x, z),
      areas,
      stops,
      roads: roads(),
      life: lifeMap(world, L),
      npcs: [
        { area: 'midtown', count: 14 },
        { area: 'park', count: 8 },
        { area: 'littleitaly', count: 6 },
        { area: 'harbor', count: 5 },
        { area: 'site', job: 'Construction Worker', count: 3 },
        { area: 'mortalis', job: 'Insurance Salesman', count: 2 },
        { area: 'uptown', count: 10 },
      ],
      setup: (ctx) => composeRuntimes([setupCity(ctx, L), L.hospital && setupHospital(ctx, L.hospital)]),
    };
  },
};
