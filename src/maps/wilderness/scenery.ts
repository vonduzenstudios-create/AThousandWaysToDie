import * as THREE from 'three';
import { mulberry32 } from '../../util';
import { Biome, SX, SZ, W, fbm, type Terrain } from './terrain';
import type { VoxelWorld } from '../../voxel';

/**
 * Non-colliding dressing: rivers and ponds, tall savanna grass, ferns, clouds.
 * Everything is merged per 64x64 tile so the renderer can cull it.
 */

const TILE = 64;

/** Water surfaces (with side faces where the level drops, so waterfalls show as curtains). */
export function buildWater(t: Terrain): { group: THREE.Group; mat: THREE.MeshLambertMaterial } {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide });
  const col = new THREE.Color();
  for (let tz = 0; tz < SZ; tz += TILE)
    for (let tx = 0; tx < SX; tx += TILE) {
      const pos: number[] = [];
      const cols: number[] = [];
      const push = (c: THREE.Color, ...v: number[]) => {
        for (let i = 0; i < v.length; i += 3) {
          pos.push(v[i], v[i + 1], v[i + 2]);
          cols.push(c.r, c.g, c.b);
        }
      };
      for (let z = tz; z < Math.min(SZ, tz + TILE); z++)
        for (let x = tx; x < Math.min(SX, tx + TILE); x++) {
          const wl = t.waterAt(x, z);
          if (!wl) continue;
          const depth = wl - t.ground(x, z);
          const y = wl - 0.18;
          const b = t.biomeAt(x, z);
          if (b === Biome.Swamp) col.setHex(0x4a6a3a);
          else if (b === Biome.Savanna || b === Biome.Desert) col.setHex(depth > 2 ? 0x3a7a8a : 0x5a9aa0);
          else col.setHex(depth > 2 ? 0x2a6ab8 : 0x3f8ad0);
          const n = fbm(x / 6, z / 6, 3) * 0.08;
          col.offsetHSL(0, 0, n);
          push(col, x, y, z, x, y, z + 1, x + 1, y, z + 1, x, y, z, x + 1, y, z + 1, x + 1, y, z);
          // Curtains down to lower neighbours.
          const foam = new THREE.Color(0xdff2ff);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nw = t.waterAt(x + dx, z + dz);
            if (!nw || nw >= wl - 1) continue;
            const y0 = nw - 0.18;
            const ex = dx === 1 ? x + 1 : dx === -1 ? x : null;
            const ez = dz === 1 ? z + 1 : dz === -1 ? z : null;
            if (ex !== null) push(foam, ex, y, z, ex, y0, z, ex, y0, z + 1, ex, y, z, ex, y0, z + 1, ex, y, z + 1);
            else if (ez !== null) push(foam, x, y, ez, x, y0, ez, x + 1, y0, ez, x, y, ez, x + 1, y0, ez, x + 1, y, ez);
          }
        }
      if (!pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = 2;
      m.receiveShadow = true;
      group.add(m);
    }
  return { group, mat };
}

/** Where tall grass grows (savanna). 1 = hiding cover. */
export function grassCover(t: Terrain, world: VoxelWorld) {
  const cover = new Uint8Array(SX * SZ);
  for (let z = 0; z < SZ; z++)
    for (let x = 0; x < SX; x++) {
      const i = z * SX + x;
      if (t.water[i] || t.roadAt[i] || t.claimed[i]) continue;
      if (t.biome[i] !== Biome.Savanna) continue;
      const top = world.get(x, t.h[i] - 1, z);
      if (top !== W.DryGrass && top !== 1) continue;
      if (world.get(x, t.h[i], z)) continue;
      if (fbm(x / 22, z / 22, 401) > -0.05) cover[i] = 1;
    }
  return cover;
}

/** Instanced blades: tall savanna grass, forest ferns, desert scrub. */
export function buildFoliage(t: Terrain, world: VoxelWorld, cover: Uint8Array) {
  const group = new THREE.Group();
  const rng = mulberry32(77);
  // One tuft = three crossed thin planes.
  const tuft = (h: number) => {
    const geos: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const p = new THREE.PlaneGeometry(0.5, h);
      p.translate(0, h / 2, 0);
      p.rotateY((k / 3) * Math.PI);
      geos.push(p);
    }
    const pos: number[] = [];
    const idx: number[] = [];
    let off = 0;
    for (const g of geos) {
      const a = g.attributes.position.array as ArrayLike<number>;
      for (let i = 0; i < a.length; i++) pos.push(a[i]);
      const ix = g.index!.array;
      for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off);
      off += a.length / 3;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setIndex(idx);
    out.computeVertexNormals();
    return out;
  };
  const kinds: { geo: THREE.BufferGeometry; color: number; pick: (x: number, z: number) => boolean; every: number; scale: [number, number] }[] = [
    { geo: tuft(1.7), color: 0xd2bc62, pick: (x, z) => cover[z * SX + x] === 1, every: 1, scale: [0.7, 1.3] },
    { geo: tuft(0.7), color: 0xb8a050, pick: (x, z) => t.biome[z * SX + x] === Biome.Savanna && cover[z * SX + x] === 0, every: 9, scale: [0.6, 1.2] },
    { geo: tuft(0.8), color: 0x3a7a2a, pick: (x, z) => t.biome[z * SX + x] === Biome.Forest, every: 6, scale: [0.6, 1.3] },
    { geo: tuft(0.6), color: 0x8a8a4a, pick: (x, z) => t.biome[z * SX + x] === Biome.Desert, every: 30, scale: [0.6, 1.4] },
    { geo: tuft(1.2), color: 0x4a6a2a, pick: (x, z) => t.biome[z * SX + x] === Biome.Swamp, every: 4, scale: [0.8, 1.6] },
  ];
  const d = new THREE.Object3D();
  for (let tz = 0; tz < SZ; tz += TILE)
    for (let tx = 0; tx < SX; tx += TILE)
      for (const k of kinds) {
        const mats: THREE.Matrix4[] = [];
        for (let z = tz; z < Math.min(SZ, tz + TILE); z++)
          for (let x = tx; x < Math.min(SX, tx + TILE); x++) {
            if (rng() * k.every > 1) continue;
            const i = z * SX + x;
            if (t.water[i] || t.roadAt[i]) continue;
            if (!k.pick(x, z)) continue;
            const y = t.h[i];
            if (world.get(x, y, z)) continue; // something built here
            d.position.set(x + rng(), y, z + rng());
            d.rotation.set(0, rng() * Math.PI, 0);
            d.scale.setScalar(k.scale[0] + rng() * (k.scale[1] - k.scale[0]));
            d.updateMatrix();
            mats.push(d.matrix.clone());
          }
        if (!mats.length) continue;
        const im = new THREE.InstancedMesh(k.geo, new THREE.MeshLambertMaterial({ color: k.color, side: THREE.DoubleSide }), mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m));
        im.computeBoundingSphere();
        group.add(im);
      }
  return group;
}

export function buildClouds() {
  const group = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 });
  const rng = mulberry32(5);
  for (let i = 0; i < 40; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(rng() * 5);
    for (let j = 0; j < n; j++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(6 + rng() * 10, 3 + rng() * 3, 6 + rng() * 8), m);
      b.position.set(j * 5 - n * 2.5, rng() * 2, (rng() - 0.5) * 5);
      c.add(b);
    }
    c.position.set(rng() * 800 - 80, 105 + rng() * 25, rng() * 800 - 80);
    group.add(c);
  }
  return group;
}
