"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { type ColorConfig, getSolidColor } from "qrdx/types";
import { soundEvent } from "@/lib/sound/emit";
import type { QRStyle } from "@/types/theme";

interface Palette {
  id: string;
  name: string;
  bgColor: string;
  fgColor: string;
  eyeColor: string;
  dotColor: string;
  /** Light modules on a dark background */
  inverted?: boolean;
}

/**
 * Curated palettes. Every color reaches at least 4.5:1 against its
 * background, so the scan check's contrast test passes.
 */
const PALETTES: Palette[] = [
  {
    id: "mono",
    name: "Mono",
    bgColor: "#ffffff",
    fgColor: "#000000",
    eyeColor: "#000000",
    dotColor: "#000000",
  },
  {
    id: "ink",
    name: "Ink & paper",
    bgColor: "#f6f1e7",
    fgColor: "#1c2541",
    eyeColor: "#1c2541",
    dotColor: "#9b2c2c",
  },
  {
    id: "ocean",
    name: "Ocean",
    bgColor: "#f1f8fc",
    fgColor: "#0b3c5d",
    eyeColor: "#0a5c8a",
    dotColor: "#0b3c5d",
  },
  {
    id: "forest",
    name: "Forest",
    bgColor: "#f3f7f0",
    fgColor: "#1f3d2b",
    eyeColor: "#2d6a4f",
    dotColor: "#1f3d2b",
  },
  {
    id: "sunset",
    name: "Sunset",
    bgColor: "#fff6ee",
    fgColor: "#7a2e0e",
    eyeColor: "#b8430f",
    dotColor: "#7a2e0e",
  },
  {
    id: "berry",
    name: "Berry",
    bgColor: "#fdf3f7",
    fgColor: "#5c1a3c",
    eyeColor: "#9b1d5a",
    dotColor: "#5c1a3c",
  },
  {
    id: "graphite",
    name: "Graphite",
    bgColor: "#f4f4f5",
    fgColor: "#27272a",
    eyeColor: "#3f3f46",
    dotColor: "#18181b",
  },
  {
    id: "night",
    name: "Night",
    bgColor: "#0c0c0d",
    fgColor: "#f5f5f4",
    eyeColor: "#f5f5f4",
    dotColor: "#f5f5f4",
    inverted: true,
  },
];

const KEYS = ["bgColor", "fgColor", "eyeColor", "dotColor"] as const;

const solid = (color: ColorConfig | undefined) =>
  color === undefined ? undefined : getSolidColor(color, "").toLowerCase();

const isGradient = (color: ColorConfig | undefined) =>
  typeof color === "object" && color.type !== "solid";

function matches(palette: Palette, style: QRStyle) {
  return KEYS.every(
    (key) => !isGradient(style[key]) && solid(style[key]) === palette[key],
  );
}

/** Background, code and eye colors of a palette, as overlapping dots. */
function PaletteSwatch({ palette }: { palette: Palette }) {
  return (
    <span aria-hidden className="flex -space-x-1">
      {(["bgColor", "fgColor", "eyeColor"] as const).map((key) => (
        <span
          className="ring-background size-3 rounded-full border ring-1"
          key={key}
          style={{ background: palette[key] }}
        />
      ))}
    </span>
  );
}

interface ColorPresetsProps {
  style: QRStyle;
  onApply: (colors: Pick<QRStyle, (typeof KEYS)[number]>) => void;
}

/** One-click palettes that set background, code, eye and eye-dot colors. */
export function ColorPresets({ style, onApply }: ColorPresetsProps) {
  const active = PALETTES.find((palette) => matches(palette, style));

  return (
    <div className="space-y-2">
      <fieldset
        aria-label="Color palettes"
        className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
      >
        {PALETTES.map((palette) => {
          const selected = active?.id === palette.id;
          return (
            <Button
              aria-pressed={selected}
              className="h-7 gap-1.5 px-2 text-xs has-[>span]:px-2"
              key={palette.id}
              onClick={() => {
                onApply({
                  bgColor: palette.bgColor,
                  fgColor: palette.fgColor,
                  eyeColor: palette.eyeColor,
                  dotColor: palette.dotColor,
                });
                soundEvent("apply");
              }}
              size="sm"
              title={
                palette.inverted
                  ? "Light code on dark. May not scan on older phones."
                  : undefined
              }
              type="button"
              variant={selected ? "secondary" : "outline"}
            >
              <PaletteSwatch palette={palette} />
              {palette.name}
            </Button>
          );
        })}
      </fieldset>
      {active?.inverted && (
        <p className="text-muted-foreground text-xs">
          Light code on a dark background may not scan on older phones.
        </p>
      )}
    </div>
  );
}
