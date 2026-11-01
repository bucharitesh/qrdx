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
import { formatDateTime } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import { listAuditLog, parsePage } from "../_lib/queries";

export const metadata: Metadata = { title: "Admin · Audit Log" };

const userHref = (id: string) => `/admin/users/${encodeURIComponent(id)}`;

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q =
    typeof params.q === "string" ? params.q.trim().slice(0, 200) : undefined;
  const page = parsePage(params.page);
  const { entries, total } = await listAuditLog({ page, q: q || undefined });

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Audit Log"
        description="Every action taken from this panel, with who did it and why."
      />

      <form action="/admin/audit-log" className="flex gap-2" method="get">
        <Input
          aria-label="Filter the audit log"
          className="max-w-sm"
          defaultValue={q}
          name="q"
          placeholder="Action (user.ban, qr_code.) or a user / target id"
          type="search"
        />
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {entries.length === 0 ? (
        <EmptyRow>
          {q ? "No matching entries" : "No admin actions yet"}
        </EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((row) => {
              const { actorEmail, reason, subjectUserId, ...details } =
                row.metadata ?? {};
              const subject =
                typeof subjectUserId === "string" ? subjectUserId : null;
              return (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Link
                      className="hover:underline"
                      href={userHref(row.actorUserId)}
                    >
                      {row.actorEmail ?? String(actorEmail ?? row.actorUserId)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{row.action}</TableCell>
                  <TableCell>
                    {row.targetType === "user" && row.targetId ? (
                      <Link
                        className="hover:underline"
                        href={userHref(row.targetId)}
                      >
                        user:{row.targetId}
                      </Link>
                    ) : (
                      <>
                        {`${row.targetType}:${row.targetId ?? "—"}`}
                        {subject && (
                          <Link
                            className="text-muted-foreground block text-xs hover:underline"
                            href={userHref(subject)}
                          >
                            owner
                          </Link>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[240px] text-sm">
                    {typeof reason === "string" && reason ? (
                      reason
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground max-w-[320px] truncate font-mono text-xs"
                    title={JSON.stringify(details)}
                  >
                    {JSON.stringify(details)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Pager
        basePath="/admin/audit-log"
        page={page}
        params={{ q }}
        total={total}
      />
    </div>
  );
}
