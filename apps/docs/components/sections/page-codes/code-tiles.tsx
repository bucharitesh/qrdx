import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { EASE_CLASS } from "@/components/mockups/motion";
import {
  codeStyles,
  frameName,
  type PageCode,
  pageCodeImage,
  themeName,
} from "@/lib/landing/page-codes";
import { playgroundDesignHref } from "@/lib/playground-style";
import { getQrType } from "@/lib/qr-types-content";

// Sample codes on the generator, industry and placement pages
// (lib/landing/page-codes): real codes in built-in themes, drawn at build
// time (app/sample-codes/[file]) and loaded as lazy <img>s in a fixed
// square, so they cost the first paint nothing and never shift the layout.
// The tiles stay monochrome; the codes carry the color.

export interface CodeTileItem {
  code: PageCode;
  /** Tile name; the code's own label by default. */
  label?: string;
  /** Where the tile goes; the playground with this design by default. */
  href?: string;
}

/**
 * The playground with this code's design and content type, its form filled
 * with QRdx's generic sample for the type (lib/playground-samples.ts), never
 * the code's own content. A theme as it ships travels as `preset`; a theme
 * with a frame added travels as `style`, which carries the frame too.
 */
export function codePlaygroundHref(code: PageCode): string {
  return playgroundDesignHref({
    type: code.type,
    sample: true,
    preset: code.preset,
    design: code.frame === undefined ? undefined : codeStyles(code),
  });
}

/** "Wi-Fi QR code, Harbor theme with a Rounded frame". */
export function codeAlt(code: PageCode): string {
  const type = getQrType(code.type)?.name ?? "QR";
  const frame = frameName(code);
  return `${type} QR code, ${themeName(code)} theme${frame ? ` with a ${frame} frame` : ""}`;
}

const TILE_LINK =
  "group block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

function CodeTile({
  item,
  heading,
  compact,
}: {
  item: CodeTileItem;
  heading: boolean;
  compact: boolean;
}) {
  const { code } = item;
  const image = pageCodeImage(code);
  const label = item.label ?? code.label;
  const frame = frameName(code);
  const Label = heading ? "h3" : "p";
  return (
    // No prefetch: a page of links to the playground bundle.
    <Link
      href={item.href ?? codePlaygroundHref(code)}
      prefetch={false}
      className={TILE_LINK}
    >
      <Card className="h-full gap-0 py-0 transition-colors duration-200 group-hover:border-foreground/15">
        <div className="p-1.5 pb-0">
          <div className="relative aspect-square overflow-hidden rounded-[14px] bg-muted/60 dark:bg-muted/50">
            <img
              src={image.src}
              alt={codeAlt(code)}
              width={image.width}
              height={image.height}
              loading="lazy"
              decoding="async"
              className={cn(
                "absolute object-contain transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
                EASE_CLASS,
                compact ? "inset-[8%] size-[84%]" : "inset-[12%] size-[76%]",
                !image.framed && "rounded-[6px]",
              )}
            />
          </div>
        </div>
        <div
          className={cn(
            "flex min-w-0 flex-col gap-0.5 text-left",
            compact ? "px-2.5 pt-2 pb-2.5" : "px-3 pt-2.5 pb-3",
          )}
        >
          {/* Names and themes wrap instead of being cut; a row's tiles
              share its height, so a two-line name never makes them uneven. */}
          <Label className="text-sm font-medium tracking-tight text-pretty break-words text-foreground">
            {label}
          </Label>
          <p className="text-xs text-pretty break-words text-muted-foreground">
            {themeName(code)}
            {frame && !compact ? ` · ${frame}` : ""}
          </p>
        </div>
      </Card>
    </Link>
  );
}

/**
 * A row of sample codes. `heading`: tile names are h3s (inside a section
 * with an h2). `compact`: smaller captions with the theme only, for the
 * six-across hub rows.
 */
export function CodeTiles({
  items,
  label,
  heading = false,
  compact = false,
  className,
}: {
  items: CodeTileItem[];
  /** Accessible name of the list. */
  label: string;
  heading?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <ul aria-label={label} className={cn("grid w-full gap-3", className)}>
      {items.map((item) => (
        <li key={item.code.id} className="min-w-0">
          <CodeTile item={item} heading={heading} compact={compact} />
        </li>
      ))}
    </ul>
  );
}
