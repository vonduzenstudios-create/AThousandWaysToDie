import type { TravelKind } from './types';

/**
 * Transit routes between stops, written as `${mapId}:${stopId}`. Every route runs both ways.
 *
 * fare: what a ticket costs from the insurance balance.
 * unlockAt: lifetime insurance payouts (ledger.total) needed before the route opens.
 *   This is how payouts unlock farther destinations.
 */
export interface Route {
  a: string;
  b: string;
  kind: TravelKind;
  fare: number;
  unlockAt: number;
  /** Trip length shown on the ticket, in in-game minutes. */
  minutes: number;
}

export const ROUTES: Route[] = [
  // Smallville <-> the city, by bus and by train.
  { a: 'smallville:bus', b: 'city:bus', kind: 'bus', fare: 25, unlockAt: 0, minutes: 40 },
  { a: 'smallville:train', b: 'city:train', kind: 'train', fare: 60, unlockAt: 2000, minutes: 25 },
  // Smallville <-> the beach and the wilderness by bus.
  { a: 'smallville:bus', b: 'beach:bus', kind: 'bus', fare: 40, unlockAt: 1500, minutes: 70 },
  { a: 'smallville:bus', b: 'wilderness:bus', kind: 'bus', fare: 55, unlockAt: 4000, minutes: 95 },
  // The city's harbor and airport reach the far places.
  { a: 'city:harbor', b: 'beach:harbor', kind: 'boat', fare: 150, unlockAt: 6000, minutes: 120 },
  { a: 'city:airport', b: 'wilderness:airport', kind: 'plane', fare: 600, unlockAt: 15000, minutes: 300 },
  { a: 'city:train', b: 'wilderness:train', kind: 'train', fare: 120, unlockAt: 9000, minutes: 180 },
];

/** Routes leaving a stop, oriented so `to` is the far end. Routes to maps that aren't registered are skipped. */
export function routesFrom(stopKey: string, known: (mapId: string) => boolean) {
  const out: (Route & { to: string })[] = [];
  for (const r of ROUTES) {
    const to = r.a === stopKey ? r.b : r.b === stopKey ? r.a : null;
    if (to && known(to.split(':')[0])) out.push({ ...r, to });
  }
  return out;
}
