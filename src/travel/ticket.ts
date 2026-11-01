import type { TravelKind } from '../maps/types';

export interface TicketOption {
  to: string;
  mapName: string;
  stopName: string;
  kind: TravelKind;
  fare: number;
  minutes: number;
  /** Null when open, else why it's locked. */
  locked: string | null;
  affordable: boolean;
}

const ICON: Record<TravelKind, string> = { bus: '🚌', train: '🚆', plane: '✈️', boat: '⛴️' };
const VERB: Record<TravelKind, string> = { bus: 'BUS', train: 'RAIL', plane: 'AIR', boat: 'FERRY' };
const money = (n: number) => '$' + Math.round(n).toLocaleString();

/** The ticket window: a list of destinations from this stop, plus the black-out travel card. */
export class TicketUI {
  private el: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private cardEl: HTMLDivElement;
  private options: TicketOption[] = [];
  private sel = 0;
  private onPick: ((o: TicketOption) => void) | null = null;
  private onClose: (() => void) | null = null;
  open = false;

  constructor() {
    const ui = document.getElementById('ui')!;
    this.el = document.createElement('div');
    this.el.className = 'ticket hidden';
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'travelfade';
    this.cardEl = document.createElement('div');
    this.cardEl.className = 'travelcard hidden';
    ui.append(this.fadeEl, this.cardEl, this.el);
    this.el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
      if (t) {
        this.sel = Number(t.dataset.i);
        this.confirm();
      } else if ((e.target as HTMLElement).closest('.tclose')) this.close();
    });
  }

  show(stopName: string, kind: TravelKind, balance: number, options: TicketOption[], onPick: (o: TicketOption) => void, onClose: () => void) {
    this.options = options;
    this.onPick = onPick;
    this.onClose = onClose;
    this.sel = Math.max(0, options.findIndex((o) => !o.locked && o.affordable));
    this.open = true;
    this.el.classList.remove('hidden');
    this.render(stopName, kind, balance);
  }

  private stopName = '';
  private kind: TravelKind = 'bus';
  private balance = 0;

  private render(stopName = this.stopName, kind = this.kind, balance = this.balance) {
    this.stopName = stopName;
    this.kind = kind;
    this.balance = balance;
    const rows = this.options.length
      ? this.options
          .map((o, i) => {
            const cls = ['trow', i === this.sel ? 'sel' : '', o.locked ? 'locked' : !o.affordable ? 'poor' : ''].join(' ');
            const right = o.locked ? `<span class="lock">🔒 ${o.locked}</span>` : `<b>${money(o.fare)}</b>${o.affordable ? '' : ' <span class="lock">can\'t afford</span>'}`;
            return `<div class="${cls}" data-i="${i}"><span class="ic">${ICON[o.kind]}</span><span class="dest"><b>${o.mapName}</b><small>${o.stopName} · ${o.minutes} min</small></span><span class="fare">${right}</span></div>`;
          })
          .join('')
      : '<div class="trow locked">No routes run from here yet.</div>';
    this.el.innerHTML = `
      <div class="th"><span>${ICON[kind]} ${VERB[kind]} TICKETS</span><span>${stopName}</span></div>
      <div class="tbal">Insurance money: <b>${money(balance)}</b></div>
      ${rows}
      <div class="thelp"><span class="key">W/S</span> choose · <span class="key">E</span> buy · <span class="key">Shift</span> or <span class="tclose">close</span></div>`;
  }

  move(d: number) {
    if (!this.options.length) return;
    this.sel = (this.sel + d + this.options.length) % this.options.length;
    this.render();
  }

  confirm() {
    const o = this.options[this.sel];
    if (!o || o.locked || !o.affordable) return false;
    const cb = this.onPick;
    this.hide();
    cb?.(o);
    return true;
  }

  close() {
    const cb = this.onClose;
    this.hide();
    cb?.();
  }

  private hide() {
    this.open = false;
    this.onPick = this.onClose = null;
    this.el.classList.add('hidden');
  }

  /** Fade the screen to black (true) or back (false). */
  fade(on: boolean, ms = 700) {
    this.fadeEl.style.transition = `opacity ${ms}ms ease`;
    this.fadeEl.style.opacity = on ? '1' : '0';
  }

  /** The "now arriving" card shown while the screen is black. */
  card(html: string | null) {
    if (!html) {
      this.cardEl.classList.add('hidden');
      return;
    }
    this.cardEl.innerHTML = html;
    this.cardEl.classList.remove('hidden');
  }

  static tripCard(kind: TravelKind, fromName: string, toName: string, stopName: string, minutes: number, line: string) {
    return `<div class="tc-k">${ICON[kind]} ${VERB[kind]} · ${minutes} MIN</div>
      <div class="tc-route">${fromName} <span>→</span> ${toName}</div>
      <div class="tc-stop">Now arriving: ${stopName}</div>
      <div class="tc-line">${line}</div>`;
  }
}
