import type { Car } from './car';

const MPH = 2.237;

/**
 * Driving dashboard: model name, an analog speedometer with a big digital readout, a segmented
 * tach with the gear, and lamps for the handbrake and airtime. Drawn on one small canvas.
 */
export class CarHud {
  private el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private shown = false;
  private needle = 0;
  private tach = 0;
  private car: Car | null = null;
  private dialMax = 100;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'carhud hidden';
    this.canvas = document.createElement('canvas');
    this.el.appendChild(this.canvas);
    parent.appendChild(this.el);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = 290 * dpr;
    this.canvas.height = 170 * dpr;
    this.canvas.style.width = '290px';
    this.canvas.style.height = '170px';
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(dpr, dpr);
  }

  hide() {
    if (!this.shown) return;
    this.shown = false;
    this.car = null;
    this.el.classList.add('hidden');
  }

  update(dt: number, car: Car, throttle: number, handbrake: boolean) {
    if (!this.shown || this.car !== car) {
      this.shown = true;
      this.car = car;
      this.el.classList.remove('hidden');
      this.dialMax = Math.ceil((car.spec.handling.top * MPH * 1.08) / 20) * 20;
      this.needle = Math.abs(car.speed) * MPH;
    }
    const mph = Math.abs(car.speed) * MPH;
    const k = Math.min(1, dt * 12);
    this.needle += (mph - this.needle) * k;
    const rpm = car.wheelsOnGround === 0 ? Math.min(1, car.rpm + Math.abs(throttle) * 0.4) : car.rpm;
    this.tach += (Math.max(0.08, rpm) - this.tach) * Math.min(1, dt * 18);
    this.draw(car, mph, throttle, handbrake);
  }

  private draw(car: Car, mph: number, throttle: number, handbrake: boolean) {
    const g = this.g;
    const W = 290, H = 170;
    g.clearRect(0, 0, W, H);
    // Panel.
    g.fillStyle = 'rgba(10,12,18,0.78)';
    round(g, 0, 0, W, H, 16);
    g.fill();
    g.strokeStyle = 'rgba(255,216,74,0.55)';
    g.lineWidth = 2;
    round(g, 1, 1, W - 2, H - 2, 15);
    g.stroke();

    // Name.
    g.fillStyle = '#ffd84a';
    g.font = 'bold 12px "Trebuchet MS", Verdana, sans-serif';
    g.textAlign = 'left';
    g.fillText(car.spec.handling.name.toUpperCase(), 14, 20);

    // Speedometer arc.
    const cx = 100, cy = 104, r = 66;
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    const ang = (v: number) => a0 + (a1 - a0) * Math.min(1, v / this.dialMax);
    g.lineCap = 'butt';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.stroke();
    // Filled sweep.
    const grad = g.createLinearGradient(cx - r, 0, cx + r, 0);
    grad.addColorStop(0, '#5ad1ff');
    grad.addColorStop(0.7, '#ffd84a');
    grad.addColorStop(1, '#ff5a3a');
    g.strokeStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, a0, ang(this.needle));
    g.stroke();
    // Ticks.
    g.lineWidth = 2;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = '10px "Trebuchet MS", Verdana, sans-serif';
    g.textAlign = 'center';
    const step = this.dialMax > 120 ? 20 : 10;
    for (let v = 0; v <= this.dialMax; v += step) {
      const a = ang(v);
      const major = v % (step * 2) === 0;
      g.strokeStyle = v > car.spec.handling.top * MPH ? '#ff5a3a' : 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
      g.lineTo(cx + Math.cos(a) * (r - (major ? 20 : 16)), cy + Math.sin(a) * (r - (major ? 20 : 16)));
      g.stroke();
      if (major) g.fillText(String(v), cx + Math.cos(a) * (r - 30), cy + Math.sin(a) * (r - 30) + 3);
    }
    // Needle.
    const na = ang(this.needle);
    g.strokeStyle = '#ff4a3a';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - Math.cos(na) * 8, cy - Math.sin(na) * 8);
    g.lineTo(cx + Math.cos(na) * (r - 6), cy + Math.sin(na) * (r - 6));
    g.stroke();
    g.fillStyle = '#ddd';
    g.beginPath();
    g.arc(cx, cy, 4, 0, Math.PI * 2);
    g.fill();
    // Digital speed.
    g.fillStyle = '#fff';
    g.font = 'bold 30px "Trebuchet MS", Verdana, sans-serif';
    g.fillText(String(Math.round(mph)), cx, cy + 40);
    g.font = '10px "Trebuchet MS", Verdana, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillText('MPH', cx, cy + 52);

    // Gear.
    const gx = 222;
    const reversing = car.speed < -0.5 && throttle < 0;
    const neutral = Math.abs(car.speed) < 0.4 && Math.abs(throttle) < 0.05;
    const gear = reversing ? 'R' : neutral ? 'N' : String(car.gear);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    round(g, gx - 30, 34, 60, 58, 10);
    g.fill();
    g.fillStyle = reversing ? '#ff9a5a' : '#ffd84a';
    g.font = 'bold 40px "Trebuchet MS", Verdana, sans-serif';
    g.fillText(gear, gx, 78);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = '9px "Trebuchet MS", Verdana, sans-serif';
    g.fillText(`GEAR / ${car.spec.handling.gears}`, gx, 104);

    // Tach: 12 segments, green to red.
    const segs = 12;
    const tx = 182, ty = 116, tw = 82, th = 10;
    const lit = Math.round(this.tach * segs);
    for (let i = 0; i < segs; i++) {
      const on = i < lit;
      const col = i >= segs - 2 ? '#ff4a3a' : i >= segs - 4 ? '#ffd84a' : '#6adf6a';
      g.fillStyle = on ? col : 'rgba(255,255,255,0.1)';
      g.fillRect(tx + i * (tw / segs), ty, tw / segs - 2, th);
    }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillText('RPM', gx, ty + 22);

    // Lamps.
    const lamp = (label: string, on: boolean, x: number, color: string) => {
      g.fillStyle = on ? color : 'rgba(255,255,255,0.08)';
      round(g, x, 146, 40, 15, 4);
      g.fill();
      g.fillStyle = on ? '#111' : 'rgba(255,255,255,0.35)';
      g.font = 'bold 9px "Trebuchet MS", Verdana, sans-serif';
      g.fillText(label, x + 20, 157);
    };
    lamp('BRAKE', handbrake || car.braking, 182, '#ff5a3a');
    lamp('AIR', car.wheelsOnGround === 0, 228, '#5ad1ff');
  }
}

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
