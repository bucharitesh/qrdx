import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogCard } from "@/components/sections/blog/blog-card";
import { getAllAuthorSlugs, getAuthor } from "@/lib/blog-authors";
import { blogSource } from "@/lib/source";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AuthorPage({ params }: PageProps) {
  const { slug } = await params;
  const author = getAuthor(slug);

  if (!author) {
    notFound();
  }

  const allPages = blogSource.getPages();
  const authorPosts = allPages
    .filter((page) => page.data.author === slug)
    .sort(
      (a, b) =>
        new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
    );

  return (
    <section className="flex flex-col items-center justify-center w-full min-h-screen">
      <div className="w-full">
        <div className="border-b w-full h-full p-10 md:p-14">
          <div className="max-w-xl mx-auto flex flex-col items-center justify-center gap-4">
            <Link
              href="/blog"
              className="text-sm text-muted-foreground hover:text-secondary-foreground transition-colors"
            >
              &larr; Back to Blog
            </Link>

            <Avatar className="size-20">
              <AvatarImage src={author.avatar} alt={author.name} />
              <AvatarFallback className="text-2xl">
                {author.name.charAt(0)}
              </AvatarFallback>
            </Avatar>

            <h1 className="text-3xl md:text-4xl font-medium tracking-tighter text-center">
              {author.name}
            </h1>

            <p className="text-muted-foreground text-center font-medium">
              {author.role}
            </p>

            <div className="flex items-center gap-4">
              {author.twitter && (
                <a
                  href={`https://twitter.com/${author.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-secondary-foreground transition-colors"
                >
                  Follow {author.name.split(" ")[0]} on socials &rarr;
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-16">
          {authorPosts.length === 0 ? (
            <p className="text-center text-muted-foreground py-20">
              No posts yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
              {authorPosts.map((post) => (
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
          )}
        </div>
      </div>
    </section>
  );
}

export function generateStaticParams() {
  return getAllAuthorSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const author = getAuthor(slug);

  if (!author) {
    notFound();
  }

  return {
    title: `${author.name} | QRdx Blog`,
    description: `${author.role} - Read blog posts by ${author.name}`,
  };
}
