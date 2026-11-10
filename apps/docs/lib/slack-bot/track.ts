import "server-only";

import {
  createCodes,
  destinationUrlSchema,
  enforceCreateRateLimit,
  MAX_TITLE_LENGTH,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { HttpError } from "@/lib/error-response";
import { isUserBanned } from "@/lib/oauth";
import { can } from "@/lib/permissions";
import type { ActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { workspaceLink } from "@/lib/workspace-paths";
import { findWorkspaceById, shutsOut } from "@/lib/workspaces";
import { absoluteUrl } from "./config";
import { findUserLink, SlackBotStoreUnavailableError } from "./store";

// /qr track: a dynamic code, created as the QRdx user the Slack person
// linked, in the workspace they picked. The link may be stale, so every call
// checks again that the account isn't banned, is still a member, may create
// codes and isn't shut out by the workspace's two-step requirement. The
// code is made by createCodes, the service behind POST /v1/codes and the
// dashboard, so plan limits, the per-user create limit, link screening,
// webhooks and the audit log behave exactly as they do there.

export type TrackFailure =
  | "invalid_url"
  | "not_linked"
  | "not_member"
  | "forbidden"
  | "two_factor"
  | "plan_limit"
  | "rate_limited"
  | "unavailable"
  | "failed";

export type TrackResult =
  | {
      ok: true;
      shortLink: string;
      destinationUrl: string;
      dashboardUrl: string;
    }
  | {
      ok: false;
      reason: TrackFailure;
      message: string;
      /** For plan limits: the pricing page. */
      upgradeUrl?: string;
    };

const fail = (
  reason: TrackFailure,
  message: string,
  upgradeUrl?: string,
): TrackResult => ({ ok: false, reason, message, upgradeUrl });

/** "qrdx.dev from Slack", within the title limit. */
function trackedTitle(destinationUrl: string): string {
  const host = new URL(destinationUrl).hostname.replace(/^www\./, "");
  return `${host} from Slack`.slice(0, MAX_TITLE_LENGTH);
}

export async function createTrackedCode(input: {
  teamId: string;
  slackUserId: string;
  url: string;
}): Promise<TrackResult> {
  const parsed = destinationUrlSchema.safeParse(input.url);
  if (!parsed.success) {
    return fail(
      "invalid_url",
      `${parsed.error.issues[0]?.message ?? "That isn't a web address"}.`,
    );
  }
  const destinationUrl = parsed.data;

  try {
    const link = await findUserLink(input.teamId, input.slackUserId);
    if (!link) {
      return fail(
        "not_linked",
        "Link your QRdx account first, then try /qr track again.",
      );
    }
    if (await isUserBanned(link.userId)) {
      return fail(
        "forbidden",
        "The QRdx account linked to you can't make codes right now.",
      );
    }
    const workspace = await findWorkspaceById(link.userId, link.organizationId);
    if (!workspace) {
      return fail(
        "not_member",
        "You're no longer a member of the QRdx workspace you linked. Run /qr link to pick another one.",
      );
    }
    if (!can(workspace.role, "content.write")) {
      return fail(
        "forbidden",
        `Your role in ${workspace.name} can't create codes. Ask an admin there, or run /qr link to pick another workspace.`,
      );
    }
    if (await shutsOut(link.userId, workspace)) {
      return fail(
        "two_factor",
        `${workspace.name} requires two-step verification. Turn it on in QRdx, then try again.`,
      );
    }

    const scope: ActiveScope = {
      userId: link.userId,
      organizationId: workspace.id,
      role: workspace.role,
    };
    await enforceCreateRateLimit(scope.userId);
    const [code] = await createCodes(scope, [
      { destinationUrl, title: trackedTitle(destinationUrl) },
    ]);
    if (!code)
      return fail("failed", "QRdx couldn't make that code. Try again.");
    return {
      ok: true,
      shortLink: code.shortLink,
      destinationUrl: code.destinationUrl,
      dashboardUrl: absoluteUrl(
        workspaceLink(workspace.slug, `/codes/${encodeURIComponent(code.id)}`),
      ),
    };
  } catch (error) {
    if (error instanceof SlackBotStoreUnavailableError) {
      return fail("unavailable", "Tracked codes aren't available yet.");
    }
    if (error instanceof HttpError) {
      if (error.status === 402) {
        return fail("plan_limit", error.message, absoluteUrl("/pricing"));
      }
      if (error.status === 429) {
        return fail(
          "rate_limited",
          "You're making codes quickly. Wait a minute and try again.",
        );
      }
      // The service's own messages are written for people (forbidden,
      // a blocked destination, …).
      return fail("failed", error.message);
    }
    logError(error as Error, { action: "slack-bot.track" });
    return fail("failed", "QRdx couldn't make that code. Try again.");
  }
}
