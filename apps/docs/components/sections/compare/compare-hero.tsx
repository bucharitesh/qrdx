import { Button } from "@repo/design-system/components/ui/button";
import { ArrowDown, ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { AsciiField } from "@/components/fx";
import { Breadcrumbs } from "@/components/sections/breadcrumbs";
import { CompareHeroLogos } from "@/components/sections/compare/compare-hero-logos";
import { CompareMigrateButton } from "@/components/sections/compare/compare-migrate-button";
import { breadcrumbSchema, JsonLd } from "@/components/sections/tools/json-ld";
import { compareMigration } from "@/lib/migrate/compare";

interface CompareHeroProps {
  slug: string;
  competitor: string;
  tagline: string;
}

export function CompareHero({ slug, competitor, tagline }: CompareHeroProps) {
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
      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 pt-14 pb-16 text-center md:pt-20 md:pb-20">
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
            <Link href="/playground">
              Try the Playground
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href="#at-a-glance">
              See the comparison
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
