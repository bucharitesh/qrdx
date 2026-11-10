"use client";

import { toast } from "@repo/design-system";
import { Play, Star } from "@repo/design-system/components/icons";
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
  Buildings2,
  Chart as ChartNoAxesCombined,
  Copy,
  DocumentDownload,
  Import as Download,
  FolderAdd as FolderInput,
  GalleryImport,
  Link21,
  More as MoreHorizontal,
  Notepad2 as NotebookPen,
  ColorSwatch as Palette,
  Pause,
  Edit2 as Pencil,
  ArrowRotateLeft as RotateCcw,
  Setting2,
  Share,
  StarSlash as StarOff,
  Tag2 as Tags,
  Trash as Trash2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  duplicateQrCode,
  purgeQrCodes,
  restoreQrCodes,
  setQrCodesArchived,
  setQrCodesFavorite,
  setQrCodesPaused,
  trashQrCodes,
} from "@/actions/bulk-codes";
import { keyLabel } from "@/app/(app)/dashboard/_lib/list-keys";
import { codeTabHref } from "@/app/(app)/dashboard/codes/_lib/code-tabs";
import type { TagRow } from "@/app/(app)/dashboard/codes/_lib/organize";
import type { FolderRow } from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import type {
  QrCodeListItem,
  QrCodeView,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  BULK_OWNED,
  ROW_KEYS,
  type RowAction,
  resolveRowShortcut,
} from "@/app/(app)/dashboard/codes/_lib/row-shortcuts";
import {
  describeFocusTarget,
  hasOpenOverlay,
} from "@/components/app-shell/paste-to-create";
import { openCodeBuilder } from "@/components/code-builder/store";
import { useCan, useWorkspaceSlug } from "@/components/workspace-provider";
import { type CodeImageFormat, downloadCodeQr } from "./code-qr";
import { MoveToFolderDialog } from "./folder-dialogs";
import { MoveToWorkspaceDialog } from "./move-workspace-dialog";
import { NotesDialog } from "./notes-dialog";
import { ShareStatsDialog } from "./share-stats-dialog";
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
  keysEnabled = false,
  keysActive = false,
  bulkKeys = false,
}: {
  code: MenuCode;
  showAnalyticsLink?: boolean;
  /** Where to go once the code is moved to the trash (default: stay and refresh) */
  afterDelete?: string;
  folders?: FolderRow[];
  tags?: TagRow[];
  /** Row keys (E, L, D, M, T, A, ⌫) are on: the person's shortcuts switch */
  keysEnabled?: boolean;
  /** This row is under the pointer or holds focus, so its keys apply */
  keysActive?: boolean;
  /** Rows are selected: M, T, A and ⌫ act on the selection, not this row */
  bulkKeys?: boolean;
}) {
  const workspaceSlug = useWorkspaceSlug();
  const router = useRouter();
  const openInPlayground = useOpenInPlayground();
  const { run, isPending } = useOrganizeAction();
  const [dialog, setDialog] = useState<
    "move" | "tags" | "notes" | "purge" | "share" | "workspace" | null
  >(null);
  // Viewers and billing members read only (lib/permissions.ts): their menu
  // keeps the links and downloads, and the server refuses changes anyway.
  const canWrite = useCan("content.write");
  const [menuOpen, setMenuOpen] = useState(false);

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

  const download = (format: CodeImageFormat) => {
    downloadCodeQr(code, format).catch(() =>
      toast.error("Download failed. Please try again."),
    );
  };

  const copyLink = () => {
    navigator.clipboard
      .writeText(code.shortLink)
      .then(() => toast.success("Short link copied"))
      .catch(() => toast.error("Couldn't copy the short link"));
  };

  const listItem = isListItem(code) ? code : null;
  // Move and tags need the list's folders and tags; a trashed code has none.
  const available: RowAction[] = trashed
    ? []
    : !canWrite
      ? ["copy"]
      : listItem
        ? ["edit", "copy", "duplicate", "move", "tags", "archive", "trash"]
        : ["edit", "copy", "duplicate", "archive", "trash"];
  const handlers: Record<RowAction, () => void> = {
    edit: () => openCodeBuilder({ mode: "edit", code }),
    copy: copyLink,
    duplicate,
    move: () => setDialog("move"),
    tags: () => setDialog("tags"),
    archive: toggleArchived,
    trash: () => void trash(),
  };
  const pageKeys = bulkKeys
    ? available.filter((action) => !BULK_OWNED.includes(action))
    : available;
  const keyState = useRef({ handlers, available: pageKeys, isPending });
  keyState.current = { handlers, available: pageKeys, isPending };

  // The row's keys while it's under the pointer; the open menu handles its own.
  useEffect(() => {
    if (!(keysEnabled && keysActive && !trashed)) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const { handlers, available, isPending } = keyState.current;
      const action = resolveRowShortcut(event, {
        enabled: true,
        typing: describeFocusTarget(
          event.target instanceof Element ? event.target : null,
        ).typing,
        overlayOpen: hasOpenOverlay(document),
        available,
      });
      if (!action || isPending) return;
      event.preventDefault();
      handlers[action]();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [keysEnabled, keysActive, trashed]);

  /** With the menu open, its keys run the item (before the menu's typeahead). */
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!keysEnabled) return;
    const action = resolveRowShortcut(event, {
      enabled: true,
      typing: false,
      overlayOpen: false,
      available,
    });
    if (!action || isPending) return;
    event.preventDefault();
    setMenuOpen(false);
    handlers[action]();
  };

  const keyHint = (action: RowAction) =>
    keysEnabled ? (
      <DropdownMenuShortcut>{keyLabel(ROW_KEYS[action])}</DropdownMenuShortcut>
    ) : null;

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
                Its scan and version history are deleted, and printed copies
                show a "QR code not found" page. This can't be undone.
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

  if (!canWrite) {
    return (
      <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
        {trigger}
        <DropdownMenuContent
          align="end"
          className="w-56"
          onKeyDown={onMenuKeyDown}
        >
          <DropdownMenuItem onSelect={copyLink}>
            <Link21 /> Copy short link
            {keyHint("copy")}
          </DropdownMenuItem>
          {showAnalyticsLink && (
            <DropdownMenuItem asChild>
              <Link href={codeTabHref(workspaceSlug, code.id, "analytics")}>
                <ChartNoAxesCombined /> View analytics
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => download("png")}>
            <Download /> Download PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download("webp")}>
            <GalleryImport /> Download WebP
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download("svg")}>
            <DocumentDownload /> Download SVG
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
        {trigger}
        <DropdownMenuContent
          align="end"
          className="w-60"
          onKeyDown={onMenuKeyDown}
        >
          <DropdownMenuItem onSelect={handlers.edit}>
            <Pencil /> Edit link
            {keyHint("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={copyLink}>
            <Link21 /> Copy short link
            {keyHint("copy")}
          </DropdownMenuItem>
          {showAnalyticsLink && (
            <>
              <DropdownMenuItem asChild>
                <Link href={codeTabHref(workspaceSlug, code.id, "analytics")}>
                  <ChartNoAxesCombined /> View analytics
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={codeTabHref(workspaceSlug, code.id, "settings")}>
                  <Setting2 /> Code settings
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={() => openInPlayground(code)}>
            <Palette /> Edit design in playground
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download("png")}>
            <Download /> Download PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download("webp")}>
            <GalleryImport /> Download WebP
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download("svg")}>
            <DocumentDownload /> Download SVG
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
                {keyHint("move")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("tags")}>
                <Tags /> Tags...
                {keyHint("tags")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("notes")}>
                <NotebookPen /> Notes...
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={duplicate}>
            <Copy /> Duplicate
            {keyHint("duplicate")}
          </DropdownMenuItem>
          {/* ── Moving and sharing a code ─────────────────────────────────
              Other lanes add their items here, in this one menu (the cards,
              the rows and the code's own page all use it): "Move to
              workspace…" (feat/workspace-roles-join) and "Share analytics"
              (feat/code-features). Use an icon not used elsewhere in this
              menu, and a key from row-shortcuts.ts only if it's free. */}
          <DropdownMenuItem onSelect={() => setDialog("workspace")}>
            <Buildings2 /> Move to workspace...
          </DropdownMenuItem>
          {/* Public, read-only analytics page (share-stats-dialog.tsx) */}
          <DropdownMenuItem onSelect={() => setDialog("share")}>
            <Share /> Share analytics...
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
            {keyHint("archive")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={trash} variant="destructive">
            <Trash2 /> Move to trash
            {keyHint("trash")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MoveToWorkspaceDialog
        code={code}
        onOpenChange={(open) => setDialog(open ? "workspace" : null)}
        open={dialog === "workspace"}
      />
      <ShareStatsDialog
        code={code}
        onOpenChange={(open) => setDialog(open ? "share" : null)}
        open={dialog === "share"}
      />
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
