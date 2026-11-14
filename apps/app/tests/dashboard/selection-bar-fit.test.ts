// What the floating selection bar shows as buttons and what goes into More
// (app/(app)/dashboard/_lib/selection-bar.ts): everything when it fits,
// otherwise More plus the actions that fit, greatest first, never a lesser
// action while a greater one is in the menu.
import { describe, expect, it } from "vitest";
import { fitActions, sameIds } from "@/app/(app)/dashboard/_lib/selection-bar";

const actions = [
  { id: "move", width: 80, priority: 60 },
  { id: "tags", width: 70, priority: 50 },
  { id: "download", width: 100, priority: 40 },
  { id: "favorite", width: 150, priority: 10 },
  { id: "trash", width: 120, priority: 25 },
];
// The count, Clear and the divider.
const fixed = [90, 32, 9];
const base = { fixed, more: 80, gap: 4, actions };
const sorted = (ids: Set<string>) => [...ids].sort();

describe("fitActions", () => {
  it("shows every action when the whole row fits", () => {
    // 131 + 520, and 7 gaps of 4 between the 8 items: 679
    expect(sorted(fitActions({ ...base, available: 679 }))).toEqual([
      "download",
      "favorite",
      "move",
      "tags",
      "trash",
    ]);
  });

  it("moves the lesser actions into More when one px short", () => {
    // fixed (131 + 8) + More (80 + 4) = 223; then move 84, tags 74, download
    // 104 = 485, trash 124 = 609; favorite would make 763.
    expect(sorted(fitActions({ ...base, available: 678 }))).toEqual([
      "download",
      "move",
      "tags",
      "trash",
    ]);
  });

  it("stops at the first action that doesn't fit, by priority", () => {
    // Room for move (84) and tags (74) after 223, not download (104).
    expect(sorted(fitActions({ ...base, available: 400 }))).toEqual([
      "move",
      "tags",
    ]);
    expect(sorted(fitActions({ ...base, available: 310 }))).toEqual(["move"]);
    // A wide download (204 with its gap) stops at 381: trash (124) would
    // fit in 510 on its own, but never ahead of download.
    const wide = actions.map((action) =>
      action.id === "download" ? { ...action, width: 200 } : action,
    );
    expect(
      sorted(fitActions({ ...base, actions: wide, available: 510 })),
    ).toEqual(["move", "tags"]);
  });

  it("leaves only More when nothing else fits (a phone with a long count)", () => {
    expect(fitActions({ ...base, available: 230 }).size).toBe(0);
  });

  it("keeps the bar's order for equal priorities", () => {
    const even = actions.map((action) => ({ ...action, priority: 0 }));
    expect(
      sorted(fitActions({ ...base, actions: even, available: 400 })),
    ).toEqual(["move", "tags"]);
  });

  it("shows everything before anything is measured", () => {
    expect(fitActions({ ...base, available: 0 }).size).toBe(actions.length);
    expect(
      fitActions({
        available: 0,
        fixed: [0, 0, 0],
        more: 0,
        gap: 0,
        actions: actions.map((action) => ({ ...action, width: 0 })),
      }).size,
    ).toBe(actions.length);
  });

  it("ignores hidden fixed items (the keys button on a phone)", () => {
    expect(
      sorted(fitActions({ ...base, fixed: [...fixed, 0], available: 679 })),
    ).toHaveLength(5);
  });
});

describe("sameIds", () => {
  it("compares as sets", () => {
    expect(sameIds(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameIds(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    expect(sameIds(new Set(["a", "c"]), new Set(["a", "b"]))).toBe(false);
  });
});
