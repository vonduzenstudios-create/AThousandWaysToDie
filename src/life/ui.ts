import * as THREE from 'three';

const CSS = `
.life-bubbles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.life-bubble { position: absolute; transform: translate(-50%, -100%); max-width: 220px; background: #fffdf4; color: #1b1b22; border: 2px solid #1b1b22; border-radius: 10px; padding: 4px 9px; font-size: 13px; line-height: 1.25; text-align: center; white-space: normal; box-shadow: 0 3px 0 rgba(0,0,0,0.35); animation: lifeBubbleIn 0.18s cubic-bezier(.2,1.6,.4,1); }
.life-bubble::after { content: ''; position: absolute; left: 50%; bottom: -8px; margin-left: -6px; border: 6px solid transparent; border-top-color: #1b1b22; border-bottom: 0; }
.life-bubble .n { display: block; font-size: 10px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; color: #6a5aa8; }
.life-bubble.shout { background: #ffe9a8; font-weight: bold; font-size: 15px; }
@keyframes lifeBubbleIn { from { transform: translate(-50%, -100%) scale(0.4); } to { transform: translate(-50%, -100%) scale(1); } }
.life-clock { position: absolute; top: 14px; right: 16px; text-align: right; font-size: 15px; font-weight: bold; text-shadow: 0 2px 0 #000, 0 0 8px #000; }
.life-clock .d { font-size: 11px; opacity: 0.75; letter-spacing: 2px; text-transform: uppercase; }
.life-talk { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); width: min(620px, calc(100vw - 32px)); background: rgba(8,8,16,0.9); border: 2px solid #ffd84a; border-radius: 12px; padding: 12px 16px 10px; pointer-events: auto; }
.life-talk .who { font-weight: bold; color: #ffd84a; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; }
.life-talk .rel { color: #aaa; font-weight: normal; letter-spacing: 0; text-transform: none; margin-left: 6px; }
.life-talk .line { font-size: 19px; margin: 4px 0 10px; min-height: 26px; }
.life-talk ol { list-style: none; margin: 0; padding: 0; }
.life-talk li { padding: 5px 10px; border-radius: 6px; font-size: 16px; cursor: pointer; color: #ddd; }
.life-talk li .k { display: inline-block; min-width: 20px; color: #ffd84a; font-weight: bold; }
.life-talk li.sel { background: rgba(255,216,74,0.18); color: #fff; }
`;

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

interface Bubble {
  el: HTMLElement;
  anchor: () => THREE.Vector3;
  until: number;
}

/** Speech bubbles that float over people's heads. */
export class Bubbles {
  private root: HTMLElement;
  private live = new Map<number, Bubble>();
  private v = new THREE.Vector3();
  /** Bubbles farther than this from the camera are hidden. */
  maxDist = 38;

  constructor(host: HTMLElement) {
    style();
    this.root = document.createElement('div');
    this.root.className = 'life-bubbles';
    host.appendChild(this.root);
  }

  show(key: number, who: string, text: string, secs: number, anchor: () => THREE.Vector3, now: number) {
    this.hide(key);
    const el = document.createElement('div');
    el.className = 'life-bubble' + (/[!?]{1,}$/.test(text) && text === text.toUpperCase() ? ' shout' : '');
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = who;
    el.appendChild(n);
    el.appendChild(document.createTextNode(text));
    this.root.appendChild(el);
    this.live.set(key, { el, anchor, until: now + secs });
  }

  hide(key: number) {
    const b = this.live.get(key);
    if (!b) return;
    b.el.remove();
    this.live.delete(key);
  }

  update(camera: THREE.Camera, now: number) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const [k, b] of this.live) {
      if (now > b.until) {
        this.hide(k);
        continue;
      }
      const p = b.anchor();
      const d = p.distanceTo(camera.position);
      this.v.copy(p).project(camera);
      const visible = d < this.maxDist && this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      b.el.style.display = visible ? '' : 'none';
      if (!visible) continue;
      b.el.style.left = `${((this.v.x + 1) / 2) * w}px`;
      b.el.style.top = `${((1 - this.v.y) / 2) * h}px`;
      b.el.style.opacity = d > this.maxDist - 8 ? String((this.maxDist - d) / 8) : '1';
      b.el.style.zIndex = String(1000 - Math.round(d));
    }
  }

  clear() {
    for (const k of [...this.live.keys()]) this.hide(k);
  }
}

export class ClockHud {
  private el: HTMLElement;
  constructor(host: HTMLElement) {
    style();
    this.el = document.createElement('div');
    this.el.className = 'life-clock';
    host.appendChild(this.el);
  }
  set(day: string, time: string) {
    const html = `${time}<div class="d">${day}</div>`;
    if (this.el.innerHTML !== html) this.el.innerHTML = html;
  }
  visible(on: boolean) {
    this.el.style.display = on ? '' : 'none';
  }
}

export interface TalkOption {
  label: string;
  pick: () => void;
}

/** The dialogue box when the player talks to someone. */
export class TalkPanel {
  private el: HTMLElement;
  private who: HTMLElement;
  private line: HTMLElement;
  private list: HTMLElement;
  private opts: TalkOption[] = [];
  private sel = 0;
  private typer: number | null = null;
  open = false;
  onClose: (() => void) | null = null;
  blip: (() => void) | null = null;

  constructor(host: HTMLElement) {
    style();
    this.el = document.createElement('div');
    this.el.className = 'life-talk hidden';
    this.el.innerHTML = '<div class="who"></div><div class="line"></div><ol></ol>';
    this.who = this.el.querySelector('.who')!;
    this.line = this.el.querySelector('.line')!;
    this.list = this.el.querySelector('ol')!;
    host.appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5)) - 1;
        if (n >= 0 && n < this.opts.length) this.choose(n);
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.move(-1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.move(1);
      else if (e.code === 'Escape') this.close();
    });
  }

  show(who: string, rel: string, text: string, options: TalkOption[]) {
    this.open = true;
    this.el.classList.remove('hidden');
    this.who.innerHTML = '';
    this.who.textContent = who;
    if (rel) {
      const r = document.createElement('span');
      r.className = 'rel';
      r.textContent = rel;
      this.who.appendChild(r);
    }
    this.say(text);
    this.setOptions(options);
  }

  say(text: string) {
    if (this.typer) clearInterval(this.typer);
    let i = 0;
    this.line.textContent = '';
    this.typer = window.setInterval(() => {
      this.line.textContent = text.slice(0, ++i);
      if (i % 3 === 0) this.blip?.();
      if (i >= text.length && this.typer) {
        clearInterval(this.typer);
        this.typer = null;
      }
    }, 22);
  }

  setOptions(options: TalkOption[]) {
    this.opts = options;
    this.sel = 0;
    this.list.innerHTML = '';
    options.forEach((o, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="k">${i + 1}</span>`;
      li.appendChild(document.createTextNode(o.label));
      li.addEventListener('mouseenter', () => this.highlight(i));
      li.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.choose(i);
      });
      this.list.appendChild(li);
    });
    this.highlight(0);
  }

  private highlight(i: number) {
    this.sel = i;
    [...this.list.children].forEach((c, k) => c.classList.toggle('sel', k === i));
  }

  move(d: number) {
    if (!this.opts.length) return;
    this.highlight((this.sel + d + this.opts.length) % this.opts.length);
  }

  confirm() {
    this.choose(this.sel);
  }

  private choose(i: number) {
    const o = this.opts[i];
    if (o) o.pick();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    if (this.typer) clearInterval(this.typer);
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}
