import * as THREE from 'three';
import { RAPIER, QUERY_WORLD } from './physics';
import { clamp } from './util';

/** Third-person orbit camera with collision against level geometry. */
export class FollowCam {
  yaw = 0;
  pitch = 0.32;
  dist = 9;
  private curDist = 9;
  private target = new THREE.Vector3();
  private shakeAmt = 0;
  autoOrbit = 0;

  constructor(readonly camera: THREE.PerspectiveCamera, private physics: RAPIER.World) {}

  shake(a: number) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  snap(target: THREE.Vector3) {
    this.target.copy(target);
  }

  update(dt: number, target: THREE.Vector3, lookDX: number, lookDY: number, followYaw: number | null, follow = 0) {
    this.yaw -= lookDX;
    this.pitch = clamp(this.pitch + lookDY, -0.2, 1.25);
    this.yaw += this.autoOrbit * dt;
    // Gentle auto-follow behind the player when running and not steering the camera.
    if (followYaw !== null && follow > 0 && Math.abs(lookDX) < 1e-4) {
      let d = followYaw + Math.PI - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 0.9 * follow);
    }

    this.target.lerp(target, 1 - Math.exp(-dt * 12));
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    let want = this.dist;
    const ray = new RAPIER.Ray(this.target, dir);
    const hit = this.physics.castRay(ray, this.dist, true, undefined, QUERY_WORLD);
    if (hit) want = Math.max(1.2, hit.timeOfImpact - 0.35);
    this.curDist = want < this.curDist ? want : this.curDist + (want - this.curDist) * Math.min(1, dt * 3);

    this.camera.position.copy(this.target).addScaledVector(dir, this.curDist);
    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 8);
    }
    this.camera.lookAt(this.target);
  }
}
