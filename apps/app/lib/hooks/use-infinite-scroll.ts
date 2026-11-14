"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

// IntersectionObserver hooks for long lists: load the next page when the
// end of a list nears the screen (useInfiniteScroll, with the Load more
// button in components/load-more.tsx), and draw something heavy only once
// it nears the screen (useNearViewport).

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

type Callback = (entry: IntersectionObserverEntry) => void;

interface SharedObserver {
  observer: IntersectionObserver;
  callbacks: Map<Element, Callback>;
}

/**
 * Elements watched against the page with the same rootMargin share one
 * observer, so a gallery of hundreds of tiles doesn't make hundreds.
 */
const sharedObservers = new Map<string, SharedObserver>();

/** Calls `callback` with each intersection change of `element`; returns the cleanup. */
export function observeIntersection(
  element: Element,
  rootMargin: string,
  callback: Callback,
): () => void {
  let shared = sharedObservers.get(rootMargin);
  if (!shared) {
    const callbacks = new Map<Element, Callback>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) callbacks.get(entry.target)?.(entry);
      },
      { rootMargin },
    );
    shared = { observer, callbacks };
    sharedObservers.set(rootMargin, shared);
  }
  const { observer, callbacks } = shared;
  callbacks.set(element, callback);
  observer.observe(element);
  return () => {
    callbacks.delete(element);
    observer.unobserve(element);
    if (callbacks.size === 0) {
      observer.disconnect();
      sharedObservers.delete(rootMargin);
    }
  };
}

/**
 * Whether an element has come within `rootMargin` of the screen, for
 * drawing heavy content (a QR code, a chunk of a gallery) only when it's
 * about to be seen. Once true it stays true (`once`, the default). Without
 * IntersectionObserver it's true right away.
 */
export function useNearViewport<T extends Element = HTMLElement>({
  rootMargin = "600px 0px",
  once = true,
  initial = false,
}: {
  rootMargin?: string;
  once?: boolean;
  /** Start as near (content the server already drew) */
  initial?: boolean;
} = {}): [ref: (node: T | null) => void, near: boolean] {
  const [near, setNear] = useState(initial);
  const [node, setNode] = useState<T | null>(null);

  useEffect(() => {
    if (!node || (once && near)) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    return observeIntersection(node, rootMargin, (entry) => {
      if (entry.isIntersecting) setNear(true);
      else if (!once) setNear(false);
    });
  }, [node, rootMargin, once, near]);

  return [setNode, near];
}
