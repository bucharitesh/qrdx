import type { NextRequest } from "next/server";
import {
  assertJson,
  NO_STORE,
  resolveApiCaller,
  resolveApiScope,
} from "@/app/api/v1/codes/_lib/api";
import { confirmationNeededFor } from "@/lib/account/confirmation-scope";
import { withApiUsage } from "@/lib/analytics/usage";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { HttpError, handleError } from "@/lib/error-response";
import { createEndpoint, listEndpoints } from "@/lib/events/endpoints";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { canSeeHookUrls, serializeHook, subscribeSchema } from "./_lib/hooks";

// REST Hooks (Zapier, Make, n8n): subscribe = POST, unsubscribe = DELETE
// /api/v1/hooks/{id}. Subscriptions are ordinary webhook endpoints, so they
// show up (and can be removed) in Dashboard → Webhooks too. Business plan.

const MAX_BODY_BYTES = 16 * 1024;

const handleGET = withApiQuotaHeaders(async (req: NextRequest) => {
  try {
    const caller = await resolveApiCaller(req, "read");
    const hooks = await listEndpoints(caller.scope);
    const revealUrl = canSeeHookUrls(caller);
    return Response.json(
      { data: hooks.map((hook) => serializeHook(hook, { revealUrl })) },
      { headers: NO_STORE },
    );
  } catch (error) {
    return handleError(error, { route: "GET /api/v1/hooks" });
  }
});

/** Returns the signing secret once; it verifies X-QRdx-Signature. */
const handlePOST = withApiQuotaHeaders(async (req: NextRequest) => {
  try {
    const scope = await resolveApiScope(req, "write");
    assertJson(req);
    // From a signed-in browser (no API key or OAuth token), a new endpoint
    // asks "Confirm it's you" first, as in the dashboard. A key or token
    // can't confirm; making one already asked.
    if (!req.headers.get("authorization")?.startsWith("Bearer ")) {
      if (await confirmationNeededFor(scope)) {
        throw new HttpError(
          403,
          "CONFIRMATION_REQUIRED",
          "Confirm it's you first, then try again.",
        );
      }
    }
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
});

// Counted with the API's requests (lib/analytics/usage.ts).
export const GET = withApiUsage("hooks", handleGET);
export const POST = withApiUsage("hooks", handlePOST);
