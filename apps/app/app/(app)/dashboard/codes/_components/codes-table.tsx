"use client";

import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { Folder2 as Folder, Notepad2 as NotebookPen } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  LIST_TABLE_ROW_FOCUS,
  type ListSelectionApi,
  useModKey,
} from "@/app/(app)/dashboard/_components/list-selection";
import type { CodeProperty } from "@/app/(app)/dashboard/codes/_lib/display";
import { CODE_PROPERTIES } from "@/app/(app)/dashboard/codes/_lib/display";
import type { TagRow } from "@/app/(app)/dashboard/codes/_lib/organize";
import type { FolderRow } from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import type { QrCodeListItem } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { CopyButton } from "@/components/copy-button";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useWorkspaceHref } from "@/components/workspace-provider";
import { CodeActionsMenu } from "./code-actions-menu";
import { DestinationIcon, FavoriteButton } from "./codes-cards";
import { displayUrl, formatDate, formatNumber } from "./format";
import { Sparkline } from "./sparkline";
import { StatusBadge } from "./status-badge";
import { TagChip } from "./tag-chip";

export function CodesTable({
  codes,
  sparklines,
  selection,
  folders,
  tags,
  showFolder = false,
  keyboardShortcuts = false,
  properties = [...CODE_PROPERTIES],
}: {
  codes: QrCodeListItem[];
  /** Daily scans for the last 7 days, by code id */
  sparklines: Record<string, number[]>;
  /** Checkboxes, ranges and the list's keys (list-selection.tsx); omit for a plain table */
  selection?: ListSelectionApi;
  folders?: FolderRow[];
  tags?: TagRow[];
  /** Show each code's folder (when listing across folders) */
  showFolder?: boolean;
  /** Row keys (see _lib/row-shortcuts.ts) for the row under the pointer or focus */
  keyboardShortcuts?: boolean;
  /** Columns shown (the Display menu) */
  properties?: CodeProperty[];
}) {
  const t = useTranslations("app.dashboard.codes.codesTable");
  const shows = (property: CodeProperty) => properties.includes(property);
  const inWorkspace = useWorkspaceHref();
  const modKey = useModKey();
  const selectable = Boolean(selection);
  const allSelected =
    selectable &&
    codes.length > 0 &&
    codes.every((code) => selection?.isSelected(code.id));
  const someSelected =
    selectable &&
    !allSelected &&
    codes.some((code) => selection?.isSelected(code.id));
  const folderNames = new Map((folders ?? []).map((row) => [row.id, row.name]));
  const trash = codes.some((code) => code.deletedAt);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selection && (
            <TableHead className="w-8 pr-0">
              <TooltipWrapper
                kbd={keyboardShortcuts ? [modKey, "A"] : undefined}
                label={t("selectAllOnThisPage")}
              >
                <Checkbox
                  aria-label={t("selectAllCodesOnThis")}
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={(checked) =>
                    selection.setMany(
                      codes.map((code) => code.id),
                      checked === true,
                    )
                  }
                />
              </TooltipWrapper>
            </TableHead>
          )}
          <TableHead>{t("code")}</TableHead>
          {/* Phones: code, status and actions fit without scrolling sideways;
              the code's page has its link, scans and dates. */}
          {shows("shortLink") && (
            <TableHead className="hidden sm:table-cell">
              {t("shortLink")}
            </TableHead>
          )}
          {shows("scans") && (
            <TableHead className="hidden text-right sm:table-cell">
              {t.rich("scans7Days", {
                span: (chunks) => <span className="font-normal">{chunks}</span>,
              })}
            </TableHead>
          )}
          {shows("created") && (
            <TableHead className="hidden sm:table-cell">
              {trash ? t("deleted") : t("created")}
            </TableHead>
          )}
          <TableHead>{t("status")}</TableHead>
          <TableHead>
            <span className="sr-only">{t("actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {codes.map((code) => {
          const href = inWorkspace(`/codes/${encodeURIComponent(code.id)}`);
          const isSelected = selection?.isSelected(code.id) ?? false;
          const inTrash = Boolean(code.deletedAt);
          const folderName =
            showFolder && code.folderId ? folderNames.get(code.folderId) : null;
          const title = code.title || displayUrl(code.destinationUrl);
          return (
            <TableRow
              className={selection ? LIST_TABLE_ROW_FOCUS : undefined}
              data-state={isSelected ? "selected" : undefined}
              key={code.id}
              {...selection?.rowProps(code.id)}
            >
              {selection && (
                <TableCell className="w-8 pr-0">
                  <Checkbox
                    aria-label={t("selectTitle", { title })}
                    {...selection.checkboxProps(code.id)}
                  />
                </TableCell>
              )}
              <TableCell className="max-w-[260px] max-sm:max-w-[190px]">
                <div className="flex min-w-0 items-center gap-2.5">
                  <DestinationIcon className="size-7" code={code} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {inTrash ? (
                      <span className="block truncate font-medium">
                        {title}
                      </span>
                    ) : (
                      <div className="flex min-w-0 items-center gap-1">
                        <Link
                          className="block min-w-0 hover:underline"
                          href={href}
                        >
                          <span className="block truncate font-medium">
                            {title}
                          </span>
                        </Link>
                        <FavoriteButton code={code} />
                      </div>
                    )}
                    {shows("destination") && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {code.kind === "page"
                          ? t("hostedPage")
                          : displayUrl(code.destinationUrl)}
                      </span>
                    )}
                    {(folderName ||
                      (shows("tags") && code.tags.length > 0) ||
                      code.notes) && (
                      <div className="flex flex-wrap items-center gap-1">
                        {folderName && (
                          <span className="text-muted-foreground inline-flex max-w-40 items-center gap-1 text-[11px]">
                            <Folder className="size-3 shrink-0" />
                            <span className="truncate">{folderName}</span>
                          </span>
                        )}
                        {(shows("tags") ? code.tags : []).map((ref) => (
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
                            <span className="sr-only">
                              {t("notesNotes", { notes: code.notes })}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              {shows("shortLink") && (
                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground max-w-[170px] truncate font-mono text-xs">
                      {displayUrl(code.shortLink)}
                    </span>
                    <CopyButton
                      successMessage={{ title: t("shortLinkCopied") }}
                      textToCopy={code.shortLink}
                    />
                  </div>
                </TableCell>
              )}
              {shows("scans") && (
                <TableCell className="hidden sm:table-cell">
                  {/* The trend only when there were scans: a flat line says nothing. */}
                  <div
                    className="flex items-center justify-end gap-3"
                    title={t("allTimeScansWithThe")}
                  >
                    {(sparklines[code.id] ?? []).some((value) => value > 0) && (
                      <Sparkline
                        height={16}
                        values={sparklines[code.id] ?? []}
                        width={48}
                      />
                    )}
                    <span className="min-w-10 text-right tabular-nums">
                      {formatNumber(code.scanCount)}
                    </span>
                  </div>
                </TableCell>
              )}
              {shows("created") && (
                <TableCell className="hidden whitespace-nowrap sm:table-cell">
                  {formatDate(inTrash ? code.deletedAt : code.createdAt)}
                </TableCell>
              )}
              <TableCell>
                <StatusBadge
                  paused={Boolean(code.pausedAt)}
                  status={code.status}
                />
              </TableCell>
              <TableCell className="text-right">
                <CodeActionsMenu
                  bulkKeys={(selection?.count ?? 0) > 0}
                  code={code}
                  folders={folders}
                  keysActive={selection?.activeRow === code.id}
                  keysEnabled={keyboardShortcuts}
                  tags={tags}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
