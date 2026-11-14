// Writes the copy of the docs' namespaces that @repo/i18n loads
// (packages/i18n/messages/<locale>.json) for an app that can't import this
// one (the docs site). This app's catalogs (messages/<locale>.json) stay the
// only place anyone edits; the copy isn't committed, and that app writes it
// right before it builds or starts (`bun run --filter docs
// i18n:docs-messages`), so it can't go stale between merges.
//
// Node only (the script and tests).
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
import { LOCALES } from "./config";

const REPO = path.resolve(import.meta.dirname, "../../../..");
const SOURCE = path.join(REPO, "apps/docs/messages");
const TARGET = path.join(REPO, DOCS_MESSAGES_DIR);

/**
 * Each file of the copy and its contents: the docs' namespaces of each
 * language's catalog, as two-space JSON with a trailing newline. A language
 * without a catalog gets `{}` (English shows), so a missing file always
 * means the copy wasn't written.
 */
export function docsMessagesFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const locale of LOCALES) {
    const source = path.join(SOURCE, `${locale}.json`);
    const catalog = existsSync(source)
      ? (JSON.parse(readFileSync(source, "utf8")) as Record<string, unknown>)
      : {};
    files.set(
      `${locale}.json`,
      `${JSON.stringify(docsMessages(catalog), null, 2)}\n`,
    );
  }
  return files;
}

/** Writes the copy and removes files no language has any more. Returns what changed. */
export function writeDocsMessages(): string[] {
  const files = docsMessagesFiles();
  const changed: string[] = [];
  mkdirSync(TARGET, { recursive: true });
  for (const [name, text] of files) {
    const file = path.join(TARGET, name);
    if (existsSync(file) && readFileSync(file, "utf8") === text) continue;
    writeFileSync(file, text);
    changed.push(name);
  }
  for (const name of readdirSync(TARGET)) {
    if (!name.endsWith(".json") || files.has(name)) continue;
    rmSync(path.join(TARGET, name));
    changed.push(name);
  }
  return changed;
}
