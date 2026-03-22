import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompareFeatures } from "@/components/sections/compare/compare-features";
import { CompareHero } from "@/components/sections/compare/compare-hero";
import { CompareOthers } from "@/components/sections/compare/compare-others";
import { CompareTable } from "@/components/sections/compare/compare-table";
import { compareSource } from "@/lib/source";

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
  } = page.data;

  return (
    <main className="flex flex-col items-center justify-center divide-y divide-border min-h-screen w-full">
      <CompareHero
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

  return {
    title: `${page.data.title} vs. Qrdx | The #1 ${page.data.title} Alternative`,
    description: `Learn how QRdx compares to ${page.data.title} and why QRdx is the best ${page.data.title} alternative.`,
  };
}
