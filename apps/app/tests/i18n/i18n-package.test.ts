// @repo/i18n (packages/i18n) holds the languages, URLs and docs rules the
// docs site shares with this app, and loads the docs' messages from a copy
// of their namespaces (lib/i18n/docs-messages.ts writes it from messages/
// before the docs site builds; it isn't committed). Built in memory here,
// the copy must load like this app's catalogs (the docs site checks it
// covers every namespace it reads).
import * as config from "@repo/i18n/config";
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
import { describe, expect, it } from "vitest";
import { docsMessagesFiles } from "@/lib/i18n/docs-messages";
import { loadMessages } from "@/lib/i18n/messages";

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
});

describe("createDocsSeo", () => {
  it("writes docs URLs on the origin it's given", () => {
    const seo = createDocsSeo("https://docs.example.com").docsPageSeo({
      slugs: ["help"],
      locale: "es",
      translated: ["en", "es"],
    });
    expect(seo.canonical).toBe("https://docs.example.com/es/docs/help");
  });
});
