import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
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
import { Pager } from "../_components/pager";
import { EmptyRow, Section } from "../_components/stat-card";
import { formatDate, formatDateTime, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import {
  getIntegrationCounts,
  listIntegrations,
  parsePage,
} from "../_lib/queries";

export const metadata: Metadata = { title: "Admin · Integrations" };

const hrefWith = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/admin/integrations?${query}` : "/admin/integrations";
};

export default async function AdminIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const counts = await getIntegrationCounts();
  // Only filter by values that exist, so arbitrary input never reaches the query.
  const provider =
    typeof params.provider === "string" &&
    counts.some((row) => row.provider === params.provider)
      ? params.provider
      : undefined;
  const status =
    typeof params.status === "string" &&
    counts.some((row) => row.status === params.status)
      ? params.status
      : undefined;
  const page = parsePage(params.page);
  const { integrations, total } = await listIntegrations({
    provider,
    status,
    page,
  });
  const statuses = [...new Set(counts.map((row) => row.status))];

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Integrations"
        description="Connected third-party accounts. Tokens are never shown. Open a user to disconnect a broken one."
      />

      <Section title="By provider and status">
        {counts.length === 0 ? (
          <EmptyRow>No integrations</EmptyRow>
        ) : (
          <div className="flex flex-wrap gap-2">
            {counts.map((row) => (
              <Badge
                asChild
                key={`${row.provider}:${row.status}`}
                variant={row.status === "error" ? "destructive" : "outline"}
              >
                <Link
                  href={hrefWith({
                    provider: row.provider,
                    status: row.status,
                  })}
                >
                  {row.provider} · {row.status}: {formatNumber(row.total)}
                </Link>
              </Badge>
            ))}
          </div>
        )}
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={status ? "ghost" : "secondary"}>
          <Link href={hrefWith({ provider })}>All statuses</Link>
        </Button>
        {statuses.map((value) => (
          <Button
            asChild
            key={value}
            size="sm"
            variant={value === status ? "secondary" : "ghost"}
          >
            <Link href={hrefWith({ provider, status: value })}>{value}</Link>
          </Button>
        ))}
        {provider && (
          <Button asChild size="sm" variant="ghost">
            <Link href={hrefWith({ status })}>Clear {provider}</Link>
          </Button>
        )}
      </div>

      {integrations.length === 0 ? (
        <EmptyRow>No integrations</EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Connected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrations.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    className="hover:underline"
                    href={`/admin/users/${encodeURIComponent(row.userId)}#integrations`}
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

      <Pager
        basePath="/admin/integrations"
        page={page}
        params={{ provider, status }}
        total={total}
      />
    </div>
  );
}
