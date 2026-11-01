import * as THREE from 'three';
import { RAPIER, G_ALL, G_PROP, groups } from '../physics';
import type { TravelKind, TravelStop } from '../maps/types';
import type { Rng } from '../util';
import { makeVehicle, type VehicleModel } from './vehicles';

/** Fired when a scheduled vehicle docks at, or pulls away from, a stop. */
export interface TransitEvent {
  mapId: string;
  stopId: string;
  kind: TravelKind;
  /** Where passengers step on and off (feet height). */
  door: THREE.Vector3;
  /** Seconds the vehicle stays docked. */
  dwell: number;
}

type Listener = (e: TransitEvent) => void;
const arriveListeners = new Set<Listener>();
const departListeners = new Set<Listener>();

/** Subscribe to arrivals on whatever map is loaded. Returns an unsubscribe function. */
export function onArrive(fn: Listener) {
  arriveListeners.add(fn);
  return () => arriveListeners.delete(fn);
}
/** Subscribe to departures on whatever map is loaded. Returns an unsubscribe function. */
export function onDepart(fn: Listener) {
  departListeners.add(fn);
  return () => departListeners.delete(fn);
}

export type Phase = 'idle' | 'arriving' | 'dwell' | 'departing';

const TIMING: Record<TravelKind, { speed: number; dwell: number; gap: number }> = {
  bus: { speed: 14, dwell: 9, gap: 25 },
  train: { speed: 22, dwell: 12, gap: 40 },
  plane: { speed: 34, dwell: 14, gap: 55 },
  boat: { speed: 8, dwell: 14, gap: 45 },
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;

/** One stop's vehicle and its timetable. */
export class Service {
  readonly model: VehicleModel;
  readonly from: THREE.Vector3;
  readonly at: THREE.Vector3;
  readonly to: THREE.Vector3;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  phase: Phase = 'idle';
  /** Seconds into the current phase. */
  t = 0;
  dur = 0;
  /** Seconds until the next arrival while idle. */
  next: number;
  /** Extra dwell requested (e.g. waiting for the player to board). */
  hold = 0;
  private body: RAPIER.RigidBody;
  private travelled = 0;
  readonly timing: { speed: number; dwell: number; gap: number };

  constructor(
    readonly stop: TravelStop,
    readonly kind: TravelKind,
    private scene: THREE.Scene,
    physics: RAPIER.World,
    rng: Rng,
    waterLevel: number | undefined,
  ) {
    this.model = makeVehicle(kind);
    this.timing = TIMING[kind];
    const fwd = new THREE.Vector3(Math.sin(stop.facing), 0, Math.cos(stop.facing));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x); // road direction when none is given
    if (stop.lane) {
      this.from = stop.lane.from.clone();
      this.at = stop.lane.stop.clone();
      this.to = stop.lane.to.clone();
    } else {
      // The vehicle stops behind where the passenger steps off, so the door faces them.
      this.at = stop.pos.clone().addScaledVector(fwd, -(this.model.door.z + 0.2)).addScaledVector(right, -this.model.door.x);
      const reach = kind === 'plane' ? 360 : 140;
      this.from = this.at.clone().addScaledVector(right, -reach);
      this.to = this.at.clone().addScaledVector(right, reach);
    }
    if (kind === 'boat' && waterLevel !== undefined) for (const p of [this.from, this.at, this.to]) p.y = waterLevel - 0.6;
    if (kind === 'plane') this.from.y += 70;
    this.next = 2 + rng() * this.timing.gap * 0.6;
    this.model.group.visible = false;
    scene.add(this.model.group);
    const h = this.model.half;
    this.body = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -500, 0));
    physics.createCollider(
      RAPIER.ColliderDesc.cuboid(h.x, h.y, Math.min(h.z, 3)).setTranslation(0, h.y, 0).setCollisionGroups(groups(G_PROP, G_ALL)).setFriction(0.8),
      this.body,
    );
    this.place(this.from, this.at.clone().sub(this.from));
  }

  /** Door position in world space. */
  door(out = new THREE.Vector3()) {
    return out.copy(this.model.door).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.pos);
  }

  /** A world point in the vehicle's local frame (x forward, z right/door side). */
  toLocal(p: THREE.Vector3) {
    return p.clone().sub(this.pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
  }

  get speed() {
    return this.vel.length();
  }

  private place(p: THREE.Vector3, dir: THREE.Vector3) {
    if (dir.lengthSq() > 1e-6) this.yaw = Math.atan2(-dir.z, dir.x);
    this.pos.copy(p);
    this.model.group.position.copy(p);
    this.model.group.rotation.y = this.yaw;
    if (this.kind === 'plane') {
      // Nose down on approach, nose up on climb.
      const pitch = this.phase === 'arriving' ? -0.12 * (1 - this.t / Math.max(this.dur, 0.01)) : this.phase === 'departing' && p.y > this.at.y + 0.5 ? 0.18 : 0;
      this.model.group.rotation.z = pitch;
    }
    if (this.kind === 'boat') this.model.group.rotation.x = Math.sin(performance.now() / 700) * 0.03;
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    const q = new THREE.Quaternion().setFromEuler(this.model.group.rotation);
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }

  private emit(set: Set<Listener>, mapId: string) {
    const e: TransitEvent = { mapId, stopId: this.stop.id, kind: this.kind, door: this.door(), dwell: this.timing.dwell + this.hold };
    for (const fn of set) fn(e);
  }

  /** Start the approach immediately, wherever the vehicle is (used when the player arrives on it). */
  arriveNow() {
    this.place(this.from, this.at.clone().sub(this.from));
    this.begin('arriving');
  }

  /** Start pulling in right now (no-op unless idle). */
  call() {
    if (this.phase === 'idle') this.next = Math.min(this.next, 0);
  }

  private begin(phase: Phase) {
    this.phase = phase;
    this.t = 0;
    if (phase === 'arriving') this.dur = THREE.MathUtils.clamp(this.from.distanceTo(this.at) / this.timing.speed, 4, 14);
    else if (phase === 'departing') this.dur = THREE.MathUtils.clamp(this.to.distanceTo(this.at) / this.timing.speed, 4, 14);
    else if (phase === 'dwell') this.dur = this.timing.dwell;
    this.model.group.visible = phase !== 'idle';
  }

  step(h: number, mapId: string) {
    const before = this.pos.clone();
    this.t += h;
    if (this.phase === 'idle') {
      this.next -= h;
      if (this.next <= 0) this.begin('arriving');
      else {
        this.vel.set(0, 0, 0);
        return;
      }
    }
    if (this.phase === 'arriving') {
      const u = Math.min(1, this.t / this.dur);
      const e = easeOut(u);
      const p = this.from.clone().lerp(this.at, e);
      if (this.kind === 'plane') p.y = this.at.y + (this.from.y - this.at.y) * Math.pow(1 - Math.min(1, u * 1.35), 2);
      this.place(p, this.at.clone().sub(this.from));
      if (u >= 1) {
        this.begin('dwell');
        this.emit(arriveListeners, mapId);
      }
    } else if (this.phase === 'dwell') {
      this.place(this.at, this.at.clone().sub(this.from));
      if (this.t >= this.dur + this.hold) {
        this.hold = 0;
        this.emit(departListeners, mapId);
        this.begin('departing');
      }
    } else if (this.phase === 'departing') {
      const u = Math.min(1, this.t / this.dur);
      const p = this.at.clone().lerp(this.to, easeIn(u));
      if (this.kind === 'plane') p.y = this.at.y + Math.pow(Math.max(0, (u - 0.45) / 0.55), 1.6) * 90;
      this.place(p, this.to.clone().sub(this.at));
      if (u >= 1) {
        this.begin('idle');
        this.next = this.timing.gap * (0.7 + Math.random() * 0.6);
        this.place(this.from, this.at.clone().sub(this.from));
      }
    }
    this.vel.copy(this.pos).sub(before).divideScalar(h);
    if (this.phase === 'idle') this.vel.set(0, 0, 0);
    this.travelled += this.vel.length() * h;
    for (const s of this.model.spinners) s.obj.rotation[s.axis] = this.kind === 'plane' && s.axis === 'x' ? performance.now() / 30 : this.travelled * s.rate;
  }

  /** Is p (player center) inside this moving vehicle's body? */
  hits(p: THREE.Vector3, minSpeed = 2.5) {
    if (this.phase === 'idle' || this.speed < minSpeed) return false;
    const l = this.toLocal(p);
    const h = this.model.half;
    const hz = this.kind === 'plane' ? 2.4 : h.z;
    return Math.abs(l.x) < h.x + 0.4 && Math.abs(l.z) < hz + 0.4 && l.y > -0.8 && l.y < h.y * 2 + 0.6;
  }

  dispose() {
    this.scene.remove(this.model.group);
  }
}

/** All the scheduled vehicles on the loaded map. */
export class Transit {
  readonly services = new Map<string, Service>();

  constructor(
    readonly mapId: string,
    stops: TravelStop[],
    scene: THREE.Scene,
    physics: RAPIER.World,
    rng: Rng,
    waterLevel?: number,
  ) {
    for (const s of stops) this.services.set(s.id, new Service(s, s.kind, scene, physics, rng, waterLevel));
  }

  get(stopId: string) {
    return this.services.get(stopId);
  }

  step(h: number) {
    for (const s of this.services.values()) s.step(h, this.mapId);
  }

  /** The moving vehicle the point is inside, if any. */
  hit(p: THREE.Vector3) {
    for (const s of this.services.values()) if (s.hits(p)) return s;
    return null;
  }

  dispose() {
    for (const s of this.services.values()) s.dispose();
    this.services.clear();
  }
}
