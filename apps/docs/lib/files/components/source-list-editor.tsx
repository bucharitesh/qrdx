"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  ArrowDown,
  ArrowUp,
  Document as FileIcon,
  Link2,
  Trash as Trash2,
} from "iconsax-reactjs";
import type { ReactNode } from "react";
import { CloudFileButton } from "@/components/connected-accounts/cloud-file-button";
import { type FileSource, sourceName } from "../source";
import { FILE_KIND_LABELS, type FileKind, type FileView } from "../types";
import { FileKindIcon } from "./file-kind-icon";
import {
  fileToSource,
  LinkInput,
  STORAGE_OFF_MESSAGE,
} from "./file-source-field";
import { LibraryButton } from "./library-dialog";
import { UploadButton } from "./upload-button";

interface SourceItem {
  id: string;
  source: FileSource;
}

/**
 * Ordered list of media items (gallery images, audio tracks, downloads):
 * add by upload, from the library or by link; reorder; remove; edit each
 * item's own fields via `renderItem`.
 */
export function SourceListEditor<T extends SourceItem>({
  kinds,
  items,
  onChange,
  storageEnabled,
  max,
  createItem,
  renderItem,
  itemTitle,
  linkPlaceholder,
}: {
  /** Kinds accepted for uploads; the first one drives the library picker */
  kinds: readonly [FileKind, ...FileKind[]];
  items: T[];
  onChange: (items: T[]) => void;
  storageEnabled: boolean;
  max: number;
  createItem: (source: FileSource, file?: FileView) => T;
  renderItem?: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
  itemTitle?: (item: T) => string;
  linkPlaceholder?: string;
}) {
  const room = Math.max(0, max - items.length);
  const full = room === 0;

  const add = (next: T[]) => onChange([...items, ...next].slice(0, max));
  const addFiles = (files: FileView[]) =>
    add(files.map((file) => createItem(fileToSource(file), file)));
  const update = (index: number, patch: Partial<T>) =>
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target] as T, next[index] as T];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <ol className="space-y-2">
          {items.map((item, index) => {
            const title =
              itemTitle?.(item) ||
              sourceName(item.source) ||
              `Item ${index + 1}`;
            return (
              <li
                className="space-y-3 rounded-md border bg-muted/30 p-3"
                key={item.id}
              >
                <div className="flex items-center gap-1">
                  {item.source.type === "file" ? (
                    kinds.length === 1 ? (
                      <FileKindIcon
                        className="size-4 shrink-0 text-muted-foreground"
                        kind={kinds[0]}
                      />
                    ) : (
                      <FileIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    )
                  ) : (
                    <Link2
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground text-xs">
                    {title}
                  </span>
                  <Button
                    aria-label={`Move ${title} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="size-7"
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    aria-label={`Move ${title} down`}
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                    className="size-7"
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    aria-label={`Remove ${title}`}
                    onClick={() =>
                      onChange(items.filter((_, i) => i !== index))
                    }
                    className="size-7"
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </div>
                {renderItem?.(item, (patch) => update(index, patch))}
              </li>
            );
          })}
        </ol>
      )}

      {full ? (
        <p className="text-muted-foreground text-xs">
          This block holds up to {max} items.
        </p>
      ) : (
        <div className="space-y-2">
          {storageEnabled ? (
            <div className="flex flex-wrap items-start gap-2">
              <UploadButton
                kinds={kinds}
                multiple={room > 1}
                onUploaded={addFiles}
                size="sm"
              >
                Upload{" "}
                {kinds.length === 1
                  ? FILE_KIND_LABELS[kinds[0]].toLowerCase()
                  : "files"}
              </UploadButton>
              <LibraryButton
                kind={kinds.length === 1 ? kinds[0] : undefined}
                multiple={room > 1}
                onSelect={(files) =>
                  addFiles(files.filter((file) => kinds.includes(file.kind)))
                }
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              {STORAGE_OFF_MESSAGE} Add files by link instead.
            </p>
          )}
          <CloudFileButton
            onPick={(url) => add([createItem({ type: "url", url })])}
          />
          <LinkInput
            buttonLabel="Add link"
            onSubmit={(url) => add([createItem({ type: "url", url })])}
            placeholder={linkPlaceholder}
          />
        </div>
      )}
    </div>
  );
}
