"use client";

// Paste a web address anywhere on a dashboard page, outside a text field and
// with no dialog open, and the code builder opens with it as the
// destination. The flow follows Dub's links page (github.com/dubinc/dub,
// AGPL-3.0: apps/web/ui/modals/link-builder/index.tsx); the rules below are
// QRdx's own, and pure, so they're tested without a browser.

import { useEffect, useRef } from "react";
import { useCodeBuilderStore } from "@/components/code-builder/store";
import { checkDestination } from "@/components/code-builder/validation";

/** What the paste landed on, as far as these rules care. */
export interface PasteTarget {
  /** A text field, select, contenteditable or text role, or inside one */
  typing: boolean;
  /** Inside a dialog, sheet, popover, menu or listbox */
  inOverlay: boolean;
}

export interface PasteContext {
  /** The clipboard's plain text */
  text: string | null | undefined;
  target: PasteTarget;
  /** A dialog, sheet or popover is open somewhere on the page */
  overlayOpen: boolean;
  /** The builder itself is already open */
  builderOpen: boolean;
  /** Something else already handled this paste */
  defaultPrevented: boolean;
}

/**
 * The pasted text as a destination, or null. Only one web address with an
 * explicit http(s):// (or a www. host), so pasting a word, a sentence or a
 * file name never opens anything; the builder's own destination check
 * decides the rest (a QRdx short link can't be a destination).
 */
export function pastedDestination(
  text: string | null | undefined,
): string | null {
  const value = text?.trim() ?? "";
  if (!value || /\s/.test(value)) return null;
  if (!/^(?:https?:\/\/|www\.)/i.test(value)) return null;
  const checked = checkDestination(value);
  return checked.ok ? checked.url : null;
}

/** The destination to open the builder with, or null to leave the paste alone. */
export function destinationFromPaste(context: PasteContext): string | null {
  if (
    context.defaultPrevented ||
    context.builderOpen ||
    context.overlayOpen ||
    context.target.typing ||
    context.target.inOverlay
  ) {
    return null;
  }
  return pastedDestination(context.text);
}

const TYPING_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
].join(",");

const OVERLAY_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  "[data-radix-popper-content-wrapper]",
  "[data-vaul-drawer]",
].join(",");

/** Where a paste landed (the focused element, or the body). */
export function describePasteTarget(
  element: (Pick<Element, "closest"> & { isContentEditable?: boolean }) | null,
): PasteTarget {
  if (!element) return { typing: false, inOverlay: false };
  return {
    typing:
      element.isContentEditable === true ||
      element.closest(TYPING_SELECTOR) !== null,
    inOverlay: element.closest(OVERLAY_SELECTOR) !== null,
  };
}

/**
 * An open dialog, sheet or popover anywhere on the page. `#modal-backdrop`
 * is the marker page shortcuts already check (lib/hooks/use-keyboard-shortcuts.tsx).
 */
export function hasOpenOverlay(
  root: Pick<Document, "getElementById" | "querySelector">,
): boolean {
  return (
    root.getElementById("modal-backdrop") !== null ||
    root.querySelector(
      [
        '[role="dialog"][data-state="open"]',
        '[role="alertdialog"][data-state="open"]',
        '[data-vaul-drawer][data-state="open"]',
        "[data-sheet-overlay]",
      ].join(","),
    ) !== null
  );
}

/**
 * Listens for pastes on the page while `enabled`, and calls `onDestination`
 * with a pasted web address that should open the builder.
 */
export function usePasteToCreate(
  onDestination: (url: string) => void,
  enabled: boolean,
): void {
  const callback = useRef(onDestination);
  callback.current = onDestination;

  useEffect(() => {
    if (!enabled) return;
    const onPaste = (event: ClipboardEvent) => {
      const url = destinationFromPaste({
        text: event.clipboardData?.getData("text/plain"),
        target: describePasteTarget(
          event.target instanceof Element ? event.target : null,
        ),
        overlayOpen: hasOpenOverlay(document),
        builderOpen: useCodeBuilderStore.getState().request !== null,
        defaultPrevented: event.defaultPrevented,
      });
      if (!url) return;
      event.preventDefault();
      callback.current(url);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [enabled]);
}
