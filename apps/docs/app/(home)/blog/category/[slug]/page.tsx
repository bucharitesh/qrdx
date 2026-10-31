import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogList } from "@/components/sections/blog/blog-list";
import { Breadcrumbs } from "@/components/sections/breadcrumbs";
import { SectionHeader } from "@/components/sections/section-header";
import { SLUG_TO_CATEGORY } from "@/lib/blog-constants";
import { createMetadata } from "@/lib/metadata";
import { blogCategoriesSource } from "@/lib/source";
import {
  getPublishedPosts,
  rssAlternateTypes,
  toPostCard,
} from "../../_lib/posts";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Categories with fewer published posts than this are kept out of the index. */
const MIN_POSTS_TO_INDEX = 2;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(SLUG_TO_CATEGORY).map((slug) => ({ slug }));
}

function getCategoryPosts(categoryName: string) {
  return getPublishedPosts().filter(
    (page) => page.data.category === categoryName,
  );
}

export default async function BlogCategoryPage({ params }: PageProps) {
  const { slug } = await params;

  if (!SLUG_TO_CATEGORY[slug]) {
    notFound();
  }

  const categoryPage = blogCategoriesSource.getPage([slug]);
  const headerTitle = categoryPage?.data.title ?? SLUG_TO_CATEGORY[slug];
  const headerDescription = categoryPage?.data.description ?? "";

  const filteredPosts = getCategoryPosts(SLUG_TO_CATEGORY[slug]).map(
    toPostCard,
  );

  return (
    <section className="flex flex-col items-center justify-center w-full min-h-screen">
      <div className="w-full">
        <SectionHeader pattern="noise">
          <Breadcrumbs
            className="mb-2"
            items={[
              { name: "Home", path: "/" },
              { name: "Blog", path: "/blog" },
              { name: headerTitle, path: `/blog/category/${slug}` },
            ]}
          />
          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter text-center">
            {headerTitle}
          </h1>
          <p className="text-muted-foreground text-center text-balance font-medium">
            {headerDescription}
          </p>
        </SectionHeader>

        <BlogList posts={filteredPosts} />
      </div>
    </section>
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;

  if (!SLUG_TO_CATEGORY[slug]) {
    notFound();
  }

  const categoryPage = blogCategoriesSource.getPage([slug]);
  const title = `Blog: ${categoryPage?.data.title ?? SLUG_TO_CATEGORY[slug]}`;
  const description = categoryPage?.data.description;
  const postCount = getCategoryPosts(SLUG_TO_CATEGORY[slug]).length;

  return createMetadata({
    title,
    description,
    path: `/blog/category/${slug}`,
    alternates: { types: rssAlternateTypes },
    ...(postCount < MIN_POSTS_TO_INDEX && {
      robots: { index: false, follow: true },
    }),
  });
}
