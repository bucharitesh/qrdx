import { Gallery as Images } from "iconsax-reactjs";
import { z } from "zod";
import {
  itemIdSchema,
  lineText,
  longText,
} from "@/components/landing/block-kit";
import { BlockHeading, PreviewPlaceholder } from "@/lib/files/block-ui";
import { fileSourceSchema, sourceUrl } from "@/lib/files/source";
import { type BlockRenderProps, registerBlock } from "../registry";
import { GalleryEditor } from "./gallery-editor";
import { GalleryGrid } from "./gallery-lightbox";

export const MAX_GALLERY_IMAGES = 60;

export const galleryImageSchema = z.object({
  id: itemIdSchema,
  source: fileSourceSchema,
  alt: lineText(200).default(""),
  caption: lineText(200).default(""),
});

export const galleryBlockSchema = z.object({
  title: lineText(120).default(""),
  description: longText(500).default(""),
  images: z.array(galleryImageSchema).max(MAX_GALLERY_IMAGES).default([]),
  columns: z.enum(["1", "2", "3"]).default("2"),
  /** square: cropped tiles; original: each image's own shape */
  shape: z.enum(["square", "original"]).default("square"),
});

export type GalleryBlockProps = z.output<typeof galleryBlockSchema>;
export type GalleryImage = GalleryBlockProps["images"][number];

function GalleryBlock({
  id,
  props,
  context,
}: BlockRenderProps<GalleryBlockProps>) {
  const images = props.images.flatMap((image) => {
    const src = sourceUrl(image.source, context);
    return src
      ? [{ id: image.id, src, alt: image.alt, caption: image.caption }]
      : [];
  });
  if (images.length === 0) {
    return context.mode === "preview" ? (
      <PreviewPlaceholder icon={<Images className="size-6" />}>
        Add photos to this gallery
      </PreviewPlaceholder>
    ) : null;
  }
  return (
    <section aria-label={props.title || "Photo gallery"} className="space-y-3">
      <BlockHeading description={props.description} title={props.title} />
      <GalleryGrid
        blockId={id}
        columns={Number(props.columns) as 1 | 2 | 3}
        images={images}
        shape={props.shape}
      />
    </section>
  );
}

export const galleryBlock = registerBlock({
  type: "gallery",
  category: "media",
  label: "Gallery",
  description: "A grid of photos that open full screen",
  icon: Images,
  schema: galleryBlockSchema,
  defaults: {},
  Render: GalleryBlock,
  Editor: GalleryEditor,
});
