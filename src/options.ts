/** Player settings, saved separately from progress so erasing a save keeps them. */
export interface Options {
  /** 0..1 */
  music: number;
  /** 0..1 */
  sfx: number;
  /** Mouse look multiplier, 0.25..3 */
  sens: number;
  invertY: boolean;
}

const KEY = 'cestlavie.options.v1';
const DEFAULTS: Options = { music: 0.8, sfx: 1, sens: 1, invertY: false };

export function loadOptions(): Options {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* defaults */
  }
  return { ...DEFAULTS };
}

export function saveOptions(o: Options) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* storage blocked: settings last this session */
  }
}
