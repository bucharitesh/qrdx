// The docs tabs and URLs, built with the real fumadocs loader from
// content/docs: every docs URL that ever existed still resolves (a page or a
// redirect in lib/docs-redirects.ts), every page sits in one tab, and the
// tabs come out in order. No MDX is compiled; titles come from frontmatter.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Node, Root } from "fumadocs-core/page-tree";
import { loader, type VirtualFile } from "fumadocs-core/source";
import { describe, expect, it } from "vitest";
import { DOCS_REDIRECTS } from "@/lib/docs-redirects";
import { docsTabs, filterPageTree } from "@/lib/docs-tree";
import type { Locale } from "@/lib/i18n/config";
import {
  DOCS_LOCALES,
  docsI18n,
  docsUrl,
  englishDocsPath,
  translationLocale,
} from "@/lib/i18n/docs";

const CONTENT = join(import.meta.dirname, "../../content/docs");

/** Docs URLs before the tabs (2 Nov 2026). Never remove an entry. */
const LEGACY_URLS = [
  "/docs",
  "/docs/api-reference",
  "/docs/code-controls",
  "/docs/components/qr-code",
  "/docs/components/qr-code-card",
  "/docs/components/qr-code-download",
  "/docs/components/qr-code-generator",
  "/docs/components/qr-code-scanner",
  "/docs/components/qr-code-share-dialog",
  "/docs/components/vcard-qr-code",
  "/docs/components/wifi-qr-code",
  "/docs/custom-domains",
  "/docs/developers/build-an-integration",
  "/docs/developers/cli",
  "/docs/developers/image-api",
  "/docs/developers/mcp",
  "/docs/developers/rest-api",
  "/docs/developers/shadcn",
  "/docs/dynamic-qr-codes",
  "/docs/features/art-qr",
  "/docs/features/colors-gradients",
  "/docs/features/downloads",
  "/docs/features/frames",
  "/docs/features/logos",
  "/docs/features/patterns",
  "/docs/features/templates",
  "/docs/files",
  "/docs/forms-and-pages",
  "/docs/getting-started",
  "/docs/landing-pages",
  "/docs/migrate",
  "/docs/notifications",
  "/docs/plans-and-limits",
  "/docs/qr-detection",
  "/docs/self-hosting",
  "/docs/short-links-and-file-pickers",
  "/docs/smart-routing",
  "/docs/styles",
  "/docs/teams",
  "/docs/tracking-and-conversions",
  "/docs/usage",
  "/docs/utilities",
  "/docs/webhooks",
];

const TABS = ["Help", "Guides", "Developers", "React library", "Self-hosting"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function contentFiles(): VirtualFile[] {
  return walk(CONTENT).flatMap((absolutePath): VirtualFile[] => {
    const path = relative(CONTENT, absolutePath);
    const text = readFileSync(absolutePath, "utf8");
    if (/(?:^|\/)meta(?:\.[^./]+)?\.json$/.test(path)) {
      return [{ type: "meta", path, data: JSON.parse(text) }];
    }
    if (!path.endsWith(".mdx")) return [];
    const title = /^title:\s*(.+)$/m.exec(text)?.[1]?.replace(/^"|"$/g, "");
    return [{ type: "page", path, data: { title } }];
  });
}

/** The English docs, as lib/source.ts builds them (translations left out). */
function buildSource() {
  const files = contentFiles().filter((file) => !translationLocale(file.path));
  return loader({ baseUrl: "/docs", source: { files } });
}

/** Every language, as lib/source.ts `localizedSource` builds them. */
function buildLocalizedSource() {
  return loader({
    baseUrl: "/docs",
    source: { files: contentFiles() },
    i18n: docsI18n,
    url: (slugs, locale) => docsUrl(slugs, (locale ?? "en") as Locale),
  });
}

const source = buildSource();
const pageUrls = new Set(source.getPages().map((page) => page.url));

const tabFolders = (tree: Root) =>
  tree.children.filter(
    (node): node is Extract<Node, { type: "folder" }> =>
      node.type === "folder" && node.root === true,
  );

function urlsIn(nodes: Node[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === "page" && !node.url.startsWith("/docs")) continue;
    if (node.type === "page") out.push(node.url);
    if (node.type === "folder") {
      if (node.index) out.push(node.index.url);
      urlsIn(node.children, out);
    }
  }
  return out;
}

describe("docs URLs", () => {
  it.each(LEGACY_URLS)("%s still resolves", (url) => {
    const redirect = DOCS_REDIRECTS.find((r) => r.source === url);
    expect(pageUrls.has(url) || Boolean(redirect)).toBe(true);
  });

  it("redirects land on pages that exist", () => {
    for (const redirect of DOCS_REDIRECTS) {
      expect(pageUrls.has(redirect.destination), redirect.destination).toBe(
        true,
      );
      // Never redirect away from a page that still exists.
      expect(pageUrls.has(redirect.source), redirect.source).toBe(false);
    }
  });
});

describe("docs tabs", () => {
  const tree = source.pageTree as Root;

  it("puts the docs home first, then the five tabs in order", () => {
    expect(tree.children[0]).toMatchObject({ type: "page", url: "/docs" });
    expect(tabFolders(tree).map((tab) => tab.name)).toEqual(TABS);
    expect(tree.children).toHaveLength(1 + TABS.length);
  });

  it("lists every page in exactly one tab", () => {
    // Pages no meta.json lists end up in the fallback tree, outside the tabs.
    expect(urlsIn(tree.fallback?.children ?? [])).toEqual([]);
    const listed = tabFolders(tree).flatMap((tab) => urlsIn(tab.children));
    expect(new Set(listed).size).toBe(listed.length);
    expect(new Set([...listed, "/docs"])).toEqual(pageUrls);
  });

  it("keeps help articles in the Help tab and under /docs/help", () => {
    const help = tabFolders(tree).find((tab) => tab.name === "Help");
    const urls = urlsIn(help?.children ?? []);
    expect(urls.length).toBeGreaterThan(30);
    for (const url of urls) expect(url.startsWith("/docs/help")).toBe(true);
    const elsewhere = [...pageUrls].filter(
      (url) => url.startsWith("/docs/help") && !urls.includes(url),
    );
    expect(elsewhere).toEqual([]);
  });

  it("files guides, webhooks and library pages under the right tab", () => {
    const tabOf = (url: string) =>
      tabFolders(tree).find((tab) => urlsIn(tab.children).includes(url))?.name;
    expect(tabOf("/docs/dynamic-qr-codes")).toBe("Guides");
    expect(tabOf("/docs/webhooks")).toBe("Developers");
    expect(tabOf("/docs/developers/shadcn")).toBe("React library");
    expect(tabOf("/docs/features/logos")).toBe("React library");
    expect(tabOf("/docs/self-hosting")).toBe("Self-hosting");
  });

  it("gives each tab a link to its first page and the URLs it covers", () => {
    const tabs = docsTabs(tree);
    expect(tabs.map((tab) => tab.title)).toEqual(TABS);
    expect(tabs.map((tab) => tab.url)).toEqual([
      "/docs/help",
      "/docs/dynamic-qr-codes",
      "/docs/developers",
      "/docs/getting-started",
      "/docs/self-hosting",
    ]);
    const guides = tabs.find((tab) => tab.title === "Guides");
    expect(guides?.urls?.has("/docs/smart-routing")).toBe(true);
    expect(guides?.urls?.has("/docs/help")).toBe(false);
  });

  it("drops a hidden help article without dropping its tab", () => {
    const hidden = "/docs/help/domains/custom-domains";
    const filtered = filterPageTree(tree, (url) => url !== hidden);
    const help = docsTabs(filtered).find((tab) => tab.title === "Help");
    expect(help?.urls?.has(hidden)).toBe(false);
    expect(help?.urls?.has("/docs/help")).toBe(true);
  });
});

describe("docs in other languages", () => {
  const localized = buildLocalizedSource();
  const translated = DOCS_LOCALES.filter((locale) => locale !== "en");

  it.each(translated)(
    "%s has every English page at its own URL, in the same tabs",
    (locale) => {
      const tree = localized.getPageTree(locale);
      const prefix = docsUrl([], locale);
      const urls = new Set(
        localized.getPages(locale).map((page) => page.url),
      );
      // Untranslated pages fall back to English, so nothing is missing.
      expect(
        new Set([...urls].map((url) => englishDocsPath(url))),
      ).toEqual(pageUrls);
      // The same tree as English once its URLs lose the prefix.
      const english = (nodes: Node[]): Node[] =>
        nodes.map((node): Node => {
          if (node.type === "page") {
            return { ...node, url: englishDocsPath(node.url) };
          }
          if (node.type !== "folder") return node;
          return {
            ...node,
            index: node.index && {
              ...node.index,
              url: englishDocsPath(node.index.url),
            },
            children: english(node.children),
          };
        });
      expect(tabFolders(tree)).toHaveLength(TABS.length);
      expect(urlsIn(english(tree.fallback?.children ?? []))).toEqual([]);
      const listed = tabFolders(tree).flatMap((tab) =>
        urlsIn(english(tab.children)),
      );
      expect(new Set(listed).size).toBe(listed.length);
      expect(new Set([...listed, "/docs"])).toEqual(pageUrls);
      expect(tree.children[0]).toMatchObject({ type: "page", url: prefix });
      // The tabs are named in the language (meta.<locale>.json).
      expect(tabFolders(tree).map((tab) => tab.name)).not.toEqual(TABS);
    },
  );
});
