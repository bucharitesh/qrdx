// Client-safe settings shared by the /ai/art page and /api/ai/art.
import { z } from "zod";
import { playgroundHref } from "@/lib/playground-links";
import { ART_LOOK_IDS } from "./looks";

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

/** An uploaded PNG/JPEG data: URL of at most `maxBytes`. */
const uploadedImageSchema = (maxBytes: number, what: string) =>
  z
    .string()
    .max(Math.ceil((maxBytes * 4) / 3) + 32)
    .refine((value) => REFERENCE_DATA_URL.test(value), {
      message: `${what} must be an uploaded PNG or JPG`,
    })
    .refine(
      (value) => base64Bytes(value.slice(value.indexOf(",") + 1)) <= maxBytes,
      { message: `${what} is too large` },
    );

/**
 * Reference images are only accepted as uploaded PNG/JPEG data: URLs, never
 * remote URLs, so the server never fetches anything a user points it at.
 */
export const artReferenceSchema = uploadedImageSchema(
  ART_REFERENCE_MAX_BYTES,
  "Reference image",
);

// ── Photo (photo mode) ────────────────────────────────────────────────────

/**
 * Photo mode's photo: cropped square and downsized to this side in the
 * browser, as JPEG (image-utils.ts preparePhotoImage), so it arrives at the
 * size the art is made at. Never stored or logged: it goes to the model and
 * is dropped.
 */
export const ART_PHOTO_MAX_SIDE = 1024;
/** Largest photo the client sends; a 1024 px JPEG is usually far smaller. */
export const ART_PHOTO_MAX_BYTES = 1024 * 1024;

/** Photo mode's photo, as an uploaded PNG/JPEG data: URL. */
export const artPhotoSchema = uploadedImageSchema(ART_PHOTO_MAX_BYTES, "Photo");

// ── Modes ─────────────────────────────────────────────────────────────────

/**
 * How the code sits in the artwork:
 * - "code": the code is the whole picture, with the art painted into its
 *   modules and a plain quiet zone (the original mode)
 * - "scene": a picture is painted from the description first, then the
 *   code is painted into its middle, so the picture runs through the code
 * - "photo": the same, with the user's own photo as the picture
 */
export const ART_MODES = ["code", "scene", "photo"] as const;
export type ArtMode = (typeof ART_MODES)[number];
export const DEFAULT_ART_MODE: ArtMode = "code";

/** Longest quick-look id (the looks themselves are in ./looks.ts). */
export const ART_STYLE_ID_MAX_LENGTH = 40;

/** A quick look (./looks.ts), combined with the description. */
export const artLookIdSchema = z.enum(ART_LOOK_IDS, {
  error: "Pick one of the listed looks",
});

/**
 * The description of the artwork. Optional: a blank one is written for you
 * (lib/ai/art-prompt.ts writeArtPrompt), but one that's typed needs a few
 * words. Blank comes out as undefined.
 */
const artPromptSchema = z
  .string()
  .trim()
  .max(ART_PROMPT_MAX_LENGTH)
  .refine((value) => value === "" || value.length >= ART_PROMPT_MIN_LENGTH, {
    message: "Describe the artwork in a few more words, or leave it blank",
  })
  .optional()
  .transform((value) => value || undefined);

/** Photo mode needs a photo, and only photo mode takes one. */
function checkPhoto(
  request: { mode: ArtMode; photo?: string },
  ctx: z.RefinementCtx,
) {
  if (request.mode === "photo" && !request.photo) {
    ctx.addIssue({
      code: "custom",
      path: ["photo"],
      message: "Add a photo to paint the code into",
    });
  }
  if (request.mode !== "photo" && request.photo) {
    ctx.addIssue({
      code: "custom",
      path: ["photo"],
      message: "A photo is only used in photo mode",
    });
  }
}

/**
 * Scene mode's picture between its two steps (POST /api/ai/art/picture,
 * then /api/ai/art): sealed on the server (lib/ai/art-seal.ts), so the
 * client carries it without being able to see it. At most a 1 MB JPEG,
 * base64url, plus the seal's own few hundred bytes.
 */
export const ART_PICTURE_SEAL_MAX_LENGTH =
  Math.ceil((ART_PHOTO_MAX_BYTES * 4) / 3) + 1024;
const artPictureSealSchema = z
  .string()
  .max(ART_PICTURE_SEAL_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/, "Not a picture from QRdx");

/** Only scene mode takes a sealed picture. */
function checkPicture(
  request: { mode: ArtMode; picture?: string },
  ctx: z.RefinementCtx,
) {
  if (request.mode !== "scene" && request.picture) {
    ctx.addIssue({
      code: "custom",
      path: ["picture"],
      message: "A picture is only used in scene mode",
    });
  }
}

// ── Requests and responses ────────────────────────────────────────────────

const aiArtRequestFields = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Enter a link or text to encode")
    .max(ART_TEXT_MAX_LENGTH),
  prompt: artPromptSchema,
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
  mode: z.enum(ART_MODES).default(DEFAULT_ART_MODE),
  /** A quick look (./looks.ts) combined with the description */
  style: artLookIdSchema.optional(),
  /** Photo mode: the uploaded picture the code is painted into */
  photo: artPhotoSchema.optional(),
  /**
   * Scene mode in the app: the sealed picture from POST /api/ai/art/picture.
   * Without it, the picture is made in the same request (the REST API).
   */
  picture: artPictureSealSchema.optional(),
});

export const aiArtRequestSchema = aiArtRequestFields.superRefine(
  (request, ctx) => {
    checkPhoto(request, ctx);
    checkPicture(request, ctx);
  },
);
export type AIArtRequest = z.input<typeof aiArtRequestSchema>;
/** A request after validation, defaults filled in. */
export type ParsedAIArtRequest = z.output<typeof aiArtRequestSchema>;

/**
 * "Write one for me" (POST /api/ai/art/describe): what the description is
 * for. `hint` is whatever is in the description box already.
 */
export const artDescribeRequestSchema = z
  .object({
    mode: z.enum(ART_MODES).default(DEFAULT_ART_MODE),
    style: artLookIdSchema.optional(),
    photo: artPhotoSchema.optional(),
    hint: z
      .string()
      .trim()
      .max(ART_PROMPT_MAX_LENGTH)
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine(checkPhoto);
export type ArtDescribeRequest = z.input<typeof artDescribeRequestSchema>;
export type ParsedArtDescribeRequest = z.output<
  typeof artDescribeRequestSchema
>;

/**
 * Scene mode's first step (POST /api/ai/art/picture): the picture for the
 * art's description and look, made before the code is painted into it.
 */
export const artPictureRequestSchema = aiArtRequestFields
  .pick({ text: true, prompt: true, negativePrompt: true, style: true })
  .extend({ mode: z.literal("scene").default("scene") });
export type ArtPictureRequest = z.input<typeof artPictureRequestSchema>;

/** POST /api/ai/art/picture's answer: the picture, sealed. */
export interface ArtPictureResult {
  picture: string;
  /** The description QRdx wrote, when the request had none */
  writtenPrompt?: string;
}

/** POST /api/ai/art/describe's answer. */
export interface ArtDescribeResult {
  prompt: string;
}

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
  /** How the code sits in the artwork */
  mode: ArtMode;
  /** Exactly what the QR code encodes, for the client-side scan score. */
  text: string;
  visibility: number;
  creativity: number;
  /** The description QRdx wrote, when the request had none */
  writtenPrompt?: string;
  credits: AIArtCredits | null;
}
