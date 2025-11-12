import { defaultQRStyle } from "@/config/qr";
import type { BaseQREditorState } from "@/types/editor";
import type { QRPreset, QRStyle } from "@/types/qr";

/**
 * Built-in QR code presets
 */
export const builtInPresets: QRPreset[] = [
  {
    id: "default",
    name: "Classic",
    description: "Traditional black and white QR code",
    source: "BUILT_IN",
    style: {
      bgColor: "#ffffff",
      fgColor: "#000000",
      eyeColor: "#000000",
      dotColor: "#000000",
      bodyPattern: "circle",
      cornerEyePattern: "gear",
      cornerEyeDotPattern: "circle",
      level: "Q",
    },
  },
  {
    id: "modern",
    name: "Modern",
    description: "Sleek rounded design with clean patterns",
    source: "BUILT_IN",
    style: {
      bgColor: "#f8fafc",
      fgColor: "#0f172a",
      eyeColor: "#3b82f6",
      dotColor: "#3b82f6",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded-square",
      level: "Q",
    },
  },
  {
    id: "vibrant",
    name: "Vibrant",
    description: "Bold colors with diamond patterns",
    source: "BUILT_IN",
    style: {
      bgColor: "#fef3c7",
      fgColor: "#7c2d12",
      eyeColor: "#dc2626",
      dotColor: "#ea580c",
      bodyPattern: "diamond",
      cornerEyePattern: "circle",
      cornerEyeDotPattern: "diamond",
      level: "H",
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean and simple square design",
    source: "BUILT_IN",
    style: {
      bgColor: "#ffffff",
      fgColor: "#404040",
      eyeColor: "#404040",
      dotColor: "#404040",
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
      level: "M",
    },
  },
  {
    id: "gradient-blue",
    name: "Ocean Blue",
    description: "Blue gradient-inspired design",
    source: "BUILT_IN",
    style: {
      bgColor: "#eff6ff",
      fgColor: "#1e40af",
      eyeColor: "#3b82f6",
      dotColor: "#60a5fa",
      bodyPattern: "circle-large",
      cornerEyePattern: "gear",
      cornerEyeDotPattern: "circle",
      level: "Q",
    },
  },
  {
    id: "neon",
    name: "Neon",
    description: "Dark background with bright neon accents",
    source: "BUILT_IN",
    style: {
      bgColor: "#0f172a",
      fgColor: "#22d3ee",
      eyeColor: "#a855f7",
      dotColor: "#ec4899",
      bodyPattern: "circle-mixed",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded-square",
      level: "Q",
    },
  },
  {
    id: "nature",
    name: "Nature",
    description: "Earth tones with organic patterns",
    source: "BUILT_IN",
    style: {
      bgColor: "#f0fdf4",
      fgColor: "#166534",
      eyeColor: "#15803d",
      dotColor: "#16a34a",
      bodyPattern: "rounded",
      cornerEyePattern: "circle",
      cornerEyeDotPattern: "circle",
      level: "Q",
    },
  },
  {
    id: "retro",
    name: "Retro",
    description: "Vintage-inspired design with warm tones",
    source: "BUILT_IN",
    style: {
      bgColor: "#fef2f2",
      fgColor: "#7f1d1d",
      eyeColor: "#b91c1c",
      dotColor: "#dc2626",
      bodyPattern: "clean-square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
      level: "M",
    },
  },
];

/**
 * Default QR editor state
 */
export const defaultQREditorState: BaseQREditorState = {
  style: defaultQRStyle,
  value: "https://example.com",
};

/**
 * Get preset by ID
 */
export function getPresetById(id: string): QRPreset | undefined {
  return builtInPresets.find((preset) => preset.id === id);
}

/**
 * Get preset style by ID
 */
export function getPresetStyle(id: string): Partial<QRStyle> {
  const preset = getPresetById(id);
  return preset?.style || defaultQRStyle;
}
