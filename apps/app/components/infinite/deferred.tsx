"use client";

import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useNearViewport } from "@/lib/hooks/use-infinite-scroll";
import { createMemory } from "./history-restore";

// Server-drawn content that loads when it nears the screen: the server sends
// a light placeholder of the same size in its place, and the content itself
// (cards, previews, rows of a wall) comes from a server action as someone
// scrolls, so the first HTML stays small and the cards' code stays on the
// server. A visible button loads it by hand, and is the way on if loading
// fails. Loaded content is kept for the session, so Back shows it at once.

export interface ChunkLoader {
  /** Content loaded earlier this session, if any */
  cached: (key: string) => ReactNode | undefined;
  /** Loads one chunk (requests made together go as one batch) */
  load: (key: string) => Promise<ReactNode>;
}

/**
 * A loader for one kind of chunk. `loadMany` (usually a server action)
 * receives every key asked for in the same moment, so a tall screen or a
 * jump down the page costs one request, not one per chunk.
 */
export function createChunkLoader(
  loadMany: (keys: string[]) => Promise<Record<string, ReactNode>>,
  { max = 200 }: { max?: number } = {},
): ChunkLoader {
  const memory = createMemory<ReactNode>(max);
  let queue = new Map<
    string,
    { resolve: (node: ReactNode) => void; reject: (error: unknown) => void }[]
  >();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    timer = null;
    const batch = queue;
    queue = new Map();
    const keys = [...batch.keys()];
    try {
      const result = await loadMany(keys);
      for (const key of keys) {
        const waiting = batch.get(key) ?? [];
        if (result && key in result) {
          memory.set(key, result[key]);
          for (const { resolve } of waiting) resolve(result[key]);
        } else {
          const error = new Error(`Nothing came back for "${key}"`);
          for (const { reject } of waiting) reject(error);
        }
      }
    } catch (error) {
      for (const waiting of batch.values()) {
        for (const { reject } of waiting) reject(error);
      }
    }
  };

  return {
    cached: (key) => memory.get(key),
    load: (key) =>
      new Promise<ReactNode>((resolve, reject) => {
        const waiting = queue.get(key) ?? [];
        waiting.push({ resolve, reject });
        queue.set(key, waiting);
        if (timer === null) timer = setTimeout(flush, 0);
      }),
  };
}

export interface DeferredLabels {
  /** The button that loads the content by hand */
  load: string;
  loading: string;
  /** Shown with the button when loading fails */
  failed: string;
}

export type DeferredStatus = "idle" | "loading" | "failed";

/**
 * A chunk that loads once `ref`'s element nears the screen: put the ref on
 * the placeholder (or on its first item, when the placeholder's items sit
 * in a grid the page drew). `content` is the loaded node, `load` loads it
 * by hand (the fallback button).
 */
export function useDeferredChunk<T extends Element = HTMLDivElement>(
  chunkKey: string,
  loader: ChunkLoader,
  { rootMargin = "1000px 0px" }: { rootMargin?: string } = {},
) {
  const [content, setContent] = useState<{ node: ReactNode } | null>(() => {
    const cached = loader.cached(chunkKey);
    return cached === undefined ? null : { node: cached };
  });
  const [status, setStatus] = useState<DeferredStatus>("idle");
  const [ref, near] = useNearViewport<T>({ rootMargin });

  const load = useCallback(() => {
    setStatus("loading");
    loader.load(chunkKey).then(
      (node) => {
        setContent({ node });
        setStatus("idle");
      },
      () => setStatus("failed"),
    );
  }, [chunkKey, loader]);

  useEffect(() => {
    if (near && !content && status === "idle") load();
  }, [near, content, status, load]);

  return { content, status, ref, load };
}

/**
 * The fallback button (and the failure note) over a placeholder. Drawn in
 * the browser only: it needs script to work, and the server's HTML stays
 * smaller (placeholders carry their own links for visits without script).
 */
export function DeferredButton({
  status,
  load,
  labels,
  className,
}: {
  status: DeferredStatus;
  load: () => void;
  labels: DeferredLabels;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-6 z-20 flex flex-col items-center gap-2",
        className,
      )}
    >
      {status === "failed" && (
        <p
          className="bg-background/90 text-muted-foreground rounded-md px-2 py-1 text-sm"
          role="alert"
        >
          {labels.failed}
        </p>
      )}
      <Button
        className="pointer-events-auto rounded-full shadow-xs"
        data-load-more=""
        disabled={status === "loading"}
        onClick={load}
        size="sm"
        type="button"
        variant="outline"
      >
        {status === "loading" ? (
          <>
            <ModuleOrbit aria-hidden />
            {labels.loading}
          </>
        ) : (
          labels.load
        )}
      </Button>
    </div>
  );
}

/**
 * Shows `placeholder` until the content nears the screen, then the loaded
 * content in its place. Give the placeholder the content's size, so nothing
 * moves when it arrives; `className` styles the box around it.
 */
export function Deferred({
  chunkKey,
  loader,
  placeholder,
  labels,
  className,
  rootMargin,
}: {
  chunkKey: string;
  loader: ChunkLoader;
  placeholder: ReactNode;
  labels: DeferredLabels;
  className?: string;
  rootMargin?: string;
}) {
  const { content, status, ref, load } = useDeferredChunk<HTMLDivElement>(
    chunkKey,
    loader,
    { rootMargin },
  );
  if (content) return content.node;
  return (
    <div
      aria-busy={status === "loading" || undefined}
      className={cn("relative", className)}
      data-deferred={chunkKey}
      data-deferred-status={status}
      ref={ref}
    >
      {placeholder}
      <DeferredButton labels={labels} load={load} status={status} />
    </div>
  );
}
