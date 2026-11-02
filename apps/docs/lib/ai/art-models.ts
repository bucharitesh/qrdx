// AI art model ids, kept apart from lib/ai/art.ts so lib/subscription.ts can
// read them without pulling in the image pipeline or rate limiting.

/**
 * Gemini image model that paints AI QR art: Nano Banana 2.1, Google's
 * general image model, which takes the control QR code (and an optional
 * reference) as input images. About $0.034 per 1K image on the paid tier.
 */
export const ART_GEMINI_MODEL = "gemini-nano-banana-2.1";

/** `ai_usage.model_id` of one delivered AI art image. */
export const ART_MODEL_ID = `google/${ART_GEMINI_MODEL}`;

/**
 * Ids from before AI art moved to Gemini (fal.ai Illusion Diffusion and its
 * Real-ESRGAN upscale). Rows with them still count this month.
 */
export const LEGACY_ART_MODEL_IDS = [
  "fal-ai/illusion-diffusion",
  "fal-ai/esrgan",
] as const;

/** `ai_usage` model ids that draw on the monthly AI art allowance. */
export const ART_USAGE_MODEL_IDS: string[] = [
  ART_MODEL_ID,
  ...LEGACY_ART_MODEL_IDS,
];
