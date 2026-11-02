// AI art usage ids, kept apart from lib/ai/art.ts so lib/subscription.ts can
// read them without pulling in the image pipeline or rate limiting.

import { AI_MODELS } from "./models";

/**
 * `ai_usage.model_id` of one delivered AI art image: the art model's gateway
 * id (lib/ai/models.ts), Gemini Nano Banana 2.1 by default.
 */
export const ART_MODEL_ID: string = AI_MODELS.art.model;

/**
 * Art model ids used before the current one. Their rows still count this
 * month, so when the art model changes, add the previous id here.
 */
export const LEGACY_ART_MODEL_IDS = [
  // Gemini Nano Banana 2.1 through a direct Google key, then the gateway.
  "google/gemini-nano-banana-2.1",
  // fal.ai Illusion Diffusion and its Real-ESRGAN upscale.
  "fal-ai/illusion-diffusion",
  "fal-ai/esrgan",
] as const;

/** `ai_usage` model ids that draw on the monthly AI art allowance. */
export const ART_USAGE_MODEL_IDS: string[] = [
  ...new Set<string>([ART_MODEL_ID, ...LEGACY_ART_MODEL_IDS]),
];
