import * as THREE from 'three';
import { RAPIER, G_PLAYER, G_PROP, G_RAGDOLL, G_WORLD, groups } from '../physics';
import { Character, randomAppearance } from '../character';
import type { Rng } from '../util';
import { buildCar, HALF, RIDE, SEAT, WHEEL_R, WHEELS, type CarKind, type CarModel } from './carModel';
import type { LaneEdge, Path, RoadNode } from './roads';

export type CarMode = 'traffic' | 'parked' | 'driven' | 'wreck';

const SUSPENSION = 0.5;
const MAX_STEER = 0.55;
const ENGINE = 5200;
const TOP_SPEED = 34;
const REVERSE_SPEED = 10;
const BRAKE = 55;

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
    this.mode = mode;
    this.pos.copy(pos);
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing);
    this.body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: this.quat.x, y: this.quat.y, z: this.quat.z, w: this.quat.w }),
    );
    this.collider = physics.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF.x, HALF.y + 0.2, HALF.z).setTranslation(0, 0.15, 0).setDensity(90).setFriction(0.6).setRestitution(0.15).setCollisionGroups(CHASSIS_GROUPS),
      this.body,
    );
    scene.add(this.model.root);
    if (mode === 'traffic') this.seatDriver(new Character(randomAppearance(rng)));
    this.syncVisual(0);
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
    return this.toWorld(new THREE.Vector3(0, -RIDE, 0), out);
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
    sit(ch);
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
    this.pos.copy(roadPos).y += RIDE;
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
    WHEELS.forEach((w, i) => {
      vc.addWheel(w, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, SUSPENSION, WHEEL_R);
      vc.setWheelSuspensionStiffness(i, 40);
      vc.setWheelSuspensionCompression(i, 2.4);
      vc.setWheelSuspensionRelaxation(i, 2.8);
      vc.setWheelMaxSuspensionTravel(i, 0.45);
      vc.setWheelFrictionSlip(i, i < 2 ? 2.4 : 2.1);
      vc.setWheelSideFrictionStiffness(i, 1);
      vc.setWheelMaxSuspensionForce(i, 1e6);
    });
    this.vc = vc;
    this.airPeakY = this.pos.y;
  }

  /** Driver input for a dynamic car. throttle and steer are in [-1, 1], steer positive = right. */
  drive(throttle: number, steerIn: number, handbrake: boolean) {
    const vc = this.vc;
    if (!vc) return;
    const fwd = this.speed;
    let engine = 0;
    let brake = 0;
    if (throttle > 0.05) {
      if (fwd < -1) brake = BRAKE * throttle;
      else if (fwd < TOP_SPEED) engine = ENGINE * throttle * (1 - Math.max(0, fwd) / (TOP_SPEED * 1.15));
    } else if (throttle < -0.05) {
      if (fwd > 1) brake = BRAKE * -throttle;
      else if (fwd > -REVERSE_SPEED) engine = ENGINE * 0.6 * throttle;
    } else brake = 3; // engine braking
    this.braking = brake > 5;
    // Steering gets gentler at speed so the car stays drivable.
    const steerMax = MAX_STEER / (1 + Math.abs(fwd) / 22);
    this.steer += (steerIn * steerMax - this.steer) * 0.18;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      vc.setWheelSteering(i, front ? -this.steer : 0); // Rapier steers left for positive angles
      vc.setWheelEngineForce(i, front ? 0 : engine);
      vc.setWheelBrake(i, handbrake && !front ? BRAKE * 1.5 : brake);
      vc.setWheelFrictionSlip(i, handbrake && !front ? 0.9 : front ? 2.4 : 2.1);
    }
  }

  /** Coast a dynamic car nobody is driving. */
  idle() {
    const vc = this.vc;
    if (!vc) return;
    for (let i = 0; i < 4; i++) {
      vc.setWheelEngineForce(i, 0);
      vc.setWheelBrake(i, 6);
      vc.setWheelSteering(i, 0);
    }
    this.steer = 0;
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
      for (let i = 0; i < 4; i++) if (this.vc.wheelIsInContact(i)) n++;
      this.wheelsOnGround = n;
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
    this.wheelRot += (this.speed / WHEEL_R) * dt;
    for (let i = 0; i < 4; i++) {
      const steer = this.model.wheelSteer[i];
      steer.rotation.y = i < 2 ? -this.steer : 0;
      this.model.wheelSpin[i].rotation.x = this.wheelRot;
      if (this.vc) {
        const len = this.vc.wheelSuspensionLength(i) ?? SUSPENSION;
        steer.position.y = WHEELS[i].y - len;
      } else steer.position.y = -RIDE + WHEEL_R;
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
export function sit(ch: Character) {
  const h = ch.app.height;
  ch.root.position.copy(SEAT).add(new THREE.Vector3(0, -(ch.hip - 0.1) * h, 0));
  ch.root.rotation.set(0, 0, 0);
  ch.spinner.rotation.set(0, 0, 0);
  ch.spinner.position.y = ch.hip;
  ch.body.scale.set(1, 1, 1);
  const p = ch.parts;
  p.legL.pivot.rotation.set(-1.5, 0, 0);
  p.legR.pivot.rotation.set(-1.5, 0, 0);
  p.armL.pivot.rotation.set(-1.25, 0, 0.1);
  p.armR.pivot.rotation.set(-1.25, 0, -0.1);
  ch.bend(1.45, 1.45, -0.35);
  ch.root.visible = true;
}
