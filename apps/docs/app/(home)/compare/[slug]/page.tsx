import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompareFeatures } from "@/components/sections/compare/compare-features";
import { CompareGuide } from "@/components/sections/compare/compare-guide";
import { CompareHero } from "@/components/sections/compare/compare-hero";
import { CompareOthers } from "@/components/sections/compare/compare-others";
import { CompareTable } from "@/components/sections/compare/compare-table";
import { createMetadata } from "@/lib/metadata";
import { compareSource } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ComparePage({ params }: PageProps) {
  const { slug } = await params;
  const page = compareSource.getPage([slug]);

  if (!page) {
    notFound();
  }

  const {
    competitor,
    tagline,
    competitorLogo,
    qrdxPlan,
    competitorPlan,
    tableRows,
    featureHighlights,
    sources,
    lastVerified,
    body: Mdx,
  } = page.data;

  return (
    <main className="flex flex-col items-center justify-center divide-y divide-border min-h-screen w-full">
      <CompareHero
        slug={slug}
        competitor={competitor}
        tagline={tagline}
        competitorLogo={competitorLogo}
      />
      <CompareTable
        competitor={competitor}
        qrdxPlan={qrdxPlan}
        competitorPlan={competitorPlan}
        competitorLogo={competitorLogo}
        rows={tableRows}
      />
      <CompareFeatures competitor={competitor} highlights={featureHighlights} />
      <CompareGuide
        competitor={competitor}
        sources={sources}
        lastVerified={lastVerified}
      >
        <Mdx components={getMDXComponents()} />
      </CompareGuide>
      <CompareOthers currentSlug={slug} />
    </main>
  );
}

export function generateStaticParams() {
  return compareSource.generateParams().map((params) => ({
    slug: params.slug?.[0] ?? "",
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = compareSource.getPage([slug]);

  if (!page) {
    notFound();
  }

  const { competitor, seoTitle, seoDescription, description, tagline } =
    page.data;

  return createMetadata({
    title: seoTitle ?? `QRdx vs ${competitor}`,
    description: seoDescription ?? description ?? tagline,
    path: `/compare/${slug}`,
  });
}
