import "server-only";

import { randomInt } from "node:crypto";
import {
  type AIArtResult,
  ART_MAX_SEED,
  type ParsedAIArtRequest,
} from "@/components/sections/ai-art/config";
import { env } from "@/env";
import {
  ART_MODEL_ID,
  type ArtScope,
  enforceArtRateLimit,
  releaseArtCredits,
  reserveArtCredits,
} from "@/lib/ai/art";
import {
  ART_MODEL_TIMEOUT_MS,
  generateArtVariant,
  renderControlImage,
} from "@/lib/ai/art-image";
import {
  generatePictureVariant,
  makeScenePicture,
  quickPaintModel,
} from "@/lib/ai/art-picture";
import {
  type ArtWriter,
  composeArtPrompt,
  composeAvoid,
  writeArtPrompt,
} from "@/lib/ai/art-prompt";
import { openPicture } from "@/lib/ai/art-seal";
import { HttpError } from "@/lib/error-response";
import { logError } from "@/lib/shared";

// One AI art image for a validated request, shared by every way in: the
// playground and studio (/api/ai/art), the REST API and the MCP server. The
// caller checks that AI art is configured, authenticates and parses the
// request; this applies the rate limit, reserves one credit from the scope's
// monthly allowance and refunds it unless a scannable image is delivered.
// Without a description it writes one first (lib/ai/art-prompt.ts), and it
// adds the quick look, so every way in gets both.
//
// Scene and photo modes paint the code into a picture (lib/ai/art-picture.ts).
// Photo mode's picture is the photo. Scene mode's is made from the
// description: the app makes it in a request of its own (POST
// /api/ai/art/picture) and sends it back sealed; without one (the REST API
// and MCP) it's made here first, and the paint gets the time left.

/** Everything a request does must end by then; the routes allow 60 s. */
const REQUEST_BUDGET_MS = 56_000;
/**
 * Kept back from the model calls for the scan check and least blend (3-6 s
 * measured, and the least blend stops itself at 8 s).
 */
const BLEND_RESERVE_MS = 8000;
/** How long the scene's picture may take within one request. */
const INLINE_PICTURE_TIMEOUT_MS = 25_000;
/** A paint call with less time than this left isn't started. */
const MIN_PAINT_MS = 20_000;

const sceneTimeout = () =>
  new HttpError(
    504,
    "AI_ART_TIMEOUT",
    "Making the picture and painting the code into it took too long. No AI credit was used, please try again, or use code mode, which is faster.",
  );

/** The bytes of an uploaded (base64) data: URL. */
const dataUrlBytes = (url: string) =>
  new Uint8Array(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));

export interface RunArtOptions {
  scope: ArtScope;
  request: ParsedAIArtRequest;
  /** The incoming request, for the per-IP rate limit */
  req: Request;
  signal: AbortSignal;
  /** Writes a missing description (tests pass a fake) */
  write?: ArtWriter;
  /** When the request started, for its time budget (default: now) */
  startedAt?: number;
}

export async function runArt({
  scope,
  request,
  req,
  signal,
  write,
  startedAt = Date.now(),
}: RunArtOptions): Promise<AIArtResult> {
  await enforceArtRateLimit(req, scope.userId);

  // Rendered before the credit is reserved, so a render failure costs nothing.
  const control = await renderControlImage(request.text);
  const seed = request.seed ?? randomInt(ART_MAX_SEED);
  // A sealed picture is opened before the credit is reserved: one that isn't
  // this user's, for this content, or that expired costs nothing (a 400).
  let picture =
    request.mode === "scene" && request.picture
      ? openPicture(
          request.picture,
          { userId: scope.userId, text: request.text, mode: "scene" },
          env.BETTER_AUTH_SECRET,
        )
      : request.mode === "photo" && request.photo
        ? dataUrlBytes(request.photo)
        : undefined;
  const { usageIds, credits } = await reserveArtCredits(scope, 1, ART_MODEL_ID);
  const timeLeft = () =>
    Math.min(
      ART_MODEL_TIMEOUT_MS,
      REQUEST_BUDGET_MS - BLEND_RESERVE_MS - (Date.now() - startedAt),
    );

  // Only a delivered, scannable image uses the credit.
  let variant: AIArtResult["variant"];
  let writtenPrompt: string | undefined;
  try {
    // Written after the credit is reserved, so someone out of credits can't
    // run the writer, and before the art call, which gets the time left.
    if (request.prompt === undefined) {
      writtenPrompt = await writeArtPrompt(
        {
          mode: request.mode,
          look: request.style,
          photo: request.photo,
          signal,
        },
        write ? { write } : undefined,
      );
    }
    const description = request.prompt ?? writtenPrompt ?? "";
    const composed = composeArtPrompt(description, request.style);
    const negativePrompt = composeAvoid(request.negativePrompt, composed.avoid);
    if (request.mode === "scene" && !picture) {
      picture = await makeScenePicture({
        prompt: composed.prompt,
        negativePrompt,
        seed,
        signal,
        timeoutMs: Math.min(INLINE_PICTURE_TIMEOUT_MS, timeLeft()),
      });
      if (timeLeft() < MIN_PAINT_MS) throw sceneTimeout();
    }
    const inlineScene = request.mode === "scene" && !request.picture;
    const shared = {
      text: request.text,
      prompt: composed.prompt,
      negativePrompt,
      visibility: request.visibility,
      creativity: request.creativity,
      seed,
      reference: request.reference,
      control,
      signal,
      timeoutMs: timeLeft(),
    };
    try {
      variant = picture
        ? await generatePictureVariant({
            ...shared,
            picture,
            // A scene made in one request paints at low quality, to fit.
            ...(inlineScene && { model: quickPaintModel }),
          })
        : await generateArtVariant(shared);
    } catch (error) {
      const timedOut =
        error instanceof HttpError && error.code === "AI_ART_TIMEOUT";
      throw inlineScene && timedOut ? sceneTimeout() : error;
    }
  } catch (error) {
    await releaseArtCredits(usageIds).catch((releaseError) =>
      logError(releaseError as Error, { action: "releaseArtCredits" }),
    );
    throw error;
  }

  return {
    variant,
    mode: request.mode,
    text: request.text,
    visibility: request.visibility,
    creativity: request.creativity,
    ...(writtenPrompt && { writtenPrompt }),
    credits,
  };
}
