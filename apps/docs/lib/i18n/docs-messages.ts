// The copy of the docs' namespaces in @repo/i18n
// (packages/i18n/messages/<locale>.json), which an app that can't import
// this one (the docs site) loads with loadDocsMessages(). This app's
// catalogs (messages/<locale>.json) stay the only place anyone edits:
// `bun run --filter docs i18n:docs-messages` writes the copy, i18n:translate
// and i18n:extract write it after every save, and i18n:check and
// tests/i18n/docs-messages.test.ts fail while it's out of date.
//
// Node only (scripts and tests).
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DOCS_MESSAGES_DIR, docsMessages } from "@repo/i18n/messages";
import { LOCALES, type Locale } from "./config";

const REPO = path.resolve(import.meta.dirname, "../../../..");
const SOURCE = path.join(REPO, "apps/docs/messages");
const TARGET = path.join(REPO, DOCS_MESSAGES_DIR);

/** How to bring the copy up to date, for error messages. */
export const DOCS_MESSAGES_COMMAND = "bun run --filter docs i18n:docs-messages";

/**
 * Each copied file's name and contents: the docs' namespaces of each
 * language's catalog, as two-space JSON with a trailing newline. A language
 * without a catalog gets no file (the loader falls back to English).
 */
export function docsMessagesFiles(
  locales: readonly Locale[] = LOCALES,
): Map<string, string> {
  const files = new Map<string, string>();
  for (const locale of locales) {
    const source = path.join(SOURCE, `${locale}.json`);
    if (!existsSync(source)) continue;
    const catalog = JSON.parse(readFileSync(source, "utf8")) as Record<
      string,
      unknown
    >;
    files.set(
      `${locale}.json`,
      `${JSON.stringify(docsMessages(catalog), null, 2)}\n`,
    );
  }
  return files;
}

const written = () =>
  existsSync(TARGET)
    ? readdirSync(TARGET).filter((name) => name.endsWith(".json"))
    : [];

/**
 * Writes the copy for `locales`, or for every language (which also removes
 * files no catalog backs any more). Returns the files it changed.
 */
export function writeDocsMessages(locales?: readonly Locale[]): string[] {
  const files = docsMessagesFiles(locales);
  const changed: string[] = [];
  mkdirSync(TARGET, { recursive: true });
  for (const [name, text] of files) {
    const file = path.join(TARGET, name);
    if (existsSync(file) && readFileSync(file, "utf8") === text) continue;
    writeFileSync(file, text);
    changed.push(name);
  }
  if (!locales) {
    for (const name of written()) {
      if (files.has(name)) continue;
      rmSync(path.join(TARGET, name));
      changed.push(name);
    }
  }
  return changed;
}

/** The copied files that are missing, out of date or no longer backed by a catalog. */
export function staleDocsMessages(): string[] {
  const files = docsMessagesFiles();
  const stale: string[] = [];
  for (const [name, text] of files) {
    const file = path.join(TARGET, name);
    if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
      stale.push(name);
    }
  }
  for (const name of written()) if (!files.has(name)) stale.push(name);
  return stale.sort();
}
