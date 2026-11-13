import {
  createRateLimiter,
  fixedWindow,
  slidingWindow,
} from "@repo/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import {
  type ArtDescribeResult,
  artDescribeRequestSchema,
} from "@/components/sections/ai-art/config";
import { assertArtConfigured, MAX_ART_REQUEST_BODY_BYTES } from "@/lib/ai/art";
import { writeArtPrompt } from "@/lib/ai/art-prompt";
import { handleError } from "@/lib/error-response";
import {
  enforceRateLimits,
  getClientIp,
  parseWithSchema,
  readJsonBody,
} from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";

// One short text model call; the writer gives up well before this.
export const maxDuration = 30;

// Per user and per IP like the art route, plus a daily cap per user (UTC
// day): a description is free, so this is what keeps it cheap.
const userLimiter = createRateLimiter({ limiter: slidingWindow(12, "60 s") });
const ipLimiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });
const dailyLimiter = createRateLimiter({ limiter: fixedWindow(60, "1 d") });

/**
 * "Write one for me": a description for AI QR art, for the mode, quick look
 * and photo picked, so people can read and edit it before spending a credit.
 * Signed-in only; never uses an art credit. The photo goes to the model
 * downscaled and is never kept or logged.
 */
export async function POST(req: NextRequest) {
  try {
    assertArtConfigured();
    const scope = await getActiveScope(req.headers);
    await enforceRateLimits([
      { limiter: userLimiter, key: `ai-art-describe:user:${scope.userId}` },
      { limiter: ipLimiter, key: `ai-art-describe:ip:${getClientIp(req)}` },
      { limiter: dailyLimiter, key: `ai-art-describe:day:${scope.userId}` },
    ]);
    const request = parseWithSchema(
      artDescribeRequestSchema,
      await readJsonBody(req, MAX_ART_REQUEST_BODY_BYTES),
    );
    const prompt = await writeArtPrompt({
      mode: request.mode,
      look: request.style,
      photo: request.photo,
      hint: request.hint,
      signal: req.signal,
    });
    return NextResponse.json({ prompt } satisfies ArtDescribeResult, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (req.signal.aborted) {
      return new Response("Request aborted by user", { status: 499 });
    }
    return handleError(error, { route: "/api/ai/art/describe" });
  }
}
