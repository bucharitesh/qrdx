"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * Calls `onLoadMore` when a sentinel element comes near the viewport (or
 * near the edge of `root`, a scrolling container such as a dialog's list).
 * Attach the returned callback ref to an element after the last item.
 *
 * The observer is recreated whenever `enabled` turns true again (after a
 * page arrives), and a new observer reports the sentinel's current state at
 * once: a short page that leaves the sentinel on screen loads the next one
 * straight away, until the list fills the screen or runs out. Pair it with a
 * visible "Load more" button (components/load-more.tsx) for browsers or
 * layouts where the observer never fires.
 */
export function useInfiniteScroll({
  onLoadMore,
  enabled,
  root,
  rootMargin = "400px 0px",
  watch,
}: {
  onLoadMore: () => void;
  /** False while a page loads, after the last page, or after an error */
  enabled: boolean;
  /** The scrolling ancestor; omit for the page itself */
  root?: RefObject<Element | null>;
  /** How far ahead of the sentinel to start loading */
  rootMargin?: string;
  /**
   * Checked again whenever this changes (pass the item count): for lists
   * that grow without a loading state in between, such as one showing more
   * of what it already has.
   */
  watch?: unknown;
}): (node: Element | null) => void {
  const [node, setNode] = useState<Element | null>(null);
  const callback = useRef(onLoadMore);
  useEffect(() => {
    callback.current = onLoadMore;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `watch` is a trigger; a new value re-creates the observer, which reports the sentinel again.
  useEffect(() => {
    if (!(node && enabled) || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current();
      },
      { root: root?.current ?? null, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, enabled, root, rootMargin, watch]);

  return setNode;
}
