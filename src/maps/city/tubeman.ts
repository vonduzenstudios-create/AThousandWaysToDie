import * as THREE from 'three';
import type { DeathDef } from '../../deaths';
import type { MapContext, MapRuntime } from '../types';

/** Moved from Smallville with Honest Al, who now works the lot at Crazy Larry Motors. */
export const TUBEMAN_DEATH: DeathDef = {
  id: 'tubeman',
  name: 'Wacky Inflatable Exit',
  category: 'Machines',
  location: 'Crazy Larry Motors',
  payout: 1200,
  blurb: "Climbed into the tube man's fan. Flailed one last time.",
};

const box = (w: number, h: number, d: number, color: number, y = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.y = y;
  m.castShadow = true;
  return m;
};

/** The flailing tube man on the dealership lot. `at` is the fan's base on the ground. */
export function setupTubeMan(ctx: MapContext, at: THREE.Vector3): MapRuntime {
  const { scene, game } = ctx;
  const root = new THREE.Group();
  root.position.copy(at);
  scene.add(root);
  root.add(box(1.4, 0.6, 1.4, 0x555a60, 0.3)); // fan housing
  const colors = [0xff3a3a, 0xff6a2a, 0xff3a3a, 0xffd23a, 0xff3a3a, 0xff3a3a];
  const segs: THREE.Group[] = [];
  let parent: THREE.Object3D = root;
  colors.forEach((c, i) => {
    const pivot = new THREE.Group();
    pivot.position.y = i === 0 ? 0.6 : 1.1;
    pivot.add(box(0.9, 1.1, 0.9, c, 0.55));
    parent.add(pivot);
    segs.push(pivot);
    parent = pivot;
  });

  return {
    interactables: [{ id: 'tubeman', pos: at.clone(), radius: 2.6, prompt: "Climb into the tube man's fan", enabled: true }],
    interact(id) {
      if (id !== 'tubeman') return;
      const ch = game.character;
      if (!ch || !game.body) return;
      game.player.lock(true);
      game.sound.noise({ dur: 1.5, vol: 0.5, freq: 400, freq2: 1600 });
      game.runSeq([
        ...Array.from({ length: 8 }, (_, i) => ({ at: i * 0.1, fn: () => (ch.kick(i % 2 ? 0.6 : -0.6), game.shake(0.2)) })),
        {
          at: 0.9,
          fn: () => game.kill('tubeman', { kind: 'ragdoll', vel: new THREE.Vector3((Math.random() - 0.5) * 12, 34, (Math.random() - 0.5) * 12), spin: 24, bounce: 0.6 }),
        },
      ]);
    },
    update(_dt, time) {
      segs.forEach((s, i) => {
        s.rotation.z = Math.sin(time * 5 + i * 1.3) * (0.25 + i * 0.05);
        s.rotation.x = Math.cos(time * 4 + i) * 0.15;
      });
    },
    dispose() {
      scene.remove(root);
    },
  };
}
