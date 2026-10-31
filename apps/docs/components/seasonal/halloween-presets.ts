import type { ThemePreset } from "@/types/theme";

export const HALLOWEEN_PUMPKIN = "#FF7A1A";

const FRAME_TEXT = "Scan if you dare";

/** Built-in Halloween themes. Always available; listed first while Halloween runs. */
export const halloweenPresets = {
  halloweenPumpkin: {
    label: "Halloween Pumpkin",
    styles: {
      bgColor: "#140A04",
      fgColor: {
        type: "linear",
        stops: [
          { color: "#FFB020", offset: 0 },
          { color: "#FF5A1F", offset: 100 },
        ],
        angle: 135,
      },
      eyeColor: "#FF8A1F",
      dotColor: "#FFB020",
      bodyPattern: "circle",
      cornerEyePattern: "extra-rounded",
      cornerEyeDotPattern: "rounded-triangle",
      level: "Q",
      margin: 4,
      frame: {
        style: "banner-bottom",
        text: FRAME_TEXT,
        color: HALLOWEEN_PUMPKIN,
        textColor: "#140A04",
      },
    },
  },
  halloweenGhost: {
    label: "Halloween Ghost",
    styles: {
      bgColor: "#1B1033",
      fgColor: {
        type: "linear",
        stops: [
          { color: "#FFFFFF", offset: 0 },
          { color: "#E9D5FF", offset: 100 },
        ],
        angle: 135,
      },
      eyeColor: "#FFFFFF",
      dotColor: "#F3E8FF",
      bodyPattern: "rounded",
      cornerEyePattern: "extra-rounded",
      cornerEyeDotPattern: "circle",
      level: "Q",
      margin: 2,
      frame: {
        style: "rounded-border",
        text: FRAME_TEXT,
        color: "#2E1A57",
        textColor: "#F3E8FF",
      },
    },
  },
  halloweenPotion: {
    label: "Halloween Potion",
    styles: {
      bgColor: "#0C0A14",
      fgColor: {
        type: "linear",
        stops: [
          { color: "#BEF264", offset: 0 },
          { color: "#D8B4FE", offset: 100 },
        ],
        angle: 135,
      },
      eyeColor: "#BEF264",
      dotColor: "#D8B4FE",
      bodyPattern: "circle-large",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded",
      level: "Q",
      margin: 4,
      frame: {
        style: "banner-bottom",
        text: FRAME_TEXT,
        color: "#7C3AED",
        textColor: "#F7FEE7",
      },
    },
  },
  halloweenBatNight: {
    label: "Halloween Bat Night",
    styles: {
      bgColor: HALLOWEEN_PUMPKIN,
      fgColor: "#0A0A0A",
      eyeColor: "#0A0A0A",
      dotColor: "#0A0A0A",
      bodyPattern: "circle-large",
      cornerEyePattern: "pointy",
      cornerEyeDotPattern: "rounded",
      level: "Q",
      margin: 4,
      frame: {
        style: "banner-bottom",
        text: FRAME_TEXT,
        color: "#0A0A0A",
        textColor: HALLOWEEN_PUMPKIN,
      },
    },
  },
} satisfies Record<string, ThemePreset>;

export type HalloweenPresetId = keyof typeof halloweenPresets;

export const HALLOWEEN_PRESET_IDS = Object.keys(
  halloweenPresets,
) as HalloweenPresetId[];
