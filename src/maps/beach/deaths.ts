import type { DeathDef } from '../../deaths';

const L = 'Sandy Shores';

/** Deaths on the beach and ocean map. Specs: the Death Puzzle Design Bible, beach and ocean section. */
export const BEACH_DEATHS: DeathDef[] = [
  { id: 'coconut', name: 'Coconut Conk', category: 'Crushing', location: `${L} Beach`, payout: 700, blurb: 'Shook a palm tree three times and stood right under it. A crab took the hat.' },
  { id: 'shark', name: 'Shark Week', category: 'Creatures', location: 'Past the Buoys', payout: 4200, blurb: 'Bleeding, in an inner tube, splashing. A small shark came. A bigger shark came for the small shark.' },
  { id: 'buried', name: 'Buried Alive', category: 'Water', location: `${L} Beach`, payout: 900, blurb: 'Asked the kids to bury them up to the neck. The tide had other plans.' },
  { id: 'gulls', name: 'Seagull Airlift', category: 'Creatures', location: `${L} Pier`, payout: 1100, blurb: 'Held a bucket of fries over their head on the pier. Thirty gulls took the fries and the person attached.' },
  { id: 'parasail', name: 'Parasail Snap', category: 'Gravity', location: `${L} Lighthouse`, payout: 2400, blurb: 'Chewed through the tow rope at full height and steered into the lighthouse. The beam did the rest.' },
  { id: 'marlin', name: 'Marlin Tug-of-War', category: 'Creatures', location: 'Reel Deal Charters', payout: 2600, blurb: 'Tied the fishing line around their own waist. The marlin won.' },
  { id: 'anchor', name: 'Anchors Away', category: 'Water', location: `${L} Harbor`, payout: 2000, blurb: 'Wrapped the anchor chain around one foot and pulled the release. Found treasure. It was a Mortalis brochure.' },
  { id: 'whale', name: 'Swallowed by a Whale', category: 'Creatures', location: 'Open Ocean', payout: 5200, blurb: 'Chased krill into a whale. Lived inside it briefly. Left through the blowhole at speed.' },
  { id: 'toodeep', name: 'Too Deep', category: 'Machines', location: "Davy's Discount Subs", payout: 5500, blurb: 'Removed the safety governor from a discount submarine and kept going down. The sub is now the size of a sugar cube.' },
  { id: 'rip', name: 'Rip Current', category: 'Water', location: 'The Red Flag Zone', payout: 800, blurb: 'A lifeguard swam the red-flag zone. Every other lifeguard assumed he had it under control.' },
  { id: 'sandcastle', name: 'Sandcastle Collapse', category: 'Crushing', location: `${L} Beach`, payout: 1000, blurb: 'Helped build a five-meter sandcastle, then took a nap inside it.' },
  { id: 'jellyfish', name: 'Jellyfish Smoothie', category: 'Creatures', location: 'The Pier High Dive', payout: 1600, blurb: 'A perfect belly flop from the high dive, straight into the jellyfish bloom.' },
  { id: 'volleyball', name: 'Spiked by a Pro', category: 'Sports', location: `${L} Volleyball Court`, payout: 900, blurb: 'Taunted a professional beach volleyball player three times. He answered the third time.' },
  { id: 'puffer', name: 'Angry Pufferfish', category: 'Creatures', location: 'Sandy Shores Reef', payout: 1200, blurb: 'Poked a pufferfish until it was the size of a hatchback.' },
  { id: 'buffet', name: 'Buffet Stampede', category: 'Crushing', location: 'The Majestic Mortalis (cruise ship)', payout: 1700, blurb: 'Stood between the line and the buffet the moment it opened. Trampled by 900 people in flip-flops.' },
  { id: 'drowned', name: "Davy Jones' Locker", category: 'Water', location: 'The Ocean', payout: 600, blurb: 'Forgot that people need air. Classic.' },
  { id: 'bellyflop', name: 'Water Like Concrete', category: 'Gravity', location: 'The Ocean', payout: 1300, blurb: 'Hit the water from so high up that the water was basically a parking lot.' },
];
