import * as THREE from 'three';
import { RAPIER, QUERY_WORLD } from './physics';
import { clamp } from './util';

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 22;
/** Below this distance the camera snaps into first person. */
const FP_THRESHOLD = 1.4;

/** Third-person orbit camera with collision against level geometry, plus a first-person mode when zoomed all the way in. */
export class FollowCam {
  yaw = 0;
  pitch = 0.32;
  /** Distance the player has zoomed to with the scroll wheel. */
  dist = 9;
  /** Lowest/highest third-person pitch. Death widens it so he can look up and fly up. */
  minPitch = -0.2;
  maxPitch = 1.25;
  private curDist = 9;
  private target = new THREE.Vector3();
  private shakeAmt = 0;
  autoOrbit = 0;
  /** Forces third person at least this far out (death cams, title). */
  minDist = 0;

  constructor(readonly camera: THREE.PerspectiveCamera, public physics: RAPIER.World) {}

  get firstPerson() {
    return Math.max(this.dist, this.minDist) < FP_THRESHOLD;
  }

  /** Forward direction the camera looks along, flattened, as a facing angle (sin, cos convention). */
  get forwardFacing() {
    return this.yaw + Math.PI;
  }

  zoom(wheel: number) {
    if (!wheel) return;
    const k = Math.exp(wheel * 0.0015);
    let d = this.dist < FP_THRESHOLD ? (wheel > 0 ? FP_THRESHOLD : 0) : this.dist * k;
    if (this.dist >= FP_THRESHOLD && d < FP_THRESHOLD) d = 0;
    this.dist = clamp(d, MIN_ZOOM, MAX_ZOOM);
  }

  shake(a: number) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  snap(target: THREE.Vector3) {
    this.target.copy(target);
  }

  /**
   * `eye` is where the camera sits in first person (the character's head). Without one,
   * first person is unavailable and the camera stays at the minimum orbit distance.
   */
  update(dt: number, target: THREE.Vector3, lookDX: number, lookDY: number, eye: THREE.Vector3 | null = null) {
    this.yaw -= lookDX;
    this.yaw += this.autoOrbit * dt;
    const fp = this.firstPerson && eye !== null;
    this.pitch = clamp(this.pitch + lookDY, fp ? -1.45 : this.minPitch, fp ? 1.45 : this.maxPitch);

    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    if (fp) {
      this.target.copy(target);
      this.curDist = 0;
      this.camera.position.copy(eye);
      this.applyShake(dt);
      this.camera.lookAt(this.camera.position.clone().sub(dir));
      return;
    }

    this.target.lerp(target, 1 - Math.exp(-dt * 12));
    const wantDist = Math.max(this.dist, this.minDist, FP_THRESHOLD);
    let want = wantDist;
    const ray = new RAPIER.Ray(this.target, dir);
    const hit = this.physics.castRay(ray, wantDist, true, undefined, QUERY_WORLD);
    if (hit) want = Math.max(1.0, hit.timeOfImpact - 0.35);
    if (this.curDist < 0.5) this.curDist = want; // leaving first person
    this.curDist = want < this.curDist ? want : this.curDist + (want - this.curDist) * Math.min(1, dt * 6);

    this.camera.position.copy(this.target).addScaledVector(dir, this.curDist);
    this.applyShake(dt);
    this.camera.lookAt(this.target);
  }

  private applyShake(dt: number) {
    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 8);
    }
  }
}
