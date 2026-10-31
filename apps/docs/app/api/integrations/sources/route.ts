import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/connected-accounts/server";
import { getSourceStatuses } from "@/lib/data-connections/server";

const contentTypeSchema = z.string().regex(/^[a-z-]{1,32}$/);

/**
 * GET /api/integrations/sources?contentType=url — the content sources for an
 * editor content type and whether each is configured and connected. Works
 * signed out (everything reads "not connected").
 */
export async function GET(request: Request) {
  const contentType = contentTypeSchema.safeParse(
    new URL(request.url).searchParams.get("contentType"),
  );
  if (!contentType.success) {
    return NextResponse.json(
      { error: "Unknown content type", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  const userId = await getSessionUserId();
  return NextResponse.json(
    {
      signedIn: Boolean(userId),
      sources: await getSourceStatuses(userId, contentType.data),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
