"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Progress } from "@repo/design-system/components/ui/progress";
import { Upload } from "lucide-react";
import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { acceptAttribute, type FileKind, type FileView } from "../types";
import { uploadFile } from "../upload-client";

export interface UploadProgressState {
  name: string;
  /** 0–1 */
  progress: number;
  /** Position in the batch, from 1 */
  position: number;
  total: number;
}

/**
 * Uploads files one after another into the active workspace. Failures show
 * as toasts; the files that made it are returned.
 */
export function useFileUploads({
  kinds,
  replaceId,
}: {
  kinds: readonly FileKind[];
  replaceId?: string;
}) {
  const [current, setCurrent] = useState<UploadProgressState | null>(null);

  async function upload(files: File[]): Promise<FileView[]> {
    const uploaded: FileView[] = [];
    for (const [index, file] of files.entries()) {
      const base = {
        name: file.name,
        position: index + 1,
        total: files.length,
      };
      setCurrent({ ...base, progress: 0 });
      try {
        uploaded.push(
          await uploadFile(file, {
            kinds,
            replaceId,
            onProgress: (progress) => setCurrent({ ...base, progress }),
          }),
        );
      } catch (error) {
        toast.error((error as Error).message || "Upload failed.");
      }
    }
    setCurrent(null);
    return uploaded;
  }

  return { upload, current, busy: current !== null };
}

export function UploadProgress({
  state,
}: {
  state: UploadProgressState | null;
}) {
  if (!state) return null;
  return (
    <div aria-live="polite" className="min-w-0 space-y-1">
      <p className="truncate text-muted-foreground text-xs">
        {state.total > 1 ? `${state.position}/${state.total} · ` : ""}
        {state.name} · {Math.round(state.progress * 100)}%
      </p>
      <Progress value={state.progress * 100} />
    </div>
  );
}

/** Button that uploads the chosen file(s) and hands back the ready files. */
export function UploadButton({
  kinds,
  multiple = false,
  replaceId,
  onUploaded,
  children = "Upload",
  disabled,
  ...buttonProps
}: {
  kinds: readonly FileKind[];
  multiple?: boolean;
  replaceId?: string;
  onUploaded: (files: FileView[]) => void;
  children?: ReactNode;
} & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, current, busy } = useFileUploads({ kinds, replaceId });

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    const uploaded = await upload(files);
    if (uploaded.length > 0) onUploaded(uploaded);
  }

  return (
    <div className="min-w-0 space-y-2">
      <input
        accept={acceptAttribute(kinds)}
        aria-hidden="true"
        className="sr-only"
        multiple={multiple}
        onChange={(event) => handleFiles(event.target.files)}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
      <Button
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        type="button"
        {...buttonProps}
      >
        <Upload />
        {busy ? "Uploading…" : children}
      </Button>
      <UploadProgress state={current} />
    </div>
  );
}
