// Run: cd apps/docs && npx tsx --test components/sections/tools/tools.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFilenameAllocator,
  dataUrlToBytes,
  guessFilenameColumn,
  guessValueColumn,
  MAX_BULK_ROWS,
  sanitizeFilename,
  toTable,
} from "./bulk-utils";
import { toPayload } from "./payload";

describe("toPayload", () => {
  it("terminates Wi-Fi records with ;; and escapes special characters", () => {
    assert.equal(
      toPayload("wifi", {
        type: "wifi",
        ssid: "Cafe Guest",
        password: "latte;art",
        encryption: "WPA",
        hidden: false,
      }),
      "WIFI:T:WPA;S:Cafe Guest;P:latte\\;art;H:false;;",
    );
    assert.equal(
      toPayload("wifi", {
        type: "wifi",
        ssid: "Open",
        password: "",
        encryption: "nopass",
      }),
      "WIFI:T:nopass;S:Open;;",
    );
  });

  it("writes EIP-681 values in wei and leaves exponents alone", () => {
    const address = "0xfb6916095ca1df60bb79Ce92ce3ea74c37c5d359";
    assert.equal(
      toPayload("ethereum", {
        type: "ethereum",
        address,
        amount: "0.05",
        gas: "21000",
      }),
      `ethereum:${address}?value=0.05e18&gas=21000`,
    );
    assert.equal(
      toPayload("ethereum", { type: "ethereum", address, amount: "2.014e18" }),
      `ethereum:${address}?value=2.014e18`,
    );
    assert.equal(
      toPayload("ethereum", { type: "ethereum", address }),
      `ethereum:${address}`,
    );
  });

  it("removes spaces from Google Maps coordinates", () => {
    assert.equal(
      toPayload("maps", { type: "maps", location: "48.8584, 2.2945" }),
      "https://www.google.com/maps?q=48.8584,2.2945",
    );
    assert.equal(
      toPayload("maps", { type: "maps", location: "Eiffel Tower, Paris" }),
      "https://www.google.com/maps/search/?api=1&query=Eiffel%20Tower%2C%20Paris",
    );
  });

  it("returns nothing for a missing or mismatched config", () => {
    assert.equal(toPayload("wifi", undefined), "");
    assert.equal(toPayload("wifi", { type: "text", text: "hi" }), "");
  });
});

describe("bulk helpers", () => {
  it("builds a table with header names and a row cap", () => {
    const rows = [
      ["url", "name"],
      ...Array.from({ length: MAX_BULK_ROWS + 1 }, (_, i) => [
        `https://e.com/${i}`,
        `n${i}`,
      ]),
    ];
    const table = toTable(rows, true);
    assert.deepEqual(table.columns, ["url", "name"]);
    assert.equal(table.rows.length, MAX_BULK_ROWS);
    assert.equal(table.truncated, true);
    assert.deepEqual(toTable([["a"], ["b", "c"]], false).columns, [
      "Column 1",
      "Column 2",
    ]);
  });

  it("guesses value and file name columns", () => {
    const columns = ["sku", "link"];
    assert.equal(guessValueColumn(columns), 1);
    assert.equal(guessFilenameColumn(columns, 1), 0);
    assert.equal(guessFilenameColumn(["x", "y"], 0), -1);
  });

  it("sanitizes and de-duplicates file names", () => {
    assert.equal(
      sanitizeFilename('  ../menu: "table" 1?  '),
      "menu- -table- 1-",
    );
    assert.equal(sanitizeFilename("..."), "");
    const allocate = createFilenameAllocator();
    assert.equal(allocate("menu", "png"), "menu.png");
    assert.equal(allocate("Menu", "png"), "Menu-2.png");
    assert.equal(allocate("menu-2", "png"), "menu-2-2.png");
    assert.equal(allocate("menu", "png"), "menu-3.png");
  });

  it("decodes base64 and URI-encoded data URLs", () => {
    assert.deepEqual(
      Array.from(dataUrlToBytes("data:image/png;base64,AQID")),
      [1, 2, 3],
    );
    assert.equal(
      new TextDecoder().decode(
        dataUrlToBytes("data:image/svg+xml,%3Csvg%2F%3E"),
      ),
      "<svg/>",
    );
  });
});
