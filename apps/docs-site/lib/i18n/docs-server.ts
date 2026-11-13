import "server-only";

import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { docsLocaleFromSegment } from "./docs";
import type { Messages } from "./messages";

/**
 * The language of a page under app/[lang]/docs, or a 404 for a language
 * without docs (/fr/docs: French links go to /docs) or a first segment
 * that isn't a language.
 */
export async function requireDocsLocale(): Promise<Locale> {
  const locale = docsLocaleFromSegment(await lang());
  if (!locale) notFound();
  return locale;
}

type UiKey = keyof Messages["docs"]["ui"];

/**
 * fumadocs-ui's own strings (search, table of contents, pagination, code
 * copy buttons…), keyed as fumadocs-ui looks them up ("text(note)"), with
 * the copy from the `docs.ui` catalog namespace.
 */
const FUMADOCS_UI: Record<string, UiKey> = {
  "Search(search trigger)": "search",
  "Search(search dialog)": "searchPlaceholder",
  "Open Search(search trigger)(aria-label)": "openSearch",
  "Close Search(search dialog)(aria-label)": "closeSearch",
  "No results found(search dialog)": "noResults",
  "Search failed(search dialog)": "searchFailed",
  "On this page(table of contents)": "onThisPage",
  "No Headings(table of contents)": "noHeadings",
  "Table of Contents(inline table of contents)": "tableOfContents",
  "Last updated on(page footer)": "lastUpdated",
  "Previous Page(pagination)": "previousPage",
  "Next Page(pagination)": "nextPage",
  "Copy Text(code block)(aria-label)": "copyCode",
  "Copied Text(code block)(aria-label)": "copiedCode",
  "Copy Anchor Link(heading anchor)(aria-label)": "copyAnchor",
  "Copied Anchor Link(heading anchor)(aria-label)": "copiedAnchor",
  "Copy Link(accordion)(aria-label)": "copyLink",
  "Copied Link(accordion)(aria-label)": "copiedLink",
  "Toggle Menu(mobile menu)(aria-label)": "toggleMenu",
  "Toggle Theme(theme switcher)(aria-label)": "toggleTheme",
  "Light(theme switcher)(aria-label)": "themeLight",
  "Dark(theme switcher)(aria-label)": "themeDark",
  "System(theme switcher)(aria-label)": "themeSystem",
  "Open Sidebar(sidebar)(aria-label)": "openSidebar",
  "Close Sidebar(sidebar)(aria-label)": "closeSidebar",
  "Close Sidebar(aria-label)": "closeSidebar",
  "Collapse Sidebar(sidebar)(aria-label)": "collapseSidebar",
  "Prop(type table)": "typeTableProp",
  "Type(type table)": "typeTableType",
  "Default(type table)": "typeTableDefault",
  "Parameters(type table)": "typeTableParameters",
  "Returns(type table)": "typeTableReturns",
};

/** The fumadocs-ui strings in `locale`; undefined in English (its defaults). */
export async function fumadocsTranslations(
  locale: Locale,
): Promise<Record<string, string> | undefined> {
  if (locale === DEFAULT_LOCALE) return undefined;
  const t = await getTranslations({ locale, namespace: "docs.ui" });
  return Object.fromEntries(
    Object.entries(FUMADOCS_UI).map(([key, message]) => [key, t(message)]),
  );
}
