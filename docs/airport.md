# Fuhgeddaboudit International

The city's airport, built as a self-contained place in `src/places/airport/`. The city calls `placeAirport(world, origin, rng)` for its 320 x 224 airport lot (`AIRPORT_LOT` in `src/maps/city/layout.ts`) and merges the result with `mergePart` and `composeRuntimes` from `src/maps/compose.ts`. Its interactable ids start with `airport:` and its plane stop id is `airport` (route `city:airport`).

## Files

- `frame.ts`: the design frame. The airport is laid out with the curb at z = 0 and the runway at z = 160..184; the frame mirrors z so the curb lands on the city's road side. Headings map `f` to `PI - f`.
- `layout.ts`: every position, and the voxel build (terminal, security, baggage rooms, concourse, jet bridges, apron, taxiways, runway, tower, hangar, fence, Mount Mortalis).
- `props.ts`: meshes and moving parts: airliners with scripted routes, the jump plane, the de-icer, the baggage tug, staff doors, signs, people at their posts.
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
| Teddy Bear Chute | Take a backpack from the hangar's lost and found, board the jump plane, jump. |
| Ramp Rash | Get hit by the baggage tug that loops around the apron. |

In-flight deaths (exit door, airline food, lavatory, turbulence, wheel well) belong to the travel system.

## Notes for the game loop

- Moving belts carry the player in `step()` by nudging the player's body. Call the map's `step()` before `player.update()` in the fixed step, otherwise the nudge is overwritten.
- `onLand` handles the jet bridge and skydive landings, so call it before the default fall-damage logic and skip that logic when it returns true.
