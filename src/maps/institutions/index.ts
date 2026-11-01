/**
 * Blackrock Penitentiary and Pinecrest Asylum.
 *
 * - Register `prison` and `asylum` with the map loader. Routes are in src/maps/routes.ts
 *   (city bus to `prison:visitor` and `asylum:gate`).
 * - `arrest(game, reason)` and `commit(game, reason)` send the current body there from any map
 *   through `GameApi.travelTo('prison:intake' | 'asylum:intake')`. The destination books or admits them.
 * - `prisonLife` / `asylumLife` are the LifeMaps for the NPC life system (also on MapBuild.life).
 * - Try them standalone before the loader lands: npm run dev, then open /maptest.html?map=prison&job=Inmate.
 */
export { prison, PRISON_DEATHS } from './prison';
export { asylum, ASYLUM_DEATHS } from './asylum';
export { arrest, commit } from './common';
export { prisonLife, asylumLife, INSTITUTION_PROFILES } from './life';

import { asylum } from './asylum';
import { prison } from './prison';
export const INSTITUTION_MAPS = [prison, asylum];
