// The page template scrub is an allowlist (fail-closed): every string a
// person typed becomes neutral sample text unless they keep that field, in
// every block type, in fields added later, and in QRdx's own templates.
// Kept text still can't carry contact details or repeat what was taken out
// elsewhere on the page. Pure: no database.
import { describe, expect, it, vi } from "vitest";

/** Blocks render nothing in this test. */
function Nothing() {
  return null;
}

import { z } from "zod";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

import { scrubPageContent } from "@/lib/community/page-template";
import {
  createBlock,
  listBlocks,
  parseLandingPageContent,
  registerBlock,
} from "@/lib/landing/blocks";
import { buildTemplateContent, listTemplates } from "@/lib/landing/templates";
import {
  DEFAULT_LANDING_THEME,
  type LandingBlock,
  type LandingPageContent,
} from "@/types/landing";

const page = (blocks: LandingBlock[]): LandingPageContent => ({
  version: 1,
  theme: DEFAULT_LANDING_THEME,
  blocks,
});

/** Strings a person wrote: not ids, enum-like tokens, colours or dates. */
function writtenStrings(
  value: unknown,
  key = "",
  out: string[] = [],
): string[] {
  if (typeof value === "string") {
    const text = value.trim();
    if (
      key !== "id" &&
      text.length >= 6 &&
      !/^[a-z0-9:_-]+$/.test(text) &&
      !/^#[0-9a-f]{3,8}$/i.test(text) &&
      !/^\d{4}-\d{2}-\d{2}/.test(text) &&
      // Time zones are structure (America/Chicago)
      !/^[A-Z][A-Za-z_]+\/[A-Za-z_/]+$/.test(text) &&
      !/^(?:https?|mailto|tel|sms):/.test(text) &&
      // The samples themselves
      ![
        "hello@example.com",
        "+1 555 0100",
        "123 Main Street",
        "Your name",
        "A line about you",
        "Event name",
        "Your job title",
        "Your company",
        "A few words about this.",
        "A short description.",
        "Thank you!",
        "Your question",
      ].includes(text)
    ) {
      out.push(text);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) writtenStrings(item, key, out);
  } else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      writtenStrings(child, childKey, out);
    }
  }
  return out;
}

/** Every string leaf of `props`, as paths. */
function stringPaths(value: unknown, path: string[] = []): string[][] {
  if (typeof value === "string") return [path];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      stringPaths(item, [...path, String(index)]),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      stringPaths(child, [...path, key]),
    );
  }
  return [];
}

function setAt(target: Record<string, unknown>, path: string[], value: string) {
  let node: Record<string, unknown> = target;
  for (const part of path.slice(0, -1)) {
    node = node[part] as Record<string, unknown>;
  }
  node[path.at(-1) as string] = value;
}

describe("the text allowlist", () => {
  it("replaces every text in QRdx's own templates", () => {
    for (const template of listTemplates()) {
      for (const variant of template.variants) {
        const source = buildTemplateContent(template.type, variant.id);
        const { content } = scrubPageContent(source);
        const json = JSON.stringify(content);
        const survivors = [...new Set(writtenStrings(source.blocks))].filter(
          (text) => json.includes(JSON.stringify(text).slice(1, -1)),
        );
        expect(survivors, `${template.type}/${variant.id}`).toEqual([]);
      }
    }
  });

  it("replaces personal text in every text field of every block type", () => {
    let planted = 0;
    for (const definition of listBlocks()) {
      const block = createBlock(definition.type, `b-${definition.type}`);
      const props = structuredClone(block.props) as Record<string, unknown>;
      // Plant a marker wherever the block still validates with one.
      for (const path of stringPaths(props)) {
        if (path.at(-1) === "id") continue;
        const marker = `Ana Ruiz secret ${planted}`;
        const trial = structuredClone(props);
        setAt(trial, path, marker);
        if (definition.schema.safeParse(trial).success) {
          setAt(props, path, marker);
          planted++;
        }
      }
      const { content } = scrubPageContent(page([{ ...block, props }]));
      expect(JSON.stringify(content), definition.type).not.toMatch(
        /Ana Ruiz secret/,
      );
    }
    expect(planted).toBeGreaterThan(30);
  });

  it("replaces a field added to a block later (fail-closed)", () => {
    registerBlock({
      type: "test-new-fields",
      category: "content",
      label: "New fields",
      icon: () => null,
      schema: z.object({
        tagline: z.string().default(""),
        nested: z.object({ motto: z.string().default("") }).prefault({}),
        items: z
          .array(z.object({ id: z.string(), caption2: z.string() }))
          .default([]),
      }),
      defaults: {},
      Render: Nothing,
      Editor: Nothing,
    });
    const { content, fields } = scrubPageContent(
      page([
        {
          id: "n1",
          type: "test-new-fields",
          props: {
            tagline: "Ana's bakery since 1998",
            nested: { motto: "Call Ana any time" },
            items: [{ id: "i1", caption2: "Ana at the counter" }],
          },
        },
      ]),
    );
    expect(JSON.stringify(content)).not.toContain("Ana");
    expect(content.blocks[0]?.props).toMatchObject({
      tagline: "Text",
      nested: { motto: "Text" },
      items: [{ id: "i1", caption2: "Text" }],
    });
    expect(fields.map((field) => field.id)).toEqual([
      "n1:tagline",
      "n1:nested.motto",
      "n1:items.0.caption2",
    ]);
  });
});

describe("keeping your own text", () => {
  const header = () => {
    const block = createBlock("header", "h1");
    return {
      ...block,
      props: {
        ...block.props,
        title: "Harbour Café",
        subtitle: "Mail anna@harbour.cafe",
      },
    };
  };
  const wifi = () => {
    const block = createBlock("wifi", "w1");
    return {
      ...block,
      props: {
        ...block.props,
        ssid: "Harbour Guest",
        password: "sunrise-2026",
        security: "WPA",
        note: "Password: sunrise-2026",
      },
    };
  };

  it("keeps nothing by default, and a field only when asked", () => {
    const content = page([header()]);
    const none = scrubPageContent(content);
    expect(none.content.blocks[0]?.props).toMatchObject({
      title: "Your name",
      subtitle: "A line about you",
    });
    expect(none.fields.map((field) => [field.id, field.original])).toEqual([
      ["h1:title", "Harbour Café"],
      ["h1:subtitle", "Mail anna@harbour.cafe"],
    ]);
    const kept = scrubPageContent(content, { keep: ["h1:title"] });
    expect(kept.content.blocks[0]?.props).toMatchObject({
      title: "Harbour Café",
      subtitle: "A line about you",
    });
    expect(kept.problems).toEqual([]);
    expect(kept.report.kept).toBe(1);
  });

  it("refuses kept text with contact details or a detail taken out elsewhere", () => {
    const content = page([header(), wifi()]);
    const { problems } = scrubPageContent(content, {
      keep: ["h1:subtitle", "w1:note"],
    });
    expect(problems.map((problem) => problem.id)).toEqual([
      "h1:subtitle",
      "w1:note",
    ]);
    expect(problems[0]?.message).toMatch(/email/i);
    expect(problems[1]?.message).toMatch(/repeats a detail/);
    // A Wi-Fi password or email can't be kept: they aren't keepable fields.
    const sensitive = scrubPageContent(content, { keep: ["w1:password"] });
    expect(JSON.stringify(sensitive.content)).not.toContain("sunrise-2026");
  });

  it("refuses kept text with any domain, @handles, short phones and streets", () => {
    for (const text of [
      "Find us at harbour.de",
      "Photos: ana.photography",
      "Follow @harbourcafe",
      "Call 5550132",
      "Visit 12 Harbour Street",
    ]) {
      const block = createBlock("text", "t1");
      const { problems } = scrubPageContent(
        page([{ ...block, props: { ...block.props, body: text } }]),
        { keep: ["t1:body"] },
      );
      expect(problems, text).toHaveLength(1);
    }
  });
});

describe("codes and files", () => {
  it("replaces coupon codes and drops blocks that only worked with their file", () => {
    const coupon = createBlock("coupon", "c1");
    const pdf = createBlock("pdf", "p1");
    const video = createBlock("video-file", "v1");
    const source = parseLandingPageContent(
      page([
        {
          ...coupon,
          props: {
            ...coupon.props,
            headline: "10% off",
            code: "ANA-VIP-77",
            barcode: "ean13",
            barcodeValue: "4006381333931",
          },
        },
        {
          ...pdf,
          props: {
            ...pdf.props,
            source: {
              type: "file",
              fileId: "a1b2c3d4e5f6g7h8i9j0",
              name: "x.pdf",
            },
          },
        },
        { ...video, props: { ...video.props } },
      ]),
      { mode: "write" },
    );
    if (!source.success) throw new Error(JSON.stringify(source.error.issues));
    const { content, report } = scrubPageContent(source.data);
    expect(content.blocks.map((block) => block.type)).toEqual(["coupon"]);
    expect(content.blocks[0]?.props).toMatchObject({
      code: "SAVE10",
      barcodeValue: "",
      barcode: "code128",
    });
    expect(JSON.stringify(content)).not.toMatch(/ANA-VIP-77|4006381333931/);
    expect(report.codes).toBe(2);
  });
});

describe("the page theme", () => {
  it("keeps only the theme fields the schema knows (fail-closed)", () => {
    const theme = {
      ...DEFAULT_LANDING_THEME,
      ownerNote: "Jane Doe, 4B Baker Street",
      colors: { ...DEFAULT_LANDING_THEME.colors, label: "jane@janedoe.de" },
    } as LandingPageContent["theme"];
    const { content } = scrubPageContent({ ...page([]), theme });
    const out = JSON.stringify(content.theme);
    expect(out).not.toMatch(/Jane Doe|Baker Street|janedoe/);
    expect(content.theme.colors).toEqual(DEFAULT_LANDING_THEME.colors);
  });
});

describe("links that only look like the sample", () => {
  it("replaces look-alike hosts and drops paths on the sample host", () => {
    const blocks = listBlocks()
      .filter((d) =>
        JSON.stringify(createBlock(d.type).props).includes('"url"'),
      )
      .slice(0, 1)
      .map((d, i) => {
        const block = createBlock(d.type) as LandingBlock;
        return {
          ...block,
          id: `l${i}`,
          props: { ...block.props, url: "https://example.com.janedoe.de/me" },
        };
      });
    expect(blocks.length).toBe(1);
    const tricky = [
      "https://example.com.janedoe.de/me",
      "https://example.com@janedoe.de/me",
      "https://example.com/jane-doe-4b",
    ];
    for (const url of tricky) {
      const first = blocks[0] as LandingBlock;
      const { content } = scrubPageContent(
        page([{ ...first, props: { ...first.props, url } }]),
      );
      const out = JSON.stringify(content);
      expect(out).not.toMatch(/janedoe|jane-doe/);
    }
  });
});
