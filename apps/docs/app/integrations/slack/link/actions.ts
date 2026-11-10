"use server";

import { TWO_FACTOR_REQUIRED_MESSAGE } from "@repo/auth/workspace-two-factor-rules";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import type { ConfirmationRequired } from "@/lib/account/confirmation";
import {
  currentSession,
  requireRecentConfirmation,
} from "@/lib/account/confirmation-server";
import { can } from "@/lib/permissions";
import { enforceRateLimits } from "@/lib/request-guards";
import { logError } from "@/lib/shared";
import { isSlackBotEnabled, linkTokenSecret } from "@/lib/slack-bot/config";
import { verifyLinkToken } from "@/lib/slack-bot/link-token";
import {
  findInstallation,
  SlackBotStoreUnavailableError,
  saveUserLink,
} from "@/lib/slack-bot/store";
import { findWorkspaceById, shutsOut } from "@/lib/workspaces";

// The confirm screen's Confirm (app/integrations/slack/link): links the
// Slack person in the token to the signed-in QRdx user and the workspace
// they picked. Everything is checked again here: the token, that the bot
// is still in that Slack workspace, membership, the role may create codes
// and the workspace's two-step requirement. Then a recent "Confirm it's
// you", since the link lets that Slack account make codes in the workspace.
// Server actions only accept posts from this site's own pages.

export type LinkSlackResult =
  | { ok: true; workspaceName: string }
  | { ok: false; error: string }
  | ConfirmationRequired;

const linkLimiter = createRateLimiter({
  prefix: "qrdx:slack-bot:link",
  limiter: slidingWindow(10, "10 m"),
});

const inputSchema = z.object({
  token: z.string().trim().min(1).max(2048),
  organizationId: z.string().trim().min(1).max(128),
});

const fail = (error: string): LinkSlackResult => ({ ok: false, error });

export async function linkSlackAccount(
  input: unknown,
): Promise<LinkSlackResult> {
  if (!isSlackBotEnabled()) {
    return fail("The QRdx bot for Slack isn't available here.");
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("Pick a workspace and try again.");

  const session = await currentSession();
  if (!session) return fail("Sign in to link your Slack account.");

  try {
    await enforceRateLimits([{ limiter: linkLimiter, key: session.userId }]);
  } catch {
    return fail("Too many tries. Wait a few minutes and try again.");
  }

  const secret = linkTokenSecret();
  const claims = secret ? verifyLinkToken(parsed.data.token, secret) : null;
  if (!claims) {
    return fail(
      "This link has expired. Run /qr link in Slack again for a new one.",
    );
  }

  try {
    if (!(await findInstallation({ teamId: claims.teamId }))) {
      return fail(
        "The QRdx bot isn't in that Slack workspace any more. Add it again in Settings → Integrations → Slack.",
      );
    }
    const workspace = await findWorkspaceById(
      session.userId,
      parsed.data.organizationId,
    );
    if (!workspace) return fail("You're not a member of that workspace.");
    if (!can(workspace.role, "content.write")) {
      return fail(
        `Your role in ${workspace.name} can't create codes. Pick another workspace.`,
      );
    }
    if (await shutsOut(session.userId, workspace)) {
      return fail(TWO_FACTOR_REQUIRED_MESSAGE);
    }

    const needed = await requireRecentConfirmation(session);
    if (needed) return needed;

    await saveUserLink({
      teamId: claims.teamId,
      slackUserId: claims.slackUserId,
      userId: session.userId,
      organizationId: workspace.id,
    });
    return { ok: true, workspaceName: workspace.name };
  } catch (error) {
    if (error instanceof SlackBotStoreUnavailableError) {
      return fail("Linking isn't available yet. Try again later.");
    }
    logError(error as Error, { action: "slack-bot.link" });
    return fail("Something went wrong. Please try again.");
  }
}
