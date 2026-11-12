// The home FAQ's answers are in the server-rendered HTML while closed, as
// native <details> (a closed Radix accordion panel has no content), and
// match the FAQPage structured data word for word.
import { describe, expect, it } from "vitest";
import { FAQSection } from "@/components/sections/faq-section";
import { renderIntl } from "../support/intl";

const html = renderIntl(<FAQSection />);

/** Text of `html` with tags dropped and entities decoded. */
const text = (fragment: string) =>
  fragment
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .trim();

const schema = JSON.parse(
  html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1] ?? "{}",
) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };

const details = [...html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];

describe("home FAQ (server HTML)", () => {
  it("renders one closed <details> per question, one open at a time", () => {
    expect(details.length).toBe(schema.mainEntity.length);
    expect(details.length).toBeGreaterThan(0);
    for (const [, attributes] of details) {
      expect(attributes).toContain('name="home-faq"');
      // The `open` attribute, not the `open:` class variant
      expect(attributes).not.toMatch(/(^|\s)open(=|\s|$)/);
    }
  });

  it("has every answer in the HTML, matching the structured data", () => {
    details.forEach(([, , body], index) => {
      const entity = schema.mainEntity[index];
      const question = text(
        body?.match(/<summary\b[^>]*>([\s\S]*?)<svg/)?.[1] ?? "",
      );
      const answer = text(body?.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
      expect(question).toBe(entity?.name);
      expect(answer).toBe(entity?.acceptedAnswer.text);
      expect(answer.length).toBeGreaterThan(20);
    });
  });
});
