import { cn } from "@repo/design-system/lib/utils";
import type { CSSProperties, ReactNode } from "react";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { EASE_CLASS } from "@/components/mockups/motion";
import { PresetLink } from "@/components/playground/preset-link";
import {
  GALLERY_CHECKER,
  galleryImage,
  TILE_ASPECT,
  tileBackdrop,
  type WallTile,
} from "@/lib/landing/showcase-gallery";
import type { WallPlacement, WallRow } from "@/lib/landing/showcase-wall";
import { WALL_GAP } from "./wall-placeholder";

// The "Made with QRdx" wall: justified rows of real codes, each a lazy
// <img> of an SVG the engine drew at build time (app/gallery/[file]/route.ts)
// on a backdrop from its own palette. A server component with no client
// script: rows justify with flex-grow in proportion to each tile's aspect
// ratio, and every tile has a fixed aspect-ratio box, so nothing is measured
// and nothing shifts when the images load. The page frame stays monochrome;
// the codes carry the color.

const GAP = WALL_GAP;

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

/**
 * A tile is a box with two separate links, never one inside the other: the
 * code itself (covering the tile) opens the playground with it, and the
 * name in its chip opens the page about it (`tile.about`), a plain link in
 * the server-rendered HTML.
 */
const TILE_BOX = cn(
  "group/tile relative block min-w-0 overflow-hidden rounded-2xl",
  "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring",
);

const TILE_LINK = "absolute inset-0 block rounded-[inherit] outline-none";

function TileLink({ tile, children }: { tile: WallTile; children: ReactNode }) {
  // No prefetch: dozens of links to the playground and the demos.
  return tile.appliesPreset ? (
    <PresetLink preset={tile.preset} prefetch={false} className={TILE_LINK}>
      {children}
    </PresetLink>
  ) : (
    <Link href={tile.href} prefetch={false} className={TILE_LINK}>
      {children}
    </Link>
  );
}

/** The tile's name in its chip: a link to the page about it, when it has one. */
function TileName({ tile }: { tile: WallTile }) {
  const name = "truncate font-medium text-foreground";
  if (!tile.about) return <span className={name}>{tile.label}</span>;
  return (
    <Link
      href={tile.about.href}
      prefetch={false}
      aria-label={`${tile.label} ${tile.about.label}`}
      // Clickable only while the chip shows, so a tap on the code never
      // lands on it unseen.
      className={cn(
        name,
        "pointer-events-none underline underline-offset-2 decoration-foreground/30 outline-none hover:decoration-foreground focus-visible:decoration-foreground group-hover/tile:pointer-events-auto group-focus-within/tile:pointer-events-auto",
      )}
    >
      {tile.label}
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
  const style: CSSProperties = {
    flex: `${ratio} 1 0%`,
    aspectRatio: String(ratio),
  };
  return (
    <div
      className={cn(TILE_BOX, !placement.compact && "max-lg:hidden")}
      data-wall-tile={tile.id}
      style={style}
    >
      <TileLink tile={tile}>
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
            "absolute inset-0 flex items-center justify-center transition-transform duration-500 group-hover/tile:scale-[1.04] group-focus-within/tile:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover/tile:scale-100 motion-reduce:group-focus-within/tile:scale-100",
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
      </TileLink>
      <span className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-col rounded-md bg-background/90 px-2 py-1 text-[11px] leading-snug opacity-0 shadow-xs backdrop-blur-sm transition-opacity duration-200 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 motion-reduce:transition-none">
        <TileName tile={tile} />
        <span className="truncate text-muted-foreground">{tile.detail}</span>
      </span>
    </div>
  );
}

/**
 * Fades a row out into the page (a mask, so it works on any background).
 * Written out in full for each breakpoint so Tailwind sees the classes.
 */
const FADE = "[mask-image:linear-gradient(to_bottom,#000_8%,transparent_96%)]";
const FADE_LG =
  "lg:[mask-image:linear-gradient(to_bottom,#000_8%,transparent_96%)]";

/**
 * Rows of tiles. From `lg` up each row's two halves join into one row
 * (`lg:contents`); below it each half is a row. Rows marked not compact
 * show from `lg` only. With `fade`, only the last row seen fades out: the
 * last row from `lg` up, and below it the second half of the last compact
 * row (a `contents` box from `lg` up, so its mask can't apply there).
 */
export function ShowcaseWall({
  rows,
  fade = false,
  className,
}: {
  rows: WallRow[];
  fade?: boolean;
  className?: string;
}) {
  const lastCompact = rows.reduce(
    (last, row, index) => (row.compact ? index : last),
    -1,
  );
  return (
    <div className={cn("flex flex-col", GAP, className)}>
      {rows.map((row, index) => (
        <div
          key={row.halves.flat()[0]?.tile.id}
          className={cn(
            "flex flex-col lg:flex-row",
            GAP,
            !row.compact && "max-lg:hidden",
            fade && index === rows.length - 1 && FADE_LG,
          )}
        >
          {row.halves.map((half, side) => (
            <div
              key={half[0]?.tile.id}
              className={cn(
                "flex lg:contents",
                GAP,
                fade &&
                  index === lastCompact &&
                  side === row.halves.length - 1 &&
                  FADE,
              )}
            >
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
