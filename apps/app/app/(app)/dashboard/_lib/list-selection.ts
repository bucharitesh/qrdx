// Row selection for the dashboard lists (codes, pages), as pure functions so
// the rules are tested without a browser.
//
// A click on a row's checkbox toggles it and makes it the anchor. A
// shift-click lays the range from the anchor to the clicked row over the
// selection as it was when the anchor was set (`base`), so shift-clicking
// again moves the range's far end: further out extends it, back towards the
// anchor shrinks it, as in a file manager. The range takes
// the anchor's own state: from a checked anchor it selects, from an unchecked
// one it clears. `order` is always the list as shown (its sort, filters and
// page), so a range never reaches rows that aren't on screen.

export interface ListSelection {
  selected: ReadonlySet<string>;
  /** The row a range starts from, and whether ranges select or clear */
  anchor: { id: string; on: boolean } | null;
  /** The selection when the anchor was set; a range is laid over it */
  base: ReadonlySet<string>;
}

export const EMPTY_SELECTION: ListSelection = {
  selected: new Set(),
  anchor: null,
  base: new Set(),
};

/** A plain click: flips one row (or sets it) and makes it the anchor. */
export function toggleRow(
  state: ListSelection,
  id: string,
  on: boolean = !state.selected.has(id),
): ListSelection {
  const selected = new Set(state.selected);
  if (on) selected.add(id);
  else selected.delete(id);
  return { selected, anchor: { id, on }, base: selected };
}

/**
 * A shift-click (or Shift+Space) on `id`: every row between the anchor and
 * it, in `order`, takes the anchor's state. With no anchor on screen it's a
 * plain click that selects.
 */
export function selectRange(
  state: ListSelection,
  order: readonly string[],
  id: string,
): ListSelection {
  const to = order.indexOf(id);
  if (to === -1) return state;
  const from = state.anchor ? order.indexOf(state.anchor.id) : -1;
  if (!state.anchor || from === -1) return toggleRow(state, id, true);
  const selected = new Set(state.base);
  for (const rowId of order.slice(Math.min(from, to), Math.max(from, to) + 1)) {
    if (state.anchor.on) selected.add(rowId);
    else selected.delete(rowId);
  }
  return { ...state, selected };
}

/**
 * Shift+Down or Shift+Up from `from` to `to`: extends from the anchor, or
 * starts a selecting range at `from` when there's none yet.
 */
export function extendRange(
  state: ListSelection,
  order: readonly string[],
  from: string,
  to: string,
): ListSelection {
  const anchored =
    state.anchor && order.includes(state.anchor.id)
      ? state
      : {
          selected: state.selected,
          anchor: { id: from, on: true },
          base: state.selected,
        };
  return selectRange(anchored, order, to);
}

/** Sets several rows at once (a header checkbox); no anchor after it. */
export function setRows(
  state: ListSelection,
  ids: readonly string[],
  on: boolean,
): ListSelection {
  const selected = new Set(state.selected);
  for (const id of ids) {
    if (on) selected.add(id);
    else selected.delete(id);
  }
  return { selected, anchor: null, base: selected };
}

/** Cmd/Ctrl+A: every row shown (this page of the list, never the next). */
export function selectAll(order: readonly string[]): ListSelection {
  const selected = new Set(order);
  return { selected, anchor: null, base: selected };
}

/**
 * Keeps only rows still shown, after a refresh, a new filter or another page:
 * an action never reaches a row the person can't see.
 */
export function pruneSelection(
  state: ListSelection,
  order: readonly string[],
): ListSelection {
  const shown = new Set(order);
  const keep = (ids: ReadonlySet<string>) =>
    new Set([...ids].filter((id) => shown.has(id)));
  const selected = keep(state.selected);
  const anchor =
    state.anchor && shown.has(state.anchor.id) ? state.anchor : null;
  if (
    selected.size === state.selected.size &&
    anchor === state.anchor &&
    [...state.base].every((id) => shown.has(id))
  ) {
    return state;
  }
  return { selected, anchor, base: keep(state.base) };
}

/** The selected rows in list order (what a bulk action receives). */
export function selectedInOrder(
  state: ListSelection,
  order: readonly string[],
): string[] {
  return order.filter((id) => state.selected.has(id));
}

/**
 * The row J/K or Down/Up moves focus to. From no row (or one that's gone),
 * Down starts at the top and Up at the bottom; the ends don't wrap.
 */
export function stepRow(
  order: readonly string[],
  current: string | null,
  delta: 1 | -1,
): string | null {
  if (order.length === 0) return null;
  const index = current === null ? -1 : order.indexOf(current);
  if (index === -1) return delta > 0 ? order[0] : order[order.length - 1];
  return order[Math.min(order.length - 1, Math.max(0, index + delta))];
}
