// The AI art model as the rest of the app sees it: its usage ids (kept apart
// from lib/ai/art.ts, so lib/subscription.ts can read them without pulling in
// the image pipeline or rate limiting) and how copy names it. Client-safe:
// the studio, the FAQ and lib/product-facts.ts read it too.

import { AI_MODELS } from "./models";

/**
 * `ai_usage.model_id` of one delivered AI art image: the art model's gateway
 * id (lib/ai/models.ts), OpenAI's GPT Image 2.
 */
export const ART_MODEL_ID: string = AI_MODELS.art.model;

/**
 * Art model ids used before the current one. Their rows still count this
 * month, so when the art model changes, add the previous id here.
 */
export const LEGACY_ART_MODEL_IDS = [
  // Gemini Nano Banana 2.1 through a direct Google key, then the gateway,
  // until 3 November 2026.
  "google/gemini-nano-banana-2.1",
  // fal.ai Illusion Diffusion and its Real-ESRGAN upscale.
  "fal-ai/illusion-diffusion",
  "fal-ai/esrgan",
] as const;

/** `ai_usage` model ids that draw on the monthly AI art allowance. */
export const ART_USAGE_MODEL_IDS: string[] = [
  ...new Set<string>([ART_MODEL_ID, ...LEGACY_ART_MODEL_IDS]),
];

/** Who makes the art model, for copy: "OpenAI". */
export const ART_MODEL_MAKER: string = AI_MODELS.art.maker;

/** The art model's name, for copy: "GPT Image 2". */
export const ART_MODEL_NAME: string = AI_MODELS.art.name;

/** The art model as copy first names it: "OpenAI's GPT Image 2". */
export const ART_MODEL_LABEL = `${ART_MODEL_MAKER}'s ${ART_MODEL_NAME}`;

/**
 * Whether the art model follows a seed. When it doesn't, the studio hides
 * its seed lock and copy doesn't promise similar images for the same seed.
 */
export const ART_SUPPORTS_SEED: boolean = AI_MODELS.art.supportsSeed;
