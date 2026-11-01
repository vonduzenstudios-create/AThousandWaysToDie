import type { DeathDef } from '../../deaths';

const L = 'Smallville Grocery';

/** Every death in the grocery store. Ids are prefixed so they never clash with other maps. */
export const GROCERY_DEATHS: DeathDef[] = [
  { id: 'groc-cans', name: 'Can Avalanche', category: 'Crushing', location: L, payout: 1100, blurb: 'Pulled the bottom can out of a 30-foot pyramid. Physics did the rest.' },
  { id: 'groc-samples', name: 'Free Sample Overdose', category: 'Food & Drink', location: L, payout: 1300, blurb: "Ate forty 'new spicy chip' samples in five disguises. The sample lady knew." },
  { id: 'groc-cartderby', name: 'Shopping Cart Derby', category: 'Vehicles', location: `${L} Parking Lot`, payout: 2400, blurb: 'Rode a shopping cart down the parking lot hill into Main Street traffic.' },
  { id: 'groc-carttrain', name: 'Cart Train Wreck', category: 'Vehicles', location: `${L} Parking Lot`, payout: 3200, blurb: 'Rounded up every cart in the lot into one train and rode it into a truck.' },
  { id: 'groc-peanuts', name: 'Aisle 5 Anaphylaxis', category: 'Allergies', location: L, payout: 1400, blurb: 'Ate from the bulk peanut bin with a deadly peanut allergy, far from any EpiPen.' },
  { id: 'groc-freezer', name: 'Human Popsicle', category: 'Stupidity', location: `${L} Meat Freezer`, payout: 2200, blurb: 'Shut himself in the walk-in freezer between safety checks. Slid out like a hockey puck.' },
  { id: 'groc-slicer', name: 'Paper Thin', category: 'Machines', location: `${L} Deli`, payout: 2600, blurb: 'Set the slicer to paper thin and leaned in to see if it was clean. Sold by the pound.' },
  { id: 'groc-misters', name: 'Lettuce Pray', category: 'Electricity', location: `${L} Produce`, payout: 1700, blurb: 'Stood in a puddle holding a metal basket when the produce misters went off over a frayed cord.' },
  { id: 'groc-melons', name: 'Melon Collie', category: 'Crushing', location: `${L} Produce`, payout: 1500, blurb: 'Pulled the bottom watermelon. The rest chased him down the aisle.' },
  { id: 'groc-lobsters', name: 'Lobster Uprising', category: 'Creatures', location: `${L} Seafood`, payout: 2300, blurb: 'Freed the lobsters. They unionized and pinched him to death.' },
  { id: 'groc-selfcheckout', name: 'Unexpected Item', category: 'Machines', location: `${L} Self-Checkout`, payout: 1600, blurb: 'Tried to buy one banana at self-checkout. Heart gave out at error 25.' },
  { id: 'groc-forklift', name: 'Bless You', category: 'Gravity', location: `${L} Stockroom`, payout: 2500, blurb: 'Rode the forklift to the top shelf and sneezed.' },
  { id: 'groc-gummies', name: 'Gummy Quicksand', category: 'Water', location: `${L} Bulk Bins`, payout: 1200, blurb: 'Climbed into the gummy bear bin and wiggled. Bulk candy works exactly like quicksand.' },
  { id: 'groc-hotsauce', name: 'Ghost Pepper Challenge', category: 'Fire & Explosions', location: `${L} Aisle 4`, payout: 1800, blurb: 'Chugged six hot sauces in order of heat. Achieved liftoff.' },
  { id: 'groc-coupon', name: 'Extreme Couponing', category: 'Sports', location: `${L} Aisle 6`, payout: 1400, blurb: 'Took the last 2-for-1 detergent from a couponer with a binder and a black belt.' },
  { id: 'groc-rotisserie', name: 'Golden Brown', category: 'Fire & Explosions', location: `${L} Rotisserie`, payout: 1500, blurb: 'Climbed into the rotisserie warmer to warm up. Came out golden brown.' },
];
