import * as THREE from 'three';
import type { VoxelWorld } from '../../voxel';
import type { Rng } from '../../util';
import type { Box } from '../../town';
import type { MapContext, MapDef, MapRuntime, NpcSpawn, TravelStop } from '../../maps/types';
import type { DeathDef } from '../../deaths';
import { Frame, SIZE_X, SIZE_Z } from './frame';
import { GATES, HANGAR, RUNWAY, SEC_Z, TERM, UP, buildAirport } from './layout';
import { AIRPORT_DEATHS } from './deaths';
import { AIRPORT_NPCS, setupAirport } from './runtime';

export { AIRPORT_DEATHS } from './deaths';
export { AIRPORT_JOBS } from './runtime';

/** Footprint in voxels (x by z). The landside curb runs along the +z edge in world space. */
export const AIRPORT_SIZE = { x: SIZE_X, z: SIZE_Z };

export interface AirportPart {
  areas: Record<string, Box>;
  stops: TravelStop[];
  roads: { points: THREE.Vector3[]; width: number; loop?: boolean }[];
  npcs: NpcSpawn[];
  deaths: DeathDef[];
  /** Where a ghost arriving at the airport should appear (the curb, outside the main doors). */
  spawn: THREE.Vector3;
  setup(ctx: MapContext): MapRuntime;
}

/**
 * Stamp Fuhgeddaboudit International into a world. `origin` is the lot's min corner in world space,
 * with origin.y the first air block above the ground. Interactable ids are prefixed 'airport:'.
 */
export function placeAirport(world: VoxelWorld, origin: THREE.Vector3, rng: Rng): AirportPart {
  const f = new Frame(world, origin.clone());
  buildAirport(f, rng);
  const a2 = GATES[1];
  return {
    areas: {
      'airport:curb': f.box(20, 0, 1, 300, 2, 3),
      'airport:checkin': f.box(46, 0, 18, 175, 3, 34),
      'airport:claim': f.box(185, 0, 18, 276, 3, 42),
      'airport:concourse': f.box(42, UP, 46, 262, UP + 2, 68),
      'airport:apron': f.box(60, 0, 76, 280, 2, 126),
      'airport:hangar': f.box(HANGAR.x0 + 2, 0, HANGAR.z0 + 2, HANGAR.x1 - 2, 2, HANGAR.z1 - 2),
      'airport:runway': f.box(RUNWAY.x0, 0, RUNWAY.z0, RUNWAY.x1, 2, RUNWAY.z1),
    },
    stops: [
      {
        id: 'airport',
        kind: 'plane',
        name: `Fuhgeddaboudit International, Gate ${a2.id}`,
        pos: f.p(a2.x + 1.5, UP, TERM.z1 - 5),
        facing: f.heading(Math.PI),
        board: f.box(a2.x - 12, UP, TERM.z1 - 10, a2.x + 8, UP + 3, TERM.z1 - 1),
        lane: { from: f.p(-200, 0, RUNWAY.cz), stop: f.p(140, 0, RUNWAY.cz), to: f.p(520, 0, RUNWAY.cz) },
      },
    ],
    roads: [
      { points: [f.p(0, 0, 8), f.p(11, 0, 8), f.p(160, 0, 8), f.p(307, 0, 8), f.p(SIZE_X, 0, 8)], width: 9 },
      { points: [f.p(11, 0, -8), f.p(11, 0, 8)], width: 7 },
      { points: [f.p(307, 0, -8), f.p(307, 0, 8)], width: 7 },
    ],
    npcs: AIRPORT_NPCS,
    deaths: AIRPORT_DEATHS,
    spawn: f.p(160, 2, 6),
    setup: (ctx) => setupAirport(ctx, origin.clone()),
  };
}

/** Kept for reference: the security wall's design z, used by tests. */
export const AIRPORT_SECURITY_Z = SEC_Z;

/**
 * The airport as a standalone map, for previewing it on its own (src/dev/place.ts?map=airport).
 * In the real game the city map stamps it in with placeAirport().
 */
export const airportMap: MapDef = {
  id: 'airport-preview',
  name: 'Fuhgeddaboudit International',
  size: { x: SIZE_X + 16, y: 64, z: SIZE_Z + 24 },
  deaths: AIRPORT_DEATHS,
  build(world, rng) {
    const ground = 4;
    world.fill(0, 0, 0, world.sx - 1, ground - 1, world.sz - 1, 2);
    world.fill(0, ground - 1, 0, world.sx - 1, ground - 1, world.sz - 1, 1);
    const part = placeAirport(world, new THREE.Vector3(8, ground, 4), rng);
    // A strip of city road along the curb so it looks right.
    world.fill(0, ground - 1, SIZE_Z + 6, world.sx - 1, ground - 1, SIZE_Z + 14, 4);
    return {
      spawn: part.spawn,
      areas: part.areas,
      stops: part.stops,
      roads: part.roads,
      npcs: part.npcs,
      setup: part.setup,
    };
  },
};

/** Life-system data so the airport's staff live in the city and can be possessed. */
export interface AirportLife {
  places: import('../../life/types').LifePlace[];
  people: import('../../life/types').ResidentSpec[];
  jobProfiles: import('../../life/types').JobProfile[];
  /** Lowest world z the nav grid must reach to cover the landside hall. */
  navZ0: number;
}

export function airportLife(origin: THREE.Vector3): AirportLife {
  const f = new Frame(new VoidWorld() as unknown as VoxelWorld, origin.clone());
  const v = (x: number, z: number) => {
    const p = f.p(x, 0, z);
    return { x: p.x, y: p.y, z: p.z };
  };
  const inside = (x0: number, z0: number, x1: number, z1: number) => {
    const a = f.p(x0, 0, z1), b = f.p(x1, 0, z0);
    return { min: { x: a.x, z: a.z }, max: { x: b.x, z: b.z } };
  };
  const NAME = 'Fuhgeddaboudit International';
  return {
    navZ0: Math.floor(f.p(0, 0, 46).z),
    places: [
      {
        id: 'airport-checkin',
        name: NAME,
        kind: 'transit',
        door: v(159.5, 14),
        inside: inside(46, 18, 175, 33),
        staffSpots: [v(58, 38.6), v(70, 38.6), v(92, 38.6), v(104, 38.6)],
        jobs: ['Flight Attendant', 'Pilot'],
        lines: ['Any bags to check?', 'Window or middle? Just kidding, it is middle.'],
      },
      {
        id: 'airport-security',
        name: `${NAME} Security`,
        kind: 'civic',
        door: v(139.5, 14),
        inside: inside(118, 28, 160, 40),
        staffSpots: [v(122, 42), v(132, 42), v(142, 42)],
        jobs: ['TSA Agent'],
        lines: ['Shoes off. Belt off. Dignity off.', 'Is this your bag, sir?'],
      },
      {
        id: 'airport-claim',
        name: `${NAME} Baggage Claim`,
        kind: 'transit',
        door: v(219.5, 14),
        inside: inside(186, 18, 276, 42),
        staffSpots: [v(264, 41), v(270, 41)],
        jobs: ['Baggage Handler', 'Ground Crew'],
        lines: ['Your bag? Probably in Ohio.', 'We do not throw them. We toss them. Lovingly.'],
      },
      {
        id: 'airport-curb',
        name: `${NAME} Departures Curb`,
        kind: 'transit',
        door: v(290, 14),
        staffSpots: [v(298, 2), v(302, 2)],
        jobs: ['Air Traffic Controller'],
        lines: ['Fifteen-minute break. Two hundred planes. Fine.'],
      },
    ],
    people: [
      { job: 'Pilot', work: 'airport-checkin', name: 'Captain Chip Lander' },
      { job: 'Flight Attendant', work: 'airport-checkin' },
      { job: 'TSA Agent', work: 'airport-security' },
      { job: 'TSA Agent', work: 'airport-security' },
      { job: 'Baggage Handler', work: 'airport-claim' },
      { job: 'Ground Crew', work: 'airport-claim' },
      { job: 'Air Traffic Controller', work: 'airport-curb', name: 'Twitchy Doug' },
    ],
    jobProfiles: [
      { job: 'Pilot', style: 'station', shift: [6, 20], likes: ['bar', 'food'], talkLines: ['Ladies and gentlemen, this is your captain speaking. In person.', 'I have flown into worse. Not much worse.'] },
      { job: 'Flight Attendant', style: 'station', shift: [6, 20], likes: ['shop', 'food'], talkLines: ['Please keep your arms inside the conversation.', 'Chicken or fish? That is all I say anymore.'] },
      { job: 'TSA Agent', style: 'station', shift: [5, 21], likes: ['food'], talkLines: ['I have seen things in carry-ons.', 'Random screening. You were randomly chosen. By me.'] },
      { job: 'Baggage Handler', style: 'roam', shift: [5, 21], likes: ['bar', 'food'], talkLines: ['Fragile is a suggestion.', 'Your bag and I have history.'] },
      { job: 'Ground Crew', style: 'roam', shift: [5, 21], likes: ['bar'], talkLines: ['I wave the glowy sticks. That is the job.', 'Stay off my ramp.'] },
      { job: 'Air Traffic Controller', style: 'station', shift: [7, 19], likes: ['bar'], nightOwl: false, talkLines: ['Do not talk to me. I am holding nine planes in my head.', 'Runway zero? Ha. That would be funny.'] },
    ],
  };
}

/** A world that ignores writes, for computing design-to-world points without voxels. */
class VoidWorld {
  set() {}
  get() {
    return 0;
  }
}
