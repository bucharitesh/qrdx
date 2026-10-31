"use client";

import { SwitchField, TextField } from "@/components/landing/editor/fields";
import { FileSourceField } from "@/lib/files/components/file-source-field";
import type { BlockEditorProps } from "../registry";
import type { PdfBlockProps } from "./pdf";

export function PdfEditor({
  value,
  onChange,
  context,
}: BlockEditorProps<PdfBlockProps>) {
  const set = (patch: Partial<PdfBlockProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <FileSourceField
        kind="pdf"
        label="PDF"
        linkPlaceholder="https://example.com/menu.pdf"
        onChange={(source) => set({ source })}
        storageEnabled={context.storageEnabled}
        value={value.source}
      />
      <TextField
        label="Title"
        maxLength={120}
        onChange={(title) => set({ title })}
        placeholder="Optional, e.g. Our menu"
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
      <TextField
        label="Button text"
        maxLength={40}
        onChange={(openLabel) => set({ openLabel })}
        placeholder="Open PDF"
        value={value.openLabel}
      />
      <SwitchField
        checked={value.inline}
        hint="Shown on tablets and computers. Phones open the PDF full screen."
        label="Show the PDF on the page"
        onChange={(inline) => set({ inline })}
      />
      <SwitchField
        checked={value.allowDownload}
        label="Download button"
        onChange={(allowDownload) => set({ allowDownload })}
      />
    </div>
  );
}
