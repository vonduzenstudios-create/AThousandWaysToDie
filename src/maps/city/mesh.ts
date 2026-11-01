import * as THREE from 'three';
import { RAPIER, G_ALL, G_PROP, G_WORLD, groups } from '../../physics';
import { canvasTexture } from '../../util';

/**
 * Collects lots of colored boxes into one vertex-colored mesh. The city has thousands of
 * small props (benches, cars, train cars, rigging); one draw call each would sink the frame rate.
 */
export class BoxBatch {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private c = new THREE.Color();
  private v = new THREE.Vector3();
  private n = new THREE.Vector3();
  private static FACES = [
    { n: [1, 0, 0], c: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], s: 0.86 },
    { n: [-1, 0, 0], c: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]], s: 0.86 },
    { n: [0, 1, 0], c: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], s: 1 },
    { n: [0, -1, 0], c: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]], s: 0.6 },
    { n: [0, 0, 1], c: [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]], s: 0.92 },
    { n: [0, 0, -1], c: [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]], s: 0.92 },
  ];

  /** Box centered at (x, y, z) with full size (sx, sy, sz), rotated rotY about its center (or about `pivot`). */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, rotY = 0, pivot?: THREE.Vector3) {
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    if (pivot) {
      const off = new THREE.Vector3(x - pivot.x, y - pivot.y, z - pivot.z).applyQuaternion(this.q);
      this.m.compose(new THREE.Vector3(pivot.x + off.x, pivot.y + off.y, pivot.z + off.z), this.q, new THREE.Vector3(sx / 2, sy / 2, sz / 2));
    } else this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx / 2, sy / 2, sz / 2));
    this.c.setHex(color);
    for (const f of BoxBatch.FACES) {
      const base = this.pos.length / 3;
      this.n.set(f.n[0], f.n[1], f.n[2]).applyQuaternion(this.q);
      for (const cc of f.c) {
        this.v.set(cc[0], cc[1], cc[2]).applyMatrix4(this.m);
        this.pos.push(this.v.x, this.v.y, this.v.z);
        this.nor.push(this.n.x, this.n.y, this.n.z);
        this.col.push(this.c.r * f.s, this.c.g * f.s, this.c.b * f.s);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  get empty() {
    return this.pos.length === 0;
  }

  build(mat?: THREE.Material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat ?? new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Tracks everything a map adds so dispose() can take it all back out. */
export class Scenery {
  readonly objects: THREE.Object3D[] = [];
  readonly bodies: RAPIER.RigidBody[] = [];
  readonly fixed: RAPIER.RigidBody;
  private disposers: (() => void)[] = [];
  constructor(
    readonly scene: THREE.Scene,
    readonly physics: RAPIER.World,
  ) {
    this.fixed = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.bodies.push(this.fixed);
  }

  add<T extends THREE.Object3D>(o: T): T {
    this.scene.add(o);
    this.objects.push(o);
    return o;
  }

  /** Static box collider (center, half extents). */
  solid(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0) {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setCollisionGroups(groups(G_WORLD, G_ALL)).setFriction(0.8);
    if (rotY) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      d.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    return this.physics.createCollider(d, this.fixed);
  }

  /** Kinematic body with a box collider, for moving platforms and vehicles. */
  mover(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, offY = 0) {
    const body = this.physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(cx, cy, cz));
    this.physics.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(0, offY, 0).setCollisionGroups(groups(G_PROP, G_ALL)).setFriction(0.9), body);
    this.bodies.push(body);
    return body;
  }

  /** Run fn when the scenery is disposed (for things that clean up after themselves). */
  onDispose(fn: () => void) {
    this.disposers.push(fn);
  }

  dispose() {
    for (const fn of this.disposers) fn();
    this.disposers.length = 0;
    for (const o of this.objects) {
      this.scene.remove(o);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    }
    for (const b of this.bodies) this.physics.removeRigidBody(b);
    this.objects.length = 0;
    this.bodies.length = 0;
  }
}

/** A flat sign with text drawn on a canvas. */
export function signMesh(lines: string[], w: number, h: number, bg: string, fg: string, opts: { font?: string; double?: boolean; glow?: boolean } = {}) {
  const px = 128;
  const cw = Math.max(64, Math.round(w * px * 0.5)), ch = Math.max(32, Math.round(h * px * 0.5));
  const tex = canvasTexture(
    cw,
    ch,
    (c) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, cw, ch);
      c.strokeStyle = fg;
      c.lineWidth = Math.max(3, ch * 0.05);
      c.strokeRect(c.lineWidth, c.lineWidth, cw - c.lineWidth * 2, ch - c.lineWidth * 2);
      c.fillStyle = fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      lines.forEach((line, i) => {
        let size = (ch / (lines.length + 0.6)) * (i === 0 ? 0.8 : 0.5);
        c.font = `bold ${size}px ${opts.font ?? 'Arial Black, Impact, sans-serif'}`;
        while (c.measureText(line).width > cw * 0.9 && size > 8) {
          size -= 2;
          c.font = `bold ${size}px ${opts.font ?? 'Arial Black, Impact, sans-serif'}`;
        }
        c.fillText(line, cw / 2, (ch / (lines.length + 1)) * (i + 1));
      });
    },
    false,
  );
  const mat = opts.glow
    ? new THREE.MeshBasicMaterial({ map: tex, side: opts.double ? THREE.DoubleSide : THREE.FrontSide })
    : new THREE.MeshLambertMaterial({ map: tex, side: opts.double ? THREE.DoubleSide : THREE.FrontSide, emissive: 0x222222 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}
