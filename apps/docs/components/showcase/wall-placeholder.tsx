import { cn } from "@repo/design-system/lib/utils";
import type { WallShapeRow } from "@/lib/landing/showcase-wall";

// The rows of a "Made with QRdx" wall without their tiles: the same flex
// rows, halves and aspect ratios as ./showcase-wall.tsx, so a chunk that
// hasn't loaded yet takes exactly the room it will
// (components/community/deferred-community.tsx). No data imports, so the
// browser gets the layout, not the gallery.

/** The gap between a wall's rows and tiles. */
export const WALL_GAP = "gap-2 lg:gap-2.5";

export function WallPlaceholder({ shape }: { shape: WallShapeRow[] }) {
  return (
    <div aria-hidden className={cn("flex flex-col", WALL_GAP)}>
      {shape.map((row, rowIndex) => (
        <div
          className={cn(
            "flex flex-col lg:flex-row",
            WALL_GAP,
            !row.compact && "max-lg:hidden",
          )}
          key={rowIndex}
        >
          {row.halves.map((half, side) => (
            <div className={cn("flex lg:contents", WALL_GAP)} key={side}>
              {half.map(([ratio, compact], index) => (
                <div
                  className={cn(
                    "bg-muted/50 min-w-0 rounded-2xl",
                    !compact && "max-lg:hidden",
                  )}
                  key={index}
                  style={{ flex: `${ratio} 1 0%`, aspectRatio: String(ratio) }}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
