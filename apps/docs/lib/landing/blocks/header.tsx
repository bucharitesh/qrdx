import { cn } from "@repo/design-system/lib/utils";
import { Profile as UserRound } from "iconsax-reactjs";
import { z } from "zod";
import {
  alignSchema,
  imageSchema,
  lineText,
  longText,
  mutedTextClass,
} from "@/components/landing/block-kit";
import { type BlockRenderProps, registerBlock } from "../registry";
import { HeaderEditor } from "./header-editor";

export const headerSchema = z.object({
  title: lineText(80).default(""),
  subtitle: longText(300).default(""),
  avatar: imageSchema.optional(),
  avatarShape: z.enum(["circle", "rounded", "square"]).default("circle"),
  cover: imageSchema.optional(),
  align: alignSchema,
});

export type HeaderProps = z.output<typeof headerSchema>;

const SHAPES = {
  circle: "rounded-full",
  rounded: "rounded-(--lp-radius)",
  square: "rounded-none",
} as const;

function HeaderBlock({ props }: BlockRenderProps<HeaderProps>) {
  const centered = props.align === "center";
  return (
    <header
      className={cn(
        "flex flex-col gap-3",
        centered ? "items-center text-center" : "items-start text-left",
      )}
    >
      {props.cover && (
        <img
          alt={props.cover.alt}
          className="aspect-[3/1] w-full rounded-(--lp-radius) object-cover"
          decoding="async"
          src={props.cover.url}
        />
      )}
      {props.avatar && (
        <img
          alt={props.avatar.alt}
          className={cn(
            "size-24 object-cover shadow-sm ring-4 ring-(--lp-bg)",
            SHAPES[props.avatarShape],
            props.cover && "-mt-14",
          )}
          decoding="async"
          height={96}
          src={props.avatar.url}
          width={96}
        />
      )}
      {(props.title || props.subtitle) && (
        <div className="space-y-1.5">
          {props.title && (
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance">
              {props.title}
            </h1>
          )}
          {props.subtitle && (
            <p
              className={cn(
                "text-[15px] leading-relaxed whitespace-pre-line",
                mutedTextClass,
              )}
            >
              {props.subtitle}
            </p>
          )}
        </div>
      )}
    </header>
  );
}

export const headerBlock = registerBlock({
  type: "header",
  category: "content",
  label: "Profile header",
  description: "Photo or logo, name and a short bio",
  icon: UserRound,
  schema: headerSchema,
  defaults: { title: "Your name", subtitle: "A line about who you are" },
  Render: HeaderBlock,
  Editor: HeaderEditor,
});
