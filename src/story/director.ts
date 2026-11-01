import { CutscenePlayer, type Scene } from './cutscene';
import { MILESTONES, OPENING, milestoneScene } from './scenes';
import { StorySfx } from './sfx';
import type { VehicleKind } from './art';

/**
 * A travel milestone, in the shape the travel system's onUnlock() reports:
 * milestone 'smallville:25' | 'city:25' | 'city:50' | ..., the map it was earned on,
 * how many unique deaths that took, and the routes it opened.
 */
export interface UnlockEvent {
  milestone: string;
  map: string;
  deaths?: number;
  routes?: { a: string; b: string; kind: VehicleKind }[];
}

const SAVE_KEY = 'cestlavie.story.v1';

/**
 * Fallback milestones used until the travel system reports its own unlocks.
 * Matthew's rule: every 25 unique deaths in an area opens the next way out.
 */
const FALLBACK: { milestone: string; map: string; need: number; to: string; kind: VehicleKind }[] = [
  { milestone: 'smallville:25', map: 'smallville', need: 25, to: 'city', kind: 'bus' },
  { milestone: 'city:25', map: 'city', need: 25, to: 'beach', kind: 'boat' },
  { milestone: 'city:50', map: 'city', need: 50, to: 'wilderness', kind: 'plane' },
];

/**
 * Decides which story scene plays when, remembers what's been seen, and pauses the game
 * while a scene runs.
 */
export class StoryDirector {
  private player: CutscenePlayer;
  private seen = new Set<string>();
  private queue: Scene[] = [];
  private running = false;

  /** Called with true when a scene starts and false when the last queued scene ends. */
  onPause: (paused: boolean) => void = () => {};

  constructor(getAudio: () => AudioContext | null) {
    this.player = new CutscenePlayer(new StorySfx(getAudio));
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) for (const id of JSON.parse(raw).seen ?? []) this.seen.add(id);
    } catch {
      /* fresh story save */
    }
  }

  /** True while a cutscene is on screen. The game skips its update while this is set. */
  get active() {
    return this.running;
  }

  /** Forget every scene seen (new game / erase save). */
  forget() {
    this.seen.clear();
    this.save();
  }

  hasSeen(id: string) {
    return this.seen.has(id);
  }

  /** Plays the opening if this save hasn't seen it. Resolves when it ends (or right away). */
  async opening(force = false) {
    if (!force && this.seen.has('opening')) return;
    await this.play(OPENING);
  }

  /** Hook for the travel system's onUnlock(). Plays the milestone's scene once per save. */
  unlock(e: UnlockEvent) {
    if (this.seen.has(e.milestone)) return;
    const scene = this.sceneFor(e);
    void this.play(scene);
  }

  /**
   * Fallback trigger: counts unique deaths per map in the ledger and fires milestones the
   * travel system hasn't reported. `found` is Ledger.found; entries without a map count as Smallville.
   */
  checkLedger(found: Record<string, object>) {
    const perMap: Record<string, number> = {};
    for (const f of Object.values(found)) {
      const m = (f as { map?: string }).map ?? 'smallville';
      perMap[m] = (perMap[m] ?? 0) + 1;
    }
    for (const m of FALLBACK) {
      if ((perMap[m.map] ?? 0) >= m.need && !this.seen.has(m.milestone)) {
        this.unlock({ milestone: m.milestone, map: m.map, deaths: m.need, routes: [{ a: `${m.map}:x`, b: `${m.to}:x`, kind: m.kind }] });
      }
    }
  }

  /** Every scene id this build knows, for the debug menu and ?cutscene=. */
  get sceneIds() {
    return ['opening', ...Object.keys(MILESTONES)];
  }

  /** Plays a scene by id regardless of save state (debug and replays). */
  replay(id: string) {
    if (id === 'opening') return this.play(OPENING, false);
    const known = MILESTONES[id];
    if (known) return this.play(known, false);
    const [map, n] = id.split(':');
    return this.play(milestoneScene(id, map, 'somewhere new', 'train', Number(n) || 25, this.seen.size), false);
  }

  private sceneFor(e: UnlockEvent): Scene {
    const known = MILESTONES[e.milestone];
    if (known) return known;
    const r = e.routes?.[0];
    const to = r ? (r.a.split(':')[0] === e.map ? r.b : r.a).split(':')[0] : 'somewhere new';
    const deaths = e.deaths ?? (Number(e.milestone.split(':')[1]) || 25);
    return milestoneScene(e.milestone, e.map, to, r?.kind ?? 'bus', deaths, this.seen.size);
  }

  private async play(scene: Scene, remember = true) {
    if (remember) {
      this.seen.add(scene.id);
      this.save();
    }
    this.queue.push(scene);
    if (this.running) return;
    this.running = true;
    document.exitPointerLock?.();
    this.onPause(true);
    while (this.queue.length) await this.player.play(this.queue.shift()!);
    this.running = false;
    this.onPause(false);
  }

  private save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ seen: [...this.seen] }));
    } catch {
      /* storage blocked */
    }
  }
}
