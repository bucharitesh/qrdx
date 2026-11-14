"use client";

import { type ReactNode, Suspense, use } from "react";

/** Never settles, so the browser never renders what waits on it. */
const NEVER = new Promise<never>(() => undefined);

function ServerOnly({ children }: { children: ReactNode }) {
  if (typeof window !== "undefined") use(NEVER);
  return children;
}

/**
 * Markup the server renders and the browser keeps, but never hydrates.
 *
 * On the server, `children` render into the page's HTML, so crawlers and the
 * first paint get the real controls instead of a skeleton. In the browser
 * they suspend for good: React leaves the server's markup where it is and
 * runs none of its effects, until the parent swaps this element for the live
 * component. That suits UI whose live version starts from this browser's
 * saved state (the persisted editor store): hydrating it from the server's
 * defaults would mismatch, and its forms would write those defaults over
 * the saved values when they mount.
 *
 * The snapshot is `inert` (it does nothing until the live version replaces
 * it), so nothing typed into it before then gets lost. Keep the element
 * stable (useMemo) while it's shown: a dehydrated boundary that receives new
 * props or context renders in the browser instead, which shows `fallback`.
 * So does a client-side navigation, which has no server markup to keep.
 */
export function ServerSnapshot({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  return (
    <Suspense fallback={fallback}>
      <ServerOnly>
        <div className="contents" inert>
          {children}
        </div>
      </ServerOnly>
    </Suspense>
  );
}
