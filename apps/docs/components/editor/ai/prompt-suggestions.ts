import type { ThemeStyles } from "@/types/theme";

export interface PromptSuggestion {
  id: string;
  title: string;
  hint: string;
  prompt: string;
  /** Colours and shapes for the card's mini preview (a rough idea of the result) */
  preview: Partial<ThemeStyles>;
  season?: "halloween";
}

/** "Create" ideas for the AI panel; each card previews its look. */
export const CREATE_SUGGESTIONS: PromptSuggestion[] = [
  {
    id: "retro-arcade",
    title: "Retro arcade",
    hint: "Bright pixel squares",
    prompt:
      "Create a retro gaming QR code with square patterns throughout. Use vibrant pixel-art inspired colors like bright red or blue on a dark background. Set bodyPattern to square, cornerEyePattern to square, cornerEyeDotPattern to square. Set eyeColor and dotColor to match fgColor.",
    preview: {
      bgColor: "#111827",
      fgColor: "#f43f5e",
      eyeColor: "#38bdf8",
      dotColor: "#f43f5e",
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
    },
  },
  {
    id: "soft-pastel",
    title: "Soft pastel",
    hint: "Lavender on cream",
    prompt:
      "Create a soft pastel QR code with gentle colors. Use light pastel colors like soft pink or lavender for foreground on a cream background. Use rounded body and extra-rounded corner eyes. Set eyeColor and dotColor to match fgColor.",
    preview: {
      bgColor: "#fdf6ec",
      fgColor: "#8b5cf6",
      eyeColor: "#ec4899",
      dotColor: "#8b5cf6",
      bodyPattern: "circle",
      cornerEyePattern: "extra-rounded",
      cornerEyeDotPattern: "rounded",
    },
  },
  {
    id: "corporate-blue",
    title: "Corporate blue",
    hint: "Navy, high contrast",
    prompt:
      "Create a professional corporate QR code in deep navy blue on white. Use square body modules and rounded corner eyes. Keep high contrast and set eyeColor and dotColor to match fgColor.",
    preview: {
      bgColor: "#ffffff",
      fgColor: "#1e3a8a",
      eyeColor: "#1e3a8a",
      dotColor: "#1e3a8a",
      bodyPattern: "small-square",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "square",
    },
  },
  {
    id: "sunset",
    title: "Sunset glow",
    hint: "Orange into pink",
    prompt:
      "Create a sunset-inspired QR code with a warm linear gradient from orange to pink for the foreground on a light warm background. Use circle dots and rounded corner eyes. Keep strong contrast for scanning.",
    preview: {
      bgColor: "#fff7ed",
      fgColor: {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#f97316", offset: 0 },
          { color: "#db2777", offset: 1 },
        ],
      },
      eyeColor: "#ea580c",
      dotColor: "#db2777",
      bodyPattern: "circle",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "circle",
    },
  },
  {
    id: "neon-nightlife",
    title: "Neon nightlife",
    hint: "Cyan on black",
    prompt:
      "Create a neon nightlife QR code: electric cyan and magenta on a near-black background, circle dots, rounded eyes with magenta eye color. Keep enough contrast to scan in dim light.",
    preview: {
      bgColor: "#0a0a0f",
      fgColor: "#22d3ee",
      eyeColor: "#e879f9",
      dotColor: "#22d3ee",
      bodyPattern: "circle",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "circle",
    },
  },
  {
    id: "luxury-gold",
    title: "Luxury gold",
    hint: "Gold on black",
    prompt:
      "Create a luxury QR code with metallic gold (#d4af37) dots on a deep black background. Use small square body modules and square eyes for a refined, premium look. Set eyeColor and dotColor to gold.",
    preview: {
      bgColor: "#0b0b0b",
      fgColor: "#d4af37",
      eyeColor: "#d4af37",
      dotColor: "#d4af37",
      bodyPattern: "small-square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
    },
  },
  {
    id: "matcha-cafe",
    title: "Matcha café",
    hint: "Green on oat",
    prompt:
      "Create a calm matcha café QR code: earthy matcha green foreground on an oat-milk cream background, rounded dots and extra-rounded eyes in a darker green. Friendly and organic.",
    preview: {
      bgColor: "#f5f0e6",
      fgColor: "#4d7c0f",
      eyeColor: "#365314",
      dotColor: "#4d7c0f",
      bodyPattern: "circle-large",
      cornerEyePattern: "extra-rounded",
      cornerEyeDotPattern: "rounded",
    },
  },
  {
    id: "spooky",
    title: "Halloween",
    hint: "Pumpkin on night",
    prompt:
      "Create a spooky Halloween QR code: pumpkin orange dots on a deep purple-black background, diamond body pattern and rounded eyes in bright orange. Fun but still easy to scan.",
    preview: {
      bgColor: "#1a1025",
      fgColor: "#f97316",
      eyeColor: "#fb923c",
      dotColor: "#f97316",
      bodyPattern: "diamond",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "circle",
    },
    season: "halloween",
  },
];

/** One line under each mode tab. */
export const MODE_DESCRIPTIONS = {
  create: "Start fresh from a vibe, a brand or a mood.",
  remix: "Take a preset and push it somewhere new.",
  tweak: "Adjust the design you have right now.",
} as const;

export const COMPOSER_PLACEHOLDERS = [
  "A minimalist black and white theme…",
  "Retro arcade with pixel dots…",
  "Our café: warm browns, rounded eyes…",
  "Neon cyan on black for a night club…",
  "Match the colours of my logo…",
];
