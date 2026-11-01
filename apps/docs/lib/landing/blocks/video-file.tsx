import { VideoHorizontal as Film } from "iconsax-reactjs";
import { z } from "zod";
import { lineText, longText } from "@/components/landing/block-kit";
import { BlockHeading, PreviewPlaceholder } from "@/lib/files/block-ui";
import { fileSourceSchema, sourceUrl } from "@/lib/files/source";
import { type BlockRenderProps, registerBlock } from "../registry";
import { VideoFileEditor } from "./video-file-editor";
import { VideoFilePlayer } from "./video-file-player";

/** An uploaded (or directly linked) MP4/WebM/MOV video; YouTube, Vimeo and Loom use the "video-embed" block. */
export const videoFileBlockSchema = z.object({
  source: fileSourceSchema.nullable().default(null),
  /** Still image shown before playback */
  poster: fileSourceSchema.nullable().default(null),
  title: lineText(120).default(""),
  description: longText(500).default(""),
  aspect: z.enum(["landscape", "portrait", "square"]).default("landscape"),
  /** Starts muted and loops, like a GIF (browsers only autoplay muted video) */
  autoplay: z.boolean().default(false),
});

export type VideoFileBlockProps = z.output<typeof videoFileBlockSchema>;

function VideoFileBlock({
  id,
  props,
  context,
}: BlockRenderProps<VideoFileBlockProps>) {
  const src = sourceUrl(props.source, context);
  if (!src) {
    return context.mode === "preview" ? (
      <PreviewPlaceholder icon={<Film className="size-6" />}>
        Upload a video to play here
      </PreviewPlaceholder>
    ) : null;
  }
  return (
    <section aria-label={props.title || "Video"} className="space-y-3">
      <BlockHeading
        description={props.description}
        preview={context.thumbnail}
        title={props.title}
      />
      <VideoFilePlayer
        aspect={props.aspect}
        autoplay={props.autoplay}
        blockId={id}
        poster={sourceUrl(props.poster, context)}
        src={src}
        title={props.title || "Video"}
      />
    </section>
  );
}

export const videoFileBlock = registerBlock({
  type: "video-file",
  category: "media",
  label: "Video file",
  description: "An MP4 or WebM video you upload",
  icon: Film,
  schema: videoFileBlockSchema,
  defaults: {},
  Render: VideoFileBlock,
  Editor: VideoFileEditor,
});
