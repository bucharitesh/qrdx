import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { QrdxLogo } from "@/components/qrdx-logo";
import { CompetitorLogo } from "@/components/sections/compare/competitor-logo";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { compareSource } from "@/lib/content-source";
import { baseUrl } from "@/lib/metadata";
import { PLAN_LIMITS } from "@/lib/plans";
import { formatPrice, PRICING } from "@/lib/pricing";

/** One tool in a page's `alternatives` frontmatter (source.config.ts). */
export interface Alternative {
  name: string;
  /** Its comparison page, /compare/<slug> */
  slug: string;
  bestFor: string;
  freeTier: string;
  paidFrom: string;
  /** The vendor page the free tier and price were read from */
  source: string;
  /** ISO date that page was checked */
  lastVerified: string;
}

export interface Alternatives {
  heading: string;
  intro: string;
  /** What QRdx's row says it's best for on this page */
  qrdxBestFor: string;
  tools: Alternative[];
}

const usd = (amount: number) => formatPrice(amount, "USD");

/**
 * QRdx's own row, from lib/plans.ts and lib/pricing.ts rather than
 * frontmatter, so its limits and price can't drift from the code.
 */
export function qrdxAlternative(bestFor: string) {
  const { free } = PLAN_LIMITS;
  const pro = PRICING.pro;
  return {
    name: "QRdx",
    bestFor,
    freeTier: `Unlimited static codes with logos and SVG, no account; ${free.dynamicCodes} dynamic codes and ${free.landingPages} hosted pages with a free account`,
    paidFrom: `Pro ${usd(pro.month.amounts.USD)}/mo or ${usd(pro.year.amounts.USD)}/yr`,
  };
}

const checked = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const GRID =
  "grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)]";

const COLUMNS = ["Tool", "Best for", "Free tier", "Paid plans from"] as const;

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-1.5 md:p-4">
      <dt className="text-xs text-muted-foreground md:sr-only">{label}</dt>
      <dd className="text-sm text-pretty text-foreground/90">{children}</dd>
    </div>
  );
}

interface CompareAlternativesProps {
  competitor: string;
  alternatives: Alternatives;
}

/**
 * "<competitor> alternatives": QRdx first (we make it, and the section says
 * so), then other tools QRdx has a comparison page for, each linked to it.
 * The ItemList node lists the same tools in the same order.
 */
export function CompareAlternatives({
  competitor,
  alternatives,
}: CompareAlternativesProps) {
  const { heading, intro, qrdxBestFor, tools } = alternatives;
  const qrdx = qrdxAlternative(qrdxBestFor);
  // Each tool's own comparison page; a slug without one is left out
  // (tests/lib/compare-alternatives.test.ts keeps them in step).
  const rows = tools.flatMap((tool) => {
    const page = compareSource.getPage([tool.slug]);
    if (!page) return [];
    // A page with its own alternatives list is linked by that list's name.
    const label =
      page.data.alternatives?.heading ?? `QRdx vs ${page.data.competitor}`;
    return [{ ...tool, label }];
  });

  return (
    <section
      aria-labelledby="alternatives-heading"
      className="w-full scroll-mt-20 px-10 py-14 md:py-16"
      id="alternatives"
    >
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: heading,
          itemListElement: [
            { name: qrdx.name, path: "/" },
            ...rows.map((row) => ({
              name: row.name,
              path: `/compare/${row.slug}`,
            })),
          ].map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            url: new URL(item.path, baseUrl).toString(),
          })),
        }}
      />
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
        <h2
          className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
          id="alternatives-heading"
        >
          {heading}
        </h2>
        <p className="text-pretty text-muted-foreground">{intro}</p>
        <p className="text-sm text-pretty text-muted-foreground">
          We make QRdx, so it's listed first. Free tiers and prices come from
          each vendor's pricing page on the date shown; check it before you buy.
        </p>
      </div>

      <Card className="mx-auto mt-10 max-w-5xl gap-0 overflow-hidden py-0 shadow-xs">
        <div aria-hidden className={cn(GRID, "bg-muted/40 max-md:hidden")}>
          {COLUMNS.map((column) => (
            <div
              className="p-4 text-sm font-medium text-muted-foreground"
              key={column}
            >
              {column}
            </div>
          ))}
        </div>

        <ul aria-label={heading}>
          <li className={cn(GRID, "py-2 md:py-0 md:border-t")}>
            <div className="flex flex-col gap-1.5 px-4 pt-2 pb-1.5 md:p-4">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white p-1.5 text-neutral-950 ring-1 ring-black/5 dark:ring-white/10">
                  <QrdxLogo className="size-full" />
                </span>
                {qrdx.name}
              </span>
              <Link
                className="text-xs font-medium text-muted-foreground underline decoration-foreground/20 underline-offset-4 hover:text-foreground hover:decoration-foreground"
                href="/pricing"
              >
                QRdx plans and limits
              </Link>
            </div>
            <dl className="contents">
              <Fact label={COLUMNS[1]}>{qrdx.bestFor}</Fact>
              <Fact label={COLUMNS[2]}>{qrdx.freeTier}</Fact>
              <Fact label={COLUMNS[3]}>{qrdx.paidFrom}</Fact>
            </dl>
          </li>

          {rows.map((row) => (
            <li className={cn(GRID, "border-t py-2 md:py-0")} key={row.slug}>
              <div className="flex flex-col gap-1.5 px-4 pt-2 pb-1.5 md:p-4">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <CompetitorLogo name={row.name} size="sm" slug={row.slug} />
                  <span className="text-pretty">{row.name}</span>
                </span>
                <Link
                  className="group text-xs font-medium text-muted-foreground underline decoration-foreground/20 underline-offset-4 hover:text-foreground hover:decoration-foreground"
                  href={`/compare/${row.slug}`}
                >
                  {row.label}
                  <ArrowRight
                    aria-hidden
                    className="ml-1 inline size-3 align-[-2px] transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
              <dl className="contents">
                <Fact label={COLUMNS[1]}>{row.bestFor}</Fact>
                <Fact label={COLUMNS[2]}>{row.freeTier}</Fact>
                <div className="flex flex-col gap-0.5 px-4 py-1.5 md:p-4">
                  <dt className="text-xs text-muted-foreground md:sr-only">
                    {COLUMNS[3]}
                  </dt>
                  <dd className="text-sm text-pretty text-foreground/90">
                    {row.paidFrom}
                  </dd>
                  <dd className="text-xs text-muted-foreground">
                    <a
                      className="underline decoration-foreground/20 underline-offset-4 hover:text-foreground hover:decoration-foreground"
                      href={row.source}
                      rel="noopener noreferrer nofollow"
                      target="_blank"
                    >
                      Checked{" "}
                      {checked.format(
                        new Date(`${row.lastVerified}T00:00:00Z`),
                      )}
                    </a>
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </Card>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-pretty text-muted-foreground">
        Below: QRdx and {competitor} side by side, and where {competitor} is the
        better choice.
      </p>
    </section>
  );
}
