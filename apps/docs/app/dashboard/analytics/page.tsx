import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { ChartNoAxesColumn, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/app/dashboard/_components/page-header";
import {
  BreakdownCard,
  type BreakdownItem,
} from "@/app/dashboard/codes/_components/breakdown-card";
import { formatNumber } from "@/app/dashboard/codes/_components/format";
import { ScansChart } from "@/app/dashboard/codes/_components/scans-chart";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import {
  LanguagesCard,
  TimeCard,
} from "@/app/dashboard/codes/[id]/_components/analytics-extra";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import {
  getLanguageBreakdown,
  getScanSparklines,
  getScanTimeBreakdown,
  normalizeTimeZone,
  rangeStart,
  resolveScanRange,
  SCAN_RANGE_KEYS,
  SCAN_RANGES,
  scanRangeLabel,
} from "@/lib/scans";
import { CompareChart } from "./_components/charts";
import { ComparePicker } from "./_components/compare-picker";
import { TimeZoneSwitch } from "./_components/time-zone-switch";
import {
  type ConversionSummary,
  filterScopeCodeIds,
  getCodeTotals,
  getConversionSummary,
  getWorkspaceAnalytics,
  listCodeOptions,
  scopeScansWhere,
} from "./_lib/queries";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

const PATH = "/dashboard/analytics";
const MAX_COMPARE = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

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

async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.error("Workspace analytics failed:", error);
    return null;
  }
}

function parseCompare(value: string | undefined): string[] {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id));
  return [...new Set(ids)].slice(0, MAX_COMPARE);
}

const codeLabel = (code: { title: string | null; slug: string }) =>
  code.title || `/${code.slug}`;

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

function hrefWith(
  params: Record<string, string>,
  patch: Record<string, string | null>,
) {
  const search = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value) search.set(key, value);
    else search.delete(key);
  }
  const query = search.toString();
  return query ? `${PATH}?${query}` : PATH;
}

function ConversionsSummary({
  conversions,
}: {
  conversions: ConversionSummary;
}) {
  const revenue = conversions.revenue.filter((row) => Number(row.total) > 0);
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle>Conversions</CardTitle>
        <CardDescription>
          Sales and sign-ups attributed to scans
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-6 px-4">
        <div>
          <p className="text-muted-foreground text-xs">Conversions</p>
          <p className="text-xl font-bold tabular-nums">
            {formatNumber(conversions.count)}
          </p>
        </div>
        {revenue.map((row) => (
          <div key={row.currency ?? "none"}>
            <p className="text-muted-foreground text-xs">
              Revenue{row.currency ? ` (${row.currency})` : ""}
            </p>
            <p className="text-xl font-bold tabular-nums">
              {Number(row.total).toLocaleString("en-US", {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const scope = await requireDashboardScope();
  const query = await searchParams;
  const limits = getPlanLimits(await getPlanForScope(scope));
  const retentionDays = limits.analyticsRetentionDays;
  const { range, days } = resolveScanRange(first(query.range), retentionDays);
  const from = rangeStart(days);
  const timeZone = normalizeTimeZone(first(query.tz));
  const requested = parseCompare(first(query.compare));

  const [overview, time, languages, options, compareIds, conversions] =
    await Promise.all([
      getWorkspaceAnalytics(scope, from, days),
      settle(getScanTimeBreakdown(scopeScansWhere(scope), from, timeZone)),
      settle(getLanguageBreakdown(scopeScansWhere(scope), from)),
      listCodeOptions(scope),
      filterScopeCodeIds(scope, requested),
      limits.conversions
        ? settle(getConversionSummary({ scope }, from))
        : Promise.resolve(null),
    ]);
  const [sparklines, compareTotals] = await Promise.all([
    getScanSparklines(compareIds, days),
    getCodeTotals(compareIds, from),
  ]);

  const params: Record<string, string> = {};
  for (const key of ["range", "tz", "compare"]) {
    const value = first(query[key]);
    if (value) params[key] = value;
  }
  if (compareIds.length > 0) params.compare = compareIds.join(",");
  else delete params.compare;
  const { tz: _tz, ...withoutTz } = params;
  const { compare: _compare, ...withoutCompare } = params;

  const optionLabels = new Map(
    options.map((option) => [option.id, codeLabel(option)]),
  );
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10),
  );

  const header = (
    <PageHeader
      description="Scans across every dynamic code in this workspace."
      title="Analytics"
    />
  );

  if (overview.codes === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartNoAxesColumn />
            </EmptyMedia>
            <EmptyTitle>No dynamic codes yet</EmptyTitle>
            <EmptyDescription>
              Create a dynamic QR code and its scans show up here, next to every
              other code in this workspace.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/dashboard">Go to codes</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const toItems = (
    rows: { value: string | null; count: number }[],
    label: (value: string) => string,
  ): BreakdownItem[] =>
    rows.map((row) => ({
      label: row.value ? label(row.value) : "Unknown",
      count: row.count,
    }));

  return (
    <div className="space-y-6">
      {header}

      <nav aria-label="Date range" className="flex flex-wrap gap-1">
        {SCAN_RANGE_KEYS.map((key) =>
          SCAN_RANGES[key] > retentionDays ? (
            <Button
              disabled
              key={key}
              size="sm"
              title="Your plan keeps a shorter scan history"
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
                href={hrefWith(params, { range: key })}
                scroll={false}
              >
                {scanRangeLabel(key)}
              </Link>
            </Button>
          ),
        )}
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Dynamic codes" value={formatNumber(overview.codes)} />
        <Metric
          hint="Since each code was created"
          label="Total scans"
          value={formatNumber(overview.allTimeScans)}
        />
        <Metric
          hint={`Last ${scanRangeLabel(range).replace(/^1 /, "")} (UTC)`}
          label="Scans in range"
          value={formatNumber(overview.total)}
        />
        <Metric
          hint="Each visitor counts once per day"
          label="Unique visitors"
          value={formatNumber(overview.unique)}
        />
      </div>

      <Card className="gap-4 py-4">
        <CardHeader className="px-4">
          <CardTitle>Scans over time</CardTitle>
          <CardDescription>
            All codes, per day, last {scanRangeLabel(range).replace(/^1 /, "")}{" "}
            (UTC)
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          <ScansChart data={overview.series} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Top codes</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            {overview.topCodes.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No scans in this period
              </p>
            ) : (
              <ol className="space-y-1.5">
                {overview.topCodes.map((code) => (
                  <li
                    className="flex items-center justify-between gap-3 text-sm"
                    key={code.id}
                  >
                    <Link
                      className="min-w-0 truncate hover:underline"
                      href={`/dashboard/codes/${encodeURIComponent(code.id)}`}
                    >
                      {codeLabel(code)}
                    </Link>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {formatNumber(code.scans)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <BreakdownCard
          items={toItems(overview.countries, countryName)}
          title="Top countries"
          total={overview.total}
        />
        <BreakdownCard
          items={toItems(
            overview.devices,
            (value) => DEVICE_LABELS[value] ?? value,
          )}
          title="Devices"
          total={overview.total}
        />
        {languages && <LanguagesCard languages={languages} />}
      </div>

      {time && (
        <TimeCard
          days={days}
          switcher={
            <TimeZoneSwitch
              current={time.timeZone}
              params={withoutTz}
              path={PATH}
            />
          }
          time={time}
        />
      )}

      <Card className="gap-4 py-4">
        <CardHeader className="px-4">
          <CardTitle>Compare codes</CardTitle>
          <CardDescription>
            Daily scans of up to {MAX_COMPARE} codes side by side (UTC).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-2 sm:px-4">
          <ComparePicker
            options={options.map((option) => ({
              id: option.id,
              label: codeLabel(option),
            }))}
            params={withoutCompare}
            path={PATH}
            selected={compareIds}
          />
          {compareIds.length > 0 ? (
            <>
              <CompareChart
                dates={dates}
                series={compareIds.map((id) => ({
                  id,
                  label: optionLabels.get(id) ?? id,
                  counts: sparklines.get(id) ?? [],
                }))}
              />
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {compareIds.map((id) => {
                  const totals = compareTotals.get(id);
                  return (
                    <li className="rounded-md border p-3 text-sm" key={id}>
                      <Link
                        className="block truncate font-medium hover:underline"
                        href={`/dashboard/codes/${encodeURIComponent(id)}`}
                      >
                        {optionLabels.get(id) ?? id}
                      </Link>
                      <p className="text-muted-foreground tabular-nums">
                        {formatNumber(totals?.scans ?? 0)} scans ·{" "}
                        {formatNumber(totals?.unique ?? 0)} unique
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground px-2 text-sm sm:px-0">
              Pick codes above to compare them.
            </p>
          )}
        </CardContent>
      </Card>

      {conversions && conversions.count > 0 && (
        <ConversionsSummary conversions={conversions} />
      )}
      <p className="text-muted-foreground text-xs">
        Bots and link previews are not counted. Locations come from the
        visitor's IP address, which is never stored.
      </p>
    </div>
  );
}
