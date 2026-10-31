import { ringInYear } from "@/lib/seasonal";
import type { ThemePreset } from "@/types/theme";

const year = ringInYear();

/** Built-in New Year themes. Always available; listed first while New Year runs. */
export const newYearPresets = {
  newYearChampagne: {
    label: "New Year Champagne",
    styles: {
      bgColor: "#FBF5E6",
      fgColor: "#4F3B16",
      eyeColor: "#7A5A22",
      dotColor: "#7A5A22",
      bodyPattern: "rounded",
      cornerEyePattern: "extra-rounded",
      cornerEyeDotPattern: "rounded",
      level: "Q",
      margin: 2,
      frame: {
        style: "banner-bottom",
        text: `Cheers to ${year}`,
        color: "#7A5A22",
        textColor: "#FBF5E6",
      },
    },
  },
  newYearMidnight: {
    label: "New Year Midnight",
    styles: {
      bgColor: "#F3F5FA",
      fgColor: "#0F1B3D",
      eyeColor: "#23356E",
      dotColor: "#23356E",
      bodyPattern: "circle",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "circle",
      level: "Q",
      margin: 2,
    },
  },
  newYearStarlight: {
    label: "New Year Starlight",
    styles: {
      bgColor: "#FFF9F2",
      fgColor: "#2B2350",
      eyeColor: "#A21C4E",
      dotColor: "#A21C4E",
      bodyPattern: "circle",
      cornerEyePattern: "extra-rounded",
      cornerEyeDotPattern: "rounded",
      level: "Q",
      margin: 2,
      frame: {
        style: "rounded-border",
        text: "Happy New Year",
        color: "#2B2350",
        textColor: "#FFF9F2",
      },
    },
  },
  newYearSparklerGold: {
    label: "New Year Sparkler Gold",
    styles: {
      bgColor: "#F7E7B4",
      fgColor: "#1A1406",
      eyeColor: "#6B4A00",
      dotColor: "#6B4A00",
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
      level: "Q",
      margin: 2,
    },
  },
} satisfies Record<string, ThemePreset>;

export type NewYearPresetId = keyof typeof newYearPresets;

export const NEW_YEAR_PRESET_IDS = Object.keys(
  newYearPresets,
) as NewYearPresetId[];
