import { NextResponse } from "next/server";
import { z } from "zod";
import { providerReadLimiter } from "@/lib/connected-accounts/server";
import { dataErrorResponse, requireUser } from "@/lib/data-connections/http";
import { listSourceItems } from "@/lib/data-connections/server";

type RouteContext = { params: Promise<{ provider: string }> };

const querySchema = z.object({
  cursor: z.string().max(512).optional(),
  search: z.string().trim().max(100).optional(),
  /** YouTube channel / Spotify profile for the no-connection sources */
  query: z.string().trim().max(300).optional(),
});

/** GET /api/integrations/sources/<provider> — one page of pickable items. */
export async function GET(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const user = await requireUser(
    providerReadLimiter,
    `integrations:sources:${provider}`,
  );
  if ("response" in user) return user.response;

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = querySchema.safeParse(params);
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid request", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  try {
    const page = await listSourceItems(user.userId, provider, {
      cursor: query.data.cursor || undefined,
      search: query.data.search || undefined,
      query: query.data.query || undefined,
    });
    return NextResponse.json(page, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return dataErrorResponse(error, {
      userId: user.userId,
      provider,
      action: "list",
    });
  }
}
