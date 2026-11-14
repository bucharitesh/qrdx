"use client";

import { toast } from "@repo/design-system";
import { Tick as Check } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { cn } from "@repo/design-system/lib/utils";
import { FolderOpen } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { LoadMore } from "@/components/load-more";
import { workspaceRequestHeaders } from "@/components/workspace-provider";
import { useCursorList } from "@/lib/hooks/use-cursor-list";
import type { CursorPage } from "@/lib/keyset-cursor";
import {
  FILE_KIND_LABELS,
  type FileKind,
  type FileView,
  formatBytes,
} from "../types";
import { FileKindIcon } from "./file-kind-icon";

const NO_FILES: CursorPage<FileView> = { items: [], nextCursor: null };

/**
 * Pick already uploaded files (of one kind, or any) from the workspace,
 * newest first; more load as the list scrolls.
 */
export function LibraryButton({
  kind,
  multiple = false,
  onSelect,
  disabled,
}: {
  /** Omit to list every kind */
  kind?: FileKind;
  multiple?: boolean;
  onSelect: (files: FileView[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("editor.connections.libraryDialog");
  const [open, setOpen] = useState(false);
  const [firstLoaded, setFirstLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function fetchPage(cursor?: string): Promise<CursorPage<FileView>> {
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (cursor) params.set("cursor", cursor);
    const query = params.toString();
    const response = await fetch(`/api/files${query ? `?${query}` : ""}`, {
      cache: "no-store",
      headers: workspaceRequestHeaders(),
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: FileView[];
      nextCursor?: string | null;
      message?: string;
    };
    if (!(response.ok && body.data)) {
      throw new Error(body.message ?? t("couldntLoadYourFiles"));
    }
    return { items: body.data, nextCursor: body.nextCursor ?? null };
  }

  const list = useCursorList({
    first: NO_FILES,
    keyOf: (file) => file.id,
    errorMessage: t("couldntLoadYourFiles"),
    load: fetchPage,
  });
  const files = firstLoaded ? list.items : null;

  async function openLibrary() {
    setOpen(true);
    setSelected([]);
    setFirstLoaded(false);
    // Every open starts again from the newest file.
    list.replace(NO_FILES);
    try {
      list.replace(await fetchPage());
    } catch (error) {
      list.replace(NO_FILES);
      toast.error((error as Error).message);
    } finally {
      setFirstLoaded(true);
    }
  }

  function choose(file: FileView) {
    if (!multiple) {
      onSelect([file]);
      setOpen(false);
      return;
    }
    setSelected((ids) =>
      ids.includes(file.id)
        ? ids.filter((id) => id !== file.id)
        : [...ids, file.id],
    );
  }

  const label = kind ? `${FILE_KIND_LABELS[kind].toLowerCase()} ` : "";

  return (
    <>
      <Button
        disabled={disabled}
        onClick={openLibrary}
        size="sm"
        type="button"
        variant="outline"
      >
        <FolderOpen />
        {t("fromYourFiles")}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("yourLabelFiles", { label })}</DialogTitle>
            <DialogDescription>
              {t("filesUploadedToThisWorkspace")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1 overflow-y-auto" ref={scrollRef}>
            {files === null ? (
              <div className="flex justify-center py-8">
                <ModuleOrbit />
              </div>
            ) : files.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                {t("noLabelFilesYetUpload", { label })}
              </p>
            ) : (
              files.map((file) => {
                const isSelected = selected.includes(file.id);
                return (
                  <button
                    aria-pressed={multiple ? isSelected : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent",
                      isSelected && "border-primary bg-accent",
                    )}
                    key={file.id}
                    onClick={() => choose(file)}
                    type="button"
                  >
                    {file.kind === "image" ? (
                      <img
                        alt=""
                        className="size-10 shrink-0 rounded object-cover"
                        loading="lazy"
                        src={file.url}
                      />
                    ) : (
                      <FileKindIcon
                        className="size-5 shrink-0"
                        kind={file.kind}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {file.filename}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatBytes(file.size)}
                      </span>
                    </span>
                    {isSelected && <Check className="size-4 shrink-0" />}
                  </button>
                );
              })
            )}
            {files && files.length > 0 && (
              <LoadMore
                count={files.length}
                error={list.error}
                hasMore={list.hasMore}
                labels={{
                  loadMore: t("loadMore"),
                  loading: t("loading"),
                  retry: t("tryAgain"),
                }}
                loading={list.loading}
                onLoadMore={list.loadMore}
                root={scrollRef}
              />
            )}
          </div>
          {multiple && (
            <DialogFooter>
              <Button
                disabled={selected.length === 0}
                onClick={() => {
                  const byId = new Map(list.items.map((f) => [f.id, f]));
                  onSelect(selected.flatMap((id) => byId.get(id) ?? []));
                  setOpen(false);
                }}
                type="button"
              >
                {t("add")} {selected.length > 0 ? selected.length : ""}{" "}
                {t("selected")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
