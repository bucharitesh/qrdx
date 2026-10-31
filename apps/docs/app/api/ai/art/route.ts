import { type NextRequest, NextResponse } from "next/server";
import type { AIArtResult } from "@/components/sections/ai-art/config";
import {
  ART_MODEL_ID,
  aiArtRequestSchema,
  assertArtConfigured,
  assertArtDailyLimit,
  enforceArtRateLimit,
  MAX_ART_REQUEST_BODY_BYTES,
  type QRArtImage,
  renderControlImage,
  runArtModel,
} from "@/lib/ai/art";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { getCurrentUserId, logError } from "@/lib/shared";
import {
  finalizeAIRequest,
  releaseAIRequest,
  reserveAIRequest,
} from "@/lib/subscription";

// runArtModel gives up (and refunds) before this limit.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    assertArtConfigured();
    const userId = await getCurrentUserId(req);
    await enforceArtRateLimit(req, userId);

    const { text, prompt, creativity, seed } = parseWithSchema(
      aiArtRequestSchema,
      await readJsonBody(req, MAX_ART_REQUEST_BODY_BYTES),
    );

    // Rendered before a credit is reserved, so a render failure costs nothing.
    const controlImage = await renderControlImage(text);
    const usageId = await reserveAIRequest(userId, ART_MODEL_ID);

    let image: QRArtImage;
    try {
      await assertArtDailyLimit(userId);
      image = await runArtModel({
        controlImage,
        prompt,
        creativity,
        seed,
        signal: req.signal,
      });
    } catch (error) {
      await releaseAIRequest(usageId).catch((releaseError) =>
        logError(releaseError as Error, { action: "releaseAIRequest" }),
      );
      throw error;
    }

    await finalizeAIRequest(usageId, {}).catch((finalizeError) =>
      logError(finalizeError as Error, { action: "finalizeAIRequest" }),
    );

    const result: AIArtResult = {
      imageUrl: image.url,
      width: image.width,
      height: image.height,
      seed: image.seed,
      text,
      creativity,
    };
    return NextResponse.json(result);
  } catch (error) {
    if (req.signal.aborted) {
      return new Response("Request aborted by user", { status: 499 });
    }

    return handleError(error, { route: "/api/ai/art" });
  }
}
