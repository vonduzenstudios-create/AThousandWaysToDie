import { CATEGORIES, DEATHS, mapOfDeath, PHYSICAL_INFO, TOTAL_SLOTS, isDeserving, timeLeftLabel, type Ledger, type PersonFile } from './deaths';
import { money } from './util';
import type { SkillBar } from './skills';
import type { AreaProgress, Objective } from './guide/guide';

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
  private scytheEl: HTMLElement;
  private ledgerEl: HTMLElement;
  private helpEl: HTMLElement;
  private banner: HTMLElement;
  private dialog: HTMLElement;
  private flashEl: HTMLElement;
  private skillEl: HTMLElement;
  private tipEl: HTMLElement;
  private healthEl: HTMLElement;
  private objEl: HTMLElement;
  private introEl: HTMLElement;
  private objKey = '';
  private topLeft: HTMLElement;
  private skillKey = '';
  onSkillClick: ((i: number) => void) | null = null;
  private toastTimer = 0;
  private dialogTimer: number | null = null;
  ledgerOpen = false;
  blip: (() => void) | null = null;

  constructor() {
    this.root = document.getElementById('ui')!;
    this.flashEl = this.add('<div class="flash"></div>');
    const topLeft = this.add('<div class="topleft"></div>');
    this.hud = el('<div class="hud"></div>');
    this.objEl = el('<div class="objective hidden"></div>');
    topLeft.append(this.hud, this.objEl);
    this.topLeft = topLeft;
    this.promptEl = this.add('<div class="prompt hidden"></div>');
    this.healthEl = this.add('<div class="health hidden"><div class="hfill"></div><div class="htext"></div></div>');
    this.skillEl = this.add('<div class="skills hidden"></div>');
    this.tipEl = this.add('<div class="skilltip hidden"></div>');
    this.toastEl = this.add('<div class="toast hidden"></div>');
    this.banner = this.add('<div class="banner hidden"></div>');
    this.fileEl = this.add('<div class="file hidden"></div>');
    this.scytheEl = this.add('<div class="scythe hidden"></div>');
    this.dialog = this.add('<div class="dialog hidden"><div class="who"></div><div class="line"></div></div>');
    this.card = this.add('<div class="card hidden"></div>');
    this.ledgerEl = this.add('<div class="ledger hidden"></div>');
    this.introEl = this.add('<div class="intro hidden"></div>');
    this.helpEl = el(`<div class="help hidden">
      <div class="hh"><b>Controls</b> <span>H or Start to hide</span></div>
      <table>
        <tr><th></th><th>Keyboard</th><th>Controller</th></tr>
        <tr><td>Move</td><td>WASD</td><td>Left stick</td></tr>
        <tr><td>Sprint (speed by fitness)</td><td>Hold Shift (or double-tap W)</td><td>Click left stick</td></tr>
        <tr><td>Orbit camera</td><td>Hold left mouse</td><td>Right stick</td></tr>
        <tr><td>Steer (camera stays behind)</td><td>Hold right mouse</td><td>Right stick</td></tr>
        <tr><td>Walk forward</td><td>Hold both mouse buttons</td><td></td></tr>
        <tr><td>Zoom / first person</td><td>Scroll wheel</td><td></td></tr>
        <tr><td>Jump (height by fitness)</td><td>Space</td><td>A</td></tr>
        <tr><td>Grab a ledge</td><td>Jump at it, hold toward the wall</td><td>Same</td></tr>
        <tr><td>Pull up · let go</td><td>Space or W · C or S</td><td>A or up · B or down</td></tr>
        <tr><td>Crouch / swim down</td><td>C</td><td>B or LT</td></tr>
        <tr><td>Punch</td><td>F</td><td>X</td></tr>
        <tr><td>Skills</td><td>1 – 5 (or click)</td><td>D-pad up/down pick, right use</td></tr>
        <tr><td>Interact / possess</td><td>E</td><td>Y</td></tr>
        <tr><td>Scream for help</td><td>T</td><td>LB</td></tr>
        <tr><td>Hijack car / get out</td><td>E</td><td>Y</td></tr>
        <tr><td>Drive · steer</td><td>W / S · A / D</td><td>Stick or RT / LT · stick</td></tr>
        <tr><td>Handbrake · horn</td><td>Space · T</td><td>A · LB</td></tr>
        <tr><td>Pee</td><td>Q</td><td>RB</td></tr>
        <tr><td>Ghost rise / sink</td><td>Space / C</td><td>A / B</td></tr>
        <tr><td>Ledger · music</td><td>Tab · M</td><td>View · D-pad left</td></tr>
        <tr><td>Full map · waypoints</td><td>N (or click the radar)</td><td>Click right stick</td></tr>
        <tr><td>Track the next lead</td><td>J (again for the next one)</td><td>View, then Y</td></tr>
        <tr><td>How this works</td><td>I</td><td></td></tr>
      </table>
    </div>`);
    this.topLeft.appendChild(this.helpEl);

  }

  private add(html: string) {
    const e = el(html);
    this.root.appendChild(e);
    return e;
  }


  setHud(ledger: Ledger, body: PersonFile | null) {
    const god = ledger.godAnger;
    const godBar = god > 0 ? `<div class="god">God's patience <span class="meter"><span style="width:${Math.max(0, 100 - god * 20)}%"></span></span></div>` : '';
    this.hud.innerHTML = `
      <div class="stat"><span class="big">${ledger.foundCount}</span> / ${TOTAL_SLOTS.toLocaleString()} deaths filed</div>
      <div class="stat money">${money(ledger.balance)}</div>
      ${body ? `<div class="body">You are <b>${body.name}</b>, ${body.age}, ${body.job}</div><div class="body small">Physical: <b>${body.physical}</b> (${PHYSICAL_INFO[body.physical]}) · Mental: ${body.mental}</div>` : '<div class="body">You are a ghost</div>'}
      <div class="keys">H controls · Tab ledger · N map · J lead · I how it works</div>
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
        <tr><td>Physical health</td><td><b>${f.physical}</b> <span class="dim">(${PHYSICAL_INFO[f.physical]})</span></td></tr>
        <tr><td>Mental health</td><td>${f.mental}</td></tr>
        <tr><td>Afterlife</td><td>${f.afterlife}</td></tr>
        <tr><td>Allergies</td><td>${f.peanutAllergy ? '<span class="bad">PEANUTS (severe)</span>' : 'None on file'}</td></tr>
        <tr><td>Note</td><td>${f.quirk}</td></tr>
      </table>
      <div class="verdict ${fair ? 'ok' : 'bad'}">${fair ? 'FAIR GAME' : 'NOT THEIR TIME. God will notice.'}</div>
      <div class="hint">E / Y to possess</div>`;
    this.fileEl.classList.remove('hidden');
  }

  /**
   * The scythe vision menu (left side) shown after zooming in on someone as Death.
   * `sel` is 0 for Possess, 1 for Pass. Pass `null` to hide it.
   */
  showScythe(f: PersonFile | null, sel = 0, on?: { possess: () => void; pass: () => void; hover: (i: number) => void }, pad = false) {
    if (!f) {
      this.scytheEl.classList.add('hidden');
      return;
    }
    const fair = isDeserving(f);
    this.scytheEl.innerHTML = `
      <div class="sh">SCYTHE VISION</div>
      <div class="sname">${f.name}</div>
      <div class="srows">
        <div class="sr"><span>Age</span><b>${f.age}</b></div>
        <div class="sr"><span>Job</span><b>${f.job}</b></div>
        <div class="sr"><span>Physical health</span><b>${f.physical}</b></div>
        <div class="sr"><span>Mental health</span><b>${f.mental}</b></div>
        <div class="sr"><span>Afterlife</span><b>${f.afterlife}</b></div>
        <div class="sr note"><span>Note</span><b>${f.quirk}</b></div>
      </div>
      <div class="sbtns">
        <div class="sb${sel === 0 ? ' sel' : ''}" data-i="0">Possess${fair ? '' : '<div class="swarn">Not their time. God will notice.</div>'}</div>
        <div class="sb${sel === 1 ? ' sel' : ''}" data-i="1">Pass</div>
      </div>
      <div class="shint">${pad ? 'D-pad to choose · <b>A</b> select · <b>B</b> pass' : '<b>W/S</b> to choose · <b>E</b> / <b>Enter</b> select · <b>Esc</b> / <b>Q</b> pass'}</div>`;
    this.scytheEl.querySelectorAll<HTMLElement>('.sb').forEach((b) => {
      const i = Number(b.dataset.i);
      b.addEventListener('mouseenter', () => on?.hover(i));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (i === 0) on?.possess();
        else on?.pass();
      });
    });
    this.scytheEl.classList.remove('hidden');
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
      <div class="cont">Press Space, E or A to continue</div>`;
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
  private padMode = false;

  setPadMode(on: boolean) {
    if (on === this.padMode) return;
    this.padMode = on;
    document.body.classList.toggle('pad', on);
  }

  /**
   * Show the ledger for the area you're in: only deaths on this map are listed. Other maps
   * get a one-line summary at the bottom. `areas` is every map, for that summary.
   */
  toggleLedger(
    ledger: Ledger,
    area: { id: string; name: string } = { id: 'smallville', name: 'Smallville' },
    areas: { id: string; name: string }[] = [],
    guide?: { progress: AreaProgress[]; lead: string; pad: boolean },
  ) {
    this.ledgerOpen = !this.ledgerOpen;
    if (!this.ledgerOpen) {
      this.ledgerEl.classList.add('hidden');
      return;
    }
    const here = DEATHS.filter((d) => mapOfDeath(d.id) === area.id);
    const cats = CATEGORIES.map((c) => {
      const defs = here.filter((d) => d.category === c);
      if (!defs.length) return '';
      const rows = defs
        .map((d) => {
          const f = ledger.found[d.id];
          return f
            ? `<div class="row found"><span>${d.name}</span><span>${d.location}</span><span>${money(f.payout)}</span></div>`
            : `<div class="row"><span>???</span><span></span><span></span></div>`;
        })
        .join('');
      const foundN = defs.filter((d) => ledger.found[d.id]).length;
      return `<div class="cat"><div class="cn">${c} <span>${foundN} / ${defs.length}</span></div>${rows}</div>`;
    }).join('');
    const hereFound = here.filter((d) => ledger.found[d.id]).length;
    const elsewhere = areas
      .filter((a) => a.id !== area.id)
      .map((a) => {
        const defs = DEATHS.filter((d) => mapOfDeath(d.id) === a.id);
        return defs.length ? `${a.name} ${defs.filter((d) => ledger.found[d.id]).length}/${defs.length}` : '';
      })
      .filter(Boolean);
    const prog = guide
      ? `<div class="areas">${guide.progress
          .map((a) => {
            const pct = a.total ? Math.round((a.found / a.total) * 100) : 0;
            const status = !a.open
              ? `<span class="lock">🔒 Opens at ${a.lock ?? '???'}</span>`
              : a.next
                ? `${Math.min(a.found, a.next.need)} / ${a.next.need} opens ${a.next.opens}`
                : a.found >= a.total && a.total
                  ? 'Complete'
                  : 'Everything from here is open';
            return `<div class="area${a.id === area.id ? ' here' : ''}${a.open ? '' : ' locked'}">
              <div class="an">${a.name}<span>${a.open ? `${a.found} / ${a.total}` : ''}</span></div>
              <div class="abar"><span style="width:${a.open ? pct : 0}%"></span></div>
              <div class="as">${status}</div>
            </div>`;
          })
          .join('')}</div>
        ${guide.lead ? `<div class="llead">☠ <b>Lead:</b> ${guide.lead}${guide.pad ? ' <span class="key">Y</span> track it' : ''}</div>` : ''}`
      : '';
    this.ledgerEl.innerHTML = `
      <div class="lh">Death Ledger: ${area.name} <span>${hereFound} / ${here.length} here</span></div>
      <div class="lsub">${ledger.foundCount} / ${TOTAL_SLOTS.toLocaleString()} deaths filed overall · Lifetime payouts ${money(ledger.total)}</div>
      ${prog}
      <div class="cats">${cats || '<div class="row none">No known deaths around here. Yet.</div>'}</div>
      ${elsewhere.length ? `<div class="lsub">Elsewhere: ${elsewhere.join(' · ')}</div>` : ''}
      <div class="lfoot">Tab to close</div>`;
    this.ledgerEl.classList.remove('hidden');
  }

  /** The objective panel under the HUD. Pass null to hide it. Only touches the DOM when it changes. */
  setObjective(o: Objective | null) {
    const key = o ? JSON.stringify([o.head, o.line, o.bar, o.leadLine]) : '';
    if (key === this.objKey) return;
    this.objKey = key;
    if (!o) {
      this.objEl.classList.add('hidden');
      return;
    }
    const pct = Math.round((Math.min(o.bar.have, o.bar.need) / o.bar.need) * 100);
    this.objEl.innerHTML = `
      <div class="oh">${o.head}</div>
      <div class="ol">${o.line}</div>
      <div class="obar"><span style="width:${pct}%"></span></div>
      <div class="olabel"><b>${o.bar.have} / ${o.bar.need}</b> ${o.bar.label}</div>
      ${o.leadLine ? `<div class="olead">☠ ${o.leadLine}</div>` : ''}`;
    this.objEl.classList.remove('hidden');
  }

  /** Flash the objective panel (new lead tracked, objective changed). */
  pulseObjective() {
    this.objEl.classList.remove('pulse');
    void this.objEl.offsetWidth;
    this.objEl.classList.add('pulse');
  }

  get introOpen() {
    return !this.introEl.classList.contains('hidden');
  }

  pendingIntro: (() => void) | null = null;

  /** Death's "how this works" card. Resolves when the player dismisses it. */
  showIntro(pad: boolean): Promise<void> {
    const k = (kb: string, gp: string) => `<span class="key">${pad ? gp : kb}</span>`;
    this.introEl.innerHTML = `
      <div class="ih">HOW THIS WORKS</div>
      <div class="isub">Death's orientation. Pay attention, I'm only doing this once.</div>
      <div class="steps">
        <div class="step"><div class="n">1</div><div><b>Read files.</b> You're a ghost with a scythe. Look at anyone and press ${k('E', 'Y')} to see their job, health, and when they're due to die.</div></div>
        <div class="step"><div class="n">2</div><div><b>Possess someone who's due.</b> Their file says <span class="ok">FAIR GAME</span>, and they glow green on the radar. Take someone who isn't and God gets pissed.</div></div>
        <div class="step"><div class="n">3</div><div><b>Die somewhere new.</b> Find a stupid way to kill that body. Mortalis Mutual pays for every <i>new</i> death and denies repeats. Their job and health decide what they can pull off.</div></div>
        <div class="step"><div class="n">4</div><div><b>Move up.</b> Every <b>25 new deaths</b> in an area opens the way to the next one: the bus to the City, then the harbor, then the airport. 1,000 deaths and you're done.</div></div>
      </div>
      <div class="ikeys">Stuck? ${k('J', 'View, then Y')} tracks the nearest unfound death · ${k('Tab', 'View')} ledger · ${k('N', 'R3')} map · ${k('H', 'Start')} controls</div>
      <div class="cont">Press Space, E or A to start</div>`;
    this.introEl.classList.remove('hidden');
    return new Promise((resolve) => {
      let ready = false;
      const t = window.setTimeout(() => (ready = true), 600);
      const done = () => {
        if (!ready) return;
        clearTimeout(t);
        window.removeEventListener('keydown', onKey);
        this.introEl.removeEventListener('mousedown', done);
        this.introEl.classList.add('hidden');
        this.pendingIntro = null;
        resolve();
      };
      const onKey = (e: KeyboardEvent) => {
        if (['Space', 'KeyE', 'Enter', 'Escape', 'KeyI'].includes(e.code)) done();
      };
      window.addEventListener('keydown', onKey);
      this.introEl.addEventListener('mousedown', done);
      this.pendingIntro = done;
    });
  }

  /** Rebuild the skill bar for a new body (or hide it for the ghost). */
  setSkills(bar: SkillBar | null, pad = false) {
    const key = bar ? bar.slots.map((s) => s.skill?.id ?? '-').join(',') + pad : '';
    if (key === this.skillKey) return;
    this.skillKey = key;
    if (!bar || !bar.slots.length) {
      this.skillEl.classList.add('hidden');
      this.tipEl.classList.add('hidden');
      return;
    }
    this.skillEl.innerHTML = bar.slots
      .map((s, i) => {
        const sk = s.skill;
        const cls = !sk ? 'locked' : sk.passive ? 'passive' : '';
        return `<div class="slot ${cls}" data-i="${i}">
          <div class="k">${i + 1}</div>
          <div class="ic">${sk ? sk.icon : '🔒'}</div>
          <div class="nm">${sk ? sk.name : 'Locked'}</div>
          <div class="cd"></div>
        </div>`;
      })
      .join('');
    this.skillEl.querySelectorAll<HTMLElement>('.slot').forEach((slot) => {
      const i = Number(slot.dataset.i);
      const s = bar.slots[i];
      slot.addEventListener('mouseenter', () => this.showTip(s.skill ? `<b>${s.skill.name}</b> <span class="src">${s.skill.source}${s.skill.passive ? ' · passive' : s.skill.once ? ' · once per body' : s.skill.cooldown ? ` · ${s.skill.cooldown}s cooldown` : ''}</span><br>${s.skill.desc}` : `<b>Locked</b><br>${s.locked}`));
      slot.addEventListener('mouseleave', () => this.tipEl.classList.add('hidden'));
      slot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button === 0) this.onSkillClick?.(i);
      });
    });
    this.skillEl.classList.remove('hidden');
  }

  private showTip(html: string) {
    this.tipEl.innerHTML = html;
    this.tipEl.classList.remove('hidden');
  }

  /** Per-frame: cooldown sweeps, used-up slots, gamepad selection. */
  updateSkills(bar: SkillBar, now: number, pad: boolean) {
    this.skillEl.querySelectorAll<HTMLElement>('.slot').forEach((slot, i) => {
      const f = bar.cooldownFrac(i, now);
      (slot.querySelector('.cd') as HTMLElement).style.height = `${f * 100}%`;
      const s = bar.slots[i]?.skill;
      slot.classList.toggle('spent', !!(s?.once && bar.used[i]));
      slot.classList.toggle('sel', pad && bar.selected === i);
    });
  }

  /** Flash a slot when pressed, red if it refused. */
  pulseSkill(i: number, ok: boolean) {
    const slot = this.skillEl.querySelector<HTMLElement>(`.slot[data-i="${i}"]`);
    if (!slot) return;
    slot.classList.remove('pulse', 'nope');
    void slot.offsetWidth;
    slot.classList.add(ok ? 'pulse' : 'nope');
  }

  setHealth(hp: number | null, max = 100) {
    if (hp === null) {
      this.healthEl.classList.add('hidden');
      return;
    }
    this.healthEl.classList.remove('hidden');
    const f = Math.max(0, Math.min(1, hp / max));
    const fill = this.healthEl.querySelector('.hfill') as HTMLElement;
    fill.style.width = `${f * 100}%`;
    fill.style.background = f > 0.5 ? '#4ccf5a' : f > 0.25 ? '#e8b730' : '#e04040';
    (this.healthEl.querySelector('.htext') as HTMLElement).textContent = `${Math.ceil(hp)} / ${max} HP`;
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
