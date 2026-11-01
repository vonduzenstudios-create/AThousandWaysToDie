import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from '../../physics';
import { B, type VoxelWorld } from '../../voxel';
import { DetailGrid, DPB, DV, PAL, StreetKit, kitMaterial, meshGrid, rasterText, speck, textWidth, tint, vox, type BuildingSpec, type Placement } from '../../kit';
import type { MapContext } from '../types';
import { G } from './common';

/**
 * High-detail exteriors for the prison and the asylum, drawn with the shared building kit
 * (src/kit, docs/building-kit.md). The enterable interiors stay in the voxel world; this adds the
 * facades, signs, razor wire, clock tower and the kit buildings outside the walls.
 *
 * Build time (map.build): call the *Lots(world) function so kit footprints are B.Footprint voxels
 * (nav and the radar see them). Runtime (map.setup): new Decor(ctx) then prisonDecor / asylumDecor.
 */

type Spec = BuildingSpec & Placement;

/** Owns a StreetKit, detail meshes and their colliders, and removes all of it on dispose. */
export class Decor {
  readonly group = new THREE.Group();
  readonly kit: StreetKit;
  private body: RAPIER.RigidBody;

  constructor(private ctx: Pick<MapContext, 'scene' | 'physics'>) {
    this.group.name = 'institution-decor';
    ctx.scene.add(this.group);
    this.kit = new StreetKit({ parent: this.group, physics: ctx.physics });
    this.body = ctx.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  /** Mesh a detail grid with cell (0,0,0) at world (x, y, z). */
  grid(g: DetailGrid, x: number, y: number, z: number, shadows = true) {
    const mesh = new THREE.Mesh(meshGrid(g), kitMaterial(DV));
    mesh.position.set(x, y, z);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  private shared = new Map<() => DetailGrid, THREE.BufferGeometry>();

  /** Place a shared piece (one geometry per builder) at world (x, y, z), turned rotY, with a collider box. */
  piece(build: () => DetailGrid, x: number, y: number, z: number, rotY = 0, collide = true) {
    let geo = this.shared.get(build);
    let size: [number, number, number];
    if (!geo) {
      const g = build();
      geo = meshGrid(g);
      geo.userData.size = [g.sx * DV, g.sy * DV, g.sz * DV];
      this.shared.set(build, geo);
    }
    size = geo.userData.size;
    const mesh = new THREE.Mesh(geo, kitMaterial(DV));
    mesh.castShadow = mesh.receiveShadow = true;
    // Rotate about the piece's center so (x, z) is where its footprint is centered.
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.y = rotY;
    mesh.position.set(-size[0] / 2, 0, -size[2] / 2);
    pivot.add(mesh);
    this.group.add(pivot);
    if (collide) {
      const quarter = Math.abs(Math.sin(rotY)) > 0.7;
      const hx = (quarter ? size[2] : size[0]) / 2, hz = (quarter ? size[0] : size[2]) / 2;
      this.solid(x - hx, y, z - hz, x + hx, y + size[1], z + hz);
    }
    return pivot;
  }

  /** A solid box collider between two world corners. */
  solid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const hx = Math.abs(x1 - x0) / 2, hy = Math.abs(y1 - y0) / 2, hz = Math.abs(z1 - z0) / 2;
    const cd = RAPIER.ColliderDesc.cuboid(Math.max(hx, 0.01), Math.max(hy, 0.01), Math.max(hz, 0.01))
      .setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
      .setFriction(0.9)
      .setCollisionGroups(groups(G_WORLD, G_ALL));
    this.ctx.physics.createCollider(cd, this.body);
  }

  finish() {
    this.kit.finish();
  }

  dispose() {
    this.kit.dispose();
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.shared.clear();
    this.ctx.physics.removeRigidBody(this.body);
  }
}

// ------------------------------------------------------------------ detail pieces

/** Raised letters on a face. Unmirrored text reads correctly from +z; `mirror` flips it for faces seen from -z. */
function letters(g: DetailGrid, text: string, cx: number, y0: number, z0: number, z1: number, scale: number, paint: number, mirror: boolean) {
  const wpx = textWidth(text) * scale;
  const left = Math.round(cx - wpx / 2);
  rasterText(text, (px, py) => {
    for (let sx = 0; sx < scale; sx++)
      for (let sy = 0; sy < scale; sy++) {
        const x = mirror ? g.sx - 1 - (left + px * scale + sx) : left + px * scale + sx;
        g.box(x, y0 + py * scale + sy, z0, x, y0 + py * scale + sy, z1, paint);
      }
  });
}

/** Coiled razor wire along x, one block deep, sitting on y = 0. */
function razorWire(lengthBlocks: number) {
  const g = new DetailGrid(lengthBlocks * DPB, 8, 8);
  const steel = vox(0xb4bac2, { glass: true, jitter: 0.05 });
  const barb = vox(0xd8dce0, { glass: true });
  for (let x = 0; x < g.sx; x++) {
    // Overlapping loops: each loop is a ring around the x axis, slanted along x.
    const t = (x % 10) / 10;
    const a = t * Math.PI * 2;
    const y = Math.round(3.5 + Math.sin(a) * 3);
    const z = Math.round(3.5 + Math.cos(a) * 3);
    g.set(x, y, z, steel);
    if (x % 5 === 0) (g.set(x, Math.min(7, y + 1), z, barb), g.set(x, y, Math.min(7, z + 1), barb));
  }
  // Posts every 4 blocks.
  for (let x = 4; x < g.sx; x += 4 * DPB) g.box(x, 0, 3, x, 7, 4, vox(PAL.iron));
  return g;
}

/** Steel razor wire on top of a rectangular wall ring (wall cells x0..x1, z0..z1, 2 thick), top at y. */
function wireRing(d: Decor, x0: number, z0: number, x1: number, z1: number, y: number) {
  const len = x1 - x0 + 1;
  const depth = z1 - z0 + 1;
  const along = razorWire(len);
  d.grid(along, x0, y, z0 + 0.5, false);
  d.grid(along, x0, y, z1 - 0.5, false);
  // The east and west runs: same grid turned a quarter.
  const side = razorWire(depth);
  for (const x of [x0 + 1.5, x1 + 0.5]) {
    const m = d.grid(side, 0, 0, 0, false);
    m.rotation.y = -Math.PI / 2;
    m.position.set(x, y, z0);
  }
}

/** A short searchlight: a drum housing with a lit lens facing +z. */
function searchlight() {
  const g = new DetailGrid(12, 14, 12);
  const iron = vox(PAL.iron);
  g.box(5, 0, 5, 6, 5, 6, iron); // post
  g.box(2, 5, 4, 9, 6, 7, iron); // yoke
  for (let y = 6; y < 14; y++)
    for (let x = 1; x < 11; x++) {
      const r = Math.hypot(x - 5.5, y - 9.5);
      if (r < 4.6) g.box(x, y, 1, x, y, 10, r > 3.4 ? vox(0x3a3f46) : 0);
      if (r < 3.6) g.set(x, y, 10, vox(0xfff6c8, { emissive: true }));
      if (r < 3.6) g.set(x, y, 1, vox(0x2a2e33));
    }
  return g;
}

/** Wall lantern: bracket and a glowing box, facing +z. */
function lantern(g: DetailGrid, x: number, y: number, z: number) {
  const iron = vox(PAL.iron);
  g.box(x, y + 6, z, x + 1, y + 7, z + 3, iron);
  g.box(x - 1, y, z + 2, x + 2, y + 5, z + 5, iron);
  g.box(x - 1 + 1, y + 1, z + 3, x + 1, y + 4, z + 4, vox(0xffd890, { emissive: true }));
  g.box(x - 1, y + 6, z + 2, x + 2, y + 6, z + 5, iron);
}

/** A rooftop air handler: louvered box, fan grille and a duct, about 3 x 2 x 2 blocks. */
function hvac() {
  const g = new DetailGrid(24, 14, 16);
  const body = vox(0xb9bdc2, { jitter: 0.05 });
  const dark = vox(0x5a5f66);
  g.box(0, 0, 0, 23, 1, 15, dark);
  g.box(1, 2, 1, 22, 11, 14, body);
  for (let y = 3; y < 11; y += 2) g.box(1, y, 0, 22, y, 0, dark); // louvers
  for (let x = 4; x < 12; x++) for (let z = 4; z < 12; z++) if (Math.hypot(x - 7.5, z - 7.5) < 4) g.set(x, 12, z, (x + z) % 2 ? dark : body);
  g.box(15, 12, 5, 20, 13, 10, body);
  return g;
}

/** A roof vent: a short pipe with a cap. */
function vent() {
  const g = new DetailGrid(6, 10, 6);
  const m = vox(0x9aa0a8, { glass: true });
  g.box(2, 0, 2, 3, 7, 3, m);
  g.box(0, 8, 0, 5, 9, 5, m);
  return g;
}

/** A brick chimney with a cap, 1.5 x 3 x 1.5 blocks. */
function chimney() {
  const g = new DetailGrid(12, 26, 12);
  g.box(1, 0, 1, 10, 21, 10, speck(3, [vox(PAL.brickRed, { jitter: 0.12 }), vox(PAL.brickBrown, { jitter: 0.12 })]));
  g.box(0, 22, 0, 11, 23, 11, vox(PAL.trimStone));
  g.box(3, 24, 3, 8, 25, 8, vox(0x3a3a3a));
  return g;
}

/** Coping lip around a flat roof (world cells x0..x1, z0..z1, roof top at y). */
function coping(d: Decor, x0: number, z0: number, x1: number, z1: number, y: number, color: number) {
  const W = (x1 - x0 + 1) * DPB, D = (z1 - z0 + 1) * DPB;
  const g = new DetailGrid(W, 3, D);
  const c = vox(color, { jitter: 0.05 });
  g.box(0, 0, 0, W - 1, 2, 2, c);
  g.box(0, 0, D - 3, W - 1, 2, D - 1, c);
  g.box(0, 0, 0, 2, 2, D - 1, c);
  g.box(W - 3, 0, 0, W - 1, 2, D - 1, c);
  d.grid(g, x0, y, z0, false);
}

// ------------------------------------------------------------------ prison

/** Where the prison's kit buildings go (across the road from the front gate). */
const PRISON_STRIP = { x: 12, z: 179, length: 168, depth: 11 };

export function prisonLots(w: VoxelWorld) {
  const s = PRISON_STRIP;
  w.fill(s.x, G, s.z, s.x + s.length - 1, G, s.z + s.depth - 1, B.Footprint);
}

export function prisonDecor(ctx: Pick<MapContext, 'scene' | 'physics'>, wall: { x0: number; z0: number; x1: number; z1: number; h: number }) {
  const d = new Decor(ctx);
  const { kit } = d;

  // ---- Front facade of the admin block, on the outside face of the outer wall (z = wall.z1 + 1).
  const fx0 = 79, fx1 = 114; // world x span
  const face = wall.z1 + 1;
  const W = (fx1 - fx0) * DPB, H = 14 * DPB, D = 3 * DPB;
  const g = new DetailGrid(W, H, D);
  const X = (wx: number) => Math.round((wx - fx0) * DPB); // world x -> grid x
  const Y = (wy: number) => Math.round((wy - G) * DPB);
  const concrete = speck(11, [vox(0x8a8e95, { jitter: 0.08 }), vox(0x7e828a, { jitter: 0.08 }), vox(0x92969c, { jitter: 0.06 })]);
  const dark = vox(0x4a4e55, { jitter: 0.05 });
  // Plinth and base course.
  g.box(X(80), 0, 0, X(113) - 1, Y(G + 0.75), 2, dark);
  // Pilasters every 8 blocks, skipping the door bay.
  for (const px of [80, 88, 104, 112]) g.box(X(px), 0, 0, X(px + 1) - 1, Y(G + 12), 1, concrete);
  // Cornice: stepped band with dentils.
  g.box(X(80), Y(G + 11.5), 0, X(113) - 1, Y(G + 12) - 1, 2, concrete);
  g.box(X(79.5), Y(G + 12), 0, X(113.5) - 1, Y(G + 12.5) - 1, 4, concrete);
  for (let x = X(80); x < X(113); x += 4) g.box(x, Y(G + 11.25), 0, x + 1, Y(G + 11.5) - 1, 3, concrete);
  // Window bars over the upstairs office windows (glass at x % 3 == 2 on z = 163).
  for (let wx = 81; wx <= 111; wx++) {
    if ((wx + wall.z1) % 3 !== 0) continue;
    for (let i = 1; i < 8; i += 2) g.box(X(wx) + i, Y(G + 9), 0, X(wx) + i, Y(G + 10) - 1, 0, vox(PAL.iron));
    g.box(X(wx) - 1, Y(G + 9) - 2, 0, X(wx + 1), Y(G + 9) - 1, 2, concrete); // sill
  }
  // Door surround, keystone and the canopy.
  g.box(X(93), 0, 0, X(93) + 5, Y(G + 4.5), 2, concrete);
  g.box(X(99) - 6, 0, 0, X(99) - 1, Y(G + 4.5), 2, concrete);
  g.box(X(93), Y(G + 4), 0, X(99) - 1, Y(G + 4.5), 2, concrete);
  g.box(X(95.5), Y(G + 4), 0, X(96.5), Y(G + 4.75), 3, dark);
  g.box(X(92), Y(G + 4.5), 0, X(100) - 1, Y(G + 4.5) + 3, 20, dark); // canopy slab
  g.box(X(92), Y(G + 4.5) + 4, 18, X(100) - 1, Y(G + 4.5) + 5, 20, concrete);
  d.solid(92, G + 4.5, face, 100, G + 4.5 + 4 * DV, face + 20 * DV);
  // The name plaque: two lines of raised letters.
  const plaque = vox(0x5c6068, { jitter: 0.04 });
  g.box(X(88.5), Y(G + 5.25), 0, X(103.5) - 1, Y(G + 8.75), 2, plaque);
  g.box(X(88.5) + 1, Y(G + 5.25) + 1, 3, X(103.5) - 2, Y(G + 5.25) + 1, 3, plaque);
  const brass = vox(0xd8b048, { jitter: 0.04, glass: true });
  letters(g, 'BLACKROCK', W / 2, Y(G + 7.1), 3, 3, 2, brass, false);
  letters(g, 'PENITENTIARY', W / 2, Y(G + 5.6), 3, 3, 2, brass, false);
  // Lanterns either side of the door.
  lantern(g, X(91.75), Y(G + 2.5), 0);
  lantern(g, X(100.25), Y(G + 2.5), 0);
  d.grid(g, fx0, G, face);

  // ---- Razor wire along the top of the outer wall, and the guard tower searchlight.
  wireRing(d, wall.x0, wall.z0, wall.x1, wall.z1, G + wall.h + 1);
  const sl = d.grid(searchlight(), 160.25, G + 17, 18.25);
  sl.rotation.y = Math.PI * 0.8;

  // ---- Roofs: coping, air handlers and vents on every block inside the walls.
  const roofs: [number, number, number, number, number][] = [
    [30, 70, 86, 120, G + 13], // cell block (skylight in the middle)
    [96, 72, 140, 96, G + 7], // cafeteria
    [96, 100, 116, 118, G + 7], // laundry
    [120, 100, 140, 118, G + 7], // showers
    [146, 70, 168, 118, G + 9], // death row
    [146, 122, 168, 138, G + 7 + 1], // solitary
    [80, 140, 112, 163, G + 13], // admin
  ];
  for (const [x0, z0, x1, z1, y] of roofs) coping(d, x0, z0, x1, z1, y, 0x6a6e75);
  d.piece(hvac, 36, G + 13, 76);
  d.piece(hvac, 36, G + 13, 112, Math.PI);
  d.piece(hvac, 78, G + 13, 94, Math.PI / 2);
  d.piece(hvac, 108, G + 7, 80);
  d.piece(hvac, 128, G + 7, 80);
  d.piece(hvac, 106, G + 7, 110, Math.PI / 2); // laundry exhaust
  d.piece(hvac, 158, G + 9, 90, Math.PI / 2);
  d.piece(hvac, 86, G + 13, 150);
  for (const [x, y, z] of [[40, G + 13, 95], [74, G + 13, 80], [74, G + 13, 108], [100, G + 7, 90], [136, G + 7, 90], [112, G + 7, 104], [124, G + 7, 104], [136, G + 7, 114], [150, G + 9, 76], [164, G + 9, 112], [150, G + 8, 130], [164, G + 8, 130], [106, G + 13, 146]])
    d.piece(vent, x + 0.4, y, z + 0.4);

  // ---- Across the road: bail bonds, a diner, the motel. Everyone here knows someone inside.
  const s = PRISON_STRIP;
  kit.row({
    x: s.x,
    z: s.z,
    y: G,
    face: 'n',
    length: s.length,
    depth: s.depth,
    preset: 'mainstreet',
    seed: 4471,
    floors: [1, 3],
    widths: [9, 15],
    signs: ['BAIL BONDS 24H', 'LAST MEAL DINER', 'LAW OFFICE', 'PAWN', 'FREEDOM MOTEL', 'LIQUOR', 'CHAPEL', 'TATTOO', 'VENDING', 'LAUNDRY'],
    spec: { ground: 'shop' },
  });
  kit.street({ x0: 0, z0: 177, x1: 192, z1: 179, y: G, kind: 'sidewalk', curb: ['n'] });
  kit.street({ x0: 92, z0: 164, x1: 101, z1: 169, y: G, kind: 'pavers' });

  // ---- Street furniture.
  for (let x = 6; x < 190; x += 14) {
    kit.prop('lamp', x, G, 169.6, 0);
    kit.prop('lamp', x + 7, G, 177.6, Math.PI);
  }
  for (const x of [91.5, 100.5]) kit.prop('bollard', x, G, 166);
  for (let x = 113; x < 162; x += 6) kit.prop('bollard', x, G, 168.6);
  kit.prop('bench', 99, G, 169.2, Math.PI);
  kit.prop('bench', 104, G, 169.2, Math.PI);
  kit.prop('bin', 106.5, G, 169.4);
  kit.prop('newsStand', 89.5, G, 169.4, Math.PI);
  kit.prop('signPost', 94.5, G, 169.6);
  kit.prop('hydrant', 60.5, G, 169.6);
  kit.prop('hydrant', 140.5, G, 177.4);
  kit.prop('mailbox', 30.5, G, 177.6, Math.PI);
  d.finish();
  return d;
}

// ------------------------------------------------------------------ asylum

const ASYLUM_VISITORS: Spec = { preset: 'euro', seed: 9187, x: 3, z: 160, y: G, face: 's', w: 22, d: 12, floors: 2, sign: 'VISITORS', ground: 'shop', roof: 'gable', wallStyle: 'stone', wall: PAL.stone, shutter: PAL.shutterForest, ivy: 0.6, flowerBoxes: 0.7 };
const ASYLUM_COTTAGES: Spec[] = [
  { preset: 'house', seed: 3301, x: 166, z: 162, y: G, face: 's', w: 11, d: 9, floors: 2, chimney: true, wall: PAL.sage },
  { preset: 'house', seed: 3302, x: 179, z: 162, y: G, face: 's', w: 11, d: 9, floors: 1, chimney: true, wall: PAL.cream },
];

/** Footprints (world x0, z0, x1, z1) of the asylum's kit buildings; trees stay off them. */
export const ASYLUM_LOTS: [number, number, number, number][] = [ASYLUM_VISITORS, ...ASYLUM_COTTAGES].map((s) => [s.x - 2, s.z - 2, s.x + s.w + 1, s.z + s.d + 3]);

export function asylumLots(w: VoxelWorld) {
  for (const s of [ASYLUM_VISITORS, ...ASYLUM_COTTAGES]) w.fill(s.x, G, s.z, s.x + s.w - 1, G, s.z + s.d - 1, B.Footprint);
}

export function asylumDecor(ctx: Pick<MapContext, 'scene' | 'physics'>, wall: { x0: number; z0: number; x1: number; z1: number; h: number }) {
  const d = new Decor(ctx);
  const { kit } = d;
  const white = speck(5, [vox(0xf4f0e6, { jitter: 0.04 }), vox(0xece6d8, { jitter: 0.04 })]);
  const green = vox(PAL.shutterForest, { jitter: 0.06 });
  const slate = speck(9, [vox(PAL.slate, { jitter: 0.1 }), vox(tint(PAL.slate, 0.85), { jitter: 0.1 })]);
  const iron = vox(PAL.iron, { jitter: 0.04 });

  // ---- Front (south, wall z = 150) and garden (north, wall z = 70) facades, x 50..142.
  for (const side of [
    { wallZ: 150, door: [91, 100] as [number, number] },
    { wallZ: 70, door: [93, 98] as [number, number] },
  ]) {
    const bx0 = 49.5, bx1 = 143.5;
    const flip = side.wallZ < 100; // the north face looks toward -z
    const W = Math.round((bx1 - bx0) * DPB), H = 16 * DPB, D = 6;
    const grid = new DetailGrid(W, H, D);
    // Layer 0 always touches the wall; on the north side that is the grid's far z.
    const g = { box: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: Parameters<DetailGrid['box']>[6]) => (flip ? grid.box(x0, y0, D - 1 - z1, x1, y1, D - 1 - z0, p) : grid.box(x0, y0, z0, x1, y1, z1, p)) };
    const X = (wx: number) => Math.round((wx - bx0) * DPB);
    const Y = (wy: number) => Math.round((wy - G) * DPB);
    // Plinth, string course at the floor line, cornice with dentils under the parapet.
    g.box(0, 0, 0, W - 1, Y(G + 0.75), 2, vox(0x9a9488, { jitter: 0.1 }));
    g.box(0, Y(G + 6.4), 0, W - 1, Y(G + 6.8), 2, white);
    g.box(0, Y(G + 13.4), 0, W - 1, Y(G + 13.9), 3, white);
    g.box(0, Y(G + 14.9), 0, W - 1, Y(G + 15.1), 2, white);
    for (let x = 2; x < W - 2; x += 5) g.box(x, Y(G + 13), 0, x + 2, Y(G + 13.4) - 1, 2, white);
    // Quoins up both corners.
    for (const cx of [X(50), X(143) - 8])
      for (let y = 0; y < Y(G + 13.4); y += 8) g.box(cx - (y % 16 ? 0 : 2), y, 0, cx + 8 + (y % 16 ? 0 : 2) - 1, y + 6, 1, vox(0xe6dfcf, { jitter: 0.06 }));
    // Window surrounds, sills, lintels and shutters (glass blocks at x % 4 == 2).
    for (const wy of [G + 2, G + 9])
      for (let wx = 51; wx <= 141; wx++) {
        if ((wx + side.wallZ) % 4 !== 0 || (wx >= side.door[0] && wx <= side.door[1] && wy === G + 2)) continue;
        const x0 = X(wx), y0 = Y(wy);
        g.box(x0 - 1, y0 - 1, 0, x0 + 8, y0 - 1, 1, white);
        g.box(x0 - 1, y0 + 8, 0, x0 + 8, y0 + 8, 1, white);
        g.box(x0 - 1, y0, 0, x0 - 1, y0 + 7, 1, white);
        g.box(x0 + 8, y0, 0, x0 + 8, y0 + 7, 1, white);
        g.box(x0 - 2, y0 - 3, 0, x0 + 9, y0 - 2, 3, white); // sill
        g.box(x0 - 2, y0 + 9, 0, x0 + 9, y0 + 11, 2, white); // lintel
        g.box(x0 + 3, y0 + 9, 3, x0 + 4, y0 + 11, 3, vox(0xd8d0bc)); // keystone
        g.box(x0 - 5, y0, 0, x0 - 2, y0 + 7, 1, green); // shutters
        g.box(x0 + 9, y0, 0, x0 + 12, y0 + 7, 1, green);
        if (wy === G + 2) for (let i = 1; i < 8; i += 2) g.box(x0 + i, y0, 0, x0 + i, y0 + 7, 0, iron); // ground-floor bars
      }
    d.grid(grid, bx0, G, flip ? side.wallZ - D * DV : side.wallZ + 1);
  }

  // ---- Portico over the front door (door x 94..97 at z 150).
  {
    const px0 = 90, px1 = 102, pz0 = 151, pz1 = 155;
    const W = (px1 - px0) * DPB, H = 9 * DPB, D = (pz1 - pz0) * DPB;
    const g = new DetailGrid(W, H, D);
    const colX = [91, 93.5, 98.5, 101];
    for (const cx of colX) {
      const gx = Math.round((cx - px0) * DPB);
      for (let y = 0; y < 5.5 * DPB; y++)
        for (let x = -4; x <= 4; x++)
          for (let z = -4; z <= 4; z++) {
            const r = Math.hypot(x, z);
            const base = y < 4 || (y > 5.5 * DPB - 4);
            if (r <= (base ? 4.2 : 3.2)) g.set(gx + x, y, D - 6 + z, vox(0xf4f0e6, { jitter: 0.04 }));
          }
      d.solid(cx - 0.45, G, pz1 - 0.75 - 0.45, cx + 0.45, G + 5.5, pz1 - 0.75 + 0.45);
    }
    // Entablature and floor.
    g.box(0, 5.5 * DPB, 0, W - 1, 6.5 * DPB - 1, D - 1, white);
    g.box(2, 0, 0, W - 3, 1, D - 1, vox(0xb8b0a0, { jitter: 0.06 }));
    // Pediment: a stepped triangle with the name in the frieze.
    for (let y = 0; y < 2.5 * DPB; y++) {
      const inset = Math.round(y * (W / 2) / (2.5 * DPB));
      g.box(inset, 6.5 * DPB + y, D - 4, W - 1 - inset, 6.5 * DPB + y, D - 1, white);
      g.box(inset, 6.5 * DPB + y, 0, W - 1 - inset, 6.5 * DPB + y, D - 5, slate);
    }
    const ink = vox(0x2f3a30, { jitter: 0.03 });
    for (let x = 0; x < W; x++) for (let y = 5.5 * DPB + 1; y < 6.5 * DPB - 1; y++) if (y === 5.5 * DPB + 1 || y === 6.5 * DPB - 2) g.set(x, y, D - 1, vox(0xd8d0bc));
    // Letters on the front face, read from +z.
    const tw = textWidth('PINECREST');
    rasterText('PINECREST', (px, py) => g.set(Math.round(W / 2 - tw / 2) + px, 5.5 * DPB + 2 + py, D - 1, ink));
    d.grid(g, px0, G, pz0);
    d.solid(px0, G + 5.5, pz0, px1, G + 6.5, pz1);
  }

  // ---- Clock tower on the roof above the entrance.
  {
    const tx0 = 92, tz0 = 142, tw = 8, td = 7;
    const W = tw * DPB, H = 15 * DPB, D = td * DPB;
    const g = new DetailGrid(W, H, D);
    const wallc = speck(13, [vox(0xc9d8c2, { jitter: 0.06 }), vox(0xbfcfb8, { jitter: 0.06 })]);
    // Base (6 blocks), belfry (4) with arches, pyramid roof (4) and a finial.
    g.box(4, 0, 4, W - 5, 6 * DPB - 1, D - 5, wallc);
    g.box(2, 6 * DPB - 4, 2, W - 3, 6 * DPB, D - 3, white);
    for (const cx of [4, W - 8]) for (const cz of [4, D - 8]) g.box(cx, 6 * DPB, cz, cx + 3, 10 * DPB - 1, cz + 3, white);
    g.box(2, 10 * DPB, 2, W - 3, 10 * DPB + 3, D - 3, white);
    // Bell.
    const bc = [W / 2, 7 * DPB, D / 2];
    for (let y = 0; y < 14; y++) {
      const r = 2 + y * 0.28;
      for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) if (Math.hypot(x, z) <= r) g.set(bc[0] + x, bc[1] + 14 - y, bc[2] + z, vox(0xc89a3a, { glass: true }));
    }
    for (let y = 0; y < 4 * DPB; y++) {
      const inset = 2 + Math.round((y / (4 * DPB)) * (Math.min(W, D) / 2 - 2));
      g.box(inset, 10 * DPB + 4 + y, inset, W - 1 - inset, 10 * DPB + 4 + y, D - 1 - inset, slate);
    }
    g.box(W / 2 - 1, 14 * DPB, D / 2 - 1, W / 2, H - 1, D / 2, vox(PAL.gold, { glass: true }));
    // Clock faces on the south (+z) and north sides.
    const cy = 3.5 * DPB;
    for (const zf of [D - 5, 4]) {
      const out = zf > D / 2 ? 1 : -1;
      for (let x = 0; x < W; x++)
        for (let y = 0; y < 6 * DPB; y++) {
          const r = Math.hypot(x - W / 2 + 0.5, y - cy);
          if (r <= 17) g.set(x, y, zf + out, r > 15.5 ? vox(PAL.gold, { glass: true }) : vox(0xfaf4e2, { emissive: true }));
          if (r < 15 && r > 13 && Math.abs(Math.atan2(y - cy, x - W / 2 + 0.5) % (Math.PI / 6)) < 0.09) g.set(x, y, zf + out * 2, iron);
        }
      // Hands stopped at 11:58.
      for (let i = 0; i < 12; i++) g.set(Math.round(W / 2 - i * 0.2), Math.round(cy + i), zf + out * 2, iron);
      for (let i = 0; i < 9; i++) g.set(Math.round(W / 2 - i * 0.5), Math.round(cy + i * 0.85), zf + out * 3, iron);
    }
    d.grid(g, tx0, G + 14, tz0);
    d.solid(tx0 + 0.5, G + 14, tz0 + 0.5, tx0 + tw - 0.5, G + 24, tz0 + td - 0.5);
  }

  // ---- Wrought-iron arch over the front gate (pillars at x 91 and 100, wall z 169..170).
  {
    const ax0 = 91, ax1 = 101, gz = wall.z1 - 1;
    const W = (ax1 - ax0) * DPB, H = 6 * DPB, D = 2 * DPB;
    const g = new DetailGrid(W, H, D);
    // Arch band.
    for (let x = 8; x < W - 8; x++) {
      const t = (x - W / 2) / (W / 2 - 8);
      const y = Math.round(2 * DPB + (1 - t * t) * 2 * DPB);
      g.box(x, y, 7, x, y + 1, 8, iron);
      g.box(x, Math.round(y * 0.45), 7, x, Math.round(y * 0.45), 8, iron);
      if (x % 6 === 0) g.box(x, Math.round(y * 0.45), 7, x, y, 8, iron); // pickets
    }
    // Lettering hung under the arch, read from the road (+z).
    const tw = textWidth('PINECREST');
    rasterText('PINECREST', (px, py) => g.box(Math.round(W / 2 - tw / 2) + px, Math.round(2.1 * DPB) + py, 7, Math.round(W / 2 - tw / 2) + px, Math.round(2.1 * DPB) + py, 8, vox(PAL.gold, { glass: true })));
    // Lamp globes on both pillar tops.
    for (const cx of [4, W - 5]) {
      g.box(cx - 1, 0, 6, cx + 1, 3, 9, iron);
      for (let x = -3; x <= 3; x++) for (let y = 0; y <= 6; y++) for (let z = -3; z <= 3; z++) if (Math.hypot(x, y - 3, z) <= 3.2) g.set(cx + x, 4 + y, 8 + z, vox(0xfff0c0, { emissive: true }));
    }
    d.grid(g, ax0, G + wall.h + 2 - 0.5, gz);
  }

  // ---- Roofline: chimneys along both wings, a coping lip, vents.
  coping(d, 50, 70, 142, 150, G + 15, 0xe6dfcf);
  for (const [x, z] of [[56, 74], [56, 146], [72, 74], [72, 146], [120, 74], [136, 146], [136, 74], [120, 146], [64, 110], [128, 110]]) d.piece(chimney, x, G + 14, z);
  for (const [x, z] of [[86, 80], [104, 140], [60, 128], [132, 96]]) d.piece(vent, x, G + 14, z);

  // ---- Visitors' center and the staff cottages outside the wall.
  kit.building(ASYLUM_VISITORS);
  for (const c of ASYLUM_COTTAGES) kit.building(c);

  // ---- Paving and street furniture.
  kit.street({ x0: 92, z0: 151, x1: 100, z1: 178, y: G, kind: 'pavers' });
  kit.street({ x0: 0, z0: 177, x1: 192, z1: 180, y: G, kind: 'sidewalk', curb: ['s'] });
  for (let z = 156; z < 177; z += 6) {
    kit.prop('lamp', 91, G, z, Math.PI / 2);
    kit.prop('lamp', 101, G, z, -Math.PI / 2);
  }
  kit.prop('pottedTree', 89.5, G, 153);
  kit.prop('pottedTree', 102.5, G, 153);
  for (let x = 8; x < 190; x += 16) kit.prop('lamp', x, G, 178.6, Math.PI);
  kit.prop('bench', 92, G, 176, Math.PI / 2);
  kit.prop('bin', 101.5, G, 176.5);
  kit.prop('signPost', 103.5, G, 178.4);
  for (const s of ASYLUM_COTTAGES) kit.prop('mailbox', s.x + 1.5, G, 177.2, Math.PI);
  // Garden (north of the building, inside the wall): benches and planters for the outdoor deaths' audience.
  for (let x = 44; x < 150; x += 18) {
    kit.prop('bench', x, G, 67.5, Math.PI);
    kit.prop('planter', x + 9, G, 67.6);
  }
  kit.prop('flowerPot', 62.5, G, 51);
  d.finish();
  return d;
}
