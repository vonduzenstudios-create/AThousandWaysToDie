import { B, blockColor, type VoxelWorld } from './voxel';

/** Something drawn on the radar. */
export interface Blip {
  x: number;
  z: number;
  kind: 'car' | 'person' | 'poi';
  /** CSS color. */
  color?: string;
  /** Facing angle (game convention: forward = (sin f, cos f)), for cars. */
  facing?: number;
  /** One or two characters drawn in a poi badge. */
  label?: string;
}

/** The world as the minimap needs it. Any VoxelWorld works, on any map. */
export type World = Pick<VoxelWorld, 'sx' | 'sy' | 'sz' | 'get' | 'topY'>;

export const TILE = 64;
const ROAD = new Set<number>([B.Asphalt, B.Yellow]);
const PATH = new Set<number>([B.Sidewalk, B.Gravel, B.Concrete]);

/**
 * The radar's map picture, drawn straight from the voxels in 64 x 64 tiles and cached.
 * The radar and the full-screen map share one of these, so a tile is only ever built once.
 */
export class MapTiles {
  world: World | null = null;
  /** Ground level, for telling streets from rooftops. */
  base = 4;
  private tiles = new Map<number, HTMLCanvasElement>();

  setWorld(world: World, groundY?: number) {
    this.world = world;
    this.tiles.clear();
    // Ground level: the most common surface height along a coarse grid.
    if (groundY !== undefined) this.base = groundY;
    else {
      const counts = new Map<number, number>();
      for (let x = 4; x < world.sx; x += Math.max(4, world.sx >> 5))
        for (let z = 4; z < world.sz; z += Math.max(4, world.sz >> 5)) {
          const y = world.topY(x, z);
          counts.set(y, (counts.get(y) ?? 0) + 1);
        }
      let best = 0, bc = -1;
      for (const [y, c] of counts) if (c > bc) (bc = c), (best = y);
      this.base = best;
    }
  }

  invalidate(x: number, z: number) {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    this.tiles.delete(tx * 4096 + tz);
  }

  has(tx: number, tz: number) {
    return this.tiles.has(tx * 4096 + tz);
  }

  /** The tile at tile coords (tx, tz), building it if needed. */
  tile(tx: number, tz: number) {
    const key = tx * 4096 + tz;
    const have = this.tiles.get(key);
    if (have) return have;
    const w = this.world!;
    const c = document.createElement('canvas');
    c.width = TILE;
    c.height = TILE;
    const g = c.getContext('2d')!;
    const img = g.createImageData(TILE, TILE);
    const d = img.data;
    for (let lz = 0; lz < TILE; lz++)
      for (let lx = 0; lx < TILE; lx++) {
        const x = tx * TILE + lx, z = tz * TILE + lz;
        const i = (lz * TILE + lx) * 4;
        if (x < 0 || z < 0 || x >= w.sx || z >= w.sz) {
          d[i + 3] = 0;
          continue;
        }
        const top = w.topY(x, z);
        if (top === 0) {
          d[i + 3] = 0;
          continue;
        }
        const b = w.get(x, top - 1, z);
        let r: number, gg: number, bb: number;
        if (ROAD.has(b)) [r, gg, bb] = [196, 199, 206];
        else if (PATH.has(b) && top <= this.base + 1) [r, gg, bb] = [128, 132, 140];
        else {
          const hex = blockColor(b);
          // Muted, darker map colors like a GPS radar, lifted for taller things.
          const lift = Math.max(-0.25, Math.min(0.45, (top - this.base) / 26));
          const k = 0.62 + lift;
          r = ((hex >> 16) & 255) * k;
          gg = ((hex >> 8) & 255) * k;
          bb = (hex & 255) * k;
          // Buildings and big props get a hint of an outline on their edges.
          if (top > this.base + 2) {
            const edge = w.topY(x + 1, z) < top - 1 || w.topY(x - 1, z) < top - 1 || w.topY(x, z + 1) < top - 1 || w.topY(x, z - 1) < top - 1;
            if (edge) (r *= 0.55), (gg *= 0.55), (bb *= 0.55);
          }
        }
        d[i] = r;
        d[i + 1] = gg;
        d[i + 2] = bb;
        d[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    this.tiles.set(key, c);
    return c;
  }

}

/** Purple GPS color, shared by the radar and the full map. */
export const WAYPOINT_COLOR = '#c45cff';

/** Draw the waypoint flag (a pin) at (0, 0) in the current transform, `u` = one screen pixel. */
export function drawWaypointPin(ctx: CanvasRenderingContext2D, u: number) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-3 * u, -6 * u, -8 * u, -9 * u, -8 * u, -15 * u);
  ctx.arc(0, -15 * u, 8 * u, Math.PI, 0);
  ctx.bezierCurveTo(8 * u, -9 * u, 3 * u, -6 * u, 0, 0);
  ctx.closePath();
  ctx.fillStyle = WAYPOINT_COLOR;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.6 * u;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -15 * u, 3.2 * u, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

/**
 * GTA-style round radar in the top-right corner. It rotates with the camera so "up" is
 * always where you're looking, and draws the map straight from the voxels, so it works
 * on any map with no extra data. Tiles are built lazily around the player.
 */
export class Minimap {
  readonly el: HTMLElement;
  /** The voxel map picture. The full-screen map shares it. */
  readonly tiles = new MapTiles();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private label: HTMLElement;
  private speedEl: HTMLElement;
  private wpEl: HTMLElement;
  /** Pixels per block, eased toward the wanted zoom. */
  private zoom = 2.6;
  private waypoint: { x: number; z: number } | null = null;
  private route: { x: number; z: number }[] | null = null;
  /** Clicking the radar (opens the full map). */
  onClick: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'minimap';
    this.canvas = document.createElement('canvas');
    this.label = document.createElement('div');
    this.label.className = 'mm-name';
    this.speedEl = document.createElement('div');
    this.speedEl.className = 'mm-speed hidden';
    this.wpEl = document.createElement('div');
    this.wpEl.className = 'mm-wp hidden';
    const hint = document.createElement('div');
    hint.className = 'mm-hint';
    hint.innerHTML = '<span class="key">N</span> Map';
    this.el.append(this.canvas, this.label, this.speedEl, this.wpEl, hint);
    parent.appendChild(this.el);
    this.ctx = this.canvas.getContext('2d')!;
    this.el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.button === 0) this.onClick?.();
    });
  }

  /** Point the radar at a (new) map. */
  setWorld(world: World, name = '', groundY?: number) {
    this.tiles.setWorld(world, groundY);
    this.label.textContent = name;
  }

  /** Forget cached tiles around a spot after the world was edited there. */
  invalidate(x: number, z: number) {
    this.tiles.invalidate(x, z);
  }

  /** Speedometer under the radar while driving (null hides it). */
  setSpeed(mph: number | null) {
    this.speedEl.classList.toggle('hidden', mph === null);
    if (mph !== null) this.speedEl.innerHTML = `<b>${Math.round(mph)}</b> mph`;
  }

  /** The GPS waypoint and the road route to it (null clears). `dist` is shown under the radar, in blocks. */
  setWaypoint(wp: { x: number; z: number } | null, route: { x: number; z: number }[] | null, dist = 0) {
    this.waypoint = wp;
    this.route = route;
    this.wpEl.classList.toggle('hidden', !wp);
    if (wp) this.wpEl.textContent = `${dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'}`;
  }

  setVisible(on: boolean) {
    this.el.classList.toggle('hidden', !on);
  }

  /**
   * Draw the radar. `yaw` is the camera yaw (the view direction ends up pointing up),
   * `facing` is the player arrow's facing, `wantZoom` is pixels per block.
   */
  draw(cx: number, cz: number, yaw: number, facing: number, blips: Blip[], wantZoom: number, dt: number) {
    const world = this.tiles.world;
    if (!world) return;
    const css = this.el.clientWidth || 180;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(css * dpr);
    if (this.canvas.width !== size) {
      this.canvas.width = size;
      this.canvas.height = size;
    }
    this.zoom += (wantZoom - this.zoom) * Math.min(1, dt * 3);
    const ctx = this.ctx;
    const R = size / 2;
    const z = this.zoom * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2 * dpr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1b2230';
    ctx.fillRect(0, 0, size, size);

    // World layer: rotate so the camera's view direction points up.
    ctx.translate(R, R);
    ctx.rotate(yaw);
    ctx.scale(z, z);
    ctx.translate(-cx, -cz);
    ctx.imageSmoothingEnabled = false;
    const reach = (R * 1.45) / z;
    const t0x = Math.floor((cx - reach) / TILE), t1x = Math.floor((cx + reach) / TILE);
    const t0z = Math.floor((cz - reach) / TILE), t1z = Math.floor((cz + reach) / TILE);
    let built = 0;
    for (let tx = t0x; tx <= t1x; tx++)
      for (let tz = t0z; tz <= t1z; tz++) {
        if (tx < 0 || tz < 0 || tx * TILE >= world.sx || tz * TILE >= world.sz) continue;
        if (!this.tiles.has(tx, tz)) {
          // Build at most two new tiles a frame so a big map never hitches.
          if (built >= 2) continue;
          built++;
        }
        ctx.drawImage(this.tiles.tile(tx, tz), tx * TILE, tz * TILE);
      }

    const s = dpr / z;
    // GPS route along the roads.
    if (this.route && this.route.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.route[0].x, this.route[0].z);
      for (let i = 1; i < this.route.length; i++) ctx.lineTo(this.route[i].x, this.route[i].z);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 7 * s;
      ctx.stroke();
      ctx.strokeStyle = WAYPOINT_COLOR;
      ctx.lineWidth = 4 * s;
      ctx.stroke();
    }

    // Blips in world space, sized in screen pixels.
    for (const b of blips) {
      if (Math.hypot(b.x - cx, b.z - cz) > reach) continue;
      ctx.save();
      ctx.translate(b.x, b.z);
      if (b.kind === 'car') {
        ctx.rotate(-(b.facing ?? 0));
        ctx.fillStyle = b.color ?? '#e8e8e8';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = s;
        ctx.fillRect(-1.25, -2.6, 2.5, 5.2);
        ctx.strokeRect(-1.25, -2.6, 2.5, 5.2);
      } else if (b.kind === 'person') {
        ctx.fillStyle = b.color ?? '#f0f0f0';
        ctx.beginPath();
        ctx.arc(0, 0, 2.6 * s, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.rotate(-yaw);
        ctx.fillStyle = b.color ?? '#ffd84a';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.arc(0, 0, 7 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (b.label) {
          ctx.fillStyle = '#000';
          ctx.font = `bold ${9 * s}px Verdana, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(b.label, 0, 0.5 * s);
        }
      }
      ctx.restore();
    }
    ctx.restore();

    // Waypoint pin: in place when it's on the radar, otherwise pinned to the rim pointing at it.
    if (this.waypoint) {
      const dx = this.waypoint.x - cx, dz = this.waypoint.z - cz;
      // Same rotation as the world layer.
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      let px = (dx * c - dz * sn) * z, py = (dx * sn + dz * c) * z;
      const lim = R - 14 * dpr;
      const d = Math.hypot(px, py);
      const onRim = d > lim;
      if (onRim) (px *= lim / d), (py *= lim / d);
      ctx.save();
      ctx.translate(R + px, R + py + (onRim ? 7 * dpr : 0));
      const u = onRim ? 0.75 * dpr : dpr;
      drawWaypointPin(ctx, u);
      ctx.restore();
    }

    // Player arrow at the center, pointing where the player faces relative to the view.
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(yaw - facing);
    const a = 8 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, a);
    ctx.lineTo(a * 0.72, -a * 0.75);
    ctx.lineTo(0, -a * 0.35);
    ctx.lineTo(-a * 0.72, -a * 0.75);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.6 * dpr;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Rim and the north marker riding on it.
    ctx.beginPath();
    ctx.arc(R, R, R - 2 * dpr, 0, Math.PI * 2);
    ctx.strokeStyle = '#0b0d14';
    ctx.lineWidth = 4 * dpr;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();
    // North is world -z; on the canvas that direction is rotated by yaw.
    const nAng = yaw - Math.PI / 2;
    const nx = R + Math.cos(nAng) * (R - 10 * dpr), ny = R + Math.sin(nAng) * (R - 10 * dpr);
    ctx.beginPath();
    ctx.arc(nx, ny, 8 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0d14';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${10 * dpr}px Verdana, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 0.5 * dpr);
  }
}
