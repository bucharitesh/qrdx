// The hosted page types added for packaging, listings, tags and payments:
// their blocks' props (product, details, payment, the socials list style),
// how they render on a live page, and the picker entries that offer them.
import { describe, expect, it, vi } from "vitest";
import { LandingRender } from "@/components/landing/render";
import { getBlock, parseLandingPageContent } from "@/lib/landing/blocks";
import { detailLines } from "@/lib/landing/blocks/payment-schema";
import { FILE_PAGE_TYPES } from "@/lib/landing/file-page-types";
import {
  buildTemplateContent,
  getTemplate,
  listTemplates,
} from "@/lib/landing/templates";
import { DEFAULT_LANDING_THEME, type LandingBlock } from "@/types/landing";
import { renderIntl } from "../support/intl";

// next/font only works inside Next's compiler.
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }) => ({
    className: "",
    variable: `font-var${options.variable}`,
    style: { fontFamily: "" },
  });
  return {
    Bricolage_Grotesque: font,
    Cormorant_Garamond: font,
    DM_Sans: font,
    Fraunces: font,
    Instrument_Serif: font,
    Space_Grotesk: font,
  };
});

const NEW_TYPES = [
  "social",
  "product",
  "booking",
  "payment",
  "real-estate",
  "pet",
  "medical",
  "playlist",
];

const parseProps = (type: string, props: unknown) =>
  getBlock(type)?.schema.safeParse(props);

/** Stored content as the page renders it: props parsed (defaults applied). */
function render(blocks: LandingBlock[]): string {
  const parsed = parseLandingPageContent({
    version: 1,
    theme: DEFAULT_LANDING_THEME,
    blocks,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  return renderIntl(
    <LandingRender
      content={parsed.data}
      context={{
        theme: DEFAULT_LANDING_THEME,
        mode: "live",
        pageId: "page_1",
        qrCodeId: "code_1",
      }}
    />,
  );
}

describe("the new page types", () => {
  it("are in the picker, each with its own icon", () => {
    const templates = listTemplates();
    for (const type of NEW_TYPES) {
      expect(getTemplate(type), type).toBeDefined();
    }
    const icons = templates.map((template) => template.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("start from valid sample content", () => {
    for (const type of NEW_TYPES) {
      for (const variant of getTemplate(type)?.variants ?? []) {
        const content = buildTemplateContent(type, variant.id);
        expect(
          parseLandingPageContent(JSON.parse(JSON.stringify(content))).success,
          `${type}/${variant.id}`,
        ).toBe(true);
      }
    }
  });

  it("never start product pages with a GTIN (it would claim a real product)", () => {
    for (const variant of getTemplate("product")?.variants ?? []) {
      const content = buildTemplateContent("product", variant.id);
      for (const block of content.blocks) {
        if (block.type === "product") {
          expect(block.props.gtin, variant.id).toBe("");
        }
      }
    }
  });

  it("show only the sample details each template sets (no block defaults)", () => {
    for (const variant of getTemplate("product")?.variants ?? []) {
      const json = JSON.stringify(buildTemplateContent("product", variant.id));
      // The product block's own defaults (a granola) never leak in.
      expect(json, variant.id).not.toContain("Oats, almonds");
      expect(json, variant.id).not.toContain("1,850 kJ");
    }
  });

  it("set every field a block's defaults would fill with other sample text", () => {
    // A template block is merged over the block's defaults, so a field it
    // leaves out shows the block's own sample ("Example Co.", "About").
    const leaks: string[] = [];
    for (const type of NEW_TYPES) {
      for (const variant of getTemplate(type)?.variants ?? []) {
        for (const block of variant.blocks) {
          const defaults = getBlock(block.type)?.defaults ?? {};
          for (const key of Object.keys(defaults)) {
            if (!(key in (block.props ?? {}))) {
              leaks.push(`${type}/${variant.id} ${block.type}.${key}`);
            }
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it("hide the playlist where file storage is off, like audio", () => {
    expect(FILE_PAGE_TYPES.has("playlist")).toBe(true);
    for (const type of NEW_TYPES.filter((type) => type !== "playlist")) {
      expect(FILE_PAGE_TYPES.has(type), type).toBe(false);
    }
  });
});

describe("the product block", () => {
  it("keeps a valid GTIN without spaces and refuses a wrong check digit", () => {
    const ok = parseProps("product", { gtin: " 4006 3813 3393 1 " });
    expect(ok?.success && ok.data.gtin).toBe("4006381333931");
    const bad = parseProps("product", { gtin: "4006381333932" });
    expect(bad?.success).toBe(false);
    expect(bad?.error?.issues[0]?.message).toMatch(/check digit/);
    expect(parseProps("product", { gtin: "" })?.success).toBe(true);
  });

  it("renders certifications, ingredients, allergens, nutrition and sections", () => {
    const html = render([
      {
        id: "p1",
        type: "product",
        props: {
          gtin: "09506000134352",
          certifications: [{ id: "c1", label: "Certified organic" }],
          ingredients: "Oats, honey.",
          allergens: ["nuts", "milk"],
          allergenNote: "May contain sesame.",
          nutrition: {
            basis: "Per 100 g",
            rows: [
              { id: "n1", name: "Energy", value: "1,850 kJ" },
              { id: "n2", name: "of which sugars", value: "16 g", sub: true },
              { id: "n3", name: "Fibre", value: "" },
            ],
          },
          sections: [{ id: "s1", title: "Care", body: "Keep dry." }],
        },
      },
    ]);
    expect(html).toContain("Certified organic");
    expect(html).toContain("Oats, honey.");
    expect(html).toMatch(/Contains:<\/span> Tree nuts, Milk/);
    expect(html).toContain("May contain sesame.");
    expect(html).toContain("Per 100 g");
    expect(html).toContain("1,850 kJ");
    // Rows without an amount aren't shown.
    expect(html).not.toContain("Fibre");
    expect(html).toMatch(/<details[^>]*>.*Care.*Keep dry\./s);
    expect(html).toContain("GTIN 0950 6000 1343 52");
  });

  it("hides the GTIN when asked and renders nothing when empty", () => {
    const html = render([
      {
        id: "p1",
        type: "product",
        props: {
          gtin: "09506000134352",
          showGtin: false,
          ingredients: "Water.",
        },
      },
    ]);
    expect(html).not.toContain("GTIN");
    expect(
      render([{ id: "p2", type: "product", props: { nutrition: {} } }]),
    ).not.toContain("<section");
  });
});

describe("the details block", () => {
  it("shows labels with values, as rows or tiles", () => {
    const items = [
      { id: "d1", label: "Bedrooms", value: "3" },
      { id: "d2", label: "Parking", value: "" },
    ];
    const rows = render([
      { id: "x1", type: "details", props: { title: "Facts", items } },
    ]);
    expect(rows).toContain("Facts");
    expect(rows).toMatch(/<dt[^>]*>Bedrooms<\/dt><dd[^>]*>3<\/dd>/);
    expect(rows).not.toContain("Parking");
    const tiles = render([
      { id: "x2", type: "details", props: { items, layout: "tiles" } },
    ]);
    // Tiles fill whole rows: threes for three, pairs for six.
    const tileGrid = (count: number) =>
      render([
        {
          id: `t${count}`,
          type: "details",
          props: {
            layout: "tiles",
            items: Array.from({ length: count }, (_, i) => ({
              id: `i${i}`,
              label: `L${i}`,
              value: "1",
            })),
          },
        },
      ]);
    expect(tileGrid(3)).toContain("grid-cols-3");
    expect(tileGrid(6)).toContain("grid-cols-2");
    expect(tiles).toContain("grid-cols-2");
    expect(
      parseProps("details", { items: [{ label: "", value: "x" }] })?.success,
    ).toBe(false);
  });
});

describe("the payment block", () => {
  it("needs a link or details for every method", () => {
    expect(
      parseProps("payment", { methods: [{ type: "paypal" }] })?.success,
    ).toBe(false);
    expect(
      parseProps("payment", {
        methods: [{ type: "paypal", url: "javascript:alert(1)" }],
      })?.success,
    ).toBe(false);
    expect(
      parseProps("payment", {
        methods: [{ type: "bank", details: "IBAN: DE89 3704 0044" }],
      })?.success,
    ).toBe(true);
  });

  it("splits labeled details so only the value is copied", () => {
    expect(
      detailLines("Account name: Lena\nIBAN: DE89 3704\n\nbc1qxyz"),
    ).toEqual([
      { label: "Account name", value: "Lena" },
      { label: "IBAN", value: "DE89 3704" },
      { label: "", value: "bc1qxyz" },
    ]);
    // A link isn't a label.
    expect(detailLines("https://paypal.me/lena")).toEqual([
      { label: "", value: "https://paypal.me/lena" },
    ]);
  });

  it("renders buttons with the page's verb and copyable details", () => {
    const html = render([
      {
        id: "pay",
        type: "payment",
        props: {
          action: "donate",
          methods: [
            { id: "m1", type: "paypal", url: "https://paypal.me/garden" },
            { id: "m2", type: "bank", details: "IBAN: DE89 3704" },
          ],
          note: "Thank you!",
        },
      },
    ]);
    expect(html).toContain("Donate with PayPal");
    expect(html).toContain('href="https://paypal.me/garden"');
    expect(html).toContain("DE89 3704");
    expect(html).toContain('aria-label="Copy IBAN"');
    // Bank details have no link, so no button.
    expect(html).not.toContain("Donate with Bank transfer");
  });
});

describe("the socials list style", () => {
  it("shows each network with its handle", () => {
    const html = render([
      {
        id: "s1",
        type: "socials",
        props: {
          style: "list",
          items: [
            {
              id: "i1",
              network: "instagram",
              url: "https://instagram.com/x",
              handle: "@x.studio",
            },
          ],
        },
      },
    ]);
    expect(html).toContain("Instagram");
    expect(html).toContain("@x.studio");
    expect(html).toContain('href="https://instagram.com/x"');
  });
});
