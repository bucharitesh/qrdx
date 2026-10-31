import { randomInt } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import {
  type AIArtResult,
  ART_MAX_SEED,
  aiArtRequestSchema,
  seedsForRun,
} from "@/components/sections/ai-art/config";
import {
  ART_MODEL_ID,
  assertArtConfigured,
  enforceArtRateLimit,
  MAX_ART_REQUEST_BODY_BYTES,
  releaseArtCredits,
  renderControlImage,
  reserveArtCredits,
  runArtVariants,
} from "@/lib/ai/art";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";

// runArtVariants gives up (and refunds) before this limit.
export const maxDuration = 60;

const randomUnit = () => randomInt(ART_MAX_SEED) / ART_MAX_SEED;

export async function POST(req: NextRequest) {
  try {
    assertArtConfigured();
    const scope = await getActiveScope(req.headers);
    await enforceArtRateLimit(req, scope.userId);

    const request = parseWithSchema(
      aiArtRequestSchema,
      await readJsonBody(req, MAX_ART_REQUEST_BODY_BYTES),
    );

    // Rendered before credits are reserved, so a render failure costs nothing.
    const controlImage = await renderControlImage(
      request.text,
      request.reference,
    );
    const seeds = seedsForRun(request.variations, request.seed, randomUnit);
    const { usageIds, credits } = await reserveArtCredits(
      scope,
      seeds.length,
      ART_MODEL_ID,
    );

    const outcomes = await runArtVariants({
      controlImage,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt || undefined,
      visibility: request.visibility,
      creativity: request.creativity,
      seeds,
      signal: req.signal,
    });

    // Only images that were actually delivered use credits.
    const failedIds = usageIds.filter((_, index) => !outcomes[index]?.ok);
    await releaseArtCredits(failedIds).catch((releaseError) =>
      logError(releaseError as Error, { action: "releaseArtCredits" }),
    );
    const variants = outcomes.flatMap((outcome) =>
      outcome.ok ? [outcome.variant] : [],
    );
    if (variants.length === 0) {
      const firstFailure = outcomes.find((outcome) => !outcome.ok);
      throw firstFailure && !firstFailure.ok
        ? firstFailure.error
        : new Error("No variants generated");
    }

    const result: AIArtResult = {
      variants,
      failed: failedIds.length,
      text: request.text,
      visibility: request.visibility,
      creativity: request.creativity,
      credits: {
        ...credits,
        used: credits.used - failedIds.length,
        remaining:
          credits.remaining === null
            ? null
            : credits.remaining + failedIds.length,
      },
    };
    return NextResponse.json(result);
  } catch (error) {
    if (req.signal.aborted) {
      return new Response("Request aborted by user", { status: 499 });
    }

    return handleError(error, { route: "/api/ai/art" });
  }
}
