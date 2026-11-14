"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { revokeWorkspaceSlackLink } from "@/lib/slack-bot/admin";
import { SlackBotStoreUnavailableError } from "@/lib/slack-bot/store";
import { UnauthorizedError } from "@/types/errors";

// Settings → API keys & apps → Slack accounts: an owner or admin revokes a
// Slack account's link to the open workspace (lib/slack-bot/admin.ts).

const revokeLimiter = createRateLimiter({
  prefix: "qrdx:slack-bot:revoke",
  limiter: slidingWindow(30, "60 s"),
});

const idSchema = z.object({ id: z.string().trim().min(1).max(64) });

export async function revokeSlackLinkAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nothing to revoke." };
  try {
    // The open workspace, checked against the user's memberships.
    const scope = await getActiveScope();
    await enforceRateLimits([
      {
        limiter: revokeLimiter,
        key: `${scope.organizationId}:${scope.userId}`,
      },
    ]);
    await revokeWorkspaceSlackLink(scope, parsed.data.id);
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ok: false, error: "Sign in to manage Slack links." };
    }
    if (error instanceof SlackBotStoreUnavailableError) {
      return { ok: false, error: "This isn't available yet." };
    }
    if (error instanceof HttpError) {
      return {
        ok: false,
        error:
          error.status === 429
            ? "Too many tries. Wait a minute."
            : error.message,
      };
    }
    logError(error as Error, { action: "slack-bot.revoke" });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
