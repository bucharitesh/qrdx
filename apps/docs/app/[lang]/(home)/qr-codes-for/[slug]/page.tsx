import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { industries } from "@/lib/seo-content";
import { localizedCollections } from "@/lib/seo-content/localized";
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

/** The topic in the page's language, with both collections, or a 404. */
async function load(params: PageProps["params"]) {
  const [{ slug }, locale] = await Promise.all([params, requireLocale()]);
  const collections = await localizedCollections(locale);
  const topic = collections.industries.get(slug);
  if (!topic) notFound();
  return { locale, topic, ...collections };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale, topic } = await load(params);
  return localizedMetadata({
    locale,
    path: industries.path(topic.slug),
    title: topic.seoTitle,
    description: topic.metaDescription,
    ownOgImage: true,
  });
}

export default async function IndustryPage({ params }: PageProps) {
  const {
    topic,
    industries: collection,
    placements: other,
  } = await load(params);
  return <TopicPage topic={topic} collection={collection} other={other} />;
}
