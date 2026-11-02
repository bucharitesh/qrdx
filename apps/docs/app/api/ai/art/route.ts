import { randomInt } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import {
  type AIArtResult,
  ART_MAX_SEED,
  aiArtRequestSchema,
} from "@/components/sections/ai-art/config";
import {
  ART_MODEL_ID,
  assertArtConfigured,
  enforceArtRateLimit,
  MAX_ART_REQUEST_BODY_BYTES,
  releaseArtCredits,
  reserveArtCredits,
} from "@/lib/ai/art";
import { generateArtVariant, renderControlImage } from "@/lib/ai/art-image";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";

// The art model call gives up (and the credit is refunded) before this limit.
export const maxDuration = 60;

/**
 * One AI art image, verified on the server to scan to `text`. Variations are
 * one request each, so every response stays well under the body size limit.
 */
export async function POST(req: NextRequest) {
  try {
    assertArtConfigured();
    const scope = await getActiveScope(req.headers);
    await enforceArtRateLimit(req, scope.userId);

    const request = parseWithSchema(
      aiArtRequestSchema,
      await readJsonBody(req, MAX_ART_REQUEST_BODY_BYTES),
    );

    // Rendered before the credit is reserved, so a render failure costs nothing.
    const control = await renderControlImage(request.text);
    const seed = request.seed ?? randomInt(ART_MAX_SEED);
    const { usageIds, credits } = await reserveArtCredits(
      scope,
      1,
      ART_MODEL_ID,
    );

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
        control,
        signal: req.signal,
      });
    } catch (error) {
      await releaseArtCredits(usageIds).catch((releaseError) =>
        logError(releaseError as Error, { action: "releaseArtCredits" }),
      );
      throw error;
    }

    const result: AIArtResult = {
      variant,
      text: request.text,
      visibility: request.visibility,
      creativity: request.creativity,
      credits,
    };
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (req.signal.aborted) {
      return new Response("Request aborted by user", { status: 499 });
    }

    return handleError(error, { route: "/api/ai/art" });
  }
}
