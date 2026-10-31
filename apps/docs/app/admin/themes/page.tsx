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
import { RemoveThemeButton } from "../_components/remove-theme-button";
import { EmptyRow } from "../_components/stat-card";
import { formatDate, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import { listThemes, parsePage, type ThemeView } from "../_lib/queries";

export const metadata: Metadata = { title: "Admin · Themes" };

const VIEWS: { value: ThemeView; label: string }[] = [
  { value: "community", label: "Community" },
  { value: "saved", label: "All saved" },
];

export default async function AdminThemesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const view: ThemeView = params.view === "saved" ? "saved" : "community";
  const page = parsePage(params.page);
  const { themes, total } = await listThemes({ view, page });

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Themes"
        description="Removing a community theme unpublishes it (likes and tags are deleted); the owner's saved theme is kept."
      />

      <div className="flex gap-2">
        {VIEWS.map((item) => (
          <Button
            asChild
            key={item.value}
            size="sm"
            variant={item.value === view ? "secondary" : "ghost"}
          >
            <Link href={`/admin/themes?view=${item.value}`}>{item.label}</Link>
          </Button>
        ))}
      </div>

      {themes.length === 0 ? (
        <EmptyRow>No themes</EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Likes</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Published</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {themes.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[220px] truncate font-medium">
                  {row.name}
                </TableCell>
                <TableCell>
                  <Link
                    className="hover:underline"
                    href={`/admin/users/${encodeURIComponent(row.ownerId)}`}
                  >
                    {row.ownerEmail}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.communityThemeId
                    ? formatNumber(row.likeCount ?? 0)
                    : "—"}
                </TableCell>
                <TableCell>{formatDate(row.createdAt)}</TableCell>
                <TableCell>{formatDate(row.publishedAt)}</TableCell>
                <TableCell className="text-right">
                  {row.communityThemeId && (
                    <RemoveThemeButton
                      communityThemeId={row.communityThemeId}
                      name={row.name}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pager
        basePath="/admin/themes"
        page={page}
        params={{ view }}
        total={total}
      />
    </div>
  );
}
