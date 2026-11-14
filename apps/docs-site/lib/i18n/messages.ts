// The docs' message catalogs: the copy of the namespaces the docs read
// (DOCS_NAMESPACES) that @repo/i18n keeps in packages/i18n/messages, written
// from apps/docs/messages before every dev server, build, typecheck and test
// here (scripts/zone-inputs.mjs). English is the source; a key a
// translation lacks falls back to English, so a slip never shows a raw key.
import { type DocsMessages, loadDocsMessages } from "@repo/i18n/docs-messages";
import type { DOCS_NAMESPACES } from "@repo/i18n/messages";
// Types only: the keys and arguments of the namespaces the copy holds, from
// the catalog they're copied from, so a wrong key fails tsc here too.
import type en from "../../../docs/messages/en.json";
import type { Locale } from "./config";

export { mergeMessages, pickMessages } from "@repo/i18n/messages";

export type Messages = Pick<typeof en, (typeof DOCS_NAMESPACES)[number]>;

/** A locale's docs catalog over English (throws, naming the command, if the copy is missing). */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const messages: DocsMessages = await loadDocsMessages(locale);
  return messages as unknown as Messages;
}

/**
 * What every page's client components translate: the parts of the site's
 * shared chrome the docs show (the product links' copy, the language menu
 * and the cookie banner).
 */
export const CHROME_NAMESPACES = [
  "footer",
  "localeSwitcher",
  "consent",
] as const;
