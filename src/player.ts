import * as THREE from 'three';
import { RAPIER, G_PLAYER, G_PROP, G_WORLD, QUERY_WORLD, groups } from './physics';
import { approach2, turnToward } from './util';

export type MoveState =
  | 'ground'
  | 'crouch'
  | 'jump'
  | 'fall'
  /** Hanging from a ledge by the hands. */
  | 'hang'
  /** Pulling up over a ledge. */
  | 'climb'
  | 'crawl'
  | 'ride'
  | 'swim'
  | 'tube'
  | 'locked';

export type Tier = 'Feeble' | 'Normal' | 'Athlete';

export interface PlayerInput {
  moveX: number; // right
  moveY: number; // forward
  camYaw: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  crouchHeld: boolean;
  crouchPressed: boolean;
  divePressed: boolean;
  /** Sprinting (Shift, double-tap W, or left stick click). */
  sprint?: boolean;
  /** When set (right mouse held / first person), the character faces this way while standing still. */
  faceYaw?: number | null;
}

export interface LandEvent {
  drop: number;
  launchState: MoveState;
  landState: MoveState;
  launchPos: THREE.Vector3;
  speed: number;
  /** Horizontal speed at take-off (a running leap vs. stepping off). */
  launchSpeed: number;
}

export interface PlayerHooks {
  onJump?: (kind: MoveState, chain: number) => void;
  onLand?: (e: LandEvent) => void;
  /** Grabbed a ledge / finished pulling up over it. */
  onLedge?: (kind: 'grab' | 'climb') => void;
  /** A move this body is too weak for was attempted. */
  onDenied?: (move: string) => void;
  /** Riding: hit a wall. `impact` is the speed straight into the wall, `normal` points out of it. */
  onRideCrash?: (impact: number, normal: THREE.Vector3) => void;
  /** Riding: pressed dive in the air (kickflip). */
  onRideTrick?: () => void;
  /** Hit the water from the air. `drop` is the fall height, `speed` the downward speed. */
  onSplash?: (e: { drop: number; speed: number; state: MoveState; launchState: MoveState; launchPos: THREE.Vector3 }) => void;
  /** Ran out of breath underwater. */
  onDrown?: () => void;
}

/** How a ridden board or bike handles. Set Player.ride to one of these while riding. */
export interface RideHandling {
  maxSpeed: number;
  /** Pedal / push acceleration (units/s^2). */
  accel: number;
  /** Rolling slowdown with no input (units/s^2). */
  coast: number;
  /** Braking when pulling back (units/s^2). */
  brake: number;
  /** Turn rate at low speed and at top speed (rad/s). */
  turnSlow: number;
  turnFast: number;
  /** Jump (ollie / bunny hop) velocity. */
  jump: number;
}

/** Seconds of breath underwater per physical tier. */
const BREATH: Record<Tier, number> = { Feeble: 7, Normal: 13, Athlete: 22 };

const GRAVITY = 42;
const RUN_SPEED = 10;
/** Everyone can run, sprint and jump; how fast and how high is down to physical health. */
const RUN: Record<Tier, number> = { Feeble: 6, Normal: 10, Athlete: 11 };
const SPRINT: Record<Tier, number> = { Feeble: 1.25, Normal: 1.5, Athlete: 1.75 };
/** Jump launch speed: peaks of roughly 1.3, 2.3 and 3.4 above the feet. */
const JUMP: Record<Tier, number> = { Feeble: 10.5, Normal: 14, Athlete: 17 };
/** How far above the feet the hands can reach to grab a ledge. */
const REACH: Record<Tier, number> = { Feeble: 2.1, Normal: 2.4, Athlete: 2.7 };
/** Seconds to pull up over a ledge. */
const PULLUP: Record<Tier, number> = { Feeble: 1.1, Normal: 0.6, Athlete: 0.4 };
const HALF_HEIGHT = 0.5;
const RADIUS = 0.4;
export const PLAYER_CENTER = HALF_HEIGHT + RADIUS; // center height above feet

/**
 * Kinematic character controller: walk, sprint, one jump, crouch, crawl (broken legs),
 * and grabbing ledges to pull up. Speeds and jump height scale with physical health.
 */
export class Player {
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  private kcc!: RAPIER.KinematicCharacterController;
  readonly vel = new THREE.Vector3();
  facing = 0;
  /** True while running at sprint speed. */
  sprinting = false;
  /** Temporary run-speed multiplier from a skill, active while boostT > 0. */
  boostMul = 1;
  boostT = 0;
  /** Seconds of reduced gravity left (floaty skills). */
  floatT = 0;
  state: MoveState = 'ground';
  grounded = false;
  /** Steepest walkable surface touched last step, for walking along slopes. */
  private groundN = new THREE.Vector3(0, 1, 0);
  private onSlope = false;
  stateTime = 0;
  airTime = 0;
  private jumpChain = 0;
  private landTimer = 1;
  private jumpBuf = 0;
  private diveBuf = 0;
  private wallTimer = 0;
  /** Ledge being held: where the hands are, the wall's outward normal, and pull-up progress. */
  private ledge: { top: THREE.Vector3; n: THREE.Vector3; from: THREE.Vector3; t: number } | null = null;
  private ledgeCd = 0;
  private wallNormal = new THREE.Vector3();
  private maxY = 0;
  private launchState: MoveState = 'jump';
  private launchPos = new THREE.Vector3();
  private launchSpeed = 0;
  private jumpedThisStep = false;
  /** Set by teleport: the collider only catches up with the body after a physics step, so the next ground test is stale. */
  private teleported = false;
  private readonly filter = groups(G_PLAYER, G_WORLD | G_PROP);
  hooks: PlayerHooks = {};
  tier: Tier = 'Normal';
  legsBroken = false;
  /** Set while on a skateboard or bike: the controller switches to momentum steering. */
  ride: RideHandling | null = null;

  /**
   * Water surface height at a column, or NaN where there is no water. Set by maps with
   * seas, rivers or pools; null means the map has no water.
   */
  waterAt: ((x: number, z: number) => number) | null = null;
  /** True while treading water. */
  swimming = false;
  /** True while the head is under the surface. */
  submerged = false;
  /** Breath left underwater, 1 = full, 0 = drowning. */
  breath = 1;
  /** Floating on something (an inner tube): stays on the surface, paddles faster, can't dive. */
  floaty = false;
  /** Swim speed multiplier (bait, flippers, a jet ski tow). */
  swimMul = 1;
  /** Water current added to swimming movement (rip currents, rivers), in units per second. */
  readonly current = new THREE.Vector3();
  /**
   * While set, the player's feet are glued to this point every step (rides: barrels,
   * parasails, being carried off by seagulls). Collisions and input are ignored.
   */
  carry: (() => THREE.Vector3) | null = null;
  /**
   * While set and airborne, this drives the velocity instead of gravity and air control
   * (skydiving: terminal velocity, tracking, canopy flight). Collisions and landing still apply.
   */
  sky: ((dt: number, inp: PlayerInput, vel: THREE.Vector3) => void) | null = null;
  /** A body pose the map asks for (seated, free-fall arch, hanging under a canopy). Read by the game's animator. */
  pose: 'sit' | 'freefall' | 'canopy' | null = null;

  /** Launch the player from outside (thrown out of buildings, explosions). */
  knock(v: THREE.Vector3) {
    this.ledge = null;
    this.vel.copy(v);
    this.launch('fall');
  }

  breakLegs() {
    this.ledge = null;
    this.legsBroken = true;
    this.setState('crawl');
  }

  healLegs() {
    this.legsBroken = false;
    this.setState('ground');
  }

  constructor(private physics: RAPIER.World, spawn: THREE.Vector3) {
    this.attach(physics, spawn);
  }

  /** Move the player into another physics world (each map has its own). */
  rebind(physics: RAPIER.World, feet: THREE.Vector3) {
    this.physics = physics;
    this.attach(physics, feet);
  }

  private attach(physics: RAPIER.World, spawn: THREE.Vector3) {
    this.body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + PLAYER_CENTER, spawn.z),
    );
    this.collider = physics.createCollider(
      RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS).setCollisionGroups(this.filter),
      this.body,
    );
    this.kcc = physics.createCharacterController(0.03);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.enableAutostep(1.05, 0.2, false);
    this.kcc.enableSnapToGround(0.35);
    this.kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
  }

  position(out = new THREE.Vector3()) {
    const t = this.body.translation();
    return out.set(t.x, t.y, t.z);
  }

  feet(out = new THREE.Vector3()) {
    return this.position(out).sub(new THREE.Vector3(0, PLAYER_CENTER, 0));
  }

  horizSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  teleport(feet: THREE.Vector3, facing = this.facing) {
    const p = { x: feet.x, y: feet.y + PLAYER_CENTER + 0.05, z: feet.z };
    this.body.setTranslation(p, true);
    this.body.setNextKinematicTranslation(p);
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.ledge = null;
    this.setState('fall');
    this.grounded = false;
    this.maxY = p.y;
    this.launchPos.set(p.x, p.y, p.z);
    this.teleported = true;
  }

  setEnabled(on: boolean) {
    this.collider.setEnabled(on);
  }

  private setState(s: MoveState) {
    if (this.state !== s) this.stateTime = 0;
    this.state = s;
  }

  private facingDir() {
    return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  private launch(s: MoveState) {
    this.setState(s);
    this.grounded = false;
    this.jumpedThisStep = true;
    this.airTime = 0;
    const p = this.position();
    this.maxY = p.y;
    this.launchState = s;
    this.launchPos.copy(p);
    this.launchSpeed = this.horizSpeed();
  }

  /**
   * Look for a ledge top just in front of the wall we're pushing into, within arm's reach,
   * with room to stand on it. Starts hanging if there is one.
   */
  private tryGrab(): boolean {
    const n = this.wallNormal;
    const c = this.body.translation();
    const feetY = c.y - PLAYER_CENTER;
    const reach = REACH[this.tier];
    // Probe down from above reach, a little way past the wall face.
    const px = c.x - n.x * (RADIUS + 0.35), pz = c.z - n.z * (RADIUS + 0.35);
    const top = feetY + reach + 0.2;
    const down = new RAPIER.Ray({ x: px, y: top, z: pz }, { x: 0, y: -1, z: 0 });
    const hit = this.physics.castRayAndGetNormal(down, reach, true, undefined, QUERY_WORLD);
    if (!hit || hit.normal.y < 0.7 || hit.timeOfImpact < 0.01) return false;
    const ledgeY = top - hit.timeOfImpact;
    // Must be above the waist (lower edges are stepped or jumped onto) and within reach.
    if (ledgeY < feetY + 1.0 || ledgeY > feetY + reach) return false;
    // Room to stand up there: nothing solid in the space above the ledge.
    const up = new RAPIER.Ray({ x: px, y: ledgeY + 0.05, z: pz }, { x: 0, y: 1, z: 0 });
    if (this.physics.castRay(up, 1.8, true, undefined, QUERY_WORLD)) return false;
    // Nothing overhead on our side either.
    const head = new RAPIER.Ray({ x: c.x, y: c.y, z: c.z }, { x: 0, y: 1, z: 0 });
    if (ledgeY > c.y && this.physics.castRay(head, ledgeY - c.y + 0.3, true, undefined, QUERY_WORLD)) return false;
    this.ledge = { top: new THREE.Vector3(px, ledgeY, pz), n: n.clone(), from: new THREE.Vector3(), t: 0 };
    this.vel.set(0, 0, 0);
    this.facing = Math.atan2(-n.x, -n.z);
    this.setState('hang');
    this.maxY = c.y; // a grab ends the fall
    this.hooks.onLedge?.('grab');
    return true;
  }

  /** Hanging: jump or push forward to pull up, crouch or pull back to drop. */
  private updateLedge(dt: number, inp: PlayerInput, wx: number, wz: number, wishLen: number) {
    const L = this.ledge;
    if (!L) {
      this.setState('fall');
      return;
    }
    this.vel.set(0, 0, 0);
    const n = L.n;
    // Hands on the edge, body against the wall.
    const hangPos = new THREE.Vector3(L.top.x + n.x * (RADIUS + 0.4), L.top.y - 1.75 + PLAYER_CENTER, L.top.z + n.z * (RADIUS + 0.4));
    if (this.state === 'hang') {
      this.body.setNextKinematicTranslation(hangPos);
      this.grounded = false;
      this.facing = Math.atan2(-n.x, -n.z);
      const push = wishLen > 0.1 ? -(wx * n.x + wz * n.z) : 0;
      if (this.jumpBuf > 0 || (push > 0.5 && this.stateTime > 0.15)) {
        this.jumpBuf = 0;
        L.from.copy(hangPos);
        L.t = 0;
        this.setState('climb');
      } else if (inp.crouchPressed || push < -0.5) {
        this.dropLedge();
      }
      return;
    }
    // Climbing: up first, then over the lip.
    L.t = Math.min(1, L.t + dt / PULLUP[this.tier]);
    const stand = new THREE.Vector3(L.top.x - n.x * 0.35, L.top.y + PLAYER_CENTER + 0.05, L.top.z - n.z * 0.35);
    const upK = Math.min(1, L.t / 0.65);
    const overK = Math.max(0, (L.t - 0.45) / 0.55);
    const p = new THREE.Vector3(
      L.from.x + (stand.x - L.from.x) * overK,
      L.from.y + (stand.y - L.from.y) * (1 - (1 - upK) * (1 - upK)),
      L.from.z + (stand.z - L.from.z) * overK,
    );
    this.body.setNextKinematicTranslation(p);
    this.grounded = false;
    if (L.t >= 1) {
      this.ledge = null;
      this.ledgeCd = 0.3;
      this.grounded = true;
      this.maxY = p.y;
      this.launchPos.copy(p);
      this.setState('ground');
      this.hooks.onLedge?.('climb');
    }
  }

  private dropLedge() {
    this.ledge = null;
    this.ledgeCd = 0.45;
    const p = this.position();
    this.maxY = p.y;
    this.launchPos.copy(p);
    this.launchState = 'fall';
    this.airTime = 0.2;
    this.setState('fall');
  }


  update(dt: number, inp: PlayerInput) {
    this.jumpedThisStep = false;
    this.stateTime += dt;
    if (this.carry) {
      const f = this.carry();
      const p = { x: f.x, y: f.y + PLAYER_CENTER, z: f.z };
      this.body.setNextKinematicTranslation(p);
      this.vel.set(0, 0, 0);
      this.grounded = false;
      this.swimming = false;
      this.submerged = false;
      this.maxY = p.y;
      return;
    }
    if (this.updateSwim(dt, inp)) return;
    if (inp.jumpPressed) this.jumpBuf = 0.15;
    else this.jumpBuf -= dt;
    if (inp.divePressed) this.diveBuf = 0.13;
    else this.diveBuf -= dt;
    this.ledgeCd -= dt;
    this.sprinting = false;
    this.boostT -= dt;
    this.floatT -= dt;
    const boost = this.boostT > 0 ? this.boostMul : 1;
    this.wallTimer -= dt;

    // Camera-relative wish direction.
    const fx = -Math.sin(inp.camYaw), fz = -Math.cos(inp.camYaw);
    const rx = Math.cos(inp.camYaw), rz = -Math.sin(inp.camYaw);
    let wx = fx * inp.moveY + rx * inp.moveX;
    let wz = fz * inp.moveY + rz * inp.moveX;
    const wishLen = Math.min(1, Math.hypot(wx, wz));
    if (wishLen > 0.001) {
      const l = Math.hypot(wx, wz);
      wx /= l;
      wz /= l;
    }
    const wishYaw = Math.atan2(wx, wz);
    const v = this.vel;
    const hs = Math.hypot(v.x, v.z);
    const st = this.state;

    if (st === 'locked') {
      v.x = 0;
      v.z = 0;
      v.y = this.grounded ? -2 : Math.max(v.y - GRAVITY * dt, -55);
    } else if (this.grounded && this.ride) {
      this.rideGround(dt, inp, wx, wz, wishLen, wishYaw);
    } else if (st === 'hang' || st === 'climb') {
      this.updateLedge(dt, inp, wx, wz, wishLen);
      return;
    } else if (this.grounded) {
      this.landTimer += dt;
      if (this.legsBroken) {
        this.setState('crawl');
        if (wishLen > 0.1) {
          this.facing = wishYaw;
          const fd = this.facingDir();
          approach2(v, fd.x * 1.6 * wishLen, fd.z * 1.6 * wishLen, 20 * dt);
        } else approach2(v, 0, 0, 20 * dt);
        this.jumpBuf = 0;
      } else {
        this.setState(inp.crouchHeld ? 'crouch' : 'ground');
        const crouching = this.state === 'crouch';
        const sprintMul = inp.sprint && !crouching ? SPRINT[this.tier] : 1;
        this.sprinting = sprintMul > 1 && wishLen > 0.5;
        const target = wishLen * (crouching ? 2.5 : RUN[this.tier] * sprintMul * boost);
        if (wishLen > 0.1) {
          // Turning is instant: facing snaps to the stick/keys, and momentum swings with it.
          this.facing = wishYaw;
          const fd = this.facingDir();
          if (hs > 0.01) {
            v.x = fd.x * hs;
            v.z = fd.z * hs;
          }
          approach2(v, fd.x * target, fd.z * target, 55 * dt);
        } else {
          approach2(v, 0, 0, 45 * dt);
          if (inp.faceYaw != null) this.facing = inp.faceYaw;
        }
      }

      // One jump; how high depends on how fit this body is.
      if (this.jumpBuf > 0 && !this.legsBroken) {
        this.jumpBuf = 0;
        v.y = JUMP[this.tier] * (this.state === 'crouch' ? 0.75 : 1);
        this.jumpChain = 1;
        this.launch('jump');
        this.hooks.onJump?.('jump', 1);
      } else {
        v.y = -6; // stick to the ground so grounded detection doesn't flicker
        // On a slope (ramps over stairs, hills), move along the surface instead of pushing
        // straight down into it, or walking uphill stalls at low speeds.
        const n = this.groundN;
        if (n.y > 0.5 && n.y < 0.995) {
          v.y = -(v.x * n.x + v.z * n.z) / n.y - 3;
          this.onSlope = true;
        }
      }
    } else if (this.ride) {
      // Airborne on a ride: gravity, a little air steering, and a kickflip on dive.
      this.airTime += dt;
      v.y = Math.max(v.y - GRAVITY * dt, -55);
      if (wishLen > 0.1) this.facing = turnToward(this.facing, wishYaw, 1.2 * dt);
      if (this.diveBuf > 0) {
        this.diveBuf = 0;
        this.hooks.onRideTrick?.();
      }
    } else if (this.sky) {
      this.airTime += dt;
      this.sky(dt, inp, v);
    } else {
      // Airborne.
      this.airTime += dt;
      // Coyote time: a jump just after running off a ledge still counts.
      if (st === 'fall' && this.airTime < 0.14 && this.jumpBuf > 0 && !this.legsBroken) {
        this.jumpBuf = 0;
        this.jumpChain = 1;
        v.y = JUMP[this.tier];
        this.launch('jump');
        this.hooks.onJump?.('jump', 1);
      } else {
        let g = GRAVITY * (this.floatT > 0 && v.y < 0 ? 0.3 : 1);
        if (st === 'jump' && !inp.jumpHeld && v.y > 0) g *= 2.2; // variable jump height
        v.y -= g * dt;
        v.y = Math.max(v.y, -55);

        if (wishLen > 0.1) {
          const before = Math.max(hs, RUN[this.tier] * 0.9);
          v.x += wx * 34 * wishLen * dt;
          v.z += wz * 34 * wishLen * dt;
          const nh = Math.hypot(v.x, v.z);
          if (nh > before) {
            v.x *= before / nh;
            v.z *= before / nh;
          }
          this.facing = wishYaw;
        } else {
          approach2(v, 0, 0, 4 * dt);
        }

        // Ledge grab: pushing into a wall near its top edge.
        if (this.wallTimer > 0 && !this.legsBroken && this.ledgeCd <= 0 && v.y < 4 && this.airTime > 0.08) {
          const n = this.wallNormal;
          const into = wishLen > 0.1 ? -(wx * n.x + wz * n.z) : 0;
          if (into > 0.3 && this.tryGrab()) return;
        }
      }
    }

    // Move with collision.
    const desired = { x: v.x * dt, y: v.y * dt, z: v.z * dt };
    this.kcc.computeColliderMovement(this.collider, desired, undefined, this.filter);
    const mv = this.kcc.computedMovement();
    const cur = this.body.translation();
    const next = { x: cur.x + mv.x, y: cur.y + mv.y, z: cur.z + mv.z };
    this.body.setNextKinematicTranslation(next);

    const wasGrounded = this.grounded;
    let grounded = this.kcc.computedGrounded();
    if (this.jumpedThisStep || (v.y > 0.5 && !this.onSlope) || this.teleported) grounded = false;
    this.teleported = false;
    this.onSlope = false;
    this.groundN.set(0, 1, 0);

    for (let i = 0; i < this.kcc.numComputedCollisions(); i++) {
      const c = this.kcc.computedCollision(i);
      if (!c) continue;
      const n = c.normal1;
      if (Math.abs(n.y) < 0.35) {
        this.wallNormal.set(n.x, 0, n.z).normalize();
        this.wallTimer = 0.12;
        // lose speed into the wall
        const into = v.x * this.wallNormal.x + v.z * this.wallNormal.z;
        if (into < 0 && this.ride) this.hooks.onRideCrash?.(-into, this.wallNormal.clone());
        if (into < 0) {
          v.x -= this.wallNormal.x * into;
          v.z -= this.wallNormal.z * into;
        }
      } else if (n.y > 0.5 && n.y < this.groundN.y) {
        this.groundN.set(n.x, n.y, n.z);
      } else if (n.y < -0.6 && v.y > 0) {
        v.y = 0;
      }
    }

    if (!grounded) this.maxY = Math.max(this.maxY, next.y);

    if (grounded && !wasGrounded) {
      const landState = this.state;
      const drop = this.maxY - next.y;
      if (landState !== 'locked') this.setState(this.ride ? 'ride' : this.legsBroken ? 'crawl' : 'ground');
      this.landTimer = 0;
      v.y = 0;
      this.hooks.onLand?.({
        drop,
        launchState: this.launchState,
        landState,
        launchPos: this.launchPos.clone(),
        speed: Math.hypot(v.x, v.z),
        launchSpeed: this.launchSpeed,
      });
    } else if (!grounded && wasGrounded && !this.jumpedThisStep) {
      // Walked off a ledge.
      this.launchState = 'fall';
      if (this.state !== 'locked' && this.state !== 'crawl' && this.state !== 'ride') this.setState('fall');
      this.airTime = 0;
      this.maxY = next.y;
      this.launchPos.set(next.x, next.y, next.z);
    }
    this.grounded = grounded;
  }

  lock(on: boolean) {
    if (on) this.setState('locked');
    else this.setState(this.ride ? 'ride' : this.swimming ? (this.floaty ? 'tube' : 'swim') : this.legsBroken ? 'crawl' : 'ground');
  }

  /** Water surface over the player's column, or NaN. */
  surfaceHere() {
    if (!this.waterAt) return NaN;
    const t = this.body.translation();
    return this.waterAt(t.x, t.z);
  }

  /**
   * Swimming: buoyancy keeps the head above water, C (crouch) dives (unless floating),
   * Space rises and hops out at the surface. Returns true when it handled the step.
   */
  private updateSwim(dt: number, inp: PlayerInput): boolean {
    const surface = this.surfaceHere();
    const t = this.body.translation();
    const feetY = t.y - PLAYER_CENTER;
    const depth = surface - feetY;
    const locked = this.state === 'locked';
    if (!(depth > 0)) {
      if (this.swimming) this.leaveWater();
      this.breath = Math.min(1, this.breath + dt * 0.5);
      return false;
    }
    const enter = this.floaty ? 0.55 : 1.15;
    if (!this.swimming) {
      if (depth < enter || this.vel.y > 0.5) {
        this.breath = Math.min(1, this.breath + dt * 0.5);
        return false;
      }
      // Splash down.
      const drop = this.maxY - t.y;
      const speed = -this.vel.y;
      const launchState = this.launchState;
      const state = this.state;
      this.swimming = true;
      this.grounded = false;
      this.vel.y *= 0.15;
      this.vel.x *= 0.4;
      this.vel.z *= 0.4;
      if (!locked) this.setState(this.floaty ? 'tube' : 'swim');
      this.legsBroken = false;
      this.hooks.onSplash?.({ drop, speed, state, launchState, launchPos: this.launchPos.clone() });
      if (!this.swimming) return false; // the map pulled us out
    } else if (depth < enter - 0.35 && !this.floaty) {
      // Waded into the shallows.
      this.leaveWater();
      return false;
    }

    const v = this.vel;
    const fx = -Math.sin(inp.camYaw), fz = -Math.cos(inp.camYaw);
    const rx = Math.cos(inp.camYaw), rz = -Math.sin(inp.camYaw);
    let wx = fx * inp.moveY + rx * inp.moveX;
    let wz = fz * inp.moveY + rz * inp.moveX;
    const wishLen = Math.min(1, Math.hypot(wx, wz));
    if (wishLen > 0.001) {
      const l = Math.hypot(wx, wz);
      wx /= l;
      wz /= l;
    }
    if (locked) {
      approach2(v, 0, 0, 10 * dt);
    } else {
      if (!this.floaty) this.setState('swim');
      else this.setState('tube');
      const base = (this.floaty ? 6 : 4.2) * (this.tier === 'Feeble' ? 0.6 : this.tier === 'Athlete' ? 1.2 : 1) * this.swimMul;
      const sp = base * (inp.sprint ? 1.5 : 1) * wishLen;
      this.sprinting = !!inp.sprint && wishLen > 0.5;
      if (wishLen > 0.1) this.facing = turnToward(this.facing, Math.atan2(wx, wz), 8 * dt);
      else if (inp.faceYaw != null) this.facing = inp.faceYaw;
      approach2(v, wx * sp, wz * sp, 14 * dt);
    }
    // Vertical: float with the head out unless diving.
    const floatFeet = surface - (this.floaty ? 0.55 : 1.3);
    const diving = !locked && !this.floaty && inp.crouchHeld;
    if (diving) v.y += (-4 - v.y) * Math.min(1, dt * 4);
    else {
      const want = (floatFeet - feetY) * 4;
      v.y += (Math.max(-6, Math.min(5, want)) - v.y) * Math.min(1, dt * 5);
    }
    // Hop out at the surface (climb onto docks and banks).
    if (!locked && inp.jumpPressed && feetY > floatFeet - 0.4) {
      this.swimming = false;
      this.submerged = false;
      v.y = this.floaty ? 9 : 15;
      this.jumpChain = 1;
      this.launch('jump');
      this.hooks.onJump?.('jump', 1);
    }

    const c = this.current;
    const desired = { x: (v.x + c.x) * dt, y: (v.y + c.y) * dt, z: (v.z + c.z) * dt };
    this.kcc.computeColliderMovement(this.collider, desired, undefined, this.filter);
    const mv = this.kcc.computedMovement();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    this.maxY = t.y + mv.y;
    this.launchPos.set(t.x, t.y, t.z);
    this.airTime = 0;
    this.grounded = false;

    // Breath.
    const head = feetY + 1.55;
    this.submerged = this.swimming && head < surface - 0.1;
    if (this.submerged) {
      this.breath -= dt / BREATH[this.tier];
      if (this.breath <= 0) {
        this.breath = 0;
        this.hooks.onDrown?.();
      }
    } else this.breath = Math.min(1, this.breath + dt * 0.5);
    return this.swimming;
  }

  private leaveWater() {
    this.swimming = false;
    this.submerged = false;
    if (this.state === 'swim' || this.state === 'tube') this.setState('fall');
    const t = this.body.translation();
    this.maxY = t.y;
    this.launchPos.set(t.x, t.y, t.z);
    this.launchState = 'fall';
  }

  /** Start or stop riding. Keeps momentum when hopping on, drops to a walk when hopping off. */
  setRide(h: RideHandling | null) {
    this.ride = h;
    this.setState(h ? 'ride' : this.legsBroken ? 'crawl' : 'ground');
    if (!h) {
      const hs = this.horizSpeed();
      if (hs > RUN_SPEED) this.vel.multiplyScalar(RUN_SPEED / hs);
    }
  }

  /** Throw the player into the air from a ramp lip while riding. */
  launchRide(vy: number) {
    this.vel.y = vy;
    this.launch('jump');
  }

  /** Grounded momentum steering for boards and bikes: turn rate is limited, speed builds up and coasts. */
  private rideGround(dt: number, inp: PlayerInput, wx: number, wz: number, wishLen: number, wishYaw: number) {
    const r = this.ride!;
    const v = this.vel;
    this.landTimer += dt;
    if (this.state !== 'locked') this.setState('ride');
    const maxSp = r.maxSpeed * (this.tier === 'Feeble' ? 0.75 : this.tier === 'Athlete' ? 1.1 : 1);
    const fd = this.facingDir();
    let speed = Math.max(0, v.x * fd.x + v.z * fd.z);
    if (wishLen > 0.1) {
      const dot = wx * fd.x + wz * fd.z;
      if (dot < -0.5 && speed > 1.5) {
        speed = Math.max(0, speed - r.brake * dt); // pulling back brakes
      } else {
        const t = Math.min(speed / maxSp, 1);
        const rate = r.turnSlow + (r.turnFast - r.turnSlow) * t;
        this.facing = turnToward(this.facing, wishYaw, rate * dt);
        if (dot > 0) speed = Math.min(maxSp, speed + r.accel * wishLen * Math.max(dot, 0.3) * dt);
      }
    } else speed = Math.max(0, speed - r.coast * dt);
    if (speed < 0.05 && inp.faceYaw != null) this.facing = inp.faceYaw;
    const nf = this.facingDir();
    v.x = nf.x * speed;
    v.z = nf.z * speed;
    this.sprinting = speed > RUN_SPEED * 1.2;
    if (this.jumpBuf > 0) {
      this.jumpBuf = 0;
      v.y = r.jump;
      this.jumpChain = 1;
      this.launch('jump');
      this.hooks.onJump?.('jump', 1);
    } else v.y = -6;
  }
}
