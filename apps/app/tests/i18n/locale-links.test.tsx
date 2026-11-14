// Links on translated pages keep the language: on /hi pages a link to
// /playground goes to /hi/playground (components/i18n/locale-link.tsx).
//
// Two checks, both fast enough for every push:
// 1. Source rules over everything app/[lang] imports (followed through the
//    import graph, so a component a translated page starts using is covered
//    the day it does, menus and dialogs included): no next/link or
//    next/navigation useRouter except through LocaleLink/useLocaleRouter,
//    and no plain <a href="/…"> or location change to a translated page.
// 2. The shared chrome and the home page's sections, rendered in Hindi: no
//    href to a page that exists in Hindi without the /hi prefix. This
//    catches hrefs built from data, which the source rules can't see.
//
// A crawl of a production build found these bugs; a build-output scan was
// the alternative, but CI doesn't build the app (Vercel does) and closed
// menus aren't in the HTML.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { isPathIn, localizeHref } from "@repo/i18n/paths";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const ROOT = resolve(import.meta.dirname, "../..");

// ─── 1. Source rules ─────────────────────────────────────────────────────────

/** The only files that may use next/link and useRouter directly. */
const WRAPPERS = new Set(["components/i18n/locale-link.tsx"]);

const EXTENSIONS = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const extension of EXTENSIONS) {
    const file = base + extension;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesIn(path);
    return /\.(tsx?|mdx)$/.test(name) ? [path] : [];
  });
}

const IMPORT =
  /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

/** Every source file app/[lang] reaches through its imports. */
function translatedPageGraph(): Map<string, string> {
  const sources = new Map<string, string>();
  const queue = filesIn(join(ROOT, "app/[lang]"));
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (sources.has(file)) continue;
    const source = readFileSync(file, "utf8");
    sources.set(file, source);
    for (const match of source.matchAll(IMPORT)) {
      const target = resolveImport(
        file,
        match[1] ?? match[2] ?? match[3] ?? "",
      );
      if (target && !sources.has(target)) queue.push(target);
    }
  }
  return sources;
}

/** A path a translated page has in some language ("/pricing", "/docs/…"). */
const isTranslatedPath = (href: string) => {
  const path = href.split(/[?#]/)[0] ?? "";
  return path.startsWith("/") && !path.startsWith("//") && isPathIn(path, "ja");
};

describe("links in code that translated pages import", () => {
  const graph = translatedPageGraph();
  const files = [...graph].filter(([file]) => !file.endsWith(".mdx"));
  const named = (file: string) => relative(ROOT, file);

  it("follows the import graph", () => {
    expect(files.length).toBeGreaterThan(500);
    expect(graph.has(join(ROOT, "components/sections/navbar.tsx"))).toBe(true);
  });

  it("imports next/link only through LocaleLink", () => {
    const direct = files
      .filter(([, source]) => /from\s+["']next\/link["']/.test(source))
      .map(([file]) => named(file))
      .filter((file) => !WRAPPERS.has(file));
    expect(direct).toEqual([]);
  });

  it("navigates in code only through useLocaleRouter", () => {
    const direct = files
      .filter(([, source]) =>
        /import\s*\{[^}]*\buseRouter\b[^}]*\}\s*from\s*["']next\/navigation["']/.test(
          source,
        ),
      )
      .map(([file]) => named(file))
      .filter((file) => !WRAPPERS.has(file));
    expect(direct).toEqual([]);
  });

  it("has no plain <a> or location change to a translated page", () => {
    const found: string[] = [];
    const patterns = [
      // <a href="/pricing">, <a href={"/pricing"}>, <a href={`/pricing?…`}>
      /<a\b[^>]*?\bhref=\{?\s*["'`](\/[^"'`$]*)/gs,
      // window.location.href = "/x", location.assign("/x"), location.replace("/x")
      /location(?:\.href)?\s*(?:=|\.assign\(|\.replace\()\s*["'`](\/[^"'`$]*)/g,
    ];
    for (const [file, source] of files) {
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
          if (isTranslatedPath(match[1] ?? "")) {
            found.push(`${named(file)}: ${match[1]}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});

// ─── 2. Rendered in Hindi ────────────────────────────────────────────────────

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/hi",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
    forward: () => undefined,
  }),
}));

// next/link marks its anchors, so the docs-zone test below can tell them from
// plain <a> elements (both render as <a href>).
vi.mock("next/link", async (importOriginal) => {
  const { default: Link } = await importOriginal<typeof import("next/link")>();
  return {
    default: (props: ComponentProps<typeof Link>) => (
      <Link {...props} data-next-link="" />
    ),
  };
});

/** Every internal href in `html` that should carry the /hi prefix but doesn't. */
function unprefixed(html: string): string[] {
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((match) =>
    (match[1] ?? "").replaceAll("&amp;", "&"),
  );
  return hrefs.filter((href) => {
    const path = href.split(/[?#]/)[0] ?? "";
    if (!path.startsWith("/") || path.startsWith("//")) return false;
    return localizeHref(href, "hi") !== href;
  });
}

const renderHindi = (node: ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="hi" messages={en} timeZone="UTC">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );

describe("translated chrome and home sections, rendered in Hindi", () => {
  // Each section and links it must render prefixed (the owner's report and
  // the crawl of /hi: sample codes open /playground?type=…&sample=1, the
  // wall's generator pages, the use-case cards' tools).
  it.each([
    [
      "navbar",
      () => import("@/components/sections/navbar").then((m) => <m.Navbar />),
      ["/hi/playground"],
    ],
    [
      "footer",
      () =>
        import("@/components/sections/footer-section").then((m) => (
          <m.FooterSection />
        )),
      ["/hi/pricing"],
    ],
    [
      "call to action",
      () =>
        import("@/components/sections/cta-section").then((m) => (
          <m.CTASection />
        )),
      [],
    ],
    [
      "hero",
      () =>
        import("@/components/sections/hero-section").then((m) => (
          <m.HeroSection />
        )),
      ["/hi/playground"],
    ],
    [
      "feature rows",
      () =>
        import("@/components/sections/home/feature-rows-section").then((m) => (
          <m.FeatureRowsSection />
        )),
      ["/hi/tools/bulk"],
    ],
    [
      "gallery wall",
      () =>
        import("@/components/sections/home/gallery-section").then((m) => (
          <m.GallerySection />
        )),
      [
        "/hi/playground?type=wifi&sample=1",
        "/hi/qr-code-generator/wifi",
        "/hi/playground?tab=art",
      ],
    ],
    [
      "use cases",
      () =>
        import("@/components/sections/home/use-cases-section").then((m) => (
          <m.UseCasesSection />
        )),
      [
        "/hi/playground?type=vcard&sample=1&style=",
        "/hi/tools/print-size",
        "/hi/tools/bulk",
      ],
    ],
  ] as const)("%s keeps /hi on every link", async (_name, load, expected) => {
    const html = renderHindi(await load()).replaceAll("&amp;", "&");
    expect(html).toContain('href="/hi');
    for (const href of expected) expect(html).toContain(`href="${href}`);
    expect(unprefixed(html)).toEqual([]);
  });

  it("prefixes query-string and hash links, and leaves pages hi doesn't have alone", () => {
    expect(
      localizeHref("/playground?type=url&sample=1&preset=orchid", "hi"),
    ).toBe("/hi/playground?type=url&sample=1&preset=orchid");
    expect(localizeHref("/pricing#faq", "hi")).toBe("/hi/pricing#faq");
    expect(localizeHref("/qr-code-generator/upi", "hi")).toBe(
      "/hi/qr-code-generator/upi",
    );
    for (const href of [
      "/community",
      "/legal/privacy-policy",
      "/templates/menu/cafe",
      "/playground/abc123",
    ]) {
      expect(localizeHref(href, "hi")).toBe(href);
    }
  });
});

// ─── 3. Into the docs zone ───────────────────────────────────────────────────

describe("links to the docs", () => {
  // The docs are moving to an app of their own behind the same URLs
  // (@repo/i18n/docs): a link into them loads the page in full.
  const render = async (href: string, props: object = {}) => {
    const { LocaleLink } = await import("@/components/i18n/locale-link");
    return renderHindi(
      <LocaleLink href={href} {...props}>
        x
      </LocaleLink>,
    );
  };

  it("are plain <a> elements, in the reader's language", async () => {
    for (const [href, expected] of [
      ["/docs", "/hi/docs"],
      ["/docs/dynamic-qr-codes", "/hi/docs/dynamic-qr-codes"],
      ["/docs/developers/rest-api#auth", "/hi/docs/developers/rest-api#auth"],
    ]) {
      const html = await render(href as string, { prefetch: false });
      expect(html).toBe(`<a href="${expected}">x</a>`);
    }
  });

  it("leave every other page to next/link", async () => {
    expect(await render("/pricing")).toContain("data-next-link");
    expect(await render("/playground")).toContain("data-next-link");
    // A docs page's Markdown is a file, not a page of either app.
    expect(await render("/docs/dynamic-qr-codes.md")).toContain(
      "data-next-link",
    );
  });
});
