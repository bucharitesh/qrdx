import type { NextRequest } from "next/server";
import {
  assertJson,
  NO_STORE,
  resolveApiScope,
} from "@/app/api/v1/codes/_lib/api";
import { handleError } from "@/lib/error-response";
import { createEndpoint, listEndpoints } from "@/lib/events/endpoints";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { serializeHook, subscribeSchema } from "./_lib/hooks";

// REST Hooks (Zapier, Make, n8n): subscribe = POST, unsubscribe = DELETE
// /api/v1/hooks/{id}. Subscriptions are ordinary webhook endpoints, so they
// show up (and can be removed) in Dashboard → Webhooks too. Business plan.

const MAX_BODY_BYTES = 16 * 1024;

export async function GET(req: NextRequest) {
  try {
    const scope = await resolveApiScope(req, "read");
    const hooks = await listEndpoints(scope);
    return Response.json(
      { data: hooks.map(serializeHook) },
      { headers: NO_STORE },
    );
  } catch (error) {
    return handleError(error, { route: "GET /api/v1/hooks" });
  }
}

/** Returns the signing secret once; it verifies X-QRdx-Signature. */
export async function POST(req: NextRequest) {
  try {
    const scope = await resolveApiScope(req, "write");
    assertJson(req);
    const body = parseWithSchema(
      subscribeSchema,
      await readJsonBody(req, MAX_BODY_BYTES),
    );
    const { endpoint, secret } = await createEndpoint(scope, {
      url: body.url,
      events: body.events,
    });
    return Response.json(
      { ...serializeHook(endpoint), secret },
      { status: 201, headers: NO_STORE },
    );
  } catch (error) {
    return handleError(error, { route: "POST /api/v1/hooks" });
  }
}
