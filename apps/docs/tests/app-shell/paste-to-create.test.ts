import { describe, expect, it } from "vitest";
import {
  describePasteTarget,
  destinationFromPaste,
  hasOpenOverlay,
  type PasteContext,
  pastedDestination,
} from "@/components/app-shell/paste-to-create";
import { SHORT_LINK_BASE } from "@/lib/short-links";

const quiet: Omit<PasteContext, "text"> = {
  target: { typing: false, inOverlay: false },
  overlayOpen: false,
  builderOpen: false,
  defaultPrevented: false,
};

describe("pastedDestination", () => {
  it("takes one web address with an explicit scheme", () => {
    expect(pastedDestination("https://example.com/menu")).toBe(
      "https://example.com/menu",
    );
    expect(pastedDestination("  http://example.com  ")).toBe(
      "http://example.com/",
    );
  });

  it("takes a www. host and adds https://", () => {
    expect(pastedDestination("www.example.com/spring")).toBe(
      "https://www.example.com/spring",
    );
  });

  it("keeps the query and fragment", () => {
    expect(pastedDestination("https://example.com/a?b=1#c")).toBe(
      "https://example.com/a?b=1#c",
    );
  });

  it("leaves words, sentences and file names alone", () => {
    for (const text of [
      "",
      "   ",
      "hello",
      "example.com",
      "menu.pdf",
      "see https://example.com",
      "https://example.com and more",
      "https://a.com\nhttps://b.com",
    ]) {
      expect(pastedDestination(text), text).toBeNull();
    }
    expect(pastedDestination(null)).toBeNull();
    expect(pastedDestination(undefined)).toBeNull();
  });

  it("leaves other schemes alone", () => {
    for (const text of [
      "mailto:hi@example.com",
      "tel:+14155550123",
      "javascript:alert(1)",
      "ftp://example.com/file",
      "WIFI:T:WPA;S:Cafe;P:secret;;",
    ]) {
      expect(pastedDestination(text), text).toBeNull();
    }
  });

  it("refuses what the builder would refuse", () => {
    // A QRdx short link can't be a dynamic code's destination.
    expect(pastedDestination(`${SHORT_LINK_BASE}/q/abc1234`)).toBeNull();
    expect(pastedDestination("https://user:pass@example.com")).toBeNull();
    expect(
      pastedDestination(`https://example.com/${"a".repeat(2100)}`),
    ).toBeNull();
  });
});

describe("destinationFromPaste", () => {
  it("opens for a web address pasted on the page", () => {
    expect(
      destinationFromPaste({ ...quiet, text: "https://example.com" }),
    ).toBe("https://example.com/");
  });

  it("never takes a paste meant for a field", () => {
    expect(
      destinationFromPaste({
        ...quiet,
        text: "https://example.com",
        target: { typing: true, inOverlay: false },
      }),
    ).toBeNull();
  });

  it("never fires inside or behind a dialog", () => {
    const text = "https://example.com";
    expect(
      destinationFromPaste({
        ...quiet,
        text,
        target: { typing: false, inOverlay: true },
      }),
    ).toBeNull();
    expect(destinationFromPaste({ ...quiet, text, overlayOpen: true })).toBe(
      null,
    );
    expect(destinationFromPaste({ ...quiet, text, builderOpen: true })).toBe(
      null,
    );
  });

  it("stays out of a paste something else handled", () => {
    expect(
      destinationFromPaste({
        ...quiet,
        text: "https://example.com",
        defaultPrevented: true,
      }),
    ).toBeNull();
  });
});

/** A stand-in element whose ancestors match the given selectors. */
function element(
  matches: string[],
  isContentEditable = false,
): Parameters<typeof describePasteTarget>[0] {
  return {
    isContentEditable,
    closest: (selector: string) =>
      selector
        .split(",")
        .some((part) => matches.some((match) => part.trim() === match))
        ? ({} as Element)
        : null,
  };
}

describe("describePasteTarget", () => {
  it("sees the body as a quiet place", () => {
    expect(describePasteTarget(null)).toEqual({
      typing: false,
      inOverlay: false,
    });
    expect(describePasteTarget(element([]))).toEqual({
      typing: false,
      inOverlay: false,
    });
  });

  it("sees fields, editors and text roles as typing", () => {
    for (const match of [
      "input",
      "textarea",
      "select",
      '[contenteditable]:not([contenteditable="false"])',
      '[role="textbox"]',
      '[role="combobox"]',
    ]) {
      expect(describePasteTarget(element([match])).typing, match).toBe(true);
    }
    expect(describePasteTarget(element([], true)).typing).toBe(true);
  });

  it("sees dialogs, sheets, popovers and menus as overlays", () => {
    for (const match of [
      '[role="dialog"]',
      '[role="alertdialog"]',
      '[role="menu"]',
      "[data-radix-popper-content-wrapper]",
      "[data-vaul-drawer]",
    ]) {
      expect(describePasteTarget(element([match])).inOverlay, match).toBe(true);
    }
  });
});

describe("hasOpenOverlay", () => {
  const page = (open: { backdrop?: boolean; query?: boolean }) => ({
    getElementById: (id: string) =>
      open.backdrop && id === "modal-backdrop" ? ({} as HTMLElement) : null,
    querySelector: (() =>
      open.query ? ({} as Element) : null) as Document["querySelector"],
  });

  it("is quiet with nothing open", () => {
    expect(hasOpenOverlay(page({}))).toBe(false);
  });

  it("sees the shortcut backdrop and open dialogs", () => {
    expect(hasOpenOverlay(page({ backdrop: true }))).toBe(true);
    expect(hasOpenOverlay(page({ query: true }))).toBe(true);
  });
});
