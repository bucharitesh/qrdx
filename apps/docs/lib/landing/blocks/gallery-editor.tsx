"use client";

import { newItemId } from "@/components/landing/block-kit";
import { ChoiceField, TextField } from "@/components/landing/editor/fields";
import { SourceListEditor } from "@/lib/files/components/source-list-editor";
import type { BlockEditorProps } from "../registry";
import {
  type GalleryBlockProps,
  type GalleryImage,
  MAX_GALLERY_IMAGES,
} from "./gallery";

export function GalleryEditor({
  value,
  onChange,
  context,
}: BlockEditorProps<GalleryBlockProps>) {
  const set = (patch: Partial<GalleryBlockProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        maxLength={120}
        onChange={(title) => set({ title })}
        placeholder="Optional"
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
        <p className="font-medium text-xs">Photos</p>
        <SourceListEditor<GalleryImage>
          createItem={(source) => ({
            id: newItemId(),
            source,
            alt: "",
            caption: "",
          })}
          itemTitle={(image) => image.alt}
          items={value.images}
          kinds={["image"]}
          linkPlaceholder="https://example.com/photo.jpg"
          max={MAX_GALLERY_IMAGES}
          onChange={(images) => set({ images })}
          renderItem={(image, update) => (
            <div className="grid gap-3">
              <TextField
                hint="Describe the photo for people using screen readers."
                label="Alt text"
                maxLength={200}
                onChange={(alt) => update({ alt })}
                value={image.alt}
              />
              <TextField
                label="Caption"
                maxLength={200}
                onChange={(caption) => update({ caption })}
                placeholder="Optional, shown full screen"
                value={image.caption}
              />
            </div>
          )}
          storageEnabled={context.storageEnabled}
        />
      </div>
      <ChoiceField
        label="Columns"
        onChange={(columns) => set({ columns })}
        options={[
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
        ]}
        value={value.columns}
      />
      <ChoiceField
        label="Shape"
        onChange={(shape) => set({ shape })}
        options={[
          { value: "square", label: "Square tiles" },
          { value: "original", label: "Original" },
        ]}
        value={value.shape}
      />
    </div>
  );
}
