import type { NextRequest } from "next/server";
import { getCommunityItem, UNTRUSTED_NOTICE } from "@/lib/community/api";
import { HttpError, handleError } from "@/lib/error-response";
import { ValidationError } from "@/types/errors";
import {
  COMMUNITY_CACHE,
  COMMUNITY_CORS,
  limitCommunityReads,
  withCommunityCors,
} from "../../_lib/http";
import { communityItemIdSchema } from "../../_lib/schemas";

type Context = { params: Promise<{ id: string }> };

// One published community item, with the style it applies.
export async function GET(req: NextRequest, { params }: Context) {
  try {
    await limitCommunityReads(req);
    const parsed = communityItemIdSchema.safeParse((await params).id);
    if (!parsed.success) {
      throw new ValidationError("Invalid item id", [
        { param: "id", message: parsed.error.issues[0]?.message },
      ]);
    }
    const item = await getCommunityItem(parsed.data);
    if (!item) {
      throw new HttpError(404, "NOT_FOUND", "Community item not found");
    }
    return Response.json(
      { data: item, notice: UNTRUSTED_NOTICE },
      { headers: { ...COMMUNITY_CORS, ...COMMUNITY_CACHE } },
    );
  } catch (error) {
    return withCommunityCors(
      handleError(error, { route: "GET /api/v1/community/items/[id]" }),
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: COMMUNITY_CORS });
}
