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
import { SHORT_LINK_BASE } from "@/lib/short-links";
import { Pager } from "../_components/pager";
import { EmptyRow } from "../_components/stat-card";
import { formatDate, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import {
  type AdminCodeStatus,
  listDynamicCodes,
  parsePage,
} from "../_lib/queries";
import { CodeStatusButton } from "./code-status-button";

export const metadata: Metadata = { title: "Admin · QR Codes" };

const STATUSES: { value: AdminCodeStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "disabled", label: "Disabled" },
];

const isStatus = (value: unknown): value is AdminCodeStatus =>
  STATUSES.some((item) => item.value === value);

export default async function AdminCodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : undefined;
  const status: AdminCodeStatus = isStatus(params.status)
    ? params.status
    : "all";
  const page = parsePage(params.page);
  const { codes, total } = await listDynamicCodes({ q, status, page });

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="QR Codes"
        description="Dynamic codes and their short links. Disabling a code stops its redirect (for phishing or abuse); the owner cannot re-enable it. Every change is written to the audit log."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((item) => (
            <Button
              asChild
              key={item.value}
              size="sm"
              variant={item.value === status ? "secondary" : "ghost"}
            >
              <Link
                href={`/admin/codes?${new URLSearchParams({
                  status: item.value,
                  ...(q && { q }),
                })}`}
              >
                {item.label}
              </Link>
            </Button>
          ))}
        </div>
        <form action="/admin/codes" className="flex gap-2" method="get">
          <input name="status" type="hidden" value={status} />
          <Input
            aria-label="Search codes"
            className="max-w-sm"
            defaultValue={q}
            name="q"
            placeholder="Slug, destination, title or owner email"
            type="search"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </div>

      {codes.length === 0 ? (
        <EmptyRow>No QR codes found</EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Short link</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Scans</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">
                  /q/{row.slug}
                  {row.title && (
                    <span className="text-muted-foreground block max-w-[180px] truncate font-sans">
                      {row.title}
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-[280px]">
                  {/* Plain text on purpose: the destination may be malicious. */}
                  <span
                    className="block truncate text-xs"
                    title={row.destinationUrl}
                  >
                    {row.destinationUrl}
                  </span>
                </TableCell>
                <TableCell>
                  <Link
                    className="hover:underline"
                    href={`/admin/users/${encodeURIComponent(row.ownerId)}`}
                  >
                    {row.ownerEmail}
                  </Link>
                  {row.organizationId && (
                    <span className="text-muted-foreground block text-xs">
                      Team code
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.scanCount)}
                </TableCell>
                <TableCell>{formatDate(row.createdAt)}</TableCell>
                <TableCell>
                  {!row.isActive ? (
                    <Badge variant="destructive">Disabled</Badge>
                  ) : row.archivedAt ? (
                    <Badge variant="outline">Archived</Badge>
                  ) : (
                    <Badge variant="secondary">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <CodeStatusButton
                    codeId={row.id}
                    isActive={row.isActive}
                    slug={row.slug}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pager
        basePath="/admin/codes"
        page={page}
        params={{ q, status: status === "all" ? undefined : status }}
        total={total}
      />
      <p className="text-muted-foreground text-xs">
        Short links resolve at {SHORT_LINK_BASE}/q/&lt;slug&gt;.
      </p>
    </div>
  );
}
