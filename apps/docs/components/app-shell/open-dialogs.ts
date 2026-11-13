"use client";

import { useEffect, useState } from "react";

// Dialogs, sheets and alert dialogs on the page (Radix marks open ones
// data-state="open"). A spotlight's own popover carries data-spotlight and
// doesn't count.
const OPEN_DIALOG =
  '[role="dialog"][data-state="open"]:not([data-spotlight]), [role="alertdialog"][data-state="open"]';

/** Whether a dialog or sheet is open, so nothing new opens over it. */
export function anotherDialogOpen(): boolean {
  return document.querySelector(OPEN_DIALOG) !== null;
}

/** anotherDialogOpen(), kept up to date while the page changes. */
export function useDialogOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setOpen(anotherDialogOpen()));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      attributeFilter: ["data-state"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return open;
}
