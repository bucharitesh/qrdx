import { randomInt } from "node:crypto";
import { createRateLimiter, fixedWindow } from "@repo/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import {
  ART_MAX_SEED,
  type ArtPictureResult,
  artPictureRequestSchema,
} from "@/components/sections/ai-art/config";
import { env } from "@/env";
import {
  AI_ART_DAILY_LIMIT,
  assertArtConfigured,
  assertArtCreditsLeft,
  enforceArtRateLimit,
  MAX_ART_REQUEST_BODY_BYTES,
} from "@/lib/ai/art";
import { ART_MODEL_TIMEOUT_MS } from "@/lib/ai/art-image";
import { makeScenePicture } from "@/lib/ai/art-picture";
import {
  composeArtPrompt,
  composeAvoid,
  writeArtPrompt,
} from "@/lib/ai/art-prompt";
import { sealPicture } from "@/lib/ai/art-seal";
import { handleError } from "@/lib/error-response";
import {
  enforceRateLimits,
  parseWithSchema,
  readJsonBody,
} from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";

// The picture call gives up before this limit.
export const maxDuration = 60;

// Twice the art's daily cap per user (UTC day): a picture is free, and each
// one is painted at most a few times, so this keeps the free step bounded
// without counting it as a credit.
const dailyLimiter = createRateLimiter({
  limiter: fixedWindow(2 * AI_ART_DAILY_LIMIT, "1 d"),
});

/**
 * Scene mode's first step: the picture for the description and look, made
 * before the code is painted into it (POST /api/ai/art with `picture`). It
 * comes back sealed (lib/ai/art-seal.ts): nothing in it is usable on its
 * own, and the credit is used only when the art is delivered. Signed in,
 * with an image left this month; it doesn't reserve one.
 */
export async function POST(req: NextRequest) {
  try {
    assertArtConfigured();
    const scope = await getActiveScope(req.headers);
    await enforceArtRateLimit(req, scope.userId);
    await enforceRateLimits([
      { limiter: dailyLimiter, key: `ai-art-picture:day:${scope.userId}` },
    ]);
    const request = parseWithSchema(
      artPictureRequestSchema,
      await readJsonBody(req, MAX_ART_REQUEST_BODY_BYTES),
    );
    await assertArtCreditsLeft(scope);

    const started = Date.now();
    const writtenPrompt =
      request.prompt === undefined
        ? await writeArtPrompt({
            mode: "scene",
            look: request.style,
            signal: req.signal,
          })
        : undefined;
    const composed = composeArtPrompt(
      request.prompt ?? writtenPrompt ?? "",
      request.style,
    );
    const picture = await makeScenePicture({
      prompt: composed.prompt,
      negativePrompt: composeAvoid(request.negativePrompt, composed.avoid),
      seed: randomInt(ART_MAX_SEED),
      signal: req.signal,
      timeoutMs: ART_MODEL_TIMEOUT_MS - (Date.now() - started),
    });
    const result: ArtPictureResult = {
      picture: sealPicture(
        picture,
        { userId: scope.userId, text: request.text, mode: "scene" },
        env.BETTER_AUTH_SECRET,
      ),
      ...(writtenPrompt && { writtenPrompt }),
    };
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (req.signal.aborted) {
      return new Response("Request aborted by user", { status: 499 });
    }
    return handleError(error, { route: "/api/ai/art/picture" });
  }
}
