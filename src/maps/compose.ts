import type { MapBuild, MapContext, MapRuntime, TravelStop } from './types';
import type { Box } from '../town';

/**
 * Glue for maps built out of several self-contained places (the city's airport, hospital,
 * grocery store...). Each place returns its own MapRuntime; this merges them into one.
 *
 * Interactable ids must be unique across the parts (prefix them, e.g. 'airport:belt').
 * interact(id) goes to the part that listed the id. onLand stops at the first part that
 * handles the landing.
 */
export function composeRuntimes(parts: (MapRuntime | null | undefined)[]): MapRuntime {
  const rts = parts.filter((p): p is MapRuntime => !!p);
  return {
    // A getter so parts can add or remove interactables at runtime.
    get interactables() {
      return rts.flatMap((r) => r.interactables ?? []);
    },
    interact(id: string) {
      for (const r of rts) if (r.interactables?.some((i) => i.id === id)) return r.interact?.(id);
    },
    update(dt: number, t: number) {
      for (const r of rts) r.update?.(dt, t);
    },
    step(h: number) {
      for (const r of rts) r.step?.(h);
    },
    checkHazards(h: number) {
      for (const r of rts) r.checkHazards?.(h);
    },
    onLand(e) {
      for (const r of rts) if (r.onLand?.(e)) return true;
      return false;
    },
    get npcs() {
      return rts.flatMap((r) => r.npcs ?? []);
    },
    onBody(file) {
      for (const r of rts) r.onBody?.(file);
    },
    dispose() {
      for (const r of rts) r.dispose();
    },
  };
}

/** What a sub-place stamped into a bigger map hands back to it. */
export interface PlacePart {
  areas?: Record<string, Box>;
  stops?: TravelStop[];
  roads?: MapBuild['roads'];
  setup?(ctx: MapContext): MapRuntime;
}

/** Merge a place's areas, stops and roads into a map build (mutates `into`). */
export function mergePart(into: MapBuild, part: PlacePart) {
  if (part.areas) Object.assign(into.areas, part.areas);
  if (part.stops) into.stops.push(...part.stops);
  if (part.roads) (into.roads ??= []).push(...part.roads);
}
