// The builder's keys (components/code-builder/shortcuts.ts): ⌘↵ saves from
// any field, single keys open options only outside text fields, Esc closes a
// panel before the builder and asks first when there are unsaved changes.
import { describe, expect, it, test } from "vitest";
import {
  CODE_OPTION_IDS,
  codeOptionsFor,
} from "@/app/dashboard/codes/_lib/code-options";
import {
  escapeAction,
  OPTION_KEYS,
  resolveBuilderShortcut,
  type ShortcutContext,
  type ShortcutEvent,
  submitKeyLabel,
} from "@/components/code-builder/shortcuts";

const context: ShortcutContext = {
  singleKeys: true,
  options: codeOptionsFor("redirect"),
  busy: false,
  formShown: true,
};
const key = (
  value: string,
  extra: Partial<ShortcutEvent> = {},
): ShortcutEvent => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  target: { tagName: "BUTTON" },
  ...extra,
});
const inInput = { target: { tagName: "INPUT" } };

describe("submit", () => {
  it("⌘↵ and Ctrl+↵ submit, even from a text field", () => {
    expect(
      resolveBuilderShortcut(
        key("Enter", { metaKey: true, ...inInput }),
        context,
      ),
    ).toEqual({ type: "submit" });
    expect(
      resolveBuilderShortcut(key("Enter", { ctrlKey: true }), context),
    ).toEqual({ type: "submit" });
  });

  it("works with single-key shortcuts switched off", () => {
    expect(
      resolveBuilderShortcut(key("Enter", { metaKey: true }), {
        ...context,
        singleKeys: false,
      }),
    ).toEqual({ type: "submit" });
  });

  it("does nothing while saving, with a panel open or mid-composition", () => {
    const enter = key("Enter", { metaKey: true });
    expect(
      resolveBuilderShortcut(enter, { ...context, busy: true }),
    ).toBeNull();
    expect(
      resolveBuilderShortcut(enter, { ...context, formShown: false }),
    ).toBeNull();
    expect(
      resolveBuilderShortcut({ ...enter, isComposing: true }, context),
    ).toBeNull();
    // Plain Enter is the form's own business.
    expect(resolveBuilderShortcut(key("Enter"), context)).toBeNull();
  });
});

describe("option keys", () => {
  it("open each option the code offers", () => {
    for (const option of codeOptionsFor("redirect")) {
      expect(resolveBuilderShortcut(key(OPTION_KEYS[option]), context)).toEqual(
        { type: "option", option },
      );
    }
    expect(resolveBuilderShortcut(key("U"), context)).toEqual({
      type: "option",
      option: "utm",
    });
  });

  it("are unique per option", () => {
    const keys = CODE_OPTION_IDS.map((id) => OPTION_KEYS[id]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never fire while typing", () => {
    for (const target of [
      { tagName: "INPUT" },
      { tagName: "textarea" },
      { tagName: "SELECT" },
      { tagName: "DIV", isContentEditable: true },
      { tagName: "DIV", role: "combobox" },
      { tagName: "DIV", role: "option" },
    ]) {
      expect(resolveBuilderShortcut(key("u", { target }), context)).toBeNull();
    }
  });

  it("ignore modifiers, options a code doesn't offer and switched-off shortcuts", () => {
    expect(
      resolveBuilderShortcut(key("u", { metaKey: true }), context),
    ).toBeNull();
    expect(
      resolveBuilderShortcut(key("u", { shiftKey: true }), context),
    ).toBeNull();
    // Pixels belong to hosted pages, not website links.
    expect(resolveBuilderShortcut(key(OPTION_KEYS.pixels), context)).toBeNull();
    expect(
      resolveBuilderShortcut(key("u"), { ...context, singleKeys: false }),
    ).toBeNull();
    expect(
      resolveBuilderShortcut(key("u"), { ...context, formShown: false }),
    ).toBeNull();
  });
});

describe("Esc", () => {
  it("closes an open panel first", () => {
    expect(escapeAction({ panelOpen: true, dirty: true, busy: false })).toBe(
      "close-panel",
    );
  });

  it("asks before closing with unsaved changes, closes otherwise", () => {
    expect(escapeAction({ panelOpen: false, dirty: true, busy: false })).toBe(
      "confirm-close",
    );
    expect(escapeAction({ panelOpen: false, dirty: false, busy: false })).toBe(
      "close",
    );
  });

  it("waits while a save runs", () => {
    expect(escapeAction({ panelOpen: false, dirty: true, busy: true })).toBe(
      "ignore",
    );
  });
});

test("labels the submit key per platform", () => {
  expect(
    submitKeyLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
  ).toBe("⌘↵");
  expect(submitKeyLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
    "Ctrl ↵",
  );
});
