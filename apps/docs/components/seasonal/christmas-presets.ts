import type { ThemePreset } from "@/types/theme";

/** Built-in Christmas themes. Always available; listed first while Christmas runs. */
export const christmasPresets = {
  christmasCandyCane: {
    label: "Christmas Candy Cane",
    styles: {
      bgColor: "#FFF7F5",
      fgColor: "#A3132D",
      eyeColor: "#6E0B1E",
      dotColor: "#6E0B1E",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded",
      level: "Q",
      margin: 2,
      frame: {
        style: "banner-bottom",
        text: "Scan for a surprise",
        color: "#A3132D",
        textColor: "#FFF7F5",
      },
    },
  },
  christmasPine: {
    label: "Christmas Pine",
    styles: {
      bgColor: "#F2F7F1",
      fgColor: "#14532D",
      eyeColor: "#0B3A1F",
      dotColor: "#0B3A1F",
      bodyPattern: "circle",
      cornerEyePattern: "extra-rounded",
      cornerEyeDotPattern: "circle",
      level: "Q",
      margin: 2,
    },
  },
  christmasSnowfall: {
    label: "Christmas Snowfall",
    styles: {
      bgColor: "#FFFFFF",
      fgColor: "#1E3A5F",
      eyeColor: "#0F2440",
      dotColor: "#0F2440",
      bodyPattern: "circle",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded",
      level: "Q",
      margin: 2,
      frame: {
        style: "rounded-border",
        text: "Let it scan",
        color: "#1E3A5F",
        textColor: "#FFFFFF",
      },
    },
  },
  christmasGoldStar: {
    label: "Christmas Gold Star",
    styles: {
      bgColor: "#FFF6DC",
      fgColor: "#5C4100",
      eyeColor: "#8A6100",
      dotColor: "#8A6100",
      bodyPattern: "square",
      cornerEyePattern: "rounded",
      // Star centres read only some of the time on gold; rounded ones always do.
      cornerEyeDotPattern: "rounded",
      level: "Q",
      margin: 2,
    },
  },
} satisfies Record<string, ThemePreset>;

export type ChristmasPresetId = keyof typeof christmasPresets;

export const CHRISTMAS_PRESET_IDS = Object.keys(
  christmasPresets,
) as ChristmasPresetId[];
