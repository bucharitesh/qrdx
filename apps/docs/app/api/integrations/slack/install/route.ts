import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { lacksRequiredTwoFactor } from "@repo/auth/workspace-two-factor";
import { database as db, member } from "@repo/database";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectLimiter } from "@/lib/connected-accounts/server";
import { connectConfirmationNeeded } from "@/lib/data-connections/connect-confirmation";
import { requireUser } from "@/lib/data-connections/http";
import { rememberSlackWorkspace } from "@/lib/data-connections/server";
import {
  createIntegrationAuthUrl,
  isOAuthConfigured,
} from "@/lib/integration-oauth";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { getActiveScope, TwoFactorRequiredError } from "@/lib/scope";

const workspaceSchema = z
  .string()
  .regex(/^(personal|[A-Za-z0-9_-]{1,64})$/)
  .optional();

const back = (request: Request, error: string) =>
  NextResponse.redirect(
    new URL(`/settings/integrations/slack?error=${error}`, request.url),
  );

/**
 * GET /api/integrations/slack/install[?workspace=<org id|personal>] — "Add to
 * Slack" for one QRdx workspace: the one named, the person's own for
 * `personal`, else the workspace they're in (the one Enable uses, and that
 * Settings → Notifications lists the channel under). Checks membership (and
 * that the workspace doesn't shut the person out for lacking two-step
 * verification), plan and a recent "Confirm it's you" (the channel gets form
 * answers; the page asks before it comes here), remembers the workspace for
 * the callback, then sends the person to Slack. The callback adds the
 * channel through addChatTarget, which checks the workspace and plan again.
 *
 * A channel always goes to a workspace: every person has one, and a channel
 * filed under none would get no alerts and be listed nowhere.
 */
export async function GET(request: Request) {
  const user = await requireUser(connectLimiter, "integrations:slack-install");
  if ("response" in user) {
    return user.response.status === 401
      ? NextResponse.redirect(
          new URL("/settings/integrations/slack", request.url),
        )
      : back(request, "rate_limited");
  }
  if (!isOAuthConfigured("slack")) return back(request, "not_configured");

  const parsed = workspaceSchema.safeParse(
    new URL(request.url).searchParams.get("workspace") ?? undefined,
  );
  if (!parsed.success) return back(request, "unexpected_error");
  let organizationId: string;
  if (parsed.data === "personal") {
    organizationId = ownWorkspaceId(user.userId);
  } else if (parsed.data) {
    organizationId = parsed.data;
  } else {
    try {
      ({ organizationId } = await getActiveScope());
    } catch (error) {
      return back(
        request,
        error instanceof TwoFactorRequiredError
          ? "two_factor_required"
          : "unexpected_error",
      );
    }
  }

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
  if (await lacksRequiredTwoFactor(user.userId, organizationId)) {
    return back(request, "two_factor_required");
  }
  const plan = await getPlanForScope({ userId: user.userId, organizationId });
  if (!getPlanLimits(plan).webhooks) return back(request, "plan_required");
  if (await connectConfirmationNeeded("slack", user.userId)) {
    return back(request, "confirmation_required");
  }

  await rememberSlackWorkspace(organizationId);
  return NextResponse.redirect(await createIntegrationAuthUrl("slack"));
}
