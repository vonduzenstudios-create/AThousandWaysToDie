import type { LifeMap, LifePlace } from '../life/types';
import { voxelNav } from '../life/nav';
import type { MapBuild, MapDef } from '../maps/types';
import type { VoxelWorld } from '../voxel';

/**
 * A basic LifeMap for maps that don't describe their own (placeholders, early maps): every
 * transit stop becomes a 'transit' place and every area a 'park', so townsfolk wander between
 * them and use the buses. Maps with real places should return MapBuild.life instead.
 */
export function autoLifeMap(def: MapDef, build: MapBuild, world: VoxelWorld, ground: number): LifeMap {
  const places: LifePlace[] = [];
  for (const s of build.stops)
    places.push({ id: s.id, name: s.name, kind: 'transit', door: { x: s.pos.x, y: s.pos.y, z: s.pos.z } });
  for (const [id, b] of Object.entries(build.areas))
    places.push({
      id: `area-${id}`,
      name: id,
      kind: 'park',
      door: { x: (b.min.x + b.max.x) / 2, y: ground, z: (b.min.z + b.max.z) / 2 },
      inside: b,
    });
  return {
    id: def.id,
    name: def.name,
    nav: voxelNav(world, { maxFloor: ground + 3, maxStep: 1.1 }),
    places,
    population: { count: Math.min(30, 6 + places.length * 3) },
  };
}
