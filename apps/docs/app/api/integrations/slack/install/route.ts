import { database as db, member } from "@repo/database";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectLimiter } from "@/lib/connected-accounts/server";
import { requireUser } from "@/lib/data-connections/http";
import { rememberSlackWorkspace } from "@/lib/data-connections/server";
import {
  createIntegrationAuthUrl,
  isOAuthConfigured,
} from "@/lib/integration-oauth";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";

const workspaceSchema = z
  .string()
  .regex(/^(personal|[A-Za-z0-9_-]{1,64})$/)
  .default("personal");

const back = (request: Request, error: string) =>
  NextResponse.redirect(
    new URL(`/settings/integrations/slack?error=${error}`, request.url),
  );

/**
 * GET /api/integrations/slack/install?workspace=<org id|personal> — "Add to
 * Slack" for one QRdx workspace: checks membership and plan, remembers the
 * workspace for the callback, then sends the person to Slack.
 */
export async function GET(request: Request) {
  const user = await requireUser(connectLimiter, "integrations:slack-install");
  if ("response" in user) {
    return user.response.status === 401
      ? NextResponse.redirect(new URL("/settings/integrations/slack", request.url))
      : back(request, "rate_limited");
  }
  if (!isOAuthConfigured("slack")) return back(request, "not_configured");

  const parsed = workspaceSchema.safeParse(
    new URL(request.url).searchParams.get("workspace") ?? undefined,
  );
  if (!parsed.success) return back(request, "unexpected_error");
  const organizationId = parsed.data === "personal" ? null : parsed.data;

  if (organizationId) {
    const [row] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, user.userId),
        ),
      )
      .limit(1);
    if (!row) return back(request, "unexpected_error");
  }
  const plan = await getPlanForScope({ userId: user.userId, organizationId });
  if (!getPlanLimits(plan).webhooks) return back(request, "plan_required");

  await rememberSlackWorkspace(organizationId);
  return NextResponse.redirect(await createIntegrationAuthUrl("slack"));
}
