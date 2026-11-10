import { cn } from "@repo/design-system/lib/utils";
import { NoteText } from "iconsax-reactjs";
import { mutedTextClass, surfaceClass } from "@/components/landing/block-kit";
import { LpHeading } from "@/components/landing/heading";
import { type BlockRenderProps, registerBlock } from "../registry";
import { DetailsEditor } from "./details-editor";
import { type DetailsProps, detailsSchema } from "./details-schema";

function DetailsBlock({ id, props, context }: BlockRenderProps<DetailsProps>) {
  const items = props.items.filter((item) => item.value);
  if (items.length === 0) return null;
  const titleId = `${id}-title`;
  return (
    <section
      aria-label={props.title ? undefined : "Details"}
      aria-labelledby={props.title ? titleId : undefined}
      className="space-y-3"
    >
      {props.title && (
        <LpHeading
          as="h2"
          className="text-lg font-semibold tracking-tight"
          id={titleId}
          preview={context.thumbnail}
        >
          {props.title}
        </LpHeading>
      )}
      {props.layout === "tiles" ? (
        <dl className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">
          {items.map((item) => (
            <div
              className={cn(surfaceClass, "flex flex-col gap-0.5 px-4 py-3")}
              key={item.id}
            >
              <dt className={cn(mutedTextClass, "text-xs")}>{item.label}</dt>
              <dd className="text-lg leading-snug font-semibold break-words tabular-nums">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <dl className={cn(surfaceClass, "divide-y divide-(--lp-fg)/10 px-4")}>
          {items.map((item) => (
            <div
              className="flex items-baseline justify-between gap-4 py-3 text-[15px]"
              key={item.id}
            >
              <dt className={cn(mutedTextClass, "shrink-0")}>{item.label}</dt>
              <dd className="min-w-0 text-right font-medium break-words">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export const detailsBlock = registerBlock({
  type: "details",
  category: "content",
  label: "Details",
  description: "Labels and values, as a list or a grid of tiles",
  icon: NoteText,
  schema: detailsSchema,
  defaults: {
    items: [
      { id: "detail1", label: "Size", value: "Medium" },
      { id: "detail2", label: "Color", value: "Forest green" },
    ],
  },
  Render: DetailsBlock,
  Editor: DetailsEditor,
});
