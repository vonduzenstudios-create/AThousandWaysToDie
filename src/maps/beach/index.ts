import * as THREE from 'three';
import type { MapDef } from '../types';
import { box } from '../../town';
import { BeachRuntime } from './beach';
import { defineBeachBlocks } from './blocks';
import { BEACH_DEATHS } from './deaths';
import { beachLife } from './life';
import { buildBeach, DECK, GL, SEA, SX, SY, SZ } from './world';

/**
 * Sandy Shores: beach town, boardwalk, pier, harbor, reef and open ocean.
 * Arrive by bus from Smallville, by ferry from the city harbor, or by seaplane.
 */
export const BEACH: MapDef = {
  id: 'beach',
  name: 'Sandy Shores',
  size: { x: SX, y: SY, z: SZ },
  sky: { top: 0x2f8fe8, bottom: 0xd8f0ff, fogNear: 140, fogFar: 460 },
  waterLevel: SEA,
  deaths: BEACH_DEATHS,
  build(world) {
    defineBeachBlocks();
    const L = buildBeach(world);
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const hwyZ = 156;
    return {
      spawn: L.spawn,
      areas: L.areas,
      roads: L.roads,
      groundAt(x, z) {
        const xi = Math.floor(x), zi = Math.floor(z);
        if (xi < 0 || zi < 0 || xi >= SX || zi >= SZ) return NaN;
        const top = world.topY(xi, zi);
        if (!Number.isNaN(L.water[zi * SX + xi]) && top < 9) return NaN;
        return top;
      },
      stops: [
        {
          id: 'bus',
          kind: 'bus',
          name: 'Sandy Shores Bus Stop',
          pos: L.busStop.clone(),
          facing: 0,
          board: box(L.busStop.x - 6, GL, L.busStop.z - 3, L.busStop.x + 6, GL, L.busStop.z + 2),
          lane: { from: v(SX - 4, GL, hwyZ - 2), stop: v(L.busStop.x, GL, hwyZ - 2), to: v(8, GL, hwyZ - 2) },
        },
        {
          id: 'harbor',
          kind: 'boat',
          name: 'Sandy Shores Ferry Dock',
          pos: L.harbor.ferryDock.clone(),
          facing: Math.PI,
          lane: { from: v(706, SEA, 620), stop: v(705, SEA, 320), to: v(706, SEA, 620) },
        },
        {
          id: 'seaplane',
          kind: 'plane',
          name: 'SkyHop Seaplane Dock',
          pos: L.harbor.seaplaneDock.clone(),
          facing: Math.PI,
          lane: { from: v(752, SEA, 620), stop: v(752, SEA, 290), to: v(752, SEA, 620) },
        },
      ],
      life: beachLife(world, L),
      setup(ctx) {
        return new BeachRuntime(ctx, L);
      },
    };
  },
};

export { DECK };
