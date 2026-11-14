import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { notFound } from "next/navigation";
import { isCategorySlug, SLUG_TO_CATEGORY } from "@/lib/blog-constants";
import { blogCategoriesSource } from "@/lib/content-source";
import { onDemandParams } from "@/lib/static-params";
import { getPublishedPosts } from "../../_lib/posts";

export const alt = "One category of the QRdx blog";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return onDemandParams();
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isCategorySlug(slug)) notFound();
  const category = SLUG_TO_CATEGORY[slug];

  const page = blogCategoriesSource.getPage([slug]);
  const posts = getPublishedPosts().filter(
    (post) => post.data.category === category,
  ).length;

  return renderPageOgImage({
    label: "Blog",
    title: page?.data.title ?? category,
    description: page?.data.description,
    footer: `${posts} ${posts === 1 ? "post" : "posts"} · qrdx.dev`,
  });
}
