import * as THREE from 'three';
import { RAPIER, G_ALL, G_PROP, G_WORLD, groups } from './physics';
import { G, SIZE, type TownInfo } from './town';
import { canvasTexture, noiseTexture } from './util';

const lambert = (color: THREE.ColorRepresentation, map: THREE.Texture | null = noiseTexture()) =>
  new THREE.MeshLambertMaterial({ color, map });

function boxMesh(w: number, h: number, d: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function textSign(lines: string[], w: number, h: number, bg: string, fg: string, font = 'bold 40px Arial Black, Impact, sans-serif') {
  return canvasTexture(
    w,
    h,
    (c) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = fg;
      c.lineWidth = 8;
      c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      lines.forEach((line, i) => {
        const fs = i === 0 ? font : font.replace(/\d+px/, `${Math.round(parseInt(font.match(/(\d+)px/)?.[1] ?? '40') * 0.55)}px`);
        c.font = fs;
        c.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1));
      });
    },
    false,
  );
}

export class Train {
  readonly group = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  x = -80;
  readonly speed = 26;
  readonly length = 34;
  private wait = 6;
  hornPlayed = false;
  smokeTimer = 0;
  readonly halfExtents = new THREE.Vector3(17, 2, 1.6);

  constructor(scene: THREE.Scene, physics: RAPIER.World, readonly z: number) {
    const black = lambert(0x222226);
    const red = lambert(0xb02a2a);
    const cars = [0x2a6ab0, 0xe0a020, 0x3a9a4a];
    // engine (front at +x)
    const engine = new THREE.Group();
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 10), black);
    boiler.rotation.z = Math.PI / 2;
    boiler.position.set(1.5, 2.2, 0);
    boiler.castShadow = true;
    engine.add(boiler);
    const cab = boxMesh(3, 3.4, 2.8, red);
    cab.position.set(-2.2, 2.6, 0);
    engine.add(cab);
    const stack = boxMesh(0.8, 1.6, 0.8, black);
    stack.position.set(3, 3.8, 0);
    engine.add(stack);
    const cow = boxMesh(0.6, 1, 2.8, red);
    cow.position.set(4.4, 1, 0);
    engine.add(cow);
    engine.position.x = 13;
    this.group.add(engine);
    cars.forEach((c, i) => {
      const car = boxMesh(6.5, 2.8, 2.8, lambert(c));
      car.position.set(5 - i * 7.5, 2.3, 0);
      this.group.add(car);
    });
    const wheelM = lambert(0x111111);
    for (let x = -17; x <= 17; x += 2.5)
      for (const zz of [-1.3, 1.3]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 8), wheelM);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, 0.6, zz);
        this.group.add(wheel);
      }
    scene.add(this.group);
    this.body = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.x, G, z));
    physics.createCollider(
      RAPIER.ColliderDesc.cuboid(17, 2, 1.5).setTranslation(0, 2, 0).setCollisionGroups(groups(G_PROP, G_ALL)).setFriction(0.3),
      this.body,
    );
  }

  /** Returns true the frame the train starts a new run. */
  update(dt: number) {
    if (this.wait > 0) {
      this.wait -= dt;
      this.x = -60;
      this.hornPlayed = false;
    } else {
      this.x += this.speed * dt;
      if (this.x > SIZE + 60) {
        this.wait = 9;
      }
    }
    this.body.setNextKinematicTranslation({ x: this.x, y: G, z: this.z });
    this.group.position.set(this.x, G, this.z);
    return this.wait <= 0;
  }

  get moving() {
    return this.wait <= 0;
  }

  contains(p: THREE.Vector3, pad = 0.6) {
    return (
      Math.abs(p.x - this.x) < this.halfExtents.x + pad &&
      p.y < G + 4.5 &&
      p.y > G - 1 &&
      Math.abs(p.z - this.z) < this.halfExtents.z + pad
    );
  }

  smokePos() {
    return new THREE.Vector3(this.x + 16, G + 5, this.z);
  }
}

export class HayBale {
  readonly body: RAPIER.RigidBody;
  readonly mesh: THREE.Mesh;
  readonly rope: THREE.Mesh;
  state: 'hung' | 'fraying' | 'falling' | 'landed' = 'hung';
  timer = 0;

  constructor(scene: THREE.Scene, private physics: RAPIER.World, private hang: THREE.Vector3, private ropeTop: number) {
    const tex = canvasTexture(16, 16, (c) => {
      c.fillStyle = '#e3c25a';
      c.fillRect(0, 0, 16, 16);
      for (let i = 0; i < 70; i++) {
        c.fillStyle = Math.random() < 0.5 ? '#c9a440' : '#f2d77a';
        c.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1 + Math.floor(Math.random() * 3), 1);
      }
      c.fillStyle = '#7a5a2a';
      c.fillRect(4, 0, 1, 16);
      c.fillRect(11, 0, 1, 16);
    });
    this.mesh = boxMesh(2.2, 2, 2.2, new THREE.MeshLambertMaterial({ map: tex }));
    scene.add(this.mesh);
    this.rope = boxMesh(0.08, 1, 0.08, lambert(0x9a7a4a, null));
    scene.add(this.rope);
    this.body = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(hang.x, hang.y, hang.z));
    physics.createCollider(
      RAPIER.ColliderDesc.cuboid(1.1, 1, 1.1).setDensity(8).setFriction(0.8).setCollisionGroups(groups(G_PROP, G_ALL)),
      this.body,
    );
  }

  release() {
    if (this.state !== 'hung') return false;
    this.state = 'fraying';
    this.timer = 2.2;
    return true;
  }

  get velocityY() {
    return this.body.linvel().y;
  }

  position() {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  update(dt: number) {
    this.timer -= dt;
    if (this.state === 'fraying') {
      const wob = Math.sin(performance.now() * 0.03) * 0.08;
      this.body.setNextKinematicTranslation({ x: this.hang.x + wob, y: this.hang.y, z: this.hang.z });
      if (this.timer <= 0) {
        this.state = 'falling';
        this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        this.body.setLinvel({ x: 0, y: -2, z: 0 }, true);
        this.timer = 7;
      }
    } else if (this.state === 'falling' || this.state === 'landed') {
      if (this.state === 'falling' && Math.abs(this.velocityY) < 0.2 && this.timer < 6.5) this.state = 'landed';
      if (this.timer <= 0) {
        this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        this.body.setTranslation({ x: this.hang.x, y: this.hang.y, z: this.hang.z }, true);
        this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        this.state = 'hung';
      }
    }
    const t = this.body.translation();
    const r = this.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    const ropeVisible = this.state === 'hung' || this.state === 'fraying';
    this.rope.visible = ropeVisible;
    if (ropeVisible) {
      const len = this.ropeTop - (t.y + 1);
      this.rope.scale.y = Math.max(0.01, len);
      this.rope.position.set(t.x, t.y + 1 + len / 2, t.z);
    }
  }
}

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  prompt: string;
  mesh?: THREE.Object3D;
  enabled: boolean;
}

/** Static and animated set dressing: rails, fence wires, signs, clouds, edible hazards. */
export class Props {
  train: Train;
  bale: HayBale;
  lever: THREE.Group;
  leverPulled = 0;
  interactables: Interactable[] = [];
  private clouds: THREE.Group;
  private mushroom: THREE.Group;
  private wires: THREE.Mesh[] = [];
  barnDoorCollider: RAPIER.Collider;
  barnDoorMesh: THREE.Mesh;

  constructor(scene: THREE.Scene, physics: RAPIER.World, info: TownInfo) {
    // Rails and ties.
    const tieGeo = new THREE.BoxGeometry(0.5, 0.2, 4.2);
    const ties = new THREE.InstancedMesh(tieGeo, lambert(0x5a3a22), SIZE);
    const d = new THREE.Object3D();
    for (let i = 0; i < SIZE; i++) {
      d.position.set(i + 0.5, G + 0.1, info.trackZ + 0.5);
      d.updateMatrix();
      ties.setMatrixAt(i, d.matrix);
    }
    ties.receiveShadow = true;
    scene.add(ties);
    for (const off of [-1.2, 1.2]) {
      const rail = boxMesh(SIZE, 0.18, 0.18, lambert(0xb0b4bb, null));
      rail.position.set(SIZE / 2, G + 0.3, info.trackZ + 0.5 + off);
      scene.add(rail);
    }
    // Crossing sign.
    const xing = new THREE.Group();
    const pole = boxMesh(0.2, 4, 0.2, lambert(0xeeeeee, null));
    pole.position.y = 2;
    xing.add(pole);
    const xtex = textSign(['RAILROAD', 'CROSSING'], 256, 128, '#ffffff', '#111111', 'bold 44px Arial Black, Impact, sans-serif');
    for (const r of [0.6, -0.6]) {
      const b = boxMesh(2.6, 0.5, 0.06, new THREE.MeshLambertMaterial({ map: xtex }));
      b.position.y = 3.6;
      b.rotation.z = r;
      xing.add(b);
    }
    xing.position.set(86.5, G, info.trackZ - 3.5);
    scene.add(xing);

    // Electric fence wires (visual) plus invisible blocking walls.
    const f = info.fence;
    const wireMat = new THREE.MeshBasicMaterial({ color: 0xffe040 });
    const fenceBody = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const side = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (const h of [0.7, 1.4]) {
        const wire = new THREE.Mesh(new THREE.BoxGeometry(x1 === x0 ? 0.05 : len, 0.05, z1 === z0 ? 0.05 : len), wireMat);
        wire.position.set((x0 + x1) / 2 + 0.5, G + h, (z0 + z1) / 2 + 0.5);
        scene.add(wire);
        this.wires.push(wire);
      }
      const hx = x1 === x0 ? 0.1 : len / 2, hz = z1 === z0 ? 0.1 : len / 2;
      physics.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, 1, hz).setTranslation((x0 + x1) / 2 + 0.5, G + 1, (z0 + z1) / 2 + 0.5).setCollisionGroups(groups(G_WORLD, G_ALL)),
        fenceBody,
      );
    };
    side(f.x0, f.z0, f.x1, f.z0);
    side(f.x0, f.z1, f.x1, f.z1);
    side(f.x0, f.z0, f.x0, f.z1);
    side(f.x1, f.z0, f.x1, f.z1);
    const danger = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshLambertMaterial({ map: textSign(['DANGER', 'ELECTRIC FENCE', 'DO NOT TOUCH (OR ANYTHING ELSE)'], 256, 128, '#ffd400', '#111111', 'bold 40px Arial Black, Impact, sans-serif'), side: THREE.DoubleSide }),
    );
    danger.position.set((f.x0 + f.x1) / 2 + 0.5, G + 1.1, f.z0 + 0.35);
    danger.rotation.y = Math.PI;
    scene.add(danger);
    const danger2 = danger.clone();
    danger2.position.set(f.x0 + 0.35, G + 1.1, (f.z0 + f.z1) / 2 + 0.5);
    danger2.rotation.y = -Math.PI / 2;
    scene.add(danger2);

    // Billboard.
    const bbTex = canvasTexture(
      512,
      256,
      (c) => {
        const g = c.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, '#1d2b4f');
        g.addColorStop(1, '#0d1426');
        c.fillStyle = g;
        c.fillRect(0, 0, 512, 256);
        c.fillStyle = '#c9a227';
        c.beginPath();
        c.moveTo(60, 60);
        c.lineTo(110, 40);
        c.lineTo(160, 60);
        c.lineTo(160, 120);
        c.quadraticCurveTo(110, 170, 60, 120);
        c.closePath();
        c.fill();
        c.fillStyle = '#1d2b4f';
        c.font = 'bold 64px Georgia, serif';
        c.textAlign = 'center';
        c.fillText('M', 110, 118);
        c.fillStyle = '#ffffff';
        c.textAlign = 'left';
        c.font = 'bold 48px Georgia, serif';
        c.fillText('MORTALIS', 185, 92);
        c.fillText('MUTUAL', 185, 142);
        c.font = 'italic 26px Georgia, serif';
        c.fillStyle = '#c9a227';
        c.fillText("We're there for you.*", 60, 205);
        c.font = '14px Arial, sans-serif';
        c.fillStyle = '#8899bb';
        c.fillText('*Coverage subject to 4,000 pages of exclusions. Not valid on Earth.', 60, 238);
      },
      false,
    );
    const bb = new THREE.Mesh(new THREE.BoxGeometry(11, 5.5, 0.3), [
      lambert(0x333333, null),
      lambert(0x333333, null),
      lambert(0x333333, null),
      lambert(0x333333, null),
      new THREE.MeshLambertMaterial({ map: bbTex }),
      lambert(0x333333, null),
    ]);
    bb.position.copy(info.billboard).add(new THREE.Vector3(0, 0.5, 0.2));
    bb.castShadow = true;
    scene.add(bb);

    // Shop signs.
    const sign = (text: string[], pos: THREE.Vector3, rotY: number, bg: string, fg: string) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshLambertMaterial({ map: textSign(text, 512, 128, bg, fg, 'bold 56px Arial Black, Impact, sans-serif'), side: THREE.DoubleSide }));
      m.position.copy(pos);
      m.rotation.y = rotY;
      scene.add(m);
    };
    sign(["DUKE'S GARAGE"], new THREE.Vector3(67.1, G + 5, 98), Math.PI / 2, '#20304a', '#ffcc33');
    sign(['DINER', 'EAT HERE. MAYBE.'], new THREE.Vector3(87.9, G + 4, 96), -Math.PI / 2, '#d8302a', '#ffffff');
    sign(['HOFFMAN FARM'], new THREE.Vector3(137.5, G + 9.5, 108.6), 0, '#6b3a1e', '#f5e6c8');

    // Antifreeze jug.
    const jug = new THREE.Group();
    const jugTex = canvasTexture(16, 16, (c) => {
      c.fillStyle = '#39d14a';
      c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#ffffff';
      c.fillRect(2, 6, 12, 5);
      c.fillStyle = '#d01818';
      c.fillRect(3, 7, 10, 1);
      c.fillRect(3, 9, 10, 1);
    });
    const jb = boxMesh(0.45, 0.6, 0.3, new THREE.MeshLambertMaterial({ map: jugTex }));
    jb.position.y = 0.3;
    jug.add(jb);
    const cap = boxMesh(0.14, 0.12, 0.14, lambert(0xeeeeee, null));
    cap.position.set(0.1, 0.66, 0);
    jug.add(cap);
    jug.position.copy(info.jug);
    scene.add(jug);
    this.interactables.push({ id: 'jug', pos: info.jug.clone(), radius: 2.4, prompt: 'Drink the "sports drink"', mesh: jug, enabled: true });

    // Spotted mushroom.
    this.mushroom = new THREE.Group();
    const capTex = canvasTexture(8, 8, (c) => {
      c.fillStyle = '#d8241c';
      c.fillRect(0, 0, 8, 8);
      c.fillStyle = '#ffffff';
      for (const [x, y] of [[1, 1], [5, 2], [2, 5], [6, 6], [4, 4]]) c.fillRect(x, y, 1, 1);
    });
    const stem = boxMesh(0.25, 0.45, 0.25, lambert(0xf2ead8, null));
    stem.position.y = 0.22;
    const mcap = boxMesh(0.8, 0.32, 0.8, new THREE.MeshLambertMaterial({ map: capTex, emissive: 0x330000 }));
    mcap.position.y = 0.55;
    this.mushroom.add(stem, mcap);
    this.mushroom.position.copy(info.mushroom);
    scene.add(this.mushroom);
    this.interactables.push({ id: 'mushroom', pos: info.mushroom.clone(), radius: 2, prompt: 'Eat the spotted mushroom', mesh: this.mushroom, enabled: true });

    // Peanut butter cookies at the diner.
    const plate = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 0.05, 12), lambert(0xffffff, null));
    plate.add(p);
    for (let i = 0; i < 3; i++) {
      const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 8), lambert(0xc08040));
      ck.position.set(Math.cos(i * 2.1) * 0.18, 0.06 + i * 0.01, Math.sin(i * 2.1) * 0.18);
      plate.add(ck);
    }
    plate.position.copy(info.cookie);
    scene.add(plate);
    this.interactables.push({ id: 'cookie', pos: info.cookie.clone(), radius: 2.2, prompt: 'Eat a peanut butter cookie', mesh: plate, enabled: true });

    // Lever for the hay hoist.
    this.lever = new THREE.Group();
    const base = boxMesh(0.6, 0.4, 0.6, lambert(0x555555, null));
    base.position.y = 0.2;
    const stick = boxMesh(0.12, 1.1, 0.12, lambert(0xcc2222, null));
    stick.position.y = 0.55;
    const pivot = new THREE.Group();
    pivot.position.y = 0.4;
    stick.position.y = 0.55;
    pivot.add(stick);
    pivot.name = 'pivot';
    this.lever.add(base, pivot);
    this.lever.position.copy(info.lever);
    scene.add(this.lever);
    this.interactables.push({ id: 'lever', pos: info.lever.clone(), radius: 2, prompt: 'Pull the hoist lever (farm staff only)', mesh: this.lever, enabled: true });

    // Barn door: closed (solid) unless a Farmhand is driving.
    const bd = info.barnDoor;
    const doorW = bd.x1 - bd.x0 + 1;
    const doorTex = canvasTexture(16, 16, (c) => {
      c.fillStyle = '#8a2a22';
      c.fillRect(0, 0, 16, 16);
      c.strokeStyle = '#f2e6d0';
      c.lineWidth = 1;
      c.strokeRect(0.5, 0.5, 15, 15);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(16, 16);
      c.moveTo(16, 0);
      c.lineTo(0, 16);
      c.stroke();
    });
    this.barnDoorMesh = boxMesh(doorW, 6, 0.3, new THREE.MeshLambertMaterial({ map: doorTex }));
    this.barnDoorMesh.position.set(bd.x0 + doorW / 2, G + 3, bd.z + 0.5);
    scene.add(this.barnDoorMesh);
    this.barnDoorCollider = physics.createCollider(
      RAPIER.ColliderDesc.cuboid(doorW / 2, 3, 0.3).setTranslation(bd.x0 + doorW / 2, G + 3, bd.z + 0.5).setCollisionGroups(groups(G_WORLD, G_ALL)),
      fenceBody,
    );
    this.interactables.push({ id: 'barndoor', pos: bd.knock.clone(), radius: 2.6, prompt: 'Open the barn door', enabled: true });
    this.interactables.push({ id: 'baler', pos: info.baler.clone(), radius: 2.2, prompt: 'Climb into the hay baler', enabled: true });

    // Police station sign and the department taser.
    sign(['POLICE'], info.station.sign, Math.PI / 2, '#1a2a6a', '#ffffff');
    const taser = new THREE.Group();
    const tb = boxMesh(0.35, 0.18, 0.12, lambert(0xf2d020, null));
    const tg = boxMesh(0.1, 0.2, 0.1, lambert(0x222222, null));
    tg.position.set(-0.1, -0.15, 0);
    taser.add(tb, tg);
    taser.position.copy(info.station.taser).add(new THREE.Vector3(0, 0.1, 0));
    scene.add(taser);
    this.interactables.push({ id: 'taser', pos: info.station.taser.clone().setY(G), radius: 2, prompt: 'Test the department taser on yourself', mesh: taser, enabled: true });

    this.bale = new HayBale(scene, physics, info.baleHang, info.gantry.top);
    this.train = new Train(scene, physics, info.trackZ + 0.5);

    // Clouds.
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 });
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < n; j++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(4 + Math.random() * 6, 2 + Math.random() * 2, 4 + Math.random() * 5), cloudMat);
        b.position.set(j * 3 - n * 1.5, Math.random(), (Math.random() - 0.5) * 3);
        c.add(b);
      }
      c.position.set(Math.random() * 300 - 70, 55 + Math.random() * 15, Math.random() * 300 - 70);
      this.clouds.add(c);
    }
    scene.add(this.clouds);
  }

  setBarnOpen(open: boolean) {
    this.barnDoorCollider.setEnabled(!open);
    this.barnDoorMesh.visible = !open;
  }

  update(dt: number, t: number) {
    this.mushroom.rotation.y = Math.sin(t * 1.5) * 0.2;
    for (const c of this.clouds.children) {
      c.position.x += dt * 1.5;
      if (c.position.x > 240) c.position.x = -80;
    }
    const pivot = this.lever.getObjectByName('pivot');
    if (pivot) pivot.rotation.x += ((this.leverPulled > 0 ? 0.9 : -0.6) - pivot.rotation.x) * Math.min(1, dt * 10);
    this.leverPulled -= dt;
    const flicker = 0.7 + Math.random() * 0.3;
    for (const w of this.wires) (w.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.88 * flicker, 0.25);
  }
}
