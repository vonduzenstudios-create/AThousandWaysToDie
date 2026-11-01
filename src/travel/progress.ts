import type { Ledger } from '../deaths';
import { ROUTES, routeKey, type Route } from '../maps/routes';

/**
 * Story progression: unique deaths per map open new routes. When a route opens, an unlock event
 * fires once per save so the cutscene thread can play Death's milestone scene.
 *
 *   import { onUnlock } from './travel/progress';
 *   onUnlock((e) => playCutscene(e.milestone, e));
 */
export interface UnlockEvent {
  /** e.g. 'smallville:25' — the map and death count that was reached. Stable id for a cutscene. */
  milestone: string;
  /** The map whose deaths opened it, and how many unique deaths it took. */
  map: string;
  deaths: number;
  /** Routes that just opened (both ends listed as written in routes.ts). */
  routes: Route[];
}

type Listener = (e: UnlockEvent) => void;
const listeners = new Set<Listener>();

export function onUnlock(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const SAVE_KEY = 'clv-unlocks-v1';
const devUnlockAll = typeof location !== 'undefined' && new URLSearchParams(location.search).has('unlockall');

/** Unique deaths found on a map. */
export function deathsOn(ledger: Ledger, map: string) {
  let n = 0;
  for (const f of Object.values(ledger.found)) if ((f.map ?? 'smallville') === map) n++;
  return n;
}

export function isOpen(ledger: Ledger, r: Route) {
  return devUnlockAll || !r.unlock || deathsOn(ledger, r.unlock.map) >= r.unlock.deaths;
}

/** Why a route is locked, for the ticket window. */
export function lockReason(ledger: Ledger, r: Route) {
  if (isOpen(ledger, r) || !r.unlock) return null;
  const have = deathsOn(ledger, r.unlock.map);
  return `${have}/${r.unlock.deaths} deaths in ${r.unlock.map === 'smallville' ? 'Smallville' : r.unlock.map}`;
}

function loadAnnounced(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

/** Call after every claim. Fires an UnlockEvent for each milestone newly reached. Returns them. */
export function checkUnlocks(ledger: Ledger): UnlockEvent[] {
  const announced = loadAnnounced();
  const byMilestone = new Map<string, UnlockEvent>();
  for (const r of ROUTES) {
    if (!r.unlock || announced.has(routeKey(r)) || !isOpen(ledger, r)) continue;
    const milestone = `${r.unlock.map}:${r.unlock.deaths}`;
    const e = byMilestone.get(milestone) ?? { milestone, map: r.unlock.map, deaths: r.unlock.deaths, routes: [] };
    e.routes.push(r);
    byMilestone.set(milestone, e);
    announced.add(routeKey(r));
  }
  if (!byMilestone.size) return [];
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify([...announced]));
  } catch {
    /* session only */
  }
  const events = [...byMilestone.values()];
  for (const e of events) for (const fn of listeners) fn(e);
  return events;
}
