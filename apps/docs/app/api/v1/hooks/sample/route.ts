import type { NextRequest } from "next/server";
import { z } from "zod";
import { NO_STORE, resolveApiScope } from "@/app/api/v1/codes/_lib/api";
import { handleError } from "@/lib/error-response";
import { WEBHOOK_EVENTS } from "@/lib/events/types";
import { parseWithSchema } from "@/lib/request-guards";
import { recentSamples } from "../_lib/hooks";

const querySchema = z.object({ event: z.enum(WEBHOOK_EVENTS) });

/**
 * Zapier "perform list": an array of payloads shaped exactly like real
 * deliveries (recent data when the workspace has some), newest first.
 */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveApiScope(req, "read");
    const { event } = parseWithSchema(
      querySchema,
      Object.fromEntries(req.nextUrl.searchParams),
    );
    return Response.json(await recentSamples(scope, event), {
      headers: NO_STORE,
    });
  } catch (error) {
    return handleError(error, { route: "GET /api/v1/hooks/sample" });
  }
}
