// The home page's server-rendered HTML links every content type's generator
// page the wall and the use-case cards show, with plain <a href>s that need
// no JavaScript. Search engines find those pages through these links. The
// examples themselves open the playground through a separate link, and no
// link sits inside another.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GallerySection } from "@/components/sections/home/gallery-section";
import {
  UseCasesSection,
  useCases,
} from "@/components/sections/home/use-cases-section";
import { generatorPath } from "@/lib/landing/generator-paths";
import { HOME_WALL, wallPlacements } from "@/lib/landing/showcase-wall";
import { parsePlaygroundParams } from "@/lib/playground-links";
import { QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import en from "@/messages/en.json";

/** The sections translate their copy; the English catalog is enough here. */
const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      {node}
    </NextIntlClientProvider>,
  );

/** Every <a href> in `html`, decoded (React escapes & as &amp;). */
function hrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((match) =>
    (match[1] ?? "").replaceAll("&amp;", "&"),
  );
}

/** The deepest <a> nesting in `html` (1 when no link is inside another). */
function deepestLinkNesting(html: string): number {
  let depth = 0;
  let deepest = 0;
  for (const [tag] of html.matchAll(/<\/?a\b[^>]*>/g)) {
    depth += tag.startsWith("</") ? -1 : 1;
    deepest = Math.max(deepest, depth);
  }
  return deepest;
}

const wallTypes = [
  ...new Set(
    wallPlacements(HOME_WALL).flatMap(({ tile }) =>
      tile.contentType ? [tile.contentType] : [],
    ),
  ),
];

describe("home page links (server-rendered, no JavaScript)", () => {
  const gallery = render(<GallerySection />);
  const cases = render(<UseCasesSection />);
  const links = hrefs(gallery + cases);

  it("the wall shows content types", () => {
    expect(wallTypes.length).toBeGreaterThan(20);
  });

  it.each(wallTypes)(
    "links the %s generator page and opens it in the playground",
    (type) => {
      expect(QR_TYPE_SLUGS).toContain(type);
      expect(links).toContain(generatorPath(type));
      const playground = links.filter((href) =>
        href.startsWith("/playground?"),
      );
      expect(
        playground.some(
          (href) =>
            parsePlaygroundParams(new URL(href, "https://qrdx.dev").search)
              .type === type,
        ),
      ).toBe(true);
    },
  );

  it("links each use case's generator page beside its playground link", () => {
    for (const useCase of useCases) {
      expect(links, useCase.key).toContain(useCase.href);
      if (useCase.about) expect(links, useCase.key).toContain(useCase.about);
    }
    expect(useCases.filter((item) => item.about).length).toBe(6);
  });

  it("never puts a link inside another", () => {
    expect(deepestLinkNesting(gallery)).toBe(1);
    expect(deepestLinkNesting(cases)).toBe(1);
  });
});
