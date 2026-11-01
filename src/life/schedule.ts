import type { JobProfile, PlaceKind } from './types';
import type { Rng } from '../util';

/** Profiles for the jobs in deaths.ts. Maps add their own with LifeMap.jobProfiles. */
export const DEFAULT_PROFILES: JobProfile[] = [
  {
    job: 'Farmhand',
    style: 'roam',
    shift: [6, 16],
    workKinds: ['work'],
    likes: ['food', 'bar', 'park'],
    workLines: ['These cows ain\'t gonna milk themselves.', 'Hay is for horses. And for me, apparently.', 'Smells like money. And manure.'],
    talkLines: ["Don't touch the fence. Learned that one the hard way.", 'Early bird gets the worm. The worm gets nothing.', "Hoffman pays in cash and eggs. Mostly eggs."],
  },
  {
    job: 'Mechanic',
    style: 'station',
    shift: [8, 17],
    workKinds: ['work', 'shop'],
    likes: ['food', 'bar'],
    workLines: ['Your blinker fluid is low.', 'Who put a sandwich in the carburetor?', "That's gonna cost ya."],
    talkLines: ["Don't drink anything in a jug in my garage. I'm serious.", "Sounds like your transmission. Everything's the transmission.", 'I can fix anything except my marriage.'],
  },
  {
    job: 'Mail Carrier',
    style: 'patrol',
    shift: [8, 15],
    workKinds: ['civic'],
    likes: ['food', 'park'],
    workLines: ['Bills, bills, coupons, bills.', 'Nice doggy. NICE doggy.', 'Neither rain nor sleet. Mostly dogs though.'],
    talkLines: ["Nobody writes letters anymore. It's all catalogs.", 'I know everyone\'s secrets. Mostly what magazines they get.', 'One more dog bite and I get a pension.'],
  },
  {
    job: 'Retiree',
    style: 'none',
    likes: ['park', 'bench', 'food', 'worship', 'shop'],
    talkLines: ['Back in my day, we died of normal things.', 'My hip can predict the weather. Rain at four.', 'Have you seen my glasses? They are on my head, aren\'t they.', 'I walked uphill both ways. In a coma.'],
  },
  {
    job: 'Banker',
    style: 'station',
    shift: [9, 17],
    workKinds: ['civic', 'work'],
    likes: ['bar', 'food'],
    workLines: ['Interest rates are... interesting.', 'Please hold.', 'Your loan is denied. Have a lollipop.'],
    talkLines: ['Money doesn\'t grow on trees. I checked.', 'Our overdraft fees are very competitive.', 'Never trust anyone who smiles at a spreadsheet. Like me.'],
  },
  {
    job: 'Teen',
    style: 'none',
    likes: ['park', 'shop', 'attraction', 'food'],
    talkLines: ['This town is literally so boring.', "Don't tell my mom you saw me.", 'Ok boomer.', 'I could totally jump off that. Easy.'],
  },
  {
    job: 'Dentist',
    style: 'station',
    shift: [8, 16],
    workKinds: ['civic', 'work'],
    likes: ['food', 'park'],
    workLines: ['Floss. Please. I am begging you.', 'This might pinch. A lot.'],
    talkLines: ["You've got a cavity. I can tell from here.", 'Sugar is the devil. Want a lollipop?', 'Open wide. Habit, sorry.'],
  },
  {
    job: 'Diner Cook',
    style: 'station',
    shift: [6, 15],
    workKinds: ['food'],
    likes: ['bar', 'park'],
    workLines: ['Order up!', 'Who ordered the meatloaf? Nobody? Again?', 'Two eggs, flipped, burnt. House special.', 'Hot plate! HOT PLATE!'],
    talkLines: ['The pie is fresh. The coffee is not.', 'Health inspector comes Tuesdays. Today\'s not Tuesday.', 'Our cookies have peanut butter in them. Like, a LOT.'],
  },
  {
    job: 'Insurance Salesman',
    style: 'patrol',
    shift: [9, 17],
    workKinds: ['work', 'civic'],
    likes: ['bar', 'food'],
    workLines: ['Have you considered dying? Financially, I mean.', 'Mortalis Mutual: we\'re there for you. Legally.', 'Sign here, here, and here.'],
    talkLines: ['Have you thought about what happens to your family when you die horribly?', 'Our policies cover everything except what actually happens.', 'Fine print? What fine print?'],
  },
  {
    job: 'Pastor',
    style: 'station',
    shift: [8, 18],
    workKinds: ['worship'],
    likes: ['food', 'park'],
    workLines: ['Bless you. And you. You, not so much.'],
    talkLines: ['The Lord works in mysterious ways. Lately very mysterious.', 'Have you been saved? You look like you need saving.', 'Repent! Or don\'t. Free will and all.'],
  },
  {
    job: 'Crossing Guard',
    style: 'station',
    shift: [7, 16],
    workKinds: ['civic'],
    likes: ['food', 'bench'],
    workLines: ['STOP! Okay, go.', 'Walk, don\'t run!', 'I have a sign and I am not afraid to use it.'],
    talkLines: ['Thirty years, and only one kid got hit. And that was a bounce.', 'Look both ways. Then look again. Then once more.'],
  },
  {
    job: 'Influencer',
    style: 'roam',
    shift: [10, 18],
    workKinds: ['attraction', 'park'],
    likes: ['food', 'attraction', 'shop', 'bar'],
    workLines: ['Hey guys, welcome back to my channel!', 'Smash that like button.', 'This light is SO good right now.'],
    talkLines: ['Can you film me jumping off something?', "I'm basically famous. 400 followers.", 'This is so going on my story.', 'Do something crazy. I need content.'],
  },
  {
    job: 'Cop',
    style: 'patrol',
    shift: [8, 20],
    workKinds: ['civic'],
    likes: ['food', 'shop'],
    workLines: ['Move along.', "I've got my eye on you.", 'Anybody seen my taser?'],
    talkLines: ["Stay out of the station unless you've got a badge.", 'Donuts are a stereotype. Do you have any donuts?', "I'm not saying I'd tase you. I'm saying I could."],
  },
  {
    job: 'Construction Worker',
    style: 'roam',
    shift: [7, 15],
    workKinds: ['work'],
    likes: ['food', 'bar'],
    workLines: ['Measure twice, cut once. Or never.', 'OSHA can\'t see us up here.', 'Hey, hard hat area!'],
    talkLines: ["That water tower railing is load-bearing. Probably.", "Don't stand under anything I'm standing on.", 'Safety third.'],
  },
];

export type Act = 'sleep' | 'home' | 'work' | 'lunch' | 'eat' | 'shop' | 'leisure' | 'drink' | 'visit' | 'wander' | 'travel' | 'worship';

export interface Block {
  /** Start hour, 0 to 24. */
  from: number;
  to: number;
  act: Act;
  /** Place id when the act is tied to one. */
  place?: string;
}

const KIND_ACT: Record<string, Act> = {
  food: 'eat',
  shop: 'shop',
  bar: 'drink',
  park: 'leisure',
  bench: 'leisure',
  beach: 'leisure',
  attraction: 'leisure',
  worship: 'worship',
  transit: 'travel',
};

export function actForKind(kind: PlaceKind): Act {
  return KIND_ACT[kind] ?? 'leisure';
}

export interface PlanInput {
  rng: Rng;
  profile: JobProfile;
  hasHome: boolean;
  hasWork: boolean;
  weekend: boolean;
  shift?: [number, number];
  lunch?: [number, number];
  lunchAt?: string;
  /** Picks a place for a free-time act; returns null when nothing fits. */
  pickPlace(kinds: readonly PlaceKind[], hour: number): { id: string; kind: PlaceKind } | null;
  hasFriends: boolean;
  canTravel: boolean;
}

/** One person's day as a list of time blocks covering 0 to 24. */
export function planDay(p: PlanInput): Block[] {
  const { rng, profile } = p;
  const owl = profile.nightOwl ? 4 : 0;
  const wake = 6 + rng() * 2 + owl;
  const bed = Math.min(23.5 + owl, 21.5 + rng() * 2.5 + owl);
  const blocks: Block[] = [];
  const home: Act = p.hasHome ? 'home' : 'wander';
  const push = (from: number, to: number, act: Act, place?: string) => {
    if (to - from < 0.05) return;
    blocks.push({ from, to, act, place });
  };

  // Work window.
  let work: [number, number] | null = null;
  const works = profile.style !== 'none' && p.hasWork && (!p.weekend || rng() < 0.35);
  if (works) {
    const s = p.shift ?? profile.shift ?? [9, 17];
    work = [Math.max(s[0] + (rng() - 0.5) * 0.4, wake + 0.4), s[1] + (rng() - 0.5) * 0.4];
  }

  // Fill free time with outings.
  const outings = (from: number, to: number) => {
    let t = from;
    while (to - t > 0.3) {
      const len = Math.min(to - t, 0.6 + rng() * 1.6);
      const r = rng();
      const likes = profile.likes ?? ['park', 'food', 'shop'];
      let placed = false;
      if (r < 0.72) {
        // A liked place, favoring the first ones.
        const kinds = rng() < 0.6 ? [likes[0]] : rng() < 0.5 ? likes.slice(0, 2) : likes;
        const pl = p.pickPlace(kinds, t + len / 2);
        if (pl) {
          const act = actForKind(pl.kind);
          const l = act === 'shop' ? Math.min(len, 0.4 + rng() * 0.3) : len;
          push(t, t + l, act, pl.id);
          t += l;
          placed = true;
        }
      } else if (r < 0.8 && p.hasFriends) {
        push(t, t + len, 'visit');
        t += len;
        placed = true;
      } else if (r < 0.83 && p.canTravel && !work) {
        push(t, t + Math.max(len, 2), 'travel');
        t += Math.max(len, 2);
        placed = true;
      } else if (r < 0.9) {
        push(t, t + len, home);
        t += len;
        placed = true;
      }
      if (!placed) {
        push(t, t + len, 'wander');
        t += len;
      }
    }
  };

  push(0, wake, 'sleep');
  if (work) {
    // A bit of morning at home or out for coffee.
    if (work[0] - wake > 0.8 && rng() < 0.5) {
      const pl = p.pickPlace(['food', 'shop'], wake + 0.4);
      if (pl) push(wake, work[0], actForKind(pl.kind), pl.id);
      else push(wake, work[0], home);
    } else push(wake, work[0], home);
    // Lunch break.
    const lunch = p.lunch ?? (work[1] - work[0] > 6 && rng() < 0.75 ? ([12 + (rng() - 0.5), 12.75 + (rng() - 0.5) * 0.5] as [number, number]) : null);
    if (lunch && lunch[0] > work[0] && lunch[1] < work[1]) {
      const pl = p.lunchAt ? { id: p.lunchAt, kind: 'food' } : p.pickPlace(['food', 'shop'], lunch[0]);
      push(work[0], lunch[0], 'work');
      if (pl) push(lunch[0], lunch[1], 'lunch', pl.id);
      else push(lunch[0], lunch[1], 'work');
      push(lunch[1], work[1], 'work');
    } else push(work[0], work[1], 'work');
    outings(work[1], bed);
  } else {
    outings(wake, bed);
  }
  push(bed, 24, 'sleep');
  // Merge back-to-back blocks of the same act and place.
  const out: Block[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && last.act === b.act && last.place === b.place) last.to = b.to;
    else out.push(b);
  }
  return out;
}

export function blockAt(plan: Block[], hour: number): Block {
  for (const b of plan) if (hour >= b.from && hour < b.to) return b;
  return plan[plan.length - 1];
}

export const ACT_LABEL: Record<Act, string> = {
  sleep: 'Sleeping',
  home: 'At home',
  work: 'Working',
  lunch: 'On lunch break',
  eat: 'Eating out',
  shop: 'Shopping',
  leisure: 'Relaxing',
  drink: 'Having a drink',
  visit: 'Visiting a friend',
  wander: 'Wandering around',
  travel: 'Travelling',
  worship: 'At church',
};
