import { database as db, qrCode } from "@repo/database";
import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { eq } from "drizzle-orm";
import { CountBarChart } from "@/app/dashboard/analytics/_components/charts";
import { TimeZoneSwitch } from "@/app/dashboard/analytics/_components/time-zone-switch";
import {
  type ConversionSummary,
  getConversionSummary,
  getPageEventSummary,
  type PageEventSummary,
} from "@/app/dashboard/analytics/_lib/queries";
import { BreakdownCard } from "@/app/dashboard/codes/_components/breakdown-card";
import {
  displayUrl,
  formatNumber,
} from "@/app/dashboard/codes/_components/format";
import {
  parseRoutingConfig,
  type SplitBreakdownPlan,
  splitBreakdownPlans,
} from "@/lib/redirect/routing";
import {
  getLanguageBreakdown,
  getScanTimeBreakdown,
  getSplitVariantCounts,
  type LanguageBreakdown,
  normalizeTimeZone,
  rangeStart,
  type SplitVariantCounts,
  type TimeBreakdown,
} from "@/lib/scans";

const HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

async function settle<T>(
  promise: Promise<T>,
  label: string,
): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.error(`Analytics (${label}) failed:`, error);
    return null;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-bold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

function formatMoney(total: string, currency: string | null): string {
  const amount = Number(total);
  if (!currency)
    return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  try {
    return amount.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function TimeCard({
  time,
  days,
  switcher,
}: {
  time: TimeBreakdown;
  days: number;
  switcher: React.ReactNode;
}) {
  const busiestHour = time.hours.indexOf(Math.max(...time.hours));
  const total = time.hours.reduce((sum, value) => sum + value, 0);
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>When people scan</CardTitle>
            <CardDescription>
              Last {days} days, {time.timeZone}
              {total > 0 && ` · busiest hour ${HOURS[busiestHour]}:00`}
            </CardDescription>
          </div>
          {switcher}
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 px-2 sm:px-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="px-2 text-sm font-medium sm:px-0">Hour of day</p>
          <CountBarChart
            data={time.hours.map((count, hour) => ({
              label: HOURS[hour] as string,
              count,
            }))}
            label={`Scans by hour of day in ${time.timeZone}`}
          />
        </div>
        <div className="space-y-2">
          <p className="px-2 text-sm font-medium sm:px-0">Day of week</p>
          <CountBarChart
            data={time.weekdays.map((count, day) => ({
              label: WEEKDAYS[day] as string,
              count,
            }))}
            label={`Scans by day of week in ${time.timeZone}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SplitCard({
  plan,
  result,
}: {
  plan: SplitBreakdownPlan;
  result: SplitVariantCounts;
}) {
  const { counts, replayed } = result;
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const weights = plan.variants.reduce(
    (sum, variant) => sum + variant.weight,
    0,
  );
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>
            A/B split{plan.ruleName ? `: ${plan.ruleName}` : ""}
          </CardTitle>
          {replayed > 0 && <Badge variant="outline">Estimate</Badge>}
        </div>
        <CardDescription>
          Scans per variant
          {plan.since
            ? ` since ${plan.since.toLocaleDateString("en-US", { timeZone: "UTC" })}`
            : ""}
          {replayed > 0 &&
            `. ${formatNumber(replayed)} older ${replayed === 1 ? "scan was" : "scans were"} recorded before variants were stored and ${replayed === 1 ? "is" : "are"} replayed with the current rules`}
          {replayed > 0 &&
            plan.approximate &&
            " (language and scan-count rules can't be replayed, so these may include scans those rules sent elsewhere)"}
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="space-y-1.5">
          {plan.variants.map((variant) => {
            const value = counts.get(variant.id) ?? 0;
            const share = total > 0 ? (value / total) * 100 : 0;
            return (
              <li
                className="relative flex items-center justify-between gap-3 overflow-hidden rounded-md px-2 py-1.5 text-sm"
                key={variant.id}
              >
                <span
                  aria-hidden="true"
                  className="bg-primary/10 absolute inset-y-0 left-0 rounded-md"
                  style={{ width: `${share}%` }}
                />
                <span className="relative min-w-0 truncate">
                  <span className="font-medium">
                    {variant.name || variant.id.toUpperCase()}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {displayUrl(variant.url)} ·{" "}
                    {Math.round((variant.weight / weights) * 100)}% target
                  </span>
                </span>
                <span className="text-muted-foreground relative shrink-0 tabular-nums">
                  {formatNumber(value)}
                  {total > 0 && ` (${Math.round(share)}%)`}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

function languageName(tag: string): string {
  try {
    return languageNames.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** Top visitor languages (the browser's preferred language at scan time). */
export function LanguagesCard({ languages }: { languages: LanguageBreakdown }) {
  return (
    <BreakdownCard
      items={languages.rows.map((row) => ({
        label: row.value
          ? `${languageName(row.value)} (${row.value})`
          : "Unknown",
        count: row.count,
      }))}
      title="Languages"
      total={languages.total}
    />
  );
}

function PageEventsCard({ events }: { events: PageEventSummary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Page activity</CardTitle>
          <CardDescription>Views and taps on the hosted page</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 px-4">
          <Stat label="Page views" value={formatNumber(events.views)} />
          <Stat label="Unique viewers" value={formatNumber(events.visitors)} />
          <Stat label="Taps" value={formatNumber(events.interactions)} />
        </CardContent>
      </Card>
      <BreakdownCard
        empty="No taps in this period"
        items={events.targets.map((row) => ({
          label: row.value ? displayUrl(row.value) : "Unknown",
          count: row.count,
        }))}
        title="Most tapped"
        total={events.interactions}
      />
    </div>
  );
}

function ConversionsCard({ conversions }: { conversions: ConversionSummary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Conversions</CardTitle>
          <CardDescription>Attributed to scans of this code</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6 px-4">
          <Stat label="Conversions" value={formatNumber(conversions.count)} />
          {conversions.revenue
            .filter((row) => Number(row.total) > 0)
            .map((row) => (
              <Stat
                key={row.currency ?? "none"}
                label={`Revenue${row.currency ? ` (${row.currency})` : ""}`}
                value={formatMoney(row.total, row.currency)}
              />
            ))}
        </CardContent>
      </Card>
      <BreakdownCard
        items={conversions.names.map((row) => ({
          label: row.name,
          count: row.count,
        }))}
        title="Conversion types"
        total={conversions.count}
      />
    </div>
  );
}

/**
 * Extra analytics on the code page: scans by hour and weekday, A/B variant
 * counts, hosted-page activity and conversions. `codeId` must already be
 * scope-checked by the page.
 */
export async function AnalyticsExtra({
  codeId,
  days,
  query,
}: {
  codeId: string;
  days: number;
  query: Query;
}) {
  const timeZone = normalizeTimeZone(first(query.tz));
  const from = rangeStart(days);
  const [code] = await db
    .select({
      kind: qrCode.kind,
      pageId: qrCode.pageId,
      routing: qrCode.routing,
    })
    .from(qrCode)
    .where(eq(qrCode.id, codeId))
    .limit(1);
  if (!code) return null;

  const plans = splitBreakdownPlans(parseRoutingConfig(code.routing)).filter(
    (plan) => !plan.unreachable,
  );
  const [time, languages, splits, events, conversions] = await Promise.all([
    settle(getScanTimeBreakdown(codeId, from, timeZone), "time"),
    settle(getLanguageBreakdown(codeId, from), "languages"),
    Promise.all(
      plans.map(async (plan) => ({
        plan,
        counts: await settle(
          getSplitVariantCounts(codeId, {
            from: plan.since && plan.since > from ? plan.since : from,
            prefix: plan.variantPrefix,
            key: plan.key,
            thresholds: plan.thresholds,
            where: plan.where,
          }),
          "split",
        ),
      })),
    ),
    code.kind === "page" && code.pageId
      ? settle(getPageEventSummary(code.pageId, codeId, from), "page events")
      : Promise.resolve(null),
    settle(getConversionSummary({ qrCodeId: codeId }, from), "conversions"),
  ]);

  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    const text = first(value);
    if (key !== "tz" && typeof text === "string") params[key] = text;
  }

  return (
    <div className="space-y-4">
      {time && (
        <TimeCard
          days={days}
          switcher={
            <TimeZoneSwitch
              current={time.timeZone}
              params={params}
              path={`/dashboard/codes/${encodeURIComponent(codeId)}`}
            />
          }
          time={time}
        />
      )}
      {languages && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <LanguagesCard languages={languages} />
        </div>
      )}
      {splits.map(
        ({ plan, counts }) =>
          counts && <SplitCard key={plan.ruleId} plan={plan} result={counts} />,
      )}
      {events && <PageEventsCard events={events} />}
      {conversions && conversions.count > 0 && (
        <ConversionsCard conversions={conversions} />
      )}
    </div>
  );
}
