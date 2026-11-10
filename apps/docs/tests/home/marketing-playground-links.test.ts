// Examples on marketing and docs pages open the playground with what they
// show: the home hero's picks, the studio demo's picks, the use-case cards'
// type and look, and every docs catalogue tile. Pages whose own client code
// builds a link pack the style without the validator (to keep the validator
// out of their scripts), so each look is decoded here the way the
// playground decodes it.

import { describe, expect, it } from "vitest";
import { catalogPlaygroundHref } from "@/components/docs/qr-catalog";
import { tilesFor } from "@/components/docs/qr-catalog-tiles";
import {
  EXAMPLES as ART_EXAMPLES,
  artExampleHref,
} from "@/components/sections/ai-art/vector-art-examples";
import {
  ANGLES,
  SHOWN_BODIES,
  SHOWN_EYES,
  SHOWN_FRAMES,
  SWATCHES,
  studioLook,
  studioPlaygroundHref,
} from "@/components/sections/home/demos/studio-demo";
import {
  HERO_FRAMES,
  HERO_STYLES,
  type HeroFrameKey,
  type HeroStyleKey,
  heroLook,
  heroPlaygroundHref,
} from "@/components/sections/home/hero-looks";
import { useCases } from "@/components/sections/home/use-cases-section";
import { showcaseThemeStyles } from "@/lib/landing/showcase-styles";
import { parsePlaygroundParams } from "@/lib/playground-links";
import { decodeStyleParam } from "@/lib/playground-style";
import {
  USE_CASE_CODES,
  type UseCaseArtId,
} from "@/scripts/use-case-art/codes";

const read = (href: string) => {
  const url = new URL(href, "https://qrdx.dev");
  const params = parsePlaygroundParams(url.search, url.hash);
  return { path: url.pathname, params, design: decodeStyleParam(params.style) };
};

describe("home hero: Customize in the playground", () => {
  const combos = (Object.keys(HERO_STYLES) as HeroStyleKey[]).flatMap((style) =>
    (Object.keys(HERO_FRAMES) as HeroFrameKey[]).map(
      (frame) => [style, frame] as const,
    ),
  );

  it.each(combos)("%s with %s carries the look", (style, frame) => {
    const { path, params, design } = read(
      heroPlaygroundHref(style, frame, "https://example.com/menu"),
    );
    expect(path).toBe("/playground");
    expect(design?.styles).toEqual(heroLook(style, frame));
    expect(params).toMatchObject({
      type: "url",
      url: "https://example.com/menu",
    });
  });

  it("puts the typed address after the # and never other text", () => {
    const href = heroPlaygroundHref("rounded", "banner", "https://qrdx.dev");
    expect(new URL(href, "https://qrdx.dev").search).not.toContain("qrdx.dev");
    const text = read(heroPlaygroundHref("dots", "none", "call me at 5"));
    expect(text.params.type).toBe("text");
    expect(text.params.url).toBeUndefined();
    expect(JSON.stringify(text.params)).not.toContain("call me");
    expect(read(heroPlaygroundHref("dots", "none", "  ")).params.type).toBe(
      undefined,
    );
  });
});

describe("home studio demo: its link", () => {
  const start = {
    body: SHOWN_BODIES[0],
    eye: SHOWN_EYES[0],
    swatch: SWATCHES[0],
    angle: "45",
    frameStyle: "banner-bottom",
    frameText: "Scan me",
  } as const;

  const picks = [
    ...SHOWN_BODIES.flatMap((body) =>
      SHOWN_EYES.map((eye) => ({ ...start, body, eye })),
    ),
    ...SWATCHES.flatMap((swatch) =>
      ANGLES.map(({ value: angle }) => ({ ...start, swatch, angle })),
    ),
    ...SHOWN_FRAMES.map((frameStyle) => ({ ...start, frameStyle })),
  ];

  it("opens every pick the studio offers, as drawn", () => {
    for (const pick of picks) {
      const look = studioLook(pick);
      const { path, design } = read(studioPlaygroundHref(look));
      expect(path).toBe("/playground");
      expect(design?.styles, JSON.stringify(pick)).toEqual(look);
    }
  });
});

/** The content type each use case's card names in its link text. */
const TYPE_OF: Record<string, string> = {
  "Menus and tables": "url",
  "Business cards": "vcard",
  "Guest Wi-Fi": "wifi",
  Payments: "upi",
  "Events and check-ins": "attendance",
  "Shelves and displays": "amazon",
};

describe("home use cases", () => {
  it("open the playground on their type, in their illustration's look", () => {
    const opened = useCases.filter((item) =>
      item.href.startsWith("/playground"),
    );
    expect(opened.map((item) => item.title).sort()).toEqual(
      Object.keys(TYPE_OF).sort(),
    );
    for (const item of opened) {
      const id = item.image.src.match(
        /\/images\/use-cases\/(.+)-light\.svg$/,
      )?.[1] as UseCaseArtId;
      const { params, design } = read(item.href);
      expect(params.type, item.title).toBe(TYPE_OF[item.title]);
      expect(params.sample, item.title).toBe(true);
      expect(design?.styles, item.title).toEqual(
        showcaseThemeStyles(USE_CASE_CODES[id].style),
      );
    }
  });

  it("send the bulk and print-size jobs to their tools", () => {
    const tools = useCases.filter(
      (item) => !item.href.startsWith("/playground"),
    );
    expect(tools.map((item) => item.href).sort()).toEqual([
      "/tools/bulk",
      "/tools/print-size",
    ]);
  });
});

describe("docs style catalogue", () => {
  it.each(["body", "eye", "dot", "frame"] as const)(
    "every %s tile opens its option in the playground",
    (kind) => {
      for (const tile of tilesFor(kind)) {
        const { path, design } = read(catalogPlaygroundHref(tile));
        expect(path).toBe("/playground");
        const { bodyPattern, cornerEyePattern, cornerEyeDotPattern, frame } =
          tile.props;
        expect(design?.styles, tile.id).toEqual({
          bodyPattern,
          cornerEyePattern,
          cornerEyeDotPattern,
          ...(frame && { frame }),
        });
      }
    },
  );
});

describe("/ai/art Logo QR and Image QR cards", () => {
  it("open the Art tab in their mode, on the example's look", () => {
    for (const example of ART_EXAMPLES) {
      const { params, design } = read(artExampleHref(example));
      expect(params, example.title).toMatchObject({
        tab: "art",
        art: example.mode,
      });
      expect(design?.styles, example.title).toEqual(
        showcaseThemeStyles(example.style),
      );
    }
  });
});
