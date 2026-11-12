import { notFound } from "next/navigation";
import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { requireLocaleParam, withLocaleParams } from "@/lib/i18n/static-params";
import { industries } from "@/lib/seo-content";

export const alt = "QR code ideas for one industry";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return withLocaleParams(() =>
    industries.items.map((item) => ({ slug: item.slug })),
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  await requireLocaleParam(params);
  const { slug } = await params;
  const topic = industries.get(slug);
  if (!topic) notFound();

  return renderPageOgImage({
    label: "Industries",
    title: topic.title,
    description: topic.summary,
    footer: "Free · Open source · qrdx.dev",
  });
}
