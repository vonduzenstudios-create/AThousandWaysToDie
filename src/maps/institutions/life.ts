import { voxelNav } from '../../life/nav';
import type { JobProfile, LifeMap, LifePlace, V3 } from '../../life/types';
import type { VoxelWorld } from '../../voxel';
import { G, box } from './common';

/**
 * The prison and the asylum as the NPC life system sees them: who lives where, who works where,
 * and which places only some jobs may enter (`allowedJobs`). Only the ground floor is walkable for
 * townsfolk; Gary can climb the stairs in any body he takes.
 */

const v = (x: number, z: number): V3 => ({ x, y: G, z });

const PRISON_STAFF = ['Prison Guard', 'Warden'];
const PRISON_INSIDE = ['Inmate', ...PRISON_STAFF];
const ASYLUM_STAFF = ['Orderly', 'Nurse', 'Psychiatrist'];
const ASYLUM_INSIDE = ['Patient', ...ASYLUM_STAFF];

export const INSTITUTION_PROFILES: JobProfile[] = [
  {
    job: 'Inmate',
    style: 'roam',
    shift: [8, 20],
    workKinds: ['work'],
    likes: ['food', 'park'],
    workLines: ['Ten more years. Nine if I behave. Fifteen if I keep talking.', 'Who touched my bunk?', 'This yard is MY yard.'],
    talkLines: ["I'm innocent. Everybody in here is innocent.", "Don't take Big Tony's dumbbell. Just don't.", "The slop is fine the first time. Never go back for seconds.", 'Inkwell does tattoos. Spelling costs extra.'],
  },
  {
    job: 'Prison Guard',
    style: 'patrol',
    shift: [6, 22],
    workKinds: ['civic'],
    likes: ['food'],
    workLines: ['Keep it moving.', 'Lights out at ten.', 'Hands where I can see them.'],
    talkLines: ['Visitors stay in the lobby. No exceptions. Well, one exception.', "The fence is ten thousand volts. Don't test it.", 'Death row is staff only. Nobody wants to go there anyway.'],
  },
  {
    job: 'Warden',
    style: 'station',
    shift: [8, 18],
    workKinds: ['civic'],
    likes: ['food'],
    workLines: ['Rehabilitation. Rehabilitation. Rehabilitation.', 'Where is my pudding?'],
    talkLines: ['Blackrock has the lowest escape rate in the state. Mostly because of the fence.', 'Somebody keeps digging. I can hear the spoon at night.'],
  },
  {
    job: 'Visitor',
    style: 'none',
    likes: ['civic', 'transit'],
    talkLines: ["I'm here to see my brother. He says he's innocent.", 'Forty minutes on that bus for a twenty-minute visit.', 'Do not go past the lobby. They are serious.'],
  },
  {
    job: 'Patient',
    style: 'roam',
    shift: [8, 20],
    workKinds: ['park'],
    likes: ['food', 'park'],
    workLines: ['The pudding is a lie.', 'Did you hear the voice too? No? Just me?', 'I am perfectly calm. PERFECTLY CALM.'],
    talkLines: ["Napoleon cheats at chess. Don't beat him. Seriously.", 'The walls upstairs bounce. Like, a LOT.', "There's a bear in the woods. Bruce says there isn't. There is.", 'Only one pudding left. Nobody take it.'],
  },
  {
    job: 'Orderly',
    style: 'patrol',
    shift: [6, 22],
    workKinds: ['work'],
    likes: ['food'],
    workLines: ['Easy now.', 'Walk, please.', 'Who left a straitjacket in the pool?'],
    talkLines: ['Need a jacket? I got jackets.', "Lobby's for visitors. Ward's for patients. Simple.", 'The roof hatch is locked. Has been since the incident.'],
  },
  {
    job: 'Nurse',
    style: 'station',
    shift: [7, 21],
    workKinds: ['work'],
    likes: ['food'],
    workLines: ['Meds at nine, sweetie.', 'Who has been in my cart?'],
    talkLines: ["Every cup on that cart is counted. Don't even think about it.", 'Medicated folks can take a LOT before it shows.'],
  },
  {
    job: 'Psychiatrist',
    style: 'roam',
    shift: [9, 17],
    workKinds: ['work'],
    likes: ['food'],
    workLines: ['And how does that make you feel?', 'Fascinating. Truly fascinating.'],
    talkLines: ["My office is upstairs. Doctors only. There's nothing interesting in the desk.", 'Therapy Room B is off-limits. The dial is very sensitive.'],
  },
];

export function prisonLife(world: VoxelWorld): LifeMap {
  const places: LifePlace[] = [
    { id: 'cells', name: 'Cell Block A', kind: 'home', door: v(57.5, 121.5), inside: box(43, G, 74, 73, G, 116), residents: 18, allowedJobs: PRISON_INSIDE },
    {
      id: 'yard',
      name: 'the yard',
      kind: 'work',
      door: v(57.5, 66),
      inside: box(30, G, 30, 140, G, 64),
      spots: [v(62, 40), v(66, 44), v(74, 42), v(104, 40), v(112, 50), v(120, 44)],
      jobs: ['Inmate'],
      allowedJobs: PRISON_INSIDE,
    },
    {
      id: 'cafeteria',
      name: 'the cafeteria',
      kind: 'food',
      door: v(93, 83.5),
      inside: box(98, G, 77, 133, G, 94),
      counter: v(110.5, 76.6),
      spots: [v(102, 79), v(110, 79), v(118, 85), v(126, 85), v(104, 90), v(112, 90)],
      hours: [6, 19],
      sells: [{ item: 'tray of slop', price: 0 }],
      allowedJobs: PRISON_INSIDE,
      lines: ['Slop is served.', 'No seconds. Nobody wants seconds.'],
    },
    { id: 'laundry', name: 'the laundry', kind: 'work', door: v(93, 109), inside: box(98, G, 108, 112, G, 116), jobs: ['Inmate'], allowedJobs: PRISON_INSIDE },
    {
      id: 'guardpost',
      name: 'the guard post',
      kind: 'civic',
      door: v(91, 122),
      jobs: ['Prison Guard'],
      allowedJobs: PRISON_STAFF,
      patrol: [v(91, 122), v(91, 68), v(60, 60), v(120, 60), v(91, 68), v(91, 130), v(40, 130), v(140, 130)],
    },
    { id: 'deathrow', name: 'death row', kind: 'civic', door: v(144.5, 93), inside: box(148, G, 72, 160, G, 97), staffSpots: [v(152, 85)], jobs: ['Prison Guard'], allowedJobs: PRISON_STAFF },
    { id: 'admin', name: 'intake', kind: 'civic', door: v(105.5, 138), inside: box(102, G, 142, 107, G, 150), staffSpots: [v(104, 146)], jobs: ['Warden'], allowedJobs: PRISON_STAFF },
    { id: 'lobby', name: 'the Blackrock lobby', kind: 'civic', door: v(96, 166), inside: box(82, G, 154, 110, G, 160), staffSpots: [v(104.5, 154.2)], spots: [v(84, 158), v(88, 158), v(92, 149), v(96, 149)] },
    { id: 'shuttle', name: 'the visitor shuttle stop', kind: 'transit', door: v(96.5, 168) },
  ];
  return {
    id: 'prison',
    name: 'Blackrock Penitentiary',
    nav: voxelNav(world, { maxFloor: G, maxStep: 0.5 }),
    places,
    population: {
      people: [
        ...Array.from({ length: 10 }, () => ({ job: 'Inmate', home: 'cells', work: 'yard' })),
        ...Array.from({ length: 3 }, () => ({ job: 'Inmate', home: 'cells', work: 'laundry' })),
        { job: 'Prison Guard', work: 'guardpost' },
        { job: 'Prison Guard', work: 'guardpost' },
        { job: 'Prison Guard', work: 'guardpost', shift: [14, 23] as [number, number] },
        { job: 'Prison Guard', work: 'deathrow' },
        { job: 'Prison Guard', work: 'lobby' },
        { job: 'Warden', work: 'admin', name: 'Warden Pruitt' },
        { job: 'Visitor' },
        { job: 'Visitor' },
        { job: 'Visitor' },
      ],
    },
    jobProfiles: INSTITUTION_PROFILES,
    spawns: [v(96.5, 168)],
    smallTalk: [
      "Big Tony's been benching that bar for nine years. Nobody else touches it.",
      'Somebody in cell 8 has been digging. I hear the spoon.',
      'Death row has been empty for a while. The chair still works.',
      'The fence hums louder at night.',
    ],
  };
}

export function asylumLife(world: VoxelWorld): LifeMap {
  const places: LifePlace[] = [
    {
      id: 'ward',
      name: 'the ward',
      kind: 'home',
      door: v(96, 127),
      inside: box(81, G, 97, 111, G, 123),
      residents: 16,
      allowedJobs: ASYLUM_INSIDE,
      spots: [v(89.5, 112.5), v(102.5, 106.5), v(96, 100), v(96, 120)],
    },
    { id: 'rec', name: 'the rec room', kind: 'park', door: v(77.5, 126.5), inside: box(53, G, 126, 73, G, 148), spots: [v(57.5, 130), v(57.5, 132), v(62, 141)], allowedJobs: ASYLUM_INSIDE },
    {
      id: 'cafeteria',
      name: 'the Pinecrest cafeteria',
      kind: 'food',
      door: v(77.5, 110.5),
      inside: box(55, G, 100, 73, G, 122),
      spots: [v(59, 106), v(63, 106), v(67, 114), v(71, 114), v(60, 120)],
      hours: [7, 19],
      sells: [{ item: 'pudding cup', price: 0 }],
      allowedJobs: ASYLUM_INSIDE,
    },
    { id: 'group', name: 'group therapy', kind: 'park', door: v(77.5, 83.5), inside: box(59, G, 79, 70, G, 91), allowedJobs: ASYLUM_INSIDE },
    { id: 'art', name: 'art therapy', kind: 'park', door: v(115, 110.5), inside: box(120, G, 100, 140, G, 122), allowedJobs: ASYLUM_INSIDE },
    {
      id: 'nurses',
      name: "the nurses' station",
      kind: 'work',
      door: v(115, 126.5),
      inside: box(119, G, 133, 140, G, 148),
      staffSpots: [v(124, 133), v(130, 141)],
      jobs: ['Nurse'],
      allowedJobs: ASYLUM_STAFF,
    },
    {
      id: 'hall',
      name: 'the north hall',
      kind: 'work',
      door: v(96, 93),
      inside: box(86, G, 72, 115, G, 90),
      jobs: ['Orderly', 'Psychiatrist'],
      allowedJobs: ASYLUM_INSIDE,
      patrol: [v(96, 93), v(78, 93), v(78, 127), v(114, 127), v(114, 93), v(96, 93), v(96, 72)],
    },
    { id: 'garden', name: 'the garden', kind: 'park', door: v(95.5, 68.5), inside: box(36, G, 44, 155, G, 68), allowedJobs: ASYLUM_INSIDE },
    { id: 'lobby', name: 'the Pinecrest lobby', kind: 'civic', door: v(95.5, 152), inside: box(81, G, 131, 111, G, 148), staffSpots: [v(89, 139.5)], spots: [v(101, 146), v(105, 146), v(109, 146)] },
    { id: 'gate', name: 'the Pinecrest bus stop', kind: 'transit', door: v(96.5, 177) },
  ];
  return {
    id: 'asylum',
    name: 'Pinecrest Asylum',
    nav: voxelNav(world, { maxFloor: G, maxStep: 0.5 }),
    places,
    population: {
      people: [
        ...Array.from({ length: 14 }, () => ({ job: 'Patient', home: 'ward' })),
        { job: 'Orderly', work: 'hall' },
        { job: 'Orderly', work: 'hall' },
        { job: 'Orderly', work: 'lobby' },
        { job: 'Nurse', work: 'nurses' },
        { job: 'Nurse', work: 'nurses', shift: [14, 23] as [number, number] },
        { job: 'Psychiatrist', work: 'hall', name: 'Dr. Fudge' },
        { job: 'Visitor' },
        { job: 'Visitor' },
      ],
    },
    jobProfiles: INSTITUTION_PROFILES,
    spawns: [v(96.5, 177)],
    smallTalk: [
      'Napoleon flipped the chess table again.',
      "Who keeps eating the finger paint? It's always the red one first.",
      'The quiet room upstairs is not quiet. It goes BOING.',
      "Dr. Fudge keeps something old and pointy in his desk.",
    ],
  };
}
