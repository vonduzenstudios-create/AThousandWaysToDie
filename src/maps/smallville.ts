import { G, HEIGHT, SIZE, buildTown, type TownInfo } from '../town';
import type { MapBuild, MapDef } from './types';

/** Smallville's build carries the TownInfo that game.ts uses for the original deaths. */
export interface SmallvilleBuild extends MapBuild {
  town: TownInfo;
}

export const smallville: MapDef = {
  id: 'smallville',
  name: 'Smallville',
  size: { x: SIZE, y: HEIGHT, z: SIZE },
  build(world): SmallvilleBuild {
    const town = buildTown(world);
    // The bus stop (Main St, by town hall) and the station (north tracks) are built by town.ts.
    const stops = town.transit;
    return {
      town,
      spawn: town.spawn,
      groundAt: () => G,
      areas: town.areas,
      stops,
    };
  },
};
