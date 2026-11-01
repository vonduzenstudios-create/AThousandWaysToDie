import type { Npc, Pose } from '../npc';
import { pick, type Rng } from '../util';
import { GameClock } from './clock';
import { orderLines, react, type Gossip, type RelKind, type Talker } from './dialogue';
import type { PathPt } from './nav';
import { ACT_LABEL, blockAt, planDay, type Act, type Block } from './schedule';
import type { JobProfile, LifePlace, V3 } from './types';
import type { LifeSystem } from './life';

/** What the brain is busy with right now, on top of its schedule. */
type Interrupt =
  | { kind: 'chat'; with: Resident; until: number }
  | { kind: 'player'; at: V3 }
  | { kind: 'react'; until: number }
  | { kind: 'save'; until: number }
  | { kind: 'call911'; until: number }
  | { kind: 'lure'; until: number };

type Stage = 'route' | 'inside' | 'stay';

let nextId = 1;

/**
 * A townsperson's mind: who they are, who they know, what they plan to do today,
 * and what they're doing about it. Drives an Npc body.
 */
export class Resident {
  readonly id = nextId++;
  readonly first: string;
  readonly relations = new Map<Resident, RelKind>();
  /** Gossip ids this person has heard. */
  readonly knows = new Set<number>();
  /** People they're grieving, by name. */
  mourning: string[] = [];
  mood: number;
  /** 0..1: how likely to stop and chat. */
  social: number;
  /** 0..1: how much danger it takes before they step in. Low = brave. */
  courage: number;
  /** Seconds before reacting to things. */
  reaction: number;
  /** 0..1: will they run for dropped cash? */
  greed: number;
  /** Spending money if the file has no wallet. */
  cash: number;
  carrying: string | null = null;
  chatCooldown: number;
  interrupt: Interrupt | null = null;
  /** For work patrols: index into the route. */
  private patrolIdx = 0;
  private plan: Block[] = [];
  private planDay = -1;
  block: Block | null = null;
  private stage: Stage = 'route';
  private stayT = 0;
  private place: LifePlace | null = null;
  private visitTarget: Resident | null = null;
  private ordered = false;
  private travelGone = false;
  private wanderBase: V3 | null = null;
  private mutterT: number;

  constructor(
    readonly npc: Npc,
    readonly life: LifeSystem,
    readonly profile: JobProfile,
    private rng: Rng,
    public home: LifePlace | null,
    public work: LifePlace | null,
    public patrol: V3[] | null,
    public lines: string[],
    readonly extra: { shift?: [number, number]; lunch?: [number, number]; lunchAt?: string } = {},
  ) {
    this.first = npc.file.name.split(' ')[0];
    const f = npc.file;
    this.mood = f.mental === 'Depressed' ? -0.6 : f.mental === 'Medicated' ? 0.5 : (rng() - 0.4) * 0.8;
    this.social = 0.25 + rng() * 0.75;
    this.courage = 0.2 + rng() * 0.8;
    if (profile.job === 'Cop' || profile.job === 'Lifeguard' || profile.job === 'Firefighter') this.courage *= 0.4;
    this.reaction = 0.3 + rng() * 1.2 + (f.physical === 'Feeble' ? 1 : 0);
    this.greed = rng();
    this.cash = 20 + Math.floor(rng() * 80);
    this.chatCooldown = 5 + rng() * 20;
    this.mutterT = 10 + rng() * 30;
    npc.brain = this;
  }

  get name() {
    return this.npc.file.name;
  }

  get job() {
    return this.npc.file.job as string;
  }

  talker(): Talker {
    return { first: this.first, name: this.name, job: this.job, mood: this.mood, quirk: this.npc.file.quirk, doing: this.doingLabel() };
  }

  /** "on my way to the diner", for small talk. */
  doingLabel(): string {
    const b = this.block;
    if (!b) return 'just walking around';
    const pl = this.place;
    const where = pl ? pl.name : 'town';
    const going = this.stage === 'route';
    switch (b.act) {
      case 'work':
        return going ? `heading to work at ${where}` : `working. ${where} doesn't run itself`;
      case 'lunch':
      case 'eat':
        return going ? `on my way to ${where}. Starving` : `eating at ${where}`;
      case 'shop':
        return going ? `going to ${where}` : `picking something up`;
      case 'drink':
        return `having a drink at ${where}`;
      case 'leisure':
        return `enjoying ${where}`;
      case 'home':
        return 'heading home';
      case 'visit':
        return this.visitTarget ? `going to see ${this.visitTarget.first}` : 'visiting a friend';
      case 'travel':
        return `catching a ride at ${where}`;
      case 'worship':
        return `going to ${where}`;
      default:
        return ACT_LABEL[b.act].toLowerCase();
    }
  }

  /** Visible activity for the scythe file. */
  get activity() {
    if (this.interrupt?.kind === 'chat') return `Chatting with ${this.interrupt.with.first}`;
    if (this.interrupt?.kind === 'player') return 'Talking to you';
    const b = this.block;
    if (!b) return 'Wandering around';
    return ACT_LABEL[b.act] + (this.place ? ` · ${this.place.name}` : '');
  }

  /** Can be pulled into a conversation right now. */
  canChat(now: number) {
    if (this.npc.controlled || this.npc.away || this.npc.helping || this.interrupt || this.chatCooldown > 0) return false;
    const act = this.block?.act;
    if (act === 'sleep' || act === 'travel') return false;
    if (act === 'work' && this.profile.style === 'station' && this.stage === 'stay') return false;
    if ((act === 'shop' || act === 'eat' || act === 'lunch') && this.stage === 'inside') return false;
    return now >= 0;
  }

  // ------------------------------------------------------------ schedule

  private replan(hour: number) {
    const clock = this.life.clock;
    this.planDay = clock.day;
    const hasFriends = [...this.relations.values()].some((r) => r === 'friend' || r === 'family' || r === 'partner');
    this.plan = planDay({
      rng: this.rng,
      profile: this.profile,
      hasHome: !!this.home,
      hasWork: !!this.work || this.profile.style === 'patrol',
      weekend: clock.weekend,
      shift: this.extra.shift,
      lunch: this.extra.lunch,
      lunchAt: this.extra.lunchAt,
      hasFriends,
      canTravel: this.life.hasTransit,
      pickPlace: (kinds, h) => this.life.pickPlace(this, kinds, h),
    });
    void hour;
  }

  private startBlock(b: Block) {
    this.block = b;
    this.stage = 'route';
    this.stayT = 0;
    this.ordered = false;
    this.travelGone = false;
    this.visitTarget = null;
    this.wanderBase = null;
    if (this.place) this.life.leave(this, this.place);
    this.place = null;
    const npc = this.npc;
    if (npc.away && b.act !== 'sleep') {
      // Wake up and step out the front door.
      npc.away = false;
      if (this.home) npc.place(this.life.nav.nearest(this.home.door) ?? this.home.door);
    }
    npc.pose = 'stand';
    switch (b.act) {
      case 'sleep':
      case 'home':
        this.place = this.home;
        if (!this.home && b.act === 'sleep') {
          // No home: sleep on a park bench.
          const t = this.life.pickPlace(this, ['park', 'bench'], 12);
          this.place = t ? this.life.placeById(t.id) : null;
        }
        break;
      case 'work':
        this.place = this.work;
        break;
      case 'visit': {
        const friends = [...this.relations].filter(([r, k]) => (k === 'friend' || k === 'family' || k === 'partner') && r.home && r.home !== this.home && this.life.residents.includes(r));
        if (friends.length) {
          const [f] = pick(this.rng, friends);
          this.visitTarget = f;
          this.place = f.home;
        }
        break;
      }
      case 'travel':
      {
        const t = this.life.pickPlace(this, ['transit'], this.life.clock.hour);
        this.place = t ? this.life.placeById(t.id) : null;
        break;
      }
      case 'wander':
        break;
      default:
        this.place = b.place ? this.life.placeById(b.place) : null;
    }
    if (this.place && !GameClock.within(this.life.clock.hour, this.place.hours) && b.act !== 'work' && b.act !== 'home' && b.act !== 'sleep' && b.act !== 'visit') {
      this.place = null; // closed; just wander instead
    }
    if (this.place) this.life.enter(this, this.place);
    this.go();
  }

  /** Head for the current block's place (or wander). */
  private go() {
    const pl = this.place;
    const act = this.block?.act;
    if (act === 'work' && this.profile.style === 'patrol') {
      this.stage = 'stay';
      this.nextPatrol();
      return;
    }
    if (!pl) {
      this.stage = 'stay';
      this.wanderStep();
      return;
    }
    this.stage = 'route';
    const ok = this.npc.walkTo(pl.door, (arrived) => {
      if (!arrived) return this.fallback();
      this.arrive();
    });
    if (!ok) this.fallback();
  }

  private fallback() {
    if (this.place) this.life.leave(this, this.place);
    this.place = null;
    this.stage = 'stay';
    this.wanderStep();
  }

  private arrive() {
    const pl = this.place;
    const act = this.block?.act;
    if (!pl || !act) return;
    if (pl.allowedJobs && !pl.allowedJobs.includes(this.job)) return this.fallback();
    if (act === 'visit') {
      this.stage = 'stay';
      this.npc.lookAt(pl.inside ? center(pl.inside) : pl.door);
      this.life.say(this, pick(this.rng, ['Knock knock!', `${this.visitTarget?.first ?? 'Hello'}? You home?`, '*knock knock*']), 2.5);
      this.stayT = 20 + this.rng() * 30;
      return;
    }
    if (act === 'travel') {
      this.stage = 'stay';
      this.npc.pose = 'stand';
      this.stayT = 15 + this.rng() * 25;
      return;
    }
    this.stage = 'inside';
    const target = this.insideTarget(pl, act);
    const ok = this.npc.walkTo(target, (arrived) => {
      if (!arrived) return this.fallback();
      this.settle();
    });
    if (!ok) this.settle();
  }

  private insideTarget(pl: LifePlace, act: Act): PathPt | V3 {
    const nav = this.life.nav;
    if (act === 'work' && this.profile.style === 'station' && pl.staffSpots?.length) {
      const i = this.life.staffIndex(this, pl);
      return nav.nearest(pl.staffSpots[i % pl.staffSpots.length], 3) ?? pl.door;
    }
    if (act === 'work' && this.profile.style === 'roam') return this.randomInside(pl);
    if ((act === 'eat' || act === 'lunch' || act === 'shop' || act === 'drink') && pl.sells?.length && !this.ordered) {
      return this.life.counterOf(pl);
    }
    if (act === 'sleep' || act === 'home') return this.randomInside(pl);
    if (pl.spots?.length) return this.life.claimSpot(this, pl) ?? this.randomInside(pl);
    return this.randomInside(pl);
  }

  private randomInside(pl: LifePlace): V3 {
    const nav = this.life.nav;
    const region = nav.regionAt(pl.door.x, pl.door.z);
    if (pl.inside) return nav.randomIn(this.rng, pl.inside, region) ?? pl.door;
    return nav.randomIn(this.rng, { min: { x: pl.door.x - 4, z: pl.door.z - 4 }, max: { x: pl.door.x + 4, z: pl.door.z + 4 } }, region) ?? pl.door;
  }

  /** Reached the spot inside. */
  private settle() {
    const pl = this.place;
    const act = this.block?.act;
    if (!pl || !act) return;
    this.stage = 'stay';
    const npc = this.npc;
    if ((act === 'eat' || act === 'lunch' || act === 'shop' || act === 'drink') && pl.sells?.length && !this.ordered) {
      this.order(pl);
      return;
    }
    if (act === 'sleep') {
      if (pl === this.home) npc.away = true;
      else {
        npc.pose = 'sit';
        this.stayT = 1e9;
      }
      return;
    }
    if (act === 'work' && this.profile.style === 'station') {
      npc.lookAt(pl.counter ?? pl.door);
      this.stayT = 1e9;
      return;
    }
    const sitKinds = ['bench', 'food', 'bar', 'worship'];
    npc.pose = (pl.spots?.length && sitKinds.includes(pl.kind)) || (act === 'eat' || act === 'lunch') && !!pl.spots?.length ? 'sit' : 'stand';
    this.stayT = 8 + this.rng() * 25;
    if (act === 'shop') this.stayT = 3;
  }

  private order(pl: LifePlace) {
    const item = pick(this.rng, pl.sells!);
    const staff = this.life.staffOn(pl);
    const { ask, reply } = orderLines(this.rng, item.item, item.price, pl.lines ?? staff?.profile.workLines ?? []);
    this.npc.lookAt(staff ? staff.npc.pos : pl.staffSpots?.[0] ?? pl.door);
    this.npc.pose = 'talk';
    this.life.say(this, ask, 2.4);
    this.ordered = true;
    this.stayT = 1e9;
    this.life.later(2.2, () => {
      if (staff && this.life.residents.includes(staff)) {
        staff.npc.pose = 'talk';
        this.life.say(staff, reply, 2.4);
        this.life.later(2.4, () => (staff.npc.pose = 'stand'));
      }
      this.pay(item.price);
      this.carrying = item.item;
      this.life.later(2.4, () => {
        this.npc.pose = 'stand';
        if (this.block?.act === 'shop') {
          // Grab it and go.
          this.stayT = 0.1;
          return;
        }
        // Find a seat (or a spot) and enjoy it.
        this.stage = 'inside';
        const t = pl.spots?.length ? this.life.claimSpot(this, pl) ?? this.randomInside(pl) : this.randomInside(pl);
        this.npc.walkTo(t, () => this.settle());
      });
    });
  }

  private pay(price: number) {
    const w = (this.npc.file as unknown as { wallet?: { cash: number } }).wallet;
    if (w && typeof w.cash === 'number') w.cash = Math.max(0, w.cash - price);
    else this.cash = Math.max(0, this.cash - price);
  }

  private nextPatrol() {
    const route = this.patrol ?? this.work?.patrol ?? this.life.defaultPatrol(this);
    if (!route.length) return this.wanderStep();
    const p = route[this.patrolIdx++ % route.length];
    this.npc.walkTo(p, () => {
      this.stayT = 2 + this.rng() * 5;
      if (this.rng() < 0.35) this.mutter();
    });
    this.stayT = 1e9;
  }

  private wanderStep() {
    const nav = this.life.nav;
    if (!this.wanderBase) this.wanderBase = { x: this.npc.pos.x, y: 0, z: this.npc.pos.z };
    const b = this.wanderBase;
    const r = 26;
    const region = nav.regionAt(this.npc.pos.x, this.npc.pos.z);
    const p = nav.randomIn(this.rng, { min: { x: b.x - r, z: b.z - r }, max: { x: b.x + r, z: b.z + r } }, region);
    this.stayT = 1e9;
    if (!p || !this.npc.walkTo(p, () => (this.stayT = 2 + this.rng() * 6))) this.stayT = 3;
  }

  private mutter() {
    const lines = this.block?.act === 'work' ? this.profile.workLines : null;
    if (lines?.length) this.life.say(this, pick(this.rng, lines), 2.6);
  }

  // ------------------------------------------------------------ interrupts

  /** Pause the schedule. */
  hold(i: Interrupt) {
    this.interrupt = i;
    this.npc.stop();
  }

  /** Pick the schedule back up from wherever they are now. */
  resume() {
    this.interrupt = null;
    this.npc.pose = 'stand';
    this.npc.lookAt(null);
    if (this.npc.controlled) return;
    if (!this.block) return;
    if (this.stage === 'stay' && !this.npc.moving && this.place && this.block.act !== 'work') {
      // They were somewhere; carry on from here.
      this.stayT = Math.min(this.stayT, 4);
      return;
    }
    if (this.block.act === 'work' && this.profile.style === 'station' && this.stage === 'stay') {
      this.go();
      return;
    }
    this.go();
  }

  onReleased() {
    this.interrupt = null;
    this.block = null; // forces a fresh start next update
  }

  /** Something happened nearby. */
  reactTo(kind: string, at: V3, dist: number) {
    if (this.npc.controlled || this.npc.away) return;
    if (this.interrupt && this.interrupt.kind !== 'chat' && this.interrupt.kind !== 'react') return;
    if (this.interrupt?.kind === 'chat') this.life.endChat(this.interrupt.with, this);
    const now = this.life.now;
    const delay = this.reaction * 0.5;
    this.hold({ kind: 'react', until: now + 6 + delay });
    this.life.later(delay, () => {
      if (this.interrupt?.kind !== 'react') return;
      this.life.say(this, react(this.rng, kind === 'death' && dist > 22 ? 'deathFar' : kind), 2.6);
      this.npc.lookAt(at);
      if (kind === 'death') {
        if (this.courage < 0.55 || this.rng() < 0.4) {
          // Morbid curiosity: go have a look.
          const ang = this.rng() * Math.PI * 2;
          const r = 3 + this.rng() * 2;
          this.npc.walkTo({ x: at.x + Math.cos(ang) * r, z: at.z + Math.sin(ang) * r }, () => {
            this.npc.lookAt(at);
            this.npc.pose = this.rng() < 0.5 ? 'cower' : 'stand';
          });
          (this.interrupt as { until: number }).until = now + 16;
        } else {
          // Nope.
          const dx = this.npc.pos.x - at.x, dz = this.npc.pos.z - at.z;
          const d = Math.hypot(dx, dz) || 1;
          this.npc.walkTo({ x: this.npc.pos.x + (dx / d) * 14, z: this.npc.pos.z + (dz / d) * 14 }, () => (this.npc.pose = 'cower'), true);
        }
      } else if (kind === 'fight') {
        this.npc.pose = 'cheer';
      } else {
        this.npc.pose = 'stand';
      }
    });
  }

  hear(g: Gossip) {
    this.knows.add(g.id);
  }

  // ------------------------------------------------------------ per frame

  update(dt: number) {
    const npc = this.npc;
    if (npc.controlled || npc.helping) return;
    this.chatCooldown -= dt;
    const now = this.life.now;
    const it = this.interrupt;
    if (it) {
      if (it.kind === 'player') {
        npc.lookAt(it.at);
        return;
      }
      if (it.kind === 'chat') {
        npc.lookAt(it.with.npc.pos);
        if (now > it.until) this.resume();
        return;
      }
      if (now > it.until) this.resume();
      return;
    }
    const clock = this.life.clock;
    const hour = clock.hour;
    if (this.planDay !== clock.day) this.replan(hour);
    const b = blockAt(this.plan, hour);
    if (b !== this.block) this.startBlock(b);

    // Work chatter.
    if ((this.mutterT -= dt) <= 0) {
      this.mutterT = 25 + this.rng() * 50;
      if (this.block?.act === 'work' && this.stage === 'stay' && !npc.away) this.mutter();
    }

    if (this.stage !== 'stay' || npc.moving) return;
    if ((this.stayT -= dt) > 0) return;
    // Time to do the next little thing within the same block.
    const act = this.block!.act;
    if (act === 'work' && this.profile.style === 'patrol') return this.nextPatrol();
    if (!this.place) return this.wanderStep();
    if (act === 'travel') {
      // No transit system took them; leave town for a while.
      if (!this.travelGone) {
        this.travelGone = true;
        npc.away = true;
        this.stayT = 1e9;
      }
      return;
    }
    if (act === 'shop' && this.ordered) {
      // Done shopping: browse outside a moment.
      this.life.leave(this, this.place);
      this.place = null;
      this.wanderBase = null;
      return this.wanderStep();
    }
    if (act === 'visit') {
      // Nobody answered. Hang around a bit and go.
      this.place = null;
      return this.wanderStep();
    }
    if (act === 'sleep') return;
    // Move to another spot inside (people fidget).
    const pl = this.place;
    this.stage = 'inside';
    npc.pose = 'stand';
    this.life.releaseSpot(this);
    const t = pl.spots?.length && this.rng() < 0.7 ? this.life.claimSpot(this, pl) ?? this.randomInside(pl) : this.randomInside(pl);
    npc.walkTo(t, () => this.settle());
  }

  /** Called when the person comes back from a trip at a transit stop. */
  returnFrom(at: V3) {
    this.npc.away = false;
    this.npc.place(at);
    this.travelGone = false;
    this.block = null;
  }

  /** Board a vehicle that just arrived at this stop. */
  get waitingAt(): LifePlace | null {
    return this.block?.act === 'travel' && this.stage === 'stay' && !this.travelGone ? this.place : null;
  }

  board() {
    this.travelGone = true;
    this.npc.away = true;
    this.stayT = 1e9;
  }

  setPose(p: Pose) {
    this.npc.pose = p;
  }
}

export function center(b: { min: { x: number; z: number }; max: { x: number; z: number } }): V3 {
  return { x: (b.min.x + b.max.x) / 2, y: 0, z: (b.min.z + b.max.z) / 2 };
}
