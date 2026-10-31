import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { DailyChart } from "./_components/daily-chart";
import { EmptyRow, Section, StatCard } from "./_components/stat-card";
import { formatNumber } from "./_lib/format";
import { requireAdmin } from "./_lib/guard";
import { getOverviewStats } from "./_lib/queries";

export const metadata: Metadata = { title: "Admin · Overview" };

export default async function AdminOverviewPage() {
  await requireAdmin();
  const stats = await getOverviewStats();

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
        description="Live counts from the database. Times are UTC."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total users"
          value={formatNumber(stats.users.total)}
          hint={`${formatNumber(stats.users.today)} today`}
        />
        <StatCard
          label="Signups (7d / 30d)"
          value={`${formatNumber(stats.users.last7d)} / ${formatNumber(stats.users.last30d)}`}
        />
        <StatCard
          label="Active users (7d)"
          value={formatNumber(stats.sessions.activeUsers)}
          hint={`${formatNumber(stats.sessions.sessions)} live sessions used in 7d`}
        />
        <StatCard
          label="AI generations (30d)"
          value={formatNumber(stats.ai.last30d)}
          hint={`${formatNumber(stats.ai.today)} today · ${formatNumber(stats.ai.last7d)} in 7d · ${formatNumber(stats.ai.total)} all time`}
        />
        <StatCard label="Saved QR themes" value={formatNumber(stats.presets)} />
        <StatCard
          label="Community themes"
          value={formatNumber(stats.communityThemes)}
        />
        <StatCard
          label="OAuth apps"
          value={formatNumber(stats.oauthApps.total)}
          hint={`${formatNumber(stats.oauthApps.active)} active`}
        />
        <StatCard
          label="Integrations"
          value={formatNumber(
            Array.from(providers.values()).reduce(
              (sum, p) => sum + p.active,
              0,
            ),
          )}
          hint="active connections"
        />
      </div>

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
