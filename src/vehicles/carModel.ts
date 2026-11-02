import * as THREE from 'three';
import { DetailGrid, DV, vox, kitMaterial, meshGrid } from '../kit';
import { pick, type Rng } from '../util';
import { HANDLING, type Handling } from './handling';

/**
 * Code-generated voxel vehicles. Every model is drawn into a DetailGrid at the building kit's
 * detail scale (8 voxels per block), greedy-meshed with baked AO and shaded by kitMaterial, so
 * cars sit in the same style as the kit buildings.
 *
 * Grid frame: +x is the driver's side (the car's left), +y up, +z forward, y = 0 is the road.
 * The grid has one spare column on each side for mirrors and wide bumpers.
 */

export type CarKind = 'sedan' | 'hatch' | 'taxi' | 'sport' | 'muscle' | 'jeep' | 'van' | 'pickup' | 'truck' | 'quad' | 'dirtbike';

export const CAR_KINDS: CarKind[] = ['sedan', 'hatch', 'taxi', 'sport', 'muscle', 'jeep', 'van', 'pickup', 'truck', 'quad', 'dirtbike'];

/** Physical layout of one kind, derived from its voxel design. Local frame: body origin, +z forward. */
export interface CarSpec {
  kind: CarKind;
  /** Collider half extents (the collider is centered on the body origin). */
  half: THREE.Vector3;
  /** Body origin height above the road when resting on its wheels. */
  ride: number;
  wheelR: number;
  /** Wheel mount points. The first two are the steered front wheels. */
  wheels: THREE.Vector3[];
  /** Suspension rest length. */
  rest: number;
  /** Driver's hip position. */
  seat: THREE.Vector3;
  /** Where someone stands when they get out of the driver's door. */
  doorOut: THREE.Vector3;
  /** Rider sits astride (quads and bikes) rather than in a seat. */
  straddle: boolean;
  handling: Handling;
}

export interface CarModel {
  root: THREE.Group;
  kind: CarKind;
  paint: number;
  spec: CarSpec;
  /** Steer pivots for every wheel (only the front two turn), spin pivots inside them. */
  wheelSteer: THREE.Group[];
  wheelSpin: THREE.Object3D[];
  door: THREE.Group;
  brakeLights: THREE.MeshLambertMaterial;
  /** Char the paint (blown up). */
  burn(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Colors

const TIRE = 0x1d1d20;
const RIM = 0xc4c8ce;
const HUB = 0x6d7178;
const DARK = 0x2a2b30;
const DARK2 = 0x3c3e44;
const GRILLE = 0x18191c;
const CHROME = 0xd8dbe0;
const HEAD = 0xfff3c4;
const AMBER = 0xf08a24;
const PLATE = 0xf0eee2;
const SEAT_C = 0x4a3f38;
const TAN = 0xc4ad85;
const CAGE = 0x4b4e55;
const WHITE = 0xf2f2ee;

const PAINTS = [0xd23c32, 0x2f66c8, 0x2f9a52, 0xe0b02c, 0xeeeeea, 0x2a2b2e, 0x7c46c8, 0xec7428, 0x24a8a8, 0x9aa3ad, 0x7a2626, 0x5f8a2a, 0x1e3f73];
const PAINTS_FOR: Partial<Record<CarKind, number[]>> = {
  sport: [0xd2201e, 0xf2c014, 0x1f5fd6, 0xf2f2ee, 0x1c1c20, 0xec6a14, 0x22b34a],
  muscle: [0xc8241e, 0x1e2a6e, 0x111114, 0xf0b81c, 0x2f7a3a, 0xe6e6e0, 0x6a2a8a],
  jeep: [0x3fae2c, 0xc9b27a, 0xb8261e, 0x2b2c2e, 0x5a6b34, 0xf08a1c, 0x2a7ab8],
  van: [0x4aa8e0, 0xd8402e, 0xe8b42c, 0x3a9a5a, 0xe87a8a, 0x8a6ac8],
  truck: [0x4a86d8, 0xd8402e, 0xf0c02c, 0xeeeeea, 0x3a9a5a],
  pickup: [0xb8261e, 0x2a5aa8, 0x8a8f96, 0x2b2c2e, 0x6a4a2a, 0xeeeeea, 0x2f7a3a],
  quad: [0xec7428, 0x3a8a3a, 0xc8302a, 0x2a6ab8, 0xd8b030],
  dirtbike: [0xe8541c, 0x2a8ad8, 0xe8c81c, 0x2fb04a, 0xd82a2a, 0xeeeeea],
};

const P = (c: number, j = 0.035) => vox(c, { jitter: j });
const G = (c: number) => vox(c, { glass: true, jitter: 0.02 });

// ---------------------------------------------------------------------------------------------
// Builder

interface Layer {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Draws into the body grid, plus separate glass and brake-light grids, in body coordinates. */
class Builder {
  readonly g: DetailGrid;
  readonly glass: DetailGrid;
  readonly brake: DetailGrid;
  constructor(readonly W: number, readonly L: number, H: number) {
    this.g = new DetailGrid(W + 2, H, L);
    this.glass = new DetailGrid(W + 2, H, L);
    this.brake = new DetailGrid(W + 2, H, L);
  }

  get(x: number, y: number, z: number) {
    return this.g.get(x + 1, y, z);
  }
  set(x: number, y: number, z: number, v: number) {
    this.g.set(x + 1, y, z, v);
    if (v) {
      this.glass.set(x + 1, y, z, 0);
      this.brake.set(x + 1, y, z, 0);
    }
  }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: number) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, v);
  }
  /** A box and its mirror across the car's center line. */
  sym(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: number) {
    this.box(x0, y0, z0, x1, y1, z1, v);
    this.box(this.W - 1 - x0, y0, z0, this.W - 1 - x1, y1, z1, v);
  }
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.box(x0, y0, z0, x1, y1, z1, 0);
  }
  /** Recolor solid cells only. */
  paint(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: number) {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) if (this.get(x, y, z)) this.set(x, y, z, v);
  }
  glassBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          this.g.set(x + 1, y, z, 0);
          this.glass.set(x + 1, y, z, G(0x1c2a36));
        }
  }
  brakeBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, sym = true) {
    const put = (a: number, b: number) => {
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          for (let x = Math.min(a, b); x <= Math.max(a, b); x++) {
            this.g.set(x + 1, y, z, 0);
            this.brake.set(x + 1, y, z, P(0xb01818));
          }
    };
    put(x0, x1);
    if (sym) put(this.W - 1 - x0, this.W - 1 - x1);
  }

  /** Fill layers y0..y1, each a rectangle given by fn (or skipped when it returns null). */
  layers(y0: number, y1: number, v: number, fn: (y: number) => Layer | null) {
    for (let y = y0; y <= y1; y++) {
      const l = fn(y);
      if (l) this.box(l.x0, y, l.z0, l.x1, y, l.z1, v);
    }
  }

  /**
   * A full-width slab with stepped (voxel-rounded) top edges: rTop steps the sides in near the
   * top, rFront/rBack step the nose and tail back, rBot tucks the bottom edge.
   */
  slab(z0: number, z1: number, y0: number, y1: number, v: number, o: { inset?: number; rTop?: number; rFront?: number; rBack?: number; rBot?: number; rBotZ?: number } = {}) {
    const ins = o.inset ?? 0;
    this.layers(y0, y1, v, (y) => {
      const d = y1 - y;
      const b = y - y0;
      const xi = ins + Math.max(0, (o.rTop ?? 0) - d) + Math.max(0, (o.rBot ?? 0) - b);
      const bz = Math.max(0, (o.rBotZ ?? 0) - b);
      return { x0: xi, x1: this.W - 1 - xi, z0: z0 + Math.max(0, (o.rBack ?? 0) - d) + bz, z1: z1 - Math.max(0, (o.rFront ?? 0) - d) - bz };
    });
  }

  /**
   * Hollow greenhouse: layers y0..y1 shrink from the base rectangle to the top one (raked
   * windshield and rear window, tumblehome). Shell cells become glass except pillars, the sill
   * row and the roof, which take `v`. `pillars` are extra side pillar z positions (B pillar...).
   */
  cabin(
    y0: number,
    y1: number,
    base: { zb: number; zf: number; inset: number },
    top: { zb: number; zf: number; inset: number },
    v: number,
    o: { pillars?: number[]; aW?: number; cW?: number; roof?: number; open?: boolean } = {},
  ) {
    const W = this.W;
    const at = (y: number) => {
      const t = y1 === y0 ? 1 : (y - y0) / (y1 - y0);
      const ins = Math.round(base.inset + (top.inset - base.inset) * t);
      return { xa: ins, xb: W - 1 - ins, zb: Math.round(base.zb + (top.zb - base.zb) * t), zf: Math.round(base.zf + (top.zf - base.zf) * t) };
    };
    const aW = o.aW ?? 2;
    const cW = o.cW ?? 2;
    const roof = o.roof ?? v;
    for (let y = y0; y <= y1; y++) {
      const L = at(y);
      const A = y < y1 ? at(y + 1) : L;
      for (let z = L.zb; z <= L.zf; z++)
        for (let x = L.xa; x <= L.xb; x++) {
          if (y === y1) {
            this.set(x, y, z, roof);
            continue;
          }
          const front = z >= A.zf, rear = z <= A.zb, side = x <= A.xa || x >= A.xb;
          if (!front && !rear && !side) continue;
          let isGlass = y > y0;
          if (front && (x - L.xa < aW || L.xb - x < aW)) isGlass = false;
          if (rear && (x - L.xa < cW || L.xb - x < cW)) isGlass = false;
          if (side && !front && !rear) {
            if (z >= L.zf - 1 || z <= L.zb + 1) isGlass = false;
            for (const p of o.pillars ?? []) if (z === p || z === p + 1) isGlass = false;
          }
          if (front && side) isGlass = false;
          if (rear && side) isGlass = false;
          if (isGlass) this.glassBox(x, y, z, x, y, z);
          else this.set(x, y, z, v);
        }
    }
  }

  /** Frontmost solid cell in each (x, y) column of the box gets `v`. */
  front(x0: number, x1: number, y0: number, y1: number, v: number, symm = true, brake = false) {
    const put = (x: number, y: number) => {
      for (let z = this.L - 1; z >= 0; z--)
        if (this.get(x, y, z)) {
          if (brake) this.brakeBox(x, y, z, x, y, z, false);
          else this.set(x, y, z, v);
          return;
        }
    };
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        put(x, y);
        if (symm && this.W - 1 - x !== x) put(this.W - 1 - x, y);
      }
  }
  /** Rearmost solid cell in each column. */
  rear(x0: number, x1: number, y0: number, y1: number, v: number, symm = true, brake = false) {
    const put = (x: number, y: number) => {
      for (let z = 0; z < this.L; z++)
        if (this.get(x, y, z)) {
          if (brake) this.brakeBox(x, y, z, x, y, z, false);
          else this.set(x, y, z, v);
          return;
        }
    };
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        put(x, y);
        if (symm && this.W - 1 - x !== x) put(this.W - 1 - x, y);
      }
  }
  /** Outermost solid cell on both sides, for each (y, z). */
  side(z0: number, z1: number, y0: number, y1: number, v: number | ((y: number, z: number) => number)) {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        const c = typeof v === 'number' ? v : v(y, z);
        if (!c) continue;
        for (let x = 0; x < this.W / 2; x++)
          if (this.get(x, y, z)) {
            this.set(x, y, z, c);
            break;
          }
        for (let x = this.W - 1; x >= this.W / 2; x--)
          if (this.get(x, y, z)) {
            this.set(x, y, z, c);
            break;
          }
      }
  }
  /** Topmost solid body cell in each (x, z) column gets `v` (racing stripes over hood, roof, deck). */
  stripe(x0: number, x1: number, z0: number, z1: number, v: number) {
    for (let z = z0; z <= z1; z++)
      for (const x of [...range(x0, x1), ...range(this.W - 1 - x1, this.W - 1 - x0)]) {
        for (let y = this.g.sy - 1; y >= 0; y--) {
          if (this.glass.get(x + 1, y, z)) break;
          if (this.get(x, y, z)) {
            this.set(x, y, z, v);
            break;
          }
        }
      }
  }

  /** Wheel arches: clear a disc around each wheel on both sides and darken the well. */
  arches(axles: number[], R: number, tw: number, flare = 0, flareColor = DARK) {
    const W = this.W;
    for (const az of axles) {
      for (let y = 0; y <= 2 * R + 2; y++)
        for (let z = az - R - 3; z <= az + R + 2; z++) {
          const d2 = (y + 0.5 - R) ** 2 + (z + 0.5 - az) ** 2;
          if (d2 <= (R + 1) ** 2) {
            for (let x = 0; x <= tw; x++) {
              this.clear(x, y, z, x, y, z);
              this.clear(W - 1 - x, y, z, W - 1 - x, y, z);
            }
            this.paint(tw + 1, y, z, tw + 1, y, z, P(GRILLE));
            this.paint(W - 2 - tw, y, z, W - 2 - tw, y, z, P(GRILLE));
          } else if (flare && d2 <= (R + 1 + flare) ** 2 && y >= R - 1) {
            for (let x = 0; x <= tw; x++) {
              this.set(x, y, z, P(flareColor));
              this.set(W - 1 - x, y, z, P(flareColor));
            }
          }
        }
    }
  }

  /** Driver seat with back and headrest, and a steering wheel ahead of it. */
  seat(x0: number, x1: number, y: number, zBack: number, zWheel: number, color = SEAT_C, both = true) {
    const put = (a: number, b: number) => {
      this.box(a, y, zBack, b, y + 1, zBack + 4, P(color));
      this.box(a, y + 2, zBack, b, y + 6, zBack + 1, P(color));
    };
    put(x0, x1);
    if (both) put(this.W - 1 - x1, this.W - 1 - x0);
    if (zWheel > 0) {
      const cx = Math.round((x0 + x1) / 2);
      this.box(cx - 1, y + 4, zWheel, cx + 1, y + 5, zWheel, P(DARK));
      this.box(cx, y + 3, zWheel + 1, cx, y + 3, zWheel + 2, P(DARK));
    }
  }
}

function range(a: number, b: number) {
  const r: number[] = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) r.push(i);
  return r;
}

// ---------------------------------------------------------------------------------------------
// Designs

interface Design {
  W: number;
  L: number;
  H: number;
  /** Wheel radius and tire width, in voxels. */
  R: number;
  tw: number;
  /** Axle z positions (cell boundaries); the first is the steered axle. */
  axles: number[];
  /** Wheels stick out past the body by this many voxels. */
  wheelOut?: number;
  /** Collider bottom and top, in voxels above the road. */
  sill: number;
  top: number;
  /** Driver hip height and position (voxels). */
  seatY: number;
  seatZ: number;
  /** Driver's distance from the center line, in voxels. Default 4.5. */
  seatX?: number;
  /** Driver door box on the +x side (voxels, inclusive). */
  door: { z0: number; z1: number; y0: number; y1: number; depth?: number };
  /** Rider sits astride on top. */
  straddle?: boolean;
  /** Skip cutting wheel arches (bikes draw around their wheels). */
  noArches?: boolean;
  /** Only draw the first wheel of each axle, on the center line (bikes balance on outrigger rays). */
  centerWheels?: boolean;
  draw(b: Builder, paint: number, rng: Rng): void;
  /** Extra static meshes (spare tire...). */
  extras?(root: THREE.Group, d: Design, origin: THREE.Vector3): void;
}

/** Shared front/rear details for the car-shaped kinds. */
function carEnds(b: Builder, o: { headY: number; tailY: number; bumperY: number; grille: [number, number, number, number]; bumper?: number; plate?: boolean }) {
  const W = b.W;
  const bumper = o.bumper ?? DARK2;
  b.front(1, 4, o.headY, o.headY + 1, G(HEAD));
  b.front(1, 2, o.headY - 1, o.headY - 1, P(AMBER));
  const [gx0, gy0, gx1, gy1] = o.grille;
  for (let y = gy0; y <= gy1; y++) b.front(gx0, gx1, y, y, P((y - gy0) % 2 ? DARK : GRILLE), false);
  b.rear(1, 4, o.tailY, o.tailY + 1, 0, true, true);
  b.rear(1, 2, o.tailY - 1, o.tailY - 1, P(AMBER));
  if (o.plate !== false) b.rear(W / 2 - 2, W / 2 + 1, o.bumperY + 2, o.bumperY + 3, P(PLATE), false);
  b.box(0, o.bumperY, b.L - 1, W - 1, o.bumperY + 1, b.L - 1, P(bumper));
  b.box(0, o.bumperY, 0, W - 1, o.bumperY + 1, 0, P(bumper));
}

const sedanLike = (taxi: boolean): Design => ({
  W: 20,
  L: 42,
  H: 23,
  R: 4,
  tw: 3,
  axles: [33, 9],
  sill: 3,
  top: 18,
  seatY: 8,
  seatZ: 19,
  seatX: 4,
  door: { z0: 16, z1: 27, y0: 4, y1: 17 },
  draw(b, paint) {
    const p = P(paint);
    b.slab(1, 40, 3, 10, p, { rTop: 1, rFront: 2, rBack: 1, rBot: 1 });
    b.box(5, 11, 31, 14, 11, 38, p); // hood panel
    b.cabin(11, 18, { zb: 11, zf: 29, inset: 1 }, { zb: 14, zf: 24, inset: 2 }, p, { pillars: [20] });
    b.side(4, 37, 3, 3, P(DARK)); // skirts
    b.seat(12, 15, 9, 15, 23);
    b.box(2, 11, 25, 17, 11, 28, P(DARK)); // dash
    b.sym(-1, 12, 27, 0, 12, 28, p); // mirrors
    b.box(b.W - 1, 9, 22, b.W - 1, 9, 23, P(DARK)); // door handle
    carEnds(b, { headY: 7, tailY: 7, bumperY: 3, grille: [6, 5, 13, 8], bumper: taxi ? 0x1f5a3a : DARK2 });
    if (taxi) {
      b.side(2, 39, 8, 9, (y, z) => P((z + y) % 2 ? 0x141414 : WHITE));
      b.box(7, 19, 17, 12, 20, 20, vox(0xfff6d0, { emissive: true }));
      b.box(6, 19, 17, 6, 19, 20, P(DARK));
      b.box(13, 19, 17, 13, 19, 20, P(DARK));
    }
  },
});

const DESIGNS: Record<CarKind, Design> = {
  sedan: sedanLike(false),
  taxi: sedanLike(true),

  hatch: {
    W: 20,
    L: 36,
    H: 22,
    R: 4,
    tw: 3,
    axles: [28, 8],
    sill: 3,
    top: 18,
    seatY: 8,
    seatZ: 15,
    seatX: 4,
    door: { z0: 12, z1: 22, y0: 4, y1: 17 },
    draw(b, paint) {
      const p = P(paint);
      b.slab(1, 34, 3, 10, p, { rTop: 2, rFront: 3, rBack: 1, rBot: 1 });
      b.cabin(11, 18, { zb: 2, zf: 24, inset: 1 }, { zb: 3, zf: 19, inset: 3 }, p, { pillars: [14], cW: 3 });
      b.stripe(2, 2, 2, 33, P(WHITE));
      b.side(3, 31, 3, 3, P(DARK));
      b.seat(12, 15, 9, 11, 19);
      b.box(2, 11, 20, 17, 11, 23, P(DARK));
      b.sym(-1, 12, 22, 0, 12, 23, p);
      b.box(b.W - 1, 9, 17, b.W - 1, 9, 18, P(DARK));
      carEnds(b, { headY: 7, tailY: 8, bumperY: 3, grille: [6, 5, 13, 7] });
    },
  },

  sport: {
    W: 22,
    L: 44,
    H: 18,
    R: 4,
    tw: 4,
    axles: [35, 9],
    sill: 2,
    top: 14,
    seatY: 5,
    seatZ: 19,
    door: { z0: 17, z1: 28, y0: 3, y1: 13 },
    draw(b, paint) {
      const p = P(paint, 0.025);
      b.slab(1, 43, 2, 8, p, { rTop: 1, rFront: 4, rBack: 1, rBot: 1, rBotZ: 1 });
      // Rear haunches over the back wheels.
      b.sym(0, 9, 3, 4, 9, 16, p);
      b.sym(1, 10, 5, 3, 10, 14, p);
      b.cabin(9, 14, { zb: 10, zf: 30, inset: 2 }, { zb: 17, zf: 23, inset: 4 }, p, { pillars: [] });
      // Wing.
      b.sym(5, 9, 1, 5, 11, 2, P(DARK));
      b.box(0, 12, 0, b.W - 1, 12, 3, p);
      b.sym(0, 10, 0, 0, 13, 3, p);
      b.box(9, 9, 31, 12, 9, 35, P(DARK)); // hood scoop
      b.box(10, 9, 36, 11, 9, 36, P(GRILLE));
      b.stripe(7, 8, 0, 43, P(WHITE));
      b.side(25, 29, 5, 6, (y, z) => P((z % 2) ? GRILLE : DARK)); // side vents
      b.side(4, 39, 2, 2, P(DARK));
      b.box(0, 2, 43, b.W - 1, 2, 43, P(DARK)); // splitter
      b.seat(13, 17, 5, 15, 23, 0x1a1a1c);
      b.sym(-1, 9, 28, 1, 9, 29, p);
      b.front(2, 5, 5, 5, G(HEAD));
      b.front(6, 15, 3, 4, P(GRILLE), false);
      b.rear(1, 5, 6, 6, 0, true, true);
      b.rear(8, 13, 3, 3, P(CHROME), false);
      b.box(0, 2, 0, b.W - 1, 2, 0, P(DARK));
    },
  },

  muscle: {
    W: 22,
    L: 46,
    H: 20,
    R: 4,
    tw: 4,
    axles: [37, 10],
    sill: 3,
    top: 16,
    seatY: 7,
    seatZ: 18,
    door: { z0: 14, z1: 26, y0: 4, y1: 15 },
    draw(b, paint) {
      const p = P(paint, 0.03);
      b.slab(1, 44, 3, 10, p, { rTop: 1, rFront: 1, rBack: 1, rBot: 1 });
      b.cabin(11, 16, { zb: 10, zf: 27, inset: 1 }, { zb: 13, zf: 23, inset: 3 }, p, { pillars: [] });
      b.box(7, 11, 29, 14, 11, 42, p); // power dome
      b.box(9, 12, 33, 12, 12, 37, P(DARK)); // scoop
      b.box(10, 12, 38, 11, 12, 38, P(GRILLE));
      b.box(0, 11, 1, b.W - 1, 11, 3, p); // duck tail
      b.stripe(8, 9, 0, 45, P(paint === 0x111114 ? 0xd8a020 : 0x141414));
      b.side(4, 41, 3, 3, P(CHROME));
      b.seat(13, 17, 8, 14, 22);
      b.sym(-1, 12, 25, 0, 12, 26, P(CHROME));
      carEnds(b, { headY: 7, tailY: 7, bumperY: 3, grille: [5, 5, 16, 8], bumper: CHROME });
      b.front(2, 3, 7, 8, G(HEAD)); // round-ish twin lamps
      b.rear(4, 5, 2, 2, P(CHROME)); // exhaust tips
      b.rear(4, 4, 2, 2, P(GRILLE));
    },
  },

  jeep: {
    W: 22,
    L: 38,
    H: 27,
    R: 6,
    tw: 4,
    axles: [30, 8],
    wheelOut: 1,
    sill: 7,
    top: 21,
    seatY: 11,
    seatZ: 15,
    door: { z0: 15, z1: 22, y0: 8, y1: 14 },
    draw(b, paint) {
      const p = P(paint);
      const W = b.W;
      b.slab(1, 36, 7, 14, p, { rTop: 1, rFront: 1 });
      b.box(3, 15, 25, 18, 15, 35, p); // hood
      // Open tub.
      b.clear(2, 9, 3, W - 3, 14, 22);
      b.box(2, 8, 3, W - 3, 8, 22, P(DARK2));
      b.seat(13, 17, 9, 15, 21, TAN);
      b.box(4, 9, 4, W - 5, 10, 8, P(TAN)); // rear bench
      b.box(4, 11, 3, W - 5, 14, 3, P(TAN));
      b.box(2, 13, 21, W - 3, 13, 22, P(DARK)); // dash
      // Windshield in a frame.
      b.box(1, 15, 23, W - 2, 15, 23, p);
      b.box(1, 21, 23, W - 2, 21, 23, p);
      b.box(1, 16, 23, 1, 20, 23, p);
      b.box(W - 2, 16, 23, W - 2, 20, 23, p);
      b.glassBox(2, 16, 23, W - 3, 20, 23);
      // Roll cage.
      const c = P(CAGE, 0.05);
      b.sym(1, 15, 4, 1, 24, 4, c);
      b.sym(1, 22, 22, 1, 24, 22, c);
      b.sym(1, 24, 4, 1, 24, 22, c);
      b.box(1, 24, 4, W - 2, 24, 4, c);
      b.box(1, 24, 13, W - 2, 24, 13, c);
      b.box(1, 24, 22, W - 2, 24, 22, c);
      b.box(1, 22, 22, 1, 22, 23, c);
      b.box(W - 2, 22, 22, W - 2, 22, 23, c);
      // Two-tone flash on the rear quarters.
      b.side(1, 12, 9, 13, (y, z) => (z < 6 + (13 - y) || (y === 11 && z < 12) ? P(WHITE) : 0));
      // Face: slotted grille, square lamps, big bumper and a winch.
      for (let y = 9; y <= 13; y++) b.front(6, 15, y, y, P(y % 2 ? GRILLE : paint), false);
      b.front(2, 4, 11, 13, G(HEAD));
      b.front(2, 3, 9, 9, P(AMBER));
      b.box(-1, 6, 37, W, 8, 37, P(DARK2));
      b.box(8, 8, 36, 13, 9, 37, P(DARK));
      b.rear(1, 2, 10, 12, 0, true, true);
      b.box(1, 6, 0, W - 2, 7, 0, P(DARK2));
      b.sym(-1, 18, 23, -1, 19, 23, P(CAGE));
    },
    extras(root, d, origin) {
      // Spare tire on the tailgate.
      const geo = wheelGeometry(d.R - 1, 3);
      const m = new THREE.Mesh(geo, kitMaterial(DV));
      m.rotation.y = Math.PI / 2;
      m.position.set(0, (11 - origin.y) * DV + (d.R - 1) * DV, (-origin.z - 1.5) * DV);
      m.castShadow = true;
      root.add(m);
    },
  },

  van: {
    W: 22,
    L: 44,
    H: 27,
    R: 4,
    tw: 3,
    axles: [35, 8],
    sill: 3,
    top: 24,
    seatY: 11,
    seatZ: 31,
    door: { z0: 30, z1: 40, y0: 4, y1: 22, depth: 2 },
    draw(b, paint) {
      const p = P(paint);
      const W = b.W;
      b.slab(1, 42, 3, 12, p, { rTop: 0, rFront: 1, rBack: 1, rBot: 1 });
      b.cabin(13, 24, { zb: 1, zf: 42, inset: 0 }, { zb: 2, zf: 40, inset: 1 }, P(WHITE), { pillars: [8, 15, 22, 29], aW: 2, roof: P(WHITE) });
      // V-shaped two-tone nose.
      for (let x = 0; x < W; x++) {
        const dx = Math.abs(x - (W - 1) / 2);
        const yTop = 12 + Math.max(0, 5 - Math.round(dx * 0.6));
        b.front(x, x, 13, yTop, p, false);
      }
      b.box(9, 9, 43, 12, 10, 43, P(CHROME)); // badge
      b.front(2, 4, 8, 10, G(HEAD));
      b.front(1, 2, 6, 6, P(AMBER));
      b.box(0, 3, 43, W - 1, 4, 43, P(CHROME));
      b.box(0, 3, 0, W - 1, 4, 0, P(CHROME));
      b.rear(1, 2, 7, 11, 0, true, true);
      b.rear(W / 2 - 2, W / 2 + 1, 6, 7, P(PLATE), false);
      b.side(3, 40, 3, 3, P(DARK));
      b.side(2, 41, 12, 12, P(WHITE));
      b.seat(13, 17, 12, 27, 35);
      b.box(1, 12, 36, W - 2, 14, 40, P(DARK)); // dash
      b.sym(-1, 15, 39, -1, 17, 40, P(DARK));
      // Roof rack.
      b.box(3, 25, 6, W - 4, 25, 6, P(DARK));
      b.box(3, 25, 30, W - 4, 25, 30, P(DARK));
      b.sym(3, 25, 6, 3, 25, 30, P(DARK));
    },
  },

  pickup: {
    W: 22,
    L: 48,
    H: 23,
    R: 5,
    tw: 4,
    axles: [39, 10],
    sill: 4,
    top: 21,
    seatY: 10,
    seatZ: 26,
    door: { z0: 23, z1: 32, y0: 5, y1: 20 },
    draw(b, paint) {
      const p = P(paint);
      const W = b.W;
      b.slab(1, 46, 4, 12, p, { rTop: 1, rFront: 1, rBack: 0, rBot: 1 });
      b.cabin(13, 21, { zb: 21, zf: 34, inset: 1 }, { zb: 22, zf: 30, inset: 2 }, p, { pillars: [], cW: 3 });
      // Bed.
      b.sym(0, 13, 1, 1, 15, 20, p);
      b.box(0, 13, 1, W - 1, 15, 2, p);
      b.box(0, 13, 19, W - 1, 14, 20, p);
      b.box(2, 12, 3, W - 3, 12, 18, P(DARK2));
      b.box(4, 13, 22, W - 5, 13, 22, P(DARK2));
      b.box(3, 13, 35, W - 4, 13, 44, p); // hood
      b.seat(13, 17, 11, 22, 30);
      b.box(2, 13, 31, W - 3, 14, 33, P(DARK));
      b.sym(-1, 15, 32, 0, 16, 33, P(CHROME));
      carEnds(b, { headY: 10, tailY: 9, bumperY: 4, grille: [5, 6, 16, 10], bumper: CHROME });
      b.front(6, 15, 7, 7, P(CHROME), false);
      b.side(4, 43, 4, 4, P(DARK));
      b.rear(2, 3, 13, 14, 0, true, true);
    },
  },

  quad: {
    W: 18,
    L: 26,
    H: 17,
    R: 4,
    tw: 4,
    axles: [20, 5],
    wheelOut: 1,
    sill: 4,
    top: 13,
    seatY: 10,
    seatZ: 10,
    seatX: 0,
    straddle: true,
    door: { z0: 0, z1: 0, y0: 0, y1: -1 },
    draw(b, paint) {
      const p = P(paint, 0.03);
      const W = b.W;
      const c = P(CAGE, 0.05);
      // Frame and engine.
      b.box(4, 4, 2, W - 5, 6, 23, P(DARK));
      b.box(5, 5, 8, W - 6, 8, 15, P(DARK2));
      // Plastic body: fenders over each axle joined by footrests.
      b.box(0, 8, 14, W - 1, 9, 25, p);
      b.box(0, 8, 0, W - 1, 9, 11, p);
      b.box(1, 7, 11, 4, 7, 14, P(DARK));
      b.box(W - 5, 7, 11, W - 2, 7, 14, P(DARK));
      b.box(4, 10, 16, W - 5, 11, 22, p); // nose
      b.box(5, 10, 13, W - 6, 11, 16, p); // tank
      b.box(6, 10, 5, W - 7, 11, 13, P(0x1a1a1c)); // seat
      // Racks.
      b.box(1, 10, 22, W - 2, 10, 25, c);
      b.box(1, 10, 0, W - 2, 10, 4, c);
      b.box(1, 11, 25, W - 2, 11, 25, c);
      b.box(1, 11, 0, W - 2, 11, 0, c);
      // Handlebars.
      b.box(8, 12, 17, 9, 13, 17, P(DARK));
      b.box(3, 14, 16, W - 4, 14, 16, P(DARK));
      b.box(3, 14, 15, 4, 14, 16, P(0x1a1a1c));
      b.box(W - 5, 14, 15, W - 4, 14, 16, P(0x1a1a1c));
      b.front(5, 7, 10, 10, G(HEAD));
      b.rear(6, 7, 8, 8, 0, true, true);
      b.side(15, 24, 9, 9, P(WHITE));
    },
  },

  dirtbike: {
    W: 6,
    L: 24,
    H: 17,
    R: 5,
    tw: 2,
    axles: [18, 5],
    sill: 6,
    top: 14,
    seatY: 11,
    seatZ: 9,
    seatX: 0,
    straddle: true,
    noArches: true,
    centerWheels: true,
    door: { z0: 0, z1: 0, y0: 0, y1: -1 },
    draw(b, paint) {
      const p = P(paint, 0.03);
      const blk = P(0x1a1a1c);
      // Frame, engine and swingarm.
      b.box(2, 4, 10, 3, 12, 12, P(DARK));
      b.box(1, 3, 10, 4, 8, 13, P(DARK2));
      b.box(2, 3, 11, 3, 3, 13, P(CHROME));
      b.sym(1, 5, 6, 1, 5, 10, P(DARK));
      // Forks from the front axle up to the bars, raked back.
      for (let y = 5; y <= 13; y++) {
        const z = 18 - Math.round((y - 5) * 0.4);
        b.sym(1, y, z, 1, y, z, P(y < 9 ? CHROME : DARK));
      }
      b.box(-1, 14, 14, 6, 14, 14, P(DARK)); // bars
      b.box(-1, 14, 13, 0, 14, 14, blk);
      b.box(5, 14, 13, 6, 14, 14, blk);
      // Tank, seat, fenders, plates.
      b.box(1, 11, 11, 4, 13, 14, p);
      b.box(1, 11, 3, 4, 12, 10, blk);
      b.box(2, 11, 0, 3, 11, 3, p); // rear fender
      b.box(2, 12, 15, 3, 12, 22, p); // front fender
      b.box(1, 12, 16, 4, 14, 16, P(WHITE)); // number plate
      b.front(2, 2, 13, 13, G(HEAD));
      b.sym(0, 9, 4, 0, 11, 8, P(WHITE)); // side plates
      b.box(5, 7, 3, 5, 8, 10, P(CHROME)); // exhaust
      b.brakeBox(2, 11, 0, 2, 11, 0);
    },
  },

  truck: {
    W: 24,
    L: 62,
    H: 34,
    R: 6,
    tw: 5,
    axles: [52, 20, 8],
    sill: 6,
    top: 30,
    seatY: 17,
    seatZ: 53,
    seatX: 5.5,
    door: { z0: 48, z1: 58, y0: 9, y1: 27, depth: 2 },
    draw(b, paint) {
      const p = P(paint);
      const W = b.W;
      const bed = P(0xd9822b, 0.05);
      const bedDark = P(0xb86a1f, 0.05);
      // Frame.
      b.box(4, 5, 2, W - 5, 7, 60, P(DARK));
      b.box(2, 7, 2, W - 3, 8, 4, P(DARK));
      // Cab: a tall box with a big glasshouse.
      b.slab(44, 60, 8, 17, p, { rTop: 0, rFront: 1, rBot: 0 });
      b.cabin(18, 29, { zb: 44, zf: 60, inset: 0 }, { zb: 44, zf: 59, inset: 1 }, p, { pillars: [], aW: 2, cW: 30 });
      b.seat(15, 19, 17, 50, 57);
      b.box(1, 17, 58, W - 2, 19, 59, P(DARK));
      for (let y = 9; y <= 16; y++) b.front(7, 16, y, y, P(y % 2 ? GRILLE : DARK2), false);
      b.front(2, 5, 13, 14, G(HEAD));
      b.front(2, 3, 11, 11, P(AMBER));
      b.box(0, 6, 61, W - 1, 9, 61, P(DARK2));
      b.box(1, 7, 61, 2, 8, 61, P(0xc81e1e));
      b.box(3, 7, 61, 4, 8, 61, P(WHITE));
      b.box(W - 3, 7, 61, W - 2, 8, 61, P(0xc81e1e));
      b.box(W - 5, 7, 61, W - 4, 8, 61, P(WHITE));
      b.sym(-1, 20, 57, -1, 26, 57, P(DARK));
      b.sym(-1, 26, 57, -1, 26, 59, P(DARK));
      b.box(W - 1, 8, 50, W - 1, 8, 54, P(DARK)); // step
      // Dump body.
      b.box(0, 10, 2, W - 1, 12, 42, bed);
      b.sym(0, 13, 2, 1, 26, 42, bed);
      b.box(0, 13, 2, W - 1, 24, 3, bed);
      b.box(0, 13, 40, W - 1, 30, 42, bed);
      b.box(0, 31, 40, W - 1, 31, 47, bed); // cab guard
      b.side(2, 42, 13, 26, (y, z) => ((y - 13) % 5 === 4 || z % 10 === 2 ? bedDark : 0));
      b.box(2, 12, 4, W - 3, 12, 39, bedDark);
      // Fuel tank.
      b.box(0, 7, 31, 2, 9, 37, P(CHROME));
      b.rear(1, 3, 9, 10, 0, true, true);
      b.rear(1, 2, 8, 8, P(AMBER));
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Geometry caches (shared between cars; never disposed).

const wheelCache = new Map<string, THREE.BufferGeometry>();

/** A voxel wheel: tire, rim and hub, axis along x, centered on its axle. */
function wheelGeometry(R: number, tw: number): THREE.BufferGeometry {
  const key = `${R}:${tw}`;
  const hit = wheelCache.get(key);
  if (hit) return hit;
  const g = new DetailGrid(tw, 2 * R, 2 * R);
  for (let y = 0; y < 2 * R; y++)
    for (let z = 0; z < 2 * R; z++) {
      const r = Math.hypot(y + 0.5 - R, z + 0.5 - R);
      if (r > R) continue;
      for (let x = 0; x < tw; x++) {
        const face = x === 0 || x === tw - 1;
        let c = TIRE;
        if (face && r < R * 0.62) c = r < R * 0.25 ? HUB : RIM;
        else if (!face && r < R - 1.2) c = HUB;
        g.set(x, y, z, vox(c, { jitter: c === TIRE ? 0.05 : 0.03, glass: c === RIM }));
      }
    }
  const geo = meshGrid(g, { origin: [tw / 2, R, R] });
  wheelCache.set(key, geo);
  return geo;
}

interface BodyGeo {
  body: THREE.BufferGeometry;
  glass: THREE.BufferGeometry | null;
  brake: THREE.BufferGeometry | null;
  door: THREE.BufferGeometry | null;
  doorGlass: THREE.BufferGeometry | null;
}
const bodyCache = new Map<string, BodyGeo>();
const specCache = new Map<CarKind, CarSpec>();

function originOf(d: Design) {
  // Grid cell coordinates of the body origin: centered in x and z, halfway up the collider.
  return new THREE.Vector3((d.W + 2) / 2, (d.sill + d.top) / 2, d.L / 2);
}

function bodyGeometry(kind: CarKind, paint: number, rng: Rng): BodyGeo {
  const key = `${kind}:${paint}`;
  const hit = bodyCache.get(key);
  if (hit) return hit;
  const d = DESIGNS[kind];
  const b = new Builder(d.W, d.L, d.H);
  d.draw(b, paint, rng);
  if (!d.noArches) b.arches(d.axles, d.R, d.tw - (d.wheelOut ?? 0), kind === 'jeep' ? 2 : kind === 'quad' ? 1 : 0, kind === 'quad' ? paint : DARK);
  // Lift the driver's door out into its own grids so it can swing.
  const door = new DetailGrid(b.g.sx, b.g.sy, b.g.sz);
  const doorGlass = new DetailGrid(b.g.sx, b.g.sy, b.g.sz);
  const depth = d.door.depth ?? 3;
  let nDoor = 0;
  for (let y = d.door.y0; y <= d.door.y1; y++)
    for (let z = d.door.z0; z <= d.door.z1; z++)
      for (let x = d.W - depth; x < d.W; x++) {
        const gx = x + 1;
        const v = b.g.get(gx, y, z);
        if (v) {
          door.set(gx, y, z, v);
          b.g.set(gx, y, z, 0);
          nDoor++;
        }
        const w = b.glass.get(gx, y, z);
        if (w) {
          doorGlass.set(gx, y, z, w);
          b.glass.set(gx, y, z, 0);
        }
      }
  const o = originOf(d);
  const opts = { origin: [o.x, o.y, o.z] as [number, number, number] };
  const some = (g: DetailGrid) => g.count() > 0;
  const res: BodyGeo = {
    body: meshGrid(b.g, opts),
    glass: some(b.glass) ? meshGrid(b.glass, { ...opts, ao: 0 }) : null,
    brake: some(b.brake) ? meshGrid(b.brake, { ...opts, ao: 0 }) : null,
    door: nDoor ? meshGrid(door, opts) : null,
    doorGlass: some(doorGlass) ? meshGrid(doorGlass, { ...opts, ao: 0 }) : null,
  };
  bodyCache.set(key, res);
  return res;
}

/** The physical layout of a kind (cached). */
export function carSpec(kind: CarKind): CarSpec {
  const hit = specCache.get(kind);
  if (hit) return hit;
  const d = DESIGNS[kind];
  const h = HANDLING[kind];
  const o = originOf(d);
  const ride = o.y * DV;
  const R = d.R * DV;
  // The game world's gravity is 30, not 9.81 (see physics setup).
  const sag = 30 / (d.axles.length * 2 * h.stiffness);
  const mountY = R - ride + h.rest - sag;
  const wx = (d.W / 2 - d.tw / 2 + (d.wheelOut ?? 0)) * DV;
  const wheels: THREE.Vector3[] = [];
  for (const az of d.axles) {
    const z = (az - o.z) * DV;
    wheels.push(new THREE.Vector3(wx, mountY, z), new THREE.Vector3(-wx, mountY, z));
  }
  const spec: CarSpec = {
    kind,
    half: new THREE.Vector3((d.W / 2) * DV, ((d.top - d.sill) / 2) * DV, (d.L / 2) * DV),
    ride,
    wheelR: R,
    wheels,
    rest: h.rest,
    seat: new THREE.Vector3((d.seatX ?? 4.5) * DV, (d.seatY - o.y) * DV, (d.seatZ - o.z) * DV),
    doorOut: new THREE.Vector3((d.W / 2) * DV + 1.05, -ride, d.straddle ? (d.seatZ - o.z) * DV : ((d.door.z0 + d.door.z1) / 2 - o.z) * DV),
    straddle: !!d.straddle,
    handling: h,
  };
  specCache.set(kind, spec);
  return spec;
}

// ---------------------------------------------------------------------------------------------
// Materials

let glassMat: THREE.MeshStandardMaterial | null = null;
function glassMaterial() {
  glassMat ??= new THREE.MeshStandardMaterial({ color: 0x24384a, transparent: true, opacity: 0.62, roughness: 0.06, metalness: 0.5, depthWrite: false });
  return glassMat;
}
let burntMat: THREE.MeshStandardMaterial | null = null;
function burntMaterial() {
  if (!burntMat) {
    const base = kitMaterial(DV);
    burntMat = base.clone();
    burntMat.onBeforeCompile = base.onBeforeCompile;
    burntMat.customProgramCacheKey = base.customProgramCacheKey;
    burntMat.color.setHex(0x2c2826);
  }
  return burntMat;
}

/** Traffic mix: lots of ordinary cars, the odd van, taxi or truck. */
const TRAFFIC_MIX: CarKind[] = ['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'taxi', 'van', 'pickup', 'pickup', 'jeep', 'muscle', 'sport', 'truck'];

/** A voxel car of the given (or a random) kind. Local +z is forward, origin at the body center. */
export function buildCar(rng: Rng, kind?: CarKind): CarModel {
  kind ??= pick(rng, TRAFFIC_MIX);
  const d = DESIGNS[kind];
  const spec = carSpec(kind);
  const paint = kind === 'taxi' ? 0xf2c230 : pick(rng, PAINTS_FOR[kind] ?? PAINTS);
  const geo = bodyGeometry(kind, paint, rng);
  const mat = kitMaterial(DV);
  const root = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const add = (g: THREE.BufferGeometry | null, m: THREE.Material, parent: THREE.Object3D, shadow = true) => {
    if (!g) return null;
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  add(geo.body, mat, root);
  add(geo.glass, glassMaterial(), root, false);
  const brakeLights = new THREE.MeshLambertMaterial({ color: 0xb01818, emissive: 0x200000 });
  add(geo.brake, brakeLights, root);

  // Door, hinged at its front edge on the outside of the body.
  const o = originOf(d);
  const hinge = new THREE.Vector3((d.W / 2) * DV, 0, (d.door.z1 + 1 - o.z) * DV);
  const door = new THREE.Group();
  door.position.copy(hinge);
  root.add(door);
  add(geo.door, mat, door)?.position.copy(hinge).negate();
  add(geo.doorGlass, glassMaterial(), door, false)?.position.copy(hinge).negate();

  d.extras?.(root, d, o);

  // Wheels.
  const wheelSteer: THREE.Group[] = [];
  const wheelSpin: THREE.Object3D[] = [];
  const wgeo = wheelGeometry(d.R, d.tw);
  spec.wheels.forEach((w, i) => {
    const steer = new THREE.Group();
    steer.position.set(d.centerWheels ? 0 : w.x, -spec.ride + spec.wheelR, w.z);
    const spin = new THREE.Group();
    if (!d.centerWheels || i % 2 === 0) {
      const t = new THREE.Mesh(wgeo, mat);
      t.castShadow = true;
      spin.add(t);
    }
    steer.add(spin);
    root.add(steer);
    wheelSteer.push(steer);
    wheelSpin.push(spin);
  });

  return {
    root,
    kind,
    paint,
    spec,
    wheelSteer,
    wheelSpin,
    door,
    brakeLights,
    burn() {
      const m = burntMaterial();
      root.traverse((ob) => {
        if (ob instanceof THREE.Mesh && ob.material === mat) ob.material = m;
      });
      brakeLights.color.setHex(0x1a1a1a);
    },
    dispose() {
      // Geometry is cached and shared; only the per-car material goes.
      brakeLights.dispose();
    },
  };
}
