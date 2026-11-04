import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createMetadata } from "@/lib/metadata";
import { industries, placements } from "@/lib/seo-content";
import { buildTimeParams } from "@/lib/static-params";
import { TopicPage } from "../_components/topic-page";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Unknown slugs render notFound() below (lib/static-params.ts).
export function generateStaticParams() {
  return buildTimeParams(() =>
    industries.items.map((item) => ({ slug: item.slug })),
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const topic = industries.get(slug);
  if (!topic) notFound();

  return createMetadata({
    title: topic.seoTitle,
    description: topic.metaDescription,
    path: industries.path(topic.slug),
    ownOgImage: true,
  });
}

export default async function IndustryPage({ params }: PageProps) {
  const { slug } = await params;
  const topic = industries.get(slug);
  if (!topic) notFound();

  return <TopicPage topic={topic} collection={industries} other={placements} />;
}
