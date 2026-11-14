"use client";

// What a list loaded as someone scrolled, kept in memory so the Back button
// brings them back to the same list at the same place. The App Router
// remounts a page on Back, which would reset a list to its first page and
// leave the browser's scroll restoration pointing past its end.

/** How long after a popstate a list that mounts counts as part of it. */
const TRAVERSAL_WINDOW_MS = 5000;

let traversedAt = Number.NEGATIVE_INFINITY;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    traversedAt = performance.now();
  });
}

/** Whether the page is being drawn for a Back or Forward. */
export function isHistoryTraversal(): boolean {
  return (
    typeof window !== "undefined" &&
    performance.now() - traversedAt < TRAVERSAL_WINDOW_MS
  );
}

/** A small in-memory store that forgets its oldest entries past `max`. */
export function createMemory<T>(max: number) {
  const entries = new Map<string, T>();
  return {
    get: (key: string): T | undefined => entries.get(key),
    set(key: string, value: T): void {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > max) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}
