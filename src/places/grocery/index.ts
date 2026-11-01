import * as THREE from 'three';
import type { PlaceDef, PlaceBuild } from '../types';
import { Frame } from '../types';
import { GROCERY_DEATHS } from './deaths';
import { BACK_WALL_Z, D, F, IN, LOT_TOP, SPOT, W, buildVoxels, localGround } from './layout';
import { STORE_JOBS, setupGrocery } from './runtime';

export { GROCERY_DEATHS, STORE_JOBS };

/**
 * Smallville Grocery: a big supermarket with a sloped parking lot, checkouts, produce,
 * bulk bins, six aisles, seafood, deli, rotisserie, frozen foods, and a staff-only
 * back room with a stockroom, office and walk-in meat freezer. 16 deaths.
 *
 *   const store = GROCERY.build(world, { x, y: G, z, rot }, rng);
 */
export const GROCERY: PlaceDef = {
  id: 'grocery',
  name: 'Smallville Grocery',
  footprint: { x: W, z: D },
  deaths: GROCERY_DEATHS,
  jobs: STORE_JOBS,
  build(world, at, _rng): PlaceBuild {
    const f = new Frame(at.x, at.y, at.z, at.rot ?? 0, W, D);
    buildVoxels(world, f);
    const v = (x: number, z: number, y = F) => f.toWorld(x, y, z);
    const pt = (x: number, z: number) => {
      const w = v(x, z);
      return { x: w.x, y: w.y, z: w.z };
    };
    const rect = (x0: number, z0: number, x1: number, z1: number) => {
      const b = f.box(x0, F, z0, x1, F + 4, z1);
      return { min: { x: b.min.x, z: b.min.z }, max: { x: b.max.x, z: b.max.z } };
    };
    const areas = {
      'grocery-floor': f.box(IN.x0 + 1, F, 57, IN.x1 - 12, F + 4, 88),
      'grocery-front': f.box(IN.x0 + 1, F, 47, IN.x1 - 1, F + 4, 56),
      'grocery-backroom': f.box(IN.x0 + 1, F, BACK_WALL_Z + 1, 54, F + 4, 94),
      'grocery-deli': f.box(SPOT.deli.x0 + 1, F, SPOT.deli.z0 + 1, SPOT.deli.x1 - 2, F + 4, SPOT.deli.z1 - 1),
      'grocery-lot': f.box(4, 0, 2, W - 4, F, LOT_TOP - 4),
    };
    const entrance = v(SPOT.entrance.x, SPOT.entrance.z, 5);
    return {
      frame: f,
      areas,
      entrance,
      entranceFacing: f.yaw,
      lifePlaces: [
        {
          id: 'grocery',
          name: 'Smallville Grocery',
          kind: 'shop',
          door: pt(SPOT.entrance.x, 45),
          inside: rect(22, 57, 63, 88),
          spots: [pt(28, 70), pt(34, 62), pt(40, 80), pt(46, 66), pt(52, 75), pt(58, 84), pt(14, 64), pt(14, 76), pt(68, 70)],
          staffSpots: [pt(13.6, 50.6), pt(25.6, 50.6), pt(63.5, 55), pt(70, 74), pt(68, 64.5), pt(69, 49.6)],
          jobs: ['Cashier', 'Deli Clerk', 'Store Manager', 'Produce Manager'],
          hours: [7, 22],
          sells: [
            { item: 'groceries', price: 40 },
            { item: 'a rotisserie chicken', price: 8 },
            { item: 'one banana', price: 1 },
            { item: 'lottery tickets', price: 5 },
          ],
          lines: ['Paper or plastic?', 'Do you have our rewards card?', 'Cleanup on aisle 6.', 'Price check on aisle 2!'],
          tags: ['grocery'],
        },
        {
          id: 'grocery-backroom',
          name: 'Smallville Grocery back room',
          kind: 'work',
          door: pt(31.5, 88),
          inside: rect(4, 92, 54, 94),
          staffSpots: [pt(20, 93), pt(40, 93), pt(66, 96.5), pt(59, 94)],
          jobs: ['Butcher', 'Stocker'],
          allowedJobs: STORE_JOBS,
          hours: [5, 23],
          tags: ['grocery', 'staff-only'],
        },
      ],
      jobProfiles: [
        { job: 'Butcher', style: 'station', shift: [6, 15], workLines: ['Fresh ground chuck!', 'Who keeps opening my freezer?'], talkLines: ["Don't go in my freezer.", 'You want it sliced or whole?'] },
        { job: 'Stocker', style: 'roam', shift: [5, 14], workLines: ['Who took the bottom can?!', 'Forklift certified, baby.'], talkLines: ["I'm on break.", 'Aisle 5. No wait, 4.'] },
        { job: 'Cashier', style: 'station', shift: [8, 17], workLines: ['Next in line!', 'Paper or plastic?'], talkLines: ['Do you have a rewards card?'] },
        { job: 'Deli Clerk', style: 'station', shift: [9, 18], workLines: ['Number 12!', 'Now serving 12.'], talkLines: ['Take a number, hon.'] },
        { job: 'Produce Manager', style: 'station', shift: [6, 15], workLines: ['Nobody touch the melons.'], talkLines: ['Take from the TOP.'] },
        { job: 'Store Manager', style: 'station', shift: [8, 20], workLines: ['Cleanup on aisle 6.'], talkLines: ['Can I help you find something?'] },
      ],
      npcs: [
        { area: 'grocery-front', job: 'Cashier', count: 1 },
        { area: 'grocery-deli', job: 'Deli Clerk', count: 1 },
        { area: 'grocery-backroom', job: 'Butcher', count: 1 },
        { area: 'grocery-backroom', job: 'Stocker', count: 1 },
        { area: 'grocery-floor', job: 'Produce Manager', count: 1 },
        { area: 'grocery-front', job: 'Store Manager', count: 1 },
        { area: 'grocery-floor', count: 3 },
        { area: 'grocery-lot', count: 1 },
      ],
      groundAt(x: number, z: number) {
        const l = f.toLocal(new THREE.Vector3(x, 0, z));
        const g = localGround(l.x, l.z);
        return Number.isNaN(g) ? NaN : g + f.oy;
      },
      setup: (ctx) => setupGrocery(ctx, f),
    };
  },
};
