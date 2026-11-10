import type { KeyObject } from "node:crypto";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import {
  commandReply,
  INTERACTION_TYPE,
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
import { logError } from "@/lib/shared";

/** Codes one Discord user can make per minute. */
const userLimiter = createRateLimiter({ limiter: slidingWindow(20, "60 s") });

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
 * Interactions Endpoint URL. Discord sends each /qr and "Make QR code" here,
 * signed with the app's key; the reply goes back in the response.
 * 404 where the bot isn't set up, 401 for anything Discord didn't sign.
 */
export async function POST(request: Request) {
  const settings = discordBotSettings();
  if (!settings) return json({ error: "Not found" }, 404);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BODY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }

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
  if (interaction.type !== INTERACTION_TYPE.applicationCommand) {
    return json({ error: "Unsupported interaction type" }, 400);
  }

  const userId = interactionUserId(interaction) ?? "unknown";
  const { success } = await userLimiter.limit(`discord-bot:user:${userId}`);
  if (!success) return json(notice(NOTICES.rateLimited));

  try {
    return json(commandReply(interaction));
  } catch (error) {
    // The error only: never the content or who sent it.
    logError(error as Error, {
      route: "/api/integrations/discord/interactions",
    });
    return json(notice(NOTICES.failed));
  }
}
