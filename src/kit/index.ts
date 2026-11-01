import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from '../physics';
import { mulberry32 } from '../util';
import { DV } from './grid';
import { meshGrid, toGeometry, triCount, type MeshArrays } from './mesher';
import { MeshPool } from './pool';
import { kitMaterial } from './material';
import { buildBuilding, type BuildingSpec, type BuiltBuilding, type Preset } from './building';
import { propModel, type PropKind } from './props';
import { pavingGrid, type PavingKind, type Side } from './street';

export * from './grid';
export * from './palette';
export { meshGrid, meshArrays, downsample, toGeometry, triCount } from './mesher';
export type { MeshArrays, MeshOptions, GridLike } from './mesher';
export { kitMaterial } from './material';
export { buildBuilding, FLOOR_H } from './building';
export type { BuildingSpec, BuiltBuilding, Preset, WallStyle, RoofKind, GroundKind, WindowTop, LocalBox } from './building';
export { propModel, PROP_KINDS } from './props';
export type { PropKind, PropModel } from './props';
export { pavingCell, pavingGrid } from './street';
export type { PavingKind, Side } from './street';
export { rasterText, textWidth } from './font';

/** Which way a building's front (door, shopfront) faces. n = -z, s = +z, e = +x, w = -x. */
export type Facing = 'n' | 's' | 'e' | 'w';

export interface Placement {
  /** World min corner of the footprint, in world blocks. */
  x: number;
  z: number;
  /** Ground height (the top of the ground blocks), e.g. G. Default 0. */
  y?: number;
  /** Default 'n'. For 'n'/'s' the footprint is w (x) by d (z); for 'e'/'w' it is d (x) by w (z). */
  face?: Facing;
}

export interface PlacedBuilding {
  /** The building's root (meshes are added to it when meshing finishes). */
  object: THREE.Object3D;
  /** Resolves when the meshes are in. */
  loaded: Promise<void>;
  /** World-space bounds of the footprint up to the roof top. */
  bounds: THREE.Box3;
  /** World positions just outside each door, on the ground. */
  doors: THREE.Vector3[];
  /** World height of the wall top (roofs sit above this). */
  wallTop: number;
  built: BuiltBuilding;
}

export interface RowOptions extends Omit<Placement, 'face'> {
  face?: Facing;
  /** Frontage length and depth, in world blocks. */
  length: number;
  depth: number;
  preset?: Preset;
  seed?: number;
  /** Min/max storeys. Default [2, 4]. */
  floors?: [number, number];
  /** Min/max facade width per building. Default [7, 12]. */
  widths?: [number, number];
  /** Shop sign texts handed out in order to buildings with shopfronts. */
  signs?: string[];
  /** Overrides applied to every building in the row. */
  spec?: Partial<BuildingSpec>;
}

export interface StreetOptions {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y?: number;
  kind?: PavingKind;
  /** Direction the stone rows run. Default: along the longer side. */
  along?: 'x' | 'z';
  /** Raised curb on these edges. */
  curb?: Side[];
}

export interface KitOptions {
  /** Parent for everything the kit makes (usually the scene). */
  parent: THREE.Object3D;
  /** Rapier world for colliders. Leave out for visual-only use (previews). */
  physics?: RAPIER.World | null;
  /** Distance LODs for buildings. Default true. */
  lod?: boolean;
  /** Distances where LOD 1 (half res) and LOD 2 (quarter res) take over. */
  lodDistances?: [number, number];
  shadows?: boolean;
  /** Mesh on the main thread instead of in workers (tests, tiny previews). Default false. */
  sync?: boolean;
}

const FACE_ROT: Record<Facing, number> = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
const CHUNK = 48;

/**
 * The shared building and street-detail kit. One per map:
 *
 *   const kit = new StreetKit({ parent: scene, physics });
 *   kit.building({ x: 100, z: 200, y: G, face: 's', w: 10, d: 8, floors: 3, sign: 'BAKERY' });
 *   kit.row({ x: 60, z: 180, y: G, face: 's', length: 80, depth: 10 });
 *   kit.street({ x0: 60, z0: 190, x1: 140, z1: 200, y: G, kind: 'cobble' });
 *   kit.prop('lamp', 70, G, 192);
 *   kit.finish(); // builds the instanced props
 */
export class StreetKit {
  readonly group = new THREE.Group();
  readonly buildings: PlacedBuilding[] = [];
  private physics: RAPIER.World | null;
  private body: RAPIER.RigidBody | null = null;
  private lod: boolean;
  private lodD: [number, number];
  private shadows: boolean;
  private props = new Map<string, { kind: PropKind; mats: THREE.Matrix4[]; colors: (THREE.Color | null)[] }>();
  private finished: THREE.Object3D[] = [];
  private tris = 0;
  private buildMs = 0;
  private pool = new MeshPool();
  private sync: boolean;
  private jobs: Promise<void>[] = [];

  constructor(opts: KitOptions) {
    this.physics = opts.physics ?? null;
    this.lod = opts.lod ?? true;
    this.lodD = opts.lodDistances ?? [55, 120];
    this.shadows = opts.shadows ?? true;
    this.sync = opts.sync ?? false;
    this.group.name = 'street-kit';
    opts.parent.add(this.group);
  }

  private fixedBody() {
    if (!this.physics) return null;
    if (!this.body) this.body = this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    return this.body;
  }

  private addBox(min: THREE.Vector3, max: THREE.Vector3) {
    const body = this.fixedBody();
    if (!body || !this.physics) return;
    const h = max.clone().sub(min).multiplyScalar(0.5);
    const c = min.clone().add(max).multiplyScalar(0.5);
    const cd = RAPIER.ColliderDesc.cuboid(Math.max(h.x, 0.01), Math.max(h.y, 0.01), Math.max(h.z, 0.01))
      .setTranslation(c.x, c.y, c.z)
      .setFriction(0.9)
      .setCollisionGroups(groups(G_WORLD, G_ALL));
    this.physics.createCollider(cd, body);
  }

  /** Matrix that maps a w x d local footprint (front at z = 0, facing -z) onto the placement. */
  static placement(p: Placement, w: number, d: number): THREE.Matrix4 {
    const rot = FACE_ROT[p.face ?? 'n'];
    const m = new THREE.Matrix4().makeRotationY(rot);
    const corners = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, 0, 0), new THREE.Vector3(0, 0, d), new THREE.Vector3(w, 0, d)].map((v) => v.applyMatrix4(m));
    const minX = Math.min(...corners.map((v) => v.x));
    const minZ = Math.min(...corners.map((v) => v.z));
    m.setPosition(p.x - minX, p.y ?? 0, p.z - minZ);
    return m;
  }

  /** Build and place one building. */
  building(spec: BuildingSpec & Placement): PlacedBuilding {
    const t0 = performance.now();
    const built = buildBuilding(spec);
    const m = StreetKit.placement(spec, spec.w, spec.d);
    const object = new THREE.Group();
    object.name = 'building';
    object.applyMatrix4(m);
    this.group.add(object);
    // Meshing runs in workers; the building appears when its mesh arrives (see ready()).
    const job = this.pool.mesh(built.grid, built.origin, this.lod, this.sync).then((levels) => {
      object.add(this.levelsToObject(levels, spec.w, spec.d));
      object.updateMatrixWorld(true);
    });
    this.jobs.push(job);

    // Colliders. Quarter turns keep boxes axis-aligned.
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
    for (const b of built.boxes) {
      tmpA.set(...b.min).applyMatrix4(m);
      tmpB.set(...b.max).applyMatrix4(m);
      this.addBox(tmpA.clone().min(tmpB), tmpA.clone().max(tmpB));
    }
    if (this.physics) {
      const body = this.fixedBody()!;
      for (const h of built.hulls) {
        const pts = new Float32Array(h.length);
        for (let i = 0; i < h.length; i += 3) {
          tmpA.set(h[i], h[i + 1], h[i + 2]).applyMatrix4(m);
          pts[i] = tmpA.x;
          pts[i + 1] = tmpA.y;
          pts[i + 2] = tmpA.z;
        }
        const cd = RAPIER.ColliderDesc.convexHull(pts);
        if (cd) this.physics.createCollider(cd.setFriction(0.9).setCollisionGroups(groups(G_WORLD, G_ALL)), body);
      }
    }

    const bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(spec.w, built.height, spec.d)).applyMatrix4(m);
    const placed: PlacedBuilding = {
      object,
      loaded: job,
      bounds,
      doors: built.doors.map((d) => new THREE.Vector3(...d).applyMatrix4(m)),
      wallTop: (spec.y ?? 0) + built.wallTop,
      built,
    };
    this.buildings.push(placed);
    this.buildMs += performance.now() - t0;
    return placed;
  }

  private levelsToObject(levels: MeshArrays[], w: number, d: number): THREE.Object3D {
    const sizes = [DV, DV * 2, DV * 4];
    if (levels.length === 1) return this.mesh(toGeometry(levels[0]), DV);
    // LOD distances are measured from the LOD's position, so center it on the footprint.
    const lod = new THREE.LOD();
    lod.position.set(w / 2, 0, d / 2);
    const dists = [0, this.lodD[0], this.lodD[1]];
    levels.forEach((lv, i) => {
      const mesh = this.mesh(toGeometry(lv), sizes[i]);
      mesh.position.set(-w / 2, 0, -d / 2);
      lod.addLevel(mesh, dists[i]);
    });
    return lod;
  }

  /** Resolves when every building queued so far has its mesh in the scene. */
  async ready(): Promise<void> {
    while (this.jobs.length) {
      const jobs = this.jobs;
      this.jobs = [];
      await Promise.all(jobs);
    }
  }

  private mesh(geo: THREE.BufferGeometry, size: number) {
    const mesh = new THREE.Mesh(geo, kitMaterial(size));
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = true;
    if (size === DV) this.tris += triCount(geo);
    return mesh;
  }

  /**
   * A row of attached buildings filling a frontage, like a town street. Buildings vary in
   * width, height, color and ground floor; the inner side walls are party walls.
   */
  row(o: RowOptions): PlacedBuilding[] {
    const rng = mulberry32(o.seed ?? 1234);
    const [wMin, wMax] = o.widths ?? [7, 12];
    const [fMin, fMax] = o.floors ?? [2, 4];
    const widths: number[] = [];
    let left = o.length;
    while (left > 0) {
      let w = Math.round(wMin + rng() * (wMax - wMin));
      if (left - w < wMin) w = left;
      widths.push(w);
      left -= w;
    }
    const out: PlacedBuilding[] = [];
    const face = o.face ?? 'n';
    // Lay buildings along the row's local x, then map through the row's own placement.
    const rowM = StreetKit.placement({ ...o, face }, o.length, o.depth);
    let signI = 0;
    let lx = 0;
    widths.forEach((w, i) => {
      const seed = Math.floor(rng() * 1e9);
      const floors = fMin + Math.floor(rng() * (fMax - fMin + 1));
      // Local x of this building in the row frame: the row's front faces -z like a building.
      const localMin = new THREE.Vector3(o.length - lx - w, 0, 0); // u runs from +x to -x along the facade
      const p = localMin.clone().applyMatrix4(rowM);
      const pb = new THREE.Vector3(o.length - lx, 0, o.depth).applyMatrix4(rowM);
      const spec: BuildingSpec & Placement = {
        preset: o.preset,
        seed,
        floors,
        ...o.spec,
        w,
        d: o.depth,
        x: Math.min(p.x, pb.x),
        z: Math.min(p.z, pb.z),
        y: o.y,
        face,
        party: { left: i > 0, right: i < widths.length - 1 },
      };
      const probe = buildSpecGround(spec);
      if (probe === 'shop' && o.signs && signI < o.signs.length && spec.sign === undefined) spec.sign = o.signs[signI++];
      out.push(this.building(spec));
      lx += w;
    });
    return out;
  }

  /** Paved ground (cobbles, sidewalk slabs, brick pavers, plaza flags) over a world rectangle. */
  street(o: StreetOptions): THREE.Mesh[] {
    const kind = o.kind ?? 'cobble';
    const along = o.along ?? (Math.abs(o.x1 - o.x0) >= Math.abs(o.z1 - o.z0) ? 'x' : 'z');
    const x0 = Math.min(o.x0, o.x1), x1 = Math.max(o.x0, o.x1), z0 = Math.min(o.z0, o.z1), z1 = Math.max(o.z0, o.z1);
    const out: THREE.Mesh[] = [];
    for (let cx = x0; cx < x1; cx += CHUNK)
      for (let cz = z0; cz < z1; cz += CHUNK) {
        const ex = Math.min(cx + CHUNK, x1), ez = Math.min(cz + CHUNK, z1);
        const curb = (o.curb ?? []).filter((s) => (s === 'n' && cz === z0) || (s === 's' && ez === z1) || (s === 'w' && cx === x0) || (s === 'e' && ex === x1));
        const { grid, wx0, wz0 } = pavingGrid(kind, cx, cz, ex, ez, along, curb);
        const mesh = new THREE.Mesh(meshGrid(grid, { noBottom: true }), kitMaterial(DV));
        mesh.position.set(wx0 * DV, (o.y ?? 0) - DV + 0.02, wz0 * DV);
        mesh.receiveShadow = true;
        this.tris += triCount(mesh.geometry);
        this.group.add(mesh);
        out.push(mesh);
      }
    return out;
  }

  /** Queue an instanced street prop. rotY in radians. Call finish() once after placing them all. */
  prop(kind: PropKind, x: number, y: number, z: number, rotY = 0, opts: { collide?: boolean; scale?: number; color?: number } = {}) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3().setScalar(opts.scale ?? 1));
    const key = `${kind}:${Math.floor(x / CHUNK)}:${Math.floor(z / CHUNK)}`;
    let bucket = this.props.get(key);
    if (!bucket) {
      bucket = { kind, mats: [], colors: [] };
      this.props.set(key, bucket);
    }
    bucket.mats.push(m);
    bucket.colors.push(opts.color !== undefined ? new THREE.Color(opts.color) : null);
    const model = propModel(kind);
    if (model.half && opts.collide !== false) {
      const [hx, hy, hz] = model.half;
      const s = opts.scale ?? 1;
      // Rotated boxes are approximated by their axis-aligned bounds.
      const c = Math.abs(Math.cos(rotY)), sn = Math.abs(Math.sin(rotY));
      const ex = (hx * c + hz * sn) * s, ez = (hx * sn + hz * c) * s;
      this.addBox(new THREE.Vector3(x - ex, y, z - ez), new THREE.Vector3(x + ex, y + hy * 2 * s, z + ez));
    }
  }

  /** A string of pennant flags hung between two points, sagging in the middle. */
  bunting(a: THREE.Vector3, b: THREE.Vector3, opts: { sag?: number; colors?: number[]; spacing?: number } = {}) {
    const sag = opts.sag ?? Math.max(0.6, a.distanceTo(b) * 0.08);
    const colors = opts.colors ?? [0xe0303a, 0xf2d040, 0x2f7ad0, 0xf4f0f0, 0x3fae5a, 0xf06aa8];
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a);
    const rotY = Math.atan2(-dir.z, dir.x);
    const at = (t: number) => a.clone().lerp(b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
    const ropeN = Math.ceil(len / DV);
    for (let i = 0; i <= ropeN; i++) {
      const p = at(i / ropeN);
      this.prop('rope', p.x, p.y, p.z, 0, { collide: false, scale: 0.6 });
    }
    const spacing = opts.spacing ?? 0.8;
    const n = Math.floor(len / spacing);
    for (let i = 1; i < n; i++) {
      const p = at(i / n);
      this.prop('flag', p.x, p.y - 5 * DV, p.z, rotY, { collide: false, color: colors[i % colors.length] });
    }
  }

  /** Build the instanced meshes for all queued props. Safe to call again after adding more. */
  finish() {
    for (const o of this.finished) {
      this.group.remove(o);
      (o as THREE.InstancedMesh).dispose?.();
    }
    this.finished = [];
    const geos = new Map<PropKind, THREE.BufferGeometry>();
    for (const bucket of this.props.values()) {
      let geo = geos.get(bucket.kind);
      if (!geo) {
        const model = propModel(bucket.kind);
        geo = meshGrid(model.grid, { origin: model.origin });
        geos.set(bucket.kind, geo);
      }
      const im = new THREE.InstancedMesh(geo, kitMaterial(DV), bucket.mats.length);
      bucket.mats.forEach((m, i) => im.setMatrixAt(i, m));
      if (bucket.colors.some((c) => c)) bucket.colors.forEach((c, i) => im.setColorAt(i, c ?? new THREE.Color(1, 1, 1)));
      im.castShadow = this.shadows && bucket.kind !== 'rope';
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
      this.finished.push(im);
    }
  }

  stats() {
    let instances = 0;
    for (const b of this.props.values()) instances += b.mats.length;
    return { buildings: this.buildings.length, fullDetailTris: this.tris, propInstances: instances, buildMs: Math.round(this.buildMs) };
  }
}

/** What ground floor a spec will get, without building it (for handing out signs). */
function buildSpecGround(s: BuildingSpec): string {
  if (s.ground) return s.ground;
  // Mirrors fillDefaults' first random draws closely enough: just build and read it back.
  return buildBuildingGroundOnly(s);
}
function buildBuildingGroundOnly(s: BuildingSpec) {
  const preset = s.preset ?? 'euro';
  if (preset === 'mainstreet') return 'shop';
  if (preset === 'house') return 'house';
  if (preset === 'modern') return 'door';
  // Euro: decide here and pin it, so the sign goes to a building that really has a shop.
  const g = mulberry32((s.seed ?? 0) ^ 0x2545f491)() < 0.6 ? 'shop' : 'door';
  s.ground = g;
  return g;
}

