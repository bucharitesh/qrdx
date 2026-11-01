import type { ComponentPropsWithoutRef } from "react";

/**
 * A heading in hosted-page content. In scaled-down previews (template
 * gallery and picker: `BlockRenderContext.thumbnail`) it's a div with the
 * same classes, so a page full of previews keeps one heading outline of its
 * own. `data-lp-heading` keeps the theme's heading font on it (render.tsx).
 */
export function LpHeading({
  as: Tag,
  preview = false,
  ...props
}: ComponentPropsWithoutRef<"h2"> & {
  as: "h1" | "h2" | "h3";
  /** `context.thumbnail`: render a div instead of a heading. */
  preview?: boolean;
}) {
  return preview ? <div data-lp-heading="" {...props} /> : <Tag {...props} />;
}
