// Run: cd apps/app && npx tsx --test app/(app)/dashboard/codes/_lib/code-kind-shared.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LandingPageContent } from "@/types/landing";
import {
  carryOverContent,
  inactiveOptions,
  listLabels,
  PAGE_SETTINGS_TYPE,
  planCarryOver,
  summarizeCarryOver,
} from "./code-kind-shared";

const theme = (logo?: string) =>
  ({
    colors: {
      background: "#ffffff",
      foreground: "#000000",
      primary: "#000000",
      primaryForeground: "#ffffff",
      muted: "#eeeeee",
      mutedForeground: "#555555",
    },
    font: "system",
    radius: 12,
    background: { type: "solid" },
    ...(logo && { logo: { url: logo } }),
  }) as LandingPageContent["theme"];

const block = (id: string, type: string, props = {}, hidden = false) => ({
  id,
  type,
  props,
  ...(hidden && { hidden: true }),
});

describe("planCarryOver", () => {
  it("pairs blocks of the same type in order and lists the rest", () => {
    assert.deepEqual(
      planCarryOver(
        ["header", "links", "links", "map", PAGE_SETTINGS_TYPE],
        ["header", "text", "links", "contact"],
      ),
      {
        matches: [
          { to: 0, from: 0 },
          { to: 2, from: 1 },
        ],
        left: [2, 3],
      },
    );
  });

  it("never fills one template block twice", () => {
    assert.deepEqual(planCarryOver(["text", "text"], ["text"]), {
      matches: [{ to: 0, from: 0 }],
      left: [1],
    });
  });
});

describe("carryOverContent", () => {
  const from: LandingPageContent = {
    version: 1,
    theme: theme("https://cdn.example/logo.png"),
    blocks: [
      block("a", "header", { title: "Café Luna" }),
      block("b", "links", { items: [{ label: "Menu" }] }, true),
      block("c", "map", { query: "Lisbon" }),
      block("s", PAGE_SETTINGS_TYPE, { description: "Our café" }),
    ],
  };
  const to: LandingPageContent = {
    version: 1,
    theme: theme(),
    blocks: [
      block("n1", "header", { title: "Template title" }),
      block("n2", "text", { body: "Template text" }),
      block("n3", "links", { items: [] }),
      block("n4", PAGE_SETTINGS_TYPE, { description: "" }),
    ],
  };

  it("fills matching blocks, keeps the template's layout and look", () => {
    const result = carryOverContent(from, to);
    assert.deepEqual(
      result.blocks.map((item) => [item.id, item.type, item.props]),
      [
        ["n1", "header", { title: "Café Luna" }],
        ["n2", "text", { body: "Template text" }],
        ["n3", "links", { items: [{ label: "Menu" }] }],
        ["s", PAGE_SETTINGS_TYPE, { description: "Our café" }],
      ],
    );
    // Hidden stays hidden; the logo comes along, colors don't.
    assert.equal(result.blocks[2]?.hidden, true);
    assert.equal(result.theme.logo?.url, "https://cdn.example/logo.png");
    assert.equal(result.theme.colors.muted, "#eeeeee");
  });

  it("copies props, so editing the new page never touches the old one", () => {
    const result = carryOverContent(from, to);
    const copied = result.blocks[0]?.props as { title: string } | undefined;
    if (copied) copied.title = "Changed";
    assert.equal(
      (from.blocks[0]?.props as { title: string } | undefined)?.title,
      "Café Luna",
    );
  });
});

describe("summarizeCarryOver", () => {
  it("names what moves and what stays, in the old page's order", () => {
    assert.deepEqual(
      summarizeCarryOver(
        [
          { type: "links", label: "Links" },
          { type: "header", label: "Header" },
          { type: "map", label: "Map" },
          { type: PAGE_SETTINGS_TYPE, label: "Page settings" },
        ],
        ["header", "links"],
      ),
      { carried: ["Links", "Header"], left: ["Map"] },
    );
  });

  it("lists labels with counts", () => {
    assert.equal(listLabels([]), "");
    assert.equal(listLabels(["Map"]), "Map");
    assert.equal(
      listLabels(["Header", "Links", "Links", "Map"]),
      "Header, Links (2) and Map",
    );
  });
});

describe("inactiveOptions", () => {
  const marketing = {
    routing: {
      rules: [
        { enabled: true, action: { type: "redirect" } },
        { enabled: true, action: { type: "split" } },
      ],
    },
    utm: { source: "qr" },
    pixels: { meta: "123", conversions: true },
  } as never;

  it("names the redirect-only options on a hosted page", () => {
    assert.deepEqual(inactiveOptions("page", marketing), [
      "utm",
      "routing",
      "ab",
      "conversions",
    ]);
  });

  it("names pixels on a website link", () => {
    assert.deepEqual(inactiveOptions("redirect", marketing), ["pixels"]);
  });

  it("is empty when nothing is set up", () => {
    assert.deepEqual(inactiveOptions("page", null), []);
  });
});
