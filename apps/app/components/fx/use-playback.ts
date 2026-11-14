"use client";

import { type RefObject, useEffect } from "react";
import { observeVisibility } from "./engine";

/**
 * Pauses the CSS animations inside `ref` while it is off screen or the tab is
 * hidden, by toggling `data-paused` (see backdrops.module.css). Render the
 * element with `data-paused` so nothing runs before this takes over.
 */
export function usePlayback(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let onScreen = false;
    const apply = () => {
      if (onScreen && !document.hidden) delete el.dataset.paused;
      else el.dataset.paused = "";
    };
    const stop = observeVisibility(
      el,
      (visible) => {
        onScreen = visible;
        apply();
      },
      "0px",
    );
    document.addEventListener("visibilitychange", apply);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", apply);
    };
  }, [ref]);
}
