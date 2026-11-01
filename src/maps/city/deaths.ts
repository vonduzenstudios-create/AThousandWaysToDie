import type { DeathDef } from '../../deaths';

/** Deaths that happen in the city (the airport and hospital modules bring their own). */
export const CITY_DEATHS: DeathDef[] = [
  { id: 'city-manhole', name: 'Manhole Surprise', category: 'Gravity', location: "Outside Sal's Deli", payout: 700, blurb: 'Walked into an open manhole while texting. A rat has the phone now.' },
  { id: 'city-thirdrail', name: 'Third Rail', category: 'Electricity', location: '350th St Subway', payout: 1900, blurb: 'Climbed down for a dropped phone. Touched the one rail you never touch.' },
  { id: 'city-subway', name: 'Mind the Gap', category: 'Vehicles', location: '350th St Subway', payout: 1700, blurb: 'Stood on the tracks to look for the train. Found it.' },
  { id: 'city-railyard', name: 'Rush Hour', category: 'Vehicles', location: 'Grand Centralish Rail Yard', payout: 2600, blurb: 'Out-juked every good samaritan in the rail yard to meet the 5:15 face first.' },
  { id: 'city-windowwasher', name: 'Window Washer', category: 'Gravity', location: 'Mortalis Mutual HQ', payout: 4200, blurb: 'Cut both cables of the washer rig on the insurance company\'s own tower.' },
  { id: 'city-fishes', name: 'Sleep With the Fishes', category: 'Water', location: 'Pier 13', payout: 3800, blurb: "Insulted Big Tony's mother. Got a free pair of cement shoes." },
  { id: 'city-mobhit', name: 'Mob Hit by Mistake', category: 'Stupidity', location: "Don Calzone's Pizzeria", payout: 3200, blurb: "Wore Vinnie the snitch's jacket into the back room. Vinnie owes you one." },
  { id: 'city-wreckingball', name: 'Wrecking Ball', category: 'Machines', location: 'Overbudget Tower Site', payout: 3500, blurb: 'Rode the wrecking ball like a pop star, straight through a load-bearing wall.' },
  { id: 'city-statue', name: 'Cement Statue', category: 'Machines', location: 'Overbudget Tower Site', payout: 2300, blurb: 'Fell into a turning cement mixer. Now a public monument.' },
  { id: 'city-balloon', name: 'Parade Balloon', category: 'Gravity', location: 'Thanksgiving-ish Parade', payout: 2800, blurb: 'Held on to the balloon past the skyline. Popped on the Mortalis spire.' },
  { id: 'city-pigeons', name: "Pigeon Lady's Army", category: 'Creatures', location: 'Central Park', payout: 1300, blurb: 'Stole the pigeon lady\'s breadcrumbs. The pigeons have a chain of command.' },
  { id: 'city-hotdog', name: 'Mystery Meat', category: 'Food & Drink', location: 'Hot Dog Cart', payout: 900, blurb: 'Ate every hot dog from the cart that never moves. Nobody knows what they were.' },
  { id: 'city-beam', name: 'Lunch on the Beam', category: 'Gravity', location: 'Overbudget Tower Site', payout: 2000, blurb: 'Ate a sandwich 30 floors up on a steel beam. Pepper. Sneeze.' },
  { id: 'city-potty', name: 'Porta Potty Fling', category: 'Machines', location: 'Overbudget Tower Site', payout: 1600, blurb: 'Was in the porta potty when the crane picked it up. Was in it when the crane let go.' },
];
