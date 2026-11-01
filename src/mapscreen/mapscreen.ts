import { TILE, drawWaypointPin, WAYPOINT_COLOR, type MapTiles } from '../minimap';
import type { Input } from '../input';
import { POI_STYLE, type MapPoi, type PoiKind } from './pois';
import { DEATH_BY_ID } from '../deaths';

export interface Waypoint {
  x: number;
  z: number;
  /** The place it was dropped on, if any. */
  name?: string;
}

/** What the map needs from the game each frame it is open. */
export interface MapView {
  player: { x: number; z: number; facing: number };
  waypoint: Waypoint | null;
  route: { x: number; z: number }[] | null;
  /** Has this death been found (named in the ledger)? */
  found(id: string): boolean;
}

/** Kinds hidden until switched on in the legend (they'd bury everything else). */
const HIDDEN_BY_DEFAULT = new Set<PoiKind>(['home', 'atm']);
const HOVER_PX = 14;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The enlarged, north-up map (N on the keyboard, right stick click on a controller, or click
 * the radar). It shows every point of interest on the current map, the player and the GPS
 * route. Click anywhere (or press A over a spot) to drop a waypoint the radar then guides you
 * to. The game is paused while it is open.
 */
export class MapScreen {
  readonly el: HTMLElement;
  open = false;
  /** A waypoint was set (or cleared with null). */
  onWaypoint: ((wp: Waypoint | null) => void) | null = null;
  /** The player closed the map. */
  onClose: (() => void) | null = null;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private titleEl: HTMLElement;
  private legendEl: HTMLElement;
  private tipEl: HTMLElement;
  private hintEl: HTMLElement;
  private name = '';
  private pois: MapPoi[] = [];
  private hidden = new Set<PoiKind>(HIDDEN_BY_DEFAULT);
  /** View center in world blocks and zoom in CSS pixels per block. */
  private vx = 0;
  private vz = 0;
  private scale = 1;
  private targetScale = 1;
  /** Gliding the view to a spot (D-pad jumps between places). */
  private glide: { x: number; z: number } | null = null;
  /** 'mouse' shows the tooltip at the cursor; 'center' uses the crosshair (keys and controller). */
  private aim: 'mouse' | 'center' = 'mouse';
  private mouse = { x: 0, y: 0, inside: false };
  private drag: { x: number; y: number; vx: number; vz: number; moved: boolean } | null = null;
  private hover: MapPoi | null = null;
  private cycle = -1;
  private view: MapView | null = null;
  private padMode = false;

  constructor(parent: HTMLElement, private tiles: MapTiles) {
    this.el = document.createElement('div');
    this.el.className = 'mapscreen hidden';
    this.el.innerHTML = `
      <canvas></canvas>
      <div class="ms-title"></div>
      <div class="ms-legend"></div>
      <div class="ms-tip hidden"></div>
      <div class="ms-cross"></div>
      <div class="ms-hint"></div>`;
    parent.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.titleEl = this.el.querySelector('.ms-title')!;
    this.legendEl = this.el.querySelector('.ms-legend')!;
    this.tipEl = this.el.querySelector('.ms-tip')!;
    this.hintEl = this.el.querySelector('.ms-hint')!;

    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.aim = 'mouse';
      this.setMouse(e);
      if (e.button === 2) {
        this.setWaypoint(null);
        return;
      }
      if (e.button === 0) this.drag = { x: e.clientX, y: e.clientY, vx: this.vx, vz: this.vz, moved: false };
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.open) return;
      this.setMouse(e);
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 0) this.aim = 'mouse';
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) > 4) d.moved = true;
      if (d.moved) {
        this.glide = null;
        this.vx = d.vx - dx / this.scale;
        this.vz = d.vz - dy / this.scale;
        this.clampView();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.open || e.button !== 0 || !this.drag) return;
      const d = this.drag;
      this.drag = null;
      if (d.moved) return;
      this.setMouse(e);
      this.clickAt(this.mouse.x, this.mouse.y);
    });
    c.addEventListener('mouseleave', () => (this.mouse.inside = false));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.setMouse(e);
        const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
        this.zoomAt(Math.exp((-e.deltaY * unit) / 500), this.mouse.x, this.mouse.y);
      },
      { passive: false },
    );
    this.legendEl.addEventListener('mousedown', (e) => e.stopPropagation());
    this.legendEl.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-kind],[data-act]');
      if (!t) return;
      if (t.dataset.act === 'clear') this.setWaypoint(null);
      else if (t.dataset.act === 'close') this.close();
      else {
        const k = t.dataset.kind as PoiKind;
        if (this.hidden.has(k)) this.hidden.delete(k);
        else this.hidden.add(k);
        this.renderLegend();
      }
    });
  }

  /** Point the map at a (new) map's points of interest. */
  setMap(name: string, pois: MapPoi[]) {
    this.name = name;
    this.pois = pois;
    this.cycle = -1;
    if (this.open) this.renderLegend();
  }

  toggle(view: MapView) {
    if (this.open) this.close();
    else this.show(view);
  }

  show(view: MapView) {
    if (!this.tiles.world) return;
    this.open = true;
    this.view = view;
    this.el.classList.remove('hidden');
    this.resize();
    // Open centered on the player, zoomed so most of the map shows.
    const w = this.tiles.world;
    const fit = this.fitScale();
    this.scale = this.targetScale = Math.max(fit, Math.min(this.canvas.clientWidth, this.canvas.clientHeight) / Math.min(w.sx, w.sz, 420));
    this.vx = view.player.x;
    this.vz = view.player.z;
    this.clampView();
    this.glide = null;
    this.drag = null;
    this.cycle = -1;
    this.renderLegend();
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.drag = null;
    this.el.classList.add('hidden');
    this.tipEl.classList.add('hidden');
    this.onClose?.();
  }

  /** Call every frame while open, with the game's input. */
  update(inp: Input, dt: number, view: MapView) {
    if (!this.open) return;
    this.view = view;
    if (inp.padConnected !== this.padMode) {
      this.padMode = inp.padConnected;
      this.renderHint();
    }
    if (inp.pressed('back') || inp.pressed('map')) {
      this.close();
      return;
    }
    this.resize();
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;

    // Pan with WASD / arrows / left stick, zoom with R V / D-pad up-down / right stick / + -.
    const mx = inp.moveX, my = inp.moveY;
    if (mx || my) {
      this.aim = 'center';
      this.glide = null;
      const sp = (Math.min(W, H) * 0.9) / this.scale;
      this.vx += mx * sp * dt;
      this.vz -= my * sp * dt;
      this.clampView();
    }
    let zoom = 0;
    if (inp.held('up') || inp.held('zoomIn')) zoom += 1;
    if (inp.held('down') || inp.held('zoomOut')) zoom -= 1;
    zoom -= inp.lookY;
    if (zoom) {
      this.aim = this.aim === 'mouse' && this.mouse.inside ? 'mouse' : 'center';
      this.targetScale = this.clampScale(this.targetScale * Math.exp(zoom * dt * 1.6));
    }
    if (Math.abs(this.targetScale - this.scale) > 1e-4) {
      const k = Math.min(1, dt * 12);
      const ns = this.scale + (this.targetScale - this.scale) * k;
      // Keyboard and stick zoom around the crosshair, wheel zoom around the cursor (zoomAt).
      this.scale = ns;
      this.clampView();
    }
    if (inp.pressed('nextPoi') || inp.pressed('prevPoi')) this.jump(inp.pressed('nextPoi') ? 1 : -1);
    if (this.glide) {
      const k = Math.min(1, dt * 9);
      this.vx += (this.glide.x - this.vx) * k;
      this.vz += (this.glide.z - this.vz) * k;
      if (Math.hypot(this.glide.x - this.vx, this.glide.z - this.vz) < 0.05) this.glide = null;
    }

    // What's under the cursor or crosshair.
    const ax = this.aim === 'mouse' ? this.mouse.x : W / 2;
    const ay = this.aim === 'mouse' ? this.mouse.y : H / 2;
    this.hover = this.aim === 'mouse' && !this.mouse.inside ? null : this.poiAt(ax, ay);
    if (inp.pressed('confirm')) this.clickAt(W / 2, H / 2);
    if (inp.pressed('punch')) this.setWaypoint(null);

    this.draw();
    this.renderTip(ax, ay);
    this.el.classList.toggle('aim-center', this.aim === 'center');
  }

  // ------------------------------------------------------------- helpers

  private setMouse(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    this.mouse.inside = this.mouse.x >= 0 && this.mouse.y >= 0 && this.mouse.x <= r.width && this.mouse.y <= r.height;
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private fitScale() {
    const w = this.tiles.world!;
    const W = this.canvas.clientWidth || window.innerWidth, H = this.canvas.clientHeight || window.innerHeight;
    return Math.min(W / w.sx, H / w.sz) * 0.92;
  }

  private clampScale(s: number) {
    return Math.max(this.fitScale(), Math.min(10, s));
  }

  private clampView() {
    const w = this.tiles.world;
    if (!w) return;
    this.vx = Math.max(0, Math.min(w.sx, this.vx));
    this.vz = Math.max(0, Math.min(w.sz, this.vz));
  }

  private zoomAt(f: number, sx: number, sy: number) {
    this.glide = null;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const before = this.toWorld(sx, sy);
    this.scale = this.targetScale = this.clampScale(this.scale * f);
    // Keep the spot under the cursor where it was.
    this.vx = before.x - (sx - W / 2) / this.scale;
    this.vz = before.z - (sy - H / 2) / this.scale;
    this.clampView();
  }

  private toWorld(sx: number, sy: number) {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    return { x: this.vx + (sx - W / 2) / this.scale, z: this.vz + (sy - H / 2) / this.scale };
  }

  private toScreen(x: number, z: number) {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    return { x: W / 2 + (x - this.vx) * this.scale, y: H / 2 + (z - this.vz) * this.scale };
  }

  private visiblePois() {
    return this.pois.filter((p) => !this.hidden.has(p.kind));
  }

  private poiAt(sx: number, sy: number) {
    let best: MapPoi | null = null, bd = HOVER_PX;
    for (const p of this.visiblePois()) {
      const s = this.toScreen(p.x, p.z);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < bd) (bd = d), (best = p);
    }
    return best;
  }

  private clickAt(sx: number, sy: number) {
    const v = this.view;
    const w = this.tiles.world;
    if (!w) return;
    // Clicking the current waypoint again removes it.
    if (v?.waypoint) {
      const s = this.toScreen(v.waypoint.x, v.waypoint.z);
      if (Math.hypot(s.x - sx, s.y - sy + 12) < 12) {
        this.setWaypoint(null);
        return;
      }
    }
    const p = this.poiAt(sx, sy);
    if (p) {
      this.setWaypoint({ x: p.x, z: p.z, name: p.name });
      return;
    }
    const at = this.toWorld(sx, sy);
    if (at.x < 0 || at.z < 0 || at.x >= w.sx || at.z >= w.sz) return;
    this.setWaypoint({ x: at.x, z: at.z });
  }

  private setWaypoint(wp: Waypoint | null) {
    this.onWaypoint?.(wp);
    if (this.view) this.view.waypoint = wp;
    this.renderLegend();
  }

  /** Glide the crosshair to the next / previous place, nearest first from the player. */
  private jump(dir: number) {
    const v = this.view;
    const list = this.visiblePois();
    if (!list.length || !v) return;
    list.sort((a, b) => Math.hypot(a.x - v.player.x, a.z - v.player.z) - Math.hypot(b.x - v.player.x, b.z - v.player.z));
    this.cycle = (((this.cycle + dir) % list.length) + list.length) % list.length;
    const p = list[this.cycle];
    this.glide = { x: p.x, z: p.z };
    this.aim = 'center';
    this.targetScale = Math.max(this.targetScale, this.clampScale(2.2));
  }

  // ------------------------------------------------------------- drawing

  private draw() {
    const w = this.tiles.world!;
    const v = this.view!;
    const ctx = this.ctx;
    const dpr = this.canvas.width / (this.canvas.clientWidth || 1);
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#121822';
    ctx.fillRect(0, 0, W, H);

    // Map tiles (built a few at a time so opening a huge map never hitches).
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.vx, -this.vz);
    ctx.imageSmoothingEnabled = this.scale < 1.5;
    ctx.fillStyle = '#1b2230';
    ctx.fillRect(0, 0, w.sx, w.sz);
    const tl = this.toWorld(0, 0), br = this.toWorld(W, H);
    const t0x = Math.max(0, Math.floor(tl.x / TILE)), t1x = Math.min(Math.ceil(w.sx / TILE) - 1, Math.floor(br.x / TILE));
    const t0z = Math.max(0, Math.floor(tl.z / TILE)), t1z = Math.min(Math.ceil(w.sz / TILE) - 1, Math.floor(br.z / TILE));
    const t0 = performance.now();
    for (let tx = t0x; tx <= t1x; tx++)
      for (let tz = t0z; tz <= t1z; tz++) {
        if (!this.tiles.has(tx, tz) && performance.now() - t0 > 10) continue;
        ctx.drawImage(this.tiles.tile(tx, tz), tx * TILE, tz * TILE);
      }
    // Map border.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5 / this.scale;
    ctx.strokeRect(0, 0, w.sx, w.sz);

    // GPS route.
    const route = v.route;
    if (route && route.length > 1) {
      ctx.beginPath();
      ctx.moveTo(route[0].x, route[0].z);
      for (let i = 1; i < route.length; i++) ctx.lineTo(route[i].x, route[i].z);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 7 / this.scale;
      ctx.stroke();
      ctx.strokeStyle = WAYPOINT_COLOR;
      ctx.lineWidth = 4 / this.scale;
      ctx.stroke();
    }
    ctx.restore();

    // Badges in screen space.
    const labels = this.scale >= 2.4;
    const r = Math.max(7, Math.min(11, 6 + this.scale * 1.2));
    for (const p of this.visiblePois()) {
      const s = this.toScreen(p.x, p.z);
      if (s.x < -20 || s.y < -20 || s.x > W + 20 || s.y > H + 20) continue;
      this.badge(ctx, p, s.x, s.y, p === this.hover ? r * 1.3 : r, v);
      if (labels && p.kind !== 'home') {
        ctx.font = 'bold 11px Verdana, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(p.name, s.x, s.y + r + 3);
        ctx.fillStyle = '#fff';
        ctx.fillText(p.name, s.x, s.y + r + 3);
      }
    }

    // Waypoint pin.
    if (v.waypoint) {
      const s = this.toScreen(v.waypoint.x, v.waypoint.z);
      ctx.save();
      ctx.translate(s.x, s.y);
      drawWaypointPin(ctx, 1.25);
      ctx.restore();
    }

    // Player arrow.
    const ps = this.toScreen(v.player.x, v.player.z);
    ctx.save();
    ctx.translate(ps.x, ps.y);
    ctx.rotate(-v.player.facing);
    const a = 10;
    ctx.beginPath();
    ctx.moveTo(0, a);
    ctx.lineTo(a * 0.72, -a * 0.75);
    ctx.lineTo(0, -a * 0.35);
    ctx.lineTo(-a * 0.72, -a * 0.75);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Compass.
    ctx.save();
    ctx.translate(W - 40, H - 70);
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, 1);
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(5, -16);
    ctx.lineTo(-5, -16);
    ctx.fill();
    ctx.restore();
  }

  private badge(ctx: CanvasRenderingContext2D, p: MapPoi, x: number, y: number, r: number, v: MapView) {
    const st = POI_STYLE[p.kind];
    const color = p.color ?? st.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.fillStyle = p.kind === 'death' ? '#fff' : '#000';
    const label = p.label ?? st.label;
    ctx.font = `bold ${Math.round(r * (label.length > 1 ? 0.95 : 1.25))}px Verdana, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
    // Staff-only lock and unfound-death pips.
    if (p.staffOnly) {
      ctx.fillStyle = '#ffd84a';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.2;
      const lx = x - r * 0.85, ly = y - r * 0.85;
      ctx.fillRect(lx - 3.5, ly - 1, 7, 5.5);
      ctx.strokeRect(lx - 3.5, ly - 1, 7, 5.5);
      ctx.beginPath();
      ctx.arc(lx, ly - 1, 2.4, Math.PI, 0);
      ctx.stroke();
    }
    if (p.deaths?.length && p.kind !== 'death') {
      const left = p.deaths.filter((id) => !v.found(id)).length;
      const px = x + r * 0.85, py = y - r * 0.85;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = left ? '#ff3a4a' : '#555';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px Verdana, sans-serif';
      ctx.fillText('☠', px, py + 0.5);
    }
  }

  private renderTip(ax: number, ay: number) {
    const p = this.hover;
    if (!p || !this.view) {
      this.tipEl.classList.add('hidden');
      return;
    }
    const st = POI_STYLE[p.kind];
    let html = `<b>${esc(p.name)}</b><div class="ms-kind">${esc(st.name.replace(/s$/, '').replace(/ ·.*/, ''))}</div>`;
    for (const line of p.info ?? []) html += `<div>${esc(line)}</div>`;
    if (p.staffOnly) html += `<div class="ms-lock">Staff only: ${esc(p.staffOnly.join(', '))}</div>`;
    if (p.deaths?.length) {
      const found = p.deaths.filter((id) => this.view!.found(id));
      html += `<div class="ms-deaths">☠ Deaths here: ${found.length} of ${p.deaths.length} found</div>`;
      for (const id of found) html += `<div class="ms-death">${esc(DEATH_BY_ID[id]?.name ?? id)}</div>`;
      if (found.length < p.deaths.length) html += `<div class="ms-death unk">${'??? '.repeat(p.deaths.length - found.length).trim()}</div>`;
    }
    html += `<div class="ms-act">${this.padMode && this.aim === 'center' ? 'A' : this.aim === 'center' ? 'E / Space' : 'Click'}: set waypoint</div>`;
    this.tipEl.innerHTML = html;
    this.tipEl.classList.remove('hidden');
    const W = this.canvas.clientWidth;
    const tw = this.tipEl.offsetWidth;
    const left = ax + 18 + tw > W - 8 ? ax - 18 - tw : ax + 18;
    this.tipEl.style.left = `${Math.max(8, left)}px`;
    this.tipEl.style.top = `${Math.max(8, ay - 10)}px`;
  }

  private renderLegend() {
    const v = this.view;
    const counts = new Map<PoiKind, number>();
    for (const p of this.pois) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
    const allDeaths = this.pois.flatMap((p) => p.deaths ?? []);
    const found = v ? allDeaths.filter((id) => v.found(id)).length : 0;
    this.titleEl.innerHTML = `<b>${esc(this.name)}</b>${allDeaths.length ? `<span>☠ ${found} / ${allDeaths.length} death spots found</span>` : ''}`;
    const rows = (Object.keys(POI_STYLE) as PoiKind[])
      .filter((k) => counts.get(k))
      .map((k) => {
        const st = POI_STYLE[k];
        const off = this.hidden.has(k);
        return `<div class="ms-row${off ? ' off' : ''}" data-kind="${k}"><i style="background:${st.color}">${st.label}</i><span>${st.name}</span><em>${counts.get(k)}</em></div>`;
      })
      .join('');
    const wp = v?.waypoint;
    this.legendEl.innerHTML = `
      <div class="ms-lh">Legend <small>click to show / hide</small></div>
      ${rows}
      <div class="ms-row static"><i class="lock"></i><span>Staff only (job needed)</span></div>
      <div class="ms-wp">${wp ? `<i class="pin"></i><span>${esc(wp.name ?? 'Waypoint')}</span><button data-act="clear">Clear</button>` : '<span class="dim">No waypoint set</span>'}</div>
      <button class="ms-close" data-act="close">Close map</button>`;
    this.renderHint();
  }

  private renderHint() {
    this.hintEl.innerHTML = this.padMode
      ? '<b>L stick</b> move · <b>R stick / D-pad ↑↓</b> zoom · <b>D-pad ←→</b> jump to places · <b>A</b> set waypoint · <b>X</b> clear · <b>B</b> close'
      : '<b>Click</b> set waypoint · <b>Right-click</b> clear · <b>Drag</b> / <b>WASD</b> pan · <b>Wheel</b> / <b>R V</b> zoom · <b>[ ]</b> jump to places · <b>N</b> / <b>Esc</b> close';
  }
}
