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
import { EmptyRow, StatCard } from "../_components/stat-card";
import { formatDate, formatMoney, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import {
  getEstimatedMrr,
  getSubscriptionStatusCounts,
  listSubscriptions,
  parsePage,
} from "../_lib/queries";

export const metadata: Metadata = { title: "Admin · Subscriptions" };

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = parsePage(params.page);

  const [statusCounts, mrr] = await Promise.all([
    getSubscriptionStatusCounts(),
    getEstimatedMrr(),
  ]);
  // Only filter by statuses that exist, so arbitrary input never reaches the query.
  const status =
    typeof params.status === "string" &&
    statusCounts.some((row) => row.status === params.status)
      ? params.status
      : undefined;
  const { subscriptions, total } = await listSubscriptions({ status, page });

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Subscriptions"
        description="Synced from Polar webhooks into the database; Polar is not queried here."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {mrr.length === 0 ? (
          <StatCard
            label="Estimated MRR"
            value="—"
            hint="No active subscriptions"
          />
        ) : (
          mrr.map((row) => (
            <StatCard
              hint="Active subscriptions, yearly ÷ 12"
              key={row.currency}
              label={`Estimated MRR (${row.currency.toUpperCase()})`}
              value={formatMoney(Math.round(row.cents), row.currency)}
            />
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={status ? "ghost" : "secondary"}>
          <Link href="/admin/subscriptions">All</Link>
        </Button>
        {statusCounts.map((row) => (
          <Button
            asChild
            key={row.status}
            size="sm"
            variant={row.status === status ? "secondary" : "ghost"}
          >
            <Link
              href={`/admin/subscriptions?status=${encodeURIComponent(row.status)}`}
            >
              {row.status} ({formatNumber(row.total)})
            </Link>
          </Button>
        ))}
      </div>

      {subscriptions.length === 0 ? (
        <EmptyRow>No subscriptions</EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Period end</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscriptions.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {row.userId ? (
                    <Link
                      className="hover:underline"
                      href={`/admin/users/${encodeURIComponent(row.userId)}`}
                    >
                      {row.email}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Unlinked</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={row.status === "active" ? "default" : "outline"}
                  >
                    {row.status}
                  </Badge>
                  {row.cancelAtPeriodEnd && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      cancels at period end
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {formatMoney(row.amount, row.currency)} /{" "}
                  {row.recurringInterval}
                </TableCell>
                <TableCell>{formatDate(row.currentPeriodEnd)}</TableCell>
                <TableCell>{formatDate(row.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pager
        basePath="/admin/subscriptions"
        page={page}
        params={{ status }}
        total={total}
      />
    </div>
  );
}
