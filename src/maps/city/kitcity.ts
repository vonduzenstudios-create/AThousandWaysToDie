import * as THREE from 'three';
import { DV, FLOOR_H, StreetKit, vox, type BuiltBuilding, type PropKind } from '../../kit';
import type { CityLayout, KitLot } from './build';
import { BoxBatch, type Scenery } from './mesh';
import { G } from './layout';

/** Wall thickness (detail cells) kept when a ground floor is hollowed out. */
const T = 3;
/** Interior height of a hollow ground floor, in cells (leaves a 2-cell ceiling slab). */
const H = FLOOR_H - 2;

/**
 * Hollow out a kit building's ground floor so it can be walked into: clears the inside,
 * plasters the inner walls and ceiling, and swaps the solid body collider for walls with
 * a gap at the door. Runs on the raw grid before meshing (building-local units).
 */
export function hollowShop(b: BuiltBuilding) {
  const g = b.grid;
  const [ox, , oz] = b.origin;
  const W = Math.round(b.spec.w / DV), D = Math.round(b.spec.d / DV);
  g.clear(ox + T, 0, oz + T, ox + W - 1 - T, H - 1, oz + D - 1 - T);
  const plaster = vox(0xe8dcc4, { jitter: 0.05 });
  g.box(ox + T, H, oz + T, ox + W - 1 - T, H, oz + D - 1 - T, vox(0xf2eee4, { jitter: 0.02 }));
  g.box(ox + T - 1, 0, oz + T, ox + T - 1, H - 1, oz + D - 1 - T, plaster);
  g.box(ox + W - T, 0, oz + T, ox + W - T, H - 1, oz + D - 1 - T, plaster);
  g.box(ox + T, 0, oz + D - T, ox + W - 1 - T, H - 1, oz + D - T, plaster);
  // Ceiling lights.
  const lamp = vox(0xfff0c8, { emissive: true });
  for (let z = oz + T + 10; z < oz + D - T - 6; z += 20) for (let x = ox + T + 10; x < ox + W - T - 8; x += 24) g.box(x, H, z, x + 5, H, z + 1, lamp);
  // Shelves of goods along both side walls, from just inside the door to near the back.
  const wood = vox(0x6e4a2b, { jitter: 0.06 });
  const goods = [0xd04a3a, 0xe8c040, 0x3a7ad0, 0x4aa050, 0xf0ece0, 0xb05ab0, 0xe08a30];
  const s0 = oz + T + 14, s1 = oz + D - T - 22;
  if (s1 > s0 + 8) {
    for (const [x0, x1] of [[ox + T, ox + T + 2], [ox + W - T - 3, ox + W - T - 1]]) {
      g.box(x0, 0, s0, x1, 17, s0, wood);
      g.box(x0, 0, s1, x1, 17, s1, wood);
      for (const y of [0, 6, 12, 17]) {
        g.box(x0, y, s0, x1, y, s1, wood);
        if (y < 17) for (let z = s0 + 1; z < s1; z++) if ((z * 7 + y * 3 + x0) % 5 < 3) g.box(x0, y + 1, z, x1, y + 2 + ((z + y) % 3), z, vox(goods[(z * 3 + y + x0) % goods.length], { jitter: 0.1 }));
      }
      b.boxes.push({ min: [(x0 - ox) * DV, 0, (s0 - oz) * DV], max: [(x1 - ox + 1) * DV, 18 * DV, (s1 - oz + 1) * DV] });
    }
  }
  // Colliders: the kit's door is 9 cells wide, centered at doorAt (0.5); u runs from +x to -x.
  const top = b.boxes[0].max[1];
  const dc = Math.round(W * 0.5), da = Math.round(dc - 4), db = da + 8;
  const gx0 = (W - 1 - db) * DV, gx1 = (W - da) * DV;
  b.boxes[0] = { min: [0, H * DV, 0], max: [W * DV, top, D * DV] };
  // The awning's collider hangs at 1.25, below head height: keep only its top so people
  // can walk under it into the shop (and still land on it from above).
  for (const bx of b.boxes) if (bx.min[2] < 0 && bx.max[1] <= 2.1 && bx.min[1] > 0.5) bx.min[1] = Math.max(bx.min[1], 1.9);
  b.boxes.push(
    { min: [0, 0, (D - T) * DV], max: [W * DV, H * DV, D * DV] },
    { min: [0, 0, 0], max: [T * DV, H * DV, D * DV] },
    { min: [(W - T) * DV, 0, 0], max: [W * DV, H * DV, D * DV] },
    { min: [0, 0, 0], max: [gx0, H * DV, T * DV] },
    { min: [gx1, 0, 0], max: [W * DV, H * DV, T * DV] },
    { min: [gx0, 16 * DV, 0], max: [gx1, H * DV, T * DV] },
  );
}

/**
 * Put the city's kit buildings, rooftop water tanks, fire escapes, dumpsters and street
 * props into the scene. Returns the kit (disposed with the scenery).
 */
export function buildKitCity(sc: Scenery, L: CityLayout, focus: THREE.Vector3, nearRadius = 70) {
  const kit = new StreetKit({ parent: sc.scene, physics: sc.physics });
  const v = new THREE.Vector3();
  const center = (lot: KitLot) => {
    const s = lot.spec;
    const ns = s.face === 'n' || s.face === 's';
    return v.set(s.x + (ns ? s.w : s.d) / 2, G, s.z + (ns ? s.d : s.w) / 2);
  };
  const dist = (lot: KitLot, f: THREE.Vector3) => center(lot).distanceTo(f);

  /** Place one lot: the kit building plus its tank and fire escape, in their own batch. */
  const place = (lot: KitLot) => {
  const iron = new BoxBatch();
  const tanks: THREE.Matrix4[] = [];
  {
    const placed = kit.building(lot.spec, lot.hollow ? hollowShop : undefined);
    const m = StreetKit.placement(lot.spec, lot.spec.w, lot.spec.d);
    const rot = new THREE.Quaternion().setFromRotationMatrix(m);
    const rotY = new THREE.Euler().setFromQuaternion(rot, 'YXZ').y;
    const W = (lx: number, ly: number, lz: number) => v.set(lx, ly, lz).applyMatrix4(m).clone();
    // Box in building-local coordinates (center + size), drawn and made solid.
    const part = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: number, solid = true) => {
      const c = W(lx, ly, lz);
      iron.box(c.x, c.y, c.z, sx, sy, sz, color, rotY);
      if (solid) sc.solid(c.x, c.y, c.z, sx / 2, sy / 2, sz / 2, rotY);
    };
    if (lot.tank && placed.built.spec.roof === 'flat') {
      const roof = placed.wallTop + 0.6;
      const c = W(lot.spec.w * lot.tank[0], 0, lot.spec.d * lot.tank[1]);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) iron.box(c.x + dx * 1.1, roof + 1, c.z + dz * 1.1, 0.2, 2, 0.2, 0x3a3530);
      iron.box(c.x, roof + 2.05, c.z, 3.2, 0.15, 3.2, 0x5a4a3a);
      tanks.push(new THREE.Matrix4().makeTranslation(c.x, roof + 2.1, c.z));
      sc.solid(c.x, roof + 3.6, c.z, 1.5, 1.5, 1.5);
      sc.solid(c.x, roof + 1.05, c.z, 1.2, 1.05, 1.2);
    }
    if (lot.fireEscape !== undefined) {
      // Black iron landings at every floor and stair flights between them (all rising +x),
      // up to the roof. Landings are outer strip ends + an inner walkway.
      const xa = lot.fireEscape, floors = placed.built.spec.floors;
      const col = 0x22252a;
      for (let f = 1; f < floors; f++) {
        const y = f * 3;
        part(xa + 2.25, y - 0.06, -0.35, 4.5, 0.12, 0.7, col);
        part(xa + 0.25, y - 0.06, -1.05, 0.5, 0.12, 0.7, col);
        part(xa + 4.0, y - 0.06, -1.05, 1.0, 0.12, 0.7, col);
        // Railing round the outside edge and the ends.
        part(xa + 2.25, y + 0.9, -1.38, 4.5, 0.06, 0.06, col, false);
        part(xa + 2.25, y + 0.45, -1.38, 4.5, 0.04, 0.04, col, false);
        for (const rx of [0.03, 4.47]) part(xa + rx, y + 0.45, -0.7, 0.06, 0.9, 1.4, col, false);
        for (let k = 0; k <= 9; k++) part(xa + k * 0.5, y + 0.45, -1.38, 0.04, 0.9, 0.04, col, false);
        sc.solid(W(xa + 2.25, 0, -1.42).x, G + y + 0.5, W(xa + 2.25, 0, -1.42).z, ...(Math.abs(Math.sin(rotY)) > 0.5 ? [0.04, 0.5, 2.25] : [2.25, 0.5, 0.04]) as [number, number, number]);
      }
      // Flights from each landing to the next; the last one reaches over the parapet.
      for (let f = 1; f < floors; f++) {
        const y = f * 3;
        for (let k = 0; k < 6; k++) part(xa + 0.75 + k * 0.5, y + 0.5 * (k + 1) - 0.05, -1.05, 0.5, 0.1, 0.62, col);
      }
    }
  }
  // Wooden water tanks (barrel, hoops and conical cap).
  if (tanks.length) {
    const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.5, 1.5, 3, 14).translate(0, 1.5, 0), new THREE.MeshLambertMaterial({ color: 0x8a6440 }), tanks.length);
    const hoops = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.53, 1.53, 0.12, 14), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }), tanks.length * 3);
    const cap = new THREE.InstancedMesh(new THREE.ConeGeometry(1.65, 1.1, 14).translate(0, 3.55, 0), new THREE.MeshLambertMaterial({ color: 0x4a3a2c }), tanks.length);
    tanks.forEach((t, i) => {
      body.setMatrixAt(i, t);
      cap.setMatrixAt(i, t);
      for (let h = 0; h < 3; h++) hoops.setMatrixAt(i * 3 + h, t.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.5 + h * 1, 0)));
    });
    for (const im of [body, hoops, cap]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      sc.add(im);
    }
  }
  if (!iron.empty) sc.add(iron.build());
  };

  // Everything near the focus right away, the rest streamed in nearest-first a few per frame.
  const queue = L.kit.slice().sort((a, b) => dist(a, focus) - dist(b, focus));
  while (queue.length && dist(queue[0], focus) < nearRadius) place(queue.shift()!);

  const iron = new BoxBatch();
  // Dumpsters (green steel bins with black lids).
  for (const d of L.dumpsters) {
    iron.box(d.x, G + 0.6, d.z, 1.9, 1.2, 1.1, 0x2f6a3a, d.rotY);
    iron.box(d.x, G + 1.25, d.z, 2.0, 0.1, 1.2, 0x1a1a1a, d.rotY);
    sc.solid(d.x, G + 0.65, d.z, 0.95, 0.65, 0.55, d.rotY);
  }
  if (!iron.empty) sc.add(iron.build());
  for (const p of L.props) kit.prop(p.kind as PropKind, p.x, G, p.z, p.rotY);
  for (const [a, b] of L.bunting) kit.bunting(a, b, { colors: [0x2f8a3a, 0xf4f0f0, 0xd0302a] });
  kit.finish();
  sc.onDispose(() => kit.dispose());
  let resort = 0;
  return {
    kit,
    /** Buildings still waiting to be placed. */
    get pending() {
      return queue.length;
    },
    /** Place queued buildings for up to `budgetMs`, nearest to `f` first. */
    tick(f: THREE.Vector3 | null, budgetMs = 6) {
      if (!queue.length) return;
      if (f && (resort -= 1) <= 0) {
        resort = 30;
        queue.sort((a, b) => dist(a, f) - dist(b, f));
      }
      const t0 = performance.now();
      do place(queue.shift()!);
      while (queue.length && performance.now() - t0 < budgetMs);
    },
    /** Place everything now (previews, tests). */
    flush() {
      while (queue.length) place(queue.shift()!);
    },
  };
}
