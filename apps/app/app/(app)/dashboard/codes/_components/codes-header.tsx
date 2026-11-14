"use client";
import { useTranslations } from "next-intl";

// The codes page's header: the folder switcher as its title, then one New
// code button and a "…" menu holding both imports.

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowDown2,
  Category,
  DocumentUpload,
  Edit2,
  Folder2,
  FolderAdd,
  FolderMinus,
  Import,
  More,
  Trash,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  buildFolderTree,
  type CodesFilters,
  codesHref,
  type FolderRow,
  flattenFolderTree,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import type { CodeUsage } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { useCan } from "@/components/workspace-provider";
import { DeleteFolderDialog, FolderNameDialog } from "./folder-dialogs";
import { formatNumber } from "./format";
import { ImportDialog } from "./import-dialog";
import { NewCodeButton } from "./usage";

type NameMode =
  | { type: "create"; parent: FolderRow | null }
  | { type: "rename"; folder: FolderRow };

export function CodesHeader({
  basePath,
  filters,
  folders,
  total,
  usage,
}: {
  basePath: string;
  filters: CodesFilters;
  folders: FolderRow[];
  /** Codes matching the filters */
  total: number;
  usage: CodeUsage;
}) {
  const t = useTranslations("app.dashboard.codes.codesHeader");
  const router = useRouter();
  // Viewers and billing members only browse: no folder, code or import
  // actions (lib/permissions.ts; the server refuses them too).
  const canWrite = useCan("content.write");
  const [nameMode, setNameMode] = useState<NameMode | null>(null);
  const [deleting, setDeleting] = useState<FolderRow | null>(null);
  const [importSignal, setImportSignal] = useState(0);
  const tree = useMemo(
    () => flattenFolderTree(buildFolderTree(folders)),
    [folders],
  );
  const current =
    filters.folder && filters.folder !== "none"
      ? (folders.find((folder) => folder.id === filters.folder) ?? null)
      : null;
  const title = current
    ? current.name
    : filters.folder === "none"
      ? t("notInAFolder")
      : t("allCodes");
  const parentName = (folder: FolderRow) =>
    folders.find((row) => row.id === folder.parentId)?.name ?? null;
  const to = (folder: string | null) =>
    codesHref(basePath, filters, { folder });

  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <h1 className="-ml-2 min-w-0 text-2xl font-semibold tracking-tight">
          <span className="sr-only">{t("dynamicQrCodes")} </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="hover:bg-muted/60 focus-visible:ring-ring/50 inline-flex max-w-full items-center gap-2 rounded-lg px-2 py-1 outline-none transition-colors focus-visible:ring-[3px]"
                type="button"
              >
                {current ? (
                  <Folder2 aria-hidden className="size-5 shrink-0" />
                ) : (
                  <Category aria-hidden className="size-5 shrink-0" />
                )}
                <span className="truncate">{title}</span>
                <ArrowDown2
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0"
                />
                <span className="sr-only">{t("changeFolder")}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-[min(28rem,70vh)] w-64 overflow-y-auto"
            >
              <DropdownMenuItem asChild>
                <Link href={to(null)}>
                  <Category aria-hidden />
                  {t("allCodes")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={to("none")}>
                  <FolderMinus aria-hidden />
                  {t("notInAFolder")}
                </Link>
              </DropdownMenuItem>
              {tree.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
                    {t("folders")}
                  </DropdownMenuLabel>
                  {tree.map((folder) => (
                    <DropdownMenuItem asChild key={folder.id}>
                      <Link
                        aria-current={
                          folder.id === current?.id ? "page" : undefined
                        }
                        className={cn(
                          folder.id === current?.id && "bg-accent font-medium",
                        )}
                        href={to(folder.id)}
                        style={{
                          paddingLeft: `${0.5 + folder.depth * 0.875}rem`,
                        }}
                      >
                        <Folder2 aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          {folder.name}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {formatNumber(folder.codeCount)}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {canWrite && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() =>
                      setNameMode({ type: "create", parent: null })
                    }
                  >
                    <FolderAdd aria-hidden />
                    {t("newFolder")}
                  </DropdownMenuItem>
                </>
              )}
              {canWrite && current && (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      setNameMode({ type: "create", parent: current })
                    }
                  >
                    <FolderAdd aria-hidden />
                    {t("newFolderInName", { name: current.name })}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      setNameMode({ type: "rename", folder: current })
                    }
                  >
                    <Edit2 aria-hidden />
                    {t("renameName", { name: current.name })}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setDeleting(current)}
                    variant="destructive"
                  >
                    <Trash aria-hidden />
                    {t("deleteName", { name: current.name })}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </h1>
        <span className="text-muted-foreground hidden shrink-0 text-sm tabular-nums sm:inline">
          {formatNumber(total)} {total === 1 ? t("code") : t("codes")}
        </span>
      </div>

      {canWrite && (
        <div className="flex shrink-0 items-center gap-2">
          <NewCodeButton usage={usage} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("moreCodeActions")}
                size="icon"
                variant="outline"
              >
                <More aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
                {t("importCodes")}
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href={`${basePath}/import`}>
                  <DocumentUpload aria-hidden />
                  {t("fromACsvFile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setImportSignal((count) => count + 1)}
              >
                <Import aria-hidden />
                {t("fromBitlyAndOtherApps")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ImportDialog hideTrigger openSignal={importSignal} />
        </div>
      )}

      <FolderNameDialog
        mode={nameMode}
        onCreated={(folder) => router.push(to(folder.id))}
        onOpenChange={(open) => !open && setNameMode(null)}
      />
      <DeleteFolderDialog
        folder={deleting}
        onDeleted={(parentId) => router.push(to(parentId))}
        onOpenChange={(open) => !open && setDeleting(null)}
        parentName={deleting ? parentName(deleting) : null}
      />
    </div>
  );
}
