// Client-safe settings shared by the /ai/art page and /api/ai/art.
import { z } from "zod";
import { playgroundHref } from "@/lib/playground-links";

/** The playground's Art tab (Logo QR, Image QR and, where it's set up, AI art). */
export const ART_PLAYGROUND_HREF = playgroundHref({ tab: "art" });

/**
 * The Art tab on one mode: Logo QR, Image QR or AI art (with a style
 * preset), optionally on a design (`style`, from packStyleParam or
 * encodeStyleParam). The art's image is added in the tab.
 */
export const artPlaygroundHref = (
  art: "logo" | "image" | "ai",
  artStyle?: string | null,
  style?: string,
): string =>
  playgroundHref({ tab: "art", art, artStyle: artStyle ?? undefined, style });

export const ART_TEXT_MAX_LENGTH = 300;
export const ART_PROMPT_MIN_LENGTH = 3;
export const ART_PROMPT_MAX_LENGTH = 400;
export const ART_NEGATIVE_PROMPT_MAX_LENGTH = 300;
export const ART_MAX_VARIATIONS = 4;
export const ART_MAX_SEED = 4_294_967_295;

/**
 * QR visibility 0 = most artistic, 100 = the code shows most clearly. It sets
 * how strictly the prompt asks the model to keep the modules, and the bounds
 * of the blend that makes its image scan (lib/ai/art-blend.ts,
 * leastBlendBounds): how far QRdx may strengthen the code, and from 50 up how
 * strong the code is at least.
 */
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

/** Delivered artwork, square, in pixels. */
export const ART_IMAGE_SIZE = 1024;
/** The print-size download, resampled in the browser and scan-checked again. */
export const ART_PRINT_SIZE = 2048;

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
  /** One image per request; variations send one request per seed. */
  seed: z.number().int().min(0).max(ART_MAX_SEED).optional(),
  reference: artReferenceSchema.optional(),
});
export type AIArtRequest = z.input<typeof aiArtRequestSchema>;

export interface AIArtVariant {
  /** The PNG or JPEG itself, as a data: URL (nothing is stored) */
  imageUrl: string;
  width: number;
  height: number;
  seed: number;
  /** The model's own image didn't pass the scan check as drawn */
  blended: boolean;
  /**
   * How QRdx made it scan: "none" (the model's image as drawn), "least"
   * (finders, quiet zone and modules strengthened just enough, on the
   * model's own image) or "image-qr" (redrawn as an Image QR code, the last
   * resort)
   */
  blend: "none" | "least" | "image-qr";
  /** How strong the blend is, 0–1: 0 as drawn, 1 for Image QR */
  blendStrength: number;
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

/** One generated image (POST /api/ai/art). */
export interface AIArtResult {
  variant: AIArtVariant;
  /** Exactly what the QR code encodes, for the client-side scan score. */
  text: string;
  visibility: number;
  creativity: number;
  credits: AIArtCredits | null;
}
