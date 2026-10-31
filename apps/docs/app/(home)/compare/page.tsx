import { cn } from "@repo/design-system/lib/utils";
import type { Metadata } from "next";
import { AsciiField } from "@/components/fx";
import { CompareCard } from "@/components/sections/compare/compare-card";
import { createMetadata } from "@/lib/metadata";
import { compareSource } from "@/lib/source";

const title = "QRdx vs Other QR Code Generators and React QR Libraries";
const description =
  "Honest comparisons of QRdx with QR Code Monkey, QR Tiger, Canva, Bitly, Flowcode, qrcode.react and more: pricing, free-tier limits, and when each is the better pick.";

export const metadata: Metadata = createMetadata({
  title,
  description,
  path: "/compare",
});

const groups = [
  {
    category: "generator",
    heading: "QR code generators",
    intro:
      "Hosted tools for making QR codes in the browser. Most of them sell dynamic (editable, trackable) codes; QRdx has free static codes, plus dynamic codes and hosted pages that keep working on every plan.",
    columns: "sm:grid-cols-2 lg:grid-cols-3",
  },
  {
    category: "library",
    heading: "React and JavaScript QR code libraries",
    intro:
      "Packages you install from npm to render QR codes in your own app. Both are far more widely used than QRdx's npm package.",
    columns: "sm:grid-cols-2",
  },
] as const;

export default function CompareHubPage() {
  const pages = compareSource
    .getPages()
    .sort((a, b) => a.data.competitor.localeCompare(b.data.competitor));

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center divide-y divide-border">
      <section className="relative w-full overflow-hidden">
        <AsciiField
          variant="topo"
          seed={41}
          className="[mask-image:radial-gradient(ellipse_70%_75%_at_50%_45%,rgba(0,0,0,0.3)_15%,black_50%,transparent_80%)]"
        />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 pt-20 pb-16 text-center md:pt-28 md:pb-20">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {pages.length} honest comparisons
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            QRdx vs other QR code generators
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground md:text-lg">
            QRdx is a free, open-source (AGPL-3.0) QR code generator and React
            library. Each page compares it with a tool people weigh it against,
            including where the other tool is the better choice. Competitor
            prices and limits were checked on their own websites.
          </p>
        </div>
      </section>

      {groups.map((group) => {
        const items = pages.filter((p) => p.data.category === group.category);
        if (items.length === 0) return null;

        return (
          <section
            aria-labelledby={`compare-${group.category}`}
            className="w-full px-6 py-14 md:px-10 md:py-16"
            key={group.category}
          >
            <div className="mx-auto max-w-6xl">
              <div className="mb-8 flex max-w-2xl flex-col gap-2">
                <h2
                  className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
                  id={`compare-${group.category}`}
                >
                  {group.heading}
                </h2>
                <p className="text-pretty text-muted-foreground">
                  {group.intro}
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
