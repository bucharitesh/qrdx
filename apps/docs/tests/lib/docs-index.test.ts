// lib/docs-index.ts: the docs as the route handlers see them, built from
// .source/docs-index (lib/docs-index-plugin.ts) instead of compiled MDX.
// Same URLs and fallbacks as lib/source.ts, Markdown and search data read
// from the index, dates revived.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const root = mkdtempSync(join(tmpdir(), "docs-index-"));
const dir = join(root, ".source/docs-index");
mkdirSync(dir, { recursive: true });

const page = (path: string, title: string, extra = {}) => ({
  type: "page",
  path,
  absolutePath: `content/docs/${path}`,
  data: { title, description: `${title} description`, ...extra },
});
writeFileSync(
  join(dir, "pages.json"),
  JSON.stringify({
    files: [
      page("index.mdx", "Introduction", {
        lastModified: "2026-11-01T10:00:00.000Z",
      }),
      page("guides/start.mdx", "Start"),
      page("guides/start.es.mdx", "Empezar"),
      page("guides/other.mdx", "Other"),
      {
        type: "meta",
        path: "guides/meta.json",
        absolutePath: "content/docs/guides/meta.json",
        data: { title: "Guides", pages: ["start", "other"] },
      },
    ],
  }),
);
writeFileSync(
  join(dir, "markdown.json"),
  JSON.stringify({
    "index.mdx": "Welcome.\n",
    "guides/start.mdx": "Start here.\n",
    "guides/start.es.mdx": "Empieza aquí.\n",
    "guides/other.mdx": "Other.\n",
  }),
);
writeFileSync(
  join(dir, "search.json"),
  JSON.stringify({
    "index.mdx": { headings: [], contents: [] },
    "guides/start.mdx": {
      headings: [],
      contents: [{ heading: undefined, content: "Start here." }],
    },
    "guides/start.es.mdx": { headings: [], contents: [] },
    "guides/other.mdx": { headings: [], contents: [] },
  }),
);

vi.spyOn(process, "cwd").mockReturnValue(root);
const {
  docsIndex,
  docsPageLocales,
  getPageImage,
  isTranslatedPage,
  localizedDocsIndex,
} = await import("@/lib/docs-index");

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("docs index", () => {
  it("lists the English pages at their URLs", () => {
    const urls = docsIndex()
      .getPages()
      .map((p) => p.url)
      .sort();
    expect(urls).toEqual(["/docs", "/docs/guides/other", "/docs/guides/start"]);
  });

  it("gives each language its URLs, with English where untranslated", () => {
    const start = localizedDocsIndex().getPage(["guides", "start"], "es");
    expect(start?.url).toBe("/es/docs/guides/start");
    expect(start?.data.title).toBe("Empezar");
    expect(start && isTranslatedPage(start)).toBe(true);

    const other = localizedDocsIndex().getPage(["guides", "other"], "es");
    expect(other?.url).toBe("/es/docs/guides/other");
    expect(other?.data.title).toBe("Other");
    expect(other && isTranslatedPage(other)).toBe(false);
  });

  it("knows which languages a page is translated into", () => {
    expect(docsPageLocales(["guides", "start"])).toEqual(["en", "es"]);
    expect(docsPageLocales(["guides", "other"])).toEqual(["en"]);
  });

  it("reads the Markdown and search data from the index", async () => {
    const start = docsIndex().getPage(["guides", "start"]);
    expect(await start?.data.getText("processed")).toBe("Start here.\n");
    expect((await start?.data.structuredData())?.contents).toHaveLength(1);
    const es = localizedDocsIndex().getPage(["guides", "start"], "es");
    expect(await es?.data.getText("processed")).toBe("Empieza aquí.\n");
  });

  it("keeps the sidebar order and folder names from meta.json", () => {
    const tree = docsIndex().pageTree;
    const guides = tree.children.find((node) => node.type === "folder");
    expect(guides?.name).toBe("Guides");
    expect(
      guides?.type === "folder" &&
        guides.children.map((node) => node.type === "page" && node.url),
    ).toEqual(["/docs/guides/start", "/docs/guides/other"]);
  });

  it("turns dates back into dates", () => {
    expect(docsIndex().getPage([])?.data.lastModified).toEqual(
      new Date("2026-11-01T10:00:00.000Z"),
    );
    expect(docsIndex().getPage(["guides", "start"])?.data.lastModified).toBe(
      undefined,
    );
  });

  it("points Open Graph images at app/og/docs", () => {
    expect(getPageImage({ slugs: ["guides", "start"] }).url).toBe(
      "/og/docs/guides/start/image.png",
    );
  });
});
