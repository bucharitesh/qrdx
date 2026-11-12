"use client";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import {
  Folder2 as Folder,
  FolderOpen,
  FolderAdd as FolderPlus,
  DirectInbox as Inbox,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { moveQrCodes } from "@/actions/bulk-codes";
import {
  createCodeFolder,
  deleteCodeFolder,
  listCodeFolders,
  renameCodeFolder,
} from "@/actions/folders";
import {
  buildFolderTree,
  type FolderRow,
  flattenFolderTree,
  MAX_FOLDER_NAME,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import { plural, useOrganizeAction } from "./use-organize-action";

/** Folders from props, or loaded when a dialog opens outside the list. */
export function useFolders(open: boolean, initial?: FolderRow[]) {
  const [folders, setFolders] = useState<FolderRow[] | null>(initial ?? null);
  useEffect(() => {
    if (initial) {
      setFolders(initial);
      return;
    }
    if (!open) return;
    let cancelled = false;
    listCodeFolders().then((result) => {
      if (!cancelled) setFolders(result.success ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, initial]);
  return [folders, setFolders] as const;
}

type NameDialogMode =
  | { type: "create"; parent: FolderRow | null }
  | { type: "rename"; folder: FolderRow };

export function FolderNameDialog({
  mode,
  onOpenChange,
  onCreated,
}: {
  /** null = closed */
  mode: NameDialogMode | null;
  onOpenChange: (open: boolean) => void;
  onCreated?: (folder: FolderRow) => void;
}) {
  const t = useTranslations("app.dashboard.codes.folderDialogs");
  const { run, isPending } = useOrganizeAction();
  const [name, setName] = useState("");

  useEffect(() => {
    if (mode) setName(mode.type === "rename" ? mode.folder.name : "");
  }, [mode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!mode) return;
    if (mode.type === "rename") {
      const done = await run(
        () => renameCodeFolder({ id: mode.folder.id, name }),
        { success: "Folder renamed" },
      );
      if (done !== null) onOpenChange(false);
      return;
    }
    const created = await run(
      () => createCodeFolder({ name, parentId: mode.parent?.id ?? null }),
      { success: (folder) => `Created "${folder.name}"` },
    );
    if (created) {
      onCreated?.(created);
      onOpenChange(false);
    }
  };

  const title =
    mode?.type === "rename"
      ? "Rename folder"
      : mode?.parent
        ? `New folder in "${mode.parent.name}"`
        : "New folder";

  return (
    <Dialog onOpenChange={onOpenChange} open={mode !== null}>
      <DialogContent className="sm:max-w-sm">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {t("foldersOnlyOrganizeYourList")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">{t("name")}</Label>
            <Input
              autoFocus
              id="folder-name"
              maxLength={MAX_FOLDER_NAME}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("springCampaign")}
              required
              value={name}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              {t("cancel")}
            </Button>
            <Button disabled={isPending || !name.trim()} type="submit">
              {mode?.type === "rename" ? t("save") : t("createFolder")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteFolderDialog({
  folder,
  parentName,
  onOpenChange,
  onDeleted,
}: {
  folder: FolderRow | null;
  parentName: string | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (parentId: string | null) => void;
}) {
  const t = useTranslations("app.dashboard.codes.folderDialogs");
  const { run, isPending } = useOrganizeAction();
  const target = parentName ? `"${parentName}"` : "the top level";

  const remove = async () => {
    if (!folder) return;
    const result = await run(() => deleteCodeFolder({ id: folder.id }), {
      success: `Deleted "${folder.name}"`,
      description: t("itsCodesAndSubfoldersMoved", { target }),
    });
    if (result) {
      onOpenChange(false);
      onDeleted?.(result.parentId);
    }
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={folder !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("deleteName", { name: folder?.name ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("onlyTheFolderIsDeleted", { target })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t("cancel")}
          </AlertDialogCancel>
          <Button disabled={isPending} onClick={remove} variant="destructive">
            {t("deleteFolder")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Picks a folder (or none) for one or more codes. */
export function MoveToFolderDialog({
  ids,
  open,
  onOpenChange,
  folders: initialFolders,
  currentFolderId,
  onMoved,
}: {
  ids: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders?: FolderRow[];
  /** Highlighted as the current location (single code) */
  currentFolderId?: string | null;
  onMoved?: () => void;
}) {
  const t = useTranslations("app.dashboard.codes.folderDialogs");
  const [folders, setFolders] = useFolders(open, initialFolders);
  const { run, isPending } = useOrganizeAction();
  const [creating, setCreating] = useState<FolderRow | null | false>(false);
  const nodes = useMemo(
    () => flattenFolderTree(buildFolderTree(folders ?? [])),
    [folders],
  );

  const move = async (folderId: string | null, name: string | null) => {
    const result = await run(() => moveQrCodes({ ids, folderId }), {
      success: ({ updated }) =>
        `Moved ${plural(updated, "code")} to ${name ? `"${name}"` : "no folder"}`,
    });
    if (result) {
      onOpenChange(false);
      onMoved?.();
    }
  };

  const option = (
    key: string,
    label: string,
    icon: ReactNode,
    onClick: () => void,
    { depth = 0, current = false } = {},
  ) => (
    <button
      className={cn(
        "hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none disabled:opacity-50",
        current && "bg-muted font-medium",
      )}
      disabled={isPending}
      key={key}
      onClick={onClick}
      style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
      type="button"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {current && (
        <span className="text-muted-foreground text-xs">{t("current")}</span>
      )}
    </button>
  );

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("move")}{" "}
              {ids.length === 1 ? t("code") : plural(ids.length, "code")}{" "}
              {t("toFolder")}
            </DialogTitle>
            <DialogDescription>
              {t("linksAndPrintedCodesDont")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {option(
              "none",
              "No folder",
              <Inbox className="text-muted-foreground size-4" />,
              () => move(null, null),
              { current: currentFolderId === null },
            )}
            {folders === null ? (
              <p className="text-muted-foreground px-2 py-3 text-sm">
                {t("loadingFolders")}
              </p>
            ) : (
              nodes.map((node) =>
                option(
                  node.id,
                  node.name,
                  node.id === currentFolderId ? (
                    <FolderOpen className="text-muted-foreground size-4" />
                  ) : (
                    <Folder className="text-muted-foreground size-4" />
                  ),
                  () => move(node.id, node.name),
                  { depth: node.depth, current: node.id === currentFolderId },
                ),
              )
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              disabled={isPending}
              onClick={() => setCreating(null)}
              size="sm"
              variant="outline"
            >
              <FolderPlus />
              {t("newFolder")}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              size="sm"
              variant="ghost"
            >
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FolderNameDialog
        mode={creating === false ? null : { type: "create", parent: creating }}
        onCreated={(folder) => {
          setFolders((current) => [...(current ?? []), folder]);
          move(folder.id, folder.name);
        }}
        onOpenChange={(next) => {
          if (!next) setCreating(false);
        }}
      />
    </>
  );
}
