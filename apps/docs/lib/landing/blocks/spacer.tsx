import { MoveVertical } from "lucide-react";
import { z } from "zod";
import { type BlockRenderProps, registerBlock } from "../registry";
import { SpacerEditor } from "./spacer-editor";

export const spacerSchema = z.object({
  size: z.number().int().min(4).max(160).default(24),
});

export type SpacerProps = z.output<typeof spacerSchema>;

function SpacerBlock({ props }: BlockRenderProps<SpacerProps>) {
  return <div aria-hidden="true" style={{ height: props.size }} />;
}

export const spacerBlock = registerBlock({
  type: "spacer",
  category: "layout",
  label: "Spacer",
  description: "Empty space between blocks",
  icon: MoveVertical,
  schema: spacerSchema,
  defaults: {},
  Render: SpacerBlock,
  Editor: SpacerEditor,
});
