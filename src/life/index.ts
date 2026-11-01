/**
 * NPC life: residents with homes, jobs, daily schedules, shopping, chatting,
 * gossip, reactions, savers, 911 calls, and talking to the player.
 *
 *   const life = new LifeSystem(scene, myMapLife, { hooks: { onSave, onCall911 } });
 *   life.populate();
 *   // every frame:
 *   life.update(dt, { camera, player: { pos, file }, menu });
 *
 * See docs/npc-life.md for how a map describes itself (src/life/types.ts).
 */
export { LifeSystem, type LifeEvent, type LifeFrame, type LifeHooks, type LifeOptions } from './life';
export { GameClock } from './clock';
export { NavGrid, voxelNav } from './nav';
export { DEFAULT_PROFILES } from './schedule';
export type * from './types';
