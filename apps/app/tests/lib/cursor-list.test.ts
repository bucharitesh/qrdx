// Lists that load more as you scroll (lib/keyset-cursor.ts and the rules
// behind lib/hooks/use-cursor-list.ts): cursors survive a round trip and
// reject anything else, a page knows whether another follows, rows never
// show twice, and a page that answers after the list was reset or replaced
// (another filter, a reload after a delete) is dropped instead of mixed in.
import { describe, expect, it } from "vitest";
import {
  type CursorListState,
  cursorListReducer,
  initialCursorList,
} from "@/lib/hooks/use-cursor-list";
import {
  appendUnique,
  decodeKeyset,
  encodeKeyset,
  toCursorPage,
} from "@/lib/keyset-cursor";

describe("keyset cursors", () => {
  it("round-trips a timestamp and an id", () => {
    const at = new Date("2026-11-13T09:00:00.123Z");
    const cursor = encodeKeyset({ at, id: "cmvwdh3f80000d2cfbvda2bl3" });
    expect(decodeKeyset(cursor)).toEqual({
      at,
      id: "cmvwdh3f80000d2cfbvda2bl3",
    });
  });

  it("rejects anything that isn't a cursor", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "abc",
      ".id",
      "123.",
      "-5.id",
      "1.5.id",
      "123.id with space",
      "123.' or 1=1 --",
      `123.${"x".repeat(200)}`,
      "9007199254740993.id",
    ]) {
      expect(decodeKeyset(bad)).toBeNull();
    }
  });

  it("makes a page from limit + 1 rows", () => {
    const rows = [5, 4, 3].map((n) => ({
      id: `r${n}`,
      at: new Date(n * 1000),
    }));
    const page = toCursorPage(
      rows,
      2,
      (row) => row,
      (row) => row.id,
    );
    expect(page.items).toEqual(["r5", "r4"]);
    expect(decodeKeyset(page.nextCursor)).toEqual({
      at: new Date(4000),
      id: "r4",
    });
    const last = toCursorPage(
      rows.slice(0, 2),
      2,
      (row) => row,
      (row) => row.id,
    );
    expect(last.nextCursor).toBeNull();
    expect(
      toCursorPage(
        [],
        2,
        (row: { id: string; at: Date }) => row,
        (row) => row.id,
      ),
    ).toEqual({ items: [], nextCursor: null });
  });

  it("never adds a row twice", () => {
    const key = (item: { id: string }) => item.id;
    const merged = appendUnique(
      [{ id: "a" }, { id: "b" }],
      [{ id: "b" }, { id: "c" }, { id: "c" }, { id: "d" }],
      key,
    );
    expect(merged.map(key)).toEqual(["a", "b", "c", "d"]);
  });
});

type Item = { id: string };
const key = (item: Item) => item.id;
const items = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (state: CursorListState<Item>) => state.items.map(key);

describe("cursor list state", () => {
  const start = () =>
    initialCursorList<Item>("all", {
      items: items("a", "b"),
      nextCursor: "c1",
    });

  it("loads the next page after the first, once at a time", () => {
    let state = cursorListReducer(start(), { type: "start" });
    expect(state.loading).toBe(true);
    // A second start while loading changes nothing.
    expect(cursorListReducer(state, { type: "start" })).toBe(state);
    state = cursorListReducer(state, {
      type: "loaded",
      generation: 0,
      page: { items: items("b", "c"), nextCursor: null },
      keyOf: key,
    });
    expect(ids(state)).toEqual(["a", "b", "c"]);
    expect(state).toMatchObject({ loading: false, cursor: null });
    // The end: nothing more to start.
    expect(cursorListReducer(state, { type: "start" })).toBe(state);
  });

  it("drops a page that answers after another filter took over", () => {
    let state = cursorListReducer(start(), { type: "start" });
    state = cursorListReducer(state, {
      type: "reset",
      key: "pdf",
      first: { items: items("p1"), nextCursor: null },
    });
    const late = cursorListReducer(state, {
      type: "loaded",
      generation: 0,
      page: { items: items("c"), nextCursor: "c2" },
      keyOf: key,
    });
    expect(late).toBe(state);
    expect(ids(late)).toEqual(["p1"]);
    expect(late.key).toBe("pdf");
  });

  it("drops a page or an error from before a reload", () => {
    let state = cursorListReducer(start(), { type: "start" });
    state = cursorListReducer(state, {
      type: "replace",
      page: { items: items("x", "a", "b"), nextCursor: "c9" },
    });
    expect(state.loading).toBe(false);
    expect(
      cursorListReducer(state, {
        type: "failed",
        generation: 0,
        message: "late",
      }),
    ).toBe(state);
    expect(
      cursorListReducer(state, {
        type: "loaded",
        generation: 0,
        page: { items: items("c"), nextCursor: null },
        keyOf: key,
      }),
    ).toBe(state);
  });

  it("keeps the rows and the cursor after an error, to try again", () => {
    let state = cursorListReducer(start(), { type: "start" });
    state = cursorListReducer(state, {
      type: "failed",
      generation: 0,
      message: "Network error",
    });
    expect(state).toMatchObject({
      loading: false,
      error: "Network error",
      cursor: "c1",
    });
    expect(ids(state)).toEqual(["a", "b"]);
    state = cursorListReducer(state, { type: "start" });
    expect(state).toMatchObject({ loading: true, error: null });
  });

  it("removes a deleted row in place", () => {
    const state = cursorListReducer(start(), {
      type: "update",
      change: (list) => list.filter((item) => item.id !== "a"),
    });
    expect(ids(state)).toEqual(["b"]);
    expect(state.cursor).toBe("c1");
  });

  it("stops when a page points back at itself instead of asking forever", () => {
    let state = cursorListReducer(start(), { type: "start" });
    state = cursorListReducer(state, {
      type: "loaded",
      generation: 0,
      page: { items: items("a", "b"), nextCursor: "c1" },
      keyOf: key,
    });
    expect(state.cursor).toBeNull();
    expect(ids(state)).toEqual(["a", "b"]);
    expect(cursorListReducer(state, { type: "start" })).toBe(state);
  });

  it("an empty list has nothing to load", () => {
    const state = initialCursorList<Item>("all", {
      items: [],
      nextCursor: null,
    });
    expect(cursorListReducer(state, { type: "start" })).toBe(state);
  });
});
