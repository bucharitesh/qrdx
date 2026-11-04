// Routes that prerender a fixed list of params (lib/static-params.ts): the
// full list in production builds, none under `next dev` (where listing paths
// makes Next rewrite .next/dev/prerender-manifest.json without a lock, and
// parallel cold loads corrupted it), `dynamicParams` left at its default so
// dev can render them, and a 404 for any param that isn't in the list.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as typeImage from "@/app/(home)/qr-code-generator/[type]/opengraph-image";
import * as typePage from "@/app/(home)/qr-code-generator/[type]/page";
import * as industryImage from "@/app/(home)/qr-codes-for/[slug]/opengraph-image";
import * as industryPage from "@/app/(home)/qr-codes-for/[slug]/page";
import * as placementImage from "@/app/(home)/qr-codes-on/[slug]/opengraph-image";
import * as placementPage from "@/app/(home)/qr-codes-on/[slug]/page";
import { QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import { industries, placements } from "@/lib/seo-content";
import { buildTimeParams } from "@/lib/static-params";

const APP = join(import.meta.dirname, "../../app/(home)");

/** Every route with a fixed param list, relative to app/(home). */
const ROUTES = [
  "qr-code-generator/[type]/page.tsx",
  "qr-code-generator/[type]/opengraph-image.tsx",
  "qr-codes-for/[slug]/page.tsx",
  "qr-codes-for/[slug]/opengraph-image.tsx",
  "qr-codes-on/[slug]/page.tsx",
  "qr-codes-on/[slug]/opengraph-image.tsx",
  "blog/[slug]/page.tsx",
  "blog/[slug]/opengraph-image.tsx",
  "blog/authors/[slug]/page.tsx",
  "blog/category/[slug]/page.tsx",
];

interface ParamsRoute {
  generateStaticParams: () => Record<string, string>[];
}

const QR_ROUTES: [string, ParamsRoute, Record<string, string>[]][] = [
  [
    "/qr-code-generator/[type]",
    typePage,
    QR_TYPE_SLUGS.map((type) => ({ type })),
  ],
  ["its OG image", typeImage, QR_TYPE_SLUGS.map((type) => ({ type }))],
  [
    "/qr-codes-for/[slug]",
    industryPage,
    industries.items.map((item) => ({ slug: item.slug })),
  ],
  [
    "its OG image",
    industryImage,
    industries.items.map((item) => ({ slug: item.slug })),
  ],
  [
    "/qr-codes-on/[slug]",
    placementPage,
    placements.items.map((item) => ({ slug: item.slug })),
  ],
  [
    "its OG image",
    placementImage,
    placements.items.map((item) => ({ slug: item.slug })),
  ],
];

/** What notFound() throws (its digest), so a test can tell it from a crash. */
async function notFoundDigest(render: () => Promise<unknown>) {
  try {
    await render();
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
  return undefined;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildTimeParams", () => {
  it("lists nothing under next dev and never builds the list there", () => {
    const list = vi.fn(() => [{ slug: "a" }]);
    vi.stubEnv("NODE_ENV", "development");
    expect(buildTimeParams(list)).toEqual([]);
    expect(list).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "production");
    expect(buildTimeParams(list)).toEqual([{ slug: "a" }]);
  });
});

describe("routes with a fixed param list", () => {
  it.each(ROUTES)(
    "%s lists its params through buildTimeParams, with dynamic params on",
    (file) => {
      const source = readFileSync(join(APP, file), "utf8");
      // dynamicParams = false with no params in dev would 404 every page there.
      expect(source).not.toMatch(/export const dynamicParams/);
      expect(source).toMatch(
        /export function generateStaticParams\(\) \{\s*return buildTimeParams\(/,
      );
    },
  );

  it.each(QR_ROUTES)(
    "%s: every param in production, none in dev",
    (_name, route, all) => {
      vi.stubEnv("NODE_ENV", "production");
      expect(route.generateStaticParams()).toEqual(all);
      vi.stubEnv("NODE_ENV", "development");
      expect(route.generateStaticParams()).toEqual([]);
    },
  );

  it("answer 404 for a type or topic that isn't in the list", async () => {
    const params = (value: string) =>
      Promise.resolve({ type: value, slug: value });
    for (const value of ["not-a-type", "constructor", "__proto__"]) {
      for (const render of [
        () => typePage.default({ params: params(value) } as never),
        () => typePage.generateMetadata({ params: params(value) } as never),
        () => industryPage.default({ params: params(value) } as never),
        () => industryPage.generateMetadata({ params: params(value) } as never),
        () => placementPage.default({ params: params(value) } as never),
        () =>
          placementPage.generateMetadata({ params: params(value) } as never),
      ]) {
        expect(await notFoundDigest(render), value).toMatch(/;404$/);
      }
    }
  });
});
