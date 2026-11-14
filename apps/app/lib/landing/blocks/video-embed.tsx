import { VideoSquare as Clapperboard } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { lineText } from "@/components/landing/block-kit";
import {
  parseVideoUrl,
  VIDEO_PROVIDER_LABELS,
  videoEmbedUrl,
} from "@/components/landing/video";
import { VideoFacade } from "@/components/landing/video-facade";
import { landingUrlSchema } from "@/types/landing";
import { type BlockRenderProps, registerBlock } from "../registry";
import { VideoEmbedEditor } from "./video-embed-editor";

export const videoEmbedSchema = z.object({
  url: landingUrlSchema.refine(
    (value) => parseVideoUrl(value) !== null,
    "Use a YouTube, Vimeo or Loom video link",
  ),
  title: lineText(120).default(""),
  aspect: z.enum(["landscape", "portrait", "square"]).default("landscape"),
});

export type VideoEmbedProps = z.output<typeof videoEmbedSchema>;

const ASPECTS = {
  landscape: "aspect-video",
  portrait: "aspect-[9/16]",
  square: "aspect-square",
} as const;

function VideoEmbedBlock({ id, props }: BlockRenderProps<VideoEmbedProps>) {
  const t = useTranslations("scanPages.hosted.media");
  const video = parseVideoUrl(props.url);
  if (!video) return null;
  return (
    <VideoFacade
      aspect={ASPECTS[props.aspect]}
      blockId={id}
      embedUrl={videoEmbedUrl(video)}
      providerLabel={VIDEO_PROVIDER_LABELS[video.provider]}
      text={{
        providerVideo: t.raw("providerVideo") as string,
        playVideo: t("playVideo"),
        playVideoTitle: t.raw("playVideoTitle") as string,
        playsFrom: t.raw("playsFrom") as string,
      }}
      title={props.title}
    />
  );
}

export const videoEmbedBlock = registerBlock({
  type: "video-embed",
  category: "media",
  label: "Video",
  description: "A YouTube, Vimeo or Loom video",
  icon: Clapperboard,
  schema: videoEmbedSchema,
  defaults: { url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" },
  Render: VideoEmbedBlock,
  Editor: VideoEmbedEditor,
});
