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
  {
    id: "amber-minimal",
    name: "Amber Minimal",
    description: "Warm amber tones with minimal design",
    source: "BUILT_IN",
    style: {
      bgColor: "#fffbeb",
      fgColor: "#92400e",
      eyeColor: "#f59e0b",
      dotColor: "#fbbf24",
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
      level: "M",
    },
  },
  {
    id: "amethyst-haze",
    name: "Amethyst Haze",
    description: "Purple and pink gradient design",
    source: "BUILT_IN",
    style: {
      bgColor: "#faf5ff",
      fgColor: "#6b21a8",
      eyeColor: "#a855f7",
      dotColor: "#c084fc",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded-square",
      level: "Q",
    },
  },
  {
    id: "bold-tech",
    name: "Bold Tech",
    description: "Bold purple and blue tech-inspired design",
    source: "BUILT_IN",
    style: {
      bgColor: "#f3e8ff",
      fgColor: "#581c87",
      eyeColor: "#7c3aed",
      dotColor: "#3b82f6",
      bodyPattern: "diamond",
      cornerEyePattern: "gear",
      cornerEyeDotPattern: "diamond",
      level: "H",
    },
  },
  {
    id: "bubblegum",
    name: "Bubblegum",
    description: "Playful pink, yellow, and teal colors",
    source: "BUILT_IN",
    style: {
      bgColor: "#fdf2f8",
      fgColor: "#9f1239",
      eyeColor: "#ec4899",
      dotColor: "#fbbf24",
      bodyPattern: "circle",
      cornerEyePattern: "circle",
      cornerEyeDotPattern: "circle",
      level: "Q",
    },
  },
  {
    id: "caffeine",
    name: "Caffeine",
    description: "Rich brown coffee-inspired tones",
    source: "BUILT_IN",
    style: {
      bgColor: "#fef3c7",
      fgColor: "#78350f",
      eyeColor: "#92400e",
      dotColor: "#a16207",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded-square",
      level: "M",
    },
  },
  {
    id: "candyland",
    name: "Candyland",
    description: "Sweet yellow and blue candy colors",
    source: "BUILT_IN",
    style: {
      bgColor: "#fef9c3",
      fgColor: "#854d0e",
      eyeColor: "#eab308",
      dotColor: "#3b82f6",
      bodyPattern: "circle",
      cornerEyePattern: "circle",
      cornerEyeDotPattern: "circle",
      level: "Q",
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    description: "Fresh green emerald tones",
    source: "BUILT_IN",
    style: {
      bgColor: "#ecfdf5",
      fgColor: "#064e3b",
      eyeColor: "#10b981",
      dotColor: "#34d399",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded-square",
      level: "Q",
    },
  },
  {
    id: "rose",
    name: "Rose",
    description: "Elegant rose pink design",
    source: "BUILT_IN",
    style: {
      bgColor: "#fff1f2",
      fgColor: "#881337",
      eyeColor: "#e11d48",
      dotColor: "#f43f5e",
      bodyPattern: "circle",
      cornerEyePattern: "circle",
      cornerEyeDotPattern: "circle",
      level: "M",
    },
  },
  {
    id: "slate",
    name: "Slate",
    description: "Modern slate gray design",
    source: "BUILT_IN",
    style: {
      bgColor: "#f8fafc",
      fgColor: "#0f172a",
      eyeColor: "#475569",
      dotColor: "#64748b",
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
      level: "M",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Warm sunset orange and red",
    source: "BUILT_IN",
    style: {
      bgColor: "#fff7ed",
      fgColor: "#9a3412",
      eyeColor: "#ea580c",
      dotColor: "#f97316",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded-square",
      level: "Q",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep dark blue midnight theme",
    source: "BUILT_IN",
    style: {
      bgColor: "#0f172a",
      fgColor: "#e0e7ff",
      eyeColor: "#6366f1",
      dotColor: "#818cf8",
      bodyPattern: "circle",
      cornerEyePattern: "gear",
      cornerEyeDotPattern: "circle",
      level: "Q",
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
