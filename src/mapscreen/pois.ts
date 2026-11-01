import type { DeathDef } from '../deaths';

/** What a point of interest is, for its icon, color and the legend filter. */
export type PoiKind = 'shop' | 'food' | 'bar' | 'work' | 'civic' | 'transit' | 'attraction' | 'park' | 'home' | 'death' | 'atm' | 'ride';

/** One point of interest on the full-screen map. */
export interface MapPoi {
  id: string;
  x: number;
  z: number;
  name: string;
  kind: PoiKind;
  /** One or two characters on the badge. Defaults to the kind's icon. */
  label?: string;
  /** Badge color. Defaults to the kind's color. */
  color?: string;
  /** Extra lines in the tooltip (what it sells, hours). */
  info?: string[];
  /** Only these jobs are let in. Shown as a lock on the badge. */
  staffOnly?: string[];
  /** Ids of deaths that happen here. Found ones are named in the tooltip, the rest stay "???". */
  deaths?: string[];
}

export interface PoiStyle {
  name: string;
  label: string;
  color: string;
}

/** Legend order, icons and colors. */
export const POI_STYLE: Record<PoiKind, PoiStyle> = {
  death: { name: 'Death spots', label: '☠', color: '#ff5a6a' },
  transit: { name: 'Bus · train · travel', label: 'B', color: '#5a9aff' },
  shop: { name: 'Shops', label: 'S', color: '#ffb84a' },
  food: { name: 'Food', label: 'F', color: '#ff8f5a' },
  bar: { name: 'Bars', label: 'b', color: '#d07aff' },
  civic: { name: 'Public buildings', label: 'C', color: '#9fd6f0' },
  work: { name: 'Workplaces', label: 'W', color: '#c9a36a' },
  attraction: { name: 'Landmarks', label: '★', color: '#ffe066' },
  park: { name: 'Parks', label: 'P', color: '#8fdc6a' },
  ride: { name: 'Rides · ramps', label: 'R', color: '#5ae0c8' },
  atm: { name: 'ATMs', label: '$', color: '#5ad17a' },
  home: { name: 'Homes', label: 'H', color: '#d8d8d8' },
};

/** A place as the town layout and the NPC life system describe it (Place / LifePlace). */
export interface PlaceLike {
  id: string;
  name: string;
  kind: string;
  door: { x: number; z: number };
  inside?: { min: { x: number; z: number }; max: { x: number; z: number } };
  hours?: [number, number];
  sells?: { item: string; price: number }[];
  allowedJobs?: string[];
  tags?: string[];
}

const KIND_OF: Record<string, PoiKind> = {
  shop: 'shop', food: 'food', bar: 'bar', work: 'work', civic: 'civic', transit: 'transit',
  attraction: 'attraction', park: 'park', beach: 'park', worship: 'civic', home: 'home',
};

/** Special icons for well known buildings, by a word in their name. */
const NAME_ICON: [RegExp, string, string?][] = [
  [/hospital/i, '+', '#ff5a5a'],
  [/police|sheriff/i, 'P', '#7ab0ff'],
  [/fire (dept|station)/i, 'F', '#ff6a3a'],
  [/church|chapel/i, '✝'],
  [/bank/i, '$'],
  [/school/i, 'Sc'],
  [/garage/i, 'G'],
  [/diner|bakery|pizza|burger|deli|subs/i, 'F'],
  [/airport/i, '✈'],
  [/station/i, 'T'],
];

const hr = (h: number) => {
  const m = ((h % 24) + 24) % 24;
  return m === 0 ? '12am' : m === 12 ? 'noon' : m < 12 ? `${m}am` : `${m - 12}pm`;
};

/**
 * Points of interest from a map's places and travel stops. Homes are left out (there are
 * hundreds) except ones tagged `poi` or the player's story homes passed in `keepHomes`.
 */
export function poisFromPlaces(places: PlaceLike[], stops: { id: string; name: string; kind: string; pos: { x: number; z: number } }[] = [], keepHomes: string[] = []): MapPoi[] {
  const out: MapPoi[] = [];
  const seen = new Set<string>();
  for (const p of places) {
    const kind = KIND_OF[p.kind] ?? 'attraction';
    if (p.kind === 'bench') continue;
    if (kind === 'home' && !keepHomes.includes(p.id) && !p.tags?.includes('poi')) continue;
    // Skip near-duplicates (the life map lists some places twice).
    const key = p.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const info: string[] = [];
    if (p.sells?.length) info.push('Sells ' + p.sells.slice(0, 4).map((s) => `${s.item} ($${s.price})`).join(', '));
    if (p.hours) info.push(p.hours[0] === 0 && p.hours[1] === 24 ? 'Open 24 hours' : `Open ${hr(p.hours[0])} to ${hr(p.hours[1])}`);
    if (p.tags?.includes('locked')) info.push('Fenced off');
    const icon = NAME_ICON.find(([re]) => re.test(p.name));
    // Mark big outdoor places at their middle, buildings at their door.
    const big = p.inside && (p.inside.max.x - p.inside.min.x) * (p.inside.max.z - p.inside.min.z) > 1600 && (kind === 'park' || kind === 'attraction');
    out.push({
      id: p.id,
      x: big ? (p.inside!.min.x + p.inside!.max.x) / 2 : p.door.x,
      z: big ? (p.inside!.min.z + p.inside!.max.z) / 2 : p.door.z,
      name: p.name,
      kind,
      label: icon?.[1],
      color: icon?.[2],
      info: info.length ? info : undefined,
      staffOnly: p.allowedJobs?.length ? p.allowedJobs : undefined,
    });
  }
  for (const s of stops) {
    // A place may already stand on the stop (the station building).
    if (out.some((p) => p.kind === 'transit' && Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < 12)) continue;
    out.push({ id: `stop:${s.id}`, x: s.pos.x, z: s.pos.z, name: s.name, kind: 'transit', label: s.kind === 'train' ? 'T' : s.kind === 'plane' ? '✈' : s.kind === 'boat' ? '⚓' : 'B' });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Put each death on the map where its `location` says it happens. A death joins the place
 * whose name matches its location (exactly, or one name containing the other), or a spot from
 * `extra` (location name -> a position, or the id of the place it belongs to) for spots the names
 * don't line up on. Deaths that happen "Anywhere" are left off. Returns the deaths that found no
 * home, for tests.
 */
export function placeDeaths(pois: MapPoi[], deaths: DeathDef[], extra: Record<string, { x: number; z: number } | string> = {}): DeathDef[] {
  const missed: DeathDef[] = [];
  const extraPois = new Map<string, MapPoi>();
  for (const d of deaths) {
    const loc = norm(d.location);
    if (/^any/.test(loc)) continue;
    const spot = Object.entries(extra).find(([k]) => norm(k) === loc);
    let target: MapPoi | undefined;
    if (spot && typeof spot[1] === 'string') {
      const id = spot[1];
      target = pois.find((p) => p.id === id);
    } else if (spot) {
      const pos = spot[1] as { x: number; z: number };
      target = extraPois.get(spot[0]);
      if (!target) {
        // A spot right on top of a place joins that place's badge.
        target = pois.find((p) => p.kind !== 'death' && Math.hypot(p.x - pos.x, p.z - pos.z) < 4);
        if (!target) {
          target = { id: `death:${norm(spot[0]).replace(/ /g, '-')}`, x: pos.x, z: pos.z, name: spot[0], kind: 'death' };
          pois.push(target);
        }
        extraPois.set(spot[0], target);
      }
    } else {
      target =
        pois.find((p) => norm(p.name) === loc) ??
        pois
          .filter((p) => {
            const n = norm(p.name);
            return n.length >= 6 && (loc.includes(n) || n.includes(loc));
          })
          .sort((a, b) => b.name.length - a.name.length)[0];
    }
    if (!target) {
      missed.push(d);
      continue;
    }
    (target.deaths ??= []).push(d.id);
  }
  return missed;
}
