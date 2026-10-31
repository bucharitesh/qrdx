import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TopicPage } from "@/app/(home)/qr-codes-for/_components/topic-page";
import { createMetadata } from "@/lib/metadata";
import { industries, placements } from "@/lib/seo-content";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return placements.items.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const topic = placements.get(slug);
  if (!topic) notFound();

  return createMetadata({
    title: topic.seoTitle,
    description: topic.metaDescription,
    path: placements.path(topic.slug),
  });
}

export default async function PlacementPage({ params }: PageProps) {
  const { slug } = await params;
  const topic = placements.get(slug);
  if (!topic) notFound();

  return <TopicPage topic={topic} collection={placements} other={industries} />;
}
