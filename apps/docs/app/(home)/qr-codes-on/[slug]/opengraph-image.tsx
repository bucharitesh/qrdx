import { notFound } from "next/navigation";
import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { placements } from "@/lib/seo-content";

export const alt = "Where to put a QR code, and how big to print it";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return placements.items.map((item) => ({ slug: item.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = placements.get(slug);
  if (!topic) notFound();

  return renderPageOgImage({
    label: "Placements",
    title: topic.title,
    description: topic.summary,
    footer: "Free · Open source · qrdx.dev",
  });
}
