import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LandingRender } from "@/components/landing/render";
import { parseLandingPageContent } from "@/lib/landing/blocks";
import { buildDemoContent, listTemplateDemos } from "@/lib/landing/demo";
import type { LandingTheme } from "@/types/landing";

// Customers' published pages live in the shared database as JSON and must
// render exactly as they did before the template redesign added opt-in theme
// and block options (heading fonts, textures, header layouts, link grids, ...).
// The fixtures were captured from the renderer BEFORE those options existed;
// a page that doesn't use them must produce the very same markup.
//
// Regenerate only for an intended change to existing pages:
//   UPDATE_LANDING_FIXTURES=1 pnpm exec vitest run tests/lib/landing-render-compat.test.tsx

// next/font only works inside Next's compiler; the pages here don't use web fonts.
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

const FIXTURES = join(import.meta.dirname, "fixtures");

/** Blocks as a customer saved them: no keys the redesign introduced. */
const BLOCKS = [
  {
    id: "hdr",
    type: "header",
    props: {
      title: "Lena's Bakery",
      subtitle: "Sourdough, pastries and coffee.\nOpen every morning.",
      avatar: { url: "https://example.com/logo.png", alt: "Logo" },
      avatarShape: "rounded",
      cover: { url: "https://example.com/cover.jpg", alt: "Our shop" },
      align: "center",
    },
  },
  {
    id: "txt",
    type: "text",
    props: {
      heading: "About us",
      body: "Family-run since 1998.",
      card: true,
      size: "lg",
    },
  },
  {
    id: "btn",
    type: "button",
    props: {
      label: "Order ahead",
      url: "https://example.com/order",
      note: "Ready in 10 minutes",
    },
  },
  {
    id: "lnk",
    type: "links",
    props: {
      title: "Find us online",
      style: "outline",
      items: [
        {
          id: "l1",
          label: "Instagram",
          url: "https://instagram.com/lena",
          featured: true,
        },
        {
          id: "l2",
          label: "Gift cards",
          url: "https://example.com/gift",
          description: "Any amount",
          thumbnail: { url: "https://example.com/gift.png", alt: "" },
        },
        { id: "l3", label: "Email us", url: "mailto:hi@example.com" },
      ],
    },
  },
  {
    id: "soc",
    type: "socials",
    props: {
      items: [
        { id: "s1", network: "instagram", url: "https://instagram.com/" },
        { id: "s2", network: "facebook", url: "https://facebook.com/" },
      ],
    },
  },
  {
    id: "soc2",
    type: "socials",
    props: {
      style: "buttons",
      items: [{ id: "s3", network: "youtube", url: "https://youtube.com/" }],
    },
  },
  { id: "div", type: "divider", props: { label: "Menu", style: "dashed" } },
  { id: "div2", type: "divider", props: {} },
  {
    id: "img",
    type: "image",
    props: {
      image: { url: "https://example.com/cake.jpg", alt: "Cake" },
      caption: "Birthday cakes to order",
      aspect: "landscape",
    },
  },
  {
    id: "mnu",
    type: "menu",
    props: {
      currency: "EUR",
      sections: [
        {
          id: "sec1",
          name: "Bread",
          items: [
            {
              id: "i1",
              name: "Country loaf",
              description: "48-hour sourdough",
              price: 6.5,
              diet: ["vegan"],
              allergens: ["gluten"],
              badge: "Bestseller",
            },
            {
              id: "i2",
              name: "Rye",
              price: 5,
              soldOut: true,
              image: { url: "https://example.com/rye.jpg", alt: "Rye" },
            },
          ],
        },
        {
          id: "sec2",
          name: "Coffee",
          items: [{ id: "i3", name: "Flat white", price: 3.8 }],
        },
      ],
      footnote: "Ask about allergens.",
    },
  },
  {
    id: "evt",
    type: "event",
    props: {
      title: "Bread workshop",
      description: "Learn to bake sourdough at home.",
      start: "2099-05-02T10:00",
      end: "2099-05-02T13:00",
      timeZone: "Europe/Berlin",
      venue: "Lena's Bakery",
      address: "Torstrasse 1, Berlin",
      organizer: "Lena",
      cta: { label: "Book a seat", url: "https://example.com/book" },
    },
  },
  {
    id: "con",
    type: "contact",
    props: {
      firstName: "Lena",
      lastName: "Vogel",
      jobTitle: "Owner",
      company: "Lena's Bakery",
      bio: "Baker for 25 years.",
      phones: [
        { id: "p1", type: "mobile", number: "+49 30 1234567", whatsapp: true },
      ],
      emails: [{ id: "e1", type: "work", address: "lena@example.com" }],
      website: "https://example.com",
      address: { street: "Torstrasse 1", city: "Berlin", country: "Germany" },
    },
  },
  { id: "spc", type: "spacer", props: {} },
  {
    id: "hid",
    type: "text",
    hidden: true,
    props: { heading: "Hidden", body: "Never shown" },
  },
];

/** The default theme as pages saved it (a literal: the constant may evolve). */
const SAVED_DEFAULT_THEME: LandingTheme = {
  colors: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    primary: "#155DFC",
    primaryForeground: "#ffffff",
    muted: "#f5f5f5",
    mutedForeground: "#737373",
  },
  font: "system",
  radius: 12,
  background: { type: "solid" },
};

function render(theme: LandingTheme): string {
  const parsed = parseLandingPageContent(
    { version: 1, theme, blocks: BLOCKS },
    { mode: "read" },
  );
  if (!parsed.success) throw parsed.error;
  return renderToStaticMarkup(
    <LandingRender
      content={parsed.data}
      context={{
        theme: parsed.data.theme,
        mode: "live",
        pageId: "page_compat",
        qrCodeId: null,
      }}
    />,
  );
}

/**
 * Icon glyphs are normalised away: brand and UI icons change on their own
 * schedule (they are not page content); every other tag, attribute, class and
 * text node must match.
 */
const withoutIconGlyphs = (html: string) =>
  html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/g, "<svg/>");

/**
 * Image loading hints are normalised away too: which photo loads first
 * (`fetchPriority`, eager vs `loading="lazy"`, `decoding`) is the renderer's
 * call (components/landing/render: the first screen's lead photo) and
 * changes nothing a visitor sees.
 */
const withoutLoadingHints = (html: string) =>
  html.replace(/ (?:loading|fetchPriority|decoding)="[^"]*"/gi, "");

function expectFixture(name: string, rendered: string) {
  const html = withoutIconGlyphs(rendered);
  const path = join(FIXTURES, name);
  if (process.env.UPDATE_LANDING_FIXTURES) {
    writeFileSync(path, `${html}\n`);
    return;
  }
  expect(withoutLoadingHints(html)).toBe(
    withoutLoadingHints(readFileSync(path, "utf8").trimEnd()),
  );
}

describe("published landing pages render as before", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("keeps the markup of a default-theme page", () => {
    expectFixture(
      "landing-default-theme.html",
      render(structuredClone(SAVED_DEFAULT_THEME)),
    );
  });

  it("keeps the markup of a customised theme (gradient, logo, font)", () => {
    expectFixture(
      "landing-custom-theme.html",
      render({
        colors: {
          background: "#0b1020",
          foreground: "#fafafa",
          primary: "#7c9cff",
          primaryForeground: "#0a0a0a",
          muted: "#1a1f2e",
          mutedForeground: "#a3a7b3",
        },
        font: "serif",
        radius: 20,
        background: {
          type: "gradient",
          from: "#0b1020",
          to: "#1d2440",
          angle: 160,
        },
        logo: { url: "https://example.com/logo.svg", alt: "Lena's" },
      }),
    );
  });

  it("keeps the markup of an image background", () => {
    expectFixture(
      "landing-image-theme.html",
      render({
        ...structuredClone(SAVED_DEFAULT_THEME),
        font: "rounded",
        background: {
          type: "image",
          url: "https://example.com/bg.jpg",
          overlay: 0.45,
        },
      }),
    );
  });
});

describe("previews add no headings to the page around them", () => {
  it("draws every heading as a div in thumbnails, and keeps them live", () => {
    const thumb = (content: ReturnType<typeof buildDemoContent>) =>
      renderToStaticMarkup(
        <LandingRender
          content={content}
          context={{
            theme: content.theme,
            mode: "live",
            demo: true,
            thumbnail: true,
            pageId: null,
            qrCodeId: null,
          }}
          fill="container"
        />,
      );
    for (const { template, variant } of listTemplateDemos()) {
      const key = `${template.type}/${variant.id}`;
      const html = thumb(buildDemoContent(template.type, variant.id));
      expect(html, key).not.toMatch(/<h[1-6][\s>]/);
      expect(html, key).not.toContain('fetchPriority="high"');
    }
    expect(render(structuredClone(SAVED_DEFAULT_THEME))).toContain("<h1 ");
  });
});

describe("templates render with the opt-in options", () => {
  it("renders every template demo", () => {
    for (const { template, variant } of listTemplateDemos()) {
      const content = buildDemoContent(template.type, variant.id);
      const html = renderToStaticMarkup(
        <LandingRender
          content={content}
          context={{
            theme: content.theme,
            mode: "live",
            demo: true,
            pageId: null,
            qrCodeId: null,
          }}
        />,
      );
      const key = `${template.type}/${variant.id}`;
      expect(html, key).toContain("data-qrdx-page");
      if (content.theme.headingFont) {
        expect(html, key).toContain("--lp-heading-font");
      }
      if (content.theme.texture) {
        expect(html, key).toContain("data:image/svg+xml");
      }
    }
  });
});
