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
import { TypeTable } from "fumadocs-ui/components/type-table";
import { DocsPage, PageLastUpdate } from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
import { baseUrl, createMetadata, siteName } from "@/lib/metadata";
import { brandedTitle, seoOverride } from "@/lib/seo-overrides";
import { type Page as DocsPageData, getPageImage, source } from "@/lib/source";
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
function docsCrumbs(page: DocsPageData): Crumb[] {
  const crumbs: Crumb[] = [
    { name: "Home", path: "/" },
    { name: "Docs", path: "/docs" },
  ];
  for (let depth = 1; depth < page.slugs.length; depth++) {
    const parent = source.getPage(page.slugs.slice(0, depth));
    if (parent) crumbs.push({ name: parent.data.title, path: parent.url });
  }
  if (page.slugs.length > 0) {
    crumbs.push({ name: page.data.title, path: page.url });
  }
  return crumbs;
}

function techArticleSchema(page: DocsPageData) {
  const url = (path: string) => new URL(path, baseUrl).toString();
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.data.title,
    description: page.data.description,
    url: url(page.url),
    image: url(getPageImage(page).url),
    inLanguage: "en",
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

const _generator = createGenerator();

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);

  if (!page) notFound();

  const { body: Mdx, toc, preview } = page.data;

  return (
    <DocsPage
      toc={toc}
      // API reference pages (frontmatter `full`) need the width for Try it.
      full={page.data.full}
      tableOfContent={{
        style: "clerk",
      }}
    >
      <JsonLd data={techArticleSchema(page)} />
      {page.slugs.length > 0 && (
        <JsonLd data={breadcrumbSchema(docsCrumbs(page))} />
      )}
      <h1 className="text-[1.75em] font-semibold">{page.data.title}</h1>
      <p className="text-lg text-fd-muted-foreground mb-2">
        {page.data.description}
      </p>
      <div className="flex flex-row flex-wrap gap-2 items-center border-b pb-6">
        <LLMCopyButton markdownUrl={`${page.url}.mdx`} />
        <ViewOptions
          markdownUrl={`${page.url}.mdx`}
          githubUrl={`https://github.com/${owner}/${repo}/blob/main/apps/docs/content/docs/${page.path}`}
        />
      </div>
      <div className="prose flex-1 text-fd-foreground/90">
        {preview ? <PreviewRenderer preview={preview} /> : null}
        <Mdx
          components={getMDXComponents({
            ...Twoslash,
            a: ({ href, ...props }) => {
              const found = source.getPageByHref(href ?? "", {
                dir: PathUtils.dirname(page.path),
              });

              if (!found) return <Link href={href} {...props} />;

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
            Mermaid,
            TypeTable,
            Wrapper,
            blockquote: Callout as unknown as FC<ComponentProps<"blockquote">>,
          })}
        />
      </div>
      {page.data.lastModified && (
        <PageLastUpdate date={page.data.lastModified} />
      )}
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return await source.generateParams();
}

export async function generateMetadata(
  props: PageProps<"/docs/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  // A search title of its own where the sidebar title competes with the
  // marketing pages (lib/seo-overrides.ts).
  const seo = seoOverride(page.url);

  return createMetadata({
    title: brandedTitle(seo.title ?? page.data.title, " | QRdx Docs"),
    description: seo.description ?? page.data.description,
    path: page.url,
    openGraph: {
      images: getPageImage(page).url,
    },
    // The page as Markdown (app/llms.mdx), for agents.
    alternates: {
      types: {
        "text/markdown": new URL(`${page.url}.md`, baseUrl).toString(),
      },
    },
  });
}
