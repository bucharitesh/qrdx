import { cn } from "@repo/design-system/lib/utils";
import { Minus } from "lucide-react";
import { z } from "zod";
import { lineText } from "@/components/landing/block-kit";
import { type BlockRenderProps, registerBlock } from "../registry";
import { DividerEditor } from "./divider-editor";

export const dividerSchema = z.object({
  style: z.enum(["solid", "dashed", "dotted"]).default("solid"),
  /** Optional text in the middle of the line */
  label: lineText(40).default(""),
});

export type DividerProps = z.output<typeof dividerSchema>;

function DividerBlock({ props }: BlockRenderProps<DividerProps>) {
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
