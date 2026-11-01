import type * as THREE from 'three';
import type { RAPIER } from '../physics';
import type { Box } from '../town';
import type { DeathDef, Job } from '../deaths';
import type { VoxelWorld } from '../voxel';
import type { Rng } from '../util';
import type { Interactable } from '../props';
import type { PersonFile } from '../deaths';
import type { Player } from '../player';
import type { Character } from '../character';
import type { Sound } from '../audio';
import type { Particles } from '../particles';
import type { Input } from '../input';
import type { Npc } from '../npc';

/**
 * The multi-map interface. Every place in the game (Smallville, the city, the beach,
 * the wilderness, Paris...) is a MapDef registered in src/maps/index.ts.
 *
 * Coordinates: one unit = one voxel. The world spans x in [0, size.x), y in [0, size.y),
 * z in [0, size.z). Maps can be large (2048 x 128 x 2048 is fine): VoxelWorld stores
 * voxels in sparse 16^3 chunks and only meshes the chunks near the camera.
 */

export type TravelKind = 'bus' | 'train' | 'plane' | 'boat';

/**
 * A bus stop, train platform, airport gate or harbor dock.
 * Routes between stops are declared in src/maps/routes.ts by `${mapId}:${stopId}`.
 */
export interface TravelStop {
  /** Unique inside its map, e.g. 'bus-main', 'train', 'airport', 'harbor'. */
  id: string;
  kind: TravelKind;
  /** Shown on the ticket menu and arrival card, e.g. "Main Street Bus Stop". */
  name: string;
  /** Where the ticket prompt sits and where the player steps off on arrival (feet position). */
  pos: THREE.Vector3;
  /** Facing (radians, player convention: forward = (sin f, 0, cos f)) when stepping off. */
  facing: number;
  /** Zone the player stands in to buy a ticket. Defaults to a 3-block radius around pos. */
  board?: Box;
  /**
   * The vehicle's lane: it comes in from `from`, stops at `stop`, leaves toward `to`.
   * All three at the vehicle's ground height (road, rail, runway, water surface).
   * Leave it out and the vehicle appears beside `pos` aligned with `facing`.
   */
  lane?: { from: THREE.Vector3; stop: THREE.Vector3; to: THREE.Vector3 };
}

/** Where townspeople spawn and wander. */
export interface NpcSpawn {
  area: string;
  job?: Job;
  count?: number;
}

/** How a death plays out. Same as the game's built-in styles. */
export type DeathStyle =
  | { kind: 'ragdoll'; vel: THREE.Vector3; spin?: number; bounce?: number }
  | { kind: 'pancake' }
  /** Folded into a neat cube (hay baler, laundry press). `at` = where the cube lands, `color` = its tint. */
  | { kind: 'cube'; at?: THREE.Vector3; color?: number };

/** The slice of the game a map is allowed to drive. Game implements this. */
export interface GameApi {
  readonly player: Player;
  /** The body Gary is in right now (null in ghost mode). */
  readonly body: PersonFile | null;
  readonly character: Character | null;
  readonly sound: Sound;
  readonly particles: Particles;
  /** Trigger a death by id (see src/deaths.ts). Ignored unless the player is alive in a body. */
  kill(id: string, style: DeathStyle): void;
  /** Run timed steps (seconds from now, real time). Replaces any running sequence. */
  runSeq(steps: { at: number; fn: () => void }[]): void;
  toast(title: string, body: string, ms?: number): void;
  say(who: string, line: string, ms?: number): void;
  shake(amount: number): void;
  /** Screen flash (CSS color). */
  flash(color: string, ms: number): void;
  /** Bottom-center prompt, or null to hide. Overwritten each frame by the interact prompt when one is in range. */
  prompt(html: string | null): void;
  /** Raw input: held(action), pressed(action), moveX, moveY. */
  readonly input: Input;
  /** Camera yaw (radians). */
  readonly camYaw: number;
  /** Game time in seconds (slows down with slow-mo). */
  readonly time: number;
  /** Insurance money Gary can spend right now. */
  readonly balance: number;
  /** Pay for something (rentals, charters). Returns false and shows "can't afford" if short. */
  spend(amount: number, label: string): boolean;
  /** Hue-rotate the screen (degrees, 0 = off). */
  setHueShift(deg: number): void;
  /**
   * Send the player (in their current body) to another map's stop without a ticket, e.g. an arrest
   * to 'prison:intake'. Fades out, shows a trip card with `line`, loads the map and arrives on that
   * stop's vehicle (or just appears at the stop if it has no service). No-op unless alive in a body.
   * Optional so dev harnesses (src/dev) can leave it out; the game always provides it.
   */
  travelTo?(stopKey: string, opts?: { line?: string; title?: string }): void;
  /** Id of the loaded map (optional for the same reason). */
  readonly mapId?: string;
}

/** Things a map can do at runtime once it is loaded. All optional except dispose. */
export interface MapRuntime {
  /** Things the player can press E on. The game shows the prompt and calls interact(). */
  interactables?: Interactable[];
  /** Handle an interactable press. */
  interact?(id: string): void;
  /** Per-frame update (animated props). */
  update?(dt: number, time: number): void;
  /** Fixed 60 Hz step: after the player has moved (player.update) and before physics.step(). */
  step?(h: number): void;
  /** Fixed-step hazard checks while the player is alive in a body. */
  checkHazards?(h: number): void;
  /** Called when the player lands. Return true if the map handled it (e.g. killed the player). */
  onLand?(e: { drop: number; launchPos: THREE.Vector3; launchState: string; landState: string }): boolean;
  /**
   * Extra bodies the map owns and positions itself (staff posted on a hospital's upper
   * floors, where the life system's single-level nav grid can't go). The game lets scythe
   * vision target and possess them. Once `game.character` is one of these bodies, the map
   * drops it from the list (it now belongs to Gary).
   */
  npcs?: Npc[];
  /** Called when Gary takes a body (file) or leaves one (null). */
  onBody?(file: PersonFile | null): void;
  /** Remove everything this map added to the scene and physics world. */
  dispose(): void;
}

/** What a map gets when it is loaded, to add its own props and logic. */
export interface MapContext {
  scene: THREE.Scene;
  physics: RAPIER.World;
  world: VoxelWorld;
  rng: Rng;
  game: GameApi;
}

/** The result of building a map's voxels. */
export interface MapBuild {
  /** Where the ghost appears when the game starts on this map with no travel. */
  spawn: THREE.Vector3;
  /**
   * Height NPCs walk on at (x, z). Defaults to world.topY(x, z), so hills just work.
   * Return NaN for places NPCs must not walk (water, roofs).
   */
  groundAt?(x: number, z: number): number;
  /** Named NPC wander zones. */
  areas: Record<string, Box>;
  /** Transit stops. Ids must be unique within the map. */
  stops: TravelStop[];
  /**
   * Drivable roads as centerline polylines at road-surface height (feet y). Two-way, cars drive on
   * the right. Points shared by two roads (within 1.5 units) become intersections. Used by traffic.
   */
  roads?: { points: THREE.Vector3[]; width: number; loop?: boolean }[];
  /**
   * Rich NPC data (LifeMap from src/life/types.ts, owned by the NPC life thread): nav grid,
   * places, population. When present the game hands it to the LifeSystem; `npcs` is the fallback.
   */
  life?: unknown;
  /** Who lives here. Defaults to a few random people in each area. */
  npcs?: NpcSpawn[];
  /** Add props, interactables and per-map logic after the voxels are built. */
  setup?(ctx: MapContext): MapRuntime;
}

export interface MapDef {
  /** Stable id used in routes and saves, e.g. 'smallville', 'city', 'beach'. */
  id: string;
  /** Display name, e.g. "Smallville". */
  name: string;
  /** World size in voxels. y is height. */
  size: { x: number; y: number; z: number };
  /** Optional look. */
  sky?: { top: number; bottom: number; fogNear?: number; fogFar?: number };
  /** Water surface height, if the map has a sea or lake (boats float here, the player drowns below it). */
  waterLevel?: number;
  /** Deaths that happen on this map. Added to the ledger at startup. Ids must be globally unique. */
  deaths?: DeathDef[];
  /** Fill the voxels and return spawn points, areas and stops. Called each time the map loads. */
  build(world: VoxelWorld, rng: Rng): MapBuild;
}
