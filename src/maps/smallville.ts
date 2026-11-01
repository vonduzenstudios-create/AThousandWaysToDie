import * as THREE from 'three';
import { B, type VoxelWorld } from '../voxel';
import { G, HEIGHT, SIZE, box, buildTown, type TownInfo } from '../town';
import type { MapBuild, MapDef, TravelStop } from './types';

/** Smallville's build carries the TownInfo that game.ts uses for the original deaths. */
export interface SmallvilleBuild extends MapBuild {
  town: TownInfo;
}

/** Commuter line, one track south of the freight line. */
const COMMUTER_Z = 153;

/**
 * Transit for Smallville. These stamp their own little structures after buildTown(), so the
 * town thread can move them into town.ts (and return them on TownInfo.transit) later.
 */
function stampTransit(w: VoxelWorld): TravelStop[] {
  // Bus shelter on the south sidewalk of the east-west road, east of the diner.
  const bx = 110;
  w.fill(bx, G, 88, bx + 6, G, 88, B.Glass); // back panel, low
  w.fill(bx, G + 1, 88, bx + 6, G + 2, 88, B.Glass);
  for (const x of [bx, bx + 6]) w.fill(x, G, 86, x, G + 3, 86, B.Metal);
  w.fill(bx - 1, G + 4, 85, bx + 7, G + 4, 88, B.RoofBlue);
  w.fill(bx + 1, G, 87, bx + 5, G, 87, B.Wood); // bench
  w.fill(bx - 1, G - 1, 86, bx + 7, G - 1, 88, B.Sidewalk);
  // Sign pole.
  w.fill(bx + 8, G, 85, bx + 8, G + 4, 85, B.Metal);
  w.set(bx + 8, G + 5, 85, B.Yellow);

  // Commuter track bed and a raised platform.
  w.fill(0, G - 1, COMMUTER_Z - 2, SIZE - 1, G - 1, COMMUTER_Z + 2, B.Gravel);
  const px0 = 78, px1 = 110;
  w.fill(px0, G, COMMUTER_Z + 3, px1, G, COMMUTER_Z + 5, B.Concrete);
  w.fill(px0, G + 1, COMMUTER_Z + 3, px1, G + 1, COMMUTER_Z + 3, B.Yellow); // mind the gap
  w.fill(px0, G + 1, COMMUTER_Z + 4, px1, G + 1, COMMUTER_Z + 5, B.Concrete);
  // Steps up from the north end, and a canopy.
  w.fill(px0 - 1, G, COMMUTER_Z + 3, px0 - 1, G, COMMUTER_Z + 5, B.Concrete);
  for (const x of [px0 + 4, px0 + 14, px0 + 24]) w.fill(x, G + 2, COMMUTER_Z + 5, x, G + 5, COMMUTER_Z + 5, B.Metal);
  w.fill(px0 + 2, G + 6, COMMUTER_Z + 3, px0 + 26, G + 6, COMMUTER_Z + 6, B.RoofRed);

  return [
    {
      id: 'bus',
      kind: 'bus',
      name: 'Main Street Bus Stop',
      pos: new THREE.Vector3(bx + 3.5, G, 85.5),
      facing: 0,
      board: box(bx - 2, G - 1, 84, bx + 9, G + 4, 89),
      lane: { from: new THREE.Vector3(-40, G, 82), stop: new THREE.Vector3(bx + 3.5 - 4.4, G, 82), to: new THREE.Vector3(SIZE + 60, G, 82) },
    },
    {
      id: 'train',
      kind: 'train',
      name: 'Smallville Station',
      pos: new THREE.Vector3(94.5, G + 2, COMMUTER_Z + 4),
      facing: 0,
      board: box(px0, G, COMMUTER_Z + 2, px1, G + 5, COMMUTER_Z + 6),
      lane: { from: new THREE.Vector3(-120, G, COMMUTER_Z), stop: new THREE.Vector3(94.5 - 6.9, G, COMMUTER_Z), to: new THREE.Vector3(SIZE + 120, G, COMMUTER_Z) },
    },
  ];
}

export const smallville: MapDef = {
  id: 'smallville',
  name: 'Smallville',
  size: { x: SIZE, y: HEIGHT, z: SIZE },
  build(world): SmallvilleBuild {
    const town = buildTown(world);
    const stops = stampTransit(world);
    return {
      town,
      spawn: town.spawn,
      groundAt: () => G,
      areas: town.areas,
      stops,
      setup({ scene }) {
        // Commuter rails (the freight line's rails come from Props).
        const mat = new THREE.MeshLambertMaterial({ color: 0x777777 });
        const rails = new THREE.Group();
        for (const dz of [-0.8, 0.8]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 240, 0.25, 0.2), mat);
          r.position.set(SIZE / 2, G + 0.12, COMMUTER_Z + 0.5 + dz);
          rails.add(r);
        }
        const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.15, 3), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }), SIZE);
        const d = new THREE.Object3D();
        for (let i = 0; i < SIZE; i++) {
          d.position.set(i + 0.5, G + 0.05, COMMUTER_Z + 0.5);
          d.updateMatrix();
          ties.setMatrixAt(i, d.matrix);
        }
        rails.add(ties);
        scene.add(rails);
        return { dispose: () => void scene.remove(rails) };
      },
    };
  },
};
