import type { NextRequest } from "next/server";
import { NO_STORE, resolveApiScope } from "@/app/api/v1/codes/_lib/api";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { handleError } from "@/lib/error-response";
import { parseWithSchema } from "@/lib/request-guards";
import { hookSampleQuerySchema, recentSamples } from "../_lib/hooks";

/**
 * Zapier "perform list": an array of payloads shaped exactly like real
 * deliveries (recent data when the workspace has some), newest first.
 */
export const GET = withApiQuotaHeaders(async (req: NextRequest) => {
  try {
    const scope = await resolveApiScope(req, "read");
    const { event } = parseWithSchema(
      hookSampleQuerySchema,
      Object.fromEntries(req.nextUrl.searchParams),
    );
    return Response.json(await recentSamples(scope, event), {
      headers: NO_STORE,
    });
  } catch (error) {
    return handleError(error, { route: "GET /api/v1/hooks/sample" });
  }
});
