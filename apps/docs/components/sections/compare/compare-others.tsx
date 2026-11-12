import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { CompareCard } from "@/components/sections/compare/compare-card";
import { pickCompareSiblings } from "@/lib/compare-siblings";
import { compareSource } from "@/lib/source";

/** Six cards fill two rows of three (or three of two) with no orphans. */
const SHOWN = 6;

interface CompareOthersProps {
  currentSlug: string;
}

export function CompareOthers({ currentSlug }: CompareOthersProps) {
  const pages = compareSource.getPages();
  // A rotation, so every comparison gets about as many sibling links.
  const others = pickCompareSiblings(
    pages.map((page) => ({
      page,
      slug: page.slugs[0] ?? "",
      name: page.data.competitor,
      category: page.data.category,
    })),
    currentSlug,
    SHOWN,
  ).map(({ page }) => page);

  if (others.length === 0) return null;

  return (
    <section
      aria-labelledby="compare-others"
      className="w-full px-10 py-14 md:py-16"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2
              className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
              id="compare-others"
            >
              More comparisons
            </h2>
            <p className="text-pretty text-muted-foreground">
              How QRdx stacks up against other QR code generators and React QR
              code libraries.
            </p>
          </div>
          <Link
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
            href="/compare"
          >
            All {pages.length} comparisons
            <ArrowRight
              aria-hidden
              className="size-4 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((page) => {
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
}
