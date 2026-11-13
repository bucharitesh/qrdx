import "server-only";

import { randomInt } from "node:crypto";
import {
  type AIArtResult,
  ART_MAX_SEED,
  type ParsedAIArtRequest,
} from "@/components/sections/ai-art/config";
import {
  ART_MODEL_ID,
  type ArtScope,
  enforceArtRateLimit,
  releaseArtCredits,
  reserveArtCredits,
} from "@/lib/ai/art";
import { generateArtVariant, renderControlImage } from "@/lib/ai/art-image";
import { logError } from "@/lib/shared";

// One AI art image for a validated request, shared by every way in: the
// playground and studio (/api/ai/art), the REST API and the MCP server. The
// caller checks that AI art is configured, authenticates and parses the
// request; this applies the rate limit, reserves one credit from the scope's
// monthly allowance and refunds it unless a scannable image is delivered.

export interface RunArtOptions {
  scope: ArtScope;
  request: ParsedAIArtRequest;
  /** The incoming request, for the per-IP rate limit */
  req: Request;
  signal: AbortSignal;
}

export async function runArt({
  scope,
  request,
  req,
  signal,
}: RunArtOptions): Promise<AIArtResult> {
  await enforceArtRateLimit(req, scope.userId);

  // Rendered before the credit is reserved, so a render failure costs nothing.
  const control = await renderControlImage(request.text);
  const seed = request.seed ?? randomInt(ART_MAX_SEED);
  const { usageIds, credits } = await reserveArtCredits(scope, 1, ART_MODEL_ID);

  // Only a delivered, scannable image uses the credit.
  let variant: AIArtResult["variant"];
  try {
    variant = await generateArtVariant({
      text: request.text,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt || undefined,
      visibility: request.visibility,
      creativity: request.creativity,
      seed,
      reference: request.reference,
      mode: request.mode,
      photo: request.photo,
      control,
      signal,
    });
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
    credits,
  };
}
