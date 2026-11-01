import * as THREE from 'three';
import { RAPIER, G_PLAYER, G_PROP, G_WORLD, groups } from './physics';
import { approach2, turnToward } from './util';

export type MoveState =
  | 'ground'
  | 'crouch'
  | 'slide'
  | 'jump'
  | 'triple'
  | 'longjump'
  | 'backflip'
  | 'sideflip'
  | 'wallkick'
  | 'dive'
  | 'bellyslide'
  | 'gpFreeze'
  | 'groundpound'
  | 'fall'
  | 'crawl'
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
  /** Sprinting (double-tap W, or left stick click). */
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
}

export interface PlayerHooks {
  onJump?: (kind: MoveState, chain: number) => void;
  onLand?: (e: LandEvent) => void;
  onWallKick?: () => void;
  onGroundPound?: () => void;
  onDive?: () => void;
  /** A move this body is too weak for was attempted. */
  onDenied?: (move: string) => void;
}

const GRAVITY = 42;
const RUN_SPEED = 10;
const HALF_HEIGHT = 0.5;
const RADIUS = 0.4;
export const PLAYER_CENTER = HALF_HEIGHT + RADIUS; // center height above feet

/**
 * Kinematic platformer controller with a classic 3D-platformer moveset:
 * run, jump chain up to a triple jump, long jump, backflip, side flip, wall kick,
 * crouch, slide, dive, belly slide and ground pound.
 */
export class Player {
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  private kcc!: RAPIER.KinematicCharacterController;
  readonly vel = new THREE.Vector3();
  facing = 0;
  /** True while running at sprint speed. */
  sprinting = false;
  state: MoveState = 'ground';
  grounded = false;
  stateTime = 0;
  airTime = 0;
  private jumpChain = 0;
  private landTimer = 1;
  private jumpBuf = 0;
  private diveBuf = 0;
  private crouchBuf = 0;
  private skidTimer = 0;
  private wallTimer = 0;
  private wallNormal = new THREE.Vector3();
  private maxY = 0;
  private launchState: MoveState = 'jump';
  private launchPos = new THREE.Vector3();
  private jumpedThisStep = false;
  private readonly filter = groups(G_PLAYER, G_WORLD | G_PROP);
  hooks: PlayerHooks = {};
  tier: Tier = 'Normal';
  legsBroken = false;

  private get canAdvanced() {
    return this.tier !== 'Feeble';
  }
  private get canAthletic() {
    return this.tier === 'Athlete';
  }

  /** Launch the player from outside (thrown out of buildings, explosions). */
  knock(v: THREE.Vector3) {
    this.vel.copy(v);
    this.launch('fall');
  }

  breakLegs() {
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
    this.setState('fall');
    this.grounded = false;
    this.maxY = p.y;
    this.launchPos.set(p.x, p.y, p.z);
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
  }

  update(dt: number, inp: PlayerInput) {
    this.jumpedThisStep = false;
    this.stateTime += dt;
    if (inp.jumpPressed) this.jumpBuf = 0.15;
    else this.jumpBuf -= dt;
    if (inp.divePressed) this.diveBuf = 0.13;
    else this.diveBuf -= dt;
    if (inp.crouchPressed) this.crouchBuf = 0.13;
    else this.crouchBuf -= dt;
    this.skidTimer -= dt;
    this.sprinting = false;
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
        this.diveBuf = 0;
      } else if (st === 'bellyslide' || st === 'slide') {
        approach2(v, 0, 0, (st === 'slide' ? 9 : 12) * dt);
        if (wishLen > 0.1) this.facing = turnToward(this.facing, wishYaw, 2 * dt);
        if (Math.hypot(v.x, v.z) < 1.5 || (st === 'slide' && !inp.crouchHeld)) this.setState(inp.crouchHeld ? 'crouch' : 'ground');
      } else {
        if (inp.crouchHeld && this.canAdvanced) {
          if (hs > 6 && st === 'ground') this.setState('slide');
          else this.setState('crouch');
        } else this.setState('ground');
        if (this.state === 'ground' || this.state === 'crouch') {
          const feeble = this.tier === 'Feeble';
          const sprintMul = inp.sprint && this.state === 'ground' ? (feeble ? 1.2 : 1.5) : 1;
          this.sprinting = sprintMul > 1 && wishLen > 0.5;
          const target = wishLen * (this.state === 'crouch' ? 2.5 : RUN_SPEED * (feeble ? 0.5 : 1) * sprintMul);
          if (wishLen > 0.1) {
            const dot = hs > 0.01 ? (v.x * wx + v.z * wz) / hs : 1;
            if (hs > 5 && dot < -0.4) this.skidTimer = 0.22;
            // Turning is instant: facing snaps to the stick/keys, and momentum swings with it
            // (except a hard reversal, which skids so the side flip still works).
            this.facing = wishYaw;
            const fd = this.facingDir();
            if (this.skidTimer <= 0 && hs > 0.01) {
              v.x = fd.x * hs;
              v.z = fd.z * hs;
            }
            approach2(v, fd.x * target, fd.z * target, (this.skidTimer > 0 ? 70 : 55) * dt);
          } else {
            approach2(v, 0, 0, 45 * dt);
            if (inp.faceYaw != null) this.facing = inp.faceYaw;
          }
        }
      }

      // Jumps.
      if (this.jumpBuf > 0) {
        this.jumpBuf = 0;
        const fd = this.facingDir();
        const cur = this.state;
        if (!this.canAdvanced) {
          if (this.skidTimer > 0 || inp.crouchHeld) this.hooks.onDenied?.('flips');
          v.y = 12;
          this.jumpChain = 1;
          this.launch('jump');
        } else if ((cur === 'crouch' || cur === 'slide') && hs > 4.5 && !this.canAthletic) {
          this.hooks.onDenied?.('long jump');
          v.y = 13.5;
          this.jumpChain = 1;
          this.launch('jump');
        } else if (cur === 'crouch' || cur === 'slide') {
          if (hs > 4.5) {
            const sp = Math.min(Math.max(hs * 1.5, 14), 19);
            v.set(fd.x * sp, 10.5, fd.z * sp);
            this.launch('longjump');
          } else {
            v.set(-fd.x * 3.5, 21, -fd.z * 3.5);
            this.launch('backflip');
          }
        } else if (cur === 'bellyslide') {
          v.y = 9;
          this.launch('jump');
        } else if (this.skidTimer > 0 && wishLen > 0.1) {
          this.facing = wishYaw;
          v.set(wx * 3, 19.5, wz * 3);
          this.launch('sideflip');
        } else {
          let chain = this.landTimer < 0.2 && this.jumpChain > 0 ? this.jumpChain + 1 : 1;
          if (chain === 3 && hs < 6) chain = 1;
          if (chain === 3 && !this.canAthletic) {
            this.hooks.onDenied?.('triple jump');
            chain = 1;
          }
          if (chain > 3) chain = 1;
          this.jumpChain = chain;
          v.y = [0, 13.5, 16.5, 21][chain];
          this.launch(chain === 3 ? 'triple' : 'jump');
        }
        this.hooks.onJump?.(this.state, this.jumpChain);
      } else if (this.diveBuf > 0 && hs > 3 && this.state === 'ground' && this.canAdvanced) {
        this.diveBuf = 0;
        const fd = this.facingDir();
        const sp = Math.max(hs + 4, 13);
        v.set(fd.x * sp, 6, fd.z * sp);
        this.launch('dive');
        this.hooks.onDive?.();
      } else {
        v.y = -6; // stick to the ground so grounded detection doesn't flicker
      }
    } else {
      // Airborne.
      this.airTime += dt;
      // Coyote time: a jump just after running off a ledge still counts.
      if (st === 'fall' && this.airTime < 0.14 && this.jumpBuf > 0 && !this.legsBroken) {
        this.jumpBuf = 0;
        this.jumpChain = 1;
        v.y = 13.5;
        this.launch('jump');
        this.hooks.onJump?.('jump', 1);
      } else if (st === 'gpFreeze') {
        v.set(0, 0, 0);
        if (this.stateTime > 0.28) {
          v.y = -38;
          this.setState('groundpound');
          this.hooks.onGroundPound?.();
        }
      } else if (st === 'groundpound') {
        v.x = 0;
        v.z = 0;
        v.y = -38;
      } else {
        let g = GRAVITY;
        if (st === 'jump' && !inp.jumpHeld && v.y > 0) g *= 2.2; // variable jump height
        v.y -= g * dt;
        v.y = Math.max(v.y, -55);

        const accel = st === 'longjump' ? 5 : st === 'backflip' ? 7 : st === 'dive' ? 2.5 : st === 'wallkick' ? 12 : 34;
        if (wishLen > 0.1) {
          const before = Math.max(hs, RUN_SPEED * 0.9);
          v.x += wx * accel * wishLen * dt;
          v.z += wz * accel * wishLen * dt;
          const nh = Math.hypot(v.x, v.z);
          if (nh > before) {
            v.x *= before / nh;
            v.z *= before / nh;
          }
          if (st !== 'backflip' && st !== 'sideflip' && st !== 'triple')
            this.facing = st === 'dive' || st === 'longjump' ? turnToward(this.facing, wishYaw, 1.5 * dt) : wishYaw;
        } else if (st === 'jump' || st === 'fall') {
          approach2(v, 0, 0, 4 * dt);
        }

        // Wall kick.
        if (this.wallTimer > 0 && this.jumpBuf > 0 && this.airTime > 0.06 && this.canAdvanced && !this.legsBroken) {
          this.jumpBuf = 0;
          this.wallTimer = 0;
          const n = this.wallNormal;
          this.facing = Math.atan2(n.x, n.z);
          v.set(n.x * 8.5, 16, n.z * 8.5);
          this.launch('wallkick');
          this.hooks.onWallKick?.();
        } else if (this.crouchBuf > 0 && this.airTime > 0.1 && st !== 'dive' && this.canAdvanced) {
          this.crouchBuf = 0;
          this.setState('gpFreeze');
        } else if (this.diveBuf > 0 && st !== 'dive' && this.canAdvanced && !this.legsBroken) {
          this.diveBuf = 0;
          const fd = this.facingDir();
          const sp = Math.max(hs, 12);
          v.set(fd.x * sp, Math.max(v.y, 2) + 3, fd.z * sp);
          this.setState('dive');
          this.hooks.onDive?.();
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
    if (this.jumpedThisStep || v.y > 0.5) grounded = false;

    for (let i = 0; i < this.kcc.numComputedCollisions(); i++) {
      const c = this.kcc.computedCollision(i);
      if (!c) continue;
      const n = c.normal1;
      if (Math.abs(n.y) < 0.35) {
        this.wallNormal.set(n.x, 0, n.z).normalize();
        this.wallTimer = 0.12;
        // lose speed into the wall
        const into = v.x * this.wallNormal.x + v.z * this.wallNormal.z;
        if (into < 0) {
          v.x -= this.wallNormal.x * into;
          v.z -= this.wallNormal.z * into;
        }
      } else if (n.y < -0.6 && v.y > 0) {
        v.y = 0;
      }
    }

    if (!grounded) this.maxY = Math.max(this.maxY, next.y);

    if (grounded && !wasGrounded) {
      const landState = this.state;
      const drop = this.maxY - next.y;
      if (landState === 'dive') this.setState('bellyslide');
      else if (landState === 'longjump' && inp.crouchHeld) this.setState('slide');
      else if (landState !== 'locked') this.setState(this.legsBroken ? 'crawl' : 'ground');
      if (landState === 'triple' || landState === 'backflip' || landState === 'sideflip') this.jumpChain = 0;
      this.landTimer = 0;
      v.y = 0;
      this.hooks.onLand?.({
        drop,
        launchState: this.launchState,
        landState,
        launchPos: this.launchPos.clone(),
        speed: Math.hypot(v.x, v.z),
      });
    } else if (!grounded && wasGrounded && !this.jumpedThisStep) {
      // Walked off a ledge.
      this.launchState = this.state === 'slide' ? 'slide' : 'fall';
      if (this.state !== 'bellyslide' && this.state !== 'locked' && this.state !== 'crawl') this.setState('fall');
      this.airTime = 0;
      this.maxY = next.y;
      this.launchPos.set(next.x, next.y, next.z);
    }
    this.grounded = grounded;
  }

  lock(on: boolean) {
    if (on) this.setState('locked');
    else this.setState(this.legsBroken ? 'crawl' : 'ground');
  }
}
