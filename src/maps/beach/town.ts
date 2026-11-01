import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from '../../physics';
import { hash3, mulberry32 } from '../../util';
import { StreetKit, buildBuilding, meshGrid, kitMaterial, vox, tint, isGlass, PAL, V, DV, FLOOR_H, type BuildingSpec, type DetailGrid } from '../../kit';
import { DECK, GL, type BeachLayout, type KitShop } from './world';

type Style = Partial<BuildingSpec> & { sign: string; inside?: number; floor?: [number, number]; extras?: (i: Interior) => void };

/** Seaside looks for each shop: pastel stucco on the boardwalk, brick and clapboard in town. */
const STYLE: Record<string, Style> = {
  steakhouse: { preset: 'mainstreet', wall: PAL.brickRed, awning: [0x7a1d1d, 0xf3ecd9], sign: "BIG AL'S STEAKS", inside: 0x6e4a2b, floor: [0x5a3a22, 0x6e4a2b] },
  urgentcare: { preset: 'modern', wall: 0xf3f1ec, trim: 0xd01818, sign: 'URGENT CARE +', inside: 0xf4f6f6, floor: [0xdfe6e6, 0xc9d3d3], awning: false },
  motel: { preset: 'euro', wall: 0xf4a38c, trim: PAL.trimWhite, balconies: 1, flowerBoxes: 0.8, roof: 'flat', sign: 'SEABREEZE MOTEL', awning: [0x2b9fb0, 0xf7f4ec], inside: 0xf2e6c8 },
  hardware: { preset: 'mainstreet', wall: 0x6a86b0, wallStyle: 'clapboard', sign: 'BARNACLE HARDWARE', awning: [0x1d2c4a, 0xf2d040], inside: 0xe8e0cc },
  lifeguardhq: { preset: 'modern', wall: 0xd8382e, trim: 0xf7f4ec, sign: 'LIFEGUARD HQ', awning: false, inside: 0xf7f4ec, floor: [0xd8382e, 0xf7f4ec] },
  surfshop: { preset: 'euro', wall: 0x58c2c8, trim: PAL.trimWhite, roof: 'flat', awning: [0xf2d040, 0x2b9fb0], ivy: 0, sign: "GNARLY PETE'S SURF", inside: 0xf6efd8, extras: surfboards },
  fryshack: { preset: 'euro', wall: 0xf2dc7a, trim: PAL.trimWhite, roof: 'flat', awning: [0xe0303a, 0xf7f4ec], ivy: 0, sign: 'FRY SHACK $12', inside: 0xfff4d6, floor: [0xe0303a, 0xf7f4ec] },
  scoops: { preset: 'euro', wall: 0xf6b8cc, trim: PAL.trimWhite, roof: 'flat', awning: [0xf06aa8, 0xf7f4ec], ivy: 0, sign: 'SCOOPS AHOY', inside: 0xfff0f4, floor: [0xf6b8cc, 0xf7f4ec] },
  tikibar: { preset: 'house', wall: 0x8a5a32, wallStyle: 'clapboard', roof: 'gable', roofColor: 0xc8a46a, shutter: null, awning: [0x3f8f35, 0xc8a46a], sign: 'THE DRUNKEN CLAM', signBoard: 0x2a1a0a, inside: 0x6e4a2b, floor: [0x5a3a22, 0x4a2f1c] },
  arcade: { preset: 'modern', wall: 0x2a2a3a, trim: 0xff3ec8, sign: 'NEON SHORES ARCADE', signBoard: 0x111122, awning: [0xff3ec8, 0x2a2a3a], inside: 0x1a1a2a, floor: [0x111122, 0x2a2a44], extras: arcade },
  giftshop: { preset: 'euro', wall: 0xf3efe6, trim: 0x35578f, shutter: 0x35578f, roof: 'flat', awning: [0x35578f, 0xf7f4ec], ivy: 0, sign: 'SHELL SHOCKED GIFTS', inside: 0xf6f2ea },
  snackbar: { preset: 'euro', wall: 0xa8dcb4, trim: PAL.trimWhite, roof: 'flat', awning: [0x3fae5a, 0xf7f4ec], ivy: 0, sign: 'SNACK ATTACK', inside: 0xf4fff4 },
  harbormaster: { preset: 'euro', wall: 0xf3efe6, trim: 0x35578f, shutter: 0x35578f, roof: 'gable', roofColor: 0x35578f, sign: 'HARBOR MASTER', awning: false, inside: 0xeae6dc },
  subs: { preset: 'mainstreet', wall: 0xf2dc7a, wallStyle: 'clapboard', sign: "DAVY'S DISCOUNT SUBS", signBoard: 0x2a2a2e, awning: [0x2a2a2e, 0xf2d040], inside: 0xd8d0b0 },
  charters: { preset: 'house', wall: 0x6a9ad0, roof: 'gableSide', roofColor: 0x9a4430, sign: 'REEL DEAL CHARTERS', awning: [0x1d2c4a, 0xf7f4ec], inside: 0xe8e0cc },
  ferry: { preset: 'euro', wall: 0xece0c0, trim: PAL.trimWhite, roof: 'flat', balconies: 0.3, sign: 'FERRY TERMINAL', awning: [0x2b6a6c, 0xf7f4ec], inside: 0xf2ecdc, floor: [0xb9b2a4, 0xd9ccb0] },
  workshop: { preset: 'mainstreet', wall: PAL.brickBrown, sign: 'HARBOR WORKSHOP', awning: false, inside: 0x9a948a, floor: [0x6e6a66, 0x5f5c58] },
  hangar: { preset: 'modern', wall: 0xa9b0b8, sign: 'SKYHOP SEAPLANES', awning: false, inside: 0xb8b4aa, floor: [0x85827c, 0x77746e] },
};

/** Ground-floor interior of a walk-in shop, in the shell's grid. Local x runs 0..W, z 0..D (front at 0). */
interface Interior {
  g: DetailGrid;
  /** Grid cell of local (0,0,0). */
  ox: number;
  oz: number;
  W: number;
  D: number;
  seed: number;
  /** Fill a local box given in world-block units (x along the facade, z into the shop). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: number | ((x: number, y: number, z: number) => number)): void;
}

const T = 3; // Wall thickness in detail voxels.
const DOOR_HALF = 0.8; // Half width of the doorway, in blocks.
const DOOR_TOP = 19; // Doorway height in voxels.
const CEIL = FLOOR_H - 3; // Highest hollow voxel row.

function surfboards(i: Interior) {
  const cols = [0xf06aa8, 0xf2d040, 0x2b9fb0, 0xe0303a, 0x3fae5a, 0xf7f4ec];
  const n = Math.floor((i.D / 8 - 6) / 0.7);
  for (let k = 0; k < n; k++) {
    const z = 1.2 + k * 0.7;
    const c = vox(cols[k % cols.length], { jitter: 0.03 });
    const stripe = vox(0xf7f4ec, { jitter: 0.02 });
    for (const side of [0, 1]) {
      const x = side ? i.W / 8 - 0.5 : 0.4;
      i.box(x, 0.1, z, x + 0.12, 2.2, z + 0.45, (_x, y) => (y % 9 === 4 ? stripe : c));
    }
  }
}

function arcade(i: Interior) {
  const glow = [0xff3ec8, 0x3ee8ff, 0xf2d040, 0x7aff5a];
  const n = Math.floor((i.W / 8 - 2) / 1.6);
  for (let k = 0; k < n; k++) {
    const x = 1 + k * 1.6;
    const body = vox(0x22222e, { jitter: 0.04 });
    const scr = vox(glow[k % glow.length], { emissive: true, jitter: 0 });
    // Two rows of cabinets: one down the middle, one by the front windows.
    for (const z of [3.2, 6.2]) {
      i.box(x, 0, z, x + 0.9, 2.1, z + 0.8, body);
      i.box(x + 0.1, 1.2, z - 0.01, x + 0.8, 1.8, z + 0.05, scr);
      i.box(x + 0.1, 2.0, z - 0.01, x + 0.8, 2.1, z + 0.1, vox(glow[(k + 1) % glow.length], { emissive: true }));
    }
  }
}

/**
 * The street-kit buildings for Sandy Shores: solid clapboard cottages, walk-in shops with
 * furnished ground floors, street props, paving and bunting. Colliders go into the map's
 * physics world; dispose() takes them out again.
 */
export class BeachTown {
  readonly kit: StreetKit;
  readonly group = new THREE.Group();
  private body: RAPIER.RigidBody;
  private meshes: THREE.Mesh[] = [];

  constructor(parent: THREE.Object3D, private physics: RAPIER.World, L: BeachLayout) {
    this.group.name = 'beach-town';
    parent.add(this.group);
    this.kit = new StreetKit({ parent: this.group, physics, lodDistances: [60, 140] });
    this.body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    for (const h of L.kit.houses) {
      this.kit.building({
        x: h.x0,
        z: h.z0,
        y: GL,
        face: h.face,
        w: h.wd,
        d: h.dp,
        floors: h.floors,
        preset: 'house',
        wall: h.wall,
        roofColor: h.roof,
        seed: h.seed,
        flowerBoxes: 0.6,
        chimney: false,
      });
    }
    for (const s of L.kit.shops) this.shop(s);

    for (const p of L.kit.paving) this.kit.street(p);
    // Paved frontage in front of the highway and harbor shops.
    for (const s of L.kit.shops) {
      if (s.y !== GL) continue;
      const z = s.face === 's' ? s.z0 + s.dp : s.z0 - 4;
      this.kit.street({ x0: s.x0 - 1, z0: z, x1: s.x0 + s.wd + 1, z1: z + 4, y: GL, kind: s.id === 'ferry' || s.id === 'harbormaster' ? 'plaza' : 'pavers' });
      const fz = s.face === 's' ? z + 3.3 : z + 0.7;
      this.kit.prop('planter', s.x0 + 0.8, GL, fz);
      this.kit.prop('planter', s.x0 + s.wd - 0.8, GL, fz);
    }
    for (const p of L.kit.props) this.kit.prop(p.kind, p.x, p.y, p.z, p.rotY);
    this.harborDressing(L);
    for (const [a, b] of L.kit.bunting) this.kit.bunting(a, b, { colors: [0xe0303a, 0xf7f4ec, 0x2f7ad0, 0xf2d040, 0x2b9fb0, 0xf06aa8] });
    // Bunting down the pier, post to post.
    for (let z = 212; z < 450; z += 18) {
      for (const x of [396.5, 404.5]) this.kit.bunting(new THREE.Vector3(x, DECK + 4, z), new THREE.Vector3(x, DECK + 4, z + 18), { sag: 0.7 });
    }
    for (let z = 212; z <= 450; z += 18) for (const x of [396.5, 404.5]) this.kit.prop('lamp', x, DECK, z, 0, { collide: false });
    this.kit.finish();
  }

  private harborDressing(L: BeachLayout) {
    const rng = mulberry32(77);
    // Crates and barrels along the quay, bollards at the dock heads.
    for (let x = 616; x < 760; x += 7 + Math.floor(rng() * 6)) {
      if (Math.abs(x - 632) < 4 || Math.abs(x - 663) < 4 || Math.abs(x - 694) < 4 || Math.abs(x - 743) < 4) continue;
      this.kit.prop(rng() < 0.5 ? 'crates' : 'barrel', x + 0.5, GL, 226 + rng() * 3, rng() * Math.PI);
    }
    for (const d of [L.harbor.subDock, L.harbor.charterDock, L.harbor.tourDock, L.harbor.ferryDock, L.harbor.seaplaneDock, L.harbor.tenderDock]) {
      this.kit.prop('bollard', d.x - 1.6, GL, d.z);
      this.kit.prop('bollard', d.x + 1.6, GL, d.z);
    }
    for (let x = 618; x < 760; x += 24) this.kit.prop('lamp', x + 0.5, GL, 222.5);
    this.kit.prop('newsStand', L.busStop.x + 4, GL, L.busStop.z - 1.5);
    this.kit.prop('bin', L.busStop.x - 6, GL, L.busStop.z - 1);
  }

  /** A walk-in shop: the kit's facade and upper floors, with a furnished hollow ground floor. */
  private shop(s: KitShop) {
    const st = STYLE[s.id] ?? { sign: s.id.toUpperCase() };
    const seed = Math.floor(hash3(s.x0, s.z0, 99) * 1e9);
    const spec: BuildingSpec = { roof: 'flat', ...st, w: s.wd, d: s.dp, floors: s.floors, ground: 'shop', doorAt: 0.5, seed, sign: st.sign, ivy: st.ivy ?? 0 };
    const built = buildBuilding(spec);
    const g = built.grid;
    const [ox, , oz] = built.origin;
    const W = Math.round(s.wd * 8), D = Math.round(s.dp * 8);
    // Local block x maps to grid x through the front face's mirror (u runs right to left).
    const gx = (lx: number) => ox + Math.round(lx * 8);
    const gz = (lz: number) => oz + Math.round(lz * 8);
    const I: Interior = {
      g, ox, oz, W, D, seed,
      box: (x0, y0, z0, x1, y1, z1, v) => g.box(gx(x0), Math.round(y0 * 8), gz(z0), gx(x1) - 1, Math.round(y1 * 8) - 1, gz(z1) - 1, v),
    };

    // Hollow the ground floor, leaving T-thick walls (the shop windows' glass stays in the front wall).
    g.clear(ox + T, 0, oz + T, ox + W - 1 - T, CEIL, oz + D - 1 - T);
    // Doorway, wider and taller than the kit's door so people fit through.
    const dmid = W / 2;
    g.clear(ox + Math.round(dmid - DOOR_HALF * 8), 0, oz - 3, ox + Math.round(dmid + DOOR_HALF * 8) - 1, DOOR_TOP, oz + T);
    // Door frame and an open door leaf swung inward.
    const frame = vox(tint(st.awning ? st.awning[0] : PAL.woodDark, 0.8), { jitter: 0.04 });
    const dl = ox + Math.round(dmid - DOOR_HALF * 8) - 1, dr = ox + Math.round(dmid + DOOR_HALF * 8);
    g.box(dl, 0, oz, dl, DOOR_TOP + 1, oz + T - 1, frame);
    g.box(dr, 0, oz, dr, DOOR_TOP + 1, oz + T - 1, frame);
    g.box(dl, DOOR_TOP + 1, oz, dr, DOOR_TOP + 1, oz + T - 1, frame);
    g.box(dl + 1, 1, oz + T, dl + 1, DOOR_TOP - 1, oz + T + 8, (_x, y) => (y > 8 && y < DOOR_TOP - 2 ? V.glass : V.woodDark));

    // Inside walls, ceiling and a tiled floor.
    const inner = vox(st.inside ?? 0xf2ecdc, { jitter: 0.04 });
    const ceil = vox(tint(st.inside ?? 0xf2ecdc, 1.05), { jitter: 0.02 });
    g.paint(ox + T - 1, 0, oz + T - 1, ox + W - T, CEIL, oz + D - T, (x, y, z) => (isGlass(g.get(x, y, z)) ? 0 : inner));
    g.box(ox + T, CEIL + 1, oz + T, ox + W - 1 - T, CEIL + 1, oz + D - 1 - T, ceil);
    const [fa, fb] = st.floor ?? [0xd9ccb0, 0xb9b2a4];
    const ta = vox(fa, { jitter: 0.05 }), tb = vox(fb, { jitter: 0.05 });
    g.box(ox + T, 0, oz + T, ox + W - 1 - T, 0, oz + D - 1 - T, (x, _y, z) => (((x >> 2) + (z >> 2)) & 1 ? ta : tb));
    // Skirting.
    const skirt = vox(tint(st.inside ?? 0xf2ecdc, 0.7), { jitter: 0.04 });
    g.box(ox + T, 1, oz + T, ox + W - 1 - T, 1, oz + T, skirt);
    g.box(ox + T, 1, oz + D - 1 - T, ox + W - 1 - T, 1, oz + D - 1 - T, skirt);
    // Ceiling lights.
    for (let lx = 2; lx < s.wd - 1; lx += 3)
      for (let lz = 2; lz < s.dp - 1; lz += 4) g.box(gx(lx) - 2, CEIL, gz(lz) - 1, gx(lx) + 2, CEIL, gz(lz) + 1, V.warmBulb);

    // The counter runs across the back with shelves of stock behind it (local z dp-4 .. dp-3).
    const wood = vox(PAL.woodLight, { jitter: 0.08 });
    const top = vox(tint(st.inside ?? 0xf2ecdc, 0.6), { jitter: 0.04 });
    I.box(2, 0, s.dp - 4, s.wd - 2, 1.0, s.dp - 3, wood);
    I.box(1.9, 1.0, s.dp - 4.1, s.wd - 1.9, 1.125, s.dp - 2.9, top);
    // Till.
    I.box(s.wd / 2 - 0.3, 1.125, s.dp - 3.7, s.wd / 2 + 0.3, 1.5, s.dp - 3.2, vox(0x3a3f46));
    const back = s.dp - T / 8;
    const rng = mulberry32(seed);
    const goods = [0xe0303a, 0xf2d040, 0x2f7ad0, 0x3fae5a, 0xf06aa8, 0xf7f4ec, 0xc8714f];
    for (const sy of [0.6, 1.3, 2.0]) {
      I.box(0.6, sy, back - 0.6, s.wd - 0.6, sy + 0.1, back, wood);
      for (let x = 0.7; x < s.wd - 0.8; x += 0.25 + rng() * 0.2) {
        if (rng() < 0.25) continue;
        const h = 0.25 + rng() * 0.35;
        I.box(x, sy + 0.1, back - 0.5, x + 0.2, sy + 0.1 + h, back - 0.1, vox(goods[Math.floor(rng() * goods.length)], { jitter: 0.1 }));
      }
    }
    st.extras?.(I);

    // Mesh it. Quarter turns keep everything axis-aligned.
    const m = StreetKit.placement({ x: s.x0, z: s.z0, y: s.y, face: s.face }, s.wd, s.dp);
    const mesh = new THREE.Mesh(meshGrid(g, { origin: built.origin }), kitMaterial(DV));
    mesh.applyMatrix4(m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.meshes.push(mesh);

    // Colliders: four walls with a doorway, the solid floors above, the counter, plus the kit's
    // balconies and gable roofs (its awning boxes are left out so they don't catch heads).
    const t = T * DV, fh = FLOOR_H * DV, ceilY = (CEIL + 1) * DV;
    const wallTop = built.wallTop;
    const local: [number, number, number, number, number, number][] = [
      [0, 0, 0, dmid / 8 - DOOR_HALF, fh, t],
      [dmid / 8 + DOOR_HALF, 0, 0, s.wd, fh, t],
      [dmid / 8 - DOOR_HALF, DOOR_TOP * DV + DV, 0, dmid / 8 + DOOR_HALF, fh, t],
      [0, 0, s.dp - t, s.wd, fh, s.dp],
      [0, 0, 0, t, fh, s.dp],
      [s.wd - t, 0, 0, s.wd, fh, s.dp],
      [0, ceilY, 0, s.wd, wallTop, s.dp],
      [2, 0, s.dp - 4, s.wd - 2, 1.125, s.dp - 3],
    ];
    for (const b of built.boxes.slice(1)) if (b.min[1] >= fh - 0.01) local.push([...b.min, ...b.max]);
    const a = new THREE.Vector3(), c = new THREE.Vector3();
    for (const [x0, y0, z0, x1, y1, z1] of local) {
      a.set(x0, y0, z0).applyMatrix4(m);
      c.set(x1, y1, z1).applyMatrix4(m);
      this.addBox(a.clone().min(c), a.clone().max(c));
    }
    for (const h of built.hulls) {
      const pts = new Float32Array(h.length);
      for (let i = 0; i < h.length; i += 3) {
        a.set(h[i], h[i + 1], h[i + 2]).applyMatrix4(m);
        pts[i] = a.x;
        pts[i + 1] = a.y;
        pts[i + 2] = a.z;
      }
      const cd = RAPIER.ColliderDesc.convexHull(pts);
      if (cd) this.physics.createCollider(cd.setFriction(0.9).setCollisionGroups(groups(G_WORLD, G_ALL)), this.body);
    }
  }

  private addBox(min: THREE.Vector3, max: THREE.Vector3) {
    const h = max.clone().sub(min).multiplyScalar(0.5);
    const c = min.clone().add(max).multiplyScalar(0.5);
    const cd = RAPIER.ColliderDesc.cuboid(Math.max(h.x, 0.01), Math.max(h.y, 0.01), Math.max(h.z, 0.01))
      .setTranslation(c.x, c.y, c.z)
      .setFriction(0.9)
      .setCollisionGroups(groups(G_WORLD, G_ALL));
    this.physics.createCollider(cd, this.body);
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of this.meshes) m.geometry.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.physics.removeRigidBody(this.body);
    // The kit keeps its colliders on one private fixed body.
    const kb = (this.kit as unknown as { body: RAPIER.RigidBody | null }).body;
    if (kb) this.physics.removeRigidBody(kb);
  }
}
