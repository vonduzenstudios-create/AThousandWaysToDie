import * as THREE from 'three';
import type { VoxelWorld } from '../../voxel';
import type { Box } from '../../town';

/**
 * The airport is designed in its own "design frame": x 0..319 left to right, z 0..223 from the
 * landside curb (z = 0) out to the runway and the bay (z = 223), y = 0 is the first air layer above
 * the ground. The city puts the curb on its south (+z) edge, so the frame mirrors z on the way out:
 *
 *   world x = origin.x + x
 *   world y = origin.y + y
 *   world z = origin.z + (SIZE_Z - 1 - z)   for voxel indices
 *   world z = origin.z + SIZE_Z - z         for continuous points
 *
 * Headings follow the player convention (forward = (sin f, 0, cos f)); mirroring z maps f to PI - f.
 */
export const SIZE_X = 320;
export const SIZE_Z = 224;

export class Frame {
  constructor(
    readonly world: VoxelWorld,
    readonly origin: THREE.Vector3,
  ) {}

  /** Voxel write in design coordinates (integers). */
  set(x: number, y: number, z: number, b: number) {
    if (x < 0 || z < 0 || x >= SIZE_X || z >= SIZE_Z) return;
    this.world.set(this.origin.x + x, this.origin.y + y, this.origin.z + (SIZE_Z - 1 - z), b);
  }

  get(x: number, y: number, z: number) {
    return this.world.get(this.origin.x + x, this.origin.y + y, this.origin.z + (SIZE_Z - 1 - z));
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: number) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, b);
  }

  /** Continuous design point to world point. */
  p(x: number, y: number, z: number, out = new THREE.Vector3()) {
    return out.set(this.origin.x + x, this.origin.y + y, this.origin.z + SIZE_Z - z);
  }

  /** World point back to design coordinates. */
  toDesign(w: THREE.Vector3, out = new THREE.Vector3()) {
    return out.set(w.x - this.origin.x, w.y - this.origin.y, this.origin.z + SIZE_Z - w.z);
  }

  /** Design direction to world direction. */
  dir(x: number, y: number, z: number, out = new THREE.Vector3()) {
    return out.set(x, y, -z);
  }

  /** Design heading to world heading. */
  heading(h: number) {
    return Math.PI - h;
  }

  /** Box in design coordinates (inclusive voxel ranges are fine: pass x1 + 1 for the far edge). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box {
    const a = this.p(Math.min(x0, x1), Math.min(y0, y1), Math.max(z0, z1));
    const b = this.p(Math.max(x0, x1), Math.max(y0, y1), Math.min(z0, z1));
    return { min: a, max: b };
  }
}

/** Point in a design-space box (x0..x1, y0..y1, z0..z1, continuous). */
export interface DBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

export const dbox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): DBox => ({ x0, y0, z0, x1, y1, z1 });

export const inD = (d: THREE.Vector3, b: DBox) => d.x >= b.x0 && d.x <= b.x1 && d.y >= b.y0 && d.y <= b.y1 && d.z >= b.z0 && d.z <= b.z1;
