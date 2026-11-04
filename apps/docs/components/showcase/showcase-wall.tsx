import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { EASE_CLASS } from "@/components/mockups/motion";
import { PresetLink } from "@/components/playground/preset-link";
import {
  GALLERY_CHECKER,
  galleryImage,
  TILE_ASPECT,
  tileBackdrop,
} from "@/lib/landing/showcase-gallery";
import type { WallPlacement, WallRow } from "@/lib/landing/showcase-wall";

// The "Made with QRdx" wall: justified rows of real codes, each a lazy
// <img> of an SVG the engine drew at build time (app/gallery/[file]/route.ts)
// on a backdrop from its own palette. A server component with no client
// script: rows justify with flex-grow in proportion to each tile's aspect
// ratio, and every tile has a fixed aspect-ratio box, so nothing is measured
// and nothing shifts when the images load. The page frame stays monochrome;
// the codes carry the color.

const GAP = "gap-2 lg:gap-2.5";

/** Printer's crop marks just outside the code. */
function CropMarks() {
  const trim = 17;
  const gap = 2.5;
  const length = 6;
  const corners = [
    [trim, trim, -1, -1],
    [100 - trim, trim, 1, -1],
    [trim, 100 - trim, -1, 1],
    [100 - trim, 100 - trim, 1, 1],
  ] as const;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-0 size-full text-neutral-900/50"
    >
      {corners.map(([x, y, dx, dy]) => (
        <g key={`${x}-${y}`} stroke="currentColor" strokeWidth="0.35">
          <line x1={x + dx * gap} x2={x + dx * (gap + length)} y1={y} y2={y} />
          <line x1={x} x2={x} y1={y + dy * gap} y2={y + dy * (gap + length)} />
        </g>
      ))}
    </svg>
  );
}

const TILE_LINK = cn(
  "group/tile relative block min-w-0 overflow-hidden rounded-2xl",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
);

function TileLink({
  placement,
  style,
  children,
}: {
  placement: WallPlacement;
  style: CSSProperties;
  children: ReactNode;
}) {
  const { tile, compact } = placement;
  const className = cn(TILE_LINK, !compact && "max-lg:hidden");
  // No prefetch: dozens of links to the playground, generators and docs.
  return tile.appliesPreset ? (
    <PresetLink
      preset={tile.preset}
      prefetch={false}
      className={className}
      style={style}
    >
      {children}
    </PresetLink>
  ) : (
    <Link href={tile.href} prefetch={false} className={className} style={style}>
      {children}
    </Link>
  );
}

/** How much of the tile's height the code takes. */
function codeHeight(placement: WallPlacement, framed: boolean): string {
  const { tile, shape } = placement;
  if (tile.art) return "96%";
  if (framed) return shape === "wide" ? "78%" : "86%";
  if (shape === "wide") return "84%";
  return "92%";
}

function Tile({ placement }: { placement: WallPlacement }) {
  const { tile, shape } = placement;
  const ratio = TILE_ASPECT[shape];
  const image = galleryImage(tile);
  const backdrop = tileBackdrop(tile);
  const height = codeHeight(placement, image.framed);
  return (
    <TileLink
      placement={placement}
      style={{ flex: `${ratio} 1 0%`, aspectRatio: String(ratio) }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-[inherit] ring-1 ring-black/[0.06] ring-inset dark:ring-0"
        style={
          backdrop
            ? { backgroundColor: backdrop }
            : {
                backgroundImage: `repeating-conic-gradient(${GALLERY_CHECKER.dark} 0% 25%, ${GALLERY_CHECKER.light} 0% 50%)`,
                backgroundSize: "14px 14px",
              }
        }
      />
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-transform duration-500 group-hover/tile:scale-[1.04] group-focus-visible/tile:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover/tile:scale-100 motion-reduce:group-focus-visible/tile:scale-100",
          EASE_CLASS,
        )}
      >
        {tile.print && <CropMarks />}
        <img
          src={image.src}
          alt={tile.alt}
          width={image.width}
          height={image.height}
          loading="lazy"
          decoding="async"
          className="block w-auto max-w-[88%] object-contain"
          style={{ height }}
        />
      </span>
      <span className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-col rounded-md bg-background/90 px-2 py-1 text-[11px] leading-snug opacity-0 shadow-xs backdrop-blur-sm transition-opacity duration-200 group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100 motion-reduce:transition-none">
        <span className="truncate font-medium text-foreground">
          {tile.label}
        </span>
        <span className="truncate text-muted-foreground">{tile.detail}</span>
      </span>
    </TileLink>
  );
}

/**
 * Rows of tiles. From `lg` up each row's two halves join into one row
 * (`lg:contents`); below it each half is a row. Rows marked not compact
 * show from `lg` only.
 */
export function ShowcaseWall({
  rows,
  className,
}: {
  rows: WallRow[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", GAP, className)}>
      {rows.map((row) => (
        <div
          key={row.halves.flat()[0]?.tile.id}
          className={cn(
            "flex flex-col lg:flex-row",
            GAP,
            !row.compact && "max-lg:hidden",
          )}
        >
          {row.halves.map((half) => (
            <div key={half[0]?.tile.id} className={cn("flex lg:contents", GAP)}>
              {half.map((placement) => (
                <Tile key={placement.tile.id} placement={placement} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
