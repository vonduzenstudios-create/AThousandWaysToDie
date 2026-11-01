import * as THREE from 'three';
import type { Box } from '../town';
import type { DeathDef } from '../deaths';
import type { VoxelWorld } from '../voxel';
import type { Rng } from '../util';
import type { RAPIER } from '../physics';
import type { Interactable } from '../props';
import type { PersonFile } from '../deaths';
import type { Player } from '../player';
import type { Character } from '../character';
import type { Sound } from '../audio';
import type { Particles } from '../particles';
import type { Input } from '../input';
import type { JobProfile, LifePlace } from '../life/types';

/**
 * The slice of the game a place drives. It is a subset of the multi-map GameApi from the
 * travel thread (src/maps/types.ts), so the map loader can pass its GameApi straight in.
 */
export interface PlaceGame {
  readonly player: Player;
  /** The body Gary is in right now (null in ghost mode). */
  readonly body: PersonFile | null;
  readonly character: Character | null;
  readonly sound: Sound;
  readonly particles: Particles;
  readonly input: Input;
  /** Trigger a death by id. Ignored unless the player is alive in a body. */
  kill(id: string, style: DeathStyle): void;
  /** Run timed steps (seconds from now). Replaces any running sequence. */
  runSeq(steps: { at: number; fn: () => void }[]): void;
  toast(title: string, body: string, ms?: number): void;
  say(who: string, line: string, ms?: number): void;
  shake(amount: number): void;
  flash(color: string, ms: number): void;
}

/** How a death plays out (same as the game's built-in styles). */
export type DeathStyle =
  | { kind: 'ragdoll'; vel: THREE.Vector3; spin?: number; bounce?: number }
  | { kind: 'pancake' }
  | { kind: 'cube' };

export interface PlaceContext {
  scene: THREE.Scene;
  physics: RAPIER.World;
  world: VoxelWorld;
  rng: Rng;
  game: PlaceGame;
}

/** What a place adds at runtime. Same shape as MapRuntime, so a map can merge it into its own. */
export interface PlaceRuntime {
  /** Things the player can press E on. Ids are prefixed with the place id. */
  interactables: Interactable[];
  /** Handle a press on one of this place's interactables (others are ignored). */
  interact(id: string): void;
  /** Per-frame update (actors, animated props). */
  update(dt: number, time: number): void;
  /** Fixed 60 Hz step, after the player moves and before physics. */
  step(h: number): void;
  /** Fixed-step hazard checks while the player is alive in a body. */
  checkHazards(h: number): void;
  dispose(): void;
}

/** A fallback NPC spawn (same shape as the map interface's NpcSpawn). */
export interface NpcSpawnLike {
  area: string;
  job?: string;
  count?: number;
}

/**
 * A "place" is a big, detailed building (grocery store, hospital, school...) that a map
 * stamps into its voxels. The map owns the terrain and the roads; the place owns
 * everything inside its footprint: walls, floors, props, staff, gated rooms and deaths.
 *
 * A map uses one like this:
 *
 *   const store = GROCERY.build(world, { x: 300, y: G, z: 120, rot: 1 }, rng);
 *   // in MapBuild: areas = { ...areas, ...store.areas }, life places += store.lifePlaces
 *   // in setup(ctx): const rt = store.setup(ctx); merge rt into the map's runtime
 *
 * and lists GROCERY.deaths in its MapDef.deaths.
 */
export interface PlaceDef {
  id: string;
  name: string;
  /** Size of the lot in voxels at rot 0. At rot 0 the entrance faces -z. */
  footprint: { x: number; z: number };
  /** Deaths that happen in this place. Add them to the map's MapDef.deaths. */
  deaths: DeathDef[];
  /** Jobs that work here (they can get into the staff-only rooms). */
  jobs: string[];
  build(world: VoxelWorld, at: PlaceAt, rng: Rng): PlaceBuild;
}

/** Where to put a place: its lot's min corner at ground height, and quarter turns. */
export interface PlaceAt {
  x: number;
  /** Ground surface height of the lot (the town's G). */
  y: number;
  z: number;
  /** Quarter turns (see Frame for which way the entrance faces). Default 0: entrance faces -z. */
  rot?: 0 | 1 | 2 | 3;
}

export interface PlaceBuild {
  frame: Frame;
  /** Named zones in world coordinates (customer floor, staff rooms, parking lot). */
  areas: Record<string, Box>;
  /** Feet position just outside the front doors, in world coordinates, and the facing into the store. */
  entrance: THREE.Vector3;
  entranceFacing: number;
  /** For the NPC life system (LifeMap.places). */
  lifePlaces: LifePlace[];
  /** For the NPC life system (LifeMap.jobProfiles). */
  jobProfiles: JobProfile[];
  /** Fallback NPC spawns (MapBuild.npcs) if the map has no life data. */
  npcs: NpcSpawnLike[];
  /** Walkable floor height at a world column inside the lot, or NaN if not walkable. */
  groundAt(x: number, z: number): number;
  /** Add props, staff and logic. Merge the result into the map's runtime. */
  setup(ctx: PlaceContext): PlaceRuntime;
}

/**
 * Local coordinates for a place. Author everything at rot 0 in local space
 * (x across the lot, z from the street side to the back, y up from the lot's ground),
 * and the frame turns it into world space.
 *
 * Rotations (seen from above, world x right, world z down):
 *   rot 0: local = world offset. Entrance faces -z.
 *   rot 1: local +x points to world +z. Entrance faces +x.
 *   rot 2: turned around. Entrance faces +z.
 *   rot 3: local +x points to world -z. Entrance faces -x.
 */
export class Frame {
  readonly rot: 0 | 1 | 2 | 3;
  constructor(
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    rot: number,
    /** Local footprint size. */
    readonly w: number,
    readonly d: number,
  ) {
    this.rot = (((rot % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  }

  /** Add this to a local facing (player convention) to get the world facing. */
  get yaw() {
    return (-this.rot * Math.PI) / 2;
  }

  private xz(x: number, z: number): [number, number] {
    switch (this.rot) {
      case 0:
        return [x, z];
      case 1:
        return [this.d - z, x];
      case 2:
        return [this.w - x, this.d - z];
      default:
        return [z, this.w - x];
    }
  }

  /** Local point to world point. */
  toWorld(x: number, y: number, z: number, out = new THREE.Vector3()) {
    const [wx, wz] = this.xz(x, z);
    return out.set(wx + this.ox, y + this.oy, wz + this.oz);
  }

  w3(v: THREE.Vector3, out = new THREE.Vector3()) {
    return this.toWorld(v.x, v.y, v.z, out);
  }

  /** World point to local point. */
  toLocal(v: THREE.Vector3, out = new THREE.Vector3()) {
    const X = v.x - this.ox;
    const Z = v.z - this.oz;
    const y = v.y - this.oy;
    switch (this.rot) {
      case 0:
        return out.set(X, y, Z);
      case 1:
        return out.set(Z, y, this.d - X);
      case 2:
        return out.set(this.w - X, y, this.d - Z);
      default:
        return out.set(this.w - Z, y, X);
    }
  }

  /** Local direction to world direction. */
  dir(x: number, y: number, z: number, out = new THREE.Vector3()) {
    switch (this.rot) {
      case 0:
        return out.set(x, y, z);
      case 1:
        return out.set(-z, y, x);
      case 2:
        return out.set(-x, y, -z);
      default:
        return out.set(z, y, -x);
    }
  }

  /** Set one voxel given in local voxel coordinates. */
  set(world: VoxelWorld, i: number, j: number, k: number, b: number) {
    const [wx, wz] = this.xz(i + 0.5, k + 0.5);
    world.set(Math.floor(wx + this.ox), j + this.oy, Math.floor(wz + this.oz), b);
  }

  get(world: VoxelWorld, i: number, j: number, k: number) {
    const [wx, wz] = this.xz(i + 0.5, k + 0.5);
    return world.get(Math.floor(wx + this.ox), j + this.oy, Math.floor(wz + this.oz));
  }

  /** Fill an inclusive local voxel box. */
  fill(world: VoxelWorld, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: number) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(world, x, y, z, b);
  }

  /** A world-space Box from a local rectangle (continuous coordinates). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box {
    const a = this.toWorld(x0, y0, z0);
    const b = this.toWorld(x1, y1, z1);
    return {
      min: new THREE.Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)),
      max: new THREE.Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)),
    };
  }

  /** A group that maps local coordinates to world space. Put meshes in it at local positions. */
  group() {
    const g = new THREE.Group();
    const t: [number, number] = this.rot === 0 ? [0, 0] : this.rot === 1 ? [this.d, 0] : this.rot === 2 ? [this.w, this.d] : [0, this.w];
    g.position.set(this.ox + t[0], this.oy, this.oz + t[1]);
    g.rotation.y = this.yaw;
    return g;
  }
}

/** Inside a local rectangle (x/z only). */
export const inRect = (p: THREE.Vector3, x0: number, z0: number, x1: number, z1: number) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1;
