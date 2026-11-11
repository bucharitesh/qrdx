import { describe, expect, it } from "vitest";
import { BULK_KEYS } from "@/app/(app)/dashboard/_lib/list-keys";
import {
  BULK_OWNED,
  ROW_KEYS,
  type RowAction,
  type RowKeyContext,
  type RowKeyEvent,
  resolveRowShortcut,
} from "@/app/(app)/dashboard/codes/_lib/row-shortcuts";

const ALL = Object.keys(ROW_KEYS) as RowAction[];

const press = (key: string, extra: Partial<RowKeyEvent> = {}): RowKeyEvent => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});

const ready: RowKeyContext = {
  enabled: true,
  typing: false,
  overlayOpen: false,
  available: ALL,
};

describe("row shortcuts", () => {
  it("gives each action its own key", () => {
    const keys = Object.values(ROW_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^([a-z]|Backspace)$/);
  });

  it("leaves X to selecting the row, and trashes with Backspace or Delete", () => {
    expect(resolveRowShortcut(press("x"), ready)).toBeNull();
    expect(resolveRowShortcut(press("Backspace"), ready)).toBe("trash");
    expect(resolveRowShortcut(press("Delete"), ready)).toBe("trash");
  });

  it("shares its keys with the selection's, for the same actions", () => {
    // With rows selected these keys act on the selection (list-keys.ts).
    expect(ROW_KEYS.move).toBe(BULK_KEYS.move);
    expect(ROW_KEYS.tags).toBe(BULK_KEYS.tags);
    expect(ROW_KEYS.archive).toBe(BULK_KEYS.archive);
    expect(ROW_KEYS.trash).toBe(BULK_KEYS.trash);
    expect([...BULK_OWNED].sort()).toEqual(
      ["archive", "move", "tags", "trash"].sort(),
    );
  });

  it("maps each key to its action, in either case", () => {
    for (const action of ALL) {
      expect(resolveRowShortcut(press(ROW_KEYS[action]), ready)).toBe(action);
    }
    expect(resolveRowShortcut(press("E"), ready)).toBe("edit");
  });

  it("ignores keys that aren't row keys", () => {
    expect(resolveRowShortcut(press("q"), ready)).toBeNull();
    expect(resolveRowShortcut(press("Enter"), ready)).toBeNull();
  });

  it("stays quiet when switched off, typing, or behind a dialog", () => {
    expect(
      resolveRowShortcut(press("e"), { ...ready, enabled: false }),
    ).toBeNull();
    expect(resolveRowShortcut(press("e"), { ...ready, typing: true })).toBe(
      null,
    );
    expect(
      resolveRowShortcut(press("Backspace"), { ...ready, overlayOpen: true }),
    ).toBeNull();
  });

  it("leaves modified, repeated and composing keys to the browser", () => {
    for (const extra of [
      { metaKey: true },
      { ctrlKey: true },
      { altKey: true },
      { shiftKey: true },
      { repeat: true },
      { isComposing: true },
    ]) {
      expect(resolveRowShortcut(press("d", extra), ready)).toBeNull();
    }
  });

  it("only offers what the row can do", () => {
    const outsideList = { ...ready, available: ["edit", "copy"] as const };
    expect(resolveRowShortcut(press("m"), outsideList)).toBeNull();
    expect(resolveRowShortcut(press("l"), outsideList)).toBe("copy");
    expect(
      resolveRowShortcut(press("Backspace"), { ...ready, available: [] }),
    ).toBeNull();
  });
});
