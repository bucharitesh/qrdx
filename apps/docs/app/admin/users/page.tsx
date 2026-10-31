import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
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
import { EmptyRow } from "../_components/stat-card";
import { formatDate, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import { listUsers, parsePage } from "../_lib/queries";

export const metadata: Metadata = { title: "Admin · Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : undefined;
  const page = parsePage(params.page);
  const { users, total } = await listUsers({ q, page });

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Users"
        description="Search by email, name or id."
      />

      <form action="/admin/users" className="flex gap-2" method="get">
        <Input
          aria-label="Search users"
          className="max-w-sm"
          defaultValue={q}
          name="q"
          placeholder="Search email or name"
          type="search"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {users.length === 0 ? (
        <EmptyRow>No users found</EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">AI uses</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    className="font-medium hover:underline"
                    href={`/admin/users/${encodeURIComponent(row.id)}`}
                  >
                    {row.email}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[180px] truncate">
                  {row.name}
                </TableCell>
                <TableCell>{formatDate(row.createdAt)}</TableCell>
                <TableCell>
                  {row.subscriptionStatus === "active" ? (
                    <Badge>Pro</Badge>
                  ) : row.subscriptionStatus ? (
                    <Badge variant="outline">{row.subscriptionStatus}</Badge>
                  ) : (
                    <span className="text-muted-foreground">Free</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.aiUsageCount)}
                </TableCell>
                <TableCell>{row.role ?? "user"}</TableCell>
                <TableCell>
                  {row.banned ? (
                    <Badge variant="destructive">Banned</Badge>
                  ) : (
                    <span className="text-muted-foreground">Active</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pager basePath="/admin/users" page={page} params={{ q }} total={total} />
    </div>
  );
}
