import { defineBlock } from '../../voxel';

/** Beach block ids (the beach owns 100-139). */
export const BB = {
  WetSand: 100,
  DarkSand: 101,
  Seabed: 102,
  CoralPink: 103,
  CoralOrange: 104,
  CoralPurple: 105,
  Kelp: 106,
  PalmTrunk: 107,
  PalmLeaf: 108,
  Coconut: 109,
  Boardwalk: 110,
  Piling: 111,
  Mud: 112,
  Reed: 113,
  Cypress: 114,
  Moss: 115,
  Rock: 116,
  Cliff: 117,
  Hull: 118,
  HullRed: 119,
  Deck: 120,
  Stripe: 121,
  Turquoise: 122,
  Coral: 123,
  Lemon: 124,
  Umbrella1: 125,
  Umbrella2: 126,
  Umbrella3: 127,
  Towel1: 128,
  Towel2: 129,
  Towel3: 130,
  Shell: 131,
  Log: 132,
  Rope: 133,
  NeonPink: 134,
  Seaweed: 135,
  Lighthouse: 136,
  Lamp: 137,
  Stucco: 138,
  Thatch: 139,
} as const;

let done = false;
/** Register colors once. Safe to call every time the map loads. */
export function defineBeachBlocks() {
  if (done) return;
  done = true;
  defineBlock(BB.WetSand, 0xc9b277, 0.08);
  defineBlock(BB.DarkSand, 0xd6bf80, 0.12);
  defineBlock(BB.Seabed, 0xb8a46e, 0.16);
  defineBlock(BB.CoralPink, 0xf27aa0, 0.2);
  defineBlock(BB.CoralOrange, 0xf2913a, 0.2);
  defineBlock(BB.CoralPurple, 0x9a5ad8, 0.2);
  defineBlock(BB.Kelp, 0x3d7a2e, 0.25);
  defineBlock(BB.PalmTrunk, 0x9b7a4e, 0.18);
  defineBlock(BB.PalmLeaf, 0x4caa3a, 0.22);
  defineBlock(BB.Coconut, 0x5a3a1e, 0.1);
  defineBlock(BB.Boardwalk, 0xa8794a, 0.14);
  defineBlock(BB.Piling, 0x5e4630, 0.12);
  defineBlock(BB.Mud, 0x5a4a2e, 0.18);
  defineBlock(BB.Reed, 0x8a9a3a, 0.25);
  defineBlock(BB.Cypress, 0x55402a, 0.14);
  defineBlock(BB.Moss, 0x5e7d3a, 0.25);
  defineBlock(BB.Rock, 0x77736c, 0.18);
  defineBlock(BB.Cliff, 0xa08a6a, 0.14);
  defineBlock(BB.Hull, 0xf4f4f0, 0.03);
  defineBlock(BB.HullRed, 0xb52a2a, 0.06);
  defineBlock(BB.Deck, 0xc8a070, 0.08);
  defineBlock(BB.Stripe, 0x1c4fa0, 0.04);
  defineBlock(BB.Turquoise, 0x3ac9c0, 0.06);
  defineBlock(BB.Coral, 0xff7f6a, 0.06);
  defineBlock(BB.Lemon, 0xffe46a, 0.05);
  defineBlock(BB.Umbrella1, 0xe8423a, 0.04);
  defineBlock(BB.Umbrella2, 0x2a8ae0, 0.04);
  defineBlock(BB.Umbrella3, 0xf6d23a, 0.04);
  defineBlock(BB.Towel1, 0xff6ab0, 0.05);
  defineBlock(BB.Towel2, 0x5ad0ff, 0.05);
  defineBlock(BB.Towel3, 0x8ae05a, 0.05);
  defineBlock(BB.Shell, 0xfbe8dc, 0.08);
  defineBlock(BB.Log, 0x7a5532, 0.15);
  defineBlock(BB.Rope, 0xd8c08a, 0.1);
  defineBlock(BB.NeonPink, 0xff3ec8, 0.03);
  defineBlock(BB.Seaweed, 0x2e5a2a, 0.25);
  defineBlock(BB.Lighthouse, 0xd8302a, 0.04);
  defineBlock(BB.Lamp, 0xfff2a0, 0.02);
  defineBlock(BB.Stucco, 0xf3e3c3, 0.06);
  defineBlock(BB.Thatch, 0xc9a35a, 0.2);
}
