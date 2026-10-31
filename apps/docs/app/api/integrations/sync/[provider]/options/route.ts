import { z } from "zod";
import { providerReadLimiter } from "@/lib/connected-accounts/server";
import { dataErrorResponse, jsonError, requireUser } from "@/lib/data-connections/http";
import {
  listMailchimpAudiences,
  listMailchimpMergeFields,
} from "@/lib/data-connections/settings";

type RouteContext = { params: Promise<{ provider: string }> };

const audienceSchema = z.string().regex(/^[A-Za-z0-9]{1,32}$/);

/**
 * GET /api/integrations/sync/mailchimp/options — the account's audiences, or
 * with ?audience=<id> that audience's merge fields (for the mapping UI).
 */
export async function GET(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  if (provider !== "mailchimp") {
    return jsonError(404, "NOT_FOUND", "No options for this integration.");
  }
  const user = await requireUser(providerReadLimiter, "integrations:mailchimp-options");
  if ("response" in user) return user.response;
  const audience = new URL(request.url).searchParams.get("audience");
  try {
    if (audience) {
      const parsed = audienceSchema.safeParse(audience);
      if (!parsed.success) {
        return jsonError(400, "VALIDATION_ERROR", "Invalid audience");
      }
      return Response.json({
        mergeFields: await listMailchimpMergeFields(user.userId, parsed.data),
      });
    }
    return Response.json({ audiences: await listMailchimpAudiences(user.userId) });
  } catch (error) {
    return dataErrorResponse(error, {
      userId: user.userId,
      provider,
      action: "options",
    });
  }
}
