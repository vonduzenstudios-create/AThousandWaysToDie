/** Time of day in the world. One in-game hour passes per real minute by default. */
export class GameClock {
  /** Hours since the start of day 0. */
  total: number;
  /** In-game hours per real second. */
  rate: number;

  constructor(startHour = 8, rate = 1 / 60) {
    this.total = startHour;
    this.rate = rate;
  }

  update(dt: number) {
    this.total += dt * this.rate;
  }

  /** Hour of the day, 0 to 24 (fractional). */
  get hour() {
    return ((this.total % 24) + 24) % 24;
  }

  get day() {
    return Math.floor(this.total / 24);
  }

  get dayName() {
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][this.day % 7];
  }

  get weekend() {
    return this.day % 7 >= 5;
  }

  /** '8:15 AM' */
  label() {
    const h = this.hour;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60 / 15) * 15;
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${mm.toString().padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
  }

  /** Is `hour` inside [open, close), with wrap past midnight. */
  static within(hour: number, range: [number, number] | undefined) {
    if (!range) return true;
    const [a, b] = range;
    if (a === b) return true;
    return a < b ? hour >= a && hour < b : hour >= a || hour < b;
  }

  /** Hours from `from` until `to` on a 24h clock, always in [0, 24). */
  static until(from: number, to: number) {
    return (((to - from) % 24) + 24) % 24;
  }
}
