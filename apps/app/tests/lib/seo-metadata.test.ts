// Search metadata that lives outside page files: the overrides in
// lib/seo-overrides.ts, the comparison pages' seoTitle/seoDescription, the
// Organization node and the per-page Open Graph images. Titles and
// descriptions over the limits get cut off in results; an override for a page
// that moved silently stops applying; a page whose metadata sets the default
// image hides its own opengraph-image.tsx.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { loader, type VirtualFile } from "fumadocs-core/source";
import { describe, expect, it } from "vitest";
import { createMetadata } from "@/lib/metadata";
import {
  brandedTitle,
  MAX_DESCRIPTION,
  MAX_TITLE,
  SEO_OVERRIDES,
} from "@/lib/seo-overrides";
import { organizationId, organizationSchema } from "@/lib/seo-schema";

const APP = join(import.meta.dirname, "../..");
const CONTENT = join(APP, "content");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** Docs URLs from the real fumadocs loader (route groups dropped). */
function docsUrls(): Set<string> {
  const root = join(CONTENT, "docs");
  const files = walk(root).flatMap((absolutePath): VirtualFile[] => {
    const path = relative(root, absolutePath);
    const text = readFileSync(absolutePath, "utf8");
    if (path.endsWith("meta.json")) {
      return [{ type: "meta", path, data: JSON.parse(text) }];
    }
    if (!path.endsWith(".mdx")) return [];
    const title = /^title:\s*(.+)$/m.exec(text)?.[1] ?? path;
    return [{ type: "page", path, data: { title } }];
  });
  const source = loader({ baseUrl: "/docs", source: { files } });
  return new Set(source.getPages().map((page) => page.url));
}

function pageExists(url: string, docs: Set<string>): boolean {
  if (url.startsWith("/docs")) return docs.has(url);
  const match = /^\/(blog|legal)\/([^/]+)$/.exec(url);
  if (!match) return false;
  return existsSync(join(CONTENT, match[1] as string, `${match[2]}.mdx`));
}

/** The string a title resolves to (the root template adds " | QRdx"). */
function rendered(title: ReturnType<typeof brandedTitle>): string {
  return typeof title === "object" && title && "absolute" in title
    ? title.absolute
    : String(title);
}

describe("SEO overrides", () => {
  const docs = docsUrls();

  it.each(Object.keys(SEO_OVERRIDES))("%s is a real page", (url) => {
    expect(pageExists(url, docs)).toBe(true);
  });

  it.each(Object.entries(SEO_OVERRIDES))("%s fits the limits", (url, seo) => {
    if (seo.title) {
      const suffix = url.startsWith("/docs") ? " | QRdx Docs" : " | QRdx";
      expect(rendered(brandedTitle(seo.title, suffix)).length).toBeLessThan(
        MAX_TITLE + 1,
      );
    }
    if (seo.description) {
      expect(seo.description.length).toBeLessThan(MAX_DESCRIPTION + 1);
    }
  });

  it("names the registry components by their exports", () => {
    for (const [url, seo] of Object.entries(SEO_OVERRIDES)) {
      const slug = /^\/docs\/components\/(.+)$/.exec(url)?.[1];
      if (!slug || !seo.title) continue;
      const name = seo.title.split(" ")[0] as string;
      const file = readFileSync(
        join(APP, `../../packages/docs-assets/registry/qrdx/${slug}.tsx`),
        "utf8",
      );
      expect(file).toContain(`export function ${name}(`);
    }
  });
});

describe("brandedTitle", () => {
  it("adds the suffix when it fits", () => {
    expect(brandedTitle("Do QR codes expire?")).toEqual({
      absolute: "Do QR codes expire? | QRdx",
    });
    expect(brandedTitle("CLI", " | QRdx Docs")).toEqual({
      absolute: "CLI | QRdx Docs",
    });
  });

  it("doesn't repeat the brand or push a long title over the limit", () => {
    expect(brandedTitle("QRdx vs Bitly QR Codes")).toEqual({
      absolute: "QRdx vs Bitly QR Codes",
    });
    const long = "x".repeat(MAX_TITLE - 3);
    expect(brandedTitle(long)).toEqual({ absolute: long });
  });
});

describe("comparison pages", () => {
  const files = readdirSync(join(CONTENT, "compare")).filter((file) =>
    file.endsWith(".mdx"),
  );
  const field = (text: string, name: string) =>
    new RegExp(`^${name}:\\s*"?(.*?)"?\\s*$`, "m").exec(text)?.[1];

  it.each(files)("%s has a short seoTitle and seoDescription", (file) => {
    const text = readFileSync(join(CONTENT, "compare", file), "utf8");
    const title = field(text, "seoTitle");
    const description = field(text, "seoDescription");
    expect(title, "seoTitle").toBeTruthy();
    expect(description, "seoDescription").toBeTruthy();
    // Shown as-is: "QRdx vs …" names the brand, so no suffix is added.
    expect(rendered(brandedTitle(title as string)).length).toBeLessThan(
      MAX_TITLE + 1,
    );
    expect((description as string).length).toBeLessThan(MAX_DESCRIPTION + 1);
  });
});

describe("Organization schema", () => {
  it("points other nodes at one id", () => {
    expect(organizationSchema["@id"]).toBe(organizationId);
    expect(organizationId.endsWith("/#organization")).toBe(true);
  });

  it("claims no ratings or reviews", () => {
    const json = JSON.stringify(organizationSchema);
    for (const key of ["aggregateRating", "review", "ratingValue"]) {
      expect(json).not.toContain(key);
    }
  });

  it("only links profiles over https", () => {
    for (const url of [
      ...organizationSchema.sameAs,
      ...organizationSchema.founder.sameAs,
    ]) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it("names the founder's X account by its real handle", () => {
    expect(organizationSchema.founder.sameAs).toContain(
      "https://x.com/bucha_ritesh",
    );
    expect(createMetadata({}).twitter).toMatchObject({
      creator: "@bucha_ritesh",
    });
    // The GitHub username is bucharitesh; x.com/bucharitesh doesn't exist.
    for (const file of [
      "lib/root-metadata.ts",
      "content/blog-authors/ritesh-bucha.mdx",
    ]) {
      expect(readFileSync(join(APP, file), "utf8")).not.toMatch(
        /@bucharitesh\b|x\.com\/bucharitesh|twitter: bucharitesh/,
      );
    }
  });

  it("isn't in the root layout, which also wraps white-label hosted pages", () => {
    const root = readFileSync(join(APP, "app/(app)/layout.tsx"), "utf8");
    expect(root).not.toContain("organizationSchema");
    for (const layout of [
      "app/(app)/(home)/layout.tsx",
      "app/[lang]/(home)/layout.tsx",
      // Both playground layouts render it (/playground and shared themes).
      "components/playground/playground-shell.tsx",
    ]) {
      expect(readFileSync(join(APP, layout), "utf8")).toContain(
        "<JsonLd data={organizationSchema} />",
      );
    }
  });
});

describe("per-page Open Graph images", () => {
  const appFiles = walk(join(APP, "app"));
  const images = appFiles.filter((file) =>
    /\/opengraph-image\.tsx$/.test(file),
  );
  const pages = appFiles.filter((file) => /\/page\.tsx$/.test(file));
  const ownsImage = (page: string) =>
    /ownOgImage: true/.test(readFileSync(page, "utf8")) ||
    // The playground's metadata lives in app/(app)/playground/metadata.ts.
    /playgroundMetadata/.test(readFileSync(page, "utf8"));

  it.each(
    pages
      .filter((page) => /ownOgImage: true/.test(readFileSync(page, "utf8")))
      .map((page) => relative(APP, page)),
  )("%s has its own opengraph-image.tsx", (page) => {
    expect(existsSync(join(APP, dirname(page), "opengraph-image.tsx"))).toBe(
      true,
    );
  });

  it.each(
    images
      .map((image) => relative(APP, image))
      .filter((image) => image !== "app/opengraph-image.tsx"),
  )("%s isn't hidden by the site-wide default", (image) => {
    const page = join(APP, dirname(image), "page.tsx");
    expect(existsSync(page)).toBe(true);
    const text = readFileSync(page, "utf8");
    // createMetadata() adds the default image unless told the segment has
    // its own; pages that build metadata by hand mustn't set `images`.
    const addsDefault = text.includes("createMetadata(") && !ownsImage(page);
    expect(addsDefault).toBe(false);
    expect(text).not.toMatch(/images:\s*\[?defaultOgImage/);
  });

  it("gives /playground its image and keeps the default on shared theme links", () => {
    const page = readFileSync(
      join(APP, "app/[lang]/playground/(editor)/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/localizedMetadata\([\s\S]*?ownOgImage: true/);
    expect(
      readFileSync(
        join(APP, "components/playground/playground-metadata.ts"),
        "utf8",
      ),
    ).not.toContain("ownOgImage");
    expect(
      readFileSync(
        join(APP, "app/(app)/playground/[...qrId]/page.tsx"),
        "utf8",
      ),
    ).toContain("sharedThemeMetadata");
  });
});
