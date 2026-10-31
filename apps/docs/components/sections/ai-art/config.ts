// Client-safe settings shared by the /ai/art page and /api/ai/art.
import { z } from "zod";

export const ART_TEXT_MAX_LENGTH = 300;
export const ART_PROMPT_MIN_LENGTH = 3;
export const ART_PROMPT_MAX_LENGTH = 400;
export const ART_NEGATIVE_PROMPT_MAX_LENGTH = 300;
export const ART_MAX_VARIATIONS = 4;
export const ART_MAX_SEED = 4_294_967_295;

/** QR visibility 0 = most artistic, 100 = the code shows most clearly. */
export const ART_QR_VISIBILITY = {
  min: 0,
  max: 100,
  step: 5,
  default: 50,
  /** How far "Retry with a clearer code" steps up. */
  retryStep: 15,
} as const;

/** Creativity 0 = follows the prompt literally, 100 = interprets it freely. */
export const ART_CREATIVITY = {
  min: 0,
  max: 100,
  step: 5,
  default: 45,
} as const;

/** ControlNet conditioning scale at visibility 0 and 100. */
const CONDITIONING_SCALE_RANGE = { min: 0.8, max: 2 } as const;
/** Classifier-free guidance at creativity 0 (strict) and 100 (free). */
const GUIDANCE_RANGE = { strict: 12, free: 4 } as const;

const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100) / 100;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** "QR visibility" slider → ControlNet `controlnet_conditioning_scale`. */
export function visibilityToConditioningScale(visibility: number): number {
  const { min, max } = CONDITIONING_SCALE_RANGE;
  return round2(min + clampPercent(visibility) * (max - min));
}

/** "Creativity" slider → classifier-free `guidance_scale`. */
export function creativityToGuidanceScale(creativity: number): number {
  const { strict, free } = GUIDANCE_RANGE;
  return round2(strict - clampPercent(creativity) * (strict - free));
}

/** Seeds for a run: consecutive from a locked seed, else random. */
export function seedsForRun(
  count: number,
  lockedSeed: number | undefined,
  random: () => number = Math.random,
): number[] {
  if (lockedSeed !== undefined) {
    return Array.from(
      { length: count },
      (_, index) => (lockedSeed + index) % (ART_MAX_SEED + 1),
    );
  }
  return Array.from({ length: count }, () =>
    Math.floor(random() * ART_MAX_SEED),
  );
}

// ── Reference image ───────────────────────────────────────────────────────

/** Largest reference image the client sends (it downsizes uploads first). */
export const ART_REFERENCE_MAX_BYTES = 600 * 1024;
export const ART_REFERENCE_MAX_SIDE = 512;
const REFERENCE_DATA_URL =
  /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Bytes a base64 payload decodes to. */
const base64Bytes = (payload: string) =>
  Math.floor((payload.length * 3) / 4) -
  (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0);

/**
 * Reference images are only accepted as uploaded PNG/JPEG data: URLs, never
 * remote URLs, so the server never fetches anything a user points it at.
 */
export const artReferenceSchema = z
  .string()
  .max(Math.ceil((ART_REFERENCE_MAX_BYTES * 4) / 3) + 32)
  .refine((value) => REFERENCE_DATA_URL.test(value), {
    message: "Reference image must be an uploaded PNG or JPG",
  })
  .refine(
    (value) =>
      base64Bytes(value.slice(value.indexOf(",") + 1)) <=
      ART_REFERENCE_MAX_BYTES,
    { message: "Reference image is too large" },
  );

// ── Requests and responses ────────────────────────────────────────────────

export const aiArtRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Enter a link or text to encode")
    .max(ART_TEXT_MAX_LENGTH),
  prompt: z
    .string()
    .trim()
    .min(ART_PROMPT_MIN_LENGTH, "Describe the artwork you want")
    .max(ART_PROMPT_MAX_LENGTH),
  negativePrompt: z
    .string()
    .trim()
    .max(ART_NEGATIVE_PROMPT_MAX_LENGTH)
    .optional(),
  visibility: z
    .number()
    .int()
    .min(ART_QR_VISIBILITY.min)
    .max(ART_QR_VISIBILITY.max)
    .default(ART_QR_VISIBILITY.default),
  creativity: z
    .number()
    .int()
    .min(ART_CREATIVITY.min)
    .max(ART_CREATIVITY.max)
    .default(ART_CREATIVITY.default),
  variations: z.number().int().min(1).max(ART_MAX_VARIATIONS).default(1),
  /** Locked seed: variations use seed, seed + 1, … */
  seed: z.number().int().min(0).max(ART_MAX_SEED).optional(),
  reference: artReferenceSchema.optional(),
});
export type AIArtRequest = z.input<typeof aiArtRequestSchema>;

/**
 * fal.ai's result hosts. Only these are sent back for upscaling, so the
 * upscaler never fetches an arbitrary URL on a user's behalf.
 */
export function isFalResultUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return (
      url.hostname === "fal.media" ||
      url.hostname.endsWith(".fal.media") ||
      (url.hostname === "storage.googleapis.com" &&
        url.pathname.startsWith("/falserverless/"))
    );
  } catch {
    return false;
  }
}

export const aiArtUpscaleRequestSchema = z.object({
  imageUrl: z.url().max(2048),
});

export interface AIArtVariant {
  imageUrl: string;
  width: number | null;
  height: number | null;
  seed: number;
}

export interface AIArtCredits {
  plan: "free" | "pro" | "business";
  /** Images per calendar month (UTC); null = unlimited */
  limit: number | null;
  used: number;
  remaining: number | null;
  /** Shared by everyone in the active team */
  pooled: boolean;
  /** ISO date the monthly allowance resets */
  resetsAt: string;
}

export interface AIArtCreditsResponse {
  configured: boolean;
  /** null when signed out */
  credits: AIArtCredits | null;
}

export interface AIArtResult {
  variants: AIArtVariant[];
  /** Variants that failed and were refunded */
  failed: number;
  /** Exactly what the QR code encodes, for the client-side scan check. */
  text: string;
  visibility: number;
  creativity: number;
  credits: AIArtCredits | null;
}

export interface AIArtUpscaleResult {
  imageUrl: string;
  width: number | null;
  height: number | null;
  credits: AIArtCredits | null;
}
