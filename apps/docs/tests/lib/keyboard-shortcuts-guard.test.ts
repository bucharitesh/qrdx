// Page shortcuts (lib/hooks/use-keyboard-shortcuts.tsx) stay quiet while a
// dialog, sheet, popover or menu is open, so a key pressed in the content
// type picker or the code builder never restyles the playground behind it.
// Keys registered for the open dialog (`modal`) still run. The selector is
// checked against real markup in the browser; here, the rule and its parts.
import { describe, expect, it } from "vitest";
import {
  isSurfaceOpen,
  listenerMayRun,
  OPEN_SURFACE_SELECTOR,
} from "@/lib/hooks/use-keyboard-shortcuts";

const nothingOpen = { surface: false, sheet: false };
const dialogOpen = { surface: true, sheet: false };

describe("which shortcuts run", () => {
  it("page keys run only while nothing is open", () => {
    expect(listenerMayRun({}, nothingOpen)).toBe(true);
    expect(listenerMayRun({}, dialogOpen)).toBe(false);
    expect(listenerMayRun({}, { surface: false, sheet: true })).toBe(false);
  });

  it("a key meant for the open dialog runs only while one is open", () => {
    expect(listenerMayRun({ modal: true }, dialogOpen)).toBe(true);
    expect(listenerMayRun({ modal: true }, nothingOpen)).toBe(false);
  });

  it("a switched-off listener never runs", () => {
    expect(listenerMayRun({ enabled: false }, nothingOpen)).toBe(false);
    expect(listenerMayRun({ enabled: false, modal: true }, dialogOpen)).toBe(
      false,
    );
  });
});

describe("what counts as open", () => {
  const parts = OPEN_SURFACE_SELECTOR.split(", ");

  it("dialogs, sheets, drawers, popovers, menus and listboxes", () => {
    expect(parts).toEqual([
      "#modal-backdrop",
      '[role="dialog"][data-state="open"]',
      '[role="alertdialog"][data-state="open"]',
      '[role="menu"][data-state="open"]',
      '[role="listbox"][data-state="open"]',
    ]);
  });

  it("not a tooltip, and not a closed dialog still in the page", () => {
    expect(OPEN_SURFACE_SELECTOR).not.toMatch(/tooltip/);
    expect(OPEN_SURFACE_SELECTOR).not.toMatch(/popper-content-wrapper/);
    for (const part of parts.slice(1)) {
      expect(part).toContain('[data-state="open"]');
    }
  });

  it("asks the document once with the whole selector", () => {
    const asked: string[] = [];
    const root = (found: boolean) => ({
      querySelector: (selector: string) => {
        asked.push(selector);
        return found ? ({} as Element) : null;
      },
    });
    expect(isSurfaceOpen(root(true))).toBe(true);
    expect(isSurfaceOpen(root(false))).toBe(false);
    expect(asked).toEqual([OPEN_SURFACE_SELECTOR, OPEN_SURFACE_SELECTOR]);
  });
});
