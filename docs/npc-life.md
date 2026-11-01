# NPC life system

`src/life/` gives every map living townsfolk: homes, jobs, a daily routine on an
in-game clock (1 game hour per real minute), shopping, chatting, gossip, reactions
to deaths, savers, 911 calls, and conversations with the player (E to talk).

## Adding NPCs to a map

A map exports a `LifeMap` (see `src/life/types.ts`), then the game does:

```ts
const life = new LifeSystem(scene, myMapLife(world), { hooks: { onSave, onCall911, onBuy } });
life.populate();
// every frame
life.update(dt, { camera, player: { pos, file }, menu: { up, down, confirm, back } });
```

`life.npcs` is the list of bodies for scythe vision and possession. Skip `npc.away`
(asleep indoors or out of town). `src/life/maps/smallville.ts` is the worked example.

- **nav**: `voxelNav(world, { maxFloor, maxStep, avoid })` builds walkability from a voxel
  world, including building interiors. Custom maps can pass their own
  `walkable(x, z)`, `groundAt(x, z)` and `cost(x, z)` (sidewalks cheap, roads expensive).
- **places**: homes, shops, food, bars, workplaces, parks, transit, civic. Each has a
  `door` (walkable point outside), and optionally `inside`, `spots` (seats),
  `staffSpots`, `counter`, `jobs`, `hours`, `sells`, `allowedJobs`, `patrol`, `lines`.
- **population**: `count`, a `jobs` pool for random residents, and `people` for fixed
  roles (`{ job, home, work, patrol, lines, name, shift, lunch, lunchAt }`).
- **jobProfiles**: how a job spends the day: `style` is `station` (stand at a staff
  spot), `patrol` (walk a route), `roam` (wander the workplace) or `none`, plus
  `shift`, `likes`, `workLines`, `talkLines`. Jobs in `deaths.ts` already have profiles.

## Hooks for gameplay

| Call | What townsfolk do |
|---|---|
| `life.event({ kind: 'death', at, victim, what, where })` | Scream, gawk or flee; the death becomes gossip that spreads by conversation, and the victim's family and friends mourn. |
| `life.event({ kind: 'pee' \| 'fight' \| 'scream', at })` | Nearby people react. |
| `life.setDanger(pos, level)` every frame while the player does something dangerous (0 to 1) | The bravest nearby person runs over shouting; `hooks.onSave(npc, pos)` fires when they arrive. |
| `life.reportCritical(pos)` | The nearest witness runs over and calls 911; `hooks.onCall911(npc, pos)` fires. |
| `life.lure(pos)` | Greedy people race for dropped cash; `hooks.onLurePickup` fires for the winner. |
| `life.vehicleArrived(stopId, door)` / `life.vehicleDeparted(stopId)` | Travellers waiting at a transit place board; returning ones step off. |
| `npc.override(pos, facing, pose)` / `npc.release()` | Take a body over for a scripted moment, then hand it back. Combat sets `npc.controlled` the same way. |
