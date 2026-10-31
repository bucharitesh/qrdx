"use client";

import {
  ChoiceField,
  TextField,
  UrlField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { VideoEmbedProps } from "./video-embed";

export function VideoEmbedEditor({
  value,
  onChange,
}: BlockEditorProps<VideoEmbedProps>) {
  const set = (patch: Partial<VideoEmbedProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <UrlField
        hint="Paste the link from YouTube, Vimeo or Loom. The video loads only when a visitor taps play."
        label="Video link"
        onChange={(url) => set({ url })}
        placeholder="https://youtu.be/..."
        value={value.url}
      />
      <TextField
        label="Title"
        maxLength={120}
        onChange={(title) => set({ title })}
        placeholder="Optional"
        value={value.title}
      />
      <ChoiceField
        label="Shape"
        onChange={(aspect) => set({ aspect })}
        options={[
          { value: "landscape", label: "16:9" },
          { value: "portrait", label: "9:16" },
          { value: "square", label: "1:1" },
        ]}
        value={value.aspect}
      />
    </div>
  );
}
