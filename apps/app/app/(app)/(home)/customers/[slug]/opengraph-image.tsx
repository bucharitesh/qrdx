import { ogSize, renderArticleOgImage } from "@repo/design-system/og/brand";
import { notFound } from "next/navigation";
import { onDemandParams } from "@/lib/static-params";
import { getCustomerStory } from "../_lib/stories";

export const alt = "A QRdx customer's case study";
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
  const story = getCustomerStory(slug);
  if (!story) notFound();

  return renderArticleOgImage({
    section: "Customers",
    title: story.page.data.title,
    byline: story.customer.name,
    tag: "Case study",
  });
}
