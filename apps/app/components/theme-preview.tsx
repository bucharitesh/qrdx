/** biome-ignore-all lint/suspicious/noArrayIndexKey: false positive */
import { cn } from "@repo/design-system/lib/utils";
import { getColorString, getNormalizedColor } from "@/lib/utils/color";
import type { ThemeStyles } from "@/types/theme";

interface ThemePreviewProps {
  styles: ThemeStyles;
  name?: string;
  className?: string;
}

export function ThemePreview({ styles, name, className }: ThemePreviewProps) {
  // Paints can be gradients or images: `background` takes those as CSS, but
  // `color` and borders need one solid color (a gradient's first stop), or the
  // browser drops them and the name takes the page's text color instead.
  const paint = {
    bg: styles.bgColor ? getNormalizedColor(styles.bgColor) : "#ffffff",
    fg: styles.fgColor ? getNormalizedColor(styles.fgColor) : "#000000",
    eye: styles.eyeColor ? getNormalizedColor(styles.eyeColor) : "#000000",
    dot: styles.dotColor ? getNormalizedColor(styles.dotColor) : "#000000",
  };
  const ink = getColorString(styles.fgColor, "#000000");

  const palette = [paint.bg, paint.fg, paint.eye, paint.dot];

  return (
    <div
      className={cn(
        "relative w-full h-full select-none overflow-hidden",
        className,
      )}
      style={{ background: paint.bg, color: ink }}
    >
      {/* Color Palette - top right */}
      <div className="absolute top-3 right-3 flex flex-row gap-1.5">
        {palette.map((color, i) => (
          <div
            key={i}
            className="w-3 h-12"
            style={{
              background: color,
              borderRadius: "0.5rem",
              border: color === paint.bg ? `1px solid ${ink}` : undefined,
            }}
          />
        ))}
      </div>

      <div
        className="absolute bottom-3 left-4 max-w-[80%] truncate font-medium"
        style={{ fontSize: "1.5rem", color: ink }}
      >
        {name || "Aa"}
      </div>
    </div>
  );
}
