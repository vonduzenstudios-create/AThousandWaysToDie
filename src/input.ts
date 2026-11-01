export type Btn = 'jump' | 'crouch' | 'dive' | 'interact' | 'pee' | 'ledger' | 'music' | 'help' | 'confirm' | 'up' | 'down';

const KEYMAP: Record<string, Btn[]> = {
  Space: ['jump', 'confirm'],
  ShiftLeft: ['crouch'],
  ShiftRight: ['crouch'],
  KeyC: ['crouch'],
  ControlLeft: ['crouch'],
  KeyF: ['dive'],
  KeyE: ['interact', 'confirm'],
  KeyP: ['pee'],
  KeyQ: ['pee'],
  Tab: ['ledger'],
  KeyL: ['ledger'],
  KeyM: ['music'],
  KeyH: ['help'],
  Enter: ['confirm'],
  KeyR: ['up'],
  KeyV: ['down'],
};

// Standard gamepad mapping.
const PADMAP: Record<number, Btn[]> = {
  0: ['jump', 'confirm'], // A
  1: ['crouch'], // B
  2: ['dive'], // X
  3: ['interact', 'confirm'], // Y
  4: ['down'], // LB
  5: ['pee'], // RB
  6: ['crouch'], // LT
  7: ['up'], // RT
  8: ['ledger'], // Back
  9: ['help'], // Start
};

export class Input {
  private keys = new Set<string>();
  private padDown = new Set<Btn>();
  private down = new Set<Btn>();
  private pressedSet = new Set<Btn>();
  mouseDX = 0;
  mouseDY = 0;
  moveX = 0;
  moveY = 0;
  lookX = 0;
  lookY = 0;
  locked = false;
  onAnyGesture: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.onAnyGesture?.();
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const b of KEYMAP[e.code] ?? []) this.pressedSet.add(b);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      this.onAnyGesture?.();
      if (!this.locked) {
        canvas.requestPointerLock?.();
        return;
      }
      if (e.button === 0) this.pressedSet.add('dive');
      if (e.button === 2) this.pressedSet.add('interact');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  requestLock() {
    if (!this.locked) this.canvas.requestPointerLock?.();
  }

  /** Call once per frame before reading. */
  poll() {
    this.down.clear();
    for (const k of this.keys) for (const b of KEYMAP[k] ?? []) this.down.add(b);

    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    this.lookX = 0;
    this.lookY = 0;

    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
      mx += dz(pad.axes[0] ?? 0);
      my -= dz(pad.axes[1] ?? 0);
      this.lookX = dz(pad.axes[2] ?? 0);
      this.lookY = dz(pad.axes[3] ?? 0);
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
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.moveX = mx;
    this.moveY = my;
  }

  held(b: Btn) {
    return this.down.has(b);
  }

  pressed(b: Btn) {
    return this.pressedSet.has(b);
  }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressedSet.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
