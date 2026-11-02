import * as THREE from 'three';
import type { RAPIER } from '../physics';
import { mulberry32, type Rng } from '../util';
import { Car } from './car';
import { RoadGraph, type LaneEdge, type Path, type TrafficConfig } from './roads';

/** Something traffic should not drive through (a person, a train car). */
export interface Obstacle {
  pos: THREE.Vector3;
  /** True for people: distracted drivers don't see them. */
  person?: boolean;
  /** Tag so the game can tell who is being honked at. */
  tag?: string;
}

const ACCEL = 7;
const BRAKE = 16;
const LOOK = 38;
const MAX_WRECKS = 6;

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Every car on the map: AI traffic, parked cars, the one the player drives, and wrecks. */
export class Traffic {
  readonly graph: RoadGraph;
  readonly cars: Car[] = [];
  private rng: Rng;
  private target: number;
  private cruise: number;
  /** Called when a traffic car leans on the horn. `tag` is the obstacle that's in the way. */
  onHonk: ((car: Car, tag: string | undefined) => void) | null = null;
  /** Called when a car has waited a while for someone (not the player) standing in the road. */
  onShoo: ((car: Car, tag: string | undefined) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private physics: RAPIER.World,
    private config: TrafficConfig,
    seed = 4242,
  ) {
    this.rng = mulberry32(seed);
    this.graph = new RoadGraph(config.roads);
    this.cruise = config.speed ?? 12;
    const lanes = this.graph.edges.length ? this.graph.totalLaneLength() : 0;
    // Density scales with road length, capped so a big map doesn't turn into a parking lot.
    this.target = Math.min(config.maxCars ?? 30, Math.round((lanes / 100) * (config.density ?? 0.5)));
    for (let i = 0; i < this.target; i++) this.spawnTraffic(null, true);
    for (const pk of config.parked ?? []) {
      this.cars.push(new Car(scene, physics, this.rng, pk.pos.clone(), pk.facing, 'parked', pk.kind));
    }
  }

  get trafficCount() {
    return this.cars.filter((c) => c.mode === 'traffic').length;
  }

  /** Put a new traffic car on a random lane, away from other cars (and the player, if given). */
  private spawnTraffic(avoid: THREE.Vector3 | null, anywhere = false, reuse?: Car) {
    const edges = this.graph.edges;
    if (!edges.length) return null;
    for (let tries = 0; tries < 30; tries++) {
      const e = edges[Math.floor(this.rng() * edges.length)];
      const path = this.graph.lanePath(e);
      if (path.len < 8) continue;
      const s = anywhere ? this.rng() * path.len : Math.min(2, path.len * 0.2);
      path.at(s, _p, _t);
      if (this.cars.some((c) => c !== reuse && c.pos.distanceTo(_p) < 12)) continue;
      if (avoid && _p.distanceTo(avoid) < 45) continue;
      const models = this.config.models;
      const kind = models?.length ? models[Math.floor(this.rng() * models.length)] : undefined;
      const car = reuse ?? new Car(this.scene, this.physics, this.rng, _p, 0, 'traffic', kind);
      if (!reuse) this.cars.push(car);
      car.edge = e;
      car.path = path;
      car.pathKind = 'lane';
      car.s = s;
      car.next = this.chooseNext(e);
      car.turn = null;
      car.cruise = this.cruise * car.spec.handling.cruise * (0.8 + this.rng() * 0.4);
      car.speed = anywhere ? car.cruise : car.cruise * 0.6;
      car.blockedT = 0;
      car.distracted = this.rng() < 0.18;
      car.teleport(_p, _t);
      return car;
    }
    return null;
  }

  /** The curve this car will take at the end of its lane (cached). */
  private turnFor(car: Car): Path {
    if (!car.turn) car.turn = this.graph.turnPath(car.edge!, car.next!);
    return car.turn;
  }

  private chooseNext(e: LaneEdge): LaneEdge {
    const outs = e.to.out.filter((o) => o !== e.twin);
    if (!outs.length) return e.twin!;
    // Mild preference for going straight.
    const d = _f.subVectors(e.to.pos, e.from.pos).normalize();
    const weights = outs.map((o) => {
      const od = _r.subVectors(o.to.pos, o.from.pos).normalize();
      return 1 + Math.max(0, d.dot(od)) * 1.5;
    });
    let r = this.rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < outs.length; i++) {
      r -= weights[i];
      if (r <= 0) return outs[i];
    }
    return outs[outs.length - 1];
  }

  /** Distance to the nearest thing ahead in this car's lane, and what it is. */
  private gapAhead(car: Car, obstacles: Obstacle[]) {
    const fwd = car.forward(_f);
    fwd.y = 0;
    fwd.normalize();
    const right = _r.set(-fwd.z, 0, fwd.x);
    let gap = Infinity;
    let tag: string | undefined;
    let what: 'car' | 'person' | 'line' | null = null;
    // A car crossing an intersection ignores cars waiting at its edge, and if it is still
    // stuck after a while it creeps through anyway (a nudge beats gridlock).
    const crossing = car.holding !== null;
    for (const o of this.cars) {
      if (o === car) continue;
      if (crossing && (car.blockedT > 4 || (o.blockedBy === 'line' && o.speed < 0.5))) continue;
      const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
      const along = dx * fwd.x + dz * fwd.z;
      if (along <= 0 || along > LOOK) continue;
      if (Math.abs(dx * right.x + dz * right.z) > 2.6) continue;
      if (Math.abs(o.pos.y - car.pos.y) > 4) continue;
      const g = along - car.spec.half.z - o.spec.half.z - 0.6;
      if (g < gap) {
        gap = g;
        what = 'car';
        tag = o.mode === 'driven' ? 'player' : undefined;
      }
    }
    for (const o of obstacles) {
      if (o.person && car.distracted) continue;
      const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
      const along = dx * fwd.x + dz * fwd.z;
      if (along <= 0 || along > LOOK) continue;
      if (Math.abs(dx * right.x + dz * right.z) > 2.1) continue;
      if (Math.abs(o.pos.y - (car.pos.y - car.spec.ride)) > 3) continue;
      const g = along - car.spec.half.z - 1.2;
      if (g < gap) {
        gap = g;
        what = 'person';
        tag = o.tag;
      }
    }
    // Wait at the line if someone else is crossing the intersection.
    if (car.pathKind === 'lane' && car.edge && car.path && this.graph.isJunction(car.edge.to)) {
      if (!this.graph.canEnter(car.edge.to, car.id, this.turnFor(car))) {
        const g = car.path.len - car.s - 0.5;
        if (g < gap) {
          gap = g;
          what = 'line';
          tag = undefined;
        }
      }
    }
    return { gap, what, tag };
  }

  /**
   * Fixed step, before physics. Moves traffic along its lanes. `obstacles` are people and
   * things traffic should brake for. `player` is where the camera's focus is (for spawning
   * out of sight).
   */
  step(h: number, obstacles: Obstacle[], player: THREE.Vector3) {
    for (const car of this.cars) {
      if (car.mode === 'traffic') this.stepTraffic(car, h, obstacles, player);
      else if (car.mode === 'wreck') {
        car.idle();
        car.stepDynamic(h);
      } else if (car.mode === 'driven') car.stepDynamic(h);
    }
  }

  private stepTraffic(car: Car, h: number, obstacles: Obstacle[], player: THREE.Vector3) {
    if (!car.path || !car.edge || !car.next) return;
    const { gap, what, tag } = this.gapAhead(car, obstacles);
    car.blockedBy = what;
    // Speed that still lets us stop before the gap closes.
    const safe = Math.sqrt(2 * BRAKE * 0.7 * Math.max(0, gap - 0.5));
    const want = Math.min(car.cruise, safe);
    if (want < car.speed) car.speed = Math.max(want, car.speed - BRAKE * h * (gap < 2 ? 2 : 1));
    else car.speed = Math.min(want, car.speed + ACCEL * h);
    car.braking = want < car.speed + 0.5 && car.speed < car.cruise - 1;
    if (car.speed < 0.3 && what) {
      car.blockedT += h;
      car.honkT -= h;
      if (what !== 'line' && car.blockedT > 1.2 && car.honkT <= 0) {
        car.honkT = 2 + this.rng() * 2;
        this.onHonk?.(car, tag);
        if (what === 'person' && tag !== 'player') this.onShoo?.(car, tag);
      }
      // Stuck behind a wreck for ages: quietly move on, if nobody is watching.
      if (car.blockedT > 12 && car.pos.distanceTo(player) > 40) {
        this.spawnTraffic(player, true, car);
        return;
      }
    } else car.blockedT = 0;

    car.s += car.speed * h;
    while (car.path && car.s >= car.path.len) {
      if (car.pathKind === 'lane') {
        const node = car.edge.to;
        if (node.out.length === 1) {
          // Dead end (usually the map edge): the car drives off and a new one arrives elsewhere.
          this.spawnTraffic(player, false, car);
          return;
        }
        if (this.graph.isJunction(node)) {
          if (!this.graph.canEnter(node, car.id, this.turnFor(car))) {
            car.s = car.path.len;
            car.speed = 0;
            break;
          }
          node.holders.set(car.id, this.turnFor(car));
          car.holding = node;
        }
        car.s -= car.path.len;
        car.path = this.turnFor(car);
        car.turn = null;
        car.pathKind = 'turn';
      } else {
        car.holding?.holders.delete(car.id);
        car.holding = null;
        car.s -= car.path.len;
        car.edge = car.next;
        car.path = this.graph.lanePath(car.edge);
        car.pathKind = 'lane';
        car.next = this.chooseNext(car.edge);
        car.turn = null;
      }
    }
    car.path.at(car.s, _p, _t);
    car.setRoadPose(_p, _t);
  }

  /** After the physics step. */
  afterStep() {
    for (const car of this.cars) if (car.vc) car.readBack();
  }

  /** Per frame: visuals and tidying up wrecks. */
  update(dt: number, player: THREE.Vector3) {
    for (const car of this.cars) car.syncVisual(dt);
    // Too many wrecks: recycle the farthest one into fresh traffic.
    const wrecks = this.cars.filter((c) => c.mode === 'wreck');
    if (wrecks.length > MAX_WRECKS) {
      wrecks.sort((a, b) => b.pos.distanceTo(player) - a.pos.distanceTo(player));
      const w = wrecks[0];
      if (w.pos.distanceTo(player) > 50) this.remove(w);
    }
    // Wrecks that fell out of the world.
    for (const c of this.cars.slice()) if ((c.mode === 'wreck' || c.mode === 'parked') && c.pos.y < -60) this.remove(c);
    // Keep the roads busy.
    if (this.trafficCount < this.target && this.rng() < dt * 0.5) this.spawnTraffic(player);
  }

  remove(car: Car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    car.dispose();
  }

  /** The car (if any) whose body overlaps a point, with its speed. Used for running people over. */
  hitTest(p: THREE.Vector3, pad = 0.45, minSpeed = 3, ignore: Car | null = null) {
    for (const car of this.cars) {
      if (car === ignore) continue;
      const v = car.velocity(_t);
      if (v.length() < minSpeed) continue;
      _q.copy(car.quat).invert();
      const l = _p.copy(p).sub(car.pos).applyQuaternion(_q);
      const hf = car.spec.half;
      if (Math.abs(l.x) < hf.x + pad && Math.abs(l.z) < hf.z + pad && l.y > -car.spec.ride - 0.3 && l.y < hf.y + 0.6) return { car, vel: v.clone() };
    }
    return null;
  }

  /** Nearest car to a point within maxDist, optionally filtered. */
  nearest(p: THREE.Vector3, maxDist: number, filter: (c: Car) => boolean = () => true) {
    let best: Car | null = null;
    let bd = maxDist;
    for (const c of this.cars) {
      if (!filter(c)) continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d < bd && Math.abs(c.pos.y - c.spec.ride - p.y) < 2.5) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  dispose() {
    for (const c of this.cars) c.dispose();
    this.cars.length = 0;
  }
}
