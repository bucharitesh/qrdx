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
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Lock } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { use } from "react";
import { PageHeader } from "@/app/(app)/dashboard/_components/page-header";
import { CompareChart } from "@/app/(app)/dashboard/analytics/_components/charts";
import { ComparePicker } from "@/app/(app)/dashboard/analytics/_components/compare-picker";
import { TimeZoneSwitch } from "@/app/(app)/dashboard/analytics/_components/time-zone-switch";
import {
  codeLabel,
  toCompareOption,
} from "@/app/(app)/dashboard/analytics/_lib/code-label";
import {
  type ConversionSummary,
  codeOptionsByIds,
  filterScopeCodeIds,
  getCodeTotals,
  getConversionSummary,
  getWorkspaceAnalytics,
  scopeScansWhere,
  searchCodeOptions,
} from "@/app/(app)/dashboard/analytics/_lib/queries";
import {
  BreakdownCard,
  type BreakdownItem,
} from "@/app/(app)/dashboard/codes/_components/breakdown-card";
import { formatNumber } from "@/app/(app)/dashboard/codes/_components/format";
// NFC (feat/nfc): QR scans and NFC taps.
import { ScanSourceCard } from "@/app/(app)/dashboard/codes/_components/scan-source-card";
import { ScansChart } from "@/app/(app)/dashboard/codes/_components/scans-chart";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  LanguagesCard,
  TimeCard,
} from "@/app/(app)/dashboard/codes/[id]/_components/analytics-extra";
import { InfoHint } from "@/components/help/info-hint";
import { HairlineFigure } from "@/components/mockups/hairline";
import { getAppTranslations } from "@/lib/i18n/app-locale";
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
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

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
  path: string,
  params: Record<string, string>,
  patch: Record<string, string | null>,
) {
  const search = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value) search.set(key, value);
    else search.delete(key);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function ConversionsSummary({
  conversions,
}: {
  conversions: ConversionSummary;
}) {
  const t = use(getAppTranslations("app.dashboard.analytics.page"));
  const revenue = conversions.revenue.filter((row) => Number(row.total) > 0);
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle>{t("conversions")}</CardTitle>
        <CardDescription>{t("salesAndSignUpsAttributed")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-6 px-4">
        <div>
          <p className="text-muted-foreground text-xs">{t("conversions")}</p>
          <p className="text-xl font-bold tabular-nums">
            {formatNumber(conversions.count)}
          </p>
        </div>
        {revenue.map((row) => (
          <div key={row.currency ?? "none"}>
            <p className="text-muted-foreground text-xs">
              {t("revenue")}
              {row.currency ? ` (${row.currency})` : ""}
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
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Query>;
}) {
  const t = await getAppTranslations("app.dashboard.analytics.page");
  const scope = await requireDashboardScope();
  const [query, { workspace }] = await Promise.all([searchParams, routeParams]);
  const href = (path: string) => workspaceHref(workspace, path);
  const PATH = href("/analytics");
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
      // The picker's list before anything is typed: the most scanned codes.
      searchCodeOptions(scope),
      filterScopeCodeIds(scope, requested),
      limits.conversions
        ? settle(getConversionSummary({ scope }, from))
        : Promise.resolve(null),
    ]);
  const [sparklines, compareTotals, compared] = await Promise.all([
    getScanSparklines(compareIds, days),
    getCodeTotals(compareIds, from),
    // Names for the compared codes, which may be outside the picker's list.
    codeOptionsByIds(scope, compareIds),
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
    compared.map((option) => [option.id, codeLabel(option)]),
  );
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10),
  );

  const header = (
    <PageHeader
      description={t("scansAcrossEveryDynamicCode")}
      title={
        <>
          {t("analytics")}{" "}
          <InfoHint align="start" id="scan-analytics" side="bottom" />
        </>
      }
    />
  );

  if (overview.codes === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Empty className="border">
          <EmptyHeader>
            <HairlineFigure className="mx-auto mb-2 h-28 w-40" figure="Chart" />
            <EmptyTitle>{t("noDynamicCodesYet")}</EmptyTitle>
            <EmptyDescription>{t("createADynamicQrCode")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={href("/codes")}>{t("goToCodes")}</Link>
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
      label: row.value ? label(row.value) : t("unknown"),
      count: row.count,
    }));

  return (
    <div className="space-y-6">
      {header}

      <nav aria-label={t("dateRange")} className="flex flex-wrap gap-1">
        {SCAN_RANGE_KEYS.map((key) =>
          SCAN_RANGES[key] > retentionDays ? (
            <Button
              disabled
              key={key}
              size="sm"
              title={t("yourPlanKeepsAShorter")}
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
                href={hrefWith(PATH, params, { range: key })}
                scroll={false}
              >
                {scanRangeLabel(key)}
              </Link>
            </Button>
          ),
        )}
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label={t("dynamicCodes")}
          value={formatNumber(overview.codes)}
        />
        <Metric
          hint="Since each code was created"
          label={t("totalScans")}
          value={formatNumber(overview.allTimeScans)}
        />
        <Metric
          hint={`Last ${scanRangeLabel(range).replace(/^1 /, "")} (UTC)`}
          label={t("scansInRange")}
          value={formatNumber(overview.total)}
        />
        <Metric
          hint="Each visitor counts once per day"
          label={t("uniqueVisitors")}
          value={formatNumber(overview.unique)}
        />
      </div>

      {/* NFC (feat/nfc) */}
      <ScanSourceCard
        description={t("allCodesLastValue", {
          value: scanRangeLabel(range).replace(/^1 /, ""),
        })}
        sources={overview.sources}
      />

      <Card className="gap-4 py-4">
        <CardHeader className="px-4">
          <CardTitle>{t("scansOverTime")}</CardTitle>
          <CardDescription>
            {t("allCodesPerDayLast", {
              value: scanRangeLabel(range).replace(/^1 /, ""),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          <ScansChart data={overview.series} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">{t("topCodes")}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            {overview.topCodes.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                {t("noScansInThisPeriod")}
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
                      href={href(`/codes/${encodeURIComponent(code.id)}`)}
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
          title={t("topCountries")}
          total={overview.total}
        />
        <BreakdownCard
          items={toItems(
            overview.devices,
            (value) => DEVICE_LABELS[value] ?? value,
          )}
          title={t("devices")}
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
          <CardTitle>{t("compareCodes")}</CardTitle>
          <CardDescription>
            {t("dailyScansOfUpTo", { MAX_COMPARE })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-2 sm:px-4">
          <ComparePicker
            defaults={{
              options: options.options.map(toCompareOption),
              more: options.more,
            }}
            params={withoutCompare}
            path={PATH}
            selected={compareIds.map((id) => ({
              id,
              label: optionLabels.get(id) ?? id,
            }))}
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
                        href={href(`/codes/${encodeURIComponent(id)}`)}
                      >
                        {optionLabels.get(id) ?? id}
                      </Link>
                      <p className="text-muted-foreground tabular-nums">
                        {t("valueScansValue2Unique", {
                          value: formatNumber(totals?.scans ?? 0),
                          value2: formatNumber(totals?.unique ?? 0),
                        })}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground px-2 text-sm sm:px-0">
              {t("pickCodesAboveToCompare")}
            </p>
          )}
        </CardContent>
      </Card>

      {conversions && conversions.count > 0 && (
        <ConversionsSummary conversions={conversions} />
      )}
      <p className="text-muted-foreground text-xs">
        {t("botsAndLinkPreviewsAre")}
      </p>
    </div>
  );
}
