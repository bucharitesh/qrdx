import { notFound } from "next/navigation";
import { getLLMText } from "@/lib/get-llm-text";
import { DEFAULT_LOCALE, LOCALE_INFO } from "@/lib/i18n/config";
import { DOCS_LOCALES, docsLocaleFromSegment } from "@/lib/i18n/docs";
import { isTranslatedPage, localizedSource, source } from "@/lib/source";
import { buildTimeParams } from "@/lib/static-params";

export const revalidate = false;

/**
 * A translated docs page as Markdown: /es/docs/<path>.md (and .mdx, and
 * /es/docs/<path> asked for as text/markdown) are rewritten here in
 * next.config.ts. A page that isn't translated yet answers with its English
 * Markdown, as its HTML page shows the English text. English pages are
 * app/llms.mdx; llms.txt and llms-full.txt stay English.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string; slug?: string[] }> },
) {
  const { lang, slug } = await params;
  const locale = docsLocaleFromSegment(lang);
  if (!locale || locale === DEFAULT_LOCALE) notFound();
  // /es/docs/x.md asked for as text/markdown arrives here as x.md.
  const last = slug?.at(-1)?.replace(/\.mdx?$/, "");
  const slugs =
    slug && last !== undefined ? [...slug.slice(0, -1), last] : (slug ?? []);
  const page = localizedSource.getPage(slugs, locale);
  if (!page) notFound();
  const text = isTranslatedPage(page)
    ? await getLLMText(page)
    : await getLLMText(source.getPage(slugs) ?? page);

  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Language": isTranslatedPage(page)
        ? (LOCALE_INFO[locale].hreflang[0] as string)
        : "en",
    },
  });
}

// Translated pages; the English fallbacks render on first request.
export function generateStaticParams() {
  return buildTimeParams(() =>
    DOCS_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).flatMap(
      (locale) =>
        localizedSource
          .getPages(locale)
          .filter(isTranslatedPage)
          .map((page) => ({
            lang: LOCALE_INFO[locale].segment,
            slug: page.slugs,
          })),
    ),
  );
}
