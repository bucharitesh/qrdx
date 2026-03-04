/** biome-ignore-all lint/suspicious/noArrayIndexKey: false positive */
import { cn } from "@repo/design-system/lib/utils";
import { getNormalizedColor } from "@/lib/utils/color";
import type { ThemeStyles } from "@/types/theme";

interface ThemePreviewProps {
  styles: ThemeStyles;
  name?: string;
  className?: string;
}

export function ThemePreview({ styles, name, className }: ThemePreviewProps) {
  const c = {
    bg: getNormalizedColor(styles.bgColor) || "#ffffff",
    fg: getNormalizedColor(styles.fgColor) || "#000000",
    eyeColor: getNormalizedColor(styles.eyeColor) || "#000000",
    dotColor: getNormalizedColor(styles.dotColor) || "#000000",
  };

  const palette = [c.bg, c.fg, c.eyeColor, c.dotColor];

  return (
    <div
      className={cn(
        "relative w-full h-full select-none overflow-hidden",
        className,
      )}
      style={{
        backgroundColor: c.bg as string,
        color: c.fg as string,
      }}
    >
      {/* Color Palette - top right */}
      <div className="absolute top-3 right-3 flex flex-row gap-1.5">
        {palette.map((color, i) => (
          <div
            key={i}
            className="w-3 h-12"
            style={{
              backgroundColor: color as string,
              borderRadius: "0.5rem",
            }}
          />
        ))}
      </div>

      <div
        className="absolute bottom-3 left-4 max-w-[80%] truncate font-medium"
        style={{
          fontSize: "1.5rem",
          color: c.fg as string,
        }}
      >
        {name || "Aa"}
      </div>
    </div>
  );
}
