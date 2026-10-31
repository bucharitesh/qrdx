"use client";

import { toast } from "@repo/design-system";
import { Star } from "@repo/design-system/components/icons";
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
  ArchiveBox as Archive,
  DirectboxSend as ArchiveRestore,
  Chart as ChartNoAxesCombined,
  Copy,
  Import as Download,
  FolderAdd as FolderInput,
  More as MoreHorizontal,
  Notepad2 as NotebookPen,
  ColorSwatch as Palette,
  Pause,
  Edit2 as Pencil,
  Play,
  ArrowRotateLeft as RotateCcw,
  StarSlash as StarOff,
  Tag2 as Tags,
  Trash as Trash2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  duplicateQrCode,
  purgeQrCodes,
  restoreQrCodes,
  setQrCodesArchived,
  setQrCodesFavorite,
  setQrCodesPaused,
  trashQrCodes,
} from "@/actions/bulk-codes";
import type { TagRow } from "@/app/dashboard/codes/_lib/organize";
import type { FolderRow } from "@/app/dashboard/codes/_lib/organize-shared";
import type {
  QrCodeListItem,
  QrCodeView,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { CodeDialog } from "./code-dialog";
import { downloadCodeQr } from "./code-qr";
import { MoveToFolderDialog } from "./folder-dialogs";
import { NotesDialog } from "./notes-dialog";
import { TagsDialog } from "./tag-dialogs";
import { useOpenInPlayground } from "./use-open-in-playground";
import { useOrganizeAction } from "./use-organize-action";

type MenuCode = QrCodeView & Partial<QrCodeListItem>;

const isListItem = (code: MenuCode): code is QrCodeListItem =>
  Array.isArray(code.tags);

export function CodeActionsMenu({
  code,
  showAnalyticsLink = true,
  afterDelete,
  folders,
  tags,
}: {
  code: MenuCode;
  showAnalyticsLink?: boolean;
  /** Where to go once the code is moved to the trash (default: stay and refresh) */
  afterDelete?: string;
  folders?: FolderRow[];
  tags?: TagRow[];
}) {
  const router = useRouter();
  const openInPlayground = useOpenInPlayground();
  const { run, isPending } = useOrganizeAction();
  const [editOpen, setEditOpen] = useState(false);
  const [dialog, setDialog] = useState<
    "move" | "tags" | "notes" | "purge" | null
  >(null);

  const ids = [code.id];
  const archived = code.archivedAt !== null;
  const trashed = Boolean(code.deletedAt);
  const paused = Boolean(code.pausedAt);

  const toggleArchived = () =>
    run(() => setQrCodesArchived({ ids, archived: !archived }), {
      success: archived ? "Code restored" : "Code archived",
      description: archived
        ? "Scans redirect again."
        : "Scans show a 'no longer active' page until you restore it.",
    });

  const togglePaused = () =>
    run(() => setQrCodesPaused({ ids, paused: !paused }), {
      success: paused ? "Code resumed" : "Code paused",
      description: paused
        ? "Scans redirect again."
        : "Scans go to your fallback URL, or a neutral 'paused' page.",
    });

  const toggleFavorite = () =>
    run(() => setQrCodesFavorite({ ids, favorite: !code.isFavorite }), {
      success: code.isFavorite
        ? "Removed from favorites"
        : "Added to favorites",
    });

  const duplicate = () =>
    run(() => duplicateQrCode({ id: code.id }), {
      success: "Copy created",
      description: (copy) =>
        code.kind === "page"
          ? `New short link ${copy.shortLink}. It opens the same landing page.`
          : `New short link ${copy.shortLink}. Scans start from zero.`,
    });

  const trash = async () => {
    const result = await run(() => trashQrCodes({ ids }), {
      refresh: !afterDelete,
      success: ({ updated }) => (updated > 0 ? "Moved to trash" : null),
      description:
        "Scans show a 'no longer active' page. Restore it from the trash any time.",
      undo: () => restoreQrCodes({ ids }),
    });
    if (result && result.updated === 0) {
      toast.error(
        "Only team owners and admins can delete codes created by others.",
      );
      return;
    }
    if (result && afterDelete) router.push(afterDelete);
  };

  const restore = () =>
    run(() => restoreQrCodes({ ids }), {
      success: "Code restored",
      description: archived
        ? "It's back in Archived."
        : "Scans redirect again.",
    });

  const purge = async () => {
    const result = await run(() => purgeQrCodes({ ids }), {
      success: ({ updated }) => (updated > 0 ? "Code deleted forever" : null),
    });
    if (result && result.updated === 0) {
      toast.error(
        "Only team owners and admins can delete codes created by others.",
      );
    }
    if (result) setDialog(null);
  };

  const download = (format: "png" | "svg") => {
    downloadCodeQr(code, format).catch(() =>
      toast.error("Download failed. Please try again."),
    );
  };

  const trigger = (
    <DropdownMenuTrigger asChild>
      <Button
        aria-label="Code actions"
        disabled={isPending}
        size="icon-sm"
        variant="ghost"
      >
        <MoreHorizontal />
      </Button>
    </DropdownMenuTrigger>
  );

  if (trashed) {
    return (
      <>
        <DropdownMenu>
          {trigger}
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={restore}>
              <RotateCcw /> Restore
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setDialog("purge")}
              variant="destructive"
            >
              <Trash2 /> Delete forever
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog
          onOpenChange={(open) => setDialog(open ? "purge" : null)}
          open={dialog === "purge"}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this code forever?</AlertDialogTitle>
              <AlertDialogDescription>
                Its scan history and version history are deleted and printed
                copies keep showing a "no longer active" page. This can't be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <Button
                disabled={isPending}
                onClick={purge}
                variant="destructive"
              >
                Delete forever
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  const listItem = isListItem(code) ? code : null;

  return (
    <>
      <DropdownMenu>
        {trigger}
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil /> Edit link
          </DropdownMenuItem>
          {showAnalyticsLink && (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/codes/${encodeURIComponent(code.id)}`}>
                <ChartNoAxesCombined /> View analytics
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => openInPlayground(code)}>
            <Palette /> Edit design in playground
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download("png")}>
            <Download /> Download PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download("svg")}>
            <Download /> Download SVG
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {listItem && (
            <>
              <DropdownMenuItem onSelect={toggleFavorite}>
                {listItem.isFavorite ? (
                  <>
                    <StarOff /> Remove from favorites
                  </>
                ) : (
                  <>
                    <Star /> Add to favorites
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("move")}>
                <FolderInput /> Move to folder...
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("tags")}>
                <Tags /> Tags...
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("notes")}>
                <NotebookPen /> Notes...
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={duplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {listItem && (
            <DropdownMenuItem onSelect={togglePaused}>
              {paused ? (
                <>
                  <Play /> Resume
                </>
              ) : (
                <>
                  <Pause /> Pause
                </>
              )}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={toggleArchived}>
            {archived ? (
              <>
                <ArchiveRestore /> Unarchive
              </>
            ) : (
              <>
                <Archive /> Archive
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={trash} variant="destructive">
            <Trash2 /> Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CodeDialog code={code} onOpenChange={setEditOpen} open={editOpen} />

      {listItem && (
        <>
          <MoveToFolderDialog
            currentFolderId={listItem.folderId}
            folders={folders}
            ids={ids}
            onOpenChange={(open) => setDialog(open ? "move" : null)}
            open={dialog === "move"}
          />
          <TagsDialog
            codes={[listItem]}
            onOpenChange={(open) => setDialog(open ? "tags" : null)}
            open={dialog === "tags"}
            tags={tags}
          />
          <NotesDialog
            code={listItem}
            onOpenChange={(open) => setDialog(open ? "notes" : null)}
            open={dialog === "notes"}
          />
        </>
      )}
    </>
  );
}
