// The lists' keyboard (app/dashboard/_lib/list-keys.ts): X, Shift+Space,
// Cmd/Ctrl+A, Esc, J/K and the bulk keys, quiet while typing or behind a
// dialog or menu, and doing nothing for a role that's offered no actions.
import { describe, expect, it } from "vitest";
import {
  BULK_KEYS,
  type BulkAction,
  keyLabel,
  type ListKeyContext,
  type ListKeyEvent,
  offeredBulkActions,
  resolveListKey,
} from "@/app/dashboard/_lib/list-keys";
import { can, WORKSPACE_ROLES } from "@/lib/permissions";

const press = (
  key: string,
  extra: Partial<ListKeyEvent> = {},
): ListKeyEvent => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});

const ALL_ACTIONS = Object.keys(BULK_KEYS) as BulkAction[];

/** Rows selected, the pointer on one, nothing open. */
const ready: ListKeyContext = {
  enabled: true,
  typing: false,
  surfaceOpen: false,
  focus: "outside",
  activeRow: true,
  hasSelection: true,
  selectable: true,
  actions: ALL_ACTIONS,
};

describe("selecting", () => {
  it("X toggles the row under the pointer or holding focus", () => {
    expect(resolveListKey(press("x"), ready)).toEqual({ type: "toggle" });
    expect(resolveListKey(press("X", { shiftKey: true }), ready)).toBeNull();
    expect(
      resolveListKey(press("x"), { ...ready, activeRow: false }),
    ).toBeNull();
  });

  it("Shift+Space ranges to the focused row; Space toggles it", () => {
    for (const focus of ["row", "checkbox"] as const) {
      expect(
        resolveListKey(press(" ", { shiftKey: true }), { ...ready, focus }),
      ).toEqual({ type: "range" });
    }
    expect(resolveListKey(press(" ", { shiftKey: true }), ready)).toBeNull();
    expect(resolveListKey(press(" "), { ...ready, focus: "row" })).toEqual({
      type: "toggle",
    });
    // A focused checkbox (or a button in the row) handles Space itself.
    expect(
      resolveListKey(press(" "), { ...ready, focus: "checkbox" }),
    ).toBeNull();
    expect(
      resolveListKey(press(" "), { ...ready, focus: "inside" }),
    ).toBeNull();
  });

  it("Cmd+A and Ctrl+A select all; Esc clears only a selection", () => {
    expect(resolveListKey(press("a", { metaKey: true }), ready)).toEqual({
      type: "selectAll",
    });
    expect(resolveListKey(press("a", { ctrlKey: true }), ready)).toEqual({
      type: "selectAll",
    });
    expect(
      resolveListKey(press("a", { metaKey: true, shiftKey: true }), ready),
    ).toBeNull();
    expect(resolveListKey(press("Escape"), ready)).toEqual({ type: "clear" });
    // With nothing selected, Esc is left to whatever else listens for it.
    expect(
      resolveListKey(press("Escape"), { ...ready, hasSelection: false }),
    ).toBeNull();
  });
});

describe("moving between rows", () => {
  it("J and K always; the arrows once focus is in the list", () => {
    expect(resolveListKey(press("j"), ready)).toEqual({
      type: "step",
      delta: 1,
      extend: false,
    });
    expect(resolveListKey(press("k"), ready)).toEqual({
      type: "step",
      delta: -1,
      extend: false,
    });
    // Outside the list the arrows still scroll the page.
    expect(resolveListKey(press("ArrowDown"), ready)).toBeNull();
    expect(
      resolveListKey(press("ArrowDown"), { ...ready, focus: "inside" }),
    ).toEqual({ type: "step", delta: 1, extend: false });
    expect(
      resolveListKey(press("ArrowUp"), { ...ready, focus: "row" }),
    ).toEqual({ type: "step", delta: -1, extend: false });
  });

  it("Shift extends the selection, and held keys repeat", () => {
    expect(
      resolveListKey(press("ArrowDown", { shiftKey: true }), {
        ...ready,
        focus: "row",
      }),
    ).toEqual({ type: "step", delta: 1, extend: true });
    expect(resolveListKey(press("J", { shiftKey: true }), ready)).toEqual({
      type: "step",
      delta: 1,
      extend: true,
    });
    expect(resolveListKey(press("j", { repeat: true }), ready)).toEqual({
      type: "step",
      delta: 1,
      extend: false,
    });
    expect(resolveListKey(press("x", { repeat: true }), ready)).toBeNull();
  });
});

describe("bulk keys", () => {
  it("are T, M, A and R, with Backspace or Delete to delete", () => {
    expect(resolveListKey(press("t"), ready)).toEqual({
      type: "bulk",
      action: "tags",
    });
    expect(resolveListKey(press("m"), ready)).toEqual({
      type: "bulk",
      action: "move",
    });
    expect(resolveListKey(press("a"), ready)).toEqual({
      type: "bulk",
      action: "archive",
    });
    expect(resolveListKey(press("Backspace"), ready)).toEqual({
      type: "bulk",
      action: "trash",
    });
    expect(resolveListKey(press("Delete"), ready)).toEqual({
      type: "bulk",
      action: "trash",
    });
    expect(resolveListKey(press("r"), ready)).toEqual({
      type: "bulk",
      action: "restore",
    });
  });

  it("gives every action its own key, none clashing with selecting", () => {
    const keys = Object.values(BULK_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const reserved of ["x", "j", "k", " "]) {
      expect(keys).not.toContain(reserved);
    }
    expect(keyLabel(BULK_KEYS.trash)).toBe("⌫");
    expect(keyLabel(BULK_KEYS.move)).toBe("M");
  });

  it("need a selection, and only run what's offered", () => {
    expect(
      resolveListKey(press("m"), { ...ready, hasSelection: false }),
    ).toBeNull();
    expect(
      resolveListKey(press("Backspace"), { ...ready, actions: ["move"] }),
    ).toBeNull();
    expect(resolveListKey(press("m", { ctrlKey: true }), ready)).toBeNull();
  });
});

describe("staying quiet", () => {
  const keys: [string, Partial<ListKeyEvent>][] = [
    ["x", {}],
    ["j", {}],
    ["a", { metaKey: true }],
    ["Escape", {}],
    ["Backspace", {}],
    [" ", { shiftKey: true }],
  ];

  it("while typing, behind a dialog or menu, or with shortcuts off", () => {
    for (const [key, extra] of keys) {
      const event = press(key, extra);
      const focused = { ...ready, focus: "row" as const };
      expect(resolveListKey(event, focused)).not.toBeNull();
      expect(resolveListKey(event, { ...focused, typing: true })).toBeNull();
      expect(
        resolveListKey(event, { ...focused, surfaceOpen: true }),
      ).toBeNull();
      expect(resolveListKey(event, { ...focused, enabled: false })).toBeNull();
      expect(
        resolveListKey({ ...event, isComposing: true }, focused),
      ).toBeNull();
    }
  });

  it("does nothing for viewers and billing members", () => {
    // offeredBulkActions is what codes-list.tsx and pages-selection.tsx hand
    // the keys; with no content.write it offers nothing, so every bulk key
    // resolves to nothing (no action, so no refusal and no error toast).
    for (const role of WORKSPACE_ROLES) {
      const writes = can(role, "content.write");
      expect(writes, role).toBe(!["viewer", "billing"].includes(role));
      for (const status of ["active", "archived", "trash"] as const) {
        const actions = offeredBulkActions("codes", {
          canWrite: writes,
          status,
        });
        expect(actions.length > 0, `${role} ${status}`).toBe(writes);
        for (const key of ["t", "m", "a", "Backspace", "Delete", "r"]) {
          const result = resolveListKey(press(key), { ...ready, actions });
          if (!writes) expect(result, `${role} ${key}`).toBeNull();
        }
      }
      const pageActions = offeredBulkActions("pages", { canWrite: writes });
      expect(
        resolveListKey(press("Backspace"), { ...ready, actions: pageActions }),
      ).toEqual(writes ? { type: "bulk", action: "trash" } : null);
    }
  });

  it("offers each view's toolbar actions, and none while one runs", () => {
    expect(offeredBulkActions("codes", { canWrite: true })).toEqual([
      "tags",
      "move",
      "archive",
      "trash",
    ]);
    expect(
      offeredBulkActions("codes", { canWrite: true, status: "trash" }),
    ).toEqual(["restore", "trash"]);
    expect(offeredBulkActions("pages", { canWrite: true })).toEqual(["trash"]);
    expect(offeredBulkActions("codes", { canWrite: true, busy: true })).toEqual(
      [],
    );
    // Restore only in the trash, where it's the toolbar's button.
    expect(
      resolveListKey(press("r"), {
        ...ready,
        actions: offeredBulkActions("codes", { canWrite: true }),
      }),
    ).toBeNull();
  });
});
