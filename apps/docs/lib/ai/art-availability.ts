import { env } from "@/lib/env";

/**
 * Whether AI QR art is offered here. It runs on Gemini with GOOGLE_API_KEY,
 * and AI_ART_ENABLED=0 switches it off with the key still set (AI themes keep
 * working): for example while the key's Google project has no billing, since
 * Gemini's free tier allows no image generation.
 *
 * The pricing page, sitemap and llms.txt are prerendered, so a change takes
 * effect on the next deploy.
 */
export const isArtAvailable =
  Boolean(env.GOOGLE_API_KEY) && env.AI_ART_ENABLED !== "0";
