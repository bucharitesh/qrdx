import { notFound } from "next/navigation";
import { buildTimeParams } from "@/lib/static-params";
import { LOCALE_SEGMENTS, localeFromSegment } from "./config";

// Metadata routes under app/[lang] (opengraph-image, twitter-image) don't get
// the root layout's `lang` params, so each lists them itself and is
// prerendered once per language like its page.

/** { lang } for every locale (lib/static-params.ts: none under `next dev`). */
export function localeParams(): { lang: string }[] {
  return buildTimeParams(() =>
    LOCALE_SEGMENTS.map((segment) => ({ lang: segment })),
  );
}

/** A route's own params in every locale: { lang, ...params }. */
export function withLocaleParams<T extends Record<string, string>>(
  params: () => T[],
): (T & { lang: string })[] {
  return buildTimeParams(() =>
    LOCALE_SEGMENTS.flatMap((segment) =>
      params().map((entry) => ({ ...entry, lang: segment })),
    ),
  );
}

/** A 404 for a first segment that isn't a locale (/pricng/opengraph-image). */
export async function requireLocaleParam(
  params: Promise<{ lang: string }>,
): Promise<void> {
  if (!localeFromSegment((await params).lang)) notFound();
}
