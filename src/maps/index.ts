import { registerMapDeaths } from '../deaths';
import type { MapDef } from './types';
import { smallville } from './smallville';
import { WILDERNESS } from './wilderness';
import { BEACH } from './beach';
import { CITY_MAP } from './city';

/**
 * Every map in the game. To add one: export a MapDef from src/maps/<id>.ts (or <id>/index.ts)
 * and add it here. Then add its routes to routes.ts.
 */
export const MAPS: MapDef[] = [smallville, CITY_MAP, BEACH, WILDERNESS];

export const MAP_BY_ID: Record<string, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]));

// Map-specific deaths join the ledger.
for (const m of MAPS) registerMapDeaths(m.deaths ?? [], m.id);
