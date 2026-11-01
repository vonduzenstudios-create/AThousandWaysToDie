import type { DeathDef } from '../../deaths';

const L = 'City General Hospital';

/** Deaths at City General. Ids are prefixed 'hospital-' so they never collide with a map's own. */
export const HOSPITAL_DEATHS: DeathDef[] = [
  { id: 'hospital-vending', name: 'Snack Attack', category: 'Crushing', location: `${L} · Waiting Room`, payout: 900, blurb: 'Shook the vending machine for a stuck bag of chips. The machine shook back.' },
  { id: 'hospital-codegrey', name: 'Code Grey', category: 'Stupidity', location: `${L} · Lobby`, payout: 1600, blurb: 'Kept walking through the staff door. Security sedated him with the horse dose.' },
  { id: 'hospital-defib', name: 'Clear!', category: 'Electricity', location: `${L} · Trauma Room`, payout: 1800, blurb: 'Tested the defibrillator on himself. Then again. Then again.' },
  { id: 'hospital-morgue', name: 'Cold Storage', category: 'Stupidity', location: `${L} · Morgue`, payout: 1500, blurb: 'Climbed into a morgue drawer for a quick nap. Saved everyone a trip.' },
  { id: 'hospital-laundry', name: 'Fresh Linens', category: 'Machines', location: `${L} · Laundry`, payout: 2100, blurb: 'Rode the laundry chute down four floors into the industrial press. Neatly folded.' },
  { id: 'hospital-shaft', name: 'Going Down', category: 'Gravity', location: `${L} · Elevator`, payout: 2000, blurb: 'Used the fire key to open the elevator doors. The elevator was on another floor.' },
  { id: 'hospital-nitrous', name: 'Laughing Gas', category: 'Stupidity', location: `${L} · Anesthesia Storage`, payout: 1700, blurb: 'Huffed the nitrous until he floated. Then he popped. He was laughing the whole time.' },
  { id: 'hospital-selfsurgery', name: 'Physician, Heal Thyself', category: 'Stupidity', location: `${L} · OR 1`, payout: 3200, blurb: 'Performed his own surgery using a mirror. Death graded the stitches a D minus.' },
  { id: 'hospital-wrongsurgery', name: 'Wrong Surgery', category: 'Stupidity', location: `${L} · OR 2`, payout: 3600, blurb: 'Swapped charts with the heart transplant patient. The new heart was a pig\'s.' },
  { id: 'hospital-unplug', name: 'Unplug Yourself', category: 'Stupidity', location: `${L} · Patient Ward`, payout: 4000, blurb: 'Unplugged his own monitor and tripped down three flights on his IV cord. Died in a hospital, which is just efficient.' },
  { id: 'hospital-mri', name: 'Magnet Personality', category: 'Machines', location: `${L} · MRI`, payout: 3000, blurb: 'Went into the MRI with a pocket full of metal. Stuck to the ceiling of the tube and spun.' },
  { id: 'hospital-rotor', name: 'Chopper Haircut', category: 'Vehicles', location: `${L} · Helipad`, payout: 2600, blurb: 'Jumped into the air ambulance rotor. The haircut was very short.' },
];
