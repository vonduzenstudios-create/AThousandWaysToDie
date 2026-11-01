import type * as THREE from 'three';
import type { Rig } from './rig';
import * as W from './wild';
import * as S from './sea';
import * as F from './farm';

export * from './rig';
export * as wild from './wild';
export * as sea from './sea';
export * as farm from './farm';

/** Every animal in the game, for the dev sheet. */
export const ZOO: Record<string, () => Rig | THREE.Object3D> = {
  bear: W.bear,
  lion: () => W.lion(true),
  lioness: () => W.lion(false),
  elephant: () => W.elephant(),
  babyElephant: () => W.elephant(true),
  gazelle: W.gazelle,
  gator: W.gator,
  giraffe: W.giraffe,
  zebra: W.zebra,
  rhino: W.rhino,
  hippo: W.hippo,
  camel: W.camel,
  vulture: W.vulture,
  monkey: W.monkey,
  roadrunner: W.roadrunner,
  beaver: W.beaver,
  piranha: W.piranha,
  shark: () => S.shark(),
  whale: S.whale,
  gull: S.gull,
  jellyfish: S.jellyfish,
  pufferfish: S.pufferfish,
  crab: S.crab,
  fish: () => S.fish(0x3a8ad8),
  marlin: S.marlin,
  bull: F.bullRig,
  mule: F.muleRig,
  goose: F.gooseRig,
  pigeon: F.pigeon,
};
