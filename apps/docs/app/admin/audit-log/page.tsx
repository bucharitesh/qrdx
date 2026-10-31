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
import { formatDateTime } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import { listAuditLog, parsePage } from "../_lib/queries";

export const metadata: Metadata = { title: "Admin · Audit Log" };

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = parsePage(params.page);
  const { entries, total } = await listAuditLog({ page });

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Audit Log"
        description="Every action taken from this panel."
      />

      {entries.length === 0 ? (
        <EmptyRow>No admin actions yet</EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((row) => {
              const { actorEmail, ...details } = row.metadata ?? {};
              return (
                <TableRow key={row.id}>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell>
                    {row.actorEmail ?? String(actorEmail ?? row.actorUserId)}
                  </TableCell>
                  <TableCell className="font-medium">{row.action}</TableCell>
                  <TableCell>
                    {row.targetType === "user" && row.targetId ? (
                      <Link
                        className="hover:underline"
                        href={`/admin/users/${encodeURIComponent(row.targetId)}`}
                      >
                        user:{row.targetId}
                      </Link>
                    ) : (
                      `${row.targetType}:${row.targetId ?? "—"}`
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[360px] truncate font-mono text-xs">
                    {JSON.stringify(details)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Pager basePath="/admin/audit-log" page={page} total={total} />
    </div>
  );
}
