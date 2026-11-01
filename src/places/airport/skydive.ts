import * as THREE from 'three';
import { RAPIER, G_ALL, G_WORLD, groups } from '../../physics';
import type { MapContext } from '../../maps/types';
import type { PlayerInput } from '../../player';
import { approach2, turnToward } from '../../util';
import { Character } from '../../character';
import type { Frame } from './frame';
import { RUNWAY, TOWER } from './layout';
import {
  CANOPY_RENTAL,
  CANOPY_RESERVE,
  JUMP_PLANE,
  canopyModel,
  cloudModel,
  jumpPlaneModel,
  laundryModel,
  pilotChuteModel,
  rigModel,
  teddyModel,
  type RigKind,
} from './skymodels';

/**
 * Freefall Frank's skydive, played start to finish:
 *
 *   board the jump plane in the hangar -> taxi, take off, climb (Space skips) -> jump run at
 *   12,500 ft: walk out of the cabin and through the open door -> free fall (WASD track,
 *   Shift dive, E pull) -> the canopy opens (or doesn't) -> fly it down (WASD steer,
 *   Space flare) -> land.
 *
 * Deaths come from what you did, never from a button that just kills you:
 *  - never pulling, pulling too low, a teddy bear from lost and found, Frank's $20 bargain rig,
 *    a rental main that twists when you don't cut away, pulling inside the plane,
 *    hitting the bay without a canopy, landing in the bay under one, landing on the radar.
 */

/** Jump altitude above the airport's ground, in blocks. The altimeter reads 43 ft per block. */
export const JUMP_ALT = 290;
const FT = 43;
/** Design-space jump run: the plane holds here (heading +x) while you walk to the door. */
const RUN = { x: 70, z: 128 };
const PARK = { x: 30, z: 104 };

type Phase = 'idle' | 'taxi' | 'jumprun' | 'freefall' | 'deploying' | 'canopy' | 'twist' | 'laundry' | 'teddy' | 'done';

interface Path {
  pts: THREE.Vector3[];
  /** Speed at each point (blocks/s); interpolated along each leg. */
  speeds: number[];
  /** Distance travelled along the path. */
  s: number;
  len: number[];
}

export interface SkydiveHooks {
  /** Kill through the airport's kill (records deathLock etc.). */
  kill: (id: string, style: Parameters<MapContext['game']['kill']>[1]) => void;
  /** The rig the current body is wearing (null if none). */
  rig: () => RigKind | null;
  /** Called when the rig is used up (after a jump). */
  clearRig: () => void;
}

export function setupSkydive(ctx: MapContext, f: Frame, hooks: SkydiveHooks) {
  const { scene, physics, game } = ctx;
  const W = (x: number, y: number, z: number) => f.p(x, y, z);
  const added: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T) => {
    scene.add(o);
    added.push(o);
    return o;
  };

  // ---------------------------------------------------------------- the plane
  const plane = jumpPlaneModel();
  plane.root.rotation.order = 'YZX';
  add(plane.root);
  /** Design-space pose of the plane. */
  const pose = { x: PARK.x, y: 0, z: PARK.z, h: 0, pitch: 0, roll: 0 };
  const placePlane = () => {
    plane.root.position.copy(W(pose.x, pose.y, pose.z));
    plane.root.rotation.set(pose.roll, f.heading(pose.h) - Math.PI / 2, pose.pitch, 'YZX');
    plane.root.updateMatrixWorld(true);
  };
  placePlane();
  const local = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(plane.root.matrixWorld);
  const inv = new THREE.Matrix4();
  const toLocal = (w: THREE.Vector3) => w.clone().applyMatrix4(inv.copy(plane.root.matrixWorld).invert());
  /** World facing (player convention) of a local direction. */
  const facingOf = (lx: number, lz: number) => {
    const d = new THREE.Vector3(lx, 0, lz).transformDirection(plane.root.matrixWorld);
    return Math.atan2(d.x, d.z);
  };

  // The pilot sits in the left seat.
  const pilot = Character.fromFile({ job: 'Pilot', age: 58 }, 913);
  pilot.root.position.set(3.75, JUMP_PLANE.floorY, -0.65);
  pilot.root.rotation.y = Math.PI / 2;
  plane.root.add(pilot.root);

  // Collision for the cabin while the plane holds at altitude.
  let cabinBody: RAPIER.RigidBody | null = null;
  const buildCabin = () => {
    const q = plane.root.quaternion;
    const p = plane.root.position;
    cabinBody = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    const { cabin: C, door: D, floorY: F, skin: S, bench: B } = JUMP_PLANE;
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
      physics.createCollider(
        RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
          .setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
          .setCollisionGroups(groups(G_WORLD, G_ALL)),
        cabinBody!,
      );
    box(C.x0 - 0.3, F - 0.3, C.z0, C.x1 + 0.3, F, C.z1); // floor
    box(C.x0 - 0.3, C.y1, -S.z, C.x1 + 0.3, C.y1 + 0.3, S.z); // ceiling
    box(C.x0 - 0.3, F, -S.z, C.x0, C.y1, S.z); // aft wall
    box(C.x1, F, -S.z, C.x1 + 0.3, C.y1, S.z); // bulkhead
    box(C.x0, F, C.z1, C.x1, C.y1, S.z); // right wall
    box(C.x0, F, -S.z, D.x0, C.y1, C.z0); // left wall aft of the door
    box(D.x1, F, -S.z, C.x1, C.y1, C.z0); // left wall forward of the door
    box(D.x0, D.y1, -S.z, D.x1, C.y1, C.z0); // over the door
    box(B.x0, F, C.z1 - B.depth, B.x1, F + B.h, C.z1); // benches
    box(D.x1 + 0.3, F, C.z0, B.x1, F + B.h, C.z0 + B.depth);
  };
  const dropCabin = () => {
    if (cabinBody) physics.removeRigidBody(cabinBody);
    cabinBody = null;
  };

  // ---------------------------------------------------------------- canopies and friends
  const rigOnBack = { obj: null as THREE.Object3D | null, kind: null as RigKind | null, ch: null as Character | null };
  const wearRig = () => {
    const ch = game.character;
    if (!ch) return; // a corpse keeps whatever it jumped with
    const kind = hooks.rig();
    if (rigOnBack.ch === ch && rigOnBack.kind === kind) return;
    if (rigOnBack.obj) rigOnBack.obj.removeFromParent();
    rigOnBack.obj = null;
    rigOnBack.ch = ch;
    rigOnBack.kind = kind;
    if (ch && kind) {
      rigOnBack.obj = rigModel(kind);
      ch.spinner.add(rigOnBack.obj);
    }
  };

  const mainCanopy = canopyModel(CANOPY_RENTAL);
  const reserve = canopyModel(CANOPY_RESERVE);
  const laundry = laundryModel();
  const teddy = teddyModel();
  const pilotChute = pilotChuteModel();
  for (const o of [mainCanopy, reserve, laundry, teddy, pilotChute]) {
    o.visible = false;
    add(o);
  }
  /** Whatever is overhead right now, and how open it is. */
  let over: THREE.Object3D | null = null;
  let openK = 0;
  /** A cut-away main drifting off. */
  let cutaway: { obj: THREE.Object3D; vel: THREE.Vector3; t: number } | null = null;

  // Clouds around the airport between 140 and 260 up. Only shown while you are up there.
  const clouds: THREE.Mesh[] = [];
  const cloudSpots: [number, number, number, number][] = [
    [40, 250, 120, 1.1], [150, 230, 60, 1.3], [-40, 215, 180, 1], [220, 205, 150, 1.4], [90, 185, 230, 1.2],
    [10, 165, 40, 1.5], [180, 150, 200, 1], [280, 240, 90, 1.2], [120, 270, 190, 0.9], [-80, 190, 90, 1.3],
  ];
  cloudSpots.forEach(([x, y, z, s], i) => {
    const c = cloudModel(i + 3, s);
    c.position.copy(W(x, y, z));
    c.visible = false;
    clouds.push(add(c));
  });
  const cloudHome = clouds.map((c) => c.position.clone());
  const showClouds = (on: boolean) => {
    clouds.forEach((c, i) => {
      c.visible = on;
      if (!on) c.position.copy(cloudHome[i]);
    });
  };

  // ---------------------------------------------------------------- HUD: wrist altimeter + controls
  const hud = document.createElement('div');
  hud.style.cssText =
    'position:fixed;right:22px;bottom:22px;z-index:40;display:none;flex-direction:column;align-items:flex-end;gap:8px;font:600 13px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none';
  hud.innerHTML = `
    <div style="position:relative;width:118px;height:118px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#3a3d44,#16171a 70%);border:5px solid #c8c2b4;box-shadow:0 3px 10px #0008,inset 0 0 0 2px #000">
      <svg viewBox="-50 -50 100 100" style="position:absolute;inset:0;width:100%;height:100%">
        <path id="sd-red" d="" fill="#d8312b" opacity="0.85"/>
        <path id="sd-yel" d="" fill="#f2c230" opacity="0.8"/>
        ${Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return `<line x1="${Math.sin(a) * 36}" y1="${-Math.cos(a) * 36}" x2="${Math.sin(a) * 43}" y2="${-Math.cos(a) * 43}" stroke="#eee" stroke-width="${i % 3 === 0 ? 3 : 1.5}"/><text x="${Math.sin(a) * 28}" y="${-Math.cos(a) * 28 + 3.5}" font-size="9" fill="#eee" text-anchor="middle" font-family="system-ui">${i}</text>`;
        }).join('')}
        <line id="sd-needle" x1="0" y1="6" x2="0" y2="-38" stroke="#ffd84a" stroke-width="3" stroke-linecap="round"/>
        <circle r="4" fill="#ffd84a"/>
      </svg>
    </div>
    <div id="sd-alt" style="background:#000a;border-radius:6px;padding:3px 9px;font:700 18px ui-monospace,monospace;letter-spacing:1px">12,500 ft</div>
    <div id="sd-msg" style="max-width:240px;text-align:right;line-height:1.55"></div>`;
  document.body.appendChild(hud);
  const $ = (id: string) => hud.querySelector('#' + id) as HTMLElement;
  const arc = (from: number, to: number) => {
    // Altitude band (thousands of feet) as a ring segment on the 12,000 ft dial.
    const a0 = (from / 12) * Math.PI * 2, a1 = (to / 12) * Math.PI * 2;
    const p = (a: number, r: number) => `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
    return `M ${p(a0, 44)} A 44 44 0 0 1 ${p(a1, 44)} L ${p(a1, 37)} A 37 37 0 0 0 ${p(a0, 37)} Z`;
  };
  $('sd-red').setAttribute('d', arc(0, 2.5));
  $('sd-yel').setAttribute('d', arc(2.5, 4));
  const key = (k: string) => `<span style="display:inline-block;background:#ffd84a;color:#000;border-radius:4px;padding:0 6px;margin-right:5px;text-shadow:none">${k}</span>`;
  let lastMsg = '';
  const setHud = (on: boolean, msg = '') => {
    hud.style.display = on ? 'flex' : 'none';
    if (msg !== lastMsg) {
      $('sd-msg').innerHTML = msg;
      lastMsg = msg;
    }
  };
  const agl = () => game.player.feet().y - f.origin.y - (phase === 'taxi' || phase === 'jumprun' ? JUMP_PLANE.floorY : 0);
  const setAlt = (ft: number) => {
    $('sd-alt').textContent = `${Math.max(0, Math.round(ft / 10) * 10).toLocaleString('en-US')} ft`;
    $('sd-needle').setAttribute('transform', `rotate(${((ft / 12000) * 360) % 360})`);
    $('sd-alt').style.color = ft < 2500 ? '#ff6a5a' : ft < 4000 ? '#ffd84a' : '#fff';
  };

  // ---------------------------------------------------------------- state
  let phase: Phase = 'idle';
  let t = 0;
  let rig: RigKind | null = null;
  let path: Path | null = null;
  let skipHold = 0;
  let green = false;
  let pulledAt = 0;
  let malfunction = false;
  let usedReserve = false;
  let warned5k = false;
  let beepT = 0;
  let soundT = 0;
  let lastVy = 0;
  let groundedT = 0;
  let away: { t: number } | null = null;
  let lingerWarned = false;
  let noReserveSaid = false;
  /** The body that boarded: if it changes (death elsewhere), everything resets. */
  let jumper: unknown = null;
  const wind = f.dir(1.2, 0, -0.9);

  const airborne = () => phase === 'freefall' || phase === 'deploying' || phase === 'canopy' || phase === 'twist' || phase === 'laundry' || phase === 'teddy';
  const active = () => phase !== 'idle' && phase !== 'done';

  const makePath = (pts: [number, number, number, number][]): Path => {
    const p = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const len = [0];
    for (let i = 1; i < p.length; i++) len.push(len[i - 1] + p[i].distanceTo(p[i - 1]));
    return { pts: p, speeds: pts.map((q) => q[3]), s: 0, len };
  };
  /** Advance the plane along its path; returns true at the end. */
  const fly = (h: number) => {
    const P = path!;
    const total = P.len[P.len.length - 1];
    let i = 1;
    while (i < P.len.length - 1 && P.len[i] < P.s) i++;
    const k = Math.min(1, (P.s - P.len[i - 1]) / Math.max(0.001, P.len[i] - P.len[i - 1]));
    const sp = P.speeds[i - 1] + (P.speeds[i] - P.speeds[i - 1]) * k;
    P.s = Math.min(total, P.s + sp * h);
    const a = P.pts[i - 1], b = P.pts[i];
    const pos = a.clone().lerp(b, k);
    const d = b.clone().sub(a);
    const hd = Math.atan2(d.x, d.z);
    pose.h = turnToward(pose.h, hd, 1.4 * h);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    pose.pitch += (pitch - pose.pitch) * Math.min(1, h * 2);
    let dh = hd - pose.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    pose.roll += (-dh * 0.8 * (pos.y > 2 ? 1 : 0) - pose.roll) * Math.min(1, h * 2);
    pose.x = pos.x;
    pose.y = pos.y;
    pose.z = pos.z;
    placePlane();
    return P.s >= total;
  };

  // ---------------------------------------------------------------- sounds
  const engine = (vol: number) => {
    game.sound.noise({ dur: 0.32, vol: 0.12 * vol, freq: 260, type: 'lowpass' });
    game.sound.tone({ f: 62, dur: 0.3, type: 'sawtooth', vol: 0.035 * vol, attack: 0.08 });
  };
  const windRoar = (vol: number, freq: number) => game.sound.noise({ dur: 0.34, vol: 0.22 * vol, freq, type: 'bandpass', q: 0.6 });

  // ---------------------------------------------------------------- flow
  const board = () => {
    if (phase !== 'idle' || away) return false;
    rig = hooks.rig();
    if (!rig) return false;
    jumper = game.body;
    phase = 'taxi';
    t = 0;
    green = false;
    pulledAt = 0;
    malfunction = false;
    usedReserve = false;
    warned5k = false;
    lingerWarned = false;
    noReserveSaid = false;
    skipHold = 0;
    game.player.setEnabled(false);
    game.player.lock(true);
    game.player.pose = 'sit';
    path = makePath([
      [PARK.x, 0, PARK.z, 4],
      [PARK.x, 0, 136, 10],
      [PARK.x, 0, RUNWAY.cz - 2, 8],
      [PARK.x + 14, 0, RUNWAY.cz, 8],
      [140, 0, RUNWAY.cz, 34],
      [250, 30, RUNWAY.cz, 36],
      [330, 70, RUNWAY.cz - 40, 36],
    ]);
    game.sound.horn();
    game.say('Pilot', "Sit anywhere. Don't touch the red handle. Or the yellow one. Don't touch anything.", 3600);
    return true;
  };

  const seatPlayer = () => {
    const seat = local(-1.2, JUMP_PLANE.floorY, 0.98);
    game.player.teleport(seat, facingOf(0, -1));
    game.player.lock(true);
    game.player.pose = 'sit';
  };

  const startJumpRun = () => {
    phase = 'jumprun';
    t = 0;
    path = null;
    pose.x = RUN.x;
    pose.y = JUMP_ALT;
    pose.z = RUN.z;
    pose.h = Math.PI / 2;
    pose.pitch = 0;
    pose.roll = 0;
    placePlane();
    buildCabin();
    showClouds(true);
    game.flash('#ffffff', 900);
    game.player.setEnabled(true);
    game.player.teleport(local(0.4, JUMP_PLANE.floorY + 0.05, 0.2), facingOf(-0.3, -1));
    game.player.lock(false);
    game.player.pose = null;
    plane.redLight.visible = true;
    plane.greenLight.visible = false;
    game.toast('12,500 FEET', 'Jump run over the airport. Wait for the green light, then walk out the door.', 3800);
  };

  /** Out the door: start free fall and send the plane on its way. */
  const exitPlane = () => {
    phase = 'freefall';
    t = 0;
    dropCabin();
    const fwd = f.dir(1, 0, 0);
    game.player.vel.set(fwd.x * 10, 0, fwd.z * 10);
    game.player.sky = freefallControl;
    game.player.pose = 'freefall';
    game.sound.whoosh();
    if (!green) game.say('Pilot', 'HEY! I said WAIT for the green light! ...Eh, close enough.', 3200);
    else game.say('Pilot', 'Blue skies! Pull at four grand!', 2400);
    away = { t: 0 };
  };

  const resetPlane = () => {
    away = null;
    pose.x = PARK.x;
    pose.y = 0;
    pose.z = PARK.z;
    pose.h = 0;
    pose.pitch = 0;
    pose.roll = 0;
    placePlane();
    plane.redLight.visible = true;
    plane.greenLight.visible = false;
  };

  /** Clear everything about the jump (landed, died, or changed bodies). Keeps visuals of the death. */
  const finish = (keepVisuals: boolean) => {
    if (phase === 'jumprun' || phase === 'taxi') {
      dropCabin();
      resetPlane();
    }
    phase = phase === 'idle' ? 'idle' : 'done';
    t = 0;
    game.player.sky = null;
    game.player.pose = null;
    pilotChute.visible = false;
    setHud(false);
    if (!keepVisuals) {
      for (const o of [mainCanopy, reserve, laundry, teddy]) o.visible = false;
      over = null;
    }
    setTimeout(() => {
      if (phase === 'done') phase = 'idle';
    }, 50);
    setTimeout(
      () => {
        if (phase !== 'idle') return;
        for (const o of [mainCanopy, reserve, laundry, teddy]) o.visible = false;
        over = null;
        if (!active()) showClouds(false);
      },
      keepVisuals ? 14000 : 0,
    );
  };

  const deploy = () => {
    pulledAt = agl() * FT;
    game.sound.pull();
    game.sound.whoosh();
    if (rig === 'teddy') {
      phase = 'teddy';
      over = teddy;
      teddy.visible = true;
      teddy.scale.setScalar(1.2);
      game.sound.boing();
      game.say('Death', "That's a teddy bear. You jumped with a teddy bear.", 3500);
      return;
    }
    phase = 'deploying';
    t = 0;
    pilotChute.visible = true;
    malfunction = rig === 'rental' && Math.random() < 0.34;
  };

  // ---------------------------------------------------------------- sky control (drives the player's velocity)
  const wishDir = (inp: PlayerInput) => {
    const fx = -Math.sin(inp.camYaw), fz = -Math.cos(inp.camYaw);
    const rx = Math.cos(inp.camYaw), rz = -Math.sin(inp.camYaw);
    const wx = fx * inp.moveY + rx * inp.moveX, wz = fz * inp.moveY + rz * inp.moveX;
    const l = Math.hypot(wx, wz);
    return l > 0.1 ? { x: wx / l, z: wz / l, len: Math.min(1, l) } : null;
  };

  const freefallControl = (dt: number, inp: PlayerInput, v: THREE.Vector3) => {
    const p = game.player;
    const w = wishDir(inp);
    const dive = !!inp.sprint;
    const terminal = phase === 'teddy' ? 34 : phase === 'laundry' ? 25 : dive ? 46 : 32;
    v.y += (-terminal - v.y) * Math.min(1, dt * 0.85);
    const track = dive ? 9 : 15;
    if (w) {
      approach2(v, w.x * track * w.len, w.z * track * w.len, 9 * dt);
      p.facing = turnToward(p.facing, Math.atan2(w.x, w.z), 2.6 * dt);
    } else approach2(v, 0, 0, 5 * dt);
    lastVy = v.y;
  };

  const canopyControl = (dt: number, inp: PlayerInput, v: THREE.Vector3) => {
    const p = game.player;
    const w = wishDir(inp);
    const flare = inp.jumpHeld;
    const dive = !!inp.sprint && !flare;
    if (phase === 'twist') {
      // Line twist: spinning, half a wing, coming down fast.
      p.facing += dt * 4.2;
      v.y += (-17 - v.y) * Math.min(1, dt * 1.2);
      approach2(v, wind.x, wind.z, 6 * dt);
      lastVy = v.y;
      return;
    }
    if (phase === 'deploying') {
      const k = Math.min(1, t / 1.6);
      v.y += (-(32 - 27 * k * k) - v.y) * Math.min(1, dt * 3);
      approach2(v, 0, 0, 10 * dt);
      lastVy = v.y;
      return;
    }
    if (w) p.facing = turnToward(p.facing, Math.atan2(w.x, w.z), (dive ? 1.5 : 0.95) * dt);
    const fwd = flare ? 3.2 : dive ? 13 : 8.5;
    const sink = flare ? 2.4 : dive ? 8.8 : 4.3;
    const fd = { x: Math.sin(p.facing), z: Math.cos(p.facing) };
    approach2(v, fd.x * fwd + wind.x, fd.z * fwd + wind.z, 10 * dt);
    v.y += (-sink - v.y) * Math.min(1, dt * 2.2);
    lastVy = v.y;
  };

  // Keep everyone over the map: a headwind pushes back near the edges.
  const keepInBounds = (v: THREE.Vector3) => {
    const p = game.player.position();
    const m = 24;
    if (p.x < m) v.x = Math.max(v.x, 6);
    if (p.x > ctx.world.sx - m) v.x = Math.min(v.x, -6);
    if (p.z < m) v.z = Math.max(v.z, 6);
    if (p.z > ctx.world.sz - m) v.z = Math.min(v.z, -6);
  };

  // ---------------------------------------------------------------- landings and deaths
  const radarPos = W((TOWER.x0 + TOWER.x1 + 1) / 2, TOWER.cabY + 6.75, (TOWER.z0 + TOWER.z1 + 1) / 2);

  const crater = (color = 0x6a5a3a) => {
    const at = game.player.feet().add(new THREE.Vector3(0, 0.3, 0));
    game.particles.burst(at, 50, color, 12, { life: 1.6, size: 0.22, gravity: 14 });
    game.particles.burst(at, 30, 0xdddddd, 6, { life: 2.2, size: 0.6, gravity: -1 });
    game.shake(1.6);
  };

  /** Drape whatever was overhead onto the spot where the jumper landed. */
  const drape = (o: THREE.Object3D | null) => {
    if (!o) return;
    const at = game.player.feet();
    o.position.copy(at).add(new THREE.Vector3(0.6, -3.9, 0.4));
    o.rotation.set(0, o.rotation.y, 0.35);
  };

  /** The city's bay: its surface sits two blocks under the airport's ground and the bed is below that. */
  const seaLevel = f.origin.y - 2;

  const land = () => {
    const was = phase;
    const ch = game.character;
    groundedT = 0;
    if (game.player.feet().y < seaLevel - 0.5) return water();
    if (was === 'freefall') {
      game.sound.splat();
      crater();
      hooks.kill('air-sky-nopull', { kind: 'pancake' });
      game.runSeq([{ at: 1.8, fn: () => game.say('Death', 'The handle was right there. On your hip. Where they always are.', 3200) }]);
    } else if (was === 'deploying') {
      game.sound.splat();
      crater();
      drape(mainCanopy.visible ? mainCanopy : pilotChute);
      hooks.kill('air-sky-lowpull', { kind: 'pancake' });
      game.runSeq([{ at: 1.8, fn: () => game.say('Death', `Pulled at ${Math.round(pulledAt / 10) * 10} feet. Bold. Wrong, but bold.`, 3200) }]);
    } else if (was === 'teddy') {
      game.sound.splat();
      crater();
      hooks.kill('air-teddychute', { kind: 'pancake' });
      teddy.position.copy(game.player.feet().add(new THREE.Vector3(0.9, 0.8, 0.3)));
      teddy.rotation.set(0, 0.4, 0);
    } else if (was === 'laundry') {
      game.sound.splat();
      crater();
      laundry.position.copy(game.player.feet()).add(new THREE.Vector3(0, -3.95, 0));
      hooks.kill('air-sky-bargain', { kind: 'pancake' });
      game.runSeq([{ at: 1.8, fn: () => game.say('Frank (on lunch)', "Huh. I KNEW I'd left my laundry somewhere.", 3200) }]);
    } else if (was === 'twist') {
      game.sound.splat();
      game.shake(1.2);
      drape(mainCanopy);
      hooks.kill('air-sky-linetwist', { kind: 'ragdoll', vel: new THREE.Vector3(0, 7, 0), spin: 22, bounce: 0.4 });
      game.runSeq([{ at: 1.8, fn: () => game.say('Death', 'Spinning all the way down. The red pillow was the cutaway. Then the silver one.', 3600) }]);
    } else if (was === 'canopy') {
      const feet = game.player.feet();
      const d = f.toDesign(feet);
      // The control tower's roof is the radar's turf.
      if (d.x > TOWER.x0 - 6 && d.x < TOWER.x1 + 7 && d.z > TOWER.z0 - 6 && d.z < TOWER.z1 + 7 && d.y > TOWER.cabY + 4) return radarBlip();
      const hard = lastVy < -6.5;
      game.player.sky = null;
      game.player.pose = null;
      game.sound.land(hard ? 1 : 0.4);
      if (hard) {
        game.player.breakLegs();
        game.sound.crunch();
        game.sound.scream(1.2);
        game.toast('BOTH LEGS BROKEN', 'Diving it into the ground without a flare. Frank teaches that on day two.', 4200);
      } else {
        game.toast(lastVy > -3.2 ? 'NAILED IT' : 'LANDED', lastVy > -3.2 ? 'Flared at just the right time. Frank would be proud. Frank is at lunch.' : 'A bit hard, but every bone accounted for. Flare next time (Space).', 3600);
        if (ch) game.particles.burst(feet, 14, 0xcdbf9a, 3, { life: 0.6, size: 0.25, gravity: 6 });
      }
      // The canopy settles behind you.
      const o = over;
      if (o) {
        const dir = new THREE.Vector3(Math.sin(game.player.facing), 0, Math.cos(game.player.facing));
        o.position.copy(feet).addScaledVector(dir, -3.5).add(new THREE.Vector3(0, -3.6, 0));
        o.rotation.z = 0.2;
      }
      hooks.clearRig();
      wearRig();
      finish(true);
      return;
    }
    hooks.clearRig();
    finish(true);
  };

  const radarBlip = () => {
    const feet = game.player.feet();
    const tan = new THREE.Vector3(-(feet.z - radarPos.z), 0, feet.x - radarPos.x).normalize();
    game.player.sky = null;
    game.player.lock(true);
    game.say('Tower', 'Unknown traffic on the radar. Correction: ON the radar.', 2600);
    game.runSeq([
      { at: 0.25, fn: () => game.sound.creak() },
      {
        at: 0.7,
        fn: () => {
          game.sound.slam();
          hooks.kill('air-sky-radar', { kind: 'ragdoll', vel: tan.multiplyScalar(26).add(new THREE.Vector3(0, 12, 0)), spin: 26, bounce: 0.6 });
          hooks.clearRig();
          finish(true);
        },
      },
    ]);
    phase = 'done';
  };

  const water = () => {
    const feet = game.player.feet();
    if (!game.player.swimming) feet.y = Math.max(feet.y, seaLevel); // splash on the surface, not the bed
    game.particles.burst(feet.clone().add(new THREE.Vector3(0, 0.4, 0)), 70, 0xe8f4ff, 14, { life: 1.4, size: 0.4, gravity: 16 });
    game.particles.burst(feet.clone().add(new THREE.Vector3(0, 0.2, 0)), 30, 0x4a8ad8, 8, { life: 1.2, size: 0.35, gravity: 12 });
    if (phase === 'canopy') {
      // Wet blanket: the canopy settles over your head and soaks through.
      game.player.sky = null;
      game.player.pose = null;
      game.player.lock(true);
      const o = over;
      if (o) {
        o.position.copy(feet).add(new THREE.Vector3(0, -3.75, 0));
        o.rotation.set(0, o.rotation.y, 0.05);
      }
      game.say('Death', "Nice soft landing. Now get out from under forty square metres of wet nylon. Go on.", 3600);
      game.runSeq([
        { at: 1.2, fn: () => game.sound.trickle() },
        { at: 2.4, fn: () => game.sound.gulp() },
        { at: 3.4, fn: () => (hooks.kill('air-sky-wetblanket', { kind: 'ragdoll', vel: new THREE.Vector3(0, -1, 0), spin: 1, bounce: 0.1 }), hooks.clearRig(), finish(true)) },
      ]);
      phase = 'done';
      return;
    }
    game.sound.splat();
    game.shake(1.4);
    hooks.kill('air-sky-splashdown', { kind: 'ragdoll', vel: new THREE.Vector3(0, 9, 0), spin: 14, bounce: 0.3 });
    game.runSeq([{ at: 1.8, fn: () => game.say('Death', 'From 12,000 feet, water is just concrete that holds a grudge.', 3200) }]);
    hooks.clearRig();
    finish(true);
  };

  /** Pulled inside the cabin: the pilot chute goes out the door and takes you with it. */
  const tailStrike = () => {
    phase = 'done';
    rig = hooks.rig();
    const { door: D } = JUMP_PLANE;
    const doorW = local((D.x0 + D.x1) / 2, JUMP_PLANE.floorY + 0.1, -1.4);
    game.sound.pull();
    game.player.lock(true);
    pilotChute.visible = true;
    pilotChute.position.copy(doorW);
    const canopy = rig === 'bargain' ? laundry : rig === 'teddy' ? teddy : mainCanopy;
    game.say('Pilot', "NO NO NO not IN the plane--", 1800);
    game.runSeq([
      { at: 0.15, fn: () => (pilotChute.position.copy(local(D.x0 - 1.5, 2.2, -3.2)), game.sound.whoosh()) },
      {
        at: 0.45,
        fn: () => {
          canopy.visible = true;
          canopy.position.copy(local(-9, -1.5, -6));
          canopy.scale.setScalar(1);
          over = canopy;
          dropCabin();
          game.player.setEnabled(true);
          game.player.teleport(doorW, game.player.facing);
          game.sound.slam();
          game.shake(1.5);
          // Yanked out of the door and back along the fuselage into the tail.
          const back = local(-1, 0, -0.45).sub(local(0, 0, 0)).normalize().multiplyScalar(32).add(new THREE.Vector3(0, 4, 0));
          hooks.kill('air-sky-tailstrike', { kind: 'ragdoll', vel: back, spin: 18, bounce: 0.5 });
          hooks.clearRig();
          away = { t: 0 };
          finish(true);
        },
      },
      { at: 2.2, fn: () => game.say('Pilot', 'Frank is going to make ME fill out that form.', 3000) },
    ]);
  };

  // ---------------------------------------------------------------- per fixed step
  const step = (h: number) => {
    // The plane flying off after a jump, then quietly back in the hangar.
    if (away && phase !== 'taxi' && phase !== 'jumprun') {
      away.t += h;
      pose.x += 30 * h;
      pose.y += 3 * h;
      placePlane();
      if (away.t > 16) resetPlane();
    }
    if (phase === 'idle' || phase === 'done') return;
    if (game.body !== jumper || !game.character) {
      // Died some other way or left the body.
      finish(phase !== 'taxi' && phase !== 'jumprun');
      phase = 'idle';
      return;
    }
    t += h;
    if (phase === 'taxi') {
      const done = fly(h);
      seatPlayer();
      if (done) startJumpRun();
      return;
    }
    if (phase === 'jumprun') {
      const lp = toLocal(game.player.position());
      if (lp.z < JUMP_PLANE.cabin.z0 - 0.45 || lp.y < JUMP_PLANE.floorY - 0.6 || lp.x < JUMP_PLANE.cabin.x0 - 1 || lp.x > JUMP_PLANE.cabin.x1 + 2) exitPlane();
      return;
    }
    if (airborne()) {
      keepInBounds(game.player.vel);
      if (game.player.swimming) return water();
      // Under a canopy you can still clip the radar on the way past.
      if (phase === 'canopy' && game.player.position().distanceTo(radarPos) < 2.6) return radarBlip();
      // Fallback if another place handled the landing first.
      if (game.player.grounded) {
        groundedT += h;
        if (groundedT > 0.15) land();
      } else groundedT = 0;
    }
  };

  // ---------------------------------------------------------------- per frame
  const update = (dt: number, time: number) => {
    wearRig();
    plane.prop.rotation.x += dt * (phase === 'taxi' || phase === 'jumprun' || away ? 38 : 0.6);
    pilot.animate(dt, { speed: 0, grounded: true, state: 'ground', stateTime: 0, airTime: 0, pose: 'sit' });
    soundT -= dt;
    const live = active() && game.body === jumper;
    if (!live) {
      if (phase === 'idle') setHud(false);
      return;
    }
    const inp = game.input;
    const ft = agl() * FT;

    if (phase === 'taxi') {
      if (soundT <= 0) {
        engine(path && path.s > 40 ? 1.3 : 0.8);
        soundT = 0.25;
      }
      setHud(true, `${key('SPACE')}Hold to skip the climb`);
      setAlt(ft);
      skipHold = inp.held('jump') ? skipHold + dt : 0;
      if (skipHold > 0.5) startJumpRun();
      return;
    }

    if (phase === 'jumprun') {
      if (soundT <= 0) {
        engine(1.4);
        windRoar(0.5, 500);
        soundT = 0.25;
      }
      // Clouds slide past to sell the airspeed; the door roars.
      for (let i = 0; i < clouds.length; i++) {
        clouds[i].position.x -= 26 * dt;
        if (clouds[i].position.x < cloudHome[i].x - 200) clouds[i].position.x += 400;
      }
      const door = local(-2.8, 2.6, -1.9);
      if (Math.random() < 0.6) game.particles.emit(door, f.dir(-22, 0, 0).add(new THREE.Vector3(0, -1, 0)), 0xffffff, { life: 0.5, size: 0.12, gravity: 0, spread: 1.4 });
      if (!green && t > 3) {
        green = true;
        plane.redLight.visible = false;
        plane.greenLight.visible = true;
        game.sound.blip(1.6);
        game.say('Pilot', 'GREEN LIGHT! Out you go. Door is on the left.', 3000);
      }
      if (t > 45 && !lingerWarned) {
        lingerWarned = true;
        game.say('Pilot', "I'm not circling all day. Jump in fifteen or you're riding back down.", 3600);
      }
      if (t > 60) {
        // Rode it back down: back in the hangar, rig still on.
        dropCabin();
        resetPlane();
        showClouds(false);
        phase = 'idle';
        setHud(false);
        game.flash('#ffffff', 900);
        game.player.teleport(W(PARK.x - 5, 0, PARK.z - 3), f.heading(0));
        game.toast('BACK ON THE GROUND', 'You rode the plane back down. Frank does not do refunds.', 3200);
        return;
      }
      setHud(true, green ? `<b style="color:#6aff8a">GREEN LIGHT</b><br>Walk out the open door` : `<b style="color:#ff6a5a">RED LIGHT</b><br>Get ready by the door`);
      setAlt(ft);
      // Pulling in here is a terrible idea.
      if (inp.pressed('interact') && game.player.state !== 'locked') tailStrike();
      return;
    }

    if (!airborne()) {
      setHud(false);
      return;
    }
    setAlt(ft);
    const speed = game.player.vel.length();
    if (soundT <= 0) {
      windRoar(Math.min(1.4, speed / 28), 300 + speed * 18);
      soundT = 0.25;
    }
    if (phase === 'freefall') {
      if (!warned5k && ft < 5000) {
        warned5k = true;
        game.sound.blip(1.2);
      }
      beepT -= dt;
      if (ft < 3000 && beepT <= 0) {
        game.sound.blip(2);
        beepT = ft < 1500 ? 0.12 : 0.3;
      }
      setHud(true, `${key('E')}Pull the ripcord<br>${key('WASD')}Track ${key('SHIFT')}Dive`);
      if (inp.pressed('interact')) deploy();
    } else if (phase === 'deploying') {
      setHud(true, 'Opening...');
      const k = Math.min(1, t / 1.6);
      const ch = game.player.position();
      pilotChute.position.copy(ch).add(new THREE.Vector3(0, 4 + k * 3 + Math.sin(time * 20) * 0.2, 0));
      if (t > 0.5) {
        const c = rig === 'bargain' && !usedReserve ? laundry : usedReserve ? reserve : mainCanopy;
        over = c;
        c.visible = true;
        openK = Math.min(1, (t - 0.5) / 1.1);
        game.player.pose = 'canopy';
        game.player.sky = canopyControl;
      }
      if (t > 1.6) {
        pilotChute.visible = false;
        if (rig === 'bargain' && !usedReserve) {
          // Not a canopy: Frank's laundry bag.
          over = laundry;
          laundry.visible = true;
          phase = 'laundry';
          game.player.sky = freefallControl;
          game.player.pose = 'canopy';
          game.sound.boing();
          game.say('Death', "That's a bedsheet. And... socks. Frank packed his laundry.", 3500);
        } else if (malfunction && !usedReserve) {
          phase = 'twist';
          game.sound.creak();
          game.say('Death', 'Ooh, line twist. You know what to do. Do you know what to do?', 3200);
        } else {
          phase = 'canopy';
          openK = 1;
          game.sound.whoosh();
          if (ft < 1500) game.toast('OPEN', "That was close. That was VERY close.", 2400);
        }
        t = 0;
      }
    } else if (phase === 'twist') {
      setHud(true, `<b style="color:#ff6a5a">MALFUNCTION</b><br>${key('E')}Cut away, pull the reserve`);
      if (inp.pressed('interact')) {
        // Cut away: the twisted main flies off; the reserve comes out.
        cutaway = { obj: mainCanopy, vel: game.player.vel.clone().multiplyScalar(-0.2).add(new THREE.Vector3(2, 6, 0)), t: 0 };
        over = null;
        openK = 0;
        usedReserve = true;
        phase = 'deploying';
        t = 0.45;
        pilotChute.visible = true;
        game.sound.pull();
        game.say('Death', 'Cut away, reserve out. Textbook. Boring, but textbook.', 3000);
      }
    } else if (phase === 'laundry') {
      setHud(true, `<b style="color:#ff6a5a">THAT IS LAUNDRY</b>`);
      if (inp.pressed('interact') && !noReserveSaid) {
        noReserveSaid = true;
        game.toast('NO RESERVE', 'You feel for the reserve handle. It is a sock.', 2600);
      }
    } else if (phase === 'teddy') {
      setHud(true, `<b style="color:#ff6a5a">THAT IS A TEDDY BEAR</b>`);
    } else if (phase === 'canopy') {
      setHud(true, `${key('WASD')}Steer<br>${key('SPACE')}Flare to land soft<br>${key('SHIFT')}Dive`);
    }

    // Overhead visuals follow the jumper.
    const feet = game.player.feet();
    const face = game.player.facing;
    if (over) {
      over.position.copy(feet);
      if (over === teddy) {
        over.position.y += 3.4 + Math.sin(time * 6) * 0.3;
        over.rotation.y += dt * 4;
      } else if (over === laundry) {
        over.rotation.y = face;
        for (const c of laundry.children) {
          if (c.name === 'sheet') c.rotation.set(Math.sin(time * 11) * 0.35, 0, Math.sin(time * 7) * 0.25);
          else if (c.name) c.rotation.set(Math.sin(time * 13 + c.position.x) * 0.6, 0, Math.cos(time * 9 + c.position.z) * 0.6);
        }
      } else {
        over.rotation.set(0, face - Math.PI / 2, 0);
        const sz = phase === 'twist' ? 0.35 : 0.15 + 0.85 * openK;
        over.scale.set(0.6 + 0.4 * openK, 0.3 + 0.7 * openK, sz);
        if (phase === 'twist') over.rotation.x = Math.sin(time * 3) * 0.2;
      }
    }
    if (cutaway) {
      cutaway.t += dt;
      cutaway.vel.y -= 2 * dt;
      cutaway.obj.position.addScaledVector(cutaway.vel, dt);
      cutaway.obj.rotation.z += dt * 1.5;
      if (cutaway.t > 8) {
        cutaway.obj.visible = false;
        cutaway = null;
      }
    }
  };

  const onLand = () => {
    if (!airborne() || game.body !== jumper) return false;
    land();
    return true;
  };

  const api = {
    board,
    get phase() {
      return phase;
    },
    /** Parked and ready to board. */
    get ready() {
      return phase === 'idle' && !away;
    },
    step,
    update,
    onLand,
    /** True while the airport should leave the player alone (no trespass checks etc.). */
    get busy() {
      return active();
    },
    plane,
    dispose() {
      dropCabin();
      hud.remove();
      if (rigOnBack.obj) rigOnBack.obj.removeFromParent();
      for (const o of added) scene.remove(o);
      pilot.dispose();
    },
    debug: {
      get t() {
        return t;
      },
      startJumpRun,
      deploy: () => deploy(),
      setMalfunction: (m: boolean) => (malfunction = m),
      get malfunction() {
        return malfunction;
      },
      local,
      toLocal,
    },
  };
  // Handle for headless playtests (like window.game).
  (globalThis as { __skydive?: unknown }).__skydive = api;
  return api;
}

export type Skydive = ReturnType<typeof setupSkydive>;
