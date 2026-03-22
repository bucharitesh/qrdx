import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BlogAuthorBar } from "@/components/sections/blog/blog-author-bar";
import { BlogCard } from "@/components/sections/blog/blog-card";
import { getAuthor } from "@/lib/blog-authors";
import { blogSource } from "@/lib/source";

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

  if (!page) {
    notFound();
  }

  const {
    title,
    description,
    date,
    author: authorId,
    category,
    image,
  } = page.data;
  const author = getAuthor(authorId);
  const MDX = page.data.body;

  const allPages = blogSource.getPages();
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
        <div className="w-full border-b">
          <div className="mx-auto px-10 md:px-14 py-10 md:py-16">
            <div className="flex items-center gap-3 mb-6">
              <Badge variant="secondary">{category}</Badge>
              <time className="text-sm text-muted-foreground">
                {formatDate(date)}
              </time>
            </div>

            <h1 className="text-3xl md:text-5xl font-medium tracking-tighter text-balance mb-6">
              {title}
            </h1>

            {description && (
              <p className="text-lg text-muted-foreground text-balance mb-8">
                {description}
              </p>
            )}

            {author && (
              <BlogAuthorBar
                authorId={authorId}
                author={author}
                date={date}
                size="md"
              />
            )}
          </div>
        </div>

        <div className="px-5 md:px-10">
          <div className="md:border-x md:mx-10 relative">
            <div className="absolute hidden lg:block top-0 -left-4 md:-left-14 h-full w-4 md:w-14 text-primary/5 bg-size-[10px_10px] bg-[repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]"></div>
            <div className="absolute hidden lg:block top-0 -right-4 md:-right-14 h-full w-4 md:w-14 text-primary/5 bg-size-[10px_10px] bg-[repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]"></div>

            <div className="flex flex-col lg:flex-row gap-12">
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
                <div className="prose prose-neutral max-w-none transition-all prose-headings:relative prose-headings:scroll-mt-20 prose-headings:font-display prose-a:font-medium prose-a:text-neutral-500 prose-a:underline-offset-4 hover:prose-a:text-black prose-thead:text-lg px-5 py-10 sm:px-12 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-4 ">
                  <MDX />
                </div>
              </div>

              {/* Table of Contents sidebar */}
              {toc && toc.length > 0 && (
                <aside className="hidden lg:block w-max shrink-0">
                  <div className="sticky top-24">
                    <p className="text-sm font-semibold text-secondary-foreground mb-4">
                      On this page
                    </p>
                    <nav className="flex flex-col gap-2">
                      {toc.map((item) => (
                        <a
                          key={item.url}
                          href={item.url}
                          className="text-sm text-muted-foreground hover:text-secondary-foreground transition-colors underline-offset-4"
                          style={{
                            paddingLeft: `${(item.depth - 2) * 12}px`,
                          }}
                        >
                          {item.title}
                        </a>
                      ))}
                    </nav>
                  </div>
                </aside>
              )}
            </div>
          </div>

          {relatedPosts.length > 0 && (
            <div className="border-t border-border w-full">
              <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-16">
                <h2 className="text-2xl font-semibold tracking-tight mb-8">
                  Read more
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
                  {relatedPosts.map((post) => (
                    <BlogCard
                      key={post.url}
                      title={post.data.title}
                      description={post.data.description ?? ""}
                      slug={post.slugs[0] ?? ""}
                      date={post.data.date}
                      authorId={post.data.author}
                      image={post.data.image}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function generateStaticParams() {
  return blogSource.generateParams().map((params) => ({
    slug: params.slug?.[0] ?? "",
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = blogSource.getPage([slug]);

  if (!page) {
    notFound();
  }

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
