"use client";

import { toast } from "@repo/design-system";
import { Tick as Check } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import { FolderOpen } from "iconsax-reactjs";
import { useState } from "react";
import {
  FILE_KIND_LABELS,
  type FileKind,
  type FileView,
  formatBytes,
} from "../types";
import { FileKindIcon } from "./file-kind-icon";

/** Pick already uploaded files (of one kind, or any) from the workspace. */
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
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileView[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  async function openLibrary() {
    setOpen(true);
    setSelected([]);
    setFiles(null);
    try {
      const response = await fetch(`/api/files${kind ? `?kind=${kind}` : ""}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as {
        data?: FileView[];
        message?: string;
      };
      if (!(response.ok && body.data)) {
        throw new Error(body.message ?? "Couldn't load your files.");
      }
      setFiles(body.data);
    } catch (error) {
      setFiles([]);
      toast.error((error as Error).message);
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
        From your files
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Your {label}files</DialogTitle>
            <DialogDescription>
              Files uploaded to this workspace. Manage them in Dashboard →
              Files.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {files === null ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : files.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                No {label}files yet. Upload one first.
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
          </div>
          {multiple && (
            <DialogFooter>
              <Button
                disabled={selected.length === 0}
                onClick={() => {
                  const byId = new Map((files ?? []).map((f) => [f.id, f]));
                  onSelect(selected.flatMap((id) => byId.get(id) ?? []));
                  setOpen(false);
                }}
                type="button"
              >
                Add {selected.length > 0 ? selected.length : ""} selected
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
