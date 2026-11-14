import { notFound } from "next/navigation";
import {
  docsIndex,
  isTranslatedPage,
  localizedDocsIndex,
} from "@/lib/docs-index";
import { getLLMText } from "@/lib/get-llm-text";
import { DEFAULT_LOCALE, LOCALE_INFO } from "@/lib/i18n/config";
import { docsLocaleFromSegment } from "@/lib/i18n/docs";
import { onDemandParams } from "@/lib/static-params";

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
  const page = localizedDocsIndex().getPage(slugs, locale);
  if (!page) notFound();
  const text = isTranslatedPage(page)
    ? await getLLMText(page)
    : await getLLMText(docsIndex().getPage(slugs) ?? page);

  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Language": isTranslatedPage(page)
        ? (LOCALE_INFO[locale].hreflang[0] as string)
        : "en",
    },
  });
}

// None at build: each page renders on its first request and is cached
// (lib/static-params.ts). Unknown pages answer notFound() above.
export function generateStaticParams() {
  return onDemandParams();
}
