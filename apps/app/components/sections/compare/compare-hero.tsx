import { JsonLd } from "@repo/design-system/components/seo/json-ld";
import { Button } from "@repo/design-system/components/ui/button";
import { ArrowDown, ArrowRight } from "iconsax-reactjs";
import { AsciiField } from "@/components/fx";
import { LocaleLink } from "@/components/i18n/locale-link";
import { Breadcrumbs } from "@/components/sections/breadcrumbs";
import { CompareHeroLogos } from "@/components/sections/compare/compare-hero-logos";
import { CompareMigrateButton } from "@/components/sections/compare/compare-migrate-button";
import { breadcrumbSchema } from "@/components/sections/tools/json-ld";
import { compareMigration } from "@/lib/migrate/compare";
import { playgroundHref } from "@/lib/playground-links";

interface CompareHeroProps {
  slug: string;
  competitor: string;
  tagline: string;
  /**
   * The page's "<competitor> alternatives" heading. When set, that list sits
   * right under the hero and the second button jumps to it.
   */
  alternativesLabel?: string;
}

export function CompareHero({
  slug,
  competitor,
  tagline,
  alternativesLabel,
}: CompareHeroProps) {
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Compare", path: "/compare" },
    { name: `QRdx vs ${competitor}`, path: `/compare/${slug}` },
  ];
  const migration = compareMigration(slug, competitor);

  return (
    <section className="relative w-full overflow-hidden">
      <JsonLd data={breadcrumbSchema(crumbs)} />
      <AsciiField
        variant="topo"
        seed={slug.length * 13 + slug.charCodeAt(0)}
        className="[mask-image:radial-gradient(ellipse_70%_75%_at_50%_45%,rgba(0,0,0,0.3)_15%,black_50%,transparent_80%)]"
      />
      <div className="relative mx-auto flex max-w-[50rem] flex-col items-center gap-8 px-10 pt-14 pb-16 text-center md:pt-20 md:pb-20">
        <CompareHeroLogos competitor={competitor} slug={slug} />
        <div className="flex flex-col items-center gap-4">
          <Breadcrumbs items={crumbs} />
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            QRdx vs {competitor}
          </h1>
          <p className="max-w-xl text-pretty text-muted-foreground md:text-lg">
            {tagline}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <LocaleLink href={playgroundHref()}>
              Try the Playground
              <ArrowRight aria-hidden />
            </LocaleLink>
          </Button>
          <Button asChild variant="outline">
            <a href={alternativesLabel ? "#alternatives" : "#at-a-glance"}>
              {alternativesLabel ?? "See the comparison"}
              <ArrowDown aria-hidden />
            </a>
          </Button>
          <CompareMigrateButton
            docs={migration.kind === "library"}
            href={migration.href}
            label={migration.label}
          />
        </div>
      </div>
    </section>
  );
}
