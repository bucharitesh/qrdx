"use client";

import {
  ChoiceField,
  SwitchField,
  TextField,
} from "@/components/landing/editor/fields";
import { parseVideoUrl } from "@/components/landing/video";
import { FileSourceField } from "@/lib/files/components/file-source-field";
import type { BlockEditorProps } from "../registry";
import type { VideoFileBlockProps } from "./video-file";

const rejectStreamingLinks = (url: string) =>
  parseVideoUrl(url)
    ? "That's a video page, not a video file. Use the Video block for YouTube, Vimeo or Loom."
    : null;

export function VideoFileEditor({
  value,
  onChange,
  context,
}: BlockEditorProps<VideoFileBlockProps>) {
  const set = (patch: Partial<VideoFileBlockProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <FileSourceField
        kind="video"
        label="Video"
        linkHint="Uploads play everywhere as MP4 (H.264). For YouTube, Vimeo or Loom, use the Video block."
        linkPlaceholder="https://example.com/clip.mp4"
        onChange={(source) => set({ source })}
        storageEnabled={context.storageEnabled}
        validateLink={rejectStreamingLinks}
        value={value.source}
      />
      <FileSourceField
        kind="image"
        label="Poster image"
        linkPlaceholder="https://example.com/poster.jpg"
        onChange={(poster) => set({ poster })}
        storageEnabled={context.storageEnabled}
        value={value.poster}
      />
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
      <SwitchField
        checked={value.autoplay}
        hint="Plays muted on a loop as soon as the page opens."
        label="Autoplay"
        onChange={(autoplay) => set({ autoplay })}
      />
    </div>
  );
}
