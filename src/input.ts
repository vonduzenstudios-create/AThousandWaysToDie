export type Btn =
  | 'jump' | 'crouch' | 'sprint' | 'dive' | 'punch' | 'interact' | 'pee' | 'scream' | 'ledger' | 'music' | 'help' | 'confirm' | 'up' | 'down'
  | 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'skill5' | 'skillUse'
  | 'menuUp' | 'menuDown' | 'menuLeft' | 'menuRight' | 'back'
  | 'map' | 'zoomIn' | 'zoomOut' | 'prevPoi' | 'nextPoi' | 'lead' | 'intro';

const KEYMAP: Record<string, Btn[]> = {
  Space: ['jump', 'confirm'],
  ShiftLeft: ['sprint'],
  ShiftRight: ['sprint'],
  KeyC: ['crouch'],
  KeyF: ['punch'],
  KeyG: ['dive'],
  Digit1: ['skill1'],
  Digit2: ['skill2'],
  Digit3: ['skill3'],
  Digit4: ['skill4'],
  Digit5: ['skill5'],
  KeyE: ['interact', 'confirm'],
  KeyP: ['pee'],
  KeyQ: ['pee'],
  Tab: ['ledger'],
  KeyL: ['ledger'],
  KeyM: ['music'],
  KeyH: ['help'],
  Enter: ['confirm'],
  KeyT: ['scream'],
  ArrowUp: ['menuUp'],
  KeyW: ['menuUp'],
  ArrowDown: ['menuDown'],
  KeyS: ['menuDown'],
  ArrowLeft: ['menuLeft'],
  KeyA: ['menuLeft'],
  ArrowRight: ['menuRight'],
  KeyD: ['menuRight'],
  Escape: ['back'],
  Backspace: ['back'],
  KeyR: ['up'],
  KeyV: ['down'],
  KeyN: ['map'],
  KeyJ: ['lead'],
  KeyI: ['intro'],
  Equal: ['zoomIn'],
  NumpadAdd: ['zoomIn'],
  Minus: ['zoomOut'],
  NumpadSubtract: ['zoomOut'],
  BracketLeft: ['prevPoi'],
  BracketRight: ['nextPoi'],
};

// Standard gamepad mapping.
const PADMAP: Record<number, Btn[]> = {
  0: ['jump', 'confirm'], // A
  1: ['crouch', 'back'], // B
  2: ['punch'], // X
  3: ['interact', 'confirm'], // Y
  4: ['scream'], // LB
  5: ['pee'], // RB
  6: ['crouch'], // LT
  7: ['dive'], // RT
  8: ['ledger'], // Back / View
  9: ['help'], // Start / Menu
  11: ['map'], // Right stick click: full map
  12: ['up', 'menuUp'], // D-pad up
  13: ['down', 'menuDown'], // D-pad down
  14: ['music', 'menuLeft', 'prevPoi'], // D-pad left (on the full map: previous place)
  15: ['skillUse', 'menuRight', 'nextPoi'], // D-pad right: use the selected skill (D-pad up/down picks it; next place on the map)
};

export class Input {
  private keys = new Set<string>();
  private padDown = new Set<Btn>();
  private down = new Set<Btn>();
  private pressedSet = new Set<Btn>();
  mouseDX = 0;
  mouseDY = 0;
  /** Accumulated scroll this frame (positive = zoom out). */
  wheel = 0;
  /** Mouse buttons held over the game: left orbits the camera, right steers the character. */
  lmb = false;
  rmb = false;
  moveX = 0;
  moveY = 0;
  lookX = 0;
  lookY = 0;
  /** Hold Shift, double-tap-and-hold W, or click the left stick to sprint. */
  sprint = false;
  locked = false;
  padConnected = false;
  onAnyGesture: (() => void) | null = null;
  private lastWTap = -1;
  private sprintKey = false;
  private padSprint = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      // Ctrl / Cmd + a game key is a browser shortcut (Ctrl+W closes the tab, Ctrl+S saves,
      // Ctrl+D bookmarks...). Swallow the ones the page is allowed to; Ctrl+W/T/N can only be
      // caught in fullscreen with the keyboard locked (see lockBrowserKeys), and leaving the
      // page asks first.
      if ((e.ctrlKey || e.metaKey) && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        return;
      }
      this.onAnyGesture?.();
      if (e.repeat) return;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        const now = performance.now();
        if (this.lastWTap > 0 && now - this.lastWTap < 300) this.sprintKey = true;
        this.lastWTap = now;
      }
      this.keys.add(e.code);
      for (const b of KEYMAP[e.code] ?? []) this.pressedSet.add(b);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.sprintKey = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.lmb = this.rmb = false;
      this.sprintKey = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.onAnyGesture?.();
      if (e.button === 0) this.lmb = true;
      if (e.button === 2) this.rmb = true;
      // Hide and pin the cursor only while a button is held, so it stays free for the UI otherwise.
      if ((this.lmb || this.rmb) && !this.locked) {
        try {
          const r = canvas.requestPointerLock?.() as unknown;
          if (r instanceof Promise) r.catch(() => {});
        } catch {
          /* fall back to raw movement deltas */
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
      // e.buttons on a button event is authoritative for anything still held.
      this.lmb = this.lmb && !!(e.buttons & 1);
      this.rmb = this.rmb && !!(e.buttons & 2);
      this.releaseIfIdle();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.lmb && !this.rmb) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
        this.wheel += e.deltaY * unit;
      },
      { passive: false },
    );
  }

  private releaseIfIdle() {
    if (!this.lmb && !this.rmb && this.locked) document.exitPointerLock?.();
  }

  /** Kept for callers from the old always-locked scheme; the cursor is now free by default. */
  requestLock() {}

  /** Call once per frame before reading. */
  poll() {
    this.down.clear();
    for (const k of this.keys) for (const b of KEYMAP[k] ?? []) this.down.add(b);

    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    // Both mouse buttons held: walk forward.
    if (this.lmb && this.rmb) my = Math.max(my, 1);
    this.lookX = 0;
    this.lookY = 0;

    const pads = navigator.getGamepads?.() ?? [];
    const pad = Array.from(pads).find((p) => p && p.connected) ?? null;
    this.padConnected = !!pad;
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
      const sx = dz(pad.axes[0] ?? 0), sy = dz(pad.axes[1] ?? 0);
      mx += sx;
      my -= sy;
      this.lookX = dz(pad.axes[2] ?? 0);
      this.lookY = dz(pad.axes[3] ?? 0);
      // Left stick click starts a sprint that lasts until the stick is let go.
      if (pad.buttons[10]?.pressed) this.padSprint = true;
      if (Math.hypot(sx, sy) < 0.3) this.padSprint = false;
      const now = new Set<Btn>();
      pad.buttons.forEach((b, i) => {
        if (b.pressed) for (const btn of PADMAP[i] ?? []) now.add(btn);
      });
      for (const b of now) {
        if (!this.padDown.has(b)) {
          this.pressedSet.add(b);
          this.onAnyGesture?.();
        }
        this.down.add(b);
      }
      this.padDown = now;
    } else this.padSprint = false;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.moveX = mx;
    this.moveY = my;
    this.sprint = ((this.sprintKey || this.down.has('sprint')) && len > 0.3) || this.padSprint;
  }

  held(b: Btn) {
    return this.down.has(b);
  }

  pressed(b: Btn) {
    return this.pressedSet.has(b);
  }

  /** Swallow a press so nothing later this frame sees it. */
  consume(b: Btn) {
    this.pressedSet.delete(b);
  }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressedSet.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}

/**
 * In fullscreen, ask the browser to hand us the keys it normally steals (Ctrl+W closes
 * the tab, Ctrl+T/N open new ones). Chrome and Edge support this; elsewhere it's a no-op.
 */
export function lockBrowserKeys() {
  const kb = (navigator as Navigator & { keyboard?: { lock?: (codes?: string[]) => Promise<void>; unlock?: () => void } }).keyboard;
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) kb?.lock?.(['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'KeyR', 'KeyS', 'KeyD', 'Tab']).catch(() => {});
    else kb?.unlock?.();
  });
}

/** Toggle real (element) fullscreen, which is what keyboard locking needs. */
export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen?.();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}
