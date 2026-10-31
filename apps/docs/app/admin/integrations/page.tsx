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
import { EmptyRow, Section } from "../_components/stat-card";
import { formatDate, formatDateTime, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import { getIntegrationCounts, listRecentIntegrations } from "../_lib/queries";

export const metadata: Metadata = { title: "Admin · Integrations" };

export default async function AdminIntegrationsPage() {
  await requireAdmin();
  const [counts, recent] = await Promise.all([
    getIntegrationCounts(),
    listRecentIntegrations(),
  ]);

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Integrations"
        description="Connected third-party accounts. Tokens are never shown."
      />

      <Section title="By provider and status">
        {counts.length === 0 ? (
          <EmptyRow>No integrations</EmptyRow>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {counts.map((row) => (
                <TableRow key={`${row.provider}:${row.status}`}>
                  <TableCell>{row.provider}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Recent connections" description="Latest 50">
        {recent.length === 0 ? (
          <EmptyRow>No integrations</EmptyRow>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sync</TableHead>
                <TableHead>Connected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      className="hover:underline"
                      href={`/admin/users/${encodeURIComponent(row.userId)}`}
                    >
                      {row.email}
                    </Link>
                  </TableCell>
                  <TableCell>{row.provider}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{formatDateTime(row.lastSyncAt)}</TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
