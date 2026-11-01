# Job perks, Intrusive Thoughts and NPC talk

Matthew's rules (2026-11-01):

- A job never kills you by itself. Each job is a key: it opens an area, or a way to die nobody else can reach.
- The Depressed mind skill is **Intrusive Thoughts**: the body voices a hint about a random death on this map that it could actually do ("I bet I'm healthy enough to climb the big oak tree...").
- Talking to townsfolk has no menu. They say one thing based on who they are and who you are wearing. Depressed townsfolk may wish out loud about a death ("I'm not a nurse, but if I was I bet I could...").

## Where it lives

- `src/hints.ts`: one hint per death (`act` + `needs`), plus `intrusiveThought()` and `depressedHint()`. Every death in the ledger must have a hint. When you add a death, add its line here, with `needs` listing the jobs, physical tier or peanut allergy it requires.
- `src/skills.ts`: `JOB_SKILLS` are all passives that say where the job gets you.
- `src/hometown.ts`: the nine Smallville job-perk deaths (`PERKS`, `perkDeath`).
- `src/life/life.ts` `lineFor()`: what someone says when you talk to them. `src/life/dialogue.ts` `aboutYou()`: lines about the body's job.

## Jobs

| Job | Perk | Opens |
| --- | --- | --- |
| Farmhand | Barn Key | Barn, hay hoist, baler, bull pen gate |
| Cop | Badge | Police station and its taser, airport security without a ticket |
| Pastor | Bell Tower Key | Church bell tower |
| Mechanic | Shop Keys | **Oil Change**: lie under the car at Duke's Garage and lower the lift |
| Banker | Vault Code | **Safe Deposit**: lock yourself in the bank vault |
| Diner Cook | Kitchen Access | **Extra Crispy**: the diner's deep fryer (and free safari lodge steak) |
| Dentist | Prescription Pad | **Prescription for Everything** at Rx Pharmacy (Doctors and Surgeons can too) |
| Mail Carrier | Back of the Post Office | **Return to Sender**: mail yourself overnight |
| Teen | Gym Class | **Varsity Dodgeball** in the School Gym |
| Crossing Guard | Crossing Key | **Gate Crasher**: ride the railroad crossing arm up |
| Retiree | Pre-Paid Plot | **Try Before You Die**: the open grave at the cemetery |
| Insurance Salesman | Pre-Need Sales | **Display Model**: the coffin in the cemetery sales office |
| Influencer | Blue Check | Airport Sky Lounge and its open bar, free |
| Construction Worker, Foreman | Site Badge | City tower site crane and wrecking ball |
| Hospital staff | Staff Badge | City General past the lobby (defib, morgue, MRI, fire key, air ambulance, self-surgery) |
| Patient | Patient Wristband | Hospital ward, IV and chart swap; the asylum wards |
| Grocery staff | Staff Only | Back room, deli, freezer, forklift, slicer |
| Airport staff | Airside Badge | Bag room, ramp, TSA office, tower, lounge, cockpit |
| Inmate, Guard, Warden, Orderly, Psychiatrist | Yard Time / Keys | Their parts of Blackrock and Pinecrest |

Removed: Tase Self, Hard Hat, Chug Coolant, Dog Sprint, Ask For Manager, Insider Trading, Vape Cloud, Laughing Gas, Family Meal, Fine Print, Pass the Plate, STOP, Go Live, Morbid Curiosity.
