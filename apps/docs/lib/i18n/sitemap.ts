// Sitemap entries for a translated page (Google's sitemap form of hreflang):
// one <url> per indexable language, each with every language and x-default
// as xhtml:link alternates. Machine translations a native reviewer hasn't
// signed off are left out (lib/i18n/review.ts), and so are their alternates.
import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/metadata";
import { DEFAULT_LOCALE } from "./config";
import { alternateLanguages } from "./metadata";
import { localizePath } from "./paths";
import { publishedLocales, REVIEW, type ReviewTable } from "./review";

type Entry = MetadataRoute.Sitemap[number];

/** Translations rank a little below the English page. */
const TRANSLATION_PRIORITY = 0.9;

export function localizedEntries(
  path: string,
  entry: Omit<Entry, "url" | "alternates">,
  review: ReviewTable = REVIEW,
): Entry[] {
  const languages = alternateLanguages(path, review);
  return publishedLocales(path, review).map((locale) => ({
    ...entry,
    url: new URL(localizePath(path, locale), baseUrl).toString(),
    ...(locale !== DEFAULT_LOCALE &&
      entry.priority !== undefined && {
        priority: Math.round(entry.priority * TRANSLATION_PRIORITY * 100) / 100,
      }),
    ...(languages && { alternates: { languages } }),
  }));
}
