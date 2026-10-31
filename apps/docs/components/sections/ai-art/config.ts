// Client-safe settings shared by the /ai/art page and /api/ai/art.

export const ART_TEXT_MAX_LENGTH = 300;
export const ART_PROMPT_MIN_LENGTH = 3;
export const ART_PROMPT_MAX_LENGTH = 400;

/** Creativity 0 = closest to a plain QR code, 100 = most artistic (least scannable). */
export const ART_CREATIVITY = {
  min: 0,
  max: 100,
  step: 5,
  default: 50,
  /** How far "Retry with lower creativity" steps down. */
  retryStep: 15,
} as const;

export interface AIArtResult {
  imageUrl: string;
  width: number | null;
  height: number | null;
  seed: number;
  /** Exactly what the QR code encodes, for the client-side scan check. */
  text: string;
  creativity: number;
}

export interface AIArtPreset {
  id: string;
  name: string;
  prompt: string;
  /** CSS background for the preset card swatch. */
  swatch: string;
}

export const AI_ART_PRESETS: AIArtPreset[] = [
  {
    id: "zen-garden",
    name: "Zen garden",
    prompt:
      "a serene japanese zen garden with a koi pond, cherry blossoms, stone lanterns and moss, soft morning light, highly detailed, photorealistic",
    swatch: "linear-gradient(135deg, #f9a8d4 0%, #86efac 55%, #166534 100%)",
  },
  {
    id: "alpine-village",
    name: "Alpine village",
    prompt:
      "a cozy alpine village in snowy mountains at dusk, warm glowing windows, pine forest, cinematic lighting, highly detailed",
    swatch: "linear-gradient(135deg, #e0f2fe 0%, #64748b 55%, #f59e0b 100%)",
  },
  {
    id: "coral-reef",
    name: "Coral reef",
    prompt:
      "a vibrant underwater coral reef with tropical fish and sea turtles, sun rays through clear turquoise water, highly detailed",
    swatch: "linear-gradient(135deg, #22d3ee 0%, #0e7490 50%, #fb7185 100%)",
  },
  {
    id: "neon-city",
    name: "Neon city",
    prompt:
      "a futuristic cyberpunk city street at night, neon signs, rain reflections on the pavement, cinematic, ultra detailed",
    swatch: "linear-gradient(135deg, #0f172a 0%, #7c3aed 50%, #ec4899 100%)",
  },
  {
    id: "autumn-forest",
    name: "Autumn forest",
    prompt:
      "an enchanted autumn forest with golden and red leaves, a winding path, soft fog and sunbeams, fantasy, highly detailed",
    swatch: "linear-gradient(135deg, #fde68a 0%, #ea580c 55%, #7f1d1d 100%)",
  },
  {
    id: "botanical-watercolor",
    name: "Botanical watercolor",
    prompt:
      "a botanical watercolor illustration of wildflowers and leaves, soft pastel colors, delicate brush strokes on textured paper",
    swatch: "linear-gradient(135deg, #fef3c7 0%, #c4b5fd 50%, #6ee7b7 100%)",
  },
];
