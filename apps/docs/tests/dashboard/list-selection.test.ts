// Range selection for the codes and pages lists (app/dashboard/_lib/
// list-selection.ts): a shift-click covers the rows between the anchor and
// the clicked row in the order the list shows them, shift-clicking again
// extends or shrinks that range, and nothing reaches rows off screen.
import { describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
  extendRange,
  type ListSelection,
  pruneSelection,
  selectAll,
  selectedInOrder,
  selectRange,
  setRows,
  stepRow,
  toggleRow,
} from "@/app/dashboard/_lib/list-selection";

const ids = (state: ListSelection) => [...state.selected].sort();

/** Codes as the server returns them, with what the list sorts and filters on. */
const CODES = [
  { id: "c1", scans: 40, tag: "print" },
  { id: "c2", scans: 5, tag: "web" },
  { id: "c3", scans: 90, tag: "print" },
  { id: "c4", scans: 12, tag: "print" },
  { id: "c5", scans: 70, tag: "web" },
  { id: "c6", scans: 1, tag: "print" },
];
const created = CODES.map((code) => code.id);

describe("a plain click", () => {
  it("toggles one row and makes it the anchor", () => {
    const on = toggleRow(EMPTY_SELECTION, "c2");
    expect(ids(on)).toEqual(["c2"]);
    expect(on.anchor).toEqual({ id: "c2", on: true });
    const off = toggleRow(on, "c2");
    expect(ids(off)).toEqual([]);
    expect(off.anchor).toEqual({ id: "c2", on: false });
  });
});

describe("shift-click ranges", () => {
  it("covers the rows between the anchor and the clicked row, either way", () => {
    const anchored = toggleRow(EMPTY_SELECTION, "c2");
    expect(ids(selectRange(anchored, created, "c5"))).toEqual([
      "c2",
      "c3",
      "c4",
      "c5",
    ]);
    const fromBelow = toggleRow(EMPTY_SELECTION, "c5");
    expect(ids(selectRange(fromBelow, created, "c2"))).toEqual([
      "c2",
      "c3",
      "c4",
      "c5",
    ]);
  });

  it("follows the list's sort, not the order rows were made in", () => {
    // Sorted by scans, most first: c3, c5, c1, c4, c2, c6.
    const byScans = [...CODES]
      .sort((a, b) => b.scans - a.scans)
      .map((code) => code.id);
    expect(byScans).toEqual(["c3", "c5", "c1", "c4", "c2", "c6"]);
    const state = selectRange(toggleRow(EMPTY_SELECTION, "c5"), byScans, "c4");
    expect(selectedInOrder(state, byScans)).toEqual(["c5", "c1", "c4"]);
    // c2 and c3 sit between c5 and c4 by creation, but not on screen.
    expect(state.selected.has("c2")).toBe(false);
    expect(state.selected.has("c3")).toBe(false);
  });

  it("only reaches rows the filter shows", () => {
    const print = CODES.filter((code) => code.tag === "print").map(
      (code) => code.id,
    );
    expect(print).toEqual(["c1", "c3", "c4", "c6"]);
    const state = selectRange(toggleRow(EMPTY_SELECTION, "c1"), print, "c6");
    expect(ids(state)).toEqual(["c1", "c3", "c4", "c6"]);
    expect(state.selected.has("c2")).toBe(false);
    expect(state.selected.has("c5")).toBe(false);
  });

  it("extends and shrinks when shift-clicked again", () => {
    const anchored = toggleRow(EMPTY_SELECTION, "c2");
    const wide = selectRange(anchored, created, "c5");
    expect(ids(wide)).toEqual(["c2", "c3", "c4", "c5"]);
    // Back towards the anchor: the range shrinks.
    const narrow = selectRange(wide, created, "c3");
    expect(ids(narrow)).toEqual(["c2", "c3"]);
    // Further out: it extends again.
    expect(ids(selectRange(narrow, created, "c6"))).toEqual([
      "c2",
      "c3",
      "c4",
      "c5",
      "c6",
    ]);
    // Past the anchor: the range flips to the other side.
    expect(ids(selectRange(narrow, created, "c1"))).toEqual(["c1", "c2"]);
  });

  it("keeps rows picked before the anchor when the range shrinks", () => {
    const picked = toggleRow(EMPTY_SELECTION, "c6");
    const anchored = toggleRow(picked, "c1");
    const wide = selectRange(anchored, created, "c4");
    expect(ids(wide)).toEqual(["c1", "c2", "c3", "c4", "c6"]);
    expect(ids(selectRange(wide, created, "c2"))).toEqual(["c1", "c2", "c6"]);
  });

  it("clears a range from an unchecked anchor", () => {
    const all = selectAll(created);
    const anchored = toggleRow(all, "c2"); // c2 unchecked: ranges clear
    expect(ids(selectRange(anchored, created, "c4"))).toEqual([
      "c1",
      "c5",
      "c6",
    ]);
  });

  it("acts as a click that selects with no anchor on screen", () => {
    expect(ids(selectRange(EMPTY_SELECTION, created, "c3"))).toEqual(["c3"]);
    const gone = toggleRow(EMPTY_SELECTION, "zz");
    const state = selectRange(gone, created, "c3");
    expect(state.anchor).toEqual({ id: "c3", on: true });
    // A row that isn't shown changes nothing.
    expect(selectRange(state, created, "zz")).toBe(state);
  });

  it("starts a new range from the next plain click", () => {
    const first = selectRange(toggleRow(EMPTY_SELECTION, "c1"), created, "c2");
    const second = selectRange(toggleRow(first, "c5"), created, "c6");
    expect(ids(second)).toEqual(["c1", "c2", "c5", "c6"]);
  });
});

describe("from the keyboard", () => {
  it("Shift+Down from an unanchored row starts a selecting range there", () => {
    const state = extendRange(EMPTY_SELECTION, created, "c2", "c3");
    expect(ids(state)).toEqual(["c2", "c3"]);
    expect(ids(extendRange(state, created, "c3", "c4"))).toEqual([
      "c2",
      "c3",
      "c4",
    ]);
    // Shift+Up from there shrinks it back.
    expect(ids(extendRange(state, created, "c3", "c2"))).toEqual(["c2"]);
  });

  it("J/K and Down/Up step through rows without wrapping", () => {
    expect(stepRow(created, null, 1)).toBe("c1");
    expect(stepRow(created, null, -1)).toBe("c6");
    expect(stepRow(created, "c3", 1)).toBe("c4");
    expect(stepRow(created, "c3", -1)).toBe("c2");
    expect(stepRow(created, "c6", 1)).toBe("c6");
    expect(stepRow(created, "c1", -1)).toBe("c1");
    expect(stepRow(created, "gone", 1)).toBe("c1");
    expect(stepRow([], null, 1)).toBeNull();
  });
});

describe("select all, and paging", () => {
  const PAGE_SIZE = 25;
  const everything = Array.from({ length: 60 }, (_, i) => `code_${i + 1}`);
  const page = (n: number) =>
    everything.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE);

  it("selects every row on this page and none on the next", () => {
    const state = selectAll(page(1));
    expect(state.selected.size).toBe(PAGE_SIZE);
    expect(state.selected.has("code_25")).toBe(true);
    expect(state.selected.has("code_26")).toBe(false);
    expect(state.anchor).toBeNull();
  });

  it("drops the selection when the list moves to another page", () => {
    const state = selectRange(
      toggleRow(EMPTY_SELECTION, "code_3"),
      page(1),
      "code_10",
    );
    expect(state.selected.size).toBe(8);
    const next = pruneSelection(state, page(2));
    expect(next.selected.size).toBe(0);
    expect(next.anchor).toBeNull();
    // A range on the new page can't reach back to the old anchor.
    expect(ids(selectRange(next, page(2), "code_30"))).toEqual(["code_30"]);
  });

  it("keeps what's still shown after a refresh, and nothing else", () => {
    const state = selectAll(["a", "b", "c", "d"]);
    // "b" was trashed by a bulk action and left the list.
    const after = pruneSelection(state, ["a", "c", "d"]);
    expect(ids(after)).toEqual(["a", "c", "d"]);
    expect(pruneSelection(after, ["a", "c", "d"])).toBe(after);
  });

  it("a header checkbox sets the page's rows and clears the anchor", () => {
    const anchored = toggleRow(EMPTY_SELECTION, "code_2");
    const all = setRows(anchored, page(1), true);
    expect(all.selected.size).toBe(PAGE_SIZE);
    expect(all.anchor).toBeNull();
    expect(setRows(all, page(1), false).selected.size).toBe(0);
  });

  it("hands bulk actions the selection in list order", () => {
    const state = toggleRow(
      toggleRow(toggleRow(EMPTY_SELECTION, "c5"), "c1"),
      "c3",
    );
    expect(selectedInOrder(state, created)).toEqual(["c1", "c3", "c5"]);
  });
});
