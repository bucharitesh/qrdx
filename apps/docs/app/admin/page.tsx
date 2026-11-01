import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { DailyChart } from "./_components/daily-chart";
import { EmptyRow, Section, StatCard } from "./_components/stat-card";
import { formatNumber } from "./_lib/format";
import { requireAdmin } from "./_lib/guard";
import { getDashboardStats, getOverviewStats } from "./_lib/queries";

export const metadata: Metadata = { title: "Admin · Overview" };

export default async function AdminOverviewPage() {
  await requireAdmin();
  const [dashboard, stats] = await Promise.all([
    getDashboardStats(),
    getOverviewStats(),
  ]);
  const { attention } = dashboard;
  const needsAttention =
    attention.openReports +
    attention.failedDeliveries7d +
    attention.overdueDeliveries +
    attention.integrationErrors;

  const providers = new Map<string, { active: number; total: number }>();
  for (const row of stats.integrationsByProvider) {
    const entry = providers.get(row.provider) ?? { active: 0, total: 0 };
    entry.total += row.total;
    if (row.status === "active") entry.active += row.total;
    providers.set(row.provider, entry);
  }

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Overview"
        description="Live counts from the database. Times are UTC. Every number opens the list behind it."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          href="/admin/users"
          label="Users"
          value={formatNumber(dashboard.users.total)}
          hint={`${formatNumber(dashboard.users.last7d)} new this week`}
        />
        <StatCard
          href="/admin/subscriptions?status=active"
          label="Paying users"
          value={formatNumber(dashboard.paidUsers)}
          hint="Active or trialing subscription"
        />
        <StatCard
          href="/admin/codes"
          label="Dynamic codes"
          value={formatNumber(dashboard.codes.total)}
          hint={`${formatNumber(dashboard.codes.live)} live`}
        />
        <StatCard
          href="/admin/codes"
          label="Scans this week"
          value={formatNumber(dashboard.scans.last7d)}
          hint={`${formatNumber(dashboard.scans.today)} today (UTC)`}
        />
        <StatCard
          href="/admin/codes?kind=page"
          label="Hosted pages"
          value={formatNumber(dashboard.pages)}
        />
        <StatCard
          href="/admin/codes?kind=page"
          label="Form responses"
          value={formatNumber(dashboard.responses.total)}
          hint={`${formatNumber(dashboard.responses.last7d)} this week`}
        />
        <StatCard
          href="/admin/ai-usage"
          label="AI generations (30d)"
          value={formatNumber(stats.ai.last30d)}
          hint={`${formatNumber(stats.ai.today)} today · ${formatNumber(stats.ai.total)} all time`}
        />
        <StatCard
          label="Active users (7d)"
          value={formatNumber(stats.sessions.activeUsers)}
          hint={`${formatNumber(stats.sessions.sessions)} live sessions used`}
        />
      </div>

      <Section
        title="Needs attention"
        description={
          needsAttention === 0
            ? "Nothing waiting."
            : "Open each to see what's wrong."
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            alert={attention.openReports > 0}
            href="/admin/abuse"
            label="Open abuse reports"
            value={formatNumber(attention.openReports)}
          />
          <StatCard
            alert={attention.failedDeliveries7d > 0}
            href="/admin/health#webhooks"
            label="Failed webhooks (7d)"
            value={formatNumber(attention.failedDeliveries7d)}
            hint="Gave up after every retry"
          />
          <StatCard
            alert={attention.overdueDeliveries > 0}
            href="/admin/health#webhooks"
            label="Webhooks overdue"
            value={formatNumber(attention.overdueDeliveries)}
            hint="Due over an hour ago: is the cron running?"
          />
          <StatCard
            alert={attention.integrationErrors > 0}
            href="/admin/integrations?status=error"
            label="Broken integrations"
            value={formatNumber(attention.integrationErrors)}
            hint="Need the user to reconnect"
          />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Signups" description="New users per day, last 30 days">
          <DailyChart data={stats.signupSeries} label="Signups" />
        </Section>
        <Section
          title="AI generations"
          description="ai_usage rows per day, last 30 days"
        >
          <DailyChart data={stats.aiSeries} label="Generations" />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Subscriptions by status">
          {stats.subscriptionsByStatus.length === 0 ? (
            <EmptyRow>No subscriptions yet</EmptyRow>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stats.subscriptionsByStatus.map((row) => (
                <Badge key={row.status} variant="outline">
                  {row.status}: {formatNumber(row.total)}
                </Badge>
              ))}
            </div>
          )}
        </Section>
        <Section title="Integrations by provider">
          {providers.size === 0 ? (
            <EmptyRow>No integrations connected</EmptyRow>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Array.from(providers, ([provider, counts]) => (
                <Badge key={provider} variant="outline">
                  {provider}: {formatNumber(counts.active)} active
                  {counts.total !== counts.active &&
                    ` / ${formatNumber(counts.total)}`}
                </Badge>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
