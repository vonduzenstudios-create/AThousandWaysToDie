/**
 * City General Hospital, a drop-in place for any map.
 *
 *   const info = buildHospital(world, { x, y, z }, rng);   // in MapDef.build, y = first air block
 *   const rt = setupHospital(ctx, info);                    // in MapDef.setup, merge rt into the map's runtime
 *   deaths: [...HOSPITAL_DEATHS]                            // on the MapDef
 *
 * Footprint 64 x 48 (x by z) plus a 3-block canopy on the -z side (the entrance), 40 tall.
 * Upper floors are reached by stairs and the elevator; only HOSPITAL_STAFF jobs get past the lobby.
 */
import * as THREE from 'three';
import { B, type VoxelWorld } from '../../voxel';
import { HOSP_W } from './layout';

export { buildHospital, HOSP_W, HOSP_D, type HospitalInfo } from './layout';
export { setupHospital, HOSPITAL_STAFF, MEDICAL, SURGICAL } from './runtime';
export { HOSPITAL_DEATHS } from './deaths';

/**
 * Dev only: Smallville with an annex south of the railroad holding the hospital, so it
 * can be played before the city map lands. Open the game with ?place=hospital.
 */
export function devAnnexGround(w: VoxelWorld, size: number, g: number, z0: number) {
  for (let x = 0; x < size; x++)
    for (let z = z0; z < w.sz; z++) {
      w.set(x, 0, z, B.Stone);
      w.set(x, 1, z, B.Dirt);
      w.set(x, 2, z, B.Dirt);
      w.set(x, g - 1, z, B.Grass);
    }
  w.fill(77, g - 1, z0, 83, g - 1, z0 + 11, B.Asphalt);
  w.fill(75, g - 1, z0, 76, g - 1, z0 + 11, B.Sidewalk);
  w.fill(84, g - 1, z0, 85, g - 1, z0 + 11, B.Sidewalk);
  w.fill(30, g - 1, z0 + 6, 130, g - 1, z0 + 11, B.Asphalt);
  w.fill(30, g - 1, z0 + 12, 130, g - 1, z0 + 15, B.Sidewalk);
  return { origin: new THREE.Vector3(48, g, z0 + 16), width: HOSP_W };
}
