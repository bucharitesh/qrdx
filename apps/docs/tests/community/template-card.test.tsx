// A page template's card and preview render on the server (the card is a
// server component, so the page never goes to the browser): the scrubbed
// page shows, its personal data doesn't.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

import { ItemGrid } from "@/components/community/item-card";
import { scrubPageContent } from "@/lib/community/page-template";
import type { CommunityItemCard } from "@/lib/community/types";
import { createBlock } from "@/lib/landing/blocks";
import { DEFAULT_LANDING_THEME } from "@/types/landing";

describe("page template cards", () => {
  it("draw the scrubbed page, linked to the item page", () => {
    const header = createBlock("header", "h1");
    const text = createBlock("text", "t1");
    const { content } = scrubPageContent({
      version: 1,
      theme: DEFAULT_LANDING_THEME,
      blocks: [
        { ...header, props: { ...header.props, title: "Harbour Café" } },
        {
          ...text,
          props: { ...text.props, body: "Reservations: anna@harbour.cafe" },
        },
      ],
    });
    const card: CommunityItemCard = {
      id: "it_1",
      type: "page-template",
      slug: "harbour-menu-ab12",
      name: "Harbour menu",
      description: null,
      creator: {
        profileId: "pr_1",
        handle: "ana",
        displayName: "Ana",
        avatarUrl: null,
        official: false,
        verified: false,
      },
      isOfficial: false,
      version: 1,
      likeCount: 0,
      saveCount: 0,
      useCount: 2,
      tags: [],
      publishedAt: null,
      preview: {},
      page: { type: "links", content },
    };
    const html = renderToStaticMarkup(ItemGrid({ cards: [card] }));
    expect(html).toContain('href="/community/templates/harbour-menu-ab12"');
    expect(html).toContain("Harbour Café");
    expect(html).toContain("Page template");
    expect(html).toContain("hello@example.com");
    expect(html).not.toContain("anna@harbour.cafe");
  });
});
