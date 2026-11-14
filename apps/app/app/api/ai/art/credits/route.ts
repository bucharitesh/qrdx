import { type NextRequest, NextResponse } from "next/server";
import type { AIArtCreditsResponse } from "@/components/sections/ai-art/config";
import { getArtCredits, isArtConfigured } from "@/lib/ai/art";
import { handleError } from "@/lib/error-response";
import { getActiveScope } from "@/lib/scope";
import { UnauthorizedError } from "@/types/errors";

/** This month's AI art allowance for the active workspace. */
export async function GET(req: NextRequest) {
  try {
    if (!isArtConfigured) {
      return NextResponse.json<AIArtCreditsResponse>({
        configured: false,
        credits: null,
      });
    }
    let scope: Awaited<ReturnType<typeof getActiveScope>>;
    try {
      scope = await getActiveScope(req.headers);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json<AIArtCreditsResponse>({
          configured: true,
          credits: null,
        });
      }
      throw error;
    }
    return NextResponse.json<AIArtCreditsResponse>(
      { configured: true, credits: await getArtCredits(scope) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleError(error, { route: "/api/ai/art/credits" });
  }
}
