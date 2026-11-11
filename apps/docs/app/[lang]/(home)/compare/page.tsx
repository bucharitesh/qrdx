import { cn } from "@repo/design-system/lib/utils";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AsciiField } from "@/components/fx";
import { CompareCard } from "@/components/sections/compare/compare-card";
import { breadcrumbSchema, JsonLd } from "@/components/sections/tools/json-ld";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { localizeHref } from "@/lib/i18n/paths";
import { requireLocale } from "@/lib/i18n/server";
import { baseUrl } from "@/lib/metadata";
import { compareSource } from "@/lib/source";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "compare" });
  return localizedMetadata({
    locale,
    // Names the brand already, so no " | QRdx" suffix.
    title: { absolute: t("metaTitle") },
    description: t("metaDescription"),
    path: "/compare",
    ownOgImage: true,
  });
}

// Competitor taglines and prices are facts checked on their sites, kept in
// English (content/compare); the page around them is translated.
const groups = [
  { category: "generator", columns: "sm:grid-cols-2 lg:grid-cols-3" },
  { category: "library", columns: "sm:grid-cols-2" },
] as const;

export default async function CompareHubPage() {
  const locale = await requireLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "compare" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const pages = compareSource
    .getPages()
    .sort((a, b) => a.data.competitor.localeCompare(b.data.competitor));

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center divide-y divide-border">
      <JsonLd
        data={breadcrumbSchema([
          { name: common("home"), path: "/" },
          { name: t("crumb"), path: localizeHref("/compare", locale) },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: t("metaTitle"),
          itemListElement: pages.map((page, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: `QRdx vs ${page.data.competitor}`,
            url: new URL(page.url, baseUrl).toString(),
          })),
        }}
      />
      <section className="relative w-full overflow-hidden">
        <AsciiField
          variant="topo"
          seed={41}
          className="[mask-image:radial-gradient(ellipse_70%_75%_at_50%_45%,rgba(0,0,0,0.3)_15%,black_50%,transparent_80%)]"
        />
        <div className="relative mx-auto flex max-w-[50rem] flex-col items-center gap-4 px-10 pt-20 pb-16 text-center md:pt-28 md:pb-20">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("eyebrow", { count: pages.length })}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            {t("title")}
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground md:text-lg">
            {t("intro")}
          </p>
        </div>
      </section>

      {groups.map((group) => {
        const items = pages.filter((p) => p.data.category === group.category);
        if (items.length === 0) return null;

        return (
          <section
            aria-labelledby={`compare-${group.category}`}
            className="w-full px-10 py-14 md:py-16"
            key={group.category}
          >
            <div className="mx-auto max-w-6xl">
              <div className="mb-8 flex max-w-2xl flex-col gap-2">
                <h2
                  className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
                  id={`compare-${group.category}`}
                >
                  {t(`groups.${group.category}.heading`)}
                </h2>
                <p className="text-pretty text-muted-foreground">
                  {t(`groups.${group.category}.intro`)}
                </p>
              </div>
              <ul className={cn("grid gap-4", group.columns)}>
                {items.map((page) => {
                  const slug = page.slugs[0] ?? "";
                  const { competitor, tagline, competitorPlan } = page.data;
                  return (
                    <li key={slug}>
                      <CompareCard
                        competitor={competitor}
                        competitorPlan={competitorPlan}
                        slug={slug}
                        tagline={tagline}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        );
      })}
    </main>
  );
}
