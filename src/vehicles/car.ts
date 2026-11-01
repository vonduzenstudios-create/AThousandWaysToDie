import * as THREE from 'three';
import { RAPIER, G_PLAYER, G_PROP, G_RAGDOLL, G_WORLD, groups } from '../physics';
import { Character, randomAppearance } from '../character';
import type { Rng } from '../util';
import { buildCar, type CarKind, type CarModel, type CarSpec } from './carModel';
import { gearbox } from './handling';
import type { LaneEdge, Path, RoadNode } from './roads';

export type CarMode = 'traffic' | 'parked' | 'driven' | 'wreck';

/** Fixed physics step (game.ts steps at 60 Hz). */
const STEP = 1 / 60;
const _fw = new THREE.Vector3();

const CHASSIS_GROUPS = groups(G_PROP, G_WORLD | G_PROP | G_RAGDOLL | G_PLAYER);
const WHEEL_RAY_GROUPS = groups(G_PROP, G_WORLD | G_PROP);

let nextId = 1;

/**
 * One car. Traffic cars glide along their lane as kinematic bodies (cheap, and fine far
 * from the player where there is no ground collider). A car someone drives, or one that
 * has been rammed, becomes a dynamic body on a ray-cast vehicle controller so it can
 * jump, roll and fly off cliffs.
 */
export class Car {
  readonly id = nextId++;
  readonly model: CarModel;
  readonly spec: CarSpec;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  vc: RAPIER.DynamicRayCastVehicleController | null = null;
  mode: CarMode;
  /** The NPC behind the wheel (traffic only). */
  driver: Character | null = null;
  readonly pos = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  /** Lane speed for traffic, signed forward speed for dynamic cars. */
  speed = 0;
  steer = 0;
  private wheelRot = 0;
  doorOpen = 0;
  private doorTarget = 0;
  braking = false;

  // Traffic routing.
  edge: LaneEdge | null = null;
  path: Path | null = null;
  pathKind: 'lane' | 'turn' = 'lane';
  s = 0;
  next: LaneEdge | null = null;
  /** Cached curve through the next intersection. */
  turn: Path | null = null;
  holding: RoadNode | null = null;
  cruise = 12;
  blockedT = 0;
  honkT = 0;
  /** Texting while driving: doesn't brake for people. */
  distracted = false;
  /** Blown up: charred and smoking, can't be driven. */
  burnt = false;
  screechT = 0;
  /** What traffic AI last braked for (debugging and honking). */
  blockedBy: 'car' | 'person' | 'line' | null = null;

  // Driving state.
  airborne = false;
  airPeakY = 0;
  prevSpeed = 0;
  wheelsOnGround = 0;
  /** Gearbox state for the HUD, engine note and shift kick. */
  gear = 1;
  rpm = 0;
  private shiftT = 0;
  /** Driven wheels spinning faster than the car (burnouts, launches). */
  wheelspin = 0;

  constructor(
    private scene: THREE.Scene,
    private physics: RAPIER.World,
    rng: Rng,
    pos: THREE.Vector3,
    facing: number,
    mode: 'traffic' | 'parked',
    kind?: CarKind,
  ) {
    this.model = buildCar(rng, kind);
    this.spec = this.model.spec;
    this.mode = mode;
    // `pos` is on the road; the body rides above it.
    this.pos.copy(pos);
    this.pos.y += this.spec.ride;
    pos = this.pos;
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing);
    this.body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: this.quat.x, y: this.quat.y, z: this.quat.z, w: this.quat.w }),
    );
    const half = this.spec.half;
    const m = this.spec.handling.mass;
    // Box inertia, with the center of mass pulled down so cars don't roll at the first corner.
    const inertia = { x: (m / 12) * (4 * half.y ** 2 + 4 * half.z ** 2), y: (m / 12) * (4 * half.x ** 2 + 4 * half.z ** 2), z: (m / 12) * (4 * half.x ** 2 + 4 * half.y ** 2) };
    this.collider = physics.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
        .setMassProperties(m, { x: 0, y: -this.spec.handling.comDrop, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
        .setFriction(0.6)
        .setRestitution(0.15)
        .setCollisionGroups(CHASSIS_GROUPS),
      this.body,
    );
    scene.add(this.model.root);
    if (mode === 'traffic') this.seatDriver(new Character(randomAppearance(rng)));
    this.syncVisual(0);
  }

  /** Strength of the physics world's gravity (30 in the game). */
  get gravity() {
    return Math.abs(this.physics.gravity.y) || 30;
  }

  get facing() {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quat);
    return Math.atan2(f.x, f.z);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, 1).applyQuaternion(this.quat);
  }

  /** World position of a point given in the car's local frame. */
  toWorld(local: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(local).applyQuaternion(this.quat).add(this.pos);
  }

  /** The point on the road under the car's center. */
  ground(out = new THREE.Vector3()) {
    return this.toWorld(new THREE.Vector3(0, -this.spec.ride, 0), out);
  }

  /** Velocity of the car in world space. */
  velocity(out = new THREE.Vector3()) {
    if (this.body.isKinematic()) return this.forward(out).multiplyScalar(this.speed);
    const v = this.body.linvel();
    return out.set(v.x, v.y, v.z);
  }

  /** Put a character in the driver's seat in a sitting pose. */
  seatDriver(ch: Character) {
    this.driver = ch;
    this.model.root.add(ch.root);
    sit(ch, this.spec.seat, this.spec.straddle);
  }

  /** Take the character out of the seat (they are re-parented to the scene at their world pose). */
  unseat(): Character | null {
    const ch = this.driver;
    if (!ch) return null;
    this.driver = null;
    this.scene.attach(ch.root);
    return ch;
  }

  openDoor(open: boolean) {
    this.doorTarget = open ? 1 : 0;
  }

  /** Kinematic pose along a lane. `pos` is on the road surface. */
  setRoadPose(roadPos: THREE.Vector3, tan: THREE.Vector3) {
    const yaw = Math.atan2(tan.x, tan.z);
    const pitch = -Math.asin(Math.max(-1, Math.min(1, tan.y)));
    this.quat.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    this.pos.copy(roadPos).y += this.spec.ride;
    this.body.setNextKinematicTranslation(this.pos);
    this.body.setNextKinematicRotation(this.quat);
  }

  /** Snap a kinematic car instantly (spawning, respawning). */
  teleport(roadPos: THREE.Vector3, tan: THREE.Vector3) {
    this.setRoadPose(roadPos, tan);
    this.body.setTranslation(this.pos, true);
    this.body.setRotation(this.quat, true);
  }

  /** Switch to full physics. Used when hijacked or rammed. */
  makeDynamic(mode: 'driven' | 'wreck', vel?: THREE.Vector3) {
    const v = vel ?? this.velocity();
    this.holding?.holders.delete(this.id);
    this.holding = null;
    this.mode = mode;
    if (this.vc) return;
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    this.body.setLinearDamping(0.05);
    this.body.setAngularDamping(0.6);
    this.body.enableCcd(true);
    const vc = this.physics.createVehicleController(this.body);
    // Our cars face +z.
    (vc as unknown as { setIndexForwardAxis: number }).setIndexForwardAxis = 2;
    const h = this.spec.handling;
    this.spec.wheels.forEach((w, i) => {
      vc.addWheel(w, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, this.spec.rest, this.spec.wheelR);
      vc.setWheelSuspensionStiffness(i, h.stiffness);
      vc.setWheelSuspensionCompression(i, h.compression);
      vc.setWheelSuspensionRelaxation(i, h.relaxation);
      vc.setWheelMaxSuspensionTravel(i, h.travel);
      vc.setWheelFrictionSlip(i, i < 2 ? h.grip : h.rearGrip);
      vc.setWheelSideFrictionStiffness(i, 1);
      vc.setWheelMaxSuspensionForce(i, 1e7);
    });
    this.vc = vc;
    this.airPeakY = this.pos.y;
  }

  /** Driver input for a dynamic car. throttle and steer are in [-1, 1], steer positive = right. */
  drive(throttle: number, steerIn: number, handbrake: boolean) {
    const vc = this.vc;
    if (!vc) return;
    const h = this.spec.handling;
    const n = this.spec.wheels.length;
    const fwd = this.speed;
    const m = h.mass;
    // Gearbox: a short torque dip on each upshift makes the gears felt, not just heard.
    const gb = gearbox(h, fwd);
    if (gb.gear > this.gear && throttle > 0.05) this.shiftT = 0.16 + 0.02 * h.gears;
    this.gear = gb.gear;
    this.rpm = gb.rpm;
    this.shiftT = Math.max(0, this.shiftT - STEP);
    let engine = 0;
    let brake = 0;
    if (throttle > 0.05) {
      if (fwd < -1) brake = h.brake * throttle;
      else if (fwd < h.top) {
        const x = Math.max(0, fwd) / h.top;
        // Strong low down, fading to nothing at top speed.
        engine = m * h.accel * throttle * (1 - x * x) * (this.shiftT > 0 ? 0.35 : 1);
        // Hill strength: gravity here is ~3x real, so cancel part of the slope's pull.
        const slope = this.forward(_fw).y;
        if (slope > 0 && this.wheelsOnGround > 1) engine += m * this.gravity * slope * h.climb * throttle;
      }
    } else if (throttle < -0.05) {
      if (fwd > 1) brake = h.brake * -throttle;
      else if (fwd > -h.reverse) engine = m * h.accel * 0.55 * throttle * (1 - Math.min(1, -fwd / h.reverse));
    } else brake = 1.2; // engine braking
    this.braking = brake > 3;
    // Rapier brakes take an impulse per wheel per step.
    const brakeImp = (brake * m * STEP) / n;
    const driven = (i: number) => (h.drive === 'awd' ? true : h.drive === 'fwd' ? i < 2 : i >= 2);
    let nDriven = 0;
    for (let i = 0; i < n; i++) if (driven(i)) nDriven++;
    // Steering gets gentler at speed so the car stays drivable; twitchy cars fade less.
    const steerMax = h.steer / (1 + Math.abs(fwd) / h.steerFade);
    this.steer += (steerIn * steerMax - this.steer) * h.steerRate;
    // Downforce: push the car into the road as speed builds.
    const v = Math.min(1, Math.abs(fwd) / h.top);
    this.body.resetForces(true);
    if (h.downforce > 0 && this.wheelsOnGround > 0) {
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.quat).multiplyScalar(h.downforce * m * this.gravity * 0.4 * v * v);
      this.body.addForce(down, true);
    }
    if (h.balance > 0) this.balance(h.balance, -this.steer * Math.min(1, Math.abs(fwd) / 12) * 0.9);
    const hb = handbrake ? (h.brake * 1.6 * m * STEP) / Math.max(1, n - 2) : 0;
    for (let i = 0; i < n; i++) {
      const front = i < 2;
      vc.setWheelSteering(i, front ? -this.steer : 0); // Rapier steers left for positive angles
      vc.setWheelEngineForce(i, driven(i) ? engine / nDriven : 0);
      vc.setWheelBrake(i, handbrake && !front ? hb : brakeImp);
      const grip = front ? h.grip : h.rearGrip;
      vc.setWheelFrictionSlip(i, handbrake && !front ? grip * 0.38 : grip);
    }
    // Rough wheelspin estimate for smoke: lots of throttle at low speed on a loose car.
    const launch = throttle > 0.5 ? (h.accel / (Math.min(h.grip, h.rearGrip) * 3.5)) * (1 - Math.min(1, Math.abs(fwd) / 14)) : 0;
    this.wheelspin = Math.max(0, launch - 0.55);
  }

  /** Bikes: torque the body toward a lean angle about its forward axis (a PD controller on roll). */
  private balance(k: number, lean: number) {
    const fwd = this.forward(new THREE.Vector3()).setY(0);
    if (fwd.lengthSq() < 1e-4) return;
    fwd.normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);
    if (up.y < 0.2) return; // already down
    const want = new THREE.Vector3(0, 1, 0).applyAxisAngle(fwd, lean);
    const err = new THREE.Vector3().crossVectors(up, want).dot(fwd);
    const av = this.body.angvel();
    const rate = av.x * fwd.x + av.y * fwd.y + av.z * fwd.z;
    const hf = this.spec.half;
    const I = (this.spec.handling.mass / 12) * (4 * hf.x * hf.x + 4 * hf.y * hf.y);
    const t = (k * err - 2 * Math.sqrt(k) * rate) * I * STEP;
    this.body.applyTorqueImpulse({ x: fwd.x * t, y: fwd.y * t, z: fwd.z * t }, true);
  }

  /** Coast a dynamic car nobody is driving. */
  idle() {
    const vc = this.vc;
    if (!vc) return;
    const n = this.spec.wheels.length;
    const brake = (4 * this.spec.handling.mass * STEP) / n;
    this.body.resetForces(true);
    for (let i = 0; i < n; i++) {
      vc.setWheelEngineForce(i, 0);
      vc.setWheelBrake(i, brake);
      vc.setWheelSteering(i, 0);
    }
    this.steer = 0;
    this.wheelspin = 0;
    this.braking = false;
  }

  /** Fixed step for dynamic cars, before the physics step. */
  stepDynamic(h: number) {
    const vc = this.vc;
    if (!vc) return;
    const own = this.collider;
    vc.updateVehicle(h, undefined, WHEEL_RAY_GROUPS, (c) => c !== own);
  }

  /** After the physics step: read the pose back from the body. */
  readBack() {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    if (this.vc) {
      this.prevSpeed = this.speed;
      this.speed = this.vc.currentVehicleSpeed();
      let n = 0;
      const all = this.spec.wheels.length;
      for (let i = 0; i < all; i++) if (this.vc.wheelIsInContact(i)) n++;
      // Normalized to four wheels so "all down" reads the same for a six-wheeled truck.
      this.wheelsOnGround = Math.round((n / all) * 4);
    }
  }

  /** Is the car on its roof or side? */
  get upsideDown() {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);
    return up.y < 0.3;
  }

  /** Per-frame visuals: wheels, door, lights. */
  syncVisual(dt: number) {
    const root = this.model.root;
    root.position.copy(this.pos);
    root.quaternion.copy(this.quat);
    const sp = this.spec;
    this.wheelRot += ((this.speed + this.wheelspin * 30) / sp.wheelR) * dt;
    for (let i = 0; i < sp.wheels.length; i++) {
      const steer = this.model.wheelSteer[i];
      steer.rotation.y = i < 2 ? -this.steer : 0;
      this.model.wheelSpin[i].rotation.x = this.wheelRot;
      if (this.vc) {
        const len = this.vc.wheelSuspensionLength(i) ?? sp.rest;
        steer.position.y = sp.wheels[i].y - len;
      } else steer.position.y = -sp.ride + sp.wheelR;
    }
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 10);
    this.model.door.rotation.y = -this.doorOpen * 1.2;
    this.model.brakeLights.emissive.setHex(this.braking ? 0xff2020 : 0x200000);
  }

  /** Keep a car upright by hand if it is stuck on its roof (used for the player's convenience). */
  flipUpright() {
    const yaw = this.facing;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const t = this.body.translation();
    this.body.setTranslation({ x: t.x, y: t.y + 1.5, z: t.z }, true);
    this.body.setRotation(q, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  dispose() {
    this.holding?.holders.delete(this.id);
    if (this.vc) this.physics.removeVehicleController(this.vc);
    this.physics.removeRigidBody(this.body);
    this.scene.remove(this.model.root);
    if (this.driver) this.driver.dispose();
    this.model.dispose();
  }
}

/** Seated pose: hips on the seat, legs out front, hands on the wheel. */
export function sit(ch: Character, seat: THREE.Vector3, straddle = false) {
  const h = ch.app.height;
  ch.root.position.copy(seat).add(new THREE.Vector3(0, -0.8 * h, 0));
  ch.root.rotation.set(0, 0, 0);
  ch.spinner.rotation.set(0, 0, 0);
  ch.spinner.position.y = 0.9;
  ch.body.scale.set(1, 1, 1);
  const p = ch.parts;
  if (straddle) {
    // Astride: knees down and out, leaning on the bars.
    p.legL.pivot.rotation.set(-0.75, 0, 0.32);
    p.legR.pivot.rotation.set(-0.75, 0, -0.32);
    p.armL.pivot.rotation.set(-1.15, 0, 0.3);
    p.armR.pivot.rotation.set(-1.15, 0, -0.3);
  } else {
    p.legL.pivot.rotation.set(-1.5, 0, 0);
    p.legR.pivot.rotation.set(-1.5, 0, 0);
    p.armL.pivot.rotation.set(-1.25, 0, 0.1);
    p.armR.pivot.rotation.set(-1.25, 0, -0.1);
  }
  ch.root.visible = true;
}
