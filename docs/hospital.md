# City General Hospital

A drop-in place (`src/places/hospital/`), stamped into the city's `HOSPITAL_LOT`. Any map can use it:

```ts
const info = buildHospital(world, { x, y, z }, rng); // in MapDef.build; y = first air block
setup: (ctx) => composeRuntimes([myRuntime, setupHospital(ctx, info)]),
deaths: [...MY_DEATHS, ...HOSPITAL_DEATHS],
```

Footprint 64 x 48 (x by z), entrance on the -z side with a canopy about 4 blocks out, about 40 tall. Pass `{ name }` to `setupHospital` to change the name on the facade (Smallville uses "Smallville General Hospital").

## Exterior

The coarse voxel shell from `layout.ts` does the collision and the interior. `facade.ts` wraps it in a skin of building-kit detail voxels (see `docs/building-kit.md`): ribbon windows with mullions, sills and a few lit rooms, piers, slab bands, a teal cornice, a taller parapet with coping, the lit red cross, the name in red letters, the entrance portal and canopy, the EMERGENCY sign on the east side, helipad edge lights and a beacon. Thin colliders sit over the skin, so you stand against it, not inside it. `models.ts` has the detail-voxel helicopter and ambulance, and `runtime.ts` adds kit paving, lamps, benches, planters and bollards out front.

## Floors

| Floor | Rooms |
|---|---|
| 1 | Lobby, waiting room, cafeteria (public). Badge door. ER bays, trauma room, laundry, morgue, staff lounge |
| 2 | Patient ward: six rooms of beds with heart monitors and IV stands, nurses' station |
| 3 | Surgery: pre-op, OR 1, OR 2 (Herb Fudge's heart transplant), anesthesia storage |
| 4 | Radiology: X-ray, MRI control, MRI, doctors' lounge, laundry chute hatch |
| Roof | Helipad with the air ambulance |

Every floor shares a core on the north side: a switchback stairwell (with invisible ramps over the steps), the elevator (▲ and ▼ buttons by its doors) and the laundry chute.

## Who gets where

- Lobby and cafeteria: anyone.
- Past the badge door: Doctor, Surgeon, Nurse, EMT, Firefighter, Janitor, Security Guard. Anyone else is escorted back to the lobby three times; the fourth time security calls a Code Grey.
- Patients: the ward, the floor 3 corridor and pre-op. The elevator only runs them between floors 2 and 3.
- ORs: Surgeons and Doctors only.
- Pulling the lobby fire alarm stops all badge checks for 30 seconds.

Staff and patients are posted people the hospital positions itself (`MapRuntime.npcs`), since the life system's nav grid is single-level. Possess them like anyone else.

## Deaths

| Death | How |
|---|---|
| Snack Attack | Shake the waiting room vending machine four times |
| Code Grey | Barge through the staff door a fourth time |
| Clear! | Medical staff: use the trauma room defibrillator on yourself |
| Cold Storage | Climb into the open morgue drawer |
| Fresh Linens | Climb into the floor 4 laundry chute |
| Going Down | Firefighter: fire key on the elevator doors, then step in |
| Laughing Gas | Huff the nitrous in anesthesia storage five times |
| Physician, Heal Thyself | Surgeon: operate on yourself in OR 1 |
| Wrong Surgery | Patient: grab a coffee, spill it on Herb Fudge's chart in pre-op, swap charts, lie on the empty gurney |
| Unplug Yourself | Patient: unplug your heart monitor, take your IV stand, and reach the stairs before nurse rounds |
| Magnet Personality | Pocket three metal things (reception keys, cafeteria pan, laundry wrench, ward bedpan) and get an MRI |
| Chopper Haircut | Get onto the helicopter while its rotor is spinning (it warms up every 50 s, or an EMT starts it) |
