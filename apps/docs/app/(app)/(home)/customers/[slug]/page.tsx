import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogToc } from "@/components/sections/blog/blog-toc";
import { BlogTocMobile } from "@/components/sections/blog/blog-toc-mobile";
import { Breadcrumbs } from "@/components/sections/breadcrumbs";
import { CUSTOMERS_PATH } from "@/lib/customers";
import { brandedTitle } from "@/lib/seo-overrides";
import { buildTimeParams } from "@/lib/static-params";
import { getMDXComponents } from "@/mdx-components";
import { absoluteUrl, formatDate, getReadingTime } from "../../blog/_lib/posts";
import {
  type CustomerStory,
  getCustomerStories,
  getCustomerStory,
} from "../_lib/stories";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function getPublishedStory(slug: string): CustomerStory {
  const story = getCustomerStory(slug);
  if (!story) notFound();
  return story;
}

function buildJsonLd({ customer, page }: CustomerStory) {
  const { title, description, date, updated, image, tags } = page.data;
  const url = absoluteUrl(page.url);
  const qrdx = {
    "@type": "Organization",
    name: "QRdx",
    url: absoluteUrl("/"),
    logo: { "@type": "ImageObject", url: absoluteUrl("/logo.png") },
  };

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: title,
    description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: [absoluteUrl(image)],
    datePublished: date,
    dateModified: updated ?? date,
    articleSection: "Case studies",
    about: { "@type": "Organization", name: customer.name },
    ...(tags && tags.length > 0 && { keywords: tags.join(", ") }),
    author: qrdx,
    publisher: qrdx,
  };

  const crumbs = [
    { name: "Home", url: absoluteUrl("/") },
    { name: "Customers", url: absoluteUrl(CUSTOMERS_PATH) },
    { name: customer.name, url },
  ];

  const breadcrumbList = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };

  return [article, breadcrumbList];
}

export default async function CustomerStoryPage({ params }: PageProps) {
  const { slug } = await params;
  const story = getPublishedStory(slug);
  const { customer, page } = story;
  const { title, description, date, updated, image, imageAlt, toc } = page.data;
  const MDX = page.data.body;
  const Logo = customer.logo;

  return (
    <div className="flex w-full flex-col items-center justify-center">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: schema markup requires raw JSON
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildJsonLd(story)).replace(/</g, "\\u003c"),
        }}
      />
      <article className="relative flex w-full flex-col items-center justify-center">
        <header className="w-full border-b p-10 md:p-14">
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            <Breadcrumbs
              align="start"
              items={[
                { name: "Home", path: "/" },
                { name: "Customers", path: CUSTOMERS_PATH },
                { name: customer.name, path: page.url },
              ]}
            />
            <Logo className="h-8 w-auto self-start text-foreground md:h-10" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              <Link href={CUSTOMERS_PATH}>
                <Badge variant="secondary">Case study</Badge>
              </Link>
              <time dateTime={date}>{formatDate(date)}</time>
              {updated && updated !== date && (
                <span>
                  Updated <time dateTime={updated}>{formatDate(updated)}</time>
                </span>
              )}
              <span>{getReadingTime(page)} min read</span>
            </div>

            <h1 className="text-balance text-3xl font-medium tracking-tighter md:text-5xl">
              {title}
            </h1>

            {description && (
              <p className="text-balance text-lg text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </header>

        <div className="w-full border-b px-6 md:px-10">
          <div className="relative md:mx-10 md:border-x">
            <div className="absolute top-0 -left-4 hidden h-full w-4 bg-[repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)] bg-size-[10px_10px] text-foreground/5 md:-left-14 md:w-14 lg:block" />
            <div className="absolute top-0 -right-4 hidden h-full w-4 bg-[repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)] bg-size-[10px_10px] text-foreground/5 md:-right-14 md:w-14 lg:block" />

            <div className="flex flex-col lg:flex-row">
              <div className="min-w-0 flex-1 lg:border-r">
                <div className="relative aspect-video w-full overflow-hidden border-b border-border">
                  <Image
                    src={image}
                    alt={imageAlt ?? title}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1280px) 880px, 100vw"
                    priority
                  />
                </div>
                {toc && toc.length > 0 && <BlogTocMobile items={toc} />}
                <div className="prose prose-neutral max-w-none px-4 py-10 transition-all sm:px-12">
                  <MDX components={getMDXComponents()} />
                </div>
              </div>

              {toc && toc.length > 0 && (
                <aside className="hidden lg:sticky lg:top-24 lg:flex lg:h-max lg:w-full lg:max-w-xs lg:shrink-0 lg:flex-col lg:overflow-y-auto">
                  <BlogToc items={toc} />
                </aside>
              )}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

// Unknown and unpublished slugs render notFound() (getPublishedStory,
// lib/static-params.ts).
export function generateStaticParams() {
  return buildTimeParams(() =>
    getCustomerStories().map(({ customer }) => ({ slug: customer.id })),
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { page } = getPublishedStory(slug);
  const { title, description, date, updated, tags } = page.data;
  const url = absoluteUrl(page.url);

  // og:image / twitter:image come from ./opengraph-image.tsx; setting
  // `images` here would suppress the file-based image.
  return {
    title: brandedTitle(title),
    description,
    ...(tags && tags.length > 0 && { keywords: tags }),
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      siteName: "QRdx",
      locale: "en_US",
      publishedTime: date,
      modifiedTime: updated ?? date,
      section: "Case studies",
      ...(tags && tags.length > 0 && { tags }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
