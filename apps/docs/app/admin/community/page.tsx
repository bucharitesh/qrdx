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
import { RemoveItemButton } from "@/components/community/remove-item-button";
import { itemsForReview } from "@/lib/community/queries";
import {
  COMMUNITY_TYPES,
  type CommunityItemType,
  itemPath,
  TYPE_LABELS,
  TYPE_SEGMENTS,
  typeFromSegment,
} from "@/lib/community/types";
import { Pager } from "../_components/pager";
import { EmptyRow } from "../_components/stat-card";
import { formatDate, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import { PAGE_SIZE, parsePage } from "../_lib/queries";

export const metadata: Metadata = { title: "Admin · Community" };

// Post-moderation (owner decision): members' items go live once the
// automatic checks pass, and are reviewed here, newest first. Page
// templates were scrubbed of personal data on publish; read them for what
// the scrub can't judge (names, wording, photos from the library).

export default async function AdminCommunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const type =
    typeof params.type === "string"
      ? (typeFromSegment(params.type) ?? undefined)
      : undefined;
  const page = parsePage(params.page);
  const { rows, total } = await itemsForReview({
    type,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const views: { type: CommunityItemType | null; label: string }[] = [
    { type: null, label: "All" },
    ...COMMUNITY_TYPES.map((value) => ({
      type: value,
      label: TYPE_LABELS[value].many,
    })),
  ];

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Community"
        description="Members' items, newest first. They go live once the automatic checks pass; remove anything that breaks the rules. Copies people made stay theirs (CC0)."
      />

      <div className="flex flex-wrap gap-2">
        {views.map((view) => (
          <Button
            asChild
            key={view.label}
            size="sm"
            variant={view.type === (type ?? null) ? "secondary" : "ghost"}
          >
            <Link
              href={
                view.type
                  ? `/admin/community?type=${TYPE_SEGMENTS[view.type]}`
                  : "/admin/community"
              }
            >
              {view.label}
            </Link>
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyRow>Nothing to review</EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Creator</TableHead>
              <TableHead className="text-right">Uses</TableHead>
              <TableHead>Published</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[240px]">
                  <Link
                    className="block truncate font-medium hover:underline"
                    href={itemPath(row.type, row.slug)}
                  >
                    {row.name}
                  </Link>
                  {row.description && (
                    <p className="text-muted-foreground truncate text-xs">
                      {row.description}
                    </p>
                  )}
                </TableCell>
                <TableCell>{TYPE_LABELS[row.type].one}</TableCell>
                <TableCell>
                  {row.createdBy ? (
                    <Link
                      className="hover:underline"
                      href={`/admin/users/${encodeURIComponent(row.createdBy)}`}
                    >
                      {row.handle ? `@${row.handle}` : row.displayName}
                    </Link>
                  ) : row.handle ? (
                    `@${row.handle}`
                  ) : (
                    row.displayName
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.useCount)}
                </TableCell>
                <TableCell>{formatDate(row.publishedAt)}</TableCell>
                <TableCell className="text-right">
                  <RemoveItemButton
                    afterRemove="refresh"
                    itemId={row.id}
                    name={row.name}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pager
        basePath="/admin/community"
        page={page}
        params={type ? { type: TYPE_SEGMENTS[type] } : {}}
        total={total}
      />
    </div>
  );
}
