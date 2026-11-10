"use server";

import { TWO_FACTOR_REQUIRED_MESSAGE } from "@repo/auth/workspace-two-factor-rules";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { after } from "next/server";
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
import { clearLinkProof, hasLinkProof } from "@/lib/slack-bot/link-sign-in";
import { verifyLinkToken } from "@/lib/slack-bot/link-token";
import { linkedNotice } from "@/lib/slack-bot/messages";
import { postMessage } from "@/lib/slack-bot/slack-api";
import {
  describeUserLink,
  findBotToken,
  findInstallation,
  SlackBotStoreUnavailableError,
  saveUserLink,
} from "@/lib/slack-bot/store";
import { findWorkspaceById, shutsOut } from "@/lib/workspaces";

// The confirm screen's Confirm (app/integrations/slack/link): links the
// Slack person in the token to the signed-in QRdx user and the workspace
// they picked. Everything is checked again here: the token, that this
// session signed in with Slack as that very Slack person for this token
// (lib/slack-bot/link-sign-in.ts), that the bot is still in that Slack
// workspace, membership, the role may create codes and the workspace's
// two-step requirement. A link that already exists is only replaced when
// the person chose "Replace the link". Then a recent "Confirm it's you",
// since the link lets that Slack account make codes in the workspace.
// Afterwards the bot tells the Slack person in a direct message.
// Server actions only accept posts from this site's own pages.

export type LinkSlackResult =
  | { ok: true; workspaceName: string }
  | {
      ok: false;
      error: string;
      /** The Slack sign-in is missing or used up: show the button again */
      signIn?: true;
    }
  | ConfirmationRequired;

const linkLimiter = createRateLimiter({
  prefix: "qrdx:slack-bot:link",
  limiter: slidingWindow(10, "10 m"),
});

const inputSchema = z.object({
  token: z.string().trim().min(1).max(2048),
  organizationId: z.string().trim().min(1).max(128),
  replace: z.boolean().optional(),
});

const fail = (error: string): LinkSlackResult => ({ ok: false, error });

/** The direct message after linking; failing to send it never fails the link. */
async function tellSlackUser(input: {
  teamId: string;
  slackUserId: string;
  email: string;
  workspaceName: string;
}) {
  try {
    const bot = await findBotToken({ teamId: input.teamId });
    if (!bot) return;
    const sent = await postMessage(
      bot.token,
      // A user id as the channel: the bot's direct message with them.
      { channel: input.slackUserId },
      linkedNotice(input),
    );
    if (!sent.ok) {
      console.error(
        JSON.stringify({
          event: "slack-bot.link_notice_failed",
          error: sent.error,
        }),
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "slack-bot.link_notice_failed",
        error: error instanceof Error ? error.name.slice(0, 60) : "unknown",
      }),
    );
  }
}

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
  const { token } = parsed.data;
  const claims = secret ? verifyLinkToken(token, secret) : null;
  if (!(secret && claims)) {
    return fail(
      "This link has expired. Run /qr link in Slack again for a new one.",
    );
  }
  const proven = await hasLinkProof(
    { userId: session.userId, sessionId: session.sessionId, token, claims },
    secret,
  );
  if (!proven) {
    return {
      ok: false,
      error:
        "Sign in with Slack first, as the Slack account that asked to link, so QRdx knows it's yours.",
      signIn: true,
    };
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
    const existing = await describeUserLink(claims.teamId, claims.slackUserId);
    const unchanged =
      existing?.userId === session.userId &&
      existing.organizationId === workspace.id;
    if (existing && !unchanged && parsed.data.replace !== true) {
      return fail(
        "This Slack account is already linked. Reload the page to see that link, then choose Replace the link.",
      );
    }

    const needed = await requireRecentConfirmation(session);
    if (needed) return needed;

    await saveUserLink({
      teamId: claims.teamId,
      slackUserId: claims.slackUserId,
      userId: session.userId,
      organizationId: workspace.id,
    });
    await clearLinkProof();
    after(() =>
      tellSlackUser({
        teamId: claims.teamId,
        slackUserId: claims.slackUserId,
        email: session.email,
        workspaceName: workspace.name,
      }),
    );
    return { ok: true, workspaceName: workspace.name };
  } catch (error) {
    if (error instanceof SlackBotStoreUnavailableError) {
      return fail("Linking isn't available yet. Try again later.");
    }
    logError(error as Error, { action: "slack-bot.link" });
    return fail("Something went wrong. Please try again.");
  }
}
