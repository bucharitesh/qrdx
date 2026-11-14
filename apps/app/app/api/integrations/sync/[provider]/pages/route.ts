import { z } from "zod";
import { providerReadLimiter } from "@/lib/connected-accounts/server";
import { listFormPages } from "@/lib/data-connections/data";
import {
  dataErrorResponse,
  jsonError,
  requireUser,
} from "@/lib/data-connections/http";
import { parseWithSchema } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";

type RouteContext = { params: Promise<{ provider: string }> };

/** The integrations that send form responses out, page by page. */
const RESPONSE_SINKS = new Set(["hubspot", "mailchimp"]);

const querySchema = z.object({
  /** `nextCursor` from the previous page; omit for the first */
  cursor: z.string().max(160).optional(),
  /** Narrows by page title */
  q: z.string().max(200).optional(),
});

/**
 * GET /api/integrations/sync/<hubspot|mailchimp>/pages — the active
 * workspace's pages that have a form, most recently updated first, a page
 * at a time: `{ items, nextCursor }`. The settings panel loads more of them
 * as it scrolls and searches them by title.
 */
export async function GET(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  if (!RESPONSE_SINKS.has(provider)) {
    return jsonError(404, "NOT_FOUND", "Not a form-response integration.");
  }
  const user = await requireUser(
    providerReadLimiter,
    `integrations:sync:${provider}`,
  );
  if ("response" in user) return user.response;
  try {
    const { cursor, q } = parseWithSchema(
      querySchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const scope = await getActiveScope(request.headers);
    return Response.json(await listFormPages(scope, { cursor, q }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return dataErrorResponse(error, {
      userId: user.userId,
      provider,
      action: "pages",
    });
  }
}
