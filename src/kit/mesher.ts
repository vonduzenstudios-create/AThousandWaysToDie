import * as THREE from 'three';
import { meshArrays, type MeshArrays, type MeshOptions, type GridLike } from './meshcore';

export { meshArrays, downsample } from './meshcore';
export type { MeshArrays, MeshOptions, GridLike } from './meshcore';

/** Wrap mesh arrays in a BufferGeometry with the attributes kitMaterial expects. */
export function toGeometry(m: MeshArrays): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3, true));
  geo.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
  geo.setAttribute('vmeta', new THREE.BufferAttribute(m.meta, 3, true));
  geo.setIndex(new THREE.BufferAttribute(m.index, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/**
 * Greedy-mesh a voxel grid into a BufferGeometry (see meshcore.ts). Use with kitMaterial(size).
 */
export function meshGrid(g: GridLike, opts: MeshOptions = {}): THREE.BufferGeometry {
  return toGeometry(meshArrays(g, opts));
}

/** Triangle count of a geometry, for budgets and the debug overlay. */
export const triCount = (geo: THREE.BufferGeometry) => (geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3);
