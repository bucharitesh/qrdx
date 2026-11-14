import type { KeyObject } from "node:crypto";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { after } from "next/server";
import { recordUsage } from "@/lib/analytics/usage";
import {
  editOriginalResponse,
  isInteractionToken,
} from "@/lib/chat-bots/discord/followup";
import {
  INTERACTION_TYPE,
  interactionPlan,
  interactionUsageKey,
  interactionUserId,
  NOTICES,
  notice,
  PONG,
  parseInteraction,
} from "@/lib/chat-bots/discord/interactions";
import { discordBotSettings } from "@/lib/chat-bots/discord/settings";
import {
  discordPublicKey,
  isSignedByDiscord,
} from "@/lib/chat-bots/discord/verify";
import { readBodyBytes } from "@/lib/request-guards";
import { logError } from "@/lib/shared";

// A styled code finishes after the response, through the interaction's
// webhook.
export const maxDuration = 30;

/** Codes one Discord user can make (or restyle) per minute. */
const userLimiter = createRateLimiter({ limiter: slidingWindow(20, "60 s") });

/**
 * Codes the bot makes in a minute, for everyone together: a ceiling for the
 * bot as a whole, past which people are told it's busy. Each user's own limit
 * is checked first, so one person can't use more of this than their own
 * allowance.
 */
const GLOBAL_PER_MINUTE = 300;
const globalLimiter = createRateLimiter({
  limiter: slidingWindow(GLOBAL_PER_MINUTE, "60 s"),
});

/** Interactions are small; anything bigger isn't from Discord. */
const MAX_BODY_BYTES = 256 * 1024;

let cachedKey: { hex: string; key: KeyObject | null } | null = null;

function publicKeyFor(hex: string): KeyObject | null {
  if (cachedKey?.hex !== hex) {
    cachedKey = { hex, key: discordPublicKey(hex) };
    if (!cachedKey.key) {
      console.warn(
        "[discord] DISCORD_PUBLIC_KEY isn't a 64-character hex key: every interaction is refused.",
      );
    }
  }
  return cachedKey.key;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * POST /api/integrations/discord/interactions — the Discord app's
 * Interactions Endpoint URL. Discord sends each /qr, "Make QR code" and
 * style menu pick here, signed with the app's key. A plain code goes back
 * in the response; a styled one is scan-checked first, so the response
 * says "thinking" and the code follows through the interaction's webhook.
 * 404 where the bot isn't set up, 401 for anything Discord didn't sign.
 */
export async function POST(request: Request) {
  const settings = discordBotSettings();
  if (!settings) return json({ error: "Not found" }, 404);

  // Read in chunks, stopping as soon as the body passes the cap, with or
  // without a content-length.
  const body = await readBodyBytes(request, MAX_BODY_BYTES);
  if (!body) return json({ error: "Request too large" }, 413);

  const key = publicKeyFor(settings.publicKey);
  const signed =
    key !== null &&
    isSignedByDiscord(key, {
      signature: request.headers.get("x-signature-ed25519"),
      timestamp: request.headers.get("x-signature-timestamp"),
      body,
    });
  if (!signed) return json({ error: "Invalid request signature" }, 401);

  let interaction: ReturnType<typeof parseInteraction>;
  try {
    interaction = parseInteraction(JSON.parse(new TextDecoder().decode(body)));
  } catch {
    interaction = null;
  }
  if (!interaction) return json({ error: "Invalid interaction" }, 400);

  if (interaction.type === INTERACTION_TYPE.ping) return json(PONG);
  if (
    interaction.type !== INTERACTION_TYPE.applicationCommand &&
    interaction.type !== INTERACTION_TYPE.messageComponent
  ) {
    return json({ error: "Unsupported interaction type" }, 400);
  }
  if (
    interaction.type === INTERACTION_TYPE.messageComponent &&
    !interaction.data?.custom_id
  ) {
    return json({ error: "Invalid interaction" }, 400);
  }

  recordUsage("discord", "command", interactionUsageKey(interaction));
  const userId = interactionUserId(interaction) ?? "unknown";
  if (!(await userLimiter.limit(`discord-bot:user:${userId}`)).success) {
    return json(notice(NOTICES.rateLimited));
  }
  if (!(await globalLimiter.limit("discord-bot:global")).success) {
    return json(notice(NOTICES.busy));
  }

  try {
    const plan = interactionPlan(interaction);
    if (plan.kind === "reply") return json(plan.response);
    const token = interaction.token;
    if (!isInteractionToken(token)) return json(notice(NOTICES.failed));
    after(async () => {
      let data: Awaited<ReturnType<typeof plan.followUp>>;
      try {
        data = await plan.followUp();
      } catch (error) {
        logError(error as Error, {
          route: "/api/integrations/discord/interactions",
        });
        recordUsage("discord", "error", "interaction");
        data = { content: NOTICES.failed, allowed_mentions: { parse: [] } };
      }
      await editOriginalResponse(settings.applicationId, token, data);
    });
    return json(plan.response);
  } catch (error) {
    recordUsage("discord", "error", "interaction");
    // The error only: never the content or who sent it.
    logError(error as Error, {
      route: "/api/integrations/discord/interactions",
    });
    return json(notice(NOTICES.failed));
  }
}
