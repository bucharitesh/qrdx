import {
  GithubLogo as Github,
  LinkedinLogo as Linkedin,
  XLogo as Twitter,
} from "@repo/design-system/components/icons";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogList } from "@/components/sections/blog/blog-list";
import { Breadcrumbs } from "@/components/sections/breadcrumbs";
import { blogAuthorsSource } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";
import {
  absoluteUrl,
  getPublishedPosts,
  rssAlternateTypes,
  toPostCard,
} from "../../_lib/posts";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

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
  const Bio = authorPage.data.body;

  const authorPosts = getPublishedPosts()
    .filter((page) => page.data.author.includes(slug))
    .map(toPostCard);

  const sameAs = [
    twitter && `https://x.com/${twitter}`,
    github && `https://github.com/${github}`,
    linkedin && `https://www.linkedin.com/in/${linkedin}`,
  ].filter(Boolean);

  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: absoluteUrl(`/blog/authors/${slug}`),
    mainEntity: {
      "@type": "Person",
      name,
      jobTitle: role,
      image: avatar,
      url: absoluteUrl(`/blog/authors/${slug}`),
      ...(sameAs.length > 0 && { sameAs }),
    },
  };

  return (
    <section className="flex flex-col w-full min-h-screen">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: schema markup requires raw JSON
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(profileJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="w-full">
        {/* Author profile header */}
        <div className="border-b w-full p-10 md:p-14">
          <div className="max-w-6xl mx-auto flex flex-col gap-6">
            <Breadcrumbs
              align="start"
              items={[
                { name: "Home", path: "/" },
                { name: "Blog", path: "/blog" },
                { name, path: `/blog/authors/${slug}` },
              ]}
            />

            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
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
                <div className="prose prose-neutral max-w-2xl text-muted-foreground">
                  <Bio components={getMDXComponents()} />
                </div>
              </div>

              {/* Right: follow on socials */}
              {hasSocials && (
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-muted-foreground hidden sm:block">
                    Follow {firstName}
                  </span>
                  {twitter && (
                    <a
                      href={`https://twitter.com/${twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${name} on X`}
                      className="grid size-9 place-items-center rounded-lg border bg-muted/40 text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
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
                      className="grid size-9 place-items-center rounded-lg border bg-muted/40 text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
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
                      className="grid size-9 place-items-center rounded-lg border bg-muted/40 text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
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

  const { title: name, role, avatar } = authorPage.data;
  const title = `Posts by ${name}`;
  const description =
    authorPage.data.description ?? `${role}. Read blog posts by ${name}.`;
  const url = absoluteUrl(`/blog/authors/${slug}`);

  return {
    title,
    description,
    alternates: {
      canonical: url,
      types: rssAlternateTypes,
    },
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      siteName: "QRdx",
      locale: "en_US",
      images: [{ url: absoluteUrl(avatar), alt: name }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [absoluteUrl(avatar)],
    },
  };
}
