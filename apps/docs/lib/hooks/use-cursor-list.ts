"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { appendUnique, type CursorPage } from "@/lib/keyset-cursor";

// A list that loads more as you scroll: the server renders (or the caller
// fetches) the first page, then `loadMore` asks `load(cursor)` for the next.
// The state rules are a pure reducer so they're tested without a browser.

export interface CursorListState<T> {
  /** The filter this list is for; a new one starts from its first page */
  key: string;
  items: T[];
  /** Where the next page starts; null after the last page */
  cursor: string | null;
  loading: boolean;
  error: string | null;
  /** Bumped by every reset or replace: answers to older requests are dropped */
  generation: number;
}

export type CursorListAction<T> =
  | { type: "reset"; key: string; first: CursorPage<T> }
  | { type: "start" }
  | {
      type: "loaded";
      generation: number;
      page: CursorPage<T>;
      keyOf: (item: T) => string;
    }
  | { type: "failed"; generation: number; message: string }
  | { type: "replace"; page: CursorPage<T> }
  | { type: "update"; change: (items: T[]) => T[] };

export function initialCursorList<T>(
  key: string,
  first: CursorPage<T>,
): CursorListState<T> {
  return {
    key,
    items: first.items,
    cursor: first.nextCursor,
    loading: false,
    error: null,
    generation: 0,
  };
}

export function cursorListReducer<T>(
  state: CursorListState<T>,
  action: CursorListAction<T>,
): CursorListState<T> {
  switch (action.type) {
    case "reset":
      return {
        ...initialCursorList(action.key, action.first),
        generation: state.generation + 1,
      };
    case "start":
      return state.loading || state.cursor === null
        ? state
        : { ...state, loading: true, error: null };
    case "loaded":
      // A page for a list that has since been reset or replaced.
      if (action.generation !== state.generation) return state;
      return {
        ...state,
        items: appendUnique(state.items, action.page.items, action.keyOf),
        // A page that points back at itself would be asked for forever:
        // take it as the end.
        cursor:
          action.page.nextCursor === state.cursor
            ? null
            : action.page.nextCursor,
        loading: false,
      };
    case "failed":
      if (action.generation !== state.generation) return state;
      return { ...state, loading: false, error: action.message };
    case "replace":
      return {
        ...state,
        items: action.page.items,
        cursor: action.page.nextCursor,
        loading: false,
        error: null,
        generation: state.generation + 1,
      };
    case "update":
      return { ...state, items: action.change(state.items) };
    default:
      return state;
  }
}

export interface CursorList<T> {
  items: T[];
  hasMore: boolean;
  /** Where the next page starts (null after the last page) */
  cursor: string | null;
  loading: boolean;
  /** The last load's error message; loading stops until `loadMore` is called again */
  error: string | null;
  loadMore: () => void;
  /** Puts a fresh list in place (after an upload or delete, say) */
  replace: (page: CursorPage<T>) => void;
  /** Changes the loaded items in place (drop a deleted row) */
  update: (change: (items: T[]) => T[]) => void;
}

/**
 * The rows of a cursor-paged list: the first page, then more on `loadMore`,
 * with no row twice (by `keyOf`). A new `resetKey` (another filter) starts
 * again from the `first` page given with it; a new `first` alone (a server
 * refresh of the same filter) doesn't, so rows loaded further down stay.
 */
export function useCursorList<T>({
  first,
  resetKey = "",
  load,
  keyOf,
  errorMessage,
}: {
  first: CursorPage<T>;
  resetKey?: string;
  load: (cursor: string) => Promise<CursorPage<T>>;
  keyOf: (item: T) => string;
  /** Shown when `load` throws without a message */
  errorMessage: string;
}): CursorList<T> {
  const [state, dispatch] = useReducer(cursorListReducer<T>, undefined, () =>
    initialCursorList(resetKey, first),
  );
  // Another filter: its first page, in this same render (the old filter's
  // rows never show under the new one).
  if (state.key !== resetKey) {
    dispatch({ type: "reset", key: resetKey, first });
  }

  const latest = useRef({ state, load, keyOf, errorMessage });
  useEffect(() => {
    latest.current = { state, load, keyOf, errorMessage };
  });
  // The request in flight, if any: one page at a time.
  const busy = useRef<object | null>(null);

  const loadMore = useCallback(async () => {
    const { state: current, load: fetchPage } = latest.current;
    if (busy.current || current.cursor === null) return;
    const request = {};
    busy.current = request;
    dispatch({ type: "start" });
    const { generation, cursor } = current;
    try {
      const page = await fetchPage(cursor);
      dispatch({
        type: "loaded",
        generation,
        page,
        keyOf: latest.current.keyOf,
      });
    } catch (error) {
      dispatch({
        type: "failed",
        generation,
        message:
          (error instanceof Error && error.message) ||
          latest.current.errorMessage,
      });
    } finally {
      // A replace may have started a newer request since; leave that one be.
      if (busy.current === request) busy.current = null;
    }
  }, []);

  const replace = useCallback((page: CursorPage<T>) => {
    busy.current = null;
    dispatch({ type: "replace", page });
  }, []);
  const update = useCallback(
    (change: (items: T[]) => T[]) => dispatch({ type: "update", change }),
    [],
  );

  return {
    items: state.items,
    hasMore: state.cursor !== null,
    cursor: state.cursor,
    loading: state.loading,
    error: state.error,
    loadMore,
    replace,
    update,
  };
}
