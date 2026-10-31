import { cn } from "@repo/design-system/lib/utils";
import { ImageIcon } from "lucide-react";
import { z } from "zod";
import {
  imageSchema,
  lineText,
  linkProps,
  linkUrlSchema,
  mutedTextClass,
} from "@/components/landing/block-kit";
import { type BlockRenderProps, registerBlock } from "../registry";
import { ImageEditor } from "./image-editor";

export const imageBlockSchema = z.object({
  image: imageSchema.optional(),
  caption: lineText(200).default(""),
  link: z.union([linkUrlSchema, z.literal("")]).default(""),
  aspect: z.enum(["auto", "square", "landscape", "portrait"]).default("auto"),
  rounded: z.boolean().default(true),
});

export type ImageBlockProps = z.output<typeof imageBlockSchema>;

const ASPECTS = {
  auto: "",
  square: "aspect-square object-cover",
  landscape: "aspect-video object-cover",
  portrait: "aspect-[4/5] object-cover",
} as const;

function ImageBlock({ id, props, context }: BlockRenderProps<ImageBlockProps>) {
  if (!props.image) {
    return context.mode === "preview" ? (
      <div
        className={cn(
          "flex aspect-video items-center justify-center rounded-(--lp-radius) border-2 border-dashed border-current text-sm opacity-40",
        )}
      >
        Add an image link
      </div>
    ) : null;
  }
  const img = (
    <img
      alt={props.image.alt}
      className={cn(
        "h-auto w-full",
        ASPECTS[props.aspect],
        props.rounded && "rounded-(--lp-radius)",
      )}
      decoding="async"
      loading="lazy"
      src={props.image.url}
    />
  );
  return (
    <figure className="space-y-2">
      {props.link ? (
        <a className="block" {...linkProps(props.link, id)}>
          {img}
        </a>
      ) : (
        img
      )}
      {props.caption && (
        <figcaption className={cn("text-center text-sm", mutedTextClass)}>
          {props.caption}
        </figcaption>
      )}
    </figure>
  );
}

export const imageBlock = registerBlock({
  type: "image",
  category: "media",
  label: "Image",
  description: "A photo, poster or banner",
  icon: ImageIcon,
  schema: imageBlockSchema,
  defaults: {},
  Render: ImageBlock,
  Editor: ImageEditor,
});
