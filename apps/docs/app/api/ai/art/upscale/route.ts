import { type NextRequest, NextResponse } from "next/server";
import {
  type AIArtUpscaleResult,
  aiArtUpscaleRequestSchema,
} from "@/components/sections/ai-art/config";
import {
  ART_UPSCALE_MODEL_ID,
  assertArtConfigured,
  enforceArtRateLimit,
  MAX_ART_UPSCALE_BODY_BYTES,
  releaseArtCredits,
  reserveArtCredits,
  upscaleArtImage,
} from "@/lib/ai/art";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";

export const maxDuration = 60;

/** 2× print upscale of a generated image; uses one AI art credit. */
export async function POST(req: NextRequest) {
  try {
    assertArtConfigured();
    const scope = await getActiveScope(req.headers);
    await enforceArtRateLimit(req, scope.userId);

    const { imageUrl } = parseWithSchema(
      aiArtUpscaleRequestSchema,
      await readJsonBody(req, MAX_ART_UPSCALE_BODY_BYTES),
    );

    const { usageIds, credits } = await reserveArtCredits(
      scope,
      1,
      ART_UPSCALE_MODEL_ID,
    );
    let image: Awaited<ReturnType<typeof upscaleArtImage>>;
    try {
      image = await upscaleArtImage({ imageUrl, signal: req.signal });
    } catch (error) {
      await releaseArtCredits(usageIds).catch((releaseError) =>
        logError(releaseError as Error, { action: "releaseArtCredits" }),
      );
      throw error;
    }

    const result: AIArtUpscaleResult = { ...image, credits };
    return NextResponse.json(result);
  } catch (error) {
    if (req.signal.aborted) {
      return new Response("Request aborted by user", { status: 499 });
    }
    return handleError(error, { route: "/api/ai/art/upscale" });
  }
}
