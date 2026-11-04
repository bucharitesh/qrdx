import { describe, expect, it } from "vitest";
import {
  ROW_KEYS,
  type RowAction,
  type RowKeyContext,
  type RowKeyEvent,
  resolveRowShortcut,
} from "@/app/dashboard/codes/_lib/row-shortcuts";

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
    for (const key of keys) expect(key).toMatch(/^[a-z]$/);
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
      resolveRowShortcut(press("x"), { ...ready, overlayOpen: true }),
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
      resolveRowShortcut(press("x"), { ...ready, available: [] }),
    ).toBeNull();
  });
});
