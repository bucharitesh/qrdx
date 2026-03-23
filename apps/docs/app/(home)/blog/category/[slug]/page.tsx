import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SLUG_TO_CATEGORY } from "@/lib/blog-constants";
import { BlogList } from "@/components/sections/blog/blog-list";
import { SectionHeader } from "@/components/sections/section-header";
import { resolveAuthors } from "@/lib/blog-authors";
import { blogCategoriesSource, blogSource } from "@/lib/source";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return Object.keys(SLUG_TO_CATEGORY).map((slug) => ({ slug }));
}

export default async function BlogCategoryPage({ params }: PageProps) {
  const { slug } = await params;

  if (!SLUG_TO_CATEGORY[slug]) {
    notFound();
  }

  const categoryPage = blogCategoriesSource.getPage([slug]);
  const headerTitle = categoryPage?.data.title ?? SLUG_TO_CATEGORY[slug];
  const headerDescription = categoryPage?.data.description ?? "";

  const categoryName = SLUG_TO_CATEGORY[slug];
  const allPages = blogSource.getPages().filter((p) => p.data.published);
  const filteredPosts = allPages
    .filter((page) => page.data.category === categoryName)
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
    <section className="flex flex-col items-center justify-center w-full min-h-screen">
      <div className="w-full">
        <SectionHeader>
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
    return {};
  }

  const categoryPage = blogCategoriesSource.getPage([slug]);

  return {
    title: categoryPage?.data.title ?? SLUG_TO_CATEGORY[slug],
    description: categoryPage?.data.description,
  };
}
