"use client";

import { useCallback, useRef } from "react";

/** The marketing curve and base duration (components/mockups/motion). */
const EASING = "cubic-bezier(.32,.72,0,1)";
const DURATION_MS = 220;

/**
 * The highlight of a segmented control or filter list that slides to the
 * newly picked option, with the Web Animations API (no motion library on
 * marketing pages). Render the pill inside the selected option with
 * `ref={pill}`, and call `capture()` just before the selection changes (in
 * the click or key handler): the new pill then glides and resizes from where
 * the old one was. A change from anywhere else just moves it, as does
 * reduced motion.
 */
export function useSlidingPill<T extends HTMLElement = HTMLSpanElement>() {
  const current = useRef<T | null>(null);
  const from = useRef<DOMRect | null>(null);

  const capture = useCallback(() => {
    from.current = current.current?.getBoundingClientRect() ?? null;
  }, []);

  // The old pill detaches before the new one attaches (same commit).
  const pill = useCallback((node: T | null) => {
    current.current = node;
    const prev = from.current;
    if (!(node && prev)) return;
    from.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const next = node.getBoundingClientRect();
    const dx = prev.left - next.left;
    const dy = prev.top - next.top;
    if (!(dx || dy || prev.width !== next.width)) return;
    node.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px)`,
          width: `${prev.width}px`,
          height: `${prev.height}px`,
        },
        {
          transform: "translate(0, 0)",
          width: `${next.width}px`,
          height: `${next.height}px`,
        },
      ],
      { duration: DURATION_MS, easing: EASING },
    );
  }, []);

  return { pill, capture };
}
