import "server-only";

import { generateText } from "ai";
import sharp from "sharp";
import {
  ART_NEGATIVE_PROMPT_MAX_LENGTH,
  ART_PROMPT_MAX_LENGTH,
  type ArtMode,
} from "@/components/sections/ai-art/config";
import {
  type ArtLookId,
  findArtLook,
} from "@/components/sections/ai-art/looks";
import { HttpError } from "@/lib/error-response";
import { logError } from "@/lib/shared";
import { textProviderOptions } from "./models";
import { languageModel } from "./providers";

// What AI QR art asks the art model for, before the pipeline's own scan
// rules (lib/ai/art-image.ts buildArtPrompt): the description with a quick
// look added, and "Write one for me", a description written by the small
// text model when there isn't one. lib/ai/art-run.ts calls both, so the
// playground, the studio, the REST API and the MCP server all get them.

// ── Quick looks ────────────────────────────────────────────────────────────

export interface ComposedArtPrompt {
  prompt: string;
  /** The look's things to avoid, when it has any */
  avoid?: string;
}

const withoutEndPunctuation = (text: string) =>
  text.trim().replace(/[\s.,;:]+$/, "");

/**
 * The description with the look's words after it ("a koi pond in the rain,
 * painted in loose watercolor …"). No look, or an unknown one, leaves the
 * description as it is.
 */
export function composeArtPrompt(
  description: string,
  lookId?: string | null,
): ComposedArtPrompt {
  const look = findArtLook(lookId);
  const base = withoutEndPunctuation(description);
  if (!look) return { prompt: base };
  return {
    prompt: base ? `${base}, ${look.words}` : look.words,
    ...(look.avoid && { avoid: look.avoid }),
  };
}

/** The person's things to avoid plus the look's, within the usual limit. */
export function composeAvoid(
  negativePrompt: string | undefined,
  lookAvoid: string | undefined,
): string | undefined {
  const parts = [negativePrompt, lookAvoid]
    .map((part) => (part ? withoutEndPunctuation(part) : ""))
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  const joined = parts.join(", ");
  // The person's own words come first and are already within the limit.
  return joined.length <= ART_NEGATIVE_PROMPT_MAX_LENGTH
    ? joined
    : parts[0]?.slice(0, ART_NEGATIVE_PROMPT_MAX_LENGTH);
}

// ── Write one for me ──────────────────────────────────────────────────────

/** Longest description the writer is asked for, in words. */
const WRITTEN_WORDS = 45;
/** Plenty for WRITTEN_WORDS; anything longer is cut, never paid for. */
const WRITER_MAX_OUTPUT_TOKENS = 120;
/** Well under the art route's 60 s, which still has the image to make. */
export const ART_WRITER_TIMEOUT_MS = 8000;
/** The photo goes to the text model this size at most, as a JPEG. */
const WRITER_PHOTO_SIDE = 384;

export const ART_WRITER_INSTRUCTIONS = [
  "You write the description for an AI artwork that has a working QR code painted into it.",
  `Reply with one concrete description: a subject, a setting and the light, in one or two sentences and at most ${WRITTEN_WORDS} words.`,
  "Never include text, letters, numbers, signs, logos, brands, artists' names, real people or famous characters.",
  "Reply with the description only: no quotes, no title, no preamble.",
].join("\n");

const MODE_GUIDANCE: Record<ArtMode, string> = {
  code: "The picture is painted into the squares of the QR code itself, so choose a scene full of texture and clear light and dark areas, not one small subject on a plain background.",
  scene:
    "A picture is painted first, then the QR code is painted into its middle, in its own colors, so describe one scene with a clear subject near the middle and rich light and shadow there.",
  photo:
    "The QR code is painted into the middle of the attached photo, in its own colors. Describe what matters in it (the main subject, the setting, the colors and the light) so the artwork keeps it, then the mood it should have.",
};

export interface WriteArtPromptInput {
  mode: ArtMode;
  /** The quick look the description goes with */
  look?: ArtLookId | null;
  /** Photo mode: the uploaded PNG/JPEG data URL (sent downscaled, never kept) */
  photo?: string;
  /** Whatever is in the description box already */
  hint?: string;
  signal?: AbortSignal;
}

/** One call to the text model: the request as `generateText` takes it. */
export interface ArtWriterCall {
  instructions: string;
  text: string;
  /** The photo, downscaled to a JPEG */
  image?: Uint8Array;
  signal: AbortSignal;
}

export type ArtWriter = (call: ArtWriterCall) => Promise<string>;

/** Claude Haiku through the gateway (AI_MODELS["prompt-enhancement"]). */
const gatewayWriter: ArtWriter = async ({
  instructions,
  text,
  image,
  signal,
}) => {
  const result = await generateText({
    model: languageModel("prompt-enhancement"),
    instructions,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text },
          ...(image
            ? [{ type: "file" as const, data: image, mediaType: "image/jpeg" }]
            : []),
        ],
      },
    ],
    maxOutputTokens: WRITER_MAX_OUTPUT_TOKENS,
    // Without it the model can spend the whole budget thinking.
    reasoning: "none",
    maxRetries: 1,
    providerOptions: textProviderOptions("prompt-enhancement"),
    abortSignal: signal,
  });
  return result.text;
};

/** The user message: the mode, the look and the hint. */
export function artWriterText({
  mode,
  look,
  hint,
}: Pick<WriteArtPromptInput, "mode" | "look" | "hint">): string {
  const picked = findArtLook(look);
  const lines = [MODE_GUIDANCE[mode]];
  if (picked) {
    lines.push(
      `The look "${picked.label}" (${picked.words}) is added separately: choose a subject that suits it, and don't name a style or medium yourself.`,
    );
  }
  lines.push(
    hint
      ? `Build on this idea, keeping what it asks for: ${hint}`
      : "Surprise me with something beautiful.",
  );
  return lines.join("\n");
}

/**
 * The model's reply as a description: one line, without quotes or a label,
 * at most ART_PROMPT_MAX_LENGTH characters, cut at a word.
 */
export function cleanWrittenPrompt(reply: string): string {
  let text = reply
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(description|prompt)\s*:\s*/i, "")
    .replace(/^["“'`]+|["”'`]+$/g, "")
    .trim();
  if (text.length > ART_PROMPT_MAX_LENGTH) {
    const cut = text.slice(0, ART_PROMPT_MAX_LENGTH + 1);
    const space = cut.lastIndexOf(" ");
    text = cut.slice(0, space > 0 ? space : ART_PROMPT_MAX_LENGTH);
    text = withoutEndPunctuation(text);
  }
  return text;
}

/** The photo, small, as a JPEG: enough to describe, cheap to send. */
async function photoForWriter(photo: string): Promise<Uint8Array> {
  try {
    const bytes = Buffer.from(photo.slice(photo.indexOf(",") + 1), "base64");
    return new Uint8Array(
      await sharp(bytes)
        .rotate()
        .resize(WRITER_PHOTO_SIDE, WRITER_PHOTO_SIDE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 80 })
        .toBuffer(),
    );
  } catch {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "QRdx couldn't read this photo. Try a PNG or JPG.",
    );
  }
}

const writerFailed = () =>
  new HttpError(
    502,
    "AI_ART_DESCRIBE_FAILED",
    "Couldn't write a description. Please try again, or write your own.",
  );

/**
 * A description for AI QR art, written by the small text model: one
 * concrete scene that suits the mode and the look, building on `hint`. In
 * photo mode it describes what matters in the photo, which is sent
 * downscaled and never kept or logged. Never uses an art credit.
 */
export async function writeArtPrompt(
  { mode, look, photo, hint, signal }: WriteArtPromptInput,
  {
    write = gatewayWriter,
    timeoutMs = ART_WRITER_TIMEOUT_MS,
  }: { write?: ArtWriter; timeoutMs?: number } = {},
): Promise<string> {
  const image =
    mode === "photo" && photo ? await photoForWriter(photo) : undefined;
  const deadline = AbortSignal.timeout(timeoutMs);
  let reply: string;
  try {
    reply = await write({
      instructions: ART_WRITER_INSTRUCTIONS,
      text: artWriterText({ mode, look, hint }),
      image,
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    // The error only: never the photo or the request.
    logError(error as Error, { action: "writeArtPrompt", mode });
    throw writerFailed();
  }
  const prompt = cleanWrittenPrompt(reply);
  if (prompt.split(" ").length < 2) throw writerFailed();
  return prompt;
}
