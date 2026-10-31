"use client";

import { newItemId } from "@/components/landing/block-kit";
import { SwitchField, TextField } from "@/components/landing/editor/fields";
import { FileSourceField } from "@/lib/files/components/file-source-field";
import { SourceListEditor } from "@/lib/files/components/source-list-editor";
import type { BlockEditorProps } from "../registry";
import {
  type AudioBlockProps,
  type AudioTrack,
  MAX_AUDIO_TRACKS,
} from "./audio";

const titleFromFilename = (name: string) =>
  name
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .slice(0, 120);

export function AudioEditor({
  value,
  onChange,
  context,
}: BlockEditorProps<AudioBlockProps>) {
  const set = (patch: Partial<AudioBlockProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        maxLength={120}
        onChange={(title) => set({ title })}
        placeholder="Optional, e.g. New EP"
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
      <FileSourceField
        kind="image"
        label="Cover image"
        linkPlaceholder="https://example.com/cover.jpg"
        onChange={(cover) => set({ cover })}
        storageEnabled={context.storageEnabled}
        value={value.cover}
      />
      <div className="space-y-1.5">
        <p className="font-medium text-xs">Tracks</p>
        <SourceListEditor<AudioTrack>
          createItem={(source, file) => ({
            id: newItemId(),
            source,
            title: file ? titleFromFilename(file.filename) : "",
            artist: "",
          })}
          itemTitle={(track) => track.title}
          items={value.tracks}
          kinds={["audio"]}
          linkPlaceholder="https://example.com/episode.mp3"
          max={MAX_AUDIO_TRACKS}
          onChange={(tracks) => set({ tracks })}
          renderItem={(track, update) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Track title"
                maxLength={120}
                onChange={(title) => update({ title })}
                value={track.title}
              />
              <TextField
                label="Artist"
                maxLength={120}
                onChange={(artist) => update({ artist })}
                placeholder="Optional"
                value={track.artist}
              />
            </div>
          )}
          storageEnabled={context.storageEnabled}
        />
      </div>
      <SwitchField
        checked={value.allowDownload}
        label="Download button"
        onChange={(allowDownload) => set({ allowDownload })}
      />
    </div>
  );
}
