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
import { DropdownMenuItem } from "@repo/design-system/components/ui/dropdown-menu";
import {
  ArchiveBox as Archive,
  DirectboxSend as ArchiveRestore,
  Import as Download,
  FolderAdd as FolderInput,
  Pause,
  ArrowRotateLeft as RotateCcw,
  Tag2 as Tags,
  Trash as Trash2,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
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
  type ShortcutRow,
  useListSelection,
} from "@/app/(app)/dashboard/_components/list-selection";
import {
  SelectionBar,
  type SelectionBarAction,
} from "@/app/(app)/dashboard/_components/selection-bar";
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
import { useCan } from "@/components/workspace-provider";
import { CodesCards } from "./codes-cards";
import { CodesTable } from "./codes-table";
import { MoveToFolderDialog } from "./folder-dialogs";
import { useListDisplay } from "./list-display";
import { TagsDialog } from "./tag-dialogs";
import { useOrganizeAction } from "./use-organize-action";
import {
  downloadCodesZip,
  ZIP_FORMAT_LABELS,
  type ZipFormat,
} from "./zip-download";

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
  const t = useTranslations("app.dashboard.codes.codesList");
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
        updated > 0 ? t("movedToTrash", { count: updated }) : null,
      description: ({ skipped }) =>
        skipped > 0
          ? t("othersSkipped", { count: skipped })
          : t("trashScansNote"),
      undo: () => restoreQrCodes({ ids }),
    });
    if (result?.updated === 0) toast.error(t("allSelectedOthersSkipped"));
    done(result);
  };

  const purge = async () => {
    const result = await run(() => purgeQrCodes({ ids }), {
      success: ({ updated }) =>
        updated > 0 ? t("deletedForever", { count: updated }) : null,
      description: ({ skipped }) =>
        skipped > 0 ? t("othersSkipped", { count: skipped }) : null,
    });
    if (result?.updated === 0) toast.error(t("allSelectedOthersSkipped"));
    setDialog(null);
    done(result);
  };

  const zip = async (format: ZipFormat) => {
    setZipping(true);
    const toastId = toast.loading(t("preparingValue", { count }));
    try {
      const { saved, failed } = await downloadCodesZip(
        selectedCodes,
        format,
        (finished, total) =>
          toast.loading(t("renderingFinishedOfTotal", { finished, total }), {
            id: toastId,
          }),
      );
      if (saved === 0) {
        toast.error(t("theQrCodesCouldntBe"), { id: toastId });
      } else {
        toast.success(
          t("downloadedValueAsValue2", {
            count: saved,
            value2: ZIP_FORMAT_LABELS[format],
          }),
          {
            id: toastId,
            ...(failed > 0 && {
              description: t("failedCouldntBeRendered", { failed }),
            }),
          },
        );
      }
    } catch {
      toast.error(t("downloadFailedPleaseTryAgain"), { id: toastId });
    } finally {
      setZipping(false);
    }
  };

  const restore = () =>
    run(() => restoreQrCodes({ ids }), {
      success: ({ updated }) => t("restoredCodes", { count: updated }),
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
            ? t("unarchivedCodes", { count: updated })
            : t("archivedCodes", { count: updated }),
      },
    ).then(done);

  // Keys for the actions this role and view offer (offeredBulkActions);
  // none while one runs. Delete forever opens its confirm dialog, like the
  // button.
  const bulk: Record<BulkAction, { label: string; run: () => void }> = {
    tags: { label: t("tags"), run: () => setDialog("tags") },
    move: { label: t("moveToFolder"), run: () => setDialog("move") },
    archive: {
      label: status === "archived" ? t("unarchive") : t("archive"),
      run: () => void toggleArchived(),
    },
    restore: { label: t("restore"), run: () => void restore() },
    trash:
      status === "trash"
        ? { label: t("deleteForever"), run: () => setDialog("purge") }
        : { label: t("moveToTrash"), run: () => void trash() },
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

  const actions: SelectionBarAction[] =
    status === "trash"
      ? canWrite
        ? [
            {
              id: "restore",
              label: t("restore"),
              icon: <RotateCcw />,
              kbd: hint("restore"),
              priority: 60,
              onSelect: () => void restore(),
            },
            {
              id: "purge",
              label: t("deleteForever"),
              icon: <Trash2 />,
              kbd: hint("trash"),
              priority: 50,
              destructive: true,
              onSelect: () => setDialog("purge"),
            },
          ]
        : []
      : [
          ...(canWrite
            ? [
                {
                  id: "move",
                  label: t("move"),
                  title: t("moveToFolder"),
                  icon: <FolderInput />,
                  kbd: hint("move"),
                  priority: 60,
                  onSelect: () => setDialog("move"),
                },
                {
                  id: "tags",
                  label: t("tag"),
                  title: t("tags"),
                  icon: <Tags />,
                  kbd: hint("tags"),
                  priority: 50,
                  onSelect: () => setDialog("tags"),
                },
              ]
            : []),
          {
            id: "download",
            label: t("download"),
            icon: <Download />,
            priority: 40,
            menu: (
              <>
                <DropdownMenuItem onSelect={() => zip("png")}>
                  {t("pngImagesZip")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => zip("webp")}>
                  {t("webpImagesZip")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => zip("svg")}>
                  {t("svgImagesZip")}
                </DropdownMenuItem>
              </>
            ),
          },
          ...(canWrite
            ? [
                {
                  id: "archive",
                  label: status === "archived" ? t("unarchive") : t("archive"),
                  icon:
                    status === "archived" ? <ArchiveRestore /> : <Archive />,
                  kbd: hint("archive"),
                  priority: 30,
                  onSelect: () => void toggleArchived(),
                },
                {
                  id: "pause",
                  label: allPaused ? t("resume") : t("pause"),
                  icon: allPaused ? <Play /> : <Pause />,
                  priority: 20,
                  onSelect: () =>
                    void run(
                      () => setQrCodesPaused({ ids, paused: !allPaused }),
                      {
                        success: ({ updated }) =>
                          allPaused
                            ? t("resumedCodes", { count: updated })
                            : t("pausedCodes", { count: updated }),
                        description: allPaused
                          ? t("scansRedirectAgain")
                          : t("scansGoToEachCodes"),
                      },
                    ),
                },
                {
                  id: "favorite",
                  label: allFavorite
                    ? t("removeFromFavorites")
                    : t("addToFavorites"),
                  icon: <Star />,
                  priority: 10,
                  onSelect: () =>
                    void run(
                      () => setQrCodesFavorite({ ids, favorite: !allFavorite }),
                      {
                        success: allFavorite
                          ? "Removed from favorites"
                          : "Added to favorites",
                      },
                    ),
                },
                {
                  id: "trash",
                  label: t("moveToTrash"),
                  icon: <Trash2 />,
                  kbd: hint("trash"),
                  priority: 25,
                  destructive: true,
                  onSelect: () => void trash(),
                },
              ]
            : []),
        ];

  return (
    <div className="space-y-2" ref={listRef}>
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
              {t("deleteValueForever", { count })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("theirScanAndVersionHistory")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button disabled={isPending} onClick={purge} variant="destructive">
              {t("deleteForever")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SelectionBar
        actions={actions}
        clearLabel={t("clearSelection")}
        count={count}
        countLabel={t("countSelected", { count })}
        disabled={busy}
        label={t("bulkActions")}
        noun={["code", "codes"]}
        onClear={clear}
        shortcuts={keyboardShortcuts ? shortcutRows : undefined}
      />
    </div>
  );
}
