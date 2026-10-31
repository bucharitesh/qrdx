// Run: cd apps/docs && npx tsx --test lib/seo-content/seo-content.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QR_TYPE_SLUGS } from "../qr-types-content";
import { industries, PAGE_TYPES, placements, type SeoTopic } from "./index";
import { sizingRows } from "./sizing";

const collections = [industries, placements];
const all = collections.flatMap((collection) => collection.items);

/** The copy that is specific to one page (the template adds the rest). */
function topicText(topic: SeoTopic): string[] {
  return [
    ...topic.intro,
    ...topic.useCases.flatMap((u) => [u.title, u.description]),
    ...topic.recommended.flatMap((r) =>
      r.kind === "dynamic" ? [r.label, r.why] : [r.why],
    ),
    ...topic.tips,
    ...topic.ctas,
    ...topic.faqs.flatMap((f) => [f.question, f.answer]),
  ];
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => words(s) >= 8);
}

describe("seo content collections", () => {
  it("has about 30 industries and 30 placements with unique slugs", () => {
    assert.equal(industries.items.length, 30);
    assert.equal(placements.items.length, 30);
    for (const collection of collections) {
      const slugs = collection.items.map((t) => t.slug);
      assert.equal(new Set(slugs).size, slugs.length, collection.id);
      for (const slug of slugs) {
        assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, slug);
      }
    }
  });

  it("gives every page at least 300 words of its own copy", () => {
    for (const topic of all) {
      const count = words(topicText(topic).join(" "));
      assert.ok(count >= 300, `${topic.slug}: ${count} words`);
    }
  });

  it("has complete sections", () => {
    for (const topic of all) {
      assert.ok(topic.useCases.length >= 4, `${topic.slug} use cases`);
      assert.ok(topic.recommended.length >= 3, `${topic.slug} recommended`);
      assert.ok(topic.tips.length >= 4, `${topic.slug} tips`);
      assert.ok(topic.ctas.length >= 3, `${topic.slug} ctas`);
      assert.ok(topic.faqs.length >= 3, `${topic.slug} faqs`);
      assert.ok(topic.distances.length >= 1, `${topic.slug} distances`);
      const meters = topic.distances.map((d) => d.meters);
      assert.deepEqual(
        meters,
        [...meters].sort((a, b) => a - b),
        `${topic.slug} distances ascending`,
      );
    }
  });

  it("keeps titles and descriptions unique and within search snippet lengths", () => {
    for (const key of ["title", "seoTitle", "metaDescription"] as const) {
      const values = all.map((t) => t[key]);
      assert.equal(new Set(values).size, values.length, `unique ${key}`);
    }
    for (const topic of all) {
      // Root layout appends " | QRdx".
      assert.ok(
        topic.seoTitle.length <= 55,
        `${topic.slug} seoTitle ${topic.seoTitle.length}`,
      );
      const length = topic.metaDescription.length;
      assert.ok(
        length >= 110 && length <= 165,
        `${topic.slug} metaDescription ${length}`,
      );
    }
  });

  it("never repeats a long sentence across pages", () => {
    const seen = new Map<string, string>();
    for (const topic of all) {
      for (const sentence of topicText(topic).flatMap(sentences)) {
        const other = seen.get(sentence);
        assert.ok(
          !other || other === topic.slug,
          `"${sentence}" in ${topic.slug} and ${other}`,
        );
        seen.set(sentence, topic.slug);
      }
    }
  });

  it("links only to pages and generators that exist", () => {
    const qrTypes = new Set<string>(QR_TYPE_SLUGS);
    for (const [collection, other] of [
      [industries, placements],
      [placements, industries],
    ] as const) {
      for (const topic of collection.items) {
        assert.equal(new Set(topic.related).size, topic.related.length);
        for (const slug of topic.related) {
          assert.ok(
            other.get(slug),
            `${topic.slug} → ${other.basePath}/${slug}`,
          );
        }
        for (const item of topic.recommended) {
          if (item.kind === "static") {
            assert.ok(qrTypes.has(item.type), `${topic.slug} → ${item.type}`);
          }
          if (item.kind === "page") {
            assert.ok(item.page in PAGE_TYPES, `${topic.slug} → ${item.page}`);
          }
        }
      }
    }
  });

  it("is cross-linked from at least one page in the other collection", () => {
    for (const [collection, other] of [
      [industries, placements],
      [placements, industries],
    ] as const) {
      const linked = new Set(other.items.flatMap((t) => t.related));
      for (const topic of collection.items) {
        assert.ok(linked.has(topic.slug), `${topic.slug} has no inbound link`);
      }
    }
  });
});

describe("sizingRows", () => {
  it("matches the print size calculator for a dynamic short link", () => {
    // Version 3 (29 modules) at ECC Q; module = distance / 250.
    const [row2m, row5m] = sizingRows([
      { label: "a", meters: 2 },
      { label: "b", meters: 5 },
    ]);
    assert.equal(row2m.minimum, "23.2 cm (9.1 in)");
    assert.equal(row5m.minimum, "58.0 cm (22.8 in)");
    assert.equal(row2m.distance, "2 m (7 ft)");
  });

  it("formats short distances in centimetres and inches", () => {
    const [row] = sizingRows([{ label: "card", meters: 0.2 }]);
    assert.equal(row.distance, "20 cm (8 in)");
    assert.equal(row.minimum, "2.3 cm (0.9 in)");
  });
});
