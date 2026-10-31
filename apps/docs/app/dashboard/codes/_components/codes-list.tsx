"use client";

import { toast } from "@repo/design-system";
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
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Archive,
  ArchiveRestore,
  Download,
  FolderInput,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Star,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  purgeQrCodes,
  restoreQrCodes,
  setQrCodesArchived,
  setQrCodesFavorite,
  setQrCodesPaused,
  trashQrCodes,
} from "@/actions/bulk-codes";
import type { TagRow } from "@/app/dashboard/codes/_lib/organize";
import type {
  CodesStatus,
  FolderRow,
} from "@/app/dashboard/codes/_lib/organize-shared";
import type { QrCodeListItem } from "@/app/dashboard/codes/_lib/qr-codes";
import { CodesTable } from "./codes-table";
import { MoveToFolderDialog } from "./folder-dialogs";
import { TagsDialog } from "./tag-dialogs";
import { plural, useOrganizeAction } from "./use-organize-action";
import { downloadCodesZip } from "./zip-download";

const OTHERS_SKIPPED =
  "codes created by other team members were skipped: only owners and admins can delete them.";

/** The codes table with selection, bulk actions and drag to folders. */
export function CodesList({
  codes,
  sparklines,
  folders,
  tags,
  status,
  showFolder,
}: {
  codes: QrCodeListItem[];
  sparklines: Record<string, number[]>;
  folders: FolderRow[];
  tags: TagRow[];
  status: CodesStatus;
  showFolder: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"move" | "tags" | "purge" | null>(null);
  const [zipping, setZipping] = useState(false);
  const { run, isPending } = useOrganizeAction();

  // Drop selections that left the page (navigation, refresh after an action).
  useEffect(() => {
    const visible = new Set(codes.map((code) => code.id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [codes]);

  const select = (ids: string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const selectedCodes = useMemo(
    () => codes.filter((code) => selected.has(code.id)),
    [codes, selected],
  );
  const ids = selectedCodes.map((code) => code.id);
  const count = ids.length;
  const busy = isPending || zipping;
  const clear = () => setSelected(new Set());

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

  const zip = async (format: "png" | "svg") => {
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
          `Downloaded ${plural(saved, "QR code")} as ${format.toUpperCase()}`,
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

  const allPaused = selectedCodes.every((code) => code.pausedAt);
  const allFavorite = selectedCodes.every((code) => code.isFavorite);

  return (
    <div className="space-y-2">
      {count > 0 && (
        <div
          aria-label="Bulk actions"
          className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-2 z-10 flex flex-wrap items-center gap-1 rounded-lg border p-1.5 shadow-sm backdrop-blur"
          role="toolbar"
        >
          <span className="px-2 text-sm font-medium tabular-nums">
            {count} selected
          </span>
          <Button
            aria-label="Clear selection"
            onClick={clear}
            size="icon-sm"
            variant="ghost"
          >
            <X />
          </Button>
          <div className="bg-border mx-1 h-5 w-px" />
          {status === "trash" ? (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  run(() => restoreQrCodes({ ids }), {
                    success: ({ updated }) =>
                      `Restored ${plural(updated, "code")}`,
                  }).then(done)
                }
                size="sm"
                variant="ghost"
              >
                <RotateCcw />
                Restore
              </Button>
              <Button
                disabled={busy}
                onClick={() => setDialog("purge")}
                size="sm"
                variant="ghost"
              >
                <Trash2 />
                Delete forever
              </Button>
            </>
          ) : (
            <>
              <Button
                disabled={busy}
                onClick={() => setDialog("move")}
                size="sm"
                variant="ghost"
              >
                <FolderInput />
                Move
              </Button>
              <Button
                disabled={busy}
                onClick={() => setDialog("tags")}
                size="sm"
                variant="ghost"
              >
                <Tags />
                Tag
              </Button>
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
                  <DropdownMenuItem onSelect={() => zip("svg")}>
                    SVG images (ZIP)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                      run(() => setQrCodesPaused({ ids, paused: !allPaused }), {
                        success: ({ updated }) =>
                          `${allPaused ? "Resumed" : "Paused"} ${plural(updated, "code")}`,
                        description: allPaused
                          ? "Scans redirect again."
                          : "Scans go to each code's fallback URL, or a neutral 'paused' page.",
                      })
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
                    {allFavorite ? "Remove from favorites" : "Add to favorites"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
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
                      ).then(done)
                    }
                  >
                    {status === "archived" ? <ArchiveRestore /> : <Archive />}
                    {status === "archived" ? "Unarchive" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={trash} variant="destructive">
                    <Trash2 />
                    Move to trash
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      )}

      <div className="rounded-lg border">
        <CodesTable
          codes={codes}
          folders={folders}
          onSelect={select}
          selected={selected}
          showFolder={showFolder}
          sparklines={sparklines}
          tags={tags}
        />
      </div>

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
              keep showing a "no longer active" page. This can't be undone.
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
