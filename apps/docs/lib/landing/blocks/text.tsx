import { cn } from "@repo/design-system/lib/utils";
import { Text as Type } from "iconsax-reactjs";
import { z } from "zod";
import { lineText, longText } from "@/components/landing/block-kit";
import { type BlockRenderProps, registerBlock } from "../registry";
import { TextEditor } from "./text-editor";

export const textSchema = z.object({
  heading: lineText(120).default(""),
  body: longText(5000).default(""),
  align: z.enum(["left", "center"]).default("left"),
  size: z.enum(["sm", "md", "lg"]).default("md"),
  /** Show on a card surface instead of the page background */
  card: z.boolean().default(false),
});

export type TextProps = z.output<typeof textSchema>;

const SIZES = {
  sm: "text-sm",
  md: "text-[15px]",
  lg: "text-lg",
} as const;

function TextBlock({ props }: BlockRenderProps<TextProps>) {
  if (!(props.heading || props.body)) return null;
  return (
    <section
      className={cn(
        "space-y-2",
        props.align === "center" && "text-center",
        props.card && "rounded-(--lp-radius) bg-(--lp-muted) p-5",
      )}
    >
      {props.heading && (
        <h2 className="text-lg leading-snug font-semibold text-balance">
          {props.heading}
        </h2>
      )}
      {props.body && (
        <p
          className={cn(
            "leading-relaxed whitespace-pre-line break-words",
            SIZES[props.size],
          )}
        >
          {props.body}
        </p>
      )}
    </section>
  );
}

export const textBlock = registerBlock({
  type: "text",
  category: "content",
  label: "Text",
  description: "A heading and a paragraph",
  icon: Type,
  schema: textSchema,
  defaults: {
    heading: "About",
    body: "Tell visitors what this page is about.",
  },
  Render: TextBlock,
  Editor: TextEditor,
});
