import { notFound } from "next/navigation";
import { prerenderScope } from "@/lib/static-params";
import { DEFAULT_LOCALE, LOCALE_INFO, localeFromSegment } from "./config";

/**
 * The [lang] params a build prerenders: English only. The other languages
 * render on their first request and are cached from then on
 * (lib/static-params.ts); they're noindex until a native speaker reviews
 * them, so few people open them. None under `next dev`.
 *
 * Listed by the root layout (app/[lang]/layout.tsx): Next calls each page's
 * generateStaticParams once per language listed here, so a page that lists
 * only its own segment ({ type }) is prerendered in English.
 */
export function localeParams(): { lang: string }[] {
  if (prerenderScope() === "none") return [];
  return [{ lang: LOCALE_INFO[DEFAULT_LOCALE].segment }];
}

/** A 404 for a first segment that isn't a locale (/pricng/opengraph-image). */
export async function requireLocaleParam(
  params: Promise<{ lang: string }>,
): Promise<void> {
  if (!localeFromSegment((await params).lang)) notFound();
}
