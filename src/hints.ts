import { DEATH_BY_ID, mapOfDeath, sexOfName, type Mental, type PersonFile, type Physical } from './deaths';
import { pick, type Rng } from './util';

/**
 * Death hints: one line per death saying where it is and what kind of body can pull it off.
 *
 * Two things speak them:
 *  - Intrusive Thoughts (the Depressed mind skill): the body you're wearing thinks out loud
 *    about a death on this map that it could actually do ("I bet I'm healthy enough to...").
 *  - Depressed townsfolk, when you talk to them, wish out loud about a death on this map
 *    ("I'm not a nurse, but if I was I bet I could... A man can dream!").
 *
 * `act` is a bare verb phrase that names the place, so it slots into "I bet I could {act}".
 * `needs` lists what a body must have; anything left out means anyone can do it.
 */
export interface HintNeeds {
  /** Any one of these jobs. */
  jobs?: string[];
  /** Jobs that can't (e.g. cops don't get thrown out of the police station). */
  notJobs?: string[];
  physical?: Physical[];
  mental?: Mental[];
  peanut?: boolean;
}

export interface DeathHint {
  act: string;
  needs?: HintNeeds;
}

const CW = ['Construction Worker', 'Foreman'];
const HOSP = ['Doctor', 'Surgeon', 'Nurse', 'EMT', 'Firefighter', 'Janitor', 'Security Guard'];
const MED = ['Doctor', 'Surgeon', 'Nurse', 'EMT'];
const RAMP = ['Baggage Handler', 'Ground Crew', 'Pilot'];
const STORE = ['Butcher', 'Stocker', 'Cashier', 'Deli Clerk', 'Produce Manager', 'Store Manager'];
const INMATE = ['Inmate'];
const GUARDS = ['Prison Guard', 'Warden'];
const ASYLUM_IN = ['Patient', 'Orderly', 'Nurse', 'Psychiatrist'];
const NOT_FEEBLE: Physical[] = ['Normal', 'Athlete'];
const ATHLETE: Physical[] = ['Athlete'];
const FEEBLE: Physical[] = ['Feeble'];

export const DEATH_HINTS: Record<string, DeathHint> = {
  // ---- Smallville, the originals.
  treehouse: { act: 'climb the big oak tree in the park and fall out of the treehouse', needs: { physical: NOT_FEEBLE } },
  antifreeze: { act: 'drink the "sports drink" on the garage shelf at 12 Maple St' },
  shocking: { act: 'pee on the electric fence out at Hoffman Farm' },
  pancake: { act: 'stand on the X in the barn and pull the hay hoist lever', needs: { jobs: ['Farmhand'] } },
  watertower: { act: 'long-jump off the water tower', needs: { physical: ATHLETE } },
  fungus: { act: 'eat the spotted mushroom out in Whisper Woods' },
  train: { act: 'lie down on the tracks and wait for the train' },
  faceplant: { act: 'fall off something tall with no style whatsoever' },
  edge: { act: 'walk right off the edge of town and see what happens' },
  beatdown: { act: 'keep walking into the police station until the cops lose their patience', needs: { notJobs: ['Cop'] } },
  taser: { act: 'test the department taser on myself in the police station', needs: { jobs: ['Cop'] } },
  baled: { act: 'climb into the hay baler in the barn', needs: { jobs: ['Farmhand'] } },
  bus: { act: 'stand in the bus lane and flag the bus down with my whole body' },
  express: { act: 'stand at the very edge of the platform when the express comes through' },
  runway: { act: 'stand in the middle of the runway and wave at a landing plane' },
  ferry: { act: 'go for a swim in the ferry lane' },
  exitrow: { act: 'open the emergency exit at 30,000 feet to get some air' },
  wheelwell: { act: "stow away in a plane's landing gear" },
  brawl: { act: 'punch a total stranger and keep punching' },
  grandma: { act: 'pick a fight with somebody frail and lose' },
  peanut: { act: 'eat one of the peanut butter cookies at the diner', needs: { peanut: true } },
  roadkill: { act: 'step out into traffic on Main Street without looking' },
  cliff: { act: 'steal a car and floor it off a cliff' },
  windshield: { act: 'hit a wall at highway speed without a seatbelt' },
  bailout: { act: 'jump out of a moving car like in the movies' },
  traincar: { act: 'try to beat the train across the tracks in a stolen car' },
  handlebars: { act: 'ride a bike into a wall as fast as it goes' },
  boardmeeting: { act: 'skate face-first into a wall' },
  kneecap: { act: 'hit the Dare Ramp at full speed' },
  grindrail: { act: 'grind the train tracks on a skateboard while the train is coming' },
  actyourage: { act: 'hop on a skateboard', needs: { physical: FEEBLE } },
  sharetheroad: { act: 'ride a bike straight into traffic' },
  wheelie: { act: 'pop a wheelie and just never stop' },

  // ---- Smallville, the expanded town.
  silo: { act: 'jump into the grain silo at Hoffman Farm' },
  mule: { act: 'sneak up behind the mule at Hoffman Farm and tickle it with a feather' },
  bull: { act: 'wear a red tablecloth into the bull pen and insult the bull three times' },
  geese: { act: 'steal the bread from the goose nest in the park' },
  trampoline: { act: 'keep bouncing on the backyard trampoline on Maple St until it launches me' },
  shallowend: { act: 'long-jump off the water tower into the kiddie pool on Tower Rd', needs: { physical: ATHLETE } },
  quarry: { act: 'jump into the quarry' },
  drowned: { act: 'walk into the pond and just forget how swimming works' },
  piano: { act: 'tell the piano movers on Elm Street "a little to the left" and stand on the X' },
  dmv: { act: 'take a number at the DMV and wait for it to be called' },
  bookshelf: { act: 'climb the library shelves for that 30-year-overdue book' },
  dryer: { act: 'climb into the big industrial dryer at the laundromat' },
  finale: { act: "light the Grand Finale at Uncle Boomer's Fireworks and sit on it" },
  hotdog: { act: 'eat nine hot dogs at the church BBQ' },
  pump: { act: 'smoke a cigar while I pump gas at the Gas-N-Grub' },
  sushi: { act: 'eat the gas station sushi' },
  nailgun: { act: "test the nail gun at Handy Hank's Hardware on the demo display, which is me" },
  bell: { act: 'climb the church bell tower and ring the bell from the inside', needs: { jobs: ['Pastor'] } },
  bathtub: { act: 'run three extension cords to the tub at 12 Maple St and take a bath with the toaster' },
  forktoast: { act: 'get the stuck toast out of the toaster at 12 Maple St with a fork' },

  // ---- Smallville, job perks.
  carlift: { act: "lie down under the car at Duke's Garage and lower the lift", needs: { jobs: ['Mechanic'] } },
  vault: { act: 'lock myself in the bank vault and count it all', needs: { jobs: ['Banker'] } },
  fryer: { act: "fish the dropped spatula out of the diner's deep fryer by hand", needs: { jobs: ['Diner Cook'] } },
  pharmacy: { act: 'write myself a prescription for everything at the pharmacy and take it all at once', needs: { jobs: ['Dentist', 'Doctor', 'Surgeon'] } },
  mailself: { act: 'hop the post office counter and mail myself overnight', needs: { jobs: ['Mail Carrier'] } },
  dodgeball: { act: 'join gym class dodgeball at the school', needs: { jobs: ['Teen'] } },
  crossingarm: { act: "sit on the railroad crossing arm and hit 'raise'", needs: { jobs: ['Crossing Guard'] } },
  plot: { act: 'lie down in my pre-paid plot at the cemetery, just to try it out', needs: { jobs: ['Retiree'] } },
  coffin: { act: 'climb into the display coffin in the cemetery sales office', needs: { jobs: ['Insurance Salesman'] } },

  // ---- Smallville Grocery.
  'groc-cans': { act: 'pull the bottom can out of the giant can pyramid at the grocery store' },
  'groc-samples': { act: 'eat every free sample at the grocery store until something gives' },
  'groc-cartderby': { act: 'ride a shopping cart down the grocery parking lot hill into Main Street' },
  'groc-carttrain': { act: 'round up every cart in the grocery lot and ride the train into a truck' },
  'groc-peanuts': { act: 'eat from the bulk peanut bin at the grocery store', needs: { peanut: true } },
  'groc-freezer': { act: 'shut myself in the walk-in freezer at the grocery store', needs: { jobs: ['Butcher'] } },
  'groc-slicer': { act: 'set the deli slicer to paper thin and lean in to check it', needs: { jobs: ['Butcher', 'Deli Clerk'] } },
  'groc-misters': { act: 'stand in a puddle in produce holding a metal basket when the misters go off' },
  'groc-melons': { act: 'pull the bottom watermelon out of the display' },
  'groc-lobsters': { act: 'free the lobsters from the tank at the grocery store' },
  'groc-selfcheckout': { act: 'try to buy one banana at the self-checkout', needs: { physical: FEEBLE } },
  'groc-forklift': { act: 'ride the forklift to the top shelf in the back room', needs: { jobs: ['Stocker'] } },
  'groc-gummies': { act: 'climb into the gummy bear bin and wiggle' },
  'groc-hotsauce': { act: 'chug every hot sauce in aisle 4 in order of heat' },
  'groc-coupon': { act: 'take the last 2-for-1 detergent from the lady with the coupon binder' },
  'groc-rotisserie': { act: 'climb into the rotisserie chicken warmer to warm up', needs: { jobs: STORE } },

  // ---- City General Hospital.
  'hospital-vending': { act: 'shake the hospital vending machine for those stuck chips' },
  'hospital-codegrey': { act: 'keep walking through the hospital staff door until security sedates me', needs: { notJobs: HOSP } },
  'hospital-defib': { act: 'test the defibrillator on myself, a few times', needs: { jobs: MED } },
  'hospital-morgue': { act: 'climb into a morgue drawer for a little nap', needs: { jobs: HOSP } },
  'hospital-laundry': { act: 'ride the hospital laundry chute down into the press', needs: { jobs: HOSP } },
  'hospital-shaft': { act: 'use the fire key to open the elevator doors when the elevator is somewhere else', needs: { jobs: ['Firefighter'] } },
  'hospital-nitrous': { act: 'huff the nitrous tanks at the hospital until I float', needs: { jobs: HOSP } },
  'hospital-selfsurgery': { act: 'do my own surgery with a mirror', needs: { jobs: ['Surgeon'] } },
  'hospital-wrongsurgery': { act: "swap charts with the heart transplant guy and take his surgery", needs: { jobs: ['Patient'] } },
  'hospital-unplug': { act: 'unplug my own monitor and take my IV down the stairs', needs: { jobs: ['Patient'] } },
  'hospital-mri': { act: 'walk into the MRI with my pockets full of metal', needs: { jobs: HOSP } },
  'hospital-rotor': { act: 'spin up the air ambulance and walk into the rotor', needs: { jobs: ['EMT'] } },

  // ---- Airport.
  'air-bagbelt': { act: 'lie down on the bag belt and ride it into the sorting machine', needs: { jobs: ['Baggage Handler', 'Ground Crew'] } },
  'air-carousel': { act: 'ride the baggage carousel until the suitcases avalanche' },
  'air-scanner': { act: 'walk through the airport body scanner about fifteen times' },
  'air-patdown': { act: 'keep trying to skip airport security until the pat-down gets serious' },
  'air-confiscated': { act: 'drink the whole confiscated liquids bin at security', needs: { jobs: ['TSA Agent'] } },
  'air-walkway': { act: 'run the wrong way on the airport moving walkway' },
  'air-massage': { act: 'feed fifty quarters into the airport massage chair on max' },
  'air-perfume': { act: 'try every perfume sample in duty free at once' },
  'air-openbar': { act: 'drink the Sky Lounge open bar dry before boarding' },
  'air-missedflight': { act: 'miss my connection and let my heart take the news', needs: { physical: FEEBLE } },
  'air-jetbridge': { act: 'walk to the end of the jet bridge and keep walking' },
  'air-jetblast': { act: 'stand behind a jet at takeoff power', needs: { jobs: RAMP } },
  'air-deicer': { act: 'stand in the de-icing spray on a 90 degree day', needs: { jobs: RAMP } },
  'air-terrain': { act: 'fly a whole airliner into the mountain at the end of the runway', needs: { jobs: ['Pilot'] } },
  'air-runway0': { act: 'clear a plane to land on runway zero and then go stand on runway zero', needs: { jobs: ['Air Traffic Controller'] } },
  'air-teddychute': { act: 'skydive with a backpack from the lost and found' },
  'air-sky-nopull': { act: "jump out of Frank's plane and just enjoy the view all the way down" },
  'air-sky-lowpull': { act: 'wait to pull my parachute until the ground looks really big' },
  'air-sky-bargain': { act: "skydive with Frank's twenty-dollar pre-loved rig" },
  'air-sky-linetwist': { act: 'ride a twisted parachute all the way down instead of cutting it away' },
  'air-sky-tailstrike': { act: "pull my ripcord while I'm still inside the jump plane" },
  'air-sky-splashdown': { act: 'skydive into the bay and skip the parachute' },
  'air-sky-wetblanket': { act: 'land a parachute in the bay and stay under it' },
  'air-sky-radar': { act: 'land a parachute on the control tower roof, right on the radar' },
  'air-tug': { act: 'play chicken with a baggage tug on the ramp', needs: { jobs: RAMP } },

  // ---- The city.
  'city-manhole': { act: 'walk into an open manhole while texting' },
  'city-thirdrail': { act: 'climb down onto the subway tracks for a dropped phone' },
  'city-subway': { act: 'stand on the subway tracks to look for the train' },
  'city-railyard': { act: 'dodge everyone in the rail yard to meet the 5:15 face first' },
  'city-windowwasher': { act: 'cut both cables on the window washer rig at Mortalis HQ' },
  'city-fishes': { act: 'insult Big Tony down at Pier 13' },
  'city-mobhit': { act: "wear the snitch's jacket and walk past the mob" },
  'city-wreckingball': { act: 'ride the wrecking ball at the tower site through a load-bearing wall', needs: { jobs: CW } },
  'city-statue': { act: 'fall into the cement mixer at the tower site' },
  'city-balloon': { act: 'hang on to the parade balloon past the skyline', needs: { physical: ATHLETE } },
  'city-pigeons': { act: "steal the pigeon lady's bread in Central Park" },
  'city-hotdog': { act: 'eat every hot dog from the cart that never moves' },
  'city-beam': { act: 'eat a sandwich on a steel beam 30 floors up and pepper it' },
  'city-potty': { act: 'sit in the tower site porta potty when the crane picks it up' },
  tubeman: { act: "climb into the tube man's fan at Crazy Larry Motors" },

  // ---- Blackrock Penitentiary.
  'prison-slop': { act: 'go back for seconds of the prison slop', needs: { jobs: INMATE } },
  'prison-press': { act: 'climb into the prison laundry press', needs: { jobs: INMATE } },
  'prison-dumbbell': { act: "take Big Tony's dumbbell in the yard", needs: { jobs: INMATE } },
  'prison-bench': { act: 'challenge Big Tony to a bench-off', needs: { jobs: INMATE } },
  'prison-fence': { act: 'climb the electric fence during yard time', needs: { jobs: INMATE } },
  'prison-soap': { act: 'slip on the soap in the prison showers', needs: { jobs: INMATE } },
  'prison-snitch': { act: 'snitch on Cell 4, loudly', needs: { jobs: INMATE } },
  'prison-riot': { act: "throw a tray at the Warden during his speech", needs: { jobs: INMATE } },
  'prison-tattoo': { act: 'get a guitar-string tattoo in the cell block', needs: { jobs: INMATE } },
  'prison-tunnel': { act: 'dig a spoon tunnel and tap the ceiling to see if it holds', needs: { jobs: INMATE } },
  'prison-escape': { act: 'tunnel out of Blackrock right under the spotlight', needs: { jobs: INMATE } },
  'prison-solitary': { act: 'talk to the wall in solitary until it talks back' },
  'prison-tower': { act: 'put on an inmate jumpsuit up in the guard tower and wave', needs: { jobs: ['Prison Guard'] } },
  'prison-chair': { act: 'sit in the chair on death row and let nobody check the paperwork', needs: { jobs: GUARDS } },
  'prison-shakedown': { act: 'keep wandering into the guard-only parts of Blackrock', needs: { notJobs: GUARDS } },

  // ---- Pinecrest Asylum.
  'asylum-padded': { act: 'bounce off the padded cell walls until I break the sound barrier', needs: { jobs: ASYLUM_IN } },
  'asylum-napoleon': { act: 'beat Napoleon at chess in the rec room', needs: { jobs: ASYLUM_IN } },
  'asylum-pudding': { act: 'take the last chocolate pudding cup in the cafeteria', needs: { jobs: ASYLUM_IN } },
  'asylum-ect': { act: 'sit in the electroshock chair and crank it past the numbers', needs: { jobs: ASYLUM_IN } },
  'asylum-imaginary': { act: 'follow the voice only I can hear up to the roof', needs: { jobs: ['Patient'] } },
  'asylum-swim': { act: 'go swimming in a straitjacket', needs: { jobs: ['Patient'] } },
  'asylum-medcart': { act: 'eat every cup on the night med cart', needs: { jobs: ASYLUM_IN } },
  'asylum-trustfall': { act: 'volunteer for the trust fall off the top of the bookshelf', needs: { jobs: ASYLUM_IN } },
  'asylum-paint': { act: 'eat the finger paints one color at a time', needs: { jobs: ASYLUM_IN } },
  'asylum-lobotomy': { act: 'find the old lobotomy kit in the desk and give it a go', needs: { jobs: ASYLUM_IN } },
  'asylum-bear': { act: 'escape over the asylum wall into the woods', needs: { jobs: ['Patient'] } },
  'asylum-sedated': { act: 'keep wandering into the staff areas until the nurse brings the horse tranquilizer', needs: { notJobs: ['Orderly', 'Nurse', 'Psychiatrist'] } },

  // ---- The wilderness.
  bear: { act: 'cover myself in honey and knock on the bear cave with a picnic basket' },
  bungee: { act: 'swap the bungee cord at Thunder Gorge for the really long one' },
  falls: { act: 'go over Bridal Veil Falls in a pickle barrel', needs: { physical: ATHLETE } },
  piranha: { act: 'go swimming in Whisper Creek with a raw steak in my swimsuit' },
  gator: { act: "volunteer at the gator show and insult the gator in round three", needs: { physical: ATHLETE } },
  lions: { act: 'wear the gift shop meat suit to Pride Rock' },
  hippo: { act: 'pet a yawning hippo three times' },
  elephant: { act: "steal the baby elephant's peanuts at the watering hole" },
  rhino: { act: 'paint a target on the tour jeep and honk at a rhino' },
  vulture: { act: 'unclip the propane and feed the vultures from the hot air balloon' },
  abduction: { act: 'lie in the crop circle wearing tinfoil' },
  quicksand: { act: 'walk past the sign that says definitely not quicksand' },
  rocket: { act: 'ride an ACME rocket after the roadrunner' },
  cactus: { act: 'hug the friendly-looking cactus three times' },
  nuke: { act: 'hide in a fridge during the nuclear test' },
  groundzero: { act: 'stand around at ground zero during the nuclear test' },
  mirage: { act: 'crawl across the Dune Sea toward the oasis' },
  beaver: { act: 'ground-pound the beaver dam on Whisper Creek' },
  logroll: { act: 'challenge Big Jim to log rolling' },

  // ---- The beach.
  coconut: { act: 'shake a palm tree three times and stand right under it' },
  shark: { act: 'float past the buoys in an inner tube, bleeding and splashing' },
  buried: { act: 'get the kids to bury me up to the neck before the tide comes in' },
  gulls: { act: 'hold a bucket of fries over my head on the pier' },
  parasail: { act: 'chew through the parasail rope and steer into the lighthouse' },
  marlin: { act: 'tie the marlin line around my own waist', needs: { jobs: ['Captain', 'Boat Captain', 'Deckhand', 'Fisherman', 'Sailor', 'Harbor Master'] } },
  anchor: { act: 'wrap the anchor chain around my foot and pull the release' },
  whale: { act: 'chase the krill right into a whale' },
  toodeep: { act: 'take the safety governor off a discount submarine and keep going down' },
  rip: { act: 'swim the red flag zone and let the other lifeguards assume I have it handled', needs: { jobs: ['Lifeguard'] } },
  sandcastle: { act: 'help build the five-meter sandcastle and take a nap inside it' },
  jellyfish: { act: 'belly flop off the pier high dive into the jellyfish' },
  volleyball: { act: 'taunt the pro beach volleyball player three times' },
  puffer: { act: 'poke a pufferfish at the reef until it is the size of a car' },
  buffet: { act: 'stand between the cruise ship buffet line and the buffet when it opens' },
  bellyflop: { act: 'hit the ocean from way, way too high up' },
};

// ------------------------------------------------------------------ who can do what

function jobOk(f: PersonFile, n: HintNeeds) {
  if (n.jobs && !n.jobs.includes(f.job)) return false;
  if (n.notJobs && n.notJobs.includes(f.job)) return false;
  return true;
}

/** True if this body meets everything the death needs. */
export function suits(f: PersonFile, h: DeathHint) {
  const n = h.needs;
  if (!n) return true;
  if (!jobOk(f, n)) return false;
  if (n.physical && !n.physical.includes(f.physical)) return false;
  if (n.mental && !n.mental.includes(f.mental)) return false;
  if (n.peanut && !f.peanutAllergy) return false;
  return true;
}

/** Deaths with hints on this map, unfound ones first if `found` is given. */
function onMap(mapId: string, found?: (id: string) => boolean) {
  const ids = Object.keys(DEATH_HINTS).filter((id) => DEATH_BY_ID[id] && mapOfDeath(id) === mapId);
  if (!found) return ids;
  const fresh = ids.filter((id) => !found(id));
  return fresh.length ? fresh : ids;
}

const lower = (job: string) => (/^[A-Z]{2,}/.test(job) ? job : job.toLowerCase());
const withArticle = (job: string) => `${/^([AEIOU]|EMT)/i.test(job) ? 'an' : 'a'} ${lower(job)}`;

// ------------------------------------------------------------------ intrusive thoughts

/** The thought itself, in the voice of a body that suits the death. */
export function thoughtLine(r: Rng, f: PersonFile, h: DeathHint): string {
  const n = h.needs ?? {};
  const act = h.act;
  if (n.jobs) {
    return pick(r, [
      `I'm ${withArticle(f.job)}. I bet I could ${act}.`,
      `Being ${withArticle(f.job)} means I could ${act}. Just a thought.`,
      `Nobody would even question ${withArticle(f.job)} who wanted to ${act}.`,
    ]);
  }
  if (n.peanut) return pick(r, [`I'm deathly allergic to peanuts. I bet I could ${act}.`, `My peanut allergy and I could ${act}. Just saying.`]);
  if (n.physical?.length === 1 && n.physical[0] === 'Athlete') return pick(r, [`I bet I'm in good enough shape to ${act}.`, `These legs were made to ${act}.`]);
  if (n.physical?.length === 1 && n.physical[0] === 'Feeble') return pick(r, [`With these old bones? I bet I could ${act} and never get up.`, `My hips are made of drywall. I bet I could ${act}.`]);
  if (n.physical) return pick(r, [`I bet I'm healthy enough to ${act}.`, `I'm in decent shape. I could ${act}.`]);
  return pick(r, [
    `What if I just... ${act}?`,
    `I could ${act}. Nobody would stop me.`,
    `Don't think about how easy it'd be to ${act}. Too late.`,
    `Sometimes I think about how I could ${act}.`,
  ]);
}

/**
 * Intrusive Thoughts: a random death on this map that this body can do, as a thought.
 * Prefers deaths not yet in the ledger. Null if nothing on this map suits the body.
 */
export function intrusiveThought(r: Rng, f: PersonFile, mapId: string, found?: (id: string) => boolean): { id: string; line: string } | null {
  const all = onMap(mapId).filter((id) => suits(f, DEATH_HINTS[id]));
  if (!all.length) return null;
  const fresh = found ? all.filter((id) => !found(id)) : all;
  const pool = fresh.length ? fresh : all;
  // Deaths that need something this body has (its job, its legs, its allergy) come up three times as often.
  const personal = pool.filter((id) => DEATH_HINTS[id].needs && (DEATH_HINTS[id].needs!.jobs || DEATH_HINTS[id].needs!.physical || DEATH_HINTS[id].needs!.peanut));
  const id = personal.length && r() < 0.6 ? pick(r, personal) : pick(r, pool);
  return { id, line: thoughtLine(r, f, DEATH_HINTS[id]) };
}

// ------------------------------------------------------------------ depressed townsfolk

/** A depressed person wishing out loud about a death, from their own point of view. */
export function wishLine(r: Rng, speaker: PersonFile, h: DeathHint): string {
  const n = h.needs ?? {};
  const act = h.act;
  const sex = speaker.sex ?? sexOfName(speaker.name);
  const dream = sex === 'f' ? 'A girl can dream!' : 'A man can dream!';
  if (n.jobs) {
    if (n.jobs.includes(speaker.job)) {
      return pick(r, [
        `Being ${withArticle(speaker.job)}, some days I think about how I could ${act}. Ha. ...Ha.`,
        `You know what's great about being ${withArticle(speaker.job)}? I could ${act} any time I want.`,
      ]);
    }
    const job = pick(r, n.jobs);
    return `I'm not ${withArticle(job)}, but if I was I bet I could ${act}. ${dream}`;
  }
  if (n.peanut) {
    return speaker.peanutAllergy
      ? `I'm deathly allergic to peanuts. Some days I think about how I could ${act}.`
      : `If only I were allergic to peanuts. I'd ${act}. ${dream}`;
  }
  if (n.physical) {
    if (n.physical.includes(speaker.physical)) return `I bet I'm just the right kind of body to ${act}. Not that I've thought about it. A lot.`;
    if (n.physical.length === 1 && n.physical[0] === 'Feeble') return `When I'm old and brittle I'm going to ${act}. Something to look forward to.`;
    return `If I was in better shape I bet I could ${act}. ${dream}`;
  }
  return pick(r, [
    `Some days I just want to ${act}. Is that weird? That's weird.`,
    `You ever think about how easy it'd be to ${act}? No? Just me?`,
    `I keep thinking I should ${act}. Anyway, how are you?`,
  ]);
}

/** A depressed townsperson's hint about a death on this map (unfound ones first). */
export function depressedHint(r: Rng, speaker: PersonFile, mapId: string, found?: (id: string) => boolean): string | null {
  const ids = onMap(mapId, found);
  if (!ids.length) return null;
  // Job-locked deaths make the best wishes ("I'm not a nurse, but if I was..."), so they come up half the time.
  const jobbed = ids.filter((id) => DEATH_HINTS[id].needs?.jobs);
  const id = jobbed.length && r() < 0.5 ? pick(r, jobbed) : pick(r, ids);
  return wishLine(r, speaker, DEATH_HINTS[id]);
}
