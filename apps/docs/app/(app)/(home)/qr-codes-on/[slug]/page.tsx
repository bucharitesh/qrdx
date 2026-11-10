import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TopicPage } from "@/app/(app)/(home)/qr-codes-for/_components/topic-page";
import { createMetadata } from "@/lib/metadata";
import { industries, placements } from "@/lib/seo-content";
import { buildTimeParams } from "@/lib/static-params";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Unknown slugs render notFound() below (lib/static-params.ts).
export function generateStaticParams() {
  return buildTimeParams(() =>
    placements.items.map((item) => ({ slug: item.slug })),
  );
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
    ownOgImage: true,
  });
}

export default async function PlacementPage({ params }: PageProps) {
  const { slug } = await params;
  const topic = placements.get(slug);
  if (!topic) notFound();

  return <TopicPage topic={topic} collection={placements} other={industries} />;
}
