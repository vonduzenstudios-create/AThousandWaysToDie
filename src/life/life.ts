import * as THREE from 'three';
import type { PersonFile } from '../deaths';
import { Npc } from '../npc';
import { mulberry32, pick, type Rng } from '../util';
import { GameClock } from './clock';
import {
  bye,
  conversation,
  ghostConfession,
  greetPlayer,
  howAreYou,
  noGossip,
  tellGossip,
  type Gossip,
  type RelKind,
} from './dialogue';
import { NavGrid } from './nav';
import { Resident, center } from './resident';
import { DEFAULT_PROFILES } from './schedule';
import type { JobProfile, LifeMap, LifePlace, PlaceKind, ResidentSpec, V3 } from './types';
import { Bubbles, ClockHud, TalkPanel, type TalkOption } from './ui';

export interface LifeHooks {
  /** A saver reached the player while the danger was still on. The game decides what the save does. */
  onSave?(saver: Npc, at: V3): void;
  /** A witness called 911 about a critical body. */
  onCall911?(caller: Npc, at: V3): void;
  /** Someone picked up the cash the player dropped. */
  onLurePickup?(npc: Npc, at: V3): void;
  /** The player tries to buy from a clerk. Return true if the purchase went through. */
  onBuy?(clerk: Npc, item: string, price: number): boolean;
}

export interface LifeOptions {
  seed?: number;
  clock?: GameClock;
  /** Element that holds the HUD (bubbles, talk box, clock). Default #ui or body. */
  host?: HTMLElement;
  hooks?: LifeHooks;
  /** Plays a text blip in the talk box. */
  blip?: () => void;
  /** Max residents (random fill stops here). Default 40. */
  maxPopulation?: number;
}

export interface LifeEvent {
  kind: 'death' | 'fight' | 'scream' | 'pee' | 'weird';
  at: V3;
  /** For deaths: the victim's file. */
  victim?: PersonFile;
  /** For gossip: 'got flattened by a hay bale'. */
  what?: string;
  where?: string;
  /** Who did it (fights): this person won't react to their own event. */
  by?: Npc;
  /** How far people notice it. Default 30 for deaths, 18 otherwise. */
  radius?: number;
}

export interface LifeFrame {
  camera: THREE.Camera;
  /** The possessed body, if any. */
  player?: { pos: V3; file: PersonFile } | null;
  /** Gamepad / keyboard menu presses for the talk box this frame. */
  menu?: { up?: boolean; down?: boolean; confirm?: boolean; back?: boolean };
}

const REL_LABEL: Record<RelKind, string> = {
  family: 'family',
  partner: 'your partner',
  friend: 'your friend',
  coworker: 'your coworker',
  rival: "can't stand you",
  neighbor: 'your neighbor',
  stranger: '',
};

const tmp = new THREE.Vector3();

/**
 * The NPC life system: residents with homes, jobs and daily routines, shopping,
 * chatting and gossip, reactions to deaths, savers and 911 calls, and talking
 * to the player. One per map.
 */
export class LifeSystem {
  readonly nav: NavGrid;
  readonly clock: GameClock;
  readonly residents: Resident[] = [];
  /** The bodies, for scythe vision and possession. Same order as residents. */
  readonly npcs: Npc[] = [];
  readonly places: LifePlace[];
  readonly hooks: LifeHooks;
  /** Real seconds since start. */
  now = 0;
  private placeMap = new Map<string, LifePlace>();
  private profiles = new Map<string, JobProfile>();
  private byNpc = new Map<Npc, Resident>();
  /** Includes people who have been possessed, so relationships survive. */
  private byFile = new Map<PersonFile, Resident>();
  private occupancy = new Map<string, Set<Resident>>();
  private spotTaken = new Map<string, Resident>();
  private spotOf = new Map<Resident, string>();
  private homeCount = new Map<string, number>();
  private homeCap = new Map<string, number>();
  private timers: { at: number; fn: () => void }[] = [];
  private gossip: Gossip[] = [];
  private gossipId = 1;
  private rng: Rng;
  private bubbles: Bubbles;
  private talk: TalkPanel;
  private clockHud: ClockHud;
  private talking: Resident | null = null;
  private target = 0;
  private respawnT = 0;
  private maxPop: number;
  private transitDriven = false;
  private danger: { pos: V3; level: number; t: number; saver: Resident | null } | null = null;
  private calling: Resident | null = null;
  private lod = new Map<Resident, number>();
  private frame = 0;
  private told = new Set<string>();
  readonly hasTransit: boolean;

  constructor(
    private scene: THREE.Scene,
    readonly map: LifeMap,
    opts: LifeOptions = {},
  ) {
    this.rng = mulberry32(opts.seed ?? 4242);
    this.clock = opts.clock ?? new GameClock(8);
    this.hooks = opts.hooks ?? {};
    this.maxPop = opts.maxPopulation ?? 40;
    this.nav = new NavGrid(map.nav);
    this.places = map.places;
    for (const p of map.places) {
      this.placeMap.set(p.id, p);
      this.occupancy.set(p.id, new Set());
      if (p.kind === 'home') this.homeCap.set(p.id, p.residents ?? 1 + Math.floor(this.rng() * 3));
    }
    for (const pr of DEFAULT_PROFILES) this.profiles.set(pr.job, pr);
    for (const pr of map.jobProfiles ?? []) this.profiles.set(pr.job, { ...this.profiles.get(pr.job), ...pr });
    this.hasTransit = map.places.some((p) => p.kind === 'transit');
    const host = opts.host ?? document.getElementById('ui') ?? document.body;
    this.bubbles = new Bubbles(host);
    this.talk = new TalkPanel(host);
    this.talk.blip = opts.blip ?? null;
    this.clockHud = new ClockHud(host);
  }

  // ------------------------------------------------------------ lookups

  placeById(id: string) {
    return this.placeMap.get(id) ?? null;
  }

  profileFor(job: string): JobProfile {
    return this.profiles.get(job) ?? { job, style: 'none', likes: ['park', 'food', 'shop'] };
  }

  residentOf(npc: Npc) {
    return this.byNpc.get(npc) ?? null;
  }

  /** "Working · Smallville Diner", for the scythe file. */
  activityOf(npc: Npc) {
    return this.byNpc.get(npc)?.activity ?? '';
  }

  /** People visible in the world (not asleep indoors or out of town). */
  visibleNpcs() {
    return this.npcs.filter((n) => !n.away);
  }

  get isTalking() {
    return this.talking !== null;
  }

  // ------------------------------------------------------------ population

  /** Fill the map with its residents. */
  populate() {
    const pop = this.map.population ?? {};
    const people: ResidentSpec[] = [...(pop.people ?? [])];
    // Staff every workplace that lists jobs.
    const jobsFromPlaces: string[] = [];
    const named = new Map<string, number>();
    for (const sp of people) named.set(sp.job, (named.get(sp.job) ?? 0) + 1);
    for (const p of this.places) {
      if (!p.jobs?.length) continue;
      const n = Math.max(1, p.staffSpots?.length ?? 1);
      for (let i = 0; i < n; i++) {
        const job = p.jobs[i % p.jobs.length];
        // Specific people already fill some of these jobs.
        if ((named.get(job) ?? 0) > 0) named.set(job, named.get(job)! - 1);
        else jobsFromPlaces.push(job);
      }
    }
    const homeRoom = [...this.homeCap.values()].reduce((a, b) => a + b, 0);
    const count = Math.min(this.maxPop, pop.count ?? Math.max(homeRoom, jobsFromPlaces.length + 6));
    const already = people.length;
    // Jobs: first the ones places need, then the map's list (or no-job townies).
    const jobPool = pop.jobs?.length ? pop.jobs : ['Retiree', 'Teen', 'Influencer', 'Retiree', 'Teen'];
    for (let i = already; i < count; i++) {
      const fromPlace = jobsFromPlaces[i - already];
      people.push({ job: fromPlace ?? pick(this.rng, jobPool) });
    }
    for (const spec of people) this.spawn(spec);
    this.target = this.residents.length;
    for (const r of this.residents) this.makeRelations(r);
  }

  /** Add one person. Returns their body. */
  spawn(spec: ResidentSpec, opts: { at?: V3; newcomer?: boolean } = {}): Npc {
    const rng = mulberry32(Math.floor(this.rng() * 1e9));
    const profile = this.profileFor(spec.job);
    const home = spec.home ? this.placeById(spec.home) : this.freeHome(rng);
    const work = spec.work ? this.placeById(spec.work) : this.findWork(spec.job, profile);
    if (home) this.homeCount.set(home.id, (this.homeCount.get(home.id) ?? 0) + 1);
    // Family shares a last name.
    const housemate = home ? this.residents.find((r) => r.home === home) : undefined;
    let at = opts.at;
    if (!at) {
      const anchor = home && rng() < 0.5 ? home.door : work?.door ?? home?.door ?? this.spawnPoint(rng);
      at = this.nav.nearest({ x: anchor.x + (rng() - 0.5) * 6, z: anchor.z + (rng() - 0.5) * 6 }, 10) ?? anchor;
    }
    const npc = new Npc(this.scene, this.nav, rng, { job: spec.job, at });
    const f = npc.file;
    if (spec.name) f.name = spec.name;
    else if (housemate) f.name = f.name.split(' ')[0] + ' ' + housemate.name.split(' ').slice(1).join(' ');
    if (spec.age) f.age = spec.age;
    const r = new Resident(npc, this, profile, rng, home, work, spec.patrol ?? null, spec.lines ?? [], {
      shift: spec.shift,
      lunch: spec.lunch,
      lunchAt: spec.lunchAt,
    });
    this.residents.push(r);
    this.npcs.push(npc);
    this.byNpc.set(npc, r);
    this.byFile.set(f, r);
    if (opts.newcomer) {
      this.makeRelations(r);
      this.addGossip({ kind: 'arrival', who: f.name, what: 'just moved to town', where: home?.name ?? 'town', heat: 0.4 });
    }
    return npc;
  }

  private freeHome(rng: Rng): LifePlace | null {
    const homes = this.places.filter((p) => p.kind === 'home' && (this.homeCount.get(p.id) ?? 0) < (this.homeCap.get(p.id) ?? 0));
    return homes.length ? pick(rng, homes) : null;
  }

  private findWork(job: string, profile: JobProfile): LifePlace | null {
    const listed = this.places.filter((p) => p.jobs?.includes(job));
    if (listed.length) {
      // Fill the least staffed.
      listed.sort((a, b) => this.staffCount(a) - this.staffCount(b));
      return listed[0];
    }
    if (profile.style === 'none' || !profile.workKinds) return null;
    const kinds = profile.workKinds;
    const cands = this.places.filter((p) => kinds.includes(p.kind) && (!p.allowedJobs || p.allowedJobs.includes(job)));
    return cands.length ? pick(this.rng, cands) : null;
  }

  private staffCount(p: LifePlace) {
    return this.residents.filter((r) => r.work === p).length;
  }

  private spawnPoint(rng: Rng): V3 {
    const spawns = this.map.spawns?.length ? this.map.spawns : this.places.filter((p) => p.kind === 'transit').map((p) => p.door);
    if (spawns.length) return pick(rng, spawns);
    const b = this.map.nav.bounds;
    return this.nav.nearest({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }, 40) ?? { x: (b.x0 + b.x1) / 2, y: 0, z: (b.z0 + b.z1) / 2 };
  }

  private makeRelations(r: Resident) {
    const last = (x: Resident) => x.name.split(' ').slice(1).join(' ');
    for (const o of this.residents) {
      if (o === r || r.relations.has(o)) continue;
      let k: RelKind | null = null;
      if (r.home && o.home === r.home) {
        const adults = r.npc.file.age > 20 && o.npc.file.age > 20 && Math.abs(r.npc.file.age - o.npc.file.age) < 18;
        k = adults && this.rng() < 0.6 ? 'partner' : 'family';
      } else if (last(o) === last(r)) k = 'family';
      else if (r.work && o.work === r.work) k = 'coworker';
      else if (r.home && o.home && Math.hypot(r.home.door.x - o.home.door.x, r.home.door.z - o.home.door.z) < 30 && this.rng() < 0.5) k = 'neighbor';
      else if (this.rng() < 0.12) k = 'friend';
      else if (this.rng() < 0.04) k = 'rival';
      if (k) {
        r.relations.set(o, k);
        o.relations.set(r, k);
      }
    }
  }

  /** Take someone out of the simulation without destroying their body (possession). */
  take(npc: Npc) {
    const r = this.byNpc.get(npc);
    if (!r) return;
    if (this.talking === r) this.talk.close();
    if (r.interrupt?.kind === 'chat') this.endChat(r.interrupt.with, r);
    if (r.block && r.home) this.homeCount.set(r.home.id, Math.max(0, (this.homeCount.get(r.home.id) ?? 1) - 1));
    for (const s of this.occupancy.values()) s.delete(r);
    this.releaseSpot(r);
    this.bubbles.hide(r.id);
    const i = this.residents.indexOf(r);
    if (i >= 0) this.residents.splice(i, 1);
    const j = this.npcs.indexOf(npc);
    if (j >= 0) this.npcs.splice(j, 1);
    this.byNpc.delete(npc);
    npc.brain = null;
    npc.away = false;
    this.respawnT = 25 + this.rng() * 20;
  }

  /** Remove and destroy someone. */
  remove(npc: Npc) {
    this.take(npc);
    npc.remove(this.scene);
  }

  // ------------------------------------------------------------ places

  pickPlace(r: Resident, kinds: readonly PlaceKind[], hour: number): { id: string; kind: PlaceKind } | null {
    const region = this.nav.regionAt(r.npc.pos.x, r.npc.pos.z);
    const cands: { p: LifePlace; w: number }[] = [];
    for (const p of this.places) {
      if (!kinds.includes(p.kind)) continue;
      if (!GameClock.within(hour, p.hours)) continue;
      if (p.allowedJobs && !p.allowedJobs.includes(r.job)) continue;
      const cap = p.capacity ?? Math.max(6, p.spots?.length ?? 0);
      if ((this.occupancy.get(p.id)?.size ?? 0) >= cap) continue;
      if (region >= 0 && this.nav.regionAt(p.door.x, p.door.z) !== region && this.nav.nearest(p.door, 3, region) === null) continue;
      const d = Math.hypot(p.door.x - r.npc.pos.x, p.door.z - r.npc.pos.z);
      cands.push({ p, w: 1 / (1 + d / 80) });
    }
    if (!cands.length) return null;
    let t = this.rng() * cands.reduce((a, c) => a + c.w, 0);
    for (const c of cands) if ((t -= c.w) <= 0) return { id: c.p.id, kind: c.p.kind };
    return { id: cands[0].p.id, kind: cands[0].p.kind };
  }

  enter(r: Resident, p: LifePlace) {
    this.occupancy.get(p.id)?.add(r);
  }

  leave(r: Resident, p: LifePlace) {
    this.occupancy.get(p.id)?.delete(r);
    this.releaseSpot(r);
  }

  claimSpot(r: Resident, p: LifePlace): V3 | null {
    this.releaseSpot(r);
    const free = (p.spots ?? []).map((s, i) => i).filter((i) => !this.spotTaken.has(p.id + ':' + i));
    if (!free.length) return null;
    const i = pick(this.rng, free);
    const key = p.id + ':' + i;
    this.spotTaken.set(key, r);
    this.spotOf.set(r, key);
    return p.spots![i];
  }

  releaseSpot(r: Resident) {
    const k = this.spotOf.get(r);
    if (k) {
      this.spotTaken.delete(k);
      this.spotOf.delete(r);
    }
  }

  staffIndex(r: Resident, p: LifePlace) {
    const staff = this.residents.filter((o) => o.work === p).sort((a, b) => a.id - b.id);
    return Math.max(0, staff.indexOf(r));
  }

  /** The worker currently behind the counter, if any. */
  staffOn(p: LifePlace): Resident | null {
    for (const r of this.residents) {
      if (r.work !== p || r.block?.act !== 'work' || r.npc.away || r.interrupt) continue;
      if (r.npc.moving) continue;
      return r;
    }
    return null;
  }

  counterOf(p: LifePlace): V3 {
    if (p.counter) return p.counter;
    const region = this.nav.regionAt(p.door.x, p.door.z);
    const s = p.staffSpots?.[0];
    if (!s) return p.inside ? this.nav.nearest(center(p.inside), 4, region) ?? p.door : p.door;
    const dx = p.door.x - s.x, dz = p.door.z - s.z;
    const d = Math.hypot(dx, dz) || 1;
    const c = { x: s.x + (dx / d) * 2.5, z: s.z + (dz / d) * 2.5 };
    return this.nav.nearest(c, 4, region) ?? p.door;
  }

  defaultPatrol(r: Resident): V3[] {
    const doorsOf = (kind: string) => this.places.filter((p) => p.kind === kind).map((p) => p.door);
    let pts = r.job === 'Mail Carrier' || r.job === 'Insurance Salesman' ? doorsOf('home') : this.places.filter((p) => !p.allowedJobs).map((p) => p.door);
    if (!pts.length) pts = this.places.map((p) => p.door);
    const out: V3[] = [];
    for (let i = 0; i < Math.min(8, pts.length); i++) out.push(pick(this.rng, pts));
    r.patrol = out;
    return out;
  }

  // ------------------------------------------------------------ talking and gossip

  say(r: Resident, text: string, secs = 3) {
    const npc = r.npc;
    this.bubbles.show(r.id, r.first, text, secs, () => tmp.copy(npc.headPos()).setY(npc.headPos().y + 0.7), this.now);
  }

  later(secs: number, fn: () => void) {
    this.timers.push({ at: this.now + secs, fn });
  }

  private addGossip(g: Omit<Gossip, 'id' | 'when'>) {
    const full: Gossip = { ...g, id: this.gossipId++, when: this.clock.total };
    this.gossip.push(full);
    if (this.gossip.length > 30) this.gossip.shift();
    return full;
  }

  /** Someone hears a piece of news. People grieve for those they knew. */
  private learn(r: Resident, g: Gossip) {
    if (r.knows.has(g.id)) return;
    r.knows.add(g.id);
    if (g.kind !== 'death') return;
    const victim = [...this.byFile.values()].find((v) => v.name === g.who);
    if (!victim) return;
    const rel = r.relations.get(victim);
    if (rel && rel !== 'stranger' && rel !== 'rival') {
      r.mourning.unshift(victim.first);
      r.mood = Math.max(-1, r.mood - (rel === 'family' || rel === 'partner' ? 0.8 : 0.4));
    } else if (rel === 'rival') r.mood = Math.min(1, r.mood + 0.3);
  }

  private juiciest(a: Resident, b: Resident): Gossip | null {
    let best: Gossip | null = null;
    for (const g of this.gossip) {
      if (!a.knows.has(g.id) || b.knows.has(g.id) || g.who === b.name) continue;
      if (!best || g.heat > best.heat) best = g;
    }
    return best;
  }

  private startChat(a: Resident, b: Resident) {
    const rel = a.relations.get(b) ?? 'stranger';
    const news = { tell: this.juiciest(a, b), mourn: a.mourning[0] ?? null };
    const lines = conversation(this.rng, a.talker(), b.talker(), rel, news, this.map.smallTalk ?? []);
    const gap = 2.5;
    const until = this.now + lines.length * gap + 0.5;
    a.hold({ kind: 'chat', with: b, until });
    b.hold({ kind: 'chat', with: a, until });
    a.chatCooldown = b.chatCooldown = 45 + this.rng() * 60;
    lines.forEach((l, i) => {
      this.later(i * gap, () => {
        const sp = l.by === 0 ? a : b, ls = l.by === 0 ? b : a;
        if (sp.interrupt?.kind !== 'chat' || sp.interrupt.with !== ls) return;
        sp.npc.pose = 'talk';
        ls.npc.pose = 'stand';
        this.say(sp, l.text, gap + 0.2);
        if (news.tell && i === 2) this.learn(b, news.tell);
      });
    });
  }

  endChat(a: Resident, b: Resident) {
    for (const r of [a, b]) {
      if (r.interrupt?.kind === 'chat') r.resume();
      this.bubbles.hide(r.id);
    }
  }

  /** Tell the townsfolk something happened. Deaths become gossip that spreads. */
  event(e: LifeEvent) {
    const radius = e.radius ?? (e.kind === 'death' ? 32 : 18);
    let g: Gossip | null = null;
    if (e.kind === 'death' && e.victim) {
      g = this.addGossip({ kind: 'death', who: e.victim.name, what: e.what ?? 'died', where: e.where ?? this.map.name, heat: 1 });
    } else if (e.kind === 'pee' || e.kind === 'fight') {
      g = this.addGossip({ kind: e.kind, who: 'some weirdo', what: e.kind === 'pee' ? 'was peeing in public' : 'started a fight', where: e.where ?? 'downtown', heat: 0.3 });
    }
    for (const r of this.residents) {
      if (r.npc === e.by || r.npc.away) continue;
      const d = Math.hypot(r.npc.pos.x - e.at.x, r.npc.pos.z - e.at.z);
      if (d > radius) continue;
      if (g) this.learn(r, g);
      r.reactTo(e.kind, e.at, d);
    }
  }

  // ------------------------------------------------------------ savers, 911, distractions

  /**
   * Call every frame while the player is doing something dangerous (0 to 1). Brave
   * people nearby run over; when one arrives, hooks.onSave fires.
   */
  setDanger(pos: V3, level: number) {
    if (!this.danger) this.danger = { pos: { x: pos.x, y: pos.y, z: pos.z }, level, t: this.now, saver: null };
    this.danger.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.danger.level = level;
    this.danger.t = this.now;
  }

  private updateDanger() {
    const dg = this.danger;
    if (!dg) return;
    if (this.now - dg.t > 0.6) {
      // Danger's over.
      if (dg.saver && dg.saver.interrupt?.kind === 'save') {
        this.say(dg.saver, pick(this.rng, ['Phew.', 'Okay... never mind.', "Don't scare me like that!"]), 2);
        dg.saver.resume();
      }
      this.danger = null;
      return;
    }
    if (dg.saver) return;
    let best: Resident | null = null, bs = Infinity;
    for (const r of this.residents) {
      if (r.npc.away || r.npc.controlled || r.interrupt?.kind === 'player') continue;
      const d = Math.hypot(r.npc.pos.x - dg.pos.x, r.npc.pos.z - dg.pos.z);
      if (d > 22 || r.courage > dg.level) continue;
      const s = d * (0.5 + r.courage);
      if (s < bs) (bs = s), (best = r);
    }
    if (!best) return;
    const r = best;
    dg.saver = r;
    if (r.interrupt?.kind === 'chat') this.endChat(r.interrupt.with, r);
    r.hold({ kind: 'save', until: this.now + 20 });
    this.later(r.reaction, () => {
      if (this.danger?.saver !== r || r.interrupt?.kind !== 'save') return;
      this.say(r, pick(this.rng, ['NO! DON\'T DO IT!', 'HEY! STOP!', 'WAIT! I\'M COMING!', 'Oh no you don\'t!']), 2.5);
      const chase = () => {
        const dg2 = this.danger;
        if (!dg2 || dg2.saver !== r || r.interrupt?.kind !== 'save') return;
        r.npc.walkTo(dg2.pos, () => {
          const dg3 = this.danger;
          if (!dg3 || dg3.saver !== r) return;
          if (Math.hypot(r.npc.pos.x - dg3.pos.x, r.npc.pos.z - dg3.pos.z) < 2.2) {
            this.hooks.onSave?.(r.npc, dg3.pos);
            this.danger = null;
            this.later(2.5, () => r.resume());
          } else chase();
        }, true);
      };
      chase();
    });
  }

  /** The player's body is critical. The nearest witness calls 911. */
  reportCritical(pos: V3) {
    if (this.calling && this.calling.interrupt?.kind === 'call911') return;
    let best: Resident | null = null, bd = 34;
    for (const r of this.residents) {
      if (r.npc.away || r.npc.controlled || r.interrupt?.kind === 'save') continue;
      const d = Math.hypot(r.npc.pos.x - pos.x, r.npc.pos.z - pos.z);
      if (d < bd) (bd = d), (best = r);
    }
    if (!best) return;
    const r = best;
    this.calling = r;
    r.hold({ kind: 'call911', until: this.now + 25 });
    this.later(r.reaction, () => {
      this.say(r, pick(this.rng, ['OH GOD. Hold on!', 'Don\'t move! I\'m calling!']), 2);
      const near = this.nav.nearest({ x: pos.x + 3, z: pos.z + 2 }, 4) ?? pos;
      r.npc.walkTo(near, () => {
        r.npc.lookAt(pos);
        r.npc.pose = 'talk';
        this.say(r, pick(this.rng, ['Hello, 911? There\'s someone dying here!', '911? Yeah, he\'s... he\'s really messed up.', 'Hi, yes, ambulance please. And maybe a priest.']), 4);
        this.later(2, () => this.hooks.onCall911?.(r.npc, pos));
        this.later(12, () => {
          if (this.calling === r) this.calling = null;
          r.resume();
        });
      }, true);
    });
  }

  /** Drop something tempting (cash). Greedy people nearby race for it. */
  lure(pos: V3, radius = 16) {
    let won = false;
    for (const r of this.residents) {
      if (r.npc.away || r.npc.controlled || r.greed < 0.35) continue;
      const d = Math.hypot(r.npc.pos.x - pos.x, r.npc.pos.z - pos.z);
      if (d > radius) continue;
      if (r.interrupt?.kind === 'chat') this.endChat(r.interrupt.with, r);
      if (r.interrupt?.kind === 'save' && this.danger?.saver === r) this.danger.saver = null;
      r.hold({ kind: 'lure', until: this.now + 15 });
      this.later(r.reaction * 0.6, () => {
        this.say(r, pick(this.rng, ['Ooh! Money!', 'Is that a twenty?!', 'MINE!']), 2);
        r.npc.walkTo(pos, () => {
          if (!won) {
            won = true;
            this.say(r, pick(this.rng, ['Finders keepers!', 'Ha! Lucky day.', 'Don\'t tell anyone.']), 2.4);
            r.npc.pose = 'cheer';
            this.hooks.onLurePickup?.(r.npc, pos);
          } else {
            this.say(r, pick(this.rng, ['Aw.', 'Dang it.', 'Hey, that was mine!']), 2);
          }
          this.later(2.5, () => r.resume());
        }, true);
      });
    }
  }

  // ------------------------------------------------------------ transit (travel system hooks)

  /** A vehicle stopped at a transit place. Travellers coming home step off. */
  vehicleArrived(placeId: string, door: V3) {
    this.transitDriven = true;
    for (const r of this.residents) {
      if (r.npc.away && r.block?.act !== 'sleep' && r.block?.act !== 'travel' && this.rng() < 0.7) r.returnFrom(door);
    }
    void placeId;
  }

  /** A vehicle left a transit place. Everyone waiting there got on. */
  vehicleDeparted(placeId: string) {
    for (const r of this.residents) if (r.waitingAt?.id === placeId) r.board();
  }

  // ------------------------------------------------------------ talking to the player

  /** Nearest person the player can talk to. */
  talkable(pos: V3, maxDist = 2.6): Npc | null {
    let best: Npc | null = null, bd = maxDist;
    for (const r of this.residents) {
      const n = r.npc;
      if (n.away || n.controlled || n.helping) continue;
      const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z);
      if (d < bd && Math.abs(n.pos.y - pos.y) < 2) (bd = d), (best = n);
    }
    return best;
  }

  /** Open the talk box with someone. `body` is the file of whoever the player is wearing. */
  talkTo(npc: Npc, body: PersonFile, bodyPos: V3, onClose?: () => void) {
    const r = this.byNpc.get(npc);
    if (!r) return;
    if (r.interrupt?.kind === 'chat') this.endChat(r.interrupt.with, r);
    r.hold({ kind: 'player', at: { x: bodyPos.x, y: bodyPos.y, z: bodyPos.z } });
    npc.pose = 'talk';
    this.talking = r;
    const me = this.byFile.get(body);
    const rel: RelKind = (me && r.relations.get(me)) || 'stranger';
    const bodyFirst = body.name.split(' ')[0];
    const greeting = greetPlayer(this.rng, r.talker(), { first: bodyFirst, job: body.job }, rel);
    this.talk.onClose = () => {
      if (this.talking === r) this.talking = null;
      if (r.interrupt?.kind === 'player') r.resume();
      onClose?.();
    };
    const respond = (text: string, end = false) => {
      npc.pose = 'talk';
      this.talk.say(text);
      if (end) {
        this.talk.setOptions([]);
        this.later(2.2, () => this.talk.close());
      }
    };
    const options: TalkOption[] = [
      { label: "How's it going?", pick: () => respond(howAreYou(this.rng, r.talker())) },
      {
        label: 'Heard anything interesting?',
        pick: () => {
          const g = [...this.gossip].reverse().find((x) => r.knows.has(x.id) && x.who !== body.name);
          respond(g ? tellGossip(this.rng, g) : noGossip(this.rng, this.map.smallTalk ?? []));
        },
      },
      { label: "What's around here?", pick: () => respond(this.directions(r)) },
    ];
    const jobLines = [...(r.lines ?? []), ...(r.profile.talkLines ?? [])];
    if (jobLines.length) options.push({ label: `What's it like being a ${r.job.toLowerCase()}?`, pick: () => respond(pick(this.rng, jobLines)) });
    const shop = r.work && r.block?.act === 'work' && r.work.sells?.length ? r.work : null;
    if (shop && this.hooks.onBuy) {
      const item = pick(this.rng, shop.sells!);
      options.push({
        label: `Buy ${item.item} ($${item.price})`,
        pick: () => respond(this.hooks.onBuy!(npc, item.item, item.price) ? pick(this.rng, ['Here you go.', 'Enjoy!', 'Pleasure doing business.']) : "You can't afford that, pal."),
      });
    }
    options.push({
      label: `"I'm a ghost wearing ${bodyFirst}."`,
      pick: () => {
        respond(ghostConfession(this.rng, rel, { first: bodyFirst }), true);
        r.mood -= 0.1;
      },
    });
    options.push({ label: 'Bye.', pick: () => respond(bye(this.rng), true) });
    this.talk.show(r.name, REL_LABEL[rel] ? `· ${REL_LABEL[rel]}` : `· ${r.job}`, greeting, options);
  }

  closeTalk() {
    this.talk.close();
  }

  private directions(r: Resident): string {
    const hour = this.clock.hour;
    const here = r.npc.pos;
    const cands = this.places
      .filter((p) => p.kind !== 'home' && p !== r.home && GameClock.within(hour, p.hours))
      .map((p) => ({ p, d: Math.hypot(p.door.x - here.x, p.door.z - here.z) }))
      .filter((c) => c.d > 6)
      .sort((a, b) => a.d - b.d);
    const fresh = cands.filter((c) => !this.told.has(c.p.id));
    const c = (fresh.length ? fresh : cands).slice(0, 3);
    if (!c.length) return 'Nothing much. This is it. This is the whole place.';
    const one = pick(this.rng, c);
    this.told.add(one.p.id);
    if (this.told.size > 6) this.told.clear();
    const dx = one.p.door.x - here.x, dz = one.p.door.z - here.z;
    const dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north';
    const steps = Math.round(one.d / 5) * 5;
    const what: Record<string, string> = {
      food: 'Good food. Okay food.',
      shop: 'They sell stuff.',
      bar: 'Cheap drinks.',
      transit: 'Gets you out of here, at least.',
      civic: "Don't go in unless you have to.",
      work: 'Lot of people work there.',
      park: 'Nice spot to sit.',
      attraction: 'People like to look at it. And jump off it.',
    };
    const hrs = one.p.hours ? ` Open till ${fmtHour(one.p.hours[1])}.` : '';
    return `${one.p.name}? That way, ${dir}. About ${steps} steps. ${what[one.p.kind] ?? ''}${hrs}`.trim();
  }

  // ------------------------------------------------------------ per frame

  update(dt: number, f: LifeFrame) {
    this.now += dt;
    this.frame++;
    this.clock.update(dt);
    this.clockHud.set(this.clock.dayName, this.clock.label());
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.now);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.now);
        for (const t of due) t.fn();
      }
    }
    const camPos = f.camera.position;
    const residents = this.residents;
    for (let i = 0; i < residents.length; i++) {
      const r = residents[i];
      const n = r.npc;
      const d = Math.hypot(n.pos.x - camPos.x, n.pos.z - camPos.z);
      // Far away people think and move less often.
      const lod = d > 90 ? 4 : d > 55 ? 2 : 1;
      const acc = (this.lod.get(r) ?? 0) + dt;
      if (lod > 1 && (this.frame + i) % lod !== 0) {
        this.lod.set(r, acc);
        continue;
      }
      this.lod.set(r, 0);
      r.update(acc);
      n.update(acc, lod);
    }
    this.crowd(dt, f.player?.pos ?? null);
    this.updateDanger();
    if (this.talking) {
      const m = f.menu;
      if (m?.up) this.talk.move(-1);
      if (m?.down) this.talk.move(1);
      if (m?.confirm) this.talk.confirm();
      if (m?.back) this.talk.close();
      if (f.player && Math.hypot(this.talking.npc.pos.x - f.player.pos.x, this.talking.npc.pos.z - f.player.pos.z) > 5) this.talk.close();
    }
    // New people move to town to replace the dead.
    if (residents.length < this.target && (this.respawnT -= dt) <= 0) {
      this.respawnT = 30 + this.rng() * 30;
      const jobs = this.map.population?.jobs ?? ['Retiree', 'Teen', 'Influencer'];
      const spawn = this.spawnPoint(this.rng);
      this.spawn({ job: pick(this.rng, jobs) }, { at: this.nav.nearest(spawn, 6) ?? spawn, newcomer: true });
    }
    this.bubbles.update(f.camera, this.now);
  }

  /** Keep people from walking through each other, and start conversations. */
  private crowd(dt: number, player: V3 | null) {
    const cell = 3;
    const grid = new Map<number, Resident[]>();
    for (const r of this.residents) {
      if (r.npc.away || r.npc.controlled) continue;
      const k = Math.floor(r.npc.pos.x / cell) * 73856093 ^ Math.floor(r.npc.pos.z / cell) * 19349663;
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(r);
    }
    for (const r of this.residents) {
      const n = r.npc;
      if (n.away || n.controlled) continue;
      const cx = Math.floor(n.pos.x / cell), cz = Math.floor(n.pos.z / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const a = grid.get((cx + dx) * 73856093 ^ (cz + dz) * 19349663);
          if (!a) continue;
          for (const o of a) {
            if (o.id <= r.id) continue;
            const ox = o.npc.pos.x - n.pos.x, oz = o.npc.pos.z - n.pos.z;
            const d = Math.hypot(ox, oz);
            if (d < 0.75 && d > 1e-4) {
              const s = ((0.75 - d) / d) * 3;
              n.push.x -= ox * s;
              n.push.z -= oz * s;
              o.npc.push.x += ox * s;
              o.npc.push.z += oz * s;
            }
            if (d < 3.6 && r.canChat(this.now) && o.canChat(this.now)) {
              const rel = r.relations.get(o);
              const p = (rel ? 1 : 0.4) * (0.3 + r.social) * (0.3 + o.social);
              if (this.rng() < p * dt * 0.6) this.startChat(r, o);
            }
          }
        }
      if (player) {
        const px = n.pos.x - player.x, pz = n.pos.z - player.z;
        const d = Math.hypot(px, pz);
        if (d < 0.8 && d > 1e-4) {
          n.push.x += (px / d) * 2.5;
          n.push.z += (pz / d) * 2.5;
        }
      }
    }
  }

  dispose() {
    this.bubbles.clear();
    this.talk.close();
    for (const n of [...this.npcs]) this.remove(n);
  }
}

function fmtHour(h: number) {
  const hh = Math.floor(h) % 24;
  return `${hh % 12 === 0 ? 12 : hh % 12}${hh < 12 ? 'am' : 'pm'}`;
}
