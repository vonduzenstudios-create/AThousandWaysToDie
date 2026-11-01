import type { Options } from './options';
import { toggleFullscreen } from './input';

export interface DevMap {
  id: string;
  name: string;
  /** Short line under the name, e.g. "Map" or "Test place". */
  note?: string;
}

export interface TitleHandlers {
  /** True when there is progress to continue (deaths filed or the opening seen). */
  hasSave(): boolean;
  /** Fresh run: wipes progress, plays the opening. */
  newGame(): void;
  continueGame(): void;
  /** Maps (and test places) Dev Mode can drop you into. */
  devMaps(): DevMap[];
  devStart(id: string): void;
  options: Options;
  /** Called whenever an option changes (apply and save). */
  optionsChanged(): void;
  /** Erase progress (ledger, story, money). */
  eraseSave(): void;
  blip?(): void;
}

type Item = { label: string; hint?: string; disabled?: boolean; act?: () => void; adjust?: (dir: number) => void; value?: () => string };

/**
 * The title screen: New Game, Continue, Dev Mode (map picker), Options.
 * Driven by mouse, or by `nav()` calls from the game's input (keyboard and gamepad).
 */
export class TitleMenu {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private sub: HTMLElement;
  private items: Item[] = [];
  private sel = 0;
  private page: 'main' | 'dev' | 'options' | 'confirmNew' | 'confirmErase' = 'main';
  open = true;

  constructor(root: HTMLElement, private h: TitleHandlers) {
    this.el = document.createElement('div');
    this.el.className = 'title';
    this.el.innerHTML = `
      <div class="logo">C'est La Vie</div>
      <div class="tag">a comedy about dying, a lot</div>
      <div class="menu"><div class="msub"></div><div class="mlist"></div></div>
      <div class="small">Mouse, or W/S + Enter · Controller: D-pad + A, B to go back</div>`;
    root.appendChild(this.el);
    this.list = this.el.querySelector('.mlist')!;
    this.sub = this.el.querySelector('.msub')!;
    this.show('main');
  }

  close() {
    this.open = false;
    this.el.classList.add('hidden');
  }

  private show(page: TitleMenu['page']) {
    this.page = page;
    this.sel = 0;
    const o = this.h.options;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const changed = () => this.h.optionsChanged();
    let title = '';
    if (page === 'main') {
      const save = this.h.hasSave();
      this.items = [
        { label: 'New Game', hint: save ? 'Erases your ledger and plays the intro. Start / Esc skips it.' : 'Plays the intro. Start / Esc skips it.', act: () => (save ? this.show('confirmNew') : this.go(() => this.h.newGame())) },
        { label: 'Continue', hint: save ? 'Pick up where you left off.' : 'No save yet.', disabled: !save, act: () => this.go(() => this.h.continueGame()) },
        { label: 'Dev Mode', hint: 'Skip the story and pick any map.', act: () => this.show('dev') },
        { label: 'Options', hint: 'Volume, mouse, save data.', act: () => this.show('options') },
      ];
      if (!save) this.sel = 0;
      else this.sel = 1;
    } else if (page === 'dev') {
      title = 'DEV MODE · pick a map';
      this.items = [
        ...this.h.devMaps().map((m) => ({ label: m.name, hint: m.note, act: () => this.go(() => this.h.devStart(m.id)) })),
        { label: 'Back', act: () => this.show('main') },
      ];
    } else if (page === 'options') {
      title = 'OPTIONS · ← → to change';
      this.items = [
        { label: 'Music', value: () => pct(o.music), adjust: (d) => ((o.music = clamp(Math.round((o.music + d * 0.1) * 10) / 10, 0, 1)), changed()) },
        { label: 'Sound effects', value: () => pct(o.sfx), adjust: (d) => ((o.sfx = clamp(Math.round((o.sfx + d * 0.1) * 10) / 10, 0, 1)), changed()) },
        { label: 'Mouse sensitivity', value: () => `${o.sens.toFixed(2)}x`, adjust: (d) => ((o.sens = clamp(Math.round((o.sens + d * 0.25) * 4) / 4, 0.25, 3)), changed()) },
        { label: 'Invert camera Y', value: () => (o.invertY ? 'On' : 'Off'), adjust: () => ((o.invertY = !o.invertY), changed()) },
        {
          label: 'Fullscreen',
          hint: 'Also stops browser shortcuts like Ctrl+W from closing the game (Chrome / Edge).',
          value: () => (document.fullscreenElement ? 'On' : 'Off'),
          act: () => {
            toggleFullscreen();
            setTimeout(() => this.render(), 300);
          },
        },
        { label: 'Erase save data', hint: 'Deletes the ledger, money and story progress.', act: () => this.show('confirmErase') },
        { label: 'Back', act: () => this.show('main') },
      ];
      for (const it of this.items) if (it.adjust && !it.act) it.act = () => it.adjust!(1);
    } else if (page === 'confirmNew' || page === 'confirmErase') {
      title = page === 'confirmNew' ? 'Start over? Your ledger and money will be erased.' : 'Erase all progress? This cannot be undone.';
      this.items = [
        { label: 'No, go back', act: () => this.show(page === 'confirmNew' ? 'main' : 'options') },
        {
          label: page === 'confirmNew' ? 'Yes, start a new game' : 'Yes, erase it',
          act: () => {
            if (page === 'confirmNew') this.go(() => this.h.newGame());
            else {
              this.h.eraseSave();
              this.show('main');
            }
          },
        },
      ];
    }
    this.sub.textContent = title;
    this.sub.classList.toggle('hidden', !title);
    this.render();
  }

  private go(fn: () => void) {
    this.close();
    fn();
  }

  private render() {
    this.list.innerHTML = this.items
      .map(
        (it, i) =>
          `<div class="mi${i === this.sel ? ' sel' : ''}${it.disabled ? ' dis' : ''}" data-i="${i}">
            <span class="ml">${it.label}</span>${it.value ? `<span class="mv">${it.adjust ? '◀ ' : ''}${it.value()}${it.adjust ? ' ▶' : ''}</span>` : ''}
            ${i === this.sel && it.hint ? `<div class="mh">${it.hint}</div>` : ''}
          </div>`,
      )
      .join('');
    this.list.querySelectorAll<HTMLElement>('.mi').forEach((row) => {
      const i = Number(row.dataset.i);
      row.addEventListener('mouseenter', () => {
        if (this.sel !== i) {
          this.sel = i;
          this.render();
        }
      });
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const it = this.items[i];
        if (it.adjust) {
          const r = row.getBoundingClientRect();
          it.adjust(e.clientX < r.left + r.width / 2 ? -1 : 1);
          this.render();
          return;
        }
        this.activate(i);
      });
    });
  }

  private activate(i: number) {
    const it = this.items[i];
    if (!it || it.disabled) return;
    this.h.blip?.();
    it.act?.();
  }

  /** Feed menu input from keyboard or gamepad. */
  nav(cmd: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back') {
    if (!this.open) return;
    const n = this.items.length;
    if (cmd === 'up' || cmd === 'down') {
      let s = this.sel;
      for (let k = 0; k < n; k++) {
        s = (s + (cmd === 'up' ? n - 1 : 1)) % n;
        if (!this.items[s].disabled) break;
      }
      this.sel = s;
      this.h.blip?.();
      this.render();
    } else if (cmd === 'left' || cmd === 'right') {
      const it = this.items[this.sel];
      if (it?.adjust) {
        it.adjust(cmd === 'left' ? -1 : 1);
        this.render();
      }
    } else if (cmd === 'confirm') this.activate(this.sel);
    else if (cmd === 'back' && this.page !== 'main') this.show(this.page === 'confirmErase' ? 'options' : 'main');
  }
}
