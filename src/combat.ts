import * as THREE from 'three';
import type { Npc } from './npc';
import type { Player } from './player';
import type { Character } from './character';
import type { PersonFile } from './deaths';
import { pick } from './util';

/** What combat needs from the game. */
export interface CombatHost {
  npcs(): Npc[];
  player: Player;
  character(): Character | null;
  body(): PersonFile | null;
  playing(): boolean;
  hit(kind: 'punch' | 'whiff' | 'hurt' | 'ko'): void;
  shake(a: number): void;
  burst(pos: THREE.Vector3, n: number, color: number, speed?: number, opts?: { life?: number; size?: number; gravity?: number }): void;
  say(who: string, line: string, ms?: number): void;
  hurtFlash(): void;
  /** Health ran out. `by` is who landed the last blow. */
  died(by: Npc): void;
  /** A fight started (for bystander reactions). */
  fightStarted?(npc: Npc): void;
}

interface Fighter {
  npc: Npc;
  /** Seconds until their next swing. */
  swing: number;
  /** Seconds since they last landed a hit (they give up eventually). */
  idle: number;
  ko: number;
}

const ANGRY_LINES = ['Oh, you want to go?!', 'You just made a big mistake.', 'Did you just PUNCH me?', "That's it, buddy.", 'I know karate! Kind of!', "I'm gonna tell your mom. AFTER this."];
const FEEBLE_LINES = ['I fought in two wars, sonny.', 'I will END you with this hip.', "Back in my day we punched BACK!", 'Oh, it is ON, whippersnapper.'];
const GIVEUP_LINES = ["Yeah, you'd better run!", 'Not worth it.', 'Coward!', "I'm calling my lawyer."];
const KO_LINES = ['...', 'Mommy?', 'zzz', 'I see the light... no wait, a lamp.'];

/** Melee and health. Owns angry NPCs while they fight, then hands them back with release(). */
export class Combat {
  hp = 100;
  maxHp = 100;
  private fighters: Fighter[] = [];
  private cooldown = 0;
  private pending = 0;
  private sinceHurt = 99;

  constructor(private h: CombatHost) {}

  /** Reset health for a new body. */
  setBody(f: PersonFile | null) {
    this.maxHp = !f ? 100 : f.physical === 'Feeble' ? 60 : f.physical === 'Athlete' ? 140 : 100;
    this.hp = this.maxHp;
    this.releaseAll();
  }

  get fighting() {
    return this.fighters.some((f) => f.ko <= 0);
  }

  heal(n: number) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  private damageFor(f: PersonFile | null) {
    if (!f) return 20;
    let d = f.physical === 'Athlete' ? 34 : f.physical === 'Feeble' ? 9 : 22;
    if (f.job === 'Cop' || f.job === 'Construction Worker') d += 8;
    return d;
  }

  /** Swing. Lands a moment later so the arm animation reads. */
  punch() {
    if (this.cooldown > 0 || this.pending > 0) return;
    const p = this.h.player;
    if (p.legsBroken || p.state === 'locked') return;
    this.h.character()?.punch();
    this.cooldown = 0.38;
    this.pending = 0.1;
  }

  private resolvePunch() {
    const p = this.h.player;
    const at = p.feet();
    const fwd = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
    let best: Npc | null = null;
    let bd = 2.1;
    for (const n of this.h.npcs()) {
      const to = n.pos.clone().sub(at);
      to.y = 0;
      const d = to.length();
      if (d > bd || Math.abs(n.pos.y - at.y) > 1.6) continue;
      if (d > 0.4 && to.normalize().dot(fwd) < 0.45) continue;
      if (this.fighters.find((f) => f.npc === n && f.ko > 0)) continue;
      best = n;
      bd = d;
    }
    if (!best) {
      this.h.hit('whiff');
      return;
    }
    const n = best;
    n.hp -= this.damageFor(this.h.body());
    // Shove them back a little.
    n.pos.addScaledVector(fwd, 0.7);
    n.character.kick(0.5);
    n.character.flash(true);
    setTimeout(() => n.character.flash(false), 90);
    this.h.hit('punch');
    this.h.shake(0.25);
    this.h.burst(n.pos.clone().add(new THREE.Vector3(0, 1.6 * n.app.height, 0)), 8, 0xffffff, 4, { life: 0.25, size: 0.12, gravity: 0 });
    let f = this.fighters.find((x) => x.npc === n);
    if (!f) {
      f = { npc: n, swing: 0.7, idle: 0, ko: 0 };
      this.fighters.push(f);
      n.controlled = true;
      const feeble = n.file.physical === 'Feeble';
      this.h.say(n.file.name, pick(Math.random, feeble ? FEEBLE_LINES : ANGRY_LINES), 2200);
      this.h.fightStarted?.(n);
      // Cops nearby join in. Always.
      if (n.file.job !== 'Cop')
        for (const c of this.h.npcs())
          if (c !== n && c.file.job === 'Cop' && c.pos.distanceTo(n.pos) < 30 && !this.fighters.find((x) => x.npc === c)) {
            this.fighters.push({ npc: c, swing: 1.4, idle: 0, ko: 0 });
            c.controlled = true;
            setTimeout(() => this.h.say(c.file.name, 'STOP RESISTING!', 2000), 700);
          }
    }
    f.idle = 0;
    if (n.hp <= 0) {
      f.ko = 7;
      this.h.hit('ko');
      this.h.say(n.file.name, pick(Math.random, KO_LINES), 1800);
    }
  }

  update(dt: number) {
    this.cooldown -= dt;
    this.sinceHurt += dt;
    if (this.pending > 0) {
      this.pending -= dt;
      if (this.pending <= 0 && this.h.playing()) this.resolvePunch();
    }
    if (this.sinceHurt > 6 && this.hp < this.maxHp && this.h.playing()) this.hp = Math.min(this.maxHp, this.hp + 4 * dt);

    const alive = new Set(this.h.npcs());
    const p = this.h.player;
    const me = p.feet();
    for (let i = this.fighters.length - 1; i >= 0; i--) {
      const f = this.fighters[i];
      const n = f.npc;
      if (!alive.has(n)) {
        this.fighters.splice(i, 1);
        continue;
      }
      if (f.ko > 0) {
        f.ko -= dt;
        n.character.root.position.copy(n.pos);
        n.character.animate(dt, { speed: 0, grounded: true, state: 'ground', stateTime: 0, airTime: 0, ko: true });
        if (Math.random() < dt * 3) this.h.burst(n.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 1, 0xffe14a, 1, { life: 0.6, size: 0.15, gravity: -1 });
        if (f.ko <= 0) {
          n.hp = Math.ceil(n.maxHp * 0.5);
          this.fighters.splice(i, 1);
          n.release();
        }
        continue;
      }
      const to = me.clone().sub(n.pos);
      to.y = 0;
      const d = to.length();
      f.idle += dt;
      if (!this.h.playing() || d > 35 || f.idle > 20) {
        if (this.h.playing()) this.h.say(n.file.name, pick(Math.random, GIVEUP_LINES), 2000);
        this.fighters.splice(i, 1);
        n.release();
        continue;
      }
      const feeble = n.file.physical === 'Feeble';
      const speed = feeble ? 2.4 : n.file.physical === 'Athlete' || n.file.job === 'Cop' ? 6 : 4.5;
      if (d > 0.01) n.facing = Math.atan2(to.x, to.z);
      let moving = 0;
      if (d > 1.15) {
        to.normalize();
        n.pos.addScaledVector(to, Math.min(d - 1.1, speed * dt));
        moving = speed;
      }
      n.character.root.position.copy(n.pos);
      n.character.root.rotation.y = n.facing;
      n.character.animate(dt, { speed: moving, grounded: true, state: 'ground', stateTime: 0, airTime: 0 });
      f.swing -= dt;
      if (f.swing <= 0 && d < 1.5) {
        f.swing = feeble ? 1.5 : n.file.physical === 'Athlete' ? 0.75 : 1.0;
        n.character.punch();
        f.idle = 0;
        // Land it a beat later if we're still in reach.
        setTimeout(() => {
          if (!this.h.playing() || !this.fighters.includes(f) || f.ko > 0) return;
          if (n.pos.distanceTo(this.h.player.feet()) > 1.9) {
            this.h.hit('whiff');
            return;
          }
          this.takeHit(n);
        }, 120);
      }
    }
  }

  private takeHit(n: Npc) {
    const f = n.file;
    const dmg = f.job === 'Cop' ? 14 : f.physical === 'Athlete' ? 12 : f.physical === 'Feeble' ? 6 : 9;
    this.hp -= dmg;
    this.sinceHurt = 0;
    this.h.hit('hurt');
    this.h.hurtFlash();
    this.h.shake(0.4);
    const p = this.h.player;
    const away = p.feet().sub(n.pos).setY(0).normalize();
    if (p.state !== 'locked' && p.state !== 'crawl') p.knock(new THREE.Vector3(away.x * 6, 5, away.z * 6));
    this.h.character()?.kick(-0.4);
    this.h.burst(p.position().add(new THREE.Vector3(0, 0.6, 0)), 6, 0xff4a4a, 3, { life: 0.3, size: 0.12, gravity: 4 });
    if (this.hp <= 0) {
      this.hp = 0;
      const killer = n;
      this.h.died(killer);
      this.releaseAll();
    }
  }

  releaseAll() {
    for (const f of this.fighters) f.npc.release();
    this.fighters = [];
  }
}
