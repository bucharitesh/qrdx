// JSON-LD (@repo/design-system/components/seo/json-ld, through
// components/sections/tools/json-ld.tsx, which resolves breadcrumbs against
// the app's own URL).

import {
  breadcrumbSchema as breadcrumbSchemaFor,
  faqSchema,
  JsonLd,
} from "@repo/design-system/components/seo/json-ld";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { breadcrumbSchema } from "@/components/sections/tools/json-ld";
import { baseUrl } from "@/lib/metadata";

const crumbs = [
  { name: "Docs", path: "/docs" },
  { name: "AI agents", path: "/docs/developers/ai-agents" },
];

describe("JSON-LD", () => {
  it("resolves the app's breadcrumbs against its own URL", () => {
    expect(breadcrumbSchema(crumbs)).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: new URL(crumb.path, baseUrl).toString(),
      })),
    });
  });

  it("resolves another app's breadcrumbs against the URL it passes", () => {
    const items = breadcrumbSchemaFor(crumbs, "https://qrdx.dev")
      .itemListElement as { item: string }[];
    expect(items.map((each) => each.item)).toEqual([
      "https://qrdx.dev/docs",
      "https://qrdx.dev/docs/developers/ai-agents",
    ]);
  });

  it("builds an FAQ page", () => {
    expect(faqSchema([{ question: "Free?", answer: "Yes." }])).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Free?",
          acceptedAnswer: { "@type": "Answer", text: "Yes." },
        },
      ],
    });
  });

  it("never lets a value close the script tag", () => {
    const html = renderToStaticMarkup(
      <JsonLd data={{ name: "</script><script>alert(1)</script>" }} />,
    );
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain("\\u003c/script>");
  });
});
