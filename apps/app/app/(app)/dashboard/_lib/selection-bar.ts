// Which bulk actions the floating selection bar shows as buttons, and which
// go into its More menu, from measured widths. Pure, so the rule is tested
// without a browser; _components/selection-bar.tsx measures and calls it.

export interface MeasuredAction {
  id: string;
  /** The button's width in px */
  width: number;
  /** Higher stays a button longer; ties keep the bar's order */
  priority: number;
}

export interface FitInput {
  /** Room for the bar's row, in px (inside its padding) */
  available: number;
  /** Widths that are always there: the count, Clear, the divider, the keys button */
  fixed: readonly number[];
  /** The More button's width */
  more: number;
  /** Space between items, in px */
  gap: number;
  /** Every action, in the bar's order */
  actions: readonly MeasuredAction[];
}

const rowWidth = (widths: readonly number[], gap: number) => {
  const shown = widths.filter((width) => width > 0);
  return shown.length === 0
    ? 0
    : shown.reduce((sum, width) => sum + width, 0) + gap * (shown.length - 1);
};

/**
 * The ids of the actions shown as buttons. All of them when they fit;
 * otherwise More takes a place and the actions join in priority order until
 * the next one doesn't fit, so a lesser action never shows while a greater
 * one is in the menu. Nothing has been measured yet (all zero): everything.
 */
export function fitActions({
  available,
  fixed,
  more,
  gap,
  actions,
}: FitInput): Set<string> {
  const all = new Set(actions.map((action) => action.id));
  if (
    available <= 0 ||
    rowWidth([...fixed, ...actions.map((action) => action.width)], gap) <=
      available
  ) {
    return all;
  }
  const ranked = actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => b.action.priority - a.action.priority || a.index - b.index);
  const shown = new Set<string>();
  const widths = [...fixed, more];
  for (const { action } of ranked) {
    if (rowWidth([...widths, action.width], gap) > available) break;
    widths.push(action.width);
    shown.add(action.id);
  }
  return shown;
}

/** Whether two id sets hold the same ids (to skip a re-render). */
export function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((id) => b.has(id));
}
