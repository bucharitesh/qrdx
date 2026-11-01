import { Music } from "iconsax-reactjs";
import { z } from "zod";
import {
  itemIdSchema,
  lineText,
  longText,
} from "@/components/landing/block-kit";
import { BlockHeading, PreviewPlaceholder } from "@/lib/files/block-ui";
import { fileSourceSchema, sourceName, sourceUrl } from "@/lib/files/source";
import { type BlockRenderProps, registerBlock } from "../registry";
import { AudioEditor } from "./audio-editor";
import { AudioPlaylist } from "./audio-player";

export const MAX_AUDIO_TRACKS = 50;

export const audioTrackSchema = z.object({
  id: itemIdSchema,
  source: fileSourceSchema,
  title: lineText(120).default(""),
  artist: lineText(120).default(""),
});

export const audioBlockSchema = z.object({
  title: lineText(120).default(""),
  description: longText(500).default(""),
  /** Cover art (image) */
  cover: fileSourceSchema.nullable().default(null),
  tracks: z.array(audioTrackSchema).max(MAX_AUDIO_TRACKS).default([]),
  allowDownload: z.boolean().default(false),
});

export type AudioBlockProps = z.output<typeof audioBlockSchema>;
export type AudioTrack = AudioBlockProps["tracks"][number];

const withoutExtension = (name: string) =>
  name.replace(/\.[a-z0-9]{2,4}$/i, "");

function AudioBlock({ id, props, context }: BlockRenderProps<AudioBlockProps>) {
  const tracks = props.tracks.flatMap((track) => {
    const src = sourceUrl(track.source, context);
    if (!src) return [];
    return [
      {
        id: track.id,
        src,
        downloadSrc:
          track.source.type === "file"
            ? (sourceUrl(track.source, context, { download: true }) ?? src)
            : src,
        title:
          track.title ||
          withoutExtension(sourceName(track.source)) ||
          "Untitled",
        artist: track.artist,
      },
    ];
  });
  if (tracks.length === 0) {
    return context.mode === "preview" ? (
      <PreviewPlaceholder icon={<Music className="size-6" />}>
        Add audio tracks to play here
      </PreviewPlaceholder>
    ) : null;
  }
  return (
    <section aria-label={props.title || "Audio"} className="space-y-3">
      <BlockHeading
        description={props.description}
        preview={context.thumbnail}
        title={props.title}
      />
      <AudioPlaylist
        allowDownload={props.allowDownload}
        blockId={id}
        cover={sourceUrl(props.cover, context)}
        coverAlt={props.title}
        tracks={tracks}
      />
    </section>
  );
}

export const audioBlock = registerBlock({
  type: "audio",
  category: "media",
  label: "Audio",
  description: "Music, a podcast or a voice message, with a playlist",
  icon: Music,
  schema: audioBlockSchema,
  defaults: {},
  Render: AudioBlock,
  Editor: AudioEditor,
});
