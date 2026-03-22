import type { Metadata } from "next";
import { SectionHeader } from "@/components/sections/section-header";
import { BlogList } from "@/components/sections/blog/blog-list";
import { blogSource } from "@/lib/source";

export const metadata: Metadata = {
  title: "Blog",
  description: "Latest news and updates from QRdx",
};

export default function BlogPage() {
  const allPages = blogSource.getPages();

  const sortedPosts = allPages
    .sort((a, b) => {
      const dateA = new Date(a.data.date).getTime();
      const dateB = new Date(b.data.date).getTime();
      return dateB - dateA;
    })
    .map((page) => ({
      slug: page.slugs[0] ?? "",
      title: page.data.title,
      description: page.data.description ?? "",
      date: page.data.date,
      author: page.data.author,
      category: page.data.category,
      image: page.data.image,
    }));

  return (
    <section className="flex flex-col items-center justify-center w-full min-h-screen">
      <div className="w-full">
        <SectionHeader>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter text-center">
            Blog
          </h1>
          <p className="text-muted-foreground text-center text-balance font-medium">
            Latest news and updates from QRdx
          </p>
        </SectionHeader>

        <BlogList posts={sortedPosts} />
      </div>
    </section>
  );
}
