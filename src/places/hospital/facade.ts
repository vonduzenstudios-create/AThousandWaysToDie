import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from '../../physics';
import { DetailGrid, DV, StreetKit, kitMaterial, meshGrid, rasterText, textWidth, vox, type Facing } from '../../kit';
import { hash3 } from '../../util';
import { HOSP_D, HOSP_W, ROOF, type HospitalInfo } from './layout';

/**
 * The hospital's detailed exterior, drawn with the building kit (docs/building-kit.md).
 *
 * The coarse voxel shell from layout.ts still does the collision and the interior. This is a
 * skin of detail voxels (8 per block) wrapped around it: ribbon windows with mullions and
 * sills, piers, floor bands, a teal cornice, a taller parapet with coping, the lit red cross,
 * the name in red letters, the entrance portal and canopy, and helipad lights on the roof.
 *
 * Each facade is one DetailGrid in the kit's building frame (x along the facade, z = 0 the
 * street side, front facing -z) placed with StreetKit.placement.
 */

/** Skin depth outside the coarse wall, in detail voxels. */
const DOUT = 6;
/** Grid depth: the skin plus one block inward (the parapet and its coping sit over the coarse parapet). */
const SZ = DOUT + 8;
/** Top of the skin's parapet (one block above the coarse one), in detail voxels. */
const PAR_TOP = (ROOF + 2) * 8;
const SY = PAR_TOP + 3;
const FLOOR_DV = 56;

const C = {
  wall: vox(0xeeeae2, { jitter: 0.035 }),
  pier: vox(0xf7f5f0, { jitter: 0.03 }),
  slab: vox(0xd9d5cc, { jitter: 0.04 }),
  inner: vox(0xb9b5ac, { jitter: 0.06 }),
  stone: vox(0x8f918f, { jitter: 0.08 }),
  accent: vox(0x2a8c96, { jitter: 0.04 }),
  accentDark: vox(0x1f6b73, { jitter: 0.04 }),
  coping: vox(0xc9c6bd, { jitter: 0.05 }),
  glass: vox(0x2c4a63, { glass: true, jitter: 0.05 }),
  glassLit: vox(0x9a8a62, { glass: true, emissive: true, jitter: 0.1 }),
  mull: vox(0x6d7680, { jitter: 0.03 }),
  sill: vox(0xd0ccc2, { jitter: 0.04 }),
  red: vox(0xd41f22, { jitter: 0.02 }),
  signBack: vox(0xfbfaf6, { emissive: true, jitter: 0 }),
  white: vox(0xf6f4ee, { emissive: true, jitter: 0 }),
  lamp: vox(0xfff1cf, { emissive: true, jitter: 0 }),
  metal: vox(0x8d949c, { jitter: 0.05 }),
  dark: vox(0x2c3036, { jitter: 0.04 }),
  heliLight: vox(0x9dff6a, { emissive: true, jitter: 0 }),
  beacon: vox(0xff3020, { emissive: true, jitter: 0 }),
};

interface PanelOpts {
  /** Facade length in blocks. */
  L: number;
  /** Front and back panels also wrap the building's corners. */
  corners: boolean;
  seed: number;
  /** Hospital name in red letters on the parapet. */
  name?: string;
  /** Leave a doorway (block columns along the facade, inclusive). */
  door?: [number, number];
  /** The lit red cross above the door. */
  cross?: number;
  /** A red EMERGENCY sign over the ground floor, starting at this block column. */
  emergency?: number;
}

/**
 * Text in voxels, `s` dv per pixel, spanning u..u + width from the lowest u, on depth layers
 * z0..z1. Seen from the street (looking +z in grid space) +u runs right to left, so the string
 * is laid out mirrored to read correctly.
 */
function text(g: DetailGrid, str: string, u: number, y: number, s: number, z0: number, z1: number, v: number) {
  const W = textWidth(str);
  rasterText(str, (px, py) => {
    const x = u + (W - 1 - px) * s;
    g.box(x, y + py * s, z0, x + s - 1, y + py * s + s - 1, z1, v);
  });
}

function panel(o: PanelOpts): { grid: DetailGrid; u0: number } {
  const u0 = o.corners ? DOUT : 0;
  const SX = o.L * 8 + 2 * u0;
  const g = new DetailGrid(SX, SY, SZ);
  const top = ROOF * 8;
  const bays = Math.round(o.L / 8);

  // Wall face, plinth, parapet (thickened over the coarse parapet) and coping.
  g.box(0, 0, 4, SX - 1, PAR_TOP - 1, 5, C.wall);
  g.box(0, (ROOF + 1) * 8, 4, SX - 1, PAR_TOP - 1, SZ - 1, C.wall);
  g.box(0, (ROOF + 1) * 8, 6, SX - 1, PAR_TOP - 1, SZ - 1, C.inner);
  g.box(0, PAR_TOP, 1, SX - 1, PAR_TOP + 1, SZ - 1, C.coping);
  g.box(0, PAR_TOP + 2, 2, SX - 1, PAR_TOP + 2, SZ - 2, C.coping);
  g.box(0, 0, 2, SX - 1, 5, 5, C.stone);
  // Teal cornice under the parapet, with a dark drip line.
  g.box(0, top - 7, 2, SX - 1, top - 1, 5, C.accent);
  g.box(0, top - 8, 2, SX - 1, top - 8, 3, C.accentDark);

  for (let f = 0; f < 4; f++) {
    const yb = f * FLOOR_DV;
    // Slab edge band at each floor line.
    if (f > 0) g.box(0, yb - 1, 3, SX - 1, yb + 3, 5, C.slab);
    const w0 = yb + (f === 0 ? 9 : 14), w1 = yb + (f === 0 ? 44 : 42);
    const transom = Math.round(w0 + (w1 - w0) * 0.74);
    for (let b = 0; b < bays; b++) {
      const ua = u0 + b * 64 + 6, ub = u0 + (b + 1) * 64 - 7;
      g.clear(ua, w0, 4, ub, w1, 4);
      // Panes: mostly dark sky-reflecting glass, a few warm lit rooms.
      for (let u = ua; u <= ub; u += 13) {
        const lit = hash3(u * 3 + o.seed, f * 17, b * 7 + o.seed) < 0.12;
        g.box(u, w0, 5, Math.min(u + 12, ub), w1, 5, lit ? C.glassLit : C.glass);
      }
      for (let u = ua + 13; u < ub; u += 13) g.box(u, w0, 4, u, w1, 5, C.mull);
      g.box(ua, transom, 4, ub, transom, 5, C.mull);
      g.box(ua - 1, w0 - 1, 2, ub + 1, w0 - 1, 5, C.sill); // sill
      g.box(ua - 1, w0 - 2, 3, ub + 1, w0 - 2, 5, C.sill);
      g.box(ua - 1, w1 + 1, 3, ub + 1, w1 + 1, 5, C.mull); // head
      g.box(ua - 1, w0, 4, ua - 1, w1, 5, C.mull); // jambs
      g.box(ub + 1, w0, 4, ub + 1, w1, 5, C.mull);
    }
  }
  // Piers between bays, full height to the cornice.
  for (let k = 1; k < bays; k++) {
    const u = u0 + k * 64;
    g.box(u - 5, 6, 2, u + 4, top - 9, 5, C.pier);
    g.box(u - 5, 6, 1, u + 4, 7, 5, C.sill);
  }
  // Corner piers.
  if (o.corners) {
    g.box(0, 0, 0, u0 + 7, top - 9, 5, C.pier);
    g.box(SX - u0 - 8, 0, 0, SX - 1, top - 9, 5, C.pier);
    g.box(0, 0, 0, u0 + 7, 5, 5, C.stone);
    g.box(SX - u0 - 8, 0, 0, SX - 1, 5, 5, C.stone);
  }

  // Entrance: a teal portal around the doorway.
  if (o.door) {
    const ue0 = u0 + o.door[0] * 8, ue1 = u0 + (o.door[1] + 1) * 8 - 1;
    g.box(ue0 - 7, 0, 1, ue0 - 1, 50, 5, C.accent);
    g.box(ue1 + 1, 0, 1, ue1 + 7, 50, 5, C.accent);
    g.box(ue0 - 7, 45, 1, ue1 + 7, 50, 5, C.accent);
    g.box(ue0 - 7, 51, 2, ue1 + 7, 51, 3, C.accentDark);
    g.clear(ue0, 0, 0, ue1, 31, SZ - 1);
    // Glass transom over the doors.
    g.box(ue0, 32, 4, ue1, 44, 4, C.mull);
    g.box(ue0, 33, 5, ue1, 43, 5, C.glass);
    for (let u = ue0 + 8; u < ue1; u += 8) g.box(u, 32, 4, u, 44, 4, C.mull);
  }

  // The lit red cross on a white light box, above the entrance (floors 2 and 3).
  if (o.cross !== undefined) {
    const uc = u0 + o.cross * 8;
    const y0 = FLOOR_DV + 8, y1 = FLOOR_DV * 2 + 40;
    g.box(uc - 34, y0 - 2, 0, uc + 33, y1 + 2, 3, C.accent);
    g.box(uc - 32, y0, 0, uc + 31, y1, 0, C.signBack);
    const cy = Math.round((y0 + y1) / 2), arm = 9, len = Math.round((y1 - y0) * 0.38);
    g.box(uc - arm, cy - len, 0, uc + arm - 1, cy + len, 0, C.red);
    g.box(uc - len, cy - arm, 0, uc + len - 1, cy + arm - 1, 0, C.red);
  }

  // Name in red letters on the parapet.
  if (o.name) {
    const s = 2, tw = textWidth(o.name) * s;
    text(g, o.name, Math.round(u0 + (o.L * 8) / 2 - tw / 2), top + 3, s, 2, 3, C.red);
  }
  if (o.emergency !== undefined) {
    const u = u0 + o.emergency * 8;
    const tw = textWidth('EMERGENCY') * 2;
    g.box(u - 4, 45, 1, u + tw + 3, 57, 3, C.white);
    text(g, 'EMERGENCY', u, 47, 2, 0, 0, C.red);
  }
  return { grid: g, u0 };
}

/** Entrance canopy: a slab on two columns with downlights and a lettered fascia. */
function canopy(): DetailGrid {
  const g = new DetailGrid(160, 48, 30);
  g.box(0, 38, 0, 159, 45, 29, C.accent); // slab
  g.box(0, 46, 0, 159, 46, 29, C.coping);
  g.box(0, 38, 0, 159, 38, 29, C.pier); // soffit
  for (let u = 10; u < 160; u += 14) for (const z of [8, 20]) g.box(u, 37, z, u + 1, 37, z + 1, C.lamp);
  g.box(0, 39, 0, 159, 45, 0, C.accentDark);
  const label = 'MAIN ENTRANCE';
  text(g, label, Math.round(80 - textWidth(label) / 2), 40, 1, 0, 0, C.white);
  for (const u of [6, 150]) {
    g.box(u, 0, 4, u + 3, 37, 7, C.metal);
    g.box(u - 1, 0, 3, u + 4, 1, 8, C.dark);
  }
  return g;
}

/** A recessed helipad edge light. */
function padLight(): DetailGrid {
  const g = new DetailGrid(3, 2, 3);
  g.box(0, 0, 0, 2, 0, 2, C.dark);
  g.set(1, 1, 1, C.heliLight);
  return g;
}

export interface HospitalFacade {
  group: THREE.Group;
  /** Colliders the skin adds (removed with dispose). */
  colliders: RAPIER.Collider[];
}

/**
 * Build the detailed exterior for a hospital stamped by buildHospital and add it to `parent`.
 * Visual skin plus thin colliders over it, so you stand against the skin, not inside it.
 */
export function buildHospitalFacade(info: HospitalInfo, parent: THREE.Object3D, physics: RAPIER.World | null, name: string): HospitalFacade {
  const group = new THREE.Group();
  group.name = 'hospital-facade';
  parent.add(group);
  const colliders: RAPIER.Collider[] = [];
  const body = physics?.createRigidBody(RAPIER.RigidBodyDesc.fixed()) ?? null;
  const o = info.origin;
  const m = DOUT * DV;
  const mat = kitMaterial(DV);

  const addBox = (min: THREE.Vector3, max: THREE.Vector3) => {
    if (!physics || !body) return;
    const lo = min.clone().min(max), hi = min.clone().max(max);
    const h = hi.clone().sub(lo).multiplyScalar(0.5), c = lo.clone().add(hi).multiplyScalar(0.5);
    colliders.push(
      physics.createCollider(
        RAPIER.ColliderDesc.cuboid(Math.max(h.x, 0.01), Math.max(h.y, 0.01), Math.max(h.z, 0.01)).setTranslation(c.x, c.y, c.z).setFriction(0.9).setCollisionGroups(groups(G_WORLD, G_ALL)),
        body,
      ),
    );
  };

  const place = (g: DetailGrid, face: Facing, x: number, z: number, y = o.y) => {
    const mesh = new THREE.Mesh(meshGrid(g), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const M = StreetKit.placement({ x, z, y, face }, g.sx * DV, g.sz * DV);
    mesh.applyMatrix4(M);
    group.add(mesh);
    return M;
  };
  /** Collider over a panel-local box in detail voxels (u along, y up, z depth). */
  const localBox = (M: THREE.Matrix4, u0: number, y0: number, z0: number, u1: number, y1: number, z1: number) =>
    addBox(new THREE.Vector3(u0 * DV, y0 * DV, z0 * DV).applyMatrix4(M), new THREE.Vector3(u1 * DV, y1 * DV, z1 * DV).applyMatrix4(M));

  const door: [number, number] = [28, 35];
  const sides: { face: Facing; opts: PanelOpts; x: number; z: number }[] = [
    { face: 'n', opts: { L: HOSP_W, corners: true, seed: 11, name: name.toUpperCase(), door, cross: 32 }, x: o.x - m, z: o.z - m },
    { face: 's', opts: { L: HOSP_W, corners: true, seed: 23 }, x: o.x - m, z: o.z + HOSP_D + m - SZ * DV },
    { face: 'e', opts: { L: HOSP_D, corners: false, seed: 37, emergency: 33 }, x: o.x + HOSP_W + m - SZ * DV, z: o.z },
    { face: 'w', opts: { L: HOSP_D, corners: false, seed: 41 }, x: o.x - m, z: o.z },
  ];
  for (const s of sides) {
    const { grid, u0 } = panel(s.opts);
    const M = place(grid, s.face, s.x, s.z);
    const SX = grid.sx;
    // Stand-off collider over the skin (piers stick out 0.5 block), and the raised parapet.
    if (s.opts.door) {
      const ue0 = u0 + s.opts.door[0] * 8 - 7, ue1 = u0 + (s.opts.door[1] + 1) * 8 + 7;
      localBox(M, 0, 0, 2, ue0, PAR_TOP, DOUT);
      localBox(M, ue1, 0, 2, SX, PAR_TOP, DOUT);
      localBox(M, ue0, 51, 2, ue1, PAR_TOP, DOUT);
      // Portal sides only (the doorway itself stays open).
      localBox(M, ue0, 0, 2, ue0 + 7, 51, DOUT);
      localBox(M, ue1 - 7, 0, 2, ue1, 51, DOUT);
    } else localBox(M, 0, 0, 2, SX, PAR_TOP, DOUT);
    localBox(M, 0, (ROOF + 1) * 8, DOUT, SX, PAR_TOP + 2, SZ);
  }

  // Canopy over the main entrance (block columns 22..41, 3.75 blocks out).
  {
    const g = canopy();
    const x = o.x + 22, z = o.z - 30 * DV - m + 2 * DV;
    place(g, 'n', x, z);
    addBox(new THREE.Vector3(x, o.y + 38 * DV, z), new THREE.Vector3(x + 20, o.y + 47 * DV, z + 30 * DV));
    for (const u of [6, 150]) addBox(new THREE.Vector3(x + u * DV, o.y, z + 4 * DV), new THREE.Vector3(x + (u + 4) * DV, o.y + 38 * DV, z + 8 * DV));
  }

  // Helipad edge lights (pad centre is block 40,20) and a red beacon on the stair bulkhead.
  {
    const geo = meshGrid(padLight(), { origin: [1, 0, 1] });
    const n = 20;
    const im = new THREE.InstancedMesh(geo, mat, n);
    const cx = o.x + 40.5, cz = o.z + 20.5, R = 10.9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(cx + Math.cos(a) * R, o.y + ROOF, cz + Math.sin(a) * R));
    }
    im.computeBoundingSphere();
    group.add(im);
    const b = new DetailGrid(4, 4, 4);
    b.box(0, 0, 0, 3, 1, 3, C.dark);
    b.box(1, 2, 1, 2, 3, 2, C.beacon);
    const beacon = new THREE.Mesh(meshGrid(b), mat);
    beacon.position.set(o.x + 4.5 - 2 * DV, o.y + ROOF + 7, o.z + 41.5 - 2 * DV);
    group.add(beacon);
  }

  return { group, colliders };
}
