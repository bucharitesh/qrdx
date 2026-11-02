import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  NO_STORE,
  resolveApiCaller,
  resolveApiScope,
} from "@/app/api/v1/codes/_lib/api";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { handleError } from "@/lib/error-response";
import { deleteEndpoint, getEndpoint } from "@/lib/events/endpoints";
import { parseWithSchema } from "@/lib/request-guards";
import { canSeeHookUrls, serializeHook } from "../_lib/hooks";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().trim().min(1).max(64);

export const GET = withApiQuotaHeaders(
  async (req: NextRequest, { params }: Context) => {
    try {
      const caller = await resolveApiCaller(req, "read");
      const id = parseWithSchema(idSchema, (await params).id);
      return Response.json(
        {
          data: serializeHook(await getEndpoint(caller.scope, id), {
            revealUrl: canSeeHookUrls(caller),
          }),
        },
        { headers: NO_STORE },
      );
    } catch (error) {
      return handleError(error, { route: "GET /api/v1/hooks/[id]" });
    }
  },
);

/** REST Hooks unsubscribe (Zapier calls this when a Zap is turned off). */
export const DELETE = withApiQuotaHeaders(
  async (req: NextRequest, { params }: Context) => {
    try {
      const scope = await resolveApiScope(req, "write");
      const id = parseWithSchema(idSchema, (await params).id);
      await deleteEndpoint(scope, id);
      return new Response(null, { status: 204, headers: NO_STORE });
    } catch (error) {
      return handleError(error, { route: "DELETE /api/v1/hooks/[id]" });
    }
  },
);
