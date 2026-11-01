/**
 * Death's coaching: one-time lines for first moments (first body, first claim, first repeat...).
 * Remembers what's been said per save so a returning player isn't lectured twice.
 */
const SAVE_KEY = 'clv-guide-v1';

export class Coach {
  private seen = new Set<string>();

  constructor() {
    try {
      for (const id of JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]')) this.seen.add(id);
    } catch {
      /* fresh */
    }
  }

  has(id: string) {
    return this.seen.has(id);
  }

  /** True the first time it's called for `id` on this save, false after. */
  once(id: string) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    this.save();
    return true;
  }

  forget() {
    this.seen.clear();
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify([...this.seen]));
    } catch {
      /* session only */
    }
  }
}

/** Unlock countdown lines: Death checks in when you're this many new deaths away. */
export const COUNTDOWN = new Set([20, 15, 10, 5, 3, 2, 1]);
