// Routes that prerender a fixed list of params (lib/static-params.ts): the
// full list in production builds, none under `next dev` (where listing paths
// makes Next rewrite .next/dev/prerender-manifest.json without a lock, and
// parallel cold loads corrupted it), `dynamicParams` left at its default so
// dev can render them, and a 404 for any param that isn't in the list.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { getIntegrationCatalog } from "@repo/integrations/src/catalog";
import { loader } from "fumadocs-core/source";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as integrationImage from "@/app/(app)/(home)/integrations/[slug]/opengraph-image";
import * as integrationPage from "@/app/(app)/(home)/integrations/[slug]/page";
import * as typeImage from "@/app/(app)/(home)/qr-code-generator/[type]/opengraph-image";
import * as typePage from "@/app/(app)/(home)/qr-code-generator/[type]/page";
import * as industryImage from "@/app/(app)/(home)/qr-codes-for/[slug]/opengraph-image";
import * as industryPage from "@/app/(app)/(home)/qr-codes-for/[slug]/page";
import * as placementImage from "@/app/(app)/(home)/qr-codes-on/[slug]/opengraph-image";
import * as placementPage from "@/app/(app)/(home)/qr-codes-on/[slug]/page";
import * as templateTypePage from "@/app/(app)/templates/[type]/page";
import { listTemplates } from "@/lib/landing/templates";
import { QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import { industries, placements } from "@/lib/seo-content";
import { buildTimeParams } from "@/lib/static-params";

const APP = join(import.meta.dirname, "../../app");

/**
 * Routes that list their params some other way, each fixed in its own PR:
 * the sample codes (#181).
 */
const ELSEWHERE = ["sample-codes/[file]/route.ts"];

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

const ROUTES = routesWithStaticParams()
  .filter((file) => !ELSEWHERE.includes(file))
  .sort();

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
  [
    "/integrations/[slug]",
    integrationPage,
    getIntegrationCatalog().map((entry) => ({ slug: entry.slug })),
  ],
  [
    "its OG image",
    integrationImage,
    getIntegrationCatalog().map((entry) => ({ slug: entry.slug })),
  ],
  [
    "/templates/[type]",
    templateTypePage,
    listTemplates().map((template) => ({ type: template.type })),
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
  it("are all found, the generator, topic, blog, docs and catalogue routes among them", () => {
    for (const file of [
      "(home)/qr-code-generator/[type]/page.tsx",
      "(home)/qr-codes-for/[slug]/page.tsx",
      "(home)/qr-codes-on/[slug]/page.tsx",
      "(home)/blog/[slug]/page.tsx",
      "(home)/compare/[slug]/page.tsx",
      "(home)/integrations/[slug]/page.tsx",
      "(home)/legal/[[...slug]]/page.tsx",
      "(docs)/docs/[[...slug]]/page.tsx",
      "llms.mdx/[[...slug]]/route.ts",
      "og/docs/[...slug]/route.tsx",
      "templates/[type]/page.tsx",
      "templates/[type]/[template]/page.tsx",
      "(home)/blog/category/[slug]/opengraph-image.tsx",
      "(home)/community/[type]/opengraph-image.tsx",
      "og/legal/[...slug]/route.tsx",
    ]) {
      expect(ROUTES).toContain(file);
    }
  });

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

  it("answer 404 for a param that isn't in the list", async () => {
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
        // Its generateMetadata returns {} for an unknown slug; the page 404s.
        () => integrationPage.default({ params: params(value) } as never),
        () => integrationImage.default({ params: params(value) } as never),
        () => templateTypePage.default({ params: params(value) } as never),
      ]) {
        expect(await notFoundDigest(render), value).toMatch(/;404$/);
      }
    }
  });
});

describe("fumadocs sources (docs, legal, blog, compare, llms.mdx, OG)", () => {
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
