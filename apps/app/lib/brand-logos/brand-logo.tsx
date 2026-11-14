// The real brand marks the UI draws, from Simple Icons (marks.generated.ts:
// only the brands the UI uses, so pages don't ship the whole catalogue).
// Works in server and client components alike: plain SVG, no hooks.
//
// Use it wherever a brand is shown (Instagram in a social list, WhatsApp on
// a share button). iconsax stays for everything that isn't a brand.

import type { ComponentType, SVGProps } from "react";
import { BRAND_MARKS, type BrandMarkSlug } from "./marks.generated";

export type { BrandMarkSlug } from "./marks.generated";

export interface BrandLogoProps extends Omit<SVGProps<SVGSVGElement>, "color"> {
  slug: BrandMarkSlug;
  /**
   * "brand" (default) draws the official color; "currentColor" follows the
   * surrounding text, for monochrome UI.
   */
  color?: "brand" | "currentColor";
  /** Width and height (CSS classes like size-4 win, as with iconsax). */
  size?: number | string;
  /**
   * Air around the mark, in 24ths of the box. Simple Icons fill the whole
   * box; 2 matches iconsax's glyph area when replacing one of its icons.
   */
  inset?: number;
  /** An accessible name; without it the mark is decorative. */
  title?: string;
}

export function BrandLogo({
  slug,
  color = "brand",
  size = 24,
  inset = 0,
  title,
  ...props
}: BrandLogoProps) {
  const mark = BRAND_MARKS[slug];
  return (
    <svg
      aria-hidden={title ? undefined : true}
      data-brand={slug}
      fill={color === "brand" ? `#${mark.hex}` : "currentColor"}
      height={size}
      role={title ? "img" : undefined}
      viewBox={`${-inset} ${-inset} ${24 + 2 * inset} ${24 + 2 * inset}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title && <title>{title}</title>}
      <path d={mark.path} />
    </svg>
  );
}

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

/**
 * A component for icon maps that hold iconsax icons (`{ whatsapp: Whatsapp }`):
 * the brand's mark in the current text color, inset like an iconsax glyph.
 * Call it at module scope, never while rendering.
 */
export function brandIcon(
  slug: BrandMarkSlug,
  options: Pick<BrandLogoProps, "color" | "inset"> = {},
): IconComponent {
  const { color = "currentColor", inset = 2 } = options;
  // biome-ignore lint/correctness/noComponentHookFactories: called at module scope for icon maps, once per brand, so each component is stable
  function Mark({ className }: { className?: string }) {
    return (
      <BrandLogo
        className={className}
        color={color}
        inset={inset}
        slug={slug}
      />
    );
  }
  Mark.displayName = `BrandIcon(${slug})`;
  return Mark;
}

/** Title, color and path of a UI mark (for SVG markup, e.g. a QR logo). */
export function brandMark(slug: BrandMarkSlug) {
  return { slug, ...BRAND_MARKS[slug] };
}
