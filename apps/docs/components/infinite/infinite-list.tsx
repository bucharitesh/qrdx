"use client";

import { Fragment, type ReactNode, useCallback, useEffect } from "react";
import { LoadMore } from "@/components/load-more";
import { useCursorList } from "@/lib/hooks/use-cursor-list";
import type { CursorPage } from "@/lib/keyset-cursor";
import { withPageParam } from "@/lib/paging";
import { createMemory, isHistoryTraversal } from "./history-restore";

// A list of server-rendered nodes paged by number (`?page=N`) that loads
// its next page as the end of it nears the screen: the server draws the
// first page; later pages come from `loadPage`, usually a server action
// that renders the same cards, so the cards' code never ships to the
// browser. The list state is useCursorList's (the page number is the
// cursor) and its foot is LoadMore, as on the signed-in app's lists.
//
// LoadMore's button is a real link to the next numbered page (`href` with
// ?page=N), so crawlers and visitors without script page through the list
// as before; a click loads the page in place instead. Back to the list
// restores the pages loaded (./history-restore.ts).

/** One item of the list: a stable key (no item shows twice) and its node. */
export interface KeyedNode {
  key: string;
  node: ReactNode;
}

export interface InfinitePage {
  items: KeyedNode[];
  /** The page after this one, or null at the end */
  nextPage: number | null;
}

export interface InfiniteListLabels {
  loadMore: string;
  loading: string;
  /** Shown above the button when a page fails to load */
  failed: string;
}

/** Lists loaded this session, for the Back button. */
const loaded = createMemory<CursorPage<KeyedNode>>(24);

const keyOf = (item: KeyedNode) => item.key;

const cursorOf = (page: number | null) => (page === null ? null : String(page));

export function InfiniteList({
  listKey,
  initialItems,
  nextPage,
  loadPage,
  href,
  pageParam = "page",
  labels,
  className,
  footerClassName,
  rootMargin = "800px 0px",
}: {
  /**
   * Names this list with its filters, sort and search: a new key starts it
   * over, and Back to the same key restores what was loaded.
   */
  listKey: string;
  /** The first page, drawn on the server */
  initialItems: KeyedNode[];
  /** The page after the initial one, or null when there is none */
  nextPage: number | null;
  /** Loads a page of the list (a server action bound to its filters) */
  loadPage: (page: number) => Promise<InfinitePage>;
  /**
   * The list's URL with its filters: the button links to its numbered
   * pages (`?page=N`), which the server renders on their own.
   */
  href?: string;
  /** The search parameter of the numbered pages */
  pageParam?: string;
  labels: InfiniteListLabels;
  /** The list's element (a grid, usually) */
  className?: string;
  /** The row under the list with the button */
  footerClassName?: string;
  rootMargin?: string;
}) {
  const fromServer: CursorPage<KeyedNode> = {
    items: initialItems,
    nextCursor: cursorOf(nextPage),
  };
  const load = useCallback(
    async (cursor: string): Promise<CursorPage<KeyedNode>> => {
      const requested = Number(cursor);
      let page: InfinitePage;
      try {
        page = await loadPage(requested);
      } catch {
        throw new Error(labels.failed);
      }
      return {
        items: page.items,
        // A page that doesn't move forward ends the list.
        nextCursor:
          page.nextPage !== null && page.nextPage > requested
            ? String(page.nextPage)
            : null,
      };
    },
    [loadPage, labels.failed],
  );
  const list = useCursorList({
    // Only read when the list starts (or another filter starts it over).
    first: (isHistoryTraversal() && loaded.get(listKey)) || fromServer,
    resetKey: listKey,
    load,
    keyOf,
    errorMessage: labels.failed,
  });

  // Remember what was loaded past the first page, for the Back button.
  useEffect(() => {
    if (list.items.length > initialItems.length) {
      loaded.set(listKey, { items: list.items, nextCursor: list.cursor });
    }
  }, [listKey, list.items, list.cursor, initialItems.length]);

  const next = list.cursor === null ? null : Number(list.cursor);
  return (
    <>
      <div className={className}>
        {list.items.map((item) => (
          <Fragment key={item.key}>{item.node}</Fragment>
        ))}
      </div>
      <LoadMore
        className={footerClassName}
        count={list.items.length}
        error={list.error}
        hasMore={list.hasMore}
        href={
          href && next !== null
            ? withPageParam(href, next, pageParam)
            : undefined
        }
        labels={{ loadMore: labels.loadMore, loading: labels.loading }}
        loading={list.loading}
        onLoadMore={list.loadMore}
        rootMargin={rootMargin}
      />
    </>
  );
}
