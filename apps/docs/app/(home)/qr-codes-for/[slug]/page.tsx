import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createMetadata } from "@/lib/metadata";
import { industries, placements } from "@/lib/seo-content";
import { TopicPage } from "../_components/topic-page";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return industries.items.map((item) => ({ slug: item.slug }));
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
  });
}

export default async function IndustryPage({ params }: PageProps) {
  const { slug } = await params;
  const topic = industries.get(slug);
  if (!topic) notFound();

  return <TopicPage topic={topic} collection={industries} other={placements} />;
}
