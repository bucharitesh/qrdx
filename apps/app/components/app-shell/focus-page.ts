/** The app frame's <main> (app-frame.tsx): focusable from script only. */
const PAGE = "main[data-app-scroll]";

/**
 * Moves focus to the page, for when the control that has it is about to go
 * away (the "Get set up" launcher after Dismiss guide). Without this, focus
 * falls back to <body>; from the page, the next Tab starts at its top.
 * Does nothing outside the app frame.
 */
export function focusPage(): void {
  document.querySelector<HTMLElement>(PAGE)?.focus({ preventScroll: true });
}
