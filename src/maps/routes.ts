import type { TravelKind } from './types';

/**
 * Transit routes between stops, written as `${mapId}:${stopId}`. Every route runs both ways.
 *
 * fare: what a ticket costs from the insurance balance.
 * unlock: the route opens once Gary has found `deaths` unique deaths on map `map`
 *   (Matthew's progression: 25 in the small town opens the bus, 25 in the city opens the
 *   harbor, 25 more opens the airport). Leave it out for routes that are always open.
 */
export interface Route {
  a: string;
  b: string;
  kind: TravelKind;
  fare: number;
  unlock?: { map: string; deaths: number };
  /** Trip length shown on the ticket, in in-game minutes. */
  minutes: number;
}

/** Unique deaths needed per milestone. */
export const DEATHS_PER_UNLOCK = 25;

export const ROUTES: Route[] = [
  // Ticket prices follow the death design doc: bus $20, train $50, ferry $80, flight $400.
  // 25 deaths in Smallville: Death lets you take the bus (and the train) to the city.
  { a: 'smallville:bus', b: 'city:bus', kind: 'bus', fare: 20, minutes: 40, unlock: { map: 'smallville', deaths: DEATHS_PER_UNLOCK } },
  { a: 'smallville:train', b: 'city:train', kind: 'train', fare: 50, minutes: 25, unlock: { map: 'smallville', deaths: DEATHS_PER_UNLOCK } },
  // 25 deaths in the city: the harbor's boats to faraway places.
  { a: 'city:harbor', b: 'beach:harbor', kind: 'boat', fare: 80, minutes: 120, unlock: { map: 'city', deaths: DEATHS_PER_UNLOCK } },
  // 25 more in the city: the airport.
  { a: 'city:airport', b: 'wilderness:airport', kind: 'plane', fare: 400, minutes: 300, unlock: { map: 'city', deaths: DEATHS_PER_UNLOCK * 2 } },
  { a: 'city:airport', b: 'beach:seaplane', kind: 'plane', fare: 400, minutes: 50, unlock: { map: 'city', deaths: DEATHS_PER_UNLOCK * 2 } },
  // Once a place is open, local links between places you can already reach.
  { a: 'beach:bus', b: 'wilderness:bus', kind: 'bus', fare: 20, minutes: 90, unlock: { map: 'beach', deaths: DEATHS_PER_UNLOCK } },
  { a: 'city:train', b: 'wilderness:train', kind: 'train', fare: 50, minutes: 180, unlock: { map: 'wilderness', deaths: DEATHS_PER_UNLOCK } },
  // 25 deaths in the city: visitor shuttles to the prison and the asylum. (Or get arrested / committed for free.)
  { a: 'city:bus', b: 'prison:visitor', kind: 'bus', fare: 45, minutes: 60, unlock: { map: 'city', deaths: DEATHS_PER_UNLOCK } },
  { a: 'city:bus', b: 'asylum:gate', kind: 'bus', fare: 45, minutes: 75, unlock: { map: 'city', deaths: DEATHS_PER_UNLOCK } },
];

/** Routes leaving a stop, oriented so `to` is the far end. Routes to stops that don't exist are skipped. */
export function routesFrom(stopKey: string, known: (stopKey: string) => boolean) {
  const out: (Route & { to: string })[] = [];
  for (const r of ROUTES) {
    const to = r.a === stopKey ? r.b : r.b === stopKey ? r.a : null;
    if (to && known(to)) out.push({ ...r, to });
  }
  return out;
}

/** A stable key for a route, used for unlock events and saves. */
export const routeKey = (r: Route) => `${r.a}<>${r.b}`;
