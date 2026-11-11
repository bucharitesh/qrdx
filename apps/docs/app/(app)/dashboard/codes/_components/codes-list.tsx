"use client";

import { toast } from "@repo/design-system";
import { Play, Star, Close as X } from "@repo/design-system/components/icons";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  ArchiveBox as Archive,
  DirectboxSend as ArchiveRestore,
  Import as Download,
  FolderAdd as FolderInput,
  More as MoreHorizontal,
  Pause,
  ArrowRotateLeft as RotateCcw,
  Tag2 as Tags,
  Trash as Trash2,
} from "iconsax-reactjs";
import { useMemo, useRef, useState } from "react";
import {
  purgeQrCodes,
  restoreQrCodes,
  setQrCodesArchived,
  setQrCodesFavorite,
  setQrCodesPaused,
  trashQrCodes,
} from "@/actions/bulk-codes";
import {
  ListShortcuts,
  SelectionStatus,
  type ShortcutRow,
  useListSelection,
} from "@/app/(app)/dashboard/_components/list-selection";
import {
  BULK_KEYS,
  type BulkAction,
  keyLabel,
  offeredBulkActions,
} from "@/app/(app)/dashboard/_lib/list-keys";
import type { TagRow } from "@/app/(app)/dashboard/codes/_lib/organize";
import type {
  CodesStatus,
  FolderRow,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import type { QrCodeListItem } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { useOptimisticCodeList } from "@/components/code-builder/use-optimistic-codes";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useCan } from "@/components/workspace-provider";
import { CodesCards } from "./codes-cards";
import { CodesTable } from "./codes-table";
import { MoveToFolderDialog } from "./folder-dialogs";
import { useListDisplay } from "./list-display";
import { TagsDialog } from "./tag-dialogs";
import { plural, useOrganizeAction } from "./use-organize-action";
import {
  downloadCodesZip,
  ZIP_FORMAT_LABELS,
  type ZipFormat,
} from "./zip-download";

const OTHERS_SKIPPED =
  "codes created by other team members were skipped: only owners and admins can delete them.";

const hint = (action: BulkAction) => keyLabel(BULK_KEYS[action]);

/**
 * The codes table with selection, bulk actions and drag to folders. Rows are
 * selected with their checkboxes (shift-click for a range) or the keyboard
 * (list-selection.tsx), with bulk keys for tags, folders, archive and trash.
 */
export function CodesList({
  codes: serverCodes,
  sparklines,
  folders,
  tags,
  status,
  showFolder,
  keyboardShortcuts,
}: {
  codes: QrCodeListItem[];
  sparklines: Record<string, number[]>;
  folders: FolderRow[];
  tags: TagRow[];
  status: CodesStatus;
  showFolder: boolean;
  /** user.settings.keyboardShortcuts: row keys on */
  keyboardShortcuts: boolean;
}) {
  // Saves from the code builder show at once, before the refresh lands.
  const codes = useOptimisticCodeList(serverCodes);
  const { display } = useListDisplay();
  const [dialog, setDialog] = useState<"move" | "tags" | "purge" | null>(null);
  const [zipping, setZipping] = useState(false);
  const { run, isPending } = useOrganizeAction();
  // Viewers and billing members select codes to download them; the write
  // actions (and their keys) aren't offered (lib/permissions.ts; the server
  // refuses them too).
  const canWrite = useCan("content.write");
  const listRef = useRef<HTMLDivElement>(null);
  const order = useMemo(() => codes.map((code) => code.id), [codes]);
  const busy = isPending || zipping;

  // What the bulk keys run; filled in below, read when a key is pressed.
  const keyActions = useRef<Partial<Record<BulkAction, () => void>>>({});
  const selection = useListSelection({
    order,
    listRef,
    keyboardShortcuts,
    actionsRef: keyActions,
  });
  // Rows that left the page (navigation, a refresh after an action) are
  // dropped by the selection itself, so these are always on screen.
  const selectedCodes = useMemo(() => {
    const byId = new Map(codes.map((code) => [code.id, code]));
    return selection.selectedIds.flatMap((id) => byId.get(id) ?? []);
  }, [codes, selection.selectedIds]);
  const ids = selection.selectedIds;
  const count = ids.length;
  const clear = selection.clear;

  const done = <T,>(result: T | null) => {
    if (result) clear();
    return result;
  };

  const trash = async () => {
    const result = await run(() => trashQrCodes({ ids }), {
      success: ({ updated }) =>
        updated > 0 ? `Moved ${plural(updated, "code")} to trash` : null,
      description: ({ skipped }) =>
        skipped > 0
          ? `${skipped} ${OTHERS_SKIPPED}`
          : "Scans show a 'no longer active' page until you restore them.",
      undo: () => restoreQrCodes({ ids }),
    });
    if (result?.updated === 0) toast.error(`All selected ${OTHERS_SKIPPED}`);
    done(result);
  };

  const purge = async () => {
    const result = await run(() => purgeQrCodes({ ids }), {
      success: ({ updated }) =>
        updated > 0 ? `Deleted ${plural(updated, "code")} forever` : null,
      description: ({ skipped }) =>
        skipped > 0 ? `${skipped} ${OTHERS_SKIPPED}` : null,
    });
    if (result?.updated === 0) toast.error(`All selected ${OTHERS_SKIPPED}`);
    setDialog(null);
    done(result);
  };

  const zip = async (format: ZipFormat) => {
    setZipping(true);
    const toastId = toast.loading(`Preparing ${plural(count, "QR code")}...`);
    try {
      const { saved, failed } = await downloadCodesZip(
        selectedCodes,
        format,
        (finished, total) =>
          toast.loading(`Rendering ${finished} of ${total}...`, {
            id: toastId,
          }),
      );
      if (saved === 0) {
        toast.error("The QR codes couldn't be rendered.", { id: toastId });
      } else {
        toast.success(
          `Downloaded ${plural(saved, "QR code")} as ${ZIP_FORMAT_LABELS[format]}`,
          {
            id: toastId,
            ...(failed > 0 && {
              description: `${failed} couldn't be rendered.`,
            }),
          },
        );
      }
    } catch {
      toast.error("Download failed. Please try again.", { id: toastId });
    } finally {
      setZipping(false);
    }
  };

  const restore = () =>
    run(() => restoreQrCodes({ ids }), {
      success: ({ updated }) => `Restored ${plural(updated, "code")}`,
    }).then(done);

  const toggleArchived = () =>
    run(
      () =>
        setQrCodesArchived({
          ids,
          archived: status !== "archived",
        }),
      {
        success: ({ updated }) =>
          status === "archived"
            ? `Unarchived ${plural(updated, "code")}`
            : `Archived ${plural(updated, "code")}`,
      },
    ).then(done);

  // Keys for the actions this role and view offer (offeredBulkActions);
  // none while one runs. Delete forever opens its confirm dialog, like the
  // button.
  const bulk: Record<BulkAction, { label: string; run: () => void }> = {
    tags: { label: "Tags", run: () => setDialog("tags") },
    move: { label: "Move to folder", run: () => setDialog("move") },
    archive: {
      label: status === "archived" ? "Unarchive" : "Archive",
      run: () => void toggleArchived(),
    },
    restore: { label: "Restore", run: () => void restore() },
    trash:
      status === "trash"
        ? { label: "Delete forever", run: () => setDialog("purge") }
        : { label: "Move to trash", run: () => void trash() },
  };
  keyActions.current = Object.fromEntries(
    offeredBulkActions("codes", { canWrite, busy, status }).map((action) => [
      action,
      bulk[action].run,
    ]),
  );
  const shortcutRows: ShortcutRow[] = offeredBulkActions("codes", {
    canWrite,
    status,
  }).map((action) => ({ label: bulk[action].label, keys: [hint(action)] }));

  const allPaused = selectedCodes.every((code) => code.pausedAt);
  const allFavorite = selectedCodes.every((code) => code.isFavorite);

  return (
    <div className="space-y-2" ref={listRef}>
      <SelectionStatus count={count} noun={["code", "codes"]} />
      {count > 0 && (
        <div
          aria-label="Bulk actions"
          className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-2 z-10 flex flex-wrap items-center gap-1 rounded-lg border p-1.5 shadow-sm backdrop-blur"
          role="toolbar"
        >
          <span className="px-2 text-sm font-medium tabular-nums">
            {count} selected
          </span>
          <TooltipWrapper kbd="Esc" label="Clear selection">
            <Button
              aria-label="Clear selection"
              onClick={clear}
              size="icon-sm"
              variant="ghost"
            >
              <X />
            </Button>
          </TooltipWrapper>
          <div className="bg-border mx-1 h-5 w-px" />
          {status === "trash" ? (
            canWrite && (
              <>
                <TooltipWrapper kbd={hint("restore")} label="Restore">
                  <Button
                    disabled={busy}
                    onClick={restore}
                    size="sm"
                    variant="ghost"
                  >
                    <RotateCcw />
                    Restore
                  </Button>
                </TooltipWrapper>
                <TooltipWrapper kbd={hint("trash")} label="Delete forever">
                  <Button
                    disabled={busy}
                    onClick={() => setDialog("purge")}
                    size="sm"
                    variant="ghost"
                  >
                    <Trash2 />
                    Delete forever
                  </Button>
                </TooltipWrapper>
              </>
            )
          ) : (
            <>
              {canWrite && (
                <>
                  <TooltipWrapper kbd={hint("move")} label="Move to folder">
                    <Button
                      disabled={busy}
                      onClick={() => setDialog("move")}
                      size="sm"
                      variant="ghost"
                    >
                      <FolderInput />
                      Move
                    </Button>
                  </TooltipWrapper>
                  <TooltipWrapper kbd={hint("tags")} label="Tags">
                    <Button
                      disabled={busy}
                      onClick={() => setDialog("tags")}
                      size="sm"
                      variant="ghost"
                    >
                      <Tags />
                      Tag
                    </Button>
                  </TooltipWrapper>
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button disabled={busy} size="sm" variant="ghost">
                    <Download />
                    Download
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => zip("png")}>
                    PNG images (ZIP)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => zip("webp")}>
                    WebP images (ZIP)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => zip("svg")}>
                    SVG images (ZIP)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {canWrite && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button disabled={busy} size="sm" variant="ghost">
                      <MoreHorizontal />
                      More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuItem
                      onSelect={() =>
                        run(
                          () => setQrCodesPaused({ ids, paused: !allPaused }),
                          {
                            success: ({ updated }) =>
                              `${allPaused ? "Resumed" : "Paused"} ${plural(updated, "code")}`,
                            description: allPaused
                              ? "Scans redirect again."
                              : "Scans go to each code's fallback URL, or a neutral 'paused' page.",
                          },
                        )
                      }
                    >
                      {allPaused ? <Play /> : <Pause />}
                      {allPaused ? "Resume" : "Pause"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        run(
                          () =>
                            setQrCodesFavorite({ ids, favorite: !allFavorite }),
                          {
                            success: allFavorite
                              ? "Removed from favorites"
                              : "Added to favorites",
                          },
                        )
                      }
                    >
                      <Star />
                      {allFavorite
                        ? "Remove from favorites"
                        : "Add to favorites"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={toggleArchived}>
                      {status === "archived" ? <ArchiveRestore /> : <Archive />}
                      {status === "archived" ? "Unarchive" : "Archive"}
                      {keyboardShortcuts && (
                        <DropdownMenuShortcut>
                          {hint("archive")}
                        </DropdownMenuShortcut>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={trash} variant="destructive">
                      <Trash2 />
                      Move to trash
                      {keyboardShortcuts && (
                        <DropdownMenuShortcut>
                          {hint("trash")}
                        </DropdownMenuShortcut>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
          {keyboardShortcuts && (
            <div className="ml-auto">
              <ListShortcuts actions={shortcutRows} />
            </div>
          )}
        </div>
      )}

      {display.view === "cards" ? (
        <CodesCards
          codes={codes}
          folders={folders}
          keyboardShortcuts={keyboardShortcuts}
          properties={display.properties}
          selection={selection}
          sparklines={sparklines}
          tags={tags}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <CodesTable
            codes={codes}
            folders={folders}
            keyboardShortcuts={keyboardShortcuts}
            properties={display.properties}
            selection={selection}
            showFolder={showFolder}
            sparklines={sparklines}
            tags={tags}
          />
        </div>
      )}

      <MoveToFolderDialog
        folders={folders}
        ids={ids}
        onMoved={clear}
        onOpenChange={(open) => setDialog(open ? "move" : null)}
        open={dialog === "move"}
      />
      <TagsDialog
        codes={selectedCodes}
        onOpenChange={(open) => setDialog(open ? "tags" : null)}
        open={dialog === "tags"}
        tags={tags}
      />
      <AlertDialog
        onOpenChange={(open) => setDialog(open ? "purge" : null)}
        open={dialog === "purge"}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {plural(count, "code")} forever?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their scan and version history are deleted, and printed copies
              show a "QR code not found" page. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <Button disabled={isPending} onClick={purge} variant="destructive">
              Delete forever
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
