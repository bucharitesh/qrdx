import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CompetitorLogo } from "@/components/sections/compare/competitor-logo";
import { SectionHeader } from "@/components/sections/section-header";
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
  },
  {
    category: "library",
    heading: "React and JavaScript QR code libraries",
    intro:
      "Packages you install from npm to render QR codes in your own app. Both are far more widely used than QRdx's npm package.",
  },
] as const;

export default function CompareHubPage() {
  const pages = compareSource
    .getPages()
    .sort((a, b) => a.data.competitor.localeCompare(b.data.competitor));

  return (
    <main className="flex flex-col items-center justify-center divide-y divide-border min-h-screen w-full">
      <section className="w-full relative">
        <div className="absolute inset-0 -z-10 h-full w-full [background:radial-gradient(125%_125%_at_50%_10%,var(--background)_40%,var(--primary)_100%)] rounded-b-xl" />
        <div className="relative z-10 pt-32 pb-20 px-6 max-w-3xl mx-auto flex flex-col items-center gap-5">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tighter text-balance text-center text-secondary-foreground">
            QRdx vs other QR code generators
          </h1>
          <p className="text-base md:text-lg text-center text-muted-foreground font-medium text-balance leading-relaxed tracking-tight">
            QRdx is a free, open-source (AGPL-3.0) QR code generator and React
            library. These pages compare it with the tools people usually weigh
            it against, including where the other tool is the better choice.
            Competitor prices and limits were checked against their own
            websites.
          </p>
        </div>
      </section>

      {groups.map((group) => {
        const items = pages.filter((p) => p.data.category === group.category);
        if (items.length === 0) return null;

        return (
          <section
            key={group.category}
            className="flex flex-col items-center justify-center w-full"
          >
            <SectionHeader>
              <h2 className="text-2xl md:text-3xl font-medium tracking-tighter text-center text-balance">
                {group.heading}
              </h2>
              <p className="text-muted-foreground text-center text-balance font-medium text-sm">
                {group.intro}
              </p>
            </SectionHeader>

            <div className="w-full px-6 md:px-10 py-10">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((page) => {
                  const slug = page.slugs[0] ?? "";
                  const { competitor, competitorLogo, tagline } = page.data;

                  return (
                    <Link
                      key={slug}
                      href={`/compare/${slug}`}
                      className="group rounded-xl border border-border bg-accent/50 hover:bg-accent transition-colors p-5 flex flex-col gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <CompetitorLogo
                          name={competitor}
                          src={competitorLogo}
                          className="size-8 shrink-0"
                        />
                        <span className="text-base font-semibold text-secondary-foreground">
                          QRdx vs {competitor}
                        </span>
                        <ArrowRight className="ml-auto size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {tagline}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </main>
  );
}
