import { type NextRequest, NextResponse } from "next/server";
import { aiArtRequestSchema } from "@/components/sections/ai-art/config";
import { assertArtConfigured, MAX_ART_REQUEST_BODY_BYTES } from "@/lib/ai/art";
import { runArt } from "@/lib/ai/art-run";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";

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
    const request = parseWithSchema(
      aiArtRequestSchema,
      await readJsonBody(req, MAX_ART_REQUEST_BODY_BYTES),
    );
    const result = await runArt({ scope, request, req, signal: req.signal });
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
