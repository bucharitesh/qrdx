import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import {
  BreakdownCard,
  type BreakdownItem,
} from "@/app/dashboard/codes/_components/breakdown-card";
import {
  displayUrl,
  formatDate,
  formatNumber,
} from "@/app/dashboard/codes/_components/format";
import { ScansChart } from "@/app/dashboard/codes/_components/scans-chart";
import { QrdxLogo } from "@/components/qrdx-logo";
import { loadPublicStats } from "@/lib/public-stats";
import {
  type PublicStatsRange,
  parsePublicStatsRange,
  publicStatsPath,
} from "@/lib/public-stats-shared";
import { getClientIp } from "@/lib/request-guards";
import type { BreakdownRow } from "@/lib/scans";

// A code's public, read-only analytics (lib/public-stats.ts): aggregates
// only, never indexed, never tracked (customer-page-paths.ts), and the link
// is never sent on as a referrer.

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Plenty for people reading a shared page; it stops scraping by token.
const viewLimiter = createRateLimiter({ limiter: slidingWindow(60, "60 s") });

const load = cache(async (token: string, range: PublicStatsRange) =>
  loadPublicStats(token, range),
);

const NO_INDEX: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
  openGraph: null,
  twitter: null,
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const stats = await load(token, parsePublicStatsRange(query.range));
  if (!stats) return { title: "Not found", ...NO_INDEX };
  const name = stats.code.title?.trim() || displayUrl(stats.code.shortLink);
  return { title: `${name}: scan analytics`, ...NO_INDEX };
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

const DEVICE_LABELS: Record<string, string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
  other: "Other",
};

const RANGE_LABELS: Record<PublicStatsRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

const toItems = (
  rows: BreakdownRow[],
  label: (value: string) => string,
  unknown: string,
): BreakdownItem[] =>
  rows.map((row) => ({
    label: row.value ? label(row.value) : unknown,
    count: row.count,
  }));

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex items-center justify-between gap-3">
        <Link
          aria-label="QRdx home"
          className="flex items-center gap-2 text-sm font-semibold"
          href="/"
        >
          <span className="bg-foreground text-background flex size-7 items-center justify-center rounded-lg p-1.5">
            <QrdxLogo />
          </span>
          QRdx
        </Link>
        <span className="text-muted-foreground text-xs">
          Public scan analytics
        </span>
      </header>
      {children}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

export default async function PublicStatsPage({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);

  const limited = await viewLimiter
    .limit(`public-stats:view:${getClientIp({ headers: await headers() })}`)
    .then((result) => !result.success)
    .catch(() => false);
  if (limited) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <h1 className="text-lg font-semibold">Too many requests</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            This page was opened a lot in a short time. Try again in a minute.
          </p>
        </div>
      </Shell>
    );
  }

  const stats = await load(token, parsePublicStatsRange(query.range));
  if (!stats) notFound();

  const { code, analytics, range, ranges } = stats;
  const name = code.title?.trim() || displayUrl(code.shortLink);

  return (
    <Shell>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {name}
          </h1>
          <p className="text-muted-foreground flex flex-wrap gap-x-2 text-sm">
            <span className="font-mono">{displayUrl(code.shortLink)}</span>
            {code.destinationHost && (
              <>
                <span aria-hidden>→</span>
                <span>{code.destinationHost}</span>
              </>
            )}
          </p>
        </div>
        <nav aria-label="Date range" className="flex flex-wrap gap-1">
          {ranges.map((key) => (
            <Button
              asChild
              key={key}
              size="sm"
              variant={key === range ? "secondary" : "ghost"}
            >
              <Link
                aria-current={key === range ? "true" : undefined}
                href={`${publicStatsPath(token)}?range=${key}`}
                prefetch={false}
                replace
                scroll={false}
              >
                {RANGE_LABELS[key]}
              </Link>
            </Button>
          ))}
        </nav>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Metric
          label={`Scans, last ${analytics.days} days`}
          value={formatNumber(analytics.total)}
        />
        <Metric
          label="Unique visitors"
          value={formatNumber(analytics.unique)}
        />
      </div>

      <Card className="gap-4 py-4">
        <CardHeader className="px-4">
          <CardTitle>Scans over time</CardTitle>
          <CardDescription>
            Scans per day, last {analytics.days} days (UTC)
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          <ScansChart data={analytics.series} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <BreakdownCard
          items={toItems(analytics.countries, countryName, "Unknown")}
          title="Top countries"
          total={analytics.total}
        />
        <BreakdownCard
          items={toItems(
            analytics.devices,
            (value) => DEVICE_LABELS[value] ?? value,
            "Unknown",
          )}
          title="Devices"
          total={analytics.total}
        />
        <BreakdownCard
          items={toItems(analytics.referrers, (value) => value, "Direct scan")}
          title="Referrers"
          total={analytics.total}
        />
      </div>

      <footer className="text-muted-foreground mt-auto flex flex-col gap-1 pt-4 text-xs sm:flex-row sm:justify-between">
        <span>
          Each visitor counts once per day. Code created{" "}
          {formatDate(code.createdAt)}.
        </span>
        <span>
          Made with{" "}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            href="/"
          >
            QRdx
          </Link>
        </span>
      </footer>
    </Shell>
  );
}
