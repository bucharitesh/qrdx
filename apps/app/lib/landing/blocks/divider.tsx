import { cn } from "@repo/design-system/lib/utils";
import { Minus } from "iconsax-reactjs";
import { z } from "zod";
import { lineText } from "@/components/landing/block-kit";
import { type BlockRenderProps, registerBlock } from "../registry";
import { DividerEditor } from "./divider-editor";

export const dividerSchema = z.object({
  /** "ornament": two short rules around a small diamond (or the label) */
  style: z.enum(["solid", "dashed", "dotted", "ornament"]).default("solid"),
  /** Optional text in the middle of the line */
  label: lineText(40).default(""),
});

export type DividerProps = z.output<typeof dividerSchema>;

function Ornament({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-2 opacity-60">
      <span className="h-px w-12 bg-current opacity-50" />
      {label ? (
        <span className="text-xs font-medium tracking-[0.2em] uppercase">
          {label}
        </span>
      ) : (
        <span aria-hidden="true" className="size-1.5 rotate-45 bg-current" />
      )}
      <span className="h-px w-12 bg-current opacity-50" />
    </div>
  );
}

function DividerBlock({ props }: BlockRenderProps<DividerProps>) {
  if (props.style === "ornament") return <Ornament label={props.label} />;
  const line = cn(
    "flex-1 border-t border-current opacity-20",
    props.style === "dashed" && "border-dashed",
    props.style === "dotted" && "border-dotted border-t-2",
  );
  if (!props.label) return <hr className={cn(line, "my-1")} />;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className={line} />
      <span className="text-xs font-medium tracking-wide uppercase opacity-60">
        {props.label}
      </span>
      <span className={line} />
    </div>
  );
}

export const dividerBlock = registerBlock({
  type: "divider",
  category: "layout",
  label: "Divider",
  description: "A line between sections",
  icon: Minus,
  schema: dividerSchema,
  defaults: {},
  Render: DividerBlock,
  Editor: DividerEditor,
});
