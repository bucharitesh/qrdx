// Routes that prerender a fixed list of params (lib/static-params.ts): the
// full list in production and staging builds, English only for app/[lang],
// none in other preview builds or under `next dev` (where listing paths
// makes Next rewrite .next/dev/prerender-manifest.json without a lock, and
// parallel cold loads corrupted it), none ever for OG images and Markdown
// copies, `dynamicParams` left at its default so whatever isn't listed
// renders on request, and a 404 for any param that isn't in the list.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { getIntegrationCatalog } from "@repo/integrations/src/catalog";
import { loader } from "fumadocs-core/source";
import { afterEach, describe, expect, it, vi } from "vitest";

// The marketing routes are translated pages (lib/i18n): English here.
vi.mock(
  "next-intl/server",
  async () => (await import("../support/intl")).intlServer,
);
vi.mock(
  "@/lib/i18n/server",
  async () => (await import("../support/intl")).i18nServer,
);

import * as templateTypePage from "@/app/(app)/templates/[type]/page";
import { BARCODE_FORMAT_PAGES } from "@/app/[lang]/(home)/barcode-generator/[format]/content";
import * as barcodeImage from "@/app/[lang]/(home)/barcode-generator/[format]/opengraph-image";
import * as barcodePage from "@/app/[lang]/(home)/barcode-generator/[format]/page";
import * as integrationImage from "@/app/[lang]/(home)/integrations/[slug]/opengraph-image";
import * as integrationPage from "@/app/[lang]/(home)/integrations/[slug]/page";
import * as typeImage from "@/app/[lang]/(home)/qr-code-generator/[type]/opengraph-image";
import * as typePage from "@/app/[lang]/(home)/qr-code-generator/[type]/page";
import * as industryImage from "@/app/[lang]/(home)/qr-codes-for/[slug]/opengraph-image";
import * as industryPage from "@/app/[lang]/(home)/qr-codes-for/[slug]/page";
import * as placementImage from "@/app/[lang]/(home)/qr-codes-on/[slug]/opengraph-image";
import * as placementPage from "@/app/[lang]/(home)/qr-codes-on/[slug]/page";
import { localeParams } from "@/lib/i18n/static-params";
import { listTemplates } from "@/lib/landing/templates";
import { QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import { HOSTED_TYPE_SLUGS } from "@/lib/qr-types-content-hosted";
import { industries, placements } from "@/lib/seo-content";
import { buildTimeParams, prerenderScope } from "@/lib/static-params";

const APP = join(import.meta.dirname, "../../app");

/** Static content types, then the codes that open a hosted page (PDF, business card). */
const TYPE_SLUGS = [...QR_TYPE_SLUGS, ...HOSTED_TYPE_SLUGS];

/** Every route file under app/ that exports generateStaticParams. */
function routesWithStaticParams(dir = APP, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) routesWithStaticParams(path, out);
    else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      /export (async )?function generateStaticParams/.test(
        readFileSync(path, "utf8"),
      )
    ) {
      out.push(relative(APP, path));
    }
  }
  return out;
}

const ROUTES = routesWithStaticParams().sort();

/**
 * OG images of pages with a dynamic segment and the image files the engine
 * draws.
 */
const ON_DEMAND = ROUTES.filter((file) =>
  /(?:opengraph-image|twitter-image)\.tsx$|^og\/|^(?:sample-codes|gallery|catalog|api\/brand-logos)\//.test(
    file,
  ),
);

interface ParamsRoute {
  generateStaticParams: () => Record<string, string>[];
}

// A page under [lang] lists its own segment; Next pairs it with each [lang]
// the root layout lists (English only, localeParams).
const QR_ROUTES: [string, ParamsRoute, Record<string, string>[]][] = [
  ["/qr-code-generator/[type]", typePage, TYPE_SLUGS.map((type) => ({ type }))],
  [
    "/qr-codes-for/[slug]",
    industryPage,
    industries.items.map((item) => ({ slug: item.slug })),
  ],
  [
    "/qr-codes-on/[slug]",
    placementPage,
    placements.items.map((item) => ({ slug: item.slug })),
  ],
  [
    "/integrations/[slug]",
    integrationPage,
    getIntegrationCatalog().map((entry) => ({ slug: entry.slug })),
  ],
  [
    "/barcode-generator/[format]",
    barcodePage,
    BARCODE_FORMAT_PAGES.map((page) => ({ format: page.slug })),
  ],
  [
    "/templates/[type]",
    templateTypePage,
    listTemplates().map((template) => ({ type: template.type })),
  ],
];

/** Their OG images: none at build, each rendered on its first request. */
const QR_IMAGES: [string, ParamsRoute][] = [
  ["/qr-code-generator/[type]", typeImage],
  ["/qr-codes-for/[slug]", industryImage],
  ["/qr-codes-on/[slug]", placementImage],
  ["/integrations/[slug]", integrationImage],
  ["/barcode-generator/[format]", barcodeImage],
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

describe("prerenderScope", () => {
  it("is English pages in production, local and CI builds", () => {
    expect(prerenderScope("production", "production", "main")).toBe("english");
    expect(prerenderScope("production", undefined, undefined)).toBe("english");
  });

  it("is English pages on staging, a preview that builds the production set", () => {
    // The release pull request is checked against staging's build.
    expect(prerenderScope("production", "preview", "staging")).toBe("english");
  });

  it("is minimal in other Vercel preview builds", () => {
    expect(prerenderScope("production", "preview", "preview/x")).toBe(
      "minimal",
    );
    expect(prerenderScope("production", "preview", undefined)).toBe("minimal");
  });

  it("is nothing under next dev, wherever it runs", () => {
    expect(prerenderScope("development", undefined, undefined)).toBe("none");
    expect(prerenderScope("development", "preview", "staging")).toBe("none");
  });
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

describe("localeParams", () => {
  it("lists English only in builds and nothing under next dev", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(localeParams()).toEqual([{ lang: "en" }]);
    vi.stubEnv("NODE_ENV", "development");
    expect(localeParams()).toEqual([]);
  });
});

describe("routes with a fixed param list", () => {
  it("are all found, the generator, topic, blog, customer and catalogue routes among them", () => {
    for (const file of [
      "[lang]/(home)/qr-code-generator/[type]/page.tsx",
      "[lang]/(home)/barcode-generator/[format]/page.tsx",
      "[lang]/(home)/qr-codes-for/[slug]/page.tsx",
      "[lang]/(home)/qr-codes-on/[slug]/page.tsx",
      "(app)/(home)/blog/[slug]/page.tsx",
      "(app)/(home)/customers/[slug]/page.tsx",
      "(app)/(home)/compare/[slug]/page.tsx",
      "[lang]/(home)/integrations/[slug]/page.tsx",
      "(app)/(home)/legal/[[...slug]]/page.tsx",
      "(app)/templates/[type]/page.tsx",
      "(app)/templates/[type]/[template]/page.tsx",
      "(app)/(home)/blog/category/[slug]/opengraph-image.tsx",
      "(app)/(home)/community/[type]/opengraph-image.tsx",
      "og/legal/[...slug]/route.tsx",
      "[lang]/layout.tsx",
      "[lang]/(home)/pricing/opengraph-image.tsx",
    ]) {
      expect(ROUTES).toContain(file);
    }
  });

  it.each(ROUTES)(
    "%s lists its params through lib/static-params.ts, with dynamic params on",
    (file) => {
      const source = readFileSync(join(APP, file), "utf8");
      // dynamicParams = false with no params in dev would 404 every page there.
      expect(source).not.toMatch(/export const dynamicParams/);
      expect(source).toMatch(
        // lib/i18n/static-params.ts has the [lang] list.
        /export function generateStaticParams\([^)]*\) \{\s*return (?:buildTimeParams|localeParams|onDemandParams)\(/,
      );
    },
  );

  it.each(ON_DEMAND)("%s prerenders nothing", (file) => {
    const source = readFileSync(join(APP, file), "utf8");
    expect(source).toMatch(
      /export function generateStaticParams\(\) \{\s*return onDemandParams\(\);/,
    );
  });

  it("include the OG images, Markdown copies and engine-drawn images", () => {
    expect(ON_DEMAND).toEqual(
      expect.arrayContaining([
        "[lang]/(home)/pricing/opengraph-image.tsx",
        "[lang]/(home)/qr-code-generator/[type]/opengraph-image.tsx",
        "(app)/(home)/blog/[slug]/opengraph-image.tsx",
        "(app)/(home)/customers/[slug]/opengraph-image.tsx",
        "og/legal/[...slug]/route.tsx",
        "sample-codes/[file]/route.ts",
        "gallery/[file]/route.ts",
        "catalog/[file]/route.ts",
        "api/brand-logos/[slug]/route.ts",
      ]),
    );
  });

  it.each(QR_ROUTES)(
    "%s: every param in production, none in dev",
    (_name, route, all) => {
      vi.stubEnv("NODE_ENV", "production");
      expect(route.generateStaticParams()).toEqual(all);
      vi.stubEnv("NODE_ENV", "development");
      expect(route.generateStaticParams()).toEqual([]);
    },
  );

  it.each(QR_IMAGES)("%s's OG image: none at build", (_name, route) => {
    vi.stubEnv("NODE_ENV", "production");
    expect(route.generateStaticParams()).toEqual([]);
  });

  it("answer 404 for a param that isn't in the list", async () => {
    const params = (value: string) =>
      Promise.resolve({ type: value, slug: value, format: value });
    for (const value of ["not-a-type", "constructor", "__proto__"]) {
      for (const render of [
        () => typePage.default({ params: params(value) } as never),
        () => typePage.generateMetadata({ params: params(value) } as never),
        () => industryPage.default({ params: params(value) } as never),
        () => industryPage.generateMetadata({ params: params(value) } as never),
        () => placementPage.default({ params: params(value) } as never),
        () =>
          placementPage.generateMetadata({ params: params(value) } as never),
        // Its generateMetadata returns {} for an unknown slug; the page 404s.
        () => integrationPage.default({ params: params(value) } as never),
        () => integrationImage.default({ params: params(value) } as never),
        () => templateTypePage.default({ params: params(value) } as never),
        () => barcodePage.default({ params: params(value) } as never),
        () => barcodePage.generateMetadata({ params: params(value) } as never),
      ]) {
        expect(await notFoundDigest(render), value).toMatch(/;404$/);
      }
    }
  });
});

describe("fumadocs sources (legal, blog, compare, OG)", () => {
  // Those routes call notFound() when source.getPage() finds nothing; their
  // modules load MDX, so this checks the loader they use directly.
  it("find no page for an unknown path or a prototype name", () => {
    const source = loader({
      baseUrl: "/docs",
      source: {
        files: [
          { type: "page", path: "index.mdx", data: { title: "Home" } },
          { type: "page", path: "guide.mdx", data: { title: "Guide" } },
        ],
      },
    });
    expect(source.getPage(["guide"])?.data.title).toBe("Guide");
    for (const slugs of [
      ["nope"],
      ["constructor"],
      ["__proto__"],
      ["toString"],
      ["guide", "nope"],
    ]) {
      expect(source.getPage(slugs), slugs.join("/")).toBeUndefined();
    }
  });
});

describe("blog categories", () => {
  it("are own keys of the list only", async () => {
    const { isCategorySlug, SLUG_TO_CATEGORY } = await import(
      "@/lib/blog-constants"
    );
    for (const slug of Object.keys(SLUG_TO_CATEGORY)) {
      expect(isCategorySlug(slug), slug).toBe(true);
    }
    for (const slug of ["nope", "constructor", "__proto__", "toString"]) {
      expect(isCategorySlug(slug), slug).toBe(false);
    }
  });
});
