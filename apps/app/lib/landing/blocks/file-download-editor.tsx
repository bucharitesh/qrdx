"use client";

import { newItemId } from "@/components/landing/block-kit";
import { TextField } from "@/components/landing/editor/fields";
import { SourceListEditor } from "@/lib/files/components/source-list-editor";
import { FILE_KINDS } from "@/lib/files/types";
import type { BlockEditorProps } from "../registry";
import {
  type DownloadItem,
  type FileDownloadBlockProps,
  MAX_DOWNLOADS,
} from "./file-download";

export function FileDownloadEditor({
  value,
  onChange,
  context,
}: BlockEditorProps<FileDownloadBlockProps>) {
  const set = (patch: Partial<FileDownloadBlockProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        maxLength={120}
        onChange={(title) => set({ title })}
        placeholder="Optional, e.g. Downloads"
        value={value.title}
      />
      <TextField
        label="Description"
        maxLength={500}
        multiline
        onChange={(description) => set({ description })}
        placeholder="Optional"
        rows={2}
        value={value.description}
      />
      <div className="space-y-1.5">
        <p className="font-medium text-xs">Files</p>
        <SourceListEditor<DownloadItem>
          createItem={(source, file) => ({
            id: newItemId(),
            source,
            label: "",
            ...(file && { kind: file.kind }),
          })}
          itemTitle={(item) => item.label}
          items={value.files}
          kinds={FILE_KINDS}
          linkPlaceholder="https://example.com/brochure.pdf"
          max={MAX_DOWNLOADS}
          onChange={(files) => set({ files })}
          renderItem={(item, update) => (
            <TextField
              label="Label"
              maxLength={120}
              onChange={(label) => update({ label })}
              placeholder="Defaults to the file name"
              value={item.label}
            />
          )}
          storageEnabled={context.storageEnabled}
        />
      </div>
    </div>
  );
}
