import { pick, type Rng } from '../util';

/** How two people know each other. */
export type RelKind = 'family' | 'partner' | 'friend' | 'coworker' | 'rival' | 'neighbor' | 'stranger';

/** A piece of news people pass around. */
export interface Gossip {
  id: number;
  kind: 'death' | 'fight' | 'scream' | 'pee' | 'weird' | 'arrival';
  /** Who it was about. */
  who: string;
  /** Short description, e.g. 'got flattened by a hay bale'. */
  what: string;
  where: string;
  /** Game hour total when it happened. */
  when: number;
  /** How juicy it is: bigger news spreads faster. */
  heat: number;
}

export interface Talker {
  first: string;
  name: string;
  job: string;
  mood: number; // -1 sad .. 1 happy
  quirk: string;
  doing: string; // 'on my way to the diner'
}

type Line = string | ((r: Rng) => string);

const fill = (r: Rng, lines: readonly Line[], vars: Record<string, string>) => {
  const l = pick(r, lines);
  const s = typeof l === 'function' ? l(r) : l;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? k);
};

const GREET: Record<RelKind, Line[]> = {
  family: ['Hey {other}! Mom says call her.', '{other}! You still owe me twenty bucks.', 'Oh. It\'s you, {other}.', 'Hi {other}. Thanksgiving is at mine this year. Don\'t bring the casserole.'],
  partner: ['Hi honey!', 'There you are, {other}. Did you feed the cat?', 'Hey babe.'],
  friend: ['{other}! My dude!', 'Heyyy, {other}!', 'Look who it is!', '{other}! I was just thinking about you. Weird.'],
  coworker: ['Morning, {other}.', '{other}. Busy day?', 'Ugh, {other}. Don\'t even talk to me about work.'],
  rival: ['{other}.', 'Oh great. {other}.', 'Still alive, {other}? Shame.', 'Get out of my way, {other}.'],
  neighbor: ['Hi neighbor!', 'Hey {other}, your sprinkler hit my car again.', 'Evening, {other}.'],
  stranger: ['Hi.', 'Hello there.', 'Afternoon.', '...Hey.', 'Nice day, huh?'],
};

const REPLY: Record<RelKind, Line[]> = {
  family: ['Not now, {other}.', 'Yeah, yeah.', 'Love you too, weirdo.'],
  partner: ['Love you!', 'I fed it. I think.', 'Mhm.'],
  friend: ['Ayyy!', 'What\'s up, {other}!', 'Long time no see!'],
  coworker: ['Hey.', 'Don\'t remind me.', 'Five more hours.'],
  rival: ['Whatever.', 'Bite me, {other}.', 'Hmph.'],
  neighbor: ['Hi there!', 'Sorry about the sprinkler.', 'Evening!'],
  stranger: ['Hi.', 'Hello.', 'Uh, hey.', 'Yep.'],
};

const SMALL_TALK: Line[] = [
  'Weather\'s weird today.',
  'Did you see the price of eggs?',
  'I swear the train gets louder every day.',
  'My cousin says this town is cursed.',
  'Mortalis Mutual denied my claim again. My house literally exploded.',
  'Somebody keeps stealing my newspaper.',
  'I think the water tower is leaning.',
  'I had the weirdest dream. A guy with a scythe was looking at me.',
  'I saw a ghost last night. He looked annoyed.',
  'Have you tried the pie at the diner? Don\'t.',
  'I\'m thinking of getting into crypto.',
  'My back hurts. My front hurts too.',
  'Feels like people keep dying around here. Statistically, I mean.',
];

const SMALL_REPLY: Line[] = ['Ha, tell me about it.', 'Mhm.', 'Totally.', 'I know, right?', 'Huh. Weird.', 'Yeah...', 'Please stop talking.', 'Same.'];

const BYE: Line[] = ['Anyway, see ya.', 'Gotta run.', 'Later!', 'Okay, bye.', 'Don\'t die!', 'Take care.'];

const GOSSIP_TELL: Line[] = [
  'Did you hear? {who} {what} at {where}.',
  'You will NOT believe it. {who} {what}.',
  'So apparently {who} {what}. At {where}! In broad daylight!',
  'Okay don\'t tell anyone, but {who} {what}.',
];

const GOSSIP_REACT: Line[] = [
  'No way. I just saw them yesterday!',
  'Oh my god.',
  'That\'s the third one this week.',
  'Honestly? Saw it coming.',
  'I\'m never going to {where} again.',
  'Did Mortalis pay out?',
  'Huh. More pie for me.',
  'Poor {who}. They owed me money.',
];

const MOURN: Line[] = ['I still can\'t believe {who} is gone.', 'I miss {who}.', '{who} would have loved this weather.'];

const DOING_LINES: Line[] = ["I'm {doing}.", 'Just {doing}.', "Can't talk long, I'm {doing}.", "Oh, you know. {doing}."];

const MOOD_LINES: Record<'sad' | 'ok' | 'happy', Line[]> = {
  sad: ['Honestly? Not great.', 'Everything is gray.', 'I\'ve been better. Much better.'],
  ok: ['Can\'t complain. I mean I could.', 'Fine. Normal fine.', 'Same old, same old.'],
  happy: ['Great, actually! Don\'t ruin it.', 'Living the dream!', 'Best day ever, probably.'],
};

/** A back-and-forth between two townsfolk, as alternating lines. */
export function conversation(
  r: Rng,
  a: Talker,
  b: Talker,
  rel: RelKind,
  news: { tell: Gossip | null; mourn: string | null },
  smallTalk: readonly string[],
): { by: 0 | 1; text: string }[] {
  const out: { by: 0 | 1; text: string }[] = [];
  out.push({ by: 0, text: fill(r, GREET[rel], { other: b.first }) });
  out.push({ by: 1, text: fill(r, REPLY[rel], { other: a.first }) });
  if (news.tell) {
    const g = news.tell;
    const v = { who: g.who, what: g.what, where: g.where };
    out.push({ by: 0, text: fill(r, GOSSIP_TELL, v) });
    out.push({ by: 1, text: fill(r, GOSSIP_REACT, v) });
  } else if (news.mourn) {
    out.push({ by: 0, text: fill(r, MOURN, { who: news.mourn }) });
    out.push({ by: 1, text: pick(r, ['I\'m so sorry.', 'Yeah. Me too.', 'At least it was quick. Was it quick?']) });
  } else if (r() < 0.5) {
    out.push({ by: 0, text: fill(r, [...SMALL_TALK, ...smallTalk], {}) });
    out.push({ by: 1, text: fill(r, SMALL_REPLY, {}) });
  } else {
    out.push({ by: 0, text: 'How are you doing?' });
    out.push({ by: 1, text: fill(r, MOOD_LINES[b.mood < -0.3 ? 'sad' : b.mood > 0.4 ? 'happy' : 'ok'], {}) + ' ' + fill(r, DOING_LINES, { doing: b.doing }) });
  }
  if (r() < 0.6) out.push({ by: 0, text: fill(r, BYE, {}) });
  return out;
}

// ---------------------------------------------------------------- talking to the player

/** How someone greets the player, who is wearing a townsperson they may know. */
export function greetPlayer(r: Rng, me: Talker, body: { first: string; job: string }, rel: RelKind) {
  const lines: Record<RelKind, Line[]> = {
    family: ['{other}? You look... different. Did you get a haircut?', 'Hey {other}. Mom says you never call.', '{other}! Why are you walking like that?'],
    partner: ['Honey? Your eyes look kind of... glowy.', 'There you are! Where were you last night?', 'Hi babe. You smell like sulfur.'],
    friend: ['{other}! Buddy! You okay? You seem off.', 'Heyyy {other}! Wait, are you sick? You look pale.', 'Yo {other}!'],
    coworker: ['{other}. Shouldn\'t you be at work?', 'Hey {other}. The boss is looking for you.'],
    rival: ['What do YOU want, {other}?', 'Ugh. {other}.', 'Back off, {other}.'],
    neighbor: ['Oh, hi {other}! Your dog got out again.', 'Morning, neighbor!'],
    stranger: ['Can I help you?', 'Uh, hi?', 'Do I know you?', 'Yeah?'],
  };
  return fill(r, lines[rel], { other: body.first });
}

export function howAreYou(r: Rng, me: Talker) {
  const m = me.mood < -0.3 ? 'sad' : me.mood > 0.4 ? 'happy' : 'ok';
  return fill(r, MOOD_LINES[m], {}) + ' ' + fill(r, DOING_LINES, { doing: me.doing });
}

export function tellGossip(r: Rng, g: Gossip) {
  return fill(r, GOSSIP_TELL, { who: g.who, what: g.what, where: g.where });
}

/** What people say about the job of the body the player is wearing. Null for jobs nobody has opinions on. */
const ABOUT_JOB: Record<string, Line[]> = {
  Cop: ["Officer! I didn't do anything!", 'Evening, officer. Lovely uniform.', 'Is there a problem, officer? Is it the sprinkler? It\'s the sprinkler.'],
  Pastor: ["Pastor! I've been meaning to come back to church. I've been busy. Sinning, mostly.", 'Bless me, Pastor, for I have... no, never mind.'],
  'Mail Carrier': ['Anything for me? Is it a check? It\'s a bill, isn\'t it.', "You're late. You're always late."],
  'Insurance Salesman': ["I'm not buying a policy. I don't care how good the dental is.", 'Oh no. Oh no, it\'s the insurance guy. Act natural.'],
  Banker: ['My loan application! Any news? No? You never call.', "Must be nice, banker. Must be real nice."],
  Dentist: ["Doc! I've been flossing! ...Mostly.", "Please don't look at my teeth. I'm begging you."],
  Teen: ["Shouldn't you be in school?", 'Get off my lawn. Or any lawn. In general.'],
  Influencer: ['Are you filming me right now? Am I in it?', 'Oh, it\'s you. Smash that like button, I guess.'],
  Retiree: ['Afternoon! Hot enough for ya?', 'Did you just get here, or have you been standing there since 1974?'],
  'Diner Cook': ["My eggs were runny this morning. I'm not mad. I'm disappointed."],
  Mechanic: ['My truck is making the noise again. The clunk. Not the clank.', "You're the guy who charged me $400 to tighten a cap."],
  Farmhand: ['You smell like the barn.', 'How are the cows? Do they know?'],
  'Crossing Guard': ['Do you stop traffic everywhere, or just at the school?'],
  'Construction Worker': ["When's the road work going to be done? It's been eleven years."],
  Nurse: ['Can you look at this rash real quick?'],
  Doctor: ["Doc, while I've got you. This mole. Is it a mole?"],
  Inmate: ["Don't look at me. I don't know you."],
  'Prison Guard': ["I didn't see nothing, boss."],
};

/** Something someone says because of who the player is (their job), not who they are. */
export function aboutYou(r: Rng, job: string, rel: RelKind): string | null {
  if (rel !== 'stranger' && rel !== 'neighbor') return null;
  const lines = ABOUT_JOB[job];
  return lines ? fill(r, lines, {}) : null;
}

// ---------------------------------------------------------------- reactions

export const REACT: Record<string, Line[]> = {
  death: ['OH MY GOD!', 'AAAAAH!', 'Somebody call 911!', 'Is he okay?? He is NOT okay.', 'I\'m not cleaning that up.', 'Did anyone film that?', 'Not again!', 'Oh no, oh no, oh no.'],
  deathFar: ['What was that?!', 'Did you hear that?', 'Huh?'],
  scream: ['What? Who\'s screaming?', 'Shut UP!', 'Is someone hurt?'],
  pee: ['SIR!', 'Ew! In public?!', 'There are CHILDREN here!', 'Not on the hydrangeas!'],
  fight: ['FIGHT! FIGHT! FIGHT!', 'Whoa, whoa!', 'Somebody call the cops!', 'Get him!'],
  bump: ['Watch it!', 'Hey!', 'Excuse YOU.', 'Rude.', 'Oof.'],
};

export function react(r: Rng, kind: string) {
  return fill(r, REACT[kind] ?? REACT.scream, {});
}

/** Things a shopper and a clerk say at the counter. */
export function orderLines(r: Rng, item: string, price: number, staffLines: readonly string[]) {
  const ask = fill(r, ['One {item}, please.', 'Can I get a {item}?', 'I\'ll take the {item}.', '{item}. And make it snappy.', 'Do you have {item}? Great. One.'], { item });
  const reply = pick(r, [
    `That's $${price}.`,
    `$${price}. Have a nice day.`,
    `Coming right up. $${price}.`,
    ...staffLines,
  ]);
  return { ask, reply };
}
