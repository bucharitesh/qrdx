// Run: cd apps/docs && npx tsx --test app/dashboard/codes/import/_lib/csv.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkImportRow,
  duplicateSlugLines,
  guessMapping,
  type ImportRowInput,
  rowsFromTable,
} from "./csv";

const input = (patch: Partial<ImportRowInput> = {}): ImportRowInput => ({
  line: 2,
  destination: "https://example.com",
  title: "",
  folder: "",
  tags: "",
  slug: "",
  ...patch,
});

describe("guessMapping", () => {
  it("matches common header names", () => {
    assert.deepEqual(
      guessMapping(["Name", "URL", "Tags", "Folder path", "Short code", "x"]),
      { destination: 1, title: 0, folder: 3, tags: 2, slug: 4 },
    );
    assert.deepEqual(guessMapping(["foo"]), {
      destination: -1,
      title: -1,
      folder: -1,
      tags: -1,
      slug: -1,
    });
  });
});

describe("rowsFromTable", () => {
  it("maps cells, numbers lines from the header and skips blank rows", () => {
    const mapping = {
      destination: 0,
      title: 1,
      folder: -1,
      tags: -1,
      slug: -1,
    };
    const rows = rowsFromTable(
      [[" https://a.com ", "A"], ["", "  "], ["https://b.com"]],
      mapping,
    );
    assert.deepEqual(rows, [
      {
        line: 2,
        destination: "https://a.com",
        title: "A",
        folder: "",
        tags: "",
        slug: "",
      },
      {
        line: 4,
        destination: "https://b.com",
        title: "",
        folder: "",
        tags: "",
        slug: "",
      },
    ]);
  });
});

describe("checkImportRow", () => {
  it("accepts a full row and normalizes it", () => {
    const { errors, normalized } = checkImportRow(
      input({
        title: "  Spring   menu ",
        folder: "Restaurant / Menus",
        tags: "print; table tent",
        slug: "Menu001",
      }),
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(normalized, {
      line: 2,
      destinationUrl: "https://example.com",
      title: "Spring menu",
      folderPath: ["Restaurant", "Menus"],
      tagNames: ["print", "table tent"],
      slug: "Menu001",
    });
  });

  it("reports every problem of a row", () => {
    const { errors } = checkImportRow(
      input({
        destination: "javascript:alert(1)",
        title: "x".repeat(101),
        folder: "a/b/c/d/e/f",
        tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(","),
        slug: "too-long-slug",
      }),
    );
    assert.equal(errors.length, 5);
    assert.match(errors[0] ?? "", /http/);
  });

  it("rejects missing, relative and credentialed destinations and reserved slugs", () => {
    assert.match(
      checkImportRow(input({ destination: "" })).errors[0] ?? "",
      /missing/,
    );
    assert.match(
      checkImportRow(input({ destination: "example.com" })).errors[0] ?? "",
      /full URL/,
    );
    assert.match(
      checkImportRow(input({ destination: "https://u:p@example.com" }))
        .errors[0] ?? "",
      /password/,
    );
    assert.match(
      checkImportRow(input({ slug: "Pricing" })).errors[0] ?? "",
      /reserved/,
    );
  });
});

describe("duplicateSlugLines", () => {
  it("flags repeats after the first, case-sensitively", () => {
    assert.deepEqual(
      [
        ...duplicateSlugLines([
          { line: 2, slug: "AAAAAAA" },
          { line: 3, slug: "aaaaaaa" },
          { line: 4, slug: "AAAAAAA" },
          { line: 5, slug: null },
        ]),
      ],
      [4],
    );
  });
});
