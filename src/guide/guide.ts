import { DEATHS, mapOfDeath, type Ledger, type PersonFile } from '../deaths';
import { DEATH_HINTS, suits, type HintNeeds } from '../hints';
import { MAPS, MAP_BY_ID } from '../maps';
import { ROUTES, type Route } from '../maps/routes';
import { deathsOn, isOpen } from '../travel/progress';
import type { MapPoi } from '../mapscreen/pois';

/**
 * Player guidance: what to do right now, the next unlock, leads toward unfound deaths and a
 * per-area progress summary. Pure functions over the ledger and the current map's POIs, so the
 * HUD, the ledger and Death's nudges all read the same answers.
 *
 * Leads only name the place and what kind of body it takes. How to die there stays a secret
 * (Intrusive Thoughts and depressed townsfolk drop those hints).
 */

const mapName = (id: string) => MAP_BY_ID[id]?.name ?? id;
const mapOfStop = (key: string) => key.split(':')[0];
const KIND_WORD: Record<string, string> = { bus: 'bus', train: 'train', boat: 'ferry', plane: 'flight' };

const an = (w: string) => `${/^([AEIOU]|EMT)/i.test(w) ? 'an' : 'a'} ${w}`;

/** "a Farmhand", "a Nurse or Doctor", "an athletic body", "a peanut allergy". Empty if anyone can. */
export function needsText(n: HintNeeds | undefined): string {
  if (!n) return '';
  const bits: string[] = [];
  if (n.jobs?.length) {
    const jobs = n.jobs.slice(0, 3);
    bits.push(an(jobs.length > 1 ? `${jobs.slice(0, -1).join(', ')} or ${jobs[jobs.length - 1]}` : jobs[0]));
  }
  if (n.physical?.length === 1) bits.push(n.physical[0] === 'Athlete' ? 'an athletic body' : n.physical[0] === 'Feeble' ? 'a frail body' : 'an average body');
  else if (n.physical?.length === 2 && !n.physical.includes('Feeble')) bits.push('a body that isn’t frail');
  if (n.mental?.length) bits.push(`a ${n.mental.join(' or ')} mind`);
  if (n.peanut) bits.push('a peanut allergy');
  if (!bits.length && n.notJobs?.length) bits.push(`anyone but ${an(n.notJobs[0])}`);
  return bits.join(' with ');
}

export interface Lead {
  name: string;
  x: number;
  z: number;
  /** Unfound deaths at this spot. */
  ids: string[];
  /** How many of those the current body can do (all of them for the ghost). */
  doable: number;
  /** What the spot takes, if nothing here suits this body. */
  needs: string;
  kind: 'death' | 'travel';
}

/**
 * Unfound death spots on this map, best first: ones this body can do, then the rest, each by
 * distance. With no body (ghost), every spot counts as doable and `needs` says what to look for.
 */
export function deathLeads(pois: MapPoi[], ledger: Ledger, body: PersonFile | null, at: { x: number; z: number }): Lead[] {
  const out: Lead[] = [];
  for (const p of pois) {
    const ids = (p.deaths ?? []).filter((id) => !ledger.found[id]);
    if (!ids.length) continue;
    const ok = ids.filter((id) => !body || !DEATH_HINTS[id] || suits(body, DEATH_HINTS[id]));
    // What the easiest death here needs: one with no needs wins, else the first that has some.
    const needy = ids.map((id) => DEATH_HINTS[id]?.needs).filter(Boolean) as HintNeeds[];
    const anyone = ids.some((id) => !DEATH_HINTS[id]?.needs);
    const needs = anyone ? '' : needsText(needy[0]);
    out.push({ name: p.name, x: p.x, z: p.z, ids, doable: body ? ok.length : ids.length, needs: body && ok.length ? '' : needs, kind: 'death' });
  }
  const d = (l: Lead) => Math.hypot(l.x - at.x, l.z - at.z);
  // The ghost can pick any body, but spots anyone can do come first so a new player isn't
  // sent hunting for a peanut allergy on their first try.
  const easy = (l: Lead) => Number(l.doable > 0) * 2 + Number(!body && !l.needs);
  return out.sort((a, b) => easy(b) - easy(a) || d(a) - d(b));
}

/** Unfound deaths on a map that have no spot on it ("Anywhere", "Any Road"...). */
export function looseDeaths(mapId: string, pois: MapPoi[], ledger: Ledger) {
  const placed = new Set(pois.flatMap((p) => p.deaths ?? []));
  return DEATHS.filter((d) => mapOfDeath(d.id) === mapId && !placed.has(d.id) && !ledger.found[d.id]);
}

export interface Milestone {
  map: string;
  need: number;
  have: number;
  /** "the bus and train to the City" */
  opens: string;
  routes: Route[];
}

function describe(routes: Route[], from: string) {
  const byDest = new Map<string, Set<string>>();
  for (const r of routes) {
    const ends = [mapOfStop(r.a), mapOfStop(r.b)];
    const dest = ends.find((m) => m !== from) ?? ends[1];
    (byDest.get(dest) ?? byDest.set(dest, new Set()).get(dest)!).add(KIND_WORD[r.kind] ?? r.kind);
  }
  return [...byDest]
    .map(([dest, kinds]) => `the ${[...kinds].join(' and ')} to ${mapName(dest)}`)
    .join(', ');
}

/** The next locked milestone earned by deaths on `mapId`, or null if everything it opens is open. */
export function nextMilestone(ledger: Ledger, mapId: string): Milestone | null {
  const locked = ROUTES.filter((r) => r.unlock?.map === mapId && !isOpen(ledger, r));
  if (!locked.length) return null;
  const need = Math.min(...locked.map((r) => r.unlock!.deaths));
  const routes = locked.filter((r) => r.unlock!.deaths === need);
  return { map: mapId, need, have: deathsOn(ledger, mapId), opens: describe(routes, mapId), routes };
}

/** Maps you can get to from Smallville over open routes. */
export function reachableMaps(ledger: Ledger) {
  const seen = new Set(['smallville']);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of ROUTES) {
      if (!isOpen(ledger, r)) continue;
      const a = mapOfStop(r.a), b = mapOfStop(r.b);
      if (!MAP_BY_ID[a] || !MAP_BY_ID[b]) continue;
      if (seen.has(a) !== seen.has(b)) {
        seen.add(a);
        seen.add(b);
        grew = true;
      }
    }
  }
  return seen;
}

/**
 * Open routes out of this map toward an area with no deaths filed yet: the "go somewhere new"
 * objective once a milestone is reached. Returns the stop to walk to.
 */
export function freshDeparture(ledger: Ledger, mapId: string, stops: { id: string; name: string; pos: { x: number; z: number } }[]) {
  for (const r of ROUTES) {
    if (!isOpen(ledger, r)) continue;
    for (const [here, there] of [[r.a, r.b], [r.b, r.a]]) {
      if (mapOfStop(here) !== mapId || !MAP_BY_ID[mapOfStop(there)]) continue;
      const dest = mapOfStop(there);
      if (deathsOn(ledger, dest) > 0) continue;
      const stop = stops.find((s) => s.id === here.split(':')[1]);
      if (stop) return { dest, destName: mapName(dest), kind: KIND_WORD[r.kind] ?? r.kind, stop };
    }
  }
  return null;
}

export interface AreaProgress {
  id: string;
  name: string;
  found: number;
  total: number;
  open: boolean;
  /** Why it's locked: "25 deaths in Smallville". */
  lock: string | null;
  next: Milestone | null;
}

/** Every area: deaths found here, whether you can get there, and what opens next. */
export function areaProgress(ledger: Ledger): AreaProgress[] {
  const reach = reachableMaps(ledger);
  return MAPS.map((m) => {
    const total = DEATHS.filter((d) => mapOfDeath(d.id) === m.id).length;
    const found = deathsOn(ledger, m.id);
    const open = reach.has(m.id);
    let lock: string | null = null;
    if (!open) {
      const into = ROUTES.filter((r) => r.unlock && [mapOfStop(r.a), mapOfStop(r.b)].includes(m.id));
      // Prefer a way in that's earned somewhere you can already go.
      const best = into.sort((a, b) => Number(reach.has(b.unlock!.map)) - Number(reach.has(a.unlock!.map)) || a.unlock!.deaths - b.unlock!.deaths)[0];
      if (best) lock = `${best.unlock!.deaths} deaths in ${mapName(best.unlock!.map)}`;
    }
    return { id: m.id, name: m.name, found, total, open, lock, next: nextMilestone(ledger, m.id) };
  });
}

export interface Objective {
  /** Short heading, e.g. "FIND A BODY". */
  head: string;
  /** What to do, one sentence. */
  line: string;
  /** Progress toward the next unlock (or toward finishing the area). */
  bar: { have: number; need: number; label: string };
  /** The lead J would track, with its one-line description. */
  lead: Lead | null;
  leadLine: string;
}

export interface GuideState {
  mode: 'ghost' | 'play' | 'other';
  mapId: string;
  ledger: Ledger;
  body: PersonFile | null;
  pois: MapPoi[];
  stops: { id: string; name: string; kind: string; pos: { x: number; z: number } }[];
  at: { x: number; z: number };
  /** Has the player ever possessed anyone (this save)? */
  possessedBefore: boolean;
  /** Key name for the lead button ("J", or "View → Y" on a pad). */
  leadKey: string;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.round(Math.hypot(a.x - b.x, a.z - b.z));

/** The objective panel's content for this moment. */
export function objective(s: GuideState): Objective {
  const { ledger, mapId } = s;
  const here = DEATHS.filter((d) => mapOfDeath(d.id) === mapId).length;
  const ms = nextMilestone(ledger, mapId);
  const have = deathsOn(ledger, mapId);
  const bar = ms
    ? { have: Math.min(have, ms.need), need: ms.need, label: `new deaths in ${mapName(mapId)} open ${ms.opens}` }
    : { have, need: Math.max(here, 1), label: `deaths found in ${mapName(mapId)}` };

  const leads = deathLeads(s.pois, ledger, s.body, s.at);
  const trip = freshDeparture(ledger, mapId, s.stops);
  let lead: Lead | null = leads[0] ?? null;
  let leadLine = '';
  if (lead) {
    const n = lead.ids.length;
    const what = `${lead.name}: ${n === 1 ? 'an unknown death' : `${n} unknown deaths`}, ${dist(lead, s.at)} m`;
    leadLine = lead.needs ? `${what}. Needs ${lead.needs}.` : `${what}.`;
  } else {
    const loose = looseDeaths(mapId, s.pois, ledger).length;
    if (loose) leadLine = `No marked spots left. ${loose} death${loose === 1 ? '' : 's'} here can happen anywhere: try roads, walls, rides and fights.`;
  }

  let head: string, line: string;
  if (s.mode === 'ghost') {
    if (!s.possessedBefore) {
      head = 'FIND A BODY';
      line = 'Look at someone and press E to read their file. Possess someone marked FAIR GAME (green on the radar).';
    } else if (lead?.needs) {
      head = 'FIND A BODY';
      line = `Your best lead needs ${lead.needs}. Read files until you find one.`;
    } else {
      head = 'FIND A BODY';
      line = 'Pick someone who is due (green on the radar) and possess them.';
    }
  } else if (trip && (!lead || lead.doable === 0)) {
    head = 'MOVE ON';
    line = `The ${trip.kind} to ${trip.destName} is open. Buy a ticket at ${trip.stop.name}.`;
    lead = { name: trip.stop.name, x: trip.stop.pos.x, z: trip.stop.pos.z, ids: [], doable: 1, needs: '', kind: 'travel' };
    leadLine = `${trip.stop.name}, ${dist(trip.stop.pos, s.at)} m.`;
  } else if (lead && lead.doable === 0) {
    head = 'WRONG BODY';
    line = `Nothing left nearby suits this body. Die any way you like and pick ${lead.needs || 'someone else'} next.`;
  } else {
    head = 'DIE SOMEWHERE NEW';
    line = trip
      ? `New deaths pay out and count toward unlocks. The ${trip.kind} to ${trip.destName} is open too.`
      : 'Only new deaths pay out and count toward the next unlock. Repeats get denied.';
  }
  if (lead) leadLine += ` Press ${s.leadKey} to track it.`;
  return { head, line, bar, lead, leadLine };
}

/** All leads in the order J cycles through them (death spots, then a fresh departure). */
export function leadCycle(s: GuideState): Lead[] {
  const leads = deathLeads(s.pois, s.ledger, s.body, s.at);
  const trip = freshDeparture(s.ledger, s.mapId, s.stops);
  if (trip) leads.push({ name: trip.stop.name, x: trip.stop.pos.x, z: trip.stop.pos.z, ids: [], doable: 1, needs: '', kind: 'travel' });
  return leads;
}
