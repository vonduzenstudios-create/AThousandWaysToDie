import { DEATHS, DEATH_BY_ID } from '../deaths';
import type { MapDef } from './types';
import { smallville } from './smallville';
import { beach, wilderness } from './placeholders';
import { CITY_MAP } from './city';

/**
 * Every map in the game. To add one: export a MapDef from src/maps/<id>.ts (or <id>/index.ts)
 * and add it here (replace the placeholder with the same id). Then add its routes to routes.ts.
 */
export const MAPS: MapDef[] = [smallville, CITY_MAP, beach, wilderness];

export const MAP_BY_ID: Record<string, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]));

// Map-specific deaths join the ledger.
for (const m of MAPS)
  for (const d of m.deaths ?? [])
    if (!DEATH_BY_ID[d.id]) {
      DEATHS.push(d);
      DEATH_BY_ID[d.id] = d;
    }
