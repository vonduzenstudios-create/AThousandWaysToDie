import * as THREE from 'three';
import { G, type TownInfo } from '../town';
import type { Blip } from '../minimap';
import type { TrafficConfig } from './roads';

/** Roads and parked cars for Smallville. The road network comes straight from the town layout. */
export function smallvilleTraffic(t: TownInfo): TrafficConfig {
  const v = (x: number, z: number) => new THREE.Vector3(x, G, z);
  return {
    roads: t.roads.map((r) => ({ points: r.points.map((p) => p.clone()), width: r.width })),
    parked: [
      { pos: v(320.5, 244), facing: Math.PI }, // Duke's Garage, on Main St
      { pos: v(203, 265), facing: 0 }, // police lot
      { pos: v(264, 236), facing: Math.PI / 2 }, // outside the diner
      { pos: v(112, 200), facing: 0 }, // farm truck by the barn
      { pos: v(470, 228), facing: Math.PI / 2 }, // Feed & Seed lot
      { pos: v(400, 236), facing: Math.PI / 2 }, // town hall
      { pos: v(372, 371), facing: Math.PI / 2 }, // 12 Maple St
    ],
    // A sleepy small town: a car every few blocks, not a traffic jam.
    density: 0.3,
    maxCars: 20,
    speed: 12,
  };
}

/** Landmark badges for the radar. */
export function smallvillePois(t: TownInfo): Blip[] {
  return [
    { x: 323, z: 262, kind: 'poi', label: 'G', color: '#ffb84a' },
    { x: 267, z: 218, kind: 'poi', label: 'D', color: '#ff7a7a' },
    { x: 172, z: 262, kind: 'poi', label: 'P', color: '#7ab0ff' },
    { x: t.barnDoor.knock.x, z: 195, kind: 'poi', label: 'F', color: '#c9a36a' },
    { x: 418, z: 100, kind: 'poi', label: 'W', color: '#9fd6f0' },
    { x: 180, z: 92, kind: 'poi', label: 'T', color: '#8fdc6a' },
    { x: 200, z: 180, kind: 'poi', label: '$', color: '#5ad17a' },
    { x: 472, z: 202, kind: 'poi', label: 'F', color: '#c9a36a' },
    { x: 250, z: 40, kind: 'poi', label: 'S', color: '#d8d8d8' },
    { x: 408, z: 236, kind: 'poi', label: 'B', color: '#5a9aff' },
    { x: 380, z: 276, kind: 'poi', label: '+', color: '#ffffff' },
    { x: 366, z: 360, kind: 'poi', label: '12', color: '#f5c400' },
  ];
}
