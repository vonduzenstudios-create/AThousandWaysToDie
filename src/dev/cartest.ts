import * as THREE from 'three';
import { RAPIER, G_WORLD, G_ALL, groups } from '../physics';
import { Car } from '../vehicles/car';
import { CAR_KINDS, type CarKind } from '../vehicles/carModel';
import { mulberry32 } from '../util';

/**
 * Headless handling test track (open /cartest.html). No rendering: each model runs a flat sprint,
 * a stop, a full-lock corner and a 25% hill climb on the same gravity as the game (-30), and the
 * numbers land in window.results and on the page. ?kinds=jeep,quad limits the run.
 */
interface Result {
  kind: CarKind;
  t30: number | null;
  t60: number | null;
  mph10s: number;
  stopFrom60: number | null;
  stopDist60: number | null;
  turnDeg3s: number;
  maxLeanDeg: number;
  flippedInTurn: boolean;
  hillMph: number;
  hillClimbed: boolean;
}

const H = 1 / 60;
const MPH = 2.237;

async function main() {
  await RAPIER.init();
  const kinds = (new URLSearchParams(location.search).get('kinds')?.split(',') as CarKind[]) ?? CAR_KINDS;
  const out: Result[] = [];
  for (const kind of kinds) out.push(run(kind));
  (window as unknown as { results: Result[] }).results = out;
  document.getElementById('out')!.textContent = out.map((r) => JSON.stringify(r)).join('\n');
}

function world() {
  const physics = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const g = groups(G_WORLD, G_ALL);
  const ground = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  // Flat pad 2 km long along +z.
  physics.createCollider(RAPIER.ColliderDesc.cuboid(200, 1, 1200).setTranslation(0, -1, 900).setCollisionGroups(g), ground);
  // A 25% grade ramp off to the side (x = 100), climbing toward +z.
  const ang = Math.atan(0.25);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -ang);
  const len = 120;
  physics.createCollider(
    RAPIER.ColliderDesc.cuboid(10, 1, len / 2)
      .setTranslation(100, Math.sin(ang) * (len / 2) - Math.cos(ang), 20 + Math.cos(ang) * (len / 2) + Math.sin(ang))
      .setRotation(q)
      .setCollisionGroups(g),
    ground,
  );
  return physics;
}

function run(kind: CarKind): Result {
  const scene = new THREE.Scene();
  const physics = world();
  const spawn = (x: number, z: number) => {
    const c = new Car(scene, physics, mulberry32(3), new THREE.Vector3(x, 0, z), 0, 'parked', kind);
    c.makeDynamic('driven', new THREE.Vector3());
    return c;
  };
  const step = (c: Car, thr: number, steer = 0) => {
    c.drive(thr, steer, false);
    c.stepDynamic(H);
    physics.step();
    c.readBack();
  };
  // Settle and sprint.
  let car = spawn(0, 0);
  for (let i = 0; i < 60; i++) step(car, 0);
  let t30: number | null = null, t60: number | null = null, mph10s = 0;
  for (let i = 0; i < 600; i++) {
    step(car, 1);
    const mph = car.speed * MPH;
    if (t30 === null && mph >= 30) t30 = +(i * H).toFixed(2);
    if (t60 === null && mph >= 60) t60 = +(i * H).toFixed(2);
    mph10s = mph;
  }
  // Brake from 60 (or whatever it reached).
  let stopFrom60: number | null = null, stopDist60: number | null = null;
  car.dispose();
  car = spawn(0, 0);
  for (let i = 0; i < 60; i++) step(car, 0);
  for (let i = 0; i < 1200 && car.speed * MPH < 60; i++) step(car, 1);
  if (car.speed * MPH >= 59) {
    const z0 = car.pos.z;
    let i = 0;
    for (; i < 900 && car.speed > 0.3; i++) step(car, -1);
    stopFrom60 = +(i * H).toFixed(2);
    stopDist60 = +(car.pos.z - z0).toFixed(1);
  }
  // Corner at 35 mph, full lock for 3 s.
  car.dispose();
  car = spawn(0, 0);
  for (let i = 0; i < 60; i++) step(car, 0);
  for (let i = 0; i < 1200 && car.speed < 15.6; i++) step(car, 1);
  let yaw = 0, prev = car.facing, lean = 0, flipped = false;
  for (let i = 0; i < 180; i++) {
    step(car, car.speed < 15.6 ? 0.8 : 0, -1);
    let d = car.facing - prev;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    yaw += d;
    prev = car.facing;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(car.quat).y;
    lean = Math.max(lean, Math.acos(Math.min(1, up)) * 57.3);
    if (up < 0.3) flipped = true;
  }
  // Hill: from a standstill at the foot of the 25% ramp.
  car.dispose();
  car = spawn(100, 5);
  for (let i = 0; i < 60; i++) step(car, 0);
  let hillMph = 0;
  for (let i = 0; i < 900; i++) {
    step(car, 1);
    if (car.pos.z > 40 && car.pos.z < 120) hillMph = Math.max(hillMph, car.speed * MPH);
  }
  const climbed = car.pos.z > 120;
  car.dispose();
  return { kind, t30, t60, mph10s: Math.round(mph10s), stopFrom60, stopDist60, turnDeg3s: Math.round(Math.abs(yaw) * 57.3), maxLeanDeg: +lean.toFixed(1), flippedInTurn: flipped, hillMph: Math.round(hillMph), hillClimbed: climbed };
}

main();
