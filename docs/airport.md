# Fuhgeddaboudit International

The city's airport, built as a self-contained place in `src/places/airport/`. The city calls `placeAirport(world, origin, rng)` for its 320 x 224 airport lot (`AIRPORT_LOT` in `src/maps/city/layout.ts`) and merges the result with `mergePart` and `composeRuntimes` from `src/maps/compose.ts`. Its interactable ids start with `airport:` and its plane stop id is `airport` (route `city:airport`).

## Files

- `frame.ts`: the design frame. The airport is laid out with the curb at z = 0 and the runway at z = 160..184; the frame mirrors z so the curb lands on the city's road side. Headings map `f` to `PI - f`.
- `layout.ts`: every position, and the voxel build (terminal, security, baggage rooms, concourse, jet bridges, apron, taxiways, runway, tower, hangar, fence, Mount Mortalis).
- `props.ts`: meshes and moving parts: airliners with scripted routes, the de-icer, the baggage tug, staff doors, signs, people at their posts.
- `skydive.ts`: Freefall Frank's skydive, played start to finish (see below).
- `skymodels.ts`: detail-voxel models for it: the jump plane with a walkable cabin, ram-air canopies, the three rigs, the bargain rig's laundry, the teddy bear and clouds. Preview them at `/dev/sky.html`.
- `skin.ts`: the high-detail exterior, drawn with the building kit (`src/kit`, 8 detail voxels per block). It covers the curtain wall and fins on the curb side, the lit FUHGEDDABOUDIT rooftop sign, the entrance canopies, the precast side and airside walls with gate collars and numbers, the hazard-striped apron doors, the roof parapet, units and skylights, the ribbed control tower with its catwalk, beacons and spinning radar, and the corrugated hangar. It is visual only. The voxel shell in `layout.ts` keeps every collider, door and interior, and the skin sits up to half a block outside those walls, with holes left wherever a door or jet bridge is. If you move a door in `layout.ts`, move its hole in `skin.ts` too. The skin is about 158k triangles and builds in under a second on the main thread.
- `runtime.ts`: gates, interactables, hazards and death sequences.
- `deaths.ts`: the 17 death definitions.
- `index.ts`: `placeAirport`, `airportLife` (workplaces and staff for the NPC life system) and `airportMap`, a standalone map for the dev preview.

## Who can go where

| Area | Who gets in |
|---|---|
| Check-in hall, baggage claim, curb, hangar (via the fenced walkway from the parking lot) | Anyone |
| Security lanes, gates and jet bridges | Boarding pass ($40 at the kiosks) or airline crew; TSA lanes also let staff and cops through |
| Baggage rooms | Baggage Handler, Ground Crew |
| Ramp doors to the apron | Baggage Handler, Ground Crew, Pilot |
| TSA office | TSA Agent |
| Control tower | Air Traffic Controller |
| Cockpit (Gate A3) | Pilot |
| Sky Lounge | $200 day pass, Pilot, Flight Attendant |

Locked doors say why when you press E, and Death gets sarcastic after a few tries. Anyone without an airport job who climbs onto the ramp gets yelled at by ground crew and escorted back to the curb after 30 seconds.

## Deaths

| Death | How |
|---|---|
| Checked Baggage | Crouch on the bag belt behind the check-in counters and ride it into the sorter. Standing up gets you yanked off. |
| Unclaimed | Ride a baggage claim carousel for two laps until the suitcase avalanche. |
| Frequent Flyer | Walk through a body scanner fifteen times (needs a pass). |
| Enhanced Screening | Try the security lane without a pass four times. |
| Confiscated Liquids | As a TSA Agent, drink from the confiscated liquids bin in the TSA office. |
| Wrong Way | Run against a moving walkway on the concourse for three seconds. |
| Deep Tissue | Put 50 quarters in a massage chair in the main hall. |
| Eau de Mort | Try seven perfume samples in duty free. |
| Open Bar | Get into the Sky Lounge and order eight drinks. |
| Missed Connection | In a Feeble body, ask the Gate A1 agent about Flight 404 after it leaves. |
| Jet Bridge to Nowhere | Walk off the end of a jet bridge. |
| Jet Blast | Stand behind Flight 404 while it spools up at the runway threshold or starts its roll. |
| De-iced | Stand in the de-icer's spray at Gate A4 for a few seconds. |
| Terrain, Pull Up | As a Pilot, take the Gate A3 plane and ignore the warning (Space pulls up). |
| Cleared to Land | As the Air Traffic Controller, radio Flight 22 from the tower cab, then stand on runway 0 (the west end) before it touches down. |
| Teddy Bear Chute | Take the pink backpack from the hangar's lost and found, jump, pull. |
| Forgot Something? | Jump with any rig and never pull. |
| Pulled Too Low | Pull so low the canopy is still opening when you hit (below about 1,500 ft). |
| Packed It Myself | Buy Frank's $20 pre-loved rig and pull. It is his laundry, and there is no reserve. |
| Line Twist | A rental main twists (about one jump in three). Ride it down instead of pressing E to cut away. |
| Tail Strike | Press E (pull) while still inside the jump plane. |
| Water Is Concrete | Hit the bay without an open canopy. |
| Wet Blanket | Land a canopy in the bay. |
| Radar Blip | Land a canopy on the control tower roof, or fly into the spinning radar. |
| Ramp Rash | Get hit by the baggage tug that loops around the apron. |

In-flight deaths (exit door, airline food, lavatory, turbulence, wheel well) belong to the travel system.

## Skydiving (Freefall Frank's)

1. Get a rig at Frank's desk in the hangar: a rental ($150: main, reserve and cutaway), Frank's pre-loved rig ($20), or the pink backpack from lost and found (free). The rig shows on your back.
2. Board the jump plane by its open door (left side). You sit on the bench while it taxis, takes off from runway 0 and climbs. Hold Space to skip the climb.
3. Jump run at 12,500 ft over the airport: the plane holds still (clouds stream past to sell the airspeed) and the cabin has real collision, so you walk about freely. The jump light goes green after 3 seconds. Walk out of the door on the left. After 60 seconds the pilot gives up and you are back in the hangar with your rig.
4. Free fall: WASD tracks relative to the camera, Shift dives head down, E pulls. A wrist altimeter (bottom right) shows altitude and beeps below 3,000 ft.
5. Under canopy: WASD steers, Space flares (slow and soft), Shift dives (fast, and a landing without a flare breaks both legs). A soft landing uses up the rig.

The player controller has two hooks for this: `Player.sky` (a function that drives velocity while airborne, instead of gravity and air control) and `Player.pose` (`sit`, `freefall` or `canopy`, read by `Character.animate`). Both are cleared when the skydive ends.

## Notes for the game loop

- Moving belts carry the player in `step()` by nudging the player's kinematic body (current pose and pending target), so it works whether `step()` runs before or after `player.update()`.
- `onLand` handles the jet bridge and skydive landings, so call it before the default fall-damage logic and skip that logic when it returns true.
- `Player.teleport` now ignores the stale ground contact on the next step. Before this, teleporting the player into the air (the old skydive) counted as an instant landing.
- The game runs the death-to-claim timer on its own track, so a map calling `runSeq` right after `kill` no longer cancels the insurance claim (that left the player stuck in midair).
