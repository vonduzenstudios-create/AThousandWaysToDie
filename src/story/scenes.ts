import type { CharSlot, Scene, Shot } from './cutscene';
import type { Expr, Outfit, Prop, VehicleKind } from './art';

/*
 * The story, as cutscene scripts. Scene ids:
 *   'opening'          plays the first time a new game starts
 *   '<map>:<deaths>'   plays when a travel milestone unlocks (e.g. 'smallville:25')
 * Milestones without a hand-written scene get milestoneScene()'s generic version.
 */

const D = (expr: Expr, extra: Partial<CharSlot> = {}): CharSlot => ({ who: 'death', expr, x: 1130, ...extra });
const G = (expr: Expr, extra: Partial<CharSlot> = {}): CharSlot => ({ who: 'ghost', expr, x: 440, ...extra });
const deathOn = (outfit: Outfit, prop: Prop) => (expr: Expr, extra: Partial<CharSlot> = {}) => D(expr, { outfit, prop, ...extra });

export const OPENING: Scene = {
  id: 'opening',
  shots: [
    { bg: 'black', caption: 'Smallville. Thanksgiving.', bed: 'comedy', hold: 1.4 },
    {
      bg: 'backyard',
      chars: [{ who: 'gary', expr: 'happy', x: 560, enter: 'left' }],
      who: 'Gary',
      line: 'Twenty-pound frozen turkey. Ten gallons of boiling oil. Flip-flops. What could go wrong?',
    },
    {
      bg: 'focus-red',
      chars: [{ who: 'gary', expr: 'shock', x: 800, scale: 1.15 }],
      fx: ['shake'],
      sting: 'sploosh',
      big: { text: 'SPLOOSH', color: '#ffe066', y: 180 },
      who: 'Gary',
      line: '...why is it doing that',
      bed: 'none',
    },
    { bg: 'explosion', fx: ['bigshake', 'flash'], sting: 'boom', big: { text: 'KA-BOOOOM!!', size: 210, y: 450, color: '#fff' }, hold: 1.3 },
    { bg: 'black', caption: 'Gary Pruitt, 41. Cause of death: turkey.', hold: 2 },
    {
      bg: 'office',
      chars: [{ who: 'adjuster', expr: 'smug', x: 520, enter: 'right' }],
      who: 'Mortalis Mutual',
      line: 'Claim reviewed. Policy clause 88(f): "Death by Obvious Stupidity." Payout to the family: zero dollars.',
      bed: 'tension',
    },
    {
      bg: 'office',
      chars: [{ who: 'adjuster', expr: 'smug', x: 520 }],
      stamp: 'DENIED',
      sting: 'stamp',
      fx: ['shake'],
      hold: 1.4,
    },
    {
      bg: 'dmv',
      chars: [G('shock', { enter: 'rise' })],
      sting: 'ding',
      who: 'Gary',
      line: 'Wait. WAIT. My family gets NOTHING?',
      bed: 'comedy',
    },
    {
      bg: 'dmv',
      chars: [G('shock'), D('tired', { prop: 'coffee', enter: 'right' })],
      who: 'Death',
      line: 'Now serving number four million, one hundred and twelve. Name? ...Ah. The turkey guy.',
    },
    {
      bg: 'focus-red',
      chars: [G('angry', { x: 800, scale: 1.15 })],
      fx: ['shake'],
      sting: 'impact',
      who: 'Gary',
      line: 'You killed me with a TURKEY! You couldn\'t give me a nice heart attack? A dignified fall down the stairs?',
    },
    {
      bg: 'dmv',
      chars: [G('angry'), D('tired', { prop: 'coffee' })],
      who: 'Death',
      line: 'Pal, I do a hundred and fifty thousand of these a day. You get what you get.',
    },
    {
      bg: 'dmv',
      chars: [G('angry'), D('tired', { prop: 'coffee' })],
      who: 'Gary',
      line: 'Then you\'re BAD at your job! I could do it better than you in my SLEEP!',
    },
    {
      bg: 'focus-purple',
      chars: [D('angry', { x: 800, scale: 1.1 })],
      fx: ['menace'],
      sting: 'dun',
      bed: 'tension',
      who: 'Death',
      line: '...Oh, could you.',
    },
    {
      bg: 'focus-purple',
      chars: [D('angry', { x: 800, scale: 1.45 })],
      fx: ['bigshake', 'flash', 'menace'],
      sting: 'impact',
      zoom: [1, 1.12],
      focus: [800, 330],
      who: 'Death',
      line: 'FINE. YOU DO IT THEN!',
    },
    {
      bg: 'speed-blue',
      chars: [G('shock', { x: 800, prop: 'scythe', enter: 'pop' })],
      sting: 'whoosh',
      big: { text: '!!', size: 220, x: 1180, y: 220, color: '#fff' },
      who: 'Gary',
      line: 'Is... is this the scythe?',
      bed: 'comedy',
    },
    {
      bg: 'dmv',
      chars: [G('shock', { prop: 'scythe' }), D('smug', { prop: 'coffee' })],
      who: 'Death',
      line: 'Scythe vision, body jumping, the whole package. Look at anyone and you see their file. Pick someone, hop in, and find them a way to go.',
    },
    {
      bg: 'dmv',
      chars: [G('neutral', { prop: 'scythe' }), D('smug', { prop: 'coffee' })],
      who: 'Death',
      line: 'Every death you file is a claim Mortalis has to pay out. Just don\'t take anybody who isn\'t due. The Big Guy notices.',
    },
    {
      bg: 'sparkle',
      chars: [G('determined', { x: 800, prop: 'scythe', scale: 1.1 })],
      fx: ['focus'],
      sting: 'sparkle',
      bed: 'triumph',
      who: 'Gary',
      line: 'Every claim they pay... goes to my family. Mortalis is going to pay for every single one.',
    },
    {
      bg: 'dmv',
      chars: [G('determined', { prop: 'scythe' }), D('happy', { prop: 'coffee' })],
      who: 'Death',
      line: 'Sure, whatever. I\'m going on break. My first break in six thousand years.',
    },
    { bg: 'black', title: { text: "C'EST LA VIE", sub: '1,000 ways to go.' }, sting: 'title', hold: 2.6 },
  ],
};

/** Hand-written milestone scenes, keyed by the travel system's milestone id. */
export const MILESTONES: Record<string, Scene> = {
  'smallville:25': {
    id: 'smallville:25',
    shots: [
      { bg: 'black', caption: 'Meanwhile, at Lake Whisper...', bed: 'warm', hold: 1.4 },
      {
        bg: 'lake',
        chars: [deathOn('fishing', 'rod')('happy', { x: 1000, enter: 'right' })],
        who: 'Death',
        line: 'Twenty-five. Twenty-five deaths in Smallville, and every one of them filed in triplicate.',
      },
      {
        bg: 'lake',
        chars: [G('shock', { enter: 'pop' }), deathOn('fishing', 'rod')('happy', { x: 1130 })],
        sting: 'whoosh',
        who: 'Gary',
        line: 'Are you... fishing?',
      },
      {
        bg: 'sparkle',
        chars: [deathOn('fishing', 'rod')('proud', { x: 800, scale: 1.1 })],
        fx: ['petals'],
        sting: 'sparkle',
        who: 'Death',
        line: 'I\'m proud of you, kid. Really. You know what I did this week? Nothing. I\'m enjoying my free time. I caught a boot. Best week of my afterlife.',
      },
      {
        bg: 'lake',
        chars: [G('happy'), deathOn('fishing', 'rod')('happy')],
        who: 'Gary',
        line: '...Thanks? I think?',
      },
      {
        bg: 'lake',
        chars: [G('neutral'), deathOn('fishing', 'pass')('smug')],
        who: 'Death',
        line: 'Smallville\'s tapped out anyway. Here. A bus pass. Downtown\'s got more people, more traffic, more ways to go.',
      },
      {
        bg: 'focus-gold',
        chars: [G('determined', { x: 800, prop: 'scythe', scale: 1.1 })],
        sting: 'sparkle',
        big: { text: 'BUS PASS GET!', color: '#fff', y: 190 },
        hold: 1.6,
      },
      {
        bg: 'lake',
        chars: [G('determined', { prop: 'scythe' }), deathOn('fishing', 'rod')('happy')],
        who: 'Death',
        line: 'Bus stop\'s on Main Street. The train goes there too, if you\'re feeling fancy. Now beat it, the fish are biting.',
      },
      { bg: 'road', vehicle: { kind: 'bus' }, sting: 'honk', caption: 'NEXT STOP: DOWNTOWN', bed: 'triumph', hold: 2.8 },
    ],
  },

  'city:25': {
    id: 'city:25',
    shots: [
      { bg: 'black', caption: 'Meanwhile, on the back nine...', bed: 'warm', hold: 1.4 },
      {
        bg: 'golf',
        chars: [deathOn('golf', 'club')('happy', { x: 1000, enter: 'right' })],
        sting: 'thwack',
        who: 'Death',
        line: 'FORE! ...Oh, hey. Twenty-five in the city! Look at you. Big city reaper.',
      },
      {
        bg: 'golf',
        chars: [G('determined', { prop: 'scythe', enter: 'left' }), deathOn('golf', 'club')('happy', { x: 1130 })],
        who: 'Gary',
        line: 'Mortalis is sweating. They called my wife to "review her file." She hung up on them.',
      },
      {
        bg: 'golf',
        chars: [G('determined', { prop: 'scythe' }), deathOn('golf', 'club')('smug')],
        who: 'Death',
        line: 'Good. Let \'em sweat. I\'m on hole nine. I have never in my existence gotten to hole nine.',
      },
      {
        bg: 'sparkle',
        chars: [deathOn('golf', 'club')('proud', { x: 800, scale: 1.1 })],
        fx: ['petals'],
        sting: 'sparkle',
        who: 'Death',
        line: 'I\'m proud of you. Genuinely. I haven\'t reaped a soul in weeks and the universe hasn\'t even noticed.',
      },
      {
        bg: 'golf',
        chars: [G('happy', { prop: 'scythe' }), deathOn('golf', 'pass')('smug')],
        who: 'Death',
        line: 'The harbor\'s open. Boats out to the coast. Sharks, jellyfish, sunburn. A whole buffet.',
      },
      { bg: 'sea', vehicle: { kind: 'boat', y: 640 }, sting: 'foghorn', caption: 'THE HARBOR IS OPEN', bed: 'triumph', hold: 3 },
    ],
  },

  'city:50': {
    id: 'city:50',
    shots: [
      { bg: 'black', caption: 'Meanwhile, somewhere tropical...', bed: 'warm', hold: 1.4 },
      {
        bg: 'beach',
        chars: [deathOn('vacation', 'drink')('smug', { x: 1050, enter: 'rise' })],
        who: 'Death',
        line: 'Fifty. Fifty in the city. Guess where I am right now.',
      },
      {
        bg: 'beach',
        chars: [G('shock', { prop: 'scythe', enter: 'pop' }), deathOn('vacation', 'drink')('smug', { x: 1130 })],
        who: 'Gary',
        line: '...A beach?',
      },
      {
        bg: 'beach',
        chars: [G('shock', { prop: 'scythe' }), deathOn('vacation', 'drink')('happy')],
        fx: ['shake'],
        sting: 'impact',
        big: { text: 'A TAN!!', color: '#ffb347', x: 1130, y: 160 },
        who: 'Death',
        line: 'A BEACH! I have a tan, Gary. I don\'t have skin, and I have a tan.',
      },
      {
        bg: 'sparkle',
        chars: [deathOn('vacation', 'drink')('proud', { x: 800, scale: 1.1 })],
        fx: ['petals'],
        sting: 'sparkle',
        who: 'Death',
        line: 'You did this. Free time, a mai tai, and a hobby. I\'m proud of you, kid. Don\'t make it weird.',
      },
      {
        bg: 'beach',
        chars: [G('happy', { prop: 'scythe' }), deathOn('vacation', 'drink')('happy')],
        who: 'Gary',
        line: 'So what now?',
      },
      {
        bg: 'beach',
        chars: [G('determined', { prop: 'scythe' }), deathOn('vacation', 'pass')('smug')],
        who: 'Death',
        line: 'Now? The airport. Jet engines, overhead bins, airline food. Go see the world. Kill it a little.',
      },
      { bg: 'sky', vehicle: { kind: 'plane', y: 450 }, sting: 'jet', caption: 'THE AIRPORT IS OPEN', bed: 'triumph', hold: 3 },
    ],
  },
};

/** Display names for map ids in captions. */
const PLACE: Record<string, string> = {
  smallville: 'Smallville',
  city: 'Downtown',
  downtown: 'Downtown',
  bigcity: 'the Big City',
  beach: 'the Coast',
  harbor: 'the Harbor',
  wilderness: 'the Wilderness',
  airport: 'the Airport',
};

export function placeName(id: string) {
  return PLACE[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

const HOBBIES: { outfit: Outfit; prop: Prop; bg: Shot['bg']; line: string }[] = [
  { outfit: 'sweater', prop: 'remote', bg: 'couch', line: 'I binged an entire cooking show. Nine seasons. I don\'t even eat.' },
  { outfit: 'sweater', prop: 'coffee', bg: 'couch', line: 'I took up pottery. I made a mug. It says "#1 Reaper". I bought it, actually, but I could have made it.' },
  { outfit: 'fishing', prop: 'rod', bg: 'lake', line: 'I went fishing again. Caught a fish this time. Threw it back. Professional courtesy.' },
  { outfit: 'vacation', prop: 'drink', bg: 'beach', line: 'I learned the ukulele. Three chords. That\'s all you need, apparently.' },
];

const VEHICLE_FOR: Record<string, { bg: Shot['bg']; y: number; sting: Shot['sting'] }> = {
  bus: { bg: 'road', y: 720, sting: 'honk' },
  train: { bg: 'rails', y: 720, sting: 'whistle' },
  boat: { bg: 'sea', y: 640, sting: 'foghorn' },
  plane: { bg: 'sky', y: 450, sting: 'jet' },
};

/**
 * Generic "proud of you" scene for milestones without a hand-written script.
 * `variant` picks the hobby so repeated generic scenes don't all look the same.
 */
export function milestoneScene(id: string, from: string, to: string, kind: VehicleKind, deaths: number, variant: number): Scene {
  const h = HOBBIES[variant % HOBBIES.length];
  const v = VEHICLE_FOR[kind] ?? VEHICLE_FOR.bus;
  const d = deathOn(h.outfit, h.prop);
  const ride = { bus: 'a bus pass', train: 'a train ticket', boat: 'a boat ticket', plane: 'a plane ticket' }[kind];
  return {
    id,
    shots: [
      { bg: 'black', caption: 'Meanwhile, on Death\'s day off...', bed: 'warm', hold: 1.4 },
      {
        bg: h.bg,
        chars: [d('happy', { x: 1000, enter: 'right' })],
        who: 'Death',
        line: `${deaths} in ${placeName(from)}. You're making this look easy, kid.`,
      },
      {
        bg: h.bg,
        chars: [G('happy', { prop: 'scythe', enter: 'pop' }), d('happy', { x: 1130 })],
        who: 'Gary',
        line: 'What are you even doing with all this free time?',
      },
      { bg: h.bg, chars: [G('happy', { prop: 'scythe' }), d('smug')], who: 'Death', line: h.line },
      {
        bg: 'sparkle',
        chars: [d('proud', { x: 800, scale: 1.1 })],
        fx: ['petals'],
        sting: 'sparkle',
        who: 'Death',
        line: `I'm proud of you. Here's ${ride} to ${placeName(to)}. Go make me prouder.`,
      },
      { bg: v.bg, vehicle: { kind, y: v.y }, sting: v.sting, caption: `NEXT STOP: ${placeName(to).toUpperCase()}`, bed: 'triumph', hold: 2.8 },
    ],
  };
}
