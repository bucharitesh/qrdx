import type { ReactNode } from "react";
import {
  Empty,
  Facts,
  LoadFailed,
  Row,
  Rows,
  SubHeading,
} from "../_components/panel";
import { formatAgo, formatDate, formatNumber } from "../_lib/format";
import {
  type AcquisitionField,
  type Cohort,
  GROWTH_SQL_FILE,
  getActivation,
  getCodesAndScans,
  getDeveloperAccounts,
  getDeveloperUsage,
  getSignups,
  type TopValue,
} from "../_lib/growth";
import { getNpmDownloads, RECENT_DAYS } from "../_lib/npm-downloads";
import { safeLoad } from "../_lib/safe";
import {
  GSC_PROPERTY,
  getSearchConsole,
  type SearchTop,
  TOP_DAYS,
} from "../_lib/search-console";
import { type WeekPivot, windowClosed } from "../_lib/weeks";
import { type WeekColumn, WeekTable } from "./week-table";

// The sections of /admin/growth, one per panel. Each loads its own data, so
// it streams in and fails on its own (see Panel); a failed load is logged
// and shown as a notice (safeLoad).

type Weeks = readonly string[];

function NotSetUp({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground py-2 text-sm">
      {children} Not set up yet: it starts once{" "}
      <code className="text-xs">{GROWTH_SQL_FILE}</code> is applied.
    </p>
  );
}

/** A count and, muted, its share of `of`. */
function Share({
  count,
  of,
  open = false,
}: {
  count: number;
  of: number;
  /** The window can still grow: shown muted */
  open?: boolean;
}) {
  return (
    <span
      className={open ? "text-muted-foreground" : undefined}
      title={open ? "Window still open" : undefined}
    >
      {formatNumber(count)}
      {of > 0 && (
        <span className="text-muted-foreground">
          {" "}
          · {Math.round((count / of) * 100)}%
        </span>
      )}
    </span>
  );
}

/** One column per key of a pivot, then the total. */
function pivotColumns(pivot: WeekPivot, totalLabel = "Total"): WeekColumn[] {
  return [
    ...pivot.keys.map((key) => ({
      id: `key:${key}`,
      label: key,
      cells: pivot.rows.map((row) => formatNumber(row.values[key] ?? 0)),
      total: formatNumber(pivot.totals[key] ?? 0),
    })),
    {
      id: "total",
      label: totalLabel,
      cells: pivot.rows.map((row) => formatNumber(row.total)),
      total: formatNumber(pivot.total),
    },
  ];
}

function TopList({
  title,
  rows,
}: {
  title: string;
  rows: readonly { key: string; meta: string }[];
}) {
  return (
    <div className="min-w-0">
      <SubHeading>{title}</SubHeading>
      {rows.length === 0 ? (
        <Empty>None yet.</Empty>
      ) : (
        <Rows>
          {rows.map((row) => (
            <Row
              key={row.key}
              meta={row.meta}
              title={<span className="break-all">{row.key}</span>}
            />
          ))}
        </Rows>
      )}
    </div>
  );
}

// ─── Sign-ups ────────────────────────────────────────────────────────────────

const TOP_TITLES: Record<AcquisitionField, string> = {
  referrer_host: "Referring sites",
  utm_source: "utm_source",
  landing_path: "Landing pages",
};

const topRows = (rows: readonly TopValue[]) =>
  rows.map((row) => ({
    key: row.value,
    meta: `${formatNumber(row.count)} sign-up${row.count === 1 ? "" : "s"}`,
  }));

export async function Signups({ weeks }: { weeks: Weeks }) {
  const loaded = await safeLoad("growth.signups", () => getSignups(weeks));
  if (!loaded.ok) return <LoadFailed />;
  const { tracking, weekly, top } = loaded.data;
  return (
    <div className="space-y-2">
      {!tracking && <NotSetUp>Channels aren&apos;t recorded.</NotSetUp>}
      <WeekTable
        columns={
          tracking
            ? pivotColumns(weekly)
            : [
                {
                  id: "signups",
                  label: "Sign-ups",
                  cells: weekly.rows.map((row) => formatNumber(row.total)),
                  total: formatNumber(weekly.total),
                },
              ]
        }
        weeks={weeks}
      />
      {top && (
        <div className="grid gap-x-6 sm:grid-cols-3">
          {(Object.keys(TOP_TITLES) as AcquisitionField[]).map((field) => (
            <TopList
              key={field}
              rows={topRows(top[field])}
              title={`${TOP_TITLES[field]}, 28 days`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Activation ──────────────────────────────────────────────────────────────

type Step = Exclude<keyof Cohort, "week" | "signedUp">;

const STEPS: { step: Step; label: string; windowDays?: number }[] = [
  { step: "madeCode", label: "Code within 7 days", windowDays: 7 },
  { step: "realScan", label: "Real scan*" },
  { step: "returned", label: "Back in week 2*", windowDays: 14 },
  { step: "paid", label: "Paid now" },
];

export async function Activation({ weeks, now }: { weeks: Weeks; now: Date }) {
  const loaded = await safeLoad("growth.activation", () =>
    getActivation(weeks),
  );
  if (!loaded.ok) return <LoadFailed />;
  const cohorts = loaded.data;
  const signedUp = cohorts.reduce((sum, row) => sum + row.signedUp, 0);
  return (
    <WeekTable
      columns={[
        {
          id: "signedUp",
          label: "Signed up",
          cells: cohorts.map((row) => formatNumber(row.signedUp)),
          total: formatNumber(signedUp),
        },
        ...STEPS.map(({ step, label, windowDays }) => ({
          id: step,
          label,
          cells: cohorts.map((row) => (
            <Share
              count={row[step]}
              key={row.week}
              of={row.signedUp}
              open={
                windowDays !== undefined &&
                !windowClosed(row.week, windowDays, now)
              }
            />
          )),
          total: (
            <Share
              count={cohorts.reduce((sum, row) => sum + row[step], 0)}
              of={signedUp}
            />
          ),
        })),
      ]}
      firstLabel="Signed up week of"
      weeks={weeks}
    />
  );
}

// ─── Codes and scans ─────────────────────────────────────────────────────────

export async function CodesAndScans({ weeks }: { weeks: Weeks }) {
  const loaded = await safeLoad("growth.codes", () => getCodesAndScans(weeks));
  if (!loaded.ok) return <LoadFailed />;
  const { tracking, codes, scans, totals } = loaded.data;
  const sum = (pick: (row: (typeof scans)[number]) => number) =>
    scans.reduce((total, row) => total + pick(row), 0);
  return (
    <div className="space-y-2">
      <Facts
        items={[
          {
            label: "Dynamic codes, all time",
            value: formatNumber(totals.codes),
          },
          {
            label: "Of them with a real scan",
            value: formatNumber(totals.reallyScanned),
          },
          {
            label: `Scans, ${weeks.length} weeks`,
            value: `${formatNumber(sum((row) => row.scans))} (${formatNumber(sum((row) => row.realScans))} real)`,
          },
        ]}
      />
      <SubHeading>New codes by where they were made</SubHeading>
      {!tracking && (
        <NotSetUp>Where a code was made isn&apos;t recorded.</NotSetUp>
      )}
      <WeekTable
        columns={
          tracking
            ? pivotColumns(codes)
            : [
                {
                  id: "codes",
                  label: "New codes",
                  cells: codes.rows.map((row) => formatNumber(row.total)),
                  total: formatNumber(codes.total),
                },
              ]
        }
        weeks={weeks}
      />
      <SubHeading>Scans</SubHeading>
      <WeekTable
        columns={[
          {
            id: "scans",
            label: "Scans",
            cells: scans.map((row) => formatNumber(row.scans)),
            total: formatNumber(sum((row) => row.scans)),
          },
          {
            id: "real",
            label: "Real scans*",
            cells: scans.map((row) => formatNumber(row.realScans)),
            total: formatNumber(sum((row) => row.realScans)),
          },
          {
            id: "codes",
            label: "Codes with a real scan",
            cells: scans.map((row) => formatNumber(row.codes)),
          },
        ]}
        weeks={weeks}
      />
    </div>
  );
}

// ─── Developers ──────────────────────────────────────────────────────────────

export async function DeveloperAccounts() {
  const loaded = await safeLoad("growth.developers", getDeveloperAccounts);
  if (!loaded.ok) return <LoadFailed />;
  const { apiKeys, oauth, slack } = loaded.data;
  return (
    <Facts
      items={[
        {
          label: "API keys used, 7 days",
          value: `${formatNumber(apiKeys.used7d)} (${formatNumber(apiKeys.users7d)} accounts)`,
        },
        { label: "Live API keys", value: formatNumber(apiKeys.live) },
        {
          label: "Live OAuth tokens (MCP, apps)",
          value: `${formatNumber(oauth.live)} (${formatNumber(oauth.users)} accounts, ${formatNumber(oauth.apps)} apps)`,
        },
        {
          label: "Slack workspaces",
          value: slack
            ? `${formatNumber(slack.installs)} (${formatNumber(slack.recent)} in 28 days)`
            : "Not set up",
        },
      ]}
    />
  );
}

export async function DeveloperUsage({ weeks }: { weeks: Weeks }) {
  const loaded = await safeLoad("growth.usage", () => getDeveloperUsage(weeks));
  if (!loaded.ok) return <LoadFailed />;
  if (!loaded.data.ready) {
    return <NotSetUp>API, MCP and bot calls aren&apos;t counted.</NotSetUp>;
  }
  const { weekly, top } = loaded.data.data;
  if (weekly.total === 0 && top.length === 0) {
    return <Empty>Nothing counted in these weeks.</Empty>;
  }
  return (
    <div className="space-y-2">
      <WeekTable columns={pivotColumns(weekly)} weeks={weeks} />
      <TopList
        rows={top.map((row) => ({
          key: `${row.channel} · ${row.metric} · ${row.key}`,
          meta: formatNumber(row.count),
        }))}
        title="Busiest tools, routes and commands, 28 days"
      />
    </div>
  );
}

export async function NpmDownloads({
  weeks,
  now,
}: {
  weeks: Weeks;
  now: Date;
}) {
  const packages = await getNpmDownloads(weeks, now);
  const ok = packages.flatMap((pkg) => (pkg.status === "ok" ? [pkg] : []));
  return (
    <div className="space-y-2">
      <Rows>
        {packages.map((pkg) => (
          <Row
            key={pkg.name}
            meta={
              pkg.status === "ok"
                ? `${formatNumber(pkg.recent.downloads)} with publish days${
                    pkg.recent.publishDays.length > 0
                      ? ` (published ${pkg.recent.publishDays.map(formatDate).join(", ")})`
                      : ""
                  }`
                : pkg.status === "missing"
                  ? "Not on npm"
                  : `Couldn't read npm: ${pkg.message}`
            }
            title={
              <>
                <span className="font-mono">{pkg.name}</span>
                {pkg.status === "ok" && (
                  <span className="text-muted-foreground tabular-nums">
                    {formatNumber(pkg.recent.withoutPublishDays)} in{" "}
                    {RECENT_DAYS} days without publish days
                  </span>
                )}
              </>
            }
          />
        ))}
      </Rows>
      {ok.length > 0 && (
        <WeekTable
          columns={ok.map((pkg) => ({
            id: pkg.name,
            label: pkg.name,
            cells: pkg.weekly.map((week) => (
              <span key={week.week}>
                {formatNumber(week.withoutPublishDays)}
                {week.publishDays.length > 0 && (
                  <span
                    className="text-muted-foreground"
                    title="With the publish days"
                  >
                    {" "}
                    ({formatNumber(week.downloads)})
                  </span>
                )}
              </span>
            )),
          }))}
          weeks={weeks}
        />
      )}
    </div>
  );
}

// ─── Search Console ──────────────────────────────────────────────────────────

const searchRows = (rows: readonly SearchTop[], strip = false) =>
  rows.map((row) => ({
    key: strip ? row.key.replace(/^https?:\/\//, "") : row.key,
    meta: `${formatNumber(row.clicks)} clicks · ${formatNumber(row.impressions)} impressions`,
  }));

export async function SearchConsole({
  weeks,
  now,
}: {
  weeks: Weeks;
  now: Date;
}) {
  const result = await getSearchConsole(weeks, now);
  if (result.status === "unconfigured") {
    return (
      <div className="text-muted-foreground space-y-2 py-2 text-sm">
        <p>Not set up. To show Search Console here:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            In Google Cloud, create a JSON key for a service account (IAM →
            Service accounts → Keys).
          </li>
          <li>
            In Search Console, add the service account&apos;s email as a user of{" "}
            <code className="text-xs">{GSC_PROPERTY}</code> (Settings → Users
            and permissions; Restricted is enough).
          </li>
          <li>
            Set <code className="text-xs">GSC_SERVICE_ACCOUNT_JSON</code> to the
            key file&apos;s contents, on one line, in the deployment&apos;s
            environment, and redeploy. It&apos;s only read on the server and
            never shown.
          </li>
        </ol>
      </div>
    );
  }
  if (result.status === "invalid") {
    return (
      <Empty>
        GSC_SERVICE_ACCOUNT_JSON is set, but it isn&apos;t a service
        account&apos;s JSON key (it needs client_email and an RSA private_key).
      </Empty>
    );
  }
  if (result.status === "error") {
    return (
      <Empty>
        Search Console didn&apos;t answer: {result.message}. It&apos;s asked
        again in 5 minutes.
      </Empty>
    );
  }
  const clicks = result.weekly.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = result.weekly.reduce(
    (sum, row) => sum + row.impressions,
    0,
  );
  return (
    <div className="space-y-2">
      <Facts
        items={[
          {
            label: `Clicks, ${weeks.length} weeks`,
            value: formatNumber(clicks),
          },
          { label: "Impressions", value: formatNumber(impressions) },
          {
            label: "Data through",
            value: result.lastDay ? formatDate(result.lastDay) : "No data",
          },
        ]}
      />
      <p className="text-muted-foreground text-xs">
        Search Console runs 2 to 3 days behind, so the newest weeks are short.
        Read {formatAgo(result.fetchedAt, now)}; read again every 6 hours.
      </p>
      <WeekTable
        columns={[
          {
            id: "clicks",
            label: "Clicks",
            cells: result.weekly.map((row) => formatNumber(row.clicks)),
            total: formatNumber(clicks),
          },
          {
            id: "impressions",
            label: "Impressions",
            cells: result.weekly.map((row) => formatNumber(row.impressions)),
            total: formatNumber(impressions),
          },
          {
            id: "days",
            label: "Days with data",
            cells: result.weekly.map((row) => formatNumber(row.days)),
          },
        ]}
        weeks={weeks}
      />
      <div className="grid gap-x-6 sm:grid-cols-2">
        <TopList
          rows={searchRows(result.top.pages, true)}
          title={`Top pages, ${formatDate(result.top.from)} to ${formatDate(result.top.to)}`}
        />
        <TopList
          rows={searchRows(result.top.queries)}
          title={`Top queries, same ${TOP_DAYS} days`}
        />
      </div>
    </div>
  );
}
