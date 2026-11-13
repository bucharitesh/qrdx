// Run: cd apps/docs && npx tsx --test app/(app)/dashboard/codes/_lib/organize-shared.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFolderTree,
  codesHref,
  type FolderRow,
  flattenFolderTree,
  folderPath,
  folderSubtreeIds,
  parseCodesFilters,
  splitFolderPath,
  splitTagNames,
  subtreeHeight,
  tagColor,
} from "./organize-shared";

const row = (
  id: string,
  parentId: string | null,
  name = id,
  position = 0,
): FolderRow => ({ id, name, parentId, position, codeCount: 0 });

describe("folder tree", () => {
  const rows = [
    row("b", null, "Beta", 1),
    row("a", null, "Alpha", 1),
    row("a1", "a", "One"),
    row("a1x", "a1", "Deep"),
    row("orphan", "missing", "Orphan", 5),
  ];

  it("nests, sorts by position then name and lifts orphans to the top", () => {
    const tree = buildFolderTree(rows);
    assert.deepEqual(
      tree.map((node) => node.id),
      ["a", "b", "orphan"],
    );
    assert.equal(tree[0]?.children[0]?.id, "a1");
    assert.equal(tree[0]?.children[0]?.children[0]?.depth, 2);
    assert.deepEqual(
      flattenFolderTree(tree).map((node) => node.id),
      ["a", "a1", "a1x", "b", "orphan"],
    );
  });

  it("never loops on cycles", () => {
    const cyclic = [row("x", "y"), row("y", "x")];
    const tree = buildFolderTree(cyclic);
    assert.deepEqual(tree.map((node) => node.id).sort(), ["x", "y"]);
    assert.deepEqual(
      folderPath(cyclic, "x").map((node) => node.id),
      ["y", "x"],
    );
  });

  it("finds subtrees, paths and heights", () => {
    assert.deepEqual([...folderSubtreeIds(rows, "a")].sort(), [
      "a",
      "a1",
      "a1x",
    ]);
    assert.deepEqual(
      folderPath(rows, "a1x").map((node) => node.name),
      ["Alpha", "One", "Deep"],
    );
    assert.equal(subtreeHeight(rows, "a"), 3);
    assert.equal(subtreeHeight(rows, "b"), 1);
  });
});

describe("names", () => {
  it("splits folder paths and tag cells", () => {
    assert.deepEqual(splitFolderPath(" Marketing /  Spring  2026 / "), [
      "Marketing",
      "Spring 2026",
    ]);
    assert.deepEqual(splitTagNames("print; Print | flyer,, table tent"), [
      "print",
      "flyer",
      "table tent",
    ]);
  });

  it("falls back to gray for unknown colors", () => {
    assert.equal(tagColor("blue"), "blue");
    assert.equal(tagColor("#ff0000"), "gray");
    assert.equal(tagColor(null), "gray");
  });
});

describe("list filters", () => {
  it("parses and sanitizes search params", () => {
    const filters = parseCodesFilters({
      status: "trash",
      q: "  menu ",
      folder: "f_1",
      tags: "t1,t2,t1,bad id",
      fav: "1",
      type: "page",
      domain: "dom_1",
      sort: "scans",
      page: "3",
      size: "50",
    });
    assert.deepEqual(filters, {
      status: "trash",
      q: "menu",
      folder: "f_1",
      tags: ["t1", "t2"],
      favorites: true,
      type: "page",
      domain: "dom_1",
      sort: "scans",
      page: 3,
      size: 50,
    });
    const fallback = parseCodesFilters({
      status: "nope",
      sort: "drop table",
      page: "-1",
      size: "7",
      folder: "../x",
      type: "wifi",
      domain: "../x",
    });
    assert.equal(fallback.size, 25);
    assert.equal(fallback.status, "active");
    assert.equal(fallback.type, null);
    assert.equal(fallback.domain, null);
    assert.equal(fallback.sort, "newest");
    assert.equal(fallback.page, 1);
    assert.equal(fallback.folder, null);
  });

  it("builds hrefs and resets the page on filter changes", () => {
    const filters = parseCodesFilters({ q: "a b", page: "2" });
    assert.equal(
      codesHref("/dashboard/codes", filters),
      "/dashboard/codes?q=a+b",
    );
    assert.equal(
      codesHref("/dashboard/codes", filters, { page: 3 }),
      "/dashboard/codes?q=a+b&page=3",
    );
    assert.equal(
      codesHref("/dashboard/codes", filters, { q: "", tags: ["t1", "t2"] }),
      "/dashboard/codes?tags=t1%2Ct2",
    );
    assert.equal(
      codesHref("/dashboard/codes", parseCodesFilters({})),
      "/dashboard/codes",
    );
  });
});
