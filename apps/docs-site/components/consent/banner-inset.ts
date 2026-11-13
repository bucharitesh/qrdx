"use client";

import { useSyncExternalStore } from "react";

// The cookie banner floats over the bottom of the page on a first visit. In
// the editor that is where the left panel's color pickers and side panels
// open, so while the banner shows it publishes how much of the viewport's
// bottom it takes, and those popovers keep that much clear
// (collisionPadding): they open above it, or flip and shrink, instead of
// across it. The banner itself stays where it is.

/** Space kept between a popover and the banner. */
const GAP = 8;

let inset = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by the banner: the pixels it covers from the viewport's bottom. */
export function setConsentBannerInset(next: number) {
  const value = next > 0 ? Math.ceil(next + GAP) : 0;
  if (value === inset) return;
  inset = value;
  for (const listener of listeners) listener();
}

/** Pixels at the viewport's bottom a popover should keep clear (0 when no banner). */
export function useConsentBannerInset(): number {
  return useSyncExternalStore(
    subscribe,
    () => inset,
    () => 0,
  );
}

/** Radix collisionPadding that also keeps clear of the banner. */
export function clearOfBanner(padding: number, bannerInset: number) {
  return {
    top: padding,
    right: padding,
    left: padding,
    bottom: Math.max(padding, bannerInset),
  };
}
