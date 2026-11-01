import * as THREE from 'three';
import { DV } from './grid';

const cache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * The shared material for everything the kit meshes. It reads the `vmeta` attribute written by
 * meshGrid: per-voxel brightness noise (hashed from the voxel cell in the shader, so big greedy
 * quads still look like individual voxels), emissive cells, and glossy glass cells.
 *
 * `size` is the world size of one cell of the geometry (DV for full detail, DV*2 for LOD 1...).
 */
export function kitMaterial(size = DV, opts: { shadowSide?: boolean } = {}): THREE.MeshStandardMaterial {
  const key = `${size}:${opts.shadowSide ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.voxInv = { value: 1 / size };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 vmeta;
uniform float voxInv;
varying vec3 vMeta;
varying vec3 vVox;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vMeta = vmeta;
vVox = position * voxInv - normal * 0.5;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vMeta;
varying vec3 vVox;
float kitHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 cell = floor(vVox + 0.001);
  float n = kitHash(cell + 17.0);
  diffuseColor.rgb *= 1.0 + (n - 0.5) * 2.0 * vMeta.x;
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.12, vMeta.z);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.55, vMeta.z);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vMeta.y * 2.2;`,
      );
  };
  mat.customProgramCacheKey = () => 'kitvox';
  if (opts.shadowSide) mat.shadowSide = THREE.FrontSide;
  cache.set(key, mat);
  return mat;
}
