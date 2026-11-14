// What the rest of the app needs about the AI art style presets without
// loading them (./presets.ts holds every prompt): the categories, how many
// presets there are (for copy and lib/product-facts.ts) and where each
// preview image is. Keep it tiny: the playground, source.config.ts and
// client config import it.

/** The picker's categories, in the order its tabs show them. */
export const AI_ART_CATEGORIES = [
  { id: "nature", label: "Nature" },
  { id: "animals", label: "Animals" },
  { id: "places", label: "Places" },
  { id: "architecture", label: "Architecture" },
  { id: "painting", label: "Painting" },
  { id: "illustration", label: "Illustration" },
  { id: "photo", label: "Photography" },
  { id: "craft", label: "Craft & texture" },
  { id: "pattern", label: "Abstract & pattern" },
  { id: "retro", label: "Retro & graphic" },
  { id: "food", label: "Food & drink" },
  { id: "culture", label: "World traditions" },
  { id: "seasonal", label: "Seasonal" },
  { id: "fantasy", label: "Fantasy & sci-fi" },
] as const;

export type AIArtCategory = (typeof AI_ART_CATEGORIES)[number]["id"];

/**
 * How many style presets there are. components/sections/ai-art/config.test.ts
 * fails when it differs from AI_ART_PRESETS.length.
 */
export const AI_ART_PRESET_COUNT = 171;

/** Where a preset's preview lives (made by scripts/ai/art-previews.ts). */
export const aiArtPresetPreview = (id: string): string =>
  `/images/ai-art-styles/${id}.webp`;
