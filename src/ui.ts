import { CATEGORIES, DEATHS, TOTAL_SLOTS, isDeserving, timeLeftLabel, type Ledger, type PersonFile } from './deaths';
import { money } from './util';

const el = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
};

export interface ClaimData {
  claimNo: number;
  deathName: string;
  category: string;
  blurb: string;
  victim: string;
  isNew: boolean;
  approved: boolean;
  base: number;
  bonus: number;
  multiplier: number;
  total: number;
  note: string;
}

export class UI {
  private root: HTMLElement;
  private hud: HTMLElement;
  private promptEl: HTMLElement;
  private toastEl: HTMLElement;
  private card: HTMLElement;
  private fileEl: HTMLElement;
  private ledgerEl: HTMLElement;
  private helpEl: HTMLElement;
  private banner: HTMLElement;
  private dialog: HTMLElement;
  private flashEl: HTMLElement;
  private titleEl: HTMLElement;
  private toastTimer = 0;
  private dialogTimer: number | null = null;
  ledgerOpen = false;
  blip: (() => void) | null = null;

  constructor() {
    this.root = document.getElementById('ui')!;
    this.flashEl = this.add('<div class="flash"></div>');
    this.hud = this.add('<div class="hud"></div>');
    this.promptEl = this.add('<div class="prompt hidden"></div>');
    this.toastEl = this.add('<div class="toast hidden"></div>');
    this.banner = this.add('<div class="banner hidden"></div>');
    this.fileEl = this.add('<div class="file hidden"></div>');
    this.dialog = this.add('<div class="dialog hidden"><div class="who"></div><div class="line"></div></div>');
    this.card = this.add('<div class="card hidden"></div>');
    this.ledgerEl = this.add('<div class="ledger hidden"></div>');
    this.helpEl = this.add(`<div class="help hidden">
      <b>Controls</b> (H to hide)<br>
      WASD move · Mouse look<br>
      Space jump (tap again on landing for double and triple)<br>
      Shift crouch · Shift + Space: long jump (running) or backflip (standing)<br>
      Reverse direction + Space: side flip · Space against a wall in the air: wall kick<br>
      Shift in air: ground pound · Shift while running: slide<br>
      F or Left click: dive · E or Right click: interact<br>
      Q: pee · Tab: death ledger · M: music<br>
      Ghost: R / V or Space / Shift to rise and sink, E to possess
    </div>`);
    this.titleEl = this.add(`<div class="title">
      <div class="logo">C'est La Vie</div>
      <div class="tag">a comedy about dying, a lot</div>
      <div class="story">
        <p>Gary Pruitt died cleaning his gutters. It was so dumb that Mortalis Mutual, the last life insurance company on Earth, voided his policy. His family got nothing.</p>
        <p>When Death came to collect him, Gary lost it. He screamed at Death for killing him <i>that</i> way. Death, overworked and fed up, snapped back:</p>
        <p class="quote">"Fine. You do it then."</p>
        <p>Now Gary has the scythe, the power to jump into anyone's body, and a ledger with 1,000 empty lines.</p>
      </div>
      <div class="start">Click to begin</div>
      <div class="small">Keyboard + mouse or gamepad. Best with headphones.</div>
    </div>`);
  }

  private add(html: string) {
    const e = el(html);
    this.root.appendChild(e);
    return e;
  }

  showTitle(onStart: () => void) {
    const go = () => {
      this.titleEl.classList.add('hidden');
      window.removeEventListener('keydown', go);
      this.titleEl.removeEventListener('click', go);
      onStart();
    };
    this.titleEl.addEventListener('click', go);
    window.addEventListener('keydown', go);
  }

  setHud(ledger: Ledger, body: PersonFile | null) {
    const god = ledger.godAnger;
    const godBar = god > 0 ? `<div class="god">God's patience <span class="meter"><span style="width:${Math.max(0, 100 - god * 20)}%"></span></span></div>` : '';
    this.hud.innerHTML = `
      <div class="stat"><span class="big">${ledger.foundCount}</span> / ${TOTAL_SLOTS.toLocaleString()} deaths filed</div>
      <div class="stat money">${money(ledger.balance)}</div>
      ${body ? `<div class="body">You are <b>${body.name}</b>, ${body.age}, ${body.job}</div>` : '<div class="body">You are a ghost</div>'}
      <div class="keys">H controls · Tab ledger · M music</div>
      ${godBar}`;
  }

  prompt(text: string | null) {
    if (!text) this.promptEl.classList.add('hidden');
    else {
      this.promptEl.innerHTML = text;
      this.promptEl.classList.remove('hidden');
    }
  }

  toast(title: string, sub = '', ms = 2600) {
    this.toastEl.innerHTML = `<div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}`;
    this.toastEl.classList.remove('hidden');
    this.toastEl.classList.remove('pop');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('pop');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  setBanner(text: string | null) {
    if (!text) this.banner.classList.add('hidden');
    else {
      this.banner.innerHTML = text;
      this.banner.classList.remove('hidden');
    }
  }

  flash(color = '#ffffff', ms = 300) {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.background = color;
    this.flashEl.style.opacity = '0.85';
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = `opacity ${ms}ms ease-out`;
    this.flashEl.style.opacity = '0';
  }

  say(who: string, line: string, ms = 4000) {
    const lineEl = this.dialog.querySelector('.line') as HTMLElement;
    (this.dialog.querySelector('.who') as HTMLElement).textContent = who;
    lineEl.textContent = '';
    this.dialog.classList.remove('hidden');
    if (this.dialogTimer) clearInterval(this.dialogTimer);
    let i = 0;
    this.dialogTimer = window.setInterval(() => {
      lineEl.textContent = line.slice(0, ++i);
      if (i % 2 === 0 && line[i] !== ' ') this.blip?.();
      if (i >= line.length) {
        clearInterval(this.dialogTimer!);
        this.dialogTimer = window.setTimeout(() => this.dialog.classList.add('hidden'), ms);
      }
    }, 28);
  }

  showFile(f: PersonFile | null) {
    if (!f) {
      this.fileEl.classList.add('hidden');
      return;
    }
    const fair = isDeserving(f);
    this.fileEl.innerHTML = `
      <div class="fh">SCYTHE VISION</div>
      <div class="fname">${f.name}</div>
      <table>
        <tr><td>Age</td><td>${f.age}</td></tr>
        <tr><td>Job</td><td>${f.job}</td></tr>
        <tr><td>Scheduled death</td><td>${timeLeftLabel(f.daysLeft)}</td></tr>
        <tr><td>Original cause</td><td>${f.cause}</td></tr>
        <tr><td>Insurance</td><td>${f.policy ? `Mortalis policy x${f.policy}` : '<span class="bad">Uninsured</span>'}</td></tr>
        <tr><td>Net worth</td><td>${money(f.netWorth)}</td></tr>
        <tr><td>Afterlife</td><td>${f.afterlife}</td></tr>
        <tr><td>Allergies</td><td>${f.peanutAllergy ? '<span class="bad">PEANUTS (severe)</span>' : 'None on file'}</td></tr>
        <tr><td>Note</td><td>${f.quirk}</td></tr>
      </table>
      <div class="verdict ${fair ? 'ok' : 'bad'}">${fair ? 'FAIR GAME' : 'NOT THEIR TIME. God will notice.'}</div>
      <div class="hint">E to possess</div>`;
    this.fileEl.classList.remove('hidden');
  }

  showClaim(d: ClaimData, onDone: () => void) {
    const stamp = d.approved ? (d.total > 0 ? 'APPROVED' : 'NO PAYOUT') : 'DENIED';
    this.card.innerHTML = `
      <div class="ch"><span>MORTALIS MUTUAL</span><span>Claim #${d.claimNo}</span></div>
      ${d.isNew ? '<div class="newdeath">NEW DEATH FILED</div>' : '<div class="olddeath">Already in your ledger</div>'}
      <div class="dname">${d.deathName}</div>
      <div class="dcat">${d.category}</div>
      <div class="blurb">${d.blurb}</div>
      <table>
        <tr><td>Deceased</td><td>${d.victim}</td></tr>
        <tr><td>Base payout</td><td>${money(d.base)}</td></tr>
        <tr><td>Style bonus</td><td>${money(d.bonus)}</td></tr>
        <tr><td>Policy multiplier</td><td>x${d.multiplier}</td></tr>
        <tr class="tot"><td>Total</td><td>${money(d.total)}</td></tr>
      </table>
      <div class="note">${d.note}</div>
      <div class="stamp ${d.approved && d.total > 0 ? 'ok' : 'bad'}">${stamp}</div>
      <div class="cont">Press Space or E to continue</div>`;
    this.card.classList.remove('hidden');
    this.card.classList.remove('in');
    void this.card.offsetWidth;
    this.card.classList.add('in');
    let ready = false;
    window.setTimeout(() => (ready = true), 900);
    const finish = (e: Event) => {
      if (!ready) return;
      if (e instanceof KeyboardEvent && !['Space', 'KeyE', 'Enter'].includes(e.code)) return;
      window.removeEventListener('keydown', finish);
      window.removeEventListener('mousedown', finish);
      this.card.classList.add('hidden');
      onDone();
    };
    window.addEventListener('keydown', finish);
    window.addEventListener('mousedown', finish);
    // Gamepad confirm is handled by the game calling confirmClaim().
    this.pendingClaim = () => {
      if (!ready) return;
      window.removeEventListener('keydown', finish);
      window.removeEventListener('mousedown', finish);
      this.card.classList.add('hidden');
      this.pendingClaim = null;
      onDone();
    };
  }

  pendingClaim: (() => void) | null = null;

  toggleLedger(ledger: Ledger) {
    this.ledgerOpen = !this.ledgerOpen;
    if (!this.ledgerOpen) {
      this.ledgerEl.classList.add('hidden');
      return;
    }
    const cats = CATEGORIES.map((c) => {
      const defs = DEATHS.filter((d) => d.category === c);
      const rows = defs
        .map((d) => {
          const f = ledger.found[d.id];
          return f
            ? `<div class="row found"><span>${d.name}</span><span>${d.location}</span><span>${money(f.payout)}</span></div>`
            : `<div class="row"><span>???</span><span></span><span></span></div>`;
        })
        .join('');
      const foundN = defs.filter((d) => ledger.found[d.id]).length;
      return `<div class="cat"><div class="cn">${c} <span>${foundN} found</span></div>${rows || '<div class="row none">??? (not in this town)</div>'}</div>`;
    }).join('');
    this.ledgerEl.innerHTML = `
      <div class="lh">Death Ledger <span>${ledger.foundCount} / ${TOTAL_SLOTS.toLocaleString()}</span></div>
      <div class="lsub">Lifetime payouts ${money(ledger.total)} · ${DEATHS.length} deaths hidden in Smallville</div>
      <div class="cats">${cats}</div>
      <div class="lfoot">Tab to close</div>`;
    this.ledgerEl.classList.remove('hidden');
  }

  hideHelp() {
    this.helpEl.classList.add('hidden');
  }

  toggleHelp() {
    this.helpEl.classList.toggle('hidden');
  }

  setHueShift(deg: number) {
    const c = document.getElementById('game')!;
    c.style.filter = deg ? `hue-rotate(${deg}deg) saturate(1.6)` : '';
  }
}
