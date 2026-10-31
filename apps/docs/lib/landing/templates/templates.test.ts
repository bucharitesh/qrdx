// Run: cd apps/docs && npx tsx --test lib/landing/templates/templates.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listBlocks, parseLandingPageContent } from "@/lib/landing/blocks";
import {
  buildTemplateContent,
  getTemplate,
  getTemplateVariant,
  listTemplates,
  mergeTheme,
  registerTemplate,
} from "@/lib/landing/templates";
import { DEFAULT_LANDING_THEME } from "@/types/landing";

const CORE_TYPES = ["links", "business", "vcard", "custom"];

describe("landing page templates", () => {
  it("registers the core page types", () => {
    const types = listTemplates().map((template) => template.type);
    for (const type of CORE_TYPES) assert.ok(types.includes(type), type);
    assert.equal(types.at(-1), "custom", "custom page sorts last");
  });

  it("offers at least 10 core variants", () => {
    const count = CORE_TYPES.reduce(
      (total, type) => total + (getTemplate(type)?.variants.length ?? 0),
      0,
    );
    assert.ok(count >= 10, `${count} variants`);
  });

  it("builds valid content for every variant of every type", () => {
    for (const template of listTemplates()) {
      for (const variant of template.variants) {
        const content = buildTemplateContent(template.type, variant.id);
        const reparsed = parseLandingPageContent(
          JSON.parse(JSON.stringify(content)),
        );
        assert.ok(
          reparsed.success,
          `${template.type}/${variant.id}: ${reparsed.success ? "" : reparsed.error.issues[0]?.message}`,
        );
        assert.equal(content.blocks.length, variant.blocks.length);
        assert.equal(
          new Set(content.blocks.map((block) => block.id)).size,
          content.blocks.length,
        );
      }
    }
  });

  it("uses the first variant by default and rejects unknown ones", () => {
    assert.equal(getTemplateVariant("vcard")?.id, "classic");
    assert.throws(() => buildTemplateContent("vcard", "nope"));
    assert.throws(() => buildTemplateContent("nope"));
  });

  it("merges theme overrides over the default theme", () => {
    const theme = mergeTheme({ colors: { primary: "#ff0000" }, radius: 4 });
    assert.equal(theme.colors.primary, "#ff0000");
    assert.equal(
      theme.colors.background,
      DEFAULT_LANDING_THEME.colors.background,
    );
    assert.equal(theme.radius, 4);
    assert.equal(theme.font, DEFAULT_LANDING_THEME.font);
  });

  it("validates registrations", () => {
    const icon = () => null;
    assert.throws(() =>
      registerTemplate({
        type: "Bad Type",
        label: "x",
        description: "x",
        icon,
        variants: [{ id: "a", name: "A", blocks: [] }],
      }),
    );
    assert.throws(() =>
      registerTemplate({
        type: "dupe-test",
        label: "x",
        description: "x",
        icon,
        variants: [
          { id: "a", name: "A", blocks: [] },
          { id: "a", name: "B", blocks: [] },
        ],
      }),
    );
  });

  it("registers every core block with schema-valid defaults", () => {
    const types = listBlocks().map((block) => block.type);
    for (const type of [
      "header",
      "text",
      "button",
      "links",
      "socials",
      "image",
      "divider",
      "contact",
      "address-map",
      "hours",
      "video-embed",
      "spacer",
      "page-settings",
    ]) {
      assert.ok(types.includes(type), type);
    }
    for (const block of listBlocks()) {
      assert.ok(block.schema.safeParse(block.defaults).success, block.type);
    }
  });
});
