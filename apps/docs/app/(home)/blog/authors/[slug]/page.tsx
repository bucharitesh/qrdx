import { Github, Linkedin, Twitter } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogList } from "@/components/sections/blog/blog-list";
import { resolveAuthors } from "@/lib/blog-authors";
import { blogAuthorsSource, blogSource } from "@/lib/source";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AuthorPage({ params }: PageProps) {
  const { slug } = await params;
  const authorPage = blogAuthorsSource.getPage([slug]);

  if (!authorPage) {
    notFound();
  }

  const {
    title: name,
    role,
    avatar,
    twitter,
    linkedin,
    github,
  } = authorPage.data;

  const firstName = name.split(" ")[0];
  const hasSocials = twitter || linkedin || github;

  const allPages = blogSource.getPages().filter((p) => p.data.published);
  const authorPosts = allPages
    .filter((page) => page.data.author.includes(slug))
    .sort(
      (a, b) =>
        new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
    )
    .map((page) => ({
      slug: page.slugs[0] ?? "",
      title: page.data.title,
      description: page.data.description ?? "",
      date: page.data.date,
      author: resolveAuthors(page.data.author),
      category: page.data.category,
      image: page.data.image,
    }));

  return (
    <section className="flex flex-col w-full min-h-screen">
      <div className="w-full">
        {/* Author profile header */}
        <div className="border-b w-full p-10 md:p-14">
          <div className="max-w-6xl mx-auto flex flex-col gap-6">
            <Link
              href="/blog"
              className="text-sm text-muted-foreground hover:text-secondary-foreground transition-colors w-fit"
            >
              &larr; Back to Blog
            </Link>

            <div className="flex items-end justify-between gap-6">
              {/* Left: avatar + name + role */}
              <div className="flex flex-col gap-4">
                <img
                  src={avatar}
                  alt={name}
                  width={64}
                  height={64}
                  className="rounded-full"
                />
                <div className="flex flex-col gap-1">
                  <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                    {name}
                  </h1>
                  <p className="text-muted-foreground">{role}</p>
                </div>
              </div>

              {/* Right: follow on socials */}
              {hasSocials && (
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-muted-foreground hidden sm:block">
                    Follow {firstName} on socials &rarr;
                  </span>
                  {twitter && (
                    <a
                      href={`https://twitter.com/${twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${name} on X`}
                      className="flex items-center justify-center size-8 rounded-lg bg-secondary hover:bg-secondary/70 transition-colors"
                    >
                      <Twitter className="size-4" />
                    </a>
                  )}
                  {linkedin && (
                    <a
                      href={`https://linkedin.com/in/${linkedin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${name} on LinkedIn`}
                      className="flex items-center justify-center size-8 rounded-lg bg-secondary hover:bg-secondary/70 transition-colors"
                    >
                      <Linkedin className="size-4" />
                    </a>
                  )}
                  {github && (
                    <a
                      href={`https://github.com/${github}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${name} on GitHub`}
                      className="flex items-center justify-center size-8 rounded-lg bg-secondary hover:bg-secondary/70 transition-colors"
                    >
                      <Github className="size-4" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <BlogList posts={authorPosts} showCategories={false} />
      </div>
    </section>
  );
}

export function generateStaticParams() {
  return blogAuthorsSource
    .getPages()
    .map((page) => ({ slug: page.slugs[0] ?? "" }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const authorPage = blogAuthorsSource.getPage([slug]);

  if (!authorPage) {
    notFound();
  }

  return {
    title: `${authorPage.data.title} | QRdx Blog`,
    description: `${authorPage.data.role} — Read blog posts by ${authorPage.data.title}`,
  };
}
