import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  BreakdownCard,
  type BreakdownItem,
} from "@/app/(app)/dashboard/codes/_components/breakdown-card";
import {
  displayUrl,
  formatDate,
  formatNumber,
} from "@/app/(app)/dashboard/codes/_components/format";
// NFC (feat/nfc): QR scans and NFC taps.
import { ScanSourceCard } from "@/app/(app)/dashboard/codes/_components/scan-source-card";
import { ScansChart } from "@/app/(app)/dashboard/codes/_components/scans-chart";
import { QrdxLogo } from "@/components/qrdx-logo";
import { accentUse } from "@/lib/client-brands-shared";
import {
  type PublicStats,
  type PublicStatsRange,
  publicStatsPath,
} from "@/lib/public-stats-shared";
import type { BreakdownRow } from "@/lib/scans";
import { logoImageSrc } from "@/lib/workspace-logo";

// What /stats/<token> shows (page.tsx loads it): aggregates only.

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
  all: "All time",
};

const PER_INTERVAL: Record<PublicStats["analytics"]["interval"], string> = {
  day: "per day",
  week: "per week",
  month: "per month",
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

export function PublicStatsShell({
  children,
  brand = null,
}: {
  children: ReactNode;
  /** A client brand (Pro and Business) replaces QRdx in the header */
  brand?: PublicStats["brand"];
}) {
  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10"
      style={brandStyle(brand?.accent ?? null)}
    >
      <header className="flex items-center justify-between gap-3">
        {brand ? (
          <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
            <BrandMark brand={brand} />
            <span className="truncate">{brand.name}</span>
          </span>
        ) : (
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
        )}
        <span className="text-muted-foreground shrink-0 text-xs">
          {brand ? "Scan report" : "Public scan analytics"}
        </span>
      </header>
      {children}
    </main>
  );
}

/**
 * The client's color, applied sparingly: the scans chart and the logo
 * tile. A color that can't be read on a theme's background (too pale on
 * white, too dark on black) leaves that theme monochrome.
 */
export function brandStyle(accent: string | null): CSSProperties | undefined {
  if (!accent) return;
  const use = accentUse(accent);
  return {
    "--brand-accent": accent,
    "--brand-on-accent": use.onAccent,
    "--brand-chart-light": use.light ? accent : "var(--foreground)",
    "--brand-chart-dark": use.dark ? accent : "var(--foreground)",
  } as CSSProperties;
}

/** The client's logo, or its initial on the accent color. */
export function BrandMark({
  brand,
}: {
  brand: NonNullable<PublicStats["brand"]>;
}) {
  const src = logoImageSrc(brand.logo);
  if (src) {
    return (
      <span className="bg-background ring-border flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1">
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          height={32}
          referrerPolicy="no-referrer"
          src={src}
          width={32}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold uppercase",
        brand.accent
          ? "bg-[var(--brand-accent)] text-[var(--brand-on-accent)]"
          : "bg-foreground text-background",
      )}
    >
      {brand.name.trim().charAt(0) || "C"}
    </span>
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

/** The range buttons; `hrefFor` builds each one's link. */
export function RangeNav({
  ranges,
  range,
  hrefFor,
}: {
  ranges: PublicStatsRange[];
  range: PublicStatsRange;
  hrefFor: (range: PublicStatsRange) => string;
}) {
  return (
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
            href={hrefFor(key)}
            prefetch={false}
            replace
            scroll={false}
          >
            {RANGE_LABELS[key]}
          </Link>
        </Button>
      ))}
    </nav>
  );
}

/**
 * The report itself: totals, QR and NFC split, scans over time and the
 * three breakdowns. Shared by /stats/<token> and the client portal
 * (agency tools). `accent`: a brand color set on an ancestor
 * (--brand-chart-light/dark) colors the chart.
 */
export function StatsReportBody({
  analytics,
  range,
  accent = false,
}: {
  analytics: PublicStats["analytics"];
  /** "all" describes the range from its first day instead of its days */
  range?: PublicStatsRange;
  accent?: boolean;
}) {
  const since = range === "all" ? formatDate(analytics.from) : null;
  const interval = analytics.interval ?? "day";
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Metric
          label={
            since ? "Scans, all time" : `Scans, last ${analytics.days} days`
          }
          value={formatNumber(analytics.total)}
        />
        <Metric
          label="Unique visitors"
          value={formatNumber(analytics.unique)}
        />
      </div>

      {/* NFC (feat/nfc) */}
      <ScanSourceCard
        description={since ? `Since ${since}` : `Last ${analytics.days} days`}
        sources={analytics.sources}
      />

      <Card className="gap-4 py-4">
        <CardHeader className="px-4">
          <CardTitle>Scans over time</CardTitle>
          <CardDescription>
            {since
              ? `Scans ${PER_INTERVAL[interval]}, since ${since} (UTC)`
              : `Scans per day, last ${analytics.days} days (UTC)`}
          </CardDescription>
        </CardHeader>
        <CardContent
          className={cn(
            "px-2 sm:px-4",
            accent &&
              "[--primary:var(--brand-chart-light)] dark:[--primary:var(--brand-chart-dark)]",
          )}
        >
          <ScansChart data={analytics.series} interval={interval} />
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
    </>
  );
}

/** The page for loaded stats; `token` builds the range links. */
export function PublicStatsView({
  stats,
  token,
}: {
  stats: PublicStats;
  token: string;
}) {
  const { code, analytics, range, ranges, brand, hideQrdx, hideShortLink } =
    stats;
  const name = code.title?.trim() || displayUrl(code.shortLink);

  return (
    <PublicStatsShell brand={brand}>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {name}
          </h1>
          <p className="text-muted-foreground flex flex-wrap gap-x-2 text-sm">
            {!hideShortLink && (
              <span className="font-mono">{displayUrl(code.shortLink)}</span>
            )}
            {code.destinationHost && (
              <>
                {!hideShortLink && <span aria-hidden>→</span>}
                <span>{code.destinationHost}</span>
              </>
            )}
          </p>
        </div>
        <RangeNav
          hrefFor={(key) => `${publicStatsPath(token)}?range=${key}`}
          range={range}
          ranges={ranges}
        />
      </section>

      <StatsReportBody
        accent={Boolean(brand?.accent)}
        analytics={analytics}
        range={range}
      />

      <footer className="text-muted-foreground mt-auto flex flex-col gap-1 pt-4 text-xs sm:flex-row sm:justify-between">
        <span>
          Each visitor counts once per day. Code created{" "}
          {formatDate(code.createdAt)}.
        </span>
        {!hideQrdx && (
          <span>
            Made with{" "}
            <Link
              className="text-foreground underline-offset-4 hover:underline"
              href="/"
            >
              QRdx
            </Link>
          </span>
        )}
      </footer>
    </PublicStatsShell>
  );
}
