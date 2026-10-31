// Run: cd apps/docs && npx tsx --test lib/landing/registry.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  DEFAULT_LANDING_THEME,
  emptyLandingPageContent,
  landingPageContentSchema,
  landingUrlSchema,
} from "@/types/landing";
import {
  createBlock,
  getBlock,
  listBlocks,
  parseLandingPageContent,
  registerBlock,
} from "./registry";

const Nothing = () => null;

registerBlock({
  type: "test-heading",
  category: "content",
  label: "Heading",
  icon: Nothing,
  schema: z.object({
    text: z.string().trim().min(1).max(80),
    level: z.number().int().min(1).max(3).default(2),
  }),
  defaults: { text: "Hello" },
  Render: Nothing,
  Editor: Nothing,
});

registerBlock({
  type: "test-spacer",
  category: "layout",
  label: "Spacer",
  icon: Nothing,
  schema: z.object({ size: z.number().min(0).max(200).default(24) }),
  defaults: {},
  Render: Nothing,
  Editor: Nothing,
});

registerBlock({
  type: "test-link",
  category: "links",
  label: "Link",
  icon: Nothing,
  schema: z.object({ url: landingUrlSchema }),
  defaults: { url: "https://example.com" },
  Render: Nothing,
  Editor: Nothing,
});

const page = (blocks: unknown[]) => ({
  version: 1,
  theme: DEFAULT_LANDING_THEME,
  blocks,
});

describe("registry", () => {
  it("looks blocks up by type and lists them in category order", () => {
    assert.equal(getBlock("test-heading")?.label, "Heading");
    assert.equal(getBlock("missing"), undefined);
    const order = listBlocks().map((block) => block.type);
    assert.ok(order.indexOf("test-heading") < order.indexOf("test-link"));
    assert.ok(order.indexOf("test-link") < order.indexOf("test-spacer"));
  });

  it("rejects invalid type names", () => {
    assert.throws(() =>
      registerBlock({
        type: "Bad Type",
        category: "content",
        label: "Bad",
        icon: Nothing,
        schema: z.object({}),
        defaults: {},
        Render: Nothing,
        Editor: Nothing,
      }),
    );
  });

  it("creates blocks from their parsed defaults", () => {
    const block = createBlock("test-heading", "b1");
    assert.deepEqual(block, {
      id: "b1",
      type: "test-heading",
      props: { text: "Hello", level: 2 },
    });
    assert.match(createBlock("test-spacer").id, /^[0-9a-f-]{36}$/);
    assert.throws(() => createBlock("missing"));
  });
});

describe("parseLandingPageContent", () => {
  it("validates and parses each block's props", () => {
    const result = parseLandingPageContent(
      page([
        { id: "a", type: "test-heading", props: { text: "  Hi  " } },
        { id: "b", type: "test-spacer", props: { size: 8, extra: true } },
      ]),
    );
    assert.ok(result.success);
    assert.deepEqual(
      result.data.blocks.map((block) => block.props),
      [{ text: "Hi", level: 2 }, { size: 8 }],
    );
  });

  it("fails writes with unknown types or invalid props, with paths", () => {
    const result = parseLandingPageContent(
      page([
        { id: "a", type: "test-heading", props: { text: "" } },
        { id: "b", type: "nope", props: {} },
        { id: "c", type: "test-link", props: { url: "javascript:alert(1)" } },
      ]),
    );
    assert.equal(result.success, false);
    const paths = result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join("."));
    assert.deepEqual(paths.sort(), [
      "blocks.0.props.text",
      "blocks.1.type",
      "blocks.2.props.url",
    ]);
  });

  it("drops broken blocks on read instead of failing the page", () => {
    const result = parseLandingPageContent(
      page([
        { id: "a", type: "test-heading", props: { text: "Kept" } },
        { id: "b", type: "nope", props: {} },
        { id: "c", type: "test-heading", props: { text: 42 } },
      ]),
      { mode: "read" },
    );
    assert.ok(result.success);
    assert.deepEqual(
      result.data.blocks.map((block) => block.id),
      ["a"],
    );
  });

  it("checks the envelope: version, duplicate ids, theme colors", () => {
    assert.equal(
      parseLandingPageContent({ ...page([]), version: 2 }).success,
      false,
    );
    assert.equal(
      parseLandingPageContent(
        page([
          { id: "a", type: "test-spacer", props: {} },
          { id: "a", type: "test-spacer", props: {} },
        ]),
      ).success,
      false,
    );
    assert.equal(
      landingPageContentSchema.safeParse({
        ...page([]),
        theme: {
          ...DEFAULT_LANDING_THEME,
          colors: { ...DEFAULT_LANDING_THEME.colors, primary: "blue" },
        },
      }).success,
      false,
    );
    assert.ok(parseLandingPageContent(emptyLandingPageContent()).success);
  });
});

describe("landingUrlSchema", () => {
  it("accepts http(s) only", () => {
    assert.ok(landingUrlSchema.safeParse("https://qrdx.dev/x?y=1").success);
    assert.ok(landingUrlSchema.safeParse("http://example.com").success);
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "ftp://example.com",
      "/relative",
      "not a url",
    ]) {
      assert.equal(landingUrlSchema.safeParse(bad).success, false, bad);
    }
  });
});
