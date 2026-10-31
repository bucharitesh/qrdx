import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogCard } from "@/components/sections/blog/blog-card";
import { Contribute } from "@/components/sections/blog/blog-contribute";
import { BlogToc } from "@/components/sections/blog/blog-toc";
import { BlogTocMobile } from "@/components/sections/blog/blog-toc-mobile";
import { SectionHeader } from "@/components/sections/section-header";
import { type ResolvedAuthor, resolveAuthors } from "@/lib/blog-authors";
import { blogSource } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";
import {
  absoluteUrl,
  type BlogPage,
  formatDate,
  getCategorySlug,
  getPostSlug,
  getPublishedPosts,
  getReadingTime,
  getRelatedPosts,
  rssAlternateTypes,
  toPostCard,
} from "../_lib/posts";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

function getPublishedPage(slug: string): BlogPage {
  const page = blogSource.getPage([slug]);

  if (!page || !page.data.published) {
    notFound();
  }

  return page;
}

function authorSameAs(author: ResolvedAuthor): string[] {
  return [
    author.twitter && `https://x.com/${author.twitter}`,
    author.github && `https://github.com/${author.github}`,
    author.linkedin && `https://www.linkedin.com/in/${author.linkedin}`,
  ].filter((url): url is string => Boolean(url));
}

function buildJsonLd(page: BlogPage, authors: ResolvedAuthor[]) {
  const { title, description, date, updated, image, category, tags } =
    page.data;
  const url = absoluteUrl(page.url);
  const categorySlug = getCategorySlug(category);

  const blogPosting = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: title,
    description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: [absoluteUrl(image)],
    datePublished: date,
    dateModified: updated ?? date,
    articleSection: category,
    ...(tags && tags.length > 0 && { keywords: tags.join(", ") }),
    author: authors.map((author) => {
      const sameAs = authorSameAs(author);
      return {
        "@type": "Person",
        name: author.name,
        url: absoluteUrl(`/blog/authors/${author.id}`),
        ...(sameAs.length > 0 && { sameAs }),
      };
    }),
    publisher: {
      "@type": "Organization",
      name: "QRdx",
      url: absoluteUrl("/"),
      logo: { "@type": "ImageObject", url: absoluteUrl("/logo.png") },
    },
  };

  const crumbs = [
    { name: "Home", url: absoluteUrl("/") },
    { name: "Blog", url: absoluteUrl("/blog") },
    ...(categorySlug
      ? [{ name: category, url: absoluteUrl(`/blog/category/${categorySlug}`) }]
      : []),
    { name: title, url },
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

  return [blogPosting, breadcrumbList];
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getPublishedPage(slug);

  const {
    title,
    description,
    date,
    updated,
    author: authorIds,
    category,
    image,
    imageAlt,
    toc,
  } = page.data;

  const authors = resolveAuthors(authorIds);
  const MDX = page.data.body;
  const readingTime = getReadingTime(page);
  const categorySlug = getCategorySlug(category);

  const relatedPosts = getRelatedPosts(page);
  const relatedSubtitle = relatedPosts.every(
    (p) => p.data.category === category,
  )
    ? `More posts from ${category}`
    : "More posts from the QRdx blog";

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: schema markup requires raw JSON
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildJsonLd(page, authors)).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <article className="flex flex-col items-center justify-center w-full relative">
        {/* Post header */}
        <header className="w-full border-b p-10 md:p-14">
          <div className="max-w-4xl mx-auto flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              {categorySlug ? (
                <Link href={`/blog/category/${categorySlug}`}>
                  <Badge variant="secondary">{category}</Badge>
                </Link>
              ) : (
                <Badge variant="secondary">{category}</Badge>
              )}
              <time dateTime={date}>{formatDate(date)}</time>
              {updated && updated !== date && (
                <span>
                  Updated <time dateTime={updated}>{formatDate(updated)}</time>
                </span>
              )}
              <span>{readingTime} min read</span>
            </div>

            <h1 className="text-3xl md:text-5xl font-medium tracking-tighter text-balance">
              {title}
            </h1>

            {description && (
              <p className="text-lg text-muted-foreground text-balance">
                {description}
              </p>
            )}

            {authors.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
                {authors.map((a) => (
                  <Link
                    key={a.id}
                    href={`/blog/authors/${a.id}`}
                    rel="author"
                    className="group flex items-center gap-3"
                  >
                    <img
                      src={a.avatar}
                      alt=""
                      width={36}
                      height={36}
                      className="rounded-full shrink-0 transition-all group-hover:brightness-90"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-secondary-foreground">
                        {a.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{a.role}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="px-5 md:px-10 w-full border-b">
          <div className="md:border-x md:mx-10 relative">
            <div className="absolute hidden lg:block top-0 -left-4 md:-left-14 h-full w-4 md:w-14 text-primary/5 bg-size-[10px_10px] bg-[repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]" />
            <div className="absolute hidden lg:block top-0 -right-4 md:-right-14 h-full w-4 md:w-14 text-primary/5 bg-size-[10px_10px] bg-[repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]" />

            <div className="flex flex-col lg:flex-row">
              {/* MDX Body */}
              <div className="flex-1 min-w-0 lg:border-r">
                {image && (
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
                )}
                {toc && toc.length > 0 && <BlogTocMobile items={toc} />}
                <div className="prose prose-neutral max-w-none transition-all px-5 py-10 sm:px-12">
                  <MDX components={getMDXComponents()} />
                </div>
              </div>

              {/* Sidebar — TOC + contribute (author/date live in the header on all sizes) */}
              <aside className="hidden lg:sticky lg:top-24 lg:flex lg:h-max lg:w-full lg:max-w-xs lg:shrink-0 lg:flex-col lg:overflow-y-auto">
                <div className="flex flex-col">
                  {toc && toc.length > 0 && <BlogToc items={toc} />}

                  <Contribute page={page} />
                </div>
              </aside>
            </div>
          </div>
        </div>
      </article>

      {relatedPosts.length > 0 && (
        <section
          aria-labelledby="read-more-heading"
          className="flex flex-col items-center justify-center w-full"
        >
          <div className="w-full">
            <SectionHeader>
              <h2
                id="read-more-heading"
                className="text-4xl md:text-5xl font-medium tracking-tighter text-center"
              >
                Read more
              </h2>
              <p className="text-muted-foreground text-center text-balance font-medium">
                {relatedSubtitle}
              </p>
            </SectionHeader>

            <div className="px-6">
              <div className="grid w-full max-w-7xl grid-cols-1 sm:grid-cols-2 md:grid-cols-3 border-l border-border">
                {relatedPosts.map((post) => {
                  const card = toPostCard(post);
                  return (
                    <BlogCard
                      key={post.url}
                      title={card.title}
                      description={card.description}
                      slug={card.slug}
                      date={card.date}
                      author={card.author}
                      image={card.image}
                      imageAlt={card.imageAlt}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export function generateStaticParams() {
  return getPublishedPosts().map((p) => ({ slug: getPostSlug(p) }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPublishedPage(slug);
  const { title, description, date, updated, author, tags } = page.data;
  const url = absoluteUrl(page.url);
  const authors = resolveAuthors(author);
  const twitterHandle = authors.find((a) => a.twitter)?.twitter;

  // og:image / twitter:image come from ./opengraph-image.tsx; setting
  // `images` here would suppress the file-based image.
  return {
    title,
    description,
    ...(tags && tags.length > 0 && { keywords: tags }),
    authors: authors.map((a) => ({
      name: a.name,
      url: absoluteUrl(`/blog/authors/${a.id}`),
    })),
    alternates: {
      canonical: url,
      types: rssAlternateTypes,
    },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      siteName: "QRdx",
      locale: "en_US",
      publishedTime: date,
      modifiedTime: updated ?? date,
      authors: authors.map((a) => absoluteUrl(`/blog/authors/${a.id}`)),
      section: page.data.category,
      ...(tags && tags.length > 0 && { tags }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(twitterHandle && { creator: `@${twitterHandle}` }),
    },
  };
}
