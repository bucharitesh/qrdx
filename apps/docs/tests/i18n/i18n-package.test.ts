// @repo/i18n (packages/i18n) holds the languages, URLs and docs rules the
// docs site shares with this app, and loads the docs' messages from a copy
// of their namespaces (lib/i18n/docs-messages.ts writes it from messages/
// before the docs site builds; it isn't committed). Built in memory here,
// the copy must load like this app's catalogs and cover every namespace the
// docs read; the old lib/i18n paths must give the package's own values.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as packageConfig from "@repo/i18n/config";
import * as packageDocs from "@repo/i18n/docs";
import {
  type DocsMessagesReader,
  loadDocsMessages,
} from "@repo/i18n/docs-messages";
import { createDocsSeo } from "@repo/i18n/docs-seo";
import {
  DOCS_MESSAGES_COMMAND,
  DOCS_NAMESPACES,
  pickMessages,
} from "@repo/i18n/messages";
import * as packagePaths from "@repo/i18n/paths";
import * as packageRouting from "@repo/i18n/routing";
import { describe, expect, it } from "vitest";
import * as config from "@/lib/i18n/config";
import * as docs from "@/lib/i18n/docs";
import { docsMessagesFiles } from "@/lib/i18n/docs-messages";
import { docsPageSeo } from "@/lib/i18n/docs-seo";
import { loadMessages } from "@/lib/i18n/messages";
import * as paths from "@/lib/i18n/paths";
import * as routing from "@/lib/i18n/routing";
import { baseUrl } from "@/lib/metadata";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** The copy as `i18n:docs-messages` would write it, without the disk. */
const files = docsMessagesFiles();
const inMemory: DocsMessagesReader = (locale) => {
  const text = files.get(`${locale}.json`);
  return text === undefined
    ? Promise.reject(new Error(`no ${locale}.json`))
    : Promise.resolve(JSON.parse(text));
};

describe("the docs' copy of their messages", () => {
  it("has a file for every language, with the docs' namespaces only", () => {
    expect([...files.keys()].sort()).toEqual(
      config.LOCALES.map((locale) => `${locale}.json`).sort(),
    );
    const english = JSON.parse(files.get("en.json") as string) as object;
    expect(Object.keys(english).sort()).toEqual([...DOCS_NAMESPACES].sort());
    for (const text of files.values()) {
      expect(text.endsWith("}\n")).toBe(true);
      for (const name of Object.keys(JSON.parse(text) as object)) {
        expect(DOCS_NAMESPACES).toContain(name);
      }
    }
  });

  it.each(config.LOCALES)("loads %s like this app does", async (locale) => {
    const app = pickMessages(await loadMessages(locale), DOCS_NAMESPACES);
    expect(await loadDocsMessages(locale, inMemory)).toEqual(app);
  });

  it("names the command when the copy wasn't written", async () => {
    const nothing: DocsMessagesReader = () =>
      Promise.reject(new Error("ENOENT"));
    await expect(loadDocsMessages("es", nothing)).rejects.toThrow(
      `packages/i18n/messages/en.json is missing: run \`${DOCS_MESSAGES_COMMAND}\` first`,
    );
    const englishOnly: DocsMessagesReader = (locale) =>
      locale === "en" ? inMemory(locale) : nothing(locale);
    await expect(loadDocsMessages("es", englishOnly)).rejects.toThrow(
      "packages/i18n/messages/es.json is missing",
    );
  });

  it("covers every namespace the docs read", () => {
    const read = docsNamespaces();
    expect(read.size).toBeGreaterThan(0);
    for (const [namespace, readers] of read) {
      expect(
        DOCS_NAMESPACES,
        `${readers.join(", ")} read "${namespace}": add it to DOCS_NAMESPACES (packages/i18n/messages.ts)`,
      ).toContain(namespace);
    }
  });
});

describe("the old lib/i18n paths", () => {
  /** Every export of `shim` is the package module's own value. */
  const reexports = (
    shim: Record<string, unknown>,
    module: Record<string, unknown>,
    added: readonly string[] = [],
  ) => {
    expect(Object.keys(shim).sort()).toEqual(
      [...Object.keys(module), ...added].sort(),
    );
    for (const name of Object.keys(module)) {
      expect(shim[name], name).toBe(module[name]);
    }
  };

  it("are the package's modules", () => {
    reexports(config, packageConfig);
    reexports(paths, packagePaths);
    reexports(routing, packageRouting);
    reexports(docs, packageDocs, ["docsI18n"]);
    expect(docs.docsI18n).toMatchObject(packageDocs.docsI18nOptions);
  });

  it("write docs URLs on this app's origin", () => {
    const seo = docsPageSeo({
      slugs: ["help"],
      locale: "es",
      translated: ["en", "es"],
    });
    expect(seo.canonical).toBe(new URL("/es/docs/help", baseUrl).toString());
    const other = createDocsSeo("https://docs.example.com").docsPageSeo({
      slugs: ["help"],
      locale: "es",
      translated: ["en", "es"],
    });
    expect(other.canonical).toBe("https://docs.example.com/es/docs/help");
  });
});

/**
 * The top-level message namespaces read by the docs' routes and everything
 * they import (the app's own files, through `@/` and relative imports).
 */
function docsNamespaces(): Map<string, string[]> {
  const entries = [
    "app/[lang]/docs",
    "app/docs-md",
    "app/llms.mdx",
    "app/og/docs",
    "app/api/search",
    "app/llms-full.txt",
    "mdx-components.tsx",
    // Imported by docs pages (content/docs), not by code.
    "components/docs/help-home.tsx",
    "components/docs/qr-catalog.tsx",
  ].map((entry) => path.join(ROOT, entry));
  const files: string[] = [];
  const walk = (file: string) => {
    if (statSync(file).isDirectory()) {
      for (const name of readdirSync(file)) walk(path.join(file, name));
    } else if (/\.tsx?$/.test(file)) files.push(file);
  };
  for (const entry of entries) walk(entry);

  const resolve = (from: string, specifier: string) => {
    const base = specifier.startsWith("@/")
      ? path.join(ROOT, specifier.slice(2))
      : specifier.startsWith(".")
        ? path.resolve(path.dirname(from), specifier)
        : undefined;
    if (!base) return undefined;
    return ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
      .map((suffix) => `${base}${suffix}`)
      .find((candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate));
  };

  const seen = new Set<string>();
  const namespaces = new Map<string, string[]>();
  const queue = [...files];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(
      /(?:from|import)\s*\(?\s*["']([^"']+)["']/g,
    )) {
      const target = resolve(file, specifier as string);
      if (target) queue.push(target);
    }
    for (const match of source.matchAll(
      /(?:useTranslations|getTranslations)\(\s*(?:["']([^"']+)["']|\{[^}]*namespace:\s*["']([^"']+)["'])/g,
    )) {
      const namespace = (match[1] ?? match[2] ?? "").split(".")[0] as string;
      const list = namespaces.get(namespace) ?? [];
      list.push(path.relative(ROOT, file));
      namespaces.set(namespace, list);
    }
  }
  return namespaces;
}
