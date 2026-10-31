"use client";

import { Star } from "@repo/design-system/components/icons";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import { Folder2 as Folder, Notepad2 as NotebookPen } from "iconsax-reactjs";
import Link from "next/link";
import { setQrCodesFavorite } from "@/actions/bulk-codes";
import type { TagRow } from "@/app/dashboard/codes/_lib/organize";
import type { FolderRow } from "@/app/dashboard/codes/_lib/organize-shared";
import type { QrCodeListItem } from "@/app/dashboard/codes/_lib/qr-codes";
import { CopyButton } from "@/components/copy-button";
import { CodeActionsMenu } from "./code-actions-menu";
import { startCodesDrag } from "./drag";
import { displayUrl, formatDate, formatNumber } from "./format";
import { Sparkline } from "./sparkline";
import { StatusBadge } from "./status-badge";
import { TagChip } from "./tag-chip";
import { useOrganizeAction } from "./use-organize-action";

function FavoriteButton({ code }: { code: QrCodeListItem }) {
  const { run, isPending } = useOrganizeAction();
  const label = code.isFavorite ? "Remove from favorites" : "Add to favorites";
  return (
    <button
      aria-label={label}
      aria-pressed={code.isFavorite}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm p-0.5 outline-none focus-visible:ring-2 disabled:opacity-50"
      disabled={isPending}
      onClick={() =>
        run(() =>
          setQrCodesFavorite({ ids: [code.id], favorite: !code.isFavorite }),
        )
      }
      title={label}
      type="button"
    >
      <Star
        className={cn("size-4", code.isFavorite && "text-amber-400")}
        variant={code.isFavorite ? "Bold" : "Linear"}
      />
    </button>
  );
}

export function CodesTable({
  codes,
  sparklines,
  selected,
  onSelect,
  folders,
  tags,
  showFolder = false,
}: {
  codes: QrCodeListItem[];
  /** Daily scans for the last 7 days, by code id */
  sparklines: Record<string, number[]>;
  /** Selection (checkboxes and dragging several rows); omit for a plain table */
  selected?: Set<string>;
  onSelect?: (ids: string[], selected: boolean) => void;
  folders?: FolderRow[];
  tags?: TagRow[];
  /** Show each code's folder (when listing across folders) */
  showFolder?: boolean;
}) {
  const selectable = Boolean(selected && onSelect);
  const allSelected =
    selectable &&
    codes.length > 0 &&
    codes.every((code) => selected?.has(code.id));
  const someSelected =
    selectable && !allSelected && codes.some((code) => selected?.has(code.id));
  const folderNames = new Map((folders ?? []).map((row) => [row.id, row.name]));
  const trash = codes.some((code) => code.deletedAt);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selectable && (
            <TableHead className="w-8 pr-0">
              <Checkbox
                aria-label="Select all codes on this page"
                checked={
                  allSelected ? true : someSelected ? "indeterminate" : false
                }
                onCheckedChange={(checked) =>
                  onSelect?.(
                    codes.map((code) => code.id),
                    checked === true,
                  )
                }
              />
            </TableHead>
          )}
          <TableHead>Code</TableHead>
          <TableHead>Short link</TableHead>
          <TableHead className="text-right">Scans</TableHead>
          <TableHead>{trash ? "Deleted" : "Created"}</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {codes.map((code) => {
          const href = `/dashboard/codes/${encodeURIComponent(code.id)}`;
          const isSelected = selected?.has(code.id) ?? false;
          const inTrash = Boolean(code.deletedAt);
          const folderName =
            showFolder && code.folderId ? folderNames.get(code.folderId) : null;
          const title = code.title || displayUrl(code.destinationUrl);
          return (
            <TableRow
              className={cn(!inTrash && selectable && "cursor-grab")}
              data-state={isSelected ? "selected" : undefined}
              draggable={!inTrash && selectable}
              key={code.id}
              onDragStart={(event) =>
                startCodesDrag(
                  event,
                  isSelected && selected ? [...selected] : [code.id],
                )
              }
            >
              {selectable && (
                <TableCell className="w-8 pr-0">
                  <Checkbox
                    aria-label={`Select ${title}`}
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      onSelect?.([code.id], checked === true)
                    }
                  />
                </TableCell>
              )}
              <TableCell className="max-w-[320px]">
                <div className="flex min-w-0 items-start gap-2">
                  {!inTrash && <FavoriteButton code={code} />}
                  <div className="min-w-0 flex-1 space-y-1">
                    {inTrash ? (
                      <span className="block truncate font-medium">
                        {title}
                      </span>
                    ) : (
                      <Link
                        className="block min-w-0 hover:underline"
                        draggable={false}
                        href={href}
                      >
                        <span className="block truncate font-medium">
                          {title}
                        </span>
                      </Link>
                    )}
                    <span className="text-muted-foreground block truncate text-xs">
                      {displayUrl(code.destinationUrl)}
                    </span>
                    {(folderName || code.tags.length > 0 || code.notes) && (
                      <div className="flex flex-wrap items-center gap-1">
                        {folderName && (
                          <span className="text-muted-foreground inline-flex max-w-40 items-center gap-1 text-[11px]">
                            <Folder className="size-3 shrink-0" />
                            <span className="truncate">{folderName}</span>
                          </span>
                        )}
                        {code.tags.map((ref) => (
                          <TagChip
                            color={ref.color}
                            key={ref.id}
                            name={ref.name}
                          />
                        ))}
                        {code.notes && (
                          <span
                            className="text-muted-foreground inline-flex items-center"
                            title={code.notes}
                          >
                            <NotebookPen
                              aria-hidden="true"
                              className="size-3"
                            />
                            <span className="sr-only">Notes: {code.notes}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground max-w-[200px] truncate font-mono text-xs">
                    {displayUrl(code.shortLink)}
                  </span>
                  <CopyButton
                    successMessage={{ title: "Short link copied" }}
                    textToCopy={code.shortLink}
                  />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-3">
                  <Sparkline values={sparklines[code.id] ?? []} />
                  <span className="min-w-10 text-right tabular-nums">
                    {formatNumber(code.scanCount)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDate(inTrash ? code.deletedAt : code.createdAt)}
              </TableCell>
              <TableCell>
                <StatusBadge
                  paused={Boolean(code.pausedAt)}
                  status={code.status}
                />
              </TableCell>
              <TableCell className="text-right">
                <CodeActionsMenu code={code} folders={folders} tags={tags} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
