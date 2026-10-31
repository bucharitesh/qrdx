import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { ArrowLeft, Import as Download, Lock } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCodeMarketing } from "@/actions/code-marketing";
import {
  BreakdownCard,
  type BreakdownItem,
} from "@/app/dashboard/codes/_components/breakdown-card";
import { CodeOverview } from "@/app/dashboard/codes/_components/code-overview";
import {
  formatDate,
  formatNumber,
} from "@/app/dashboard/codes/_components/format";
import { ScansChart } from "@/app/dashboard/codes/_components/scans-chart";
import {
  getCode,
  requireDashboardScope,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { AnalyticsExtra } from "@/app/dashboard/codes/[id]/_components/analytics-extra";
import { HistoryPanel } from "@/app/dashboard/codes/[id]/_components/history-panel";
import { LandingPagePanel } from "@/app/dashboard/codes/[id]/_components/landing-page-panel";
import { LifecyclePanel } from "@/app/dashboard/codes/[id]/_components/lifecycle-panel";
import { PixelsPanel } from "@/app/dashboard/codes/[id]/_components/pixels-panel";
import { RoutingPanel } from "@/app/dashboard/codes/[id]/_components/routing-panel";
import { UtmPanel } from "@/app/dashboard/codes/[id]/_components/utm-panel";
import { SheetsExportButton } from "@/components/data-connections/sheets-export-button";
import { HttpError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import {
  type BreakdownRow,
  getScanAnalytics,
  resolveScanRange,
  SCAN_RANGE_KEYS,
  SCAN_RANGES,
  scanRangeLabel,
} from "@/lib/scans";

export const metadata: Metadata = {
  title: "QR code analytics",
  robots: { index: false, follow: false },
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string | null): string | null {
  if (!code) return null;
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

const toItems = (
  rows: BreakdownRow[],
  label: (value: string) => string = (value) => value,
  unknown = "Unknown",
): BreakdownItem[] =>
  rows.map((row) => ({
    label: row.value ? label(row.value) : unknown,
    count: row.count,
  }));

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="text-muted-foreground px-4 text-xs">
          {hint}
        </CardContent>
      )}
    </Card>
  );
}

export default async function CodeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scope = await requireDashboardScope();
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const [code, plan] = await Promise.all([
    getCode(scope, id).catch((error: unknown) => {
      if (error instanceof HttpError && error.status === 404) notFound();
      throw error;
    }),
    getPlanForScope(scope),
  ]);
  const retentionDays = getPlanLimits(plan).analyticsRetentionDays;
  const { range, days } = resolveScanRange(query.range, retentionDays);
  const analytics = await getScanAnalytics(code.id, days);
  const lockedRanges = SCAN_RANGE_KEYS.some(
    (key) => SCAN_RANGES[key] > retentionDays,
  );
  const detailHref = `/dashboard/codes/${encodeURIComponent(code.id)}`;
  // Shared by the routing, UTM and pixels panels (streams in).
  const marketing = getCodeMarketing(code.id);

  return (
    <div className="space-y-6">
      <Button asChild size="sm" variant="ghost">
        <Link href="/dashboard">
          <ArrowLeft />
          All codes
        </Link>
      </Button>

      <CodeOverview code={code} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Date range" className="flex flex-wrap gap-1">
          {SCAN_RANGE_KEYS.map((key) =>
            SCAN_RANGES[key] > retentionDays ? (
              <Button
                disabled
                key={key}
                size="sm"
                title="Pro keeps 3 years of scan history"
                variant="ghost"
              >
                {scanRangeLabel(key)}
                <Lock />
              </Button>
            ) : (
              <Button
                asChild
                key={key}
                size="sm"
                variant={key === range ? "secondary" : "ghost"}
              >
                <Link
                  aria-current={key === range ? "true" : undefined}
                  href={`${detailHref}?range=${key}`}
                  scroll={false}
                >
                  {scanRangeLabel(key)}
                </Link>
              </Button>
            ),
          )}
        </nav>
        <Button asChild size="sm" variant="outline">
          <a download href={`${detailHref}/export?range=${range}`}>
            <Download />
            Export CSV
          </a>
        </Button>
        <SheetsExportButton codeId={code.id} />
      </div>
      {lockedRanges && (
        <p className="text-muted-foreground -mt-3 text-xs">
          Your plan keeps {retentionDays} days of scan history.{" "}
          <Link className="underline" href="/pricing">
            Pro
          </Link>{" "}
          keeps 3 years and Business keeps all of it.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          hint="Since the code was created"
          label="Total scans"
          value={formatNumber(code.scanCount)}
        />
        <Metric
          hint={`Last ${days} days (UTC)`}
          label="Scans in range"
          value={formatNumber(analytics.total)}
        />
        <Metric
          hint="Each visitor counts once per day"
          label="Unique visitors"
          value={formatNumber(analytics.unique)}
        />
        <Metric label="Last scan" value={formatDate(code.lastScannedAt)} />
      </div>

      <Card className="gap-4 py-4">
        <CardHeader className="px-4">
          <CardTitle>Scans over time</CardTitle>
          <CardDescription>
            Scans per day, last {days} days (UTC)
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          <ScansChart data={analytics.series} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <BreakdownCard
          items={toItems(
            analytics.countries,
            (value) => countryName(value) ?? value,
          )}
          title="Top countries"
          total={analytics.total}
        />
        <BreakdownCard
          items={analytics.cities.map((row) => {
            const country = countryName(row.country);
            return {
              label: row.city
                ? [row.city, country].filter(Boolean).join(", ")
                : country
                  ? `Unknown city (${country})`
                  : "Unknown",
              count: row.count,
            };
          })}
          title="Top cities"
          total={analytics.total}
        />
        <BreakdownCard
          items={toItems(
            analytics.devices,
            (value) => DEVICE_LABELS[value] ?? value,
          )}
          title="Devices"
          total={analytics.total}
        />
        <BreakdownCard
          items={toItems(analytics.os)}
          title="Operating systems"
          total={analytics.total}
        />
        <BreakdownCard
          items={toItems(analytics.browsers)}
          title="Browsers"
          total={analytics.total}
        />
        <BreakdownCard
          items={toItems(
            analytics.referrers,
            undefined,
            "Direct (no referrer)",
          )}
          title="Referrers"
          total={analytics.total}
        />
      </div>
      <AnalyticsExtra codeId={code.id} days={days} query={query} />
      <p className="text-muted-foreground text-xs">
        Bots and link previews are not counted. Locations come from the
        visitor's IP address, which is never stored.
      </p>

      {/* Settings panels: one line each, stacked. */}
      <section aria-labelledby="code-settings" className="space-y-4">
        <h2 className="text-lg font-semibold" id="code-settings">
          Settings
        </h2>
        <LandingPagePanel codeId={code.id} />
        <LifecyclePanel codeId={code.id} />
        <RoutingPanel settings={marketing} />
        <UtmPanel settings={marketing} />
        <PixelsPanel settings={marketing} />
        <HistoryPanel codeId={code.id} />
      </section>
    </div>
  );
}
