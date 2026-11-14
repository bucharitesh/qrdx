// The docs' catalogs, for an app that can't import the main app's: the copy
// in messages/<locale>.json that DOCS_MESSAGES_COMMAND writes before that app
// builds or starts (messages.ts). English is the source; a key a translation
// lacks falls back to English, so a slip never shows a raw key.
import { DEFAULT_LOCALE, type Locale } from "./config";
import {
  DOCS_MESSAGES_COMMAND,
  DOCS_MESSAGES_DIR,
  mergeMessages,
} from "./messages";

type Catalog = Record<string, unknown>;

/** A docs catalog: DOCS_NAMESPACES of a language's apps/app/messages file. */
export type DocsMessages = Record<string, Catalog>;

/** Reads one language's file of the copy; rejects when it isn't there. */
export type DocsMessagesReader = (locale: Locale) => Promise<unknown>;

/** The copy, as written: found by path, so a new language needs no code here. */
const readCopy: DocsMessagesReader = async (locale) =>
  (await import(`./messages/${locale}.json`)).default;

const isCatalog = (value: unknown): value is Catalog =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function readFile(
  locale: Locale,
  read: DocsMessagesReader
): Promise<Catalog> {
  let file: unknown;
  try {
    file = await read(locale);
  } catch (cause) {
    throw new Error(
      `${DOCS_MESSAGES_DIR}/${locale}.json is missing: run \`${DOCS_MESSAGES_COMMAND}\` first`,
      { cause }
    );
  }
  if (!isCatalog(file)) {
    throw new Error(
      `${DOCS_MESSAGES_DIR}/${locale}.json isn't a catalog: run \`${DOCS_MESSAGES_COMMAND}\` again`
    );
  }
  return file;
}

/**
 * A locale's docs catalog over English. Throws, naming the command, when
 * the copy hasn't been written (every language gets a file, `{}` when it
 * has no catalog). `read` is for tests.
 */
export async function loadDocsMessages(
  locale: Locale,
  read: DocsMessagesReader = readCopy
): Promise<DocsMessages> {
  const english = await readFile(DEFAULT_LOCALE, read);
  if (locale === DEFAULT_LOCALE) return english as DocsMessages;
  return mergeMessages(english, await readFile(locale, read)) as DocsMessages;
}
