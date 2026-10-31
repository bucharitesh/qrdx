import type { Metadata } from "next";
import { BlogList } from "@/components/sections/blog/blog-list";
import { SectionHeader } from "@/components/sections/section-header";
import { createMetadata } from "@/lib/metadata";
import { getPublishedPosts, rssAlternateTypes, toPostCard } from "./_lib/posts";

const title = "Blog: QR Code Guides, Engineering and Product News";
const description =
  "QR code guides, how QR codes work, honest generator comparisons and product news from the team behind QRdx, the open-source QR code generator.";

export const metadata: Metadata = createMetadata({
  title,
  description,
  path: "/blog",
  alternates: { types: rssAlternateTypes },
});

export default function BlogPage() {
  const posts = getPublishedPosts().map(toPostCard);

  return (
    <section className="flex flex-col items-center justify-center w-full min-h-screen">
      <div className="w-full">
        <SectionHeader eyebrow="Guides and news" pattern="noise">
          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter text-center">
            Blog
          </h1>
          <p className="text-muted-foreground text-center text-balance font-medium">
            QR code guides, engineering deep dives and product news from QRdx
          </p>
        </SectionHeader>

        <BlogList posts={posts} featureFirst />
      </div>
    </section>
  );
}
