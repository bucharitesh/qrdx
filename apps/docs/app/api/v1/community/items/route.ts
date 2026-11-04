import type { NextRequest } from "next/server";
import { searchCommunity, UNTRUSTED_NOTICE } from "@/lib/community/api";
import { handleError } from "@/lib/error-response";
import { parseWithSchema } from "@/lib/request-guards";
import {
  COMMUNITY_CACHE,
  COMMUNITY_CORS,
  limitCommunityReads,
  withCommunityCors,
} from "../_lib/http";
import { communityItemsQuerySchema } from "../_lib/schemas";

// Public, read-only: published community frames, themes and collections.
// No key, no quota; cached and limited per IP (../_lib/http.ts).
export async function GET(req: NextRequest) {
  try {
    await limitCommunityReads(req);
    const query = parseWithSchema(
      communityItemsQuerySchema,
      Object.fromEntries(req.nextUrl.searchParams),
    );
    const { items, total } = await searchCommunity(query);
    return Response.json(
      {
        data: items,
        pagination: { total, limit: query.limit, offset: query.offset },
        notice: UNTRUSTED_NOTICE,
      },
      { headers: { ...COMMUNITY_CORS, ...COMMUNITY_CACHE } },
    );
  } catch (error) {
    return withCommunityCors(
      handleError(error, { route: "GET /api/v1/community/items" }),
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: COMMUNITY_CORS });
}
