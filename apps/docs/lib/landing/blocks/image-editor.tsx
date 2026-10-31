"use client";

import {
  ChoiceField,
  ImageField,
  SwitchField,
  TextField,
  UrlField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { ImageBlockProps } from "./image";

export function ImageEditor({
  value,
  onChange,
}: BlockEditorProps<ImageBlockProps>) {
  const set = (patch: Partial<ImageBlockProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <ImageField
        label="Image"
        onChange={(image) => set({ image })}
        value={value.image}
      />
      <TextField
        label="Caption"
        maxLength={200}
        onChange={(caption) => set({ caption })}
        placeholder="Optional"
        value={value.caption}
      />
      <UrlField
        allowActions
        hint="Optional: open a page when the image is tapped."
        label="Link"
        onChange={(link) => set({ link })}
        value={value.link}
      />
      <ChoiceField
        label="Shape"
        onChange={(aspect) => set({ aspect })}
        options={[
          { value: "auto", label: "Original" },
          { value: "square", label: "1:1" },
          { value: "landscape", label: "16:9" },
          { value: "portrait", label: "4:5" },
        ]}
        value={value.aspect}
      />
      <SwitchField
        checked={value.rounded}
        label="Rounded corners"
        onChange={(rounded) => set({ rounded })}
      />
    </div>
  );
}
