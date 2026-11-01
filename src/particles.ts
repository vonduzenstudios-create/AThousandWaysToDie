import * as THREE from 'three';

interface P {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  gravity: number;
  color: THREE.Color;
}

/** Pooled cube particles: dust, pee, sparks, smoke, money. */
export class Particles {
  private mesh: THREE.InstancedMesh;
  private list: P[] = [];
  private dummy = new THREE.Object3D();
  constructor(scene: THREE.Scene, private max = 1500) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(pos: THREE.Vector3, vel: THREE.Vector3, color: THREE.ColorRepresentation, opts: { life?: number; size?: number; gravity?: number; spread?: number } = {}) {
    if (this.list.length >= this.max) this.list.shift();
    const s = opts.spread ?? 0;
    this.list.push({
      pos: pos.clone(),
      vel: vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s)),
      life: opts.life ?? 1,
      max: opts.life ?? 1,
      size: opts.size ?? 0.15,
      gravity: opts.gravity ?? 20,
      color: new THREE.Color(color),
    });
  }

  burst(pos: THREE.Vector3, n: number, color: THREE.ColorRepresentation, speed = 5, opts: { life?: number; size?: number; gravity?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      this.emit(pos, v, color, opts);
    }
  }

  update(dt: number) {
    let i = 0;
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0) p.life = 0;
      const k = Math.min(1, (p.life / p.max) * 2);
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(p.size * k);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.color);
      i++;
    }
    this.list = this.list.filter((p) => p.life > 0);
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
