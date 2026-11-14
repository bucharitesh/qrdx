/** Keys that activate a focused control (its click follows). */
const ACTIVATION_KEYS = new Set(["Enter", " "]);
const CONTROLS = 'button, [role="button"], a[href], summary';

interface GestureLike {
  type: string;
  key?: string;
  target?: EventTarget | null;
}

/**
 * Whether a trusted gesture is a direct activation: a click, tap or release,
 * or Enter / Space on a control. Seasonal cues only play right after one, so
 * keyboard users get them too while typing elsewhere never counts.
 */
export function isDirectActivation(event: GestureLike): boolean {
  if (event.type !== "keydown") return true;
  if (!event.key || !ACTIVATION_KEYS.has(event.key)) return false;
  const target = event.target as { closest?: (selector: string) => unknown };
  return Boolean(target?.closest?.(CONTROLS));
}
