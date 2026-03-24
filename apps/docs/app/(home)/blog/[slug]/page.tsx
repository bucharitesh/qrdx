import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogCard } from "@/components/sections/blog/blog-card";
import { BlogToc } from "@/components/sections/blog/blog-toc";
import { SectionHeader } from "@/components/sections/section-header";
import { resolveAuthors } from "@/lib/blog-authors";
import { blogSource } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const page = blogSource.getPage([slug]);

  if (!page || !page.data.published) {
    notFound();
  }

  const {
    title,
    description,
    date,
    author: authorIds,
    category,
    image,
  } = page.data;

  const authors = resolveAuthors(authorIds);
  const MDX = page.data.body;

  const allPages = blogSource.getPages().filter((p) => p.data.published);
  const relatedPosts = page.data.related
    ? allPages.filter((p) => page.data.related?.includes(p.slugs[0] ?? ""))
    : allPages
        .filter((p) => p.slugs[0] !== slug)
        .sort(
          (a, b) =>
            new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
        )
        .slice(0, 3);

  const toc = page.data.toc;

  return (
    <article className="flex flex-col items-center justify-center divide-y divide-border min-h-screen w-full">
      <div className="flex flex-col items-center justify-center w-full relative">
        {/* Post header */}
        <div className="w-full border-b p-10 md:p-14">
          <div className="max-w-4xl mx-auto flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{category}</Badge>
              <time className="text-sm text-muted-foreground">
                {formatDate(date)}
              </time>
            </div>

            <h1 className="text-3xl md:text-5xl font-medium tracking-tighter text-balance">
              {title}
            </h1>

            {description && (
              <p className="text-lg text-muted-foreground text-balance">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="px-5 md:px-10 w-full border-b">
          <div className="md:border-x md:mx-10 relative">
            <div className="absolute hidden lg:block top-0 -left-4 md:-left-14 h-full w-4 md:w-14 text-primary/5 bg-size-[10px_10px] bg-[repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]" />
            <div className="absolute hidden lg:block top-0 -right-4 md:-right-14 h-full w-4 md:w-14 text-primary/5 bg-size-[10px_10px] bg-[repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]" />

            <div className="flex flex-col lg:flex-row">
              {/* MDX Body */}
              <div className="flex-1 min-w-0 md:border-r">
                {image && (
                  <div className="relative aspect-2/1 w-full overflow-hidden border-b border-border">
                    <Image
                      src={image}
                      alt={title}
                      fill
                      className="object-cover"
                      priority
                    />
                  </div>
                )}
                <div className="prose prose-neutral max-w-none transition-all px-5 py-10 sm:px-12">
                  <MDX components={getMDXComponents()} />
                </div>
              </div>

              {/* Sidebar — authors + TOC */}
              <aside className="hidden lg:sticky lg:top-24 lg:flex lg:h-[calc(100vh-6rem)] lg:w-full lg:max-w-xs lg:shrink-0 lg:flex-col lg:overflow-y-auto">
                <div className="flex flex-col">
                  {/* Written by */}
                  {authors.length > 0 && (
                    <div className="border-b border-border px-5 py-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                        Written by
                      </p>
                      <div className="flex flex-col gap-4">
                        {authors.map((a) => (
                          <Link
                            key={a.id}
                            href={`/blog/authors/${a.id}`}
                            className="group flex items-center gap-3"
                          >
                            <img
                              src={a.avatar}
                              alt={a.name}
                              width={36}
                              height={36}
                              className="rounded-full shrink-0 transition-all group-hover:brightness-90"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-secondary-foreground truncate">
                                {a.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {a.role}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Table of contents */}
                  {toc && toc.length > 0 && <BlogToc items={toc} />}
                </div>
              </aside>
            </div>
          </div>
        </div>
        {relatedPosts.length > 0 && (
          <section className="flex flex-col items-center justify-center w-full min-h-screen">
            <div className="w-full">
              <SectionHeader>
                <h1 className="text-4xl md:text-5xl font-medium tracking-tighter text-center">
                  Read more
                </h1>
                <p className="text-muted-foreground text-center text-balance font-medium">
                  Read more posts from the same category
                </p>
              </SectionHeader>

              <div className="px-6 min-h-screen">
                <div className="grid w-full max-w-7xl grid-cols-2 md:grid-cols-4 border-l border-border auto-rows-fr">
                  {relatedPosts.map((post) => (
                    <BlogCard
                      key={post.url}
                      title={post.data.title}
                      description={post.data.description ?? ""}
                      slug={post.slugs[0] ?? ""}
                      date={post.data.date}
                      author={resolveAuthors(post.data.author)}
                      image={post.data.image}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

export function generateStaticParams() {
  return blogSource
    .getPages()
    .filter((p) => p.data.published)
    .map((p) => ({ slug: p.slugs[0] ?? "" }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = blogSource.getPage([slug]);

  if (!page || !page.data.published) {
    notFound();
  }

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
