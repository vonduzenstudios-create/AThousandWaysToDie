import type { DeathDef } from '../../deaths';

const L = 'City International Airport';

/** Deaths on the airport grounds. In-flight deaths belong to the travel system. */
export const AIRPORT_DEATHS: DeathDef[] = [
  { id: 'air-bagbelt', name: 'Checked Baggage', category: 'Machines', location: `${L}: Check-in`, payout: 1800, blurb: 'Lay flat on the bag belt and rode it into the sorting machine. Arrived in fourteen cities.' },
  { id: 'air-carousel', name: 'Unclaimed', category: 'Crushing', location: `${L}: Baggage Claim`, payout: 900, blurb: 'Rode the baggage carousel until the suitcase avalanche came.' },
  { id: 'air-scanner', name: 'Frequent Flyer', category: 'Stupidity', location: `${L}: Security`, payout: 1100, blurb: 'Walked through the body scanner fifteen times. Glows in the dark now.' },
  { id: 'air-patdown', name: 'Enhanced Screening', category: 'Stupidity', location: `${L}: Security`, payout: 1300, blurb: 'Tried to skip security four times. The pat-down took nine hours.' },
  { id: 'air-confiscated', name: 'Confiscated Liquids', category: 'Food & Drink', location: `${L}: TSA Office`, payout: 1000, blurb: 'Drank the confiscated liquids bin, 3.4 ounces at a time. Mostly shampoo.' },
  { id: 'air-walkway', name: 'Wrong Way', category: 'Machines', location: `${L}: Concourse A`, payout: 700, blurb: 'Ran the wrong way on the moving walkway. The walkway won.' },
  { id: 'air-massage', name: 'Deep Tissue', category: 'Machines', location: `${L}: Main Hall`, payout: 800, blurb: 'Fifty quarters on max intensity. The massage chair had a breakdown.' },
  { id: 'air-perfume', name: 'Eau de Mort', category: 'Stupidity', location: `${L}: Duty Free`, payout: 600, blurb: 'Tried every perfume sample in duty free. The green cloud is still there.' },
  { id: 'air-openbar', name: 'Open Bar', category: 'Food & Drink', location: `${L}: Sky Lounge`, payout: 1200, blurb: 'Drank the lounge dry before boarding. Never boarded.' },
  { id: 'air-missedflight', name: 'Missed Connection', category: 'Stupidity', location: `${L}: Gate A1`, payout: 500, blurb: 'Missed Flight 404. The next one was in nine hours. The heart said no.' },
  { id: 'air-jetbridge', name: 'Jet Bridge to Nowhere', category: 'Gravity', location: `${L}: Jet Bridge`, payout: 900, blurb: 'Walked to the end of the jet bridge and kept walking.' },
  { id: 'air-jetblast', name: 'Jet Blast', category: 'Vehicles', location: `${L}: Runway`, payout: 3200, blurb: 'Stood behind a jet at takeoff power. Landed somewhere in the city.' },
  { id: 'air-deicer', name: 'De-iced', category: 'Stupidity', location: `${L}: Apron`, payout: 1100, blurb: 'Stood in the de-icing spray on a 90 degree day. Glows neon orange.' },
  { id: 'air-terrain', name: 'Terrain, Pull Up', category: 'Vehicles', location: `${L}: Mount Mortalis`, payout: 6000, blurb: 'Flew a full airliner into the mountain at the end of the runway. Passengers parachuted out fine.' },
  { id: 'air-runway0', name: 'Cleared to Land', category: 'Vehicles', location: `${L}: Runway 0`, payout: 4500, blurb: 'Told Flight 22 to land on runway zero, then went and stood on runway zero.' },
  { id: 'air-teddychute', name: 'Teddy Bear Chute', category: 'Gravity', location: `${L}: Hangar`, payout: 2400, blurb: 'Skydived with a backpack from lost and found. It had a teddy bear in it.' },
  { id: 'air-tug', name: 'Ramp Rash', category: 'Vehicles', location: `${L}: Apron`, payout: 1000, blurb: 'Played chicken with a baggage tug. The tug does not brake.' },
];
