import { isFeatureAvailable } from "@/lib/feature-availability";

/**
 * Whether AI QR art is offered here: whenever AI_GATEWAY_API_KEY is set, as
 * for AI themes (it runs through Vercel AI Gateway).
 *
 * The pricing page, sitemap and llms.txt are prerendered, so a change takes
 * effect on the next deploy. The rule lives in lib/feature-availability-rules.ts
 * with the other features'.
 */
export const isArtAvailable = isFeatureAvailable("aiArt");
