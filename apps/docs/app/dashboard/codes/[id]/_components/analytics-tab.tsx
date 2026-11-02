import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Import as Download, Lock } from "iconsax-reactjs";
import Link from "next/link";
import {
  BreakdownCard,
  type BreakdownItem,
} from "@/app/dashboard/codes/_components/breakdown-card";
import {
  formatDate,
  formatNumber,
} from "@/app/dashboard/codes/_components/format";
import { ScansChart } from "@/app/dashboard/codes/_components/scans-chart";
import { codeTabHref } from "@/app/dashboard/codes/_lib/code-tabs";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { AnalyticsExtra } from "@/app/dashboard/codes/[id]/_components/analytics-extra";
import { SheetsExport } from "@/components/data-connections/sheets-export";
import { PLAN_LIMITS, PLANS } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import {
  type BreakdownRow,
  getScanAnalytics,
  resolveScanRange,
  SCAN_RANGE_KEYS,
  SCAN_RANGES,
  scanRangeLabel,
} from "@/lib/scans";

type Query = Record<string, string | string[] | undefined>;

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

/** "3 years of scan history", "every scan" (lib/plans.ts). */
function retentionText(days: number): string {
  if (!Number.isFinite(days)) return "every scan";
  if (days >= 365) {
    const years = Math.round(days / 365);
    return `${years} year${years === 1 ? "" : "s"} of scan history`;
  }
  return `${days} days of scan history`;
}

/** The cheapest plan that keeps at least `days` of scans. */
const planKeeping = (days: number) =>
  PLANS.find((plan) => PLAN_LIMITS[plan].analyticsRetentionDays >= days);

/** "Pro keeps 3 years of scan history and Business keeps every scan." */
function upgradeRetentionText(retentionDays: number): string {
  const longer = PLANS.filter(
    (plan) => PLAN_LIMITS[plan].analyticsRetentionDays > retentionDays,
  ).map(
    (plan) =>
      `${PLAN_NAMES[plan]} keeps ${retentionText(PLAN_LIMITS[plan].analyticsRetentionDays)}`,
  );
  return longer.length > 1
    ? `${longer.slice(0, -1).join(", ")} and ${longer.at(-1)}.`
    : `${longer[0] ?? ""}.`;
}

export function Metric({
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

/** The Analytics tab: date range, totals, the chart and every breakdown. */
export async function AnalyticsTab({
  code,
  retentionDays,
  query,
}: {
  code: QrCodeView;
  /** How far back the workspace's plan keeps scans (lib/plans.ts) */
  retentionDays: number;
  query: Query;
}) {
  const { range, days } = resolveScanRange(query.range, retentionDays);
  const analytics = await getScanAnalytics(code.id, days);
  const lockedRanges = SCAN_RANGE_KEYS.some(
    (key) => SCAN_RANGES[key] > retentionDays,
  );
  const exportHref = `/dashboard/codes/${encodeURIComponent(code.id)}/export?range=${range}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Date range" className="flex flex-wrap gap-1">
          {SCAN_RANGE_KEYS.map((key) => {
            const keeping = planKeeping(SCAN_RANGES[key]);
            return SCAN_RANGES[key] > retentionDays ? (
              <Button
                disabled
                key={key}
                size="sm"
                title={
                  keeping
                    ? `${PLAN_NAMES[keeping]} keeps ${scanRangeLabel(key)} of scan history`
                    : undefined
                }
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
                  href={codeTabHref(code.id, "analytics", {
                    params: { range: key },
                  })}
                  scroll={false}
                >
                  {scanRangeLabel(key)}
                </Link>
              </Button>
            );
          })}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a download href={exportHref}>
              <Download />
              Export CSV
            </a>
          </Button>
          <SheetsExport codeId={code.id} />
        </div>
      </div>
      {lockedRanges && (
        <p className="text-muted-foreground -mt-3 text-xs">
          Your plan keeps {retentionText(retentionDays)}.{" "}
          {upgradeRetentionText(retentionDays)}{" "}
          <Link className="underline" href="/pricing">
            Compare plans
          </Link>
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
    </div>
  );
}
