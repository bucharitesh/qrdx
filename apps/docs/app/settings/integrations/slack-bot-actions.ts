"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUserId } from "@/lib/connected-accounts/server";
import { enforceRateLimits } from "@/lib/request-guards";
import { logError } from "@/lib/shared";
import { isSlackBotEnabled, SETTINGS_PATH } from "@/lib/slack-bot/config";
import {
  deleteUserLinkOf,
  SlackBotStoreUnavailableError,
} from "@/lib/slack-bot/store";

// Settings → Integrations → Slack → QRdx bot: unlinking a Slack identity
// linked to this QRdx account (the same as /qr unlink in Slack).

const unlinkLimiter = createRateLimiter({
  prefix: "qrdx:slack-bot:unlink",
  limiter: slidingWindow(30, "60 s"),
});

const linkIdSchema = z.string().trim().min(1).max(64);

export async function unlinkSlackIdentityAction(
  linkId: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSlackBotEnabled()) {
    return { ok: false, error: "The QRdx bot for Slack isn't available here." };
  }
  const parsed = linkIdSchema.safeParse(linkId);
  if (!parsed.success) return { ok: false, error: "Nothing to unlink." };
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to change this." };
  try {
    await enforceRateLimits([{ limiter: unlinkLimiter, key: userId }]);
    await deleteUserLinkOf(userId, parsed.data);
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    if (error instanceof SlackBotStoreUnavailableError) {
      return { ok: false, error: "This isn't available yet." };
    }
    if ((error as { status?: number }).status === 429) {
      return { ok: false, error: "Too many tries. Wait a minute." };
    }
    logError(error as Error, { action: "slack-bot.unlink" });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
