import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NpmLagNotice } from "@/components/mdx/npm-status";
import { CompareAlternatives } from "@/components/sections/compare/compare-alternatives";
import { CompareFeatures } from "@/components/sections/compare/compare-features";
import { CompareGuide } from "@/components/sections/compare/compare-guide";
import { CompareHero } from "@/components/sections/compare/compare-hero";
import { CompareMigrate } from "@/components/sections/compare/compare-migrate";
import { CompareOthers } from "@/components/sections/compare/compare-others";
import { CompareTable } from "@/components/sections/compare/compare-table";
import { FaqList } from "@/components/sections/tools/faq-list";
import { compareSource } from "@/lib/content-source";
import { createMetadata } from "@/lib/metadata";
import { getLatestVersion, getNpmLag } from "@/lib/npm-version";
import { brandedTitle } from "@/lib/seo-overrides";
import { buildTimeParams } from "@/lib/static-params";
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
    category,
    tagline,
    qrdxPlan,
    competitorPlan,
    tableRows,
    featureHighlights,
    alternatives,
    faqs,
    body: Mdx,
  } = page.data;

  // `{ npmVersion }` cells show what npm installs, not a hand-copied number.
  const rows = await Promise.all(
    tableRows.map(async ({ qrdx, ...row }) => ({
      ...row,
      qrdx:
        typeof qrdx === "object"
          ? await getLatestVersion(qrdx.npmVersion)
          : qrdx,
    })),
  );

  // Library pages compare the repo's qrdx; say so while npm is behind it.
  const npmLag = category === "library" ? await getNpmLag("qrdx") : null;

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center divide-y divide-border">
      <CompareHero
        alternativesLabel={alternatives?.heading}
        competitor={competitor}
        slug={slug}
        tagline={tagline}
      />
      {alternatives && (
        <CompareAlternatives
          alternatives={alternatives}
          competitor={competitor}
        />
      )}
      <CompareTable
        competitor={competitor}
        competitorPlan={competitorPlan}
        notice={npmLag ? <NpmLagNotice lags={[npmLag]} /> : undefined}
        qrdxPlan={qrdxPlan}
        rows={rows}
        slug={slug}
      />
      <CompareFeatures competitor={competitor} highlights={featureHighlights} />
      <CompareGuide competitor={competitor}>
        <Mdx components={getMDXComponents()} />
      </CompareGuide>
      {faqs && faqs.length > 0 && (
        <FaqList faqs={faqs} title={`${competitor} QR code questions`} />
      )}
      <CompareMigrate competitor={competitor} slug={slug} />
      <CompareOthers currentSlug={slug} />
    </main>
  );
}

// Unknown slugs render notFound() (lib/static-params.ts).
export function generateStaticParams() {
  return buildTimeParams(() =>
    compareSource.generateParams().map((params) => ({
      slug: params.slug?.[0] ?? "",
    })),
  );
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
    // "QRdx vs …" already names the brand, so no " | QRdx" suffix.
    title: brandedTitle(seoTitle ?? `QRdx vs ${competitor}`),
    description: seoDescription ?? description ?? tagline,
    path: `/compare/${slug}`,
    ownOgImage: true,
  });
}
