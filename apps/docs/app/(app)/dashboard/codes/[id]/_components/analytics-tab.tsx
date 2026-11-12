import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Import as Download, Lock } from "iconsax-reactjs";
import {
  BreakdownCard,
  type BreakdownItem,
} from "@/app/(app)/dashboard/codes/_components/breakdown-card";
import {
  formatDate,
  formatNumber,
} from "@/app/(app)/dashboard/codes/_components/format";
// NFC (feat/nfc): QR scans and NFC taps.
import { ScanSourceCard } from "@/app/(app)/dashboard/codes/_components/scan-source-card";
import { ScansChart } from "@/app/(app)/dashboard/codes/_components/scans-chart";
import { codeTabHref } from "@/app/(app)/dashboard/codes/_lib/code-tabs";
import { nfcPageHref } from "@/app/(app)/dashboard/codes/_lib/nfc";
import type { QrCodeView } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { AnalyticsExtra } from "@/app/(app)/dashboard/codes/[id]/_components/analytics-extra";
import { PreciseLocationsCard } from "@/app/(app)/dashboard/codes/[id]/_components/precise-locations-card";
import { SheetsExport } from "@/components/data-connections/sheets-export";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import type { Translator } from "@/lib/i18n/translator";
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
import { requestWorkspaceSlug } from "@/lib/scope";
import { workspaceLink } from "@/lib/workspace-paths";

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
function retentionText(
  days: number,
  t: Translator<"app.dashboard.codes.analyticsTab">,
): string {
  if (!Number.isFinite(days)) return t("everyScan");
  if (days >= 365) {
    const years = Math.round(days / 365);
    return t("yearsOfScanHistory", { years });
  }
  return t("daysDaysOfScanHistory", { days });
}

/** The cheapest plan that keeps at least `days` of scans. */
const planKeeping = (days: number) =>
  PLANS.find((plan) => PLAN_LIMITS[plan].analyticsRetentionDays >= days);

/** "Pro keeps 3 years of scan history and Business keeps every scan." */
function upgradeRetentionText(
  retentionDays: number,
  t: Translator<"app.dashboard.codes.analyticsTab">,
): string {
  const longer = PLANS.filter(
    (plan) => PLAN_LIMITS[plan].analyticsRetentionDays > retentionDays,
  ).map((plan) =>
    t("valueKeepsValue2", {
      value: PLAN_NAMES[plan],
      value2: retentionText(PLAN_LIMITS[plan].analyticsRetentionDays, t),
    }),
  );
  return longer.length > 1
    ? t("valueAndValue2", {
        value: longer.slice(0, -1).join(", "),
        value2: longer.at(-1) ?? "",
      })
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
  const t = await getAppTranslations("app.dashboard.codes.analyticsTab");
  const { range, days } = resolveScanRange(query.range, retentionDays);
  const [analytics, slug] = await Promise.all([
    getScanAnalytics(code.id, days),
    requestWorkspaceSlug(),
  ]);
  const lockedRanges = SCAN_RANGE_KEYS.some(
    (key) => SCAN_RANGES[key] > retentionDays,
  );
  const exportHref = workspaceLink(
    slug,
    `/codes/${encodeURIComponent(code.id)}/export?range=${range}`,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={t("dateRange")} className="flex flex-wrap gap-1">
          {SCAN_RANGE_KEYS.map((key) => {
            const keeping = planKeeping(SCAN_RANGES[key]);
            return SCAN_RANGES[key] > retentionDays ? (
              <Button
                disabled
                key={key}
                size="sm"
                title={
                  keeping
                    ? t("valueKeepsValue2OfScan", {
                        value: PLAN_NAMES[keeping],
                        value2: scanRangeLabel(key),
                      })
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
                  href={codeTabHref(slug, code.id, "analytics", {
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
              {t("exportCsv")}
            </a>
          </Button>
          <SheetsExport codeId={code.id} />
        </div>
      </div>
      {lockedRanges && (
        <p className="text-muted-foreground -mt-3 text-xs">
          {t.rich("yourPlanKeepsValueValue2", {
            value: retentionText(retentionDays, t),
            value2: upgradeRetentionText(retentionDays, t),
            link: (chunks) => (
              <Link className="underline" href="/pricing">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          hint="Since the code was created"
          label={t("totalScans")}
          value={formatNumber(code.scanCount)}
        />
        <Metric
          hint={`Last ${days} days (UTC)`}
          label={t("scansInRange")}
          value={formatNumber(analytics.total)}
        />
        <Metric
          hint="Each visitor counts once per day"
          label={t("uniqueVisitors")}
          value={formatNumber(analytics.unique)}
        />
        <Metric label={t("lastScan")} value={formatDate(code.lastScannedAt)} />
      </div>

      {/* NFC (feat/nfc) */}
      <ScanSourceCard
        action={
          analytics.sources.nfc === 0 && (
            <Button
              asChild
              className="-my-1 shrink-0"
              size="sm"
              variant="ghost"
            >
              <Link href={nfcPageHref(slug, code.id)}>{t("useWithNfc")}</Link>
            </Button>
          )
        }
        description={t("lastDaysDaysTapsCome", { days })}
        sources={analytics.sources}
      />

      <Card className="gap-4 py-4">
        <CardHeader className="px-4">
          <CardTitle>{t("scansOverTime")}</CardTitle>
          <CardDescription>
            {t("scansPerDayLastDays", { days })}
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
          title={t("topCountries")}
          total={analytics.total}
        />
        <BreakdownCard
          items={analytics.cities.map((row) => {
            const country = countryName(row.country);
            return {
              label: row.city
                ? [row.city, country].filter(Boolean).join(", ")
                : country
                  ? t("unknownCityCountry", { country })
                  : t("unknown"),
              count: row.count,
            };
          })}
          title={t("topCities")}
          total={analytics.total}
        />
        <BreakdownCard
          items={toItems(
            analytics.devices,
            (value) => DEVICE_LABELS[value] ?? value,
          )}
          title={t("devices")}
          total={analytics.total}
        />
        <BreakdownCard
          items={toItems(analytics.os)}
          title={t("operatingSystems")}
          total={analytics.total}
        />
        <BreakdownCard
          items={toItems(analytics.browsers)}
          title={t("browsers")}
          total={analytics.total}
        />
        <BreakdownCard
          items={toItems(
            analytics.referrers,
            undefined,
            "Direct (no referrer)",
          )}
          title={t("referrers")}
          total={analytics.total}
        />
      </div>
      {/* Precise scan locations (lib/scan-location), apart from IP-based ones. */}
      <PreciseLocationsCard
        code={code}
        days={days}
        from={analytics.from}
        slug={slug}
      />
      <AnalyticsExtra codeId={code.id} days={days} query={query} />
      <p className="text-muted-foreground text-xs">
        {t("botsAndLinkPreviewsAre")}
      </p>
    </div>
  );
}
