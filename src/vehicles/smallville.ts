import * as THREE from 'three';
import { G, SIZE, type TownInfo } from '../town';
import type { Blip } from '../minimap';
import type { TrafficConfig } from './roads';

/** Roads and parked cars for the current Smallville layout (main street crossing at 80, 80). */
export function smallvilleTraffic(): TrafficConfig {
  const c = 80.5; // road center: asphalt runs 77..83
  const v = (x: number, z: number) => new THREE.Vector3(x, G, z);
  return {
    roads: [
      { points: [v(c, 0.5), v(c, SIZE - 0.5)], width: 7 },
      { points: [v(0.5, c), v(SIZE - 0.5, c)], width: 7 },
    ],
    parked: [
      { pos: v(70.5, 98), facing: 0 }, // Duke's Garage lot
      { pos: v(71, 72), facing: Math.PI }, // police station
      { pos: v(95, 87.5), facing: Math.PI / 2 }, // diner
      { pos: v(124, 90), facing: 0 }, // farm truck by the barn
    ],
    density: 2.6,
    speed: 12,
  };
}

/** Landmark badges for the radar. */
export function smallvillePois(t: TownInfo): Blip[] {
  return [
    { x: 59, z: 98, kind: 'poi', label: 'G', color: '#ffb84a' },
    { x: 94, z: 96, kind: 'poi', label: 'D', color: '#ff7a7a' },
    { x: 53, z: 66, kind: 'poi', label: 'P', color: '#7ab0ff' },
    { x: t.barnDoor.knock.x, z: 99, kind: 'poi', label: 'F', color: '#c9a36a' },
    { x: 120, z: 40, kind: 'poi', label: 'W', color: '#9fd6f0' },
    { x: 30, z: 30, kind: 'poi', label: 'T', color: '#8fdc6a' },
  ];
}
