import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@repo/design-system/components/ui/hover-card";
import Link from "fumadocs-core/link";
import { PathUtils } from "fumadocs-core/source";
import * as Twoslash from "fumadocs-twoslash/ui";
import { createGenerator } from "fumadocs-typescript";
import { Callout } from "fumadocs-ui/components/callout";
import { Card } from "fumadocs-ui/components/card";
import { TypeTable } from "fumadocs-ui/components/type-table";
import { DocsPage, PageLastUpdate } from "fumadocs-ui/page";
import { LanguageSquare } from "iconsax-reactjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps, FC, ReactNode } from "react";
import { LLMCopyButton, ViewOptions } from "@/components/ai/page-actions";
import { Mermaid } from "@/components/mdx/mermaid";
import * as Preview from "@/components/preview";
import { Wrapper } from "@/components/preview/wrapper";
import {
  breadcrumbSchema,
  type Crumb,
  JsonLd,
} from "@/components/sections/tools/json-ld";
import { owner, repo } from "@/lib/github";
import { DEFAULT_LOCALE, LOCALE_INFO, type Locale } from "@/lib/i18n/config";
import { docsLocaleFromSegment, docsUrl } from "@/lib/i18n/docs";
import { docsPageSeo } from "@/lib/i18n/docs-seo";
import { requireDocsLocale } from "@/lib/i18n/docs-server";
import { localizeHref, localizePath } from "@/lib/i18n/paths";
import { baseUrl, createMetadata, siteName } from "@/lib/metadata";
import { brandedTitle, seoOverride } from "@/lib/seo-overrides";
import {
  docsPageLocales,
  getPageImage,
  isTranslatedPage,
  type LocalizedPage,
  localizedSource,
  source,
} from "@/lib/source";
import { buildTimeParams } from "@/lib/static-params";
import { getMDXComponents } from "@/mdx-components";

function PreviewRenderer({ preview }: { preview: string }): ReactNode {
  if (preview && preview in Preview) {
    const Comp = Preview[preview as keyof typeof Preview];
    return <Comp />;
  }

  return null;
}

export const revalidate = false;

/** Home, the docs home, each parent page that exists, then this page. */
async function docsCrumbs(
  page: LocalizedPage,
  locale: Locale,
): Promise<Crumb[]> {
  const t = await getTranslations({ locale, namespace: "docs.breadcrumb" });
  const crumbs: Crumb[] = [
    { name: t("home"), path: localizePath("/", locale) },
    { name: t("docs"), path: docsUrl([], locale) },
  ];
  for (let depth = 1; depth < page.slugs.length; depth++) {
    const parent = localizedSource.getPage(page.slugs.slice(0, depth), locale);
    if (parent) crumbs.push({ name: parent.data.title, path: parent.url });
  }
  if (page.slugs.length > 0) {
    crumbs.push({ name: page.data.title, path: page.url });
  }
  return crumbs;
}

function techArticleSchema(page: LocalizedPage, language: Locale) {
  const url = (path: string) => new URL(path, baseUrl).toString();
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.data.title,
    description: page.data.description,
    url: url(page.url),
    image: url(getPageImage(page).url),
    inLanguage: LOCALE_INFO[language].hreflang[0],
    ...(page.data.lastModified && {
      dateModified: new Date(page.data.lastModified).toISOString(),
    }),
    isPartOf: { "@type": "WebSite", name: siteName, url: url("/") },
    publisher: {
      "@type": "Organization",
      name: siteName,
      url: url("/"),
      logo: url("/logo.png"),
    },
  };
}

/** The page's Markdown (app/llms.mdx in English, app/docs-md otherwise). */
function markdownUrl(page: LocalizedPage, locale: Locale): string {
  const translated = locale !== DEFAULT_LOCALE && isTranslatedPage(page);
  return `${translated ? page.url : docsUrl(page.slugs, DEFAULT_LOCALE)}.md`;
}

/** A card linking to a page by its English URL, in the docs' language. */
async function LocalizedCard({ href, ...props }: ComponentProps<typeof Card>) {
  const locale = (await getLocale()) as Locale;
  return <Card href={href ? localizeHref(href, locale) : href} {...props} />;
}

/** "This page isn't translated yet": English text at another language's URL. */
async function UntranslatedNote({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "docs.untranslated" });
  return (
    <div
      className="not-prose flex items-start gap-3 rounded-xl border bg-fd-card p-4 text-sm"
      role="note"
    >
      <LanguageSquare
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-fd-muted-foreground"
      />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium text-fd-foreground">{t("title")}</p>
        <p className="text-fd-muted-foreground">{t("body")}</p>
      </div>
    </div>
  );
}

const _generator = createGenerator();

export default async function Page(
  props: PageProps<"/[lang]/docs/[[...slug]]">,
) {
  const locale = await requireDocsLocale();
  const params = await props.params;
  const page = localizedSource.getPage(params.slug, locale);

  if (!page) notFound();

  const { body: Mdx, toc, preview } = page.data;
  // English text at another language's URL, until it's translated.
  const fallback = locale !== DEFAULT_LOCALE && !isTranslatedPage(page);
  const language: Locale = fallback ? DEFAULT_LOCALE : locale;
  const markdown = markdownUrl(page, locale);

  return (
    <DocsPage
      toc={toc}
      // API reference pages (frontmatter `full`) need the width for Try it.
      full={page.data.full}
      tableOfContent={{
        style: "clerk",
      }}
    >
      <JsonLd data={techArticleSchema(page, language)} />
      {page.slugs.length > 0 && (
        <JsonLd data={breadcrumbSchema(await docsCrumbs(page, locale))} />
      )}
      {fallback && <UntranslatedNote locale={locale} />}
      <div className="contents" lang={fallback ? DEFAULT_LOCALE : undefined}>
        <h1 className="text-[1.75em] font-semibold">{page.data.title}</h1>
        <p className="text-lg text-fd-muted-foreground mb-2">
          {page.data.description}
        </p>
        <div className="flex flex-row flex-wrap gap-2 items-center border-b pb-6">
          <LLMCopyButton markdownUrl={markdown} />
          <ViewOptions
            markdownUrl={markdown}
            githubUrl={`https://github.com/${owner}/${repo}/blob/main/apps/docs/content/docs/${page.path}`}
          />
        </div>
        <div className="prose flex-1 text-fd-foreground/90">
          {preview ? <PreviewRenderer preview={preview} /> : null}
          <Mdx
            components={getMDXComponents({
              ...Twoslash,
              a: ({ href, ...props }) => {
                const found = localizedSource.getPageByHref(href ?? "", {
                  dir: PathUtils.dirname(page.path),
                  language: locale,
                });

                // Other site pages: their translation where one exists.
                if (!found) {
                  return (
                    <Link
                      href={href ? localizeHref(href, locale) : href}
                      {...props}
                    />
                  );
                }

                return (
                  <HoverCard>
                    <HoverCardTrigger
                      href={
                        found.hash
                          ? `${found.page.url}#${found.hash}`
                          : found.page.url
                      }
                      {...props}
                    >
                      {props.children}
                    </HoverCardTrigger>
                    <HoverCardContent className="text-sm">
                      <p className="font-medium">{found.page.data.title}</p>
                      <p className="text-fd-muted-foreground">
                        {found.page.data.description}
                      </p>
                    </HoverCardContent>
                  </HoverCard>
                );
              },
              Card: LocalizedCard,
              Mermaid,
              TypeTable,
              Wrapper,
              blockquote: Callout as unknown as FC<
                ComponentProps<"blockquote">
              >,
            })}
          />
        </div>
      </div>
      {page.data.lastModified && (
        <PageLastUpdate date={page.data.lastModified} />
      )}
    </DocsPage>
  );
}

/**
 * Every page in the language Next passes down: it calls this once per
 * [lang] the root layout lists, which is English only
 * (lib/i18n/static-params.ts). The translated docs render on their first
 * request and are cached; a language without docs answers 404 there
 * (requireDocsLocale), and so do unknown pages (notFound() above,
 * lib/static-params.ts). Keep the list non-empty for every [lang] the
 * layout lists: Next drops the whole route's list when one language
 * returns no pages.
 */
export function generateStaticParams({
  params,
}: {
  params: Awaited<LayoutProps<"/[lang]">["params"]>;
}) {
  return buildTimeParams(() => {
    const locale = docsLocaleFromSegment(params.lang);
    if (!locale) return [];
    return localizedSource
      .getPages(locale)
      .map((page) => ({ slug: page.slugs }));
  });
}

export async function generateMetadata(
  props: PageProps<"/[lang]/docs/[[...slug]]">,
): Promise<Metadata> {
  const locale = await requireDocsLocale();
  const params = await props.params;
  const page = localizedSource.getPage(params.slug, locale);
  if (!page) {
    notFound();
  }
  const seo = docsPageSeo({
    slugs: page.slugs,
    locale,
    translated: docsPageLocales(page.slugs),
  });
  const english = locale === DEFAULT_LOCALE || seo.fallback;
  const t = await getTranslations({ locale, namespace: "docs.meta" });

  // A search title of its own where the sidebar title competes with the
  // marketing pages (lib/seo-overrides.ts). English copy, so English only.
  const override = english ? seoOverride(docsUrl(page.slugs, "en")) : {};
  const englishPage = source.getPage(page.slugs);

  const metadata = createMetadata({
    title: brandedTitle(
      override.title ?? page.data.title,
      english ? " | QRdx Docs" : ` | ${t("titleSuffix")}`,
    ),
    description: override.description ?? page.data.description,
    path: page.url,
    openGraph: {
      images: getPageImage(englishPage ?? page).url,
    },
    // The page as Markdown (app/llms.mdx, app/docs-md), for agents.
    alternates: {
      types: {
        "text/markdown": new URL(markdownUrl(page, locale), baseUrl).toString(),
      },
    },
  });

  return {
    ...metadata,
    ...(seo.robots && { robots: seo.robots }),
    alternates: {
      ...metadata.alternates,
      canonical: seo.canonical,
      ...(seo.languages && { languages: seo.languages }),
    },
    openGraph: {
      ...metadata.openGraph,
      locale: seo.ogLocale,
      ...(seo.alternateOgLocales.length > 0 && {
        alternateLocale: seo.alternateOgLocales,
      }),
    },
  };
}
