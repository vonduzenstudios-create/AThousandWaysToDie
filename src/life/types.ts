/**
 * The data a map hands to the NPC life system.
 *
 * A map does not need to know how NPCs think. It describes the ground people can
 * walk on, the places they can go, and (optionally) who lives there. The life
 * system turns that into residents with homes, jobs, daily schedules, shopping
 * trips, gossip and conversations.
 *
 * Every field is plain data, so a map can build it from whatever it already has.
 * THREE.Vector3 satisfies `V3`, and the town's `Box` satisfies `BoxLike`.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Any axis-aligned box. Only x and z are used; y is taken from the ground. */
export interface BoxLike {
  min: { x: number; z: number };
  max: { x: number; z: number };
}

/**
 * What kind of place this is. The built-in schedules know these kinds; anything
 * else is allowed and is treated as a generic place to visit.
 */
export type PlaceKind =
  | 'home'
  | 'shop' // buy something and leave (bodega, hardware store, ice cream stand)
  | 'food' // sit down and eat (diner, pizzeria, hot dog cart)
  | 'bar' // evenings
  | 'work' // a workplace that is not open to customers (barn, office, construction site)
  | 'park' // leisure: strolling, sitting, feeding pigeons
  | 'bench' // a single place to sit
  | 'beach' // leisure, daytime only
  | 'transit' // bus stop, train station, airport gate, pier. Newcomers arrive here and travellers leave from here.
  | 'civic' // police, post office, town hall, hospital
  | 'worship'
  | 'attraction' // landmarks people go look at
  | (string & {});

export interface LifePlace {
  /** Unique within the map, e.g. 'diner'. */
  id: string;
  /** Shown in dialogue and directions, e.g. 'Smallville Diner'. */
  name: string;
  kind: PlaceKind;
  /** A walkable point just outside the entrance. Everyone routes here first. */
  door: V3;
  /** Walkable interior (or the area of an outdoor place). Visitors mill about inside it. */
  inside?: BoxLike;
  /** Exact spots to stand or sit: counter stools, bench seats, beach towels. Preferred over `inside`. */
  spots?: V3[];
  /** Where customers stand to order or pay. Default: a point between the door and the first staff spot. */
  counter?: V3;
  /** Where workers stand (behind the counter, at the desk). */
  staffSpots?: V3[];
  /** Jobs employed here. A resident with one of these jobs works here. */
  jobs?: string[];
  /** Open hours on a 24h clock, e.g. [6, 22]. Wraps past midnight, e.g. [18, 2]. Omit for always open. */
  hours?: [number, number];
  /** What a 'shop' or 'food' place sells. Shoppers pick one and pay for it. */
  sells?: { item: string; price: number }[];
  /** Only these jobs may go inside (police station: ['Cop']). */
  allowedJobs?: string[];
  /** Max visitors inside at once. Default: number of spots, or 6. */
  capacity?: number;
  /** For homes: how many people live here. Default 1 to 3. */
  residents?: number;
  /** A walking route for patrol jobs that work here (mail route, lifeguard beat, cop patrol). */
  patrol?: V3[];
  /** Things staff say to customers or to the player, e.g. "Order up!". */
  lines?: string[];
  tags?: string[];
}

/**
 * Where people can walk. The life system builds a path-finding grid from this, so
 * terrain with real height works as long as `groundAt` returns the standing height.
 */
export interface LifeNav {
  /** Inclusive voxel bounds of the walkable area. */
  bounds: { x0: number; z0: number; x1: number; z1: number };
  /** Can a person stand in this 1x1 column? Must be false for walls, water, tree trunks. */
  walkable(x: number, z: number): boolean;
  /** Height of the floor surface a person stands on in this column. */
  groundAt(x: number, z: number): number;
  /**
   * Optional walking cost multiplier, 1 = normal. Use < 1 for sidewalks and paths
   * people prefer and > 1 for roads and lawns they avoid. Default 1.
   */
  cost?(x: number, z: number): number;
  /** Max height difference between neighbouring cells people will step. Default 1.1. */
  maxStep?: number;
}

/** Tell the life system how a job spends the day. Built-in jobs already have profiles. */
export interface JobProfile {
  job: string;
  /**
   * How they work:
   *  - 'station': stand at a staff spot of their workplace (cook, cashier)
   *  - 'patrol': walk the workplace's `patrol` route, or between random places (mail carrier, cop, lifeguard)
   *  - 'roam': wander around the workplace area (farmhand, construction worker)
   *  - 'none': no job; they fill the day with errands and leisure (retiree, tourist)
   */
  style: 'station' | 'patrol' | 'roam' | 'none';
  /** Hours on a 24h clock. Default [9, 17]. */
  shift?: [number, number];
  /** Place kinds to work at when no place lists this job in `jobs`. */
  workKinds?: PlaceKind[];
  /** Place kinds they like in their free time, most liked first. */
  likes?: PlaceKind[];
  /** Lines they mutter at work. */
  workLines?: string[];
  /** Lines they say when the player talks to them. */
  talkLines?: string[];
  /** Night owl: shifts the whole day later (bartender, vampire). */
  nightOwl?: boolean;
}

/** Ask for a specific person instead of a random one. */
export interface ResidentSpec {
  job: string;
  /** Place id of their home. Default: a home with room, or no home (they arrive by transit). */
  home?: string;
  /** Place id of their workplace. Default: a place that lists their job, or one of the profile's workKinds. */
  work?: string;
  /** A personal patrol route, overriding the workplace's. */
  patrol?: V3[];
  /** Personal lines for talking to the player, mixed with the job's lines. */
  lines?: string[];
  /** Fixed name, e.g. 'Duke'. */
  name?: string;
  age?: number;
  /** A guaranteed lunch break on a 24h clock, e.g. [12, 13]. They eat at `lunchAt` or the nearest food/shop place. */
  lunch?: [number, number];
  /** Place id for the guaranteed lunch break. */
  lunchAt?: string;
  /** Override the job profile's shift, e.g. [6, 14]. */
  shift?: [number, number];
}

export interface LifeMap {
  /** Map id, e.g. 'smallville', 'beach', 'city'. */
  id: string;
  /** Shown in dialogue, e.g. 'Smallville'. */
  name: string;
  nav: LifeNav;
  places: LifePlace[];
  /**
   * Who lives here. Either a total count of random residents (jobs are drawn from
   * `jobs`, or from the places' `jobs` lists), a list of specific people, or both.
   */
  population?: {
    count?: number;
    jobs?: string[];
    people?: ResidentSpec[];
  };
  /** Extra or overriding job profiles for this map's jobs. */
  jobProfiles?: JobProfile[];
  /** Points where newcomers appear. Default: the doors of 'transit' places, then the map center. */
  spawns?: V3[];
  /** Map-specific small talk mixed into conversations. */
  smallTalk?: string[];
}
