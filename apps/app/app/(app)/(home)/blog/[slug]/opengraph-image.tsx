import { notFound } from "next/navigation";
import { ogSize, renderArticleOgImage } from "@/app/og/brand";
import { resolveAuthors } from "@/lib/blog-authors";
import { blogSource } from "@/lib/content-source";
import { onDemandParams } from "@/lib/static-params";

export const alt = "QRdx Blog";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return onDemandParams();
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = blogSource.getPage([slug]);

  if (!page?.data.published) {
    notFound();
  }

  return renderArticleOgImage({
    section: "Blog",
    title: page.data.title,
    byline: resolveAuthors(page.data.author)
      .map((a) => a.name)
      .join(", "),
    tag: page.data.category,
  });
}
