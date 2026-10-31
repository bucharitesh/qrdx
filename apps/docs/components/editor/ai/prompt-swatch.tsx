import { cn } from "@repo/design-system/lib/utils";
import type { PromptSwatch as Swatch } from "@/utils/ai/prompts";

// Five modules of a tiny code, in the look the prompt asks for.
const CELLS = [
  [0, 0],
  [2, 0],
  [1, 1],
  [0, 2],
  [2, 2],
] as const;

/** A suggestion's look at a glance: its colours and module shape. */
export function PromptSwatch({
  swatch,
  className,
}: {
  swatch: Swatch;
  className?: string;
}) {
  const { fg, bg, accent = fg, shape } = swatch;
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0 rounded-[5px] ring-1 ring-foreground/15",
        className,
      )}
      viewBox="0 0 16 16"
    >
      <rect fill={bg} height="16" width="16" />
      {CELLS.map(([x, y], i) => {
        const fill = i === 2 ? accent : fg;
        const cx = 3 + x * 5;
        const cy = 3 + y * 5;
        return shape === "dot" ? (
          <circle cx={cx} cy={cy} fill={fill} key={`${x}${y}`} r="2" />
        ) : (
          <rect
            fill={fill}
            height="4"
            key={`${x}${y}`}
            rx={shape === "rounded" ? 1.4 : 0}
            width="4"
            x={cx - 2}
            y={cy - 2}
          />
        );
      })}
    </svg>
  );
}
