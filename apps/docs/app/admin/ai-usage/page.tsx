import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import type { Metadata } from "next";
import Link from "next/link";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { DailyChart } from "../_components/daily-chart";
import { EmptyRow, Section } from "../_components/stat-card";
import { formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import { getAiUsageStats } from "../_lib/queries";

export const metadata: Metadata = { title: "Admin · AI Usage" };

export default async function AdminAiUsagePage() {
  await requireAdmin();
  const { series, topUsers, byModel } = await getAiUsageStats();
  const total = series.reduce((sum, point) => sum + point.count, 0);

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="AI Usage"
        description={`${formatNumber(total)} generations in the last 30 days (UTC).`}
      />

      <Section title="Generations per day">
        <DailyChart data={series} label="Generations" />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Top users" description="Last 30 days">
          {topUsers.length === 0 ? (
            <EmptyRow>No usage</EmptyRow>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Generations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topUsers.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>
                      <Link
                        className="hover:underline"
                        href={`/admin/users/${encodeURIComponent(row.userId)}`}
                      >
                        {row.email}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>

        <Section title="By model" description="Last 30 days">
          {byModel.length === 0 ? (
            <EmptyRow>No usage</EmptyRow>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Prompt tokens</TableHead>
                  <TableHead className="text-right">
                    Completion tokens
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byModel.map((row) => (
                  <TableRow key={row.modelId}>
                    <TableCell>{row.modelId}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.promptTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.completionTokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>
    </div>
  );
}
