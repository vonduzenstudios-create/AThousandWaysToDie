/**
 * Shared coordinates for the city (one unit = one voxel). The builder, the props and the
 * death logic all read these so a landmark only has to move in one place.
 *
 * x runs west to east, z runs north to south. The island is ringed by water:
 * the Hudson on the west, the East River on the east, the bay north of the airport
 * and the harbor on the south.
 */

export const SX = 512;
export const SY = 64;
export const SZ = 640;

/** Street level: the first air block above the pavement. */
export const G = 12;
/** Water surface height. Quays stand two blocks above it. */
export const WATER = 10;
/** Floor of the subway tunnel and the sewer (standing height). */
export const TUNNEL_FLOOR = 3;
export const SEWER_FLOOR = 1;

/** Land rectangle; everything outside is water. */
export const LAND = { x0: 12, z0: 4, x1: 469, z1: 551 };

/** Avenue centerlines (north-south). Roadway is c-5..c+4, sidewalks 3 wide either side. */
export const AVES = [72, 138, 204, 270, 336, 402, 458];
export const AVE_HALF = 5;
/** Street centerlines (east-west). Roadway is c-4..c+3, sidewalks 3 wide either side. */
export const STREETS = [258, 304, 350, 396, 442, 488, 534];
export const ST_HALF = 4;
export const WALK = 3;

/** Grid extent (outer sidewalk edges). */
export const GRID = { x0: AVES[0] - AVE_HALF - WALK, x1: AVES[6] + AVE_HALF - 1 + WALK, z0: STREETS[0] - ST_HALF - WALK, z1: STREETS[6] + ST_HALF - 1 + WALK };

/** Block interiors between the sidewalks: col i is between AVES[i] and AVES[i+1]. */
export function blockRect(col: number, row: number) {
  return {
    x0: AVES[col] + AVE_HALF + WALK,
    x1: AVES[col + 1] - AVE_HALF - WALK - 1,
    z0: STREETS[row] + ST_HALF + WALK,
    z1: STREETS[row + 1] - ST_HALF - WALK - 1,
  };
}
export type Rect = { x0: number; z0: number; x1: number; z1: number };

/** Central Park covers two blocks by two blocks (and the roads between them). */
export const PARK: Rect = { x0: blockRect(2, 1).x0, z0: blockRect(2, 1).z0, x1: blockRect(3, 2).x1, z1: blockRect(3, 2).z1 };
export const POND = { x: 300, z: 334, rx: 14, rz: 9 };

/** The Mortalis Mutual HQ tower faces the park across 284th... er, the street. */
export const MORTALIS = blockRect(3, 3);
/** Construction site: two blocks merged (street 238 is closed there). */
export const SITE: Rect = { x0: blockRect(5, 1).x0, z0: blockRect(5, 1).z0, x1: blockRect(5, 2).x1, z1: blockRect(5, 2).z1 };
/** Little Italy. */
export const ITALY: Rect = { x0: blockRect(0, 4).x0, z0: blockRect(0, 4).z0, x1: blockRect(1, 5).x1, z1: blockRect(1, 5).z1 };
/** Grand Central-ish station building, next to the rail yard. */
export const STATION = blockRect(0, 1);

/** Rail yard west of the grid: four tracks running north-south. */
export const RAIL = { x0: 16, x1: 58, z0: 248, z1: 548, tracks: [22, 31, 42, 51], live: 31 };
/** Island platform between tracks 31 and 42. */
export const RAIL_PLATFORM = { x0: 35, x1: 38, z0: 312, z1: 382 };

/** Subway: runs under street 238 the full width of the island. */
export const SUBWAY = {
  z: 350,
  /** Track bed z range (two rails + third rail). */
  bedZ0: 345,
  bedZ1: 352,
  /** Platform along the south wall in the station section. */
  platZ0: 353,
  platZ1: 357,
  stationX0: 140,
  stationX1: 202,
  /** Stair down from the south sidewalk, descending eastward. */
  stairX0: 150,
  liveRailZ: 345.6,
  trainZ: 349,
};

/**
 * The airport is its own module (src/places/airport.ts, airport thread). This is its lot:
 * x 96..415, z 8..231 at street level, landside facing the access road on its +z side.
 */
export const AIRPORT_LOT = { x: 96, z: 8, sx: 320, sz: 224 };
/** Access road along the airport's south edge, centered on z = 240. */
export const AIRPORT_ROAD_Z = 240;

/** Hospital lot (src/places/hospital.ts, hospital thread): 66 x 50, entrance on its -z side. */
export const HOSPITAL_LOT = { x: 360, z: 450, sx: 66, sz: 50 };

/** Harbor piers sticking south into the water. */
export const PIERS = {
  mob: { x0: 84, x1: 92, z0: 552, z1: 604 },
  ferry: { x0: 214, x1: 236, z0: 552, z1: 590 },
  cargo: { x0: 300, x1: 380, z0: 552, z1: 582 },
};
export const LIBERTY = { x: 440, z: 598, r: 14 };

export const CITY_NAME = 'Big Apple City';
